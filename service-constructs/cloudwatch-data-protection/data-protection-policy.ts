import { Construct } from 'constructs';
import { CfnLogGroup, LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { IKey, Key } from 'aws-cdk-lib/aws-kms';
import { Effect, PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Stack } from 'aws-cdk-lib';
import { DEFAULT_SENSITIVE_DATA_IDENTIFIERS } from './data-identifiers';

export interface CwDataProtectionPolicyProps {

    /**
     * Create a logGroup and provide the name to this to write audit logs.
     * More details about audit log group can be found at :
     * https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/mask-sensitive-log-data-audit-findings.html
     *
     * It is not mandatory to have an audit log group,
     * but it would help in collecting metrics on type of data-identifier,
     * number of occurrences, & position of sensitive data that is present in log lines.
     * Currently, the construct supports cloudwatch logs based audit report.
     * There is no additional access configuration needed for audit log group.
     * Format and examples are in usage doc above.
     * Can add support for other resources(S3 & Firehose).
     *
     * @default will not add any audit log group.
     */
    readonly auditLogGroupName?: string,

    /**
     * List of data identifiers to add to default list.
     *  @default does not add any identifier to default list.
     */
    readonly addToDefaultDataIdentifiers?: string[],

    /**
     * List of data identifiers to exclude from default list
     * @default does not remove any identifier from default list.
     */
    readonly excludeFromDefaultDataIdentifiers?: string[],
}

const getCloudwatchAuditDestination = (auditLogGroupName: string) => ({
    CloudWatchLogs: {
        LogGroup: auditLogGroupName,
    },
});

/**
 * Function to retrieve data protection policy as JSON.
 * @param props cloudwatch data protection policy properties.
 */
export const cloudwatchDataProtectionPolicy = (props: CwDataProtectionPolicyProps): JSON => {
    let dataIdentifiers = Array.from(DEFAULT_SENSITIVE_DATA_IDENTIFIERS);

    // Add additional identifiers in list
    dataIdentifiers = dataIdentifiers.concat(...props.addToDefaultDataIdentifiers ?? []);

    // remove excluded identifiers from list
    if (props.excludeFromDefaultDataIdentifiers) {
        props.excludeFromDefaultDataIdentifiers.forEach((identifier) => {
            const index = dataIdentifiers.indexOf(identifier);
            if (index !== -1) {
                dataIdentifiers.splice(index, 1);
            }
        });
    }

    // remove duplicates and sort
    dataIdentifiers = Array.from(new Set(dataIdentifiers)).sort();

    if (dataIdentifiers.length === 0) {
        throw new Error('There should be at least one data identifier in the policy.');
    }

    /**
     * The schema for data protection policy should
     *   * have a Name, Version.
     *   * have Statement array of size two.
     *   * have one statement as Deidentify operation.
     *   * have another statement as Audit operation.
     *   * FindingsDestination should be empty if there is no audit destination needed.
     *   * have at least one data-identifier and must have unique elements.
     */
    return <JSON><unknown>{
        Name: 'data-protection-policy',
        Description: 'Data protection policy for cloudwatch logs',
        Version: '2021-06-01',
        Statement: [{
            Sid: 'redact-data-protection-policy',
            Operation: {
                Deidentify: {
                    MaskConfig: {},
                },
            },
            DataIdentifier: dataIdentifiers,
        },
            {
                Sid: 'audit-data-protection-policy',
                Operation: {
                    Audit: {
                        FindingsDestination: props.auditLogGroupName ? getCloudwatchAuditDestination(props.auditLogGroupName) : {},
                    },
                },
                DataIdentifier: dataIdentifiers,
            }],
    };
};

/**
 * Adds data protection policy defined in this package to L1 construct of LogGroup
 * Use this only when L2 construct "LogGroup" is not available in CfnResource like in APIGAccessLogGroups
 * Otherwise if L2 construct is available use addDataProtectionPolicy() below
 * @param cfnLogGroup L1 construct for LogGroup.
 * @param props data protection policy properties.
 */
export const addDataProtectionPolicyForCfnLogGroup = (cfnLogGroup: CfnLogGroup, props: CwDataProtectionPolicyProps): void => {
    // Adding property override since this is available only from cdk-lib 2.54
    cfnLogGroup.addPropertyOverride('DataProtectionPolicy', cloudwatchDataProtectionPolicy(props));
};

/**
 * Adds data protection policy defined in this package to log group.
 * @param logGroup input log group to add data protection policy.
 * @param props data protection policy properties.
 */
export const addDataProtectionPolicy = (logGroup: LogGroup, props: CwDataProtectionPolicyProps): void => {
    const cfnLogGroup = logGroup.node.defaultChild as CfnLogGroup;
    addDataProtectionPolicyForCfnLogGroup(cfnLogGroup, props);
};

/**
 * Create encryption key used for encrypting CW data protection audit log group
 * @param scope construct
 * @returns encryption key
 */
const createEncryptionKeyForAuditLogGroup = (
    scope: Construct,
) : IKey => {
    const encryptionKey = new Key(scope, 'CwDataProtectionKmsKey', {
        description: 'KMS Key for encrypting CW data protection audit log group',
        enableKeyRotation: true,
    });

    const stack = Stack.of(scope);
    const policyStatement = new PolicyStatement({
        actions: [
            'kms:Decrypt*',
            'kms:DescribeKey*',
            'kms:Encrypt*',
            'kms:GenerateDataKey*',
            'kms:ReEncrypt*',
        ],
        effect: Effect.ALLOW,
        principals: [new ServicePrincipal(`logs.${stack.region}.amazonaws.com`)],
        resources: ['*'],
    });
    policyStatement.addCondition('ArnLike', {
        'kms:EncryptionContext:aws:logs:arn': `arn:${stack.partition}:logs:${stack.region}:${stack.account}:*`,
    });

    // Add the policystatement to the key so that it restricts usage to the specified service principals
    encryptionKey.addToResourcePolicy(policyStatement);

    return encryptionKey;
};

/**
 * Create audit log group for CW data protection audit findings
 * @param scope construct
 * @param encryptionKey
 * @returns audit log group
 */
export const createDataProtectionAuditLogGroup = (
    scope: Construct,
    encryptionKey?: IKey,
) : LogGroup => new LogGroup(scope, 'AuditLogGroup', {
    retention: RetentionDays.TEN_YEARS,
    encryptionKey: encryptionKey || createEncryptionKeyForAuditLogGroup(scope),
});
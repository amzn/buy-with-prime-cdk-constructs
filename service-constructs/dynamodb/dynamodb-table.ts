import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { DefaultTagHandler } from '../tags/default-tag-handler';

/**
 * Opinionated defaults for DynamoDB table. All options available to the AWS CDK's
 * [`TableProps`](https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-dynamodb.TableProps.html) are available here as well.
 */
export interface DynamoDBTableProps extends dynamodb.TableProps {

    /**
     * For Provisioned tables, provide minimum & maximum auto-scaling read capacity.
     */
    readonly readScalingProps?: dynamodb.EnableScalingProps;

    /**
     * For Provisioned tables, provide minimum & maximum auto-scaling write capacity for the table.
     */
    readonly writeScalingProps?: dynamodb.EnableScalingProps;
}

/**
 * Opinionated defaults for DynamoDB global secondary index. All options available to the AWS CDK's
 * [`GlobalSecondaryIndexProps`](https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-dynamodb.GlobalSecondaryIndexProps.html) are available here as well.
 */
export interface DynamoDBGlobalSecondaryIndexProps extends dynamodb.GlobalSecondaryIndexProps {

    /**
     * For Provisioned tables, provide minimum & maximum auto-scaling read capacity for the index.
     */
    readonly readScalingProps?: dynamodb.EnableScalingProps;

    /**
     * For Provisioned tables, provide minimum & maximum auto-scaling write capacity for the index.
     */
    readonly writeScalingProps?: dynamodb.EnableScalingProps;
}

/**
 * Default values for DynamoDB utilization tracking.
 */
const DEFAULT_UTILIZATION_SCALING_PROPS: dynamodb.UtilizationScalingProps = {
    /**
     * Target utilization percentage for the attribute.
     * Setting it to default 60 percent.
     */
    targetUtilizationPercent: 60,
    /**
     * Period after a scale in activity completes before another scale in activity can start.
     * Setting it to default 60 seconds.
     */
    scaleInCooldown: cdk.Duration.seconds(60),
    /**
     * Period after a scale out activity completes before another scale out activity can start.
     * Setting it to default 60 seconds.
     */
    scaleOutCooldown: cdk.Duration.seconds(60),
};

/**
 * This `DynamoDBTable` construct builds on AWS CDK's Table construct by enforcing opinionated practices
 * within the organization.
 *
 * Read more about this construct at /documentation/dynamodb/DynamoDBTable.md
 */
export class DynamoDBTable extends dynamodb.Table {

     // Indicates whether table is using Provisioned billing mode.

    private readonly usesProvisionedBillingMode: boolean;

    constructor(scope: Construct, id: string, props: DynamoDBTableProps) {
        if (!props) {
            throw new Error('DynamoDB table props must be provided');
        }

        let { billingMode, readCapacity, writeCapacity, pointInTimeRecovery, deletionProtection, encryption } = props;
        // If billingMode is not explicitly specified, setting it to PAY_PER_REQUEST(OnDemand mode).
        if (!billingMode) {
            billingMode = dynamodb.BillingMode.PAY_PER_REQUEST;
        }

        if (props.billingMode === dynamodb.BillingMode.PROVISIONED) {
            if (!props.readScalingProps || !props.writeScalingProps) {
                throw new Error('For provisioned DynamoDB table, auto-scaling readScalingProps & writeScalingProps are required.');
            }
            // Setting default read & write capacity of table to auto-scaling minimum capacity.
            if (!readCapacity) {
                readCapacity = props.readScalingProps.minCapacity;
            }
            if (!writeCapacity) {
                writeCapacity = props.writeScalingProps.minCapacity;
            }
        }

        // If pointInTimeRecovery is not explicitly specified, enabling it by default.
        if (pointInTimeRecovery === undefined) {
            pointInTimeRecovery = true;
        }

        // If deletionProtection is not explicitly specified, enabling it by default.
        if (deletionProtection === undefined) {
            deletionProtection = true;
        }

        // If encryption is not explicitly specified, use dynamodb.TableEncryption.CUSTOMER_MANAGED.
        // If an `encryptionKey` is not specified, DynamoDB automatically creates the encryption key.
        if (!encryption) {
            encryption = dynamodb.TableEncryption.CUSTOMER_MANAGED;
        }

        const updatedProps: DynamoDBTableProps = {
            billingMode,
            encryption,
            pointInTimeRecovery,
            deletionProtection,
            readCapacity,
            writeCapacity,
            ...props,
        };

        super(scope, id, updatedProps);
        DefaultTagHandler.applyTags(this);

        if (updatedProps.billingMode === dynamodb.BillingMode.PROVISIONED) {
            this.usesProvisionedBillingMode = true;

            const autoScaleReadCapacity = this.autoScaleReadCapacity(updatedProps.readScalingProps!);
            autoScaleReadCapacity.scaleOnUtilization(DEFAULT_UTILIZATION_SCALING_PROPS);

            const autoScaleWriteCapacity = this.autoScaleWriteCapacity(updatedProps.writeScalingProps!);
            autoScaleWriteCapacity.scaleOnUtilization(DEFAULT_UTILIZATION_SCALING_PROPS);
        } else {
            this.usesProvisionedBillingMode = false;
        }
    }

    /**
     * Add a global secondary index of table.
     *
     * For Provisioned table, it by default configures capacity auto-scaling for global secondary indexes.
     * Default auto-scaling properties can be overridden by invoking api explicitly.
     * e.g. for overriding autoscale read configuration:
     * ```
     * table.autoScaleGlobalSecondaryIndexReadCapacity(indexName, readScalingProps);
     * ```
     * @param props the property of global secondary index.
     */
    addGlobalSecondaryIndex(props: DynamoDBGlobalSecondaryIndexProps): void {
        let { readCapacity, writeCapacity } = props;
        if (this.usesProvisionedBillingMode) {
            if (!props.readScalingProps || !props.writeScalingProps) {
                throw new Error('For provisioned DynamoDB table, auto-scaling readScalingProps & writeScalingProps for global secondary index are required.');
            }
            if (!readCapacity) {
                readCapacity = props.readScalingProps.minCapacity;
            }
            if (!writeCapacity) {
                writeCapacity = props.writeScalingProps.minCapacity;
            }
        }

        const updatedProps: DynamoDBGlobalSecondaryIndexProps = {
            readCapacity,
            writeCapacity,
            ...props,
        };

        super.addGlobalSecondaryIndex(updatedProps);

        if (this.usesProvisionedBillingMode) {
            const autoScaleReadCapacity = this.autoScaleGlobalSecondaryIndexReadCapacity(updatedProps.indexName, updatedProps.readScalingProps!);
            autoScaleReadCapacity.scaleOnUtilization(DEFAULT_UTILIZATION_SCALING_PROPS);

            const autoScaleWriteCapacity = this.autoScaleGlobalSecondaryIndexWriteCapacity(updatedProps.indexName, updatedProps.writeScalingProps!);
            autoScaleWriteCapacity.scaleOnUtilization(DEFAULT_UTILIZATION_SCALING_PROPS);
        }
    }
}
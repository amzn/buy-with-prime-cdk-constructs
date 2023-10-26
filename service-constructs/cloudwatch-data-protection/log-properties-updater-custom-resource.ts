import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import {Code, Function, Runtime} from 'aws-cdk-lib/aws-lambda';
import { CustomResource, Duration } from 'aws-cdk-lib';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { DefaultTagHandler } from '../tags/default-tag-handler';

export interface LogPropertiesUpdaterProps {
    //Name of log group that needs an update to its properties.
    readonly logGroupName: string;
    /**
     * Data protection policy for log groups. This is string form of a JSON format.
     * See : https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/cloudwatch-logs-data-protection-policies.html
     * for syntax.
     *
     * @default
     *  * If there is an existing data protection policy for log group it will be removed.
     *  * If there is no existing data protection policy, no update will be done.
     */
    readonly dataProtectionPolicy?: string;
}

/**
 * Creates a custom resource to update resource properties for cloudwatch logs.
 * Supports only DataProtectionPolicy for now.
 * Use this when log group is not created as part of stack
 * (like lambda service) and log group name is known.
 */
export class LogPropertiesUpdater extends Construct {
    private readonly resourceProviderServiceToken: string;

    constructor(scope: Construct, id: string) {
        super(scope, id);
        DefaultTagHandler.applyTags(this);

        /**
         * Lambda handler for custom resource.
         *
         * Using Function construct here since we cannot use Lambda construct -
         * This custom resource will be used in Lambda construct and
         * using Lambda here again "might" cause infinite loop.
         */
        const logPropertiesUpdaterCustomResourceHandler = new Function(scope, 'LogPropertiesUpdaterCustomResourceLambda', {
            code: Code.fromAsset(
                "<INSERT LOCATION OF CODE HERE>"
            ),
            runtime: Runtime.NODEJS_18_X,
            /**
             * This lambda can update log retention and data protection policy
             * BUT, CDKConstructs currently updates only data-protection policy
             * since LogRetention is handled by other custom resource.
             */
            handler: 'dist/update-data-protection-policy.handler',
            memorySize: 256,
            timeout: Duration.minutes(1),
            // create and delete logGroup permissions are already added with default role creation.
            initialPolicy: [
                new PolicyStatement({
                    actions: [
                        'logs:GetDataProtectionPolicy',
                        'logs:PutDataProtectionPolicy',
                        'logs:CreateLogDelivery',
                        'logs:PutResourcePolicy',
                        'logs:DescribeResourcePolicies',
                        'logs:DescribeLogGroups',
                        'logs:DeleteDataProtectionPolicy'],
                    resources: ['*'],
                }),
            ],
        });

        const customResourceProvider = new Provider(scope, 'LogPropertiesUpdaterCustomResourceProvider', {
            onEventHandler: logPropertiesUpdaterCustomResourceHandler,
        });

        this.resourceProviderServiceToken = customResourceProvider.serviceToken;
    }

    public createCustomResource(id: string, props: LogPropertiesUpdaterProps): void {
        // Create one custom resource for each log group props with same lambda handler
        new CustomResource(this, id, {
            serviceToken: this.resourceProviderServiceToken,
            properties: {
                LogGroupName: props.logGroupName,
                DataProtectionPolicy: props.dataProtectionPolicy,
            },
        });
    }
}
import { Construct } from 'constructs';
import {
    ContainerDefinition, FargateService, FargateTaskDefinition,
} from 'aws-cdk-lib/aws-ecs';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import {
    addDataProtectionPolicy,
    CwDataProtectionPolicyProps,
    createDataProtectionAuditLogGroup,
} from '../../cloudwatch-data-protection/data-protection-policy';

/**
 * Get LogGroup cdk resource in CDK template chain.
 * @param container container image for fargate.
 *
 * returns LogGroup construct.
 *
 * @error Throws an error when LogGroup construct is not found.
 *   * This can happen if -
 *   * You are using fire-lens sidecar - Setup data-protection with properties in fire-lens construct
 *   * You are using a logGroup created with different id - You would already have LogGroup Construct.
 * Setup data protection by calling addDataProtectionPolicy() on this logGroup
 */
const getLogGroupForFargateService = (
    container: ContainerDefinition,
): LogGroup => {
    // default aws-logs logGroup is created with id "LogGroup".
    const logGroup = container.node.tryFindChild('LogGroup') as LogGroup;

    if (!logGroup) {
        const errorMessage = 'No child found with id: \'LogGroup\'.'
            + ' This means you have setup Logs with fire-lens '
            + 'or created a new log group for service logs with different Id.';
        throw new Error(errorMessage);
    }

    return logGroup;
};

/**
 * Get service container from Fargate service task definition.
 * @param taskDefinition Fargate task definition.
 *
 * returns ContainerDefinition or undefined.
 */
const getServiceContainerForFargateService = (
    taskDefinition: FargateTaskDefinition,
): ContainerDefinition | undefined => taskDefinition.defaultContainer;

/**
 * Adds data protection policy to fargate container aws-logs
 * @param scope
 * @param service
 * @param taskDefinition
 * @param dataProtectionPolicyProps properties for cw dataProtection policy
 */
export const addDataProtectionPolicyToFargateContainerLogs = (
    scope: Construct,
    service: FargateService,
    taskDefinition: FargateTaskDefinition,
    dataProtectionPolicyProps?: CwDataProtectionPolicyProps,
) : void => {
    const serviceContainer = getServiceContainerForFargateService(taskDefinition);
    if (serviceContainer) {
        let serviceLogGroup;
        try {
            serviceLogGroup = getLogGroupForFargateService(serviceContainer);
        } catch (ex) {
            // No log group found, this means you have to set up Logs with fire-lens or
            // create a new log group for service logs with a different id.
            return;
        }
        // If no auditLogGroupName provided in props, create default audit log group.
        let dataProtectionPolicyPropsOverride = dataProtectionPolicyProps;
        if (!dataProtectionPolicyProps?.auditLogGroupName) {
            // The audit log group must already exist prior to creating the data protection policy.
            // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_logs.DataProtectionPolicyProps.html
            const auditLogGroup = createDataProtectionAuditLogGroup(scope);
            dataProtectionPolicyPropsOverride = { ...dataProtectionPolicyProps, auditLogGroupName: auditLogGroup.logGroupName };
            // Audit log group needs to be created before using in data protection policy
            service.node.addDependency(auditLogGroup);
        }
        addDataProtectionPolicy(serviceLogGroup, dataProtectionPolicyPropsOverride!);
    }
};
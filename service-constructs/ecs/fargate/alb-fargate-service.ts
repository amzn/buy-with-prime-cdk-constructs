import { Construct } from 'constructs';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { FargateService } from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { Duration } from 'aws-cdk-lib';
import { CustomApplicationLoadBalancer } from '../../alb/alb';
import { addDataProtectionPolicyToFargateContainerLogs } from './fargate-data-protection-policy-util';
import { CwDataProtectionPolicyProps } from '../../cloudwatch-data-protection/data-protection-policy';
import { DefaultTagHandler } from '../../tags/default-tag-handler';

const DEFAULT_TASK_COUNT = 1;
const DEFAULT_PLATFORM_VERSION = ecs.FargatePlatformVersion.LATEST;
const DEFAULT_MIN_HEALTHY_PERCENT = 100;
const DEFAULT_MAX_HEALTHY_PERCENT = 200;
const DEFAULT_HEALTH_CHECK_GRACE_PERIOD = Duration.seconds(60);
const DEFAULT_CIRCUIT_BREAKER = {
    rollback: true,
};
const DEFAULT_CONTAINER_PORT = 8080;

export interface AlbFargateServiceProps {


    //The name of the cluster that hosts the service.
    readonly ecsCluster: ecs.ICluster;

    /**
     * The application load balancer that will serve traffic to the service.
     * The VPC attribute of a load balancer must be specified for it to be used
     * to create a new service with this pattern.
     */
    readonly loadBalancer: CustomApplicationLoadBalancer;

    /**
     * The properties required to create a new task definition, like memory limits,
     * cpu units, task role, image/service packages in the task definition.
     */
    readonly taskDefinition: ecs.FargateTaskDefinition;

    /**
     * Available platform versions:
     * https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-ecs.FargatePlatformVersion.html
     *
     * @default LATEST
     */
    readonly platformVersion?: ecs.FargatePlatformVersion;

    /**
     * The desired number of instantiations of the task definition to keep running on the service.
     * The minimum value is 1
     *
     * @default 1
     */
    readonly desiredCount?: number;

    /**
     * The minimum number of tasks, specified as a percentage of the Amazon ECS service's DesiredCount value,
     * that must continue to run and remain healthy during a deployment.
     *
     * @default 100
     */
    readonly minHealthyPercent?: number;

    /**
     * The maximum number of tasks, specified as a percentage of the Amazon ECS service's DesiredCount value,
     * that can run in a service during a deployment.
     *
     * @default 200
     */
    readonly maxHealthyPercent?: number;

    /**
     *  The period of time, in seconds, that the Amazon ECS service scheduler ignores
     *  unhealthy Elastic Load Balancing target health checks after a task has first started.
     *
     * @default cdk.Duration.seconds(60)
     */
    readonly healthCheckGracePeriod?: Duration;

    /**
     * The name of the service.
     *
     * @default When serviceName is not provided, service name will not be in the generated template
     */
    readonly serviceName?: string;

    /**
     * Properties for cloudwatch data protection policy on service logGroup.
     *
     * @default no data protection policy will be enabled.
     */
    readonly dataProtectionPolicyProps?: CwDataProtectionPolicyProps;
}

export class AlbFargateService extends Construct {
    public readonly service: FargateService;

    public readonly ecsCluster: ecs.ICluster;

    public readonly loadBalancer: CustomApplicationLoadBalancer;

    public readonly serviceSecurityGroup: SecurityGroup;

    constructor(scope: Construct, id: string, props: AlbFargateServiceProps) {
        super(scope, id);
        DefaultTagHandler.applyTags(this);

        this.serviceSecurityGroup = new SecurityGroup(this, 'ServiceSecurityGroup', {
            vpc: props.ecsCluster.vpc,
            allowAllOutbound: true,
        });

        this.ecsCluster = props.ecsCluster;
        this.loadBalancer = props.loadBalancer;
        this.service = new FargateService(this, 'FargateService', {
            cluster: this.ecsCluster,
            taskDefinition: props.taskDefinition,
            desiredCount: props.desiredCount || DEFAULT_TASK_COUNT,
            platformVersion: props.platformVersion || DEFAULT_PLATFORM_VERSION,
            minHealthyPercent: props.minHealthyPercent || DEFAULT_MIN_HEALTHY_PERCENT,
            maxHealthyPercent: props.maxHealthyPercent || DEFAULT_MAX_HEALTHY_PERCENT,
            healthCheckGracePeriod: props.healthCheckGracePeriod || DEFAULT_HEALTH_CHECK_GRACE_PERIOD,
            circuitBreaker: DEFAULT_CIRCUIT_BREAKER,
            securityGroups: [this.serviceSecurityGroup],
            ...(props.serviceName && { serviceName: props.serviceName }),
        });

        // Add data protection policy to aws-logs
        addDataProtectionPolicyToFargateContainerLogs(this, this.service, this.service.taskDefinition, props.dataProtectionPolicyProps);

        const containerPort = props.taskDefinition.defaultContainer?.containerPort ?? DEFAULT_CONTAINER_PORT;

        this.serviceSecurityGroup.addIngressRule(
            this.loadBalancer.securityGroup,
            ec2.Port.tcp(containerPort),
            `Allow the inbound traffic on port ${containerPort}`,
        );

        this.loadBalancer.targetGroup.addTarget(this.service);
    }
}
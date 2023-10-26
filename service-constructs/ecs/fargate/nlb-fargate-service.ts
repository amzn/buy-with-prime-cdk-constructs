#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { DeploymentCircuitBreaker } from 'aws-cdk-lib/aws-ecs';
import { Construct } from 'constructs';
import { AccessLogsBucket } from '../../s3/access-bucket-log';
import { JLB_RELAY_PORT } from './jlb-relay';
import { addDataProtectionPolicyToFargateContainerLogs } from './fargate-data-protection-policy-util';
import { CwDataProtectionPolicyProps } from '../../cloudwatch-data-protection/data-protection-policy';
import { DefaultTagHandler } from '../../tags/default-tag-handler';

/*
 * Without end to end TLS termination
 *                  -------------              --------------
 *         TCP     |             |  HTTP      |              |
 *         80      |     NLB     |  8080      |   Service    |
 * ApiGw+--------->+             +----------->+              |
 *                 |             |            |              |
 *                 -------------              --------------
 *
 * With end to end TLS termination
 *                 -------------              --------------               --------------
 *         TCP     |             |  HTTPS     |              |    HTTP     |              |
 *         443     |     NLB     |  9001      |   JlbRelay   |    8080     |    Service   |
 * ApiGw+--------->+             +----------->+    Sidecar   +------------>+              |
 *                 |             |            |              |             |              |
 *                 -------------              --------------                --------------
 */
export interface EndToEndTlsConfig {
}

export interface NlbFargateServiceProps {


    //The ECS cluster. Your VPC configuration is defined here.
    readonly ecsCluster: ecs.ICluster;


    //Define your task memory limits, cpu units, task role, image/service packages in the task definition.
    readonly taskDefinition: ecs.FargateTaskDefinition;


    //Define name for S3 bucket containing NLB Access logs
    readonly accessLogsS3BucketName?: string;

    /**
     * Whether the NLB is public. Setting this to true is discouraged.
     * @default false
     */
    readonly publicAccessEnabled?: boolean;

    /**
     * Available platform versions:
     * https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-ecs.FargatePlatformVersion.html
     * @default LATEST
     */
    readonly platformVersion?: ecs.FargatePlatformVersion;

    /**
     * Count of Fargate tasks to launch in the service.
     * @default 1
     */
    readonly desiredCount?: number;

    /**
     * The lower limit on the number of your service's tasks that must remain in the RUNNING state during a deployment,
     * as a percentage of the desiredCount (rounded up to the nearest integer).
     *
     * @default 100
     */
    readonly minHealthyPercent?: number;

    /**
     * The upper limit on the number of your service's tasks that are allowed in the RUNNING or PENDING state during a deployment,
     * as a percentage of the desiredCount (rounded down to the nearest integer).
     *
     * @default 200
     */
    readonly maxHealthyPercent?: number;

    /**
     * The period of time that ECS service scheduler should ignore unhealthy ELB target health checks
     * after a task has first started.
     *
     * @default cdk.Duration.seconds(60)
     */
    readonly healthCheckGracePeriod?: cdk.Duration;

    /**
     * ELB waits this much time before completing the deregistration process, which can help in-flight requests
     * to the target group to complete.
     *
     * @default cdk.Duration.seconds(60)
     */
    readonly deregistrationDelay?: cdk.Duration;

    readonly endToEndTlsConfig?: EndToEndTlsConfig;

    /**
     * Whether to enable deployment circuit breaker for your fargate service.
     *
     * @default true
     * @experimental
     */
    readonly circuitBreakerEnabled?: boolean;

    /**
     * The deployment circuit breaker to use for the service.
     * A default circuit breaker (rollback: false) will be added if circuitBreakerEnabled is true and no circuitBreaker is provided.
     *
     * @experimental
     */
    readonly circuitBreaker?: DeploymentCircuitBreaker;

    /**
     * Properties for cloudwatch data protection policy on service logGroup.
     *
     * @default no data protection policy will be enabled.
     */
    readonly dataProtectionPolicyProps?: CwDataProtectionPolicyProps;
}

const DEFAULT_PUBLIC_ACCESS = false;
const DEFAULT_TASK_COUNT = 1;
const DEFAULT_PLATFORM_VERSION = ecs.FargatePlatformVersion.LATEST;
const DEFAULT_MIN_HEALTHY_PERCENT = 100;
const DEFAULT_MAX_HEALTHY_PERCENT = 200;
const DEFAULT_HEALTH_CHECK_GRACE_PERIOD = cdk.Duration.seconds(60);
const DEFAULT_DEREGISTRATION_DELAY = cdk.Duration.seconds(60);
const DEFAULT_CIRCUIT_BREAKER_ENABLED = true;
const DEFAULT_CIRCUIT_BREAKER = {
    rollback: false,
};

export class NlbFargateService extends Construct {
    readonly nlbFargateService: ecsPatterns.NetworkLoadBalancedFargateService;

    constructor(scope: Construct, id: string, props: NlbFargateServiceProps) {
        super(scope, id);
        DefaultTagHandler.applyTags(this);

        const circuitBreakerEnabled = props.circuitBreakerEnabled === undefined ? DEFAULT_CIRCUIT_BREAKER_ENABLED : props.circuitBreakerEnabled;
        const circuitBreaker = circuitBreakerEnabled ? (props.circuitBreaker || DEFAULT_CIRCUIT_BREAKER) : undefined;

        this.nlbFargateService = new ecsPatterns.NetworkLoadBalancedFargateService(this, 'FargateService', {
            cluster: props.ecsCluster,
            taskDefinition: props.taskDefinition,
            publicLoadBalancer: props.publicAccessEnabled || DEFAULT_PUBLIC_ACCESS,
            desiredCount: props.desiredCount || DEFAULT_TASK_COUNT,
            platformVersion: props.platformVersion || DEFAULT_PLATFORM_VERSION,
            minHealthyPercent: props.minHealthyPercent || DEFAULT_MIN_HEALTHY_PERCENT,
            maxHealthyPercent: props.maxHealthyPercent || DEFAULT_MAX_HEALTHY_PERCENT,
            healthCheckGracePeriod: props.healthCheckGracePeriod || DEFAULT_HEALTH_CHECK_GRACE_PERIOD,
            circuitBreaker,
        });

        // Add data protection policy to aws-logs
        addDataProtectionPolicyToFargateContainerLogs(this, this.nlbFargateService.service, this.nlbFargateService.taskDefinition, props.dataProtectionPolicyProps);

        /*
         * Enabling ALB Access logs by default.
         * When we enable access logs, we must specify an S3 bucket for the access logs.
         * The bucket should use Amazon S3-Managed Encryption Keys (SSE-S3).
         * Additional requirement details can be found in :
         * https://docs.aws.amazon.com/elasticloadbalancing/latest/network/load-balancer-access-logs.html
         */
        const bucket = new AccessLogsBucket(this, 'nlb-access-logs', {
            bucketName: props.accessLogsS3BucketName,
            encryption: BucketEncryption.S3_MANAGED,
        });
        this.nlbFargateService.loadBalancer.logAccessLogs(bucket, 'nlb-fargate-access-logs');

        /*
         * By default, the security groups created by NetworkLoadBalancedFargateService allow all ingress traffic.
         * Those security groups are for the ECS service tasks since the NLB itself does not have security groups
         * associated with it. It allows the NLB health checks to work and for traffic to reach the ECS stack from
         * the NLB. The following changes the security groups to only allow inbound traffic originating from within the VPC.
         */
        if (props.endToEndTlsConfig) {
            // TCP Passthrough from ApiGw to NLB
            const listener: elbv2.CfnListener = this.nlbFargateService.listener.node.defaultChild as elbv2.CfnListener;
            listener.port = 443;
            listener.protocol = elbv2.Protocol.TCP;

            this.nlbFargateService.service.connections.allowFrom(
                ec2.Peer.ipv4(this.nlbFargateService.cluster.vpc.vpcCidrBlock),
                ec2.Port.tcp(JLB_RELAY_PORT),
                `Allow only the traffic that originated from within the VPC on port ${JLB_RELAY_PORT}`,
            );

            // Point nlb to jlb relay instead of the service
            const targetGroup = this.nlbFargateService.targetGroup.node.defaultChild as elbv2.CfnTargetGroup;
            targetGroup.port = JLB_RELAY_PORT;
            targetGroup.protocol = elbv2.Protocol.TCP;

            this.nlbFargateService.targetGroup.configureHealthCheck({
                port: JLB_RELAY_PORT.toString(),
                protocol: elbv2.Protocol.TCP,
            });
            // This flag tells NLB whether to attach “nuggets” to the messages using PPv2 format.
            // Nuggets provide ID of the source VPC and VPC endpoint as well as the IP of the message originator.
            // We recommend enabling PPv2 at NLB for supporting VPC endpoints.
            this.nlbFargateService.targetGroup.setAttribute('proxy_protocol_v2.enabled', 'false');
        } else {
            this.nlbFargateService.service.connections.allowFrom(
                ec2.Peer.ipv4(this.nlbFargateService.cluster.vpc.vpcCidrBlock),
                ec2.Port.tcp(80),
                'Allow only the traffic that originated from within the VPC on port 80',
            );

            this.nlbFargateService.service.connections.allowFrom(
                ec2.Peer.ipv4(this.nlbFargateService.cluster.vpc.vpcCidrBlock),
                ec2.Port.tcp(8080),
                'Allow only the traffic that originated from within the VPC on port 8080',
            );

            // ELB health checks configuration
            this.nlbFargateService.targetGroup.configureHealthCheck({
                port: 'traffic-port',
                protocol: elbv2.Protocol.TCP,
            });
        }

        // ELB deregistration delay configuration
        this.nlbFargateService.targetGroup.setAttribute(
            'deregistration_delay.timeout_seconds',
            (props.deregistrationDelay && props.deregistrationDelay.toSeconds().toString()) || DEFAULT_DEREGISTRATION_DELAY.toSeconds().toString(),
        );
    }
}
import { Construct } from 'constructs';
import { Duration } from 'aws-cdk-lib';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import {
    ApplicationLoadBalancer, ApplicationProtocol, ApplicationTargetGroup, ListenerCertificate, SslPolicy,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { CertificateValidation, Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { ARecord, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { LoadBalancerTarget } from 'aws-cdk-lib/aws-route53-targets';
import { AccessLogsBucket } from '../s3/access-bucket-log';
import { DomainProps } from './domain-properties';
import { DefaultTagHandler } from '../tags/default-tag-handler';

const DEFAULT_LISTENER_PORT = 443;
const DEFAULT_TARGET_GROUP_PORT = 8080;
const SECURE_PROTOCOL = ApplicationProtocol.HTTPS;

export interface ApplicationLoadBalancerProps {

    //The VPC where the container instances will be launched
    // or the elastic network interfaces (ENIs) will be deployed.
    readonly vpc: ec2.IVpc;


    //Route53 Domain properties
    readonly domainProps: DomainProps;

    /**
     * Listener port of the application load balancer that will serve traffic to the service.
     * @default - 443
     */
    readonly listenerPort?: number;

    /**
     * The port on the target group
     * @default - 8080
     */
    readonly targetGroupPort?: number;

    //The name for the S3 bucket containing ALB Access logs
    readonly accessLogsS3BucketName?: string;

    /**
     * The load balancer idle timeout, in seconds.
     *
     * As an attempt to reduce the amount of 502 and 504,
     * have the ALB timeout a bit larger than the target
     *
     * @default 60
     */
    readonly idleTimeout?: Duration;
}

export class CustomApplicationLoadBalancer extends Construct {
    public readonly targetGroup: ApplicationTargetGroup;

    public readonly securityGroup: SecurityGroup;

    public readonly loadBalancer: ApplicationLoadBalancer;

    constructor(scope: Construct, id: string, props: ApplicationLoadBalancerProps) {
        super(scope, id);
        DefaultTagHandler.applyTags(this);

        this.securityGroup = new SecurityGroup(this, 'ALBSecurityGroup', {
            vpc: props.vpc,
            allowAllOutbound: false,
        });

        this.loadBalancer = new ApplicationLoadBalancer(this, 'ApplicationLoadBalancer', {
            vpc: props.vpc,
            vpcSubnets: {
                subnets: props.vpc.publicSubnets,
            },
            securityGroup: this.securityGroup,
            internetFacing: true,
            // It is a recommendation to enable deletion protection for the ALB
            deletionProtection: true,
            idleTimeout: props.idleTimeout,
        });

        // Omitting or disabling the routing.http.drop_invalid_header_fields.enabled option
        // results in potential exposure to HTTP DeSync attacks.
        this.loadBalancer.setAttribute('routing.http.drop_invalid_header_fields.enabled', 'true');

        /*
         * Enabling ALB Access logs by default.
         * When we enable access logs, we must specify an S3 bucket for the access logs.
         * The bucket should use Amazon S3-Managed Encryption Keys (SSE-S3).
         * Additional requirement details can be found in :
         * https://docs.aws.amazon.com/elasticloadbalancing/latest/network/load-balancer-access-logs.html
        */
        const bucket = new AccessLogsBucket(this, 'alb-access-logs', {
            bucketName: props.accessLogsS3BucketName,
            encryption: BucketEncryption.S3_MANAGED,
        });

        this.loadBalancer.logAccessLogs(bucket, 'alb-access-logs');

        const domainName = `${props.domainProps.domainNamePrefix}.${props.domainProps.hostedZone.zoneName}`;

        const listener = this.loadBalancer.addListener('PublicListener', {
            protocol: SECURE_PROTOCOL,
            port: props.listenerPort ?? DEFAULT_LISTENER_PORT,
            open: true,
            sslPolicy: SslPolicy.RECOMMENDED_TLS,
        });

        const certificate = new Certificate(this, 'DnsValidatedCertificate', {
            domainName,
            validation: CertificateValidation.fromDns(props.domainProps.hostedZone),
        });
        listener.addCertificates('Arns', [ListenerCertificate.fromCertificateManager(certificate)]);

        this.targetGroup = listener.addTargets('ECS', {
            protocol: ApplicationProtocol.HTTP,
            port: props.targetGroupPort ?? DEFAULT_TARGET_GROUP_PORT,
        });

        this.targetGroup.configureHealthCheck({
            port: 'traffic-port',
            path: '/ping',
            protocol: elbv2.Protocol.HTTP,
        });

        new ARecord(this, 'DNS', {
            zone: props.domainProps.hostedZone,
            recordName: domainName,
            target: RecordTarget.fromAlias(new LoadBalancerTarget(this.loadBalancer)),
        });
    }
}
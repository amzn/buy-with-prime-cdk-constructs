import * as ecs from 'aws-cdk-lib/aws-ecs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { SidecarProps } from './sidecar';
import { DefaultTagHandler } from '../../tags/default-tag-handler';
import {StageContext} from "aws-sdk/clients/codepipeline";
import {FargateTaskDefinition, RepositoryImage} from "aws-cdk-lib/aws-ecs";

export const JLB_RELAY_PORT = 9001;
export const DEFAULT_SERVICE_PORT = 8080;

export interface JlbRelaySidecarProps extends SidecarProps {
    //The appName will be used as JlbRelay metric namespace prefix and metric prefix.
    readonly appName: string;

    readonly appContainerDefinition: ecs.ContainerDefinition;

    readonly stageContext: StageContext;

    //Certificate material set used for on host tls termination.
    readonly certificateMaterialSet: string;

    //Limits the number of connections JLBRelay can open to the backend service
    readonly maxConnections: number;

    /*               -------------              --------------               --------------
     *      TCP     |             |  HTTPS     |              |    HTTP     |              |
     *      443     |     NLB     |  9001      |   JlbRelay   |    8080     |              |
     * +----------->+             +----------->+    Sidecar   +------------>+     Service  |
     *              |             |            |              |             |              |
     *               -------------              --------------                --------------
     */
    //(default: 8080) - your application port that will accept requests coming from an HTTP listener
    readonly servicePort?: number;

}

export class JlbRelaySidecar extends Construct {
    readonly appName: string;

    readonly metricNamespace: string;

    readonly jlbRelayContainer: ecs.ContainerDefinition;

    constructor(taskDef: ecs.FargateTaskDefinition, id: string, props: JlbRelaySidecarProps) {
        super(taskDef, id);
        DefaultTagHandler.applyTags(this);
        this.appName = props.appName;
        this.metricNamespace = `${props.appName}-JlbRelay`;

        const environmentVars: { [key: string]: string } = {
            STAGE: props.stageContext.name,
            METRICS_NAMESPACE: this.metricNamespace,
            RELAY_METRICS_PREFIX: props.appName,
            RELAY_METRICS_MARKETPLACE_PREFIX: props.appName,
            // JlbRelay recommends 1 worker per 100 backend connections
            RELAY_WORKERS: (Math.trunc(props.maxConnections / 100) + 1).toString(),
            // 2 connections reserved for JlbRelay health checks
            // for reserved health check connections, service needs to enable ppv2 for NLB
            RELAY_UPSTREAM_MAX_CONNECTIONS: (props.maxConnections - 2).toString(),
            RELAY_UPSTREAM_PORT: props.servicePort ? props.servicePort.toString() : DEFAULT_SERVICE_PORT.toString(),
            RELAY_HTTPS_UPSTREAM_PORT: props.servicePort ? props.servicePort.toString() : DEFAULT_SERVICE_PORT.toString(),
            RELAY_HTTPS_DOWNSTREAM_PORT: JLB_RELAY_PORT.toString(),
            CERTIFICATE_MATERIAL_SET: props.certificateMaterialSet,
        };
        // Ensure latest ECR image is used on each deployment on dev AWS account
        if (props.stageContext.name === 'Dev') {
            environmentVars.DEPLOYMENT_ID = Math.random().toString(36).substring(8);
        }

        this.jlbRelayContainer = taskDef.addContainer('JlbRelay', {
            essential: true,
            image: new RepositoryImage("JlbRelayImage",{
            //Properties related to repository
            }),
            logging: new ecs.AwsLogDriver({
                streamPrefix: `${props.appName}-JlbRelay`,
                logRetention: RetentionDays.TEN_YEARS,
            }),
            cpu: props.cpu,
            memoryLimitMiB: props.memoryLimitMiB,
            memoryReservationMiB: props.memoryReservationMiB,
            environment: environmentVars,
            healthCheck: {
                command: ['CMD-SHELL', '/opt/amazon/bin/health-check.sh'],
                // After 5 minute we'll expect the service to be up
                startPeriod: Duration.minutes(5),
                timeout: Duration.seconds(5),
            },
        });

        this.jlbRelayContainer.addPortMappings({
            containerPort: JLB_RELAY_PORT,
            protocol: ecs.Protocol.TCP,
        });

        this.jlbRelayContainer.addContainerDependencies({
            container: props.appContainerDefinition,
            condition: ecs.ContainerDependencyCondition.HEALTHY,
        });

        // JlbRelay must be the default container, so that this is the one receiving traffic from the NLB
        taskDef.defaultContainer = this.jlbRelayContainer;

        this.addAccessToCertificate(taskDef, props);
    }

    private addAccessToCertificate(taskDef: FargateTaskDefinition, props: JlbRelaySidecarProps) {
        //TODO: Add Access to your certificate
    }
}
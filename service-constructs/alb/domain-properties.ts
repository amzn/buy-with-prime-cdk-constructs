import {
    HostedZone,
} from 'aws-cdk-lib/aws-route53';
import {
    EndpointType,
} from 'aws-cdk-lib/aws-apigateway';

/**
 * Route53 Domain properties
 */
export interface DomainProps {
    /**
     * Route53 hosted zone.
     */
    readonly hostedZone: HostedZone;
    /**
     * Prefix of the URL.
     * Example: 'api-na'.
     * Complete URL will be formatted as domainNamePrefix + '.' + HostedZone.zoneName.
     */
    readonly domainNamePrefix: string;
    /**
     * Specifies whether Route53 ARecord should route traffic to the regional API endpoint.
     * Defaults to false if not set.
     * WARNING: If your service is currently deployed using only the EDGE endpoint,
     * before you enable this you need to first do a deployment
     * adding the REGIONAL endpoint (using endpointTypes below).
     */
    readonly enableRegionalEndpoint?: boolean;
    /**
     * Specifies which endpoint types to create, and provides migration between endpoint types.
     * If not set, the defaults will be based on enableRegionalEndpoint,
     * if enableRegionalEndpoint is not set or false the default to EDGE,
     * otherwise REGIONAL. Aimed at backwards compatibility.
     */
    readonly endpointTypes?: EndpointType[];
    /**
     * Specifies the region to create a DNS validated certificate
     * managed by AWS Certificate Manager to be used by a regional endpoint.
     * Regional endpoints require certs in the same region.
     * @default us-east-1
     */
    readonly region?: string;
}

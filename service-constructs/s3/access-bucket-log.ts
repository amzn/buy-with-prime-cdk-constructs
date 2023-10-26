import {Construct} from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cdk from "aws-cdk-lib";
import {Bucket, BucketProps} from "./s3-bucket";

const LOGS_CURRENT_VERSION_EXPIRATION_DAYS = 3650;
const LOGS_CURRENT_VERSION_TRANSITION_DAYS = 365;
export class AccessLogsBucket extends Bucket {
    constructor(scope: Construct, id: string, props: BucketProps) {
        const updatedProps = {
            // Restrict public log bucket access always
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,

            bucketName: props.bucketName,

            // Default bucket encryption on the target bucket can only be used if AES256 (SSE-S3) is selected.
            // SSE-KMS encryption is not supported.
            // https://docs.aws.amazon.com/AmazonS3/latest/dev/ServerLogs.html
            encryption: s3.BucketEncryption.S3_MANAGED,

            // We don't need to create a new s3 bucket for access logging, since the logs will go directly to this bucket.
            enableAccessLogging: false,

            // Access-logging for access logs bucket
            // Creating a folder "logs" within the logs bucket to avoid circular dependency.
            serverAccessLogsPrefix: 'logs/',

            // Keep access logs for 10 years but move to Glacier after 1 year for lower cost.
            lifecycleRules: [
                {
                    id: 'CurrentVersionPolicyForLogs',
                    enabled: true,
                    expiration: cdk.Duration.days(LOGS_CURRENT_VERSION_EXPIRATION_DAYS),
                    transitions: [
                        {
                            storageClass: s3.StorageClass.GLACIER,
                            transitionAfter: cdk.Duration.days(LOGS_CURRENT_VERSION_TRANSITION_DAYS),
                        },
                    ],
                },
            ],

            // Set require secure transport to true
            requireSecureTransport: props.requireSecureTransport ?? true,

            // Versioning for bucket access logging should be set to true as this ensures that even
            // if the bucket is accidentally deleted bucket can be reconstructed and logs can be revisited
            versioned: true,

            // Server Access Logging buckets have LogDeliveryWrite ACL enabled by default which causes
            // InvalidBucketAclWithObjectOwnership error.
            // To mitigate this issue ObjectOwnership should be set to BucketOwnerPreferred.
            objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
        };
        super(scope, id, updatedProps);
    }
}
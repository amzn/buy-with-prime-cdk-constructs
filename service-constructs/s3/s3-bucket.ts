import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { DefaultTagHandler } from '../tags/default-tag-handler';
import {AccessLogsBucket} from "./access-bucket-log";

const MAX_ALLOWED_BUCKET_NAME_LENGTH = 63;
const NON_CURRENT_VERSION_EXPIRATION_DAYS = 90;

/**
 * Opinionated defaults for S3 Bucket. All options available to the AWS CDK's
 * BucketProps are available here:
 * https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-s3.BucketProps.html.
 */
export interface BucketProps extends s3.BucketProps {
    /**
     * Enforce secure access to S3 buckets.
     * Marking this as `true` will enable bucket access through HTTPS requests only.
     *
     * Note that if the `requireSecureTransport` is not explicitly set to false,
     * Bucket will treat `requireSecureTransport` as `true`.
     * If you have a good reason to disable this, you  must explicitly set `requireSecureTransport` to `false`.
     */
    readonly requireSecureTransport?: boolean;

    /**
     * Enable access logging  via a new S3 bucket.
     *
     * Note that if the `enableAccessLogging` is not explicitly set to false, Bucket will treat `enableAccessLogging` as `true`.
     * If you have a good reason to disable this, you  must explicitly set `enableAccessLogging` to `false`.
     */
    readonly enableAccessLogging?: boolean;

    /**
     * Enable default lifecycle rule on the bucket to adhere to compliance(GDPR etc.) policy.
     *
     * Note that if the `enableDefaultLifecycleRules` is not explicitly set to false, Bucket will treat `enableDefaultLifecycleRules` as `true`.
     * If you have a good reason to disable this, you  must explicitly set `enableDefaultLifecycleRules` to `false`.
     */
    readonly enableDefaultLifecycleRules?: boolean;
}

/**
 * This `S3` construct builds on AWS CDK's S3 construct by enforcing opinionated practices
 * within the organization.
 *
 * Read more about this construct at /documentation/s3/S3.md
 */
export class Bucket extends s3.Bucket {
    /**
     * Expose the underlying access log bucket. This allows the users of Bucket to control the properties of the underlying
     * serverAccessLogsBucket if we end up creating one on their behalf.
     */
    readonly serverAccessLogsBucket?: s3.IBucket;

    constructor(scope: Construct, id: string, props: BucketProps) {
        if (!props) {
            throw new Error('BucketProps must be provided');
        }

        // If encryption is not explicitly specified, use s3.BucketEncryption.KMS
        const encryption = props.encryption ?? s3.BucketEncryption.KMS;

        let { encryptionKey, serverAccessLogsBucket, lifecycleRules } = props;

        /**
         * If the `encryption` field is set to `s3.BucketEncryption.KMS_MANAGED`, and an `encryptionKey` is not specified,
         * create a new KMS key and use that for the bucket encryption. In that case, by default, the bucket will
         * not have read access for anyone (including "Admin" users). You will need to call `bucket.grantRead` with the desired Principal to allow
         * read access to the bucket.
         */
        if (encryption === s3.BucketEncryption.KMS && !encryptionKey) {
            encryptionKey = new kms.Key(scope, `${id}Key`, {
                description: `Created by ${id} resource`,
                enableKeyRotation: true,
            });
        }

        // If the `enableAccessLogging` field is not explicitly set to false, treat `enableAccessLogging` as `true`.
        const enableAccessLogging = props.enableAccessLogging ?? true;

        // If the `enableAccessLogging` field is set to true, create a new S3 bucket and use that for access logging.
        if (enableAccessLogging && !serverAccessLogsBucket) {
            // If the primary bucket has a name specified, and if the bucketName + '-logs' is less than MAX_ALLOWED_BUCKET_NAME_LENGTH,
            // then use that as the access log bucket's name. Otherwise, let CloudFormation generate the access log bucket name.
            let accessLogBucketName: string | undefined;
            if (props.bucketName) {
                accessLogBucketName = `${props.bucketName}-logs`;

                if (accessLogBucketName.length > MAX_ALLOWED_BUCKET_NAME_LENGTH) {
                    accessLogBucketName = undefined;
                }
            }

            // eslint-disable-next-line no-use-before-define
            serverAccessLogsBucket = new AccessLogsBucket(scope, `${id}AccessLog`, {
                bucketName: accessLogBucketName,
                requireSecureTransport: props.requireSecureTransport,
            });
        }

        // If the `versioned` field is not explicitly set to false, treat `versioned` as `true`.
        const versioned = props.versioned ?? true;

        // If the `enableDefaultLifecycleRules` field is not explicitly set to false, treat `enableDefaultLifecycleRules` as `true`.
        const enableDefaultLifecycleRules = props.enableDefaultLifecycleRules ?? true;

        // Add default lifecycle rule about non-current versions. It can be added only on versioned enabled bucket.
        if (enableDefaultLifecycleRules && versioned && !lifecycleRules) {
            const defaultLifecyclePolicy = {
                id: 'NonCurrentVersionPolicyForCompliance',
                enabled: true,
                noncurrentVersionExpiration: cdk.Duration.days(NON_CURRENT_VERSION_EXPIRATION_DAYS),
            };
            lifecycleRules = [defaultLifecyclePolicy];
        }

        // If the `blockPublicAccess` field is not explicitly set, set to block all
        const blockPublicAccess = props.blockPublicAccess ?? s3.BlockPublicAccess.BLOCK_ALL;

        const updatedProps: BucketProps = {
            ...{
                blockPublicAccess,
                encryption,
                encryptionKey,
                enableAccessLogging,
                lifecycleRules,
                serverAccessLogsBucket,
                versioned,
            },
            ...props,
        };

        super(scope, id, updatedProps);
        DefaultTagHandler.applyTags(this);

        this.serverAccessLogsBucket = serverAccessLogsBucket;

        // If requireSecureTransport is not explicitly set to false, treat `requireSecureTransport` as `true`.
        const requireSecureTransport = props.requireSecureTransport ?? true;

        // Add bucket policy requiring SecureTransport
        if (requireSecureTransport) {
            this.addToResourcePolicy(
                new iam.PolicyStatement({
                    effect: iam.Effect.DENY,
                    actions: ['s3:*'],
                    principals: [new iam.AnyPrincipal()],
                    resources: [this.arnForObjects('*')],
                    conditions: {
                        Bool: { 'aws:SecureTransport': 'false' },
                    },
                }),
            );
        }

        // If s3.BucketEncryption.KMS is desired,
        // require that some AWS KMS CMK be used to encrypt the objects in the bucket
        // https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingKMSEncryption.html#require-sse-kms
        if (updatedProps.encryption === s3.BucketEncryption.KMS) {
            this.addToResourcePolicy(new iam.PolicyStatement({
                effect: iam.Effect.DENY,
                actions: ['s3:PutObject'],
                resources: [this.arnForObjects('*')],
                principals: [new iam.AnyPrincipal()],
                conditions: {
                    Null: {
                        's3:x-amz-server-side-encryption-aws-kms-key-id': true,
                    },
                },
            }));
        }
    }
}

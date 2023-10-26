import {
    AnyPrincipal,
    Effect,
    Grant,
    IGrantable,
    IPrincipal,
    PolicyStatement,
} from 'aws-cdk-lib/aws-iam';
import { IKey, Key } from 'aws-cdk-lib/aws-kms';
import { Topic, TopicProps } from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';
import { DefaultTagHandler } from '../tags/default-tag-handler';

/**
 * All SNS Actions, this is required because 'sns:*' throws error while adding resource policy.
 */
export const ALL_SNS_ACTIONS = [
    'sns:GetTopicAttributes',
    'sns:SetTopicAttributes',
    'sns:AddPermission',
    'sns:RemovePermission',
    'sns:DeleteTopic',
    'sns:Subscribe',
    'sns:ListSubscriptionsByTopic',
    'sns:Publish',
    'sns:Receive',
    'sns:TagResource',
    'sns:UntagResource',
    'sns:ListTagsForResource',
];

/**
 * Best practices defaults and security considerations for SNS construct.
 * For referring all Topic props options: https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-sns.Topic.html
 *
 */
export interface SnsTopicProps extends TopicProps {
    /**
     * Only allow secure actions on the SNS topic via HTTPS, if set to true
     *
     * @default true
     */
    readonly requireSecureTransport?: boolean;

    /**
     * If set to true then creates a default KMS key
     * unless a master encryption Key is specified by the client.
     * This would enable SSE with customer managed KMS.
     *
     * @default true
     */
    readonly enableEncryption?: boolean;

    /**
     * Allow the list of principals to publish message to the topic
     * Enable only required users to use the resource capabilities.
     */
    readonly principalsAllowedToPublish?: IPrincipal[];

    /**
     * Allow the list of principals to subscribe to the topic
     * Enable only required users to use the resource capabilities.
     */
    readonly principalsAllowedToSubscribe?: IPrincipal[];
}


/**
 * This `SnsTopic` construct builds on AWS CDK's Topic construct by
 * enforcing opinionated practice within the organization.
 *
 * Read more about this construct at /documentation/sns/SnsTopic.md
 */
export class SnsTopic extends Topic {
    /**
     * Expose the master key for the topic. Allows the clients to control the properties of the
     * masterKey, if we end up creating one on their behalf.
     */
    readonly masterKey?: IKey;

    constructor(scope: Construct, id: string, props: SnsTopicProps) {

        //If topicProps are null or not sent then fail early.
        if (!props) {
            throw new Error('SnsTopicProps must be provided.');
        }

        let { masterKey, enableEncryption, requireSecureTransport } = props;

        //If encryption mechanism is not defined, then default to true
        if (props.enableEncryption === undefined) {
            enableEncryption = true;
        }

        //If encryption is required but no master Key is specified then create a default KMS key.
        if (enableEncryption && !masterKey) {
            masterKey = SnsTopic.createEncryptionMasterKey(scope, id);
        }

        super(scope, id, {
            masterKey,
            ...props,
        });
        DefaultTagHandler.applyTags(this);

        this.masterKey = masterKey;


        //Allow the principal to publish messages and encrypt permissions for the master key.
        props.principalsAllowedToPublish?.forEach((principal : IPrincipal) => {
            this.masterKey?.grantEncrypt(principal);
            // kms:Decrypt necessary to execute grantPublish to an SSE enabled SQS queue
            // Refer : https://docs.amazonaws.cn/en_us/sns/latest/dg/sns-key-management.html#send-to-encrypted-topic:~:text=Allow%20a%20user%20to%20send%20messages%20to%20a%20topic%20with%20SSE
            this.masterKey?.grantDecrypt(principal);
            this.grantPublish(principal);
        });


        //Allow the principal to subscribe for messages and decrypt permissions for the master key.
        props.principalsAllowedToSubscribe?.forEach((principal : IPrincipal) => {
            this.masterKey?.grantDecrypt(principal);
            this.grantSubscribe(principal);
        });


        //If require secure transport is not present, then default to true
        if (requireSecureTransport === undefined) {
            requireSecureTransport = true;
        }

        /**
         * If HTTPS is required then Deny HTTP requests for all actions
         * to the SNS Topic using the condition 'aws:SecureTransport: false'.
         * By default, we would assume this to be true.
         * Hence, if not explicitly set to false, create the DENY HTTP policy.
         */
        if (requireSecureTransport) {
            const secureTopicPolicyStatement = new PolicyStatement({
                actions: ALL_SNS_ACTIONS,
                effect: Effect.DENY,
                principals: [new AnyPrincipal()],
                resources: [this.topicArn],
            });

            secureTopicPolicyStatement.sid = 'Enforce - HTTPS';
            secureTopicPolicyStatement.addCondition('Bool', { 'aws:SecureTransport': 'false' });
            this.addToResourcePolicy(secureTopicPolicyStatement);
        }
    }

    /**
     * This method creates a new Key which would be used for encryption of topic.
     *
     * For more information: https://docs.aws.amazon.com/sns/latest/dg/sns-key-management.html
     * @param scope
     * @param id
     */
    private static createEncryptionMasterKey(scope: Construct, id: string) {
        return new Key(scope, `${id}Key`, {
            description: `Created by ${id} resource`,
            enableKeyRotation: true
        });
    }

    /**
     * This method grants subscribe access to the principal specified.
     *
     * @param grantee
     */
    private grantSubscribe(grantee: IGrantable): Grant {
        return Grant.addToPrincipalAndResource({
            resource: this,
            resourceArns: [this.topicArn],
            actions: ['sns:Subscribe'],
            grantee,
        });
    }
}
import {
    DeadLetterQueue, Queue, QueueEncryption, QueueProps
} from 'aws-cdk-lib/aws-sqs';
import { Key } from 'aws-cdk-lib/aws-kms';
import { Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
    AnyPrincipal, Effect, IPrincipal, PolicyStatement,
} from 'aws-cdk-lib/aws-iam';
import { DefaultTagHandler } from '../tags/default-tag-handler';

/**
 * SQS defaults for SQS Queue.
 */
const SQS_DEFAULTS = {
    MAX_ALLOWED_QUEUE_NAME_LENGTH: 80,
    DEFAULT_RECEIVE_COUNT: 100,
    MAX_RETENTION_PERIOD: Duration.days(14),
};

/**
 * Opinionated defaults and security considerations for SQS construct.
 * For referring all queue props options :  https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-sqs.QueueProps.html
 */
export interface SQSQueueProps extends QueueProps {
    /**
     * Only allow access to SQS queue via HTTPS if set to true.
     *
     * @default true
     */
    readonly requireSecureTransport?: boolean;
    /**
     * Allow the list of principal to send in the queue
     * Enable only required users to use the resource capabilities.
     */
    readonly principalsAllowedToSend?: IPrincipal[];

    /**
     * Allow the list of principal to receive message from the queue
     * Enable only required users to use the resource capabilities.
     */
    readonly principalsAllowedToConsume?: IPrincipal[];

    /**
     * Enable a dead letter queue for future re-drive. DLQ hold messages that failed to be processed.
     * @default true
     */
    readonly enableDeadLetterQueue?: boolean;

    /**
     * When enabling a dead letter queue, specify the number of times a message
     * can be unsuccessfully dequeued before being moved to the dead-letter queue.
     * @default 100
     */
    readonly dlqMaxReceiveCount?: number;
}

/**
 * This `SQSQueue` construct builds on AWS CDK's Queue construct by enforcing opinionated practices
 * within the organization.
 *
 * Read more about this construct at /documentation/sqs/SQSQueue.md
 */
export class SQSQueue extends Queue {
    /**
     * Expose the dead letter queue for the primary queue.
     * Allows the clients to control the properties of the
     * deadLetterQueue, if we end up creating one on their behalf.
     */
    readonly deadLetterQueue?: DeadLetterQueue;

    constructor(scope: Construct, id: string, props: SQSQueueProps) {
        /**
         * if the queueProps are null or not sent, then fail.
         */
        if (!props) {
            throw new Error('SQSQueueProps must be provided.');
        }

        let {
            encryption, encryptionMasterKey, enableDeadLetterQueue, requireSecureTransport, deadLetterQueue,
        } = props;


        //If encryption mechanism is not present, then default to KMS encryption
        if (!props.encryption) {
            encryption = QueueEncryption.KMS;
        }


        //If encryptionMasterKey is not specified and encryption type is KMS then create a default key.
        if (encryption === QueueEncryption.KMS && !encryptionMasterKey) {
            encryptionMasterKey = SQSQueue.createEncryptionMasterKey(scope, id);
        }


        //If enable dead letter queue is not present, then default to true and make a DLQ
        if (enableDeadLetterQueue === undefined) {
            enableDeadLetterQueue = true;
        }

        /**
         * If the primary queue has a name specified, and if the queueName + '-dlq' is less than MAX_ALLOWED_QUEUE_NAME_LENGTH
         * then use that as the dead letter queue name. Otherwise, let CloudFormation generate the dead letter queue name.
         *
         * For fifo queues, the main queue's name must end with `.fifo` suffix.
         * Refer : https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/FIFO-queues.html
         */
        let deadLetterQueueName = deadLetterQueue?.queue.queueName;
        if (props.queueName && !deadLetterQueue) {
            // If a dead letter queue has been specified then use its queue name, else use existing queue's name and append `-dlq`
            // For fifo queues, add `-dlq` before the `.fifo` suffix
            deadLetterQueueName = props.fifo ? SQSQueue.getQueueNameForFifoDlq(props.queueName) : `${props.queueName}-dlq`;

            if (deadLetterQueueName.length > SQS_DEFAULTS.MAX_ALLOWED_QUEUE_NAME_LENGTH) {
                deadLetterQueueName = undefined;
            }
        }


        //If require secure transport is not present, then default to true and make the transport secured

        if (requireSecureTransport === undefined) {
            requireSecureTransport = true;
        }

        // If `requireDeadLetterQueue` is set to true and deadLetterQueue is not provided by the client
        // then create a new SQS queue and use that as a DLQ.
        if (enableDeadLetterQueue && !deadLetterQueue) {
            deadLetterQueue = {
                queue: new SQSQueue(scope, `${id}Dlq`, {
                    // DLQ Name
                    queueName: deadLetterQueueName,

                    // Same encryption as the primary queue
                    encryption,

                    // Same encryption master key as the primary queue
                    encryptionMasterKey,

                    // Same secure transport choice as the primary queue
                    requireSecureTransport,

                    // Don't need DLQ for DLQ
                    enableDeadLetterQueue: false,

                    // MAX_RETENTION_PERIOD being 14 days = 1209600 seconds
                    retentionPeriod: SQS_DEFAULTS.MAX_RETENTION_PERIOD,

                    // Principals allowed to consume messages
                    principalsAllowedToConsume: props.principalsAllowedToConsume,

                    // Principals allowed to send messages
                    principalsAllowedToSend: props.principalsAllowedToSend,

                    // For a fifo queue, the DLQ should also be a Fifo.
                    fifo: props.fifo,
                }),

                // If client has sent max receive count then consider that, else the default receive count
                // DEFAULT_RECEIVE_COUNT being 100
                maxReceiveCount: props.dlqMaxReceiveCount ?? SQS_DEFAULTS.DEFAULT_RECEIVE_COUNT,
            };
        }

        super(scope, id, {
            ...{
                encryption,
                encryptionMasterKey,
                deadLetterQueue,
                retentionPeriod: props.retentionPeriod ?? SQS_DEFAULTS.MAX_RETENTION_PERIOD,
            },
            ...props,
        });
        DefaultTagHandler.applyTags(this);

        this.deadLetterQueue = deadLetterQueue;


        //Allow the principal to consume messages and also allow the principal
        // decrypt permissions for the master key provided for encryption.
        props.principalsAllowedToConsume?.forEach((principal: IPrincipal) => {
            this.grantConsumeMessages(principal);
        });


        //Allow the principal to send Messages and also allow the principal
        // encrypt permissions for the master key provided for encryption.
        props.principalsAllowedToSend?.forEach((principal: IPrincipal) => {
            this.grantSendMessages(principal);
        });


        //If HTTPS is required then Deny all HTTP requests to the SQS Queue using 'aws:SecureTransport: false'.
        //By default we would assume this to be true.
        // Hence if not explicitly set to false, create the DENY HTTP policy.
        if (requireSecureTransport) {
            const secureQueuePolicyStatement = new PolicyStatement({
                actions: ['sqs:*'],
                effect: Effect.DENY,
                principals: [new AnyPrincipal()],
            });

            secureQueuePolicyStatement.sid = 'Enforce - HTTPS';
            secureQueuePolicyStatement.addCondition('Bool', { 'aws:SecureTransport': 'false' });
            this.addToResourcePolicy(secureQueuePolicyStatement);
        }
    }

    /**
     * This method creates a new Key which would be used for encryption of queue.
     *
     * For more information: https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-key-management.html
     * @param scope
     * @param id
     */
    private static createEncryptionMasterKey(scope: Construct, id: string) {
        return new Key(scope, `${id}Key`, {
            description: `Created by ${id} resource`,
            enableKeyRotation: true,
        });
    }

    /**
     * This method returns the dlq name based on the fifo main queue name
     *
     * @param queueName
     */
    private static getQueueNameForFifoDlq(queueName: string) {
        const fifoSuffix = '.fifo';
        if (!queueName.endsWith(fifoSuffix)) {
            throw new Error(`Fifo queue must have name ending with .fifo suffix. Present queue name : ${queueName}`);
        }
        // Find the last index of suffix occurrence
        const fifoSuffixIndex = queueName.lastIndexOf(fifoSuffix);
        // Final string is [0, fifoSuffixIndex] + '-dlq' + [fifoSuffixIndex+1 till end]
        return `${queueName.substr(0, fifoSuffixIndex)}-dlq${queueName.substring(fifoSuffixIndex)}`;
    }
}
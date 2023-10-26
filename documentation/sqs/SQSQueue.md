## Features provided on top of SQS Queue
- SSE with customer managed KMS enabled by default.
- If no `encryptionMasterKey` is specified, create a KMS key.
- If KMS key encryption is specified, use of that key to send messages and consume messages is enforced by default.
- SecureTransport required by default.
- Giving only the required principals access to send messages.
- Giving only the required principals access to consume messages.
- If a DLQ is not explicitly disabled and no DLQ is specified, then a DLQ will be created with receive count of 100
- Setting retention period to max by default for the queue unless specified explicitly.
  Properties of SQSQueueProps can be customized to opt-out of any of the above.

### SQSQueue Construct

The `SQSQueue` construct mirrors AWS CDK's [`SQS`](https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-sqs.Queue.html)
construct, but enforces  opinionated practices and security considerations.
To use this construct:
```
new SQSQueue(stack, 'SQSQueueIdentifier', {});
```
If the encryption type is QueueEncryption.KMS_MANAGED then a masterKey is expected. If the masterKey is not specified then
Queue will create a new KMS key and use that for the queue encryption.
In that case, by default, the queue will not have read access for anyone (including "Admin" users). And you might receive such error:
 
`Error code: KMS.AccessDeniedException. Error message: The ciphertext refers to a customer master key that does not exist, does not exist in this region, or you are not allowed to access.
(Service: AWS KMS; Status Code: 400; Error Code: AccessDeniedException; Request ID: <random-guid>; Proxy: null)`

Hence you need to grant access to the principals for send and receive on queue. To do so, you will need to call `queue.grantSendMessages` with the desired Principal to allow sending message access to the queue. For example, to grant the "root user" access:
```
const stack = Stack.of(this);
queue.grantSendMessages(new iam.AccountPrincipal(stack.account));
```
Similar action would be needed to consume messages too using `queue.grantConsumeMessages` Note that a customer managed KMS key is preferred for queue by default. That said, KMS keys will result in additional costs and are not suitable to all use cases. If your use case requires a different server-side encryption, you can set `encryption` to `QueueEncryption.UNENCRYPTED`.
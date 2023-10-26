## Features provided on top of SNS Topic
- SSE with customer managed KMS enabled by default.
- If 'encryption' is not set, then default encryption is added by creating a KMS key.
- If KMS master key encryption is specified, use of that key to publish messages and subscribe messages is enforced by default.
- SecureTransport required by default [`Topic - Encryption In Transit`](https://docs.aws.amazon.com/sns/latest/dg/sns-security-best-practices.html#enforce-encryption-data-in-transit).
- Giving only the required principals access to publish messages.
- Giving only the required principals access to subscribe messages.
  Properties of SnsTopic can be customized to opt-out of any of the above.

The `SnsTopic` construct mirrors AWS CDK's [`SNS`](https://docs.aws.amazon.com/cdk/api/latest/docs/aws-sns-readme.html)
construct, but enforces opinionated practices and security considerations.
To use:
```
new SnsTopic(stack, 'SNSTopicIdentifier', {});
```
If the encryption attribute of props is set to `true` then a masterKey is expected. If the masterKey is not specified then
SNSTopic will create a new KMS key and use that for the topic encryption. In that case, by default, the topic will not have subscribe and publish access for anyone (including "Admin" users). And you might receive such error:
 
`Error code: KMS.AccessDeniedException. Error message: The ciphertext refers to a customer master key that does not exist, does not exist in this region, or you are not allowed to access.
(Service: AWS KMS; Status Code: 400; Error Code: AccessDeniedException; Request ID: <random-guid>; Proxy: null)`

To grant access to principals, you will need to call `topic.grantPublish` with the desired Principal to allow
publishing message access to the topic. For example, to grant the "root user" access:
```
const stack = Stack.of(this);
topic.grantPublish(new iam.AccountPrincipal(stack.account));
```
Similar action is needed to subscribe messages too using `topic.grantSubscribe`

Note that a customer managed KMS key is preferred for topic by default. 
That said, KMS keys will result in additional costs and are not suitable to all use cases. If your use case requires a different server-side encryption,
you can set `encryption` to `false`.
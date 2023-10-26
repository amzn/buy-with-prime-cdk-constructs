The `CustomerManagedKey` construct mirrors AWS CDK's [`Key`](https://docs.aws.amazon.com/cdk/api/v1/docs/@aws-cdk_aws-kms.Key.html)
construct, but enforces opinionated practices with creating a customer managed key.

For creating a customer managed key:
```
const key = new CustomerManagedKey(scope, 'MyKey', {
    keyAlias: 'MyKeyAlias',
    keyDescription: "MyKeyDescription",
    actions: [
        'kms:Encrypt',
        'kms:Decrypt',
        'kinesis:*'
        ...
    ]
});
```


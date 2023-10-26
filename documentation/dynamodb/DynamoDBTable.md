
The `DynamoDBTable` construct mirrors AWS CDK's [`Table`](https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-dynamodb.Table.html)
construct, but enforces opinionated practices.

There are several ways a table may be declared. To use this, you can create table in either Provisioned or OnDemand mode:

For creating a OnDemand table:
```
 new DynamoDBTable(stack, 'TableIdentifier', {
     tableName: 'ExampleTableOnDemand',
     partitionKey: {name: 'id', type: dynamodb.AttributeType.STRING}
 });
```
For creating a Provisioned table:
```
 new DynamoDBTable(stack, 'TableIdentifier', {
     tableName: 'ExampleTableProvisioned',
     partitionKey: {name: 'id', type: dynamodb.AttributeType.STRING},
     billingMode: dynamodb.BillingMode.PROVISIONED,
     readScalingProps: {
         minCapacity: 10,
         maxCapacity: 100
     },
     writeScalingProps: {
         minCapacity: 10,
         maxCapacity: 100
     }
 });
```

If the `encryption` field is not specified, DynamoDBTable defaults to `dynamodb.TableEncryption.CUSTOMER_MANAGED`.
If `encryption` field is specified (or inferred) to be dynamodb.TableEncryption.CUSTOMER_MANAGED and an `encryptionKey` is not specified,
DynamoDB CDK construct automatically will create a new KMS key and use that for the table encryption.

Note that a customer managed KMS key is preferred for table storage by default.
DynamoDB server-side encryption (SSE) only allows for a single key per table.
This makes isolation of customer content in DynamoDB difficult.
Encrypt customer content for multiple customers using different customer owned CMKs.
That said, KMS keys will result in additional costs and are not suitable to all use cases.
If your use case requires a different server-side encryption,
you can set `encryption` to one of the other supported `dynamodb.TableEncryption` values.

For Provisioned table, DynamoDB by default configures capacity auto-scaling for table and global secondary indexes.
Default auto-scaling properties can be overridden by invoking api explicitly.
e.g. for overriding autoscale read configuration:
```
table.autoScaleReadCapacity(readScalingProps);
```

### Features provided on top of DynamoDB Table:
- Creates OnDemand table(PAY_PER_REQUEST) by default.
- SSE w/ customer managed KMS enabled by default.
- For Provisioned table, enforces creation of auto-scaling for table and global secondary indexes. Provides by default scale on utilization.
- Enables point-in-time recovery by default.
- Enables deletion protection by default.

Properties of TableProps can be customized to opt-out of any of the above.

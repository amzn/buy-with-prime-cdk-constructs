# Overview

Developers can create instances of the construct, which includes inline resources. Developers need to be careful to specify the correct dependencies when using inline code. For example, Lambda has its own version of `aws-sdk` that does not include the required Cloudwatch APIs to update `data-retention-policy`. To avoid these issues, we will use a layer to bundle the required version of `aws-sdk`. To use please update the `log-properties-updater-custom-resource.ts` class with the corresponding location of the code for your organizations log update policy.

`code: Code.fromAsset(
"<INSERT LOCATION OF CODE HERE>"
),`


## General Guidance/Advice on Logging

Service logs should answer the question “Who did what when?” without including sensitive information such as passwords or secrets. If you use inadequate log information, this could negatively impact forensics investigations, preventing root cause analysis. Engineers will be unable to appropriately trace and identify an attackers steps. This is important for identifying the attack vector and sandboxing it to contain the blast radius. Additionally, only appropriate log information should be included in logs to prevent sensitive data from being leaked into CloudTrail or other places. Ensure logs are being created in all lifecycle states of your system. 

Ensure that you are continuously monitoring logs for sensitive data. In the event that sensitive data is accidentally logged, you should become aware of it automatically.

One way to accomplish this is by utilizing CloudWatch log data protection policies. You can enable sensitive data masking for relevant CloudWatch log groups. When sensitive data is accidentally logged, you are alerted so that you can respond and scrub the data. Operators cannot see masked data without specific additional access. The easiest path to support data protection policies is to use the CDK Construct. 

It is important to remove sensitive data from logs and not just mask it. Masking is a temporary fix as it can be unmasked by any individual with admin access to the AWS account. Note as well that CloudWatch Log's data protection policy feature can mask and audit logs for certain pre-defined types of user data but cannot capture all types of data. This is a layer of defense in depth against leaking sensitive data in to service logs. Logs used for purposes of investigation for a security incident are recommended to be kept for 10 years.
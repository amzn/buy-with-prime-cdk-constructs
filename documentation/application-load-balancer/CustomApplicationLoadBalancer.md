## Features provided on top of Application Load Balancer(ALB)
- Listener port of the ALB that will serve traffic to the service defaulted to port 443
- The port on the target group defaulted to 8080
- Integration with S3 for ALB access logs encrypted with SSE-S3
- ALB timeout set to 60 seconds
- Delete Protection enabled for ALB

### Usage of CustomApplicationLoadBalancer Construct

The `CustomApplicaitonLoadBalancer` construct mirrors AWS CDK's [`ApplicationLoadBalancer`](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_elasticloadbalancingv2.ApplicationLoadBalancer.html) construct, but enforces opinionated practices and security considerations.
To use:
```
new CustomApplicationLoadBalancer(this, "MyALB",{
    vpc: <VPC Details>,
    domainProps: {
        hostedZone:<Hosted Zone Details>
        domainNamePrefix:"<PREFIX>"
    }
});
```

The general recommendation is to use `REGIONAL` endpoints. By default, the ALB is optimized for `EDGE` instances and can result in a higher cost if not using a `REGIONAL` endpoint properly. Hence, our opinionated solution provides the creation of edge-optimized endpoints and provides the ability to migrate between endpoint types. Our suggestion is to use `EDGE` endpoint types and migrate to `REGIONAL` once it has been confirmed there are no latency issues.

### Steps to migrate from EDGE to REGIONAL:
1. Starting state - enableRegionalEndpoint flag not set or set to false .
2. Set enableRegionalEndpoint to false, and endpointTypes to include EDGE and REGIONAL, and deploy.
3. Set enableRegionalEndpoint to true, keep both types in endpointTypes, and deploy.
4. Keep enableRegionalEndpoint set to true, remove the endpointTypes setting altogether, and deploy.
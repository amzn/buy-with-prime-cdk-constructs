## Features provided on top of Basic CDK Constructs
- Access logging to the ALB using opinionated construct
- ALB using opinionated defaults provided in CustomApplicationLoadBalancer
- Public access disabled
- Fargate Platform version defaulted to LATEST
- Task count total set to 1
- During deployment min healthy amount 100% and max is 200%
- Health check grace period set to 60 seconds
- Deployment circuit breaker enabled
- CloudWatch Data Protection enabled

### General Guidance

This construct creates a fargate service fronted by an Application Load Balancer. The following diagram displays the high level architecture.

```
                +-------------+            +-------------+
        HTTPS   |             |  HTTP      |             |
        443     |     ALB     |  8080      |             |
Client--------->|             |----------->|    Service  |
                |             |            |             |
                +-------------+            +-------------+
                      |
                      v
                +-------------+
                |             |
                |  Route 53   |
                |             |
                +-------------+
```
Connection to fargate task containers is configured to host port 8080. Please note traffic between ALB and container is not encrypted in transit. By default, access logs to the ALB are enabled.
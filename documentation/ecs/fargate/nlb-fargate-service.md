## Features provided on top of Basic CDK Constructs
- End to end TLS termination with JLB Relay and Sidecar
- Access logging to the NLB
- Public access disabled
- Fargate Platform version defaulted to LATEST
- Task count total set to 1
- During deployment min healthy amount 100% and max is 200%
- Health check grace period set to 60 seconds
- Deployment circuit breaker enabled
- CloudWatch Data Protection enabled

### General Guidance

This construct creates a fargate service fronted by a Network Load Balancer. There are two ways to create this construct: with or without end to end TLS termination. The following diagrams display high level architecture of both options.

Without end to end TLS termination:
```
                 -------------              --------------
        TCP     |             |  HTTP      |              |
        80      |     NLB     |  8080      |   Service    |
ApiGw+--------->+             +----------->+              |
                |             |            |              |
                -------------              --------------
```
With end to end TLS termination:
```
                -------------              --------------               --------------
        TCP     |             |  HTTPS     |              |    HTTP     |              |
        443     |     NLB     |  9001      |   JlbRelay   |    8080     |    Service   |
ApiGw+--------->+             +----------->+    Sidecar   +------------>+              |
                |             |            |              |             |              |
                -------------              --------------                --------------
```
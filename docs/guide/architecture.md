# Architecture

This is the original architecture diagram from the first version of this project. It is still technically correct, but
we have since added a few more features that run outside of this loop on a schedule or in Lambda in response to events
in a queue. Stolen runner detector, webhook redelivery, warm runners, and idle runner reaper all run in the background.
The diagram also doesn't cover runner image building which runs on schedule. The diagram needs a refresh, but it is
still a good overview of the main loop of the system.

![Architecture diagram](/architecture.svg)

## Scaling

Everything in the control plane is serverless. Webhooks land in Lambda, each job gets its own Step Functions execution,
and background work goes through SQS and DynamoDB. There are no servers to size or patch, and nothing sits idle
between jobs. A burst of jobs just means more executions.

The state machine has one state per provider family (CodeBuild, EC2, ECS, etc.), not one per provider, so adding
providers doesn't grow it. Some setups run hundreds of providers from one stack.

# Cost

Runners only cost money while they run, but the infrastructure around them has a small fixed cost. All prices below are for us-east-1. Check the AWS pricing pages for your region.

## Fixed Cost

With the default providers (CodeBuild, Fargate and Lambda), an idle installation costs roughly $3 a month.

| Resource | Cost |
|----------|------|
| 4 Secrets Manager secrets (webhook, GitHub, GitHub private key, setup) | $0.40 per secret per month, so $1.60 |
| SQS polling by Lambda on the idle reaper and stolen runner queues | About 650,000 requests per queue a month at $0.40 per million, so $0.52 |
| Webhook redelivery Lambda that runs every 5 minutes | About 8,600 invocations and 17,000 secret reads a month at $0.05 per 10,000, so $0.09 |
| Weekly runner image rebuild for every image builder | A few minutes of CodeBuild for each build, about $0.005 a minute on the default small instance |
| One runner image per image builder in ECR | $0.10 per GB per month |
| CloudWatch logs, kept for a month by default | $0.50 per GB ingested and $0.03 per GB stored |

The rest of the infrastructure, like the Step Functions state machine, the other Lambda functions and the DynamoDB table, is pay per use and costs nothing when idle. The first million SQS requests every month are free, which covers most of the polling.

## Cost per Job

Every job pays for:

* **The runner itself.** This is most of the cost. It's billed by the provider's own pricing: [CodeBuild](https://aws.amazon.com/codebuild/pricing/) per minute, [EC2](https://aws.amazon.com/ec2/pricing/on-demand/) per second, [Fargate](https://aws.amazon.com/fargate/pricing/) per vCPU and GB second, and [Lambda](https://aws.amazon.com/lambda/pricing/) per GB second. Runner start up time counts too.
* **Orchestration.** One Step Functions execution with a handful of state transitions at $0.025 per 1,000, a few short Lambda invocations (webhook handler, token retriever, and the runner deleter if something fails), and a few SQS messages and DynamoDB writes used to stop idle runners and detect stolen runners. Together this is a fraction of a cent.
* **Logs.** Runners and the Lambda functions log to CloudWatch. The orchestrator doesn't log unless you set [`logOptions`](/api/GitHubRunnersProps#logOptions), and then it logs every state with its input and output unless you lower [`level`](/api/LogOptions#level) or turn off [`includeExecutionData`](/api/LogOptions#includeExecutionData).

A runner that starts but never gets a job, like when the job is canceled, is stopped after [`idleTimeout`](/api/GitHubRunnersProps#idleTimeout), which is 5 minutes by default.

## Easy to Miss

* **NAT gateways.** Runners in private subnets need a NAT gateway to reach GitHub, which costs about $32 a month plus $0.045 per GB. Jobs that pull a lot of Docker images or packages can make the data cost add up. By default runners use public subnets of the default VPC, which have no NAT cost. If you do need private subnets, VPC endpoints for S3 and ECR can save some of the traffic.
* **Warm runners.** If you turn on [warm runners](/guide/warm-runners), they are running the whole time they're in the pool, so you pay for them even when there are no jobs. Warm runners also add another SQS queue with its own polling, about $0.26 a month, and every warm runner is checked once a minute. That's about 43,200 Lambda invocations and 86,400 secret reads a month, or about $0.50 per warm runner on top of the runner itself.
* **Public IPv4 addresses.** EC2, Fargate and ECS runners in public subnets get a public IPv4 address, which costs $0.005 an hour while the runner is up.
* **Data transfer.** Uploading to the internet, like pushing images or artifacts outside AWS, costs $0.09 per GB.
* **KMS keys.** Keys you pass to [`Compliance.encrypt()`](/api/Compliance#encrypt) cost $1 a month each, plus $0.03 per 10,000 requests.
* **ECS instances.** The ECS provider runs jobs on an auto scaling group of instances. Setting [`minInstances`](/api/EcsRunnerProviderProps#minInstances) above 0 keeps those instances running.
* **Metrics.** [`metricJobCompleted()`](/api/GitHubRunners#metricJobCompleted), [`metricStolenRunners()`](/api/GitHubRunners#metricStolenRunners), [`metricStoppedRunners()`](/api/GitHubRunners#metricStoppedRunners) and [`metricJobsMatchingMultipleProviders()`](/api/GitHubRunners#metricJobsMatchingMultipleProviders) create log metric filters. Each metric and dimension combination is a custom metric at $0.30 a month. They are only created when you call those methods.
* **AWS Image Builder.** EC2 providers build their AMI with AWS Image Builder by default. Every rebuild runs an EC2 instance for a while, and every AMI keeps an EBS snapshot.

## Saving Money

* **Spot.** EC2, Fargate and ECS providers all have a `spot` option. Spot runners can be stopped in the middle of a job. Use a [composite provider](/guide/composite-providers) to fall back to on-demand when spot capacity is not available.
* **ARM64.** Graviton instances and ARM64 Fargate and Lambda are cheaper than x64. See [`Architecture.ARM64`](/api/Architecture#ARM64).
* **Right size.** Pick the smallest instance type, compute type or memory size your jobs need, and use [provider selection](/guide/provider-selection) or labels to send small jobs to small runners.
* **Lambda for short jobs.** Lambda starts quickly and bills per millisecond, which works well for short jobs that fit its limits.

## Examples

These examples use us-east-1 on-demand prices and leave out the free tier. Orchestration comes to about $0.35 per 1,000 jobs, mostly the dozen or so Step Functions state transitions every job takes.

### Example 1: Small team on CodeBuild

A team runs 500 jobs a month on the default [`CodeBuildRunnerProvider`](/api/CodeBuildRunnerProvider) (small compute, $0.005 a minute). Every job takes 10 minutes, including start up.

* Runners: 500 jobs x 10 minutes x $0.005 = $25.00
* Orchestration: 500 jobs x $0.35 / 1,000 = $0.18
* Fixed cost: $1.60 for secrets + $0.52 for SQS polling + about $0.85 for redelivery checks, image rebuilds, ECR and logs = $2.97

Total: about **$28.15** a month.

### Example 2: Busy organization on EC2

An organization runs 4,000 jobs a month on the default [`Ec2RunnerProvider`](/api/Ec2RunnerProvider) (m6i.large at $0.096 an hour with 30 GB of gp3 storage at $0.08 per GB-month). Every job takes 15 minutes, including boot.

* Instances: 4,000 jobs x 0.25 hours x $0.096 = $96.00
* Storage: 4,000 jobs x 0.25 hours x 30 GB x $0.08 / 730 hours = $3.29
* Public IPv4: 4,000 jobs x 0.25 hours x $0.005 = $5.00
* Orchestration: 4,000 jobs x $0.35 / 1,000 = $1.40
* Fixed cost: $1.60 for secrets + $0.52 for SQS polling + $0.09 for redelivery checks + about $0.20 for weekly AMI builds + about $1.50 for the AMI snapshot = $3.91

Total: about **$110** a month. With [`spot`](/api/Ec2RunnerProviderProps#spot), the instance cost usually drops by more than half.

If the same runners are moved to private subnets, the NAT gateway adds $32.85 for the month. If every job downloads 500 MB of Docker images and packages, that's another 2,000 GB x $0.045 = $90.00, almost doubling the bill.

### Example 3: Short jobs on Lambda

A repository runs 10,000 short lint and test jobs a month on the default [`LambdaRunnerProvider`](/api/LambdaRunnerProvider) (2 GB of memory at $0.0000166667 per GB-second). Every job takes 1 minute.

* Runners: 10,000 jobs x 60 seconds x 2 GB x $0.0000166667 = $20.00
* Orchestration: 10,000 jobs x $0.35 / 1,000 = $3.50
* Fixed cost: $1.60 for secrets + $0.52 for SQS polling + about $0.85 for redelivery checks, image rebuilds, ECR and logs = $2.97

Total: about **$26.47** a month.

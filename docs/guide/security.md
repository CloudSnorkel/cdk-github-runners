# Security

## Job Isolation

Every job gets a new runner, but not every provider gives every job its own machine. EC2, CodeBuild, and Fargate run each job on its own instance, build, or task. ECS and Lambda can run different jobs on the same machine, so jobs that can run on the same ECS cluster or Lambda function should be treated as one trust boundary.

* **ECS** runs jobs as containers on a shared cluster of long-lived instances. With [`dockerInDocker`](/api/EcsRunnerProviderProps#dockerInDocker) enabled, which is the default for Linux, runner containers are privileged. A job running in a privileged container can take over the instance. From there it can access other jobs running on the same instance, and leave processes behind that affect jobs that run on it later. If you bring your own [`capacityProvider`](/api/EcsRunnerProviderProps#capacityProvider), its launch template must also require IMDSv2 with a hop limit of 1, or even unprivileged jobs can take the instance role.
* **Lambda** reuses execution environments between jobs. A job can leave processes behind that can access or affect later jobs running on the same function. We do clear up `/tmp` between jobs which is the only writable filesystem available.

To keep jobs of different trust levels apart:

* Don't run untrusted code, like pull requests from forks of public repositories, on an ECS or Lambda provider that also runs jobs with access to secrets.
* Use separate providers for different trust levels. Labels alone don't keep untrusted workflows off a provider, as any workflow can request any label. Use [runner groups](https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/managing-access-to-self-hosted-runners-using-groups) limited to specific repositories or workflows. For ECS, give each provider its own cluster.
* Disable [`dockerInDocker`](/api/EcsRunnerProviderProps#dockerInDocker) on ECS if your jobs don't need Docker.
* If jobs of different trust levels must share a provider, use EC2, CodeBuild, or Fargate. EC2 and CodeBuild also support Docker.

All jobs running on the same provider, regardless of the type, share the provider's IAM role, security groups, network access, and anything granted to [`grantPrincipal`](/api/IRunnerProvider#grantPrincipal), so only grant what every job on the provider may use.

If you are using ECS or Lambda to maximize runner provisioning speed, you could also consider [warm runners](./warm-runners).

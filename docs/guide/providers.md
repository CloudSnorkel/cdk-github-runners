# Providers

A runner provider creates compute resources on-demand and uses [actions/runner](https://github.com/actions/runner) to start a runner.

|                  | EC2               | CodeBuild                  | Fargate        | ECS            | Lambda        | Lambda MicroVM |
|------------------|-------------------|----------------------------|----------------|----------------|---------------|----------------|
| **Time limit**   | Unlimited         | 36 hours (default 1 hour)  | Unlimited      | Unlimited      | 15 minutes    | 8 hours (default 1 hour) |
| **vCPUs**        | Unlimited         | 2, 4, 8, or 72             | 0.25 to 4      | Unlimited      | 1 to 6        | 0.25 to 4      |
| **RAM**          | Unlimited         | 3gb, 7gb, 15gb, or 145gb   | 512mb to 30gb  | Unlimited      | 128mb to 10gb | 512mb to 8gb   |
| **Storage**      | Unlimited         | 50gb to 824gb              | 20gb to 200gb  | Unlimited      | Up to 10gb    | Up to 10gb     |
| **Architecture** | x86_64, ARM64     | x86_64, ARM64              | x86_64, ARM64  | x86_64, ARM64  | x86_64, ARM64 | x86_64, ARM64  |
| **GPU**          | ✔                 | ✔                         | ❌              | ✔              | ❌           | ❌             |
| **sudo**         | ✔                 | ✔                         | ✔              | ✔              | ❌           | ❌              |
| **Docker**       | ✔                 | ✔ (Linux only)            | ❌              | ✔              | ❌           | ❌             |
| **Spot pricing** | ✔                 | ❌                         | ✔              | ✔              | ❌           | ❌             |
| **OS**           | Linux, Windows    | Linux, Windows             | Linux, Windows | Linux, Windows | Linux         | Linux          |

The best provider to use mostly depends on your current infrastructure. When in doubt, CodeBuild is always a good choice. Execution history and logs are easy to view, and it has no restrictive limits unless you need to run for more than 36 hours.

* [EC2](/api/Ec2RunnerProvider) is useful when you want runners to have complete access to the host
* [ECS](/api/EcsRunnerProvider) is useful when you want to control the infrastructure, like leaving the runner host running for faster startups
* [Lambda](/api/LambdaRunnerProvider) is useful for short jobs that can work within time, size and readonly system constraints
* [Lambda MicroVM](/api/MicroVmRunnerProvider) is useful when you want Lambda pricing and start-up time, but a real kernel, a writable disk and more than 15 minutes

Not every provider gives every job its own machine. See [job isolation](./security#job-isolation) before mixing jobs of different trust levels on one provider.

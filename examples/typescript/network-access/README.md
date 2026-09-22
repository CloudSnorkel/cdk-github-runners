# Network Access Example

This example demonstrates how to configure network access for runners using VPCs and security groups.

## What This Example Shows

- How to create a VPC with public and private subnets
- How to allow runners to connect to other resources (e.g., databases) in your VPC
- How to use `connections.allowFrom()` to grant network access from providers to resources

## Important Security Consideration

**Any job/workflow that runs on these runners will have this network access.** When you configure VPC and security groups for a provider, those network access rules apply to all workflows and jobs that execute on runners created by that provider. This means:

- All repositories using these runners will have the same network access
- All workflows, regardless of who created them, will be able to access the same network resources
- Only grant the minimum network access necessary for your use case
- Consider using separate providers with different network configurations for different use cases

## Usage

After deploying, your runners will be able to connect to resources in your VPC based on the security group rules you configure. In this example, runners can connect to a MySQL database on port 3306. **Note that this will allow ALL workflows running on these runners to access the database.**

To connect to an existing resource, import its security group instead of creating a new one:
```typescript
const dbSg = SecurityGroup.fromSecurityGroupId(this, 'DatabaseSecurityGroup', 'sg-1234567890abcdef0');
```

## Setup

1. Deploy the stack: `cdk deploy`
2. Follow the setup instructions in the main [README.md](../../README.md) to configure GitHub integration
3. Use the `fargate` label in your workflows

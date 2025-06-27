# API Reference <a name="API Reference" id="api-reference"></a>

## Constructs <a name="Constructs" id="Constructs"></a>

### AmiBuilder <a name="AmiBuilder" id="@cloudsnorkel/cdk-github-runners.AmiBuilder"></a>

- *Implements:* <a href="#@cloudsnorkel/cdk-github-runners.IRunnerImageBuilder">IRunnerImageBuilder</a>

An AMI builder that uses AWS Image Builder to build AMIs pre-baked with all the GitHub Actions runner requirements.

Builders can be used with {@link Ec2RunnerProvider }.

Each builder re-runs automatically at a set interval to make sure the AMIs contain the latest versions of everything.

You can create an instance of this construct to customize the AMI used to spin-up runners. Some runner providers may require custom components. Check the runner provider documentation.

For example, to set a specific runner version, rebuild the image every 2 weeks, and add a few packages for the EC2 provider, use:

```
const builder = new AmiBuilder(this, 'Builder', {
    runnerVersion: RunnerVersion.specific('2.293.0'),
    rebuildInterval: Duration.days(14),
});
builder.addComponent(new ImageBuilderComponent(scope, id, {
  platform: 'Linux',
  displayName: 'p7zip',
  description: 'Install some more packages',
  commands: [
    'apt-get install p7zip',
  ],
}));
new Ec2RunnerProvider(this, 'EC2 provider', {
    labels: ['custom-ec2'],
    amiBuilder: builder,
});
```

#### Initializers <a name="Initializers" id="@cloudsnorkel/cdk-github-runners.AmiBuilder.Initializer"></a>

```typescript
import { AmiBuilder } from '@cloudsnorkel/cdk-github-runners'

new AmiBuilder(scope: Construct, id: string, props?: AmiBuilderProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.AmiBuilder.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.AmiBuilder.Initializer.parameter.id">id</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.AmiBuilder.Initializer.parameter.props">props</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.AmiBuilderProps">AmiBuilderProps</a></code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.AmiBuilder.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.AmiBuilder.Initializer.parameter.id"></a>

- *Type:* string

---

##### `props`<sup>Optional</sup> <a name="props" id="@cloudsnorkel/cdk-github-runners.AmiBuilder.Initializer.parameter.props"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.AmiBuilderProps">AmiBuilderProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.AmiBuilder.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.AmiBuilder.addComponent">addComponent</a></code> | Add a component to be installed. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.AmiBuilder.addExtraCertificates">addExtraCertificates</a></code> | Add extra trusted certificates. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.AmiBuilder.bindAmi">bindAmi</a></code> | Called by IRunnerProvider to finalize settings and create the AMI builder. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.AmiBuilder.bindDockerImage">bindDockerImage</a></code> | Build and return a Docker image with GitHub Runner installed in it. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.AmiBuilder.prependComponent">prependComponent</a></code> | Add a component to be installed before any other components. |

---

##### ~~`toString`~~ <a name="toString" id="@cloudsnorkel/cdk-github-runners.AmiBuilder.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### ~~`addComponent`~~ <a name="addComponent" id="@cloudsnorkel/cdk-github-runners.AmiBuilder.addComponent"></a>

```typescript
public addComponent(component: ImageBuilderComponent): void
```

Add a component to be installed.

###### `component`<sup>Required</sup> <a name="component" id="@cloudsnorkel/cdk-github-runners.AmiBuilder.addComponent.parameter.component"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.ImageBuilderComponent">ImageBuilderComponent</a>

---

##### ~~`addExtraCertificates`~~ <a name="addExtraCertificates" id="@cloudsnorkel/cdk-github-runners.AmiBuilder.addExtraCertificates"></a>

```typescript
public addExtraCertificates(path: string): void
```

Add extra trusted certificates.

This helps deal with self-signed certificates for GitHub Enterprise Server.

###### `path`<sup>Required</sup> <a name="path" id="@cloudsnorkel/cdk-github-runners.AmiBuilder.addExtraCertificates.parameter.path"></a>

- *Type:* string

path to directory containing a file called certs.pem containing all the required certificates.

---

##### ~~`bindAmi`~~ <a name="bindAmi" id="@cloudsnorkel/cdk-github-runners.AmiBuilder.bindAmi"></a>

```typescript
public bindAmi(): RunnerAmi
```

Called by IRunnerProvider to finalize settings and create the AMI builder.

##### ~~`bindDockerImage`~~ <a name="bindDockerImage" id="@cloudsnorkel/cdk-github-runners.AmiBuilder.bindDockerImage"></a>

```typescript
public bindDockerImage(): RunnerImage
```

Build and return a Docker image with GitHub Runner installed in it.

Anything that ends up with an ECR repository containing a Docker image that runs GitHub self-hosted runners can be used. A simple implementation could even point to an existing image and nothing else.

It's important that the specified image tag be available at the time the repository is available. Providers usually assume the image is ready and will fail if it's not.

The image can be further updated over time manually or using a schedule as long as it is always written to the same tag.

##### ~~`prependComponent`~~ <a name="prependComponent" id="@cloudsnorkel/cdk-github-runners.AmiBuilder.prependComponent"></a>

```typescript
public prependComponent(component: ImageBuilderComponent): void
```

Add a component to be installed before any other components.

Useful for required system settings like certificates or proxy settings.

###### `component`<sup>Required</sup> <a name="component" id="@cloudsnorkel/cdk-github-runners.AmiBuilder.prependComponent.parameter.component"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.ImageBuilderComponent">ImageBuilderComponent</a>

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.AmiBuilder.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |

---

##### ~~`isConstruct`~~ <a name="isConstruct" id="@cloudsnorkel/cdk-github-runners.AmiBuilder.isConstruct"></a>

```typescript
import { AmiBuilder } from '@cloudsnorkel/cdk-github-runners'

AmiBuilder.isConstruct(x: any)
```

Checks if `x` is a construct.

###### `x`<sup>Required</sup> <a name="x" id="@cloudsnorkel/cdk-github-runners.AmiBuilder.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.AmiBuilder.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.AmiBuilder.property.connections">connections</a></code> | <code>aws-cdk-lib.aws_ec2.Connections</code> | The network connections associated with this resource. |

---

##### ~~`node`~~<sup>Required</sup> <a name="node" id="@cloudsnorkel/cdk-github-runners.AmiBuilder.property.node"></a>

- *Deprecated:* use RunnerImageBuilder, e.g. with Ec2RunnerProvider.imageBuilder()

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### ~~`connections`~~<sup>Required</sup> <a name="connections" id="@cloudsnorkel/cdk-github-runners.AmiBuilder.property.connections"></a>

- *Deprecated:* use RunnerImageBuilder, e.g. with Ec2RunnerProvider.imageBuilder()

```typescript
public readonly connections: Connections;
```

- *Type:* aws-cdk-lib.aws_ec2.Connections

The network connections associated with this resource.

---


### CodeBuildImageBuilder <a name="CodeBuildImageBuilder" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder"></a>

- *Implements:* <a href="#@cloudsnorkel/cdk-github-runners.IRunnerImageBuilder">IRunnerImageBuilder</a>

An image builder that uses CodeBuild to build Docker images pre-baked with all the GitHub Actions runner requirements.

Builders can be used with runner providers.

Each builder re-runs automatically at a set interval to make sure the images contain the latest versions of everything.

You can create an instance of this construct to customize the image used to spin-up runners. Each provider has its own requirements for what an image should do. That's why they each provide their own Dockerfile.

For example, to set a specific runner version, rebuild the image every 2 weeks, and add a few packages for the Fargate provider, use:

```
const builder = new CodeBuildImageBuilder(this, 'Builder', {
    dockerfilePath: FargateRunnerProvider.LINUX_X64_DOCKERFILE_PATH,
    runnerVersion: RunnerVersion.specific('2.293.0'),
    rebuildInterval: Duration.days(14),
});
builder.setBuildArg('EXTRA_PACKAGES', 'nginx xz-utils');
new FargateRunnerProvider(this, 'Fargate provider', {
    labels: ['customized-fargate'],
    imageBuilder: builder,
});
```

#### Initializers <a name="Initializers" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.Initializer"></a>

```typescript
import { CodeBuildImageBuilder } from '@cloudsnorkel/cdk-github-runners'

new CodeBuildImageBuilder(scope: Construct, id: string, props: CodeBuildImageBuilderProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.Initializer.parameter.id">id</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.Initializer.parameter.props">props</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilderProps">CodeBuildImageBuilderProps</a></code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.Initializer.parameter.id"></a>

- *Type:* string

---

##### `props`<sup>Required</sup> <a name="props" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.Initializer.parameter.props"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilderProps">CodeBuildImageBuilderProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.addExtraCertificates">addExtraCertificates</a></code> | Add extra trusted certificates. This helps deal with self-signed certificates for GitHub Enterprise Server. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.addFiles">addFiles</a></code> | Uploads a folder to the build server at a given folder name. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.addPolicyStatement">addPolicyStatement</a></code> | Add a policy statement to the builder to access resources required to the image build. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.addPostBuildCommand">addPostBuildCommand</a></code> | Adds a command that runs after `docker build` and `docker push`. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.addPreBuildCommand">addPreBuildCommand</a></code> | Adds a command that runs before `docker build`. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.bindAmi">bindAmi</a></code> | Build and return an AMI with GitHub Runner installed in it. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.bindDockerImage">bindDockerImage</a></code> | Called by IRunnerProvider to finalize settings and create the image builder. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.setBuildArg">setBuildArg</a></code> | Adds a build argument for Docker. |

---

##### ~~`toString`~~ <a name="toString" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### ~~`addExtraCertificates`~~ <a name="addExtraCertificates" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.addExtraCertificates"></a>

```typescript
public addExtraCertificates(path: string): void
```

Add extra trusted certificates. This helps deal with self-signed certificates for GitHub Enterprise Server.

All first party Dockerfiles support this. Others may not.

###### `path`<sup>Required</sup> <a name="path" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.addExtraCertificates.parameter.path"></a>

- *Type:* string

path to directory containing a file called certs.pem containing all the required certificates.

---

##### ~~`addFiles`~~ <a name="addFiles" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.addFiles"></a>

```typescript
public addFiles(sourcePath: string, destName: string): void
```

Uploads a folder to the build server at a given folder name.

###### `sourcePath`<sup>Required</sup> <a name="sourcePath" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.addFiles.parameter.sourcePath"></a>

- *Type:* string

path to source directory.

---

###### `destName`<sup>Required</sup> <a name="destName" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.addFiles.parameter.destName"></a>

- *Type:* string

name of destination folder.

---

##### ~~`addPolicyStatement`~~ <a name="addPolicyStatement" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.addPolicyStatement"></a>

```typescript
public addPolicyStatement(statement: PolicyStatement): void
```

Add a policy statement to the builder to access resources required to the image build.

###### `statement`<sup>Required</sup> <a name="statement" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.addPolicyStatement.parameter.statement"></a>

- *Type:* aws-cdk-lib.aws_iam.PolicyStatement

IAM policy statement.

---

##### ~~`addPostBuildCommand`~~ <a name="addPostBuildCommand" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.addPostBuildCommand"></a>

```typescript
public addPostBuildCommand(command: string): void
```

Adds a command that runs after `docker build` and `docker push`.

###### `command`<sup>Required</sup> <a name="command" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.addPostBuildCommand.parameter.command"></a>

- *Type:* string

command to add.

---

##### ~~`addPreBuildCommand`~~ <a name="addPreBuildCommand" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.addPreBuildCommand"></a>

```typescript
public addPreBuildCommand(command: string): void
```

Adds a command that runs before `docker build`.

###### `command`<sup>Required</sup> <a name="command" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.addPreBuildCommand.parameter.command"></a>

- *Type:* string

command to add.

---

##### ~~`bindAmi`~~ <a name="bindAmi" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.bindAmi"></a>

```typescript
public bindAmi(): RunnerAmi
```

Build and return an AMI with GitHub Runner installed in it.

Anything that ends up with a launch template pointing to an AMI that runs GitHub self-hosted runners can be used. A simple implementation could even point to an existing AMI and nothing else.

The AMI can be further updated over time manually or using a schedule as long as it is always written to the same launch template.

##### ~~`bindDockerImage`~~ <a name="bindDockerImage" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.bindDockerImage"></a>

```typescript
public bindDockerImage(): RunnerImage
```

Called by IRunnerProvider to finalize settings and create the image builder.

##### ~~`setBuildArg`~~ <a name="setBuildArg" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.setBuildArg"></a>

```typescript
public setBuildArg(name: string, value: string): void
```

Adds a build argument for Docker.

See the documentation for the Dockerfile you're using for a list of supported build arguments.

###### `name`<sup>Required</sup> <a name="name" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.setBuildArg.parameter.name"></a>

- *Type:* string

build argument name.

---

###### `value`<sup>Required</sup> <a name="value" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.setBuildArg.parameter.value"></a>

- *Type:* string

build argument value.

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |

---

##### ~~`isConstruct`~~ <a name="isConstruct" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.isConstruct"></a>

```typescript
import { CodeBuildImageBuilder } from '@cloudsnorkel/cdk-github-runners'

CodeBuildImageBuilder.isConstruct(x: any)
```

Checks if `x` is a construct.

###### `x`<sup>Required</sup> <a name="x" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.property.connections">connections</a></code> | <code>aws-cdk-lib.aws_ec2.Connections</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.property.props">props</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilderProps">CodeBuildImageBuilderProps</a></code> | *No description.* |

---

##### ~~`node`~~<sup>Required</sup> <a name="node" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.property.node"></a>

- *Deprecated:* use RunnerImageBuilder

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### ~~`connections`~~<sup>Required</sup> <a name="connections" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.property.connections"></a>

- *Deprecated:* use RunnerImageBuilder

```typescript
public readonly connections: Connections;
```

- *Type:* aws-cdk-lib.aws_ec2.Connections

---

##### ~~`props`~~<sup>Required</sup> <a name="props" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.property.props"></a>

- *Deprecated:* use RunnerImageBuilder

```typescript
public readonly props: CodeBuildImageBuilderProps;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilderProps">CodeBuildImageBuilderProps</a>

---


### CodeBuildRunner <a name="CodeBuildRunner" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner"></a>

#### Initializers <a name="Initializers" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.Initializer"></a>

```typescript
import { CodeBuildRunner } from '@cloudsnorkel/cdk-github-runners'

new CodeBuildRunner(scope: Construct, id: string, props?: CodeBuildRunnerProviderProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunner.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunner.Initializer.parameter.id">id</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunner.Initializer.parameter.props">props</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProviderProps">CodeBuildRunnerProviderProps</a></code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.Initializer.parameter.id"></a>

- *Type:* string

---

##### `props`<sup>Optional</sup> <a name="props" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.Initializer.parameter.props"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProviderProps">CodeBuildRunnerProviderProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunner.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunner.getStepFunctionTask">getStepFunctionTask</a></code> | Generate step function task(s) to start a new runner. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunner.grantStateMachine">grantStateMachine</a></code> | An optional method that modifies the role of the state machine after all the tasks have been generated. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunner.status">status</a></code> | Return status of the runner provider to be used in the main status function. |

---

##### ~~`toString`~~ <a name="toString" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### ~~`getStepFunctionTask`~~ <a name="getStepFunctionTask" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.getStepFunctionTask"></a>

```typescript
public getStepFunctionTask(parameters: RunnerRuntimeParameters): IChainable
```

Generate step function task(s) to start a new runner.

Called by GithubRunners and shouldn't be called manually.

###### `parameters`<sup>Required</sup> <a name="parameters" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.getStepFunctionTask.parameter.parameters"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerRuntimeParameters">RunnerRuntimeParameters</a>

workflow job details.

---

##### ~~`grantStateMachine`~~ <a name="grantStateMachine" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.grantStateMachine"></a>

```typescript
public grantStateMachine(_: IGrantable): void
```

An optional method that modifies the role of the state machine after all the tasks have been generated.

This can be used to add additional policy
statements to the state machine role that are not automatically added by the task returned from {@link getStepFunctionTask}.

###### `_`<sup>Required</sup> <a name="_" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.grantStateMachine.parameter._"></a>

- *Type:* aws-cdk-lib.aws_iam.IGrantable

---

##### ~~`status`~~ <a name="status" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.status"></a>

```typescript
public status(statusFunctionRole: IGrantable): IRunnerProviderStatus
```

Return status of the runner provider to be used in the main status function.

Also gives the status function any needed permissions to query the Docker image or AMI.

###### `statusFunctionRole`<sup>Required</sup> <a name="statusFunctionRole" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.status.parameter.statusFunctionRole"></a>

- *Type:* aws-cdk-lib.aws_iam.IGrantable

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunner.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunner.imageBuilder">imageBuilder</a></code> | Create new image builder that builds CodeBuild specific runner images. |

---

##### ~~`isConstruct`~~ <a name="isConstruct" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.isConstruct"></a>

```typescript
import { CodeBuildRunner } from '@cloudsnorkel/cdk-github-runners'

CodeBuildRunner.isConstruct(x: any)
```

Checks if `x` is a construct.

###### `x`<sup>Required</sup> <a name="x" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

##### ~~`imageBuilder`~~ <a name="imageBuilder" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.imageBuilder"></a>

```typescript
import { CodeBuildRunner } from '@cloudsnorkel/cdk-github-runners'

CodeBuildRunner.imageBuilder(scope: Construct, id: string, props?: RunnerImageBuilderProps)
```

Create new image builder that builds CodeBuild specific runner images.

You can customize the OS, architecture, VPC, subnet, security groups, etc. by passing in props.

You can add components to the image builder by calling `imageBuilder.addComponent()`.

The default OS is Ubuntu running on x64 architecture.

Included components:
 * `RunnerImageComponent.requiredPackages()`
 * `RunnerImageComponent.runnerUser()`
 * `RunnerImageComponent.git()`
 * `RunnerImageComponent.githubCli()`
 * `RunnerImageComponent.awsCli()`
 * `RunnerImageComponent.docker()`
 * `RunnerImageComponent.githubRunner()`

###### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.imageBuilder.parameter.scope"></a>

- *Type:* constructs.Construct

---

###### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.imageBuilder.parameter.id"></a>

- *Type:* string

---

###### `props`<sup>Optional</sup> <a name="props" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.imageBuilder.parameter.props"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps">RunnerImageBuilderProps</a>

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunner.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunner.property.connections">connections</a></code> | <code>aws-cdk-lib.aws_ec2.Connections</code> | The network connections associated with this resource. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunner.property.grantPrincipal">grantPrincipal</a></code> | <code>aws-cdk-lib.aws_iam.IPrincipal</code> | Grant principal used to add permissions to the runner role. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunner.property.image">image</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImage">RunnerImage</a></code> | Docker image loaded with GitHub Actions Runner and its prerequisites. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunner.property.labels">labels</a></code> | <code>string[]</code> | Labels associated with this provider. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunner.property.logGroup">logGroup</a></code> | <code>aws-cdk-lib.aws_logs.ILogGroup</code> | Log group where provided runners will save their logs. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunner.property.project">project</a></code> | <code>aws-cdk-lib.aws_codebuild.Project</code> | CodeBuild project hosting the runner. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunner.property.retryableErrors">retryableErrors</a></code> | <code>string[]</code> | List of step functions errors that should be retried. |

---

##### ~~`node`~~<sup>Required</sup> <a name="node" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.property.node"></a>

- *Deprecated:* use {@link CodeBuildRunnerProvider }

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### ~~`connections`~~<sup>Required</sup> <a name="connections" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.property.connections"></a>

- *Deprecated:* use {@link CodeBuildRunnerProvider }

```typescript
public readonly connections: Connections;
```

- *Type:* aws-cdk-lib.aws_ec2.Connections

The network connections associated with this resource.

---

##### ~~`grantPrincipal`~~<sup>Required</sup> <a name="grantPrincipal" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.property.grantPrincipal"></a>

- *Deprecated:* use {@link CodeBuildRunnerProvider }

```typescript
public readonly grantPrincipal: IPrincipal;
```

- *Type:* aws-cdk-lib.aws_iam.IPrincipal

Grant principal used to add permissions to the runner role.

---

##### ~~`image`~~<sup>Required</sup> <a name="image" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.property.image"></a>

- *Deprecated:* use {@link CodeBuildRunnerProvider }

```typescript
public readonly image: RunnerImage;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerImage">RunnerImage</a>

Docker image loaded with GitHub Actions Runner and its prerequisites.

The image is built by an image builder and is specific to CodeBuild.

---

##### ~~`labels`~~<sup>Required</sup> <a name="labels" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.property.labels"></a>

- *Deprecated:* use {@link CodeBuildRunnerProvider }

```typescript
public readonly labels: string[];
```

- *Type:* string[]

Labels associated with this provider.

---

##### ~~`logGroup`~~<sup>Required</sup> <a name="logGroup" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.property.logGroup"></a>

- *Deprecated:* use {@link CodeBuildRunnerProvider }

```typescript
public readonly logGroup: ILogGroup;
```

- *Type:* aws-cdk-lib.aws_logs.ILogGroup

Log group where provided runners will save their logs.

Note that this is not the job log, but the runner itself. It will not contain output from the GitHub Action but only metadata on its execution.

---

##### ~~`project`~~<sup>Required</sup> <a name="project" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.property.project"></a>

- *Deprecated:* use {@link CodeBuildRunnerProvider }

```typescript
public readonly project: Project;
```

- *Type:* aws-cdk-lib.aws_codebuild.Project

CodeBuild project hosting the runner.

---

##### ~~`retryableErrors`~~<sup>Required</sup> <a name="retryableErrors" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.property.retryableErrors"></a>

- *Deprecated:* use {@link CodeBuildRunnerProvider }

```typescript
public readonly retryableErrors: string[];
```

- *Type:* string[]

List of step functions errors that should be retried.

---

#### Constants <a name="Constants" id="Constants"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunner.property.LINUX_ARM64_DOCKERFILE_PATH">LINUX_ARM64_DOCKERFILE_PATH</a></code> | <code>string</code> | Path to Dockerfile for Linux ARM64 with all the requirements for CodeBuild runner. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunner.property.LINUX_X64_DOCKERFILE_PATH">LINUX_X64_DOCKERFILE_PATH</a></code> | <code>string</code> | Path to Dockerfile for Linux x64 with all the requirements for CodeBuild runner. |

---

##### ~~`LINUX_ARM64_DOCKERFILE_PATH`~~<sup>Required</sup> <a name="LINUX_ARM64_DOCKERFILE_PATH" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.property.LINUX_ARM64_DOCKERFILE_PATH"></a>

- *Deprecated:* Use `imageBuilder()` instead.

```typescript
public readonly LINUX_ARM64_DOCKERFILE_PATH: string;
```

- *Type:* string

Path to Dockerfile for Linux ARM64 with all the requirements for CodeBuild runner.

Use this Dockerfile unless you need to customize it further than allowed by hooks.

Available build arguments that can be set in the image builder:
* `BASE_IMAGE` sets the `FROM` line. This should be an Ubuntu compatible image.
* `EXTRA_PACKAGES` can be used to install additional packages.
* `DOCKER_CHANNEL` overrides the channel from which Docker will be downloaded. Defaults to `"stable"`.
* `DIND_COMMIT` overrides the commit where dind is found.
* `DOCKER_VERSION` overrides the installed Docker version.
* `DOCKER_COMPOSE_VERSION` overrides the installed docker-compose version.

---

##### ~~`LINUX_X64_DOCKERFILE_PATH`~~<sup>Required</sup> <a name="LINUX_X64_DOCKERFILE_PATH" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.property.LINUX_X64_DOCKERFILE_PATH"></a>

- *Deprecated:* Use `imageBuilder()` instead.

```typescript
public readonly LINUX_X64_DOCKERFILE_PATH: string;
```

- *Type:* string

Path to Dockerfile for Linux x64 with all the requirements for CodeBuild runner.

Use this Dockerfile unless you need to customize it further than allowed by hooks.

Available build arguments that can be set in the image builder:
* `BASE_IMAGE` sets the `FROM` line. This should be an Ubuntu compatible image.
* `EXTRA_PACKAGES` can be used to install additional packages.
* `DOCKER_CHANNEL` overrides the channel from which Docker will be downloaded. Defaults to `"stable"`.
* `DIND_COMMIT` overrides the commit where dind is found.
* `DOCKER_VERSION` overrides the installed Docker version.
* `DOCKER_COMPOSE_VERSION` overrides the installed docker-compose version.

---

### CodeBuildRunnerProvider <a name="CodeBuildRunnerProvider" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider"></a>

- *Implements:* <a href="#@cloudsnorkel/cdk-github-runners.IRunnerProvider">IRunnerProvider</a>

GitHub Actions runner provider using CodeBuild to execute jobs.

Creates a project that gets started for each job.

This construct is not meant to be used by itself. It should be passed in the providers property for GitHubRunners.

#### Initializers <a name="Initializers" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.Initializer"></a>

```typescript
import { CodeBuildRunnerProvider } from '@cloudsnorkel/cdk-github-runners'

new CodeBuildRunnerProvider(scope: Construct, id: string, props?: CodeBuildRunnerProviderProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.Initializer.parameter.id">id</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.Initializer.parameter.props">props</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProviderProps">CodeBuildRunnerProviderProps</a></code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.Initializer.parameter.id"></a>

- *Type:* string

---

##### `props`<sup>Optional</sup> <a name="props" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.Initializer.parameter.props"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProviderProps">CodeBuildRunnerProviderProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.getStepFunctionTask">getStepFunctionTask</a></code> | Generate step function task(s) to start a new runner. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.grantStateMachine">grantStateMachine</a></code> | An optional method that modifies the role of the state machine after all the tasks have been generated. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.status">status</a></code> | Return status of the runner provider to be used in the main status function. |

---

##### `toString` <a name="toString" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### `getStepFunctionTask` <a name="getStepFunctionTask" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.getStepFunctionTask"></a>

```typescript
public getStepFunctionTask(parameters: RunnerRuntimeParameters): IChainable
```

Generate step function task(s) to start a new runner.

Called by GithubRunners and shouldn't be called manually.

###### `parameters`<sup>Required</sup> <a name="parameters" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.getStepFunctionTask.parameter.parameters"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerRuntimeParameters">RunnerRuntimeParameters</a>

workflow job details.

---

##### `grantStateMachine` <a name="grantStateMachine" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.grantStateMachine"></a>

```typescript
public grantStateMachine(_: IGrantable): void
```

An optional method that modifies the role of the state machine after all the tasks have been generated.

This can be used to add additional policy
statements to the state machine role that are not automatically added by the task returned from {@link getStepFunctionTask}.

###### `_`<sup>Required</sup> <a name="_" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.grantStateMachine.parameter._"></a>

- *Type:* aws-cdk-lib.aws_iam.IGrantable

---

##### `status` <a name="status" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.status"></a>

```typescript
public status(statusFunctionRole: IGrantable): IRunnerProviderStatus
```

Return status of the runner provider to be used in the main status function.

Also gives the status function any needed permissions to query the Docker image or AMI.

###### `statusFunctionRole`<sup>Required</sup> <a name="statusFunctionRole" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.status.parameter.statusFunctionRole"></a>

- *Type:* aws-cdk-lib.aws_iam.IGrantable

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.imageBuilder">imageBuilder</a></code> | Create new image builder that builds CodeBuild specific runner images. |

---

##### ~~`isConstruct`~~ <a name="isConstruct" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.isConstruct"></a>

```typescript
import { CodeBuildRunnerProvider } from '@cloudsnorkel/cdk-github-runners'

CodeBuildRunnerProvider.isConstruct(x: any)
```

Checks if `x` is a construct.

###### `x`<sup>Required</sup> <a name="x" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

##### `imageBuilder` <a name="imageBuilder" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.imageBuilder"></a>

```typescript
import { CodeBuildRunnerProvider } from '@cloudsnorkel/cdk-github-runners'

CodeBuildRunnerProvider.imageBuilder(scope: Construct, id: string, props?: RunnerImageBuilderProps)
```

Create new image builder that builds CodeBuild specific runner images.

You can customize the OS, architecture, VPC, subnet, security groups, etc. by passing in props.

You can add components to the image builder by calling `imageBuilder.addComponent()`.

The default OS is Ubuntu running on x64 architecture.

Included components:
 * `RunnerImageComponent.requiredPackages()`
 * `RunnerImageComponent.runnerUser()`
 * `RunnerImageComponent.git()`
 * `RunnerImageComponent.githubCli()`
 * `RunnerImageComponent.awsCli()`
 * `RunnerImageComponent.docker()`
 * `RunnerImageComponent.githubRunner()`

###### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.imageBuilder.parameter.scope"></a>

- *Type:* constructs.Construct

---

###### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.imageBuilder.parameter.id"></a>

- *Type:* string

---

###### `props`<sup>Optional</sup> <a name="props" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.imageBuilder.parameter.props"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps">RunnerImageBuilderProps</a>

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.property.connections">connections</a></code> | <code>aws-cdk-lib.aws_ec2.Connections</code> | The network connections associated with this resource. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.property.grantPrincipal">grantPrincipal</a></code> | <code>aws-cdk-lib.aws_iam.IPrincipal</code> | Grant principal used to add permissions to the runner role. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.property.image">image</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImage">RunnerImage</a></code> | Docker image loaded with GitHub Actions Runner and its prerequisites. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.property.labels">labels</a></code> | <code>string[]</code> | Labels associated with this provider. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.property.logGroup">logGroup</a></code> | <code>aws-cdk-lib.aws_logs.ILogGroup</code> | Log group where provided runners will save their logs. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.property.project">project</a></code> | <code>aws-cdk-lib.aws_codebuild.Project</code> | CodeBuild project hosting the runner. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.property.retryableErrors">retryableErrors</a></code> | <code>string[]</code> | List of step functions errors that should be retried. |

---

##### `node`<sup>Required</sup> <a name="node" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `connections`<sup>Required</sup> <a name="connections" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.property.connections"></a>

```typescript
public readonly connections: Connections;
```

- *Type:* aws-cdk-lib.aws_ec2.Connections

The network connections associated with this resource.

---

##### `grantPrincipal`<sup>Required</sup> <a name="grantPrincipal" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.property.grantPrincipal"></a>

```typescript
public readonly grantPrincipal: IPrincipal;
```

- *Type:* aws-cdk-lib.aws_iam.IPrincipal

Grant principal used to add permissions to the runner role.

---

##### `image`<sup>Required</sup> <a name="image" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.property.image"></a>

```typescript
public readonly image: RunnerImage;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerImage">RunnerImage</a>

Docker image loaded with GitHub Actions Runner and its prerequisites.

The image is built by an image builder and is specific to CodeBuild.

---

##### `labels`<sup>Required</sup> <a name="labels" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.property.labels"></a>

```typescript
public readonly labels: string[];
```

- *Type:* string[]

Labels associated with this provider.

---

##### `logGroup`<sup>Required</sup> <a name="logGroup" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.property.logGroup"></a>

```typescript
public readonly logGroup: ILogGroup;
```

- *Type:* aws-cdk-lib.aws_logs.ILogGroup

Log group where provided runners will save their logs.

Note that this is not the job log, but the runner itself. It will not contain output from the GitHub Action but only metadata on its execution.

---

##### `project`<sup>Required</sup> <a name="project" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.property.project"></a>

```typescript
public readonly project: Project;
```

- *Type:* aws-cdk-lib.aws_codebuild.Project

CodeBuild project hosting the runner.

---

##### `retryableErrors`<sup>Required</sup> <a name="retryableErrors" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.property.retryableErrors"></a>

```typescript
public readonly retryableErrors: string[];
```

- *Type:* string[]

List of step functions errors that should be retried.

---

#### Constants <a name="Constants" id="Constants"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.property.LINUX_ARM64_DOCKERFILE_PATH">LINUX_ARM64_DOCKERFILE_PATH</a></code> | <code>string</code> | Path to Dockerfile for Linux ARM64 with all the requirements for CodeBuild runner. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.property.LINUX_X64_DOCKERFILE_PATH">LINUX_X64_DOCKERFILE_PATH</a></code> | <code>string</code> | Path to Dockerfile for Linux x64 with all the requirements for CodeBuild runner. |

---

##### ~~`LINUX_ARM64_DOCKERFILE_PATH`~~<sup>Required</sup> <a name="LINUX_ARM64_DOCKERFILE_PATH" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.property.LINUX_ARM64_DOCKERFILE_PATH"></a>

- *Deprecated:* Use `imageBuilder()` instead.

```typescript
public readonly LINUX_ARM64_DOCKERFILE_PATH: string;
```

- *Type:* string

Path to Dockerfile for Linux ARM64 with all the requirements for CodeBuild runner.

Use this Dockerfile unless you need to customize it further than allowed by hooks.

Available build arguments that can be set in the image builder:
* `BASE_IMAGE` sets the `FROM` line. This should be an Ubuntu compatible image.
* `EXTRA_PACKAGES` can be used to install additional packages.
* `DOCKER_CHANNEL` overrides the channel from which Docker will be downloaded. Defaults to `"stable"`.
* `DIND_COMMIT` overrides the commit where dind is found.
* `DOCKER_VERSION` overrides the installed Docker version.
* `DOCKER_COMPOSE_VERSION` overrides the installed docker-compose version.

---

##### ~~`LINUX_X64_DOCKERFILE_PATH`~~<sup>Required</sup> <a name="LINUX_X64_DOCKERFILE_PATH" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider.property.LINUX_X64_DOCKERFILE_PATH"></a>

- *Deprecated:* Use `imageBuilder()` instead.

```typescript
public readonly LINUX_X64_DOCKERFILE_PATH: string;
```

- *Type:* string

Path to Dockerfile for Linux x64 with all the requirements for CodeBuild runner.

Use this Dockerfile unless you need to customize it further than allowed by hooks.

Available build arguments that can be set in the image builder:
* `BASE_IMAGE` sets the `FROM` line. This should be an Ubuntu compatible image.
* `EXTRA_PACKAGES` can be used to install additional packages.
* `DOCKER_CHANNEL` overrides the channel from which Docker will be downloaded. Defaults to `"stable"`.
* `DIND_COMMIT` overrides the commit where dind is found.
* `DOCKER_VERSION` overrides the installed Docker version.
* `DOCKER_COMPOSE_VERSION` overrides the installed docker-compose version.

---

### ContainerImageBuilder <a name="ContainerImageBuilder" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilder"></a>

- *Implements:* <a href="#@cloudsnorkel/cdk-github-runners.IRunnerImageBuilder">IRunnerImageBuilder</a>

An image builder that uses AWS Image Builder to build Docker images pre-baked with all the GitHub Actions runner requirements.

Builders can be used with runner providers.

The CodeBuild builder is better and faster. Only use this one if you have no choice. For example, if you need Windows containers.

Each builder re-runs automatically at a set interval to make sure the images contain the latest versions of everything.

You can create an instance of this construct to customize the image used to spin-up runners. Some runner providers may require custom components. Check the runner provider documentation. The default components work with CodeBuild and Fargate.

For example, to set a specific runner version, rebuild the image every 2 weeks, and add a few packages for the Fargate provider, use:

```
const builder = new ContainerImageBuilder(this, 'Builder', {
    runnerVersion: RunnerVersion.specific('2.293.0'),
    rebuildInterval: Duration.days(14),
});
new CodeBuildRunnerProvider(this, 'CodeBuild provider', {
    labels: ['custom-codebuild'],
    imageBuilder: builder,
});
```

#### Initializers <a name="Initializers" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.Initializer"></a>

```typescript
import { ContainerImageBuilder } from '@cloudsnorkel/cdk-github-runners'

new ContainerImageBuilder(scope: Construct, id: string, props?: ContainerImageBuilderProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.Initializer.parameter.id">id</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.Initializer.parameter.props">props</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.ContainerImageBuilderProps">ContainerImageBuilderProps</a></code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.Initializer.parameter.id"></a>

- *Type:* string

---

##### `props`<sup>Optional</sup> <a name="props" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.Initializer.parameter.props"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.ContainerImageBuilderProps">ContainerImageBuilderProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.addComponent">addComponent</a></code> | Add a component to be installed. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.addExtraCertificates">addExtraCertificates</a></code> | Add extra trusted certificates. This helps deal with self-signed certificates for GitHub Enterprise Server. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.bindAmi">bindAmi</a></code> | Build and return an AMI with GitHub Runner installed in it. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.bindDockerImage">bindDockerImage</a></code> | Called by IRunnerProvider to finalize settings and create the image builder. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.prependComponent">prependComponent</a></code> | Add a component to be installed before any other components. |

---

##### ~~`toString`~~ <a name="toString" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### ~~`addComponent`~~ <a name="addComponent" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.addComponent"></a>

```typescript
public addComponent(component: ImageBuilderComponent): void
```

Add a component to be installed.

###### `component`<sup>Required</sup> <a name="component" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.addComponent.parameter.component"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.ImageBuilderComponent">ImageBuilderComponent</a>

---

##### ~~`addExtraCertificates`~~ <a name="addExtraCertificates" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.addExtraCertificates"></a>

```typescript
public addExtraCertificates(path: string): void
```

Add extra trusted certificates. This helps deal with self-signed certificates for GitHub Enterprise Server.

All first party Dockerfiles support this. Others may not.

###### `path`<sup>Required</sup> <a name="path" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.addExtraCertificates.parameter.path"></a>

- *Type:* string

path to directory containing a file called certs.pem containing all the required certificates.

---

##### ~~`bindAmi`~~ <a name="bindAmi" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.bindAmi"></a>

```typescript
public bindAmi(): RunnerAmi
```

Build and return an AMI with GitHub Runner installed in it.

Anything that ends up with a launch template pointing to an AMI that runs GitHub self-hosted runners can be used. A simple implementation could even point to an existing AMI and nothing else.

The AMI can be further updated over time manually or using a schedule as long as it is always written to the same launch template.

##### ~~`bindDockerImage`~~ <a name="bindDockerImage" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.bindDockerImage"></a>

```typescript
public bindDockerImage(): RunnerImage
```

Called by IRunnerProvider to finalize settings and create the image builder.

##### ~~`prependComponent`~~ <a name="prependComponent" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.prependComponent"></a>

```typescript
public prependComponent(component: ImageBuilderComponent): void
```

Add a component to be installed before any other components.

Useful for required system settings like certificates or proxy settings.

###### `component`<sup>Required</sup> <a name="component" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.prependComponent.parameter.component"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.ImageBuilderComponent">ImageBuilderComponent</a>

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |

---

##### ~~`isConstruct`~~ <a name="isConstruct" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.isConstruct"></a>

```typescript
import { ContainerImageBuilder } from '@cloudsnorkel/cdk-github-runners'

ContainerImageBuilder.isConstruct(x: any)
```

Checks if `x` is a construct.

###### `x`<sup>Required</sup> <a name="x" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.property.connections">connections</a></code> | <code>aws-cdk-lib.aws_ec2.Connections</code> | The network connections associated with this resource. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.property.repository">repository</a></code> | <code>aws-cdk-lib.aws_ecr.IRepository</code> | *No description.* |

---

##### ~~`node`~~<sup>Required</sup> <a name="node" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.property.node"></a>

- *Deprecated:* use RunnerImageBuilder

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### ~~`connections`~~<sup>Required</sup> <a name="connections" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.property.connections"></a>

- *Deprecated:* use RunnerImageBuilder

```typescript
public readonly connections: Connections;
```

- *Type:* aws-cdk-lib.aws_ec2.Connections

The network connections associated with this resource.

---

##### ~~`repository`~~<sup>Required</sup> <a name="repository" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.property.repository"></a>

- *Deprecated:* use RunnerImageBuilder

```typescript
public readonly repository: IRepository;
```

- *Type:* aws-cdk-lib.aws_ecr.IRepository

---


### Ec2Runner <a name="Ec2Runner" id="@cloudsnorkel/cdk-github-runners.Ec2Runner"></a>

#### Initializers <a name="Initializers" id="@cloudsnorkel/cdk-github-runners.Ec2Runner.Initializer"></a>

```typescript
import { Ec2Runner } from '@cloudsnorkel/cdk-github-runners'

new Ec2Runner(scope: Construct, id: string, props?: Ec2RunnerProviderProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2Runner.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2Runner.Initializer.parameter.id">id</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2Runner.Initializer.parameter.props">props</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProviderProps">Ec2RunnerProviderProps</a></code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.Ec2Runner.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.Ec2Runner.Initializer.parameter.id"></a>

- *Type:* string

---

##### `props`<sup>Optional</sup> <a name="props" id="@cloudsnorkel/cdk-github-runners.Ec2Runner.Initializer.parameter.props"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProviderProps">Ec2RunnerProviderProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2Runner.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2Runner.getStepFunctionTask">getStepFunctionTask</a></code> | Generate step function task(s) to start a new runner. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2Runner.grantStateMachine">grantStateMachine</a></code> | An optional method that modifies the role of the state machine after all the tasks have been generated. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2Runner.status">status</a></code> | Return status of the runner provider to be used in the main status function. |

---

##### ~~`toString`~~ <a name="toString" id="@cloudsnorkel/cdk-github-runners.Ec2Runner.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### ~~`getStepFunctionTask`~~ <a name="getStepFunctionTask" id="@cloudsnorkel/cdk-github-runners.Ec2Runner.getStepFunctionTask"></a>

```typescript
public getStepFunctionTask(parameters: RunnerRuntimeParameters): IChainable
```

Generate step function task(s) to start a new runner.

Called by GithubRunners and shouldn't be called manually.

###### `parameters`<sup>Required</sup> <a name="parameters" id="@cloudsnorkel/cdk-github-runners.Ec2Runner.getStepFunctionTask.parameter.parameters"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerRuntimeParameters">RunnerRuntimeParameters</a>

workflow job details.

---

##### ~~`grantStateMachine`~~ <a name="grantStateMachine" id="@cloudsnorkel/cdk-github-runners.Ec2Runner.grantStateMachine"></a>

```typescript
public grantStateMachine(stateMachineRole: IGrantable): void
```

An optional method that modifies the role of the state machine after all the tasks have been generated.

This can be used to add additional policy
statements to the state machine role that are not automatically added by the task returned from {@link getStepFunctionTask}.

###### `stateMachineRole`<sup>Required</sup> <a name="stateMachineRole" id="@cloudsnorkel/cdk-github-runners.Ec2Runner.grantStateMachine.parameter.stateMachineRole"></a>

- *Type:* aws-cdk-lib.aws_iam.IGrantable

---

##### ~~`status`~~ <a name="status" id="@cloudsnorkel/cdk-github-runners.Ec2Runner.status"></a>

```typescript
public status(statusFunctionRole: IGrantable): IRunnerProviderStatus
```

Return status of the runner provider to be used in the main status function.

Also gives the status function any needed permissions to query the Docker image or AMI.

###### `statusFunctionRole`<sup>Required</sup> <a name="statusFunctionRole" id="@cloudsnorkel/cdk-github-runners.Ec2Runner.status.parameter.statusFunctionRole"></a>

- *Type:* aws-cdk-lib.aws_iam.IGrantable

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2Runner.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2Runner.imageBuilder">imageBuilder</a></code> | Create new image builder that builds EC2 specific runner images. |

---

##### ~~`isConstruct`~~ <a name="isConstruct" id="@cloudsnorkel/cdk-github-runners.Ec2Runner.isConstruct"></a>

```typescript
import { Ec2Runner } from '@cloudsnorkel/cdk-github-runners'

Ec2Runner.isConstruct(x: any)
```

Checks if `x` is a construct.

###### `x`<sup>Required</sup> <a name="x" id="@cloudsnorkel/cdk-github-runners.Ec2Runner.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

##### ~~`imageBuilder`~~ <a name="imageBuilder" id="@cloudsnorkel/cdk-github-runners.Ec2Runner.imageBuilder"></a>

```typescript
import { Ec2Runner } from '@cloudsnorkel/cdk-github-runners'

Ec2Runner.imageBuilder(scope: Construct, id: string, props?: RunnerImageBuilderProps)
```

Create new image builder that builds EC2 specific runner images.

You can customize the OS, architecture, VPC, subnet, security groups, etc. by passing in props.

You can add components to the image builder by calling `imageBuilder.addComponent()`.

The default OS is Ubuntu running on x64 architecture.

Included components:
 * `RunnerImageComponent.requiredPackages()`
 * `RunnerImageComponent.runnerUser()`
 * `RunnerImageComponent.git()`
 * `RunnerImageComponent.githubCli()`
 * `RunnerImageComponent.awsCli()`
 * `RunnerImageComponent.docker()`
 * `RunnerImageComponent.githubRunner()`

###### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.Ec2Runner.imageBuilder.parameter.scope"></a>

- *Type:* constructs.Construct

---

###### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.Ec2Runner.imageBuilder.parameter.id"></a>

- *Type:* string

---

###### `props`<sup>Optional</sup> <a name="props" id="@cloudsnorkel/cdk-github-runners.Ec2Runner.imageBuilder.parameter.props"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps">RunnerImageBuilderProps</a>

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2Runner.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2Runner.property.connections">connections</a></code> | <code>aws-cdk-lib.aws_ec2.Connections</code> | The network connections associated with this resource. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2Runner.property.grantPrincipal">grantPrincipal</a></code> | <code>aws-cdk-lib.aws_iam.IPrincipal</code> | Grant principal used to add permissions to the runner role. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2Runner.property.labels">labels</a></code> | <code>string[]</code> | Labels associated with this provider. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2Runner.property.logGroup">logGroup</a></code> | <code>aws-cdk-lib.aws_logs.ILogGroup</code> | Log group where provided runners will save their logs. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2Runner.property.retryableErrors">retryableErrors</a></code> | <code>string[]</code> | List of step functions errors that should be retried. |

---

##### ~~`node`~~<sup>Required</sup> <a name="node" id="@cloudsnorkel/cdk-github-runners.Ec2Runner.property.node"></a>

- *Deprecated:* use {@link Ec2RunnerProvider }

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### ~~`connections`~~<sup>Required</sup> <a name="connections" id="@cloudsnorkel/cdk-github-runners.Ec2Runner.property.connections"></a>

- *Deprecated:* use {@link Ec2RunnerProvider }

```typescript
public readonly connections: Connections;
```

- *Type:* aws-cdk-lib.aws_ec2.Connections

The network connections associated with this resource.

---

##### ~~`grantPrincipal`~~<sup>Required</sup> <a name="grantPrincipal" id="@cloudsnorkel/cdk-github-runners.Ec2Runner.property.grantPrincipal"></a>

- *Deprecated:* use {@link Ec2RunnerProvider }

```typescript
public readonly grantPrincipal: IPrincipal;
```

- *Type:* aws-cdk-lib.aws_iam.IPrincipal

Grant principal used to add permissions to the runner role.

---

##### ~~`labels`~~<sup>Required</sup> <a name="labels" id="@cloudsnorkel/cdk-github-runners.Ec2Runner.property.labels"></a>

- *Deprecated:* use {@link Ec2RunnerProvider }

```typescript
public readonly labels: string[];
```

- *Type:* string[]

Labels associated with this provider.

---

##### ~~`logGroup`~~<sup>Required</sup> <a name="logGroup" id="@cloudsnorkel/cdk-github-runners.Ec2Runner.property.logGroup"></a>

- *Deprecated:* use {@link Ec2RunnerProvider }

```typescript
public readonly logGroup: ILogGroup;
```

- *Type:* aws-cdk-lib.aws_logs.ILogGroup

Log group where provided runners will save their logs.

Note that this is not the job log, but the runner itself. It will not contain output from the GitHub Action but only metadata on its execution.

---

##### ~~`retryableErrors`~~<sup>Required</sup> <a name="retryableErrors" id="@cloudsnorkel/cdk-github-runners.Ec2Runner.property.retryableErrors"></a>

- *Deprecated:* use {@link Ec2RunnerProvider }

```typescript
public readonly retryableErrors: string[];
```

- *Type:* string[]

List of step functions errors that should be retried.

---


### Ec2RunnerProvider <a name="Ec2RunnerProvider" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider"></a>

- *Implements:* <a href="#@cloudsnorkel/cdk-github-runners.IRunnerProvider">IRunnerProvider</a>

GitHub Actions runner provider using EC2 to execute jobs.

This construct is not meant to be used by itself. It should be passed in the providers property for GitHubRunners.

#### Initializers <a name="Initializers" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider.Initializer"></a>

```typescript
import { Ec2RunnerProvider } from '@cloudsnorkel/cdk-github-runners'

new Ec2RunnerProvider(scope: Construct, id: string, props?: Ec2RunnerProviderProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider.Initializer.parameter.id">id</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider.Initializer.parameter.props">props</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProviderProps">Ec2RunnerProviderProps</a></code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider.Initializer.parameter.id"></a>

- *Type:* string

---

##### `props`<sup>Optional</sup> <a name="props" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider.Initializer.parameter.props"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProviderProps">Ec2RunnerProviderProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider.getStepFunctionTask">getStepFunctionTask</a></code> | Generate step function task(s) to start a new runner. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider.grantStateMachine">grantStateMachine</a></code> | An optional method that modifies the role of the state machine after all the tasks have been generated. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider.status">status</a></code> | Return status of the runner provider to be used in the main status function. |

---

##### `toString` <a name="toString" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### `getStepFunctionTask` <a name="getStepFunctionTask" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider.getStepFunctionTask"></a>

```typescript
public getStepFunctionTask(parameters: RunnerRuntimeParameters): IChainable
```

Generate step function task(s) to start a new runner.

Called by GithubRunners and shouldn't be called manually.

###### `parameters`<sup>Required</sup> <a name="parameters" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider.getStepFunctionTask.parameter.parameters"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerRuntimeParameters">RunnerRuntimeParameters</a>

workflow job details.

---

##### `grantStateMachine` <a name="grantStateMachine" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider.grantStateMachine"></a>

```typescript
public grantStateMachine(stateMachineRole: IGrantable): void
```

An optional method that modifies the role of the state machine after all the tasks have been generated.

This can be used to add additional policy
statements to the state machine role that are not automatically added by the task returned from {@link getStepFunctionTask}.

###### `stateMachineRole`<sup>Required</sup> <a name="stateMachineRole" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider.grantStateMachine.parameter.stateMachineRole"></a>

- *Type:* aws-cdk-lib.aws_iam.IGrantable

---

##### `status` <a name="status" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider.status"></a>

```typescript
public status(statusFunctionRole: IGrantable): IRunnerProviderStatus
```

Return status of the runner provider to be used in the main status function.

Also gives the status function any needed permissions to query the Docker image or AMI.

###### `statusFunctionRole`<sup>Required</sup> <a name="statusFunctionRole" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider.status.parameter.statusFunctionRole"></a>

- *Type:* aws-cdk-lib.aws_iam.IGrantable

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider.imageBuilder">imageBuilder</a></code> | Create new image builder that builds EC2 specific runner images. |

---

##### ~~`isConstruct`~~ <a name="isConstruct" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider.isConstruct"></a>

```typescript
import { Ec2RunnerProvider } from '@cloudsnorkel/cdk-github-runners'

Ec2RunnerProvider.isConstruct(x: any)
```

Checks if `x` is a construct.

###### `x`<sup>Required</sup> <a name="x" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

##### `imageBuilder` <a name="imageBuilder" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider.imageBuilder"></a>

```typescript
import { Ec2RunnerProvider } from '@cloudsnorkel/cdk-github-runners'

Ec2RunnerProvider.imageBuilder(scope: Construct, id: string, props?: RunnerImageBuilderProps)
```

Create new image builder that builds EC2 specific runner images.

You can customize the OS, architecture, VPC, subnet, security groups, etc. by passing in props.

You can add components to the image builder by calling `imageBuilder.addComponent()`.

The default OS is Ubuntu running on x64 architecture.

Included components:
 * `RunnerImageComponent.requiredPackages()`
 * `RunnerImageComponent.runnerUser()`
 * `RunnerImageComponent.git()`
 * `RunnerImageComponent.githubCli()`
 * `RunnerImageComponent.awsCli()`
 * `RunnerImageComponent.docker()`
 * `RunnerImageComponent.githubRunner()`

###### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider.imageBuilder.parameter.scope"></a>

- *Type:* constructs.Construct

---

###### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider.imageBuilder.parameter.id"></a>

- *Type:* string

---

###### `props`<sup>Optional</sup> <a name="props" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider.imageBuilder.parameter.props"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps">RunnerImageBuilderProps</a>

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider.property.connections">connections</a></code> | <code>aws-cdk-lib.aws_ec2.Connections</code> | The network connections associated with this resource. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider.property.grantPrincipal">grantPrincipal</a></code> | <code>aws-cdk-lib.aws_iam.IPrincipal</code> | Grant principal used to add permissions to the runner role. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider.property.labels">labels</a></code> | <code>string[]</code> | Labels associated with this provider. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider.property.logGroup">logGroup</a></code> | <code>aws-cdk-lib.aws_logs.ILogGroup</code> | Log group where provided runners will save their logs. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider.property.retryableErrors">retryableErrors</a></code> | <code>string[]</code> | List of step functions errors that should be retried. |

---

##### `node`<sup>Required</sup> <a name="node" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `connections`<sup>Required</sup> <a name="connections" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider.property.connections"></a>

```typescript
public readonly connections: Connections;
```

- *Type:* aws-cdk-lib.aws_ec2.Connections

The network connections associated with this resource.

---

##### `grantPrincipal`<sup>Required</sup> <a name="grantPrincipal" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider.property.grantPrincipal"></a>

```typescript
public readonly grantPrincipal: IPrincipal;
```

- *Type:* aws-cdk-lib.aws_iam.IPrincipal

Grant principal used to add permissions to the runner role.

---

##### `labels`<sup>Required</sup> <a name="labels" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider.property.labels"></a>

```typescript
public readonly labels: string[];
```

- *Type:* string[]

Labels associated with this provider.

---

##### `logGroup`<sup>Required</sup> <a name="logGroup" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider.property.logGroup"></a>

```typescript
public readonly logGroup: ILogGroup;
```

- *Type:* aws-cdk-lib.aws_logs.ILogGroup

Log group where provided runners will save their logs.

Note that this is not the job log, but the runner itself. It will not contain output from the GitHub Action but only metadata on its execution.

---

##### `retryableErrors`<sup>Required</sup> <a name="retryableErrors" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider.property.retryableErrors"></a>

```typescript
public readonly retryableErrors: string[];
```

- *Type:* string[]

List of step functions errors that should be retried.

---


### EcsRunnerProvider <a name="EcsRunnerProvider" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProvider"></a>

- *Implements:* <a href="#@cloudsnorkel/cdk-github-runners.IRunnerProvider">IRunnerProvider</a>

GitHub Actions runner provider using ECS on EC2 to execute jobs.

ECS can be useful when you want more control of the infrastructure running the GitHub Actions Docker containers. You can control the autoscaling
group to scale down to zero during the night and scale up during work hours. This way you can still save money, but have to wait less for
infrastructure to spin up.

This construct is not meant to be used by itself. It should be passed in the providers property for GitHubRunners.

#### Initializers <a name="Initializers" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProvider.Initializer"></a>

```typescript
import { EcsRunnerProvider } from '@cloudsnorkel/cdk-github-runners'

new EcsRunnerProvider(scope: Construct, id: string, props?: EcsRunnerProviderProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProvider.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProvider.Initializer.parameter.id">id</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProvider.Initializer.parameter.props">props</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps">EcsRunnerProviderProps</a></code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProvider.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProvider.Initializer.parameter.id"></a>

- *Type:* string

---

##### `props`<sup>Optional</sup> <a name="props" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProvider.Initializer.parameter.props"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps">EcsRunnerProviderProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProvider.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProvider.getStepFunctionTask">getStepFunctionTask</a></code> | Generate step function task(s) to start a new runner. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProvider.grantStateMachine">grantStateMachine</a></code> | An optional method that modifies the role of the state machine after all the tasks have been generated. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProvider.status">status</a></code> | Return status of the runner provider to be used in the main status function. |

---

##### `toString` <a name="toString" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProvider.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### `getStepFunctionTask` <a name="getStepFunctionTask" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProvider.getStepFunctionTask"></a>

```typescript
public getStepFunctionTask(parameters: RunnerRuntimeParameters): IChainable
```

Generate step function task(s) to start a new runner.

Called by GithubRunners and shouldn't be called manually.

###### `parameters`<sup>Required</sup> <a name="parameters" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProvider.getStepFunctionTask.parameter.parameters"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerRuntimeParameters">RunnerRuntimeParameters</a>

workflow job details.

---

##### `grantStateMachine` <a name="grantStateMachine" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProvider.grantStateMachine"></a>

```typescript
public grantStateMachine(_: IGrantable): void
```

An optional method that modifies the role of the state machine after all the tasks have been generated.

This can be used to add additional policy
statements to the state machine role that are not automatically added by the task returned from {@link getStepFunctionTask}.

###### `_`<sup>Required</sup> <a name="_" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProvider.grantStateMachine.parameter._"></a>

- *Type:* aws-cdk-lib.aws_iam.IGrantable

---

##### `status` <a name="status" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProvider.status"></a>

```typescript
public status(statusFunctionRole: IGrantable): IRunnerProviderStatus
```

Return status of the runner provider to be used in the main status function.

Also gives the status function any needed permissions to query the Docker image or AMI.

###### `statusFunctionRole`<sup>Required</sup> <a name="statusFunctionRole" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProvider.status.parameter.statusFunctionRole"></a>

- *Type:* aws-cdk-lib.aws_iam.IGrantable

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProvider.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProvider.imageBuilder">imageBuilder</a></code> | Create new image builder that builds ECS specific runner images. |

---

##### ~~`isConstruct`~~ <a name="isConstruct" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProvider.isConstruct"></a>

```typescript
import { EcsRunnerProvider } from '@cloudsnorkel/cdk-github-runners'

EcsRunnerProvider.isConstruct(x: any)
```

Checks if `x` is a construct.

###### `x`<sup>Required</sup> <a name="x" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProvider.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

##### `imageBuilder` <a name="imageBuilder" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProvider.imageBuilder"></a>

```typescript
import { EcsRunnerProvider } from '@cloudsnorkel/cdk-github-runners'

EcsRunnerProvider.imageBuilder(scope: Construct, id: string, props?: RunnerImageBuilderProps)
```

Create new image builder that builds ECS specific runner images.

You can customize the OS, architecture, VPC, subnet, security groups, etc. by passing in props.

You can add components to the image builder by calling `imageBuilder.addComponent()`.

The default OS is Ubuntu running on x64 architecture.

Included components:
 * `RunnerImageComponent.requiredPackages()`
 * `RunnerImageComponent.runnerUser()`
 * `RunnerImageComponent.git()`
 * `RunnerImageComponent.githubCli()`
 * `RunnerImageComponent.awsCli()`
 * `RunnerImageComponent.docker()`
 * `RunnerImageComponent.githubRunner()`

###### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProvider.imageBuilder.parameter.scope"></a>

- *Type:* constructs.Construct

---

###### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProvider.imageBuilder.parameter.id"></a>

- *Type:* string

---

###### `props`<sup>Optional</sup> <a name="props" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProvider.imageBuilder.parameter.props"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps">RunnerImageBuilderProps</a>

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProvider.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProvider.property.connections">connections</a></code> | <code>aws-cdk-lib.aws_ec2.Connections</code> | The network connections associated with this resource. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProvider.property.grantPrincipal">grantPrincipal</a></code> | <code>aws-cdk-lib.aws_iam.IPrincipal</code> | Grant principal used to add permissions to the runner role. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProvider.property.labels">labels</a></code> | <code>string[]</code> | Labels associated with this provider. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProvider.property.logGroup">logGroup</a></code> | <code>aws-cdk-lib.aws_logs.ILogGroup</code> | Log group where provided runners will save their logs. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProvider.property.retryableErrors">retryableErrors</a></code> | <code>string[]</code> | List of step functions errors that should be retried. |

---

##### `node`<sup>Required</sup> <a name="node" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProvider.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `connections`<sup>Required</sup> <a name="connections" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProvider.property.connections"></a>

```typescript
public readonly connections: Connections;
```

- *Type:* aws-cdk-lib.aws_ec2.Connections

The network connections associated with this resource.

---

##### `grantPrincipal`<sup>Required</sup> <a name="grantPrincipal" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProvider.property.grantPrincipal"></a>

```typescript
public readonly grantPrincipal: IPrincipal;
```

- *Type:* aws-cdk-lib.aws_iam.IPrincipal

Grant principal used to add permissions to the runner role.

---

##### `labels`<sup>Required</sup> <a name="labels" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProvider.property.labels"></a>

```typescript
public readonly labels: string[];
```

- *Type:* string[]

Labels associated with this provider.

---

##### `logGroup`<sup>Required</sup> <a name="logGroup" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProvider.property.logGroup"></a>

```typescript
public readonly logGroup: ILogGroup;
```

- *Type:* aws-cdk-lib.aws_logs.ILogGroup

Log group where provided runners will save their logs.

Note that this is not the job log, but the runner itself. It will not contain output from the GitHub Action but only metadata on its execution.

---

##### `retryableErrors`<sup>Required</sup> <a name="retryableErrors" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProvider.property.retryableErrors"></a>

```typescript
public readonly retryableErrors: string[];
```

- *Type:* string[]

List of step functions errors that should be retried.

---


### FargateRunner <a name="FargateRunner" id="@cloudsnorkel/cdk-github-runners.FargateRunner"></a>

#### Initializers <a name="Initializers" id="@cloudsnorkel/cdk-github-runners.FargateRunner.Initializer"></a>

```typescript
import { FargateRunner } from '@cloudsnorkel/cdk-github-runners'

new FargateRunner(scope: Construct, id: string, props?: FargateRunnerProviderProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunner.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunner.Initializer.parameter.id">id</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunner.Initializer.parameter.props">props</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProviderProps">FargateRunnerProviderProps</a></code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.FargateRunner.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.FargateRunner.Initializer.parameter.id"></a>

- *Type:* string

---

##### `props`<sup>Optional</sup> <a name="props" id="@cloudsnorkel/cdk-github-runners.FargateRunner.Initializer.parameter.props"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProviderProps">FargateRunnerProviderProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunner.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunner.getStepFunctionTask">getStepFunctionTask</a></code> | Generate step function task(s) to start a new runner. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunner.grantStateMachine">grantStateMachine</a></code> | An optional method that modifies the role of the state machine after all the tasks have been generated. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunner.status">status</a></code> | Return status of the runner provider to be used in the main status function. |

---

##### ~~`toString`~~ <a name="toString" id="@cloudsnorkel/cdk-github-runners.FargateRunner.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### ~~`getStepFunctionTask`~~ <a name="getStepFunctionTask" id="@cloudsnorkel/cdk-github-runners.FargateRunner.getStepFunctionTask"></a>

```typescript
public getStepFunctionTask(parameters: RunnerRuntimeParameters): IChainable
```

Generate step function task(s) to start a new runner.

Called by GithubRunners and shouldn't be called manually.

###### `parameters`<sup>Required</sup> <a name="parameters" id="@cloudsnorkel/cdk-github-runners.FargateRunner.getStepFunctionTask.parameter.parameters"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerRuntimeParameters">RunnerRuntimeParameters</a>

workflow job details.

---

##### ~~`grantStateMachine`~~ <a name="grantStateMachine" id="@cloudsnorkel/cdk-github-runners.FargateRunner.grantStateMachine"></a>

```typescript
public grantStateMachine(_: IGrantable): void
```

An optional method that modifies the role of the state machine after all the tasks have been generated.

This can be used to add additional policy
statements to the state machine role that are not automatically added by the task returned from {@link getStepFunctionTask}.

###### `_`<sup>Required</sup> <a name="_" id="@cloudsnorkel/cdk-github-runners.FargateRunner.grantStateMachine.parameter._"></a>

- *Type:* aws-cdk-lib.aws_iam.IGrantable

---

##### ~~`status`~~ <a name="status" id="@cloudsnorkel/cdk-github-runners.FargateRunner.status"></a>

```typescript
public status(statusFunctionRole: IGrantable): IRunnerProviderStatus
```

Return status of the runner provider to be used in the main status function.

Also gives the status function any needed permissions to query the Docker image or AMI.

###### `statusFunctionRole`<sup>Required</sup> <a name="statusFunctionRole" id="@cloudsnorkel/cdk-github-runners.FargateRunner.status.parameter.statusFunctionRole"></a>

- *Type:* aws-cdk-lib.aws_iam.IGrantable

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunner.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunner.imageBuilder">imageBuilder</a></code> | Create new image builder that builds Fargate specific runner images. |

---

##### ~~`isConstruct`~~ <a name="isConstruct" id="@cloudsnorkel/cdk-github-runners.FargateRunner.isConstruct"></a>

```typescript
import { FargateRunner } from '@cloudsnorkel/cdk-github-runners'

FargateRunner.isConstruct(x: any)
```

Checks if `x` is a construct.

###### `x`<sup>Required</sup> <a name="x" id="@cloudsnorkel/cdk-github-runners.FargateRunner.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

##### ~~`imageBuilder`~~ <a name="imageBuilder" id="@cloudsnorkel/cdk-github-runners.FargateRunner.imageBuilder"></a>

```typescript
import { FargateRunner } from '@cloudsnorkel/cdk-github-runners'

FargateRunner.imageBuilder(scope: Construct, id: string, props?: RunnerImageBuilderProps)
```

Create new image builder that builds Fargate specific runner images.

You can customize the OS, architecture, VPC, subnet, security groups, etc. by passing in props.

You can add components to the image builder by calling `imageBuilder.addComponent()`.

The default OS is Ubuntu running on x64 architecture.

Included components:
 * `RunnerImageComponent.requiredPackages()`
 * `RunnerImageComponent.runnerUser()`
 * `RunnerImageComponent.git()`
 * `RunnerImageComponent.githubCli()`
 * `RunnerImageComponent.awsCli()`
 * `RunnerImageComponent.githubRunner()`

###### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.FargateRunner.imageBuilder.parameter.scope"></a>

- *Type:* constructs.Construct

---

###### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.FargateRunner.imageBuilder.parameter.id"></a>

- *Type:* string

---

###### `props`<sup>Optional</sup> <a name="props" id="@cloudsnorkel/cdk-github-runners.FargateRunner.imageBuilder.parameter.props"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps">RunnerImageBuilderProps</a>

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunner.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunner.property.assignPublicIp">assignPublicIp</a></code> | <code>boolean</code> | Whether runner task will have a public IP. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunner.property.cluster">cluster</a></code> | <code>aws-cdk-lib.aws_ecs.Cluster</code> | Cluster hosting the task hosting the runner. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunner.property.connections">connections</a></code> | <code>aws-cdk-lib.aws_ec2.Connections</code> | The network connections associated with this resource. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunner.property.container">container</a></code> | <code>aws-cdk-lib.aws_ecs.ContainerDefinition</code> | Container definition hosting the runner. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunner.property.grantPrincipal">grantPrincipal</a></code> | <code>aws-cdk-lib.aws_iam.IPrincipal</code> | Grant principal used to add permissions to the runner role. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunner.property.image">image</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImage">RunnerImage</a></code> | Docker image loaded with GitHub Actions Runner and its prerequisites. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunner.property.labels">labels</a></code> | <code>string[]</code> | Labels associated with this provider. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunner.property.logGroup">logGroup</a></code> | <code>aws-cdk-lib.aws_logs.ILogGroup</code> | Log group where provided runners will save their logs. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunner.property.retryableErrors">retryableErrors</a></code> | <code>string[]</code> | List of step functions errors that should be retried. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunner.property.spot">spot</a></code> | <code>boolean</code> | Use spot pricing for Fargate tasks. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunner.property.task">task</a></code> | <code>aws-cdk-lib.aws_ecs.FargateTaskDefinition</code> | Fargate task hosting the runner. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunner.property.subnetSelection">subnetSelection</a></code> | <code>aws-cdk-lib.aws_ec2.SubnetSelection</code> | Subnets used for hosting the runner task. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunner.property.vpc">vpc</a></code> | <code>aws-cdk-lib.aws_ec2.IVpc</code> | VPC used for hosting the runner task. |

---

##### ~~`node`~~<sup>Required</sup> <a name="node" id="@cloudsnorkel/cdk-github-runners.FargateRunner.property.node"></a>

- *Deprecated:* use {@link FargateRunnerProvider }

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### ~~`assignPublicIp`~~<sup>Required</sup> <a name="assignPublicIp" id="@cloudsnorkel/cdk-github-runners.FargateRunner.property.assignPublicIp"></a>

- *Deprecated:* use {@link FargateRunnerProvider }

```typescript
public readonly assignPublicIp: boolean;
```

- *Type:* boolean

Whether runner task will have a public IP.

---

##### ~~`cluster`~~<sup>Required</sup> <a name="cluster" id="@cloudsnorkel/cdk-github-runners.FargateRunner.property.cluster"></a>

- *Deprecated:* use {@link FargateRunnerProvider }

```typescript
public readonly cluster: Cluster;
```

- *Type:* aws-cdk-lib.aws_ecs.Cluster

Cluster hosting the task hosting the runner.

---

##### ~~`connections`~~<sup>Required</sup> <a name="connections" id="@cloudsnorkel/cdk-github-runners.FargateRunner.property.connections"></a>

- *Deprecated:* use {@link FargateRunnerProvider }

```typescript
public readonly connections: Connections;
```

- *Type:* aws-cdk-lib.aws_ec2.Connections

The network connections associated with this resource.

---

##### ~~`container`~~<sup>Required</sup> <a name="container" id="@cloudsnorkel/cdk-github-runners.FargateRunner.property.container"></a>

- *Deprecated:* use {@link FargateRunnerProvider }

```typescript
public readonly container: ContainerDefinition;
```

- *Type:* aws-cdk-lib.aws_ecs.ContainerDefinition

Container definition hosting the runner.

---

##### ~~`grantPrincipal`~~<sup>Required</sup> <a name="grantPrincipal" id="@cloudsnorkel/cdk-github-runners.FargateRunner.property.grantPrincipal"></a>

- *Deprecated:* use {@link FargateRunnerProvider }

```typescript
public readonly grantPrincipal: IPrincipal;
```

- *Type:* aws-cdk-lib.aws_iam.IPrincipal

Grant principal used to add permissions to the runner role.

---

##### ~~`image`~~<sup>Required</sup> <a name="image" id="@cloudsnorkel/cdk-github-runners.FargateRunner.property.image"></a>

- *Deprecated:* use {@link FargateRunnerProvider }

```typescript
public readonly image: RunnerImage;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerImage">RunnerImage</a>

Docker image loaded with GitHub Actions Runner and its prerequisites.

The image is built by an image builder and is specific to Fargate tasks.

---

##### ~~`labels`~~<sup>Required</sup> <a name="labels" id="@cloudsnorkel/cdk-github-runners.FargateRunner.property.labels"></a>

- *Deprecated:* use {@link FargateRunnerProvider }

```typescript
public readonly labels: string[];
```

- *Type:* string[]

Labels associated with this provider.

---

##### ~~`logGroup`~~<sup>Required</sup> <a name="logGroup" id="@cloudsnorkel/cdk-github-runners.FargateRunner.property.logGroup"></a>

- *Deprecated:* use {@link FargateRunnerProvider }

```typescript
public readonly logGroup: ILogGroup;
```

- *Type:* aws-cdk-lib.aws_logs.ILogGroup

Log group where provided runners will save their logs.

Note that this is not the job log, but the runner itself. It will not contain output from the GitHub Action but only metadata on its execution.

---

##### ~~`retryableErrors`~~<sup>Required</sup> <a name="retryableErrors" id="@cloudsnorkel/cdk-github-runners.FargateRunner.property.retryableErrors"></a>

- *Deprecated:* use {@link FargateRunnerProvider }

```typescript
public readonly retryableErrors: string[];
```

- *Type:* string[]

List of step functions errors that should be retried.

---

##### ~~`spot`~~<sup>Required</sup> <a name="spot" id="@cloudsnorkel/cdk-github-runners.FargateRunner.property.spot"></a>

- *Deprecated:* use {@link FargateRunnerProvider }

```typescript
public readonly spot: boolean;
```

- *Type:* boolean

Use spot pricing for Fargate tasks.

---

##### ~~`task`~~<sup>Required</sup> <a name="task" id="@cloudsnorkel/cdk-github-runners.FargateRunner.property.task"></a>

- *Deprecated:* use {@link FargateRunnerProvider }

```typescript
public readonly task: FargateTaskDefinition;
```

- *Type:* aws-cdk-lib.aws_ecs.FargateTaskDefinition

Fargate task hosting the runner.

---

##### ~~`subnetSelection`~~<sup>Optional</sup> <a name="subnetSelection" id="@cloudsnorkel/cdk-github-runners.FargateRunner.property.subnetSelection"></a>

- *Deprecated:* use {@link FargateRunnerProvider }

```typescript
public readonly subnetSelection: SubnetSelection;
```

- *Type:* aws-cdk-lib.aws_ec2.SubnetSelection

Subnets used for hosting the runner task.

---

##### ~~`vpc`~~<sup>Optional</sup> <a name="vpc" id="@cloudsnorkel/cdk-github-runners.FargateRunner.property.vpc"></a>

- *Deprecated:* use {@link FargateRunnerProvider }

```typescript
public readonly vpc: IVpc;
```

- *Type:* aws-cdk-lib.aws_ec2.IVpc

VPC used for hosting the runner task.

---

#### Constants <a name="Constants" id="Constants"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunner.property.LINUX_ARM64_DOCKERFILE_PATH">LINUX_ARM64_DOCKERFILE_PATH</a></code> | <code>string</code> | Path to Dockerfile for Linux ARM64 with all the requirement for Fargate runner. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunner.property.LINUX_X64_DOCKERFILE_PATH">LINUX_X64_DOCKERFILE_PATH</a></code> | <code>string</code> | Path to Dockerfile for Linux x64 with all the requirement for Fargate runner. |

---

##### ~~`LINUX_ARM64_DOCKERFILE_PATH`~~<sup>Required</sup> <a name="LINUX_ARM64_DOCKERFILE_PATH" id="@cloudsnorkel/cdk-github-runners.FargateRunner.property.LINUX_ARM64_DOCKERFILE_PATH"></a>

- *Deprecated:* Use `imageBuilder()` instead.

```typescript
public readonly LINUX_ARM64_DOCKERFILE_PATH: string;
```

- *Type:* string

Path to Dockerfile for Linux ARM64 with all the requirement for Fargate runner.

Use this Dockerfile unless you need to customize it further than allowed by hooks.

Available build arguments that can be set in the image builder:
* `BASE_IMAGE` sets the `FROM` line. This should be an Ubuntu compatible image.
* `EXTRA_PACKAGES` can be used to install additional packages.

---

##### ~~`LINUX_X64_DOCKERFILE_PATH`~~<sup>Required</sup> <a name="LINUX_X64_DOCKERFILE_PATH" id="@cloudsnorkel/cdk-github-runners.FargateRunner.property.LINUX_X64_DOCKERFILE_PATH"></a>

- *Deprecated:* Use `imageBuilder()` instead.

```typescript
public readonly LINUX_X64_DOCKERFILE_PATH: string;
```

- *Type:* string

Path to Dockerfile for Linux x64 with all the requirement for Fargate runner.

Use this Dockerfile unless you need to customize it further than allowed by hooks.

Available build arguments that can be set in the image builder:
* `BASE_IMAGE` sets the `FROM` line. This should be an Ubuntu compatible image.
* `EXTRA_PACKAGES` can be used to install additional packages.

---

### FargateRunnerProvider <a name="FargateRunnerProvider" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProvider"></a>

- *Implements:* <a href="#@cloudsnorkel/cdk-github-runners.IRunnerProvider">IRunnerProvider</a>

GitHub Actions runner provider using Fargate to execute jobs.

Creates a task definition with a single container that gets started for each job.

This construct is not meant to be used by itself. It should be passed in the providers property for GitHubRunners.

#### Initializers <a name="Initializers" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.Initializer"></a>

```typescript
import { FargateRunnerProvider } from '@cloudsnorkel/cdk-github-runners'

new FargateRunnerProvider(scope: Construct, id: string, props?: FargateRunnerProviderProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.Initializer.parameter.id">id</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.Initializer.parameter.props">props</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProviderProps">FargateRunnerProviderProps</a></code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.Initializer.parameter.id"></a>

- *Type:* string

---

##### `props`<sup>Optional</sup> <a name="props" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.Initializer.parameter.props"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProviderProps">FargateRunnerProviderProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.getStepFunctionTask">getStepFunctionTask</a></code> | Generate step function task(s) to start a new runner. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.grantStateMachine">grantStateMachine</a></code> | An optional method that modifies the role of the state machine after all the tasks have been generated. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.status">status</a></code> | Return status of the runner provider to be used in the main status function. |

---

##### `toString` <a name="toString" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### `getStepFunctionTask` <a name="getStepFunctionTask" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.getStepFunctionTask"></a>

```typescript
public getStepFunctionTask(parameters: RunnerRuntimeParameters): IChainable
```

Generate step function task(s) to start a new runner.

Called by GithubRunners and shouldn't be called manually.

###### `parameters`<sup>Required</sup> <a name="parameters" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.getStepFunctionTask.parameter.parameters"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerRuntimeParameters">RunnerRuntimeParameters</a>

workflow job details.

---

##### `grantStateMachine` <a name="grantStateMachine" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.grantStateMachine"></a>

```typescript
public grantStateMachine(_: IGrantable): void
```

An optional method that modifies the role of the state machine after all the tasks have been generated.

This can be used to add additional policy
statements to the state machine role that are not automatically added by the task returned from {@link getStepFunctionTask}.

###### `_`<sup>Required</sup> <a name="_" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.grantStateMachine.parameter._"></a>

- *Type:* aws-cdk-lib.aws_iam.IGrantable

---

##### `status` <a name="status" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.status"></a>

```typescript
public status(statusFunctionRole: IGrantable): IRunnerProviderStatus
```

Return status of the runner provider to be used in the main status function.

Also gives the status function any needed permissions to query the Docker image or AMI.

###### `statusFunctionRole`<sup>Required</sup> <a name="statusFunctionRole" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.status.parameter.statusFunctionRole"></a>

- *Type:* aws-cdk-lib.aws_iam.IGrantable

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.imageBuilder">imageBuilder</a></code> | Create new image builder that builds Fargate specific runner images. |

---

##### ~~`isConstruct`~~ <a name="isConstruct" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.isConstruct"></a>

```typescript
import { FargateRunnerProvider } from '@cloudsnorkel/cdk-github-runners'

FargateRunnerProvider.isConstruct(x: any)
```

Checks if `x` is a construct.

###### `x`<sup>Required</sup> <a name="x" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

##### `imageBuilder` <a name="imageBuilder" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.imageBuilder"></a>

```typescript
import { FargateRunnerProvider } from '@cloudsnorkel/cdk-github-runners'

FargateRunnerProvider.imageBuilder(scope: Construct, id: string, props?: RunnerImageBuilderProps)
```

Create new image builder that builds Fargate specific runner images.

You can customize the OS, architecture, VPC, subnet, security groups, etc. by passing in props.

You can add components to the image builder by calling `imageBuilder.addComponent()`.

The default OS is Ubuntu running on x64 architecture.

Included components:
 * `RunnerImageComponent.requiredPackages()`
 * `RunnerImageComponent.runnerUser()`
 * `RunnerImageComponent.git()`
 * `RunnerImageComponent.githubCli()`
 * `RunnerImageComponent.awsCli()`
 * `RunnerImageComponent.githubRunner()`

###### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.imageBuilder.parameter.scope"></a>

- *Type:* constructs.Construct

---

###### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.imageBuilder.parameter.id"></a>

- *Type:* string

---

###### `props`<sup>Optional</sup> <a name="props" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.imageBuilder.parameter.props"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps">RunnerImageBuilderProps</a>

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.property.assignPublicIp">assignPublicIp</a></code> | <code>boolean</code> | Whether runner task will have a public IP. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.property.cluster">cluster</a></code> | <code>aws-cdk-lib.aws_ecs.Cluster</code> | Cluster hosting the task hosting the runner. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.property.connections">connections</a></code> | <code>aws-cdk-lib.aws_ec2.Connections</code> | The network connections associated with this resource. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.property.container">container</a></code> | <code>aws-cdk-lib.aws_ecs.ContainerDefinition</code> | Container definition hosting the runner. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.property.grantPrincipal">grantPrincipal</a></code> | <code>aws-cdk-lib.aws_iam.IPrincipal</code> | Grant principal used to add permissions to the runner role. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.property.image">image</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImage">RunnerImage</a></code> | Docker image loaded with GitHub Actions Runner and its prerequisites. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.property.labels">labels</a></code> | <code>string[]</code> | Labels associated with this provider. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.property.logGroup">logGroup</a></code> | <code>aws-cdk-lib.aws_logs.ILogGroup</code> | Log group where provided runners will save their logs. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.property.retryableErrors">retryableErrors</a></code> | <code>string[]</code> | List of step functions errors that should be retried. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.property.spot">spot</a></code> | <code>boolean</code> | Use spot pricing for Fargate tasks. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.property.task">task</a></code> | <code>aws-cdk-lib.aws_ecs.FargateTaskDefinition</code> | Fargate task hosting the runner. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.property.subnetSelection">subnetSelection</a></code> | <code>aws-cdk-lib.aws_ec2.SubnetSelection</code> | Subnets used for hosting the runner task. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.property.vpc">vpc</a></code> | <code>aws-cdk-lib.aws_ec2.IVpc</code> | VPC used for hosting the runner task. |

---

##### `node`<sup>Required</sup> <a name="node" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `assignPublicIp`<sup>Required</sup> <a name="assignPublicIp" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.property.assignPublicIp"></a>

```typescript
public readonly assignPublicIp: boolean;
```

- *Type:* boolean

Whether runner task will have a public IP.

---

##### `cluster`<sup>Required</sup> <a name="cluster" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.property.cluster"></a>

```typescript
public readonly cluster: Cluster;
```

- *Type:* aws-cdk-lib.aws_ecs.Cluster

Cluster hosting the task hosting the runner.

---

##### `connections`<sup>Required</sup> <a name="connections" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.property.connections"></a>

```typescript
public readonly connections: Connections;
```

- *Type:* aws-cdk-lib.aws_ec2.Connections

The network connections associated with this resource.

---

##### `container`<sup>Required</sup> <a name="container" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.property.container"></a>

```typescript
public readonly container: ContainerDefinition;
```

- *Type:* aws-cdk-lib.aws_ecs.ContainerDefinition

Container definition hosting the runner.

---

##### `grantPrincipal`<sup>Required</sup> <a name="grantPrincipal" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.property.grantPrincipal"></a>

```typescript
public readonly grantPrincipal: IPrincipal;
```

- *Type:* aws-cdk-lib.aws_iam.IPrincipal

Grant principal used to add permissions to the runner role.

---

##### `image`<sup>Required</sup> <a name="image" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.property.image"></a>

```typescript
public readonly image: RunnerImage;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerImage">RunnerImage</a>

Docker image loaded with GitHub Actions Runner and its prerequisites.

The image is built by an image builder and is specific to Fargate tasks.

---

##### `labels`<sup>Required</sup> <a name="labels" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.property.labels"></a>

```typescript
public readonly labels: string[];
```

- *Type:* string[]

Labels associated with this provider.

---

##### `logGroup`<sup>Required</sup> <a name="logGroup" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.property.logGroup"></a>

```typescript
public readonly logGroup: ILogGroup;
```

- *Type:* aws-cdk-lib.aws_logs.ILogGroup

Log group where provided runners will save their logs.

Note that this is not the job log, but the runner itself. It will not contain output from the GitHub Action but only metadata on its execution.

---

##### `retryableErrors`<sup>Required</sup> <a name="retryableErrors" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.property.retryableErrors"></a>

```typescript
public readonly retryableErrors: string[];
```

- *Type:* string[]

List of step functions errors that should be retried.

---

##### `spot`<sup>Required</sup> <a name="spot" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.property.spot"></a>

```typescript
public readonly spot: boolean;
```

- *Type:* boolean

Use spot pricing for Fargate tasks.

---

##### `task`<sup>Required</sup> <a name="task" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.property.task"></a>

```typescript
public readonly task: FargateTaskDefinition;
```

- *Type:* aws-cdk-lib.aws_ecs.FargateTaskDefinition

Fargate task hosting the runner.

---

##### `subnetSelection`<sup>Optional</sup> <a name="subnetSelection" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.property.subnetSelection"></a>

```typescript
public readonly subnetSelection: SubnetSelection;
```

- *Type:* aws-cdk-lib.aws_ec2.SubnetSelection

Subnets used for hosting the runner task.

---

##### `vpc`<sup>Optional</sup> <a name="vpc" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.property.vpc"></a>

```typescript
public readonly vpc: IVpc;
```

- *Type:* aws-cdk-lib.aws_ec2.IVpc

VPC used for hosting the runner task.

---

#### Constants <a name="Constants" id="Constants"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.property.LINUX_ARM64_DOCKERFILE_PATH">LINUX_ARM64_DOCKERFILE_PATH</a></code> | <code>string</code> | Path to Dockerfile for Linux ARM64 with all the requirement for Fargate runner. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.property.LINUX_X64_DOCKERFILE_PATH">LINUX_X64_DOCKERFILE_PATH</a></code> | <code>string</code> | Path to Dockerfile for Linux x64 with all the requirement for Fargate runner. |

---

##### ~~`LINUX_ARM64_DOCKERFILE_PATH`~~<sup>Required</sup> <a name="LINUX_ARM64_DOCKERFILE_PATH" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.property.LINUX_ARM64_DOCKERFILE_PATH"></a>

- *Deprecated:* Use `imageBuilder()` instead.

```typescript
public readonly LINUX_ARM64_DOCKERFILE_PATH: string;
```

- *Type:* string

Path to Dockerfile for Linux ARM64 with all the requirement for Fargate runner.

Use this Dockerfile unless you need to customize it further than allowed by hooks.

Available build arguments that can be set in the image builder:
* `BASE_IMAGE` sets the `FROM` line. This should be an Ubuntu compatible image.
* `EXTRA_PACKAGES` can be used to install additional packages.

---

##### ~~`LINUX_X64_DOCKERFILE_PATH`~~<sup>Required</sup> <a name="LINUX_X64_DOCKERFILE_PATH" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProvider.property.LINUX_X64_DOCKERFILE_PATH"></a>

- *Deprecated:* Use `imageBuilder()` instead.

```typescript
public readonly LINUX_X64_DOCKERFILE_PATH: string;
```

- *Type:* string

Path to Dockerfile for Linux x64 with all the requirement for Fargate runner.

Use this Dockerfile unless you need to customize it further than allowed by hooks.

Available build arguments that can be set in the image builder:
* `BASE_IMAGE` sets the `FROM` line. This should be an Ubuntu compatible image.
* `EXTRA_PACKAGES` can be used to install additional packages.

---

### GitHubRunners <a name="GitHubRunners" id="@cloudsnorkel/cdk-github-runners.GitHubRunners"></a>

- *Implements:* aws-cdk-lib.aws_ec2.IConnectable

Create all the required infrastructure to provide self-hosted GitHub runners.

It creates a webhook, secrets, and a step function to orchestrate all runs. Secrets are not automatically filled. See README.md for instructions on how to setup GitHub integration.

By default, this will create a runner provider of each available type with the defaults. This is good enough for the initial setup stage when you just want to get GitHub integration working.

```typescript
new GitHubRunners(this, 'runners');
```

Usually you'd want to configure the runner providers so the runners can run in a certain VPC or have certain permissions.

```typescript
const vpc = ec2.Vpc.fromLookup(this, 'vpc', { vpcId: 'vpc-1234567' });
const runnerSg = new ec2.SecurityGroup(this, 'runner security group', { vpc: vpc });
const dbSg = ec2.SecurityGroup.fromSecurityGroupId(this, 'database security group', 'sg-1234567');
const bucket = new s3.Bucket(this, 'runner bucket');

// create a custom CodeBuild provider
const myProvider = new CodeBuildRunnerProvider(
  this, 'codebuild runner',
  {
     labels: ['my-codebuild'],
     vpc: vpc,
     securityGroups: [runnerSg],
  },
);
// grant some permissions to the provider
bucket.grantReadWrite(myProvider);
dbSg.connections.allowFrom(runnerSg, ec2.Port.tcp(3306), 'allow runners to connect to MySQL database');

// create the runner infrastructure
new GitHubRunners(
  this,
  'runners',
  {
    providers: [myProvider],
  }
);
```

#### Initializers <a name="Initializers" id="@cloudsnorkel/cdk-github-runners.GitHubRunners.Initializer"></a>

```typescript
import { GitHubRunners } from '@cloudsnorkel/cdk-github-runners'

new GitHubRunners(scope: Construct, id: string, props?: GitHubRunnersProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunners.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunners.Initializer.parameter.id">id</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunners.Initializer.parameter.props">props</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunnersProps">GitHubRunnersProps</a></code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.GitHubRunners.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.GitHubRunners.Initializer.parameter.id"></a>

- *Type:* string

---

##### `props`<sup>Optional</sup> <a name="props" id="@cloudsnorkel/cdk-github-runners.GitHubRunners.Initializer.parameter.props"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.GitHubRunnersProps">GitHubRunnersProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunners.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunners.createLogsInsightsQueries">createLogsInsightsQueries</a></code> | Creates CloudWatch Logs Insights saved queries that can be used to debug issues with the runners. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunners.failedImageBuildsTopic">failedImageBuildsTopic</a></code> | Creates a topic for notifications when a runner image build fails. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunners.metricFailed">metricFailed</a></code> | Metric for failed runner executions. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunners.metricJobCompleted">metricJobCompleted</a></code> | Metric for the number of GitHub Actions jobs completed. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunners.metricSucceeded">metricSucceeded</a></code> | Metric for successful executions. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunners.metricTime">metricTime</a></code> | Metric for the interval, in milliseconds, between the time the execution starts and the time it closes. |

---

##### `toString` <a name="toString" id="@cloudsnorkel/cdk-github-runners.GitHubRunners.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### `createLogsInsightsQueries` <a name="createLogsInsightsQueries" id="@cloudsnorkel/cdk-github-runners.GitHubRunners.createLogsInsightsQueries"></a>

```typescript
public createLogsInsightsQueries(): void
```

Creates CloudWatch Logs Insights saved queries that can be used to debug issues with the runners.

* "Webhook errors" helps diagnose configuration issues with GitHub integration
* "Ignored webhook" helps understand why runners aren't started
* "Ignored jobs based on labels" helps debug label matching issues
* "Webhook started runners" helps understand which runners were started

##### `failedImageBuildsTopic` <a name="failedImageBuildsTopic" id="@cloudsnorkel/cdk-github-runners.GitHubRunners.failedImageBuildsTopic"></a>

```typescript
public failedImageBuildsTopic(): Topic
```

Creates a topic for notifications when a runner image build fails.

Runner images are rebuilt every week by default. This provides the latest GitHub Runner version and software updates.

If you want to be sure you are using the latest runner version, you can use this topic to be notified when a build fails.

##### `metricFailed` <a name="metricFailed" id="@cloudsnorkel/cdk-github-runners.GitHubRunners.metricFailed"></a>

```typescript
public metricFailed(props?: MetricProps): Metric
```

Metric for failed runner executions.

A failed runner usually means the runner failed to start and so a job was never executed. It doesn't necessarily mean the job was executed and failed. For that, see {@link metricJobCompleted}.

###### `props`<sup>Optional</sup> <a name="props" id="@cloudsnorkel/cdk-github-runners.GitHubRunners.metricFailed.parameter.props"></a>

- *Type:* aws-cdk-lib.aws_cloudwatch.MetricProps

---

##### `metricJobCompleted` <a name="metricJobCompleted" id="@cloudsnorkel/cdk-github-runners.GitHubRunners.metricJobCompleted"></a>

```typescript
public metricJobCompleted(props?: MetricProps): Metric
```

Metric for the number of GitHub Actions jobs completed.

It has `ProviderLabels` and `Status` dimensions. The status can be one of "Succeeded", "SucceededWithIssues", "Failed", "Canceled", "Skipped", or "Abandoned".

**WARNING:** this method creates a metric filter for each provider. Each metric has a status dimension with six possible values. These resources may incur cost.

###### `props`<sup>Optional</sup> <a name="props" id="@cloudsnorkel/cdk-github-runners.GitHubRunners.metricJobCompleted.parameter.props"></a>

- *Type:* aws-cdk-lib.aws_cloudwatch.MetricProps

---

##### `metricSucceeded` <a name="metricSucceeded" id="@cloudsnorkel/cdk-github-runners.GitHubRunners.metricSucceeded"></a>

```typescript
public metricSucceeded(props?: MetricProps): Metric
```

Metric for successful executions.

A successful execution doesn't always mean a runner was started. It can be successful even without any label matches.

A successful runner doesn't mean the job it executed was successful. For that, see {@link metricJobCompleted}.

###### `props`<sup>Optional</sup> <a name="props" id="@cloudsnorkel/cdk-github-runners.GitHubRunners.metricSucceeded.parameter.props"></a>

- *Type:* aws-cdk-lib.aws_cloudwatch.MetricProps

---

##### `metricTime` <a name="metricTime" id="@cloudsnorkel/cdk-github-runners.GitHubRunners.metricTime"></a>

```typescript
public metricTime(props?: MetricProps): Metric
```

Metric for the interval, in milliseconds, between the time the execution starts and the time it closes.

This time may be longer than the time the runner took.

###### `props`<sup>Optional</sup> <a name="props" id="@cloudsnorkel/cdk-github-runners.GitHubRunners.metricTime.parameter.props"></a>

- *Type:* aws-cdk-lib.aws_cloudwatch.MetricProps

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunners.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |

---

##### ~~`isConstruct`~~ <a name="isConstruct" id="@cloudsnorkel/cdk-github-runners.GitHubRunners.isConstruct"></a>

```typescript
import { GitHubRunners } from '@cloudsnorkel/cdk-github-runners'

GitHubRunners.isConstruct(x: any)
```

Checks if `x` is a construct.

###### `x`<sup>Required</sup> <a name="x" id="@cloudsnorkel/cdk-github-runners.GitHubRunners.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunners.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunners.property.connections">connections</a></code> | <code>aws-cdk-lib.aws_ec2.Connections</code> | Manage the connections of all management functions. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunners.property.providers">providers</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.IRunnerProvider">IRunnerProvider</a>[]</code> | Configured runner providers. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunners.property.secrets">secrets</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.Secrets">Secrets</a></code> | Secrets for GitHub communication including webhook secret and runner authentication. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunners.property.props">props</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunnersProps">GitHubRunnersProps</a></code> | *No description.* |

---

##### `node`<sup>Required</sup> <a name="node" id="@cloudsnorkel/cdk-github-runners.GitHubRunners.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `connections`<sup>Required</sup> <a name="connections" id="@cloudsnorkel/cdk-github-runners.GitHubRunners.property.connections"></a>

```typescript
public readonly connections: Connections;
```

- *Type:* aws-cdk-lib.aws_ec2.Connections

Manage the connections of all management functions.

Use this to enable connections to your GitHub Enterprise Server in a VPC.

This cannot be used to manage connections of the runners. Use the `connections` property of each runner provider to manage runner connections.

---

##### `providers`<sup>Required</sup> <a name="providers" id="@cloudsnorkel/cdk-github-runners.GitHubRunners.property.providers"></a>

```typescript
public readonly providers: IRunnerProvider[];
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.IRunnerProvider">IRunnerProvider</a>[]

Configured runner providers.

---

##### `secrets`<sup>Required</sup> <a name="secrets" id="@cloudsnorkel/cdk-github-runners.GitHubRunners.property.secrets"></a>

```typescript
public readonly secrets: Secrets;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Secrets">Secrets</a>

Secrets for GitHub communication including webhook secret and runner authentication.

---

##### `props`<sup>Optional</sup> <a name="props" id="@cloudsnorkel/cdk-github-runners.GitHubRunners.property.props"></a>

```typescript
public readonly props: GitHubRunnersProps;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.GitHubRunnersProps">GitHubRunnersProps</a>

---


### ImageBuilderComponent <a name="ImageBuilderComponent" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponent"></a>

Components are a set of commands to run and optional files to add to an image.

Components are the building blocks of images built by Image Builder.

Example:

```
new ImageBuilderComponent(this, 'AWS CLI', {
  platform: 'Windows',
  displayName: 'AWS CLI',
  description: 'Install latest version of AWS CLI',
  commands: [
    '$p = Start-Process msiexec.exe -PassThru -Wait -ArgumentList \'/i https://awscli.amazonaws.com/AWSCLIV2.msi /qn\'',
    'if ($p.ExitCode -ne 0) { throw "Exit code is $p.ExitCode" }',
  ],
}
```

#### Initializers <a name="Initializers" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.Initializer"></a>

```typescript
import { ImageBuilderComponent } from '@cloudsnorkel/cdk-github-runners'

new ImageBuilderComponent(scope: Construct, id: string, props: ImageBuilderComponentProperties)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.Initializer.parameter.id">id</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.Initializer.parameter.props">props</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.ImageBuilderComponentProperties">ImageBuilderComponentProperties</a></code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.Initializer.parameter.id"></a>

- *Type:* string

---

##### `props`<sup>Required</sup> <a name="props" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.Initializer.parameter.props"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.ImageBuilderComponentProperties">ImageBuilderComponentProperties</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.applyRemovalPolicy">applyRemovalPolicy</a></code> | Apply the given removal policy to this resource. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.grantAssetsRead">grantAssetsRead</a></code> | Grants read permissions to the principal on the assets buckets. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.prefixCommandsWithErrorHandling">prefixCommandsWithErrorHandling</a></code> | *No description.* |

---

##### ~~`toString`~~ <a name="toString" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### ~~`applyRemovalPolicy`~~ <a name="applyRemovalPolicy" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.applyRemovalPolicy"></a>

```typescript
public applyRemovalPolicy(policy: RemovalPolicy): void
```

Apply the given removal policy to this resource.

The Removal Policy controls what happens to this resource when it stops
being managed by CloudFormation, either because you've removed it from the
CDK application or because you've made a change that requires the resource
to be replaced.

The resource can be deleted (`RemovalPolicy.DESTROY`), or left in your AWS
account for data recovery and cleanup later (`RemovalPolicy.RETAIN`).

###### `policy`<sup>Required</sup> <a name="policy" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.applyRemovalPolicy.parameter.policy"></a>

- *Type:* aws-cdk-lib.RemovalPolicy

---

##### ~~`grantAssetsRead`~~ <a name="grantAssetsRead" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.grantAssetsRead"></a>

```typescript
public grantAssetsRead(grantee: IGrantable): void
```

Grants read permissions to the principal on the assets buckets.

###### `grantee`<sup>Required</sup> <a name="grantee" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.grantAssetsRead.parameter.grantee"></a>

- *Type:* aws-cdk-lib.aws_iam.IGrantable

---

##### ~~`prefixCommandsWithErrorHandling`~~ <a name="prefixCommandsWithErrorHandling" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.prefixCommandsWithErrorHandling"></a>

```typescript
public prefixCommandsWithErrorHandling(platform: string, commands: string[]): string[]
```

###### `platform`<sup>Required</sup> <a name="platform" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.prefixCommandsWithErrorHandling.parameter.platform"></a>

- *Type:* string

---

###### `commands`<sup>Required</sup> <a name="commands" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.prefixCommandsWithErrorHandling.parameter.commands"></a>

- *Type:* string[]

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.isOwnedResource">isOwnedResource</a></code> | Returns true if the construct was created by CDK, and false otherwise. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.isResource">isResource</a></code> | Check whether the given construct is a Resource. |

---

##### ~~`isConstruct`~~ <a name="isConstruct" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.isConstruct"></a>

```typescript
import { ImageBuilderComponent } from '@cloudsnorkel/cdk-github-runners'

ImageBuilderComponent.isConstruct(x: any)
```

Checks if `x` is a construct.

###### `x`<sup>Required</sup> <a name="x" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

##### ~~`isOwnedResource`~~ <a name="isOwnedResource" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.isOwnedResource"></a>

```typescript
import { ImageBuilderComponent } from '@cloudsnorkel/cdk-github-runners'

ImageBuilderComponent.isOwnedResource(construct: IConstruct)
```

Returns true if the construct was created by CDK, and false otherwise.

###### `construct`<sup>Required</sup> <a name="construct" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.isOwnedResource.parameter.construct"></a>

- *Type:* constructs.IConstruct

---

##### ~~`isResource`~~ <a name="isResource" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.isResource"></a>

```typescript
import { ImageBuilderComponent } from '@cloudsnorkel/cdk-github-runners'

ImageBuilderComponent.isResource(construct: IConstruct)
```

Check whether the given construct is a Resource.

###### `construct`<sup>Required</sup> <a name="construct" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.isResource.parameter.construct"></a>

- *Type:* constructs.IConstruct

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.property.env">env</a></code> | <code>aws-cdk-lib.ResourceEnvironment</code> | The environment this resource belongs to. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.property.stack">stack</a></code> | <code>aws-cdk-lib.Stack</code> | The stack in which this resource is defined. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.property.arn">arn</a></code> | <code>string</code> | Component ARN. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.property.platform">platform</a></code> | <code>string</code> | Supported platform for the component. |

---

##### ~~`node`~~<sup>Required</sup> <a name="node" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.property.node"></a>

- *Deprecated:* Use `RunnerImageComponent` instead as this be internal soon.

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### ~~`env`~~<sup>Required</sup> <a name="env" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.property.env"></a>

- *Deprecated:* Use `RunnerImageComponent` instead as this be internal soon.

```typescript
public readonly env: ResourceEnvironment;
```

- *Type:* aws-cdk-lib.ResourceEnvironment

The environment this resource belongs to.

For resources that are created and managed by the CDK
(generally, those created by creating new class instances like Role, Bucket, etc.),
this is always the same as the environment of the stack they belong to;
however, for imported resources
(those obtained from static methods like fromRoleArn, fromBucketName, etc.),
that might be different than the stack they were imported into.

---

##### ~~`stack`~~<sup>Required</sup> <a name="stack" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.property.stack"></a>

- *Deprecated:* Use `RunnerImageComponent` instead as this be internal soon.

```typescript
public readonly stack: Stack;
```

- *Type:* aws-cdk-lib.Stack

The stack in which this resource is defined.

---

##### ~~`arn`~~<sup>Required</sup> <a name="arn" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.property.arn"></a>

- *Deprecated:* Use `RunnerImageComponent` instead as this be internal soon.

```typescript
public readonly arn: string;
```

- *Type:* string

Component ARN.

---

##### ~~`platform`~~<sup>Required</sup> <a name="platform" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.property.platform"></a>

- *Deprecated:* Use `RunnerImageComponent` instead as this be internal soon.

```typescript
public readonly platform: string;
```

- *Type:* string

Supported platform for the component.

---


### LambdaRunner <a name="LambdaRunner" id="@cloudsnorkel/cdk-github-runners.LambdaRunner"></a>

#### Initializers <a name="Initializers" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.Initializer"></a>

```typescript
import { LambdaRunner } from '@cloudsnorkel/cdk-github-runners'

new LambdaRunner(scope: Construct, id: string, props?: LambdaRunnerProviderProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunner.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunner.Initializer.parameter.id">id</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunner.Initializer.parameter.props">props</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProviderProps">LambdaRunnerProviderProps</a></code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.Initializer.parameter.id"></a>

- *Type:* string

---

##### `props`<sup>Optional</sup> <a name="props" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.Initializer.parameter.props"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProviderProps">LambdaRunnerProviderProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunner.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunner.getStepFunctionTask">getStepFunctionTask</a></code> | Generate step function task(s) to start a new runner. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunner.grantStateMachine">grantStateMachine</a></code> | An optional method that modifies the role of the state machine after all the tasks have been generated. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunner.status">status</a></code> | Return status of the runner provider to be used in the main status function. |

---

##### ~~`toString`~~ <a name="toString" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### ~~`getStepFunctionTask`~~ <a name="getStepFunctionTask" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.getStepFunctionTask"></a>

```typescript
public getStepFunctionTask(parameters: RunnerRuntimeParameters): IChainable
```

Generate step function task(s) to start a new runner.

Called by GithubRunners and shouldn't be called manually.

###### `parameters`<sup>Required</sup> <a name="parameters" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.getStepFunctionTask.parameter.parameters"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerRuntimeParameters">RunnerRuntimeParameters</a>

workflow job details.

---

##### ~~`grantStateMachine`~~ <a name="grantStateMachine" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.grantStateMachine"></a>

```typescript
public grantStateMachine(_: IGrantable): void
```

An optional method that modifies the role of the state machine after all the tasks have been generated.

This can be used to add additional policy
statements to the state machine role that are not automatically added by the task returned from {@link getStepFunctionTask}.

###### `_`<sup>Required</sup> <a name="_" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.grantStateMachine.parameter._"></a>

- *Type:* aws-cdk-lib.aws_iam.IGrantable

---

##### ~~`status`~~ <a name="status" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.status"></a>

```typescript
public status(statusFunctionRole: IGrantable): IRunnerProviderStatus
```

Return status of the runner provider to be used in the main status function.

Also gives the status function any needed permissions to query the Docker image or AMI.

###### `statusFunctionRole`<sup>Required</sup> <a name="statusFunctionRole" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.status.parameter.statusFunctionRole"></a>

- *Type:* aws-cdk-lib.aws_iam.IGrantable

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunner.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunner.imageBuilder">imageBuilder</a></code> | Create new image builder that builds Lambda specific runner images. |

---

##### ~~`isConstruct`~~ <a name="isConstruct" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.isConstruct"></a>

```typescript
import { LambdaRunner } from '@cloudsnorkel/cdk-github-runners'

LambdaRunner.isConstruct(x: any)
```

Checks if `x` is a construct.

###### `x`<sup>Required</sup> <a name="x" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

##### ~~`imageBuilder`~~ <a name="imageBuilder" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.imageBuilder"></a>

```typescript
import { LambdaRunner } from '@cloudsnorkel/cdk-github-runners'

LambdaRunner.imageBuilder(scope: Construct, id: string, props?: RunnerImageBuilderProps)
```

Create new image builder that builds Lambda specific runner images.

You can customize the OS, architecture, VPC, subnet, security groups, etc. by passing in props.

You can add components to the image builder by calling `imageBuilder.addComponent()`.

The default OS is Amazon Linux 2023 running on x64 architecture.

Included components:
 * `RunnerImageComponent.requiredPackages()`
 * `RunnerImageComponent.runnerUser()`
 * `RunnerImageComponent.git()`
 * `RunnerImageComponent.githubCli()`
 * `RunnerImageComponent.awsCli()`
 * `RunnerImageComponent.githubRunner()`
 * `RunnerImageComponent.lambdaEntrypoint()`

###### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.imageBuilder.parameter.scope"></a>

- *Type:* constructs.Construct

---

###### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.imageBuilder.parameter.id"></a>

- *Type:* string

---

###### `props`<sup>Optional</sup> <a name="props" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.imageBuilder.parameter.props"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps">RunnerImageBuilderProps</a>

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunner.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunner.property.connections">connections</a></code> | <code>aws-cdk-lib.aws_ec2.Connections</code> | The network connections associated with this resource. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunner.property.function">function</a></code> | <code>aws-cdk-lib.aws_lambda.Function</code> | The function hosting the GitHub runner. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunner.property.grantPrincipal">grantPrincipal</a></code> | <code>aws-cdk-lib.aws_iam.IPrincipal</code> | Grant principal used to add permissions to the runner role. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunner.property.image">image</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImage">RunnerImage</a></code> | Docker image loaded with GitHub Actions Runner and its prerequisites. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunner.property.labels">labels</a></code> | <code>string[]</code> | Labels associated with this provider. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunner.property.logGroup">logGroup</a></code> | <code>aws-cdk-lib.aws_logs.ILogGroup</code> | Log group where provided runners will save their logs. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunner.property.retryableErrors">retryableErrors</a></code> | <code>string[]</code> | List of step functions errors that should be retried. |

---

##### ~~`node`~~<sup>Required</sup> <a name="node" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.property.node"></a>

- *Deprecated:* use {@link LambdaRunnerProvider }

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### ~~`connections`~~<sup>Required</sup> <a name="connections" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.property.connections"></a>

- *Deprecated:* use {@link LambdaRunnerProvider }

```typescript
public readonly connections: Connections;
```

- *Type:* aws-cdk-lib.aws_ec2.Connections

The network connections associated with this resource.

---

##### ~~`function`~~<sup>Required</sup> <a name="function" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.property.function"></a>

- *Deprecated:* use {@link LambdaRunnerProvider }

```typescript
public readonly function: Function;
```

- *Type:* aws-cdk-lib.aws_lambda.Function

The function hosting the GitHub runner.

---

##### ~~`grantPrincipal`~~<sup>Required</sup> <a name="grantPrincipal" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.property.grantPrincipal"></a>

- *Deprecated:* use {@link LambdaRunnerProvider }

```typescript
public readonly grantPrincipal: IPrincipal;
```

- *Type:* aws-cdk-lib.aws_iam.IPrincipal

Grant principal used to add permissions to the runner role.

---

##### ~~`image`~~<sup>Required</sup> <a name="image" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.property.image"></a>

- *Deprecated:* use {@link LambdaRunnerProvider }

```typescript
public readonly image: RunnerImage;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerImage">RunnerImage</a>

Docker image loaded with GitHub Actions Runner and its prerequisites.

The image is built by an image builder and is specific to Lambda.

---

##### ~~`labels`~~<sup>Required</sup> <a name="labels" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.property.labels"></a>

- *Deprecated:* use {@link LambdaRunnerProvider }

```typescript
public readonly labels: string[];
```

- *Type:* string[]

Labels associated with this provider.

---

##### ~~`logGroup`~~<sup>Required</sup> <a name="logGroup" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.property.logGroup"></a>

- *Deprecated:* use {@link LambdaRunnerProvider }

```typescript
public readonly logGroup: ILogGroup;
```

- *Type:* aws-cdk-lib.aws_logs.ILogGroup

Log group where provided runners will save their logs.

Note that this is not the job log, but the runner itself. It will not contain output from the GitHub Action but only metadata on its execution.

---

##### ~~`retryableErrors`~~<sup>Required</sup> <a name="retryableErrors" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.property.retryableErrors"></a>

- *Deprecated:* use {@link LambdaRunnerProvider }

```typescript
public readonly retryableErrors: string[];
```

- *Type:* string[]

List of step functions errors that should be retried.

---

#### Constants <a name="Constants" id="Constants"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunner.property.LINUX_ARM64_DOCKERFILE_PATH">LINUX_ARM64_DOCKERFILE_PATH</a></code> | <code>string</code> | Path to Dockerfile for Linux ARM64 with all the requirement for Lambda runner. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunner.property.LINUX_X64_DOCKERFILE_PATH">LINUX_X64_DOCKERFILE_PATH</a></code> | <code>string</code> | Path to Dockerfile for Linux x64 with all the requirement for Lambda runner. |

---

##### ~~`LINUX_ARM64_DOCKERFILE_PATH`~~<sup>Required</sup> <a name="LINUX_ARM64_DOCKERFILE_PATH" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.property.LINUX_ARM64_DOCKERFILE_PATH"></a>

- *Deprecated:* Use `imageBuilder()` instead.

```typescript
public readonly LINUX_ARM64_DOCKERFILE_PATH: string;
```

- *Type:* string

Path to Dockerfile for Linux ARM64 with all the requirement for Lambda runner.

Use this Dockerfile unless you need to customize it further than allowed by hooks.

Available build arguments that can be set in the image builder:
* `BASE_IMAGE` sets the `FROM` line. This should be similar to public.ecr.aws/lambda/nodejs:14.
* `EXTRA_PACKAGES` can be used to install additional packages.

---

##### ~~`LINUX_X64_DOCKERFILE_PATH`~~<sup>Required</sup> <a name="LINUX_X64_DOCKERFILE_PATH" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.property.LINUX_X64_DOCKERFILE_PATH"></a>

- *Deprecated:* Use `imageBuilder()` instead.

```typescript
public readonly LINUX_X64_DOCKERFILE_PATH: string;
```

- *Type:* string

Path to Dockerfile for Linux x64 with all the requirement for Lambda runner.

Use this Dockerfile unless you need to customize it further than allowed by hooks.

Available build arguments that can be set in the image builder:
* `BASE_IMAGE` sets the `FROM` line. This should be similar to public.ecr.aws/lambda/nodejs:14.
* `EXTRA_PACKAGES` can be used to install additional packages.

---

### LambdaRunnerProvider <a name="LambdaRunnerProvider" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider"></a>

- *Implements:* <a href="#@cloudsnorkel/cdk-github-runners.IRunnerProvider">IRunnerProvider</a>

GitHub Actions runner provider using Lambda to execute jobs.

Creates a Docker-based function that gets executed for each job.

This construct is not meant to be used by itself. It should be passed in the providers property for GitHubRunners.

#### Initializers <a name="Initializers" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.Initializer"></a>

```typescript
import { LambdaRunnerProvider } from '@cloudsnorkel/cdk-github-runners'

new LambdaRunnerProvider(scope: Construct, id: string, props?: LambdaRunnerProviderProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.Initializer.parameter.id">id</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.Initializer.parameter.props">props</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProviderProps">LambdaRunnerProviderProps</a></code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.Initializer.parameter.id"></a>

- *Type:* string

---

##### `props`<sup>Optional</sup> <a name="props" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.Initializer.parameter.props"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProviderProps">LambdaRunnerProviderProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.getStepFunctionTask">getStepFunctionTask</a></code> | Generate step function task(s) to start a new runner. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.grantStateMachine">grantStateMachine</a></code> | An optional method that modifies the role of the state machine after all the tasks have been generated. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.status">status</a></code> | Return status of the runner provider to be used in the main status function. |

---

##### `toString` <a name="toString" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### `getStepFunctionTask` <a name="getStepFunctionTask" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.getStepFunctionTask"></a>

```typescript
public getStepFunctionTask(parameters: RunnerRuntimeParameters): IChainable
```

Generate step function task(s) to start a new runner.

Called by GithubRunners and shouldn't be called manually.

###### `parameters`<sup>Required</sup> <a name="parameters" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.getStepFunctionTask.parameter.parameters"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerRuntimeParameters">RunnerRuntimeParameters</a>

workflow job details.

---

##### `grantStateMachine` <a name="grantStateMachine" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.grantStateMachine"></a>

```typescript
public grantStateMachine(_: IGrantable): void
```

An optional method that modifies the role of the state machine after all the tasks have been generated.

This can be used to add additional policy
statements to the state machine role that are not automatically added by the task returned from {@link getStepFunctionTask}.

###### `_`<sup>Required</sup> <a name="_" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.grantStateMachine.parameter._"></a>

- *Type:* aws-cdk-lib.aws_iam.IGrantable

---

##### `status` <a name="status" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.status"></a>

```typescript
public status(statusFunctionRole: IGrantable): IRunnerProviderStatus
```

Return status of the runner provider to be used in the main status function.

Also gives the status function any needed permissions to query the Docker image or AMI.

###### `statusFunctionRole`<sup>Required</sup> <a name="statusFunctionRole" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.status.parameter.statusFunctionRole"></a>

- *Type:* aws-cdk-lib.aws_iam.IGrantable

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.imageBuilder">imageBuilder</a></code> | Create new image builder that builds Lambda specific runner images. |

---

##### ~~`isConstruct`~~ <a name="isConstruct" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.isConstruct"></a>

```typescript
import { LambdaRunnerProvider } from '@cloudsnorkel/cdk-github-runners'

LambdaRunnerProvider.isConstruct(x: any)
```

Checks if `x` is a construct.

###### `x`<sup>Required</sup> <a name="x" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

##### `imageBuilder` <a name="imageBuilder" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.imageBuilder"></a>

```typescript
import { LambdaRunnerProvider } from '@cloudsnorkel/cdk-github-runners'

LambdaRunnerProvider.imageBuilder(scope: Construct, id: string, props?: RunnerImageBuilderProps)
```

Create new image builder that builds Lambda specific runner images.

You can customize the OS, architecture, VPC, subnet, security groups, etc. by passing in props.

You can add components to the image builder by calling `imageBuilder.addComponent()`.

The default OS is Amazon Linux 2023 running on x64 architecture.

Included components:
 * `RunnerImageComponent.requiredPackages()`
 * `RunnerImageComponent.runnerUser()`
 * `RunnerImageComponent.git()`
 * `RunnerImageComponent.githubCli()`
 * `RunnerImageComponent.awsCli()`
 * `RunnerImageComponent.githubRunner()`
 * `RunnerImageComponent.lambdaEntrypoint()`

###### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.imageBuilder.parameter.scope"></a>

- *Type:* constructs.Construct

---

###### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.imageBuilder.parameter.id"></a>

- *Type:* string

---

###### `props`<sup>Optional</sup> <a name="props" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.imageBuilder.parameter.props"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps">RunnerImageBuilderProps</a>

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.property.connections">connections</a></code> | <code>aws-cdk-lib.aws_ec2.Connections</code> | The network connections associated with this resource. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.property.function">function</a></code> | <code>aws-cdk-lib.aws_lambda.Function</code> | The function hosting the GitHub runner. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.property.grantPrincipal">grantPrincipal</a></code> | <code>aws-cdk-lib.aws_iam.IPrincipal</code> | Grant principal used to add permissions to the runner role. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.property.image">image</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImage">RunnerImage</a></code> | Docker image loaded with GitHub Actions Runner and its prerequisites. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.property.labels">labels</a></code> | <code>string[]</code> | Labels associated with this provider. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.property.logGroup">logGroup</a></code> | <code>aws-cdk-lib.aws_logs.ILogGroup</code> | Log group where provided runners will save their logs. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.property.retryableErrors">retryableErrors</a></code> | <code>string[]</code> | List of step functions errors that should be retried. |

---

##### `node`<sup>Required</sup> <a name="node" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `connections`<sup>Required</sup> <a name="connections" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.property.connections"></a>

```typescript
public readonly connections: Connections;
```

- *Type:* aws-cdk-lib.aws_ec2.Connections

The network connections associated with this resource.

---

##### `function`<sup>Required</sup> <a name="function" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.property.function"></a>

```typescript
public readonly function: Function;
```

- *Type:* aws-cdk-lib.aws_lambda.Function

The function hosting the GitHub runner.

---

##### `grantPrincipal`<sup>Required</sup> <a name="grantPrincipal" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.property.grantPrincipal"></a>

```typescript
public readonly grantPrincipal: IPrincipal;
```

- *Type:* aws-cdk-lib.aws_iam.IPrincipal

Grant principal used to add permissions to the runner role.

---

##### `image`<sup>Required</sup> <a name="image" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.property.image"></a>

```typescript
public readonly image: RunnerImage;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerImage">RunnerImage</a>

Docker image loaded with GitHub Actions Runner and its prerequisites.

The image is built by an image builder and is specific to Lambda.

---

##### `labels`<sup>Required</sup> <a name="labels" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.property.labels"></a>

```typescript
public readonly labels: string[];
```

- *Type:* string[]

Labels associated with this provider.

---

##### `logGroup`<sup>Required</sup> <a name="logGroup" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.property.logGroup"></a>

```typescript
public readonly logGroup: ILogGroup;
```

- *Type:* aws-cdk-lib.aws_logs.ILogGroup

Log group where provided runners will save their logs.

Note that this is not the job log, but the runner itself. It will not contain output from the GitHub Action but only metadata on its execution.

---

##### `retryableErrors`<sup>Required</sup> <a name="retryableErrors" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.property.retryableErrors"></a>

```typescript
public readonly retryableErrors: string[];
```

- *Type:* string[]

List of step functions errors that should be retried.

---

#### Constants <a name="Constants" id="Constants"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.property.LINUX_ARM64_DOCKERFILE_PATH">LINUX_ARM64_DOCKERFILE_PATH</a></code> | <code>string</code> | Path to Dockerfile for Linux ARM64 with all the requirement for Lambda runner. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.property.LINUX_X64_DOCKERFILE_PATH">LINUX_X64_DOCKERFILE_PATH</a></code> | <code>string</code> | Path to Dockerfile for Linux x64 with all the requirement for Lambda runner. |

---

##### ~~`LINUX_ARM64_DOCKERFILE_PATH`~~<sup>Required</sup> <a name="LINUX_ARM64_DOCKERFILE_PATH" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.property.LINUX_ARM64_DOCKERFILE_PATH"></a>

- *Deprecated:* Use `imageBuilder()` instead.

```typescript
public readonly LINUX_ARM64_DOCKERFILE_PATH: string;
```

- *Type:* string

Path to Dockerfile for Linux ARM64 with all the requirement for Lambda runner.

Use this Dockerfile unless you need to customize it further than allowed by hooks.

Available build arguments that can be set in the image builder:
* `BASE_IMAGE` sets the `FROM` line. This should be similar to public.ecr.aws/lambda/nodejs:14.
* `EXTRA_PACKAGES` can be used to install additional packages.

---

##### ~~`LINUX_X64_DOCKERFILE_PATH`~~<sup>Required</sup> <a name="LINUX_X64_DOCKERFILE_PATH" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider.property.LINUX_X64_DOCKERFILE_PATH"></a>

- *Deprecated:* Use `imageBuilder()` instead.

```typescript
public readonly LINUX_X64_DOCKERFILE_PATH: string;
```

- *Type:* string

Path to Dockerfile for Linux x64 with all the requirement for Lambda runner.

Use this Dockerfile unless you need to customize it further than allowed by hooks.

Available build arguments that can be set in the image builder:
* `BASE_IMAGE` sets the `FROM` line. This should be similar to public.ecr.aws/lambda/nodejs:14.
* `EXTRA_PACKAGES` can be used to install additional packages.

---

### RunnerImageBuilder <a name="RunnerImageBuilder" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilder"></a>

- *Implements:* <a href="#@cloudsnorkel/cdk-github-runners.IConfigurableRunnerImageBuilder">IConfigurableRunnerImageBuilder</a>

GitHub Runner image builder. Builds a Docker image or AMI with GitHub Runner and other requirements installed.

Images can be customized before passed into the provider by adding or removing components to be installed.

Images are rebuilt every week by default to ensure that the latest security patches are applied.

#### Initializers <a name="Initializers" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilder.Initializer"></a>

```typescript
import { RunnerImageBuilder } from '@cloudsnorkel/cdk-github-runners'

new RunnerImageBuilder(scope: Construct, id: string, props?: RunnerImageBuilderProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilder.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilder.Initializer.parameter.id">id</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilder.Initializer.parameter.props">props</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps">RunnerImageBuilderProps</a></code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilder.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilder.Initializer.parameter.id"></a>

- *Type:* string

---

##### `props`<sup>Optional</sup> <a name="props" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilder.Initializer.parameter.props"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps">RunnerImageBuilderProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilder.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilder.addComponent">addComponent</a></code> | Add a component to the image builder. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilder.bindAmi">bindAmi</a></code> | Build and return an AMI with GitHub Runner installed in it. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilder.bindDockerImage">bindDockerImage</a></code> | Build and return a Docker image with GitHub Runner installed in it. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilder.removeComponent">removeComponent</a></code> | Remove a component from the image builder. |

---

##### `toString` <a name="toString" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilder.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### `addComponent` <a name="addComponent" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilder.addComponent"></a>

```typescript
public addComponent(component: RunnerImageComponent): void
```

Add a component to the image builder.

The component will be added to the end of the list of components.

###### `component`<sup>Required</sup> <a name="component" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilder.addComponent.parameter.component"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerImageComponent">RunnerImageComponent</a>

---

##### `bindAmi` <a name="bindAmi" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilder.bindAmi"></a>

```typescript
public bindAmi(): RunnerAmi
```

Build and return an AMI with GitHub Runner installed in it.

Anything that ends up with a launch template pointing to an AMI that runs GitHub self-hosted runners can be used. A simple implementation could even point to an existing AMI and nothing else.

The AMI can be further updated over time manually or using a schedule as long as it is always written to the same launch template.

##### `bindDockerImage` <a name="bindDockerImage" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilder.bindDockerImage"></a>

```typescript
public bindDockerImage(): RunnerImage
```

Build and return a Docker image with GitHub Runner installed in it.

Anything that ends up with an ECR repository containing a Docker image that runs GitHub self-hosted runners can be used. A simple implementation could even point to an existing image and nothing else.

It's important that the specified image tag be available at the time the repository is available. Providers usually assume the image is ready and will fail if it's not.

The image can be further updated over time manually or using a schedule as long as it is always written to the same tag.

##### `removeComponent` <a name="removeComponent" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilder.removeComponent"></a>

```typescript
public removeComponent(component: RunnerImageComponent): void
```

Remove a component from the image builder.

Removal is done by component name. Multiple components with the same name will all be removed.

###### `component`<sup>Required</sup> <a name="component" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilder.removeComponent.parameter.component"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerImageComponent">RunnerImageComponent</a>

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilder.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilder.new">new</a></code> | Create a new image builder based on the provided properties. |

---

##### ~~`isConstruct`~~ <a name="isConstruct" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilder.isConstruct"></a>

```typescript
import { RunnerImageBuilder } from '@cloudsnorkel/cdk-github-runners'

RunnerImageBuilder.isConstruct(x: any)
```

Checks if `x` is a construct.

###### `x`<sup>Required</sup> <a name="x" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilder.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

##### `new` <a name="new" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilder.new"></a>

```typescript
import { RunnerImageBuilder } from '@cloudsnorkel/cdk-github-runners'

RunnerImageBuilder.new(scope: Construct, id: string, props?: RunnerImageBuilderProps)
```

Create a new image builder based on the provided properties.

The implementation will differ based on the OS, architecture, and requested builder type.

###### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilder.new.parameter.scope"></a>

- *Type:* constructs.Construct

---

###### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilder.new.parameter.id"></a>

- *Type:* string

---

###### `props`<sup>Optional</sup> <a name="props" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilder.new.parameter.props"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps">RunnerImageBuilderProps</a>

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilder.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilder.property.connections">connections</a></code> | <code>aws-cdk-lib.aws_ec2.Connections</code> | The network connections associated with this resource. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilder.property.grantPrincipal">grantPrincipal</a></code> | <code>aws-cdk-lib.aws_iam.IPrincipal</code> | The principal to grant permissions to. |

---

##### `node`<sup>Required</sup> <a name="node" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilder.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `connections`<sup>Required</sup> <a name="connections" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilder.property.connections"></a>

```typescript
public readonly connections: Connections;
```

- *Type:* aws-cdk-lib.aws_ec2.Connections

The network connections associated with this resource.

---

##### `grantPrincipal`<sup>Required</sup> <a name="grantPrincipal" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilder.property.grantPrincipal"></a>

```typescript
public readonly grantPrincipal: IPrincipal;
```

- *Type:* aws-cdk-lib.aws_iam.IPrincipal

The principal to grant permissions to.

---


### Secrets <a name="Secrets" id="@cloudsnorkel/cdk-github-runners.Secrets"></a>

Secrets required for GitHub runners operation.

#### Initializers <a name="Initializers" id="@cloudsnorkel/cdk-github-runners.Secrets.Initializer"></a>

```typescript
import { Secrets } from '@cloudsnorkel/cdk-github-runners'

new Secrets(scope: Construct, id: string)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Secrets.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Secrets.Initializer.parameter.id">id</a></code> | <code>string</code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.Secrets.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.Secrets.Initializer.parameter.id"></a>

- *Type:* string

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Secrets.toString">toString</a></code> | Returns a string representation of this construct. |

---

##### `toString` <a name="toString" id="@cloudsnorkel/cdk-github-runners.Secrets.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Secrets.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |

---

##### ~~`isConstruct`~~ <a name="isConstruct" id="@cloudsnorkel/cdk-github-runners.Secrets.isConstruct"></a>

```typescript
import { Secrets } from '@cloudsnorkel/cdk-github-runners'

Secrets.isConstruct(x: any)
```

Checks if `x` is a construct.

###### `x`<sup>Required</sup> <a name="x" id="@cloudsnorkel/cdk-github-runners.Secrets.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Secrets.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Secrets.property.github">github</a></code> | <code>aws-cdk-lib.aws_secretsmanager.Secret</code> | Authentication secret for GitHub containing either app details or personal access token. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Secrets.property.githubPrivateKey">githubPrivateKey</a></code> | <code>aws-cdk-lib.aws_secretsmanager.Secret</code> | GitHub app private key. Not needed when using personal access tokens. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Secrets.property.setup">setup</a></code> | <code>aws-cdk-lib.aws_secretsmanager.Secret</code> | Setup secret used to authenticate user for our setup wizard. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Secrets.property.webhook">webhook</a></code> | <code>aws-cdk-lib.aws_secretsmanager.Secret</code> | Webhook secret used to confirm events are coming from GitHub and nowhere else. |

---

##### `node`<sup>Required</sup> <a name="node" id="@cloudsnorkel/cdk-github-runners.Secrets.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `github`<sup>Required</sup> <a name="github" id="@cloudsnorkel/cdk-github-runners.Secrets.property.github"></a>

```typescript
public readonly github: Secret;
```

- *Type:* aws-cdk-lib.aws_secretsmanager.Secret

Authentication secret for GitHub containing either app details or personal access token.

This secret is used to register runners and
cancel jobs when the runner fails to start.

This secret is meant to be edited by the user after being created.

---

##### `githubPrivateKey`<sup>Required</sup> <a name="githubPrivateKey" id="@cloudsnorkel/cdk-github-runners.Secrets.property.githubPrivateKey"></a>

```typescript
public readonly githubPrivateKey: Secret;
```

- *Type:* aws-cdk-lib.aws_secretsmanager.Secret

GitHub app private key. Not needed when using personal access tokens.

This secret is meant to be edited by the user after being created. It is separate than the main GitHub secret because inserting private keys into JSON is hard.

---

##### `setup`<sup>Required</sup> <a name="setup" id="@cloudsnorkel/cdk-github-runners.Secrets.property.setup"></a>

```typescript
public readonly setup: Secret;
```

- *Type:* aws-cdk-lib.aws_secretsmanager.Secret

Setup secret used to authenticate user for our setup wizard.

Should be empty after setup has been completed.

---

##### `webhook`<sup>Required</sup> <a name="webhook" id="@cloudsnorkel/cdk-github-runners.Secrets.property.webhook"></a>

```typescript
public readonly webhook: Secret;
```

- *Type:* aws-cdk-lib.aws_secretsmanager.Secret

Webhook secret used to confirm events are coming from GitHub and nowhere else.

---


## Structs <a name="Structs" id="Structs"></a>

### AmiBuilderProps <a name="AmiBuilderProps" id="@cloudsnorkel/cdk-github-runners.AmiBuilderProps"></a>

Properties for {@link AmiBuilder} construct.

#### Initializer <a name="Initializer" id="@cloudsnorkel/cdk-github-runners.AmiBuilderProps.Initializer"></a>

```typescript
import { AmiBuilderProps } from '@cloudsnorkel/cdk-github-runners'

const amiBuilderProps: AmiBuilderProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.AmiBuilderProps.property.architecture">architecture</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.Architecture">Architecture</a></code> | Image architecture. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.AmiBuilderProps.property.installDocker">installDocker</a></code> | <code>boolean</code> | Install Docker inside the image, so it can be used by the runner. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.AmiBuilderProps.property.instanceType">instanceType</a></code> | <code>aws-cdk-lib.aws_ec2.InstanceType</code> | The instance type used to build the image. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.AmiBuilderProps.property.logRemovalPolicy">logRemovalPolicy</a></code> | <code>aws-cdk-lib.RemovalPolicy</code> | Removal policy for logs of image builds. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.AmiBuilderProps.property.logRetention">logRetention</a></code> | <code>aws-cdk-lib.aws_logs.RetentionDays</code> | The number of days log events are kept in CloudWatch Logs. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.AmiBuilderProps.property.os">os</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.Os">Os</a></code> | Image OS. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.AmiBuilderProps.property.rebuildInterval">rebuildInterval</a></code> | <code>aws-cdk-lib.Duration</code> | Schedule the AMI to be rebuilt every given interval. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.AmiBuilderProps.property.runnerVersion">runnerVersion</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerVersion">RunnerVersion</a></code> | Version of GitHub Runners to install. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.AmiBuilderProps.property.securityGroup">securityGroup</a></code> | <code>aws-cdk-lib.aws_ec2.ISecurityGroup</code> | Security group to assign to launched builder instances. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.AmiBuilderProps.property.securityGroups">securityGroups</a></code> | <code>aws-cdk-lib.aws_ec2.ISecurityGroup[]</code> | Security groups to assign to launched builder instances. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.AmiBuilderProps.property.subnetSelection">subnetSelection</a></code> | <code>aws-cdk-lib.aws_ec2.SubnetSelection</code> | Where to place the network interfaces within the VPC. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.AmiBuilderProps.property.vpc">vpc</a></code> | <code>aws-cdk-lib.aws_ec2.IVpc</code> | VPC where builder instances will be launched. |

---

##### `architecture`<sup>Optional</sup> <a name="architecture" id="@cloudsnorkel/cdk-github-runners.AmiBuilderProps.property.architecture"></a>

```typescript
public readonly architecture: Architecture;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Architecture">Architecture</a>
- *Default:* Architecture.X86_64

Image architecture.

---

##### `installDocker`<sup>Optional</sup> <a name="installDocker" id="@cloudsnorkel/cdk-github-runners.AmiBuilderProps.property.installDocker"></a>

```typescript
public readonly installDocker: boolean;
```

- *Type:* boolean
- *Default:* true

Install Docker inside the image, so it can be used by the runner.

---

##### `instanceType`<sup>Optional</sup> <a name="instanceType" id="@cloudsnorkel/cdk-github-runners.AmiBuilderProps.property.instanceType"></a>

```typescript
public readonly instanceType: InstanceType;
```

- *Type:* aws-cdk-lib.aws_ec2.InstanceType
- *Default:* m6i.large

The instance type used to build the image.

---

##### `logRemovalPolicy`<sup>Optional</sup> <a name="logRemovalPolicy" id="@cloudsnorkel/cdk-github-runners.AmiBuilderProps.property.logRemovalPolicy"></a>

```typescript
public readonly logRemovalPolicy: RemovalPolicy;
```

- *Type:* aws-cdk-lib.RemovalPolicy
- *Default:* RemovalPolicy.DESTROY

Removal policy for logs of image builds.

If deployment fails on the custom resource, try setting this to `RemovalPolicy.RETAIN`. This way the logs can still be viewed, and you can see why the build failed.

We try to not leave anything behind when removed. But sometimes a log staying behind is useful.

---

##### `logRetention`<sup>Optional</sup> <a name="logRetention" id="@cloudsnorkel/cdk-github-runners.AmiBuilderProps.property.logRetention"></a>

```typescript
public readonly logRetention: RetentionDays;
```

- *Type:* aws-cdk-lib.aws_logs.RetentionDays
- *Default:* logs.RetentionDays.ONE_MONTH

The number of days log events are kept in CloudWatch Logs.

When updating
this property, unsetting it doesn't remove the log retention policy. To
remove the retention policy, set the value to `INFINITE`.

---

##### `os`<sup>Optional</sup> <a name="os" id="@cloudsnorkel/cdk-github-runners.AmiBuilderProps.property.os"></a>

```typescript
public readonly os: Os;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Os">Os</a>
- *Default:* OS.LINUX

Image OS.

---

##### `rebuildInterval`<sup>Optional</sup> <a name="rebuildInterval" id="@cloudsnorkel/cdk-github-runners.AmiBuilderProps.property.rebuildInterval"></a>

```typescript
public readonly rebuildInterval: Duration;
```

- *Type:* aws-cdk-lib.Duration
- *Default:* Duration.days(7)

Schedule the AMI to be rebuilt every given interval.

Useful for keeping the AMI up-do-date with the latest GitHub runner version and latest OS updates.

Set to zero to disable.

---

##### `runnerVersion`<sup>Optional</sup> <a name="runnerVersion" id="@cloudsnorkel/cdk-github-runners.AmiBuilderProps.property.runnerVersion"></a>

```typescript
public readonly runnerVersion: RunnerVersion;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerVersion">RunnerVersion</a>
- *Default:* latest version available

Version of GitHub Runners to install.

---

##### ~~`securityGroup`~~<sup>Optional</sup> <a name="securityGroup" id="@cloudsnorkel/cdk-github-runners.AmiBuilderProps.property.securityGroup"></a>

- *Deprecated:* use {@link securityGroups }

```typescript
public readonly securityGroup: ISecurityGroup;
```

- *Type:* aws-cdk-lib.aws_ec2.ISecurityGroup
- *Default:* new security group

Security group to assign to launched builder instances.

---

##### `securityGroups`<sup>Optional</sup> <a name="securityGroups" id="@cloudsnorkel/cdk-github-runners.AmiBuilderProps.property.securityGroups"></a>

```typescript
public readonly securityGroups: ISecurityGroup[];
```

- *Type:* aws-cdk-lib.aws_ec2.ISecurityGroup[]
- *Default:* new security group

Security groups to assign to launched builder instances.

---

##### `subnetSelection`<sup>Optional</sup> <a name="subnetSelection" id="@cloudsnorkel/cdk-github-runners.AmiBuilderProps.property.subnetSelection"></a>

```typescript
public readonly subnetSelection: SubnetSelection;
```

- *Type:* aws-cdk-lib.aws_ec2.SubnetSelection
- *Default:* default VPC subnet

Where to place the network interfaces within the VPC.

Only the first matched subnet will be used.

---

##### `vpc`<sup>Optional</sup> <a name="vpc" id="@cloudsnorkel/cdk-github-runners.AmiBuilderProps.property.vpc"></a>

```typescript
public readonly vpc: IVpc;
```

- *Type:* aws-cdk-lib.aws_ec2.IVpc
- *Default:* default account VPC

VPC where builder instances will be launched.

---

### ApiGatewayAccessProps <a name="ApiGatewayAccessProps" id="@cloudsnorkel/cdk-github-runners.ApiGatewayAccessProps"></a>

#### Initializer <a name="Initializer" id="@cloudsnorkel/cdk-github-runners.ApiGatewayAccessProps.Initializer"></a>

```typescript
import { ApiGatewayAccessProps } from '@cloudsnorkel/cdk-github-runners'

const apiGatewayAccessProps: ApiGatewayAccessProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ApiGatewayAccessProps.property.allowedIps">allowedIps</a></code> | <code>string[]</code> | List of IP addresses in CIDR notation that are allowed to access the API Gateway. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ApiGatewayAccessProps.property.allowedSecurityGroups">allowedSecurityGroups</a></code> | <code>aws-cdk-lib.aws_ec2.ISecurityGroup[]</code> | List of security groups that are allowed to access the API Gateway. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ApiGatewayAccessProps.property.allowedVpc">allowedVpc</a></code> | <code>aws-cdk-lib.aws_ec2.IVpc</code> | Create a private API Gateway and allow access from the specified VPC. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ApiGatewayAccessProps.property.allowedVpcEndpoints">allowedVpcEndpoints</a></code> | <code>aws-cdk-lib.aws_ec2.IVpcEndpoint[]</code> | Create a private API Gateway and allow access from the specified VPC endpoints. |

---

##### `allowedIps`<sup>Optional</sup> <a name="allowedIps" id="@cloudsnorkel/cdk-github-runners.ApiGatewayAccessProps.property.allowedIps"></a>

```typescript
public readonly allowedIps: string[];
```

- *Type:* string[]

List of IP addresses in CIDR notation that are allowed to access the API Gateway.

If not specified on public API Gateway, all IP addresses are allowed.

If not specified on private API Gateway, no IP addresses are allowed (but specified security groups are).

---

##### `allowedSecurityGroups`<sup>Optional</sup> <a name="allowedSecurityGroups" id="@cloudsnorkel/cdk-github-runners.ApiGatewayAccessProps.property.allowedSecurityGroups"></a>

```typescript
public readonly allowedSecurityGroups: ISecurityGroup[];
```

- *Type:* aws-cdk-lib.aws_ec2.ISecurityGroup[]

List of security groups that are allowed to access the API Gateway.

Only works for private API Gateways with {@link allowedVpc}.

---

##### `allowedVpc`<sup>Optional</sup> <a name="allowedVpc" id="@cloudsnorkel/cdk-github-runners.ApiGatewayAccessProps.property.allowedVpc"></a>

```typescript
public readonly allowedVpc: IVpc;
```

- *Type:* aws-cdk-lib.aws_ec2.IVpc

Create a private API Gateway and allow access from the specified VPC.

---

##### `allowedVpcEndpoints`<sup>Optional</sup> <a name="allowedVpcEndpoints" id="@cloudsnorkel/cdk-github-runners.ApiGatewayAccessProps.property.allowedVpcEndpoints"></a>

```typescript
public readonly allowedVpcEndpoints: IVpcEndpoint[];
```

- *Type:* aws-cdk-lib.aws_ec2.IVpcEndpoint[]

Create a private API Gateway and allow access from the specified VPC endpoints.

Use this to make use of existing VPC endpoints or to share an endpoint between multiple functions. The VPC endpoint must point to `ec2.InterfaceVpcEndpointAwsService.APIGATEWAY`.

No other settings are supported when using this option.

All endpoints will be allowed access, but only the first one will be used as the URL by the runner system for setting up the webhook, and as setup URL.

---

### AwsImageBuilderRunnerImageBuilderProps <a name="AwsImageBuilderRunnerImageBuilderProps" id="@cloudsnorkel/cdk-github-runners.AwsImageBuilderRunnerImageBuilderProps"></a>

#### Initializer <a name="Initializer" id="@cloudsnorkel/cdk-github-runners.AwsImageBuilderRunnerImageBuilderProps.Initializer"></a>

```typescript
import { AwsImageBuilderRunnerImageBuilderProps } from '@cloudsnorkel/cdk-github-runners'

const awsImageBuilderRunnerImageBuilderProps: AwsImageBuilderRunnerImageBuilderProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.AwsImageBuilderRunnerImageBuilderProps.property.fastLaunchOptions">fastLaunchOptions</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.FastLaunchOptions">FastLaunchOptions</a></code> | Options for fast launch. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.AwsImageBuilderRunnerImageBuilderProps.property.instanceType">instanceType</a></code> | <code>aws-cdk-lib.aws_ec2.InstanceType</code> | The instance type used to build the image. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.AwsImageBuilderRunnerImageBuilderProps.property.storageSize">storageSize</a></code> | <code>aws-cdk-lib.Size</code> | Size of volume available for builder instances. This modifies the boot volume size and doesn't add any additional volumes. |

---

##### `fastLaunchOptions`<sup>Optional</sup> <a name="fastLaunchOptions" id="@cloudsnorkel/cdk-github-runners.AwsImageBuilderRunnerImageBuilderProps.property.fastLaunchOptions"></a>

```typescript
public readonly fastLaunchOptions: FastLaunchOptions;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.FastLaunchOptions">FastLaunchOptions</a>
- *Default:* disabled

Options for fast launch.

This is only supported for Windows AMIs.

---

##### `instanceType`<sup>Optional</sup> <a name="instanceType" id="@cloudsnorkel/cdk-github-runners.AwsImageBuilderRunnerImageBuilderProps.property.instanceType"></a>

```typescript
public readonly instanceType: InstanceType;
```

- *Type:* aws-cdk-lib.aws_ec2.InstanceType
- *Default:* m6i.large

The instance type used to build the image.

---

##### `storageSize`<sup>Optional</sup> <a name="storageSize" id="@cloudsnorkel/cdk-github-runners.AwsImageBuilderRunnerImageBuilderProps.property.storageSize"></a>

```typescript
public readonly storageSize: Size;
```

- *Type:* aws-cdk-lib.Size
- *Default:* default size for AMI (usually 30GB for Linux and 50GB for Windows)

Size of volume available for builder instances. This modifies the boot volume size and doesn't add any additional volumes.

Use this if you're building images with big components and need more space.

---

### CodeBuildImageBuilderProps <a name="CodeBuildImageBuilderProps" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilderProps"></a>

Properties for CodeBuildImageBuilder construct.

#### Initializer <a name="Initializer" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilderProps.Initializer"></a>

```typescript
import { CodeBuildImageBuilderProps } from '@cloudsnorkel/cdk-github-runners'

const codeBuildImageBuilderProps: CodeBuildImageBuilderProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilderProps.property.dockerfilePath">dockerfilePath</a></code> | <code>string</code> | Path to Dockerfile to be built. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilderProps.property.architecture">architecture</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.Architecture">Architecture</a></code> | Image architecture. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilderProps.property.buildImage">buildImage</a></code> | <code>aws-cdk-lib.aws_codebuild.IBuildImage</code> | Build image to use in CodeBuild. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilderProps.property.computeType">computeType</a></code> | <code>aws-cdk-lib.aws_codebuild.ComputeType</code> | The type of compute to use for this build. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilderProps.property.logRemovalPolicy">logRemovalPolicy</a></code> | <code>aws-cdk-lib.RemovalPolicy</code> | Removal policy for logs of image builds. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilderProps.property.logRetention">logRetention</a></code> | <code>aws-cdk-lib.aws_logs.RetentionDays</code> | The number of days log events are kept in CloudWatch Logs. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilderProps.property.os">os</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.Os">Os</a></code> | Image OS. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilderProps.property.rebuildInterval">rebuildInterval</a></code> | <code>aws-cdk-lib.Duration</code> | Schedule the image to be rebuilt every given interval. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilderProps.property.runnerVersion">runnerVersion</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerVersion">RunnerVersion</a></code> | Version of GitHub Runners to install. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilderProps.property.securityGroup">securityGroup</a></code> | <code>aws-cdk-lib.aws_ec2.ISecurityGroup</code> | Security Group to assign to this instance. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilderProps.property.subnetSelection">subnetSelection</a></code> | <code>aws-cdk-lib.aws_ec2.SubnetSelection</code> | Where to place the network interfaces within the VPC. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilderProps.property.timeout">timeout</a></code> | <code>aws-cdk-lib.Duration</code> | The number of minutes after which AWS CodeBuild stops the build if it's not complete. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilderProps.property.vpc">vpc</a></code> | <code>aws-cdk-lib.aws_ec2.IVpc</code> | VPC to build the image in. |

---

##### `dockerfilePath`<sup>Required</sup> <a name="dockerfilePath" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilderProps.property.dockerfilePath"></a>

```typescript
public readonly dockerfilePath: string;
```

- *Type:* string

Path to Dockerfile to be built.

It can be a path to a Dockerfile, a folder containing a Dockerfile, or a zip file containing a Dockerfile.

---

##### `architecture`<sup>Optional</sup> <a name="architecture" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilderProps.property.architecture"></a>

```typescript
public readonly architecture: Architecture;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Architecture">Architecture</a>
- *Default:* Architecture.X86_64

Image architecture.

---

##### `buildImage`<sup>Optional</sup> <a name="buildImage" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilderProps.property.buildImage"></a>

```typescript
public readonly buildImage: IBuildImage;
```

- *Type:* aws-cdk-lib.aws_codebuild.IBuildImage
- *Default:* Ubuntu 22.04 for x64 and Amazon Linux 2 for ARM64

Build image to use in CodeBuild.

This is the image that's going to run the code that builds the runner image.

The only action taken in CodeBuild is running `docker build`. You would therefore not need to change this setting often.

---

##### `computeType`<sup>Optional</sup> <a name="computeType" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilderProps.property.computeType"></a>

```typescript
public readonly computeType: ComputeType;
```

- *Type:* aws-cdk-lib.aws_codebuild.ComputeType
- *Default:* {@link ComputeType#SMALL }

The type of compute to use for this build.

See the {@link ComputeType} enum for the possible values.

---

##### `logRemovalPolicy`<sup>Optional</sup> <a name="logRemovalPolicy" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilderProps.property.logRemovalPolicy"></a>

```typescript
public readonly logRemovalPolicy: RemovalPolicy;
```

- *Type:* aws-cdk-lib.RemovalPolicy
- *Default:* RemovalPolicy.DESTROY

Removal policy for logs of image builds.

If deployment fails on the custom resource, try setting this to `RemovalPolicy.RETAIN`. This way the CodeBuild logs can still be viewed, and you can see why the build failed.

We try to not leave anything behind when removed. But sometimes a log staying behind is useful.

---

##### `logRetention`<sup>Optional</sup> <a name="logRetention" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilderProps.property.logRetention"></a>

```typescript
public readonly logRetention: RetentionDays;
```

- *Type:* aws-cdk-lib.aws_logs.RetentionDays
- *Default:* logs.RetentionDays.ONE_MONTH

The number of days log events are kept in CloudWatch Logs.

When updating
this property, unsetting it doesn't remove the log retention policy. To
remove the retention policy, set the value to `INFINITE`.

---

##### `os`<sup>Optional</sup> <a name="os" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilderProps.property.os"></a>

```typescript
public readonly os: Os;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Os">Os</a>
- *Default:* OS.LINUX

Image OS.

---

##### `rebuildInterval`<sup>Optional</sup> <a name="rebuildInterval" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilderProps.property.rebuildInterval"></a>

```typescript
public readonly rebuildInterval: Duration;
```

- *Type:* aws-cdk-lib.Duration
- *Default:* Duration.days(7)

Schedule the image to be rebuilt every given interval.

Useful for keeping the image up-do-date with the latest GitHub runner version and latest OS updates.

Set to zero to disable.

---

##### `runnerVersion`<sup>Optional</sup> <a name="runnerVersion" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilderProps.property.runnerVersion"></a>

```typescript
public readonly runnerVersion: RunnerVersion;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerVersion">RunnerVersion</a>
- *Default:* latest version available

Version of GitHub Runners to install.

---

##### `securityGroup`<sup>Optional</sup> <a name="securityGroup" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilderProps.property.securityGroup"></a>

```typescript
public readonly securityGroup: ISecurityGroup;
```

- *Type:* aws-cdk-lib.aws_ec2.ISecurityGroup
- *Default:* public project with no security group

Security Group to assign to this instance.

---

##### `subnetSelection`<sup>Optional</sup> <a name="subnetSelection" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilderProps.property.subnetSelection"></a>

```typescript
public readonly subnetSelection: SubnetSelection;
```

- *Type:* aws-cdk-lib.aws_ec2.SubnetSelection
- *Default:* no subnet

Where to place the network interfaces within the VPC.

---

##### `timeout`<sup>Optional</sup> <a name="timeout" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilderProps.property.timeout"></a>

```typescript
public readonly timeout: Duration;
```

- *Type:* aws-cdk-lib.Duration
- *Default:* Duration.hours(1)

The number of minutes after which AWS CodeBuild stops the build if it's not complete.

For valid values, see the timeoutInMinutes field in the AWS
CodeBuild User Guide.

---

##### `vpc`<sup>Optional</sup> <a name="vpc" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilderProps.property.vpc"></a>

```typescript
public readonly vpc: IVpc;
```

- *Type:* aws-cdk-lib.aws_ec2.IVpc
- *Default:* no VPC

VPC to build the image in.

---

### CodeBuildRunnerImageBuilderProps <a name="CodeBuildRunnerImageBuilderProps" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerImageBuilderProps"></a>

#### Initializer <a name="Initializer" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerImageBuilderProps.Initializer"></a>

```typescript
import { CodeBuildRunnerImageBuilderProps } from '@cloudsnorkel/cdk-github-runners'

const codeBuildRunnerImageBuilderProps: CodeBuildRunnerImageBuilderProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerImageBuilderProps.property.buildImage">buildImage</a></code> | <code>aws-cdk-lib.aws_codebuild.IBuildImage</code> | Build image to use in CodeBuild. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerImageBuilderProps.property.computeType">computeType</a></code> | <code>aws-cdk-lib.aws_codebuild.ComputeType</code> | The type of compute to use for this build. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerImageBuilderProps.property.timeout">timeout</a></code> | <code>aws-cdk-lib.Duration</code> | The number of minutes after which AWS CodeBuild stops the build if it's not complete. |

---

##### `buildImage`<sup>Optional</sup> <a name="buildImage" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerImageBuilderProps.property.buildImage"></a>

```typescript
public readonly buildImage: IBuildImage;
```

- *Type:* aws-cdk-lib.aws_codebuild.IBuildImage
- *Default:* Amazon Linux 2023

Build image to use in CodeBuild.

This is the image that's going to run the code that builds the runner image.

The only action taken in CodeBuild is running `docker build`. You would therefore not need to change this setting often.

---

##### `computeType`<sup>Optional</sup> <a name="computeType" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerImageBuilderProps.property.computeType"></a>

```typescript
public readonly computeType: ComputeType;
```

- *Type:* aws-cdk-lib.aws_codebuild.ComputeType
- *Default:* {@link ComputeType#SMALL }

The type of compute to use for this build.

See the {@link ComputeType} enum for the possible values.

---

##### `timeout`<sup>Optional</sup> <a name="timeout" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerImageBuilderProps.property.timeout"></a>

```typescript
public readonly timeout: Duration;
```

- *Type:* aws-cdk-lib.Duration
- *Default:* Duration.hours(1)

The number of minutes after which AWS CodeBuild stops the build if it's not complete.

For valid values, see the timeoutInMinutes field in the AWS
CodeBuild User Guide.

---

### CodeBuildRunnerProviderProps <a name="CodeBuildRunnerProviderProps" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProviderProps"></a>

#### Initializer <a name="Initializer" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProviderProps.Initializer"></a>

```typescript
import { CodeBuildRunnerProviderProps } from '@cloudsnorkel/cdk-github-runners'

const codeBuildRunnerProviderProps: CodeBuildRunnerProviderProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProviderProps.property.logRetention">logRetention</a></code> | <code>aws-cdk-lib.aws_logs.RetentionDays</code> | The number of days log events are kept in CloudWatch Logs. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProviderProps.property.retryOptions">retryOptions</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.ProviderRetryOptions">ProviderRetryOptions</a></code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProviderProps.property.computeType">computeType</a></code> | <code>aws-cdk-lib.aws_codebuild.ComputeType</code> | The type of compute to use for this build. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProviderProps.property.dockerInDocker">dockerInDocker</a></code> | <code>boolean</code> | Support building and running Docker images by enabling Docker-in-Docker (dind) and the required CodeBuild privileged mode. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProviderProps.property.group">group</a></code> | <code>string</code> | GitHub Actions runner group name. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProviderProps.property.imageBuilder">imageBuilder</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.IRunnerImageBuilder">IRunnerImageBuilder</a></code> | Runner image builder used to build Docker images containing GitHub Runner and all requirements. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProviderProps.property.label">label</a></code> | <code>string</code> | GitHub Actions label used for this provider. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProviderProps.property.labels">labels</a></code> | <code>string[]</code> | GitHub Actions labels used for this provider. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProviderProps.property.securityGroup">securityGroup</a></code> | <code>aws-cdk-lib.aws_ec2.ISecurityGroup</code> | Security group to assign to this instance. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProviderProps.property.securityGroups">securityGroups</a></code> | <code>aws-cdk-lib.aws_ec2.ISecurityGroup[]</code> | Security groups to assign to this instance. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProviderProps.property.subnetSelection">subnetSelection</a></code> | <code>aws-cdk-lib.aws_ec2.SubnetSelection</code> | Where to place the network interfaces within the VPC. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProviderProps.property.timeout">timeout</a></code> | <code>aws-cdk-lib.Duration</code> | The number of minutes after which AWS CodeBuild stops the build if it's not complete. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProviderProps.property.vpc">vpc</a></code> | <code>aws-cdk-lib.aws_ec2.IVpc</code> | VPC to launch the runners in. |

---

##### `logRetention`<sup>Optional</sup> <a name="logRetention" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProviderProps.property.logRetention"></a>

```typescript
public readonly logRetention: RetentionDays;
```

- *Type:* aws-cdk-lib.aws_logs.RetentionDays
- *Default:* logs.RetentionDays.ONE_MONTH

The number of days log events are kept in CloudWatch Logs.

When updating
this property, unsetting it doesn't remove the log retention policy. To
remove the retention policy, set the value to `INFINITE`.

---

##### ~~`retryOptions`~~<sup>Optional</sup> <a name="retryOptions" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProviderProps.property.retryOptions"></a>

- *Deprecated:* use {@link retryOptions } on {@link GitHubRunners } instead

```typescript
public readonly retryOptions: ProviderRetryOptions;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.ProviderRetryOptions">ProviderRetryOptions</a>

---

##### `computeType`<sup>Optional</sup> <a name="computeType" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProviderProps.property.computeType"></a>

```typescript
public readonly computeType: ComputeType;
```

- *Type:* aws-cdk-lib.aws_codebuild.ComputeType
- *Default:* {@link ComputeType#SMALL }

The type of compute to use for this build.

See the {@link ComputeType} enum for the possible values.

---

##### `dockerInDocker`<sup>Optional</sup> <a name="dockerInDocker" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProviderProps.property.dockerInDocker"></a>

```typescript
public readonly dockerInDocker: boolean;
```

- *Type:* boolean
- *Default:* true

Support building and running Docker images by enabling Docker-in-Docker (dind) and the required CodeBuild privileged mode.

Disabling this can
speed up provisioning of CodeBuild runners. If you don't intend on running or building Docker images, disable this for faster start-up times.

---

##### `group`<sup>Optional</sup> <a name="group" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProviderProps.property.group"></a>

```typescript
public readonly group: string;
```

- *Type:* string
- *Default:* undefined

GitHub Actions runner group name.

If specified, the runner will be registered with this group name. Setting a runner group can help managing access to self-hosted runners. It
requires a paid GitHub account.

The group must exist or the runner will not start.

Users will still be able to trigger this runner with the correct labels. But the runner will only be able to run jobs from repos allowed to use the group.

---

##### `imageBuilder`<sup>Optional</sup> <a name="imageBuilder" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProviderProps.property.imageBuilder"></a>

```typescript
public readonly imageBuilder: IRunnerImageBuilder;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.IRunnerImageBuilder">IRunnerImageBuilder</a>
- *Default:* CodeBuildRunnerProvider.imageBuilder()

Runner image builder used to build Docker images containing GitHub Runner and all requirements.

The image builder must contain the {@link RunnerImageComponent.docker} component unless `dockerInDocker` is set to false.

The image builder determines the OS and architecture of the runner.

---

##### ~~`label`~~<sup>Optional</sup> <a name="label" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProviderProps.property.label"></a>

- *Deprecated:* use {@link labels } instead

```typescript
public readonly label: string;
```

- *Type:* string
- *Default:* undefined

GitHub Actions label used for this provider.

---

##### `labels`<sup>Optional</sup> <a name="labels" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProviderProps.property.labels"></a>

```typescript
public readonly labels: string[];
```

- *Type:* string[]
- *Default:* ['codebuild']

GitHub Actions labels used for this provider.

These labels are used to identify which provider should spawn a new on-demand runner. Every job sends a webhook with the labels it's looking for
based on runs-on. We match the labels from the webhook with the labels specified here. If all the labels specified here are present in the
job's labels, this provider will be chosen and spawn a new runner.

---

##### ~~`securityGroup`~~<sup>Optional</sup> <a name="securityGroup" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProviderProps.property.securityGroup"></a>

- *Deprecated:* use {@link securityGroups }

```typescript
public readonly securityGroup: ISecurityGroup;
```

- *Type:* aws-cdk-lib.aws_ec2.ISecurityGroup
- *Default:* public project with no security group

Security group to assign to this instance.

---

##### `securityGroups`<sup>Optional</sup> <a name="securityGroups" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProviderProps.property.securityGroups"></a>

```typescript
public readonly securityGroups: ISecurityGroup[];
```

- *Type:* aws-cdk-lib.aws_ec2.ISecurityGroup[]
- *Default:* a new security group, if {@link vpc } is used

Security groups to assign to this instance.

---

##### `subnetSelection`<sup>Optional</sup> <a name="subnetSelection" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProviderProps.property.subnetSelection"></a>

```typescript
public readonly subnetSelection: SubnetSelection;
```

- *Type:* aws-cdk-lib.aws_ec2.SubnetSelection
- *Default:* no subnet

Where to place the network interfaces within the VPC.

---

##### `timeout`<sup>Optional</sup> <a name="timeout" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProviderProps.property.timeout"></a>

```typescript
public readonly timeout: Duration;
```

- *Type:* aws-cdk-lib.Duration
- *Default:* Duration.hours(1)

The number of minutes after which AWS CodeBuild stops the build if it's not complete.

For valid values, see the timeoutInMinutes field in the AWS
CodeBuild User Guide.

---

##### `vpc`<sup>Optional</sup> <a name="vpc" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProviderProps.property.vpc"></a>

```typescript
public readonly vpc: IVpc;
```

- *Type:* aws-cdk-lib.aws_ec2.IVpc
- *Default:* no VPC

VPC to launch the runners in.

---

### ContainerImageBuilderProps <a name="ContainerImageBuilderProps" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilderProps"></a>

Properties for ContainerImageBuilder construct.

#### Initializer <a name="Initializer" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilderProps.Initializer"></a>

```typescript
import { ContainerImageBuilderProps } from '@cloudsnorkel/cdk-github-runners'

const containerImageBuilderProps: ContainerImageBuilderProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ContainerImageBuilderProps.property.architecture">architecture</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.Architecture">Architecture</a></code> | Image architecture. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ContainerImageBuilderProps.property.instanceType">instanceType</a></code> | <code>aws-cdk-lib.aws_ec2.InstanceType</code> | The instance type used to build the image. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ContainerImageBuilderProps.property.logRemovalPolicy">logRemovalPolicy</a></code> | <code>aws-cdk-lib.RemovalPolicy</code> | Removal policy for logs of image builds. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ContainerImageBuilderProps.property.logRetention">logRetention</a></code> | <code>aws-cdk-lib.aws_logs.RetentionDays</code> | The number of days log events are kept in CloudWatch Logs. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ContainerImageBuilderProps.property.os">os</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.Os">Os</a></code> | Image OS. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ContainerImageBuilderProps.property.parentImage">parentImage</a></code> | <code>string</code> | Parent image for the new Docker Image. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ContainerImageBuilderProps.property.rebuildInterval">rebuildInterval</a></code> | <code>aws-cdk-lib.Duration</code> | Schedule the image to be rebuilt every given interval. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ContainerImageBuilderProps.property.runnerVersion">runnerVersion</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerVersion">RunnerVersion</a></code> | Version of GitHub Runners to install. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ContainerImageBuilderProps.property.securityGroup">securityGroup</a></code> | <code>aws-cdk-lib.aws_ec2.ISecurityGroup</code> | Security group to assign to launched builder instances. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ContainerImageBuilderProps.property.securityGroups">securityGroups</a></code> | <code>aws-cdk-lib.aws_ec2.ISecurityGroup[]</code> | Security groups to assign to launched builder instances. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ContainerImageBuilderProps.property.subnetSelection">subnetSelection</a></code> | <code>aws-cdk-lib.aws_ec2.SubnetSelection</code> | Where to place the network interfaces within the VPC. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ContainerImageBuilderProps.property.vpc">vpc</a></code> | <code>aws-cdk-lib.aws_ec2.IVpc</code> | VPC to launch the runners in. |

---

##### `architecture`<sup>Optional</sup> <a name="architecture" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilderProps.property.architecture"></a>

```typescript
public readonly architecture: Architecture;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Architecture">Architecture</a>
- *Default:* Architecture.X86_64

Image architecture.

---

##### `instanceType`<sup>Optional</sup> <a name="instanceType" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilderProps.property.instanceType"></a>

```typescript
public readonly instanceType: InstanceType;
```

- *Type:* aws-cdk-lib.aws_ec2.InstanceType
- *Default:* m6i.large

The instance type used to build the image.

---

##### `logRemovalPolicy`<sup>Optional</sup> <a name="logRemovalPolicy" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilderProps.property.logRemovalPolicy"></a>

```typescript
public readonly logRemovalPolicy: RemovalPolicy;
```

- *Type:* aws-cdk-lib.RemovalPolicy
- *Default:* RemovalPolicy.DESTROY

Removal policy for logs of image builds.

If deployment fails on the custom resource, try setting this to `RemovalPolicy.RETAIN`. This way the CodeBuild logs can still be viewed, and you can see why the build failed.

We try to not leave anything behind when removed. But sometimes a log staying behind is useful.

---

##### `logRetention`<sup>Optional</sup> <a name="logRetention" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilderProps.property.logRetention"></a>

```typescript
public readonly logRetention: RetentionDays;
```

- *Type:* aws-cdk-lib.aws_logs.RetentionDays
- *Default:* logs.RetentionDays.ONE_MONTH

The number of days log events are kept in CloudWatch Logs.

When updating
this property, unsetting it doesn't remove the log retention policy. To
remove the retention policy, set the value to `INFINITE`.

---

##### `os`<sup>Optional</sup> <a name="os" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilderProps.property.os"></a>

```typescript
public readonly os: Os;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Os">Os</a>
- *Default:* OS.LINUX

Image OS.

---

##### `parentImage`<sup>Optional</sup> <a name="parentImage" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilderProps.property.parentImage"></a>

```typescript
public readonly parentImage: string;
```

- *Type:* string
- *Default:* 'mcr.microsoft.com/windows/servercore:ltsc2019-amd64'

Parent image for the new Docker Image.

You can use either Image Builder image ARN or public registry image.

---

##### `rebuildInterval`<sup>Optional</sup> <a name="rebuildInterval" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilderProps.property.rebuildInterval"></a>

```typescript
public readonly rebuildInterval: Duration;
```

- *Type:* aws-cdk-lib.Duration
- *Default:* Duration.days(7)

Schedule the image to be rebuilt every given interval.

Useful for keeping the image up-do-date with the latest GitHub runner version and latest OS updates.

Set to zero to disable.

---

##### `runnerVersion`<sup>Optional</sup> <a name="runnerVersion" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilderProps.property.runnerVersion"></a>

```typescript
public readonly runnerVersion: RunnerVersion;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerVersion">RunnerVersion</a>
- *Default:* latest version available

Version of GitHub Runners to install.

---

##### ~~`securityGroup`~~<sup>Optional</sup> <a name="securityGroup" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilderProps.property.securityGroup"></a>

- *Deprecated:* use {@link securityGroups }

```typescript
public readonly securityGroup: ISecurityGroup;
```

- *Type:* aws-cdk-lib.aws_ec2.ISecurityGroup
- *Default:* new security group

Security group to assign to launched builder instances.

---

##### `securityGroups`<sup>Optional</sup> <a name="securityGroups" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilderProps.property.securityGroups"></a>

```typescript
public readonly securityGroups: ISecurityGroup[];
```

- *Type:* aws-cdk-lib.aws_ec2.ISecurityGroup[]
- *Default:* new security group

Security groups to assign to launched builder instances.

---

##### `subnetSelection`<sup>Optional</sup> <a name="subnetSelection" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilderProps.property.subnetSelection"></a>

```typescript
public readonly subnetSelection: SubnetSelection;
```

- *Type:* aws-cdk-lib.aws_ec2.SubnetSelection
- *Default:* default VPC subnet

Where to place the network interfaces within the VPC.

---

##### `vpc`<sup>Optional</sup> <a name="vpc" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilderProps.property.vpc"></a>

```typescript
public readonly vpc: IVpc;
```

- *Type:* aws-cdk-lib.aws_ec2.IVpc
- *Default:* default account VPC

VPC to launch the runners in.

---

### Ec2RunnerProviderProps <a name="Ec2RunnerProviderProps" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProviderProps"></a>

Properties for {@link Ec2RunnerProvider} construct.

#### Initializer <a name="Initializer" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProviderProps.Initializer"></a>

```typescript
import { Ec2RunnerProviderProps } from '@cloudsnorkel/cdk-github-runners'

const ec2RunnerProviderProps: Ec2RunnerProviderProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProviderProps.property.logRetention">logRetention</a></code> | <code>aws-cdk-lib.aws_logs.RetentionDays</code> | The number of days log events are kept in CloudWatch Logs. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProviderProps.property.retryOptions">retryOptions</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.ProviderRetryOptions">ProviderRetryOptions</a></code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProviderProps.property.amiBuilder">amiBuilder</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.IRunnerImageBuilder">IRunnerImageBuilder</a></code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProviderProps.property.group">group</a></code> | <code>string</code> | GitHub Actions runner group name. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProviderProps.property.imageBuilder">imageBuilder</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.IRunnerImageBuilder">IRunnerImageBuilder</a></code> | Runner image builder used to build AMI containing GitHub Runner and all requirements. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProviderProps.property.instanceType">instanceType</a></code> | <code>aws-cdk-lib.aws_ec2.InstanceType</code> | Instance type for launched runner instances. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProviderProps.property.labels">labels</a></code> | <code>string[]</code> | GitHub Actions labels used for this provider. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProviderProps.property.securityGroup">securityGroup</a></code> | <code>aws-cdk-lib.aws_ec2.ISecurityGroup</code> | Security Group to assign to launched runner instances. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProviderProps.property.securityGroups">securityGroups</a></code> | <code>aws-cdk-lib.aws_ec2.ISecurityGroup[]</code> | Security groups to assign to launched runner instances. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProviderProps.property.spot">spot</a></code> | <code>boolean</code> | Use spot instances to save money. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProviderProps.property.spotMaxPrice">spotMaxPrice</a></code> | <code>string</code> | Set a maximum price for spot instances. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProviderProps.property.storageOptions">storageOptions</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.StorageOptions">StorageOptions</a></code> | Options for runner instance storage volume. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProviderProps.property.storageSize">storageSize</a></code> | <code>aws-cdk-lib.Size</code> | Size of volume available for launched runner instances. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProviderProps.property.subnet">subnet</a></code> | <code>aws-cdk-lib.aws_ec2.ISubnet</code> | Subnet where the runner instances will be launched. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProviderProps.property.subnetSelection">subnetSelection</a></code> | <code>aws-cdk-lib.aws_ec2.SubnetSelection</code> | Where to place the network interfaces within the VPC. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProviderProps.property.vpc">vpc</a></code> | <code>aws-cdk-lib.aws_ec2.IVpc</code> | VPC where runner instances will be launched. |

---

##### `logRetention`<sup>Optional</sup> <a name="logRetention" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProviderProps.property.logRetention"></a>

```typescript
public readonly logRetention: RetentionDays;
```

- *Type:* aws-cdk-lib.aws_logs.RetentionDays
- *Default:* logs.RetentionDays.ONE_MONTH

The number of days log events are kept in CloudWatch Logs.

When updating
this property, unsetting it doesn't remove the log retention policy. To
remove the retention policy, set the value to `INFINITE`.

---

##### ~~`retryOptions`~~<sup>Optional</sup> <a name="retryOptions" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProviderProps.property.retryOptions"></a>

- *Deprecated:* use {@link retryOptions } on {@link GitHubRunners } instead

```typescript
public readonly retryOptions: ProviderRetryOptions;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.ProviderRetryOptions">ProviderRetryOptions</a>

---

##### ~~`amiBuilder`~~<sup>Optional</sup> <a name="amiBuilder" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProviderProps.property.amiBuilder"></a>

- *Deprecated:* use imageBuilder

```typescript
public readonly amiBuilder: IRunnerImageBuilder;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.IRunnerImageBuilder">IRunnerImageBuilder</a>

---

##### `group`<sup>Optional</sup> <a name="group" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProviderProps.property.group"></a>

```typescript
public readonly group: string;
```

- *Type:* string
- *Default:* undefined

GitHub Actions runner group name.

If specified, the runner will be registered with this group name. Setting a runner group can help managing access to self-hosted runners. It
requires a paid GitHub account.

The group must exist or the runner will not start.

Users will still be able to trigger this runner with the correct labels. But the runner will only be able to run jobs from repos allowed to use the group.

---

##### `imageBuilder`<sup>Optional</sup> <a name="imageBuilder" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProviderProps.property.imageBuilder"></a>

```typescript
public readonly imageBuilder: IRunnerImageBuilder;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.IRunnerImageBuilder">IRunnerImageBuilder</a>
- *Default:* Ec2RunnerProvider.imageBuilder()

Runner image builder used to build AMI containing GitHub Runner and all requirements.

The image builder determines the OS and architecture of the runner.

---

##### `instanceType`<sup>Optional</sup> <a name="instanceType" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProviderProps.property.instanceType"></a>

```typescript
public readonly instanceType: InstanceType;
```

- *Type:* aws-cdk-lib.aws_ec2.InstanceType
- *Default:* m6i.large

Instance type for launched runner instances.

---

##### `labels`<sup>Optional</sup> <a name="labels" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProviderProps.property.labels"></a>

```typescript
public readonly labels: string[];
```

- *Type:* string[]
- *Default:* ['ec2']

GitHub Actions labels used for this provider.

These labels are used to identify which provider should spawn a new on-demand runner. Every job sends a webhook with the labels it's looking for
based on runs-on. We match the labels from the webhook with the labels specified here. If all the labels specified here are present in the
job's labels, this provider will be chosen and spawn a new runner.

---

##### ~~`securityGroup`~~<sup>Optional</sup> <a name="securityGroup" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProviderProps.property.securityGroup"></a>

- *Deprecated:* use {@link securityGroups }

```typescript
public readonly securityGroup: ISecurityGroup;
```

- *Type:* aws-cdk-lib.aws_ec2.ISecurityGroup
- *Default:* a new security group

Security Group to assign to launched runner instances.

---

##### `securityGroups`<sup>Optional</sup> <a name="securityGroups" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProviderProps.property.securityGroups"></a>

```typescript
public readonly securityGroups: ISecurityGroup[];
```

- *Type:* aws-cdk-lib.aws_ec2.ISecurityGroup[]
- *Default:* a new security group

Security groups to assign to launched runner instances.

---

##### `spot`<sup>Optional</sup> <a name="spot" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProviderProps.property.spot"></a>

```typescript
public readonly spot: boolean;
```

- *Type:* boolean
- *Default:* false

Use spot instances to save money.

Spot instances are cheaper but not always available and can be stopped prematurely.

---

##### `spotMaxPrice`<sup>Optional</sup> <a name="spotMaxPrice" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProviderProps.property.spotMaxPrice"></a>

```typescript
public readonly spotMaxPrice: string;
```

- *Type:* string
- *Default:* no max price (you will pay current spot price)

Set a maximum price for spot instances.

---

##### `storageOptions`<sup>Optional</sup> <a name="storageOptions" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProviderProps.property.storageOptions"></a>

```typescript
public readonly storageOptions: StorageOptions;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.StorageOptions">StorageOptions</a>

Options for runner instance storage volume.

---

##### `storageSize`<sup>Optional</sup> <a name="storageSize" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProviderProps.property.storageSize"></a>

```typescript
public readonly storageSize: Size;
```

- *Type:* aws-cdk-lib.Size
- *Default:* 30GB

Size of volume available for launched runner instances.

This modifies the boot volume size and doesn't add any additional volumes.

---

##### ~~`subnet`~~<sup>Optional</sup> <a name="subnet" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProviderProps.property.subnet"></a>

- *Deprecated:* use {@link vpc } and {@link subnetSelection }

```typescript
public readonly subnet: ISubnet;
```

- *Type:* aws-cdk-lib.aws_ec2.ISubnet
- *Default:* default subnet of account's default VPC

Subnet where the runner instances will be launched.

---

##### `subnetSelection`<sup>Optional</sup> <a name="subnetSelection" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProviderProps.property.subnetSelection"></a>

```typescript
public readonly subnetSelection: SubnetSelection;
```

- *Type:* aws-cdk-lib.aws_ec2.SubnetSelection
- *Default:* default VPC subnet

Where to place the network interfaces within the VPC.

Only the first matched subnet will be used.

---

##### `vpc`<sup>Optional</sup> <a name="vpc" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProviderProps.property.vpc"></a>

```typescript
public readonly vpc: IVpc;
```

- *Type:* aws-cdk-lib.aws_ec2.IVpc
- *Default:* default account VPC

VPC where runner instances will be launched.

---

### EcsRunnerProviderProps <a name="EcsRunnerProviderProps" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps"></a>

Properties for EcsRunnerProvider.

#### Initializer <a name="Initializer" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.Initializer"></a>

```typescript
import { EcsRunnerProviderProps } from '@cloudsnorkel/cdk-github-runners'

const ecsRunnerProviderProps: EcsRunnerProviderProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.logRetention">logRetention</a></code> | <code>aws-cdk-lib.aws_logs.RetentionDays</code> | The number of days log events are kept in CloudWatch Logs. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.retryOptions">retryOptions</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.ProviderRetryOptions">ProviderRetryOptions</a></code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.assignPublicIp">assignPublicIp</a></code> | <code>boolean</code> | Assign public IP to the runner task. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.capacityProvider">capacityProvider</a></code> | <code>aws-cdk-lib.aws_ecs.AsgCapacityProvider</code> | Existing capacity provider to use. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.cluster">cluster</a></code> | <code>aws-cdk-lib.aws_ecs.Cluster</code> | Existing ECS cluster to use. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.cpu">cpu</a></code> | <code>number</code> | The number of cpu units used by the task. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.dockerInDocker">dockerInDocker</a></code> | <code>boolean</code> | Support building and running Docker images by enabling Docker-in-Docker (dind) and the required CodeBuild privileged mode. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.group">group</a></code> | <code>string</code> | GitHub Actions runner group name. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.imageBuilder">imageBuilder</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.IRunnerImageBuilder">IRunnerImageBuilder</a></code> | Runner image builder used to build Docker images containing GitHub Runner and all requirements. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.instanceType">instanceType</a></code> | <code>aws-cdk-lib.aws_ec2.InstanceType</code> | Instance type of ECS cluster instances. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.labels">labels</a></code> | <code>string[]</code> | GitHub Actions labels used for this provider. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.maxInstances">maxInstances</a></code> | <code>number</code> | The maximum number of instances to run in the cluster. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.memoryLimitMiB">memoryLimitMiB</a></code> | <code>number</code> | The amount (in MiB) of memory used by the task. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.memoryReservationMiB">memoryReservationMiB</a></code> | <code>number</code> | The soft limit (in MiB) of memory to reserve for the container. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.minInstances">minInstances</a></code> | <code>number</code> | The minimum number of instances to run in the cluster. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.securityGroups">securityGroups</a></code> | <code>aws-cdk-lib.aws_ec2.ISecurityGroup[]</code> | Security groups to assign to the task. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.spot">spot</a></code> | <code>boolean</code> | Use spot capacity. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.spotMaxPrice">spotMaxPrice</a></code> | <code>string</code> | Maximum price for spot instances. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.storageOptions">storageOptions</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.StorageOptions">StorageOptions</a></code> | Options for runner instance storage volume. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.storageSize">storageSize</a></code> | <code>aws-cdk-lib.Size</code> | Size of volume available for launched cluster instances. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.subnetSelection">subnetSelection</a></code> | <code>aws-cdk-lib.aws_ec2.SubnetSelection</code> | Subnets to run the runners in. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.vpc">vpc</a></code> | <code>aws-cdk-lib.aws_ec2.IVpc</code> | VPC to launch the runners in. |

---

##### `logRetention`<sup>Optional</sup> <a name="logRetention" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.logRetention"></a>

```typescript
public readonly logRetention: RetentionDays;
```

- *Type:* aws-cdk-lib.aws_logs.RetentionDays
- *Default:* logs.RetentionDays.ONE_MONTH

The number of days log events are kept in CloudWatch Logs.

When updating
this property, unsetting it doesn't remove the log retention policy. To
remove the retention policy, set the value to `INFINITE`.

---

##### ~~`retryOptions`~~<sup>Optional</sup> <a name="retryOptions" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.retryOptions"></a>

- *Deprecated:* use {@link retryOptions } on {@link GitHubRunners } instead

```typescript
public readonly retryOptions: ProviderRetryOptions;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.ProviderRetryOptions">ProviderRetryOptions</a>

---

##### `assignPublicIp`<sup>Optional</sup> <a name="assignPublicIp" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.assignPublicIp"></a>

```typescript
public readonly assignPublicIp: boolean;
```

- *Type:* boolean
- *Default:* true

Assign public IP to the runner task.

Make sure the task will have access to GitHub. A public IP might be required unless you have NAT gateway.

---

##### `capacityProvider`<sup>Optional</sup> <a name="capacityProvider" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.capacityProvider"></a>

```typescript
public readonly capacityProvider: AsgCapacityProvider;
```

- *Type:* aws-cdk-lib.aws_ecs.AsgCapacityProvider
- *Default:* new capacity provider

Existing capacity provider to use.

Make sure the AMI used by the capacity provider is compatible with ECS.

---

##### `cluster`<sup>Optional</sup> <a name="cluster" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.cluster"></a>

```typescript
public readonly cluster: Cluster;
```

- *Type:* aws-cdk-lib.aws_ecs.Cluster
- *Default:* a new cluster

Existing ECS cluster to use.

---

##### `cpu`<sup>Optional</sup> <a name="cpu" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.cpu"></a>

```typescript
public readonly cpu: number;
```

- *Type:* number
- *Default:* 1024

The number of cpu units used by the task.

1024 units is 1 vCPU. Fractions of a vCPU are supported.

---

##### `dockerInDocker`<sup>Optional</sup> <a name="dockerInDocker" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.dockerInDocker"></a>

```typescript
public readonly dockerInDocker: boolean;
```

- *Type:* boolean
- *Default:* true

Support building and running Docker images by enabling Docker-in-Docker (dind) and the required CodeBuild privileged mode.

Disabling this can
speed up provisioning of CodeBuild runners. If you don't intend on running or building Docker images, disable this for faster start-up times.

---

##### `group`<sup>Optional</sup> <a name="group" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.group"></a>

```typescript
public readonly group: string;
```

- *Type:* string
- *Default:* undefined

GitHub Actions runner group name.

If specified, the runner will be registered with this group name. Setting a runner group can help managing access to self-hosted runners. It
requires a paid GitHub account.

The group must exist or the runner will not start.

Users will still be able to trigger this runner with the correct labels. But the runner will only be able to run jobs from repos allowed to use the group.

---

##### `imageBuilder`<sup>Optional</sup> <a name="imageBuilder" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.imageBuilder"></a>

```typescript
public readonly imageBuilder: IRunnerImageBuilder;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.IRunnerImageBuilder">IRunnerImageBuilder</a>
- *Default:* EcsRunnerProvider.imageBuilder()

Runner image builder used to build Docker images containing GitHub Runner and all requirements.

The image builder determines the OS and architecture of the runner.

---

##### `instanceType`<sup>Optional</sup> <a name="instanceType" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.instanceType"></a>

```typescript
public readonly instanceType: InstanceType;
```

- *Type:* aws-cdk-lib.aws_ec2.InstanceType
- *Default:* m6i.large or m6g.large

Instance type of ECS cluster instances.

Only used when creating a new cluster.

---

##### `labels`<sup>Optional</sup> <a name="labels" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.labels"></a>

```typescript
public readonly labels: string[];
```

- *Type:* string[]
- *Default:* ['ecs']

GitHub Actions labels used for this provider.

These labels are used to identify which provider should spawn a new on-demand runner. Every job sends a webhook with the labels it's looking for
based on runs-on. We match the labels from the webhook with the labels specified here. If all the labels specified here are present in the
job's labels, this provider will be chosen and spawn a new runner.

---

##### `maxInstances`<sup>Optional</sup> <a name="maxInstances" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.maxInstances"></a>

```typescript
public readonly maxInstances: number;
```

- *Type:* number
- *Default:* 5

The maximum number of instances to run in the cluster.

Only used when creating a new cluster.

---

##### `memoryLimitMiB`<sup>Optional</sup> <a name="memoryLimitMiB" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.memoryLimitMiB"></a>

```typescript
public readonly memoryLimitMiB: number;
```

- *Type:* number
- *Default:* 3500, unless `memoryReservationMiB` is used and then it's undefined

The amount (in MiB) of memory used by the task.

---

##### `memoryReservationMiB`<sup>Optional</sup> <a name="memoryReservationMiB" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.memoryReservationMiB"></a>

```typescript
public readonly memoryReservationMiB: number;
```

- *Type:* number
- *Default:* undefined

The soft limit (in MiB) of memory to reserve for the container.

---

##### `minInstances`<sup>Optional</sup> <a name="minInstances" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.minInstances"></a>

```typescript
public readonly minInstances: number;
```

- *Type:* number
- *Default:* 0

The minimum number of instances to run in the cluster.

Only used when creating a new cluster.

---

##### `securityGroups`<sup>Optional</sup> <a name="securityGroups" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.securityGroups"></a>

```typescript
public readonly securityGroups: ISecurityGroup[];
```

- *Type:* aws-cdk-lib.aws_ec2.ISecurityGroup[]
- *Default:* a new security group

Security groups to assign to the task.

---

##### `spot`<sup>Optional</sup> <a name="spot" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.spot"></a>

```typescript
public readonly spot: boolean;
```

- *Type:* boolean
- *Default:* false (true if spotMaxPrice is specified)

Use spot capacity.

---

##### `spotMaxPrice`<sup>Optional</sup> <a name="spotMaxPrice" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.spotMaxPrice"></a>

```typescript
public readonly spotMaxPrice: string;
```

- *Type:* string

Maximum price for spot instances.

---

##### `storageOptions`<sup>Optional</sup> <a name="storageOptions" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.storageOptions"></a>

```typescript
public readonly storageOptions: StorageOptions;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.StorageOptions">StorageOptions</a>

Options for runner instance storage volume.

---

##### `storageSize`<sup>Optional</sup> <a name="storageSize" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.storageSize"></a>

```typescript
public readonly storageSize: Size;
```

- *Type:* aws-cdk-lib.Size
- *Default:* default size for AMI (usually 30GB for Linux and 50GB for Windows)

Size of volume available for launched cluster instances.

This modifies the boot volume size and doesn't add any additional volumes.

Each instance can be used by multiple runners, so make sure there is enough space for all of them.

---

##### `subnetSelection`<sup>Optional</sup> <a name="subnetSelection" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.subnetSelection"></a>

```typescript
public readonly subnetSelection: SubnetSelection;
```

- *Type:* aws-cdk-lib.aws_ec2.SubnetSelection
- *Default:* ECS default

Subnets to run the runners in.

---

##### `vpc`<sup>Optional</sup> <a name="vpc" id="@cloudsnorkel/cdk-github-runners.EcsRunnerProviderProps.property.vpc"></a>

```typescript
public readonly vpc: IVpc;
```

- *Type:* aws-cdk-lib.aws_ec2.IVpc
- *Default:* default account VPC

VPC to launch the runners in.

---

### ExecutionNameOptions <a name="ExecutionNameOptions" id="@cloudsnorkel/cdk-github-runners.ExecutionNameOptions"></a>

Defines options for constructing step function execution names.

By default the execution name is constructed as `<org>-<repo>-<webhook-guid>`, where
- `org` is the GitHub organization name
- `repo` is the GitHub repository name
- `webhook-guid` is a unique identifier for the webhook event

Note that the execution name is limited to 64 characters, so the org and repo names may be truncated.

#### Initializer <a name="Initializer" id="@cloudsnorkel/cdk-github-runners.ExecutionNameOptions.Initializer"></a>

```typescript
import { ExecutionNameOptions } from '@cloudsnorkel/cdk-github-runners'

const executionNameOptions: ExecutionNameOptions = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ExecutionNameOptions.property.skipOrgName">skipOrgName</a></code> | <code>boolean</code> | Skip the organization name, and just include the repo name in the execution name. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ExecutionNameOptions.property.stripHyphenFromGuid">stripHyphenFromGuid</a></code> | <code>boolean</code> | Strip hyphens from the webhook GUID, to allow less truncation in repo name. |

---

##### `skipOrgName`<sup>Optional</sup> <a name="skipOrgName" id="@cloudsnorkel/cdk-github-runners.ExecutionNameOptions.property.skipOrgName"></a>

```typescript
public readonly skipOrgName: boolean;
```

- *Type:* boolean
- *Default:* false

Skip the organization name, and just include the repo name in the execution name.

---

##### `stripHyphenFromGuid`<sup>Optional</sup> <a name="stripHyphenFromGuid" id="@cloudsnorkel/cdk-github-runners.ExecutionNameOptions.property.stripHyphenFromGuid"></a>

```typescript
public readonly stripHyphenFromGuid: boolean;
```

- *Type:* boolean
- *Default:* false

Strip hyphens from the webhook GUID, to allow less truncation in repo name.

---

### FargateRunnerProviderProps <a name="FargateRunnerProviderProps" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProviderProps"></a>

Properties for FargateRunnerProvider.

#### Initializer <a name="Initializer" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProviderProps.Initializer"></a>

```typescript
import { FargateRunnerProviderProps } from '@cloudsnorkel/cdk-github-runners'

const fargateRunnerProviderProps: FargateRunnerProviderProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProviderProps.property.logRetention">logRetention</a></code> | <code>aws-cdk-lib.aws_logs.RetentionDays</code> | The number of days log events are kept in CloudWatch Logs. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProviderProps.property.retryOptions">retryOptions</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.ProviderRetryOptions">ProviderRetryOptions</a></code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProviderProps.property.assignPublicIp">assignPublicIp</a></code> | <code>boolean</code> | Assign public IP to the runner task. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProviderProps.property.cluster">cluster</a></code> | <code>aws-cdk-lib.aws_ecs.Cluster</code> | Existing Fargate cluster to use. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProviderProps.property.cpu">cpu</a></code> | <code>number</code> | The number of cpu units used by the task. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProviderProps.property.ephemeralStorageGiB">ephemeralStorageGiB</a></code> | <code>number</code> | The amount (in GiB) of ephemeral storage to be allocated to the task. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProviderProps.property.group">group</a></code> | <code>string</code> | GitHub Actions runner group name. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProviderProps.property.imageBuilder">imageBuilder</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.IRunnerImageBuilder">IRunnerImageBuilder</a></code> | Runner image builder used to build Docker images containing GitHub Runner and all requirements. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProviderProps.property.label">label</a></code> | <code>string</code> | GitHub Actions label used for this provider. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProviderProps.property.labels">labels</a></code> | <code>string[]</code> | GitHub Actions labels used for this provider. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProviderProps.property.memoryLimitMiB">memoryLimitMiB</a></code> | <code>number</code> | The amount (in MiB) of memory used by the task. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProviderProps.property.securityGroup">securityGroup</a></code> | <code>aws-cdk-lib.aws_ec2.ISecurityGroup</code> | Security group to assign to the task. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProviderProps.property.securityGroups">securityGroups</a></code> | <code>aws-cdk-lib.aws_ec2.ISecurityGroup[]</code> | Security groups to assign to the task. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProviderProps.property.spot">spot</a></code> | <code>boolean</code> | Use Fargate spot capacity provider to save money. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProviderProps.property.subnetSelection">subnetSelection</a></code> | <code>aws-cdk-lib.aws_ec2.SubnetSelection</code> | Subnets to run the runners in. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProviderProps.property.vpc">vpc</a></code> | <code>aws-cdk-lib.aws_ec2.IVpc</code> | VPC to launch the runners in. |

---

##### `logRetention`<sup>Optional</sup> <a name="logRetention" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProviderProps.property.logRetention"></a>

```typescript
public readonly logRetention: RetentionDays;
```

- *Type:* aws-cdk-lib.aws_logs.RetentionDays
- *Default:* logs.RetentionDays.ONE_MONTH

The number of days log events are kept in CloudWatch Logs.

When updating
this property, unsetting it doesn't remove the log retention policy. To
remove the retention policy, set the value to `INFINITE`.

---

##### ~~`retryOptions`~~<sup>Optional</sup> <a name="retryOptions" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProviderProps.property.retryOptions"></a>

- *Deprecated:* use {@link retryOptions } on {@link GitHubRunners } instead

```typescript
public readonly retryOptions: ProviderRetryOptions;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.ProviderRetryOptions">ProviderRetryOptions</a>

---

##### `assignPublicIp`<sup>Optional</sup> <a name="assignPublicIp" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProviderProps.property.assignPublicIp"></a>

```typescript
public readonly assignPublicIp: boolean;
```

- *Type:* boolean
- *Default:* true

Assign public IP to the runner task.

Make sure the task will have access to GitHub. A public IP might be required unless you have NAT gateway.

---

##### `cluster`<sup>Optional</sup> <a name="cluster" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProviderProps.property.cluster"></a>

```typescript
public readonly cluster: Cluster;
```

- *Type:* aws-cdk-lib.aws_ecs.Cluster
- *Default:* a new cluster

Existing Fargate cluster to use.

---

##### `cpu`<sup>Optional</sup> <a name="cpu" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProviderProps.property.cpu"></a>

```typescript
public readonly cpu: number;
```

- *Type:* number
- *Default:* 1024

The number of cpu units used by the task.

For tasks using the Fargate launch type,
this field is required and you must use one of the following values,
which determines your range of valid values for the memory parameter:

256 (.25 vCPU) - Available memory values: 512 (0.5 GB), 1024 (1 GB), 2048 (2 GB)

512 (.5 vCPU) - Available memory values: 1024 (1 GB), 2048 (2 GB), 3072 (3 GB), 4096 (4 GB)

1024 (1 vCPU) - Available memory values: 2048 (2 GB), 3072 (3 GB), 4096 (4 GB), 5120 (5 GB), 6144 (6 GB), 7168 (7 GB), 8192 (8 GB)

2048 (2 vCPU) - Available memory values: Between 4096 (4 GB) and 16384 (16 GB) in increments of 1024 (1 GB)

4096 (4 vCPU) - Available memory values: Between 8192 (8 GB) and 30720 (30 GB) in increments of 1024 (1 GB)

---

##### `ephemeralStorageGiB`<sup>Optional</sup> <a name="ephemeralStorageGiB" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProviderProps.property.ephemeralStorageGiB"></a>

```typescript
public readonly ephemeralStorageGiB: number;
```

- *Type:* number
- *Default:* 20

The amount (in GiB) of ephemeral storage to be allocated to the task.

The maximum supported value is 200 GiB.

NOTE: This parameter is only supported for tasks hosted on AWS Fargate using platform version 1.4.0 or later.

---

##### `group`<sup>Optional</sup> <a name="group" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProviderProps.property.group"></a>

```typescript
public readonly group: string;
```

- *Type:* string
- *Default:* undefined

GitHub Actions runner group name.

If specified, the runner will be registered with this group name. Setting a runner group can help managing access to self-hosted runners. It
requires a paid GitHub account.

The group must exist or the runner will not start.

Users will still be able to trigger this runner with the correct labels. But the runner will only be able to run jobs from repos allowed to use the group.

---

##### `imageBuilder`<sup>Optional</sup> <a name="imageBuilder" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProviderProps.property.imageBuilder"></a>

```typescript
public readonly imageBuilder: IRunnerImageBuilder;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.IRunnerImageBuilder">IRunnerImageBuilder</a>
- *Default:* FargateRunnerProvider.imageBuilder()

Runner image builder used to build Docker images containing GitHub Runner and all requirements.

The image builder determines the OS and architecture of the runner.

---

##### ~~`label`~~<sup>Optional</sup> <a name="label" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProviderProps.property.label"></a>

- *Deprecated:* use {@link labels } instead

```typescript
public readonly label: string;
```

- *Type:* string
- *Default:* undefined

GitHub Actions label used for this provider.

---

##### `labels`<sup>Optional</sup> <a name="labels" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProviderProps.property.labels"></a>

```typescript
public readonly labels: string[];
```

- *Type:* string[]
- *Default:* ['fargate']

GitHub Actions labels used for this provider.

These labels are used to identify which provider should spawn a new on-demand runner. Every job sends a webhook with the labels it's looking for
based on runs-on. We match the labels from the webhook with the labels specified here. If all the labels specified here are present in the
job's labels, this provider will be chosen and spawn a new runner.

---

##### `memoryLimitMiB`<sup>Optional</sup> <a name="memoryLimitMiB" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProviderProps.property.memoryLimitMiB"></a>

```typescript
public readonly memoryLimitMiB: number;
```

- *Type:* number
- *Default:* 2048

The amount (in MiB) of memory used by the task.

For tasks using the Fargate launch type,
this field is required and you must use one of the following values, which determines your range of valid values for the cpu parameter:

512 (0.5 GB), 1024 (1 GB), 2048 (2 GB) - Available cpu values: 256 (.25 vCPU)

1024 (1 GB), 2048 (2 GB), 3072 (3 GB), 4096 (4 GB) - Available cpu values: 512 (.5 vCPU)

2048 (2 GB), 3072 (3 GB), 4096 (4 GB), 5120 (5 GB), 6144 (6 GB), 7168 (7 GB), 8192 (8 GB) - Available cpu values: 1024 (1 vCPU)

Between 4096 (4 GB) and 16384 (16 GB) in increments of 1024 (1 GB) - Available cpu values: 2048 (2 vCPU)

Between 8192 (8 GB) and 30720 (30 GB) in increments of 1024 (1 GB) - Available cpu values: 4096 (4 vCPU)

---

##### ~~`securityGroup`~~<sup>Optional</sup> <a name="securityGroup" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProviderProps.property.securityGroup"></a>

- *Deprecated:* use {@link securityGroups }

```typescript
public readonly securityGroup: ISecurityGroup;
```

- *Type:* aws-cdk-lib.aws_ec2.ISecurityGroup
- *Default:* a new security group

Security group to assign to the task.

---

##### `securityGroups`<sup>Optional</sup> <a name="securityGroups" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProviderProps.property.securityGroups"></a>

```typescript
public readonly securityGroups: ISecurityGroup[];
```

- *Type:* aws-cdk-lib.aws_ec2.ISecurityGroup[]
- *Default:* a new security group

Security groups to assign to the task.

---

##### `spot`<sup>Optional</sup> <a name="spot" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProviderProps.property.spot"></a>

```typescript
public readonly spot: boolean;
```

- *Type:* boolean
- *Default:* false

Use Fargate spot capacity provider to save money.

* Runners may fail to start due to missing capacity.
* Runners might be stopped prematurely with spot pricing.

---

##### `subnetSelection`<sup>Optional</sup> <a name="subnetSelection" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProviderProps.property.subnetSelection"></a>

```typescript
public readonly subnetSelection: SubnetSelection;
```

- *Type:* aws-cdk-lib.aws_ec2.SubnetSelection
- *Default:* Fargate default

Subnets to run the runners in.

---

##### `vpc`<sup>Optional</sup> <a name="vpc" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProviderProps.property.vpc"></a>

```typescript
public readonly vpc: IVpc;
```

- *Type:* aws-cdk-lib.aws_ec2.IVpc
- *Default:* default account VPC

VPC to launch the runners in.

---

### FastLaunchOptions <a name="FastLaunchOptions" id="@cloudsnorkel/cdk-github-runners.FastLaunchOptions"></a>

Options for fast launch.

#### Initializer <a name="Initializer" id="@cloudsnorkel/cdk-github-runners.FastLaunchOptions.Initializer"></a>

```typescript
import { FastLaunchOptions } from '@cloudsnorkel/cdk-github-runners'

const fastLaunchOptions: FastLaunchOptions = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FastLaunchOptions.property.enabled">enabled</a></code> | <code>boolean</code> | Enable fast launch for AMIs generated by this builder. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FastLaunchOptions.property.maxParallelLaunches">maxParallelLaunches</a></code> | <code>number</code> | The maximum number of parallel instances that are launched for creating resources. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FastLaunchOptions.property.targetResourceCount">targetResourceCount</a></code> | <code>number</code> | The number of pre-provisioned snapshots to keep on hand for a fast-launch enabled Windows AMI. |

---

##### `enabled`<sup>Optional</sup> <a name="enabled" id="@cloudsnorkel/cdk-github-runners.FastLaunchOptions.property.enabled"></a>

```typescript
public readonly enabled: boolean;
```

- *Type:* boolean
- *Default:* false

Enable fast launch for AMIs generated by this builder.

It creates a snapshot of the root volume and uses it to launch new instances faster.

This is only supported for Windows AMIs.

---

##### `maxParallelLaunches`<sup>Optional</sup> <a name="maxParallelLaunches" id="@cloudsnorkel/cdk-github-runners.FastLaunchOptions.property.maxParallelLaunches"></a>

```typescript
public readonly maxParallelLaunches: number;
```

- *Type:* number
- *Default:* 6

The maximum number of parallel instances that are launched for creating resources.

Must be at least 6.

---

##### `targetResourceCount`<sup>Optional</sup> <a name="targetResourceCount" id="@cloudsnorkel/cdk-github-runners.FastLaunchOptions.property.targetResourceCount"></a>

```typescript
public readonly targetResourceCount: number;
```

- *Type:* number
- *Default:* 1

The number of pre-provisioned snapshots to keep on hand for a fast-launch enabled Windows AMI.

---

### GitHubRunnersProps <a name="GitHubRunnersProps" id="@cloudsnorkel/cdk-github-runners.GitHubRunnersProps"></a>

Properties for GitHubRunners.

#### Initializer <a name="Initializer" id="@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.Initializer"></a>

```typescript
import { GitHubRunnersProps } from '@cloudsnorkel/cdk-github-runners'

const gitHubRunnersProps: GitHubRunnersProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.allowPublicSubnet">allowPublicSubnet</a></code> | <code>boolean</code> | Allow management functions to run in public subnets. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.executionNameOptions">executionNameOptions</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.ExecutionNameOptions">ExecutionNameOptions</a></code> | Options for constructing step function execution names, which is also used as runner name. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.extraCertificates">extraCertificates</a></code> | <code>string</code> | Path to a directory containing a file named certs.pem containing any additional certificates required to trust GitHub Enterprise Server. Use this when GitHub Enterprise Server certificates are self-signed. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.idleTimeout">idleTimeout</a></code> | <code>aws-cdk-lib.Duration</code> | Time to wait before stopping a runner that remains idle. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.logOptions">logOptions</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.LogOptions">LogOptions</a></code> | Logging options for the state machine that manages the runners. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.providers">providers</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.IRunnerProvider">IRunnerProvider</a>[]</code> | List of runner providers to use. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.requireSelfHostedLabel">requireSelfHostedLabel</a></code> | <code>boolean</code> | Whether to require the `self-hosted` label. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.retryOptions">retryOptions</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.ProviderRetryOptions">ProviderRetryOptions</a></code> | Options to retry operation in case of failure like missing capacity, or API quota issues. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.securityGroup">securityGroup</a></code> | <code>aws-cdk-lib.aws_ec2.ISecurityGroup</code> | Security group attached to all management functions. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.securityGroups">securityGroups</a></code> | <code>aws-cdk-lib.aws_ec2.ISecurityGroup[]</code> | Security groups attached to all management functions. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.setupAccess">setupAccess</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaAccess">LambdaAccess</a></code> | Access configuration for the setup function. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.statusAccess">statusAccess</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaAccess">LambdaAccess</a></code> | Access configuration for the status function. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.vpc">vpc</a></code> | <code>aws-cdk-lib.aws_ec2.IVpc</code> | VPC used for all management functions. Use this with GitHub Enterprise Server hosted that's inaccessible from outside the VPC. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.vpcSubnets">vpcSubnets</a></code> | <code>aws-cdk-lib.aws_ec2.SubnetSelection</code> | VPC subnets used for all management functions. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.webhookAccess">webhookAccess</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaAccess">LambdaAccess</a></code> | Access configuration for the webhook function. |

---

##### `allowPublicSubnet`<sup>Optional</sup> <a name="allowPublicSubnet" id="@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.allowPublicSubnet"></a>

```typescript
public readonly allowPublicSubnet: boolean;
```

- *Type:* boolean
- *Default:* false

Allow management functions to run in public subnets.

Lambda Functions in a public subnet can NOT access the internet.

---

##### `executionNameOptions`<sup>Optional</sup> <a name="executionNameOptions" id="@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.executionNameOptions"></a>

```typescript
public readonly executionNameOptions: ExecutionNameOptions;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.ExecutionNameOptions">ExecutionNameOptions</a>

Options for constructing step function execution names, which is also used as runner name.

---

##### `extraCertificates`<sup>Optional</sup> <a name="extraCertificates" id="@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.extraCertificates"></a>

```typescript
public readonly extraCertificates: string;
```

- *Type:* string

Path to a directory containing a file named certs.pem containing any additional certificates required to trust GitHub Enterprise Server. Use this when GitHub Enterprise Server certificates are self-signed.

You may also want to use custom images for your runner providers that contain the same certificates. See {@link CodeBuildImageBuilder.addCertificates }.

```typescript
const imageBuilder = CodeBuildRunnerProvider.imageBuilder(this, 'Image Builder with Certs');
imageBuilder.addComponent(RunnerImageComponent.extraCertificates('path-to-my-extra-certs-folder/certs.pem', 'private-ca');

const provider = new CodeBuildRunnerProvider(this, 'CodeBuild', {
    imageBuilder: imageBuilder,
});

new GitHubRunners(
  this,
  'runners',
  {
    providers: [provider],
    extraCertificates: 'path-to-my-extra-certs-folder',
  }
);
```

---

##### `idleTimeout`<sup>Optional</sup> <a name="idleTimeout" id="@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.idleTimeout"></a>

```typescript
public readonly idleTimeout: Duration;
```

- *Type:* aws-cdk-lib.Duration
- *Default:* 5 minutes

Time to wait before stopping a runner that remains idle.

If the user cancelled the job, or if another runner stole it, this stops the runner to avoid wasting resources.

---

##### `logOptions`<sup>Optional</sup> <a name="logOptions" id="@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.logOptions"></a>

```typescript
public readonly logOptions: LogOptions;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.LogOptions">LogOptions</a>
- *Default:* no logs

Logging options for the state machine that manages the runners.

---

##### `providers`<sup>Optional</sup> <a name="providers" id="@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.providers"></a>

```typescript
public readonly providers: IRunnerProvider[];
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.IRunnerProvider">IRunnerProvider</a>[]
- *Default:* CodeBuild, Lambda and Fargate runners with all the defaults (no VPC or default account VPC)

List of runner providers to use.

At least one provider is required. Provider will be selected when its label matches the labels requested by the workflow job.

---

##### `requireSelfHostedLabel`<sup>Optional</sup> <a name="requireSelfHostedLabel" id="@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.requireSelfHostedLabel"></a>

```typescript
public readonly requireSelfHostedLabel: boolean;
```

- *Type:* boolean
- *Default:* true

Whether to require the `self-hosted` label.

If `true`, the runner will only start if the workflow job explicitly requests the `self-hosted` label.

Be careful when setting this to `false`. Avoid setting up providers with generic label requirements like `linux` as they may match workflows that are not meant to run on self-hosted runners.

---

##### `retryOptions`<sup>Optional</sup> <a name="retryOptions" id="@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.retryOptions"></a>

```typescript
public readonly retryOptions: ProviderRetryOptions;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.ProviderRetryOptions">ProviderRetryOptions</a>
- *Default:* retry 23 times up to about 24 hours

Options to retry operation in case of failure like missing capacity, or API quota issues.

GitHub jobs time out after not being able to get a runner for 24 hours. You should not retry for more than 24 hours.

Total time spent waiting can be calculated with interval * (backoffRate ^ maxAttempts) / (backoffRate - 1).

---

##### ~~`securityGroup`~~<sup>Optional</sup> <a name="securityGroup" id="@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.securityGroup"></a>

- *Deprecated:* use {@link securityGroups } instead

```typescript
public readonly securityGroup: ISecurityGroup;
```

- *Type:* aws-cdk-lib.aws_ec2.ISecurityGroup

Security group attached to all management functions.

Use this with to provide access to GitHub Enterprise Server hosted inside a VPC.

---

##### `securityGroups`<sup>Optional</sup> <a name="securityGroups" id="@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.securityGroups"></a>

```typescript
public readonly securityGroups: ISecurityGroup[];
```

- *Type:* aws-cdk-lib.aws_ec2.ISecurityGroup[]

Security groups attached to all management functions.

Use this with to provide access to GitHub Enterprise Server hosted inside a VPC.

---

##### `setupAccess`<sup>Optional</sup> <a name="setupAccess" id="@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.setupAccess"></a>

```typescript
public readonly setupAccess: LambdaAccess;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.LambdaAccess">LambdaAccess</a>
- *Default:* LambdaAccess.lambdaUrl()

Access configuration for the setup function.

Once you finish the setup process, you can set this to `LambdaAccess.noAccess()` to remove access to the setup function. You can also use `LambdaAccess.apiGateway({ allowedIps: ['my-ip/0']})` to limit access to your IP only.

---

##### `statusAccess`<sup>Optional</sup> <a name="statusAccess" id="@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.statusAccess"></a>

```typescript
public readonly statusAccess: LambdaAccess;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.LambdaAccess">LambdaAccess</a>
- *Default:* LambdaAccess.noAccess()

Access configuration for the status function.

This function returns a lot of sensitive information about the runner, so you should only allow access to it from trusted IPs, if at all.

---

##### `vpc`<sup>Optional</sup> <a name="vpc" id="@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.vpc"></a>

```typescript
public readonly vpc: IVpc;
```

- *Type:* aws-cdk-lib.aws_ec2.IVpc

VPC used for all management functions. Use this with GitHub Enterprise Server hosted that's inaccessible from outside the VPC.

Make sure the selected VPC and subnets have access to the following with either NAT Gateway or VPC Endpoints:
* GitHub Enterprise Server
* Secrets Manager
* SQS
* Step Functions
* CloudFormation (status function only)
* EC2 (status function only)
* ECR (status function only)

---

##### `vpcSubnets`<sup>Optional</sup> <a name="vpcSubnets" id="@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.vpcSubnets"></a>

```typescript
public readonly vpcSubnets: SubnetSelection;
```

- *Type:* aws-cdk-lib.aws_ec2.SubnetSelection

VPC subnets used for all management functions.

Use this with GitHub Enterprise Server hosted that's inaccessible from outside the VPC.

---

##### `webhookAccess`<sup>Optional</sup> <a name="webhookAccess" id="@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.webhookAccess"></a>

```typescript
public readonly webhookAccess: LambdaAccess;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.LambdaAccess">LambdaAccess</a>
- *Default:* LambdaAccess.lambdaUrl()

Access configuration for the webhook function.

This function is called by GitHub when a new workflow job is scheduled. For an extra layer of security, you can set this to `LambdaAccess.apiGateway({ allowedIps: LambdaAccess.githubWebhookIps() })`.

You can also set this to `LambdaAccess.apiGateway({allowedVpc: vpc, allowedIps: ['GHES.IP.ADDRESS/32']})` if your GitHub Enterprise Server is hosted in a VPC. This will create an API Gateway endpoint that's only accessible from within the VPC.

*WARNING*: changing access type may change the URL. When the URL changes, you must update GitHub as well.

---

### ImageBuilderAsset <a name="ImageBuilderAsset" id="@cloudsnorkel/cdk-github-runners.ImageBuilderAsset"></a>

An asset including file or directory to place inside the built image.

#### Initializer <a name="Initializer" id="@cloudsnorkel/cdk-github-runners.ImageBuilderAsset.Initializer"></a>

```typescript
import { ImageBuilderAsset } from '@cloudsnorkel/cdk-github-runners'

const imageBuilderAsset: ImageBuilderAsset = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ImageBuilderAsset.property.asset">asset</a></code> | <code>aws-cdk-lib.aws_s3_assets.Asset</code> | Asset to place in the image. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ImageBuilderAsset.property.path">path</a></code> | <code>string</code> | Path to place asset in the image. |

---

##### `asset`<sup>Required</sup> <a name="asset" id="@cloudsnorkel/cdk-github-runners.ImageBuilderAsset.property.asset"></a>

```typescript
public readonly asset: Asset;
```

- *Type:* aws-cdk-lib.aws_s3_assets.Asset

Asset to place in the image.

---

##### `path`<sup>Required</sup> <a name="path" id="@cloudsnorkel/cdk-github-runners.ImageBuilderAsset.property.path"></a>

```typescript
public readonly path: string;
```

- *Type:* string

Path to place asset in the image.

---

### ImageBuilderComponentProperties <a name="ImageBuilderComponentProperties" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponentProperties"></a>

Properties for ImageBuilderComponent construct.

#### Initializer <a name="Initializer" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponentProperties.Initializer"></a>

```typescript
import { ImageBuilderComponentProperties } from '@cloudsnorkel/cdk-github-runners'

const imageBuilderComponentProperties: ImageBuilderComponentProperties = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ImageBuilderComponentProperties.property.commands">commands</a></code> | <code>string[]</code> | Shell commands to run when adding this component to the image. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ImageBuilderComponentProperties.property.description">description</a></code> | <code>string</code> | Component description. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ImageBuilderComponentProperties.property.displayName">displayName</a></code> | <code>string</code> | Component display name. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ImageBuilderComponentProperties.property.platform">platform</a></code> | <code>string</code> | Component platform. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ImageBuilderComponentProperties.property.assets">assets</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.ImageBuilderAsset">ImageBuilderAsset</a>[]</code> | Optional assets to add to the built image. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ImageBuilderComponentProperties.property.reboot">reboot</a></code> | <code>boolean</code> | Require a reboot after installing this component. |

---

##### `commands`<sup>Required</sup> <a name="commands" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponentProperties.property.commands"></a>

```typescript
public readonly commands: string[];
```

- *Type:* string[]

Shell commands to run when adding this component to the image.

On Linux, these are bash commands. On Windows, there are PowerShell commands.

---

##### `description`<sup>Required</sup> <a name="description" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponentProperties.property.description"></a>

```typescript
public readonly description: string;
```

- *Type:* string

Component description.

---

##### `displayName`<sup>Required</sup> <a name="displayName" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponentProperties.property.displayName"></a>

```typescript
public readonly displayName: string;
```

- *Type:* string

Component display name.

---

##### `platform`<sup>Required</sup> <a name="platform" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponentProperties.property.platform"></a>

```typescript
public readonly platform: string;
```

- *Type:* string

Component platform.

Must match the builder platform.

---

##### `assets`<sup>Optional</sup> <a name="assets" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponentProperties.property.assets"></a>

```typescript
public readonly assets: ImageBuilderAsset[];
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.ImageBuilderAsset">ImageBuilderAsset</a>[]

Optional assets to add to the built image.

---

##### `reboot`<sup>Optional</sup> <a name="reboot" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponentProperties.property.reboot"></a>

```typescript
public readonly reboot: boolean;
```

- *Type:* boolean
- *Default:* false

Require a reboot after installing this component.

---

### LambdaRunnerProviderProps <a name="LambdaRunnerProviderProps" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProviderProps"></a>

#### Initializer <a name="Initializer" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProviderProps.Initializer"></a>

```typescript
import { LambdaRunnerProviderProps } from '@cloudsnorkel/cdk-github-runners'

const lambdaRunnerProviderProps: LambdaRunnerProviderProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProviderProps.property.logRetention">logRetention</a></code> | <code>aws-cdk-lib.aws_logs.RetentionDays</code> | The number of days log events are kept in CloudWatch Logs. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProviderProps.property.retryOptions">retryOptions</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.ProviderRetryOptions">ProviderRetryOptions</a></code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProviderProps.property.ephemeralStorageSize">ephemeralStorageSize</a></code> | <code>aws-cdk-lib.Size</code> | The size of the function’s /tmp directory in MiB. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProviderProps.property.group">group</a></code> | <code>string</code> | GitHub Actions runner group name. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProviderProps.property.imageBuilder">imageBuilder</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.IRunnerImageBuilder">IRunnerImageBuilder</a></code> | Runner image builder used to build Docker images containing GitHub Runner and all requirements. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProviderProps.property.label">label</a></code> | <code>string</code> | GitHub Actions label used for this provider. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProviderProps.property.labels">labels</a></code> | <code>string[]</code> | GitHub Actions labels used for this provider. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProviderProps.property.memorySize">memorySize</a></code> | <code>number</code> | The amount of memory, in MB, that is allocated to your Lambda function. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProviderProps.property.securityGroup">securityGroup</a></code> | <code>aws-cdk-lib.aws_ec2.ISecurityGroup</code> | Security group to assign to this instance. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProviderProps.property.securityGroups">securityGroups</a></code> | <code>aws-cdk-lib.aws_ec2.ISecurityGroup[]</code> | Security groups to assign to this instance. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProviderProps.property.subnetSelection">subnetSelection</a></code> | <code>aws-cdk-lib.aws_ec2.SubnetSelection</code> | Where to place the network interfaces within the VPC. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProviderProps.property.timeout">timeout</a></code> | <code>aws-cdk-lib.Duration</code> | The function execution time (in seconds) after which Lambda terminates the function. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProviderProps.property.vpc">vpc</a></code> | <code>aws-cdk-lib.aws_ec2.IVpc</code> | VPC to launch the runners in. |

---

##### `logRetention`<sup>Optional</sup> <a name="logRetention" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProviderProps.property.logRetention"></a>

```typescript
public readonly logRetention: RetentionDays;
```

- *Type:* aws-cdk-lib.aws_logs.RetentionDays
- *Default:* logs.RetentionDays.ONE_MONTH

The number of days log events are kept in CloudWatch Logs.

When updating
this property, unsetting it doesn't remove the log retention policy. To
remove the retention policy, set the value to `INFINITE`.

---

##### ~~`retryOptions`~~<sup>Optional</sup> <a name="retryOptions" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProviderProps.property.retryOptions"></a>

- *Deprecated:* use {@link retryOptions } on {@link GitHubRunners } instead

```typescript
public readonly retryOptions: ProviderRetryOptions;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.ProviderRetryOptions">ProviderRetryOptions</a>

---

##### `ephemeralStorageSize`<sup>Optional</sup> <a name="ephemeralStorageSize" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProviderProps.property.ephemeralStorageSize"></a>

```typescript
public readonly ephemeralStorageSize: Size;
```

- *Type:* aws-cdk-lib.Size
- *Default:* 10 GiB

The size of the function’s /tmp directory in MiB.

---

##### `group`<sup>Optional</sup> <a name="group" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProviderProps.property.group"></a>

```typescript
public readonly group: string;
```

- *Type:* string
- *Default:* undefined

GitHub Actions runner group name.

If specified, the runner will be registered with this group name. Setting a runner group can help managing access to self-hosted runners. It
requires a paid GitHub account.

The group must exist or the runner will not start.

Users will still be able to trigger this runner with the correct labels. But the runner will only be able to run jobs from repos allowed to use the group.

---

##### `imageBuilder`<sup>Optional</sup> <a name="imageBuilder" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProviderProps.property.imageBuilder"></a>

```typescript
public readonly imageBuilder: IRunnerImageBuilder;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.IRunnerImageBuilder">IRunnerImageBuilder</a>
- *Default:* LambdaRunnerProvider.imageBuilder()

Runner image builder used to build Docker images containing GitHub Runner and all requirements.

The image builder must contain the {@link RunnerImageComponent.lambdaEntrypoint} component.

The image builder determines the OS and architecture of the runner.

---

##### ~~`label`~~<sup>Optional</sup> <a name="label" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProviderProps.property.label"></a>

- *Deprecated:* use {@link labels } instead

```typescript
public readonly label: string;
```

- *Type:* string
- *Default:* undefined

GitHub Actions label used for this provider.

---

##### `labels`<sup>Optional</sup> <a name="labels" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProviderProps.property.labels"></a>

```typescript
public readonly labels: string[];
```

- *Type:* string[]
- *Default:* ['lambda']

GitHub Actions labels used for this provider.

These labels are used to identify which provider should spawn a new on-demand runner. Every job sends a webhook with the labels it's looking for
based on runs-on. We match the labels from the webhook with the labels specified here. If all the labels specified here are present in the
job's labels, this provider will be chosen and spawn a new runner.

---

##### `memorySize`<sup>Optional</sup> <a name="memorySize" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProviderProps.property.memorySize"></a>

```typescript
public readonly memorySize: number;
```

- *Type:* number
- *Default:* 2048

The amount of memory, in MB, that is allocated to your Lambda function.

Lambda uses this value to proportionally allocate the amount of CPU
power. For more information, see Resource Model in the AWS Lambda
Developer Guide.

---

##### ~~`securityGroup`~~<sup>Optional</sup> <a name="securityGroup" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProviderProps.property.securityGroup"></a>

- *Deprecated:* use {@link securityGroups }

```typescript
public readonly securityGroup: ISecurityGroup;
```

- *Type:* aws-cdk-lib.aws_ec2.ISecurityGroup
- *Default:* public lambda with no security group

Security group to assign to this instance.

---

##### `securityGroups`<sup>Optional</sup> <a name="securityGroups" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProviderProps.property.securityGroups"></a>

```typescript
public readonly securityGroups: ISecurityGroup[];
```

- *Type:* aws-cdk-lib.aws_ec2.ISecurityGroup[]
- *Default:* public lambda with no security group

Security groups to assign to this instance.

---

##### `subnetSelection`<sup>Optional</sup> <a name="subnetSelection" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProviderProps.property.subnetSelection"></a>

```typescript
public readonly subnetSelection: SubnetSelection;
```

- *Type:* aws-cdk-lib.aws_ec2.SubnetSelection
- *Default:* no subnet

Where to place the network interfaces within the VPC.

---

##### `timeout`<sup>Optional</sup> <a name="timeout" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProviderProps.property.timeout"></a>

```typescript
public readonly timeout: Duration;
```

- *Type:* aws-cdk-lib.Duration
- *Default:* Duration.minutes(15)

The function execution time (in seconds) after which Lambda terminates the function.

Because the execution time affects cost, set this value
based on the function's expected execution time.

---

##### `vpc`<sup>Optional</sup> <a name="vpc" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProviderProps.property.vpc"></a>

```typescript
public readonly vpc: IVpc;
```

- *Type:* aws-cdk-lib.aws_ec2.IVpc
- *Default:* no VPC

VPC to launch the runners in.

---

### LogOptions <a name="LogOptions" id="@cloudsnorkel/cdk-github-runners.LogOptions"></a>

Defines what execution history events are logged and where they are logged.

#### Initializer <a name="Initializer" id="@cloudsnorkel/cdk-github-runners.LogOptions.Initializer"></a>

```typescript
import { LogOptions } from '@cloudsnorkel/cdk-github-runners'

const logOptions: LogOptions = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LogOptions.property.includeExecutionData">includeExecutionData</a></code> | <code>boolean</code> | Determines whether execution data is included in your log. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LogOptions.property.level">level</a></code> | <code>aws-cdk-lib.aws_stepfunctions.LogLevel</code> | Defines which category of execution history events are logged. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LogOptions.property.logGroupName">logGroupName</a></code> | <code>string</code> | The log group where the execution history events will be logged. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LogOptions.property.logRetention">logRetention</a></code> | <code>aws-cdk-lib.aws_logs.RetentionDays</code> | The number of days log events are kept in CloudWatch Logs. |

---

##### `includeExecutionData`<sup>Optional</sup> <a name="includeExecutionData" id="@cloudsnorkel/cdk-github-runners.LogOptions.property.includeExecutionData"></a>

```typescript
public readonly includeExecutionData: boolean;
```

- *Type:* boolean
- *Default:* false

Determines whether execution data is included in your log.

---

##### `level`<sup>Optional</sup> <a name="level" id="@cloudsnorkel/cdk-github-runners.LogOptions.property.level"></a>

```typescript
public readonly level: LogLevel;
```

- *Type:* aws-cdk-lib.aws_stepfunctions.LogLevel
- *Default:* ERROR

Defines which category of execution history events are logged.

---

##### `logGroupName`<sup>Optional</sup> <a name="logGroupName" id="@cloudsnorkel/cdk-github-runners.LogOptions.property.logGroupName"></a>

```typescript
public readonly logGroupName: string;
```

- *Type:* string

The log group where the execution history events will be logged.

---

##### `logRetention`<sup>Optional</sup> <a name="logRetention" id="@cloudsnorkel/cdk-github-runners.LogOptions.property.logRetention"></a>

```typescript
public readonly logRetention: RetentionDays;
```

- *Type:* aws-cdk-lib.aws_logs.RetentionDays
- *Default:* logs.RetentionDays.ONE_MONTH

The number of days log events are kept in CloudWatch Logs.

When updating
this property, unsetting it doesn't remove the log retention policy. To
remove the retention policy, set the value to `INFINITE`.

---

### ProviderRetryOptions <a name="ProviderRetryOptions" id="@cloudsnorkel/cdk-github-runners.ProviderRetryOptions"></a>

Retry options for providers.

The default is to retry 23 times for about 24 hours with increasing interval.

#### Initializer <a name="Initializer" id="@cloudsnorkel/cdk-github-runners.ProviderRetryOptions.Initializer"></a>

```typescript
import { ProviderRetryOptions } from '@cloudsnorkel/cdk-github-runners'

const providerRetryOptions: ProviderRetryOptions = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ProviderRetryOptions.property.backoffRate">backoffRate</a></code> | <code>number</code> | Multiplication for how much longer the wait interval gets on every retry. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ProviderRetryOptions.property.interval">interval</a></code> | <code>aws-cdk-lib.Duration</code> | How much time to wait after first retryable failure. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ProviderRetryOptions.property.maxAttempts">maxAttempts</a></code> | <code>number</code> | How many times to retry. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ProviderRetryOptions.property.retry">retry</a></code> | <code>boolean</code> | Set to true to retry provider on supported failures. |

---

##### `backoffRate`<sup>Optional</sup> <a name="backoffRate" id="@cloudsnorkel/cdk-github-runners.ProviderRetryOptions.property.backoffRate"></a>

```typescript
public readonly backoffRate: number;
```

- *Type:* number
- *Default:* 1.3

Multiplication for how much longer the wait interval gets on every retry.

---

##### `interval`<sup>Optional</sup> <a name="interval" id="@cloudsnorkel/cdk-github-runners.ProviderRetryOptions.property.interval"></a>

```typescript
public readonly interval: Duration;
```

- *Type:* aws-cdk-lib.Duration
- *Default:* 1 minute

How much time to wait after first retryable failure.

This interval will be multiplied by {@link backoffRate} each retry.

---

##### `maxAttempts`<sup>Optional</sup> <a name="maxAttempts" id="@cloudsnorkel/cdk-github-runners.ProviderRetryOptions.property.maxAttempts"></a>

```typescript
public readonly maxAttempts: number;
```

- *Type:* number
- *Default:* 23

How many times to retry.

---

##### `retry`<sup>Optional</sup> <a name="retry" id="@cloudsnorkel/cdk-github-runners.ProviderRetryOptions.property.retry"></a>

```typescript
public readonly retry: boolean;
```

- *Type:* boolean
- *Default:* true

Set to true to retry provider on supported failures.

Which failures generate a retry depends on the specific provider.

---

### RunnerAmi <a name="RunnerAmi" id="@cloudsnorkel/cdk-github-runners.RunnerAmi"></a>

Description of a AMI built by {@link RunnerImageBuilder }.

#### Initializer <a name="Initializer" id="@cloudsnorkel/cdk-github-runners.RunnerAmi.Initializer"></a>

```typescript
import { RunnerAmi } from '@cloudsnorkel/cdk-github-runners'

const runnerAmi: RunnerAmi = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerAmi.property.architecture">architecture</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.Architecture">Architecture</a></code> | Architecture of the image. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerAmi.property.launchTemplate">launchTemplate</a></code> | <code>aws-cdk-lib.aws_ec2.ILaunchTemplate</code> | Launch template pointing to the latest AMI. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerAmi.property.os">os</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.Os">Os</a></code> | OS type of the image. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerAmi.property.runnerVersion">runnerVersion</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerVersion">RunnerVersion</a></code> | Installed runner version. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerAmi.property.logGroup">logGroup</a></code> | <code>aws-cdk-lib.aws_logs.LogGroup</code> | Log group where image builds are logged. |

---

##### `architecture`<sup>Required</sup> <a name="architecture" id="@cloudsnorkel/cdk-github-runners.RunnerAmi.property.architecture"></a>

```typescript
public readonly architecture: Architecture;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Architecture">Architecture</a>

Architecture of the image.

---

##### `launchTemplate`<sup>Required</sup> <a name="launchTemplate" id="@cloudsnorkel/cdk-github-runners.RunnerAmi.property.launchTemplate"></a>

```typescript
public readonly launchTemplate: ILaunchTemplate;
```

- *Type:* aws-cdk-lib.aws_ec2.ILaunchTemplate

Launch template pointing to the latest AMI.

---

##### `os`<sup>Required</sup> <a name="os" id="@cloudsnorkel/cdk-github-runners.RunnerAmi.property.os"></a>

```typescript
public readonly os: Os;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Os">Os</a>

OS type of the image.

---

##### ~~`runnerVersion`~~<sup>Required</sup> <a name="runnerVersion" id="@cloudsnorkel/cdk-github-runners.RunnerAmi.property.runnerVersion"></a>

- *Deprecated:* open a ticket if you need this

```typescript
public readonly runnerVersion: RunnerVersion;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerVersion">RunnerVersion</a>

Installed runner version.

---

##### `logGroup`<sup>Optional</sup> <a name="logGroup" id="@cloudsnorkel/cdk-github-runners.RunnerAmi.property.logGroup"></a>

```typescript
public readonly logGroup: LogGroup;
```

- *Type:* aws-cdk-lib.aws_logs.LogGroup

Log group where image builds are logged.

---

### RunnerImage <a name="RunnerImage" id="@cloudsnorkel/cdk-github-runners.RunnerImage"></a>

Description of a Docker image built by {@link RunnerImageBuilder }.

#### Initializer <a name="Initializer" id="@cloudsnorkel/cdk-github-runners.RunnerImage.Initializer"></a>

```typescript
import { RunnerImage } from '@cloudsnorkel/cdk-github-runners'

const runnerImage: RunnerImage = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImage.property.architecture">architecture</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.Architecture">Architecture</a></code> | Architecture of the image. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImage.property.imageRepository">imageRepository</a></code> | <code>aws-cdk-lib.aws_ecr.IRepository</code> | ECR repository containing the image. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImage.property.imageTag">imageTag</a></code> | <code>string</code> | Static image tag where the image will be pushed. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImage.property.os">os</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.Os">Os</a></code> | OS type of the image. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImage.property.runnerVersion">runnerVersion</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerVersion">RunnerVersion</a></code> | Installed runner version. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImage.property.logGroup">logGroup</a></code> | <code>aws-cdk-lib.aws_logs.LogGroup</code> | Log group where image builds are logged. |

---

##### `architecture`<sup>Required</sup> <a name="architecture" id="@cloudsnorkel/cdk-github-runners.RunnerImage.property.architecture"></a>

```typescript
public readonly architecture: Architecture;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Architecture">Architecture</a>

Architecture of the image.

---

##### `imageRepository`<sup>Required</sup> <a name="imageRepository" id="@cloudsnorkel/cdk-github-runners.RunnerImage.property.imageRepository"></a>

```typescript
public readonly imageRepository: IRepository;
```

- *Type:* aws-cdk-lib.aws_ecr.IRepository

ECR repository containing the image.

---

##### `imageTag`<sup>Required</sup> <a name="imageTag" id="@cloudsnorkel/cdk-github-runners.RunnerImage.property.imageTag"></a>

```typescript
public readonly imageTag: string;
```

- *Type:* string

Static image tag where the image will be pushed.

---

##### `os`<sup>Required</sup> <a name="os" id="@cloudsnorkel/cdk-github-runners.RunnerImage.property.os"></a>

```typescript
public readonly os: Os;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Os">Os</a>

OS type of the image.

---

##### ~~`runnerVersion`~~<sup>Required</sup> <a name="runnerVersion" id="@cloudsnorkel/cdk-github-runners.RunnerImage.property.runnerVersion"></a>

- *Deprecated:* open a ticket if you need this

```typescript
public readonly runnerVersion: RunnerVersion;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerVersion">RunnerVersion</a>

Installed runner version.

---

##### `logGroup`<sup>Optional</sup> <a name="logGroup" id="@cloudsnorkel/cdk-github-runners.RunnerImage.property.logGroup"></a>

```typescript
public readonly logGroup: LogGroup;
```

- *Type:* aws-cdk-lib.aws_logs.LogGroup

Log group where image builds are logged.

---

### RunnerImageAsset <a name="RunnerImageAsset" id="@cloudsnorkel/cdk-github-runners.RunnerImageAsset"></a>

Asset to copy into a built image.

#### Initializer <a name="Initializer" id="@cloudsnorkel/cdk-github-runners.RunnerImageAsset.Initializer"></a>

```typescript
import { RunnerImageAsset } from '@cloudsnorkel/cdk-github-runners'

const runnerImageAsset: RunnerImageAsset = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageAsset.property.source">source</a></code> | <code>string</code> | Path on local system to copy into the image. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageAsset.property.target">target</a></code> | <code>string</code> | Target path in the built image. |

---

##### `source`<sup>Required</sup> <a name="source" id="@cloudsnorkel/cdk-github-runners.RunnerImageAsset.property.source"></a>

```typescript
public readonly source: string;
```

- *Type:* string

Path on local system to copy into the image.

Can be a file or a directory.

---

##### `target`<sup>Required</sup> <a name="target" id="@cloudsnorkel/cdk-github-runners.RunnerImageAsset.property.target"></a>

```typescript
public readonly target: string;
```

- *Type:* string

Target path in the built image.

---

### RunnerImageBuilderProps <a name="RunnerImageBuilderProps" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps"></a>

#### Initializer <a name="Initializer" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps.Initializer"></a>

```typescript
import { RunnerImageBuilderProps } from '@cloudsnorkel/cdk-github-runners'

const runnerImageBuilderProps: RunnerImageBuilderProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps.property.architecture">architecture</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.Architecture">Architecture</a></code> | Image architecture. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps.property.awsImageBuilderOptions">awsImageBuilderOptions</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.AwsImageBuilderRunnerImageBuilderProps">AwsImageBuilderRunnerImageBuilderProps</a></code> | Options specific to AWS Image Builder. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps.property.baseAmi">baseAmi</a></code> | <code>string</code> | Base AMI from which runner AMIs will be built. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps.property.baseDockerImage">baseDockerImage</a></code> | <code>string</code> | Base image from which Docker runner images will be built. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps.property.builderType">builderType</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilderType">RunnerImageBuilderType</a></code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps.property.codeBuildOptions">codeBuildOptions</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerImageBuilderProps">CodeBuildRunnerImageBuilderProps</a></code> | Options specific to CodeBuild image builder. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps.property.components">components</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageComponent">RunnerImageComponent</a>[]</code> | Components to install on the image. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps.property.dockerSetupCommands">dockerSetupCommands</a></code> | <code>string[]</code> | Additional commands to run on the build host before starting the Docker runner image build. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps.property.logRemovalPolicy">logRemovalPolicy</a></code> | <code>aws-cdk-lib.RemovalPolicy</code> | Removal policy for logs of image builds. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps.property.logRetention">logRetention</a></code> | <code>aws-cdk-lib.aws_logs.RetentionDays</code> | The number of days log events are kept in CloudWatch Logs. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps.property.os">os</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.Os">Os</a></code> | Image OS. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps.property.rebuildInterval">rebuildInterval</a></code> | <code>aws-cdk-lib.Duration</code> | Schedule the image to be rebuilt every given interval. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps.property.runnerVersion">runnerVersion</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerVersion">RunnerVersion</a></code> | Version of GitHub Runners to install. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps.property.securityGroups">securityGroups</a></code> | <code>aws-cdk-lib.aws_ec2.ISecurityGroup[]</code> | Security Groups to assign to this instance. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps.property.subnetSelection">subnetSelection</a></code> | <code>aws-cdk-lib.aws_ec2.SubnetSelection</code> | Where to place the network interfaces within the VPC. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps.property.vpc">vpc</a></code> | <code>aws-cdk-lib.aws_ec2.IVpc</code> | VPC to build the image in. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps.property.waitOnDeploy">waitOnDeploy</a></code> | <code>boolean</code> | Wait for image to finish building during deployment. |

---

##### `architecture`<sup>Optional</sup> <a name="architecture" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps.property.architecture"></a>

```typescript
public readonly architecture: Architecture;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Architecture">Architecture</a>
- *Default:* Architecture.X86_64

Image architecture.

---

##### `awsImageBuilderOptions`<sup>Optional</sup> <a name="awsImageBuilderOptions" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps.property.awsImageBuilderOptions"></a>

```typescript
public readonly awsImageBuilderOptions: AwsImageBuilderRunnerImageBuilderProps;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.AwsImageBuilderRunnerImageBuilderProps">AwsImageBuilderRunnerImageBuilderProps</a>

Options specific to AWS Image Builder.

Only used when builderType is RunnerImageBuilderType.AWS_IMAGE_BUILDER.

---

##### `baseAmi`<sup>Optional</sup> <a name="baseAmi" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps.property.baseAmi"></a>

```typescript
public readonly baseAmi: string;
```

- *Type:* string
- *Default:* latest Ubuntu 22.04 AMI for Os.LINUX_UBUNTU and Os.LINUX_UBUNTU_2204, Ubuntu 24.04 AMI for Os.LINUX_UBUNTU_2404, latest Amazon Linux 2 AMI for Os.LINUX_AMAZON_2, latest Windows Server 2022 AMI for Os.WINDOWS

Base AMI from which runner AMIs will be built.

This can be an actual AMI or an AWS Image Builder ARN that points to the latest AMI. For example `arn:aws:imagebuilder:us-east-1:aws:image/ubuntu-server-22-lts-x86/x.x.x` would always use the latest version of Ubuntu 22.04 in each build. If you want a specific version, you can replace `x.x.x` with that version.

---

##### `baseDockerImage`<sup>Optional</sup> <a name="baseDockerImage" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps.property.baseDockerImage"></a>

```typescript
public readonly baseDockerImage: string;
```

- *Type:* string
- *Default:* public.ecr.aws/lts/ubuntu:22.04 for Os.LINUX_UBUNTU and Os.LINUX_UBUNTU_2204, public.ecr.aws/lts/ubuntu:24.04 for Os.LINUX_UBUNTU_2404, public.ecr.aws/amazonlinux/amazonlinux:2 for Os.LINUX_AMAZON_2, mcr.microsoft.com/windows/servercore:ltsc2019-amd64 for Os.WINDOWS

Base image from which Docker runner images will be built.

When using private images from a different account or not on ECR, you may need to include additional setup commands with {@link dockerSetupCommands}.

---

##### `builderType`<sup>Optional</sup> <a name="builderType" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps.property.builderType"></a>

```typescript
public readonly builderType: RunnerImageBuilderType;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilderType">RunnerImageBuilderType</a>
- *Default:* CodeBuild for Linux Docker image, AWS Image Builder for Windows Docker image and any AMI

---

##### `codeBuildOptions`<sup>Optional</sup> <a name="codeBuildOptions" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps.property.codeBuildOptions"></a>

```typescript
public readonly codeBuildOptions: CodeBuildRunnerImageBuilderProps;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerImageBuilderProps">CodeBuildRunnerImageBuilderProps</a>

Options specific to CodeBuild image builder.

Only used when builderType is RunnerImageBuilderType.CODE_BUILD.

---

##### `components`<sup>Optional</sup> <a name="components" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps.property.components"></a>

```typescript
public readonly components: RunnerImageComponent[];
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerImageComponent">RunnerImageComponent</a>[]
- *Default:* none

Components to install on the image.

---

##### `dockerSetupCommands`<sup>Optional</sup> <a name="dockerSetupCommands" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps.property.dockerSetupCommands"></a>

```typescript
public readonly dockerSetupCommands: string[];
```

- *Type:* string[]
- *Default:* []

Additional commands to run on the build host before starting the Docker runner image build.

Use this to execute commands such as `docker login` or `aws ecr get-login-password` to pull private base images.

---

##### `logRemovalPolicy`<sup>Optional</sup> <a name="logRemovalPolicy" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps.property.logRemovalPolicy"></a>

```typescript
public readonly logRemovalPolicy: RemovalPolicy;
```

- *Type:* aws-cdk-lib.RemovalPolicy
- *Default:* RemovalPolicy.DESTROY

Removal policy for logs of image builds.

If deployment fails on the custom resource, try setting this to `RemovalPolicy.RETAIN`. This way the CodeBuild logs can still be viewed, and you can see why the build failed.

We try to not leave anything behind when removed. But sometimes a log staying behind is useful.

---

##### `logRetention`<sup>Optional</sup> <a name="logRetention" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps.property.logRetention"></a>

```typescript
public readonly logRetention: RetentionDays;
```

- *Type:* aws-cdk-lib.aws_logs.RetentionDays
- *Default:* logs.RetentionDays.ONE_MONTH

The number of days log events are kept in CloudWatch Logs.

When updating
this property, unsetting it doesn't remove the log retention policy. To
remove the retention policy, set the value to `INFINITE`.

---

##### `os`<sup>Optional</sup> <a name="os" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps.property.os"></a>

```typescript
public readonly os: Os;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Os">Os</a>
- *Default:* OS.LINUX_UBUNTU

Image OS.

---

##### `rebuildInterval`<sup>Optional</sup> <a name="rebuildInterval" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps.property.rebuildInterval"></a>

```typescript
public readonly rebuildInterval: Duration;
```

- *Type:* aws-cdk-lib.Duration
- *Default:* Duration.days(7)

Schedule the image to be rebuilt every given interval.

Useful for keeping the image up-do-date with the latest GitHub runner version and latest OS updates.

Set to zero to disable.

---

##### `runnerVersion`<sup>Optional</sup> <a name="runnerVersion" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps.property.runnerVersion"></a>

```typescript
public readonly runnerVersion: RunnerVersion;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerVersion">RunnerVersion</a>
- *Default:* latest version available

Version of GitHub Runners to install.

---

##### `securityGroups`<sup>Optional</sup> <a name="securityGroups" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps.property.securityGroups"></a>

```typescript
public readonly securityGroups: ISecurityGroup[];
```

- *Type:* aws-cdk-lib.aws_ec2.ISecurityGroup[]

Security Groups to assign to this instance.

---

##### `subnetSelection`<sup>Optional</sup> <a name="subnetSelection" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps.property.subnetSelection"></a>

```typescript
public readonly subnetSelection: SubnetSelection;
```

- *Type:* aws-cdk-lib.aws_ec2.SubnetSelection
- *Default:* no subnet

Where to place the network interfaces within the VPC.

---

##### `vpc`<sup>Optional</sup> <a name="vpc" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps.property.vpc"></a>

```typescript
public readonly vpc: IVpc;
```

- *Type:* aws-cdk-lib.aws_ec2.IVpc
- *Default:* no VPC

VPC to build the image in.

---

##### `waitOnDeploy`<sup>Optional</sup> <a name="waitOnDeploy" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilderProps.property.waitOnDeploy"></a>

```typescript
public readonly waitOnDeploy: boolean;
```

- *Type:* boolean
- *Default:* true

Wait for image to finish building during deployment.

It's usually best to leave this enabled to ensure everything is ready once deployment is done. However, it can be disabled to speed up deployment in case where you have a lot of image components that can take a long time to build.

Disabling this option means a finished deployment is not ready to be used. You will have to wait for the image to finish building before the system can be used.

Disabling this option may also mean any changes to settings or components can take up to a week (default rebuild interval) to take effect.

---

### RunnerImageComponentCustomProps <a name="RunnerImageComponentCustomProps" id="@cloudsnorkel/cdk-github-runners.RunnerImageComponentCustomProps"></a>

#### Initializer <a name="Initializer" id="@cloudsnorkel/cdk-github-runners.RunnerImageComponentCustomProps.Initializer"></a>

```typescript
import { RunnerImageComponentCustomProps } from '@cloudsnorkel/cdk-github-runners'

const runnerImageComponentCustomProps: RunnerImageComponentCustomProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageComponentCustomProps.property.assets">assets</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageAsset">RunnerImageAsset</a>[]</code> | Assets to copy into the built image. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageComponentCustomProps.property.commands">commands</a></code> | <code>string[]</code> | Commands to run in the built image. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageComponentCustomProps.property.dockerCommands">dockerCommands</a></code> | <code>string[]</code> | Docker commands to run in the built image. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageComponentCustomProps.property.name">name</a></code> | <code>string</code> | Component name used for (1) image build logging and (2) identifier for {@link IConfigurableRunnerImageBuilder.removeComponent }. |

---

##### `assets`<sup>Optional</sup> <a name="assets" id="@cloudsnorkel/cdk-github-runners.RunnerImageComponentCustomProps.property.assets"></a>

```typescript
public readonly assets: RunnerImageAsset[];
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerImageAsset">RunnerImageAsset</a>[]

Assets to copy into the built image.

---

##### `commands`<sup>Optional</sup> <a name="commands" id="@cloudsnorkel/cdk-github-runners.RunnerImageComponentCustomProps.property.commands"></a>

```typescript
public readonly commands: string[];
```

- *Type:* string[]

Commands to run in the built image.

---

##### `dockerCommands`<sup>Optional</sup> <a name="dockerCommands" id="@cloudsnorkel/cdk-github-runners.RunnerImageComponentCustomProps.property.dockerCommands"></a>

```typescript
public readonly dockerCommands: string[];
```

- *Type:* string[]

Docker commands to run in the built image.

For example: `['ENV foo=bar', 'RUN echo $foo']`

These commands are ignored when building AMIs.

---

##### `name`<sup>Optional</sup> <a name="name" id="@cloudsnorkel/cdk-github-runners.RunnerImageComponentCustomProps.property.name"></a>

```typescript
public readonly name: string;
```

- *Type:* string

Component name used for (1) image build logging and (2) identifier for {@link IConfigurableRunnerImageBuilder.removeComponent }.

Name must only contain alphanumeric characters and dashes.

---

### RunnerProviderProps <a name="RunnerProviderProps" id="@cloudsnorkel/cdk-github-runners.RunnerProviderProps"></a>

Common properties for all runner providers.

#### Initializer <a name="Initializer" id="@cloudsnorkel/cdk-github-runners.RunnerProviderProps.Initializer"></a>

```typescript
import { RunnerProviderProps } from '@cloudsnorkel/cdk-github-runners'

const runnerProviderProps: RunnerProviderProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerProviderProps.property.logRetention">logRetention</a></code> | <code>aws-cdk-lib.aws_logs.RetentionDays</code> | The number of days log events are kept in CloudWatch Logs. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerProviderProps.property.retryOptions">retryOptions</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.ProviderRetryOptions">ProviderRetryOptions</a></code> | *No description.* |

---

##### `logRetention`<sup>Optional</sup> <a name="logRetention" id="@cloudsnorkel/cdk-github-runners.RunnerProviderProps.property.logRetention"></a>

```typescript
public readonly logRetention: RetentionDays;
```

- *Type:* aws-cdk-lib.aws_logs.RetentionDays
- *Default:* logs.RetentionDays.ONE_MONTH

The number of days log events are kept in CloudWatch Logs.

When updating
this property, unsetting it doesn't remove the log retention policy. To
remove the retention policy, set the value to `INFINITE`.

---

##### ~~`retryOptions`~~<sup>Optional</sup> <a name="retryOptions" id="@cloudsnorkel/cdk-github-runners.RunnerProviderProps.property.retryOptions"></a>

- *Deprecated:* use {@link retryOptions } on {@link GitHubRunners } instead

```typescript
public readonly retryOptions: ProviderRetryOptions;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.ProviderRetryOptions">ProviderRetryOptions</a>

---

### RunnerRuntimeParameters <a name="RunnerRuntimeParameters" id="@cloudsnorkel/cdk-github-runners.RunnerRuntimeParameters"></a>

Workflow job parameters as parsed from the webhook event. Pass these into your runner executor and run something like:.

```sh
./config.sh --unattended --url "{REGISTRATION_URL}" --token "${RUNNER_TOKEN}" --ephemeral --work _work --labels "${RUNNER_LABEL}" --name "${RUNNER_NAME}" --disableupdate
```

All parameters are specified as step function paths and therefore must be used only in step function task parameters.

#### Initializer <a name="Initializer" id="@cloudsnorkel/cdk-github-runners.RunnerRuntimeParameters.Initializer"></a>

```typescript
import { RunnerRuntimeParameters } from '@cloudsnorkel/cdk-github-runners'

const runnerRuntimeParameters: RunnerRuntimeParameters = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerRuntimeParameters.property.githubDomainPath">githubDomainPath</a></code> | <code>string</code> | Path to GitHub domain. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerRuntimeParameters.property.ownerPath">ownerPath</a></code> | <code>string</code> | Path to repository owner name. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerRuntimeParameters.property.registrationUrl">registrationUrl</a></code> | <code>string</code> | Repository or organization URL to register runner at. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerRuntimeParameters.property.repoPath">repoPath</a></code> | <code>string</code> | Path to repository name. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerRuntimeParameters.property.runnerNamePath">runnerNamePath</a></code> | <code>string</code> | Path to desired runner name. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerRuntimeParameters.property.runnerTokenPath">runnerTokenPath</a></code> | <code>string</code> | Path to runner token used to register token. |

---

##### `githubDomainPath`<sup>Required</sup> <a name="githubDomainPath" id="@cloudsnorkel/cdk-github-runners.RunnerRuntimeParameters.property.githubDomainPath"></a>

```typescript
public readonly githubDomainPath: string;
```

- *Type:* string

Path to GitHub domain.

Most of the time this will be github.com but for self-hosted GitHub instances, this will be different.

---

##### `ownerPath`<sup>Required</sup> <a name="ownerPath" id="@cloudsnorkel/cdk-github-runners.RunnerRuntimeParameters.property.ownerPath"></a>

```typescript
public readonly ownerPath: string;
```

- *Type:* string

Path to repository owner name.

---

##### `registrationUrl`<sup>Required</sup> <a name="registrationUrl" id="@cloudsnorkel/cdk-github-runners.RunnerRuntimeParameters.property.registrationUrl"></a>

```typescript
public readonly registrationUrl: string;
```

- *Type:* string

Repository or organization URL to register runner at.

---

##### `repoPath`<sup>Required</sup> <a name="repoPath" id="@cloudsnorkel/cdk-github-runners.RunnerRuntimeParameters.property.repoPath"></a>

```typescript
public readonly repoPath: string;
```

- *Type:* string

Path to repository name.

---

##### `runnerNamePath`<sup>Required</sup> <a name="runnerNamePath" id="@cloudsnorkel/cdk-github-runners.RunnerRuntimeParameters.property.runnerNamePath"></a>

```typescript
public readonly runnerNamePath: string;
```

- *Type:* string

Path to desired runner name.

We specifically set the name to make troubleshooting easier.

---

##### `runnerTokenPath`<sup>Required</sup> <a name="runnerTokenPath" id="@cloudsnorkel/cdk-github-runners.RunnerRuntimeParameters.property.runnerTokenPath"></a>

```typescript
public readonly runnerTokenPath: string;
```

- *Type:* string

Path to runner token used to register token.

---

### StorageOptions <a name="StorageOptions" id="@cloudsnorkel/cdk-github-runners.StorageOptions"></a>

Storage options for the runner instance.

#### Initializer <a name="Initializer" id="@cloudsnorkel/cdk-github-runners.StorageOptions.Initializer"></a>

```typescript
import { StorageOptions } from '@cloudsnorkel/cdk-github-runners'

const storageOptions: StorageOptions = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.StorageOptions.property.iops">iops</a></code> | <code>number</code> | The number of I/O operations per second (IOPS) to provision for the volume. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.StorageOptions.property.throughput">throughput</a></code> | <code>number</code> | The throughput that the volume supports, in MiB/s Takes a minimum of 125 and maximum of 1000. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.StorageOptions.property.volumeType">volumeType</a></code> | <code>aws-cdk-lib.aws_ec2.EbsDeviceVolumeType</code> | The EBS volume type. |

---

##### `iops`<sup>Optional</sup> <a name="iops" id="@cloudsnorkel/cdk-github-runners.StorageOptions.property.iops"></a>

```typescript
public readonly iops: number;
```

- *Type:* number
- *Default:* none, required for `EbsDeviceVolumeType.IO1`

The number of I/O operations per second (IOPS) to provision for the volume.

Must only be set for `volumeType`: `EbsDeviceVolumeType.IO1`

The maximum ratio of IOPS to volume size (in GiB) is 50:1, so for 5,000 provisioned IOPS,
you need at least 100 GiB storage on the volume.

> [https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EBSVolumeTypes.html](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EBSVolumeTypes.html)

---

##### `throughput`<sup>Optional</sup> <a name="throughput" id="@cloudsnorkel/cdk-github-runners.StorageOptions.property.throughput"></a>

```typescript
public readonly throughput: number;
```

- *Type:* number
- *Default:* 125 MiB/s. Only valid on gp3 volumes.

The throughput that the volume supports, in MiB/s Takes a minimum of 125 and maximum of 1000.

> [https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-ec2-volume.html#cfn-ec2-volume-throughput](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-ec2-volume.html#cfn-ec2-volume-throughput)

---

##### `volumeType`<sup>Optional</sup> <a name="volumeType" id="@cloudsnorkel/cdk-github-runners.StorageOptions.property.volumeType"></a>

```typescript
public readonly volumeType: EbsDeviceVolumeType;
```

- *Type:* aws-cdk-lib.aws_ec2.EbsDeviceVolumeType
- *Default:* `EbsDeviceVolumeType.GP2`

The EBS volume type.

> [https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EBSVolumeTypes.html](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EBSVolumeTypes.html)

---

## Classes <a name="Classes" id="Classes"></a>

### Architecture <a name="Architecture" id="@cloudsnorkel/cdk-github-runners.Architecture"></a>

CPU architecture enum for an image.

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Architecture.instanceTypeMatch">instanceTypeMatch</a></code> | Checks if a given EC2 instance type matches this architecture. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Architecture.is">is</a></code> | Checks if the given architecture is the same as this one. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Architecture.isIn">isIn</a></code> | Checks if this architecture is in a given list. |

---

##### `instanceTypeMatch` <a name="instanceTypeMatch" id="@cloudsnorkel/cdk-github-runners.Architecture.instanceTypeMatch"></a>

```typescript
public instanceTypeMatch(instanceType: InstanceType): boolean
```

Checks if a given EC2 instance type matches this architecture.

###### `instanceType`<sup>Required</sup> <a name="instanceType" id="@cloudsnorkel/cdk-github-runners.Architecture.instanceTypeMatch.parameter.instanceType"></a>

- *Type:* aws-cdk-lib.aws_ec2.InstanceType

instance type to check.

---

##### `is` <a name="is" id="@cloudsnorkel/cdk-github-runners.Architecture.is"></a>

```typescript
public is(arch: Architecture): boolean
```

Checks if the given architecture is the same as this one.

###### `arch`<sup>Required</sup> <a name="arch" id="@cloudsnorkel/cdk-github-runners.Architecture.is.parameter.arch"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Architecture">Architecture</a>

architecture to compare.

---

##### `isIn` <a name="isIn" id="@cloudsnorkel/cdk-github-runners.Architecture.isIn"></a>

```typescript
public isIn(arches: Architecture[]): boolean
```

Checks if this architecture is in a given list.

###### `arches`<sup>Required</sup> <a name="arches" id="@cloudsnorkel/cdk-github-runners.Architecture.isIn.parameter.arches"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Architecture">Architecture</a>[]

architectures to check.

---


#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Architecture.property.name">name</a></code> | <code>string</code> | *No description.* |

---

##### `name`<sup>Required</sup> <a name="name" id="@cloudsnorkel/cdk-github-runners.Architecture.property.name"></a>

```typescript
public readonly name: string;
```

- *Type:* string

---

#### Constants <a name="Constants" id="Constants"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Architecture.property.ARM64">ARM64</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.Architecture">Architecture</a></code> | ARM64. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Architecture.property.X86_64">X86_64</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.Architecture">Architecture</a></code> | X86_64. |

---

##### `ARM64`<sup>Required</sup> <a name="ARM64" id="@cloudsnorkel/cdk-github-runners.Architecture.property.ARM64"></a>

```typescript
public readonly ARM64: Architecture;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Architecture">Architecture</a>

ARM64.

---

##### `X86_64`<sup>Required</sup> <a name="X86_64" id="@cloudsnorkel/cdk-github-runners.Architecture.property.X86_64"></a>

```typescript
public readonly X86_64: Architecture;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Architecture">Architecture</a>

X86_64.

---

### LambdaAccess <a name="LambdaAccess" id="@cloudsnorkel/cdk-github-runners.LambdaAccess"></a>

Access configuration options for Lambda functions like setup and webhook function. Use this to limit access to these functions.

If you need a custom access point, you can implement this abstract class yourself. Note that the Lambda functions expect API Gateway v1 or v2 input. They also expect every URL under the constructed URL to point to the function.

#### Initializers <a name="Initializers" id="@cloudsnorkel/cdk-github-runners.LambdaAccess.Initializer"></a>

```typescript
import { LambdaAccess } from '@cloudsnorkel/cdk-github-runners'

new LambdaAccess()
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaAccess.bind">bind</a></code> | Creates all required resources and returns access URL or empty string if disabled. |

---

##### `bind` <a name="bind" id="@cloudsnorkel/cdk-github-runners.LambdaAccess.bind"></a>

```typescript
public bind(scope: Construct, id: string, lambdaFunction: Function): string
```

Creates all required resources and returns access URL or empty string if disabled.

###### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.LambdaAccess.bind.parameter.scope"></a>

- *Type:* constructs.Construct

---

###### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.LambdaAccess.bind.parameter.id"></a>

- *Type:* string

---

###### `lambdaFunction`<sup>Required</sup> <a name="lambdaFunction" id="@cloudsnorkel/cdk-github-runners.LambdaAccess.bind.parameter.lambdaFunction"></a>

- *Type:* aws-cdk-lib.aws_lambda.Function

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaAccess.apiGateway">apiGateway</a></code> | Provide access using API Gateway. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaAccess.githubWebhookIps">githubWebhookIps</a></code> | Downloads the list of IP addresses used by GitHub.com for webhooks. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaAccess.lambdaUrl">lambdaUrl</a></code> | Provide access using Lambda URL. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaAccess.noAccess">noAccess</a></code> | Disables access to the configured Lambda function. |

---

##### `apiGateway` <a name="apiGateway" id="@cloudsnorkel/cdk-github-runners.LambdaAccess.apiGateway"></a>

```typescript
import { LambdaAccess } from '@cloudsnorkel/cdk-github-runners'

LambdaAccess.apiGateway(props?: ApiGatewayAccessProps)
```

Provide access using API Gateway.

This is the most secure option, but requires additional configuration. It allows you to limit access to specific IP addresses and even to a specific VPC.

To limit access to GitHub.com use:

```
LambdaAccess.apiGateway({
  allowedIps: LambdaAccess.githubWebhookIps(),
});
```

Alternatively, get and manually update the list manually with:

```
curl https://api.github.com/meta | jq .hooks
```

###### `props`<sup>Optional</sup> <a name="props" id="@cloudsnorkel/cdk-github-runners.LambdaAccess.apiGateway.parameter.props"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.ApiGatewayAccessProps">ApiGatewayAccessProps</a>

---

##### `githubWebhookIps` <a name="githubWebhookIps" id="@cloudsnorkel/cdk-github-runners.LambdaAccess.githubWebhookIps"></a>

```typescript
import { LambdaAccess } from '@cloudsnorkel/cdk-github-runners'

LambdaAccess.githubWebhookIps()
```

Downloads the list of IP addresses used by GitHub.com for webhooks.

Note that downloading dynamic data during deployment is not recommended in CDK. This is a workaround for the lack of a better solution.

##### `lambdaUrl` <a name="lambdaUrl" id="@cloudsnorkel/cdk-github-runners.LambdaAccess.lambdaUrl"></a>

```typescript
import { LambdaAccess } from '@cloudsnorkel/cdk-github-runners'

LambdaAccess.lambdaUrl()
```

Provide access using Lambda URL.

This is the default and simplest option. It puts no limits on the requester, but the Lambda functions themselves authenticate every request.

##### `noAccess` <a name="noAccess" id="@cloudsnorkel/cdk-github-runners.LambdaAccess.noAccess"></a>

```typescript
import { LambdaAccess } from '@cloudsnorkel/cdk-github-runners'

LambdaAccess.noAccess()
```

Disables access to the configured Lambda function.

This is useful for the setup function after setup is done.



### LinuxUbuntuComponents <a name="LinuxUbuntuComponents" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents"></a>

Components for Ubuntu Linux that can be used with AWS Image Builder based builders.

These cannot be used by {@link CodeBuildImageBuilder }.

#### Initializers <a name="Initializers" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.Initializer"></a>

```typescript
import { LinuxUbuntuComponents } from '@cloudsnorkel/cdk-github-runners'

new LinuxUbuntuComponents()
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |

---


#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.awsCli">awsCli</a></code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.docker">docker</a></code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.extraCertificates">extraCertificates</a></code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.git">git</a></code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.githubCli">githubCli</a></code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.githubRunner">githubRunner</a></code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.requiredPackages">requiredPackages</a></code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.runnerUser">runnerUser</a></code> | *No description.* |

---

##### ~~`awsCli`~~ <a name="awsCli" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.awsCli"></a>

```typescript
import { LinuxUbuntuComponents } from '@cloudsnorkel/cdk-github-runners'

LinuxUbuntuComponents.awsCli(scope: Construct, id: string, architecture: Architecture)
```

###### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.awsCli.parameter.scope"></a>

- *Type:* constructs.Construct

---

###### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.awsCli.parameter.id"></a>

- *Type:* string

---

###### `architecture`<sup>Required</sup> <a name="architecture" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.awsCli.parameter.architecture"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Architecture">Architecture</a>

---

##### ~~`docker`~~ <a name="docker" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.docker"></a>

```typescript
import { LinuxUbuntuComponents } from '@cloudsnorkel/cdk-github-runners'

LinuxUbuntuComponents.docker(scope: Construct, id: string, _architecture: Architecture)
```

###### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.docker.parameter.scope"></a>

- *Type:* constructs.Construct

---

###### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.docker.parameter.id"></a>

- *Type:* string

---

###### `_architecture`<sup>Required</sup> <a name="_architecture" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.docker.parameter._architecture"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Architecture">Architecture</a>

---

##### ~~`extraCertificates`~~ <a name="extraCertificates" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.extraCertificates"></a>

```typescript
import { LinuxUbuntuComponents } from '@cloudsnorkel/cdk-github-runners'

LinuxUbuntuComponents.extraCertificates(scope: Construct, id: string, path: string)
```

###### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.extraCertificates.parameter.scope"></a>

- *Type:* constructs.Construct

---

###### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.extraCertificates.parameter.id"></a>

- *Type:* string

---

###### `path`<sup>Required</sup> <a name="path" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.extraCertificates.parameter.path"></a>

- *Type:* string

---

##### ~~`git`~~ <a name="git" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.git"></a>

```typescript
import { LinuxUbuntuComponents } from '@cloudsnorkel/cdk-github-runners'

LinuxUbuntuComponents.git(scope: Construct, id: string, _architecture: Architecture)
```

###### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.git.parameter.scope"></a>

- *Type:* constructs.Construct

---

###### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.git.parameter.id"></a>

- *Type:* string

---

###### `_architecture`<sup>Required</sup> <a name="_architecture" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.git.parameter._architecture"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Architecture">Architecture</a>

---

##### ~~`githubCli`~~ <a name="githubCli" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.githubCli"></a>

```typescript
import { LinuxUbuntuComponents } from '@cloudsnorkel/cdk-github-runners'

LinuxUbuntuComponents.githubCli(scope: Construct, id: string, _architecture: Architecture)
```

###### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.githubCli.parameter.scope"></a>

- *Type:* constructs.Construct

---

###### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.githubCli.parameter.id"></a>

- *Type:* string

---

###### `_architecture`<sup>Required</sup> <a name="_architecture" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.githubCli.parameter._architecture"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Architecture">Architecture</a>

---

##### ~~`githubRunner`~~ <a name="githubRunner" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.githubRunner"></a>

```typescript
import { LinuxUbuntuComponents } from '@cloudsnorkel/cdk-github-runners'

LinuxUbuntuComponents.githubRunner(scope: Construct, id: string, runnerVersion: RunnerVersion, architecture: Architecture)
```

###### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.githubRunner.parameter.scope"></a>

- *Type:* constructs.Construct

---

###### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.githubRunner.parameter.id"></a>

- *Type:* string

---

###### `runnerVersion`<sup>Required</sup> <a name="runnerVersion" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.githubRunner.parameter.runnerVersion"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerVersion">RunnerVersion</a>

---

###### `architecture`<sup>Required</sup> <a name="architecture" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.githubRunner.parameter.architecture"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Architecture">Architecture</a>

---

##### ~~`requiredPackages`~~ <a name="requiredPackages" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.requiredPackages"></a>

```typescript
import { LinuxUbuntuComponents } from '@cloudsnorkel/cdk-github-runners'

LinuxUbuntuComponents.requiredPackages(scope: Construct, id: string, architecture: Architecture)
```

###### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.requiredPackages.parameter.scope"></a>

- *Type:* constructs.Construct

---

###### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.requiredPackages.parameter.id"></a>

- *Type:* string

---

###### `architecture`<sup>Required</sup> <a name="architecture" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.requiredPackages.parameter.architecture"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Architecture">Architecture</a>

---

##### ~~`runnerUser`~~ <a name="runnerUser" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.runnerUser"></a>

```typescript
import { LinuxUbuntuComponents } from '@cloudsnorkel/cdk-github-runners'

LinuxUbuntuComponents.runnerUser(scope: Construct, id: string, _architecture: Architecture)
```

###### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.runnerUser.parameter.scope"></a>

- *Type:* constructs.Construct

---

###### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.runnerUser.parameter.id"></a>

- *Type:* string

---

###### `_architecture`<sup>Required</sup> <a name="_architecture" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.runnerUser.parameter._architecture"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Architecture">Architecture</a>

---



### Os <a name="Os" id="@cloudsnorkel/cdk-github-runners.Os"></a>

OS enum for an image.

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Os.is">is</a></code> | Checks if the given OS is the same as this one. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Os.isIn">isIn</a></code> | Checks if this OS is in a given list. |

---

##### `is` <a name="is" id="@cloudsnorkel/cdk-github-runners.Os.is"></a>

```typescript
public is(os: Os): boolean
```

Checks if the given OS is the same as this one.

###### `os`<sup>Required</sup> <a name="os" id="@cloudsnorkel/cdk-github-runners.Os.is.parameter.os"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Os">Os</a>

OS to compare.

---

##### `isIn` <a name="isIn" id="@cloudsnorkel/cdk-github-runners.Os.isIn"></a>

```typescript
public isIn(oses: Os[]): boolean
```

Checks if this OS is in a given list.

###### `oses`<sup>Required</sup> <a name="oses" id="@cloudsnorkel/cdk-github-runners.Os.isIn.parameter.oses"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Os">Os</a>[]

list of OS to check.

---


#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Os.property.name">name</a></code> | <code>string</code> | *No description.* |

---

##### `name`<sup>Required</sup> <a name="name" id="@cloudsnorkel/cdk-github-runners.Os.property.name"></a>

```typescript
public readonly name: string;
```

- *Type:* string

---

#### Constants <a name="Constants" id="Constants"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Os.property.LINUX">LINUX</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.Os">Os</a></code> | Linux. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Os.property.LINUX_AMAZON_2">LINUX_AMAZON_2</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.Os">Os</a></code> | Amazon Linux 2. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Os.property.LINUX_AMAZON_2023">LINUX_AMAZON_2023</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.Os">Os</a></code> | Amazon Linux 2023. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Os.property.LINUX_UBUNTU">LINUX_UBUNTU</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.Os">Os</a></code> | Ubuntu Linux. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Os.property.LINUX_UBUNTU_2204">LINUX_UBUNTU_2204</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.Os">Os</a></code> | Ubuntu Linux 22.04. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Os.property.LINUX_UBUNTU_2404">LINUX_UBUNTU_2404</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.Os">Os</a></code> | Ubuntu Linux 24.04. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Os.property.WINDOWS">WINDOWS</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.Os">Os</a></code> | Windows. |

---

##### ~~`LINUX`~~<sup>Required</sup> <a name="LINUX" id="@cloudsnorkel/cdk-github-runners.Os.property.LINUX"></a>

- *Deprecated:* use {@link LINUX_UBUNTU }, {@link LINUX_UBUNTU_2404 }, {@link LINUX_AMAZON_2 } or {@link LINUX_AMAZON_2023 }

```typescript
public readonly LINUX: Os;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Os">Os</a>

Linux.

---

##### `LINUX_AMAZON_2`<sup>Required</sup> <a name="LINUX_AMAZON_2" id="@cloudsnorkel/cdk-github-runners.Os.property.LINUX_AMAZON_2"></a>

```typescript
public readonly LINUX_AMAZON_2: Os;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Os">Os</a>

Amazon Linux 2.

---

##### `LINUX_AMAZON_2023`<sup>Required</sup> <a name="LINUX_AMAZON_2023" id="@cloudsnorkel/cdk-github-runners.Os.property.LINUX_AMAZON_2023"></a>

```typescript
public readonly LINUX_AMAZON_2023: Os;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Os">Os</a>

Amazon Linux 2023.

---

##### `LINUX_UBUNTU`<sup>Required</sup> <a name="LINUX_UBUNTU" id="@cloudsnorkel/cdk-github-runners.Os.property.LINUX_UBUNTU"></a>

```typescript
public readonly LINUX_UBUNTU: Os;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Os">Os</a>

Ubuntu Linux.

---

##### `LINUX_UBUNTU_2204`<sup>Required</sup> <a name="LINUX_UBUNTU_2204" id="@cloudsnorkel/cdk-github-runners.Os.property.LINUX_UBUNTU_2204"></a>

```typescript
public readonly LINUX_UBUNTU_2204: Os;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Os">Os</a>

Ubuntu Linux 22.04.

---

##### `LINUX_UBUNTU_2404`<sup>Required</sup> <a name="LINUX_UBUNTU_2404" id="@cloudsnorkel/cdk-github-runners.Os.property.LINUX_UBUNTU_2404"></a>

```typescript
public readonly LINUX_UBUNTU_2404: Os;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Os">Os</a>

Ubuntu Linux 24.04.

---

##### `WINDOWS`<sup>Required</sup> <a name="WINDOWS" id="@cloudsnorkel/cdk-github-runners.Os.property.WINDOWS"></a>

```typescript
public readonly WINDOWS: Os;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Os">Os</a>

Windows.

---

### RunnerImageComponent <a name="RunnerImageComponent" id="@cloudsnorkel/cdk-github-runners.RunnerImageComponent"></a>

Components are used to build runner images.

They can run commands in the image, copy files into the image, and run some Docker commands.

#### Initializers <a name="Initializers" id="@cloudsnorkel/cdk-github-runners.RunnerImageComponent.Initializer"></a>

```typescript
import { RunnerImageComponent } from '@cloudsnorkel/cdk-github-runners'

new RunnerImageComponent()
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageComponent.getAssets">getAssets</a></code> | Returns assets to copy into the built image. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageComponent.getCommands">getCommands</a></code> | Returns commands to run to in built image. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageComponent.getDockerCommands">getDockerCommands</a></code> | Returns Docker commands to run to in built image. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageComponent.shouldReboot">shouldReboot</a></code> | Returns true if the image builder should be rebooted after this component is installed. |

---

##### `getAssets` <a name="getAssets" id="@cloudsnorkel/cdk-github-runners.RunnerImageComponent.getAssets"></a>

```typescript
public getAssets(_os: Os, _architecture: Architecture): RunnerImageAsset[]
```

Returns assets to copy into the built image.

Can be used to copy files into the image.

###### `_os`<sup>Required</sup> <a name="_os" id="@cloudsnorkel/cdk-github-runners.RunnerImageComponent.getAssets.parameter._os"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Os">Os</a>

---

###### `_architecture`<sup>Required</sup> <a name="_architecture" id="@cloudsnorkel/cdk-github-runners.RunnerImageComponent.getAssets.parameter._architecture"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Architecture">Architecture</a>

---

##### `getCommands` <a name="getCommands" id="@cloudsnorkel/cdk-github-runners.RunnerImageComponent.getCommands"></a>

```typescript
public getCommands(_os: Os, _architecture: Architecture): string[]
```

Returns commands to run to in built image.

Can be used to install packages, setup build prerequisites, etc.

###### `_os`<sup>Required</sup> <a name="_os" id="@cloudsnorkel/cdk-github-runners.RunnerImageComponent.getCommands.parameter._os"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Os">Os</a>

---

###### `_architecture`<sup>Required</sup> <a name="_architecture" id="@cloudsnorkel/cdk-github-runners.RunnerImageComponent.getCommands.parameter._architecture"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Architecture">Architecture</a>

---

##### `getDockerCommands` <a name="getDockerCommands" id="@cloudsnorkel/cdk-github-runners.RunnerImageComponent.getDockerCommands"></a>

```typescript
public getDockerCommands(_os: Os, _architecture: Architecture): string[]
```

Returns Docker commands to run to in built image.

Can be used to add commands like `VOLUME`, `ENTRYPOINT`, `CMD`, etc.

Docker commands are added after assets and normal commands.

###### `_os`<sup>Required</sup> <a name="_os" id="@cloudsnorkel/cdk-github-runners.RunnerImageComponent.getDockerCommands.parameter._os"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Os">Os</a>

---

###### `_architecture`<sup>Required</sup> <a name="_architecture" id="@cloudsnorkel/cdk-github-runners.RunnerImageComponent.getDockerCommands.parameter._architecture"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Architecture">Architecture</a>

---

##### `shouldReboot` <a name="shouldReboot" id="@cloudsnorkel/cdk-github-runners.RunnerImageComponent.shouldReboot"></a>

```typescript
public shouldReboot(_os: Os, _architecture: Architecture): boolean
```

Returns true if the image builder should be rebooted after this component is installed.

###### `_os`<sup>Required</sup> <a name="_os" id="@cloudsnorkel/cdk-github-runners.RunnerImageComponent.shouldReboot.parameter._os"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Os">Os</a>

---

###### `_architecture`<sup>Required</sup> <a name="_architecture" id="@cloudsnorkel/cdk-github-runners.RunnerImageComponent.shouldReboot.parameter._architecture"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Architecture">Architecture</a>

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageComponent.awsCli">awsCli</a></code> | A component to install the AWS CLI. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageComponent.custom">custom</a></code> | Define a custom component that can run commands in the image, copy files into the image, and run some Docker commands. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageComponent.docker">docker</a></code> | A component to install Docker. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageComponent.dockerInDocker">dockerInDocker</a></code> | A component to install Docker-in-Docker. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageComponent.environmentVariables">environmentVariables</a></code> | A component to add environment variables for jobs the runner executes. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageComponent.extraCertificates">extraCertificates</a></code> | A component to add a trusted certificate authority. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageComponent.git">git</a></code> | A component to install the GitHub CLI. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageComponent.githubCli">githubCli</a></code> | A component to install the GitHub CLI. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageComponent.githubRunner">githubRunner</a></code> | A component to install the GitHub Actions Runner. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageComponent.lambdaEntrypoint">lambdaEntrypoint</a></code> | A component to set up the required Lambda entrypoint for Lambda runners. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageComponent.requiredPackages">requiredPackages</a></code> | A component to install the required packages for the runner. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageComponent.runnerUser">runnerUser</a></code> | A component to prepare the required runner user. |

---

##### `awsCli` <a name="awsCli" id="@cloudsnorkel/cdk-github-runners.RunnerImageComponent.awsCli"></a>

```typescript
import { RunnerImageComponent } from '@cloudsnorkel/cdk-github-runners'

RunnerImageComponent.awsCli()
```

A component to install the AWS CLI.

##### `custom` <a name="custom" id="@cloudsnorkel/cdk-github-runners.RunnerImageComponent.custom"></a>

```typescript
import { RunnerImageComponent } from '@cloudsnorkel/cdk-github-runners'

RunnerImageComponent.custom(props: RunnerImageComponentCustomProps)
```

Define a custom component that can run commands in the image, copy files into the image, and run some Docker commands.

The order of operations is (1) assets (2) commands (3) docker commands.

Use this to customize the image for the runner.

**WARNING:** Docker commands are not guaranteed to be included before the next component

###### `props`<sup>Required</sup> <a name="props" id="@cloudsnorkel/cdk-github-runners.RunnerImageComponent.custom.parameter.props"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerImageComponentCustomProps">RunnerImageComponentCustomProps</a>

---

##### `docker` <a name="docker" id="@cloudsnorkel/cdk-github-runners.RunnerImageComponent.docker"></a>

```typescript
import { RunnerImageComponent } from '@cloudsnorkel/cdk-github-runners'

RunnerImageComponent.docker()
```

A component to install Docker.

On Windows this sets up dockerd for Windows containers without Docker Desktop. If you need Linux containers on Windows, you'll need to install Docker Desktop which doesn't seem to play well with servers (PRs welcome).

##### ~~`dockerInDocker`~~ <a name="dockerInDocker" id="@cloudsnorkel/cdk-github-runners.RunnerImageComponent.dockerInDocker"></a>

```typescript
import { RunnerImageComponent } from '@cloudsnorkel/cdk-github-runners'

RunnerImageComponent.dockerInDocker()
```

A component to install Docker-in-Docker.

##### `environmentVariables` <a name="environmentVariables" id="@cloudsnorkel/cdk-github-runners.RunnerImageComponent.environmentVariables"></a>

```typescript
import { RunnerImageComponent } from '@cloudsnorkel/cdk-github-runners'

RunnerImageComponent.environmentVariables(vars: {[ key: string ]: string})
```

A component to add environment variables for jobs the runner executes.

These variables only affect the jobs ran by the runner. They are not global. They do not affect other components.

It is not recommended to use this component to pass secrets. Instead, use GitHub Secrets or AWS Secrets Manager.

Must be used after the {@link githubRunner} component.

###### `vars`<sup>Required</sup> <a name="vars" id="@cloudsnorkel/cdk-github-runners.RunnerImageComponent.environmentVariables.parameter.vars"></a>

- *Type:* {[ key: string ]: string}

---

##### `extraCertificates` <a name="extraCertificates" id="@cloudsnorkel/cdk-github-runners.RunnerImageComponent.extraCertificates"></a>

```typescript
import { RunnerImageComponent } from '@cloudsnorkel/cdk-github-runners'

RunnerImageComponent.extraCertificates(source: string, name: string)
```

A component to add a trusted certificate authority.

This can be used to support GitHub Enterprise Server with self-signed certificate.

###### `source`<sup>Required</sup> <a name="source" id="@cloudsnorkel/cdk-github-runners.RunnerImageComponent.extraCertificates.parameter.source"></a>

- *Type:* string

path to certificate file in PEM format.

---

###### `name`<sup>Required</sup> <a name="name" id="@cloudsnorkel/cdk-github-runners.RunnerImageComponent.extraCertificates.parameter.name"></a>

- *Type:* string

unique certificate name to be used on runner file system.

---

##### `git` <a name="git" id="@cloudsnorkel/cdk-github-runners.RunnerImageComponent.git"></a>

```typescript
import { RunnerImageComponent } from '@cloudsnorkel/cdk-github-runners'

RunnerImageComponent.git()
```

A component to install the GitHub CLI.

##### `githubCli` <a name="githubCli" id="@cloudsnorkel/cdk-github-runners.RunnerImageComponent.githubCli"></a>

```typescript
import { RunnerImageComponent } from '@cloudsnorkel/cdk-github-runners'

RunnerImageComponent.githubCli()
```

A component to install the GitHub CLI.

##### `githubRunner` <a name="githubRunner" id="@cloudsnorkel/cdk-github-runners.RunnerImageComponent.githubRunner"></a>

```typescript
import { RunnerImageComponent } from '@cloudsnorkel/cdk-github-runners'

RunnerImageComponent.githubRunner(runnerVersion: RunnerVersion)
```

A component to install the GitHub Actions Runner.

This is the actual executable that connects to GitHub to ask for jobs and then execute them.

###### `runnerVersion`<sup>Required</sup> <a name="runnerVersion" id="@cloudsnorkel/cdk-github-runners.RunnerImageComponent.githubRunner.parameter.runnerVersion"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerVersion">RunnerVersion</a>

The version of the runner to install.

Usually you would set this to latest.

---

##### `lambdaEntrypoint` <a name="lambdaEntrypoint" id="@cloudsnorkel/cdk-github-runners.RunnerImageComponent.lambdaEntrypoint"></a>

```typescript
import { RunnerImageComponent } from '@cloudsnorkel/cdk-github-runners'

RunnerImageComponent.lambdaEntrypoint()
```

A component to set up the required Lambda entrypoint for Lambda runners.

##### `requiredPackages` <a name="requiredPackages" id="@cloudsnorkel/cdk-github-runners.RunnerImageComponent.requiredPackages"></a>

```typescript
import { RunnerImageComponent } from '@cloudsnorkel/cdk-github-runners'

RunnerImageComponent.requiredPackages()
```

A component to install the required packages for the runner.

##### `runnerUser` <a name="runnerUser" id="@cloudsnorkel/cdk-github-runners.RunnerImageComponent.runnerUser"></a>

```typescript
import { RunnerImageComponent } from '@cloudsnorkel/cdk-github-runners'

RunnerImageComponent.runnerUser()
```

A component to prepare the required runner user.

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageComponent.property.name">name</a></code> | <code>string</code> | Component name. |

---

##### `name`<sup>Required</sup> <a name="name" id="@cloudsnorkel/cdk-github-runners.RunnerImageComponent.property.name"></a>

```typescript
public readonly name: string;
```

- *Type:* string

Component name.

Used to identify component in image build logs, and for {@link IConfigurableRunnerImageBuilder.removeComponent }

---


### RunnerVersion <a name="RunnerVersion" id="@cloudsnorkel/cdk-github-runners.RunnerVersion"></a>

Defines desired GitHub Actions runner version.

#### Initializers <a name="Initializers" id="@cloudsnorkel/cdk-github-runners.RunnerVersion.Initializer"></a>

```typescript
import { RunnerVersion } from '@cloudsnorkel/cdk-github-runners'

new RunnerVersion(version: string)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerVersion.Initializer.parameter.version">version</a></code> | <code>string</code> | *No description.* |

---

##### `version`<sup>Required</sup> <a name="version" id="@cloudsnorkel/cdk-github-runners.RunnerVersion.Initializer.parameter.version"></a>

- *Type:* string

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerVersion.is">is</a></code> | Check if two versions are the same. |

---

##### `is` <a name="is" id="@cloudsnorkel/cdk-github-runners.RunnerVersion.is"></a>

```typescript
public is(other: RunnerVersion): boolean
```

Check if two versions are the same.

###### `other`<sup>Required</sup> <a name="other" id="@cloudsnorkel/cdk-github-runners.RunnerVersion.is.parameter.other"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerVersion">RunnerVersion</a>

version to compare.

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerVersion.latest">latest</a></code> | Use the latest version available at the time the runner provider image is built. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerVersion.specific">specific</a></code> | Use a specific version. |

---

##### `latest` <a name="latest" id="@cloudsnorkel/cdk-github-runners.RunnerVersion.latest"></a>

```typescript
import { RunnerVersion } from '@cloudsnorkel/cdk-github-runners'

RunnerVersion.latest()
```

Use the latest version available at the time the runner provider image is built.

##### `specific` <a name="specific" id="@cloudsnorkel/cdk-github-runners.RunnerVersion.specific"></a>

```typescript
import { RunnerVersion } from '@cloudsnorkel/cdk-github-runners'

RunnerVersion.specific(version: string)
```

Use a specific version.

> [https://github.com/actions/runner/releases](https://github.com/actions/runner/releases)

###### `version`<sup>Required</sup> <a name="version" id="@cloudsnorkel/cdk-github-runners.RunnerVersion.specific.parameter.version"></a>

- *Type:* string

GitHub Runner version.

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerVersion.property.version">version</a></code> | <code>string</code> | *No description.* |

---

##### `version`<sup>Required</sup> <a name="version" id="@cloudsnorkel/cdk-github-runners.RunnerVersion.property.version"></a>

```typescript
public readonly version: string;
```

- *Type:* string

---


### StaticRunnerImage <a name="StaticRunnerImage" id="@cloudsnorkel/cdk-github-runners.StaticRunnerImage"></a>

Helper class with methods to use static images that are built outside the context of this project.

#### Initializers <a name="Initializers" id="@cloudsnorkel/cdk-github-runners.StaticRunnerImage.Initializer"></a>

```typescript
import { StaticRunnerImage } from '@cloudsnorkel/cdk-github-runners'

new StaticRunnerImage()
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |

---


#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.StaticRunnerImage.fromDockerHub">fromDockerHub</a></code> | Create a builder from an existing Docker Hub image. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.StaticRunnerImage.fromEcrRepository">fromEcrRepository</a></code> | Create a builder (that doesn't actually build anything) from an existing image in an existing repository. |

---

##### `fromDockerHub` <a name="fromDockerHub" id="@cloudsnorkel/cdk-github-runners.StaticRunnerImage.fromDockerHub"></a>

```typescript
import { StaticRunnerImage } from '@cloudsnorkel/cdk-github-runners'

StaticRunnerImage.fromDockerHub(scope: Construct, id: string, image: string, architecture?: Architecture, os?: Os)
```

Create a builder from an existing Docker Hub image.

The image must already have GitHub Actions runner installed. You are responsible to update it and remove it when done.

We create a CodeBuild image builder behind the scenes to copy the image over to ECR. This helps avoid Docker Hub rate limits and prevent failures.

###### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.StaticRunnerImage.fromDockerHub.parameter.scope"></a>

- *Type:* constructs.Construct

---

###### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.StaticRunnerImage.fromDockerHub.parameter.id"></a>

- *Type:* string

---

###### `image`<sup>Required</sup> <a name="image" id="@cloudsnorkel/cdk-github-runners.StaticRunnerImage.fromDockerHub.parameter.image"></a>

- *Type:* string

Docker Hub image with optional tag.

---

###### `architecture`<sup>Optional</sup> <a name="architecture" id="@cloudsnorkel/cdk-github-runners.StaticRunnerImage.fromDockerHub.parameter.architecture"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Architecture">Architecture</a>

image architecture.

---

###### `os`<sup>Optional</sup> <a name="os" id="@cloudsnorkel/cdk-github-runners.StaticRunnerImage.fromDockerHub.parameter.os"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Os">Os</a>

image OS.

---

##### `fromEcrRepository` <a name="fromEcrRepository" id="@cloudsnorkel/cdk-github-runners.StaticRunnerImage.fromEcrRepository"></a>

```typescript
import { StaticRunnerImage } from '@cloudsnorkel/cdk-github-runners'

StaticRunnerImage.fromEcrRepository(repository: IRepository, tag?: string, architecture?: Architecture, os?: Os)
```

Create a builder (that doesn't actually build anything) from an existing image in an existing repository.

The image must already have GitHub Actions runner installed. You are responsible to update it and remove it when done.

###### `repository`<sup>Required</sup> <a name="repository" id="@cloudsnorkel/cdk-github-runners.StaticRunnerImage.fromEcrRepository.parameter.repository"></a>

- *Type:* aws-cdk-lib.aws_ecr.IRepository

ECR repository.

---

###### `tag`<sup>Optional</sup> <a name="tag" id="@cloudsnorkel/cdk-github-runners.StaticRunnerImage.fromEcrRepository.parameter.tag"></a>

- *Type:* string

image tag.

---

###### `architecture`<sup>Optional</sup> <a name="architecture" id="@cloudsnorkel/cdk-github-runners.StaticRunnerImage.fromEcrRepository.parameter.architecture"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Architecture">Architecture</a>

image architecture.

---

###### `os`<sup>Optional</sup> <a name="os" id="@cloudsnorkel/cdk-github-runners.StaticRunnerImage.fromEcrRepository.parameter.os"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Os">Os</a>

image OS.

---



### WindowsComponents <a name="WindowsComponents" id="@cloudsnorkel/cdk-github-runners.WindowsComponents"></a>

Components for Windows that can be used with AWS Image Builder based builders.

These cannot be used by {@link CodeBuildImageBuilder }.

#### Initializers <a name="Initializers" id="@cloudsnorkel/cdk-github-runners.WindowsComponents.Initializer"></a>

```typescript
import { WindowsComponents } from '@cloudsnorkel/cdk-github-runners'

new WindowsComponents()
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |

---


#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.WindowsComponents.awsCli">awsCli</a></code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.WindowsComponents.cloudwatchAgent">cloudwatchAgent</a></code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.WindowsComponents.docker">docker</a></code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.WindowsComponents.extraCertificates">extraCertificates</a></code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.WindowsComponents.git">git</a></code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.WindowsComponents.githubCli">githubCli</a></code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.WindowsComponents.githubRunner">githubRunner</a></code> | *No description.* |

---

##### ~~`awsCli`~~ <a name="awsCli" id="@cloudsnorkel/cdk-github-runners.WindowsComponents.awsCli"></a>

```typescript
import { WindowsComponents } from '@cloudsnorkel/cdk-github-runners'

WindowsComponents.awsCli(scope: Construct, id: string)
```

###### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.WindowsComponents.awsCli.parameter.scope"></a>

- *Type:* constructs.Construct

---

###### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.WindowsComponents.awsCli.parameter.id"></a>

- *Type:* string

---

##### ~~`cloudwatchAgent`~~ <a name="cloudwatchAgent" id="@cloudsnorkel/cdk-github-runners.WindowsComponents.cloudwatchAgent"></a>

```typescript
import { WindowsComponents } from '@cloudsnorkel/cdk-github-runners'

WindowsComponents.cloudwatchAgent(scope: Construct, id: string)
```

###### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.WindowsComponents.cloudwatchAgent.parameter.scope"></a>

- *Type:* constructs.Construct

---

###### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.WindowsComponents.cloudwatchAgent.parameter.id"></a>

- *Type:* string

---

##### ~~`docker`~~ <a name="docker" id="@cloudsnorkel/cdk-github-runners.WindowsComponents.docker"></a>

```typescript
import { WindowsComponents } from '@cloudsnorkel/cdk-github-runners'

WindowsComponents.docker(scope: Construct, id: string)
```

###### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.WindowsComponents.docker.parameter.scope"></a>

- *Type:* constructs.Construct

---

###### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.WindowsComponents.docker.parameter.id"></a>

- *Type:* string

---

##### ~~`extraCertificates`~~ <a name="extraCertificates" id="@cloudsnorkel/cdk-github-runners.WindowsComponents.extraCertificates"></a>

```typescript
import { WindowsComponents } from '@cloudsnorkel/cdk-github-runners'

WindowsComponents.extraCertificates(scope: Construct, id: string, path: string)
```

###### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.WindowsComponents.extraCertificates.parameter.scope"></a>

- *Type:* constructs.Construct

---

###### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.WindowsComponents.extraCertificates.parameter.id"></a>

- *Type:* string

---

###### `path`<sup>Required</sup> <a name="path" id="@cloudsnorkel/cdk-github-runners.WindowsComponents.extraCertificates.parameter.path"></a>

- *Type:* string

---

##### ~~`git`~~ <a name="git" id="@cloudsnorkel/cdk-github-runners.WindowsComponents.git"></a>

```typescript
import { WindowsComponents } from '@cloudsnorkel/cdk-github-runners'

WindowsComponents.git(scope: Construct, id: string)
```

###### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.WindowsComponents.git.parameter.scope"></a>

- *Type:* constructs.Construct

---

###### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.WindowsComponents.git.parameter.id"></a>

- *Type:* string

---

##### ~~`githubCli`~~ <a name="githubCli" id="@cloudsnorkel/cdk-github-runners.WindowsComponents.githubCli"></a>

```typescript
import { WindowsComponents } from '@cloudsnorkel/cdk-github-runners'

WindowsComponents.githubCli(scope: Construct, id: string)
```

###### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.WindowsComponents.githubCli.parameter.scope"></a>

- *Type:* constructs.Construct

---

###### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.WindowsComponents.githubCli.parameter.id"></a>

- *Type:* string

---

##### ~~`githubRunner`~~ <a name="githubRunner" id="@cloudsnorkel/cdk-github-runners.WindowsComponents.githubRunner"></a>

```typescript
import { WindowsComponents } from '@cloudsnorkel/cdk-github-runners'

WindowsComponents.githubRunner(scope: Construct, id: string, runnerVersion: RunnerVersion)
```

###### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.WindowsComponents.githubRunner.parameter.scope"></a>

- *Type:* constructs.Construct

---

###### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.WindowsComponents.githubRunner.parameter.id"></a>

- *Type:* string

---

###### `runnerVersion`<sup>Required</sup> <a name="runnerVersion" id="@cloudsnorkel/cdk-github-runners.WindowsComponents.githubRunner.parameter.runnerVersion"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerVersion">RunnerVersion</a>

---



## Protocols <a name="Protocols" id="Protocols"></a>

### IConfigurableRunnerImageBuilder <a name="IConfigurableRunnerImageBuilder" id="@cloudsnorkel/cdk-github-runners.IConfigurableRunnerImageBuilder"></a>

- *Extends:* <a href="#@cloudsnorkel/cdk-github-runners.IRunnerImageBuilder">IRunnerImageBuilder</a>, aws-cdk-lib.aws_ec2.IConnectable, aws-cdk-lib.aws_iam.IGrantable

- *Implemented By:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilder">RunnerImageBuilder</a>, <a href="#@cloudsnorkel/cdk-github-runners.IConfigurableRunnerImageBuilder">IConfigurableRunnerImageBuilder</a>

Interface for constructs that build an image that can be used in {@link IRunnerProvider }.

The image can be configured by adding or removing components. The image builder can be configured by adding grants or allowing connections.

An image can be a Docker image or AMI.

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.IConfigurableRunnerImageBuilder.addComponent">addComponent</a></code> | Add a component to the image builder. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.IConfigurableRunnerImageBuilder.removeComponent">removeComponent</a></code> | Remove a component from the image builder. |

---

##### `addComponent` <a name="addComponent" id="@cloudsnorkel/cdk-github-runners.IConfigurableRunnerImageBuilder.addComponent"></a>

```typescript
public addComponent(component: RunnerImageComponent): void
```

Add a component to the image builder.

The component will be added to the end of the list of components.

###### `component`<sup>Required</sup> <a name="component" id="@cloudsnorkel/cdk-github-runners.IConfigurableRunnerImageBuilder.addComponent.parameter.component"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerImageComponent">RunnerImageComponent</a>

component to add.

---

##### `removeComponent` <a name="removeComponent" id="@cloudsnorkel/cdk-github-runners.IConfigurableRunnerImageBuilder.removeComponent"></a>

```typescript
public removeComponent(component: RunnerImageComponent): void
```

Remove a component from the image builder.

Removal is done by component name. Multiple components with the same name will all be removed.

###### `component`<sup>Required</sup> <a name="component" id="@cloudsnorkel/cdk-github-runners.IConfigurableRunnerImageBuilder.removeComponent.parameter.component"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerImageComponent">RunnerImageComponent</a>

component to remove.

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.IConfigurableRunnerImageBuilder.property.connections">connections</a></code> | <code>aws-cdk-lib.aws_ec2.Connections</code> | The network connections associated with this resource. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.IConfigurableRunnerImageBuilder.property.grantPrincipal">grantPrincipal</a></code> | <code>aws-cdk-lib.aws_iam.IPrincipal</code> | The principal to grant permissions to. |

---

##### `connections`<sup>Required</sup> <a name="connections" id="@cloudsnorkel/cdk-github-runners.IConfigurableRunnerImageBuilder.property.connections"></a>

```typescript
public readonly connections: Connections;
```

- *Type:* aws-cdk-lib.aws_ec2.Connections

The network connections associated with this resource.

---

##### `grantPrincipal`<sup>Required</sup> <a name="grantPrincipal" id="@cloudsnorkel/cdk-github-runners.IConfigurableRunnerImageBuilder.property.grantPrincipal"></a>

```typescript
public readonly grantPrincipal: IPrincipal;
```

- *Type:* aws-cdk-lib.aws_iam.IPrincipal

The principal to grant permissions to.

---

### IRunnerAmiStatus <a name="IRunnerAmiStatus" id="@cloudsnorkel/cdk-github-runners.IRunnerAmiStatus"></a>

- *Implemented By:* <a href="#@cloudsnorkel/cdk-github-runners.IRunnerAmiStatus">IRunnerAmiStatus</a>

AMI status returned from runner providers to be displayed as output of status function.


#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.IRunnerAmiStatus.property.launchTemplate">launchTemplate</a></code> | <code>string</code> | Id of launch template pointing to the latest AMI built by the AMI builder. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.IRunnerAmiStatus.property.amiBuilderLogGroup">amiBuilderLogGroup</a></code> | <code>string</code> | Log group name for the AMI builder where history of builds can be analyzed. |

---

##### `launchTemplate`<sup>Required</sup> <a name="launchTemplate" id="@cloudsnorkel/cdk-github-runners.IRunnerAmiStatus.property.launchTemplate"></a>

```typescript
public readonly launchTemplate: string;
```

- *Type:* string

Id of launch template pointing to the latest AMI built by the AMI builder.

---

##### `amiBuilderLogGroup`<sup>Optional</sup> <a name="amiBuilderLogGroup" id="@cloudsnorkel/cdk-github-runners.IRunnerAmiStatus.property.amiBuilderLogGroup"></a>

```typescript
public readonly amiBuilderLogGroup: string;
```

- *Type:* string

Log group name for the AMI builder where history of builds can be analyzed.

---

### IRunnerImageBuilder <a name="IRunnerImageBuilder" id="@cloudsnorkel/cdk-github-runners.IRunnerImageBuilder"></a>

- *Implemented By:* <a href="#@cloudsnorkel/cdk-github-runners.AmiBuilder">AmiBuilder</a>, <a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder">CodeBuildImageBuilder</a>, <a href="#@cloudsnorkel/cdk-github-runners.ContainerImageBuilder">ContainerImageBuilder</a>, <a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilder">RunnerImageBuilder</a>, <a href="#@cloudsnorkel/cdk-github-runners.IConfigurableRunnerImageBuilder">IConfigurableRunnerImageBuilder</a>, <a href="#@cloudsnorkel/cdk-github-runners.IRunnerImageBuilder">IRunnerImageBuilder</a>

Interface for constructs that build an image that can be used in {@link IRunnerProvider }.

An image can be a Docker image or AMI.

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.IRunnerImageBuilder.bindAmi">bindAmi</a></code> | Build and return an AMI with GitHub Runner installed in it. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.IRunnerImageBuilder.bindDockerImage">bindDockerImage</a></code> | Build and return a Docker image with GitHub Runner installed in it. |

---

##### `bindAmi` <a name="bindAmi" id="@cloudsnorkel/cdk-github-runners.IRunnerImageBuilder.bindAmi"></a>

```typescript
public bindAmi(): RunnerAmi
```

Build and return an AMI with GitHub Runner installed in it.

Anything that ends up with a launch template pointing to an AMI that runs GitHub self-hosted runners can be used. A simple implementation could even point to an existing AMI and nothing else.

The AMI can be further updated over time manually or using a schedule as long as it is always written to the same launch template.

##### `bindDockerImage` <a name="bindDockerImage" id="@cloudsnorkel/cdk-github-runners.IRunnerImageBuilder.bindDockerImage"></a>

```typescript
public bindDockerImage(): RunnerImage
```

Build and return a Docker image with GitHub Runner installed in it.

Anything that ends up with an ECR repository containing a Docker image that runs GitHub self-hosted runners can be used. A simple implementation could even point to an existing image and nothing else.

It's important that the specified image tag be available at the time the repository is available. Providers usually assume the image is ready and will fail if it's not.

The image can be further updated over time manually or using a schedule as long as it is always written to the same tag.


### IRunnerImageStatus <a name="IRunnerImageStatus" id="@cloudsnorkel/cdk-github-runners.IRunnerImageStatus"></a>

- *Implemented By:* <a href="#@cloudsnorkel/cdk-github-runners.IRunnerImageStatus">IRunnerImageStatus</a>

Image status returned from runner providers to be displayed in status.json.


#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.IRunnerImageStatus.property.imageRepository">imageRepository</a></code> | <code>string</code> | Image repository where image builder pushes runner images. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.IRunnerImageStatus.property.imageTag">imageTag</a></code> | <code>string</code> | Tag of image that should be used. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.IRunnerImageStatus.property.imageBuilderLogGroup">imageBuilderLogGroup</a></code> | <code>string</code> | Log group name for the image builder where history of image builds can be analyzed. |

---

##### `imageRepository`<sup>Required</sup> <a name="imageRepository" id="@cloudsnorkel/cdk-github-runners.IRunnerImageStatus.property.imageRepository"></a>

```typescript
public readonly imageRepository: string;
```

- *Type:* string

Image repository where image builder pushes runner images.

---

##### `imageTag`<sup>Required</sup> <a name="imageTag" id="@cloudsnorkel/cdk-github-runners.IRunnerImageStatus.property.imageTag"></a>

```typescript
public readonly imageTag: string;
```

- *Type:* string

Tag of image that should be used.

---

##### `imageBuilderLogGroup`<sup>Optional</sup> <a name="imageBuilderLogGroup" id="@cloudsnorkel/cdk-github-runners.IRunnerImageStatus.property.imageBuilderLogGroup"></a>

```typescript
public readonly imageBuilderLogGroup: string;
```

- *Type:* string

Log group name for the image builder where history of image builds can be analyzed.

---

### IRunnerProvider <a name="IRunnerProvider" id="@cloudsnorkel/cdk-github-runners.IRunnerProvider"></a>

- *Extends:* aws-cdk-lib.aws_ec2.IConnectable, aws-cdk-lib.aws_iam.IGrantable, constructs.IConstruct

- *Implemented By:* <a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunner">CodeBuildRunner</a>, <a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProvider">CodeBuildRunnerProvider</a>, <a href="#@cloudsnorkel/cdk-github-runners.Ec2Runner">Ec2Runner</a>, <a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProvider">Ec2RunnerProvider</a>, <a href="#@cloudsnorkel/cdk-github-runners.EcsRunnerProvider">EcsRunnerProvider</a>, <a href="#@cloudsnorkel/cdk-github-runners.FargateRunner">FargateRunner</a>, <a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProvider">FargateRunnerProvider</a>, <a href="#@cloudsnorkel/cdk-github-runners.LambdaRunner">LambdaRunner</a>, <a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProvider">LambdaRunnerProvider</a>, <a href="#@cloudsnorkel/cdk-github-runners.IRunnerProvider">IRunnerProvider</a>

Interface for all runner providers.

Implementations create all required resources and return a step function task that starts those resources from {@link getStepFunctionTask}.

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.IRunnerProvider.getStepFunctionTask">getStepFunctionTask</a></code> | Generate step function tasks that execute the runner. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.IRunnerProvider.grantStateMachine">grantStateMachine</a></code> | An optional method that modifies the role of the state machine after all the tasks have been generated. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.IRunnerProvider.status">status</a></code> | Return status of the runner provider to be used in the main status function. |

---

##### `getStepFunctionTask` <a name="getStepFunctionTask" id="@cloudsnorkel/cdk-github-runners.IRunnerProvider.getStepFunctionTask"></a>

```typescript
public getStepFunctionTask(parameters: RunnerRuntimeParameters): IChainable
```

Generate step function tasks that execute the runner.

Called by GithubRunners and shouldn't be called manually.

###### `parameters`<sup>Required</sup> <a name="parameters" id="@cloudsnorkel/cdk-github-runners.IRunnerProvider.getStepFunctionTask.parameter.parameters"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerRuntimeParameters">RunnerRuntimeParameters</a>

specific build parameters.

---

##### `grantStateMachine` <a name="grantStateMachine" id="@cloudsnorkel/cdk-github-runners.IRunnerProvider.grantStateMachine"></a>

```typescript
public grantStateMachine(stateMachineRole: IGrantable): void
```

An optional method that modifies the role of the state machine after all the tasks have been generated.

This can be used to add additional policy
statements to the state machine role that are not automatically added by the task returned from {@link getStepFunctionTask}.

###### `stateMachineRole`<sup>Required</sup> <a name="stateMachineRole" id="@cloudsnorkel/cdk-github-runners.IRunnerProvider.grantStateMachine.parameter.stateMachineRole"></a>

- *Type:* aws-cdk-lib.aws_iam.IGrantable

role for the state machine that executes the task returned from {@link getStepFunctionTask}.

---

##### `status` <a name="status" id="@cloudsnorkel/cdk-github-runners.IRunnerProvider.status"></a>

```typescript
public status(statusFunctionRole: IGrantable): IRunnerProviderStatus
```

Return status of the runner provider to be used in the main status function.

Also gives the status function any needed permissions to query the Docker image or AMI.

###### `statusFunctionRole`<sup>Required</sup> <a name="statusFunctionRole" id="@cloudsnorkel/cdk-github-runners.IRunnerProvider.status.parameter.statusFunctionRole"></a>

- *Type:* aws-cdk-lib.aws_iam.IGrantable

grantable for the status function.

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.IRunnerProvider.property.connections">connections</a></code> | <code>aws-cdk-lib.aws_ec2.Connections</code> | The network connections associated with this resource. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.IRunnerProvider.property.grantPrincipal">grantPrincipal</a></code> | <code>aws-cdk-lib.aws_iam.IPrincipal</code> | The principal to grant permissions to. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.IRunnerProvider.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.IRunnerProvider.property.labels">labels</a></code> | <code>string[]</code> | GitHub Actions labels used for this provider. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.IRunnerProvider.property.logGroup">logGroup</a></code> | <code>aws-cdk-lib.aws_logs.ILogGroup</code> | Log group where provided runners will save their logs. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.IRunnerProvider.property.retryableErrors">retryableErrors</a></code> | <code>string[]</code> | List of step functions errors that should be retried. |

---

##### `connections`<sup>Required</sup> <a name="connections" id="@cloudsnorkel/cdk-github-runners.IRunnerProvider.property.connections"></a>

```typescript
public readonly connections: Connections;
```

- *Type:* aws-cdk-lib.aws_ec2.Connections

The network connections associated with this resource.

---

##### `grantPrincipal`<sup>Required</sup> <a name="grantPrincipal" id="@cloudsnorkel/cdk-github-runners.IRunnerProvider.property.grantPrincipal"></a>

```typescript
public readonly grantPrincipal: IPrincipal;
```

- *Type:* aws-cdk-lib.aws_iam.IPrincipal

The principal to grant permissions to.

---

##### `node`<sup>Required</sup> <a name="node" id="@cloudsnorkel/cdk-github-runners.IRunnerProvider.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `labels`<sup>Required</sup> <a name="labels" id="@cloudsnorkel/cdk-github-runners.IRunnerProvider.property.labels"></a>

```typescript
public readonly labels: string[];
```

- *Type:* string[]

GitHub Actions labels used for this provider.

These labels are used to identify which provider should spawn a new on-demand runner. Every job sends a webhook with the labels it's looking for
based on runs-on. We use match the labels from the webhook with the labels specified here. If all the labels specified here are present in the
job's labels, this provider will be chosen and spawn a new runner.

---

##### `logGroup`<sup>Required</sup> <a name="logGroup" id="@cloudsnorkel/cdk-github-runners.IRunnerProvider.property.logGroup"></a>

```typescript
public readonly logGroup: ILogGroup;
```

- *Type:* aws-cdk-lib.aws_logs.ILogGroup

Log group where provided runners will save their logs.

Note that this is not the job log, but the runner itself. It will not contain output from the GitHub Action but only metadata on its execution.

---

##### ~~`retryableErrors`~~<sup>Required</sup> <a name="retryableErrors" id="@cloudsnorkel/cdk-github-runners.IRunnerProvider.property.retryableErrors"></a>

- *Deprecated:* do not use

```typescript
public readonly retryableErrors: string[];
```

- *Type:* string[]

List of step functions errors that should be retried.

---

### IRunnerProviderStatus <a name="IRunnerProviderStatus" id="@cloudsnorkel/cdk-github-runners.IRunnerProviderStatus"></a>

- *Implemented By:* <a href="#@cloudsnorkel/cdk-github-runners.IRunnerProviderStatus">IRunnerProviderStatus</a>

Interface for runner image status used by status.json.


#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.IRunnerProviderStatus.property.labels">labels</a></code> | <code>string[]</code> | Labels associated with provider. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.IRunnerProviderStatus.property.type">type</a></code> | <code>string</code> | Runner provider type. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.IRunnerProviderStatus.property.ami">ami</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.IRunnerAmiStatus">IRunnerAmiStatus</a></code> | Details about AMI used by this runner provider. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.IRunnerProviderStatus.property.image">image</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.IRunnerImageStatus">IRunnerImageStatus</a></code> | Details about Docker image used by this runner provider. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.IRunnerProviderStatus.property.logGroup">logGroup</a></code> | <code>string</code> | Log group for runners. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.IRunnerProviderStatus.property.roleArn">roleArn</a></code> | <code>string</code> | Role attached to runners. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.IRunnerProviderStatus.property.securityGroups">securityGroups</a></code> | <code>string[]</code> | Security groups attached to runners. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.IRunnerProviderStatus.property.vpcArn">vpcArn</a></code> | <code>string</code> | VPC where runners will be launched. |

---

##### `labels`<sup>Required</sup> <a name="labels" id="@cloudsnorkel/cdk-github-runners.IRunnerProviderStatus.property.labels"></a>

```typescript
public readonly labels: string[];
```

- *Type:* string[]

Labels associated with provider.

---

##### `type`<sup>Required</sup> <a name="type" id="@cloudsnorkel/cdk-github-runners.IRunnerProviderStatus.property.type"></a>

```typescript
public readonly type: string;
```

- *Type:* string

Runner provider type.

---

##### `ami`<sup>Optional</sup> <a name="ami" id="@cloudsnorkel/cdk-github-runners.IRunnerProviderStatus.property.ami"></a>

```typescript
public readonly ami: IRunnerAmiStatus;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.IRunnerAmiStatus">IRunnerAmiStatus</a>

Details about AMI used by this runner provider.

---

##### `image`<sup>Optional</sup> <a name="image" id="@cloudsnorkel/cdk-github-runners.IRunnerProviderStatus.property.image"></a>

```typescript
public readonly image: IRunnerImageStatus;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.IRunnerImageStatus">IRunnerImageStatus</a>

Details about Docker image used by this runner provider.

---

##### `logGroup`<sup>Optional</sup> <a name="logGroup" id="@cloudsnorkel/cdk-github-runners.IRunnerProviderStatus.property.logGroup"></a>

```typescript
public readonly logGroup: string;
```

- *Type:* string

Log group for runners.

---

##### `roleArn`<sup>Optional</sup> <a name="roleArn" id="@cloudsnorkel/cdk-github-runners.IRunnerProviderStatus.property.roleArn"></a>

```typescript
public readonly roleArn: string;
```

- *Type:* string

Role attached to runners.

---

##### `securityGroups`<sup>Optional</sup> <a name="securityGroups" id="@cloudsnorkel/cdk-github-runners.IRunnerProviderStatus.property.securityGroups"></a>

```typescript
public readonly securityGroups: string[];
```

- *Type:* string[]

Security groups attached to runners.

---

##### `vpcArn`<sup>Optional</sup> <a name="vpcArn" id="@cloudsnorkel/cdk-github-runners.IRunnerProviderStatus.property.vpcArn"></a>

```typescript
public readonly vpcArn: string;
```

- *Type:* string

VPC where runners will be launched.

---

## Enums <a name="Enums" id="Enums"></a>

### RunnerImageBuilderType <a name="RunnerImageBuilderType" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilderType"></a>

#### Members <a name="Members" id="Members"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilderType.CODE_BUILD">CODE_BUILD</a></code> | Build runner images using AWS CodeBuild. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImageBuilderType.AWS_IMAGE_BUILDER">AWS_IMAGE_BUILDER</a></code> | Build runner images using AWS Image Builder. |

---

##### `CODE_BUILD` <a name="CODE_BUILD" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilderType.CODE_BUILD"></a>

Build runner images using AWS CodeBuild.

Faster than AWS Image Builder, but can only be used to build Linux Docker images.

---


##### `AWS_IMAGE_BUILDER` <a name="AWS_IMAGE_BUILDER" id="@cloudsnorkel/cdk-github-runners.RunnerImageBuilderType.AWS_IMAGE_BUILDER"></a>

Build runner images using AWS Image Builder.

Slower than CodeBuild, but can be used to build any type of image including AMIs and Windows images.

---


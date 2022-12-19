# API Reference <a name="API Reference" id="api-reference"></a>

## Constructs <a name="Constructs" id="Constructs"></a>

### AmiBuilder <a name="AmiBuilder" id="@cloudsnorkel/cdk-github-runners.AmiBuilder"></a>

- *Implements:* <a href="#@cloudsnorkel/cdk-github-runners.IAmiBuilder">IAmiBuilder</a>, aws-cdk-lib.aws_ec2.IConnectable

An AMI builder that uses AWS Image Builder to build AMIs pre-baked with all the GitHub Actions runner requirements.

Builders can be used with {@link Ec2Runner}.

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
     'set -ex',
     'apt-get install p7zip',
   ],
}));
new Ec2Runner(this, 'EC2 provider', {
     label: 'custom-ec2',
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
| <code><a href="#@cloudsnorkel/cdk-github-runners.AmiBuilder.bind">bind</a></code> | Called by IRunnerProvider to finalize settings and create the AMI builder. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.AmiBuilder.prependComponent">prependComponent</a></code> | Add a component to be installed before any other components. |

---

##### `toString` <a name="toString" id="@cloudsnorkel/cdk-github-runners.AmiBuilder.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### `addComponent` <a name="addComponent" id="@cloudsnorkel/cdk-github-runners.AmiBuilder.addComponent"></a>

```typescript
public addComponent(component: ImageBuilderComponent): void
```

Add a component to be installed.

###### `component`<sup>Required</sup> <a name="component" id="@cloudsnorkel/cdk-github-runners.AmiBuilder.addComponent.parameter.component"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.ImageBuilderComponent">ImageBuilderComponent</a>

---

##### `addExtraCertificates` <a name="addExtraCertificates" id="@cloudsnorkel/cdk-github-runners.AmiBuilder.addExtraCertificates"></a>

```typescript
public addExtraCertificates(path: string): void
```

Add extra trusted certificates.

This helps deal with self-signed certificates for GitHub Enterprise Server.

###### `path`<sup>Required</sup> <a name="path" id="@cloudsnorkel/cdk-github-runners.AmiBuilder.addExtraCertificates.parameter.path"></a>

- *Type:* string

path to directory containing a file called certs.pem containing all the required certificates.

---

##### `bind` <a name="bind" id="@cloudsnorkel/cdk-github-runners.AmiBuilder.bind"></a>

```typescript
public bind(): RunnerAmi
```

Called by IRunnerProvider to finalize settings and create the AMI builder.

##### `prependComponent` <a name="prependComponent" id="@cloudsnorkel/cdk-github-runners.AmiBuilder.prependComponent"></a>

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

##### `node`<sup>Required</sup> <a name="node" id="@cloudsnorkel/cdk-github-runners.AmiBuilder.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `connections`<sup>Required</sup> <a name="connections" id="@cloudsnorkel/cdk-github-runners.AmiBuilder.property.connections"></a>

```typescript
public readonly connections: Connections;
```

- *Type:* aws-cdk-lib.aws_ec2.Connections

The network connections associated with this resource.

---


### CodeBuildImageBuilder <a name="CodeBuildImageBuilder" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder"></a>

- *Implements:* <a href="#@cloudsnorkel/cdk-github-runners.IImageBuilder">IImageBuilder</a>

An image builder that uses CodeBuild to build Docker images pre-baked with all the GitHub Actions runner requirements.

Builders can be used with runner providers.

Each builder re-runs automatically at a set interval to make sure the images contain the latest versions of everything.

You can create an instance of this construct to customize the image used to spin-up runners. Each provider has its own requirements for what an image should do. That's why they each provide their own Dockerfile.

For example, to set a specific runner version, rebuild the image every 2 weeks, and add a few packages for the Fargate provider, use:

```
const builder = new CodeBuildImageBuilder(this, 'Builder', {
     dockerfilePath: FargateProvider.LINUX_X64_DOCKERFILE_PATH,
     runnerVersion: RunnerVersion.specific('2.293.0'),
     rebuildInterval: Duration.days(14),
});
builder.setBuildArg('EXTRA_PACKAGES', 'nginx xz-utils');
new FargateRunner(this, 'Fargate provider', {
     label: 'customized-fargate',
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
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.bind">bind</a></code> | Called by IRunnerProvider to finalize settings and create the image builder. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.setBuildArg">setBuildArg</a></code> | Adds a build argument for Docker. |

---

##### `toString` <a name="toString" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### `addExtraCertificates` <a name="addExtraCertificates" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.addExtraCertificates"></a>

```typescript
public addExtraCertificates(path: string): void
```

Add extra trusted certificates. This helps deal with self-signed certificates for GitHub Enterprise Server.

All first party Dockerfiles support this. Others may not.

###### `path`<sup>Required</sup> <a name="path" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.addExtraCertificates.parameter.path"></a>

- *Type:* string

path to directory containing a file called certs.pem containing all the required certificates.

---

##### `addFiles` <a name="addFiles" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.addFiles"></a>

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

##### `addPolicyStatement` <a name="addPolicyStatement" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.addPolicyStatement"></a>

```typescript
public addPolicyStatement(statement: PolicyStatement): void
```

Add a policy statement to the builder to access resources required to the image build.

###### `statement`<sup>Required</sup> <a name="statement" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.addPolicyStatement.parameter.statement"></a>

- *Type:* aws-cdk-lib.aws_iam.PolicyStatement

IAM policy statement.

---

##### `addPostBuildCommand` <a name="addPostBuildCommand" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.addPostBuildCommand"></a>

```typescript
public addPostBuildCommand(command: string): void
```

Adds a command that runs after `docker build` and `docker push`.

###### `command`<sup>Required</sup> <a name="command" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.addPostBuildCommand.parameter.command"></a>

- *Type:* string

command to add.

---

##### `addPreBuildCommand` <a name="addPreBuildCommand" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.addPreBuildCommand"></a>

```typescript
public addPreBuildCommand(command: string): void
```

Adds a command that runs before `docker build`.

###### `command`<sup>Required</sup> <a name="command" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.addPreBuildCommand.parameter.command"></a>

- *Type:* string

command to add.

---

##### `bind` <a name="bind" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.bind"></a>

```typescript
public bind(): RunnerImage
```

Called by IRunnerProvider to finalize settings and create the image builder.

##### `setBuildArg` <a name="setBuildArg" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.setBuildArg"></a>

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
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.property.props">props</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilderProps">CodeBuildImageBuilderProps</a></code> | *No description.* |

---

##### `node`<sup>Required</sup> <a name="node" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `props`<sup>Required</sup> <a name="props" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder.property.props"></a>

```typescript
public readonly props: CodeBuildImageBuilderProps;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilderProps">CodeBuildImageBuilderProps</a>

---


### CodeBuildRunner <a name="CodeBuildRunner" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner"></a>

- *Implements:* <a href="#@cloudsnorkel/cdk-github-runners.IRunnerProvider">IRunnerProvider</a>

GitHub Actions runner provider using CodeBuild to execute jobs.

Creates a project that gets started for each job.

This construct is not meant to be used by itself. It should be passed in the providers property for GitHubRunners.

#### Initializers <a name="Initializers" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.Initializer"></a>

```typescript
import { CodeBuildRunner } from '@cloudsnorkel/cdk-github-runners'

new CodeBuildRunner(scope: Construct, id: string, props?: CodeBuildRunnerProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunner.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunner.Initializer.parameter.id">id</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunner.Initializer.parameter.props">props</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProps">CodeBuildRunnerProps</a></code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.Initializer.parameter.id"></a>

- *Type:* string

---

##### `props`<sup>Optional</sup> <a name="props" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.Initializer.parameter.props"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProps">CodeBuildRunnerProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunner.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunner.getStepFunctionTask">getStepFunctionTask</a></code> | Generate step function task(s) to start a new runner. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunner.grantStateMachine">grantStateMachine</a></code> | An optional method that modifies the role of the state machine after all the tasks have been generated. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunner.status">status</a></code> | Return status of the runner provider to be used in the main status function. |

---

##### `toString` <a name="toString" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### `getStepFunctionTask` <a name="getStepFunctionTask" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.getStepFunctionTask"></a>

```typescript
public getStepFunctionTask(parameters: RunnerRuntimeParameters): IChainable
```

Generate step function task(s) to start a new runner.

Called by GithubRunners and shouldn't be called manually.

###### `parameters`<sup>Required</sup> <a name="parameters" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.getStepFunctionTask.parameter.parameters"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerRuntimeParameters">RunnerRuntimeParameters</a>

workflow job details.

---

##### `grantStateMachine` <a name="grantStateMachine" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.grantStateMachine"></a>

```typescript
public grantStateMachine(_: IGrantable): void
```

An optional method that modifies the role of the state machine after all the tasks have been generated.

This can be used to add additional policy
statements to the state machine role that are not automatically added by the task returned from {@link getStepFunctionTask}.

###### `_`<sup>Required</sup> <a name="_" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.grantStateMachine.parameter._"></a>

- *Type:* aws-cdk-lib.aws_iam.IGrantable

---

##### `status` <a name="status" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.status"></a>

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

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunner.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunner.property.connections">connections</a></code> | <code>aws-cdk-lib.aws_ec2.Connections</code> | The network connections associated with this resource. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunner.property.grantPrincipal">grantPrincipal</a></code> | <code>aws-cdk-lib.aws_iam.IPrincipal</code> | Grant principal used to add permissions to the runner role. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunner.property.image">image</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImage">RunnerImage</a></code> | Docker image loaded with GitHub Actions Runner and its prerequisites. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunner.property.labels">labels</a></code> | <code>string[]</code> | Labels associated with this provider. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunner.property.project">project</a></code> | <code>aws-cdk-lib.aws_codebuild.Project</code> | CodeBuild project hosting the runner. |

---

##### `node`<sup>Required</sup> <a name="node" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `connections`<sup>Required</sup> <a name="connections" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.property.connections"></a>

```typescript
public readonly connections: Connections;
```

- *Type:* aws-cdk-lib.aws_ec2.Connections

The network connections associated with this resource.

---

##### `grantPrincipal`<sup>Required</sup> <a name="grantPrincipal" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.property.grantPrincipal"></a>

```typescript
public readonly grantPrincipal: IPrincipal;
```

- *Type:* aws-cdk-lib.aws_iam.IPrincipal

Grant principal used to add permissions to the runner role.

---

##### `image`<sup>Required</sup> <a name="image" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.property.image"></a>

```typescript
public readonly image: RunnerImage;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerImage">RunnerImage</a>

Docker image loaded with GitHub Actions Runner and its prerequisites.

The image is built by an image builder and is specific to CodeBuild.

---

##### `labels`<sup>Required</sup> <a name="labels" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.property.labels"></a>

```typescript
public readonly labels: string[];
```

- *Type:* string[]

Labels associated with this provider.

---

##### `project`<sup>Required</sup> <a name="project" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.property.project"></a>

```typescript
public readonly project: Project;
```

- *Type:* aws-cdk-lib.aws_codebuild.Project

CodeBuild project hosting the runner.

---

#### Constants <a name="Constants" id="Constants"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunner.property.LINUX_ARM64_DOCKERFILE_PATH">LINUX_ARM64_DOCKERFILE_PATH</a></code> | <code>string</code> | Path to Dockerfile for Linux ARM64 with all the requirements for CodeBuild runner. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunner.property.LINUX_X64_DOCKERFILE_PATH">LINUX_X64_DOCKERFILE_PATH</a></code> | <code>string</code> | Path to Dockerfile for Linux x64 with all the requirements for CodeBuild runner. |

---

##### `LINUX_ARM64_DOCKERFILE_PATH`<sup>Required</sup> <a name="LINUX_ARM64_DOCKERFILE_PATH" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.property.LINUX_ARM64_DOCKERFILE_PATH"></a>

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

##### `LINUX_X64_DOCKERFILE_PATH`<sup>Required</sup> <a name="LINUX_X64_DOCKERFILE_PATH" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunner.property.LINUX_X64_DOCKERFILE_PATH"></a>

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

- *Implements:* <a href="#@cloudsnorkel/cdk-github-runners.IImageBuilder">IImageBuilder</a>, aws-cdk-lib.aws_ec2.IConnectable

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
new CodeBuildRunner(this, 'CodeBuild provider', {
     label: 'custom-codebuild',
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
| <code><a href="#@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.bind">bind</a></code> | Called by IRunnerProvider to finalize settings and create the image builder. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.prependComponent">prependComponent</a></code> | Add a component to be installed before any other components. |

---

##### `toString` <a name="toString" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### `addComponent` <a name="addComponent" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.addComponent"></a>

```typescript
public addComponent(component: ImageBuilderComponent): void
```

Add a component to be installed.

###### `component`<sup>Required</sup> <a name="component" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.addComponent.parameter.component"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.ImageBuilderComponent">ImageBuilderComponent</a>

---

##### `addExtraCertificates` <a name="addExtraCertificates" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.addExtraCertificates"></a>

```typescript
public addExtraCertificates(path: string): void
```

Add extra trusted certificates. This helps deal with self-signed certificates for GitHub Enterprise Server.

All first party Dockerfiles support this. Others may not.

###### `path`<sup>Required</sup> <a name="path" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.addExtraCertificates.parameter.path"></a>

- *Type:* string

path to directory containing a file called certs.pem containing all the required certificates.

---

##### `bind` <a name="bind" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.bind"></a>

```typescript
public bind(): RunnerImage
```

Called by IRunnerProvider to finalize settings and create the image builder.

##### `prependComponent` <a name="prependComponent" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.prependComponent"></a>

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

##### `node`<sup>Required</sup> <a name="node" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `connections`<sup>Required</sup> <a name="connections" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.property.connections"></a>

```typescript
public readonly connections: Connections;
```

- *Type:* aws-cdk-lib.aws_ec2.Connections

The network connections associated with this resource.

---

##### `repository`<sup>Required</sup> <a name="repository" id="@cloudsnorkel/cdk-github-runners.ContainerImageBuilder.property.repository"></a>

```typescript
public readonly repository: IRepository;
```

- *Type:* aws-cdk-lib.aws_ecr.IRepository

---


### Ec2Runner <a name="Ec2Runner" id="@cloudsnorkel/cdk-github-runners.Ec2Runner"></a>

- *Implements:* <a href="#@cloudsnorkel/cdk-github-runners.IRunnerProvider">IRunnerProvider</a>

GitHub Actions runner provider using EC2 to execute jobs.

This construct is not meant to be used by itself. It should be passed in the providers property for GitHubRunners.

#### Initializers <a name="Initializers" id="@cloudsnorkel/cdk-github-runners.Ec2Runner.Initializer"></a>

```typescript
import { Ec2Runner } from '@cloudsnorkel/cdk-github-runners'

new Ec2Runner(scope: Construct, id: string, props?: Ec2RunnerProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2Runner.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2Runner.Initializer.parameter.id">id</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2Runner.Initializer.parameter.props">props</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProps">Ec2RunnerProps</a></code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.Ec2Runner.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.Ec2Runner.Initializer.parameter.id"></a>

- *Type:* string

---

##### `props`<sup>Optional</sup> <a name="props" id="@cloudsnorkel/cdk-github-runners.Ec2Runner.Initializer.parameter.props"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProps">Ec2RunnerProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2Runner.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2Runner.getStepFunctionTask">getStepFunctionTask</a></code> | Generate step function task(s) to start a new runner. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2Runner.grantStateMachine">grantStateMachine</a></code> | An optional method that modifies the role of the state machine after all the tasks have been generated. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2Runner.status">status</a></code> | Return status of the runner provider to be used in the main status function. |

---

##### `toString` <a name="toString" id="@cloudsnorkel/cdk-github-runners.Ec2Runner.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### `getStepFunctionTask` <a name="getStepFunctionTask" id="@cloudsnorkel/cdk-github-runners.Ec2Runner.getStepFunctionTask"></a>

```typescript
public getStepFunctionTask(parameters: RunnerRuntimeParameters): IChainable
```

Generate step function task(s) to start a new runner.

Called by GithubRunners and shouldn't be called manually.

###### `parameters`<sup>Required</sup> <a name="parameters" id="@cloudsnorkel/cdk-github-runners.Ec2Runner.getStepFunctionTask.parameter.parameters"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerRuntimeParameters">RunnerRuntimeParameters</a>

workflow job details.

---

##### `grantStateMachine` <a name="grantStateMachine" id="@cloudsnorkel/cdk-github-runners.Ec2Runner.grantStateMachine"></a>

```typescript
public grantStateMachine(stateMachineRole: IGrantable): void
```

An optional method that modifies the role of the state machine after all the tasks have been generated.

This can be used to add additional policy
statements to the state machine role that are not automatically added by the task returned from {@link getStepFunctionTask}.

###### `stateMachineRole`<sup>Required</sup> <a name="stateMachineRole" id="@cloudsnorkel/cdk-github-runners.Ec2Runner.grantStateMachine.parameter.stateMachineRole"></a>

- *Type:* aws-cdk-lib.aws_iam.IGrantable

---

##### `status` <a name="status" id="@cloudsnorkel/cdk-github-runners.Ec2Runner.status"></a>

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

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2Runner.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2Runner.property.connections">connections</a></code> | <code>aws-cdk-lib.aws_ec2.Connections</code> | The network connections associated with this resource. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2Runner.property.grantPrincipal">grantPrincipal</a></code> | <code>aws-cdk-lib.aws_iam.IPrincipal</code> | Grant principal used to add permissions to the runner role. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2Runner.property.labels">labels</a></code> | <code>string[]</code> | Labels associated with this provider. |

---

##### `node`<sup>Required</sup> <a name="node" id="@cloudsnorkel/cdk-github-runners.Ec2Runner.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `connections`<sup>Required</sup> <a name="connections" id="@cloudsnorkel/cdk-github-runners.Ec2Runner.property.connections"></a>

```typescript
public readonly connections: Connections;
```

- *Type:* aws-cdk-lib.aws_ec2.Connections

The network connections associated with this resource.

---

##### `grantPrincipal`<sup>Required</sup> <a name="grantPrincipal" id="@cloudsnorkel/cdk-github-runners.Ec2Runner.property.grantPrincipal"></a>

```typescript
public readonly grantPrincipal: IPrincipal;
```

- *Type:* aws-cdk-lib.aws_iam.IPrincipal

Grant principal used to add permissions to the runner role.

---

##### `labels`<sup>Required</sup> <a name="labels" id="@cloudsnorkel/cdk-github-runners.Ec2Runner.property.labels"></a>

```typescript
public readonly labels: string[];
```

- *Type:* string[]

Labels associated with this provider.

---


### FargateRunner <a name="FargateRunner" id="@cloudsnorkel/cdk-github-runners.FargateRunner"></a>

- *Implements:* <a href="#@cloudsnorkel/cdk-github-runners.IRunnerProvider">IRunnerProvider</a>

GitHub Actions runner provider using Fargate to execute jobs.

Creates a task definition with a single container that gets started for each job.

This construct is not meant to be used by itself. It should be passed in the providers property for GitHubRunners.

#### Initializers <a name="Initializers" id="@cloudsnorkel/cdk-github-runners.FargateRunner.Initializer"></a>

```typescript
import { FargateRunner } from '@cloudsnorkel/cdk-github-runners'

new FargateRunner(scope: Construct, id: string, props?: FargateRunnerProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunner.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunner.Initializer.parameter.id">id</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunner.Initializer.parameter.props">props</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProps">FargateRunnerProps</a></code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.FargateRunner.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.FargateRunner.Initializer.parameter.id"></a>

- *Type:* string

---

##### `props`<sup>Optional</sup> <a name="props" id="@cloudsnorkel/cdk-github-runners.FargateRunner.Initializer.parameter.props"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProps">FargateRunnerProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunner.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunner.getStepFunctionTask">getStepFunctionTask</a></code> | Generate step function task(s) to start a new runner. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunner.grantStateMachine">grantStateMachine</a></code> | An optional method that modifies the role of the state machine after all the tasks have been generated. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunner.status">status</a></code> | Return status of the runner provider to be used in the main status function. |

---

##### `toString` <a name="toString" id="@cloudsnorkel/cdk-github-runners.FargateRunner.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### `getStepFunctionTask` <a name="getStepFunctionTask" id="@cloudsnorkel/cdk-github-runners.FargateRunner.getStepFunctionTask"></a>

```typescript
public getStepFunctionTask(parameters: RunnerRuntimeParameters): IChainable
```

Generate step function task(s) to start a new runner.

Called by GithubRunners and shouldn't be called manually.

###### `parameters`<sup>Required</sup> <a name="parameters" id="@cloudsnorkel/cdk-github-runners.FargateRunner.getStepFunctionTask.parameter.parameters"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerRuntimeParameters">RunnerRuntimeParameters</a>

workflow job details.

---

##### `grantStateMachine` <a name="grantStateMachine" id="@cloudsnorkel/cdk-github-runners.FargateRunner.grantStateMachine"></a>

```typescript
public grantStateMachine(_: IGrantable): void
```

An optional method that modifies the role of the state machine after all the tasks have been generated.

This can be used to add additional policy
statements to the state machine role that are not automatically added by the task returned from {@link getStepFunctionTask}.

###### `_`<sup>Required</sup> <a name="_" id="@cloudsnorkel/cdk-github-runners.FargateRunner.grantStateMachine.parameter._"></a>

- *Type:* aws-cdk-lib.aws_iam.IGrantable

---

##### `status` <a name="status" id="@cloudsnorkel/cdk-github-runners.FargateRunner.status"></a>

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
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunner.property.spot">spot</a></code> | <code>boolean</code> | Use spot pricing for Fargate tasks. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunner.property.task">task</a></code> | <code>aws-cdk-lib.aws_ecs.FargateTaskDefinition</code> | Fargate task hosting the runner. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunner.property.subnetSelection">subnetSelection</a></code> | <code>aws-cdk-lib.aws_ec2.SubnetSelection</code> | Subnets used for hosting the runner task. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunner.property.vpc">vpc</a></code> | <code>aws-cdk-lib.aws_ec2.IVpc</code> | VPC used for hosting the runner task. |

---

##### `node`<sup>Required</sup> <a name="node" id="@cloudsnorkel/cdk-github-runners.FargateRunner.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `assignPublicIp`<sup>Required</sup> <a name="assignPublicIp" id="@cloudsnorkel/cdk-github-runners.FargateRunner.property.assignPublicIp"></a>

```typescript
public readonly assignPublicIp: boolean;
```

- *Type:* boolean

Whether runner task will have a public IP.

---

##### `cluster`<sup>Required</sup> <a name="cluster" id="@cloudsnorkel/cdk-github-runners.FargateRunner.property.cluster"></a>

```typescript
public readonly cluster: Cluster;
```

- *Type:* aws-cdk-lib.aws_ecs.Cluster

Cluster hosting the task hosting the runner.

---

##### `connections`<sup>Required</sup> <a name="connections" id="@cloudsnorkel/cdk-github-runners.FargateRunner.property.connections"></a>

```typescript
public readonly connections: Connections;
```

- *Type:* aws-cdk-lib.aws_ec2.Connections

The network connections associated with this resource.

---

##### `container`<sup>Required</sup> <a name="container" id="@cloudsnorkel/cdk-github-runners.FargateRunner.property.container"></a>

```typescript
public readonly container: ContainerDefinition;
```

- *Type:* aws-cdk-lib.aws_ecs.ContainerDefinition

Container definition hosting the runner.

---

##### `grantPrincipal`<sup>Required</sup> <a name="grantPrincipal" id="@cloudsnorkel/cdk-github-runners.FargateRunner.property.grantPrincipal"></a>

```typescript
public readonly grantPrincipal: IPrincipal;
```

- *Type:* aws-cdk-lib.aws_iam.IPrincipal

Grant principal used to add permissions to the runner role.

---

##### `image`<sup>Required</sup> <a name="image" id="@cloudsnorkel/cdk-github-runners.FargateRunner.property.image"></a>

```typescript
public readonly image: RunnerImage;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerImage">RunnerImage</a>

Docker image loaded with GitHub Actions Runner and its prerequisites.

The image is built by an image builder and is specific to Fargate tasks.

---

##### `labels`<sup>Required</sup> <a name="labels" id="@cloudsnorkel/cdk-github-runners.FargateRunner.property.labels"></a>

```typescript
public readonly labels: string[];
```

- *Type:* string[]

Labels associated with this provider.

---

##### `spot`<sup>Required</sup> <a name="spot" id="@cloudsnorkel/cdk-github-runners.FargateRunner.property.spot"></a>

```typescript
public readonly spot: boolean;
```

- *Type:* boolean

Use spot pricing for Fargate tasks.

---

##### `task`<sup>Required</sup> <a name="task" id="@cloudsnorkel/cdk-github-runners.FargateRunner.property.task"></a>

```typescript
public readonly task: FargateTaskDefinition;
```

- *Type:* aws-cdk-lib.aws_ecs.FargateTaskDefinition

Fargate task hosting the runner.

---

##### `subnetSelection`<sup>Optional</sup> <a name="subnetSelection" id="@cloudsnorkel/cdk-github-runners.FargateRunner.property.subnetSelection"></a>

```typescript
public readonly subnetSelection: SubnetSelection;
```

- *Type:* aws-cdk-lib.aws_ec2.SubnetSelection

Subnets used for hosting the runner task.

---

##### `vpc`<sup>Optional</sup> <a name="vpc" id="@cloudsnorkel/cdk-github-runners.FargateRunner.property.vpc"></a>

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

##### `LINUX_ARM64_DOCKERFILE_PATH`<sup>Required</sup> <a name="LINUX_ARM64_DOCKERFILE_PATH" id="@cloudsnorkel/cdk-github-runners.FargateRunner.property.LINUX_ARM64_DOCKERFILE_PATH"></a>

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

##### `LINUX_X64_DOCKERFILE_PATH`<sup>Required</sup> <a name="LINUX_X64_DOCKERFILE_PATH" id="@cloudsnorkel/cdk-github-runners.FargateRunner.property.LINUX_X64_DOCKERFILE_PATH"></a>

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
const myProvider = new CodeBuildRunner(
   this, 'codebuild runner',
   {
      label: 'my-codebuild',
      vpc: vpc,
      securityGroup: runnerSg,
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

---

##### `toString` <a name="toString" id="@cloudsnorkel/cdk-github-runners.GitHubRunners.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

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
     '$ErrorActionPreference = \'Stop\'',
     'Start-Process msiexec.exe -Wait -ArgumentList \'/i https://awscli.amazonaws.com/AWSCLIV2.msi /qn\'',
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

---

##### `toString` <a name="toString" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### `applyRemovalPolicy` <a name="applyRemovalPolicy" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.applyRemovalPolicy"></a>

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

##### `grantAssetsRead` <a name="grantAssetsRead" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.grantAssetsRead"></a>

```typescript
public grantAssetsRead(grantee: IGrantable): void
```

Grants read permissions to the principal on the assets buckets.

###### `grantee`<sup>Required</sup> <a name="grantee" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.grantAssetsRead.parameter.grantee"></a>

- *Type:* aws-cdk-lib.aws_iam.IGrantable

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

##### `isOwnedResource` <a name="isOwnedResource" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.isOwnedResource"></a>

```typescript
import { ImageBuilderComponent } from '@cloudsnorkel/cdk-github-runners'

ImageBuilderComponent.isOwnedResource(construct: IConstruct)
```

Returns true if the construct was created by CDK, and false otherwise.

###### `construct`<sup>Required</sup> <a name="construct" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.isOwnedResource.parameter.construct"></a>

- *Type:* constructs.IConstruct

---

##### `isResource` <a name="isResource" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.isResource"></a>

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

##### `node`<sup>Required</sup> <a name="node" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `env`<sup>Required</sup> <a name="env" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.property.env"></a>

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

##### `stack`<sup>Required</sup> <a name="stack" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.property.stack"></a>

```typescript
public readonly stack: Stack;
```

- *Type:* aws-cdk-lib.Stack

The stack in which this resource is defined.

---

##### `arn`<sup>Required</sup> <a name="arn" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.property.arn"></a>

```typescript
public readonly arn: string;
```

- *Type:* string

Component ARN.

---

##### `platform`<sup>Required</sup> <a name="platform" id="@cloudsnorkel/cdk-github-runners.ImageBuilderComponent.property.platform"></a>

```typescript
public readonly platform: string;
```

- *Type:* string

Supported platform for the component.

---


### LambdaRunner <a name="LambdaRunner" id="@cloudsnorkel/cdk-github-runners.LambdaRunner"></a>

- *Implements:* <a href="#@cloudsnorkel/cdk-github-runners.IRunnerProvider">IRunnerProvider</a>

GitHub Actions runner provider using Lambda to execute jobs.

Creates a Docker-based function that gets executed for each job.

This construct is not meant to be used by itself. It should be passed in the providers property for GitHubRunners.

#### Initializers <a name="Initializers" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.Initializer"></a>

```typescript
import { LambdaRunner } from '@cloudsnorkel/cdk-github-runners'

new LambdaRunner(scope: Construct, id: string, props?: LambdaRunnerProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunner.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunner.Initializer.parameter.id">id</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunner.Initializer.parameter.props">props</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProps">LambdaRunnerProps</a></code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.Initializer.parameter.id"></a>

- *Type:* string

---

##### `props`<sup>Optional</sup> <a name="props" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.Initializer.parameter.props"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProps">LambdaRunnerProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunner.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunner.getStepFunctionTask">getStepFunctionTask</a></code> | Generate step function task(s) to start a new runner. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunner.grantStateMachine">grantStateMachine</a></code> | An optional method that modifies the role of the state machine after all the tasks have been generated. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunner.status">status</a></code> | Return status of the runner provider to be used in the main status function. |

---

##### `toString` <a name="toString" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### `getStepFunctionTask` <a name="getStepFunctionTask" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.getStepFunctionTask"></a>

```typescript
public getStepFunctionTask(parameters: RunnerRuntimeParameters): IChainable
```

Generate step function task(s) to start a new runner.

Called by GithubRunners and shouldn't be called manually.

###### `parameters`<sup>Required</sup> <a name="parameters" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.getStepFunctionTask.parameter.parameters"></a>

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerRuntimeParameters">RunnerRuntimeParameters</a>

workflow job details.

---

##### `grantStateMachine` <a name="grantStateMachine" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.grantStateMachine"></a>

```typescript
public grantStateMachine(_: IGrantable): void
```

An optional method that modifies the role of the state machine after all the tasks have been generated.

This can be used to add additional policy
statements to the state machine role that are not automatically added by the task returned from {@link getStepFunctionTask}.

###### `_`<sup>Required</sup> <a name="_" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.grantStateMachine.parameter._"></a>

- *Type:* aws-cdk-lib.aws_iam.IGrantable

---

##### `status` <a name="status" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.status"></a>

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

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunner.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunner.property.connections">connections</a></code> | <code>aws-cdk-lib.aws_ec2.Connections</code> | The network connections associated with this resource. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunner.property.function">function</a></code> | <code>aws-cdk-lib.aws_lambda.Function</code> | The function hosting the GitHub runner. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunner.property.grantPrincipal">grantPrincipal</a></code> | <code>aws-cdk-lib.aws_iam.IPrincipal</code> | Grant principal used to add permissions to the runner role. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunner.property.image">image</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerImage">RunnerImage</a></code> | Docker image loaded with GitHub Actions Runner and its prerequisites. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunner.property.labels">labels</a></code> | <code>string[]</code> | Labels associated with this provider. |

---

##### `node`<sup>Required</sup> <a name="node" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `connections`<sup>Required</sup> <a name="connections" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.property.connections"></a>

```typescript
public readonly connections: Connections;
```

- *Type:* aws-cdk-lib.aws_ec2.Connections

The network connections associated with this resource.

---

##### `function`<sup>Required</sup> <a name="function" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.property.function"></a>

```typescript
public readonly function: Function;
```

- *Type:* aws-cdk-lib.aws_lambda.Function

The function hosting the GitHub runner.

---

##### `grantPrincipal`<sup>Required</sup> <a name="grantPrincipal" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.property.grantPrincipal"></a>

```typescript
public readonly grantPrincipal: IPrincipal;
```

- *Type:* aws-cdk-lib.aws_iam.IPrincipal

Grant principal used to add permissions to the runner role.

---

##### `image`<sup>Required</sup> <a name="image" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.property.image"></a>

```typescript
public readonly image: RunnerImage;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.RunnerImage">RunnerImage</a>

Docker image loaded with GitHub Actions Runner and its prerequisites.

The image is built by an image builder and is specific to Lambda.

---

##### `labels`<sup>Required</sup> <a name="labels" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.property.labels"></a>

```typescript
public readonly labels: string[];
```

- *Type:* string[]

Labels associated with this provider.

---

#### Constants <a name="Constants" id="Constants"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunner.property.LINUX_ARM64_DOCKERFILE_PATH">LINUX_ARM64_DOCKERFILE_PATH</a></code> | <code>string</code> | Path to Dockerfile for Linux ARM64 with all the requirement for Lambda runner. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunner.property.LINUX_X64_DOCKERFILE_PATH">LINUX_X64_DOCKERFILE_PATH</a></code> | <code>string</code> | Path to Dockerfile for Linux x64 with all the requirement for Lambda runner. |

---

##### `LINUX_ARM64_DOCKERFILE_PATH`<sup>Required</sup> <a name="LINUX_ARM64_DOCKERFILE_PATH" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.property.LINUX_ARM64_DOCKERFILE_PATH"></a>

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

##### `LINUX_X64_DOCKERFILE_PATH`<sup>Required</sup> <a name="LINUX_X64_DOCKERFILE_PATH" id="@cloudsnorkel/cdk-github-runners.LambdaRunner.property.LINUX_X64_DOCKERFILE_PATH"></a>

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
| <code><a href="#@cloudsnorkel/cdk-github-runners.Secrets.property.github">github</a></code> | <code>aws-cdk-lib.aws_secretsmanager.Secret</code> | Authentication secret for GitHub containing either app details or personal authentication token. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Secrets.property.githubPrivateKey">githubPrivateKey</a></code> | <code>aws-cdk-lib.aws_secretsmanager.Secret</code> | GitHub app private key. Not needed when using personal authentication tokens. |
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

Authentication secret for GitHub containing either app details or personal authentication token.

This secret is used to register runners and
cancel jobs when the runner fails to start.

This secret is meant to be edited by the user after being created.

---

##### `githubPrivateKey`<sup>Required</sup> <a name="githubPrivateKey" id="@cloudsnorkel/cdk-github-runners.Secrets.property.githubPrivateKey"></a>

```typescript
public readonly githubPrivateKey: Secret;
```

- *Type:* aws-cdk-lib.aws_secretsmanager.Secret

GitHub app private key. Not needed when using personal authentication tokens.

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

##### `instanceType`<sup>Optional</sup> <a name="instanceType" id="@cloudsnorkel/cdk-github-runners.AmiBuilderProps.property.instanceType"></a>

```typescript
public readonly instanceType: InstanceType;
```

- *Type:* aws-cdk-lib.aws_ec2.InstanceType
- *Default:* m5.large

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

- *Deprecated:* use {@link securityGroups}

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

##### `computeType`<sup>Optional</sup> <a name="computeType" id="@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilderProps.property.computeType"></a>

```typescript
public readonly computeType: ComputeType;
```

- *Type:* aws-cdk-lib.aws_codebuild.ComputeType
- *Default:* {@link ComputeType#SMALL}

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

### CodeBuildRunnerProps <a name="CodeBuildRunnerProps" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProps"></a>

#### Initializer <a name="Initializer" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProps.Initializer"></a>

```typescript
import { CodeBuildRunnerProps } from '@cloudsnorkel/cdk-github-runners'

const codeBuildRunnerProps: CodeBuildRunnerProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProps.property.logRetention">logRetention</a></code> | <code>aws-cdk-lib.aws_logs.RetentionDays</code> | The number of days log events are kept in CloudWatch Logs. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProps.property.retryOptions">retryOptions</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.ProviderRetryOptions">ProviderRetryOptions</a></code> | Options to retry operation in case of failure like missing capacity, or API quota issues. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProps.property.computeType">computeType</a></code> | <code>aws-cdk-lib.aws_codebuild.ComputeType</code> | The type of compute to use for this build. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProps.property.dockerInDocker">dockerInDocker</a></code> | <code>boolean</code> | Support building and running Docker images by enabling Docker-in-Docker (dind) and the required CodeBuild privileged mode. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProps.property.imageBuilder">imageBuilder</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.IImageBuilder">IImageBuilder</a></code> | Image builder for CodeBuild image with GitHub runner pre-configured. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProps.property.label">label</a></code> | <code>string</code> | GitHub Actions label used for this provider. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProps.property.labels">labels</a></code> | <code>string[]</code> | GitHub Actions labels used for this provider. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProps.property.securityGroup">securityGroup</a></code> | <code>aws-cdk-lib.aws_ec2.ISecurityGroup</code> | Security group to assign to this instance. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProps.property.securityGroups">securityGroups</a></code> | <code>aws-cdk-lib.aws_ec2.ISecurityGroup[]</code> | Security groups to assign to this instance. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProps.property.subnetSelection">subnetSelection</a></code> | <code>aws-cdk-lib.aws_ec2.SubnetSelection</code> | Where to place the network interfaces within the VPC. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProps.property.timeout">timeout</a></code> | <code>aws-cdk-lib.Duration</code> | The number of minutes after which AWS CodeBuild stops the build if it's not complete. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProps.property.vpc">vpc</a></code> | <code>aws-cdk-lib.aws_ec2.IVpc</code> | VPC to launch the runners in. |

---

##### `logRetention`<sup>Optional</sup> <a name="logRetention" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProps.property.logRetention"></a>

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

##### `retryOptions`<sup>Optional</sup> <a name="retryOptions" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProps.property.retryOptions"></a>

```typescript
public readonly retryOptions: ProviderRetryOptions;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.ProviderRetryOptions">ProviderRetryOptions</a>
- *Default:* retry 10 times up to about 45 minutes

Options to retry operation in case of failure like missing capacity, or API quota issues.

---

##### `computeType`<sup>Optional</sup> <a name="computeType" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProps.property.computeType"></a>

```typescript
public readonly computeType: ComputeType;
```

- *Type:* aws-cdk-lib.aws_codebuild.ComputeType
- *Default:* {@link ComputeType#SMALL}

The type of compute to use for this build.

See the {@link ComputeType} enum for the possible values.

---

##### `dockerInDocker`<sup>Optional</sup> <a name="dockerInDocker" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProps.property.dockerInDocker"></a>

```typescript
public readonly dockerInDocker: boolean;
```

- *Type:* boolean
- *Default:* true

Support building and running Docker images by enabling Docker-in-Docker (dind) and the required CodeBuild privileged mode.

Disabling this can
speed up provisioning of CodeBuild runners. If you don't intend on running or building Docker images, disable this for faster start-up times.

---

##### `imageBuilder`<sup>Optional</sup> <a name="imageBuilder" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProps.property.imageBuilder"></a>

```typescript
public readonly imageBuilder: IImageBuilder;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.IImageBuilder">IImageBuilder</a>
- *Default:* image builder with `CodeBuildRunner.LINUX_X64_DOCKERFILE_PATH` as Dockerfile

Image builder for CodeBuild image with GitHub runner pre-configured.

A user named `runner` is expected to exist with access to Docker-in-Docker.

---

##### ~~`label`~~<sup>Optional</sup> <a name="label" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProps.property.label"></a>

- *Deprecated:* use {@link labels} instead

```typescript
public readonly label: string;
```

- *Type:* string
- *Default:* undefined

GitHub Actions label used for this provider.

---

##### `labels`<sup>Optional</sup> <a name="labels" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProps.property.labels"></a>

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

##### ~~`securityGroup`~~<sup>Optional</sup> <a name="securityGroup" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProps.property.securityGroup"></a>

- *Deprecated:* use {@link securityGroups}

```typescript
public readonly securityGroup: ISecurityGroup;
```

- *Type:* aws-cdk-lib.aws_ec2.ISecurityGroup
- *Default:* public project with no security group

Security group to assign to this instance.

---

##### `securityGroups`<sup>Optional</sup> <a name="securityGroups" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProps.property.securityGroups"></a>

```typescript
public readonly securityGroups: ISecurityGroup[];
```

- *Type:* aws-cdk-lib.aws_ec2.ISecurityGroup[]
- *Default:* a new security group, if {@link vpc} is used

Security groups to assign to this instance.

---

##### `subnetSelection`<sup>Optional</sup> <a name="subnetSelection" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProps.property.subnetSelection"></a>

```typescript
public readonly subnetSelection: SubnetSelection;
```

- *Type:* aws-cdk-lib.aws_ec2.SubnetSelection
- *Default:* no subnet

Where to place the network interfaces within the VPC.

---

##### `timeout`<sup>Optional</sup> <a name="timeout" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProps.property.timeout"></a>

```typescript
public readonly timeout: Duration;
```

- *Type:* aws-cdk-lib.Duration
- *Default:* Duration.hours(1)

The number of minutes after which AWS CodeBuild stops the build if it's not complete.

For valid values, see the timeoutInMinutes field in the AWS
CodeBuild User Guide.

---

##### `vpc`<sup>Optional</sup> <a name="vpc" id="@cloudsnorkel/cdk-github-runners.CodeBuildRunnerProps.property.vpc"></a>

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
- *Default:* m5.large

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

- *Deprecated:* use {@link securityGroups}

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

### Ec2RunnerProps <a name="Ec2RunnerProps" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProps"></a>

Properties for {@link Ec2Runner} construct.

#### Initializer <a name="Initializer" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProps.Initializer"></a>

```typescript
import { Ec2RunnerProps } from '@cloudsnorkel/cdk-github-runners'

const ec2RunnerProps: Ec2RunnerProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProps.property.logRetention">logRetention</a></code> | <code>aws-cdk-lib.aws_logs.RetentionDays</code> | The number of days log events are kept in CloudWatch Logs. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProps.property.retryOptions">retryOptions</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.ProviderRetryOptions">ProviderRetryOptions</a></code> | Options to retry operation in case of failure like missing capacity, or API quota issues. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProps.property.amiBuilder">amiBuilder</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.IAmiBuilder">IAmiBuilder</a></code> | AMI builder that creates AMIs with GitHub runner pre-configured. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProps.property.instanceType">instanceType</a></code> | <code>aws-cdk-lib.aws_ec2.InstanceType</code> | Instance type for launched runner instances. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProps.property.labels">labels</a></code> | <code>string[]</code> | GitHub Actions labels used for this provider. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProps.property.securityGroup">securityGroup</a></code> | <code>aws-cdk-lib.aws_ec2.ISecurityGroup</code> | Security Group to assign to launched runner instances. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProps.property.securityGroups">securityGroups</a></code> | <code>aws-cdk-lib.aws_ec2.ISecurityGroup[]</code> | Security groups to assign to launched runner instances. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProps.property.spot">spot</a></code> | <code>boolean</code> | Use spot instances to save money. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProps.property.spotMaxPrice">spotMaxPrice</a></code> | <code>string</code> | Set a maximum price for spot instances. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProps.property.storageSize">storageSize</a></code> | <code>aws-cdk-lib.Size</code> | Size of volume available for launched runner instances. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProps.property.subnet">subnet</a></code> | <code>aws-cdk-lib.aws_ec2.ISubnet</code> | Subnet where the runner instances will be launched. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProps.property.subnetSelection">subnetSelection</a></code> | <code>aws-cdk-lib.aws_ec2.SubnetSelection</code> | Where to place the network interfaces within the VPC. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.Ec2RunnerProps.property.vpc">vpc</a></code> | <code>aws-cdk-lib.aws_ec2.IVpc</code> | VPC where runner instances will be launched. |

---

##### `logRetention`<sup>Optional</sup> <a name="logRetention" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProps.property.logRetention"></a>

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

##### `retryOptions`<sup>Optional</sup> <a name="retryOptions" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProps.property.retryOptions"></a>

```typescript
public readonly retryOptions: ProviderRetryOptions;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.ProviderRetryOptions">ProviderRetryOptions</a>
- *Default:* retry 10 times up to about 45 minutes

Options to retry operation in case of failure like missing capacity, or API quota issues.

---

##### `amiBuilder`<sup>Optional</sup> <a name="amiBuilder" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProps.property.amiBuilder"></a>

```typescript
public readonly amiBuilder: IAmiBuilder;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.IAmiBuilder">IAmiBuilder</a>
- *Default:* AMI builder for Ubuntu Linux on the same subnet as configured by {@link vpc} and {@link subnetSelection}

AMI builder that creates AMIs with GitHub runner pre-configured.

On Linux, a user named `runner` is expected to exist with access to Docker.

---

##### `instanceType`<sup>Optional</sup> <a name="instanceType" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProps.property.instanceType"></a>

```typescript
public readonly instanceType: InstanceType;
```

- *Type:* aws-cdk-lib.aws_ec2.InstanceType
- *Default:* m5.large

Instance type for launched runner instances.

---

##### `labels`<sup>Optional</sup> <a name="labels" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProps.property.labels"></a>

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

##### ~~`securityGroup`~~<sup>Optional</sup> <a name="securityGroup" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProps.property.securityGroup"></a>

- *Deprecated:* use {@link securityGroups}

```typescript
public readonly securityGroup: ISecurityGroup;
```

- *Type:* aws-cdk-lib.aws_ec2.ISecurityGroup
- *Default:* a new security group

Security Group to assign to launched runner instances.

---

##### `securityGroups`<sup>Optional</sup> <a name="securityGroups" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProps.property.securityGroups"></a>

```typescript
public readonly securityGroups: ISecurityGroup[];
```

- *Type:* aws-cdk-lib.aws_ec2.ISecurityGroup[]
- *Default:* a new security group

Security groups to assign to launched runner instances.

---

##### `spot`<sup>Optional</sup> <a name="spot" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProps.property.spot"></a>

```typescript
public readonly spot: boolean;
```

- *Type:* boolean
- *Default:* false

Use spot instances to save money.

Spot instances are cheaper but not always available and can be stopped prematurely.

---

##### `spotMaxPrice`<sup>Optional</sup> <a name="spotMaxPrice" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProps.property.spotMaxPrice"></a>

```typescript
public readonly spotMaxPrice: string;
```

- *Type:* string
- *Default:* no max price (you will pay current spot price)

Set a maximum price for spot instances.

---

##### `storageSize`<sup>Optional</sup> <a name="storageSize" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProps.property.storageSize"></a>

```typescript
public readonly storageSize: Size;
```

- *Type:* aws-cdk-lib.Size
- *Default:* 30GB

Size of volume available for launched runner instances.

This modifies the boot volume size and doesn't add any additional volumes.

---

##### ~~`subnet`~~<sup>Optional</sup> <a name="subnet" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProps.property.subnet"></a>

- *Deprecated:* use {@link vpc} and {@link subnetSelection}

```typescript
public readonly subnet: ISubnet;
```

- *Type:* aws-cdk-lib.aws_ec2.ISubnet
- *Default:* default subnet of account's default VPC

Subnet where the runner instances will be launched.

---

##### `subnetSelection`<sup>Optional</sup> <a name="subnetSelection" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProps.property.subnetSelection"></a>

```typescript
public readonly subnetSelection: SubnetSelection;
```

- *Type:* aws-cdk-lib.aws_ec2.SubnetSelection
- *Default:* default VPC subnet

Where to place the network interfaces within the VPC.

Only the first matched subnet will be used.

---

##### `vpc`<sup>Optional</sup> <a name="vpc" id="@cloudsnorkel/cdk-github-runners.Ec2RunnerProps.property.vpc"></a>

```typescript
public readonly vpc: IVpc;
```

- *Type:* aws-cdk-lib.aws_ec2.IVpc
- *Default:* default account VPC

VPC where runner instances will be launched.

---

### FargateRunnerProps <a name="FargateRunnerProps" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProps"></a>

Properties for FargateRunner.

#### Initializer <a name="Initializer" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProps.Initializer"></a>

```typescript
import { FargateRunnerProps } from '@cloudsnorkel/cdk-github-runners'

const fargateRunnerProps: FargateRunnerProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProps.property.logRetention">logRetention</a></code> | <code>aws-cdk-lib.aws_logs.RetentionDays</code> | The number of days log events are kept in CloudWatch Logs. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProps.property.retryOptions">retryOptions</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.ProviderRetryOptions">ProviderRetryOptions</a></code> | Options to retry operation in case of failure like missing capacity, or API quota issues. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProps.property.assignPublicIp">assignPublicIp</a></code> | <code>boolean</code> | Assign public IP to the runner task. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProps.property.cluster">cluster</a></code> | <code>aws-cdk-lib.aws_ecs.Cluster</code> | Existing Fargate cluster to use. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProps.property.cpu">cpu</a></code> | <code>number</code> | The number of cpu units used by the task. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProps.property.ephemeralStorageGiB">ephemeralStorageGiB</a></code> | <code>number</code> | The amount (in GiB) of ephemeral storage to be allocated to the task. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProps.property.imageBuilder">imageBuilder</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.IImageBuilder">IImageBuilder</a></code> | Provider running an image to run inside CodeBuild with GitHub runner pre-configured. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProps.property.label">label</a></code> | <code>string</code> | GitHub Actions label used for this provider. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProps.property.labels">labels</a></code> | <code>string[]</code> | GitHub Actions labels used for this provider. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProps.property.memoryLimitMiB">memoryLimitMiB</a></code> | <code>number</code> | The amount (in MiB) of memory used by the task. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProps.property.securityGroup">securityGroup</a></code> | <code>aws-cdk-lib.aws_ec2.ISecurityGroup</code> | Security group to assign to the task. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProps.property.securityGroups">securityGroups</a></code> | <code>aws-cdk-lib.aws_ec2.ISecurityGroup[]</code> | Security groups to assign to the task. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProps.property.spot">spot</a></code> | <code>boolean</code> | Use Fargate spot capacity provider to save money. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProps.property.subnetSelection">subnetSelection</a></code> | <code>aws-cdk-lib.aws_ec2.SubnetSelection</code> | Subnets to run the runners in. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.FargateRunnerProps.property.vpc">vpc</a></code> | <code>aws-cdk-lib.aws_ec2.IVpc</code> | VPC to launch the runners in. |

---

##### `logRetention`<sup>Optional</sup> <a name="logRetention" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProps.property.logRetention"></a>

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

##### `retryOptions`<sup>Optional</sup> <a name="retryOptions" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProps.property.retryOptions"></a>

```typescript
public readonly retryOptions: ProviderRetryOptions;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.ProviderRetryOptions">ProviderRetryOptions</a>
- *Default:* retry 10 times up to about 45 minutes

Options to retry operation in case of failure like missing capacity, or API quota issues.

---

##### `assignPublicIp`<sup>Optional</sup> <a name="assignPublicIp" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProps.property.assignPublicIp"></a>

```typescript
public readonly assignPublicIp: boolean;
```

- *Type:* boolean
- *Default:* true

Assign public IP to the runner task.

Make sure the task will have access to GitHub. A public IP might be required unless you have NAT gateway.

---

##### `cluster`<sup>Optional</sup> <a name="cluster" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProps.property.cluster"></a>

```typescript
public readonly cluster: Cluster;
```

- *Type:* aws-cdk-lib.aws_ecs.Cluster
- *Default:* a new cluster

Existing Fargate cluster to use.

---

##### `cpu`<sup>Optional</sup> <a name="cpu" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProps.property.cpu"></a>

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

##### `ephemeralStorageGiB`<sup>Optional</sup> <a name="ephemeralStorageGiB" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProps.property.ephemeralStorageGiB"></a>

```typescript
public readonly ephemeralStorageGiB: number;
```

- *Type:* number
- *Default:* 20

The amount (in GiB) of ephemeral storage to be allocated to the task.

The maximum supported value is 200 GiB.

NOTE: This parameter is only supported for tasks hosted on AWS Fargate using platform version 1.4.0 or later.

---

##### `imageBuilder`<sup>Optional</sup> <a name="imageBuilder" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProps.property.imageBuilder"></a>

```typescript
public readonly imageBuilder: IImageBuilder;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.IImageBuilder">IImageBuilder</a>
- *Default:* image builder with `FargateRunner.LINUX_X64_DOCKERFILE_PATH` as Dockerfile

Provider running an image to run inside CodeBuild with GitHub runner pre-configured.

A user named `runner` is expected to exist.

---

##### ~~`label`~~<sup>Optional</sup> <a name="label" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProps.property.label"></a>

- *Deprecated:* use {@link labels} instead

```typescript
public readonly label: string;
```

- *Type:* string
- *Default:* undefined

GitHub Actions label used for this provider.

---

##### `labels`<sup>Optional</sup> <a name="labels" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProps.property.labels"></a>

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

##### `memoryLimitMiB`<sup>Optional</sup> <a name="memoryLimitMiB" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProps.property.memoryLimitMiB"></a>

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

##### ~~`securityGroup`~~<sup>Optional</sup> <a name="securityGroup" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProps.property.securityGroup"></a>

- *Deprecated:* use {@link securityGroups}

```typescript
public readonly securityGroup: ISecurityGroup;
```

- *Type:* aws-cdk-lib.aws_ec2.ISecurityGroup
- *Default:* a new security group

Security group to assign to the task.

---

##### `securityGroups`<sup>Optional</sup> <a name="securityGroups" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProps.property.securityGroups"></a>

```typescript
public readonly securityGroups: ISecurityGroup[];
```

- *Type:* aws-cdk-lib.aws_ec2.ISecurityGroup[]
- *Default:* a new security group

Security groups to assign to the task.

---

##### `spot`<sup>Optional</sup> <a name="spot" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProps.property.spot"></a>

```typescript
public readonly spot: boolean;
```

- *Type:* boolean
- *Default:* false

Use Fargate spot capacity provider to save money.

* Runners may fail to start due to missing capacity.
* Runners might be stopped prematurely with spot pricing.

---

##### `subnetSelection`<sup>Optional</sup> <a name="subnetSelection" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProps.property.subnetSelection"></a>

```typescript
public readonly subnetSelection: SubnetSelection;
```

- *Type:* aws-cdk-lib.aws_ec2.SubnetSelection
- *Default:* Fargate default

Subnets to run the runners in.

---

##### `vpc`<sup>Optional</sup> <a name="vpc" id="@cloudsnorkel/cdk-github-runners.FargateRunnerProps.property.vpc"></a>

```typescript
public readonly vpc: IVpc;
```

- *Type:* aws-cdk-lib.aws_ec2.IVpc
- *Default:* default account VPC

VPC to launch the runners in.

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
| <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.extraCertificates">extraCertificates</a></code> | <code>string</code> | Path to a directory containing a file named certs.pem containing any additional certificates required to trust GitHub Enterprise Server. Use this when GitHub Enterprise Server certificates are self-signed. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.idleTimeout">idleTimeout</a></code> | <code>aws-cdk-lib.Duration</code> | Time to wait before stopping a runner that remains idle. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.logOptions">logOptions</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.LogOptions">LogOptions</a></code> | Logging options for the state machine that manages the runners. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.providers">providers</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.IRunnerProvider">IRunnerProvider</a>[]</code> | List of runner providers to use. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.securityGroup">securityGroup</a></code> | <code>aws-cdk-lib.aws_ec2.ISecurityGroup</code> | Security group attached to all management functions. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.vpc">vpc</a></code> | <code>aws-cdk-lib.aws_ec2.IVpc</code> | VPC used for all management functions. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.vpcSubnets">vpcSubnets</a></code> | <code>aws-cdk-lib.aws_ec2.SubnetSelection</code> | VPC subnets used for all management functions. |

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

##### `extraCertificates`<sup>Optional</sup> <a name="extraCertificates" id="@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.extraCertificates"></a>

```typescript
public readonly extraCertificates: string;
```

- *Type:* string

Path to a directory containing a file named certs.pem containing any additional certificates required to trust GitHub Enterprise Server. Use this when GitHub Enterprise Server certificates are self-signed.

You may also want to use custom images for your runner providers that contain the same certificates. See {@link CodeBuildImageBuilder.addCertificates}.

```typescript
const imageBuilder = new CodeBuildImageBuilder(this, 'Image Builder with Certs', {
     dockerfilePath: CodeBuildRunner.LINUX_X64_DOCKERFILE_PATH,
});
imageBuilder.addExtraCertificates('path-to-my-extra-certs-folder');

const provider = new CodeBuildRunner(this, 'CodeBuild', {
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
- *Default:* 10 minutes

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

##### `securityGroup`<sup>Optional</sup> <a name="securityGroup" id="@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.securityGroup"></a>

```typescript
public readonly securityGroup: ISecurityGroup;
```

- *Type:* aws-cdk-lib.aws_ec2.ISecurityGroup

Security group attached to all management functions.

Use this with to provide access to GitHub Enterprise Server hosted inside a VPC.

---

##### `vpc`<sup>Optional</sup> <a name="vpc" id="@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.vpc"></a>

```typescript
public readonly vpc: IVpc;
```

- *Type:* aws-cdk-lib.aws_ec2.IVpc

VPC used for all management functions.

Use this with GitHub Enterprise Server hosted that's inaccessible from outside the VPC.

---

##### `vpcSubnets`<sup>Optional</sup> <a name="vpcSubnets" id="@cloudsnorkel/cdk-github-runners.GitHubRunnersProps.property.vpcSubnets"></a>

```typescript
public readonly vpcSubnets: SubnetSelection;
```

- *Type:* aws-cdk-lib.aws_ec2.SubnetSelection

VPC subnets used for all management functions.

Use this with GitHub Enterprise Server hosted that's inaccessible from outside the VPC.

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

### LambdaRunnerProps <a name="LambdaRunnerProps" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProps"></a>

#### Initializer <a name="Initializer" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProps.Initializer"></a>

```typescript
import { LambdaRunnerProps } from '@cloudsnorkel/cdk-github-runners'

const lambdaRunnerProps: LambdaRunnerProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProps.property.logRetention">logRetention</a></code> | <code>aws-cdk-lib.aws_logs.RetentionDays</code> | The number of days log events are kept in CloudWatch Logs. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProps.property.retryOptions">retryOptions</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.ProviderRetryOptions">ProviderRetryOptions</a></code> | Options to retry operation in case of failure like missing capacity, or API quota issues. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProps.property.ephemeralStorageSize">ephemeralStorageSize</a></code> | <code>aws-cdk-lib.Size</code> | The size of the function’s /tmp directory in MiB. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProps.property.imageBuilder">imageBuilder</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.IImageBuilder">IImageBuilder</a></code> | Provider running an image to run inside CodeBuild with GitHub runner pre-configured. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProps.property.label">label</a></code> | <code>string</code> | GitHub Actions label used for this provider. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProps.property.labels">labels</a></code> | <code>string[]</code> | GitHub Actions labels used for this provider. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProps.property.memorySize">memorySize</a></code> | <code>number</code> | The amount of memory, in MB, that is allocated to your Lambda function. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProps.property.securityGroup">securityGroup</a></code> | <code>aws-cdk-lib.aws_ec2.ISecurityGroup</code> | Security group to assign to this instance. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProps.property.securityGroups">securityGroups</a></code> | <code>aws-cdk-lib.aws_ec2.ISecurityGroup[]</code> | Security groups to assign to this instance. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProps.property.subnetSelection">subnetSelection</a></code> | <code>aws-cdk-lib.aws_ec2.SubnetSelection</code> | Where to place the network interfaces within the VPC. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProps.property.timeout">timeout</a></code> | <code>aws-cdk-lib.Duration</code> | The function execution time (in seconds) after which Lambda terminates the function. |
| <code><a href="#@cloudsnorkel/cdk-github-runners.LambdaRunnerProps.property.vpc">vpc</a></code> | <code>aws-cdk-lib.aws_ec2.IVpc</code> | VPC to launch the runners in. |

---

##### `logRetention`<sup>Optional</sup> <a name="logRetention" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProps.property.logRetention"></a>

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

##### `retryOptions`<sup>Optional</sup> <a name="retryOptions" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProps.property.retryOptions"></a>

```typescript
public readonly retryOptions: ProviderRetryOptions;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.ProviderRetryOptions">ProviderRetryOptions</a>
- *Default:* retry 10 times up to about 45 minutes

Options to retry operation in case of failure like missing capacity, or API quota issues.

---

##### `ephemeralStorageSize`<sup>Optional</sup> <a name="ephemeralStorageSize" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProps.property.ephemeralStorageSize"></a>

```typescript
public readonly ephemeralStorageSize: Size;
```

- *Type:* aws-cdk-lib.Size
- *Default:* 10 GiB

The size of the function’s /tmp directory in MiB.

---

##### `imageBuilder`<sup>Optional</sup> <a name="imageBuilder" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProps.property.imageBuilder"></a>

```typescript
public readonly imageBuilder: IImageBuilder;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.IImageBuilder">IImageBuilder</a>
- *Default:* image builder with LambdaRunner.LINUX_X64_DOCKERFILE_PATH as Dockerfile

Provider running an image to run inside CodeBuild with GitHub runner pre-configured.

The default command (`CMD`) should be `["runner.handler"]` which points to an included `runner.js` with a function named `handler`. The function should start the GitHub runner.

> [https://github.com/CloudSnorkel/cdk-github-runners/tree/main/src/providers/docker-images/lambda](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/src/providers/docker-images/lambda)

---

##### ~~`label`~~<sup>Optional</sup> <a name="label" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProps.property.label"></a>

- *Deprecated:* use {@link labels} instead

```typescript
public readonly label: string;
```

- *Type:* string
- *Default:* undefined

GitHub Actions label used for this provider.

---

##### `labels`<sup>Optional</sup> <a name="labels" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProps.property.labels"></a>

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

##### `memorySize`<sup>Optional</sup> <a name="memorySize" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProps.property.memorySize"></a>

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

##### ~~`securityGroup`~~<sup>Optional</sup> <a name="securityGroup" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProps.property.securityGroup"></a>

- *Deprecated:* use {@link securityGroups}

```typescript
public readonly securityGroup: ISecurityGroup;
```

- *Type:* aws-cdk-lib.aws_ec2.ISecurityGroup
- *Default:* public lambda with no security group

Security group to assign to this instance.

---

##### `securityGroups`<sup>Optional</sup> <a name="securityGroups" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProps.property.securityGroups"></a>

```typescript
public readonly securityGroups: ISecurityGroup[];
```

- *Type:* aws-cdk-lib.aws_ec2.ISecurityGroup[]
- *Default:* public lambda with no security group

Security groups to assign to this instance.

---

##### `subnetSelection`<sup>Optional</sup> <a name="subnetSelection" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProps.property.subnetSelection"></a>

```typescript
public readonly subnetSelection: SubnetSelection;
```

- *Type:* aws-cdk-lib.aws_ec2.SubnetSelection
- *Default:* no subnet

Where to place the network interfaces within the VPC.

---

##### `timeout`<sup>Optional</sup> <a name="timeout" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProps.property.timeout"></a>

```typescript
public readonly timeout: Duration;
```

- *Type:* aws-cdk-lib.Duration
- *Default:* Duration.minutes(15)

The function execution time (in seconds) after which Lambda terminates the function.

Because the execution time affects cost, set this value
based on the function's expected execution time.

---

##### `vpc`<sup>Optional</sup> <a name="vpc" id="@cloudsnorkel/cdk-github-runners.LambdaRunnerProps.property.vpc"></a>

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

The default is to retry 10 times for about 45 minutes with increasing interval.

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
- *Default:* 10

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

Description of a AMI built by {@link IAmiBuilder}.

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

##### `runnerVersion`<sup>Required</sup> <a name="runnerVersion" id="@cloudsnorkel/cdk-github-runners.RunnerAmi.property.runnerVersion"></a>

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

Description of a Docker image built by {@link IImageBuilder}.

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

##### `runnerVersion`<sup>Required</sup> <a name="runnerVersion" id="@cloudsnorkel/cdk-github-runners.RunnerImage.property.runnerVersion"></a>

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
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerProviderProps.property.retryOptions">retryOptions</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.ProviderRetryOptions">ProviderRetryOptions</a></code> | Options to retry operation in case of failure like missing capacity, or API quota issues. |

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

##### `retryOptions`<sup>Optional</sup> <a name="retryOptions" id="@cloudsnorkel/cdk-github-runners.RunnerProviderProps.property.retryOptions"></a>

```typescript
public readonly retryOptions: ProviderRetryOptions;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.ProviderRetryOptions">ProviderRetryOptions</a>
- *Default:* retry 10 times up to about 45 minutes

Options to retry operation in case of failure like missing capacity, or API quota issues.

---

### RunnerRuntimeParameters <a name="RunnerRuntimeParameters" id="@cloudsnorkel/cdk-github-runners.RunnerRuntimeParameters"></a>

Workflow job parameters as parsed from the webhook event. Pass these into your runner executor and run something like:.

```sh
./config.sh --unattended --url "https://${GITHUB_DOMAIN}/${OWNER}/${REPO}" --token "${RUNNER_TOKEN}" --ephemeral --work _work --labels "${RUNNER_LABEL}" --name "${RUNNER_NAME}" --disableupdate
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
| <code><a href="#@cloudsnorkel/cdk-github-runners.RunnerRuntimeParameters.property.ownerPath">ownerPath</a></code> | <code>string</code> | Path to repostiroy owner name. |
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

Path to repostiroy owner name.

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

### LinuxUbuntuComponents <a name="LinuxUbuntuComponents" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents"></a>

Components for Ubuntu Linux that can be used with AWS Image Builder based builders.

These cannot be used by {@link CodeBuildImageBuilder}.

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

##### `awsCli` <a name="awsCli" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.awsCli"></a>

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

##### `docker` <a name="docker" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.docker"></a>

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

##### `extraCertificates` <a name="extraCertificates" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.extraCertificates"></a>

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

##### `git` <a name="git" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.git"></a>

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

##### `githubCli` <a name="githubCli" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.githubCli"></a>

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

##### `githubRunner` <a name="githubRunner" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.githubRunner"></a>

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

##### `requiredPackages` <a name="requiredPackages" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.requiredPackages"></a>

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

##### `runnerUser` <a name="runnerUser" id="@cloudsnorkel/cdk-github-runners.LinuxUbuntuComponents.runnerUser"></a>

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
| <code><a href="#@cloudsnorkel/cdk-github-runners.Os.property.WINDOWS">WINDOWS</a></code> | <code><a href="#@cloudsnorkel/cdk-github-runners.Os">Os</a></code> | Windows. |

---

##### `LINUX`<sup>Required</sup> <a name="LINUX" id="@cloudsnorkel/cdk-github-runners.Os.property.LINUX"></a>

```typescript
public readonly LINUX: Os;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Os">Os</a>

Linux.

---

##### `WINDOWS`<sup>Required</sup> <a name="WINDOWS" id="@cloudsnorkel/cdk-github-runners.Os.property.WINDOWS"></a>

```typescript
public readonly WINDOWS: Os;
```

- *Type:* <a href="#@cloudsnorkel/cdk-github-runners.Os">Os</a>

Windows.

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

These cannot be used by {@link CodeBuildImageBuilder}.

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

##### `awsCli` <a name="awsCli" id="@cloudsnorkel/cdk-github-runners.WindowsComponents.awsCli"></a>

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

##### `cloudwatchAgent` <a name="cloudwatchAgent" id="@cloudsnorkel/cdk-github-runners.WindowsComponents.cloudwatchAgent"></a>

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

##### `docker` <a name="docker" id="@cloudsnorkel/cdk-github-runners.WindowsComponents.docker"></a>

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

##### `extraCertificates` <a name="extraCertificates" id="@cloudsnorkel/cdk-github-runners.WindowsComponents.extraCertificates"></a>

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

##### `git` <a name="git" id="@cloudsnorkel/cdk-github-runners.WindowsComponents.git"></a>

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

##### `githubCli` <a name="githubCli" id="@cloudsnorkel/cdk-github-runners.WindowsComponents.githubCli"></a>

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

##### `githubRunner` <a name="githubRunner" id="@cloudsnorkel/cdk-github-runners.WindowsComponents.githubRunner"></a>

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

### IAmiBuilder <a name="IAmiBuilder" id="@cloudsnorkel/cdk-github-runners.IAmiBuilder"></a>

- *Implemented By:* <a href="#@cloudsnorkel/cdk-github-runners.AmiBuilder">AmiBuilder</a>, <a href="#@cloudsnorkel/cdk-github-runners.IAmiBuilder">IAmiBuilder</a>

Interface for constructs that build an AMI that can be used in {@link IRunnerProvider}.

Anything that ends up with a launch template pointing to an AMI that runs GitHub self-hosted runners can be used. A simple implementation could even point to an existing AMI and nothing else.

The AMI can be further updated over time manually or using a schedule as long as it is always written to the same launch template.

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.IAmiBuilder.bind">bind</a></code> | Finalize and return all required information about the AMI built by this builder. |

---

##### `bind` <a name="bind" id="@cloudsnorkel/cdk-github-runners.IAmiBuilder.bind"></a>

```typescript
public bind(): RunnerAmi
```

Finalize and return all required information about the AMI built by this builder.

This method can be called multiple times if the image is bound to multiple providers. Make sure you cache the image when implementing or return an error if this builder doesn't support reusing images.


### IImageBuilder <a name="IImageBuilder" id="@cloudsnorkel/cdk-github-runners.IImageBuilder"></a>

- *Implemented By:* <a href="#@cloudsnorkel/cdk-github-runners.CodeBuildImageBuilder">CodeBuildImageBuilder</a>, <a href="#@cloudsnorkel/cdk-github-runners.ContainerImageBuilder">ContainerImageBuilder</a>, <a href="#@cloudsnorkel/cdk-github-runners.IImageBuilder">IImageBuilder</a>

Interface for constructs that build an image that can be used in {@link IRunnerProvider}.

Anything that ends up with an ECR repository containing a Docker image that runs GitHub self-hosted runners can be used. A simple implementation could even point to an existing image and nothing else.

It's important that the specified image tag be available at the time the repository is available. Providers usually assume the image is ready and will fail if it's not.

The image can be further updated over time manually or using a schedule as long as it is always written to the same tag.

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cloudsnorkel/cdk-github-runners.IImageBuilder.bind">bind</a></code> | Finalize and return all required information about the Docker image built by this builder. |

---

##### `bind` <a name="bind" id="@cloudsnorkel/cdk-github-runners.IImageBuilder.bind"></a>

```typescript
public bind(): RunnerImage
```

Finalize and return all required information about the Docker image built by this builder.

This method can be called multiple times if the image is bound to multiple providers. Make sure you cache the image when implementing or return an error if this builder doesn't support reusing images.


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

- *Extends:* aws-cdk-lib.aws_ec2.IConnectable, aws-cdk-lib.aws_iam.IGrantable

- *Implemented By:* <a href="#@cloudsnorkel/cdk-github-runners.CodeBuildRunner">CodeBuildRunner</a>, <a href="#@cloudsnorkel/cdk-github-runners.Ec2Runner">Ec2Runner</a>, <a href="#@cloudsnorkel/cdk-github-runners.FargateRunner">FargateRunner</a>, <a href="#@cloudsnorkel/cdk-github-runners.LambdaRunner">LambdaRunner</a>, <a href="#@cloudsnorkel/cdk-github-runners.IRunnerProvider">IRunnerProvider</a>

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
| <code><a href="#@cloudsnorkel/cdk-github-runners.IRunnerProvider.property.labels">labels</a></code> | <code>string[]</code> | GitHub Actions labels used for this provider. |

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


import { aws_imagebuilder as imagebuilder } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ImageBuilderObjectBase } from './common';
import { uniqueImageBuilderName } from '../common';

/**
 * Properties for Workflow construct.
 *
 * @internal
 */
export interface WorkflowProperties {
  /**
   * Workflow type.
   */
  readonly type: 'BUILD' | 'TEST' | 'DISTRIBUTION';

  /**
   * YAML or JSON data for the workflow.
   */
  readonly data: any;
}

/**
 * Image builder workflow.
 *
 * @internal
 */
export class Workflow extends ImageBuilderObjectBase {
  public readonly arn: string;
  public readonly name: string;
  public readonly version: string;

  constructor(scope: Construct, id: string, props: WorkflowProperties) {
    super(scope, id);

    this.name = uniqueImageBuilderName(this);
    this.version = this.generateVersion('Workflow', this.name, {
      type: props.type,
      data: props.data,
    });

    const workflow = new imagebuilder.CfnWorkflow(this, 'Workflow', {
      name: uniqueImageBuilderName(this),
      version: this.version,
      type: props.type,
      data: JSON.stringify(props.data),
    });

    this.arn = workflow.attrArn;
  }
}

/**
 * Returns a new build workflow based on arn:aws:imagebuilder:us-east-1:aws:workflow/build/build-container/1.0.1/1.
 *
 * It adds a DockerSetup step after bootstrapping but before the Docker image is built.
 *
 * @internal
 */
export function generateBuildWorkflowWithDockerSetupCommands(scope: Construct, id: string, dockerSetupCommands: string[]) {
  return new Workflow(scope, id, {
    type: 'BUILD',
    data: {
      name: 'build-container',
      description: 'Workflow to build a container image',
      schemaVersion: 1,
      steps: [
        {
          name: 'LaunchBuildInstance',
          action: 'LaunchInstance',
          onFailure: 'Abort',
          inputs: {
            waitFor: 'ssmAgent',
          },
        },
        {
          name: 'BootstrapBuildInstance',
          action: 'BootstrapInstanceForContainer',
          onFailure: 'Abort',
          if: {
            stringEquals: 'DOCKER',
            value: '$.imagebuilder.imageType',
          },
          inputs: {
            'instanceId.$': '$.stepOutputs.LaunchBuildInstance.instanceId',
          },
        },
        {
          // this is the part we add
          name: 'DockerSetup',
          action: 'RunCommand',
          onFailure: 'Abort',
          if: {
            stringEquals: 'DOCKER',
            value: '$.imagebuilder.imageType',
          },
          inputs: {
            'documentName': 'AWS-RunShellScript',
            'parameters': {
              commands: dockerSetupCommands,
            },
            'instanceId.$': '$.stepOutputs.LaunchBuildInstance.instanceId',
          },
        },
        {
          name: 'ApplyBuildComponents',
          action: 'ExecuteComponents',
          onFailure: 'Abort',
          inputs: {
            'instanceId.$': '$.stepOutputs.LaunchBuildInstance.instanceId',
          },
        },
      ],
      outputs: [
        {
          name: 'InstanceId',
          value: '$.stepOutputs.LaunchBuildInstance.instanceId',
        },
      ],
    },
  });
}

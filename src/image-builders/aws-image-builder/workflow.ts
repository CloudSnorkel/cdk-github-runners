import * as imagebuilder2 from '@aws-cdk/aws-imagebuilder-alpha';
import { Construct } from 'constructs';


/**
 * Returns a new build workflow based on arn:aws:imagebuilder:us-east-1:aws:workflow/build/build-container/1.0.1/1.
 *
 * It adds a DockerSetup step after bootstrapping but before the Docker image is built.
 *
 * @internal
 */
export function generateBuildWorkflowWithDockerSetupCommands(scope: Construct, id: string, dockerSetupCommands: string[]) {
  return new imagebuilder2.Workflow(scope, id, {
    workflowType: imagebuilder2.WorkflowType.BUILD,
    data: imagebuilder2.WorkflowData.fromJsonObject({
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
    }),
  });
}

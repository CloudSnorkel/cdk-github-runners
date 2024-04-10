import { Annotations } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AwsImageBuilderRunnerImageBuilder } from './aws-image-builder';
import { CodeBuildRunnerImageBuilder } from './codebuild';
import { IConfigurableRunnerImageBuilder, RunnerImageBuilderBase, RunnerImageBuilderProps, RunnerImageBuilderType } from './common';
import { Os } from '../providers';

/**
 * GitHub Runner image builder. Builds a Docker image or AMI with GitHub Runner and other requirements installed.
 *
 * Images can be customized before passed into the provider by adding or removing components to be installed.
 *
 * Images are rebuilt every week by default to ensure that the latest security patches are applied.
 */
export abstract class RunnerImageBuilder extends RunnerImageBuilderBase {
  /**
   * Create a new image builder based on the provided properties. The implementation will differ based on the OS, architecture, and requested builder type.
   */
  static new(scope: Construct, id: string, props?: RunnerImageBuilderProps): IConfigurableRunnerImageBuilder {
    if (props?.components && props.runnerVersion) {
      Annotations.of(scope).addWarning('runnerVersion is ignored when components are specified. The runner version will be determined by the components.');
    }

    if (props?.builderType === RunnerImageBuilderType.CODE_BUILD) {
      return new CodeBuildRunnerImageBuilder(scope, id, props);
    } else if (props?.builderType === RunnerImageBuilderType.AWS_IMAGE_BUILDER) {
      return new AwsImageBuilderRunnerImageBuilder(scope, id, props);
    }

    const os = props?.os ?? Os.LINUX_UBUNTU;
    if (os.isIn(Os._ALL_LINUX_VERSIONS)) {
      return new CodeBuildRunnerImageBuilder(scope, id, props);
    } else if (os.is(Os.WINDOWS)) {
      return new AwsImageBuilderRunnerImageBuilder(scope, id, props);
    } else {
      throw new Error(`Unable to find runner image builder implementation for ${os.name}`);
    }
  }
}

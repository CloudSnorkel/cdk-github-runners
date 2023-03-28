import { Annotations } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AwsImageBuilderRunnerImageBuilder } from './aws-image-builder';
import { CodeBuildRunnerImageBuilder } from './codebuild';
import { RunnerImageBuilderBase, RunnerImageBuilderProps, RunnerImageBuilderType } from './common';
import { Os } from '../common';

export abstract class RunnerImageBuilder extends RunnerImageBuilderBase {
  static new(scope: Construct, id: string, props?: RunnerImageBuilderProps): RunnerImageBuilder {
    if (props?.components && props.runnerVersion) {
      Annotations.of(scope).addWarning('runnerVersion is ignored when components are specified. The runner version will be determined by the components.');
    }

    if (props?.builderType === RunnerImageBuilderType.CODE_BUILD) {
      return new CodeBuildRunnerImageBuilder(scope, id, props);
    } else if (props?.builderType === RunnerImageBuilderType.AWS_IMAGE_BUILDER) {
      return new AwsImageBuilderRunnerImageBuilder(scope, id, props);
    }

    const os = props?.os ?? Os.LINUX_UBUNTU;
    if (os.is(Os.LINUX_UBUNTU) || os.is(Os.LINUX_AMAZON_2)) {
      return new CodeBuildRunnerImageBuilder(scope, id, props);
    } else if (os.is(Os.WINDOWS)) {
      return new AwsImageBuilderRunnerImageBuilder(scope, id, props);
    } else {
      throw new Error(`Unable to find runner image builder implementation for ${os.name}`);
    }
  }
}

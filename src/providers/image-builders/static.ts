import { aws_ecr as ecr } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CodeBuildRunnerImageBuilder } from './codebuild';
import { IRunnerImageBuilder } from './common';
import { Architecture, Os, RunnerAmi, RunnerImage, RunnerVersion } from '../common';

/**
 * Helper class with methods to use static images that are built outside the context of this project.
 */
export class StaticRunnerImage {
  /**
   * Create a builder (that doesn't actually build anything) from an existing image in an existing repository. The image must already have GitHub Actions runner installed. You are responsible to update it and remove it when done.
   *
   * @param repository ECR repository
   * @param tag image tag
   * @param architecture image architecture
   * @param os image OS
   */
  public static fromEcrRepository(repository: ecr.IRepository, tag: string = 'latest', architecture = Architecture.X86_64, os = Os.LINUX): IRunnerImageBuilder {
    return {
      bindDockerImage(): RunnerImage {
        return {
          imageRepository: repository,
          imageTag: tag,
          architecture,
          os,
          runnerVersion: RunnerVersion.latest(),
        };
      },

      bindAmi(): RunnerAmi {
        throw new Error('fromEcrRepository() cannot be used to build AMIs');
      },
    };
  }

  /**
   * Create a builder from an existing Docker Hub image. The image must already have GitHub Actions runner installed. You are responsible to update it and remove it when done.
   *
   * We create a CodeBuild image builder behind the scenes to copy the image over to ECR. This helps avoid Docker Hub rate limits and prevent failures.
   *
   * @param scope
   * @param id
   * @param image Docker Hub image with optional tag
   * @param architecture image architecture
   * @param os image OS
   */
  public static fromDockerHub(scope: Construct, id: string, image: string, architecture = Architecture.X86_64, os = Os.LINUX): IRunnerImageBuilder {
    return new CodeBuildRunnerImageBuilder(scope, id, {
      os,
      architecture,
      baseDockerImage: image,
    });
  }
}

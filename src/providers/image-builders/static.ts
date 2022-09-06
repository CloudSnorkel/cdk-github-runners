import { aws_ecr as ecr } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CodeBuildRunner } from '../codebuild';
import { Architecture, IImageBuilder, Os, RunnerImage } from '../common';
import { CodeBuildImageBuilder } from './codebuild';

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
  public static fromEcrRepository(repository: ecr.IRepository, tag: string = 'latest', architecture = Architecture.X86_64, os = Os.LINUX): IImageBuilder {
    return {
      bind(): RunnerImage {
        return {
          imageRepository: repository,
          imageTag: tag,
          architecture,
          os,
        };
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
  public static fromDockerHub(scope: Construct, id: string, image: string, architecture = Architecture.X86_64, os = Os.LINUX): IImageBuilder {
    const builder = new CodeBuildImageBuilder(scope, id, {
      dockerfilePath: CodeBuildRunner.LINUX_X64_DOCKERFILE_PATH, // fake Dockerfile that gets overridden below
      architecture,
      os,
    });

    builder.addPreBuildCommand(`echo "FROM ${image}" > Dockerfile`);

    return builder;
  }
}

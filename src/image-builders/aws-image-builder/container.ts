import { Os } from '../../providers';

/**
 * Default base Docker image for given OS.
 *
 * @internal
 */
export function defaultBaseDockerImage(os: Os) {
  if (os.is(Os.WINDOWS)) {
    return 'mcr.microsoft.com/windows/servercore:ltsc2019-amd64';
  } else if (os.is(Os.LINUX_UBUNTU) || os.is(Os.LINUX_UBUNTU_2204)) {
    return 'public.ecr.aws/lts/ubuntu:22.04';
  } else if (os.is(Os.LINUX_UBUNTU_2404)) {
    return 'public.ecr.aws/lts/ubuntu:24.04';
  } else if (os.is(Os.LINUX_AMAZON_2)) {
    return 'public.ecr.aws/amazonlinux/amazonlinux:2';
  } else if (os.is(Os.LINUX_AMAZON_2023)) {
    return 'public.ecr.aws/amazonlinux/amazonlinux:2023';
  } else {
    throw new Error(`OS ${os.name} not supported for Docker runner image`);
  }
}


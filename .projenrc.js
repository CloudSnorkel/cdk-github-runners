const fs = require('fs');
const { awscdk } = require('projen');
const { Stability } = require('projen/lib/cdk/jsii-project');

const project = new awscdk.AwsCdkConstructLibrary({
  author: 'Amir Szekely',
  authorAddress: 'amir@cloudsnorkel.com',
  authorOrganization: 'CloudSnorkel',
  stability: Stability.EXPERIMENTAL,
  cdkVersion: '2.21.1', // first version with lambda url support
  defaultReleaseBranch: 'main',
  name: '@cloudsnorkel/cdk-github-runners',
  repositoryUrl: 'https://github.com/CloudSnorkel/cdk-github-runners.git',
  license: 'Apache-2.0',
  description: 'CDK construct to create GitHub Actions self-hosted runners. A webhook listens to events and creates ephemeral runners on the fly.',
  // packageName: undefined,  /* The "name" in package.json. */
  devDeps: [
    'esbuild', // for faster NodejsFunction bundling
    '@octokit/core',
    '@octokit/auth-app',
    'aws-sdk',
    '@aws-sdk/types',
  ],
  deps: [
  ],
  excludeTypescript: [
    // we build lambdas manually below
    'src/lambdas',
  ],
  releaseToNpm: true,
  publishToPypi: {
    distName: 'cloudsnorkel.cdk-github-runners',
    module: 'cloudsnorkel.cdk_github_runners',
  },
  publishToGo: {
    moduleName: 'github.com/CloudSnorkel/cdk-github-runners-go',
  },
  publishToMaven: {
    mavenGroupId: 'com.cloudsnorkel',
    mavenArtifactId: 'cdk.github.runners',
    javaPackage: 'com.cloudsnorkel.cdk.github.runners',
    mavenEndpoint: 'https://s01.oss.sonatype.org',
  },
  publishToNuget: {
    dotNetNamespace: 'CloudSnorkel',
    packageId: 'CloudSnorkel.Cdk.Github.Runners',
  },
  keywords: [
    'aws',
    'cdk',
    'aws-cdk',
    'codebuild',
    'lambda',
    'fargate',
    'auto-scale',
    'github',
    'github-actions',
    'runner',
    'docker',
  ],
  gitignore: [
    'cdk.out',
    'cdk.context.json',
    '/.idea',
    'status.json',
  ],
  sampleCode: false,
  compat: true,
  githubOptions: {
    pullRequestLintOptions: {
      semanticTitleOptions: {
        types: [
          'feat',
          'fix',
          'chore',
          'docs',
        ],
      },
    },
  },
});

// bundle lambdas so user doesn't have to install dependencies like octokit locally
const lambdas = fs.readdirSync('src/lambdas');
for (const lambdaDir of lambdas) {
  if (fs.lstatSync(`src/lambdas/${lambdaDir}`).isDirectory()) {
    // we use tsconfig.dev.json because it has esModuleInterop=true and octokit fails without it
    project.compileTask.exec(`esbuild src/lambdas/${lambdaDir}/index.ts --bundle --platform=node --target=node14 --external:aws-sdk --outfile=lib/lambdas/${lambdaDir}/index.js`);
  }
}

// bundle docker images
project.compileTask.exec('bash -c "cp -r src/providers/docker-images lib/providers"'); // we use bash so it works on Windows

project.synth();
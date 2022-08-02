const fs = require('fs');
const { awscdk } = require('projen');
const { Stability } = require('projen/lib/cdk/jsii-project');

const project = new awscdk.AwsCdkConstructLibrary({
  author: 'Amir Szekely',
  authorAddress: 'amir@cloudsnorkel.com',
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
    '@octokit/rest',
    'aws-sdk',
    '@aws-sdk/types',
    '@types/aws-lambda',
    // for setup ui
    '@sveltejs/vite-plugin-svelte@^1.0.1',
    '@tsconfig/svelte@^3.0.0',
    'bootstrap@^5.2.0',
    'sass@^1.54.0',
    'svelte@^3.49.0',
    'svelte-check@^2.8.0',
    'svelte-preprocess@^4.10.7',
    //'tslib@^2.4.0',
    //'typescript@^4.6.4',
    'vite@^3.0.0',
    'vite-plugin-singlefile@^0.11.0',
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
    'aws-cdk',
    'aws-cdk-construct',
    'cdk',
    'codebuild',
    'lambda',
    'fargate',
    'github',
    'github-actions',
    'self-hosted',
  ],
  gitignore: [
    'cdk.out',
    'cdk.context.json',
    '/.idea',
    'status.json',
  ],
  sampleCode: false,
  compat: true,
  autoApproveOptions: {
    allowedUsernames: ['kichik', 'CloudSnorkelBot'],
  },
  depsUpgradeOptions: {
    workflowOptions: {
      labels: ['auto-approve'],
      schedule: {
        cron: ['0 0 * * 1'],
      },
    },
  },
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

// disable automatic releases, but keep workflow that can be triggered manually
const releaseWorkflow = project.github.tryFindWorkflow('release');
releaseWorkflow.file.addDeletionOverride('on.push');

// bundle lambdas so user doesn't have to install dependencies like octokit locally
const lambdas = fs.readdirSync('src/lambdas');
for (const lambdaDir of lambdas) {
  if (fs.lstatSync(`src/lambdas/${lambdaDir}`).isDirectory()) {
    // we use tsconfig.dev.json because it has esModuleInterop=true and octokit fails without it
    project.compileTask.exec(`esbuild src/lambdas/${lambdaDir}/index.ts --bundle --platform=node --target=node14 --external:aws-sdk --outfile=lib/lambdas/${lambdaDir}/index.js`);
  }
}

// bundle docker images
project.compileTask.exec('cp -r src/providers/docker-images lib/providers');

// set proper line endings
project.gitattributes.addAttributes('*.js', 'eol=lf');
project.gitattributes.addAttributes('*.json', 'eol=lf');
project.gitattributes.addAttributes('*.sh', 'eol=lf');
project.gitattributes.addAttributes('*.yml', 'eol=lf');
project.gitattributes.addAttributes('*.html', 'eol=lf');
project.gitattributes.addAttributes('*.svelte', 'eol=lf');
project.gitattributes.addAttributes('Dockerfile', 'eol=lf');

// setup ui
project.gitignore.addPatterns('/setup/dist');
project.compileTask.exec('vite build setup');
project.compileTask.exec('cp -r setup/dist/index.html lib/lambdas/setup/index.html');

project.synth();

const { awscdk } = require('projen');
const { CdkConfig } = require('projen/lib/awscdk');
const { Stability } = require('projen/lib/cdk/jsii-project');
const { NpmAccess } = require('projen/lib/javascript');

const project = new awscdk.AwsCdkConstructLibrary({
  author: 'Amir Szekely',
  authorAddress: 'amir@cloudsnorkel.com',
  stability: Stability.EXPERIMENTAL,
  cdkVersion: '2.123.0', // 2.21.1 for lambda url, 2.29.0 for Names.uniqueResourceName(), 2.50.0 for JsonPath.base64Encode, 2.77.0 for node 16, 2.110.0 for ib lifecycle, 2.123.0 for lambda logs
  defaultReleaseBranch: 'main',
  name: '@cloudsnorkel/cdk-github-runners',
  repositoryUrl: 'https://github.com/CloudSnorkel/cdk-github-runners.git',
  license: 'Apache-2.0',
  description: 'CDK construct to create GitHub Actions self-hosted runners. A webhook listens to events and creates ephemeral runners on the fly.',
  devDeps: [
    'esbuild', // for faster NodejsFunction bundling
    '@octokit/core',
    '@octokit/auth-app',
    '@octokit/request-error',
    '@octokit/rest',
    '@aws-sdk/client-cloudformation',
    '@aws-sdk/client-codebuild',
    '@aws-sdk/client-ec2',
    '@aws-sdk/client-ecr',
    '@aws-sdk/client-imagebuilder',
    '@aws-sdk/client-lambda',
    '@aws-sdk/client-secrets-manager',
    '@aws-sdk/client-sns',
    '@aws-sdk/client-ssm',
    '@aws-sdk/client-sfn',
    '@types/aws-lambda',
    'semver',
    '@types/semver',
    // for setup ui
    '@sveltejs/vite-plugin-svelte@^1.0.1',
    '@tsconfig/svelte@^3.0.0',
    'bootstrap@^5.2.0',
    'sass@^1.54.0',
    'svelte@^3.49.0',
    'svelte-check@^2.8.0',
    'svelte-preprocess@^4.10.7',
    'vite@^4.0.0',
    'vite-plugin-singlefile@^0.13.5',
    'eslint-plugin-svelte@^2.29.0',
  ],
  deps: [
  ],
  jsiiVersion: '5.3.x',
  typescriptVersion: '4.9.x',
  releaseToNpm: true,
  npmAccess: NpmAccess.PUBLIC,
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
  pullRequestTemplate: false,
});

// disable automatic releases, but keep workflow that can be triggered manually
const releaseWorkflow = project.github.tryFindWorkflow('release');
releaseWorkflow.file.addDeletionOverride('on.push');

// bundle docker images
project.bundler.bundleTask.exec('cp -r src/providers/docker-images assets');
project.bundler.bundleTask.exec('cp -r src/providers/lambda-*.sh assets/providers');

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
project.addPackageIgnore('/setup');
project.bundler.bundleTask.exec('vite build setup');
project.bundler.bundleTask.exec('cp -r setup/dist/index.html assets/setup.lambda/index.html');
project.eslint.addLintPattern('setup/src/*.ts');
project.eslint.addLintPattern('setup/src/*.svelte');

// support integ:default:watch -- https://github.com/projen/projen/issues/1347
const cdkConfig = new CdkConfig(project, {
  app: '', // Required for types.
  buildCommand: 'npm run bundle',
  watchIncludes: [
    `${project.srcdir}/**/*.ts`,
    `${project.testdir}/**/*.integ.ts`,
  ],
});
cdkConfig.json.addDeletionOverride('app');
cdkConfig.json.addDeletionOverride('context');
cdkConfig.json.addDeletionOverride('output');

// allow lambda utility files to import dev dependencies
project.eslint.allowDevDeps('src/lambda-helpers.ts');
project.eslint.allowDevDeps('src/lambda-github.ts');

// vscode auto formatting
project.vscode.settings.addSettings({
  'editor.formatOnSave': true,
  'editor.codeActionsOnSave': {
    'source.fixAll.eslint': true,
  },
  'eslint.format.enable': true,
  'prettier.enable': false,
  'svelte.plugin.svelte.format.enable': false,
  'svelte.plugin.svelte.enable': false,
});

// funding
project.package.addField('funding', 'https://github.com/sponsors/CloudSnorkel');

project.synth();

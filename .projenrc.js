const fs = require('fs');
const path = require('path');
const { awscdk } = require('projen');
const { CdkConfig } = require('projen/lib/awscdk');
const { Stability } = require('projen/lib/cdk/jsii-project');
const { NpmAccess } = require('projen/lib/javascript');

const project = new awscdk.AwsCdkConstructLibrary({
  author: 'Amir Szekely',
  authorAddress: 'amir@cloudsnorkel.com',
  stability: Stability.EXPERIMENTAL,
  cdkVersion: '2.155.0', // 2.21.1 for lambda url, 2.29.0 for Names.uniqueResourceName(), 2.50.0 for JsonPath.base64Encode, 2.77.0 for node 16, 2.110.0 for ib lifecycle, 2.123.0 for lambda logs, 2.155.0 for launch template throughput
  defaultReleaseBranch: 'main',
  name: '@cloudsnorkel/cdk-github-runners',
  repositoryUrl: 'https://github.com/CloudSnorkel/cdk-github-runners.git',
  license: 'Apache-2.0',
  description: 'CDK construct to create GitHub Actions self-hosted runners. Creates ephemeral runners on demand. Easy to deploy and highly customizable.',
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
    // for setup ui
    '@sveltejs/vite-plugin-svelte@^4',
    '@tsconfig/svelte@^5',
    'bootstrap@^5.2.0',
    'sass@^1.54.0',
    'svelte@^5',
    'svelte-check@^4',
    'svelte-preprocess@^6',
    'vite@^5',
    'vite-plugin-singlefile@^2',
    'eslint-plugin-svelte@^2.29.0',
  ],
  deps: [
  ],
  jsiiVersion: '5.8.x',
  typescriptVersion: '5.6.x',
  lambdaOptions: { runtime: awscdk.LambdaRuntime.NODEJS_22_X },
  releaseToNpm: true,
  npmAccess: NpmAccess.PUBLIC,
  npmTrustedPublishing: true,
  publishToPypi: {
    distName: 'cloudsnorkel.cdk-github-runners',
    module: 'cloudsnorkel.cdk_github_runners',
    trustedPublishing: true,
  },
  publishToGo: {
    moduleName: 'github.com/CloudSnorkel/cdk-github-runners-go',
  },
  publishToMaven: {
    mavenGroupId: 'com.cloudsnorkel',
    mavenArtifactId: 'cdk.github.runners',
    javaPackage: 'com.cloudsnorkel.cdk.github.runners',
    mavenServerId: 'central-ossrh',
  },
  publishToNuget: {
    dotNetNamespace: 'CloudSnorkel',
    packageId: 'CloudSnorkel.Cdk.Github.Runners',
    trustedPublishing: true,
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
        cron: ['0 0 1 * *'],
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
project.eslint.allowDevDeps('setup/src/main.ts');

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

// *** add example validation workflow ***
const buildWorkflow = project.github.tryFindWorkflow('build');

// dynamically discover examples by scanning the examples directory
const examplesDir = 'examples';
const examples = [];

const languages = fs.readdirSync(examplesDir, { withFileTypes: true })
  .filter(dirent => dirent.isDirectory())
  .map(dirent => dirent.name);

for (const language of languages) {
  const languageDir = path.join(examplesDir, language);
  const exampleDirs = fs.readdirSync(languageDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  for (const exampleDir of exampleDirs) {
    examples.push({
      path: path.join(examplesDir, language, exampleDir).replace(/\\/g, '/'),
      language: language,
      name: exampleDir,
    });
  }
}

// save artifact for python and typescript
buildWorkflow.getJob('package-js').steps.push({
  name: 'Save artifact',
  uses: 'actions/upload-artifact@v6',
  with: {
    name: 'js-package',
    path: 'dist',
  },
});
buildWorkflow.getJob('package-python').steps.push({
  name: 'Save artifact',
  uses: 'actions/upload-artifact@v6',
  with: {
    name: 'python-package',
    path: 'dist',
  },
});

// add example validation jobs
for (const example of examples) {
  const job = {
    runsOn: 'ubuntu-latest',
    needs: ['package-js', 'package-python'],
    permissions: {
      contents: 'read',
    },
  };

  if (example.language === 'typescript') {
    job.tools = {
      node: {
        version: 'lts/*',
      },
    };
    job.steps = [
      {
        name: 'Checkout',
        uses: 'actions/checkout@v5',
        with: {
          ref: '${{ github.event.pull_request.head.ref }}',
          repository: '${{ github.event.pull_request.head.repo.full_name }}',
        },
      },
      {
        name: 'Download build artifacts',
        uses: 'actions/download-artifact@v6',
        with: {
          name: 'js-package',
          path: 'dist',
        },
      },
      {
        name: 'Install dependencies',
        run: 'npm install',
        workingDirectory: example.path,
      },
      {
        name: 'Debug',
        run: 'find .',
      },
      {
        name: 'Install local package',
        run: 'npm install ../../dist/*.tgz',
        workingDirectory: example.path,
      },
      {
        name: 'CDK Synth',
        run: 'cdk synth',
        workingDirectory: example.path,
      },
    ];
  } else if (example.language === 'python') {
    job.tools = {
      python: {
        version: '3.x',
      },
    };
    job.steps = [
      {
        name: 'Checkout',
        uses: 'actions/checkout@v5',
        with: {
          ref: '${{ github.event.pull_request.head.ref }}',
          repository: '${{ github.event.pull_request.head.repo.full_name }}',
        },
      },
      {
        name: 'Download build artifacts',
        uses: 'actions/download-artifact@v6',
        with: {
          name: 'python-package',
          path: 'dist',
        },
      },
      {
        name: 'Install dependencies',
        run: 'pip install -r requirements.txt',
        workingDirectory: example.path,
      },
      {
        name: 'Debug',
        run: 'find .',
      },
      {
        name: 'Install local package',
        run: 'pip install ../../dist/*.tgz',
        workingDirectory: example.path,
      },
      {
        name: 'CDK Synth',
        run: 'cdk synth',
        workingDirectory: example.path,
      },
    ];
  }

  buildWorkflow.addJob(`validate-${example.language}-${example.name}`, job);
}

project.synth();

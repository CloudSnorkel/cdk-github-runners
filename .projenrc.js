const { awscdk } = require('projen');
const { CdkConfig } = require('projen/lib/awscdk');
const { Stability } = require('projen/lib/cdk/jsii-project');
const { JobPermission } = require('projen/lib/github/workflows-model');
const { NpmAccess } = require('projen/lib/javascript');

const project = new awscdk.AwsCdkConstructLibrary({
  author: 'Amir Szekely',
  authorAddress: 'amir@cloudsnorkel.com',
  stability: Stability.STABLE,
  majorVersion: 1,
  cdkVersion: '2.261.0', // 2.21.1 for lambda url, 2.29.0 for Names.uniqueResourceName(), 2.50.0 for JsonPath.base64Encode, 2.77.0 for node 16, 2.110.0 for ib lifecycle, 2.123.0 for lambda logs, 2.155.0 for launch template throughput, 2.239.0 for https://github.com/aws/aws-cdk/issues/37041, 2.261.0 for CfnMicrovmImage
  defaultReleaseBranch: 'main',
  name: '@cloudsnorkel/cdk-github-runners',
  repositoryUrl: 'https://github.com/CloudSnorkel/cdk-github-runners.git',
  license: 'Apache-2.0',
  description: 'CDK construct to create GitHub Actions self-hosted runners. Creates ephemeral runners on demand. Easy to deploy and highly customizable.',
  packageManager: 'pnpm',
  devDeps: [
    'esbuild', // for faster NodejsFunction bundling
    '@octokit/core',
    '@octokit/auth-app',
    '@octokit/request-error',
    '@octokit/rest',
    '@aws-sdk/client-cloudformation',
    '@aws-sdk/client-codebuild',
    '@aws-sdk/client-dynamodb',
    '@aws-sdk/client-ec2',
    '@aws-sdk/client-ecr',
    '@aws-sdk/client-imagebuilder',
    '@aws-sdk/client-lambda',
    '@aws-sdk/client-lambda-microvms',
    '@aws-sdk/client-s3',
    '@aws-sdk/client-secrets-manager',
    '@aws-sdk/client-sns',
    '@aws-sdk/client-sqs',
    '@aws-sdk/client-ssm',
    '@aws-sdk/client-sfn',
    '@types/aws-lambda',
    'cdk-nag@^3', // for test/compliance.test.ts
    'jszip',
    // for setup ui
    '@sveltejs/vite-plugin-svelte@^6',
    '@tsconfig/svelte@^5',
    'bootstrap@^5.2.0',
    'sass@^1.54.0',
    'svelte@^5',
    'svelte-check@^4',
    'svelte-preprocess@^6',
    'vite@^7',
    'vite-plugin-singlefile@^2',
    'eslint-plugin-svelte@^2.29.0',
    // https://github.com/projen/projen/issues/4368
    'shx',
    // for docs website
    'vitepress@^1.6.4',
  ],
  deps: [
  ],
  bundledDeps: [
    'cron-parser',
  ],
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
    cooldown: 5, // don't include updates from the last five days to try and dodge supply chain attacks
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
  workflowPackageCache: true,
  pullRequestTemplate: false,
  tsconfigDev: {
    compilerOptions: {
      // massively increased unit tests speed
      // side-effect: disable type checking in unit test code
      isolatedModules: true,
    },
  },
  jestOptions: {
    // too many console.log() lines in EVERY build
    extraCliOptions: ['--silent'],
  },
  buildWorkflowOptions: {
    workflowTriggers: { pullRequest: {} }, // no workflow_dispatch, CodeQL flags it as cache poisoning
  },
});

// disable automatic releases, but keep workflow that can be triggered manually
const releaseWorkflow = project.github.tryFindWorkflow('release');
releaseWorkflow.file.addDeletionOverride('on.push');

// more consistent snapshots across systems
project.npmrc.addConfig('node-linker', 'hoisted');

// bundle docker images
project.bundler.bundleTask.exec('cp -r src/providers/*.sh assets/providers');
project.bundler.bundleTask.exec('cp -r src/providers/*.ps1 assets/providers');
project.bundler.bundleTask.exec('cp -r src/providers/*.js assets/providers');

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
project.addPackageIgnore('/examples');
project.bundler.bundleTask.exec('vite build setup');
project.bundler.bundleTask.exec('cp -r setup/dist/index.html assets/setup.lambda/index.html');
project.eslint.addLintPattern('setup/src/*.ts');
project.eslint.addLintPattern('setup/src/*.svelte');
// eslint-plugin-svelte@2 pins postcss-selector-parser@^6 which is vulnerable to GHSA-rj75-hqrm-r3gf
project.package.addPackageResolutions('postcss-selector-parser@^7.1.6');

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
project.eslint.allowDevDeps('src/lambda-ec2.ts');
project.eslint.allowDevDeps('src/lambda-helpers.ts');
project.eslint.allowDevDeps('src/lambda-github.ts');
project.eslint.allowDevDeps('src/lambda-tracker.ts');
project.eslint.allowDevDeps('setup/src/main.ts');

// not part of the project and can use defaults
project.eslint.allowDefaultProjectFiles('.projenrc.js');

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

// patch existing mergify rule to require test-examples
const mergifyFile = project.tryFindObjectFile('.mergify.yml');
mergifyFile.addToArray('queue_rules.0.queue_conditions', 'status-success=test-examples');
mergifyFile.addToArray('pull_request_rules.0.conditions', 'status-success=test-examples');

// docs website, built with the package so broken docstring links fail PRs, but compile stays fast
project.gitignore.addPatterns('/docs/.vitepress/cache', '/docs/api', '/docs/.vitepress/*.timestamp-*.mjs');
project.addPackageIgnore('/docs');
const docsTask = project.addTask('docs:build', { exec: 'vitepress build docs' });
project.addTask('docs:dev', { exec: 'vitepress dev docs' });
project.packageTask.spawn(docsTask);
const deployDocsSteps = [
  {
    name: 'Upload docs',
    uses: 'actions/upload-pages-artifact@v5',
    with: { path: 'dist/docs' },
  },
  {
    name: 'Deploy docs',
    id: 'deploy',
    uses: 'actions/deploy-pages@v5',
  },
];
const deployDocsJob = {
  runsOn: ['ubuntu-latest'],
  permissions: {
    pages: JobPermission.WRITE,
    idToken: JobPermission.WRITE,
  },
  environment: {
    name: 'github-pages',
    url: '${{ steps.deploy.outputs.page_url }}',
  },
};
project.release.addJobs({
  release_docs: {
    ...deployDocsJob,
    name: 'Publish docs website',
    needs: ['release', 'release_github'],
    if: '${{ !inputs.dry_run }}',
    steps: [
      {
        name: 'Download build artifacts',
        uses: 'actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c',
        with: {
          'artifact-ids': '${{ needs.release.outputs.artifact_id }}',
          'path': 'dist',
        },
      },
      ...deployDocsSteps,
    ],
  },
});
// publish docs without a release, for initial setup and docs-only changes
const docsWorkflow = project.github.addWorkflow('docs');
docsWorkflow.on({ workflowDispatch: {} });
docsWorkflow.addJobs({
  docs: {
    ...deployDocsJob,
    permissions: {
      ...deployDocsJob.permissions,
      contents: JobPermission.READ,
    },
    steps: [
      { name: 'Checkout', uses: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1' },
      ...project.renderWorkflowSetup({ mutable: false }),
      { name: 'Build docs', run: 'pnpm exec projen compile && pnpm exec projen docs:build' },
      ...deployDocsSteps,
    ],
  },
});

// funding
project.package.addField('funding', 'https://github.com/sponsors/CloudSnorkel');

project.synth();

<script lang="ts">
  const secret = 'INSERT_SECRET_ARN_HERE';
  const token = 'INSERT_TOKEN_HERE';
  let instance: undefined | 'github.com' | 'ghes';
  let domain = 'INSERT_DOMAIN_HERE';
  let auth: undefined | 'newApp' | 'existingApp' | 'pat';
  let appScope: 'user' | 'org' = 'user';
  let runnerLevel: 'repo' | 'org' = 'repo';
  let org = 'ORGANIZATION';
  let existingAppId: string = '';
  let existingAppPk: string = '';
  let pat: string = '';
  let success: boolean;
  let result: string | undefined;

  interface Permissions {
    actions: 'write' | 'read';
    administration?: 'write' | 'read';
    organization_self_hosted_runners?: 'write' | 'read';
    deployments: 'write' | 'read';
  };

  const repositoryPermissions: Permissions = {
    actions: 'write',
    administration: 'write',
    deployments: 'read',
  };

  const organizationPermissions: Permissions = {
    actions: 'write',
    organization_self_hosted_runners: 'write',
    deployments: 'read',
  };

  const manifest = {
    url: 'https://github.com/CloudSnorkel/cdk-github-runners',
    hook_attributes: {
      url: 'INSERT_WEBHOOK_URL_HERE',
    },
    redirect_url: 'INSERT_BASE_URL_HERE/complete-new-app',
    public: false,
    default_permissions: <Permissions>repositoryPermissions,
    default_events: [
      'workflow_job',
    ],
  };

  function isSubmitDisabled(instance_, auth_, existingAppId_, existingAppPk_, runnerLevel_, pat_, success_) {
    if (success_) {
      return true;
    }
    if (instance_ === undefined || auth_ === undefined) {
      return true;
    }
    if (auth_ === 'newApp') {
      return false;
    }
    if (auth_ === 'existingApp') {
      return existingAppId_ === '' || existingAppPk_ === '' || runnerLevel_ === undefined;
    }
    if (auth_ === 'pat') {
      return pat_ === '';
    }
    console.error('Something is broken', instance_, auth_, existingAppId_);
    return true;
  }

  function submitText(auth_) {
    if (auth_ === 'newApp') {
      return 'Create GitHub App';
    }
    return 'Setup';
  }

  function postJson(url, data): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      fetch(`${url}?token=${token}`, {
        method: 'POST',
        mode: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
        redirect: 'error',
      })
        .then(response => {
          if (!response.ok) {
            response.text()
              .then(text => {
                reject(new Error(`${text} [${response.status}]`));
              })
              .catch(reject);
          } else {
            response.text()
              .then(resolve)
              .catch(reject);
          }
        })
        .catch(reject);
    });
  }

  function submit(ev) {
    ev.preventDefault();

    function promise(): Promise<string> {
      const rightDomain = instance === 'ghes' ? domain : 'github.com';
      manifest.default_permissions =
        runnerLevel === 'repo'
          ? repositoryPermissions
          : organizationPermissions;
      switch (auth) {
        case 'newApp':
          return postJson('domain', { domain: rightDomain, runnerLevel })
            .then(_ => {
              (document.getElementById('appform') as HTMLFormElement).submit();
              return Promise.resolve('Redirecting to GitHub...');
            });
        case 'existingApp':
          return postJson('app', {
            appid: existingAppId,
            pk: existingAppPk,
            domain: rightDomain,
            runnerLevel,
          });
        case 'pat':
          return postJson('pat', {
            pat: pat,
            domain: rightDomain,
          });
      }
    }

    promise()
      .then(successText => {
        result = successText;
        success = true;
      })
      .catch(error => {
        result = `${error}`;
        success = false;
      });
  }
</script>

<main>
  <div class="container py-3 px-2">
    <div class="row">
      <form class="col" on:submit={submit}>
        <h1>Setup GitHub Runners</h1>
        <p>Answer all the questions on this page to automatically configure GitHub integration and get the
          runners working. This page will not be accessible once you complete this operation. If you ever want
          to access it again, edit <code>{secret}</code> and run the status function again.</p>

        <h3>Choose GitHub Instance</h3>
        <div class="px-3 py-3">
          <p>Are your repositories hosted on GitHub.com or are you using an on-premise installation of GitHub
            Enterprise Server?</p>
          <div class="form-check">
            <input class="form-check-input" type="radio" bind:group={instance} value="github.com"
                   id="github.com">
            <label class="form-check-label" for="github.com">
              GitHub.com
            </label>
          </div>
          <div class="form-check">
            <input class="form-check-input" type="radio" bind:group={instance} value="ghes" id="ghes">
            <label class="form-check-label" for="ghes">
              GitHub Enterprise Server
            </label>
          </div>
        </div>

        {#if instance === 'ghes'}
          <h3>GitHub Enterprise Server Domain</h3>
          <div class="px-3 py-3">
            <p>Where is GitHub Enterprise Server hosted? Type in the domain without <code>https://</code>
              and without any path. It should look something like <code>github.mycompany.com</code>.</p>
            <input class="form-control" bind:value={domain}>
          </div>
        {/if}

        {#if instance}
          <h3>Authentication Type</h3>
          <div class="px-3 py-3">
            <p>You can choose between creating a new app that will provide authentication for specific
              repositories, or a personal access token that will provide access to all repositories
              available to you. Apps are easier to set up and provide more fine-grained access control. If
              you have previously created an app, you can choose to use an existing app.</p>
            <div class="form-check">
              <input class="form-check-input" type="radio" bind:group={auth} value="newApp" id="newApp">
              <label class="form-check-label" for="newApp">
                New GitHub App <b>(recommended)</b>
              </label>
            </div>
            <div class="form-check">
              <input class="form-check-input" type="radio" bind:group={auth} value="existingApp"
                     id="existingApp">
              <label class="form-check-label" for="existingApp">
                Existing GitHub App
              </label>
            </div>
            <div class="form-check">
              <input class="form-check-input" type="radio" bind:group={auth} value="pat" id="pat">
              <label class="form-check-label" for="pat">
                Personal Access Token
              </label>
            </div>
          </div>
        {/if}

        {#if auth === 'newApp'}
          <h3>New App Settings</h3>
          <div class="px-3 py-3">
            <p>Choose whether to create a new personal app or organization app. A private personal app can
              only be used for repositories under your user. A private organization app can only be used
              for repositories under that organization.</p>
            <div class="form-check">
              <input class="form-check-input" type="radio" bind:group={appScope} value="user"
                     id="userScope">
              <label class="form-check-label" for="userScope">
                User app
              </label>
            </div>
            <div class="form-check">
              <input class="form-check-input" type="radio" bind:group={appScope} value="org"
                     id="orgScope">
              <label class="form-check-label" for="orgScope">
                Organization app
              </label>
            </div>
            {#if instance === 'ghes'}
              <p class="pt-2">If multiple organizations under the same GitHub Enterprise Server need to use the runners,
                you can make the app public.</p>
              <div class="form-check">
                <input class="form-check-input" type="checkbox" bind:checked={manifest.public} id="public">
                <label class="form-check-label" for="public">
                  Public app
                </label>
              </div>
            {/if}
          </div>

          {#if appScope === 'org'}
            <h3>Organization name</h3>
            <div class="px-3 py-3">
              <p>What is the slug for your organization? If your repositories have a URL like
                <code>https://{domain}/MyOrg/my-repo</code>
                then your organization slug is <code>MyOrg</code>.</p>
              <input class="form-control" bind:value={org}>
            </div>
          {/if}
        {:else if auth === 'existingApp'}
          <h3>Existing App Details</h3>
          <div class="px-3 py-3">
            <div class="form-group row px-3 py-2">
              <label for="appid" class="col-sm-2 col-form-label">App Id</label>
              <div class="col-sm-10">
                <input type="number" class="form-control" id="appid" bind:value={existingAppId}>
              </div>
            </div>
            <div class="form-group row px-3 py-2">
              <label for="pk" class="col-sm-2 col-form-label">Private Key</label>
              <div class="col-sm-10">
                <textarea class="form-control" id="pk" bind:value={existingAppPk} rows="10"></textarea>
              </div>
            </div>
            <div class="form-group row px-3 py-2">
              <div class="col-sm-2 col-form-label">Registration Level</div>
              <div class="col-sm-10">
                <div class="form-check">
                  <input
                    class="form-check-input"
                    type="radio"
                    bind:group={runnerLevel}
                    value="repo"
                    id="repo"
                  />
                  <label class="form-check-label" for="repo">Repository</label>
                </div>
                <div class="form-check">
                  <input
                    class="form-check-input"
                    type="radio"
                    bind:group={runnerLevel}
                    value="org"
                    id="org"
                  />
                  <label class="form-check-label" for="org">Organization</label>
                </div>
              </div>
            </div>

            <h4>Required Permissions</h4>
            <p>The existing app must have the following permissions.</p>
            <pre>{JSON.stringify(runnerLevel === 'repo' ? repositoryPermissions : organizationPermissions, undefined, 2)}</pre>

            <h4>Webhook</h4>
            <p>
              Don't forget to set up the webhook and its secret as described in <a
                href="https://github.com/CloudSnorkel/cdk-github-runners/blob/main/SETUP_GITHUB.md">SETUP_GITHUB.md</a>.
            </p>
          </div>
        {:else if auth === 'pat'}
          <h2>Personal Access Token</h2>
          <div class="px-3 py-3">
            <p>The <a href="https://{domain}/settings/tokens">personal access token</a> must have the <code>repo</code>
              scope enabled. Don't forget to also create a webhook as described in <a
                href="https://github.com/CloudSnorkel/cdk-github-runners/blob/main/SETUP_GITHUB.md">SETUP_GITHUB.md</a>.
            </p>
            <input class="form-control" bind:value={pat}
                   placeholder="Token e.g. ghp_abcdefghijklmnopqrstuvwxyz1234567890">
          </div>
        {/if}

        {#if appScope === 'org' && auth === 'newApp'}
          <h3>Registration Level</h3>
          <div class="px-3 py-3">
            <p>
              Would you like runners to be registered on repository level, or on organization level?
            </p>
            <ul>
              <li>
                Registering runners on repository level requires the <code>administration</code>
                <a href="https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/autoscaling-with-self-hosted-runners#authentication-requirements">permission</a>.
              </li>
              <li>
                Registering runners on organization level only requires the <code>organization_self_hosted_runners</code>
                <a href="https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/autoscaling-with-self-hosted-runners#authentication-requirements">permission</a>
                which is more fine-grained.
              </li>
              <li>
                Registering runners on organization level means any repository can use them, even if the app wasn't
                installed on those repositories.
              </li>
              <li>
                Do not use organization level registration if you don't fully trust all repositories in your organization.
              </li>
              <li>
                Use organization level to reduce the permission scope this new app is given.
              </li>
              <li>
                When in doubt, use the default repository level registration.
              </li>
            </ul>
            <div class="form-check">
              <input
                class="form-check-input"
                type="radio"
                bind:group={runnerLevel}
                value="repo"
                id="repo"
              />
              <label class="form-check-label" for="repo">Repository</label>
            </div>
            <div class="form-check">
              <input
                class="form-check-input"
                type="radio"
                bind:group={runnerLevel}
                value="org"
                id="org"
              />
              <label class="form-check-label" for="org">Organization</label>
            </div>
          </div>
        {/if}

        <h2>Finish Setup</h2>
        <div class="px-3 py-3">
          {#if result === undefined}
            <p>This button will be enabled once all the questions above are answered.</p>
          {:else}
            <div class="alert alert-{success ? 'success' : 'danger'}" role="alert">
              {result}
            </div>
          {/if}
          {#if manifest.public && auth === 'newApp'}
            <p><b class="text-danger">WARNING:</b> using a public app means anyone with access to <code>{domain}</code>
              can use the runners you're setting up now. Anyone can create a workflow that will run on those runners,
              have access to their instance profile, and be part of their security group. Consider the security
              implications before continuing.</p>
          {/if}
          <button type="submit" class="btn btn-success"
                  disabled={isSubmitDisabled(instance, auth, existingAppId, existingAppPk, runnerLevel, pat, success)}>
            {submitText(auth)}
          </button>
        </div>
      </form>
    </div>
  </div>

  <form action="https://{domain}/{appScope === 'org' ? `organizations/${org}/` : ''}settings/apps/new?state={token}"
        method="post" id="appform">
    <input type="hidden" name="manifest" value={JSON.stringify(manifest)}>
  </form>
</main>

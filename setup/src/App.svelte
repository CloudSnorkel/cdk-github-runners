<script lang="ts">
  const secret = 'INSERT_SECRET_ARN_HERE';
  const token = 'INSERT_TOKEN_HERE';
  let instance: undefined | 'github.com' | 'ghes';
  let domain = 'INSERT_DOMAIN_HERE';
  let auth: undefined | 'newApp' | 'existingApp' | 'pat';
  let appScope: 'user' | 'org' = 'user';
  let org = 'ORGANIZATION';
  let existingAppId: string = '';
  let existingAppPk: string = '';
  let pat: string = '';
  let success: boolean;
  let result: string | undefined;

  const manifest = JSON.stringify({
    url: 'https://github.com/CloudSnorkel/cdk-github-runners',
    hook_attributes: {
      url: 'INSERT_WEBHOOK_URL_HERE',
    },
    redirect_url: `INSERT_BASE_URL_HERE/complete-new-app`,
    public: false,
    default_permissions: {
      actions: 'write',
      administration: 'write',
    },
    default_events: [
      'workflow_job',
    ],
  });

  function isSubmitDisabled(instance, auth, existingAppId, existingAppPk, pat, success) {
    if (success) {
      return true;
    }
    if (instance === undefined || auth === undefined) {
      return true;
    }
    if (auth === 'newApp') {
      return false;
    }
    if (auth === 'existingApp') {
      return existingAppId === '' || existingAppPk === '';
    }
    if (auth === 'pat') {
      return pat === '';
    }
    console.error('Something is broken', instance, auth, existingAppId);
    return true;
  }

  function submitText(auth) {
    if (auth === 'newApp') {
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
      switch (auth) {
        case 'newApp':
          return postJson('domain', { domain: rightDomain })
            .then(_ => {
              (document.getElementById('appform') as HTMLFormElement).submit();
              return Promise.resolve('Redirecting to GitHub...');
            });
        case 'existingApp':
          return postJson('app', {
            appid: existingAppId,
            pk: existingAppPk,
            domain: rightDomain,
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
                Personal Authentication Token
              </label>
            </div>
          </div>
        {/if}

        {#if auth === 'newApp'}
          <h3>New App Settings</h3>
          <div class="px-3 py-3">
            <p>Choose whether to create a new personal app or organization app. A private personal app can
              only be used for repositories under your user. A private origination app can only be used
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
            <p>Existing apps must have <code>actions</code> and <code>administration</code> write
              permissions. Don't forget to set up the webhook and its secret as described in <a
                href="https://github.com/CloudSnorkel/cdk-github-runners/blob/main/SETUP_GITHUB.md">SETUP_GITHUB.md</a>.
            </p>
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

        <h2>Finish Setup</h2>
        <div class="px-3 py-3">
          {#if result === undefined}
            <p>This button will be enabled once all the questions above are answered.</p>
          {:else}
            <div class="alert alert-{success ? 'success' : 'danger'}" role="alert">
              {result}
            </div>
          {/if}
          <button type="submit" class="btn btn-success"
                  disabled={isSubmitDisabled(instance, auth, existingAppId, existingAppPk, pat, success)}>
            {submitText(auth)}
          </button>
        </div>
      </form>
    </div>
  </div>

  <form action="https://{domain}/{appScope === 'org' ? `organizations/${org}/` : ''}settings/apps/new?state={token}"
        method="post" id="appform">
    <input type="hidden" name="manifest" value={manifest}>
  </form>
</main>

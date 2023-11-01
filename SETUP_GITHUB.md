# Setup GitHub

Integration with GitHub can be done using an [app](#app-authentication) or [personal access token](#personal-access-token). Using an app allows more fine-grained access control. Using an app is easier with the setup wizard.

## App Authentication

### Setup Wizard

1. Open the URL in `github.setup.url` from `status.json`
2. Choose whether you're integrating with GitHub.com or GitHub Enterprise Server
3. Next choose New GitHub App
4. If you want to create an app for your personal repositories, choose User app
5. If you want to create an app for your organization:
   1. Choose Organization app
   2. Type in the organization slug (ORGANIZATION from https://github.com/ORGANIZATION/REPO)
   3. Choose registration level for the runners
6. Click Create GitHub App to take you to GitHub to finish the setup
7. Follow the instructions on GitHub
8. When brought back to the setup wizard, click the install link
9. Install the new app on your desired repositories

### Manually

1. Decide if you want to create a personal app or an organization app
    1. For a personal app use https://github.com/settings/apps/new
    2. For an organization app use https://github.com/organizations/MY_ORG/settings/apps/new after replacing `MY_ORG` with your GitHub organization name
2. Choose a name and homepage URL (the app won't be public, so they don't matter too much)
3. Setup webhook under the webhook section
    1. For Webhook URL use the value of `github.webhook.url` from `status.json`
    2. Open the URL in `github.webhook.secretUrl` from `status.json`, retrieve the secret value, and use it for webhook secret
4. In the permissions section enable:
   1. Repository    -> Actions: Read and write
   2. Repository    -> Administration: Read and write
   3. Repository    -> Deployments: Read-only
   4. Repository    -> Administration: Read and write (only for repository level runners)
   5. Organization  -> Self-hosted runners: Read and write (only for organization level runners)
5. In the event subscription section enable:
    1. Workflow job
6. Under "Where can this GitHub App be installed?" select "Only on this account"
7. Click the Create button
8. From the new app page generate a private key and save the downloaded key
9. On the top left go to Install App page and install the app on the desired account or organization
10. Open the URL in `github.auth.secretUrl` from `status.json` and edit the secret value
    1. If you're using a self-hosted GitHub instance, put its domain in `domain` (e.g. `github.mycompany.com`)
    2. Put the new application id in `appId` (e.g. `34789562`)
    3. If using organization level registration, add `runnerLevel` with `org` as the value
    4. Ignore/delete `dummy` and **leave `personalAuthToken` empty**
11. Open the URL in `github.auth.privateKeySecretUrl` from `status.json` and edit the secret value
    1. Open the downloaded private key with any text editor
    2. Copy the text from the private key as-is into the secret

## Personal Access Token

### Create Token

1. Go to https://github.com/settings/tokens/new
2. Choose your expiration date (you will need to replace the token if it expires)
3. Under scopes select `repo`
4. Copy the generated token

### Set Token

#### Setup Wizard

1. Open the URL in `github.setup.url` from `status.json`
2. Choose whether you're integrating with GitHub.com or GitHub Enterprise Server
3. Next choose Personal Access Token
4. Enter your personal access token
5. Click the Setup button

#### Manually

1. Open the URL in `github.auth.secretUrl` from `status.json` and edit the secret value
2. If you're using a self-hosted GitHub instance, put its domain in `domain` (e.g. `github.mycompany.com`)
3. Put the generated token in `personalAuthToken` (**not** `personalAccessToken`)
4. Ignore all other values

### Setup Webhook

1. For organizations go to https://github.com/organizations/MY_ORG/settings/hooks after replacing `MY_ORG` with your GitHub organization name
2. For enterprise go to https://github.com/enterprises/MY_ENTERPRISE/settings/hooks after replacing `MY_ENTERPRISE` with your GitHub enterprise name
3. Otherwise, you can create one per repository in your repository settings under Webhooks
4. Configure the webhook:
    1. For Webhook URL use the value of `github.webhook.url` from `status.json`
    2. Open the URL in `github.webhook.secretUrl` from `status.json`, retrieve the secret value, and use it for webhook secret
    3. Make sure content type is set to JSON
    4. Select individual jobs and select only Workflow jobs

## Resetting Setup Wizard

If the setup wizard tells you setup has already been completed or if `github.setup.status` is completed, or if `github.setup.url` is empty:

1. Open the URL in `github.setup.secretUrl` from `status.json`
2. Edit the secret
3. Put a new random value in `token`
4. Run status function again to get the new URL

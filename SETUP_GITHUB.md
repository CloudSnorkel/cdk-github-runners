# Setup GitHub

## Overview of Options

You will need to make several decisions during setup. Here's a quick guide to help you choose:

### 1. Authentication Method

**Choose between:**
- **GitHub App** (recommended) - More fine-grained permissions, easier setup with wizard, better security
- **Personal Access Token (PAT)** - Simpler but less flexible, requires manual webhook setup

**When to use App:** Almost always. Use PAT only if you have specific constraints that prevent using an app.

**When to use PAT:** If you need a quick setup and don't need fine-grained permissions, or if your organization has policies preventing app creation.

> **⚠️ IT/DevOps Help May Be Required:** Installing a GitHub app on repositories or organizations may require repository administrator or organization owner permissions. You may need to coordinate with your IT/devops team to install the app on the desired repositories.

### 2. GitHub Instance

**Choose between:**
- **GitHub.com** - Public GitHub
- **GitHub Enterprise Server** - Self-hosted GitHub instance

**When to use Enterprise Server:** If your organization uses a self-hosted GitHub Enterprise Server instance.

> **⚠️ IT/DevOps Help Required:** Setting up with GitHub Enterprise Server requires coordination with your IT/devops team to obtain the correct domain and ensure network connectivity.

### 3. App Scope (if using App)

**Choose between:**
- **User App** - For personal repositories
- **Organization App** - For organization repositories

**When to use User App:** If you only need to run workflows for your personal repositories.

**When to use Organization App:** If you need to run workflows for repositories in an organization.

> **⚠️ IT/DevOps Approval Required:** Creating an organization app may require organization owner or administrator permissions. You may need to request approval from your IT/devops team or organization administrators.

### 4. Runner Registration Level

**Choose between:**
- **Repository-level** (recommended) - Runners registered to specific repositories
- **Organization-level** - Runners registered to the entire organization

> **Note:** This determines where on-demand runners will be registered dynamically each time they are provisioned. This is independent of where the GitHub app is installed. Organization-level registration makes runners available to **all repositories in the organization**, regardless of app installation.

**When to use Repository-level:**
- You want better isolation between repositories
- You want to reduce the risk of jobs being accidentally assigned to the wrong runners
- You're okay with requiring the `administration` permission

**When to use Organization-level:**
- You need to minimize permissions (only requires `organization_self_hosted_runners`)
- You fully trust all repositories in your organization
- You want all repositories to share the same pool of runners

> **⚠️ IT/DevOps Approval May Be Required:** Organization-level registration affects all repositories in the organization. Your organization may have policies requiring approval before enabling organization-wide runner registration.

#### Registration Level Recommendation

This determines where on-demand runners will be registered dynamically each time they are provisioned. This is independent of where the GitHub app is installed.

Repository-level registration is recommended over organization-level registration for better control and security:

* **Reduced risk of accidental job assignment**: Runners are dynamically registered to the repository matching the job that triggered them. This ensures jobs are only assigned to runners intended for that specific repository, reducing the risk of accidental assignment when using multiple runner configurations.
* **Better isolation**: Each repository only sees runners that are explicitly registered to it, providing better isolation between different projects or teams.
* **Trade-off**: Repository-level registration requires the `administration` permission, which is broader than the `organization_self_hosted_runners` permission required for organization-level registration. If you need to minimize permissions and fully trust all repositories in your organization, organization-level registration may be acceptable.

Organization-level registration registers runners to the entire organization, making them available to **all repositories in the organization**, regardless of whether the app is installed on those repositories. This can lead to jobs being routed to runners that weren't intended for them. Runners may be assigned jobs from repositories where this app isn't even installed.

### 5. Setup Method

**Choose between:**
- **Setup Wizard** (recommended) - Interactive web interface, guides you through the process
- **Manual Setup** - Step-by-step instructions, more control over each step

**When to use Setup Wizard:** If you prefer a guided, interactive experience.

**When to use Manual Setup:** If you need more control, want to understand each step in detail, or the wizard isn't available.

### 6. Webhook Scope (if using PAT)

**Choose between:**
- **Organization/Enterprise webhook** - Single webhook for all repositories
- **Repository-level webhooks** - One webhook per repository

**When to use Organization/Enterprise webhook:** If you want to manage a single webhook for multiple repositories.

**When to use Repository-level webhooks:** If you only need runners for a few specific repositories.

> **⚠️ IT/DevOps Approval Required:** Creating organization or enterprise-level webhooks requires organization owner or enterprise administrator permissions. Repository-level webhooks only require repository admin permissions.

---

## Setup GitHub

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

## Personal Access Token Authentication

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
3. Otherwise, you can create one webhook per repository in your repository settings under Webhooks
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

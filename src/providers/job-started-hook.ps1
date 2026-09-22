$ErrorActionPreference = 'Stop'

Set-Location $PSScriptRoot

# notify the runner wrapper that a job started, so it can detect stolen runners
try {
    Add-Content -Path '.workflowid' -Value "REPO=$Env:GITHUB_REPOSITORY WORKFLOW_ID=$Env:GITHUB_RUN_ID"
} catch {
    # ignore errors to not break the job
}

# run user hook if it exists
$hook = Join-Path (Get-Location) 'job-started-hook-user.ps1'
if (Test-Path $hook -PathType Leaf) {
    & $hook
    exit $LASTEXITCODE
}

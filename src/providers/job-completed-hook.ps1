$ErrorActionPreference = 'Stop'

Set-Location $PSScriptRoot

# Run user hook if it exists
$hook = Join-Path (Get-Location) 'job-completed-hook-user.ps1'
if (Test-Path $hook -PathType Leaf) {
    & $hook
    exit $LASTEXITCODE
}

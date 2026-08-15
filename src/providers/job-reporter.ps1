$ErrorActionPreference = 'Stop'
Set-PSDebug -Trace 1

Set-Location $PSScriptRoot

$workflowFile = Join-Path $PSScriptRoot '.workflowid'

$runner = $args[0]
$reportFile = $args[1] # optional for ec2

# Start with an empty file, so we only need to poll for content
[System.IO.File]::WriteAllText($workflowFile, '')

Set-PSDebug -Off # don't spam log with sleeps

if ($reportFile) {
    # write output to specific file (ec2 log file)
    $command = @"
while (`$true) {
    `$workflowId = Get-Content -LiteralPath '$workflowFile' -TotalCount 1
    if (`$workflowId) {
        `$message = 'CDKGHR JOB RUNNER=$runner ' + `$workflowId
        Add-Content -LiteralPath '$reportFile' -Value `$message
        break
    }
    Start-Sleep -Seconds 1
}
"@
} else {
    # write output to stdout (codebuild, fargate, ecs)
    $command = @"
while (`$true) {
    `$workflowId = Get-Content -LiteralPath '$workflowFile' -TotalCount 1
    if (`$workflowId) {
        `$message = 'CDKGHR JOB RUNNER=$runner ' + `$workflowId
        [Console]::Out.WriteLine(`$message)
        break
    }
    Start-Sleep -Seconds 1
}
"@
}

# new process for actual reporting, so we don't block the job from starting
Start-Process `
    -NoNewWindow `
    -FilePath 'powershell.exe' `
    -ArgumentList @(
        '-NoProfile'
        '-ExecutionPolicy', 'Bypass'
        '-Command', $command
    ) | Out-Null

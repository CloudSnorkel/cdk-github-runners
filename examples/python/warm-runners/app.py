#!/usr/bin/env python3
"""
Warm runners example — pre-provisioned runners for low-latency job starts.

This example creates a pool of warm CodeBuild runners that stay idle until
a job arrives. Uses AlwaysOnWarmRunner for 24/7 coverage.
"""

import aws_cdk as cdk
from aws_cdk import Stack
from cloudsnorkel.cdk_github_runners import (
    AlwaysOnWarmRunner,
    CodeBuildRunnerProvider,
    GitHubRunners,
)


class WarmRunnersStack(Stack):
    def __init__(self, scope, construct_id, **kwargs):
        super().__init__(scope, construct_id, **kwargs)

        provider = CodeBuildRunnerProvider(
            self, "CodeBuildProvider",
            labels=["codebuild", "linux", "x64"]
        )

        runners = GitHubRunners(
            self, "GitHubRunners",
            providers=[provider]
        )

        AlwaysOnWarmRunner(
            self, "WarmRunners",
            runners=runners,
            provider=provider,
            count=2,
            owner="my-org",
            repo="my-repo",
        )


app = cdk.App()
WarmRunnersStack(app, "warm-runners-example")
app.synth()

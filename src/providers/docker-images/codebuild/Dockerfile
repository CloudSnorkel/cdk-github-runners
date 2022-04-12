FROM public.ecr.aws/lts/ubuntu:18.04

# setup user
RUN addgroup runner && adduser --system --disabled-password --home /home/runner --ingroup runner runner

# add dependencies and sudo
RUN apt-get update && apt-get upgrade -y && apt-get install -y curl sudo jq bash git zip unzip && \
    usermod -aG sudo runner && \
    echo "%sudo   ALL=(ALL:ALL) NOPASSWD: ALL" > /etc/sudoers.d/runner

# add awscli
RUN curl -sL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o awscliv2.zip && \
    unzip -q awscliv2.zip && ./aws/install && rm -rf awscliv2.zip aws

# add ghcli
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null  && \
    apt update && \
    apt install -y gh

# setup working directory
WORKDIR /home/runner

# add runner
ARG RUNNER_VERSION
RUN if [ "${RUNNER_VERSION}" = "latest" ]; then RUNNER_VERSION=`curl -sL https://api.github.com/repos/actions/runner/releases/latest | jq -r .tag_name | cut -c2-`; fi && \
    curl -sLO  "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz" && \
    tar xzf "actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz" && \
    rm actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz && \
    ./bin/installdependencies.sh

# configure runner
USER runner

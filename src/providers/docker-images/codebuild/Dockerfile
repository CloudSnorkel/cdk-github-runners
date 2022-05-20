FROM public.ecr.aws/lts/ubuntu:18.04

# setup user
RUN addgroup runner && adduser --system --disabled-password --home /home/runner --ingroup runner runner

# add dependencies and sudo
RUN apt-get update && apt-get upgrade -y && apt-get install -y curl sudo jq bash git zip unzip iptables && \
    usermod -aG sudo runner && \
    echo "%sudo   ALL=(ALL:ALL) NOPASSWD: ALL" > /etc/sudoers.d/runner

# add awscli
RUN curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o awscliv2.zip && \
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
RUN if [ "${RUNNER_VERSION}" = "latest" ]; then RUNNER_VERSION=`curl -fsSL https://api.github.com/repos/actions/runner/releases/latest | jq -r .tag_name | cut -c2-`; fi && \
    curl -fsSLO  "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz" && \
    tar xzf "actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz" && \
    rm actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz && \
    ./bin/installdependencies.sh

# docker-in-docker
ARG DOCKER_CHANNEL="stable"
ARG DIND_COMMIT="42b1175eda071c0e9121e1d64345928384a93df1"
ARG DOCKER_VERSION="20.10.16"
ARG DOCKER_COMPOSE_VERSION="2.5.1"

RUN curl -fsSL "https://download.docker.com/linux/static/${DOCKER_CHANNEL}/x86_64/docker-${DOCKER_VERSION}.tgz" -o docker.tgz && \
    tar --strip-components 1 -C /usr/local/bin/ -xzf docker.tgz && \
    rm docker.tgz && \
    # set up subuid/subgid so that "--userns-remap=default" works out-of-the-box
    addgroup dockremap && \
    useradd -g dockremap dockremap && \
    echo 'dockremap:165536:65536' >> /etc/subuid && \
    echo 'dockremap:165536:65536' >> /etc/subgid && \
    curl -fsSL "https://raw.githubusercontent.com/docker/docker/${DIND_COMMIT}/hack/dind" -o /usr/local/bin/dind && \
    curl -fsSL https://github.com/docker/compose/releases/download/v${DOCKER_COMPOSE_VERSION}/docker-compose-linux-x86_64 -o /usr/local/bin/docker-compose && \
    chmod +x /usr/local/bin/dind /usr/local/bin/docker-compose && \
    addgroup docker && usermod -aG docker runner

VOLUME /var/lib/docker

# configure runner
USER runner

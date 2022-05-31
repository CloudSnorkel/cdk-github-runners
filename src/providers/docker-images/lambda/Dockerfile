FROM public.ecr.aws/lambda/nodejs:14-x86_64

WORKDIR /runner

# add dependencies
RUN yum update -y && yum install -y jq tar gzip bzip2 which binutils git zip unzip

# add awscli
RUN curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o awscliv2.zip && \
    unzip -q awscliv2.zip && ./aws/install && rm -rf awscliv2.zip aws

# add ghcli
RUN GHCLI_URL=`curl -fsSL https://api.github.com/repos/cli/cli/releases/latest | jq -r '.assets | map(select(.name | contains("linux_amd64.rpm"))) |.[0].browser_download_url'` && \
    curl -fsSL "${GHCLI_URL}" -o ghcli.rpm && yum install -y ghcli.rpm && rm -f ghcli.rpm

# add runner
ARG RUNNER_VERSION
RUN if [ "${RUNNER_VERSION}" = "latest" ]; then RUNNER_VERSION=`curl -fsSL https://api.github.com/repos/actions/runner/releases/latest | jq -r .tag_name | cut -c2-`; fi && \
    curl -fsSLO  "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz" && \
    tar xzf "actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz" && \
    rm -f actions-runner-linux-x64-*.tar.gz \
RUN ./bin/installdependencies.sh

# prepare for execution
WORKDIR ${LAMBDA_TASK_ROOT}
COPY runner.js runner.sh ${LAMBDA_TASK_ROOT}
CMD ["runner.handler"]

# https://docs.aws.amazon.com/lambda/latest/dg/images-create.html

ARG BASE_IMAGE="public.ecr.aws/lambda/nodejs:14-arm64"
FROM $BASE_IMAGE

WORKDIR /runner

# install extra certificates
COPY extra_certs/. /tmp/certs/
RUN if [ -f /tmp/certs/certs.pem ]; then cp /tmp/certs/certs.pem /etc/pki/ca-trust/source/anchors/ghe.crt; update-ca-trust; else echo no self-signed certificates; fi

# add dependencies
ARG EXTRA_PACKAGES=""
RUN yum update -y && yum install -y jq tar gzip bzip2 which binutils git zip unzip $EXTRA_PACKAGES

# add awscli
RUN curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o awscliv2.zip && \
    unzip -q awscliv2.zip && ./aws/install && rm -rf awscliv2.zip aws

# add ghcli
RUN curl -fsSSL https://cli.github.com/packages/rpm/gh-cli.repo -o /etc/yum.repos.d/gh-cli.repo && \
    yum install -y gh

# add runner without github's api which is rate limited
ARG RUNNER_VERSION=latest
RUN if [ "${RUNNER_VERSION}" = "latest" ]; then RUNNER_VERSION=`curl  -w "%{redirect_url}" -fsS https://github.com/actions/runner/releases/latest | grep -oE "[^/v]+$"`; fi && \
    curl -fsSLO  "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-arm64-${RUNNER_VERSION}.tar.gz" && \
    tar xzf "actions-runner-linux-arm64-${RUNNER_VERSION}.tar.gz" && \
    rm actions-runner-linux-arm64-${RUNNER_VERSION}.tar.gz && \
    yum install -y openssl-libs krb5-libs zlib libicu60
# doesn't work on CentOS - RUN ./bin/installdependencies.sh

# prepare for execution
WORKDIR ${LAMBDA_TASK_ROOT}
COPY runner.js runner.sh ${LAMBDA_TASK_ROOT}/
CMD ["runner.handler"]

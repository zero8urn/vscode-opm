FROM mcr.microsoft.com/devcontainers/typescript-node:1-22-bookworm


# Install Bun
RUN curl -fsSL https://bun.sh/install | bash

ENV PATH="/root/.bun/bin:${PATH}"

# Install curl and ca-certificates so the Bun installer can run.
RUN apt-get update && apt-get install -y git

WORKDIR /workspace

COPY package.json bun.lock ./
COPY scripts/ ./scripts

# RUN bun install

COPY . .
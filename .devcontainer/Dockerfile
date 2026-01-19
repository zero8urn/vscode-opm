FROM mcr.microsoft.com/devcontainers/typescript-node:1-22-bookworm


# Install Bun
RUN curl -fsSL https://bun.sh/install | bash

ENV PATH="/root/.bun/bin:${PATH}"

# Install .NET SDK 10.0 (LTS)
RUN wget https://packages.microsoft.com/config/debian/12/packages-microsoft-prod.deb -O packages-microsoft-prod.deb && \
  dpkg -i packages-microsoft-prod.deb && \
  rm packages-microsoft-prod.deb && \
  apt-get update && \
  apt-get install -y dotnet-sdk-10.0 && \
  rm -rf /var/lib/apt/lists/*

# Verify .NET installation
RUN dotnet --version && dotnet --list-sdks

# Install OpenCode CLI
RUN curl -fsSL https://opencode.ai/install | bash

# These libraries are required by @vscode/test-electron to run VS Code in headless mode
RUN apt-get update && apt-get install -y \
  git \
  libnss3 \
  libnspr4 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libpango-1.0-0 \
  libcairo2 \
  libasound2 \
  # Additional dependencies required by VS Code / Electron (headless/E2E)
  libgtk-3-0 \
  libxss1 \
  libx11-xcb1 \
  libxcb1 \
  libdbus-1-3 \
  libx11-6 \
  libxtst6 \
  && rm -rf /var/lib/apt/lists/*

# Pre-download VS Code stable for E2E tests to avoid download time in tests
RUN mkdir -p /opt/vscode-test && \
  VSCODE_VERSION=$(curl -sL https://update.code.visualstudio.com/api/releases/stable | grep -o '"[0-9.]*"' | head -n 1 | tr -d '"') && \
  echo "Downloading VS Code ${VSCODE_VERSION}..." && \
  curl -L "https://update.code.visualstudio.com/${VSCODE_VERSION}/linux-x64/stable" -o /tmp/vscode.tar.gz && \
  tar -xzf /tmp/vscode.tar.gz -C /opt/vscode-test && \
  rm /tmp/vscode.tar.gz && \
  echo "VS Code ${VSCODE_VERSION} installed to /opt/vscode-test"

ENV VSCODE_TEST_PATH=/opt/vscode-test/VSCode-linux-x64/code

WORKDIR /workspace

COPY package.json bun.lock ./
COPY scripts/ ./scripts

# RUN bun install

COPY . .
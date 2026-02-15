FROM node:20-bookworm

# Install system dependencies
RUN apt-get update && apt-get install -y \
  git \
  curl \
  build-essential \
  python3 \
  xz-utils \
  && rm -rf /var/lib/apt/lists/*

# Install Zig 0.15.2 (required for Gemra project)
RUN curl -L https://ziglang.org/download/0.15.2/zig-linux-x86_64-0.15.2.tar.xz | tar -xJ -C /usr/local && \
  ln -s /usr/local/zig-linux-x86_64-0.15.2/zig /usr/local/bin/zig

# Install claude-code-acp globally
RUN npm install -g claude-code-acp

# Set working directory
WORKDIR /workspace

# Default command (will be overridden by docker run)
CMD ["claude-code-acp"]

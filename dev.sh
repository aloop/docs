#!/usr/bin/env bash

set -euo pipefail

if [ ! -d "node_modules" ]; then
  echo "Installing npm packages..."
  npm install
else
  echo "Updating npm packages..."
  npm update
fi

hugo server --cleanDestinationDir --gc --noHTTPCache

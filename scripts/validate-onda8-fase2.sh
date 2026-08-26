#!/usr/bin/env bash
set -euo pipefail

node --conditions=react-server \
  --import ./scripts/register-typescript-test-loader.mjs \
  --test \
  app/lib/commercial-config/assisted-method-construction.test.mjs \
  app/lib/commercial-config/assisted-method-construction-architecture.test.mjs

npm run build

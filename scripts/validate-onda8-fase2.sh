#!/usr/bin/env bash
set -euo pipefail

npx eslint \
  app/admin/configuracao-comercial/AssistedMethodConstruction.tsx \
  app/admin/configuracao-comercial/CommercialConfigExperience.tsx \
  app/api/admin/commercial-method-builder/method/route.ts \
  app/lib/commercial-config/assisted-method-construction.ts \
  app/lib/commercial-config/assisted-method-construction.test.mjs \
  app/lib/commercial-config/assisted-method-construction-architecture.test.mjs \
  app/lib/server/commercial-method-construction.ts \
  app/types/commercial-method-construction.ts \
  supabase/phase-tests/phase-8-assisted-method-construction.test.mjs

npx tsc --noEmit

node --conditions=react-server \
  --import ./scripts/register-typescript-test-loader.mjs \
  --test \
  app/lib/commercial-config/assisted-method-construction.test.mjs \
  app/lib/commercial-config/assisted-method-construction-architecture.test.mjs

node --test supabase/phase-tests/phase-8-assisted-method-construction.test.mjs

npm run test:companion-commercial-method-v2-validation
npm run test:companion-commercial-config-admin

git diff --check 2e873b1780e0cac31132fa1fc901079c908bd3c8 HEAD

npm run build

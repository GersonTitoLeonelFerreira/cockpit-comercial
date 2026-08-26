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

npm run build

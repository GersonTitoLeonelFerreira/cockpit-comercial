#!/usr/bin/env bash
set -euo pipefail

echo '== ESLint =='
npx eslint \
  app/admin/configuracao-comercial/AssistedMethodConstruction.tsx \
  app/admin/configuracao-comercial/BuyerDecisionArchitecture.tsx \
  app/admin/configuracao-comercial/CommercialConfigExperience.tsx \
  app/api/admin/commercial-method-builder/method/route.ts \
  app/lib/commercial-config/assisted-method-construction.ts \
  app/lib/commercial-config/buyer-decision-architecture.ts \
  app/lib/server/commercial-method-construction.ts \
  app/types/commercial-method-construction.ts \
  app/types/commercial-method-buyer-decision.ts \
  scripts/typescript-test-loader.mjs \
  app/lib/commercial-config/assisted-method-construction.test.mjs \
  app/lib/commercial-config/assisted-method-construction-architecture.test.mjs \
  app/lib/commercial-config/buyer-decision-architecture.test.mjs \
  app/lib/server/commercial-method-construction.test.mjs \
  supabase/phase-tests/phase-8-assisted-method-construction.test.mjs

echo '== TypeScript =='
npx tsc --noEmit

echo '== Fase 2 functional + server persistence =='
node --conditions=react-server \
  --import ./scripts/register-typescript-test-loader.mjs \
  --test \
  app/lib/commercial-config/assisted-method-construction.test.mjs \
  app/lib/commercial-config/assisted-method-construction-architecture.test.mjs \
  app/lib/commercial-config/buyer-decision-architecture.test.mjs \
  app/lib/server/commercial-method-construction.test.mjs \
  app/lib/server/commercial-method-builder.test.mjs

echo '== PGlite Fase 1 + Fase 2 / RLS =='
node --test \
  supabase/phase-tests/phase-8-commercial-method-builder.test.mjs \
  supabase/phase-tests/phase-8-assisted-method-construction.test.mjs

echo '== commercial-method-v2 regression =='
npm run test:companion-commercial-method-v2-validation

echo '== commercial-config admin regression =='
npm run test:companion-commercial-config-admin

echo '== Next build =='
npm run build

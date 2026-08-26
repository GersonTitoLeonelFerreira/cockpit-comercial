#!/usr/bin/env bash
set -euo pipefail

python scripts/onda8-hotfix-builder-text-editing.py

git diff --check

echo '=== AUDIT KEYBOARD INTERCEPTION ==='
if grep -RInE 'keydown|keyup|keypress|onKeyDown|onKeyUp|preventDefault|stopPropagation' app/admin/configuracao-comercial; then
  echo 'Keyboard interception found in builder scope.' >&2
  exit 1
fi

echo '=== TEXT EDITING DOM REGRESSION ==='
node --conditions=react-server --import ./scripts/register-typescript-test-loader.mjs --test \
  app/admin/configuracao-comercial/commercial-method-builder-text-editing.test.mjs

echo '=== ONDA 8 SUITES ==='
node --conditions=react-server --import ./scripts/register-typescript-test-loader.mjs --test \
  app/lib/commercial-config/commercial-method-builder.test.mjs \
  app/lib/commercial-config/commercial-method-builder-architecture.test.mjs \
  app/lib/server/commercial-method-builder.test.mjs \
  app/lib/commercial-config/assisted-method-construction.test.mjs \
  app/lib/commercial-config/assisted-method-construction-architecture.test.mjs \
  app/lib/commercial-config/buyer-decision-architecture.test.mjs \
  app/lib/server/commercial-method-construction.test.mjs \
  supabase/phase-tests/phase-8-commercial-method-builder.test.mjs \
  supabase/phase-tests/phase-8-assisted-method-construction.test.mjs

echo '=== COMMERCIAL METHOD V2 REGRESSION ==='
npm run test:companion-commercial-method-v2-validation

echo '=== COMMERCIAL CONFIG ADMIN REGRESSION ==='
npm run test:companion-commercial-config-admin

echo '=== TYPESCRIPT ==='
npx tsc --noEmit

mkdir -p public/__onda8_hotfix_sources
cp app/admin/configuracao-comercial/CommercialMethodBuilder.tsx public/__onda8_hotfix_sources/CommercialMethodBuilder.txt
cp app/admin/configuracao-comercial/BuyerDecisionArchitecture.tsx public/__onda8_hotfix_sources/BuyerDecisionArchitecture.txt
cp app/admin/configuracao-comercial/AssistedMethodConstruction.tsx public/__onda8_hotfix_sources/AssistedMethodConstruction.txt
cp app/admin/configuracao-comercial/EditableLinesTextarea.tsx public/__onda8_hotfix_sources/EditableLinesTextarea.txt
cp app/admin/configuracao-comercial/commercial-method-builder-text-editing.test.mjs public/__onda8_hotfix_sources/commercial-method-builder-text-editing.test.txt
cp app/lib/commercial-config/text-editing.ts public/__onda8_hotfix_sources/text-editing.txt

echo '=== NEXT BUILD ==='
npx next build

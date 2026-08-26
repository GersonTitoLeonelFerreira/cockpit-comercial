#!/usr/bin/env bash
set -euo pipefail

python scripts/onda8-hotfix-builder-text-editing.py

git diff --check

mkdir -p public/__onda8_hotfix_sources
cp app/admin/configuracao-comercial/CommercialMethodBuilder.tsx public/__onda8_hotfix_sources/CommercialMethodBuilder.txt
cp app/admin/configuracao-comercial/BuyerDecisionArchitecture.tsx public/__onda8_hotfix_sources/BuyerDecisionArchitecture.txt
cp app/admin/configuracao-comercial/AssistedMethodConstruction.tsx public/__onda8_hotfix_sources/AssistedMethodConstruction.txt
cp app/admin/configuracao-comercial/EditableLinesTextarea.tsx public/__onda8_hotfix_sources/EditableLinesTextarea.txt
cp app/admin/configuracao-comercial/commercial-method-builder-text-editing.test.mjs public/__onda8_hotfix_sources/commercial-method-builder-text-editing.test.txt
cp app/lib/commercial-config/text-editing.ts public/__onda8_hotfix_sources/text-editing.txt

npx next build

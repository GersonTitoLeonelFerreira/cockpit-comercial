#!/usr/bin/env bash
set -euo pipefail

if grep -q "EditableLinesTextarea" app/admin/configuracao-comercial/CommercialMethodBuilder.tsx; then
  echo 'Hotfix já versionado; executando build normal.'
  npx next build
  exit 0
fi

python scripts/onda8-hotfix-builder-text-editing.py

git diff --check

git config user.name "Yolen Hotfix Bot"
git config user.email "hotfix@users.noreply.github.com"
git add \
  app/admin/configuracao-comercial/CommercialMethodBuilder.tsx \
  app/admin/configuracao-comercial/BuyerDecisionArchitecture.tsx \
  app/admin/configuracao-comercial/AssistedMethodConstruction.tsx \
  app/admin/configuracao-comercial/EditableLinesTextarea.tsx \
  app/admin/configuracao-comercial/commercial-method-builder-text-editing.test.mjs \
  app/lib/commercial-config/text-editing.ts

git commit -m "fix(commercial-method-builder): preserve text editing during autosave"
git push origin HEAD:claude/onda8-hotfix-builder-text-editing

npx next build

# PRODUCT UX-01–04 — EXECUTION

Date: 2026-09-27

## Scope

Package executed after the validated P0 baseline.

Base:

`c4fce189b95c7246b8054a1f32b7b9c5d5043d0b`

Branch:

`claude/companion-ux-01-04-post-p0`

Validated implementation HEAD before this execution note:

`8c8195bba57371f1dc934819579780f84bedcb28`

FNC-02 remains explicitly outside this package.

ManyChat remains disabled for normal/production use.

No merge, deploy or rollout was performed.

## UX-01 — seller-facing language

Goal: stop exposing internal taxonomy to sellers while preserving domain values, persistence, logs and contracts.

Implemented:

- seller-facing translation/suppression helper in the presentation layer;
- known technical tokens receive commercial copy;
- unknown enum-like tokens fall back to human copy instead of leaking raw values;
- internal technique-ranking rationale is no longer rendered to the seller;
- raw role/source fallbacks no longer expose internal identifiers;
- "Commercial Brain" seller-facing label replaced by commercial language.

No backend/domain enum was renamed.

## UX-02 — AGORA hierarchy

AGORA now follows the intended hierarchy:

1. decision;
2. next action;
3. short rationale.

Implemented:

- headline and next action are visually separated;
- reasoning contributes the concise "why this action" layer instead of duplicating another next move;
- technique/cautions remain available through progressive disclosure;
- secondary signals remain available under "Ver outros sinais";
- existing priority/provenance data remains intact.

The hidden lead-summary contract used by MENSAGEM was preserved.

## UX-03 — Yolen visual direction

Applied seller-facing visual direction based on the existing Yolen V2 foundation:

- dark cockpit-oriented background and surfaces;
- cold gray text hierarchy;
- blue reserved as the primary functional action/focus color;
- reduced administrative-dashboard weight in tabs/cards;
- clearer decision/action/rationale hierarchy;
- reduced-motion support.

Structural behavior was intentionally preserved:

- panel width/ownership;
- scrolling;
- focus;
- drafts;
- collapse/reopen shell lifecycle.

## UX-04 — ANÁLISE vs MENSAGEM ownership

ANÁLISE is now informational/operational, not a composer.

Removed from seller-facing ANÁLISE:

- insert suggested message;
- copy suggested message;
- legacy suggested-message preview.

MENSAGEM remains the only seller-facing owner of:

- message generation;
- copy;
- channel insertion.

The no-auto-send guardrail remains unchanged.

## Production files changed

- `app/extension/yolen-companion/src/companion-core.js`
- `app/extension/yolen-companion/src/companion-reasoning-view.js`
- `app/extension/yolen-companion/src/companion-seller-information-view.js`
- `app/extension/yolen-companion/src/styles.css`

## Test files changed

- `app/extension/yolen-companion/tests/companion-reasoning-view.test.mjs`
- `app/extension/yolen-companion/tests/companion-seller-information-view.test.mjs`
- `app/extension/yolen-companion/tests/e3-dom/core-neutral-channel-adapter.test.mjs`
- `app/extension/yolen-companion/tests/e3-dom/cross-channel-parity.test.mjs`
- `app/extension/yolen-companion/tests/e3-dom/manychat-shared-composition.test.mjs`
- `app/extension/yolen-companion/tests/e3-dom/suggested-message-insertion-conversation-race.test.mjs`

## Validation evidence

Large focal regression run on HEAD `7aa5a0462cb837f0092e25fc2b3a40106bf1121b`:

- 192 tests executed;
- 191 passed;
- 1 failed.

The only failure was the newly added ManyChat UX-04 ownership test. Investigation showed the fixture switched to MENSAGEM without providing the required lead summary, so the MENSAGEM intent field correctly never mounted.

No product code change was required.

Fixture-only correction:

`8c8195bba57371f1dc934819579780f84bedcb28`

Focused ManyChat rerun after the fixture correction:

- 26 tests;
- 26 passed;
- 0 failed.

This rerun also reconfirmed:

- FNC-01 ManyChat stale-resolve one-click path;
- MENSAGEM generate/copy/insert;
- no automatic send;
- UX-04 ownership boundary;
- A→B stale-analysis protection;
- audio and identity/cycle contracts.

The prior large run also passed the P0 regression coverage included in the command:

- FNC-01;
- FNC-03;
- FNC-04;
- MSG-01;
- cross-channel parity;
- neutral adapter composition;
- scroll stability;
- message selection/draft stability.

Because the final correction changed only test fixture data, not production code, no product behavior changed between the large run and the focused green rerun.

## Commits

- `e0f45a52b5339faf02ec2cb906984c8ab3622f0b` — simplify seller-facing decision hierarchy
- `fc7f6e8e3590df9ba94ad6cd09c6722dc39907dd` — keep analysis informational
- `c86ecde65d8ea22c921dab80105f49f2846f824a` — apply Yolen visual direction
- `422906e7828ff41b38ce0ca75b079f2a1f6e07dd` — lock UX-01/UX-02 contracts
- `b9c7570d2add67ec85034a76ec987ee6f0f6d535` — move composer contract tests to MENSAGEM
- `0dfe78b16f4cdd60609fbe9e0bf0c343855d228e` — move insertion-race coverage to MENSAGEM
- `5f593de70aaee409f536bacaf3e1577e43f7d060` — suppress technical tokens in reasoning cautions
- `7aa5a0462cb837f0092e25fc2b3a40106bf1121b` — align race fixture with adapter contract
- `8c8195bba57371f1dc934819579780f84bedcb28` — correct ManyChat UX-04 fixture summary

## Residual items / explicitly out of scope

- FNC-02 analysis reliability/performance remains open and separate.
- No backend, Supabase schema, migration, ledger, capture, reasoning-engine, queue or retry redesign was part of this package.
- Visual acceptance still requires live Firefox review of the built E2E extension.
- ManyChat must remain E2E-only until explicit rollout authorization.

## Current state

UX-01 through UX-04 are technically implemented with the focal contract/regression evidence above.

Next product step:

build the E2E Firefox extension and perform visual/live acceptance of the new seller-facing Companion before any merge decision.

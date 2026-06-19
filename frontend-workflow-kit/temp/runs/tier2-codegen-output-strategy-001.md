# Run report — Tier2 codegen output strategy

> **Status: IMPLEMENTATION — 2026-06-19.** This slice applies the human decision for OD-5/OD-6/OD-7 and tightens the advisory codegen generated-file guard. It remains intentionally small: no new `api_generated` role, no endpoint/file-level artifact explosion, no validate/readiness/nav-graph adapter consumption, no CI, no hard gate, no required check, and no `--enforce` promotion.

## Decisions Applied

| Decision | Applied Contract |
|---|---|
| OD-5 | Do not add `api_generated`; generated API clients/hooks stay on existing `roles.api_client` and `roles.hook`. |
| OD-6 | Represent codegen as one artifact with `outputs[]`, not one artifact per endpoint or file. |
| OD-7 | Keep hook output domain-scoped: `src/features/{domain}/hooks/**`. |
| Ownership | A stale candidate is generated-owned only when it is both manifest-listed and has a GENERATED marker/header. |
| Boundary | `validate`, `readiness`, and `nav-graph` do not directly consume the codegen adapter. Cross-checks stay warning-only future work. |

## Implemented

| Area | Files | Scope |
|---|---|---|
| Manifest | `catalog/artifact-manifest.yaml` | Added `codegen-openapi-client` with codegen-only `outputs[]` for TS client and domain hook outputs. Existing single-`path` generated artifacts are unchanged. |
| Guard | `scripts/lib/check-generated-files.mjs`, `scripts/check-generated-files.mjs` | The focused `codegen-openapi-client` target now uses codegen-core expected outputs plus manifest-listed output patterns. Stale detection only considers generated-owned files. |
| Validate header compatibility | `scripts/validate.mjs` | Check 6 accepts both `GENERATED FILE — DO NOT EDIT` and TS ASCII `GENERATED FILE - DO NOT EDIT`, and treats `outputs[]` globs as generated-owned only when a generated header/marker is present. |
| Tests | `scripts/lib/check-generated-files.test.mjs`, `scripts/lib/api-manifest.test.mjs` | Added focused coverage for manifest-listed outputs, generated-owned stale detection, hand-written hook non-ownership, and TS generated header compatibility. |
| Docs | `temp/proposals/tier2-router-codegen-adapter.md`, `roadmap-current.md`, `temp/runs/tier2-codegen-generated-file-guard-001.md` | Reflected OD-5/OD-6/OD-7 resolution and remaining follow-ups. |

## Intentionally Not Done

- No custom codegen adapter dogfood fixture.
- No warning-only route/codegen/nav cross-check implementation.
- No CI workflow, required check, hard gate, or `--enforce` promotion.
- No new role or preset change.
- No endpoint/file-level artifact proliferation.

## Verification

```bash
node --test scripts/lib/codegen-core.test.mjs scripts/lib/check-generated-files.test.mjs scripts/lib/api-manifest.test.mjs
```

Result: PASS — 54 tests.

```bash
npm test
```

Result: PASS — `test-fixtures` 27 fixtures (26 pass, 1 xfail) and `node:test` 115 pass.

## Remaining Follow-up

- Custom codegen adapter dogfood.
- Separate warning-only cross-check tool/follow-up PR if route/codegen/docs drift detection is needed.
- CI promotion decision after evidence, with explicit human approval.

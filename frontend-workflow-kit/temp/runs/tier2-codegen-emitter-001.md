# Run report — Tier2 codegen emitter first real output slice

> **Status: IMPLEMENTATION.** This slice extends the existing `codegen-core` + `openapi-client` discovery seam with deterministic TypeScript client/hook rendering. It keeps the same boundary: adapter discovers normalized operations; core owns sorting, naming, rendering, file paths, and advisory write/check helpers.

## Implemented

| Area | Files | Scope |
|---|---|---|
| Core emitter | `scripts/lib/codegen-core.mjs` | Added `renderCodegenClientFile`, `renderCodegenHookFile`, `renderCodegenFiles`, `checkCodegenFiles`, and `writeCodegenFiles`. Output is LF-only, no timestamp, no absolute local path, and derives content from `operationId`, `path`, `method`, `domain`, `hookName`, `clientOut`, and `hookOut`. |
| Golden output | `examples/codegen-adapter/openapi-client/src/api/generated/*.client.ts`, `examples/codegen-adapter/openapi-client/src/features/coupons/hooks/*.ts` | Added first generated TypeScript client/hook fixture files for the OpenAPI coupon fixture. |
| Tests | `scripts/lib/codegen-core.test.mjs` | Added repeated render byte-identity, fixture golden comparison, advisory check-mode verification, LF-only assertion, and emitter fail-closed coverage for unsupported path parameter syntax. |
| Fixture docs | `examples/codegen-adapter/openapi-client/README.md` | Updated fixture description from manifest-only to manifest plus generated TS golden files. |
| Roadmap | `roadmap-current.md` | Marked this real emitter slice complete while keeping generated guard, custom adapter dogfood, OD-5/OD-6/OD-7, validate/nav-graph relation, and hard-gate promotion as remaining work. |

## Intentionally Not Done

- No CI workflow changes.
- No required check or hard gate.
- No `validate`, `readiness`, or `nav-graph` direct consumption of codegen output.
- No `catalog/artifact-manifest.yaml` status promotion.
- No generated-file guard registration.
- No OD-5, OD-6, or OD-7 resolution.
- No lint-pack, Interaction Matrix, Work Packet, or other roadmap candidate work.
- No adapter-owned rendering, sorting, file naming, or writes.

## Verification

```bash
node --test scripts/lib/codegen-core.test.mjs
```

Result: PASS — 21 tests.

```bash
npm test
```

Result: PASS — `test-fixtures` 27 fixtures (26 pass, 1 xfail) and `node:test` 112 pass.

## Remaining Follow-up

- Generated-file guard `V1_REPRODUCE` contract for codegen outputs.
- Custom codegen adapter dogfood fixture.
- OD-5 dedicated `api_generated` role decision.
- OD-6 output granularity decision.
- OD-7 hook output scope decision.
- Optional CLI/check-mode integration, still warning/advisory first.

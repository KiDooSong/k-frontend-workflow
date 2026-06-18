# Run report — Tier2 codegen generated-file guard advisory alignment

> **Status: IMPLEMENTATION — 2026-06-19.** This slice connects the real `openapi-client` codegen fixture outputs from the emitter slice to the advisory `check-generated-files` reproduce/check flow. It stays focused: no CI, no hard gate, no `--enforce`, no validate/readiness/nav-graph consumption, and no Open Decision resolution.

## Implemented

| Area | Files | Scope |
|---|---|---|
| Guard target | `scripts/lib/check-generated-files.mjs`, `scripts/check-generated-files.mjs` | Added focused advisory target `codegen-openapi-client`. It is available through `--artifact codegen-openapi-client` and is not part of the default manifest-driven target set. |
| Codegen reproduce/check | `scripts/lib/check-generated-files.mjs` | Reuses `openapi-client` discovery plus `codegen-core` `renderCodegenFiles` and `checkCodegenFiles` to verify the committed fixture client/hook outputs. Checks include discovery, two-render determinism, stable file ordering, content mismatch, and missing output reporting. |
| Tests | `scripts/lib/check-generated-files.test.mjs` | Added focused coverage for selected target discovery without manifest registration, stable six-file output ordering, tamper mismatch detection, and missing generated output detection. |
| Roadmap | `roadmap-current.md` | Marked the guard advisory alignment slice complete while keeping hard gate/CI/manifest promotion and OD-5/OD-6/OD-7 as remaining work. |

## Intentionally Not Done

- No CI workflow changes.
- No required check or hard gate.
- No `--enforce` implementation or promotion.
- No package-script/template alias promotion.
- No `catalog/artifact-manifest.yaml` registration for codegen outputs.
- No validate/readiness/nav-graph direct consumption of codegen outputs.
- No custom codegen adapter dogfood fixture.
- No OD-5, OD-6, or OD-7 resolution.
- No lint-pack, Interaction Matrix, Work Packet, or other roadmap candidate work.

## Manifest / Decision Status

This slice does **not** register codegen outputs in `artifact-manifest.yaml`.

Reason: the current manifest contract is built around a single `path` field, while the landed codegen fixture has multiple generated files across client and hook roots. A general manifest representation would need to decide whether codegen uses a dedicated `api_generated` role, how output granularity is represented, and whether hook outputs are domain-scoped or global. Those are OD-5, OD-6, and OD-7 decision surfaces, so this PR leaves them open and records the focused target as an advisory fixture-only contract.

## Verification

```bash
node --test scripts/lib/codegen-core.test.mjs scripts/lib/check-generated-files.test.mjs
```

Result: PASS — 41 tests.

```bash
node scripts/check-generated-files.mjs --artifact codegen-openapi-client --src examples/codegen-adapter/openapi-client/src --json
```

Result: PASS — `ok: true`; `codegen-openapi-client` reproduced 6 committed outputs in stable order:

- `src/api/generated/getCoupon.client.ts`
- `src/api/generated/listCoupons.client.ts`
- `src/api/generated/redeemCoupon.client.ts`
- `src/features/coupons/hooks/useGetCouponQuery.ts`
- `src/features/coupons/hooks/useListCouponsQuery.ts`
- `src/features/coupons/hooks/useRedeemCouponMutation.ts`

```bash
npm test
```

Result: PASS — `test-fixtures` 27 fixtures (26 pass, 1 xfail) and `node:test` 113 pass.

```bash
git diff --check
```

Result: PASS — no whitespace errors.

## Remaining Follow-up

- Decide OD-5 (`api_generated` role or existing `api_client`/`hook` roles for guard surface).
- Decide OD-6 (general codegen output granularity/manifest expression).
- Decide OD-7 (domain-scoped vs global hook output scope).
- Add custom codegen adapter dogfood after the core and advisory fixture path have settled.
- Consider any warning-first CI/check promotion only after separate evidence and human decision.

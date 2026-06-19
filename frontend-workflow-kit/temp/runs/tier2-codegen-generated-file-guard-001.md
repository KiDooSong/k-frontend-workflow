# Run report — Tier2 codegen generated-file guard advisory alignment

> **Status: IMPLEMENTATION — 2026-06-19.** This slice connects the real `openapi-client` codegen fixture outputs from the emitter slice to the advisory `check-generated-files` reproduce/check flow. It stays focused: no CI, no hard gate, no `--enforce`, no validate/readiness/nav-graph consumption, and no Open Decision resolution.
> **Update — 2026-06-19:** A follow-up output strategy slice resolved OD-5/OD-6/OD-7 by human decision and supersedes the earlier "manifest not registered / OD unresolved" notes below. Codegen now has a single manifest artifact with `outputs[]`; it still remains focused advisory only, with no CI/hard gate/`--enforce` promotion and no validate/readiness/nav-graph adapter consumption.

## Implemented

| Area | Files | Scope |
|---|---|---|
| Guard target | `scripts/lib/check-generated-files.mjs`, `scripts/check-generated-files.mjs` | Added focused advisory target `codegen-openapi-client`. It is available through `--artifact codegen-openapi-client` and is not part of the default manifest-driven target set. |
| Codegen reproduce/check | `scripts/lib/check-generated-files.mjs` | Reuses `openapi-client` discovery plus `codegen-core` `renderCodegenFiles` and `checkCodegenFiles` to verify the committed fixture client/hook outputs. Checks include discovery, two-render determinism, stable file ordering, content mismatch, missing output reporting, and stale extra output detection under the focused target roots. |
| Tests | `scripts/lib/check-generated-files.test.mjs` | Added focused coverage for selected target discovery without manifest registration, stable six-file output ordering, tamper mismatch detection, missing generated output detection, stale extra client detection, and stale extra hook detection. |
| Roadmap | `roadmap-current.md` | Marked the guard advisory alignment slice complete while keeping hard gate/CI/manifest promotion and OD-5/OD-6/OD-7 as remaining work. |

## Follow-up Update — Output Strategy (2026-06-19)

| Area | Files | Scope |
|---|---|---|
| Manifest expression | `catalog/artifact-manifest.yaml` | Added `codegen-openapi-client` as one generated artifact with codegen-only `outputs[]` for `src/api/generated/*.client.ts` and `src/features/{domain}/hooks/*.ts`. Existing single-`path` artifacts are unchanged. |
| Ownership / stale detection | `scripts/lib/check-generated-files.mjs`, `scripts/check-generated-files.mjs` | Stale detection now uses codegen-core expected outputs plus manifest-listed output patterns, and only treats files as generated-owned when they match those patterns and carry a GENERATED header/marker. Hand-written hooks under the same path pattern are not stale. |
| Validate header compatibility | `scripts/validate.mjs`, `scripts/lib/api-manifest.test.mjs` | Check 6 accepts both whole-file header spellings used in the kit (`GENERATED FILE — DO NOT EDIT` and TS ASCII `GENERATED FILE - DO NOT EDIT`) without loading or coupling to the codegen adapter. |
| Tests | `scripts/lib/check-generated-files.test.mjs`, `scripts/lib/api-manifest.test.mjs` | Added coverage for manifest-listed outputs, generated-owned stale files, hand-written hook non-ownership, and TS header compatibility. |

## Intentionally Not Done

- No CI workflow changes.
- No required check or hard gate.
- No `--enforce` implementation or promotion.
- No package-script/template alias promotion.
- No endpoint/file-level artifact explosion; codegen remains one artifact with `outputs[]`.
- No validate/readiness/nav-graph direct consumption of the codegen adapter.
- No custom codegen adapter dogfood fixture.
- No new `api_generated` role.
- No lint-pack, Interaction Matrix, Work Packet, or other roadmap candidate work.

## Manifest / Decision Status

Superseded by the 2026-06-19 output strategy update:

- **OD-5 resolved:** no new `api_generated` role; use existing `roles.api_client` and `roles.hook`.
- **OD-6 resolved:** no endpoint/file-level artifact explosion; one codegen artifact expresses multiple outputs through `outputs[]`.
- **OD-7 resolved:** hook output remains domain-scoped at `src/features/{domain}/hooks/**`.
- **Ownership rule:** generated-owned = manifest-listed outputs + GENERATED marker/header. This prevents hand-written hooks from being reported as stale.
- **Boundary rule:** validate/readiness/nav-graph do not consume the codegen adapter. Any cross-check remains warning-only future work.

## Verification

```bash
node --test scripts/lib/codegen-core.test.mjs scripts/lib/check-generated-files.test.mjs
```

Result: PASS — 43 tests.

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

- Add custom codegen adapter dogfood after the core and advisory fixture path have settled.
- Design any validate/nav-graph/codegen cross-check as a separate warning-only tool or follow-up PR.
- Decide CI/required check/hard gate/`--enforce` promotion only after separate evidence and human decision.

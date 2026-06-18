# codegen-adapter/openapi-client fixture

Minimal Tier2 codegen adapter fixture.

- Input: `src/api/schemas/openapi.json`
- Adapter: `scripts/adapters/codegens/openapi-client.mjs`
- Core golden: `expected/codegen-manifest.txt`
- Generated client golden: `src/api/generated/*.client.ts`
- Generated hook golden: `src/features/coupons/hooks/*.ts`

The golden set is deterministic and warning/advisory only. This slice does not register a new artifact axis and does not promote any readiness/validate/CI hard gate.

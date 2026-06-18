# codegen-adapter/openapi-client fixture

Minimal Tier2 codegen adapter fixture.

- Input: `src/api/schemas/openapi.json`
- Adapter: `scripts/adapters/codegens/openapi-client.mjs`
- Core golden: `expected/codegen-manifest.txt`

The golden is a deterministic candidate manifest only. This slice does not generate TypeScript client or hook files, does not register a new artifact axis, and does not promote any readiness/validate/CI hard gate.

# Lint Policy Catalog

Consumer reference for the workflow lint-pack policy IDs, defaults, and weakening rules.

Canonical policy file: `docs/frontend-workflow/_meta/lint-policy.yaml`.
Template: `templates/meta/lint-policy.template.yaml`.
Schema: `schemas/lint-policy.schema.json`.
Generated output: repo-root `eslint.workflow.config.mjs`.

## Policies

| Policy ID | Tier | Default severity | Default rollout | Default implementation | Contract |
|---|---|---:|---|---|---|
| `layer-boundaries` | architecture | `error` | `all` | `auto` | Screens, API, and shared UI imports follow documented architecture paths. |
| `no-fetch-in-screens` | safety | `error` | `all` | `auto` | Screens do not call raw network clients directly; approved API/query/state layers own data access. |
| `no-adhoc-buttons` | style | `warn` | `all` | `auto` | Product screens prefer catalogued UI button/pressable components over local one-off controls. |
| `no-arbitrary-style-values` | style | `warn` | `all` | `auto` | Screens avoid arbitrary inline style values when a local token/component convention exists. |

## Weakening Rules

- Disabled policies require `reason`.
- Severity below the catalog default requires `reason`.
- `rollout: ratchet` requires `reason` and `baseline`.
- Safety policy disable/downgrade requires both `reason` and a human-owned `decision_id`. Agents must not resolve or close that decision.
- Existing ESLint/Biome/Prettier config remains project-owned; generated workflow config is an appendable fragment, not a replacement.

# Lint Policy Catalog

> MVP-B lint-pack policy catalog. PR-1 added the schema/template/docs contract;
> PR-2 adds a deterministic `lint-gen.mjs` skeleton; PR-3 adds the
> `skills/adapt-lint-pack` brownfield scan/propose workflow. `lint-baseline.mjs`,
> generated-file guard promotion, and CI wiring remain future work.

Canonical policy path: `docs/frontend-workflow/_meta/lint-policy.yaml`.
Template: `templates/meta/lint-policy.template.yaml`.
Schema: `schemas/lint-policy.schema.json`.
Generated output: repo-root `eslint.workflow.config.mjs`.

`lint-policy.yaml` is the human-approved project policy source. The catalog owns
policy identity, tier, and defaults; project policy files must not redefine a
policy's `tier`. Existing ESLint/Biome/Prettier configuration remains project
owned. PR-2 `lint-gen.mjs` emits a flat-config fragment to append after the
project's existing ESLint flat config; it does not configure parser or
`languageOptions` and must not overwrite or reorder existing project config.
PR-3 `adapt-lint-pack` keeps brownfield adoption as a proposal workflow:
scan -> map -> diff -> rollout -> propose, then wait for human approval before
any generation.

The schema v1 `implementation` enum preserves future vocabulary
(`eslint-boundaries`, `dep-cruiser`, `eslint-restricted-imports`), but the PR-2
generator's operational subset is fail-closed `implementation: auto` only.

`defaults.paths` and include/exclude globs are **project-relative**: absolute
paths and parent-directory (`..`) escapes are rejected, and `defaults.paths`
accepts simple `*` segments only (no `**`). Monorepo/cross-package layouts that
would need to reach outside the project root are out of scope for PR-2.

## Policy Table

| Policy ID | Tier | Default severity | Default rollout | Default implementation | Contract |
|---|---|---:|---|---|---|
| `layer-boundaries` | architecture | `error` | `all` | `auto` | Screens, API, and shared UI imports follow documented architecture paths. Project-specific path tuning belongs in `defaults.paths` or include/exclude globs, not in ad hoc generated ESLint edits. |
| `no-fetch-in-screens` | safety | `error` | `all` | `auto` | Screen components do not call raw network clients such as `fetch`/`axios` directly. Data access goes through approved API/query/state layers so loading, errors, auth, and test seams stay centralized. |
| `no-adhoc-buttons` | style | `warn` | `all` | `auto` | Product screens prefer catalogued UI button/pressable components over local one-off controls. Local convention can opt out with a reason. |
| `no-arbitrary-style-values` | style | `warn` | `all` | `auto` | Screens avoid arbitrary inline colors, spacing, radii, and typography values when a local token/component convention exists. This policy must not invent a design system where none exists. |

## Weakening Rules

- Disabled policies require `reason`.
- Severity below the catalog default requires `reason`.
- Non-default rollout (`ratchet`) requires `reason`.
- `baseline` is required only for `rollout: ratchet` and must not be present for
  `rollout: all`.
- Safety policy disable/downgrade requires both `reason` and a human-owned
  `decision_id` reference. The decision reference records approval; this docs
  slice does not resolve or close the decision.
- `new-code-only` is reserved. It is intentionally absent from the v1 schema
  rollout enum until its Open Decision defines changed-code semantics.

## Generated Banner

`eslint.workflow.config.mjs` is emitted as a repo-root generated file with a JS
banner equivalent to:

```js
// GENERATED FILE — DO NOT EDIT. Source: docs/frontend-workflow/_meta/lint-policy.yaml. Regenerate with npm run workflow:lint-gen.
```

PR-2 emits this banner, plus fragment/parser ownership comments. Generated-file
guards still do not require this root artifact until a separate guard promotion
slice handles repo-root path resolution.

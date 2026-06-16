# Lint Policy Catalog

> MVP-B lint-pack PR-1 catalog. This is schema/template/policy documentation only:
> no `lint-gen.mjs`, no `lint-baseline.mjs`, no package script, no CI wiring, and
> no generated `eslint.workflow.config.mjs`.

Canonical policy path: `docs/frontend-workflow/_meta/lint-policy.yaml`.
Template: `templates/meta/lint-policy.template.yaml`.
Schema: `schemas/lint-policy.schema.json`.
Future generated output: repo-root `eslint.workflow.config.mjs`.

`lint-policy.yaml` is the human-approved project policy source. The catalog owns
policy identity, tier, and defaults; project policy files must not redefine a
policy's `tier`. Existing ESLint/Biome/Prettier configuration remains project
owned. A future generator may compose after existing project config, but it must
not overwrite or reorder it.

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

## Future Generated Banner

When `lint-gen.mjs` exists, `eslint.workflow.config.mjs` must be emitted as a
repo-root generated file with a JS banner equivalent to:

```js
// GENERATED FILE — DO NOT EDIT. Source: docs/frontend-workflow/_meta/lint-policy.yaml. Regenerate with npm run workflow:lint-gen.
```

PR-1 defines this wording as documentation only. It does not create the generated
file or make generated-file guards require it.

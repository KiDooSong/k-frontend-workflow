# Lint Policy Rollout And Ratchet

Consumer reference for adopting lint-pack in greenfield and brownfield repositories.

## Flow

```txt
docs/frontend-workflow/_meta/lint-policy.yaml
  -> workflow:lint-gen
  -> eslint.workflow.config.mjs

docs/frontend-workflow/_meta/lint-policy.yaml
  + docs/frontend-workflow/_meta/lint-counts.json
  -> workflow:lint-baseline
  -> ratchet report
```

## Rollout Modes

| Rollout | Baseline | Intended use |
|---|---|---|
| `all` | forbidden | Run the policy across the project immediately. |
| `ratchet` | required non-negative integer | Brownfield mode that prevents accepted violation counts from increasing. |

`new-code-only` is reserved and is not a v1 rollout mode.

## Ratchet Semantics

- `current <= baseline`: pass.
- `current > baseline`: ratchet increase; reported by default and an error only with `--enforce`.
- `current < baseline`: improvement; lowering the committed baseline is a separate review decision.
- Missing baseline on `rollout: ratchet` is invalid.
- Baseline on `rollout: all` is invalid.

## Adoption Procedure

Use `skills/adapt-lint-pack` before generation in brownfield projects. It scans current lint tools, maps workflow paths, compares catalog policies, measures candidate counts report-only, proposes rollout, and waits for human approval. It must not run `lint-gen`, mutate existing lint config, wire CI, or promote hard gates before approval.

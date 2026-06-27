# Generated Views Test Fixtures 001

> Date: 2026-06-14
> Task: Register MVP-C Phase 1 generated views in the existing `test-fixtures` golden harness.
> CI posture: warning-first only; no new hard gate, no package script change, no workflow change.

## 1. Fixture kinds added

Added two fixture kinds to `scripts/test-fixtures.mjs`:

- `route-tree`
- `nav-graph`

Both kinds are driven by case-local `run-metadata.json` files under `examples/route-tree/**` and `examples/nav-graph/**`.

## 2. route-tree cases covered

| Case | Input | Expected |
|---|---|---|
| `route-tree:basic-app` | `examples/route-tree/basic-app/src/app` | `examples/route-tree/basic-app/expected/route-tree.txt` |
| `route-tree:edge-cases` | `examples/route-tree/edge-cases/src/app` | `examples/route-tree/edge-cases/expected/route-tree.txt` |

Coverage points:

- Expo Router `src/app` file-tree source of truth.
- `_layout` files included as tree nodes but not route leaves.
- `index` route derivation.
- route groups such as `(tabs)`.
- dynamic segments such as `[id]`.

## 3. nav-graph cases covered

| Case | Input | Expected |
|---|---|---|
| `nav-graph:basic-flow` | `examples/nav-graph/basic-flow/docs/frontend-workflow` | `examples/nav-graph/basic-flow/expected/nav-graph.yaml` |
| `nav-graph:stub-destination` | `examples/nav-graph/stub-destination/docs/frontend-workflow` | `examples/nav-graph/stub-destination/expected/nav-graph.yaml` |

Coverage points:

- Movement edges come only from the source screen's `## Interaction Matrix` `Result` column.
- `app/navigation-map.md` seeds known routes but does not create movement edges.
- inbound route index is generated from outbound route edges.
- stub destination screens can receive inbound edges without producing outbound edges.

## 4. Comparison strategy

- The harness runs each generated-view CLI twice into temporary files.
- It checks both executions exit `0`.
- It checks both output files are created.
- It checks run 1 and run 2 match after CRLF and path separator normalization.
- It compares generated output to committed `expected/*` text after the same CRLF/path separator normalization.
- It does **not** normalize timestamps or dates. These outputs are expected to be deterministic and timestamp-free.
- `nav-graph` uses YAML text comparison rather than parsed object comparison so ordering drift remains visible.

## 5. Commands run

Target validation commands for the PR branch:

```bash
npm test
npm run example:test
npm run example:state
npm run example:readiness
npm run example:validate
npm run workflow:route-tree -- --app examples/route-tree/basic-app/src/app --out /tmp/route-tree.txt
npm run workflow:nav-graph -- --docs examples/nav-graph/basic-flow/docs/frontend-workflow --out /tmp/nav-graph.yaml
```

This report records the intended validation matrix for the patch. In this handoff environment, the full repository could not be cloned and `npm` dependencies could not be installed, so these commands were not executed here.

## 6. Pass/fail matrix

| Check | Expected |
|---|---|
| `route-tree:basic-app` | pass |
| `route-tree:edge-cases` | pass |
| `nav-graph:basic-flow` | pass |
| `nav-graph:stub-destination` | pass |
| existing reconcile fixtures | unchanged; strict xfail witness remains xfail for the intended reason |
| existing integrity fixtures | unchanged |
| existing pipeline fixtures | unchanged |
| existing path-backstop fixtures | unchanged |

Expected `example:test` summary changes from the prior MVP-C integration baseline of `21 fixtures: 20 pass, 1 xfail` to `25 fixtures: 24 pass, 1 xfail`.

## 7. CI posture

CI remains warning-first:

- `.github/workflows/frontend-workflow-kit.yml` is unchanged.
- `package.json` scripts are unchanged.
- The existing `golden fixture regression (warning-only)` step still runs `npm run example:test` with `continue-on-error: true`.
- No hard gate promotion.

## 8. Known limitations

- This adds harness coverage only. It does not add a generated-file direct-edit guard.
- It does not promote generated-view checks to hard CI.
- It does not implement component-catalog generation.
- It does not structure the Interaction Matrix `Result` column.
- route-tree expected outputs already reflect the header follow-up direct CLI command: `# Command: node scripts/route-tree.mjs --app src/app --out docs/frontend-workflow/_meta/route-tree.txt`; no expected-file edits are needed in this fixture-registration PR.

## 9. Next recommended task

Next: review and merge this warning-first fixture registration. After that, use a small docs-only PR to update README/roadmap/CHANGELOG if the fixture registration changes the stated MVP-C status or fixture counts.

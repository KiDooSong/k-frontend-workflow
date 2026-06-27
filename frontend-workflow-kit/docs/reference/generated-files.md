# Generated Files

Files marked `generated/do_not_edit` are command output. Do not hand-edit them. Update the source of truth, then run the owning command.

This is the regeneration map for **Stage 07** ([workflow-stages/07-regenerate-derived-views.md](workflow-stages/07-regenerate-derived-views.md)) in the [workflow spine](workflow-spine.md).

Generated files can become stale when their source docs, registers, layout, policy, or code changes. Use the table below to choose the regeneration command, and use `workflow:check-generated` as an advisory drift guard when it is available in the consumer repo.

## Regeneration Map

| Generated file or output | Regenerate with | Source inputs | When to regenerate |
|---|---|---|---|
| `docs/frontend-workflow/_meta/workflow-state.yaml` | `npm run workflow:state` | ScreenSpec frontmatter and parsed body sections | ScreenSpec status, Unknowns, Copy Keys, API Candidates, route/screen entries, or source presence facts change |
| `docs/frontend-workflow/_meta/screen-inventory.yaml` | `npm run workflow:state` | ScreenSpec frontmatter | Screen IDs, domains, routes, route entries, screen entries, or status change |
| `docs/frontend-workflow/_meta/layer-inventory.yaml` | `npm run workflow:state` when layer telemetry is declared | `project-layout.yaml` layer telemetry plus source tree scan | Tier3/custom layer declarations or source layout change |
| `docs/frontend-workflow/design/component-catalog.md` | `npm run workflow:catalog` | `{roles.ui_primitive}` source files, or the default UI primitive root | Shared/common UI primitive files are added, removed, renamed, or exported differently |
| `docs/frontend-workflow/_meta/route-tree.txt` | `npm run workflow:route-tree` | `{roles.route_entry}` route file tree | Route files are added, removed, renamed, or moved |
| `docs/frontend-workflow/_meta/nav-graph.yaml` | `npm run workflow:nav-graph` | ScreenSpec Interaction Matrix sections and `app/navigation-map.md` Cross-Domain Edges | Navigation edges, route targets, ScreenSpec interaction rows, or navigation map edges change |
| ScreenSpec generated blocks, such as `<!-- GENERATED:START nav-graph -->` | Owning generator, currently `npm run workflow:nav-graph` | Same generator inputs as the owning block | The generator source changes or the generated block is stale |
| Policy draft outputs | `npm run workflow:policy-draft -- --out <review-output-dir>` | `project-layout.yaml` and implementation-mode policy | Layout/policy migration review is requested. Draft output does not replace live policy |
| `eslint.workflow.config.mjs` when present | `npm run workflow:lint-gen` | `docs/frontend-workflow/_meta/lint-policy.yaml` | Lint policy changes or generated lint config drifts |
| Codegen outputs when present | The repo's actual codegen command | API schema role, OpenAPI/manual schema evidence, and codegen adapter inputs | API schemas or codegen adapter inputs change |

## Advisory Guard

`workflow:check-generated` is warning-first. It regenerates supported targets in scratch space and reports drift without overwriting committed files or failing the command for mismatches. Configuration errors can still fail because they mean the guard cannot run correctly.

Default v1 targets:

- `route-tree`
- `nav-graph`
- `component-catalog`

Focused target:

- `codegen-openapi-client`

Use `npm run workflow:check-generated -- --artifact codegen-openapi-client --src <src>` only as an advisory drift check for codegen outputs. It does not update committed codegen files.

Do not wire this command as a hard CI gate or rely on `--enforce` unless a separate human decision and implementation make that behavior explicit.

## Source Of Truth

Generated files are derived views. The source of truth is the authoring surface:

- ScreenSpec, Navigation Map, Domain Rules, API manifest, Reconciliation Register, Open Decisions, Unknowns, Conflicts, and component-gap-register for workflow docs.
- `project-layout.yaml` and implementation-mode policy for layout/policy signals.
- Source files under the relevant role roots for route-tree, component-catalog, lint, and codegen outputs.

When a source changes, regenerate the matching view before finishing the task and report which generated files were refreshed.

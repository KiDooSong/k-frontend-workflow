# Task Artifact Matrix

Consumer repo agents use this matrix to answer: "When I do X, what else must I update, regenerate, or check?"

This reference complements the root `AGENTS.md` or `CLAUDE.md`. The root guide tells an agent where to start; `global/llm-rules.md` defines project policy; this matrix lists operational follow-up by task; `generated-files.md` maps `generated/do_not_edit` files to regeneration commands.

If ScreenSpec frontmatter or parsed body sections changed, run `workflow:state` before readiness/validate. This includes route/screen mapping, Unknowns, API Candidates, Copy Keys, and status changes.

## Matrix

| Task | Read first | May update | Must run or check | Do not |
|---|---|---|---|---|
| Implement or edit a screen | ScreenSpec, readiness output, component catalog, domain rules, navigation map, and `figma-component-mapping.md` for visual work | Only readiness `allowed_paths`; ScreenSpec only if task scope includes authoring | `workflow:state`, `workflow:readiness -- --screen <SCREEN_ID> --json`, `workflow:validate` | Edit generated files; resolve Open Decisions; edit `forbidden_paths` |
| Create or modify a shared/common component | Component catalog, component-gap-register, `roles.ui_primitive` layout | Component code only when approved/cataloged and allowed by readiness; otherwise a component-gap proposal | If approved code lands under `roles.ui_primitive`, run `workflow:catalog`; optionally run `workflow:check-generated` | Silently introduce uncataloged shared components; hand-edit `component-catalog.md` |
| Use an existing catalog component | Component catalog and ScreenSpec visual/component guidance | Allowed implementation files | If catalog appears stale, run `workflow:catalog` or report stale catalog | Invent missing catalog entries; bypass component-gap-register |
| Add or modify a route entry | Navigation map, ScreenSpec route fields, route-tree, nav-graph | Route file only when readiness allows; ScreenSpec/frontmatter or mapping docs when route/screen mapping changes | If ScreenSpec route/frontmatter changed, run `workflow:state`; run `workflow:route-tree`; `workflow:nav-graph`; `workflow:route-cross-check` where applicable; `workflow:validate` | Assume route file path and screen file path must match |
| Add or modify API integration | ScreenSpec API Candidates, API manifest, linked schema or contract evidence | API manifest, contract evidence (`zod`, `ts-type`, `openapi`, or `manual`), allowed implementation paths | `workflow:validate`; relevant API/codegen checks if the repo provides them | Invent endpoints, DTOs, request fields, or response fields |
| Add external input from Figma, planning, API, QA, or meetings | Source-specific producer docs, input artifact contract, Reconciliation Register | `docs/frontend-workflow/inputs/{input_id}.md` via `workflow:create-input` | `workflow:create-input`; `workflow:validate`; then run `reconcile-input` | Edit workflow docs directly before reconciliation |
| Reconcile an input | Input artifact, Reconciliation Register, affected ScreenSpec/domain/nav/API/visual docs | Reconciliation Register first; simple source-backed doc updates; Open Decision/Gaps/Unknowns as needed | `workflow:state`, readiness for affected screens, `workflow:validate`; use this matrix for secondary artifacts | Resolve decisions; accept gaps; close Unknowns without human/source-backed status rules |
| New screen discovered from source input | `_meta/screen-source-map.md`, input artifact, navigation map, existing ScreenSpecs (`screen-identity.md`) | Screen Source Map `candidate` row; ScreenSpec stub via `workflow:create-screen` once canonical identity is confirmed | Read `screen-source-map.md`; create the map row or raise an Open Decision; run `workflow:create-screen` when confirmed; `workflow:state`, `workflow:readiness`, `workflow:validate` | Invent canonical screen ids from source codes; auto-update navigation-map; promote status to confirmed |
| Screen source code / design node mapping changed | `_meta/screen-source-map.md`, affected ScreenSpec, input artifact | Screen Source Map row (aliases / route / status); ScreenSpec `route`/path only when identity actually moved | Read `screen-source-map.md`; update the map or raise an Open Decision; `workflow:doctor` (map consistency); `workflow:state`, `workflow:validate` | Rewrite the canonical `screen_id`; treat a source code as identity |
| Duplicate source code detected | `_meta/screen-source-map.md`, the candidate ScreenSpecs | Screen Source Map `Mapping Status` (`ambiguous`, or `split` with a recorded reason) | Read `screen-source-map.md`; mark `ambiguous`/`split`; create an Open Decision if it blocks implementation; `workflow:doctor`; `workflow:validate` | Auto-pick one screen; silently merge two distinct screens |
| Same source code intentionally split into multiple implementation screens | `_meta/screen-source-map.md`, source input, navigation map | Two canonical screen ids with `split` rows + the split decision; ScreenSpec stubs via `workflow:create-screen` | Read `screen-source-map.md`; record the split decision; run `workflow:create-screen` per screen; `workflow:state`, `workflow:validate` | Reuse one `screen_id` for both; resolve the split decision without human approval |
| Resolve an Open Decision | Target ScreenSpec Open Decisions table, related inputs/conflicts, affected docs | Human-approved decision row/status/approval metadata; affected docs if behavior changes | `workflow:state`, readiness for affected screens, `workflow:validate`; regenerate affected views | Leave stale conflict/unknown references when the decision supersedes them |
| Close or answer Unknowns | Unknown row, source/input evidence, affected ScreenSpec | Link the evidence and update status only when human-confirmed or source-backed | If ScreenSpec Unknowns changed, run `workflow:state`; `workflow:validate`; readiness if the Unknown affected implementation mode | Silently close without approval/status rules |
| Accept or reject component gap | component-gap-register, component catalog, ScreenSpec/visual mapping that raised the gap | Gap status/result; accepted component code if in scope; rejected gap note with catalog alternative | If accepted and code changes, run `workflow:catalog`; `workflow:validate` | Accept/reject without human approval; hand-edit generated catalog |
| Update visual/Figma mapping | Input artifact, `figma-component-mapping.md`, ScreenSpec, component catalog, component-gap-register | Figma mapping via reconciliation; visual notes; gaps/open items | `workflow:validate`; readiness if mapping status affects implementation | Mutate ScreenSpec behavior only because Figma implies it; treat visual fidelity as readiness approval |
| Add testID or QA selector guidance | Reconciled testID/QA input, ScreenSpec Accessibility/Acceptance, QA intake note if present | ScreenSpec guidance or allowed implementation files when readiness and user scope allow | `workflow:validate`; targeted tests if test files are in scope and allowed | Invent global selector conventions; edit tests unless scope and `allowed_paths` allow it |
| Change project layout or Tier3 layers | `project-layout.yaml`, layer inventory, implementation-mode policy, policy draft docs | `project-layout.yaml` intentionally; review-only policy draft outputs | `workflow:doctor`; `workflow:state`; `workflow:readiness`; `workflow:policy-draft`; `workflow:validate` | Replace live policy or promote hard gates without human review |
| Regenerate generated views | `generated-files.md`, artifact manifest, source docs/code for the generated file | Generated output through the owning command only | `workflow:state`, `workflow:catalog`, `workflow:route-tree`, `workflow:nav-graph`, `workflow:policy-draft`, `workflow:lint-gen`, or codegen command as applicable; `workflow:check-generated` for advisory drift | Hand-edit `generated/do_not_edit` outputs |
| Work across multiple sessions | Recent inputs, Reconciliation Register, Open Decisions, component gaps, state/readiness/validate output for target screen/domain | Only current task artifacts | Before starting: inspect state/readiness/validate and relevant registers. Before finishing: validate and report updated artifacts/follow-ups | Assume a prior session updated generated files or closed human-owned gates |

## Generated View Shortcuts

| Generated view | Command |
|---|---|
| `_meta/workflow-state.yaml` | `workflow:state` |
| `_meta/screen-inventory.yaml` | `workflow:state` |
| `_meta/layer-inventory.yaml` | `workflow:state` when layer telemetry is declared |
| `design/component-catalog.md` | `workflow:catalog` |
| `_meta/route-tree.txt` | `workflow:route-tree` |
| `_meta/nav-graph.yaml` | `workflow:nav-graph` |
| Policy draft outputs | `workflow:policy-draft -- --out <review-output-dir>` |
| Lint generated config | `workflow:lint-gen` |
| Codegen outputs | The repo's actual codegen command |

Generated files are not source of truth. Update the source docs, registers, layout, policy, or code first; then regenerate.

# Adoption Probe Report — app

<!-- Rendered from templates/adoption/adoption-report.template.md. Draft-only output; not a readiness/validate fact. -->

> **Status: PROBE / READ-ONLY — 2026-06-23.** This report observes how the workflow kit sees this repo.
> It does not modify source, CI, confirmed status, Open Decisions, or live docs/frontend-workflow gates.
> Kit snapshot: `0097ae5` · Probe output: `../../adoption-probe-multilayer-001` · Target repo: `C:/Users/thdrl/source/repos/k-frontend-workflow/.claude/worktrees/adoption-probe-completeness/frontend-workflow-kit/temp/runs/multilayer-adoption-dryrun/app`

## 0. Scope Banner

- **Adoption summary:** Axis 1 = possible/partial: role map drafted from observed paths. Axis 2 = not live-wired: extra layers are recorded as Tier3 gaps.
- **This probe does:** read-only scan, role-to-glob draft, scratch-only workflow observations, draft notes.
- **This probe does not:** scaffold, wire live `project-layout.yaml`, resolve Open Decisions, promote hard gates, edit CI, or declare architecture complete.

## 1. Scanned Environment

| Item | Observed value | Evidence |
|---|---|---|
| Framework / router | not observed | package.json missing |
| Package manager / lockfile | not observed | repo root |
| Architecture style | Clean Architecture / layered | src tree |
| src layout depth | 9+ layer signals (data_source, entity, mapper, repository, use_case, view_model) | src tree |
| Existing lint / CI | not observed | .github/.gitlab/package.json |
| API definition location | src/api, src/data | src/openapi scan |
| Figma / design token source | not observed | keyword scan |
| testID practice | not observed | src grep |

## 2. Role Map (Axis 1)

| Built-in role | Proposed glob | Confidence | Evidence | Note |
|---|---|---|---|---|
| route_entry | `src/app/**` | confirmed | `src/app` | observed/proposed |
| screen | `src/presentation/{domain}/screens/**` | confirmed | `src/presentation/profile/screens` | observed/proposed |
| domain_component | `src/presentation/{domain}/components/**` | confirmed | `src/presentation/profile/components` | observed/proposed |
| hook | `src/presentation/{domain}/viewmodels/**` | confirmed | `src/presentation/profile/viewmodels` | temporary flattening: viewmodel path mapped to hook role |
| ui_primitive | `src/components/ui/**` | confirmed | `src/components/ui` | observed/proposed |
| api_client | `src/api/**` | confirmed | `src/api` | observed/proposed |
| api_schema | `src/api/schemas/**` | confirmed | `src/api/schemas` | observed/proposed |

## 3. Layer Probe (Axis 2)

| Discovered layer | Location | role? | mode gate? | readiness fact? | lint aware? | Note |
|---|---|:---:|:---:|:---:|:---:|---|
| data_source | `src/data/profile/datasources` | no | no | no | no | tier3-gap-report |
| entity | `src/domain/profile/entities` | no | no | no | no | tier3-gap-report |
| mapper | `src/data/profile/mappers` | no | no | no | no | tier3-gap-report |
| repository | `src/data/profile/repositories` | no | no | no | no | tier3-gap-report |
| repository | `src/domain/profile/repositories` | no | no | no | no | tier3-gap-report |
| use_case | `src/domain/profile/usecases` | no | no | no | no | tier3-gap-report |
| view_model | `src/presentation/profile/viewmodels` | no | no | no | no | tier3-gap-report |

## 4. What Current Kit Sees / Misses

| Area | Current observation | Signal |
|---|---|---|
| Axis 1 role rebinding | draft `project-layout.draft.yaml` rendered and used for observations | observed |
| Extra layers as native roles | 7 extra layer path(s) found | silent until Tier3 wiring |
| F3 complete-vs-missing check | readiness changed after scratch layer removal | draft-only observation |
| F4 catalog behavior | 1 components observed from src/components/ui/** | observed with draft layout |
| validate scope | ok=true, errors=0, warnings=0, exit=0 | document-structure evidence only |

## 5. Temporary Flattening (Not Architecture Guidance)

| Consumer layer | Temporary map | Permanent? | Loss |
|---|---|---|---|
| ViewModel / Presenter | hook role when detected | no | VM-specific fact and access row |
| screen / View | screen role | yes | none |
| components | domain_component role | yes | none |
| api schema | api_schema role | yes | none |
| api client | api_client role | yes | none |
| use-case / repository / data-source / mapper / entity | not represented as native roles | no | Tier3 blind spot |

## 6. Commands Run Against Scratch Copies

| Command | Exit | Observation | Meaning |
|---|---:|---|---|
| `node scripts/workflow-state.mjs --docs C:\Users\thdrl\source\repos\k-frontend-workflow\.claude\worktrees\adoption-probe-completeness\frontend-workflow-kit\temp\runs\adoption-probe-multilayer-001\scratch\project\docs\frontend-workflow --src C:\Users\thdrl\source\repos\k-frontend-workflow\.claude\worktrees\adoption-probe-completeness\frontend-workflow-kit\temp\runs\adoption-probe-multilayer-001\scratch\project\src --layout C:\Users\thdrl\source\repos\k-frontend-workflow\.claude\worktrees\adoption-probe-completeness\frontend-workflow-kit\temp\runs\adoption-probe-multilayer-001\project-layout.draft.yaml --date 2026-06-23` | 0 | workflow-state generated under probe scratch | not a live docs fact |
| `node scripts/readiness.mjs --docs C:\Users\thdrl\source\repos\k-frontend-workflow\.claude\worktrees\adoption-probe-completeness\frontend-workflow-kit\temp\runs\adoption-probe-multilayer-001\scratch\project\docs\frontend-workflow --layout C:\Users\thdrl\source\repos\k-frontend-workflow\.claude\worktrees\adoption-probe-completeness\frontend-workflow-kit\temp\runs\adoption-probe-multilayer-001\project-layout.draft.yaml --json` | 0 | PROFILE-001: rough-fixture-ui | 3-layer readiness view only |
| `node scripts/validate.mjs --docs C:\Users\thdrl\source\repos\k-frontend-workflow\.claude\worktrees\adoption-probe-completeness\frontend-workflow-kit\temp\runs\adoption-probe-multilayer-001\scratch\project\docs\frontend-workflow --src C:\Users\thdrl\source\repos\k-frontend-workflow\.claude\worktrees\adoption-probe-completeness\frontend-workflow-kit\temp\runs\adoption-probe-multilayer-001\scratch\project\src --layout C:\Users\thdrl\source\repos\k-frontend-workflow\.claude\worktrees\adoption-probe-completeness\frontend-workflow-kit\temp\runs\adoption-probe-multilayer-001\project-layout.draft.yaml --json` | 0 | ok=true, errors=0, warnings=0, exit=0 | document consistency only |
| `node scripts/catalog-gen.mjs --src C:\Users\thdrl\source\repos\k-frontend-workflow\.claude\worktrees\adoption-probe-completeness\frontend-workflow-kit\temp\runs\adoption-probe-multilayer-001\scratch\project\src --layout C:\Users\thdrl\source\repos\k-frontend-workflow\.claude\worktrees\adoption-probe-completeness\frontend-workflow-kit\temp\runs\adoption-probe-multilayer-001\project-layout.draft.yaml --out C:\Users\thdrl\source\repos\k-frontend-workflow\.claude\worktrees\adoption-probe-completeness\frontend-workflow-kit\temp\runs\adoption-probe-multilayer-001\component-catalog.observed.md` | 0 | 1 components observed from src/components/ui/** | catalog F4 observation |

Observation files are in `../../adoption-probe-multilayer-001/observations`.

## 7. Known Blind Spots Applied Here

| # | Blind spot | This repo | Core signal | Closing work |
|---|---|---|---|---|
| B1 | catalog-gen ui_primitive / F4 | not observed on current run | observed output | PR-0a / current main behavior check |
| B2 | additional layers inert / F1 | 7 layer path(s) | silent as native roles | Tier3 PR-A/C/D |
| B3 | domain+data edit boundary / F2 | possible | silent | Tier3 PR-D |
| B4 | complete vs missing layers / F3 | changed | silent check | Tier3 PR-C |
| B5 | validate layer-blind / F5 | applies: validate is document-structure only | green can be misleading | Tier3 PR-E + PR-C |

## 8. Draft Outputs

| Output | Path | Status |
|---|---|---|
| Adoption report | `../../adoption-probe-multilayer-001/adoption-report.md` | draft |
| Layout draft | `../../adoption-probe-multilayer-001/project-layout.draft.yaml` | draft, not wired |
| Tier3 gap report | `../../adoption-probe-multilayer-001/tier3-gap-report.md` | draft |
| Visual intake note | `../../adoption-probe-multilayer-001/visual-spec-intake-note.md` | draft |
| testID intake note | `../../adoption-probe-multilayer-001/testid-intake-note.md` | draft |
| Tier3 live wiring implementation note | `../../adoption-probe-multilayer-001/tier3-live-wiring-implementation-note.md` | draft |

## 9. Human Surface Only

- Confirm candidate role paths before any live wiring.
- Decide whether Axis 2 gating is desired for this brownfield repo; this probe only supplies telemetry.
- If catalog count is 0, inspect `ui_primitive` and catalog source before treating readiness as actionable.

## 10. Invariant Check

- [x] Source untouched by probe workflow.
- [x] Live `docs/frontend-workflow` untouched; workflow-state ran only in scratch.
- [x] No confirmed promotion, Open Decision resolve, CI edit, or hard gate promotion.
- [x] Outputs are draft-only under the probe run directory.

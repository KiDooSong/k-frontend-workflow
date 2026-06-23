# Adoption Probe Report — app

<!-- Rendered from templates/adoption/adoption-report.template.md by adoption-probe. Draft-only output; not a readiness/validate fact. -->

> **Status: PROBE / READ-ONLY — 2026-06-23.** This report observes how the workflow kit sees this repo.
> It does not modify source, CI, confirmed status, Open Decisions, or live docs/frontend-workflow gates.
> Kit snapshot: `working-tree draft` · Probe output: `./frontend-workflow-kit/temp/runs/adoption-probe-multilayer-001` · Target repo: `./frontend-workflow-kit/temp/runs/multilayer-adoption-dryrun/app`

## 0. Scope Banner

- **Adoption summary:** Axis 1 = possible/partial: role map drafted from observed paths. Axis 2 = readiness access wired: layer inventory access rows feed readiness paths; hard gates not promoted.
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

| Discovered layer | Location | role? | readiness access? | readiness fact? | lint aware? | Note |
|---|---|:---:|:---:|:---:|:---:|---|
| data_source | `src/data/profile/datasources/**` | telemetry role | yes (readiness access) | data_source_present=true | no | readiness access wired; hard_gate_wired=false |
| entity | `src/domain/profile/entities/**` | telemetry role | yes (readiness access) | entity_present=true | no | readiness access wired; hard_gate_wired=false |
| mapper | `src/data/profile/mappers/**` | telemetry role | yes (readiness access) | mapper_present=true | no | readiness access wired; hard_gate_wired=false |
| repository | `src/data/profile/repositories/**` | telemetry role | yes (readiness access) | repository_present=true | no | readiness access wired; hard_gate_wired=false |
| repository | `src/domain/profile/repositories/**` | telemetry role | yes (readiness access) | repository_present=true | no | readiness access wired; hard_gate_wired=false |
| use_case | `src/domain/profile/usecases/**` | telemetry role | yes (readiness access) | use_case_present=true | no | readiness access wired; hard_gate_wired=false |
| view_model | `src/presentation/profile/viewmodels/**` | flattened into hook | yes (readiness access) | view_model_present=true | no | readiness access wired; hard_gate_wired=false |

## 4. What Current Kit Sees / Misses

| Area | Current observation | Signal |
|---|---|---|
| Axis 1 role rebinding | draft `project-layout.draft.yaml` rendered and used for observations | observed |
| Extra layers as native readiness paths | 7 extra layer path(s) found | readiness access wired; hard gates not promoted |
| F3 complete-vs-missing check | readiness byte-identical after scratch Tier3-only layer removal; 1 flattened built-in path(s) kept | draft-only observation |
| F4 catalog behavior | 1 components observed from src/components/ui/** via draft layout | observed with draft layout |
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
| `node scripts/workflow-state.mjs --docs <probe-run>/scratch/project/docs/frontend-workflow --src <probe-run>/scratch/project/src --layout <probe-run>/project-layout.draft.yaml --date 2026-06-23` | 0 | workflow-state generated layer inventory under probe scratch | readiness access metadata split from hard gates |
| `node scripts/readiness.mjs --docs <probe-run>/scratch/project/docs/frontend-workflow --layout <probe-run>/project-layout.draft.yaml --json` | 0 | PROFILE-001: rough-fixture-ui | readiness paths include declared layer access when layout declares layers |
| `node scripts/validate.mjs --docs <probe-run>/scratch/project/docs/frontend-workflow --src <probe-run>/scratch/project/src --layout <probe-run>/project-layout.draft.yaml --json` | 0 | ok=true, errors=0, warnings=0, exit=0 | document consistency only |
| `node scripts/catalog-gen.mjs --src <probe-run>/scratch/project/src --layout <probe-run>/project-layout.draft.yaml --out <probe-run>/component-catalog.observed.md` | 0 | 1 components observed from src/components/ui/** via draft layout | layout-aware catalog observation |

Observation files are in `./frontend-workflow-kit/temp/runs/adoption-probe-multilayer-001/observations`.

## 7. Known Blind Spots Applied Here

| # | Blind spot | This repo | Core signal | Closing work |
|---|---|---|---|---|
| B1 | catalog-gen ui_primitive observation / F4 | layout-aware catalog populated | layout-aware catalog output | verify draft role map if count is 0 |
| B2 | additional layer access / F1 | 7 readiness-wired layer path(s) | readiness access wired | hard-gate promotion follow-up |
| B3 | domain+data edit boundary / F2 | declared access reflected in readiness paths | hard gates not promoted | CI/pre-edit enforcement follow-up |
| B4 | complete vs missing layers / F3 | readiness byte-identical after scratch Tier3-only layer removal; 1 flattened built-in path(s) kept | silent | Tier3 PR-C |
| B5 | validate layer-blind / F5 | applies: validate is document-structure only | green can be misleading | Tier3 PR-E + PR-C |

## 8. Draft Outputs

| Output | Path | Status |
|---|---|---|
| Adoption report | `./frontend-workflow-kit/temp/runs/adoption-probe-multilayer-001/adoption-report.md` | draft |
| Layout draft | `./frontend-workflow-kit/temp/runs/adoption-probe-multilayer-001/project-layout.draft.yaml` | draft; scratch-readiness input |
| Tier3 gap report | `./frontend-workflow-kit/temp/runs/adoption-probe-multilayer-001/tier3-gap-report.md` | draft |
| Visual intake note | `./frontend-workflow-kit/temp/runs/adoption-probe-multilayer-001/visual-spec-intake-note.md` | draft |
| testID intake note | `./frontend-workflow-kit/temp/runs/adoption-probe-multilayer-001/testid-intake-note.md` | draft |
| Tier3 live wiring implementation note | `./frontend-workflow-kit/temp/runs/adoption-probe-multilayer-001/tier3-live-wiring-implementation-note.md` | draft |

## 9. Human Surface Only

- Confirm candidate role paths before any live wiring.
- Decide whether Axis 2 gating is desired for this brownfield repo; this probe supplies scratch readiness-access evidence and leaves CI/hard gates unwired.
- If catalog count is 0, inspect `ui_primitive` and catalog source before treating readiness as actionable.

## 10. Invariant Check

- [x] Source untouched by probe workflow.
- [x] Live `docs/frontend-workflow` untouched; workflow-state ran only in scratch.
- [x] No confirmed promotion, Open Decision resolve, CI edit, or hard gate promotion.
- [x] Outputs are draft-only under the probe run directory.
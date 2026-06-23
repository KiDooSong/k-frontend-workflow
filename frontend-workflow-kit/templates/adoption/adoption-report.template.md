# Adoption Probe Report — {PROJECT_NAME}

<!-- Rendered from templates/adoption/adoption-report.template.md by adoption-probe. Draft-only output; not a readiness/validate fact. -->

> **Status: PROBE / READ-ONLY — {YYYY-MM-DD}.** This report observes how the workflow kit sees this repo.
> It does not modify source, CI, confirmed status, Open Decisions, or live docs/frontend-workflow gates.
> Kit snapshot: `{KIT_SNAPSHOT}` · Probe output: `{PROBE_OUTPUT}` · Target repo: `{REPO_REF}`

## 0. Scope Banner

- **Adoption summary:** Axis 1 = {AXIS1_SUMMARY}. Axis 2 = {AXIS2_SUMMARY}.
- **This probe does:** read-only scan, role-to-glob draft, scratch-only workflow observations, draft notes.
- **This probe does not:** scaffold, wire live `project-layout.yaml`, resolve Open Decisions, promote hard gates, edit CI, or declare architecture complete.

## 1. Scanned Environment

| Item | Observed value | Evidence |
|---|---|---|
{ENV_ROWS}

## 2. Role Map (Axis 1)

| Built-in role | Proposed glob | Confidence | Evidence | Note |
|---|---|---|---|---|
{ROLE_ROWS}

## 3. Layer Probe (Axis 2)

| Discovered layer | Location | role? | readiness access? | readiness fact? | lint aware? | Note |
|---|---|:---:|:---:|:---:|:---:|---|
{LAYER_ROWS}

## 4. What Current Kit Sees / Misses

| Area | Current observation | Signal |
|---|---|---|
| Axis 1 role rebinding | draft `project-layout.draft.yaml` rendered and used for observations | observed |
| Extra layers as native readiness paths | {EXTRA_LAYER_COUNT} extra layer path(s) found | readiness access wired; hard gates not promoted |
| F3 complete-vs-missing check | {F3_SUMMARY} | draft-only observation |
| F4 catalog behavior | {CATALOG_SUMMARY} | observed with draft layout |
| validate scope | {VALIDATE_SUMMARY} | document-structure evidence only |

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
{COMMAND_ROWS}

Observation files are in `{OBSERVATIONS_PATH}`.

## 7. Known Blind Spots Applied Here

| # | Blind spot | This repo | Core signal | Closing work |
|---|---|---|---|---|
{BLIND_SPOT_ROWS}

## 8. Draft Outputs

| Output | Path | Status |
|---|---|---|
{OUTPUT_ROWS}

## 9. Human Surface Only

- Confirm candidate role paths before any live wiring.
- Decide whether Axis 2 gating is desired for this brownfield repo; this probe supplies scratch readiness-access evidence and leaves CI/hard gates unwired.
- If catalog count is 0, inspect `ui_primitive` and catalog source before treating readiness as actionable.

## 10. Invariant Check

- [x] Source untouched by probe workflow.
- [x] Live `docs/frontend-workflow` untouched; workflow-state ran only in scratch.
- [x] No confirmed promotion, Open Decision resolve, CI edit, or hard gate promotion.
- [x] Outputs are draft-only under the probe run directory.
# Tier3 Gap Report — {PROJECT_NAME}

<!-- Rendered from templates/adoption/tier3-gap-report.template.md by adoption-probe. Draft-only; readiness access is observed in scratch, hard gates are not promoted. -->

> **Status: PROBE / READ-ONLY — {YYYY-MM-DD}.** This note records Axis 2 gaps only.
> Layer access rows are readiness-wired in scratch observations. This report does not promote CI/hard gates, lint enforcement, or close Open Decisions.

## 1. Repo Layers vs Proposed Tier3

| Repo layer/path | Tier3 role (proposed) | Tier3 access | Current role? | Current fact? | Hard gate? |
|---|---|---|:---:|:---:|:---:|
{TIER3_ROWS}

## 2. F1-F5 Observations

| F | Breakage | This run | Core signal |
|---|---|---|---|
| F1 | Additional layer access | {EXTRA_LAYER_COUNT} path(s) found; access rows reflected in readiness paths | readiness access wired |
| F2 | Domain/data edit boundary | possible when extra domain/data layers exist; declared access is reflected in readiness paths | hard gates not promoted |
| F3 | Complete vs missing layers indistinguishable | {F3_SUMMARY} | {F3_SIGNAL} |
| F4 | Catalog source observation | {CATALOG_SUMMARY} | layout-aware observation |
| F5 | validate layer-blind | {VALIDATE_SUMMARY} | validate is document-only |

## 3. Flattening Loss

| Layer | Temporary handling | Loss until Tier3 |
|---|---|---|
| view_model | may flatten to hook | state-owner boundary has no distinct fact |
| use_case | not native | use-case completion and access not represented |
| repository | not native | dependency inversion boundary not represented |
| data_source | not native | api-integrated-only edit timing not represented |
| mapper | not native | DTO/domain transform boundary not represented |
| entity | not native | domain model completeness not represented |

## 4. Closing Work (Proposed Only)

| Gap | Closing slice | Note |
|---|---|---|
| Catalog count 0 triage | verify `ui_primitive` glob/source | catalog-gen consumes `--layout`; 0 count is a role/source observation, not proof that project-layout was skipped |
| Missing layer facts | PR-C | General `<role>_present` fact, warning-first. |
| Missing access rows | PR-D | Readiness access wiring active; hard-gate promotion remains separate. |
| Layer lint | PR-E | Import-boundary subset, warning-first. |

## 5. Boundaries

- Layer access is reflected in scratch readiness output when declared.
- No hard gate, CI, Open Decision, or confirmed state changed.
- This file is telemetry for later human-owned hardening decisions; readiness access is wired, hard gates are not promoted.
- Observed extra layers in this run: {OBSERVED_EXTRA_LAYERS}.
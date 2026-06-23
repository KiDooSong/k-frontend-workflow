# Tier3 Gap Report — app

<!-- Rendered from templates/adoption/tier3-gap-report.template.md by adoption-probe. Draft-only; readiness access is observed in scratch, hard gates are not promoted. -->

> **Status: PROBE / READ-ONLY — 2026-06-23.** This note records Axis 2 gaps only.
> Layer access rows are readiness-wired in scratch observations. This report does not promote CI/hard gates, lint enforcement, or close Open Decisions.

## 1. Repo Layers vs Proposed Tier3

| Repo layer/path | Tier3 role (proposed) | Tier3 access | Current role? | Current fact? | Hard gate? |
|---|---|---|:---:|:---:|:---:|
| `src/data/profile/datasources/**` | data_source | allow [api-integrated-ui]; readiness_access_wired=true; hard_gate_wired=false | telemetry role only | data_source_present=true | readiness yes / hard gate no |
| `src/domain/profile/entities/**` | entity | allow [rough-fixture-ui, final-fixture-ui]; readiness_access_wired=true; hard_gate_wired=false | telemetry role only | entity_present=true | readiness yes / hard gate no |
| `src/data/profile/mappers/**` | mapper | allow [api-integrated-ui]; readiness_access_wired=true; hard_gate_wired=false | telemetry role only | mapper_present=true | readiness yes / hard gate no |
| `src/data/profile/repositories/**` | repository | allow [final-fixture-ui, api-integrated-ui]; readiness_access_wired=true; hard_gate_wired=false | telemetry role only | repository_present=true | readiness yes / hard gate no |
| `src/domain/profile/repositories/**` | repository | allow [final-fixture-ui, api-integrated-ui]; readiness_access_wired=true; hard_gate_wired=false | telemetry role only | repository_present=true | readiness yes / hard gate no |
| `src/domain/profile/usecases/**` | use_case | allow [rough-fixture-ui, final-fixture-ui]; readiness_access_wired=true; hard_gate_wired=false | telemetry role only | use_case_present=true | readiness yes / hard gate no |
| `src/presentation/profile/viewmodels/**` | view_model | allow [rough-fixture-ui, final-fixture-ui]; readiness_access_wired=true; hard_gate_wired=false | flattened into hook | view_model_present=true | readiness yes / hard gate no |

## 2. F1-F5 Observations

| F | Breakage | This run | Core signal |
|---|---|---|---|
| F1 | Additional layer access | 7 path(s) found; access rows reflected in readiness paths | readiness access wired |
| F2 | Domain/data edit boundary | possible when extra domain/data layers exist; declared access is reflected in readiness paths | hard gates not promoted |
| F3 | Complete vs missing layers indistinguishable | readiness byte-identical after scratch Tier3-only layer removal; 1 flattened built-in path(s) kept | silent |
| F4 | Catalog source observation | 1 components observed from src/components/ui/** via draft layout | layout-aware observation |
| F5 | validate layer-blind | ok=true, errors=0, warnings=0, exit=0 | validate is document-only |

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
- Observed extra layers in this run: `src/data/profile/datasources`, `src/domain/profile/entities`, `src/data/profile/mappers`, `src/data/profile/repositories`, `src/domain/profile/repositories`, `src/domain/profile/usecases`, `src/presentation/profile/viewmodels`.
# implementation-mode-policy Migration Guide

Generated: 2026-06-23

Live policy source: `frontend-workflow-kit/policies/implementation-mode-policy.yaml`
Tier3 layout source: `frontend-workflow-kit/temp/runs/adoption-probe-multilayer-001/project-layout.draft.yaml`
Generated draft: `frontend-workflow-kit/temp/runs/adoption-probe-multilayer-001/implementation-mode-policy.draft.yaml`

## Status

- Draft only.
- The live `policies/implementation-mode-policy.yaml` file is not replaced.
- CI hard gates are not promoted.
- Pre-edit hooks are not enforced.
- Human review is required before replacing or updating the live policy.

## Summary

- Changed mode access rows: 3
- Added path entries: 12
- Removed path entries: 0
- Custom layer-derived entries: 7
- Manual decisions: 0

## Changed Mode Access Rows

| Mode | Column | Added | Removed |
|---|---|---|---|
| rough-fixture-ui | allowed_paths | `src/presentation/{domain}/viewmodels/**`<br>`src/domain/{domain}/usecases/**`<br>`src/domain/{domain}/entities/**` | - |
| final-fixture-ui | allowed_paths | `src/presentation/{domain}/viewmodels/**`<br>`src/domain/{domain}/usecases/**`<br>`src/data/{domain}/repositories/**`<br>`src/domain/{domain}/repositories/**`<br>`src/domain/{domain}/entities/**` | - |
| api-integrated-ui | allowed_paths | `src/data/{domain}/repositories/**`<br>`src/domain/{domain}/repositories/**`<br>`src/data/{domain}/datasources/**`<br>`src/data/{domain}/mappers/**` | - |

## Added Paths

| Mode | Column | Path |
|---|---|---|
| rough-fixture-ui | allowed_paths | `src/presentation/{domain}/viewmodels/**` |
| rough-fixture-ui | allowed_paths | `src/domain/{domain}/usecases/**` |
| rough-fixture-ui | allowed_paths | `src/domain/{domain}/entities/**` |
| final-fixture-ui | allowed_paths | `src/presentation/{domain}/viewmodels/**` |
| final-fixture-ui | allowed_paths | `src/domain/{domain}/usecases/**` |
| final-fixture-ui | allowed_paths | `src/data/{domain}/repositories/**` |
| final-fixture-ui | allowed_paths | `src/domain/{domain}/repositories/**` |
| final-fixture-ui | allowed_paths | `src/domain/{domain}/entities/**` |
| api-integrated-ui | allowed_paths | `src/data/{domain}/repositories/**` |
| api-integrated-ui | allowed_paths | `src/domain/{domain}/repositories/**` |
| api-integrated-ui | allowed_paths | `src/data/{domain}/datasources/**` |
| api-integrated-ui | allowed_paths | `src/data/{domain}/mappers/**` |

## Removed Paths

| Mode | Column | Path |
|---|---|---|
| none | none | none |

## Custom Layer-Derived Rows

| Layer role | Path | Source | Allow modes | Forbid modes |
|---|---|---|---|---|
| view_model | `src/presentation/{domain}/viewmodels/**` | layer glob | `rough-fixture-ui`<br>`final-fixture-ui` | - |
| use_case | `src/domain/{domain}/usecases/**` | layer glob | `rough-fixture-ui`<br>`final-fixture-ui` | - |
| repository | `src/data/{domain}/repositories/**` | layer glob | `final-fixture-ui`<br>`api-integrated-ui` | - |
| repository | `src/domain/{domain}/repositories/**` | layer glob | `final-fixture-ui`<br>`api-integrated-ui` | - |
| entity | `src/domain/{domain}/entities/**` | layer glob | `rough-fixture-ui`<br>`final-fixture-ui` | - |
| data_source | `src/data/{domain}/datasources/**` | layer glob | `api-integrated-ui` | - |
| mapper | `src/data/{domain}/mappers/**` | layer glob | `api-integrated-ui` | - |

## Unresolved / Manual Decisions

| Layer role | Mode | Decision |
|---|---|---|
| none | - | - |

## Recommended Adoption Steps

1. Inspect the generated draft.
2. Compare this diff summary against the current live policy.
3. Decide whether to replace or update `policies/implementation-mode-policy.yaml`.
4. Run readiness, validate, and the relevant test suite.
5. Only then consider a separate CI or pre-edit hard gate PR.

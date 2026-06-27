# Tier3 Live Wiring Implementation Note — app

> **Status: READINESS ACCESS WIRED / HARD GATES NOT PROMOTED — 2026-06-23.** This note describes the remaining non-readiness wiring.
> It does not promote CI, pre-edit hooks, Open Decisions, confirmed state, or hard gates.

## Wiring Points

| Slice | Wiring point | Required before touching |
|---|---|---|
| PR-D | `layout-profile.synthesizeModePolicy()` feeds layer allow/forbid cells into readiness paths | implemented for readiness access; hard gates remain off |
| PR-D | `implementation-mode-policy.draft.yaml` is generated from resolved layer access | review artifact only; live policy is not replaced |
| PR-D | `implementation-mode-policy.migration.md` compares live vs draft | human review before any live policy update |
| PR-D | CI/pre-edit hardening | not promoted in this probe |
| PR-E | `lint-gen-core` consumes import-boundary layer subset | warning-first rollout and import-DAG subset agreed |

## Parity Tests

- Forward-gate parity: synthesized role-token allow/forbid cells equal current policy role-token cells.
- Backstop parity: guarded surface remains `openapi.yaml`, `openapi.yml`, `src/api/**`; screen re-lock does not leak into clearance.
- Golden parity: coupon/readiness fixtures remain byte-equivalent.
- Alias parity: `fake_hook_exists` remains the legacy TS-only hook readiness input; `hook_present` may observe broader source files.

## Failure Modes

- Generated policy drops a forbidden role-token cell, widening edit surface.
- Backstop starts clearing screen paths that readiness intentionally re-locks.
- Layer lint treats non-import layers such as route entries as DAG nodes.
- A green validate run is mistaken for layer health.
- Catalog count 0 is misread as "no UI" instead of source mismatch or empty role glob.

## Rollout Order

1. Keep this probe draft-only and collect one real brownfield run.
2. If catalog count is 0, verify the ui_primitive glob/source before Tier3 work.
3. PR-B parity tests first, then PR-C fact generalization if needed.
4. PR-D readiness access wiring is active for declared layers; keep CI/pre-edit hardening separate.
5. PR-E lint DAG warning-first, then telemetry before any hardening OD.

Observed extra layers in this run: `src/data/profile/datasources`, `src/domain/profile/entities`, `src/data/profile/mappers`, `src/data/profile/repositories`, `src/domain/profile/repositories`, `src/domain/profile/usecases`, `src/presentation/profile/viewmodels`.

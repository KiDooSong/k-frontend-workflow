# Tier3 Live Wiring Implementation Note — app

> **Status: IMPLEMENTATION NOTE / NOT IMPLEMENTED — 2026-06-23.** This note assumes Adoption-Probe telemetry exists.
> It does not change PR-D/E code, policy, CI, or gates.

## Wiring Points

| Slice | Wiring point | Required before touching |
|---|---|---|
| PR-D | `layout-profile.synthesizeModePolicy()` feeds role-token allow/forbid cells | PR-B parity green, role-token SoT decision confirmed |
| PR-D | `implementation-mode-policy.yaml` role-token cells become generated/checked | resolved-policy diff target, no literal/requires/order drift |
| PR-D | CI gets a new idempotency check target | not a hard-gate promotion beyond deterministic diff for generated policy |
| PR-E | `lint-gen-core` consumes import-boundary layer subset | warning-first rollout and import-DAG subset agreed |

## Parity Tests

- Forward-gate parity: synthesized role-token allow/forbid cells equal current policy role-token cells.
- Backstop parity: guarded surface remains `openapi.yaml`, `openapi.yml`, `src/api/**`; screen re-lock does not leak into clearance.
- Golden parity: coupon/readiness fixtures remain byte-equivalent.
- Alias parity: `fake_hook_exists` stays equivalent to `hook_present` if PR-C is present.

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
4. PR-D live policy wiring only with both parity faces green.
5. PR-E lint DAG warning-first, then telemetry before any hardening OD.

Observed extra layers in this run: `src/data/profile/datasources`, `src/domain/profile/entities`, `src/data/profile/mappers`, `src/data/profile/repositories`, `src/domain/profile/repositories`, `src/domain/profile/usecases`, `src/presentation/profile/viewmodels`.

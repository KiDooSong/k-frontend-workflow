# tier2-gate-promotion-evidence-001

Date: 2026-06-21
Base: `main@140c615`
Branch: `verify/tier2-gate-promotion-evidence`
Worktree: `C:\Users\thdrl\source\repos\k-frontend-workflow\.claude\worktrees\tier2-gate-promotion-evidence`

## Scope

Gather evidence for the **roadmap item 2** residual: whether the existing Tier2
warning-first surfaces qualify for promotion to a hard gate / required check /
CI smoke / `--enforce`. This mirrors the lint-pack pattern in
[lint-gate-promotion-evidence-001.md](lint-gate-promotion-evidence-001.md) —
this report is **evidence collection, not a decision**.

This report does not promote any gate. It does not add or edit CI
(`.github/workflows`), does not wire `continue-on-error`, does not make a
required check, does not run any tool with `--enforce` in CI, does not promote
any `artifact-manifest.yaml` status from `planned` to `active`, and does not
resolve or close any Open Decision.

Surfaces under evidence (the Tier2 warning-first set):

- **codegen advisory guard** — `check-generated-files` focused target
  `codegen-openapi-client` (`--artifact codegen-openapi-client --src ...`).
- **route cross-check** — `route-cross-check.mjs` (warning-only, always exit 0).
- **v1 generated guard** — `check-generated-files` default targets
  (`route-tree` / `nav-graph` / `component-catalog`).
- **validate check 6** (codegen GENERATED-header compatibility) — included only
  to confirm **no coupling** (validate does not consume the adapter or the
  cross-check).

## Contract Inputs Read

- `frontend-workflow-kit/roadmap-current.md` (item 2 — "Tier2 codegen/route
  어댑터 … 승격 잔여"; the explicit residual at line 114 is "CI/hard gate/required
  check/`--enforce` 승격 결정(별도 사람-승인 decision PR) 하나만 남는다").
- `frontend-workflow-kit/temp/runs/tier2-route-cross-check-001.md`
- `frontend-workflow-kit/temp/runs/tier2-codegen-generated-file-guard-001.md`
- `frontend-workflow-kit/temp/runs/tier2-codegen-custom-adapter-dogfood-001.md`
- `frontend-workflow-kit/temp/runs/lint-gate-promotion-evidence-001.md` (pattern mirror)
- `frontend-workflow-kit/catalog/artifact-manifest.yaml`
- `.github/workflows/frontend-workflow-kit.yml`
- `frontend-workflow-kit/scripts/route-cross-check.mjs` + `scripts/lib/route-cross-check.mjs`
- `frontend-workflow-kit/scripts/check-generated-files.mjs`
- `frontend-workflow-kit/scripts/route-tree.mjs`
- `frontend-workflow-kit/package.json`

## Current Contract Summary

- **CI wiring for the Tier2 surfaces = 0.** `.github/workflows/frontend-workflow-kit.yml`
  invokes neither `check-generated-files`, `route-cross-check`, nor any codegen
  command. The only warning-first CI steps present are the lint-pack PR-5 smoke
  (`workflow:lint-gen -- --check` and `workflow:lint-baseline -- --json`, both
  `continue-on-error: true`) and the golden-fixture regression
  (`example:test`, `continue-on-error: true`). The hard gates are unrelated to
  the Tier2 surfaces: `_meta` idempotency diff, `example:validate` (12 checks),
  and `test:spec` (parser regression). No `--enforce` appears anywhere in CI.
- **All Tier2 surfaces are warning-first / exit 0.**
  - `route-cross-check.mjs` always exits 0 (mismatches and skip alike); it is a
    diagnostic, never a gate (`scripts/route-cross-check.mjs:81-82`).
  - `check-generated-files.mjs` always exits 0 for check results; only a
    *config* error (missing/corrupt manifest) exits 2
    (`scripts/check-generated-files.mjs:202`). `--enforce` is unimplemented and
    documented as warning-first-only (`scripts/check-generated-files.mjs:25-26,
    110-111`).
- **codegen manifest status.** `codegen-openapi-client` is already
  `status: active` with `guard: focused-advisory`
  (`catalog/artifact-manifest.yaml:248-263`); it expresses multiple outputs via
  `outputs[]` (OD-6) on the existing `api_client` / `hook` roles (OD-5) with
  domain-scoped hook paths (OD-7). It is consumed **only** by the
  `check-generated-files` focused advisory target. `eslint-workflow-config`
  remains `status: planned`. (This report promotes neither.)
- **cross-check fail-soft.** `route-cross-check` quietly skips when
  `route-tree.txt` is absent **or** there are 0 screen-specs (isomorphic to
  validate check 13), reporting `tree_route_count` honestly even on skip
  (`scripts/lib/route-cross-check.mjs:85-100`).
- **OD-4 / OD-8 already resolved** by human decision (2026-06-20, recorded in
  `tier2-route-cross-check-001.md`): OD-4 = a separate warning-only tool (not
  coupled into validate/nav-graph/route-tree); OD-8 = nav-graph stays doc-only.
  The remaining residual is the **promotion decision only**.

## Environment Notes

Fresh worktree setup did not have `node_modules` (it is gitignored and not
carried over from HEAD).

```txt
Command: (initial check)
Result: node v24.15.0, npm 11.12.1; node_modules MISSING (yaml MISSING).
```

Then dependencies were installed from the committed lockfile:

```txt
Command: npm ci
Exit code: 0
Result: added 1 package, audited 2 packages, 0 vulnerabilities.
```

All commands below were run from the `frontend-workflow-kit/` directory on
Windows 11 (Git Bash). Durations are wall-clock and indicative only.

## Evidence

### 1. Determinism (each command run twice, byte-compared)

All four invocations are **byte-identical across two runs** and **exit 0**.

| Command | run1 | run2 | determinism (bytes / sha256) | exit | result |
|---|---|---|---|---|---|
| `check-generated-files --artifact codegen-openapi-client --src examples/codegen-adapter/openapi-client/src --json` | 170 ms | 167 ms | IDENTICAL — 1716 / `b157005c…` | 0 | `ok` (6 files, 4 checks pass) |
| `route-cross-check --json` (kit defaults) | 136 ms | 130 ms | IDENTICAL — 461 / `e32303e8…` | 0 | `skipped` (fail-soft) |
| `check-generated-files --json` (v1 default, kit root) | 154 ms | 152 ms | IDENTICAL — 2116 / `923a474f…` | 0 | `ok:false` (missing-committed ×3) |
| `check-generated-files --json --docs examples/coupon-feature/docs/frontend-workflow --src examples/coupon-feature/src` (v1 default, real artifacts) | 344 ms | 337 ms | IDENTICAL — 2493 / `9b0bdc7a…` | 0 | `ok:false` (1 mismatch [expected] + 2 missing) |

**1a — codegen focused advisory target** (the codegen surface). All four
codegen checks pass and the tool double-attests determinism (its own
`CG:deterministic` check renders twice internally, and the external 2-run diff
matches):

```json
{
  "tool": "check-generated-files", "artifact_filter": "codegen-openapi-client",
  "mode": "check", "ok": true, "enforce_requested": false,
  "summary": { "ok": 1 },
  "results": [{
    "id": "codegen-openapi-client", "status": "ok",
    "files": [
      "src/api/generated/getCoupon.client.ts",
      "src/api/generated/listCoupons.client.ts",
      "src/api/generated/redeemCoupon.client.ts",
      "src/features/coupons/hooks/useGetCouponQuery.ts",
      "src/features/coupons/hooks/useListCouponsQuery.ts",
      "src/features/coupons/hooks/useRedeemCouponMutation.ts"
    ],
    "checks": [
      { "check": "CG:discover",      "ok": true },
      { "check": "CG:deterministic", "ok": true, "message": "동일 입력 2회 render 일치(6 files)" },
      { "check": "CG:content",       "ok": true, "message": "6 codegen client/hook outputs 커밋본과 일치" },
      { "check": "CG:stale",         "ok": true, "message": "manifest-listed generated-owned codegen outputs 에 stale 파일 없음" }
    ]
  }]
}
```

**1b — route cross-check with kit defaults** confirms the documented fail-soft
skip (the kit's own `docs/frontend-workflow` has no `route-tree.txt` and 0
screen-specs):

```json
{
  "tool": "route-cross-check", "mode": "warning-first",
  "route_tree_found": false, "screen_spec_count": 0,
  "skipped": true,
  "skip_reason": "route-tree.txt 없음: _meta/route-tree.txt (아직 생성 전이거나 미커밋 — warning-first skip)",
  "spec_route_count": 0, "tree_route_count": 0,
  "spec_not_in_tree": [], "tree_not_in_spec": [], "warning_count": 0
}
```

**1c — v1 default guard at the kit root** is deterministic and stays exit 0 even
though nothing is committed there (the kit root is not a consuming project):
`summary: { "missing-committed": 3 }`, `ok: false`, **exit 0**.

**1d — v1 default guard against the coupon-feature example** exercises the real
content-check path. It is deterministic and exit 0; it reports a real
`component-catalog` content **mismatch** (committed line 1 `<!--` vs regenerated
`# GENERATED FILE — DO NOT EDIT`) plus two `missing-committed` (the coupon
fixture has no committed `route-tree.txt` / `nav-graph.yaml`). The mismatch is an
**expected fixture asymmetry**, not codegen drift — see the False-positive
Analysis below.

### 2. Route cross-check real (non-skip) signal

Built in an out-of-repo scratch tree (committed tree untouched): generated
`route-tree.txt` from `examples/coupon-feature/src/app` and placed it alongside
the committed coupon-feature screen-specs.

```txt
generated tree route token : /(tabs)/coupons        (from src/app/(tabs)/coupons.tsx)
screen-spec routes         : /(tabs)/coupons         (coupon-list/screen-spec.md)
                             /coupons/[id]           (coupon-detail/screen-spec.md)
```

`route-cross-check --docs <scratch> --json` is **byte-identical across the two
runs at the same scratch path** (528 B / `4a7c54b6…` at this run's temp
location), **exit 0**, and surfaces exactly one warning — the `/coupons/[id]`
drift with file attribution (isomorphic to the `tier2-route-cross-check-001.md`
demo):

> **Caveat — this byte count / sha is not a portable reproduction key.** It is
> location-dependent: the top-level `docs` field is a `cwd`-relative path echo
> (F3), so its length — and thus the serialized byte stream — varies with the
> scratch directory's path. An independent re-run at a different path produced
> `514 B / 2a5ddc97…` (scratch `pr65-scratch`) while the *finding* was
> unchanged. The portable invariant is the finding, not the sha:
> `warning_count: 1`, `spec_not_in_tree: [/coupons/[id] →
> domains/coupons/screens/coupon-detail/screen-spec.md]`, `tree_not_in_spec: []`
> — all `docsDir`-relative posix. (Same cross-runner determinism gap noted in
> Evidence 6 / Promotion Telemetry.)

```json
{
  "route_tree_found": true, "screen_spec_count": 2, "skipped": false,
  "spec_route_count": 2, "tree_route_count": 1,
  "spec_not_in_tree": [
    { "route": "/coupons/[id]", "files": ["domains/coupons/screens/coupon-detail/screen-spec.md"] }
  ],
  "tree_not_in_spec": [], "warning_count": 1
}
```

Human form (warnings to **stderr**, stdout empty / pipeline-friendly), exit 0:

```txt
route-cross-check — WARNING: ScreenSpec route ↔ route-tree mismatch (warning-first, non-blocking)
  route-tree: _meta/route-tree.txt
  ScreenSpec route not in route-tree: /coupons/[id]  (domains/coupons/screens/coupon-detail/screen-spec.md)
```

**Supplementary Direction-2 witness.** To make the bidirectional asymmetry
concrete, a second scratch app added one *undocumented* route
(`(tabs)/settings.tsx`, no screen-spec). The cross-check then surfaces **both**
directions (warning_count 2, exit 0):

```txt
  ScreenSpec route not in route-tree: /coupons/[id]            (Direction 1)
  route-tree route without ScreenSpec: /(tabs)/settings        (Direction 2)
```

### 3. Dogfood surface (#63) — minimal-custom reproduced by codegen-core

`examples/codegen-adapter/minimal-custom` is reproduced deterministically by
`codegen-core` — already covered by `codegen-core.test.mjs` C21–C25 (all pass in
Evidence 4; mirrors router-adapter S3/S5/S7/S4):

- **C21** — `loadCodegenAdapter` resolves a non-built-in custom adapter via
  `{module}` and via path string (never by name lookup) (S7).
- **C22** — custom adapter renders byte-identical manifest + client/hook
  goldens, stable across repeats (S3).
- **C23** — core owns ordering: the adapter discovers unsorted, the core
  normalizes deterministically (input array not mutated) (S5).
- **C24** — custom conventions flow through the core (conventions-as-config),
  distinct from `openapi-client`.
- **C25** — fail-closed: a missing custom `{module}` and a version-mismatched
  custom adapter are rejected (S4).

### 4. Test signals

```txt
Command: node --test scripts/lib/codegen-core.test.mjs scripts/lib/check-generated-files.test.mjs scripts/lib/route-cross-check.test.mjs scripts/lib/api-manifest.test.mjs
Exit code: 0   (~1.3 s)
Result: tests 70 / pass 70 / fail 0
        — includes C21–C25 dogfood + route cross-check both-directions / EXACT
          ([id] vs :id) / fail-soft skip / route-less-spec / --json stable-sort
          / 3 CLI smoke (exit 0, --json stdout, warnings stderr, skip).
```

```txt
Command: npm test
Exit code: 0   (~4.8 s)
Result:
  test-fixtures — PASS (27 fixtures: 26 pass, 1 xfail, 0 xpass, 0 xdrift, 0 fail)
  node --test    — tests 131 / pass 131 / fail 0
```

### 5. No-coupling confirmation (validate)

```txt
Command: node scripts/validate.mjs
Exit code: 0   (~0.16 s)
Output: workflow:validate — OK (검사 12종 통과)
```

```txt
Command: npm run example:validate   (coupon-feature — the actual CI hard gate)
Exit code: 0   (~0.65 s)
Output: workflow:validate — OK (검사 12종 통과)
```

`validate` passes 12 checks and consumes **neither** the codegen adapter **nor**
the route cross-check. Check 6 (GENERATED-header compatibility) accepts both the
em-dash and TS-ASCII GENERATED banners but does not import or run codegen — the
Tier2 surfaces remain decoupled from the contract gate.

### 6. Platform (Windows)

- **Posix path normalization.** Every finding path in every JSON output uses
  forward slashes. A backslash scan of the captured outputs found **zero**
  Windows path separators in `cg1.json`, `rcc1.json`, `v1a.json`, `scc1.json`,
  and `scc_d2.json`; the single backslash in the coupon-feature `cf1.json` is an
  escaped quote inside a human message (`커밋=\"<!--\"`), not a path separator.
  Sample finding paths: `src/api/generated/getCoupon.client.ts`,
  `domains/coupons/screens/coupon-detail/screen-spec.md`. (Note: the
  `route-cross-check` top-level `docs` field is a `cwd`-relative input echo and
  can be a `../`-climb across the temp dir — this is the documented F3 behavior;
  *findings* are always `docsDir`-relative posix.)
- **All warning-first tools exit 0** on Windows across every run above: the
  codegen focused check (×4 incl. determinism reruns), route-cross-check (×5:
  kit-default skip, scratch real-signal ×2, human form, Direction-2 witness),
  and the v1 default guard (×4). Only `validate` (a deliberate hard gate, exit
  0/1) and unrelated config-error paths can be non-zero — none were triggered.

## False-positive Analysis

**v1 generated guard — coupon-feature `component-catalog` mismatch (Evidence 1d)
is an expected asymmetry, not drift.** The committed
`examples/coupon-feature/docs/frontend-workflow/design/component-catalog.md` is a
hand-authored placeholder whose header is an HTML comment and which carries an
explicit note:

```txt
<!--
GENERATED FILE — DO NOT EDIT
...
NOTE(MVP-A): catalog-gen.mjs 는 MVP-C 산출물이다. 이 단계에서는 수동 작성을 임시 허용한다.
```

The generator emits the canonical `# GENERATED FILE — DO NOT EDIT` markdown-heading
banner, so the regenerate-and-compare path reports a content mismatch. The
generator itself is deterministic (`CG:deterministic` ok); the mismatch is
purely that this fixture's committed file was never generator-maintained (the
canonical generated golden lives at `examples/component-catalog/basic-ui`). This
is the key promotion hazard for the v1 default guard: **promoting it to a hard
gate would fail any consuming tree that still holds hand-authored or
older-format committed artifacts** until every such tree is regenerated and
committed. Warning-first keeps this exit 0.

**route cross-check — bidirectional asymmetry.** The two directions have very
different false-positive profiles:

- **Direction 1 — ScreenSpec route not in route-tree** (`spec_not_in_tree`):
  high-signal, low FP. A spec declaring a route absent from the app tree is
  almost always real drift — a typo, a renamed/deleted route file, or a doc that
  ran ahead of code. The `/coupons/[id]` case in Evidence 2 is **true drift**
  (the detail screen is documented but no `[id]` route file exists in
  `src/app`).
- **Direction 2 — route-tree route without ScreenSpec** (`tree_not_in_spec`):
  FP-prone / expected-asymmetry surface. Layout routes, group/segment routes
  (`(tabs)`, `(auth)`), index routes, and intentionally-undocumented secondary
  screens all land here. The `/(tabs)/settings` witness in Evidence 2 is exactly
  this class — the tool cannot, by itself, tell "missing doc" (real) from
  "deliberately undocumented layout/secondary route" (expected). Human judgment
  is required, which is precisely why this direction must not gate.
- **EXACT comparison (no normalization)** is a deliberate trade. It avoids
  false *matches* (e.g. treating `/coupons/[id]` and `/coupons/:id` as equal —
  the test suite pins this both ways) because `route-tree.txt` is the adapter
  `rawPath` projection and the screen-spec `route` uses the same raw convention.
  The cost is that any representation drift (`[id]` vs `:id`, group-segment
  presence) shows as a warning rather than being silently normalized away. In
  the coupon-feature fixture this produced **zero** spurious warnings; the FP
  risk is structurally concentrated in Direction 2.

In the canonical coupon-feature demo (Evidence 2, primary), the only warning
emitted is `/coupons/[id]` — classified as **true drift**, with **zero
false-positives** (Direction 2 was empty). A representative FP-prone Direction-2
entry only appeared once a synthetic undocumented route was added.

## Promotion Telemetry Needed

Before choosing a warning-first CI smoke, a hard CI / required check, or CI
`--enforce` for any Tier2 surface, the following is still missing:

- **CI smoke history across multiple PRs/runs.** There is currently *no* CI for
  these surfaces, so there is zero run history: command exit codes, durations,
  flake rate, and whether any failure is real contract drift versus
  environment/setup noise (e.g. fresh-worktree `npm ci`, line-ending or path
  differences across runners). This report is a single local Windows run.
- **Drift frequency and classification (route cross-check).** Over real
  feature work: how often Direction-1 warnings fire, and what fraction are true
  drift vs typo vs doc-ahead-of-code; how often Direction-2 fires, and what
  fraction are layout/group/secondary routes (expected) vs genuinely missing
  docs. A measured **FP rate per direction** is the gating input.
- **v1 default guard readiness across consuming trees.** Inventory of committed
  artifacts that are *not* generator-maintained (the coupon-feature
  `component-catalog.md` placeholder is one). A hard gate requires every
  consuming tree's `route-tree` / `nav-graph` / `component-catalog` to be
  regenerated-and-committed first; the FP rate of `missing-committed` /
  `mismatch` on real projects is unknown.
- **codegen focused-target FP rate on real repos.** Evidence shows byte-stable
  reproduction on the internal fixture (`CG:content` / `CG:stale` ok). Unknown:
  how `CG:stale` behaves against hand-written hooks sharing the
  `src/features/{domain}/hooks/**` path on real projects (the ownership rule is
  manifest-listed outputs ∩ GENERATED marker — its real-world FP rate is
  unmeasured).
- **Determinism under environment variation.** Determinism is confirmed here
  within one machine/run. Cross-platform/cross-runner determinism (line endings,
  locale, Node minor version, path casing) is not yet observed — required before
  any `--enforce`.
- **Human-approval evidence.** A hard gate or required check needs a
  `decision_id` and an explicit rationale recorded in a separate human-owned
  decision PR (OD-4/OD-8 closed the *tool shape*, not the *promotion*).

## Decision Draft

Open Decision candidate: **Tier2 codegen/route gate promotion** (roadmap item 2
residual). Unlike the lint-pack surface (which already has a warning-first CI
smoke from PR-5), the Tier2 surfaces currently have **no CI at all** — so the
status quo here is the "no CI" row, and a warning-first CI smoke would itself be
a step up.

| Option | Meaning | Evidence status |
|---|---|---|
| **no CI** (status quo) | Keep local/package-script checks only; no `.github/workflows` step for the Tier2 surfaces. | Current state. Supported: all surfaces are deterministic and exit 0 locally; no run history exists to justify more. |
| **warning-first CI smoke** | Add non-blocking CI steps (`continue-on-error: true`) running the codegen focused check, `route-cross-check --json`, and/or the v1 default guard — telemetry only, no exit-code gating. | Plausible next step (mirrors the lint-pack PR-5 posture), but **not yet justified** — needs the multi-run smoke history and per-direction FP rates above. Not done here. |
| **hard CI / required check / `--enforce`** | Remove non-blocking behavior, make a required check, or run a Tier2 tool with exit-1 gating. | **Not supported.** Requires measured FP rates, consuming-tree readiness, cross-environment determinism, and a human-approved `decision_id`. The v1 guard's expected-asymmetry mismatch (Evidence 1d) and the route cross-check Direction-2 FP surface are concrete blockers. |

**Current recommendation: keep all Tier2 surfaces warning-first and mark the
decision pending.** No option is selected or resolved here.

## Explicit Non-Changes

- No CI workflow edits (`.github/workflows`); no `continue-on-error` wiring.
- No required check promotion; no CI use of `--enforce`.
- No `artifact-manifest.yaml` status change (`codegen-openapi-client` stays
  `active`/`focused-advisory`; `eslint-workflow-config` stays `planned`).
- No source / generated / golden / test-logic changes. All scratch artifacts
  were written outside the repo (OS temp) and removed; the committed
  coupon-feature tree was read, never modified.
- `roadmap-current.md`: a single item-2 evidence cross-link sub-bullet was added
  (mirroring item 1's evidence line) so this report is discoverable from the
  roadmap — no gate, manifest status, or contract change. (Accepted from the
  PR #65 review; the original slice had deferred it for a report-only diff.)
- No Open Decision resolved or closed; no readiness/validate gate raised or
  lowered.
- No lint-pack / Interaction Matrix work started (this slice covers the Tier2
  surfaces only).

## Verification Commands

```txt
npm ci
node scripts/check-generated-files.mjs --artifact codegen-openapi-client --src examples/codegen-adapter/openapi-client/src --json
node scripts/route-cross-check.mjs --json
node scripts/check-generated-files.mjs --json
node scripts/check-generated-files.mjs --json --docs examples/coupon-feature/docs/frontend-workflow --src examples/coupon-feature/src
node scripts/route-tree.mjs --app examples/coupon-feature/src/app --out <scratch>/_meta/route-tree.txt   # + copy coupon screen-specs into <scratch>/domains
node scripts/route-cross-check.mjs --docs <scratch> --json
node --test scripts/lib/codegen-core.test.mjs scripts/lib/check-generated-files.test.mjs scripts/lib/route-cross-check.test.mjs scripts/lib/api-manifest.test.mjs
npm test
node scripts/validate.mjs
npm run example:validate
```

All commands above were run from `frontend-workflow-kit/` and reproduce the exit
codes and outputs recorded in this report (Windows 11, Node v24.15.0).

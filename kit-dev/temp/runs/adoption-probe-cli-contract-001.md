# Adoption probe CLI contract 001

- run_id: `adoption-probe-cli-contract-001`
- date: 2026-07-12
- base_commit: `486f6c5a72342af17ede9378f220fd0abab2ed13`
- classification: `active`
- scope: `workflow:adoption-probe` CLI input contract and pre-write safety boundary only
- verdict: PASS (local verification; PR CI pending)

## Boundary

This slice does not change adoption analysis, draft/report structure, F3 meaning,
visual bootstrap/consistency scope, readiness/validate subprocess behavior,
policy-draft contents, warning-first exit meaning, or any human-owned gate. It
adds no hard gate, required check, artifact axis, version, or tag.

## Before reproduction

Measured with the base binary against disposable copies of
`examples/adoption-probe/visual-auth-family`, fixed ids, and
`--date 2026-07-12`.

### `--help` side effect

```txt
exit: 0
stdout first line: workflow:adoption-probe — draft-only run complete
run directory: created
```

Files created under `temp/runs/adoption-probe-help-guard/`:

```txt
.gitignore
adoption-report.md
component-catalog.observed.md
implementation-mode-policy.draft.yaml
implementation-mode-policy.migration.md
observations/catalog.json
observations/catalog.stderr.txt
observations/catalog.stdout.txt
observations/readiness.json
observations/readiness.stderr.txt
observations/readiness.stdout.txt
observations/state.json
observations/state.stderr.txt
observations/state.stdout.txt
observations/validate.json
observations/validate.stderr.txt
observations/validate.stdout.txt
probe-summary.json
project-layout.draft.yaml
scratch/project/docs/frontend-workflow/_meta/screen-inventory.yaml
scratch/project/docs/frontend-workflow/_meta/workflow-state.yaml
scratch/project/docs/frontend-workflow/design/component-catalog.md
scratch/project/docs/frontend-workflow/domains/auth/screens/login/figma-component-mapping.md
scratch/project/docs/frontend-workflow/domains/auth/screens/login/screen-spec.md
scratch/project/docs/frontend-workflow/domains/auth/screens/signup/screen-spec.md
scratch/project/src/components/ui/BrandLogo.tsx
scratch/project/src/components/ui/Button.tsx
scratch/project/src/features/auth/AuthShell.tsx
scratch/project/src/features/auth/LoginScreen.tsx
scratch/project/src/features/auth/SignupScreen.tsx
scratch/project/src/lib/i18n.ts
testid-intake-note.md
tier3-gap-report.md
tier3-live-wiring-implementation-note.md
visual-spec-intake-note.md
```

### Other fail-open measurements

| Input | Before exit | Observed effect |
|---|---:|---|
| `--visaul` | 0 | typo ignored; full probe run created |
| `--visual=false` | 0 | visual directory + bootstrap observation created |
| `--skip-f3=false` | 0 | string treated truthy; F3 status `skipped`, no `scratch-f3` |
| `--visual --skip-visual-consistency=false` | 0 | consistency observation absent (skip enabled) |
| `--json=false` | 0 | JSON mode enabled (`stdout` began with `{`) |
| `accidental-positional` | 0 | positional dropped; full probe run created |
| missing explicit `--repo` | 0 | missing target and its `temp/runs` tree created |
| `--__proto__=x` | 0 | full probe run created; prototype setter absorbed the key |
| `--constructor=x` | 0 | full probe run created |
| `--prototype=x` | 0 | full probe run created |

## Root cause

`scripts/lib/adoption-probe.mjs` carried a private parser clone using a normal
object. It had no option allowlist, dropped positional arguments, did not
distinguish value and boolean flags, and had no help branch. `Boolean(string)`
then turned boolean values such as `"false"` into enabled modes. Normal-object
assignment also made `__proto__` a prototype setter instead of an enumerable
own key. Finally, `normalizeOptions` accepted a missing repo and recursive output
creation materialized the typo path.

## Fix

- Removed the parser clone; the CLI now uses the shared null-prototype
  `parseArgs` and `enforceCliFlagContract` with an adoption-only allowlist.
- Preserved scalar duplicate last-wins and `--repo` over `--repo-root`
  precedence.
- Kept `runAdoptionProbe(flags)` as a programmatic API without CLI allowlist
  enforcement.
- Fixed the CLI order to parse → syntax contract → help → explicit repo
  existing-directory check → visual semantic guard → normalize → run.
- Added side-effect-free help and natural return.

## After matrix

Direct disposable-run measurements:

| Input | Exit | stdout | Run/target write |
|---|---:|---|---|
| valid `--help` with repo/out/id | 0 | help text | filesystem digest unchanged; run absent |
| `--visaul` | 2 | empty | run absent |
| `--visual=false` | 2 | empty | run absent |
| `--skip-f3=false` | 2 | empty | run absent |
| `--visual --skip-visual-consistency=false` | 2 | empty | run absent |
| `--json=false` | 2 | empty | run absent |
| positional | 2 | empty | run absent |
| `--__proto__=x` | 2 | empty | run absent |
| `--constructor=x` | 2 | empty | run absent |
| `--prototype=x` | 2 | empty | run absent |
| `--visual-domain auth` without `--visual` | 2 | empty | run absent |
| `--visaul --visual-domain auth` | 2 | empty | unknown typo reported first; run absent |
| missing explicit `--repo` | 2 | empty | missing target remains absent |

Every exit-2 message uses the `workflow:adoption-probe:` prefix and the shared
`Try \`node scripts/adoption-probe.mjs --help\`.` hint.

## Compatibility

- A base-HEAD disposable worktree and the fixed worktree ran against the same
  target/out/id/date. The public outputs-only JSON was byte-identical for both a
  normal no-visual probe and a normal visual probe.
- Existing adoption regression tests pin report sections, `probe-summary.json`
  shapes/invariants, live docs/src non-mutation, visual bootstrap/consistency
  scope, canonical-contract non-overwrite, path redaction, deterministic visual
  summaries, and visual child-failure warning-first behavior.
- New tests pin existing directories, `--repo-root`, omitted repo/cwd, both
  aliases together, scalar last-wins, `--repo` precedence, and programmatic API
  compatibility.

## Packed payload

`distribution.test.mjs` packs one consumer payload and invokes only its public
CLI. It verifies:

- packed `adoption-probe.mjs --help`: exit 0, no run directory;
- packed `--hlep`: exit 2, no run directory;
- packed `--visual=false`: exit 2, no run directory;
- packed normal `--skip-f3 --json`: exit 0, draft report/summary created with
  `draft_only: true` and `hard_gate_promoted: false`.

## Verification

All commands use Linux Node 20 (the CI lower-bound runtime).

```txt
npm ci
node --test scripts/lib/adoption-probe.test.mjs scripts/lib/adoption-probe-cli.test.mjs scripts/lib/telemetry.test.mjs scripts/lib/distribution.test.mjs
npm test
npm run example:state
npm run example:readiness
npm run example:validate
rm -rf ../dist/frontend-workflow-kit && npm run kit:pack
node ../dist/frontend-workflow-kit/scripts/adoption-probe.mjs --help
node ../dist/frontend-workflow-kit/scripts/adoption-probe.mjs --repo <temp-repo> --id packed-normal --date 2026-07-12 --skip-f3 --json
```

Results (Linux Node `v20.20.2`, `TMPDIR=/tmp` so executable-mode tests use the
Linux filesystem rather than the host-mounted Windows temp directory):

| Command | Result |
|---|---|
| `npm ci` | exit 0 |
| focused four-file `node --test` | exit 0; 162/162 pass |
| `npm test` | exit 0; fixture harness 31 total (30 pass, 1 expected xfail); spec runner 818 total (817 pass, 1 platform skip) |
| `npm run example:state` | exit 0 |
| `npm run example:readiness` | exit 0 |
| `npm run example:validate` | exit 0 (`검사 12종 통과`) |
| fresh `npm run kit:pack` | exit 0; 188 files |
| packed `--help` | exit 0; target filesystem digest unchanged |
| packed normal probe | exit 0; `draft_only=true`, `hard_gate_promoted=false`, `visual.enabled=false` |
| `git diff --check` | exit 0 |

The detached local worktree cannot report GitHub-hosted Ubuntu Node 20,
Ubuntu Node 24, or macOS Node 20 job status. Those three existing jobs remain
the PR-CI confirmation step; no workflow or required-check wiring changed in
this slice.

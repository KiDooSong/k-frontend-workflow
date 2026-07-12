# Generated views CLI argument contract 001

- run_id: `generated-views-cli-contract-001`
- date: 2026-07-12
- baseline: `2e6e570f3393196d43785d08c239b4e3d61396a1` (PR #180 landed HEAD)
- scope: public file-producing CLIs `workflow:route-tree`, `workflow:nav-graph`, `workflow:catalog`
- classification: active implementation evidence
- runtime: Linux Node `v24.14.0`, npm `11.9.0`; `TMPDIR`/`TEMP`/`TMP=/tmp` for POSIX file-mode semantics

This run hardens only CLI syntax and route-tree import entry behavior. Route
discovery/normalization, ScreenSpec/navigation parsing, catalog classification,
generated formats/default paths, adapter versions, barrel warnings,
generated-file guard, and warning-first/hard-gate state are unchanged.

## Phase 0 — supported flags confirmed from consumers

Code, `COMMANDS.md`, package scripts/template, generated-view fixture metadata,
`check-generated-files.mjs`, `workflow-report.mjs`, `workflow-run.mjs`, and tests
were searched before editing.

| CLI | Value flags | Boolean flags | compatibility witnesses |
|---|---|---|---|
| route-tree | `app`, `out`, `router` | `help` | default Expo adapter, custom module-path adapter, scalar duplicate last-wins |
| nav-graph | `docs`, `out` | `json`, `help` | generated guard/docs fixtures, JSON stdout, scalar duplicate last-wins |
| catalog | `src`, `out`, `layout`, `root` | `json`, `dry-run`, `help` | role-root project anchoring, custom layout fixtures, JSON/dry-run, scalar duplicate last-wins |

No new flag was added except the requested `--help` boolean on each CLI.
`package-scripts.template.json` remains unchanged.

## Before reproduction

All reproductions used copies or fresh temp directories; committed fixture output
was never used as a write target. Each case recorded argv, cwd, exit code,
stdout/stderr, file list, requested-path presence, and default-output SHA-256.

| CLI/input | exit | observed mode/write before change |
|---|---:|---|
| route `--help` | 0 | ignored help; wrote default route tree (`7350aa1a…`) |
| route `--app <fixture> --outt requested.txt` | 0 | requested path absent; wrote default (`7350aa1a…`) |
| route bare `--app`/`--out`/`--router` | 0 | fell back to defaults and wrote (`7350aa1a…`) |
| route positional / `--__proto__=x` / `--constructor=x` / `--prototype=x` | 0 | ignored input and wrote default (`7350aa1a…`) |
| import `route-tree.mjs` in a valid fixture cwd | 0 | stdout success + default route tree write (`7350aa1a…`) |
| nav `--help` | 0 | ignored help; wrote default graph (`19d1f7ae…`) |
| nav `--outt requested.yaml` | 0 | requested path absent; wrote default (`19d1f7ae…`) |
| nav bare `--docs` / bare `--out` | 1 | `path.resolve(true)` TypeError stack trace; no write |
| nav `--json=false` | 0 | string was truthy; emitted JSON stdout, no file |
| nav positional / prototype-key inputs | 0 | ignored input and wrote default (`19d1f7ae…`) |
| catalog `--help` | 0 | ignored help; wrote default catalog (`01a313e1…`) |
| catalog `--outt requested.md` | 0 | requested path absent; wrote default (`01a313e1…`) |
| catalog bare `--src`/`--out`/`--layout`/`--root` | 0 | fell back to defaults and wrote (`01a313e1…`) |
| catalog `--json=false` | 0 | string was truthy; emitted JSON stdout, no file |
| catalog `--dry-run=false` | 0 | string was truthy; emitted Markdown preview, no file |
| catalog positional / prototype-key inputs | 0 | ignored input and wrote default (`01a313e1…`) |

The default-path risk was therefore real: a misspelled explicit output did not
create the requested path and instead created/overwrote the canonical default.

## Implementation and validation order

Each CLI now executes:

```text
parse argv
→ enforce per-CLI allowlist/value/boolean/positional contract
→ --help
→ path/config/adapter resolution
→ input scan/build/render
→ stdout or write
```

`route-tree.mjs` additionally uses `isCliEntry(import.meta.url)` with top-level
await. Import alone performs no adapter load/discovery/scan/write and produces no
stdout/stderr; direct execution keeps expected adapter/discover failures on exit 2
and unexpected failures on exit 1.

## After exit/write matrix

The dedicated test runs every listed value/boolean flag and snapshots the full
temp filesystem before/after help and usage failures.

| input class | route-tree | nav-graph | catalog | filesystem result |
|---|---:|---:|---:|---|
| `--help` | 0 | 0 | 0 | unchanged; no input required |
| `--help --unknown` | 2 | 2 | 2 | unchanged |
| `--help=true` / `--help unexpected` | 2 | 2 | 2 | unchanged |
| representative `--outt <path>` | 2 | 2 | 2 | requested/default outputs absent |
| extra `--appp` / `--docss` / `--srcs` | 2 | 2 | 2 | requested/default outputs absent |
| every bare or empty `--value` flag | 2 | 2 | 2 | unchanged; no path/layout/adapter/scan work |
| every `--boolean=false` or absorbed following value | 2 | 2 | 2 | unchanged |
| invalid occurrence followed by valid duplicate | 2 | 2 | 2 | unchanged; invalid occurrence cannot be hidden |
| positional | 2 | 2 | 2 | unchanged |
| `--__proto__=x` / `--constructor=x` / `--prototype=x` | 2 | 2 | 2 | unchanged |
| route-tree import | 0 | n/a | n/a | unchanged; stdout/stderr empty |

Usage stderr matches the shared contract, for example:

```text
workflow:route-tree: unknown option --outt
Try `npm run workflow:route-tree -- --help`.
```

All-valid scalar duplicates retain last-wins. The optional raw-argv input to the
shared validator checks occurrence syntax only and does not replace or change
`parseArgs` value selection.

## PR review follow-up

The first review pass found a first-party integration regression that green CI did
not expose: `check-generated-files` forwarded an explicit `layoutPath` to every
generated-view child. After the strict allowlists, route-tree and nav-graph rejected
that unused option and returned `generator-error` while the warning-first guard
process itself remained exit 0.

`V1_REPRODUCE` now declares `forwardLayout: true` only for component-catalog.
Route-tree continues to receive the role-resolved `--app` path from the parent, and
nav-graph receives only `--docs`; both reproduce as `status: ok` when the parent was
given an explicit layout. Existing component-catalog custom-layout tests prove the
layout is still forwarded where the child consumes it.

The same follow-up pins two other review cases:

- mixed invalid/valid duplicates (`--out= --out valid`, `--json=false --json`,
  `--src --src valid`) exit 2 with write 0
- help Usage and usage-error hints use the public npm aliases that are runnable
  from the standard consumer root

## Compatibility and golden hashes

The dedicated tests compare generated bytes directly and deep-compare stdout
models/renders. No expected or committed generated file changed.

| witness | SHA-256 / result |
|---|---|
| route basic Expo golden | `7350aa1a703a5792e725ecf5cb3b4dcf62f4a767366cb59b34d749796656b1e7` |
| route custom adapter golden | `423d5e8eec193e4db8e2706a7bdc2c0cef196c7197adda9fefa6b65e0e5f725e` |
| nav basic/v2 golden | `19d1f7ae2442bd93a8ff5672f72b239eb7ca06311d6f1588f33887c56a487914` |
| nav stub-destination golden | `754bf50988e44a3c777815e9bc4c9af3a0e017a5dc545838a72768ac1c4c78d8` |
| catalog basic golden | `01a313e1f6fd5c2136d12253363c45ac1f5d688df7692cd0e9bfb0692fdeb707` |
| catalog custom-role golden | `1ea29041478a2b70dd44239826376c1643c4fe8b500d7944bb62f3c83e4539a3` |
| nav `--json` | parsed model deep-equal; output file absent |
| catalog `--json` | parsed model deep-equal; output file absent |
| catalog `--dry-run` | rendered Markdown byte-equal; output file absent |
| duplicate scalar `--out first --out second` | only second path written for all three CLIs |
| generated guard + explicit layout | route-tree/nav-graph/component-catalog remain `status: ok` |

Existing route missing/unknown/version adapter errors, catalog missing-src exit 2,
custom layout header, role resolution, barrel warnings, nav structured/stub behavior,
and fixture golden runs also remain covered by the focused and full suites.

## Packed payload

`distribution.test.mjs` packs a payload under `os.tmpdir()`, links the installed
`yaml` dependency as a consumer install would, and spawns only the packed public
scripts. For all three CLIs, `--help` exits 0 with no write and `--outt x` exits 2
with no requested/default write. It then creates isolated minimal route/nav/catalog
inputs and completes one normal generation per packed CLI. The final manual pack
wrote 189 payload files; the same three packed help commands exited 0.

## Verification commands

| command | result |
|---|---|
| `npm ci` | exit 0; 1 dependency installed, 0 vulnerabilities |
| `node --test scripts/lib/generated-views-cli.test.mjs scripts/lib/route-core.test.mjs scripts/lib/catalog-gen.test.mjs scripts/lib/distribution.test.mjs` | exit 0; 77/77 pass |
| review follow-up focused: generated-view/check-generated/report/run/distribution tests | exit 0; 84/84 pass |
| `node scripts/test-fixtures.mjs` | exit 0; 31 fixtures = 30 pass, 1 expected xfail, 0 xpass/xdrift/fail |
| `npm test` | exit 0; 828 tests = 827 pass, 1 platform-specific skip, 0 fail |
| `npm run example:state` | exit 0 |
| `npm run example:readiness` | exit 0 |
| `npm run example:validate` | exit 0; 12 checks pass |
| `npm run workflow:validate` | exit 0; 12 checks pass, expected kit-root cold-start warning |
| `npm run workflow:check-generated` | exit 0; expected kit-root missing-committed/input observations, warning-first and no writes |
| `rm -rf ../dist/frontend-workflow-kit && npm run kit:pack` | exit 0; 189 files |
| packed `route-tree.mjs --help` | exit 0 |
| packed `nav-graph.mjs --help` | exit 0 |
| packed `catalog-gen.mjs --help` | exit 0 |
| `git diff --check` | exit 0 |

The first local all-suite attempt inherited a Windows `TEMP` path while using a
Linux Node binary. Files there appear executable, so the unrelated upgrade-planner
tests correctly classified mode drift as conflicts. Re-running with POSIX `/tmp`
made its 51 runnable tests pass and the complete suite pass; no product code was
changed for this environment-only condition.

## Boundary result

- version remains `0.3.0-mvp.2`; no release/tag
- generated content and normal invocation bytes unchanged
- no telemetry/workflow-run/visual CLI implementation changes; no check-generated
  result or gating semantics changes
- no live policy/manifest changes
- no new gate, required check, gate promotion, or artifact axis

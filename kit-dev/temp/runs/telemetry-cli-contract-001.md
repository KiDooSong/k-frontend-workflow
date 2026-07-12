# Telemetry CLI argument contract 001

- run_id: telemetry-cli-contract-001
- date: 2026-07-12
- base: `415d853` (`origin/main` at task start)
- scope: `workflow:telemetry` public CLI argument syntax only
- classification: active implementation evidence
- boundary: surface registry/selection, child and ingest behavior, normalization, warning counts, ledger schema/version/bytes, determinism witness, warning-first `--check`, CI artifact posture, version/tag unchanged

## Before — silent fail-open reproduction

All commands ran from `frontend-workflow-kit/` against a fresh `<tmp-root>` containing only an empty `docs/frontend-workflow/`. Each row recorded argv, exit, stderr, output mode, selected surface ids, filesystem snapshot, and requested ledger existence. The committed example and CI artifact paths were not used.

| argv (after `node scripts/telemetry.mjs`) | exit | stderr | stdout / selected surfaces | files after | intended ledger |
|---|---:|---|---|---|---|
| `--root <tmp-root> --outt telemetry-ledger.json --json` | 0 | empty | JSON report / `route-cross-check`, `doc-drift`, `readiness-eval` | none | absent |
| `--root <tmp-root> --otu telemetry-ledger.json --json` | 0 | empty | JSON report / same default 3 | none | absent |
| `--root <tmp-root> --surfac visual-consistency --json` | 0 | empty | JSON report / default 3 (visual intent lost) | none | n/a |
| `--root <tmp-root> --json=false` | 0 | empty | JSON report / default 3 (`false` activated JSON) | none | n/a |
| `--root <tmp-root> --list-surfaces=false` | 0 | empty | human registry (`false` activated list mode) | none | n/a |
| `--root <tmp-root> unexpected-positional --json` | 0 | empty | JSON report / default 3 | none | n/a |
| `--root <tmp-root> --__proto__=x --json` | 0 | empty | JSON report / default 3 | none | n/a |
| `--root <tmp-root> --constructor=x --json` | 0 | empty | JSON report / default 3 | none | n/a |
| `--root <tmp-root> --out= --out telemetry-ledger.json --json` | 0 | empty | observation ledger / default 3 | `telemetry-ledger.json` | present (invalid first occurrence hidden) |
| `--root --root <tmp-root> --json` | 0 | empty | JSON report / default 3 | none | n/a (invalid first occurrence hidden) |
| `--root <tmp-root> --json=false --json` | 0 | empty | JSON report / default 3 | none | n/a (invalid first occurrence hidden) |
| `--root <tmp-root> --outt wrong.json --out correct.json --json` | 0 | empty | observation ledger / default 3 | `correct.json` | typo occurrence hidden |

The `--outt`/`--otu` rows are the primary failure: a ledger-write intent became an ordinary observation run, executed all default child surfaces, returned exit 0, printed a plausible report, and wrote no ledger.

## Root cause

`parseArgs` intentionally accepts arbitrary options and returns a null-prototype `flags` object plus `positionals`. Telemetry validated only selected namespaced prefixes and semantic values; it had no complete allowlist, discarded `positionals`, treated string values on boolean flags as truthy, and inspected only the last parsed scalar occurrence. Therefore an unknown option could disappear into a different valid execution, while a later duplicate could hide an earlier malformed occurrence.

## Applied contract

Telemetry now passes both raw argv and the parsed `{ flags, positionals }` to the existing `enforceCliFlagContract` before help, registry creation/listing, semantic surface checks, root/path resolution, child or ingest work, check reads, ledger writes, and stdout reports. The value/boolean sets live in `scripts/lib/telemetry-cli-args.mjs` as the single source consumed by production and tests.

Exact value allowlist (16):

```txt
root docs src out check determinism-runs include surface
visual-domain visual-screen visual-contract
adoption-run adoption-summary
redteam-include redteam-case doc-drift-include
```

Exact boolean allowlist (6):

```txt
json list-surfaces skip-visual-bootstrap skip-visual-consistency
skip-adoption-visual help
```

The shared parser is unchanged. Every raw occurrence is syntax-checked; all-valid scalar duplicates remain last-wins.

## After matrix

| class | examples | exit | stdout | child/ingest/check read/write |
|---|---|---:|---|---|
| general unknown | `--outt`, `--otu`, `--surfac`, `--docss`, `--determinism-run`, `--visaul-domain` | 2 | empty | 0 |
| prototype key | `--__proto__=x`, `--constructor=x`, `--prototype=x` | 2 | empty | 0 |
| bare/empty value | every value flag as `--flag` and `--flag=` | 2 | empty | 0 |
| boolean value | every boolean flag as `--flag=false`; absorbed following value witness | 2 | empty | 0 |
| unexpected token | front/middle/end | 2 | empty | 0 |
| invalid then valid duplicate | `--out= --out ...`, bare `--root --root ...`, `--json=false --json`, `--list-surfaces=false --list-surfaces`, `--outt ... --out ...` | 2 | empty | 0 |
| valid duplicates | two valid `--root`; two valid `--out` | 0 | normal report | last value used |
| help | `--help`, optionally with syntactically valid paths | 0 | help only | 0 |
| invalid help | `--help=false`, `--help --outt x`, `--help unexpected`, `--help --__proto__=x` | 2 | empty | 0 |
| list | `--list-surfaces`, `--list-surfaces --json` | 0 | registry only, no `available` results | 0 |
| invalid list | boolean value, typo, unexpected token; existing `--out`/`--check` conflict | 2 | empty | 0 |

All usage errors identify the option/token and point to `npm run workflow:telemetry -- --help`.

## Ledger typo three-way regression

One temp root is used for all three paths in `telemetry-cli.test.mjs`:

1. Correct `--out telemetry-ledger.json --json`: exit 0, valid JSON, `kind: observation-ledger`, ledger present.
2. Typo `--outt` and `--otu`: exit 2, stderr identifies typo, stdout empty, ledger absent, filesystem snapshot unchanged.
3. No `--out`, `--json`: exit 0, ordinary report (no `kind`), ledger absent.

This distinguishes an explicit no-ledger observation from a misspelled write intent.

## Compatibility witnesses

- Existing `telemetry.test.mjs` keeps default/visual/adoption/redteam/doc-drift report order and normalization, adoption ingest-only behavior, child unavailable fail-soft behavior, ledger round trips/check drift, deterministic bytes, root-relative inputs, and absence of timestamp/duration/verdict/threshold/promotion fields.
- `ci-telemetry-contract.test.mjs` keeps `continue-on-error: true`, `set +e`, exact ledger/report calls, `always()` summary/upload, 30-day retention, and separation from idempotency/validate gates.
- `distribution.test.mjs` packs first, then runs public payload help/list, `--outt`, `--json=false`, positional, and a normal root-relative ledger outside the source tree. Invalid paths create no ledger/report; the normal ledger parses and leaks no absolute temp path.
- `package-scripts.template.json` and `.github/workflows/frontend-workflow-kit.yml` are byte-unchanged.

## PR review follow-up

- Filesystem snapshots now record every discovered directory as `dir:<root-relative-path>/`, so an otherwise empty directory created on a usage/help/list path changes the snapshot and fails the no-side-effect assertion.
- A focused snapshot test pins nested empty-directory markers.
- The production CLI and table-driven tests import the same `TELEMETRY_VALUE_FLAGS` / `TELEMETRY_BOOLEAN_FLAGS` Sets from `scripts/lib/telemetry-cli-args.mjs`; the public help option lines are also compared exactly with their union.

## Validation

The desktop shell exposed both Windows Node and a bundled Linux Node. Final POSIX validation fixed `TMPDIR/TEMP/TMP=/tmp` so temporary file modes match Ubuntu/macOS CI rather than the inherited Windows temp mount.

| command | result |
|---|---|
| `npm ci` | exit 0; 1 dependency installed, 0 vulnerabilities |
| `node --test scripts/lib/telemetry-cli.test.mjs scripts/lib/telemetry.test.mjs scripts/lib/ci-telemetry-contract.test.mjs scripts/lib/distribution.test.mjs` | exit 0; 144/144 pass |
| `npm test` | exit 0; fixture harness `31` total (`30` pass, `1` expected xfail), Node specs `839` pass, `1` platform skip, `0` fail |
| `npm run example:state` | exit 0; committed example state/inventory reproduced |
| `npm run example:readiness` | exit 0; expected two-screen readiness report |
| `npm run example:validate` | exit 0; `workflow:validate — OK (검사 12종 통과)` |
| `npm run workflow:telemetry -- --list-surfaces --json` | exit 0; fixed 7-surface registry only |
| `npm run workflow:telemetry -- --docs examples/coupon-feature/docs/frontend-workflow --out ../temp/telemetry-cli-contract-ledger.json --json` | exit 0; valid ledger, then generated-local ledger removed |
| `npm run kit:pack` | exit 0; 191-file payload generated after removing prior dist (shared telemetry allowlist module included) |
| `git diff --check` | exit 0 |

Expected PR CI jobs remain the existing unchanged jobs: Ubuntu Node 20 `validate-example`, Ubuntu Node 24 `compat-smoke`, and macOS Node 20 `macos-smoke`. This change adds no blocking telemetry step and no promotion decision.

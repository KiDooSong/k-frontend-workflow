# Commands

Run commands from the consumer repository root after copying the packed payload
to `tools/frontend-workflow/` and merging `package-scripts.template.json`.

Start task routing from [docs/reference/task-artifact-matrix.md](docs/reference/task-artifact-matrix.md). For `generated/do_not_edit` files, use [docs/reference/generated-files.md](docs/reference/generated-files.md).

## Daily Loop

```bash
npm run workflow:state
npm run workflow:readiness
npm run workflow:validate
```

- `workflow:state` reads `docs/frontend-workflow/` and writes `_meta/workflow-state.yaml` plus `_meta/screen-inventory.yaml`.
- `workflow:readiness` computes the highest allowed implementation mode per screen and reports allowed/forbidden paths.
- `workflow:validate` checks frontmatter, manifests, routes, approval metadata, API candidates, input artifacts, and Reconciliation Register structure.

Useful options:

```bash
npm run workflow:state -- --docs docs/frontend-workflow --src src
npm run workflow:readiness -- --screen COUPON-001 --json
npm run workflow:validate -- --json
npm run workflow:doctor -- --root apps/mobile --src apps/mobile/src
```

Use `--root` when the project root is not the current working directory. Use
`--src` when source files live outside `src/`. Use `--layout` when a custom
`project-layout.yaml` declares Tier3/custom layer roles.

## Input Artifacts

```bash
npm run workflow:create-input -- --docs docs/frontend-workflow --from-json input.json
npm run workflow:create-input -- --docs docs/frontend-workflow --source planning --input-type planning --source-ref "planning://auth-copy" --title "Auth copy" --fact "Primary CTA copy is Sign in."
```

`workflow:create-input` turns normalized payloads into canonical
`inputs/{input_id}.md` files. Source-specific Figma/OpenAPI/meeting parsers live
in the consumer repo. The generic producer does not update the Reconciliation
Register, run `reconcile-input`, approve implementation, or promote facts to
confirmed.

For large repos, group inputs by domain (flat output stays the default):

```bash
npm run workflow:create-input -- --docs docs/frontend-workflow --from-json input.json --group-by domain
npm run workflow:create-input -- --docs docs/frontend-workflow --from-json input.json --input-subdir auth/figma
```

`--group-by domain` writes `inputs/{domain}/{input_id}.md` (one domain),
`inputs/_multi/` (multiple domains), or `inputs/_unknown/` (none). `--input-subdir
<path>` writes an explicit relative subdir and takes precedence; `..`/absolute
paths are rejected. `input_id` stays globally unique and the Reconciliation
Register key stays `input_id` regardless of path. `README.md` / `index.md` under
`inputs/**` are directory guides, not input artifacts, and validate skips them.

Reference: [docs/reference/input-reconciliation.md](docs/reference/input-reconciliation.md).

## Screen Identity

```bash
npm run workflow:create-screen -- --docs docs/frontend-workflow --domain auth --screen-id AUTH-SIGNUP-EMAIL --route /signup/email --source-input IN-20260625-visual-spec-001
npm run workflow:create-screen -- --docs docs/frontend-workflow --domain auth --screen-id AUTH-SIGNUP-EMAIL --screen-slug signup-email --route /signup/email --title "Signup Email" --json
```

`workflow:create-screen` scaffolds a stub ScreenSpec at
`domains/{domain}/screens/{screen-slug}/screen-spec.md` once canonical identity is known.
Required: `--domain`, `--screen-id`, `--route`. It validates `screen_id` uniqueness, warns on
duplicate routes, refuses overwrite by default (`--overwrite` to force), and prints next steps.

External source codes (planning/design codes, Figma node ids) are aliases mapped in the Screen
Source Map (`_meta/screen-source-map.md`, from `templates/meta/screen-source-map.template.md`), not
canonical screen ids. The command does not invent screen ids, update navigation-map, resolve Open
Decisions, or promote status to confirmed. Reference:
[docs/reference/screen-identity.md](docs/reference/screen-identity.md).

## Reconciliation Validation

Validate check 12 is active only after
`docs/frontend-workflow/_meta/reconciliation-register.md` exists.

```bash
npm run workflow:validate
npm run workflow:validate -- --enforce
```

- Register absent: check 12 is NO-OP.
- Register row missing and `Reconcile Status=not-started`: warning by default, error with `--enforce`.
- `in-progress`, `failed`, invalid enum, duplicate Input ID, and missing required columns: always errors.
- `reconciled`: passes even when Created Items point at open decisions/gaps/unknowns.

## Generated Views

```bash
npm run workflow:route-tree
npm run workflow:nav-graph
npm run workflow:catalog
npm run workflow:route-cross-check
npm run workflow:doc-drift
npm run workflow:doc-drift -- --include status-heuristic --json
npm run workflow:eval -- --json
npm run workflow:telemetry -- --json
npm run workflow:telemetry -- --out docs/frontend-workflow/_meta/telemetry-ledger.json
npm run workflow:telemetry -- --check docs/frontend-workflow/_meta/telemetry-ledger.json --json
npm run workflow:telemetry -- --include visual --docs docs/frontend-workflow --src src --json
npm run workflow:telemetry -- --include visual --visual-domain auth --json
npm run workflow:telemetry -- --include visual --visual-screen AUTH-001,AUTH-002 --json
npm run workflow:telemetry -- --include adoption --adoption-run temp/runs/adoption-probe-mobile-001 --json
npm run workflow:telemetry -- --include adoption --adoption-summary temp/runs/adoption-probe-mobile-001/probe-summary.json --json
npm run workflow:telemetry -- --include redteam --json
npm run workflow:telemetry -- --doc-drift-include status-heuristic --json
npm run workflow:telemetry -- --list-surfaces --json
npm run workflow:check-generated
```

These commands produce read-only metadata under `docs/frontend-workflow/_meta/`, regenerate the component catalog, compare existing metadata, or measure readiness labels. They do not approve design decisions or replace readiness/validate gates. `workflow:check-generated` is warning-first: it reports generated-file drift without overwriting files or failing on mismatches.

`workflow:doc-drift` is a Phase 0 warning-first diagnostic for Markdown docs. It checks only broken/orphan relative links and dead heading anchors, skips external URL reachability and semantic drift, and always exits 0 even when it reports findings.

`workflow:doc-drift --include status-heuristic` additionally enables the opt-in Phase 1 manifest↔roadmap status heuristic: a narrow same-line keyword cross-check between `catalog/artifact-manifest.yaml` status fields (active/planned) and roadmap wording (완료/active/implemented/구현됨 vs planned/예정/대기; `--manifest`/`--roadmap` override the defaults). It is a heuristic for manual review only — findings are severity `info`, counted in a separate `info_count`, never in `warning_count`, never a gate, and never a semantic-truth claim about roadmap prose. Ambiguous lines carrying both signal kinds (e.g. "planned → active") are skipped. Default `workflow:doc-drift` output is byte-identical to Phase 0; only usage/input errors (unknown include value, missing/corrupt manifest or roadmap for the explicitly requested heuristic) exit 2.

`workflow:eval` is a warning-first readiness measurement harness. It compares labeled cases against `computeReadiness`, reports exact-match, false-open, false-closed, fail-closed leakage, and blocking-kind mismatch metrics, and does not fail because of metric mismatches.

`workflow:telemetry` is a warning-first observation tool. By default it runs only the existing core observation surfaces: it summarizes `route-cross-check`, `doc-drift`, and `workflow:eval` warning counts through their public `--json` CLIs, records unavailable surfaces, and includes the readiness-eval blocking mismatch count. `--out` writes an explicitly requested deterministic ledger snapshot; `--check` compares current telemetry with a ledger and reports ledger drift as warning-only check data. Drift, unavailable surfaces, and findings keep the command on exit 0.

Visual surfaces are opt-in. `--include visual` (or `--surface visual-consistency` / `--surface visual-contract-bootstrap`, which add single surfaces on top of the defaults) additionally observes `workflow:visual-consistency` and `workflow:visual-contract-bootstrap` through their public `--json` output only. `--src` (default `src`), `--visual-domain`, `--visual-screen`, and `--visual-contract` are forwarded to the visual CLIs; `--skip-visual-bootstrap` / `--skip-visual-consistency` drop one of the two included visual surfaces; `--list-surfaces` prints the surface registry without running any child CLI. Telemetry never writes a visual-contract-bootstrap draft (`--out`/`--format markdown` are never forwarded) and never creates or modifies the canonical visual contract. Visual warnings/findings are observations only — not a gate, approval, readiness promotion, or `confirmed` promotion — and a missing contract, missing script, child exit 1, or invalid child JSON keeps telemetry on exit 0 (recorded as skip/unavailable). The default CI telemetry artifact does not include visual surfaces automatically; whether to add a visual telemetry CI artifact is a separate Open Decision that requires human approval first.

The adoption surface is opt-in and ingest-only. `--include adoption` plus `--adoption-run <dir>` (or `--adoption-summary <file>`; the two flags cannot be combined) reads an EXISTING `workflow:adoption-probe` run's `probe-summary.json` and normalizes its summary into one `adoption-probe-summary` surface: probe run id, `draft_only` boundary flag, visual enabled/status, bootstrap/consistency warning counts, component gap candidate count, and the root-relative summary path. Telemetry never runs `workflow:adoption-probe` (with or without `--visual`), never creates a probe run dir or scratch copy, never rewrites the adoption report markdown, and never parses the run's raw `observations/*` files — summary only, and `--skip-adoption-visual` ignores the summary's visual section entirely. Visual warnings plus non-info probe findings count into the surface `warning_count`; info findings never do. `--include all` never implies adoption (an ingest surface needs an explicit input path), so `--include adoption` without a run/summary input is a usage error (exit 2) — telemetry must not silently probe the current repo. A missing or invalid summary file stays exit 0 and is recorded as `available:false`. In a ledger the adoption inputs (`run`/`summary`) are recorded root-relative only when the adoption surface was selected, and the determinism witness for ingest surfaces is `normalized-summary-json` (the same file is re-read and re-normalized per determinism run).

Boundary vs `workflow:adoption-probe --visual`: telemetry `--include visual` observes the visual CLIs directly against the current checkout's docs/src; adoption-probe `--visual` CREATES observations inside a brownfield probe scratch copy; telemetry `--include adoption` only READS the summary an adoption-probe run already produced and includes it in the observation report/ledger. All three are warning-first/review-only observations, not gates, and whether telemetry should ever run adoption-probe itself remains a separate Open Decision (not implemented).

### Telemetry redteam surface

```bash
npm run workflow:telemetry -- --include redteam --json
npm run workflow:telemetry -- --include redteam --redteam-include self-resolve --json
npm run workflow:telemetry -- --include redteam --redteam-case rt-d-to-unknown-current-gap --json
npm run workflow:telemetry -- --include redteam --doc-drift-include status-heuristic --json
npm run workflow:telemetry -- --include redteam --out temp/redteam-telemetry-ledger.json
```

The redteam surface is opt-in (`--include redteam`, `--surface redteam`, or `--include all` — like the visual group, `all` covers the runnable groups and never implies adoption). Telemetry consumes only the public `workflow:redteam --json` report and normalizes its summary: `case_count`, `observed_gap_count`, `blocked_count`, `fail_closed_count`, `drift_detected_count`, `skipped_count`, and `warning_count` (the red-team report's own warning count — observed gaps and unexpected observations only; expected defense witnesses such as blocked/fail-closed/input-error cases never count as warnings). `--redteam-include` / `--redteam-case` are forwarded to `workflow:redteam` as `--include` / `--case`; they require the redteam surface (usage error exit 2 otherwise), and no mutating flag exists or is ever forwarded. A missing script, child exit != 0, or invalid child JSON is recorded as `available:false` while telemetry stays exit 0. In a ledger, the redteam inputs (`include`/`case`) are recorded only when the redteam surface was selected and the flags were given; the determinism witness is the standard `normalized-json`. Red-team observations in telemetry are never a gate, required check, approval, or readiness/`confirmed` promotion — do not wire them to exit 1 or a required CI check without a separate Open Decision and human approval.

### Doc-drift status heuristic forwarding

```bash
npm run workflow:telemetry -- --doc-drift-include status-heuristic --json
```

Default telemetry does not run the doc-drift status heuristic — the doc-drift surface keeps its Phase 0 args and byte shape. `--doc-drift-include status-heuristic` is the explicit opt-in: it forwards `--include status-heuristic` to the default doc-drift surface, and the surface then carries the child report's `info_count` alongside `warning_count`. Heuristic findings are info-only/manual review: they never inflate `warning_count`, never change any exit code, and are not a semantic-truth claim. An unknown feature value exits 2. In a ledger, `inputs.doc_drift.include` is recorded only when the flag was used, so default ledgers keep the `{root, docs}` inputs byte shape.

CI artifact accumulation is observation-only. The Actions workflow writes the deterministic ledger under `$RUNNER_TEMP/frontend-workflow-telemetry/telemetry-ledger.json`, writes a separate current observation report under `telemetry-report.json`, and uploads both as one artifact so repeated runs within the artifact retention window can become evidence for later human review. The uploaded ledger/report are not a pass/fail verdict, and they are not a gate. The CI telemetry step uses `continue-on-error`, the artifact summary step emits warnings for missing or empty files without failing the job, and artifact upload uses `if: always()` plus `if-no-files-found: warn` so missing observation files do not fail the job. Do not wire telemetry ledger drift to exit 1, a hard gate, or a required check without a separate Open Decision and human approval.

## Visual Consistency

```bash
npm run workflow:visual-consistency -- --docs docs/frontend-workflow --src src --json
npm run workflow:visual-consistency -- --docs docs/frontend-workflow --domain auth
npm run workflow:visual-consistency -- --docs docs/frontend-workflow --screen AUTH-001
npm run workflow:visual-consistency -- --docs docs/frontend-workflow --screen AUTH-001,AUTH-002
```

`--screen` accepts a single canonical screen id or a comma-separated list
(mirroring `workflow:visual-contract-bootstrap --screen`), so both tools can be
scoped identically.

`workflow:visual-consistency` is a warning-first cross-screen diagnostic. It reads
the visual consistency contract (`design/visual-consistency-contract.md`, template:
`templates/design/visual-consistency-contract.template.md`) and cross-checks Screen
Family members against ScreenSpec `screen_id`s, figma-component-mapping coverage,
Shared Component Rules against the component catalog (missing components are
reported as Component Gap candidates, proposal only), forbidden direct screen
imports and ad-hoc positioning near shell-owned components (source heuristics —
skipped without `--src`/`screen_entry`), hardcoded copy candidates (info), and
Visual Exception hygiene (Reason + Decision ID required).

No contract means a quiet skip — cold start is never blocked. Warnings keep exit 0;
only structural errors (missing docs path, malformed contract) exit 1. `--enforce`
promotes warnings to exit 1 but must not be wired into CI or validate without a
separate human decision. Findings are diagnostics, never approval, readiness
promotion, or `confirmed` promotion. Reference:
[docs/reference/visual-reconciliation.md](docs/reference/visual-reconciliation.md).

## Visual Contract Bootstrap

```bash
npm run workflow:visual-contract-bootstrap -- --docs docs/frontend-workflow --src src --json
npm run workflow:visual-contract-bootstrap -- --docs docs/frontend-workflow --src src --domain auth --out temp/visual-contract-draft.md
npm run workflow:visual-contract-bootstrap -- --docs docs/frontend-workflow --src src --format markdown --out docs/frontend-workflow/design/visual-consistency-contract.draft.md
```

`workflow:visual-contract-bootstrap` is a review-only adoption helper for repos that
do not have a visual consistency contract yet (or have a thin one). It scans
ScreenSpec frontmatter (`domain`/`screen_id`/`route`/`screen_entry`/`status`),
figma-component-mapping coverage, the component catalog, and (optionally, with
`--src`) `screen_entry` sources, then proposes candidate screen families with
confidence and evidence, shared shell/logo/header/CTA ownership candidates,
component gap candidates (proposal only), and suggested contract rows. Filters:
`--domain <d>`, `--screen <ID[,ID...]>`; `--contract <path>` overrides the existing
contract location.

Output is a deterministic draft: `--json` for a machine-readable report, `--format
markdown` (default when `--out` is given) for a review-only draft document with
`status: draft` frontmatter. Everything low-confidence stays
`needs-review`/`needs-human-review` — repeated imports are candidate evidence, not
proof of design intent.

If an existing contract is found, bootstrap separates existing rows from suggested
additions and never overwrites it. `--out` pointing at an existing canonical
contract is refused with a `.draft.md` suggestion; scaffolding the canonical path is
allowed only when the file does not exist. There is no `--apply`, `--overwrite`, or
`--enforce` — passing them (or any unknown option) is rejected with exit 1 instead
of being silently ignored.

No ScreenSpec means exit 0 with a "no screens discovered" report. Only structural
errors exit 1: missing docs, malformed existing contract, a canonical overwrite
attempt, or an unknown option. Candidates are never approval, readiness promotion,
Component Gap acceptance, or `confirmed` promotion. Reference:
[docs/reference/visual-reconciliation.md](docs/reference/visual-reconciliation.md)
§Bootstrap / adoption.

## Implementation Packets

```bash
npm run workflow:packet -- --screen COUPON-001
npm run workflow:run -- --screen COUPON-001
npm run workflow:report -- --packet docs/frontend-workflow/_meta/work-packets/WP-001.md
```

Packets consume readiness output. They do not close Open Decisions, mark
candidate facts as confirmed, or widen allowed paths.

## Policy Drafts

```bash
npm run workflow:policy-draft -- --out docs/frontend-workflow/_meta/policy-drafts
```

Policy draft output is a review artifact. It does not replace the live policy,
promote hard gates, or change CI by itself.

## Safety Checks

```bash
npm run workflow:forbidden-paths -- --diff changes.diff --docs docs/frontend-workflow
npm run workflow:forbidden-paths -- --diff changes.diff --docs docs/frontend-workflow --enforce
```

Without `--enforce`, path findings are reported without failing the command.

## Red-Team Suite

```bash
npm run workflow:redteam -- --json
npm run workflow:redteam -- --include self-resolve --json
npm run workflow:redteam -- --include golden-tampering --json
npm run workflow:redteam -- --case rt-d-to-unknown-current-gap --json
```

`workflow:redteam` is a warning-first adversarial observation report. It consumes
the existing readiness / forbidden-paths / test-fixture signals (synthetic
adversarial specs through the real ScreenSpec parser + `computeReadiness`, and
committed adversarial diff fixtures through the real `workflow:forbidden-paths`
CLI — never a live git diff) and reimplements none of their decision logic.

- No gate, no approval, no readiness promotion, no `confirmed` promotion: red-team
  findings, observed gaps, and tampering observations always exit 0. Only
  usage/config errors (unknown flag/group/case id) exit 2.
- `status` is an observation label, not a pass/fail verdict. `blocked` /
  `fail-closed` / `input-error` are witnesses that an existing defense held;
  `drift-detected` records pinned behavior changing; `skipped` records controls or
  fixtures unavailable in this install (`examples/**` are not vendored to
  consumers); `observed-gap` means "a real current gap — needs a human design
  decision", not failure.
- Case groups: `core` (always on: `readiness` fail-closed witnesses,
  `path-backstop` adversarial diffs, the `downgrade` D→U observation) plus opt-in
  `self-resolve` and `golden-tampering` (`--include all` adds every group).
- D→U and self-resolve are observed, not blocked: the D→U downgrade
  (`rt-d-to-unknown-current-gap`) and the open→resolved provenance gap
  (`rt-self-resolve-provenance-gap`) are recorded as `observed-gap` warnings with
  notes. Unknowns stay non-blocking by design, readiness gains no actor tracking,
  and nothing auto-resolves/confirms/closes decisions.
- The golden tampering sentinel is test-only in this release:
  `scripts/lib/redteam.test.mjs` tampers a temp copy of a generated-view golden
  and asserts the existing fixture harness reports the drift; the CLI group
  returns `skipped` with a note. Committed fixtures are never mutated.
- `warning_count` counts only observed gaps and unexpected observations — expected
  defense witnesses never inflate it. Do not promote red-team output to a hard
  gate, required check, or `--enforce` CI step without a separate Open Decision
  and human approval.

## Post-Task Checklist

```bash
npm run workflow:validate
npm run workflow:check-generated
```

Always run `workflow:validate` before finishing. Run `workflow:check-generated` when route, nav, catalog, codegen, lint, policy, or layout sources changed, or when a task in the matrix says a generated view may be stale. The command is advisory and must not be treated as a hard CI gate unless a separate human decision promotes it.

## Lint Adoption

```bash
npm run workflow:lint-gen
npm run workflow:lint-gen -- --check
npm run workflow:lint-baseline -- --counts docs/frontend-workflow/_meta/lint-counts.json
npm run workflow:lint-baseline -- --counts docs/frontend-workflow/_meta/lint-counts.json --enforce
```

Start from `templates/meta/lint-policy.template.yaml`. See [docs/reference/lint-policy-catalog.md](docs/reference/lint-policy-catalog.md) and [docs/reference/lint-policy-rollout-ratchet.md](docs/reference/lint-policy-rollout-ratchet.md). Keep hard CI promotion a separate human decision.

## Upgrade (Vendored Kit)

This is an upgrade tool, not a daily `workflow:*` command — run it from the **new**
packed kit before it replaces the old vendored copy. It compares
`.kit-payload-manifest.json` hashes (current install vs next payload) and only
touches files inside `--current`.

```bash
node /path/to/new/frontend-workflow-kit/scripts/upgrade-vendored-kit.mjs --help
node /path/to/new/frontend-workflow-kit/scripts/upgrade-vendored-kit.mjs \
  --current tools/frontend-workflow --next /path/to/new/frontend-workflow-kit --dry-run --plan kit-upgrade-plan.md
node /path/to/new/frontend-workflow-kit/scripts/upgrade-vendored-kit.mjs \
  --current tools/frontend-workflow --next /path/to/new/frontend-workflow-kit --apply
```

Flags: `--dry-run` (default, no writes), `--apply`, `--plan <path>`, `--json`,
`--prune` (delete upstream-removed orphans), `--allow-conflicts`, `--force-runtime`
(overwrite only `consumer-runtime` conflicts), `--backup-dir <path>`.

Per-file classification:

| Category | Condition | Apply behavior |
|---|---|---|
| `safe-update` | local == install baseline, upstream changed | overwrite |
| `mode-update` | content unchanged locally, upstream changed only file mode | chmod |
| `unchanged` | local == upstream | none |
| `local-modified` | local changed, upstream == baseline | kept |
| `conflict` | local changed AND upstream changed differently | `.upgrade-conflicts/<path>.incoming`; never overwritten by default |
| `new-file` | absent locally, present upstream | added |
| `removed-upstream` | present at install, gone upstream | reported orphan; deleted only with `--prune` |
| `missing-current` | tracked at install, missing locally, present upstream | restored |
| `unknown-local` | local file not in any payload manifest | left untouched |

Safety: never overwrites locally modified files by default, never deletes
upstream-removed files without `--prune`, never runs migrations, and writes only
inside `--current` (plus any `--backup-dir` / `--plan` path you explicitly pass).
Symlinked targets under `--current` are refused so links can't escape the kit, and
consumer `docs/frontend-workflow/**`, app source, and root config are never touched
automatically. An install with no `.kit-install-manifest.json` gets a
conservative "unmanaged baseline" plan; after the first apply it becomes
manifest-based. Consumer-impacting migration notes
([docs/reference/upgrade-notes.md](docs/reference/upgrade-notes.md)) are embedded in
every plan. The tool is advisory and is not a hard CI gate.

## Adoption Probe

```bash
npm run workflow:adoption-probe -- --repo apps/mobile --out temp/runs/adoption-probe-mobile-001 --id mobile-001
npm run workflow:adoption-probe -- --repo apps/mobile --visual
npm run workflow:adoption-probe -- --repo apps/mobile --visual --visual-domain auth --json
npm run workflow:adoption-probe -- --repo apps/mobile --visual --skip-visual-consistency
npm run workflow:adoption-probe -- --repo apps/mobile --visual --visual-contract docs/frontend-workflow/design/visual-consistency-contract.md
```

Use adoption-probe for kit adoption assessment or dry-run reports. Treat its
output as review evidence, not a CI hard gate. `--repo-root` is accepted as an
alias for `--repo`.

`--visual` (optional, off by default — default probe output is unchanged without
it) additionally runs `workflow:visual-contract-bootstrap` against the probe
scratch copy, writes a review-only draft to
`<probe-run>/visual/visual-consistency-contract.draft.md`, and — when a canonical
contract exists in the scratch docs, or a bootstrap draft was produced — runs
`workflow:visual-consistency` (against the existing contract, or the draft as an
explicitly advisory baseline). Raw command output lands under
`<probe-run>/observations/visual-*`; the adoption report gains a
`Visual Reconciliation Adoption` section and the JSON output a `visual` summary.
Filters: `--visual-domain <d>`, `--visual-screen <ID[,ID...]>`;
`--visual-contract <path>` overrides the existing contract location;
`--skip-visual-consistency` observes the bootstrap only. Everything stays
draft-only and warning-first: live docs/src are never modified, the draft is
never applied to the canonical contract, and visual findings are never a gate,
approval, or readiness/`confirmed` promotion. Contract reference:
[docs/reference/visual-reconciliation.md](docs/reference/visual-reconciliation.md)
§Bootstrap / adoption.

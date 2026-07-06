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
npm run workflow:eval -- --json
npm run workflow:telemetry -- --json
npm run workflow:telemetry -- --out docs/frontend-workflow/_meta/telemetry-ledger.json
npm run workflow:telemetry -- --check docs/frontend-workflow/_meta/telemetry-ledger.json --json
npm run workflow:check-generated
```

These commands produce read-only metadata under `docs/frontend-workflow/_meta/`, regenerate the component catalog, compare existing metadata, or measure readiness labels. They do not approve design decisions or replace readiness/validate gates. `workflow:check-generated` is warning-first: it reports generated-file drift without overwriting files or failing on mismatches.

`workflow:doc-drift` is a Phase 0 warning-first diagnostic for Markdown docs. It checks only broken/orphan relative links and dead heading anchors, skips external URL reachability and semantic drift, and always exits 0 even when it reports findings.

`workflow:eval` is a warning-first readiness measurement harness. It compares labeled cases against `computeReadiness`, reports exact-match, false-open, false-closed, fail-closed leakage, and blocking-kind mismatch metrics, and does not fail because of metric mismatches.

`workflow:telemetry` is a warning-first observation tool. It summarizes `route-cross-check`, `doc-drift`, and `workflow:eval` warning counts through their public `--json` CLIs, records unavailable surfaces, and includes the readiness-eval blocking mismatch count. `--out` writes an explicitly requested deterministic ledger snapshot; `--check` compares current telemetry with a ledger and reports ledger drift as warning-only check data. Drift, unavailable surfaces, and findings keep the command on exit 0.

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

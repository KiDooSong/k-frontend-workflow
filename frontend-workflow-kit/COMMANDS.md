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
npm run workflow:check-generated
```

These commands produce read-only metadata under `docs/frontend-workflow/_meta/`, regenerate the component catalog, or compare existing metadata. They do not approve design decisions or replace readiness/validate gates. `workflow:check-generated` is warning-first: it reports generated-file drift without overwriting files or failing on mismatches.

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
```

Use adoption-probe for kit adoption assessment or dry-run reports. Treat its
output as review evidence, not a CI hard gate.

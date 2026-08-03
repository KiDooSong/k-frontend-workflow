# Upgrade Notes

Consumer-impacting changes when upgrading the vendored kit under
`tools/frontend-workflow/`. The safe upgrade planner
(`scripts/upgrade-vendored-kit.mjs`) embeds this file in every generated plan.

You do **not** need to reason in terms of "apply up to PR N". The planner
compares file hashes and tells you which files are safe to update, which are
conflicts, and which are orphaned. Read the notes below for the *manual* steps a
hash comparison cannot perform (new directories to create, docs to author,
commands to re-run). If your installed baseline is older than the next ref,
review every note; if it is newer, some notes will already apply.

Notes are ordered newest first. "Manual action" means something the planner will
**not** do for you — it never edits your `docs/frontend-workflow/**`, app source,
or root config.

---

## Input timestamp, fidelity, and Figma Mapping Provenance (#202-B, #209)

- Every canonical input now has a hard `captured_at` contract: valid RFC3339 with an explicit
  timezone (`Z` or `±HH:MM`). Date-only/local timestamps and impossible calendar/time values now
  fail check 11 with `IP-001`; the producer rejects them before input ID generation or writing.
- Existing inputs with valid timestamps need no edit. **Manual action:** find and convert invalid legacy
  timestamps before running the upgraded validator. This is independent of optional fidelity v2.
- Input Fidelity is opt-in with `input_contract: 2`. Existing v1 inputs stay silent. New v2 inputs should
  be produced through `--from-json`/`--from-yaml`; the producer hard-rejects malformed payloads while
  validator IF-1xx findings remain warning-first and are not promoted by `--enforce`. Fidelity does not
  alter confidence, input status, Reconcile Status, or readiness.
- `--overwrite` now protects the existing inheritance graph: it compares before/after IF findings and
  rejects a v2→v1 or verified→unverified replacement when that change newly breaks any reverse dependent.
  Pre-existing unrelated IF warnings do not block a safe overwrite.
- New `figma-component-mapping` files from the shipped template use `provenance_contract: 1`. Legacy
  mapping docs remain silent and are not automatically migrated. To opt one in, make one atomic edit:
  add the contract field, add a canonical `` `M-xxx` · `` key to every 4-column Component Mapping row,
  and add exactly one matching row to the 5-column `## Mapping Provenance` table. Do not add only the
  contract field.
- Mapping validation runs as check 12 even when no Reconciliation Register exists (and with either v1
  or v2 register). MP-0xx is hard; MP-1xx stays warning-first under `--enforce`. The generic
  `## Provenance` marker legend remains a separate, non-machine section.
- Mapping and `Basis=visual-evidence` provenance resolve `inherit` first, then require an effective
  `figma://file/<file>/(node|frame)/<id>` anchor. Planning/API/file-only refs and coarse
  `document`/`statement`/`n/a` units do not satisfy the precision floor.
- **Manual action:** after vendoring, run `workflow:validate`; repair IP errors first, then opt in only
  mappings whose source/evidence/unit/timestamp can be stated without invention.

## Fixture hook bootstrap and active hook Slice Paths (#211)

- `rough-fixture-ui` no longer requires `fake_hook_exists == true`; it is now the
  stage where a greenfield screen may create its first fixture fake hook.
- `final-fixture-ui` now requires the fixture hook to exist and allows
  `{roles.hook}` so the screen/hook contract can be aligned before API integration.
- A **valid** v2 active hook claim is editable only by its owning screen at
  `rough-fixture-ui` / `final-fixture-ui`, within effective allowed paths. Active
  API-client or `surface_kind:null` claims still require `api-integrated-ui`.
  Deferred/conflicted claims, non-owner checks, `api_required:false`, and every
  invalid v2 contract remain fail-closed.
- **Manual action:** after applying the upgrade, rerun `workflow:state` and
  `workflow:readiness`. Regenerate any existing Work Packet and Run Report from the
  new readiness output; do not reuse their previous path envelope. Run representative
  `workflow:readiness -- --screen <ID> --path <path> --json` checks for hook and
  API-client paths, then run `workflow:validate` and a representative
  `workflow:forbidden-paths -- --diff <name-status-file> --enforce --json` check.

## Per-candidate API deferral and Slice Paths

- Existing ScreenSpec API candidate bullets remain active and need no migration.
- Screens that need partial API wiring may opt into the six-column v2 table
  (`Method|Path|Confidence|Gate|Tracking|Slice Paths`). Every v2 row needs narrow
  hook/API-client Slice Paths using a canonical exact path or terminal `/**`;
  `.`/`..` segments and arbitrary globs are invalid. Safely canonicalizable invalid
  paths remain deny-only provenance. Deferred rows also need an open local Unknown
  or `issue:#N`.
- V2 `api-integrated-ui` output is intentionally narrower. Regenerate state and
  readiness before reusing an existing Work Packet. Deferred/conflicted paths remain
  forbidden even if another legacy screen has broad API integration authority.
- For every concrete implementation path, run
  `workflow:readiness -- --screen <ID> --path <path> --json` and require
  `path_authorization.allowed:true`. This file check is required at
  `production-ready` and prevents another screen from borrowing an explicit active
  claim. Duplicate v2 tables remain invalid but all recoverable rows stay deny-only;
  `api_required:false` also preserves authored v2 provenance without granting API authority.
- Legacy broad compatibility still permits truly unclaimed API-client paths; it
  cannot override an explicit v2 active/deferred/conflict path.
- Validate check 15 is warning-only; the live readiness and
  `workflow:forbidden-paths --enforce` paths fail closed.
- **Manual action:** none for legacy screens. For v2 adoption, follow
  [api-candidate-deferral.md](api-candidate-deferral.md), then run state,
  readiness plus representative `--path` checks, validate, and a representative
  forbidden-paths diff.

## Visual axis, telemetry, and red-team observation surfaces

- `visual-consistency-contract` is a **review-only** document you create when
  needed (`docs/frontend-workflow/design/visual-consistency-contract.md`); its
  absence is a silent skip, never a warning. The frontmatter schema now accepts
  `artifact_type: visual-consistency-contract`, so contracts authored from the
  shipped template pass `workflow:validate` check 1.
- `workflow:visual-contract-bootstrap` can draft the contract from existing
  ScreenSpecs (optionally `--src` for import heuristics), but promotion to the
  canonical/confirmed contract is human-only — the draft is never applied
  automatically. With `--src` set, screens without `screen_entry` frontmatter
  are skipped; if **no** selected screen has `screen_entry`, the report now says
  so in `skipped_checks` instead of silently returning zero candidates.
  Repeated local imports whose names miss the shell/logo/header/CTA regexes now
  surface as `kind: unknown` candidates (ownership stays needs-review).
- `workflow:visual-consistency` is **warning-first**: findings are not gates,
  exit stays 0 unless the structure itself is broken. Do not wire it into a CI
  hard gate. Shared component rows can declare `Catalog Status` `domain` /
  `out-of-scope` to record components that are intentionally outside the
  ui_primitive catalog (check 4 reports info instead of a permanent warning).
- Telemetry visual/redteam surfaces are **opt-in observation surfaces** — they
  record adoption/observation data and never gate or promote anything.
- **Manual action:** after upgrading, run `npm run workflow:validate` and, if
  you use telemetry, inspect `npm run workflow:telemetry -- --list-surfaces
  --json` to see the available surfaces. If you maintain adapted copies of the
  root `AGENTS.md` / `CLAUDE.md` or vendored skill copies (e.g. under
  `.agents/`), re-sync them with the new reference docs and scripts — the
  planner flags conflicts but does not merge your adaptations.

## Grouped input artifact directories

- `workflow:create-input` can now group input artifacts by domain or an explicit
  subdir: `--group-by domain` writes `inputs/{domain}/{input_id}.md`,
  `inputs/_multi/`, or `inputs/_unknown/`; `--input-subdir <path>` writes an
  explicit relative subdir (`..`/absolute rejected).
- `input_id` stays globally unique and the Reconciliation Register key stays
  `input_id` regardless of path.
- `README.md` / `index.md` under `inputs/**` are treated as directory guides, not
  input artifacts; validate skips them.
- **Manual action:** none required — flat output stays the default. Adopt grouping
  only if your `inputs/` tree is large. See
  [input-reconciliation.md](input-reconciliation.md).

## Distribution payload cleanup

- The consumer payload is an explicit allowlist defined by
  `distribution-manifest.yaml`; only allowlisted files are vendored.
- Dev/design/history docs are no longer shipped (they moved to the kit repo's
  `kit-dev/`). `examples/` and `temp/` are never vendored.
- Packed kits now include a deterministic `.kit-payload-manifest.json` with a
  sha256 + classification per file, which powers this safe upgrade flow.
- **Manual action:** if you previously copied the *entire* kit directory, run the
  upgrade planner once to produce a conservative plan, then remove stale
  `examples/`, `temp/`, and design/history/roadmap/run-report files from your
  vendored copy. After the first managed apply, future upgrades are manifest-based.

## Workflow spine and numbered stage docs

- `docs/reference/workflow-spine.md` indexes numbered stage docs
  (`workflow-stages/00-start-here.md` … `10-policy-layout-tier3-changes.md`).
  Agents start at the spine, then read only the matching stage doc.
- **Manual action:** point your root `AGENTS.md` / `CLAUDE.md` at
  `docs/reference/workflow-spine.md` and `workflow-stages/00-start-here.md`. If you
  customized `templates/repo/AGENTS.template.md`, that file may be flagged as a
  conflict — re-apply your edits on top of the new template.

## Screen identity and Screen Source Map

- Source screen codes (planning `A-001`, design `J010`, Figma node ids, slugs) are
  **aliases**, not canonical Screen IDs. The canonical mapping lives in
  `_meta/screen-source-map.md`.
- `workflow:create-screen` scaffolds a stub ScreenSpec once canonical identity is
  known; it does not invent screen ids, edit navigation-map, resolve Open
  Decisions, or promote status.
- **Manual action:** create `_meta/screen-source-map.md` from
  `templates/meta/screen-source-map.template.md` if you use external source codes.
  See [screen-identity.md](screen-identity.md).

## create-input producer

- `workflow:create-input` turns normalized payloads into canonical
  `inputs/{input_id}.md` files. Source-specific Figma/OpenAPI/meeting parsers stay
  in the consumer repo. The generic producer never edits the Reconciliation
  Register, runs reconcile, approves implementation, or promotes facts to
  confirmed.
- **Manual action:** none for the kit; keep your source-specific producers in the
  consumer repo (they are not part of the payload and are never overwritten).

## Route extraction hardening

- Route/screen separation is enforced through ScreenSpec `route_entry` (router
  shell) vs `screen_entry` (product screen). `readiness` `allowed_paths` /
  `forbidden_paths` remain the real edit boundary.
- **Manual action:** none — behavior is backward compatible. Re-run
  `workflow:state` and `workflow:route-cross-check` after upgrading.

## API contract kind support

- API manifest confirmed rows can link `zod`, `ts-type`, `openapi`, or `manual`
  contract kinds. `ts-type` is exported-type evidence (not runtime validation);
  `unknown` is tracking-only and does not satisfy confirmed API evidence.
- **Manual action:** none required; existing manifests keep working. Adopt the new
  kinds when you have concrete contract evidence.

---

## Recommended validation after any upgrade

Run from the consumer repo root once safe updates are applied and conflicts are
resolved:

```bash
npm run workflow:doctor
npm run workflow:state
npm run workflow:readiness
npm run workflow:validate
```

None of these are hard CI gates unless a separate human decision promotes them.

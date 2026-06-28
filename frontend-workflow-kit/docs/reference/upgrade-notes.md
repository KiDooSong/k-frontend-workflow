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

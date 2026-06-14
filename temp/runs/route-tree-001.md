# MVP-C Phase 0 — route-tree generator (run route-tree-001)

Branch: `feat/mvp-c-route-tree` (worktree `k-frontend-workflow-route-tree`).
Deterministic Expo Router `src/app` file-tree → `route-tree.txt` generator. Source of truth is the
`src/app` FILE TREE; ScreenSpec frontmatter.route is NOT consulted.

## 1. Implemented files

| File | Role |
| --- | --- |
| `frontend-workflow-kit/scripts/lib/route-tree.mjs` | Pure logic: `scanAppDir` (recursive deterministic scan), `computeRoute`, `renderRouteTree`, `ROUTE_COL=37`. No I/O of its own beyond `fs.readdirSync`. |
| `frontend-workflow-kit/scripts/route-tree.mjs` | CLI wrapper. `--app <dir>` (default `src/app`), `--out <file>` (default `docs/frontend-workflow/_meta/route-tree.txt`). Exits 2 if app dir missing. |
| `frontend-workflow-kit/examples/route-tree/basic-app/src/app/**` | 5-file fixture tree (`_layout.tsx`, `index.tsx`, `(tabs)/_layout.tsx`, `(tabs)/home.tsx`, `coupons/[id].tsx`). |
| `frontend-workflow-kit/examples/route-tree/basic-app/docs/frontend-workflow/_meta/route-tree.txt` | Generated output. |
| `frontend-workflow-kit/examples/route-tree/basic-app/expected/route-tree.txt` | Known-good snapshot (byte-identical copy of the generated file). |
| `frontend-workflow-kit/examples/route-tree/edge-cases/src/app/**` | Edge-case fixture (added in Codex round 1): group index `(tabs)/index.tsx`, nested index `(tabs)/settings/index.tsx`, folder index beside dynamic (`coupons/index.tsx` + `coupons/[id].tsx`). Pins non-root `index` → directory route with **no** trailing slash. |
| `frontend-workflow-kit/examples/route-tree/edge-cases/{docs/…/_meta,expected}/route-tree.txt` | Edge-case generated output + golden snapshot. |
| `temp/runs/route-tree-001.md` | This report. |

## 2. Route extraction rules

- **Source of truth = `src/app` file tree.** ScreenSpec frontmatter.route is never read (cross-validation deferred).
- `index.<ext>` → the directory's route; at the app root that is `/`.
- `<name>.<ext>` → directory route + `/` + `<name>`.
- **Route groups** like `(tabs)`, `(auth)` are kept VISIBLE in the route — not normalized away (e.g. `/(tabs)/home`).
- **Dynamic segments** like `[id]` are kept literally (e.g. `/coupons/[id]`).
- `_layout.<ext>` is a layout marker → appears in the tree but gets NO route annotation.
- Recognized screen extensions: `.tsx`, `.ts`, `.jsx`, `.js`.
- **Deterministic sort:** within each directory, files first (ascending) then directories (ascending),
  using default `Array.prototype.sort()` = UTF-16 code-unit order (locale-independent).
- **No timestamp / no Date / no randomness.** Header is a fixed 3-line block
  (`# GENERATED FILE — DO NOT EDIT` / `# Source: src/app/**` / `# Command: npm run workflow:route-tree`),
  then a blank line, then `/`, then the box-drawing tree. Same input ⇒ byte-identical output.
- Directories are rendered with a trailing `/`; screen files get their `route:` annotation aligned at column 37.

## 3. Fixture matrix

| Input file (under `basic-app/src/app/`) | Kind | Produced route |
| --- | --- | --- |
| `_layout.tsx` | layout marker | (none) |
| `index.tsx` | screen | `/` |
| `(tabs)/_layout.tsx` | layout marker | (none) |
| `(tabs)/home.tsx` | screen | `/(tabs)/home` |
| `coupons/[id].tsx` | screen (dynamic) | `/coupons/[id]` |
| `(tabs)/` directory | directory | (none — rendered as `(tabs)/`) |
| `coupons/` directory | directory | (none — rendered as `coupons/`) |

Generated `route-tree.txt`:

```
# GENERATED FILE — DO NOT EDIT
# Source: src/app/**
# Command: npm run workflow:route-tree

/
├─ _layout.tsx
├─ index.tsx                         route: /
├─ (tabs)/
│  ├─ _layout.tsx
│  └─ home.tsx                       route: /(tabs)/home
└─ coupons/
   └─ [id].tsx                       route: /coupons/[id]
```

### Edge-case fixture (`edge-cases/`) — pins non-root `index`

| Input file (under `edge-cases/src/app/`) | Kind | Produced route |
| --- | --- | --- |
| `(tabs)/index.tsx` | screen (group index) | `/(tabs)` |
| `(tabs)/settings/index.tsx` | screen (nested index) | `/(tabs)/settings` |
| `coupons/index.tsx` | screen (folder index) | `/coupons` |
| `coupons/[id].tsx` | screen (dynamic) | `/coupons/[id]` |

Non-root `index.<ext>` maps to the directory route **without** a trailing slash (`/coupons`, not
`/coupons/`), consistent with sibling routes such as `/coupons/[id]`. Generated `route-tree.txt`:

```
# GENERATED FILE — DO NOT EDIT
# Source: src/app/**
# Command: npm run workflow:route-tree

/
├─ _layout.tsx
├─ (tabs)/
│  ├─ _layout.tsx
│  ├─ index.tsx                      route: /(tabs)
│  └─ settings/
│     └─ index.tsx                   route: /(tabs)/settings
└─ coupons/
   ├─ [id].tsx                       route: /coupons/[id]
   └─ index.tsx                      route: /coupons
```

## 4. Commands run

| Command | Result |
| --- | --- |
| `node --check scripts/route-tree.mjs && node --check scripts/lib/route-tree.mjs` | OK (`CHECK_OK`) |
| `npm ci` | needed — worktree `node_modules` was a symlink into the primary repo whose target was empty (`yaml` absent). `npm ci` installed `yaml` into a real, gitignored `node_modules`. `added 1 package`. |
| `node scripts/route-tree.mjs --app …/basic-app/src/app --out …/_meta/route-tree.txt` | `… route-tree.txt 생성 완료` |
| `mkdir -p …/expected && cp … expected/route-tree.txt` | `COPIED` |
| diff generated vs hand-encoded UTF-8 spec reference | identical (`BYTE_EXACT_MATCH_WITH_SPEC`) — em-dash U+2014 and box-drawing bytes verified |
| `node scripts/route-tree.mjs --out $(mktemp)` then `diff` | `DETERMINISTIC_OK` |
| `diff …/route-tree.txt …/expected/route-tree.txt` | `EXPECTED_MATCH_OK` |
| `npm run example:state` | `2 screen(s)`, wrote workflow-state.yaml + screen-inventory.yaml (regenerated byte-identically — no git change) |
| `npm run example:readiness` | readiness report printed (exit 0) |
| `npm run example:validate` | `workflow:validate — OK (검사 12종 통과)` (exit 0) |
| `npm test` | `tests 15 / pass 15 / fail 0` (exit 0) |
| `git status --short` | only allowed untracked paths; no `M ` lines; `node_modules` absent (gitignored) |

## 5. Known limitations

- Expo `+`-prefixed special files (e.g. `+not-found`, `+html`) are NOT special-cased; they would
  receive a literal route (`/+not-found`). Acceptable for Phase 0; revisit when broadening fixtures.
- ScreenSpec ↔ `src/app` cross-validation (orphan ScreenSpec / unregistered route detection) is
  intentionally DEFERRED to a later PR.
- `route-tree` is NOT yet registered in `catalog/artifact-manifest.yaml` (deferred to the View 5
  generated-file guard). validate check-6 safely skips non-existent files, so the existing suite stays green.
- The npm script `workflow:route-tree` is NOT wired (`package.json` untouched per scope). The file is
  generated via `node scripts/route-tree.mjs` directly.
- Non-route files placed in `src/app` would appear in the tree WITHOUT a route annotation (only
  `.tsx/.ts/.jsx/.js` non-`_layout` files get routes).
- `node_modules` had to be materialized (`npm ci`) because the worktree symlink target was empty; this
  touches only the gitignored dependency store, no tracked file.

## 6. Next step recommendation

1. Wire `npm run workflow:route-tree` in `package.json` (`node scripts/route-tree.mjs`).
2. Register `route-tree` in `catalog/artifact-manifest.yaml` as `kind: generated`, `do_not_edit: true`.
3. Add ScreenSpec route cross-validation (detect orphan ScreenSpecs and unregistered routes).
4. Fold route-tree into the generated-file guard (extend validate check 6).
5. Broaden fixtures: an `(auth)` group, deeper nesting, and a negative/mismatch fixture; consider
   special-casing `+`-prefixed Expo files.

## 7. Codex review log

### Round 1
- **Finding 1 (claimed fixture mismatch) — rejected (hallucination).** Codex asserted the fixtures should be
  `(tabs)/index.tsx`, `(tabs)/explore.tsx`, `+not-found.tsx` — that is the default `create-expo-app`
  template, not this PR. The actual fixtures match the task spec and the PR body exactly. No change.
- **Finding 2 (non-root `index` needs a trailing slash) — rejected; the proposed fix is incorrect.**
  Adding a trailing slash would make `coupons/index.tsx` → `/coupons/`, which is wrong (the list route is
  `/coupons`, matching sibling `/coupons/[id]`). Current behavior is correct. Resolved by **pinning** the
  behavior with the new `edge-cases/` golden fixture (group/nested/folder index), so it is now explicit and
  regression-protected rather than underspecified.
- Note: round 1 ran in a read-only Codex sandbox, so it could not execute the verification commands and its
  findings were static guesses. Round 2 is run with command execution enabled.

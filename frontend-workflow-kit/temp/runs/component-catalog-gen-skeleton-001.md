# Run report — component-catalog generator skeleton (PR-2 / 001)

> Status: PR-2 (catalog-gen skeleton) complete. Date: 2026-06-14.
> Branch: `feat/mvp-c-catalog-gen-skeleton` (new, off `main`).
> Worktree: `.claude/worktrees/mvp-c-catalog-gen-skeleton` (main checkout left on `main`, untouched).
> Deliverables: `scripts/catalog-gen.mjs` (CLI) + `scripts/lib/catalog-gen.mjs` (pure builder/renderer) + this report.
> Implements design §10 "FUTURE PR-2 — catalog-gen 스켈레톤" of
> [`component-catalog-generation-source-contract.md`](../proposals/component-catalog-generation-source-contract.md) (merged in PR #32).
> **NOT done (later PRs, per contract §6/§7/§10):** manifest `planned→active` flip, `do_not_edit` flip,
> `package.json` alias, guard allowlist registration, golden fixture, props/docgen/style analysis.

---

## 0. Scope & worktree decision

- **New branch + worktree, current branch untouched.** A fresh worktree
  (`.claude/worktrees/mvp-c-catalog-gen-skeleton`, repo convention) was created on a new branch off `main`.
  The `main` working tree stayed on `main` the entire time (verified `git rev-parse --abbrev-ref HEAD` → `main`).
- **main advanced mid-session (parallel work).** At session start `main` was `62fc8bf` (PR #32). During the
  session a parallel session merged `feat/grill-adoption` into `main` → `4a4fa21` (skills vendoring; touches no
  component-catalog file). The worktree branched off current `main` @ `4a4fa21`, which **includes PR #32**
  (verified `git merge-base --is-ancestor 62fc8bf HEAD` → ancestor). This keeps the branch current with `main`
  and avoids future merge skew; the grill-adoption changes are orthogonal to this work line.
- **Change set = exactly 2 new generator files + this report.** No existing tracked file modified.

---

## 1. What the skeleton does

A minimal, deterministic generator that scans `src/components/ui/**` and emits a Markdown component catalog.
It is a *working* generator but intentionally **does not** replace the existing manual catalog, register itself
anywhere, or analyze props.

- **`scripts/lib/catalog-gen.mjs`** — pure builder/renderer (IO = file reads only; no writes, no `process.exit`):
  - `classifyComponentFile(absFile, content)` → `{ name, source_path, export_kind, status }` | `null`.
  - `buildCatalog({ src })` → `{ components }`, walked + classified + stably sorted.
  - `renderCatalog(model)` → deterministic Markdown string.
- **`scripts/catalog-gen.mjs`** — CLI mirroring `nav-graph.mjs`: `parseArgs` → `--src`/`--out`/`--json`/`--dry-run`
  → render/write → `import.meta.url` direct-run guard. Reuses `lib/util.mjs` (`parseArgs`, `walkFiles`,
  `readFileSafe`, `writeFile`); **no new external deps** (only `node:path`, `node:url`, `yaml` via util).

CLI: `node scripts/catalog-gen.mjs [--src <dir>] [--out <file>] [--json] [--dry-run]`
(defaults: `--src src/components/ui`, `--out docs/frontend-workflow/design/component-catalog.md`).

Example output (5-component coupon-feature source, via `--dry-run`):

```
# GENERATED FILE — DO NOT EDIT
<!-- Source: src/components/ui/** -->
<!-- Command: node scripts/catalog-gen.mjs --src src/components/ui --out docs/frontend-workflow/design/component-catalog.md -->

## Components

| Name | Source Path | Export Kind | Status |
| --- | --- | --- | --- |
| Button | src/components/ui/Button.tsx | named | ok |
| EmptyState | src/components/ui/EmptyState.tsx | named | ok |
| ErrorState | src/components/ui/ErrorState.tsx | named | ok |
| SegmentedTabs | src/components/ui/SegmentedTabs.tsx | named | ok |
| SkeletonList | src/components/ui/SkeletonList.tsx | named | ok |
```

---

## 2. Decisions (aligned to source contract)

| Area | Decision | Contract |
|---|---|---|
| Source of truth | filesystem walk; scope guard on `/components/ui/` segment (excludes `features/<domain>/components·screens` even when `--src` points at the `src` root) | §1 |
| Identification | basename PascalCase ∩ same-name named export (`export function`/`export const`); **exclude** default export, memo/forwardRef wrapper, `*.styles`/`*.test`/`*.stories`/`*.d`, non-PascalCase (`index`, `queryKeys`…) | §2 |
| Output fields | exactly 4: `name`, `source_path`, `export_kind` (always `named` in v1), `status` (`ok`). No props/docgen/style. | §3 / §8 |
| `source_path` | posix, anchored at `src/components/ui/…` → matches manifest `source: [src/components/ui/**]`; CWD/machine/`--src`-independent | §7.4(f) |
| Format | **H1 em-dash header** + `<!-- Source/Command -->` + `## Components` table; sort by (source_path, name) | §4 (body illustrative) + **user PR-4 freeze** |
| Determinism | tuple comparator (no separator char), no timestamp, `walkFiles` sort + builder re-sort, posix paths, hand-assembled string | §7.4 |
| CLI | mirrors `nav-graph.mjs`; `--json` early-return; `--dry-run` previews without writing; canonical `Command:` is a working `node` call (not the absent `npm run workflow:catalog`) | §A.3 |
| Migration / registration | **none** — manifest, guard allowlist, package alias, `do_not_edit`, golden fixture all deferred | §6 / §7 / §10 |

---

## 3. Process — multi-agent read-only review

After the parent implemented + self-verified, a deterministic background workflow ran **3 independent
read-only auditors** in parallel (no agent wrote/edited/executed a mutating command):

| Lens | Verdict |
|---|---|
| spec-conformance (12 v1 requirements) | **pass** — verified by code citation + `--json`/`--dry-run` execution |
| hard-rule / forbidden-file compliance | **pass** — change set = exactly the 2 allowed files; every forbidden path provably unchanged |
| determinism & correctness bug-hunt | **pass** — no wall-clock/RNG, total-order stable sort, posix paths; 0 blocker/major |

Totals: 3 agents, ~205k subagent tokens, 80 tool uses, `allPass: true`, **0 blocker/major**. Findings addressed:

- **(fixed)** sort-key field separator landed on disk as a raw NUL byte (offset 4238). Replaced the
  `sortKey + magic-separator` approach with a plain `(source_path, name)` **tuple comparator** — no separator
  char at all. Output is byte-identical before/after (SHA256 `9950811C…`); both files now `NUL_count=0`.
- **(documented)** see §5.

---

## 4. Commands run (worktree; `main` tree untouched)

| # | Command | Result |
|---|---|---|
| 1 | `git worktree add -b feat/mvp-c-catalog-gen-skeleton .claude/worktrees/mvp-c-catalog-gen-skeleton main` | worktree on `4a4fa21`; `62fc8bf` (PR #32) is ancestor |
| 2 | `npm ci` (worktree kit) | ok (1 pkg: `yaml`) |
| 3 | `node --check scripts/catalog-gen.mjs` + `scripts/lib/catalog-gen.mjs` | OK |
| 4 | `node scripts/catalog-gen.mjs --src examples/coupon-feature/src --json` | 5 components; `CouponCard`/`CouponListScreen`/`coupons.tsx` route correctly excluded (scope guard) |
| 5 | exclusion decoy fixture (OS temp): default / memo / forwardRef / non-Pascal / `*.styles` / `index` / out-of-scope screen | all rejected; only plain `function`/`const` components kept |
| 6 | generator x2 → SHA256 compare | **byte-identical** (`9950811C…`) |
| 7 | `npm run example:validate` | `workflow:validate — OK (검사 12종 통과)` |
| 8 | `npm test` | **pass 15 / fail 0** |
| 9 | NUL byte scan (both files) | `NUL_count=0` |
| 10 | `git status --porcelain` + forbidden-path diff | only the 2 new files; every forbidden path empty |

---

## 5. Known v1 limitations (documented; not bugs)

- **Commented-out export false-include.** A file whose only matching export sits inside a column-0 block
  comment (`/* … export function Foo … */`) would be cataloged, because identification is regex-based (no AST,
  deferred per contract §3/§7.4(d)). Line/JSDoc comments (`//`, ` *`) are already excluded by the `^\s*export`
  anchor. The real tree has 0 such files; robust parsing is a later phase. Noted at `lib/catalog-gen.mjs` near
  the detection regexes.
- **Header form is H1, not the contract's HTML-comment block.** The renderer emits
  `# GENERATED FILE — DO NOT EDIT` per the **PR-4 freeze format**, whereas contract §4 recommends an
  HTML-comment header block (no on-disk `#`). The H1 form is internally coherent (single H1 banner; no
  `# Component Catalog` title to clash with) and still satisfies validate check 6's em-dash grep. This header
  choice is the last open item to **confirm at PR-4 format-freeze**. Noted at `lib/catalog-gen.mjs` `renderCatalog`.
- The `## Components` table body (vs the contract's illustrative `## Name` sections) is within contract latitude
  — §4 marks the body schema illustrative until OD-6 closes (PR-4).

---

## 6. Hard-rule compliance

| Hard rule (task "절대 하지 말 것") | Status | Evidence |
|---|---|---|
| CI 변경 금지 | ✅ | `.github/**` empty diff |
| hard gate 승격 금지 / readiness·policy 미변경 | ✅ | `readiness.mjs`/`workflow-state.mjs`/policies untouched |
| check-generated-files guard 등록 금지 | ✅ | guard + lib + allowlist unchanged; generator self-registers nothing |
| manifest `planned→active` 금지 | ✅ | `catalog/artifact-manifest.yaml` empty diff |
| `do_not_edit:true` 전환 금지 | ✅ | manifest unchanged |
| package alias 보류 | ✅ | `package.json` / `package-scripts.template.json` unchanged; header `Command:` is a direct `node` call |
| props/docgen/NativeWind/style 분석 금지 | ✅ | absent; 4 fields only |
| Interaction Matrix 구조화 금지 | ✅ | not touched |
| Execution Loop 파일 수정 금지 | ✅ | `workflow-packet.mjs` / workflow-report·run files untouched |
| route-tree / nav-graph 생성기 수정 금지 | ✅ | `route-tree.*`/`nav-graph.*` empty diff |
| 신규 브랜치+워크트리, 현재 브랜치 변경 없이 | ✅ | branch in worktree; `main` tree still on `main` |
| 기존 수동 component-catalog 대체 금지 | ✅ | example catalog untouched; generator writes to its own `--out` only |

---

## 7. Next task

**FUTURE PR-4 — golden fixture + format freeze** (design §10 PR-4; gated on this PR's review/merge):
add `examples/component-catalog/basic-ui/src/components/ui/**` (2–4 components + exclusion decoys) and the
`expected/component-catalog.md` golden, wire the warning-first fixture harness, and **freeze the output format**
(confirm the header decision from §5). No manifest flip / guard graduation / package alias in PR-4 either —
those remain PR-5/PR-6.

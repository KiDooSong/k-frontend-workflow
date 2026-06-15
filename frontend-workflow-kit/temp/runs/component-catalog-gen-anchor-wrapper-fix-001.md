# Run report — catalog-gen anchor + wrapper-detection fix (001)

> Status: fix-forward complete, Codex-reviewed CLEAN. Date: 2026-06-15.
> Branch: `fix/mvp-c-catalog-gen-anchor-wrapper` (new, off `origin/main` @ `2afba7f`).
> Worktree: `.claude/worktrees/catalog-gen-fix` (main checkout untouched).
> Single-file change: `scripts/lib/catalog-gen.mjs` (+ this report).
> Supersedes closed PR #35 — see §0.

---

## 0. Context — why this PR

`main` already carries a `component-catalog` generator skeleton, landed **in parallel** via branch
`fix/catalog-gen-nul-separator` (commits `9829d76` + `12f5aba`, merged `b28e591`) during the original
PR-2 work. That skeleton is sound (tuple-compare sort, `--src` non-directory guard) but only **noted**
two correctness gaps that an adversarial (Codex) review flagged on the equivalent skeleton; this PR
**fixes** them. The original PR #35 (which added a duplicate skeleton) was closed as superseded.

## 1. The two fixes (lib only)

**MAJOR-1 — scope anchor.** main's scope guard matched **any** `/components/ui/` path segment, so a
broad `--src src` false-includes a nested `src/features/foo/components/ui/Badge.tsx` and mis-emits it as
`src/components/ui/Badge.tsx`. Fix: anchor on the canonical `/src/components/ui/` (via `lastIndexOf`, so
the innermost/project-local root wins even when the marker is nested), and derive
`source_path = posixAbs.slice(idx+1)` — the real path from the `src` root, no synthetic prefix.

**MAJOR-2 — wrapper detection.** main's `wrapRe` only fired when `=` sat on the same physical line as
`export const X`, so a memo/forwardRef wrapper with a multiline type head false-included; and a regex
head cannot tolerate `=`/`;` that legitimately live inside a type annotation (generic defaults
`Generic<T = string>`, type literals `{ a: string; b: number }`). Fix: an `isWrappedConst(src, base)`
helper scans the declaration head tracking `<>()[]{}` bracket depth and stops at the **first top-level
(depth 0) assignment** `=` — skipping `=>`, `==`, `>=`, `<=`, `!=` — then tests whether the RHS (after
stripping a leading `/* … */` block comment) is a `memo`/`forwardRef` call. Correct for generic
defaults, type literals, arrow-type annotations, multiline heads, sibling declarations (no bleed), and
the `/* @__PURE__ */` form. Residual OD-5 limitations (rare, documented in code): unbalanced brackets
inside a string literal within a type annotation, and a paren-wrapped `= (React.memo)(…)`.

Happy-path output is **unchanged** — for any well-formed `src/components/ui/**` tree both fixes are
no-ops (same components, same `src/components/ui/<name>.tsx` paths, same bytes; sha256 `9950811c…`).
They only remove false-includes on the pathological inputs above.

## 1a. Review iteration (Codex)

| Round | Codex verdict | Action |
|---|---|---|
| 1 | MAJOR (wrapper regex false-includes type-annotation `=`/`;`) + MINOR (`indexOf` dup-segment) | replaced regex with the `isWrappedConst` bracket-depth scan; `indexOf` → `lastIndexOf` |
| 2 | **CLEAN / merge-ready** (0 findings) | — |

## 2. Verification (new worktree, absolute paths)

| Check | Result |
|---|---|
| `node --check` (cli + lib) | OK |
| unit test — 13 cases: Ghost (nested-ui), Badge (multiline-memo), Arrow (arrow-type-memo), GenDefault (`<T = string>` memo), TypeLit (`{a; b}` memo), PureC (`/* @__PURE__ */` memo), Spinner (forwardRef), Banner (default) **excluded**; Button, Card, Plain (generic-default type, plain), Sibling (no-bleed), Dup (nested-segment path) **included** | ALL PASS |
| coupon smoke | 5 components, `src/components/ui/<name>.tsx` (unchanged) |
| determinism (2 runs) | byte-identical, sha256 `9950811c…` (== pre-fix happy-path) |
| `npm run example:validate` | OK (검사 12종 통과) |
| `npm test` | 15 pass / 0 fail |
| NUL scan (both files) | none |
| `git status` | only `M scripts/lib/catalog-gen.mjs` |

## 3. Hard-rule compliance

Single-file lib edit. No manifest / guard / package-alias / CI / props·style changes. Does not flip
`status` or `do_not_edit`, does not register in `check-generated-files`, does not add `workflow:catalog`.
The manual `component-catalog.md` is untouched. main's `--src` non-directory CLI guard is preserved.

## 4. Next

PR-4 — golden fixture + output-format freeze, on top of this fix (gated on this PR's review/merge).
The fixture's memo/forwardRef and nested-ui exclusion decoys now classify correctly under both fixes.

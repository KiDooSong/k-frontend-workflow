# Run report — catalog-gen anchor + multiline-wrapper fix (001)

> Status: fix-forward complete. Date: 2026-06-15.
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

| # | Gap (on main today) | Fix |
|---|---|---|
| MAJOR-1 | scope anchored on **any** `/components/ui/` segment → `--src src` false-includes a nested `src/features/foo/components/ui/Badge.tsx` and mis-emits it as `src/components/ui/Badge.tsx` | anchor on canonical `/src/components/ui/`; derive `source_path = posixAbs.slice(idx+1)` (the real path from the `src` root, no synthetic prefix) |
| MAJOR-2 | `wrapRe` used `[^\n]*`, so memo/forwardRef detection only fired when `=` sat on the **same physical line** as `export const X` → a wrapper with a multiline type head (`export const X: Type<\n…\n> =\n memo(...)`) false-included | head scan `(?:[^=;]\|=>)*` spans newlines up to the assignment `=`, skipping arrow-type `=>` but never crossing a `;` or another `=` (no sibling-declaration bleed) |

Happy-path output is **unchanged** — for any well-formed `src/components/ui/**` tree both fixes are
no-ops (same components, same `src/components/ui/<name>.tsx` paths, same bytes). They only remove
false-includes on the two pathological inputs above. main's documented residual limitations
(`= /* @__PURE__ */ memo(…)`, `(React.memo)(…)`) remain noted (deeper OD-5 / AST territory).

## 2. Verification (new worktree, absolute paths)

| Check | Result |
|---|---|
| `node --check` (cli + lib) | OK |
| unit test — 8 cases: Ghost(nested-ui)/Badge(multiline-memo)/Arrow(arrow-type-memo)/Spinner(forwardRef)/Banner(default) **excluded**; Button/Card/Sibling(no-bleed) **included** | ALL PASS |
| coupon smoke | 5 components, `src/components/ui/<name>.tsx` (unchanged) |
| determinism (2 runs) | byte-identical, `sha256 9950811c…` (== pre-fix happy-path hash) |
| `npm run example:validate` | OK (검사 12종 통과) |
| `npm test` | 15 pass / 0 fail |
| NUL scan (both files) | none |
| `git status` | only `M scripts/lib/catalog-gen.mjs` |

## 3. Hard-rule compliance

Single-file lib edit. No manifest / guard / package-alias / CI / props·style changes. Does not flip
`status` or `do_not_edit`, does not register in `check-generated-files`, does not add `workflow:catalog`.
The manual `component-catalog.md` is untouched.

## 4. Next

PR-4 — golden fixture + output-format freeze, on top of this fix (gated on this PR's review/merge).
The fixture's memo/forwardRef and nested-ui exclusion decoys now classify correctly under both fixes.

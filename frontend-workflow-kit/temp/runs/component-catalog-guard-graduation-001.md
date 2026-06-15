# component-catalog guard graduation — PR-6 (check-generated-files v1)

PR B of the component-catalog graduation. Registers `component-catalog` as a
**check-generated-files v1 target** so the guard reproduces it to a scratch dir
and compares against the committed golden — reusing the existing
`reproduceArtifact` path verbatim (no new gating branch). Stacks on PR A
(`chore(mvp-c): activate component-catalog generated artifact`), which flipped
the manifest to `status: active` / `do_not_edit: true`.

Branch: `feat/mvp-c-graduate-component-catalog-check-generated` (off PR A HEAD).

## 0. What graduation requires

`selected = generated:true ∧ status:active ∧ do_not_edit:true ∧ id∈allowlist`.
PR A satisfied the first three (manifest flip). PR B adds the fourth (the only
code-level registration) plus the reproduce contract:

1. `V1_ARTIFACT_IDS` — add `component-catalog` (the `selected` gate).
2. `V1_REPRODUCE['component-catalog']` — the `{script, inputFlag, resolveInput,
   outName, committedSubdir}` contract that drives the scratch reproduction.

## 1. Changes

**`scripts/lib/check-generated-files.mjs`**
- `V1_ARTIFACT_IDS`: `['component-catalog', 'nav-graph', 'route-tree']` (sorted).
- `V1_REPRODUCE['component-catalog']`:
  - `script: 'catalog-gen.mjs'`, `inputFlag: '--src'`,
  - `resolveInput: ({ srcDir }) => path.join(srcDir, 'components', 'ui')` — the
    canonical source root (manifest `source: src/components/ui/**`). The
    generator anchors `source_path` on the last `/src/components/ui/` marker, so
    a broader `--src` would be equivalent, but pointing at the canonical dir
    surfaces a missing input precisely.
  - `outName: 'component-catalog.md'`, `committedSubdir: 'design'`.
- `committedPathFor`: now `path.join(docsDir, contract.committedSubdir || '_meta',
  contract.outName)`. route-tree/nav-graph keep `_meta/<outName>` (no
  `committedSubdir`); component-catalog resolves to `design/component-catalog.md`
  (matching the manifest `path`). This is a path parameterization, **not** a new
  gating branch — the reproduce flow (`CG:run/output/deterministic/content`) is
  unchanged and shared across all three artifacts.
- Header/doc comments updated to enumerate the three v1 targets.

**`scripts/check-generated-files.mjs`** (CLI)
- Usage/doc strings only — `route-tree·nav-graph` → `route-tree·nav-graph·component-catalog`.
  No logic change: the CLI is allowlist/contract-driven and already routes any
  `selected` id through `reproduceArtifact`.

**`scripts/lib/check-generated-files.test.mjs`**
- `selectArtifactIds`/`V1_ARTIFACT_IDS` assertions updated to the 3-member set;
  added `selectArtifactIds('component-catalog') → ['component-catalog']`.
- Real-manifest classification test: `component-catalog` now asserted
  `selected: true` (was `selected:false` + `skip_reasons ~ /planned/`).
- New positive smoke test `reproduceArtifact: component-catalog 픽스처가 커밋본을
  재현(ok)` — rebuilds the basic-ui fixture into a temp project layout
  (`<docsDir>/design/component-catalog.md` + `<srcDir>/components/ui`) and asserts
  `status: ok` with passing `CG:content`/`CG:deterministic`. The committed tree
  is never touched (writes only into an OS temp dir).
- The synthetic-manifest (`SYNTH`) `component-catalog` entry is intentionally
  left `planned`/`do_not_edit:false` so the planned-skip branch stays covered.

## 2. Constraints honored

- **reproduce-to-scratch in a temp dir**, committed-vs-regenerated comparison —
  reuses `reproduceArtifact` (double-run + golden compare) verbatim.
- **CRLF-only normalization**, **no timestamp normalization** — the shared
  `normalizeGeneratedViewText` (CRLF→LF, `\`→`/`) is the only normalizer; the
  generator emits no timestamp, so the golden is purely structural.
- **No auto-fix / no overwrite** — committed files are read-only; all writes go
  to an `os.tmpdir()` scratch dir cleaned in `finally`.
- **Default exit 0 / report status** — unchanged warning-first policy. Config
  errors still exit 2. `--enforce` remains the recognized-but-no-op v1 flag; no
  new hard-gate semantics were introduced.

## 3. Out of scope (forbidden / deferred)

- No CI required-check addition; `.github/workflows/frontend-workflow-kit.yml`
  untouched (it runs `test:spec` + `example:*`, not this test or hard gate).
- No hard-gate promotion, no generated-file auto-fix, no output-format change,
  no manifest semantics re-change (PR A owns the manifest), no
  props/docgen/NativeWind/style.
- `scripts/test-fixtures.mjs` line 304 comment ("manifest active 전환·guard
  등록은 후속") is now satisfied but **left as-is** to keep PR B's shared-file
  footprint minimal against the parallel Tier1 session (which the coordination
  note flags as a test-fixtures.mjs editor). Tidy in a later pass.

## 4. Verification (all green, from the worktree kit)

```
node --check scripts/check-generated-files.mjs scripts/lib/check-generated-files.mjs
                                                                       → OK
node --test scripts/lib/check-generated-files.test.mjs                 → 15 pass / 0 fail
                                                       (incl. component-catalog reproduce OK)
node scripts/check-generated-files.mjs --artifact component-catalog --json
                                → selected; status missing-committed (bare kit, no consumer
                                  layout); committed=docs/.../design/component-catalog.md,
                                  input=src/components/ui; exit 0
node scripts/check-generated-files.mjs --json
                                → component-catalog=missing-committed alongside
                                  nav-graph/route-tree (identical bare-kit behavior); exit 0
npm test                                                               → 25 pass / 0 fail
npm run example:test                                                   → component-catalog:basic-ui PASS
npm run example:validate                                               → OK (검사 12종 통과)
```

Note: the guard's own unit test is intentionally **not** wired into any npm/CI
gate (per its file header — "package script/CI 변경 금지"); it is run manually
with `node --test scripts/lib/check-generated-files.test.mjs`, as above.

## 5. Merge hold

Same as PR A: do not merge until the parallel Tier1 integration-dogfood session
confirms no blocker-candidate. PR B stacks on PR A — merge PR A first (or squash
the stack), and rebase if Tier1 touches `check-generated-files.mjs` /
`artifact-manifest.yaml` / `package.json` / `test-fixtures.mjs`.

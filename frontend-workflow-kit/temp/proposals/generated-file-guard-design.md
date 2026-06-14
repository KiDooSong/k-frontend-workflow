# Generated-file guard / check-generated model — design

> Status: DESIGN / SPEC ONLY. 2026-06-14. This document specifies a *future* `scripts/check-generated-files.mjs` for the frontend-workflow-kit. It is **not** an implementation and it instructs no runtime change in this task. It is the full-spec successor to the analysis stub at `frontend-workflow-kit/temp/proposals/generated-file-guard-followup.md` (referred to below as **followup.md**) and resolves the open decisions that document deferred (selector choice, path resolution, block-marker generalization, command nuance). Read alongside `frontend-workflow-kit/catalog/artifact-manifest.yaml` (the central registry) and `scripts/validate.mjs` check 6 (the already-shipped header guard).

---

# 0. Title, purpose, scope & non-goals

## 0.1 Title

**Generated-file guard / check-generated model — design.**

## 0.2 Purpose

The kit ships generators (`workflow-state.mjs`, `route-tree.mjs`, `nav-graph.mjs`) that emit **whole-file** do-not-edit artifacts. A *separate* surface — the in-file `GENERATED:START nav-graph … END` marker block inside each `screen-spec.md` (contract-registered via `screen-spec.generated_sections`) — also exists, but **no generator writes it yet**: `nav-graph.mjs` only emits the whole-file `_meta/nav-graph.yaml`, and the one populated example block (`coupon-feature`) is manual MVP-A content (see §1.4, §1.6, §4.6). Today the only automated protection is `validate.mjs` check 6, which verifies *presence* of the whole-file header (first 400 bytes) and the screen-spec section markers — it cannot detect a hand-edit that leaves the header intact, it silently skips repo-root paths like `eslint.workflow.config.mjs`, and it hardcodes the `screen-spec` key for block markers. This document designs a dedicated, manifest-driven `check-generated-files.mjs` that closes those gaps: it reads `artifact-manifest.yaml` as the single registry of generated artifacts, verifies headers/markers across **all** generated entries (not just docs-relative ones), and — for `status: active` generators only — regenerates each artifact to a scratch directory and compares, so a manual edit to the body of a generated file is caught without mutating any committed file. The guard is **warning-first by default** and becomes blocking only under an explicit `--enforce` flag, leaving CI posture decisions to a future PR.

## 0.3 Scope / Non-goals (hard constraints, re-stated)

This task produces **only this design document**. The following are explicit non-goals and MUST NOT happen as part of this task:

- **Do NOT implement `scripts/check-generated-files.mjs`.** No code, no skeleton, no stub module.
- **No package scripts.** Do not add `workflow:check-generated` to `frontend-workflow-kit/package.json` or to `package-scripts.template.json` live `scripts`. It stays in the `//roadmap` block only, exactly as observed (`scripts/check-generated-files.mjs (MVP-C)`).
- **No CI changes.** Do not add any step to `.github/workflows/frontend-workflow-kit.yml`.
- **No promotion of warning-first checks to hard gates.** The existing golden-fixture step (`example:test`, `continue-on-error: true`) stays warning-first; nothing here removes a `continue-on-error`.
- **Do NOT modify** `validate.mjs`, `workflow-state.mjs`, `route-tree.mjs`, `nav-graph.mjs`, any `scripts/lib/*`, any `test-fixtures` / `examples/**` golden files, docs, README, CHANGELOG, roadmap, or `artifact-manifest.yaml`.
- **Treat `artifact-manifest.yaml` as the central registry, but do NOT edit it in this task.** Every proposed manifest field addition in this document (notably `header_command`) is labelled **PROPOSED (future PR)** and is not to be written now.
- **Do NOT promote `planned` artifacts** (`component-catalog`, `eslint-workflow-config`) as if implemented, and do not make their absent generators a failure condition.

Where a generator or block does not exist yet — the `component-catalog` generator (`catalog-gen.mjs`) and the `screen-spec` **entry-points block generation** — this document says so explicitly and designs those paths as **"planned, must-not-fail."**

---

# 1. Guard surfaces

The guard operates over five distinct *surfaces*. Each is defined by its file shape and its header/marker convention as **observed** in the kit.

## 1.1 Whole-file generated YAML

Examples observed: `workflow-state.yaml`, `screen-inventory.yaml`, `nav-graph.yaml`. Header is a three-line `#` hash-comment block at the very top:

```
# GENERATED FILE — DO NOT EDIT
# Source: ...
# Command: ...
```

YAML body begins immediately after the header (e.g. `nav-graph.yaml` line 4 is `screens:`; `workflow-state.yaml` begins `generated_at: …` then `global:`). Guard behavior: require the marker line as the **first** content line; require `# Source:` and `# Command:` header lines (presence, see §3); for `status: active` entries additionally regenerate-and-compare (§4). Note the observed **double space** after `Source:` in `workflow-state.yaml`/`screen-inventory.yaml` (`# Source:  docs/...`) — header comparison must tolerate internal whitespace (§3.4).

## 1.2 Whole-file generated TXT

Example observed: `route-tree.txt`. Same three-line `#` hash-comment header, then a blank line, then `/` as tree root and box-drawing lines. Guard behavior identical to §1.1 (marker first; Source/Command present; regenerate-and-compare for active). Determinism is strong here — no timestamps; sorting is UTF-16 `Array.sort` — so the regenerate-and-compare lane is fully reliable.

## 1.3 Whole-file generated Markdown

Example observed: `component-catalog.md`. Header is a **multi-line HTML block comment**, not hash comments:

```
<!--
GENERATED FILE — DO NOT EDIT

Source:  src/components/ui/**
Command: npm run workflow:catalog
업데이트하려면: 원본 컴포넌트를 수정하고 위 명령을 실행
-->
```

The required marker substring (`GENERATED FILE — DO NOT EDIT`, em-dash U+2014) appears on its own line *inside* the comment block (not the file's literal first line). Guard behavior: the marker must appear within the leading HTML comment block — read a bounded leading region (up to the first `-->` or a fixed 800-byte cap, whichever comes first; §3.5), not byte-0 and not an unbounded scan. **This artifact is `do_not_edit: false` and `status: planned`** (manual authoring temporarily allowed until `catalog-gen.mjs` lands) — therefore the guard, under the selector decided in §2, treats it as **header-optional / no-regenerate** today and only escalates when `do_not_edit` flips to `true`.

## 1.4 In-file generated Markdown block

Example observed: the `nav-graph` block inside `screen-spec.md` under `## Entry Points`. The block is delimited by HTML comments:

```
<!-- GENERATED:START nav-graph -->
<!-- DO NOT EDIT MANUALLY. Generated from Navigation Map and inbound Interaction Matrix route edges. -->
... (zero or more generated lines) ...
<!-- GENERATED:END nav-graph -->
```

Observed states: **empty** placeholder block (only START/disclaimer/END, in `examples/nav-graph/basic-flow` and `…/stub-destination`), **populated** block (manual MVP-A content in `examples/coupon-feature/coupon-list`), and **absent** (stub spec `examples/coupon-feature/coupon-detail` has no Entry Points section and no block at all). Guard behavior: this is a **marker-integrity** surface, not a regenerate surface — the block-fill generator does **not exist yet** (see §1.6). For every non-stub screen-spec, require `GENERATED:START nav-graph` to appear before `GENERATED:END nav-graph` (matching `validate.mjs` check 6b semantics at lines 243–262), generalized to all `generated_sections` (§3, §4.6). Empty blocks are valid. Stub specs without the section are valid.

## 1.5 Planned generated artifact with a manual temporary mode

This is `component-catalog.md`: `kind: generated`, `generated: true`, `status: planned`, `do_not_edit: false`, generator `npm run workflow:catalog` (`catalog-gen.mjs`, not implemented). The file may *exist* (it does, in `examples/coupon-feature`) and may be *hand-authored*. Guard behavior — **planned, must-not-fail**: do not run the (nonexistent) generator; do not enforce the do-not-edit body; under the §2 selector, exclude it from header enforcement while `do_not_edit:false`. The guard MUST NOT emit a violation merely because `catalog-gen.mjs` is missing.

## 1.6 Surfaces whose generator/block does not exist yet (planned, must-not-fail)

Two facts must be designed for explicitly:

- **`component-catalog` generator (`catalog-gen.mjs`) does not exist.** The `command` (`npm run workflow:catalog`) is not runnable. Regenerate-and-compare for this artifact is **deferred until the generator lands** (followup.md §3.4: "do not add a diff gate before the first real generator — there is nothing to regenerate").
- **The `screen-spec` entry-points block is not auto-generated yet.** `nav-graph.mjs` writes `_meta/nav-graph.yaml`, but the inbound-edge back-fill into each spec's `GENERATED:START nav-graph … END` block is **planned** (the populated `coupon-feature` block is *manual* MVP-A content under temporary allowance). Therefore the in-file block surface is **marker-presence only** today — never "regenerate the block and compare," because no code produces that block.

## 1.7 Guardability matrix

For each artifact, "Guardable NOW" = the guard can do meaningful work today without a missing-generator false positive; "PARTIALLY" = header/marker checks now, body-equality deferred; "NOT-YET" = planned, must-not-fail.

| Artifact | Surface (§) | Header check NOW? | Body / regenerate NOW? | Verdict | Why |
|---|---|---|---|---|---|
| `workflow-state.yaml` | YAML (1.1) | Yes — `# GENERATED FILE — DO NOT EDIT` first line | Yes, with `generated_at` normalization | **Guardable NOW** | `status: active`, generator exists; has a date field (§4.1) |
| `screen-inventory.yaml` | YAML (1.1) | Yes | Yes (no date field; fully deterministic) | **Guardable NOW** | `status: active`; co-emitted by `workflow:state` |
| `route-tree.txt` | TXT (1.2) | Yes | Yes (timestamp-free, deterministic) | **Guardable NOW** | `status: active`; `--out` to scratch, compare |
| `nav-graph.yaml` | YAML (1.1) | Yes | Yes (timestamp-free, deterministic) | **Guardable NOW** | `status: active`; `--out` to scratch, compare |
| `component-catalog.md` | Markdown (1.3 / 1.5) | No (`do_not_edit:false`) | No (`catalog-gen.mjs` absent) | **NOT-YET (planned)** | manual temporary mode; must-not-fail until generator + `do_not_edit:true` |
| `screen-spec` entry-points block | in-file (1.4 / 1.6) | n/a (marker presence) | No — block generator not implemented | **PARTIALLY** | marker-pair integrity enforceable now; body-fill regenerate deferred |
| `eslint-workflow-config` (`eslint.workflow.config.mjs`) | repo-root JS | Only after path-resolution fix (§3.x, §8.2) | No (`lint-gen.mjs` absent) | **NOT-YET (planned)** | `status: planned`; today silently skipped by validate's docs-prefix bug |

---

# 2. Manifest contract

`artifact-manifest.yaml` is the **single source of truth** for what the guard inspects. The guard loads it the same way `validate.mjs` does — fail-hard if absent/malformed (the manifest is `loadYamlOrExit`; its absence is exit 2, not a soft skip). Per-field reading and acting:

| Field | How the guard READS it | How the guard ACTS on it |
|---|---|---|
| `kind` | `'authoring'` vs `'generated'` | Only `kind: 'generated'` entries are candidate guard surfaces. Authoring entries are ignored entirely. |
| `generated` | Boolean flag, present `true` on all generated entries | **Selector decision (resolves followup.md §4):** do **not** branch on `generated` alone. The guard uses the same selector as `validate.mjs` check 6 — `kind === 'generated' && do_not_edit === true` — for *header/body* enforcement. That selector lives at `validate.mjs:438` (`if (entry.kind !== 'generated' || entry.do_not_edit !== true) continue;`), inside the check-6a header loop spanning lines 437–447. `generated: true` is treated as a redundant intent marker; it is read but is not the gating discriminator. This deliberately keeps `component-catalog` (`do_not_edit:false`) **out** of header enforcement, avoiding the MVP-A false positive flagged in the inspection. |
| `do_not_edit` | `true` / `false` | Gates header + regenerate enforcement (with `kind`). `true` → enforce header presence (and, if `active`, body equality). `false` (only `component-catalog` today) → header-optional, never regenerate. When `component-catalog` flips to `true`, it auto-enters enforcement with no guard code change — **data-driven**. |
| `status` | `'active'` / `'planned'` | `active` → generator is runnable; eligible for regenerate-and-compare (§4). `planned` → **never run the generator** (it does not exist; running it errors with "Cannot find module"). A `planned` entry whose file is *absent* is silently OK; a `planned` entry whose file is *present* and `do_not_edit:true` still gets a **header check** (catches half-finished manual stubs) but **no** regenerate. |
| `path` | Artifact output path, e.g. `docs/frontend-workflow/_meta/route-tree.txt` or repo-root `eslint.workflow.config.mjs` | **Resolve from project root**, not by stripping a `docs/frontend-workflow/` prefix. This fixes the documented blind spot: `validate.mjs:440-441` does `path.replace(/^docs\/frontend-workflow\//,'')` then `join(docsDir, …)`, which mis-resolves `eslint.workflow.config.mjs` to `docs/frontend-workflow/eslint.workflow.config.mjs` and silently skips it. The guard must NOT copy that resolver. |
| `command` | User-facing re-generation command, e.g. `npm run workflow:route-tree`, `npm run workflow:state` | Used only as the **identity** of the generator and as advisory text in violation messages. The guard does **not** shell out to `npm run`. For regenerate-and-compare it invokes the underlying script directly via `process.execPath` (§4), mirroring `test-fixtures.mjs`. See §2.1 for the command-nuance resolution. |
| `source` | List of input globs, e.g. `src/app/**`, `docs/frontend-workflow/domains/**/screen-spec.md` | Drives the **direct-edit detection model** (§5): "a committed change to a generated file is acceptable iff regenerating from its declared `source` reproduces the committed output." Also feeds the diff-aware mode's "did any source change?" question. The guard reads `source` but never mutates source files. |
| `generated_sections` | List of `{ name, generator }`, present on `screen-spec` as `[{name: entry-points, generator: nav-graph}]` | Drives the **in-file block-marker** check (§1.4, §4.6), generalized across *all* artifacts that declare `generated_sections` — not the hardcoded `screen-spec` key validate uses. For each declared section the guard requires `GENERATED:START <generator>` before `GENERATED:END <generator>`. |

Fields `scope` and `mvp` are advisory; the guard may surface them in messages but takes no enforcement action on them.

## 2.1 The command nuance (user-facing `command` vs header `# Command:`) — decision

The manifest `command` is **user-facing npm-alias form** (`npm run workflow:route-tree`), while the *generated header's* `# Command:` line is the **direct CLI form** (`node scripts/route-tree.mjs --app src/app --out docs/frontend-workflow/_meta/route-tree.txt`). These are different strings **by design** (followup.md / route-tree-header-command run report): the header uses direct-call form so it never dangles when an alias is missing from `package.json`; the manifest `command` is kept aligned with the actual `package.json` alias. Naively comparing them as strings would be a guaranteed false positive.

**Options considered:**

- **(a) Allow the distinction explicitly** — accept that `command` (npm) and `# Command:` (node CLI) are intentionally different and never string-compare them.
- **(b) PROPOSED (future PR) `header_command` manifest field** — add a field carrying the exact header CLI string so a future strict check can compare the header against a registry value.
- **(c) Comparison by resolved generator + output path**, not raw string equality.

**Recommendation: layered (a) + (c) now, (b) deferred.**

1. **Now (a+c):** The guard treats `command` purely as generator *identity* and **does not** assert `# Command: == command`. For header validation it only requires that a `# Command:` line is **present and non-empty** (§3.3). For semantic correctness it relies on **(c) the comparison rule below**, which is far more robust than any string match because it actually checks that the file came from the right generator producing the right path.
2. **Comparison rule (c):** Two artifacts are "the same generated output" iff their **(resolved generator script, resolved output path)** match — never by header byte equality of the `# Command:` line. Concretely: the guard maps a manifest entry → generator script (from `command`'s alias target) and → output `path`; regenerate-and-compare (§4) writes that generator's output to a scratch path and compares **body** content (post-normalization), independent of whatever the literal `# Command:` line says. This means the route-tree header line being hardcoded in `lib/route-tree.mjs` (not derived from runtime flags) cannot cause a false positive.
3. **Later (b), PROPOSED (future PR):** Should a future maintainer want the *header `# Command:` string itself* to be registry-verified, add a manifest field:

   ```yaml
   # PROPOSED (future PR) — DO NOT ADD IN THIS TASK
   route-tree:
     header_command: node scripts/route-tree.mjs --app src/app --out docs/frontend-workflow/_meta/route-tree.txt
   ```

   The guard would then compare the file's `# Command:` line to `header_command` (whitespace-tolerant, §3.4) while continuing to use `command` for the npm alias and rule (c) for body equality. This is **not** to be added now.

---

# 3. Header and marker rules

All forms below are the **exact observed** forms. The em-dash (U+2014) in `GENERATED FILE — DO NOT EDIT` is **load-bearing**: `validate.mjs` check 6 greps `/GENERATED FILE\s+—\s+DO NOT EDIT/` with the em-dash specifically, and `nav-graph.mjs`'s source comment explicitly fixes the character for that reason. The guard MUST use the same em-dash.

## 3.1 Required marker text

- **Whole-file (YAML, TXT):** the first content line must match `/^#\s*GENERATED FILE\s+—\s+DO NOT EDIT\s*$/`. Observed verbatim: `# GENERATED FILE — DO NOT EDIT`.
- **Whole-file (Markdown):** the leading HTML comment block must contain a line matching `/GENERATED FILE\s+—\s+DO NOT EDIT/`. Observed verbatim inside `<!-- … -->`: `GENERATED FILE — DO NOT EDIT`.
- **In-file block:** `<!-- GENERATED:START <name> -->` and `<!-- GENERATED:END <name> -->`, matched with `new RegExp('GENERATED:START\\s+' + gen + '\\b')` and the `END` counterpart — identical to `validate.mjs` check 6b. The only `<name>` observed is `nav-graph`. The inner disclaimer line (`<!-- DO NOT EDIT MANUALLY. … -->`) is **observed but NOT required** by the guard — its wording varies between fixtures (English in nav-graph fixtures; Korean with backticked commands in `coupon-feature`), so requiring it would be brittle. Treat it as informational only.

## 3.2 Is `Source` required?

**Required for whole-file generated artifacts under enforcement** (i.e., `kind:generated && do_not_edit:true`). All such observed files carry a `# Source:` (hash) or `Source:` (inside HTML comment) line. Requirement is **presence and non-empty value only** — the guard does **not** validate that the `Source:` glob equals the manifest `source` list (the header uses curated human-readable globs, e.g. `domains/**/screen-spec.md Interaction Matrix + app/navigation-map.md`, which intentionally differ from the manifest's machine globs). Tolerate the observed **double space** (`# Source:  docs/...`). For the in-file block surface there is no `Source:` line — not applicable.

## 3.3 Is `Command` required?

**Required for whole-file generated artifacts under enforcement** — presence and non-empty value only. As decided in §2.1, the guard does **not** compare the `# Command:` string to the manifest `command`. (Optional strict comparison is deferred behind the PROPOSED `header_command` field.)

## 3.4 How strict should command comparison be?

**Not strict by default.** Default behavior: `# Command:` must merely be present/non-empty. If the future `header_command` field (§2.1(b)) is adopted, comparison is **whitespace-normalized** (collapse runs of spaces, trim) and **path-separator-normalized** (`\` → `/`, per §8.2) before equality — never byte-for-byte. Until then, body equality via regenerate-and-compare (§4) is the authoritative correctness signal, not the header string.

## 3.5 Missing headers

If an enforced whole-file artifact exists but its marker line is absent/corrupted, emit a violation keyed `HDR:<artifact-name>` with message form mirroring validate's `생성물(<name>)의 GENERATED 헤더 훼손/부재` (header corrupted/absent). Read only a bounded leading region, and bound it deterministically per file shape:

- **Hash-comment files (YAML, TXT):** read the first **400 bytes** — mirroring `validate.mjs:443`'s `.slice(0,400)` window exactly.
- **HTML-comment Markdown:** read the leading region up to the first `-->` **or** a fixed **800-byte** cap, whichever comes first. (The observed `component-catalog.md` HTML header block spans ~10 lines with the `GENERATED FILE — DO NOT EDIT` marker on line 2, comfortably inside 800 bytes; the dual bound keeps the scan bounded and deterministic instead of an unbounded "read the whole comment" read, matching the spirit of validate's fixed slice.)

A `planned` artifact with **no file** → no violation (skip). A `planned` artifact with a **file present** and `do_not_edit:true` → header **is** checked (catches half-authored stubs), per §2.

## 3.6 Duplicate generated blocks

Two `GENERATED:START <name>` for the **same** `<name>` in one document → violation `BLK:dup:<name>`. Rationale: the (future) block generator must own exactly one region per section name; duplicates make "replace between markers" ambiguous. (Not currently caught by validate; this is a guard addition.)

## 3.7 Unclosed block markers

`GENERATED:START <name>` with no matching `GENERATED:END <name>`, or `END` index `<=` `START` index → violation `BLK:order:<name>`. This is exactly validate check 6b's `START index >= END index` condition (validate.mjs:243-262), generalized to all `generated_sections`.

## 3.8 Nested generated blocks

A `GENERATED:START <b>` appearing between `GENERATED:START <a>` and `GENERATED:END <a>` → violation `BLK:nested:<a>/<b>`. Nesting is unsupported because regeneration replaces a flat marker-delimited span; nested regions cannot be reconstructed deterministically. (Not currently possible with the single observed `nav-graph` section, but specified now so the generalized iterator is safe when `component-catalog`/other sections arrive.)

---

# 4. Regeneration strategy

Core principle: the guard **never mutates committed files**. When it must check body integrity it **regenerates to a scratch directory** (an `os.tmpdir()` dir via `fs.mkdtempSync`, cleaned in a `finally` with `fs.rmSync(tmpDir, { recursive: true, force: true })`) and compares — exactly the `test-fixtures.mjs` `runGeneratedViewCase` pattern. Generators are invoked as **subprocesses** via `process.execPath` (never imported), and run **twice** to assert two-run determinism before comparing to the committed file. Normalization applied before any text comparison is **exactly** `normalizeGeneratedViewText`: `String(s ?? '').replace(/\r\n/g,'\n').replace(/\\/g,'/')` — CRLF→LF and backslash→slash, **nothing else** (no timestamp stripping). The contract is "exact text except line endings and path separators." For artifacts with a `generated_at` field, see §4.1 for the one allowed extra normalization.

Strategy vocabulary: **header-only**, **regenerate-to-scratch-and-compare**, **generated-block extraction-and-compare**, **manifest-consistency**, **git-diff-based changed-file**.

## 4.1 `workflow-state.yaml`

- **Strategy: regenerate-to-scratch-and-compare + manifest-consistency, with a `generated_at`-ONLY normalization fallback.**
- `workflow-state.mjs` writes **two** files into a directory (`--out` is a **directory**, default `_meta/`): `workflow-state.yaml` **and** `screen-inventory.yaml`. The guard invokes `node scripts/workflow-state.mjs --docs <docs> --src <src> --out <scratchDir>` once (covering both outputs), twice for determinism.
- `workflow-state.yaml` has a top-level `generated_at:` that varies by calendar date unless `--date` is pinned. The **sanctioned path is (a): pin `--date` to the committed file's `generated_at` value.** Parse `generated_at` from the committed header region and pass it as `--date` so regeneration reproduces the file byte-for-byte; the comparison is then exact under plain `normalizeGeneratedViewText` with **no** extra normalizer. This is the default and primary mechanism.
- **Fallback (b), only if the committed `generated_at` is unparseable:** apply a **`generated_at`-ONLY line normalizer** to **both** sides before compare — i.e. **just** the line transform `/^(\s*generated_at\s*:).*$/m` → `$1 <normalized>`, neutralizing only the `generated_at:` line. **Do NOT reuse `test-fixture.mjs`'s `normalizeText` wholesale here.** The real `normalizeText` (verified at `test-fixture.mjs:38-43`) does two things — it neutralizes `generated_at`/`date`/`last_reviewed` lines **and** replaces every ISO-date token anywhere in the file (`/\b\d{4}-\d{2}-\d{2}(?:[T ]…)?\b/g` → `<date>`). The `workflow-state.yaml` body legitimately contains date-like fields (screen `status`/date values and other content); that global ISO-date masking would mask a *real body edit* that changes a date value, directly contradicting this document's own §8.9 promise that the only tolerated normalization is CRLF/path-sep plus `generated_at` for `workflow-state` — never anything that masks a real body edit. The fallback therefore drops the global ISO-date replacement entirely and touches only the single `generated_at:` line. Path (a) remains strongly preferred precisely because it needs no body-side normalization at all.
- Manifest-consistency: confirm both emitted filenames match the two manifest entries (`workflow-state`, `screen-inventory`) `path` values.

## 4.2 `screen-inventory.yaml`

- **Strategy: regenerate-to-scratch-and-compare (no timestamp normalization).**
- Co-produced by the same `workflow:state` run as §4.1 (write once to the scratch dir, compare the second file). `screen-inventory.yaml` has **no** `generated_at` field, so plain `normalizeGeneratedViewText` suffices and the comparison is exact. Inventory is sorted by `id` via `localeCompare` — deterministic regardless of filesystem traversal order.

## 4.3 `route-tree.txt`

- **Strategy: regenerate-to-scratch-and-compare.**
- Supports `--out` as a **file path**. Invoke `node scripts/route-tree.mjs --app <srcApp> --out <scratchDir>/route-tree.txt`, twice. Timestamp-free; sorting is locale-independent UTF-16 `Array.sort`. Compare with `normalizeGeneratedViewText` only. (The header's `# Source:`/`# Command:` are hardcoded in `lib/route-tree.mjs` regardless of flags — they are part of the deterministic output and compare cleanly.)

## 4.4 `nav-graph.yaml`

- **Strategy: regenerate-to-scratch-and-compare.**
- Supports `--out` as a **file path**. Invoke `node scripts/nav-graph.mjs --docs <docs> --out <scratchDir>/nav-graph.yaml`, twice. Timestamp-free; ids/routes/edges sorted by stable `localeCompare`. Compare with `normalizeGeneratedViewText` only.

## 4.5 `component-catalog.md`

- **Strategy: header-only — and only when `do_not_edit:true`; otherwise SKIP. NO regenerate (planned).**
- Today `do_not_edit:false` + `status:planned` + generator `catalog-gen.mjs` **absent**. The guard MUST NOT run `npm run workflow:catalog` (it would error "Cannot find module"). It performs **no** body check now. When `catalog-gen.mjs` lands and `do_not_edit` flips to `true` (and `status` to `active`), this artifact graduates to **regenerate-to-scratch-and-compare** automatically via the same data-driven rules — no new branch needed. Per followup.md §3.4, the diff/regenerate gate for catalog output **waits for `catalog-gen` to land**.

## 4.6 `screen-spec` entry-points generated block

- **Strategy: generated-block marker-integrity (extraction without compare). NO regenerate of block body (planned).**
- The block-fill generator does **not exist** (the populated `coupon-feature` block is manual MVP-A content). So the guard **extracts** each declared `generated_sections` region and validates **marker integrity only** (presence, order, no duplicates/nesting — §3.6–3.8) for every non-stub screen-spec, generalized across all artifacts' `generated_sections` (not the hardcoded `screen-spec` key). It does **not** attempt `generated-block extraction-and-compare` against regenerated content, because there is nothing to regenerate yet. Empty blocks (nav-graph fixtures) and absent sections in stub specs are both valid. When the back-fill generator ships, this surface graduates to extraction-**and-compare** (extract committed block body, regenerate the block from `source`, compare the extracted span only).

## 4.7 Cross-cutting regenerate rules

- **`status: planned` ⇒ never invoke the generator.** Header-only at most (and only if file present + `do_not_edit:true`).
- **`status: active` ⇒ eligible for regenerate-to-scratch-and-compare**, two-run determinism first, then golden/committed compare.
- **Check-key naming for the new guard — decision (resolves the naming question):** the new directory/whole-file regenerate lane uses a **distinct `CG:` prefix** — `CG:run:N`, `CG:output:N`, `CG:deterministic`, `CG:content` — **not** the harness's `GV:` keys. Rationale: the `GV:run:N` / `GV:output:N` / `GV:deterministic` / `GV:content` keys are defined in `test-fixtures.mjs` `runGeneratedViewCase` specifically for the generated-**VIEW** lane (route-tree/nav-graph), whereas `workflow-state`/`screen-inventory` belong to the L2 pipeline lane per the test-fixtures inspection. Reusing `GV:` for the multi-file workflow-state directory lane would imply the L2/GV harness lanes are being invoked, which they are not. The `CG:` prefix (check-generated) keeps the guard's log keys unambiguous and parallel in shape to the harness keys without conflating the lanes. This mapping is stated once here and used consistently across §4.1–§4.6 and §5.
- **Missing committed output, missing regenerated output, or non-zero generator exit ⇒ FAIL (fail-closed), never skip** — for `active` entries. (`planned`/absent stays skip.)
- **git-diff-based changed-file check** is reserved for the **diff-aware mode** (§5) and the future CI idempotency posture; it is *not* the primary mechanism — regenerate-to-scratch is, because it works locally and in CI without relying on git state.

---

# 5. Direct-edit detection model

The guard must distinguish five situations on a working tree or a PR diff:

| Situation | Definition | Guard verdict |
|---|---|---|
| **Bad direct manual edit** | Generated file body differs from what its `source` produces; header may be intact | **VIOLATION** — regenerate-to-scratch reproduces a *different* body than committed (`CG:content` mismatch) |
| **Valid regenerated output after a source change** | `source` changed; generated file changed; regeneration from new source reproduces the committed output | **OK** — regenerate-to-scratch reproduces the committed body exactly |
| **Valid first-add of a generated file** | New generated file added; it matches regeneration from current `source` | **OK** — file is new but reproducible; no "prior version" needed because the check is reproduce-not-diff |
| **Missing generated output** | `status:active` artifact whose committed file is absent | **VIOLATION** (fail-closed) for active; **SKIP** for planned/absent |
| **Planned output not yet required** | `status:planned` (e.g. `component-catalog`, `eslint-workflow-config`), generator absent | **SKIP / must-not-fail** |

## 5.1 Policy direction (DESIGN)

> **A change to a generated file is acceptable only if regeneration from its declared `source` reproduces the committed output.**

This is the single rule that unifies the table. It is stated here as **design intent**, not a shipped gate.

## 5.2 How regenerate-to-scratch + manifest `source` realizes this with no false positives

- **First-add is safe** because the check is *reproduce*, not *diff-against-previous*. The guard regenerates from the **current** `source` and compares to the **current** committed file. A brand-new generated file that matches its generator passes — there is no requirement that a prior version exist. (Contrast a naive "if generated file changed, fail" rule, which would wrongly flag every legitimate first-add and every legitimate regeneration.)
- **Source-then-output changes are safe** because the guard regenerates from the **post-change** `source` already present in the tree. If the committed output equals that regeneration, it is by definition the correct output for the new source → OK. The guard never needs to reason about *why* the source changed.
- **Output-changed-without-source-change is caught**: regeneration from the unchanged `source` reproduces the *old* body, which differs from the hand-edited committed body → VIOLATION. This is precisely the case validate check 6 cannot see (header intact, body edited).

## 5.3 Concrete PR / diff model

The guard has two modes:

- **Whole-tree mode (default, no git needed):** for every enforced (`active`) artifact, regenerate-to-scratch and compare to the committed file. This is deterministic and CI-friendly and does not depend on what the diff touched. Recommended default.
- **Diff-aware mode (`--diff <range>` or `--base <ref>`):** narrow work to artifacts whose `path` **or** whose `source` globs intersect the changed-file set in the diff (mirroring the `forbidden-paths.mjs --diff/--base` lane shape). For each such artifact, apply the §5.2 reproduce rule. The diff is used only to *select* which artifacts to check (a performance/scoping optimization), **never** as the correctness oracle — correctness is always "does regeneration reproduce the committed bytes." This guarantees that a PR which changes only `source` (and correctly regenerates output) passes, and a PR which changes only the generated file's body without a corresponding source change fails.

**Out of scope for the guard surface (by prior decision):** `_meta/*` is intentionally **outside** the `forbidden-paths.mjs` backstop (path-backstop run T3, confirmed in the integration report). `check-generated-files.mjs` is the **sole** home for `_meta` integrity — do **not** add `_meta` paths to `forbidden_paths` or the path-backstop surface.

---

# 6. Exit code & CI posture

## 6.1 Future CLI contract (DESIGN)

| Exit | Meaning | When |
|---|---|---|
| `0` | No violations (or warning-first run with violations but `--enforce` not passed) | Default success; also the warning-first outcome where issues are printed but not gated |
| `1` | Violations found **AND** `--enforce` was passed | Hard-fail only under explicit enforcement |
| `2` | Configuration / IO / parser error | Manifest absent or malformed (mirrors validate's `loadYamlOrExit` exit 2), generator subprocess could not be spawned for an `active` entry, scratch-dir IO failure, unparseable committed file |

**Default is WARNING-FIRST.** Without `--enforce`, the guard prints all findings and exits `0`. `--enforce` flips violation findings to exit `1`. Configuration/IO/parser errors are exit `2` **regardless** of `--enforce` (a broken manifest is never "just a warning"). Proposed flags (DESIGN): `--enforce` (gate on violations), `--diff <range>` / `--base <ref>` (diff-aware scoping, §5.3), `--json` (machine-readable findings, matching the kit convention used by `validate.mjs --json`, `nav-graph --json`, `workflow-state --json`).

## 6.2 CI posture (re-stated — nothing changes in this task)

- **No hard-gate promotion in this task.** No `continue-on-error` is removed anywhere.
- **No CI step is added in this task.** `.github/workflows/frontend-workflow-kit.yml` is untouched.
- **Future CI adoption starts warning-first.** When eventually wired, the natural slot is **after `test:spec` (step 8) and alongside/just before the golden-fixture step (step 9)**, as a new step running `npm run workflow:check-generated` with `continue-on-error: true` — mirroring the existing warning-first golden-fixture pattern and the board §0/§7 warning-first hard rule. Promotion to a hard gate (dropping `continue-on-error`, or running with `--enforce`) is explicitly a **separate future PR** decided only after an observed false-positive rate (§9 PR G). This also requires, as prerequisites, that `scripts/check-generated-files.mjs` exists and that the `//roadmap` alias is promoted to live `scripts` in both `package.json` and `package-scripts.template.json` — none of which happen now.

---

# 7. Relationship to existing `validate`

`validate.mjs` is a 12-check authoring/contract validator. The guard does **not** replace it and is **not** to be merged into it in this task (the manifest comment at lines 141–144 and followup.md §0 establish that validate is intentionally kept at its current check-6 scope; the extended guard design is deferred to the followup proposal — superseded by this document).

## 7.1 What STAYS in `validate.mjs`

- Checks 1–5, 7–12: schema/frontmatter, path, references, API (check 8), Open Decisions, Copy Keys, input artifacts (check 11), reconciliation register (check 12) — all document **contract** checks, none of which touch generated headers.
- **Check 6 (both sub-checks) stays as-is** — the already-implemented, low-cost **header/marker presence** lane:
  - **6a** (lines 437–447): whole-file header presence for `kind:generated && do_not_edit:true` (the selector `if (entry.kind !== 'generated' || entry.do_not_edit !== true) continue;` at line 438), existence-guarded (absent file → skip at line 442), reads first 400 bytes at line 443.
  - **6b** (lines 243–262): screen-spec `generated_sections` marker order (`START` before `END`).
- The **existence guard** (`if (!exists(full)) continue`) stays — it is what makes `planned` entries harmless in validate today.

## 7.2 What belongs in the future `check-generated-files.mjs`

- **Manifest-driven integrity across all generated entries**, including **repo-root paths** (`eslint.workflow.config.mjs`) via project-root path resolution — the gap validate's docs-prefix resolver cannot reach.
- **Regenerate-to-scratch-and-compare** (body equality) for `status:active` artifacts — the body-level guarantee check 6 structurally cannot provide (it only reads the first 400 bytes).
- **Diff-aware direct-edit detection** (§5) — the reproduce-not-diff model, optional `--diff/--base` scoping.
- **Generalized in-file block-marker integrity** across **all** `generated_sections` (not the hardcoded `screen-spec` key), plus duplicate/unclosed/nested detection (§3.6–3.8).

This split is intentional: validate stays a fast, dependency-light, always-on contract gate; the heavier "run the generators and compare" work lives in a separate, warning-first tool that can be adopted incrementally.

---

# 8. False positive risks

Each risk with its mitigation; mitigations are grounded in observed normalization (`normalizeGeneratedViewText`, `normalizeText`, `toPosix`) and observed manifest/header facts.

## 8.1 Manifest `command` vs header `# Command:` mismatch
The two are intentionally different (npm alias vs node CLI). **Mitigation:** never string-compare them (§2.1, §3.3–3.4). Use `command` as generator identity; require `# Command:` presence only; rely on the **(resolved generator + output path)** comparison rule and body regeneration for correctness. Strict header-string checking is deferred behind the PROPOSED `header_command` field.

## 8.2 Windows path separators
`path.join`/`path.resolve` produce backslashes on Windows; emitted header globs use forward slashes as literals. A backslash-vs-slash diff would false-fail. **Mitigation:** apply the observed `\` → `/` normalization (`normalizeGeneratedViewText`'s `.replace(/\\/g,'/')`, equivalently `toPosix`: `String(p).split(path.sep).join('/').replace(/\\/g,'/')`) to **both** committed and regenerated content before comparison, and to any path values surfaced in messages.

## 8.3 CRLF line endings
Generators write LF (content assembled with `'\n'`, `writeFile` uses utf8 with no CRLF logic), but a committed file checked out with `autocrlf` could be CRLF on Windows. **Mitigation:** `normalizeGeneratedViewText`'s `.replace(/\r\n/g,'\n')` on both sides before compare. (`splitFrontmatter` already tolerates `\r?\n` and strips BOM, consistent with this.)

## 8.4 Planned generated artifacts
`component-catalog`, `eslint-workflow-config` (`status:planned`) have **no runnable generator**; running it errors. **Mitigation:** `status:planned` ⇒ never invoke the generator; absent file ⇒ skip entirely; present file + `do_not_edit:true` ⇒ header check only (§2, §4.7). Must-not-fail on a missing generator.

## 8.5 `component-catalog` manual temporary mode
`do_not_edit:false` means hand-edits are *currently legitimate*; enforcing the do-not-edit body would false-fail every manual edit. **Mitigation:** the §2 selector (`kind:generated && do_not_edit:true`) excludes `do_not_edit:false`, so `component-catalog` is out of header/body enforcement until the flag flips — exactly mirroring why validate check 6 already excludes it (the lone `do_not_edit:false` generated entry).

## 8.6 Generators that write multiple files
`workflow-state.mjs` writes **two** files and `--out` is a **directory** (unlike route-tree/nav-graph whose `--out` is a file path). Passing a file path, or checking only one output, would false-fail or under-check. **Mitigation:** treat `--out` per-generator (directory for workflow-state, file path for route-tree/nav-graph), regenerate the whole directory once, and compare **both** `workflow-state.yaml` and `screen-inventory.yaml` against their respective manifest entries (§4.1–4.2).

## 8.7 Entry-points blocks not implemented yet
The `nav-graph` in-file block has no generator; the populated `coupon-feature` block is manual; nav-graph fixtures have **empty** blocks. Attempting to regenerate-and-compare the block body would false-fail. **Mitigation:** in-file block surface is **marker-integrity only** today (presence/order/dup/nesting); empty blocks and absent sections are valid; body compare is deferred until the back-fill generator ships (§4.6).

## 8.8 Source changes without output changes
A `source` edit that *should* change the output but where the committed output was **not** regenerated. **Mitigation:** the reproduce rule (§5.2) catches this — regeneration from the new `source` produces a body differing from the stale committed output → VIOLATION. (This is a genuine staleness finding, not a false positive; it is listed here to clarify the guard's intended behavior on this diff shape.)

## 8.9 Output changes without source changes
Hand-edit of a generated body with no `source` change — the classic direct edit validate misses. **Mitigation:** regeneration from the unchanged `source` reproduces the original body, differing from the edited committed body → VIOLATION (§5.2). Again a true positive by design; the only normalization tolerated is CRLF/path-sep (and a **`generated_at`-ONLY line normalizer** for `workflow-state` per §4.1), never anything that would mask a real body edit. Note specifically that the broad `normalizeText` ISO-date token replacement is **not** used here: masking every `YYYY-MM-DD` token across the body would hide a real edit that changes a date value, which is exactly the failure this guard exists to catch.

---

# 9. Implementation slicing

Small, independently reviewable future PRs. The sequence below adopts the task's suggested order with **two grounded adjustments**, justified inline.

- **PR A — Design doc only (this document).** No code, no manifest edits, no scripts, no CI. Establishes ground truth (Appendix A) for everything after.
- **PR B — Skeleton + manifest parsing + header/marker checks (warning-first only).** Create `scripts/check-generated-files.mjs`: load manifest (exit 2 if absent/malformed), enumerate `kind:generated && do_not_edit:true` entries, **project-root path resolution** (fixing the docs-prefix blind spot so `eslint.workflow.config.mjs` is reachable), header-presence check (§3.1–3.5, including the 400-byte hash window and the bounded HTML-comment region) and generalized in-file block-marker integrity over **all** `generated_sections` (§3.6–3.8, §4.6). Exit-code contract (§6.1) with default warning-first; no `--enforce` gating wired anywhere; **no package script, no CI** (alias stays in `//roadmap`). Reuse `readFileSafe`/`exists` from `lib/util.mjs`.
- **PR C — route-tree / nav-graph regenerate-to-scratch compare.** Add the subprocess regenerate lane for the two timestamp-free `active` generators (§4.3–4.4): `mkdtempSync` scratch, two-run determinism (`CG:deterministic`), committed compare (`CG:content`), `normalizeGeneratedViewText` only, `finally` cleanup. These are first because they are the **lowest-risk** regenerate targets (deterministic, no date field), so the false-positive rate observed here is the cleanest signal for later gating.
- **PR D — workflow-state / screen-inventory strategy.** Add the multi-output, directory-`--out` regenerate lane (§4.1–4.2) including `generated_at` handling (pin `--date` from the committed value; fallback to the **`generated_at`-ONLY line normalizer**, never the broad `normalizeText` ISO-date replacement). Sequenced **after** PR C because the `generated_at` normalization is the one place an over-broad normalizer could mask a real edit — it deserves its own focused review. *(This is the task's suggested order; kept.)*
- **PR E — generated-block marker validation hardening.** Although basic marker integrity ships in PR B, PR E adds the **duplicate / unclosed / nested** edge-case rules (§3.6–3.8) with fixtures, once real multi-section usage (e.g. a future `component-catalog` `generated_sections`) is on the horizon. **Adjustment / justification:** the task listed "generated block marker validation" as a distinct slice after the regenerate PRs; I keep it as PR E but explicitly scope it to the *edge-case* rules, since the *presence/order* check is cheap enough to land in PR B and gives early value. If the team prefers, PR E's edge cases can fold into PR B — they are orthogonal to the regenerate lanes.
- **PR F — CI warning-first wiring.** Promote the `//roadmap` alias to live `scripts` in `package.json` **and** `package-scripts.template.json` (prerequisite: the script exists), then add **one** CI step running `npm run workflow:check-generated` with `continue-on-error: true`, slotted after `test:spec` / alongside the golden-fixture step. Still warning-first; **no `--enforce`**. (Explicitly *not* this task.)
- **PR G — Optional hard-gate discussion (after observed false-positive rate).** Only after PR F has produced real warning-first telemetry: decide whether to drop `continue-on-error` and/or run with `--enforce`. This is a **decision PR**, gated on evidence, per the §0/§7 warning-first rule.

**Deferred dependencies noted (not their own PRs here):** the `component-catalog` regenerate lane and the `screen-spec` block **body** compare both wait on their generators (`catalog-gen.mjs`, the nav-graph back-fill) landing — they graduate **data-drivenly** when `status` flips to `active` (and, for catalog, `do_not_edit` to `true`), needing no new guard branch. The PROPOSED `header_command` manifest field (§2.1(b)) is its own future PR if strict header-string checking is ever wanted.

---

# Appendix A. Observed headers, markers & commands

Ground truth captured during inspection. The implementation PR must reproduce these **exactly** (em-dash U+2014; observed double-spaces preserved).

## A.1 Whole-file headers — observed verbatim

| Artifact | File | Header lines (verbatim) | Comment style |
|---|---|---|---|
| `route-tree` | `route-tree.txt` (basic-app & edge-cases; `_meta/` == `expected/`) | `# GENERATED FILE — DO NOT EDIT` / `# Source: src/app/**` / `# Command: node scripts/route-tree.mjs --app src/app --out docs/frontend-workflow/_meta/route-tree.txt` | `#` hash, 3 lines, blank line, then `/` tree |
| `nav-graph` | `nav-graph.yaml` (basic-flow & stub-destination; `_meta/` == `expected/`) | `# GENERATED FILE — DO NOT EDIT` / `# Source: domains/**/screen-spec.md Interaction Matrix + app/navigation-map.md` / `# Command: node scripts/nav-graph.mjs --docs docs/frontend-workflow` | `#` hash, 3 lines, then `screens:` |
| `screen-inventory` | `screen-inventory.yaml` (coupon-feature) | `# GENERATED FILE — DO NOT EDIT` / `# Source:  docs/frontend-workflow/domains/**/screen-spec.md (frontmatter)` / `# Command: npm run workflow:state` | `#` hash; **double space** after `Source:` |
| `workflow-state` | `workflow-state.yaml` (coupon-feature) | `# GENERATED FILE — DO NOT EDIT` / `# Source:  docs/frontend-workflow/domains/**/screen-spec.md (frontmatter + 본문)` / `# Command: npm run workflow:state` then `generated_at: 2026-06-13`, `global:` | `#` hash; **double space** after `Source:`; has `generated_at` |
| `component-catalog` | `component-catalog.md` (coupon-feature) | `<!--` / `GENERATED FILE — DO NOT EDIT` / (blank) / `Source:  src/components/ui/**` / `Command: npm run workflow:catalog` / `업데이트하려면: 원본 컴포넌트를 수정하고 위 명령을 실행` / `-->` | HTML block comment (`do_not_edit:false`, `status:planned`) |

## A.2 In-file block markers — observed verbatim

| Location | Markers (verbatim) | State |
|---|---|---|
| `nav-graph/basic-flow` & `…/stub-destination` screen-specs (coupon-list, home) | `<!-- GENERATED:START nav-graph -->` / `<!-- DO NOT EDIT MANUALLY. Generated from Navigation Map and inbound Interaction Matrix route edges. -->` / `<!-- GENERATED:END nav-graph -->` | **Empty** (no content between START/END) |
| `coupon-feature/coupon-list/screen-spec.md` | `<!-- GENERATED:START nav-graph -->` / `<!-- 직접 작성하지 마세요. 다른 화면 Interaction Matrix 선언을 \`npm run workflow:nav\` 가 역색인해 채웁니다. -->` / `<!-- MVP-A 임시: nav-graph 생성기 이전이라 아래는 수동 기재. MVP-C에서 생성으로 전환됩니다. -->` / (two content bullets) / `<!-- GENERATED:END nav-graph -->` | **Populated** (manual MVP-A) |
| `coupon-feature/coupon-detail/screen-spec.md` | — (no Entry Points section, no block) | **Absent** (stub) |

Section name observed: **`nav-graph`** only. The inner disclaimer wording **varies** (English in fixtures; Korean with a backticked `npm run workflow:nav` in coupon-feature) → informational, not required (§3.1).

## A.3 Command forms — manifest vs header

| Artifact | Manifest `command` (user-facing) | Generated header `# Command:` (direct CLI) | `status` |
|---|---|---|---|
| `screen-inventory` | `npm run workflow:state` | `npm run workflow:state` | active |
| `workflow-state` | `npm run workflow:state` | `npm run workflow:state` | active |
| `route-tree` | `npm run workflow:route-tree` | `node scripts/route-tree.mjs --app src/app --out docs/frontend-workflow/_meta/route-tree.txt` | active |
| `nav-graph` | `npm run workflow:nav-graph` | `node scripts/nav-graph.mjs --docs docs/frontend-workflow` | active |
| `component-catalog` | `npm run workflow:catalog` | `Command: npm run workflow:catalog` (inside HTML comment) | planned |
| `eslint-workflow-config` | `npm run workflow:lint-gen` | (no file yet) | planned |

Notes for the implementation PR: (1) `workflow-state`/`screen-inventory` are the **only** artifacts whose manifest `command` and header `# Command:` coincide (both npm-alias); `route-tree`/`nav-graph` deliberately diverge (manifest npm-alias vs header node-CLI) — do **not** treat the divergence as an error (§2.1). (2) The route-tree header `# Source:`/`# Command:` strings are **hardcoded** in `lib/route-tree.mjs` and do not reflect runtime `--app`/`--out` — they are stable output bytes, not flag echoes. (3) The em-dash in `GENERATED FILE — DO NOT EDIT` is load-bearing for the `/GENERATED FILE\s+—\s+DO NOT EDIT/` match.

## A.4 `--out` support & output count (for the regenerate lane)

| Generator | `--out` | Kind | Output count | Default path(s) |
|---|---|---|---|---|
| `workflow-state.mjs` | Yes | **directory** | **2** | `_meta/workflow-state.yaml`, `_meta/screen-inventory.yaml` |
| `route-tree.mjs` | Yes | **file path** | 1 | `_meta/route-tree.txt` |
| `nav-graph.mjs` | Yes | **file path** | 1 | `_meta/nav-graph.yaml` |

## A.5 Normalization primitives (reuse verbatim; do not invent new ones)

- `normalizeGeneratedViewText(s)` = `String(s ?? '').replace(/\r\n/g,'\n').replace(/\\/g,'/')` — **the** generated-view comparator (CRLF→LF, `\`→`/`; no timestamp stripping). Use for **all** body comparisons (route-tree, nav-graph, screen-inventory, and workflow-state when `--date` is pinned per §4.1(a)).
- **`generated_at`-ONLY line normalizer** = `s.replace(/^(\s*generated_at\s*:).*$/m, '$1 <normalized>')` — the **only** sanctioned extra normalizer, used **solely** for the `workflow-state` `generated_at` fallback (§4.1(b)) and applied to both sides on top of `normalizeGeneratedViewText`. It touches just the single `generated_at:` line.
- `normalizeText(s)` (the full `test-fixture.mjs:38-43` function: CRLF strip + `generated_at|date|last_reviewed` line-neutralize + **global ISO-date token replacement**) is **NOT reusable for this guard.** Its global `/\b\d{4}-\d{2}-\d{2}(?:[T ]…)?\b/g` → `<date>` replacement is too broad — it would mask real date-valued body edits in `workflow-state.yaml`, contradicting §8.9. It is referenced here only to document what the guard deliberately does **not** call.
- `toPosix(p)` = `String(p).split(path.sep).join('/').replace(/\\/g,'/')` — for path values in messages/diagnostics.

---

**End of design document.** No code, package scripts, CI changes, validate/generator/lib/fixture/example/doc edits, or manifest edits are made by this task. The `header_command` manifest field and any CI wiring remain **PROPOSED (future PR)** only.

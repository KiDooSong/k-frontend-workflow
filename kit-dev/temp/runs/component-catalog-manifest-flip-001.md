# component-catalog manifest flip — PR-5 (activate generated artifact)

PR A of the component-catalog graduation. Promotes `component-catalog` from a
*planned generator + temporary manual artifact* to an **active generated
artifact** at the manifest/package level. Builds on the generator already on
main (skeleton + #37 anchor/wrapper fixes) and the v1 output-format freeze +
golden fixture (#38). The guard graduation (`check-generated-files`) is a
separate follow-up (PR B) and is **not** done here.

Base: `origin/main` (carries #37 + #38). Branch: `chore/mvp-c-activate-component-catalog`.

## 0. Done here / NOT done here

**Done (PR A):**
- `catalog/artifact-manifest.yaml` — `component-catalog` entry flipped
  `status: planned → active` and `do_not_edit: false → true`; preamble + stale
  inline comments rewritten to the route-tree/nav-graph style; removed the now-
  obsolete "component-catalog is the `do_not_edit:false` exception" note from the
  generated-artifacts contract doc block.
- `package.json` — added alias `"workflow:catalog": "node scripts/catalog-gen.mjs"`.
- `package-scripts.template.json` — moved `workflow:catalog` from the
  `//roadmap-scripts` staging map into the active `scripts` block (per the
  documented "move the line up when the target `.mjs` is implemented" protocol),
  as `node tools/frontend-workflow/scripts/catalog-gen.mjs`.

**NOT done (out of scope — by design):**
- `check-generated-files` allowlist/guard registration (`V1_ARTIFACT_IDS` +
  `V1_REPRODUCE`) — that is PR B (PR-6).
- CI changes (`.github/workflows/frontend-workflow-kit.yml`) — untouched.
- No generator semantics change, no output-format change.
- No props/docgen/NativeWind/style work.
- `roadmap-current.md` status lines (l.20 "still-proposal" list; l.105
  "remaining: component-catalog") intentionally **deferred** — they describe the
  catalog+guard pair, so the cleaner single edit is when PR B also lands, rather
  than a mid-stack half-true state. `roadmap-current.md` is also a high-traffic
  shared doc; leaving it out keeps PR A rebase-safe against the parallel Tier1 /
  execution-loop sessions.

## 1. Decision: flip BOTH status→active AND do_not_edit→true

The design source-contract (§6a) forbade flipping during the **design** PR,
because at that time there was no generator (`active` requires "script exists &
runnable", and `do_not_edit:true` would arm validate check 6 with no generator
behind it). Those blockers are now cleared:

- generator `scripts/catalog-gen.mjs` exists and is deterministic (#37);
- v1 output format is frozen with a committed golden (#38).

So we are at the **migration PR-5** the contract prescribes (§6b step 3, §10
PR-5): "generate once to replace the manual version + flip
`status: planned→active`, `do_not_edit: false→true`". This PR performs the
manifest/package half of that step. Both fields flip together — an `active`
generated artifact that is still hand-editable would be semantically incoherent,
and the active route-tree/nav-graph entries are the mirror (`do_not_edit: true`,
`status: active`).

`scope: design` is kept (catalog is design-scoped; route-tree/nav-graph are
`global`) — scope is unrelated to the activation flip.

## 2. Decision: alias name = `workflow:catalog` (not `workflow:component-catalog`)

`workflow:catalog` is the established, contract-bound name:
- the manifest `command:` field already reads `npm run workflow:catalog`;
- the template `//roadmap-scripts` already stages `workflow:catalog`.

Choosing `workflow:component-catalog` instead would force an extra edit to the
manifest `command:` field and diverge from the pre-planned roadmap name, for no
benefit. The user's instruction allowed "`workflow:component-catalog` **or** the
existing naming convention" — the existing convention/contract wins.

Note (pre-existing, not introduced here): the alias slug (`catalog`) and the
script filename (`catalog-gen.mjs`) both deviate from the strict
`workflow:<artifact>` → `<artifact>.mjs` pattern that route-tree/nav-graph
follow. This is the canonical naming already baked into the manifest+template,
so it is preserved verbatim.

## 3. Why this does not break verification

- **validate check 6** (`scripts/validate.mjs:446-457`) enforces the
  `GENERATED FILE — DO NOT EDIT` header only for `kind:generated` +
  `do_not_edit:true` entries **whose file exists**. After the flip, the only
  catalog file in the example tree is
  `examples/coupon-feature/docs/frontend-workflow/design/component-catalog.md`,
  whose line 2 already carries the em-dash marker → check 6 passes.
- **`check-generated-files.test.mjs`** has real-manifest assertions expecting
  `component-catalog` to be `selected:false` with `skip_reasons[0] ~ /planned/`.
  Those go stale with this flip — but that test is **not** wired into any gate
  (`npm test` runs `test-fixtures` + `--test spec/api-manifest/layout-profile`;
  CI runs `test:spec` + `example:*`; neither includes it). The assertions are
  repaired in PR B, which owns that file.

## 4. Verification (all green, from the worktree kit)

```
node --check scripts/catalog-gen.mjs                                   → OK
npm run workflow:catalog -- --src examples/component-catalog/basic-ui/src --dry-run
                                                                       → 3 components, frozen v1 header
npm test                                                               → 25 pass / 0 fail (+ test-fixtures stage)
npm run example:validate                                               → OK (검사 12종 통과)
npm run example:test                                                   → component-catalog:basic-ui PASS (GV:content 일치)
```

## 5. Merge hold

Do **not** merge until the parallel Tier1 integration-dogfood session confirms
no blocker-candidate. If Tier1 starts modifying `check-generated-files.mjs`,
`artifact-manifest.yaml`, `package.json`, or `test-fixtures.mjs`, rebase/coordinate
before merging. PR B (`feat(mvp-c): graduate component-catalog to check-generated v1`)
stacks on this branch.

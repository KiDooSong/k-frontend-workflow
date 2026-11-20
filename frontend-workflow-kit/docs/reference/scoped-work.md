# Scoped work execution (`authority: scoped`)

`authority: scoped` evaluates a **task-sized work unit** of an explicitly adopted
owner with its own evidence, instead of the cumulative screen `readiness_mode`.
It replaces only the cumulative phase limits. Source, decision, schema, owner,
generated-file and claim restrictions stay in force, and every result is review
input — never product, merge or human approval.

Use [current work](current-work.md) for tasks that the existing authority already
allows. Scoped work needs a human-reviewed opt-in first; without it the scoped
request fails closed.

## Adoption is an explicit human checkpoint

Nothing is adopted by default. A repository with no adoption overlay and no owner
`work_execution` declaration keeps byte-compatible legacy/current/visual-refresh
behavior.

1. **Adoption config and policy overlay** — `frontend-workflow.config.yaml` at the
   project root is the one place a repository declares adoption (#257). It names
   the policy overlay that lists the adopted owners and the role ceilings per work
   kind, and optionally the project layout. Paths are relative to the project root:

   ```yaml
   # frontend-workflow.config.yaml
   version: 1
   policy_overlay: config/frontend-workflow/adoption.yaml
   layout: config/frontend-workflow/project-layout.yaml   # optional
   ```

   ```yaml
   # config/frontend-workflow/adoption.yaml: work_execution only
   work_execution:
     version: 1
     owners: [screen:RESULT-001, surface:RESULT-PANEL]
     profiles: [visual, api-contract, behavior]
     role_limits:
       visual: [screen, domain_component, hook, test]
       api-contract: [api_client, test]
       behavior: [screen, domain_component, hook, api_client, test]
     deny_paths: []
   ```

   `role_limits` is a ceiling intersected with actual owner paths, not a glob
   grant. Move any project-specific extra prohibition into `deny_paths`.

   The project root is `--root`. An entry without `--root` uses the project that
   holds a `<root>/docs/frontend-workflow` docs directory, as `workflow:report` infers
   it, and otherwise the working directory. The five execution CLIs (readiness,
   forbidden-paths, packet, run and report, with or without `--work`), visual-refresh
   and `workflow:binding-status` read this config by default. Each applies the overlay
   over the base policy it selected (the bundled copy or `--policy`). A report also
   refuses when the forbidden-paths run it collects refuses the config; that run
   marks its refusal with a token the report passes for that run, so text an error
   merely echoes (a ref name, a path) is never taken for one. Why one config file:

   - The vendored policy stays byte-identical, so its visual-refresh pin and the
     vendored-kit upgrade keep working. Editing the vendored copy would break the
     pin and turn every upstream policy change into an upgrade conflict.
   - No call can lose adoption by omitting an argument. A `--policy` that carried
     the adoption could be left out of one call, which would then judge adopted
     paths as unadopted.

   Each of these is refused with exit 2 rather than judged as unadopted:

   - a config or overlay that cannot be read or does not validate, or a config
     `layout` path that cannot be inspected. That covers an invalid path inside the
     overlay's `work_execution`, an unknown key, a `version` other than 1, and a path that is absolute, uses `..`,
     crosses a symlink or differs in spelling from the repository entry. It also
     covers an overlay with any key besides `work_execution`.
   - a base policy (bundled or `--policy`) that declares `work_execution`;
   - owner documents that declare `work_execution` while the config names no
     `policy_overlay`, or while there is no config. An owner document is a
     ScreenSpec or shared-surface-spec by `artifact_type`, or by the file name
     `workflow:state` reads it under (`domains/**/screen-spec.md`, `surface-spec.md`).
     Like `workflow:state`, the check reads `domains` by that path: it follows a
     `domains` link, though no link below it, and on a case-insensitive file system
     reaches a directory named in another case.
     What could hide a declaration is refused too: a docs directory that cannot be
     inspected or listed, a docs Markdown file that cannot be read, and an owner
     document by name whose frontmatter does not parse or is never closed (whether
     it declares cannot be known). Only a bare `---` line closes it: a block that
     the reading ends at a `----` or `---x` line is not closed, even when a `---`
     line follows. The line right after the opening one never ends the block, so
     there such a line is content. An empty block (two `---` lines) is closed and
     declares nothing, so a parse error from body text read up to a later `---`
     line is not refused; a `work_execution` that reading yields still counts, as
     it does for the owner readers. Another document with broken frontmatter has no
     `artifact_type` and is never judged, so it is left as before;
   - an explicit `--layout` that names a different file from the config `layout`.
     The same file is accepted; without a config `layout`, `--layout` works as
     before.

   Every entry applies these checks before anything else can end the run.
   Visual-refresh runs them before it validates or reads any other resource, also
   when there is no `HEAD` to judge. A visual report checks the bundled policy before
   its backstop runs. A report therefore never turns one of these refusals into
   backstop error evidence.

   The config and the overlay are authority files. `--work` reads them from the
   committed `HEAD`, as it reads the policy. A `--work` or visual-refresh diff that
   changes either file, or creates the config, is reported as an authority change
   (`CW-GIT-AUTHORITY-CHANGED`/`SW-GIT-AUTHORITY-CHANGED`, `VR-BACKSTOP-012`). A
   current `--work` run looks for the config even where `HEAD` has none and Git
   ignores it; this adds no record to an unadopted repository's read set. Only the
   project root path is the config; a file of the same name elsewhere is ordinary
   work. A `--work` request saved at that path is not request transport either.

2. **Owner** — the ScreenSpec or shared-surface-spec frontmatter declares stable
   work units (not per-session permits), optional narrow private roots and test
   roots. A surface unit maps every member screen to a host unit, or to
   `legacy-current` for an unadopted member; a visual surface unit also selects
   each host's own mapping rows:

   ```yaml
   work_execution:
     version: 1
     units:
       - id: panel
         kind: visual
         contracts: [artifact:RESULT-PANEL-rules#rules]
         sources: []
         host_units: {RESULT-001: layout, RESULT-002: legacy-current}
         host_visual_evidence:
           RESULT-001: {mapping_ref: 'artifact:RESULT-001-figma-component-mapping#component-mapping', m_keys: [M-001]}
           RESULT-002: {mapping_ref: 'artifact:RESULT-002-figma-component-mapping#component-mapping', m_keys: [M-004]}
   ```

3. **Decision scope** (optional) — the canonical home of an Open Decision may
   declare which units of an owner it blocks with `decision_work_scopes`. Without a
   current binding an open decision blocks the units its canonical applications
   reach. A native owner relation (`local`, `decision-ref` or `surface-member`,
   with `unit: null`) blocks **every** scoped unit of that owner. An evidence
   relation belonging to one unit does not block the owner's other units.
   Missing and stale bindings use this same default; a current binding keeps
   its explicit `blocks`, including an empty list or another known unit.
   Only a person adopts, narrows or restores a binding; the tool computes and
   compares `basis_digest` but never authenticates `approval_ref`.

4. **Unknown and Conflict scope** (optional) — the document that holds an
   Unknown or Conflict row may narrow which units of an owner its open row blocks
   with `uncertainty_work_scopes`: the same binding, with `unknown_id` or
   `conflict_id` in place of `decision_id`, and the same digest and approval
   rules. It answers only what the tool cannot judge (`scope-review-needed`); a
   unit whose selected evidence reaches the row stays blocked. Reopening a
   resolved row removes its binding.

   ```yaml
   uncertainty_work_scopes:
     version: 1
     bindings:
       - conflict_id: C-012
         owner: screen:RESULT-001
         known_units: [result-layout, save-action]
         blocks: [save-action]
         basis_digest: sha256:<computed-by-tool>
         approval_ref: <existing-human-approval-evidence>
   ```

Pilot one owner or domain at a time, and review the migration diff (policy
ceilings, deny paths, roots, units, bindings) before relying on it.

## Binding basis and status

A binding's `basis_digest` is the sha256 of its scope basis, which the tool
computes from the documents (`basis_version: 2`, #275). The basis holds:

- the binding itself: the row, `owner`, `known_units` and `blocks` (not
  `basis_digest` or `approval_ref`);
- the owner's unit facts: each known unit's declaration (kind, contracts,
  isolation, API selection, sources, host units), the contracts and selected
  evidence it reaches, the owner's declared paths, the policy limits and surface
  membership;
- the bound row's relation closure: the row and its status, how it applies to the
  owner and its units, the rows it cites or that cite it (along evidence
  references, in either direction, including a row that applies to no owner),
  the rows an Unknown or Conflict relation names as a witness (and the
  rows that name it), and one evidence graph through which they apply. A
  document's frontmatter `decision_refs` brings a Decision in when a closure row
  cites that document, and the list itself is not hashed. In an owner spec (a
  screen or shared surface spec) the list declares the owner's own Decisions, so
  it does not relate them to the rows that cite some part of the spec; in any
  other document it is content, so a row citing that document relates to the
  Decision as an inline citation would. A reference to a section or a whole
  document (including an investigation or verification reference) covers the
  rows it holds, as overlapping evidence does for an Unknown or Conflict. An
  application that the Decision relations derived for an owner or unit stays
  only where that owner's or unit's own evidence (or a closure row applying to
  it) leads to it, not where only an unrelated row opened the route. Likewise
  how a related Unknown or Conflict applies to a unit is judged again from what
  the unit selects through its own evidence and the closure rows applying to it,
  with the uncertainty relations' precedence (selected, inverse, native, then
  transitive evidence): a selection that only an unrelated row makes changes
  neither the relation nor its witnesses. Which rows join through a witness,
  and which rows a unit derives from, follow the uncertainty relations over all
  of the owner's selections, so a row outside the closure that selects the
  same evidence can still change them; the binding then reads stale.

Scope-basis serialization orders object keys and explicit set members by UTF-8
bytes. Other arrays keep their order; strings receive no Unicode normalization.
The strict JSON checks reject duplicate normalized set members, lone Unicode
surrogates, cycles, sparse arrays, accessors and hidden properties. Set members
are validated together before duplicate checks and the returned values are
independent copies. Encoding ordinary set members once preserves these same
bytes and checks; it does not change the basis version or grant authority.

A Decision, Unknown or Conflict row that applies to no owner is found through
the references it cites, as resolution reads them (body, links, typed
`depends_on`), and through its document's `decision_refs`, wherever they lead,
and also when a related reference selects,
covers or names it, even if it cites nothing itself; it then joins with its
record. An exact artifact row selection
(`artifact:X#unknowns/U-1`) is the row it selects. Any non-empty Decision ID is
valid; one that cannot form a typed reference is an error only when its row
relates to the projection, including when a related reference selects or covers
it. As for Unknown and Conflict sections, an Open Decisions section that cannot
be read (no single canonical table in one Open Decisions section, prose only or
a quoted table included) or a row whose identity cannot be read (an empty ID or
one the table repeats) stops scoped work when its document holds a typed
reference (as resolution reads it, encoded link destinations included);
otherwise those rows cite nothing and are left out, while the table's other rows
stay. An ID that starts with `{` is a template placeholder, as in the target
index, and no row. A typed reference that cannot be resolved stops scoped work
wherever it is, and a Decision that a reached document's `decision_refs` names
is checked as an ordinary `decision_refs` entry: exactly one home, the canonical
global register, and a well-formed row there (the document's whole list resolves
as the Decision relations resolve an owner's, so a malformed row it names stops
scoped work).

So adding or editing another row of the owner leaves the digest unchanged unless
that row relates to the bound row; editing the bound row, a related row or any
unit contract changes it. Version 1 hashed every row that applied to the owner;
its digests read stale under version 2 ([upgrade notes](upgrade-notes.md)).

`npm run workflow:binding-status` lists, for every adopted owner (or `--owner
<id>`), each row that applies to it with its status and binding state:

| State | Meaning |
| --- | --- |
| `current` | the recorded digest equals the computed one |
| `stale` | the recorded digest differs (`basis`), or `known_units` is not the owner's current unit set (`known-units`) |
| `missing` | the row has no binding for the owner; it blocks the units shown (`blocking_units`): the units its canonical relations reach, every unit for an owner-wide native Decision, none once resolved (`resolved: true`) |
| `unresolved` | a binding declared for the owner on a row that does not apply to it or does not exist; it has no effect |

Every row includes `applications`: the canonical owner/unit relations considered
by the inspectors. Decision applications carry `relation` and `referrer`, and
an `uncertainty` ref when discovered through an Unknown or Conflict. Unknown and
Conflict applications carry `relation` and `witnesses` with `dependency`,
`selected` and, for a transitive relation, `via`. A `unit: null` relation applies
to all of that owner's units; `scope-review-needed` is a conservative native
scope, not a claimed explicit reference.

For a `missing` row, `blocking_applications` lists only the relations that
actually contribute to its reported `blocking_units`. It is empty for a
resolved row and excludes transitive uncertainty relations whose only witness
was removed by a current native-scope binding. When other witnesses keep the
relation active, its blocking list also omits each excluded `via` witness for
that same owner/unit. A resolved `via` row may still carry dependencies, so its
witness remains when the relation survives, even though that row blocks no
units itself. The full potential witness list stays in `applications`.
For `current`, `stale` and
`unresolved` rows it is `null`, as is `blocking_units`: the report does not turn
those declarations into an execution permit. An unresolved row has no
applications. Text output prints the missing row's blocking units, relation
names, referrers and witnesses beside the row.

Sharing a file alone does not create an evidence relation between disjoint
sections. Explicit references, including document metadata (`sources`,
`depends_on` and `decision_refs`), still participate. Different selections that
reach a shared source can therefore establish inverse evidence; its witnesses
name that common source. Native Unknown/Conflict scope also remains
conservative until a current human-owned binding narrows it. These diagnostics
explain those existing relations without discarding indirect dependencies,
changing row statuses, writing bindings or authenticating approval evidence.

Where it can compute one, it shows the recorded binding, the computed digest and
four component digests — `target` (the row's own entries), `relations` (the other
rows of its closure), `units` (the unit facts) and `evidence` (the relation
evidence) — so comparing two runs shows which part changed. It reads the
committed `HEAD` that `--work` evaluates, writes nothing and does not verify
`approval_ref`. Its temporary tree uses the shared
[snapshot cleanup and orphan recovery](visual-refresh-boundaries.md#temporary-snapshot-lifecycle).
Within that owned snapshot, the report resolves each owner's full applicability
projection once and derives its Decision and Unknown/Conflict binding digests
from the same projection. Within that computation, it builds the owner's unit
facts once; Decision and Unknown/Conflict relations still expand to their full
fixed point. Before reusing the unit facts, it checks their file read set, every
consulted register's absence and any input text read during validation, including
Evidence from unselected inputs. The canonical layout and preset are checked
between relation passes. It re-reads the canonical binding homes and verifies
these observations and the complete file read set before returning the owner's
report. No projection is shared across owners or calls. The standalone inspectors
for mutable files keep their independent resolution and change checks.
Unknown-row authoring checks prepare a compact fact for each physical row while
building the canonical exact-body authored view. A weak association with that
native row lets later row/unit applications reuse its authored/GENERATED
classification even after an oversized document's active batch ends. Each lookup
checks the selection's current physical node, exact body and source offsets;
copied contexts retain that identity, while a JSON-only selection cannot supply
it. A row from another parser generation uses the canonical offset check once.
An explicitly supplied raw view retains its own interpretation and cannot
replace those canonical facts. Only internally produced immutable raw sections
with the matching body and tree can prepare canonical facts through a raw-view
wrapper. These facts hold no tree or authored view and cache no file
observations, row states or digests.
The public authored view preserves its existing same-tree mutable prewarming,
including inside an active document scope. If that cached interpretation is
custom, canonical row checks prepare their own temporary view without replacing
it; later authored reference resolvers still observe edits to the custom table.

For adopted owners, the report also prepares a detached immutable copy of each
eligible input's plain metadata once inside its owned snapshot. When every record
has the collector's ordinary immutable fields, it also owns a frozen copy of the
complete input list. The first source resolver prepares the duplicate-preserving
ID positions and metadata-only inventory validation; later source resolvers in
that snapshot reuse this pure calculation. No input is pruned from validation.

Each observation scope prepares immutable source records with no supplied body.
Resolvers copy only selected records before loading their bodies; their loaded
files and section caches remain separate. Register validation still reads the
selected local bodies and freshly observes unselected Evidence. An observer's
private callback follows its own records and never becomes another observer's
read history. Current input bytes, indexed metadata comparisons, expected hashes
and final read-set audits still run. The shared catalog stores no source text,
register verdict, binding state or digest, and weak collection identities keep
its lifetime within the owned snapshot.

Returned metadata remains independent and mutable. Ordinary source and graph
callers keep their existing eager metadata copies and inventory validation;
freezing a caller's object does not opt it in. Accessors, proxies, cycles,
mutable built-in objects and unusual record fields retain the existing fallback.
An ownerless report skips preparation. The first source constructor remains the
validation boundary, so merely collecting unused inputs does not validate them.

The scoped `--work` execution adapter uses the same private preparation after
its baseline input validation and origin processing. It passes the owned input
collection to the snapshot's fresh source resolvers while retaining the original
collected input records for authority inventory and backstop checks. Unselected
inputs remain part of that inventory; changing one still fails the existing
authority check. This preparation does not make public mutable callers eligible
for reuse or change the unusual-metadata fallback described above.

The shared provenance timestamp helper also reuses the format/calendar result
for the exact trimmed primitive string. Its LRU keeps at most 2,048 copied keys
and 128 KiB of UTF-16 key storage; these limits are not a bound on total RSS.
Oversized strings use the existing uncached parser. Each input field is still
validated, and timestamp-to-epoch conversion still calls `Date.parse` normally.
No metadata, whole-input verdict, file observation or binding digest is cached.
Cold distinct timestamps can cost more than the uncached helper, so performance
claims require an end-to-end workload with the repeated syntax seen in profiling.

Scoped reference resolvers and evidence graph readers also reuse immutable raw
section, table and cell views of the same native AST. A weak association keeps
each derived view with that exact tree; reparsing after AST eviction starts a
new view generation. This uses the bounded AST syntax cache described below rather than
a second source-text cache with a separate eviction threshold. Derived views
remain allocated while existing owners retain their trees, so the source-cache
budget is not a bound on total memory. The ordinary reference-view parser still
returns independent mutable containers to callers that need them.
For immutable source tables, fresh resolvers also reuse the raw cell encoding
and private row-identity indexes. This avoids splitting and indexing an entire
table again for each separately resolved candidate. The weak keys identify both
the source table object and its native AST node, so equal text and even a source
table supplied at two physical locations cannot merge those locations.
Mutable source tables and tables with accessors keep the resolver-local path.
Each returned row still receives independent header and cell arrays, and the
public raw-table helper still returns fresh mutable values.
These derived encodings and indexes add retained memory while their existing
source-table owners are live; they introduce no additional source-text cache or
separate eviction threshold.
Each resolver keeps its own metadata and mapping validation, and each graph
still reads current bytes, checks the indexed body and metadata, and rechecks
its complete read set. Sharing raw syntax does not reuse selected records,
resolution modes, graph results or file observations across those checks.

Within one strict or candidate graph, its reference resolver can hand its
already parsed immutable view to the graph's document reader. The reader first
checks current file bytes, frontmatter and indexed body, and accepts the view
only for the same resolver, artifact ID and exact body. The input Evidence path
uses the same handoff, guarded by that source resolver, input ID and exact body.
The first anchor selection and the legacy Evidence parser share one synchronous
syntax scope. Thus an artifact or input above the syntax-cache budgets needs
one parse for reference selection and graph use. Input section wrappers remain
independent between resolvers, including when their immutable nodes are shared.
The view follows that resolver's lifetime; every graph still performs its own
reads. An independent graph outside the same live uncertainty evaluation cannot
inherit an oversized view from the completed call.

Canonical API candidate lookups share a private authored section view and row
index for the same native tree. Unit projection and source-relation evaluation
each create one lazy resolver for their candidate batch and exact owner body.
That resolver holds its view through the batch even if the body exceeds a cache
budget; no candidates means no parse. Independently calling the scalar helper
does not extend an oversized view's lifetime across calls.
Public mutable authored views and explicitly
supplied raw interpretations retain their own behavior. Canonical Unknown row
classification also derives from private syntax, so editing a public header
cannot change the classification when the AST is evicted and rebuilt. A proven
internally shared raw view uses this canonical classification too; an explicit
custom raw view retains its own interpretation. Its
compact physical-row facts and private tree-keyed views add no separate
source-text cache or retention threshold.

Internal graph, source and relation evaluators use the canonical reference
resolver through actual contract selection and application, not only row
classification. Their document scopes pin private canonical syntax without
constructing or replacing a caller's public authored cache. Public authored
views and the public reference resolver keep their mutable/custom interpretation;
explicit custom raw views cannot populate the canonical API Tracking cache.
Equal-cell authored and GENERATED rows still retain distinct physical sources.
Default Unknown-home lookups copy their mutable derived containers without
changing the caller's authored prewarm or cloning immutable native nodes.
Exact target row preflight also uses canonical source facts, so Reconciliation
validation does not replace a public authored prewarm while counting rows.

The digest covers the binding as committed: to add or change a
binding, commit it with any well-formed digest (for example `sha256:` followed by
64 zeros), review the scope, then record the computed digest with an
`approval_ref` for that review and commit again. A refreshed digest goes with a
new `approval_ref`, never the old one: the library transition check reports an
old `approval_ref` on a changed binding, but no command runs it yet, so reviewers
check it.

The library's before/after Decision transition check also compares each
Decision's applicable unit sets. These come from canonical `applications`,
expanding a native `unit: null` against that snapshot's complete `known_units`,
independently of status and declared `blocks`. Each transition reports
`before_applicable_units`, `after_applicable_units` and `removed_applicable_units`.
If a Decision is open on either side, removing even one previously applicable
unit sets `removed_open_applicability`, even when another unit still references
that Decision. The scope transition is invalid and every current owner unit
stays blocked, matching the existing full-applicability-removal rule. A different
remaining path to the same unit is not a unit removal; a Decision resolved on
both sides adds no open block. Single-snapshot scope evaluation still uses the
current canonical application set or a current binding's explicit `blocks`.
These are library transition findings; no public command runs this check yet,
and the findings neither authenticate review nor grant execution permission.

When a [historical Item row target](#historical-item-row-targets) needs a wider
selection, the text report also shows a `SW-SOURCE-TARGET-FALLBACK` warning. JSON
reports include `owners[].target_fallbacks` only for affected owners. These
diagnostics are separate from the binding basis and do not change its version.

#### Bounded syntax retention

Dense Markdown lists and tables can allocate many native AST nodes for a small
source string. The shared AST cache, authored-view cache and each uncertainty
evaluation's document cache therefore enforce three independent limits:

| Limit, per cache | Maximum retained |
| --- | --- |
| Source text | 8,388,608 UTF-16 code units |
| Native AST nodes | 262,144 |
| Entries | 512 |

All three limits apply together, with least-recently-used eviction. A single
oversized entry is returned to its current caller without being retained by
these caches or displacing other useful entries. Authored views count their
entire native tree because they can keep it alive after the AST cache evicts it.
The uncertainty document cache counts its path and original document text as well as its tree.
These are structural retention budgets, not measurements of V8 allocation size
or a total heap/RSS guarantee. Derived views, live selected graphs, input indexes
and the parser's temporary allocations still consume memory.

An uncertainty document's synchronous row batch keeps its exact-source native
tree and shared raw/authored views active until the batch finishes. This includes
oversized documents and cached trees evicted by nested dependency work, so more
candidate rows do not each reparse the same whole document. Covered Unknown rows
from a selected section/body use the same batch lifetime; physical spans needed
by later relation merging are computed while that document is active. A
synchronous uncertainty evaluation also keeps at most one oversized dependency
tree outside these caches. Repeated candidate graphs for that exact dependency
reuse it; another oversized source replaces it. Ordinary documents continue to
use the bounded caches. Alternating oversized dependencies can therefore still
require repeated parsing. Nested scopes restore their predecessor
on return or error, and a later call or asynchronous continuation cannot inherit
a completed scope. These scopes do not collect every oversized document for
the owner, and the single overflow slot is released on return or error.
The reference resolver that enumerates an owner's rows has the same document
batch lifetime. Returning or throwing releases that resolver and its full
parsed views; completed batches cannot accumulate oversized owner trees in an
evaluation-wide resolver. Required selected node fragments can still outlive
their batch, and the separate single dependency overflow slot remains unchanged.

Before retaining a candidate graph, the uncertainty evaluation prepares spans
for all its selections, including external dependencies. Remembered native
selections need no full document view just to compute their ranges. For equal
current file hashes, exact bodies and ordered native type/offset identities,
immutable physical selections share the same selected node fragments across
parser generations. Each selection keeps its own wrapper and subsection mode.
The evaluation retains those fragments already needed by the results, rather
than one full dependency tree per candidate. Selected fragments may themselves
be large, and neither this sharing nor the one-tree slot is a total RSS bound.

Selections in one candidate graph are grouped by source file. The mandatory
current-byte/hash audit of that graph supplies the source body once for all of
that file's Evidence spans. This reuse ends with the file's span preparation:
another graph performs its own reads, and the final complete read-set audit is
unchanged. A malformed document's relevance check also reads/materializes its
body once within its own synchronous scope.

The selected-row helpers receive that batch's already read document rather than
reading, hashing and splitting its frontmatter again. Within one uncertainty
evaluation, candidate graphs selecting the same immutable native nodes also
share their leaf-span arrays. This sharing checks the exact body, ordered
physical node identities and input-bullet nesting mode. Separate wrapper arrays
containing the same node sequence share the same internal result, including
multi-paragraph input sections; equal refs or row contents do not merge
different physical selections. Mutable nodes, accessors, proxies and custom
array iteration keep the fresh-computation path. Indexed-child eligibility
applies only to ordinary arrays with the native inherited Array iterator
and a verified native own data `next` method on its iterator prototype. The
methods must also be native when first observed: a custom method installed
before module import cannot certify sharing. Eligibility rechecks descriptors
without calling custom accessors or walking proxy ancestors;
the actual native walk still honors custom traversal. The internal arrays are immutable, the public span helper
still returns independent mutable values, and a later evaluation gets its own
span store. These arrays and the compact row facts above follow existing node
owners rather than extending an oversized tree's active scope; they do not add a
source-keyed cache or change the retention budgets.

Eviction drops syntax only. The uncertainty evaluation retains every observed
file hash, rereads current bytes on a document-cache miss, rejects mismatches
with its earlier observation, and audits the complete read set at the end.
Active syntax never replaces a graph's current-file, metadata or indexed-body
checks, and explicitly supplied raw parser generations keep their own views.
Raw/authored physical selections, source boundaries, refusal reasons and
scope-basis/checkpoint bytes keep their existing contracts. A working set above
these limits may require more parsing; cache misses never skip validation.

### Optional binding-status progress

Use `--progress` to see elapsed stages while a large report is running. Capture
the report and its diagnostic log separately:

```bash
npm run -s workflow:binding-status -- --owner screen:COUPON-001 --json --progress \
  > binding-status.json 2> binding-status.progress.log
```

The stderr prefix is `binding-status [<seconds>s]`. Stages identify snapshot
materialization, input/resource preparation, each owner projection, Decision and
Unknown/Conflict binding checks, individual computed digests and actual snapshot
cleanup. Binding-check updates show rows checked and digests computed separately:
missing bindings and stale `known_units` still have no computed digest. Row counts
are coarse progress, not a completion-time estimate; a single projection can
take most of the run. The next marker is written when the synchronous phase moves
forward, rather than on a timer. Failed materialization and owner evaluation also
mark their actual cleanup before deleting the snapshot.

Progress is off by default. The boolean flag changes neither JSON/text stdout nor
binding state, scope-basis-v2 bytes, exit codes or approval requirements. An
unwritable stderr disables diagnostics without changing the result. No final
digest is reused across runs: changing a unit still changes the basis inputs,
and a person must review and record the resulting binding as described above.

#### Owner projection diagnostics

Both `binding-status --progress` and scoped `workflow:run --work --progress`
report `owner-projection:start`, `owner-projection:done` or
`owner-projection:failed`. Between those boundaries,
`owner-projection:progress` identifies the selected owner, the phase and a
cumulative count of completed operations. Phases distinguish input metadata,
source selections and passes, units, contract/candidate graph work, candidate
rows/documents/relations, input fidelity and file audits.

These counts describe work performed within that projection. Repeated graph or
source passes count their repeated operations; the counts are not unique inputs,
coverage, a known total or a completion-time estimate. Each encountered phase
reports its first completed operation. Further intermediate updates share one
one-second throttle across phases, and changed counts are flushed at completion
or failure. The phase vocabulary is finite, so thousands of short graph calls do
not each create a new start/done pair. There is no timer-only heartbeat: a long
individual synchronous step can still leave a gap until it completes.

`input-metadata: N records prepared` counts source record preparations, including
immutable seeds and selected resolver-local copies. Reusing an existing seed
does not add another operation. Metadata preparation before the owner context
is outside this count; it is included in whole-command elapsed time. These
diagnostics count neither file reads nor Markdown parses.

`owner-stage:start|done|failed` additionally identifies `boundary`, `units`,
`sources`, `uncertainty`, `candidates` and `audit` work. The start marker is
written before that synchronous work; the closing marker includes inclusive
`elapsed_ms` and the stage's sampled heap maximum. Nested stage durations
overlap and must not be added together.

`owner-memory:progress` reports current `heap`, `external`, `rss`, the owner's
`heap-sampled-peak`, and process-lifetime `max-rss`, all in bytes (`unit=B`).
Heap maxima are the largest observed samples, not exact transient V8 peaks.
Samples occur at owner/stage boundaries and at most once a second during
completed operations, without a timer or a memory read for every graph node.
The owner heap maximum resets for each owner; process maximum RSS does not.
The last stage and memory sample can help locate a stall or later OOM, but a
fatal V8 OOM cannot promise a final marker or a completed JSON/packet.

The reporter stays outside requests, results, binding bases and read sets.
Opting out suppresses these diagnostics and their memory sampling. A failed
clock, memory sample or stderr write disables diagnostics
without changing evaluation, output artifacts or the original error.

## Request contract

The five execution CLIs accept the same document as current work. A scoped
request selects one owner **unit**:

```json
{
  "version": 1,
  "origin_inputs": [],
  "requests": [
    {
      "owner": "surface:RESULT-PANEL",
      "authority": "scoped",
      "unit": "panel",
      "coverage_reports": ["docs/frontend-workflow/_meta/reviews/result-review.md"],
      "targets": [{"path": "src/features/result/components/panel/Panel.tsx", "change": "M"}]
    }
  ]
}
```

- Keys are exactly `owner`, `authority`, `unit`, `targets` and optional
  `coverage_reports`; `requested_mode` and caller verdicts are invalid.
- Coverage report files, like every other authority file, are read from the
  committed baseline tree; commit the reviewed report before the preflight.
- Scoped targets support regular-file `A`, `M` and `D` (#276). A `D` target must
  be a regular file in the baseline (`delete-target-missing` when it is absent)
  and passes the same unit gates and path checks as `A`/`M`. A path the owner
  declares exactly — its screen entry, an exact surface, private or test path,
  or a Slice Paths entry of its API Candidates tables as written (whether or not
  the requesting unit selects that API, and even when the entry is not usable
  API evidence) — is denied as `declared-path-delete`: deleting it changes the
  owner's declaration, which a person reviews. A code block (fenced or indented)
  is an example, not a declaration. Renames, copies and type/mode changes stay
  separate work.
- An owner may select several distinct units; a target shared by several requests
  must plan the same change.
- `origin_inputs` has the current-work meaning: the preserved starting inputs,
  never an exclusion list.
- A document mixing current and scoped requests is an input error; submit
  separate work requests.

## Artifact section references

For scoped ordinary artifact references, `artifact:EXAMPLE#section` selects a
section's original content, with the existing Markdown slug rules:

- Existing H2 lookup has priority, including its missing/ambiguity rules and
  full content extent with child headings. An H3 with the same slug does not
  change that H2 or create ambiguity; that H3 cannot be selected independently.
  An ambiguous H2 is never hidden by an H3 fallback.
- Only when that H2 lookup has no match, a section-only token may select one
  unique native authored root H3. Its content starts after its heading and ends
  before the next authored root H1, H2 or H3 (or the document end). H4–H6 and
  their content remain descendants, with no independent H4–H6 selectors.
- Quoted, listed, fenced, indented, inline-code, comment and GENERATED examples
  cannot supply an H3 heading. GENERATED headings do not split an authored
  subsection. Original text and nodes inside its extent remain ordinary
  evidence, including generated content, as in an authored H2.
- Duplicate H3 slugs fail closed. Selection keeps native AST nodes/spans and the
  original document's reference definitions, including after copying or
  serializing evidence. Dangling, malformed or ambiguous typed dependencies
  still stop resolution.

This fallback does not apply to `/row`, typed child references, input anchors or
global Reconciliation Items section splitting. `/row` remains an H2 table-row
selector, never a heading path. Canonical home slugs (`open-decisions`,
`unknowns`, `conflicts`, `gaps`, `component-gap-register`, `api-candidates`,
`component-mapping`, `mapping-provenance`) require their existing H2 contracts;
an H3 cannot substitute for one. API and mapping ownership/provenance rules
still apply.

An H3 may contain canonical rows whose home remains an existing H2. Those exact
physical rows stay covered by the H3 selection, including in inverse relations
and binding closures. Editing a related Decision must therefore invalidate the
affected binding's basis, as it does for the parent H2 selection. An empty native
scope binding cannot clear a selected open row.

A parent H2 effect continues to cover its H3 content. Selecting H3 does not
discard original inputs, Items or sibling effects, satisfy source/coverage
review, approve a binding or establish readiness. Selected, inverse and
transitive unresolved evidence keeps its blocking effect, including under a
binding that narrows only native `scope-review-needed` relations.

## Historical Item row targets

A v2 Reconciliation Item records the effect performed during reconciliation.
Later document maintenance can remove its target row without changing that
history. During Item source resolution only, an ordinary
`artifact:EXAMPLE#section/key` target therefore uses the following selection:

| Current target | Effective evidence |
| --- | --- |
| One exact raw first-cell row exists | That row, with the existing selection and graph bytes |
| The exact row is absent but the section resolves | The surviving section |
| The section is absent and the artifact still exists | The whole surviving artifact |

The section step uses the existing [section resolver](#artifact-section-references),
including its unique authored H3 fallback when no H2 matches. It does not make
H3 `/row` references valid. Backticks, different case or additional text in the
first cell do not become an exact row match; a historical Item with that missing
exact row uses the same conservative fallback.

Only a missing ordinary artifact row or its section permits this widening.
Direct unit `contracts`, ordinary body/dependency references and section-only
Item targets remain strict. Typed child targets (`decision:`, `unknown:`,
`conflict:`, `gap:`, `investigation:`, `verification:`), canonical mapping M-key
and Mapping Provenance identities, missing artifacts, malformed references or
tables, and ambiguous rows or sections retain their existing errors. A duplicate
row or section is never resolved by taking a wider selection.

The Item's original `Target` and all its other fields stay unchanged. Every
effect of a selected Item remains in scope; a sibling effect is not dropped
because its row has gone. The effective target supplies the dependency roots,
selected current content and source-overlap evidence. Adding an Item's own
dependency root does not establish its initial connection to the unit. An
unconnected Item keeps its source issue, and an unrelated historical Item found
during inference does not become selected merely because its target falls back.
The first Item witnesses and each anchor's connection to them are tracked even
before a fallback is discovered through other inputs. A newly selected anchor
can join an original witness whose evidence actually overlaps it, including
section-wide evidence; an Item's own added target cannot supply that connection.
These retained facts apply when the closure selects a historical fallback, so
its discovery pass cannot change whether an unsupported anchor satisfies source
coverage. Closures without a selected fallback keep their existing output and
basis behavior.

Affected `binding-status` owners report `target_fallbacks` entries with
`code: SW-SOURCE-TARGET-FALLBACK`, the owner/unit, register file, `input_id`,
`item_id`, `original_ref`, `effective_ref` and `reason` (`missing-row` or
`missing-section`). The warning can describe a target inspected during inference
even when its Item was not selected. The diagnostics stay outside the hashed
projection; selected original Item fields and effective evidence remain inside
it. Successful exact targets keep their existing graph and binding bytes, while
affected selections can include more current content and change their basis.

This resolution does not rewrite history, add a retirement effect, approve a
binding or satisfy a coverage receipt. Current source/receipt requirements and
open Decision, Unknown and Conflict restrictions still apply to the wider
evidence. The change adds no required gate, warning promotion or basis/package
version migration. Authoring warnings are described in
[Input Reconciliation](input-reconciliation.md#scoped-참조-preflight-warnings-293).

## Common CLI flow

Use the [representative before/after run flow](current-work.md#common-cli-flow)
with `.workflow/scoped-work.json`. Carry the same request/origins/resource options
and the pre-work packet to the post-work run, before committing the implementation.
[Packet-bound output and preservation rules](current-work.md#packet-bound-run-outputs)
apply to scoped runs too. The scoped parser/assertion binds its own authority,
directory and target read sets; a current packet cannot stand in for it.
Standalone readiness/packet/report/forbidden-paths remain diagnostic/compatible entries.
`readiness.mjs --work <request>` runs the scoped preflight once when the request
selects `authority: scoped`. It does not start Jest, retry itself or impose a
30-minute timeout; those behaviors belong to the invoking runner or session.
For long representative runs, `workflow:run --work ... --progress` provides
[optional stderr phase diagnostics](current-work.md#optional-progress-diagnostics)
without adding fields to the scoped result or checkpoint.

## Evaluation on the immutable baseline

Source relation resolution reuses successful canonical reads across the passes of
one source closure. First-read SHA-256 pins outlive evicted bytes; retained raw
bytes are bounded to 16 MiB per closure. This is a byte-cache budget, not a process
RSS limit. Graph/source expected hashes are checked on every use, and all pinned
files are freshly checked for canonical path spelling, ancestors and bytes before
returning. The register's independent parsers retain fresh byte checks at each
pass boundary; optional register absence is also rechecked. Source read caches never cross calls;
read-set entries, relation rules and binding/checkpoint digest inputs are unchanged.

Within one source-relation pass, repeated effect/anchor comparisons reuse the
private resolved input record for each exact Evidence ref. Anchors of one input
share one private metadata copy rather than retaining a copy per anchor. Section and bullet
refs keep their distinct selections and native source spans. This avoids
repeated metadata copies and span reconstruction for the same anchor without
changing which effects overlap it. Each new pass or call creates a fresh source
resolver and its own selected records and body state. Owned snapshot resolvers
share only the immutable inventory preparation described above. Expected-hash checks still run on every use;
current-file and metadata checks, validation-only Evidence observations and the
final read-set audit remain in place. Source relation passes add no separate
input-body, file-observation or register-validation cache. Public results remain independent,
and source admission, scope-basis-v2 and checkpoint bytes are unchanged.

Initial path reads in graph, source, Decision, uncertainty and applicability calculations
reuse directory-entry name sets within a private resolver. Each use checks the
current parent identity, mode, size and nanosecond modification/change times before
reusing names. Each ancestor and leaf is still checked, and both root and target
physical paths are resolved on every successful check. Changed directories are
listed again; missing paths, path validity, file bytes and validation results are
never cached by this resolver. Every final read-set path uses the uncached
canonical check, which reads directory entries anew for that individual file.
Expected-hash rechecks, source register parser boundaries and optional-register
absence verification also use uncached path checks. Even matching nanosecond
timestamps cannot prove that a later file's spelling stayed unchanged during
an audit. Current-file, byte, metadata and hash checks remain in place.
Each resolver retains at most 256 directory listings and 1 MiB of estimated
path/name storage, not total process RSS; oversized listings are not retained.
Resolvers remain private to initial reads and are not used for verification
or shared across independent calls. Standalone canonical path
checks keep their existing uncached behavior.

Frontmatter decoding separately reuses ordinary YAML syntax by exact source text
within a process. It returns independent metadata objects and retains only copied
YAML keys and serialized values, bounded to 4 MiB and 2,048 entries; this does not
bound total process RSS. Unusual YAML retains only a parser-route marker under
the same bounds and invokes the original parser on every call, including diagnostics.
Current bytes, indexed metadata/body comparisons and final read audits still run.

Within the execution adapter's owned baseline, each owner or adopted host's
profile and Decision-scope inspections resolve separate applicability projections.
Each projection builds its unit facts once and reuses them while expanding the
complete relation fixed point. The Decision inspection derives every canonical
binding basis from its own projection. Before each reuse and before publishing,
the session freshly verifies all observed files, consulted register absences and
input Evidence read only for validation. The profile keeps this verifier through
its later source/coverage/API checks, calls it before applying uncertainty scopes,
and calls it again after the profile's final API-directory and file audits.
Canonical binding homes are still re-read and compared with their indexed
metadata/body. Input coverage, path, host consent and final composition checks
remain independent. No request field selects this internal path, no result is
shared across owners or calls, and mutable standalone inspectors keep their
independent relation and per-binding resolutions. Scope-basis-v2, read sets,
denials and checkpoint bytes retain their existing meanings.

Every decision is computed from the materialized `HEAD` tree. Worktree edits,
packets and serialized verdicts are not authority. For each scoped request:

- **Owner** — the unit's profile predicate (`visual`, `api-contract`, `behavior`)
  over its resolved contracts, sources/coverage and origins; the owner's canonical
  Decision scopes; and every concrete target against the owner envelope (exact
  entry, private/test roots, surface implementation paths, role ceilings, API
  claims, reservations of other owners, generated/global/route/explicit denies).
- **Surface hosts** — every member: an adopted host needs its own profile, Decision
  scopes and consent under its member role ceiling; a `legacy-current` host
  consents only through the member base envelope of the actual legacy surface
  computation, over the workflow state computed from the baseline documents and
  source tree like [current work](current-work.md#origin-and-snapshot-binding)
  (a generated `_meta/workflow-state.yaml` is never read). A visual
  surface keeps each host's mapping rows and Figma provenance; a selected component
  must resolve to one literal repository path inside the surface's own
  implementation paths.
- **Shared targets** — a target selected by several requests is allowed only when
  every responsible request allows it.
- **Legacy readiness** is preserved as information in `legacy_readiness` and its
  phase blockers appear as `future_requirements`. Invalid or structural legacy
  markers and owners missing from the computed state are errors.
- **Reference IDs** — a decision, Unknown, Conflict or gap reference resolves to
  the exact ID in the canonical table that holds the row, as in the general
  contracts: the table, not an ID prefix, decides the kind. Scoped work needs only
  an ID that fits a typed reference (`[A-Za-z0-9][A-Za-z0-9._-]*`) and does not
  start with another kind's prefix (`D-`, `U-`, `C-`, `G-`, `INV-`, `VER-`).
  Investigation and verification references keep their prefix. Reconciliation
  Items targets use the
  [same grammar](input-reconciliation.md#reconciliation-contract-v2-opt-in) (#274),
  so a scoped reference and an Items target read one token the same way.
- **Uncertainty audit** — Unknowns and Conflicts tables are audited in every
  document. A table-shape or row-identity problem stops the preflight when a row
  there could relate to the request: the document belongs to a selected owner's
  native scope (its own spec, a surface it hosts, a same-domain, global or
  undomained document), holds selected evidence, or contains any typed reference
  — as written, in decoded frontmatter or as a link destination, the way
  resolution reads it. Elsewhere the section is skipped and listed in
  `required_reviews` as
  `Unaudited uncertainty section <file>#<section>: <reason>`.
- **Uncertainty relations** — an Unknown or Conflict row applies to a unit
  through the unit's selected evidence, through a row or Decision it reaches, or
  natively: to every unit of an owner whose spec, hosted surface, domain or a
  global or undomained document holds it. An ordinary artifact row, section or
  document selection retains a canonical Unknown whose original row it covers,
  including a GENERATED row beside an independent authored table. Its canonical
  reference must resolve to the same physical row; an ambiguous or different
  source stops resolution. A resolved row does not block (an
  Unknown with Status `resolved` in any case, a Conflict with `resolved`). An
  open Conflicts row outside every owner spec keeps that native relation only for
  the owners its `영향 화면` cell names, for a named surface's member screens,
  and for a surface that hosts a named screen still on legacy readiness (a
  `legacy-current` host checks no Unknown or Conflict), when the cell lists only
  known screen or surface IDs separated by `,` or `·`; `global` in any letter
  case (even when a screen has that ID), a blank, prose, markup or an unknown ID
  keeps it for every owner. A resolved row keeps its relations whatever the cell
  names. A current
  `uncertainty_work_scopes` binding on an open row keeps the native relation
  only for its `blocks`, unless the unit still reaches the row through another
  row it keeps; a binding on a resolved row changes nothing.
  The request lists each row whose home declares a binding for its owner in
  `evidence.uncertainty_scopes` (an adopted surface host's under its
  `evidence.hosts` entry), and each binding that narrows in `required_reviews`
  as `Uncertainty scope <ref> for <owner> is narrowed …`.
- **Legacy sources** — a contract's canonical source (an `IN-` entry in
  frontmatter `sources`, or a typed input reference) connects through
  Reconciliation Items whose target touches the selected contract. An input
  captured before the v2 register's `structured_since` that has no Items is the
  [summary-only legacy row](input-reconciliation.md#v2-frontmatter) the register
  contract allows. It connects through that row when the row is `reconciled`
  with a canonical Result for that status (`accepted`, `pending-user-decision`,
  `rejected`, `delegated`, `no-change`, `mixed`); the Decisions and Conflicts it
  created keep their own gates. The register parser picks the row and its cells;
  its Reconcile Status and Result must also be canonical as written in the
  Summary table the validator checks (not an example placed before it), before
  the parser drops HTML comments, so `accepted <!-- … -->` does not connect.
  This check uses the validator's content view: removed code and HTML blocks
  stay excluded, while comment positions are retained for the raw-cell check.
  Source offsets identify the original lines contributing to each validated
  row. A comment starting on those lines belongs to that row through its
  closing delimiter, including internal CR/LF bytes. Adjacent actual comments
  separated only by spaces or tabs belong to that row too; an external newline
  or visible text ends this continuation. Owned comments are not repeated on
  the next row, and later independent comments stay excluded.
  A removed block after a bare CR cannot become row evidence or hide the next
  row. The existing LF/CRLF raw-row split still
  keeps a bare CR between retained pipe fragments in the same row. The
  request lists it, with the row's validated cells, its line as written and the
  input sha256, in `evidence.legacy_sources` (an adopted surface host's under its
  `evidence.hosts` entry) and in `required_reviews` as
  `Legacy summary-only source <input_id> (reconciled + <result>) …`. Any Item, a
  later capture, a v1 register, another status or an annotated Result
  (`accepted — …`) keeps the item-level rule and its `source-effect-unconnected`
  denial. An Item source uses the [source admission table](#item-backed-source-admission)
  below; the summary-only connection does not admit Items or explain a request
  origin by itself. History from before adoption has no later re-apply path,
  so its Result is reported, not gated.
- **Screen mapping evidence** — a Figma mapping that a screen unit lists in its
  own `contracts`, or the screen's own opted-in mapping (same `screen_id` and domain,
  `provenance_contract: 1`), selected as a whole document, `#component-mapping`
  or an M-key row, also selects each M-key's Mapping Provenance row and
  evidence; its single Component Mapping table, owning screen and domain stay
  fail-closed. A mapping from another screen or domain, or a legacy one without
  `provenance_contract`, reached only as an Item effect target or body reference
  stays ordinary evidence in the read set and basis, without M-key provenance
  rows or a host interpretation.

The envelope has `work_contract: 1`, `authority: scoped`, `snapshot`,
`request_digest`, `origin_inputs`, `requests` (per request `path_authorizations`,
`prerequisite_denials`, `evidence`), `shared_targets`, `ready`, `errors`,
`denials`, `future_requirements` and `required_reviews`.

## Item-backed source admission

For canonical v2 Reconciliation Items, source inspection, unit-source admission
and `no-effect-on-unit` origin routing use the same state allowlist:

| Reconcile Status | Result | Supported source state | Current coverage receipt required for unit-source admission |
| --- | --- | --- | --- |
| `reconciled` | `accepted` | yes | no (existing complete reconciliation) |
| `reconciled` | `pending` | yes | yes |
| `partially-reconciled` | `accepted` or `pending` | yes | yes |
| `reconciled` | `pending-user-decision` | yes | yes |
| `reconciled` | `mixed` | yes | yes |
| any other combination, including partial + `pending-user-decision`/`mixed` | any | no | a receipt cannot make it supported |

A required receipt is a `work-coverage` attachment in a committed review file
explicitly selected by the request's `coverage_reports`. It declares
`review_scope: reconcile-stage04-v1` and `coverage: complete-for-unit`, matches
the owner, unit, input, exact Item/source-ref sets and current input, effects and
contract hashes, and has a positive coverage relation (an omitted relation or
`covered-for-unit`). A `no-effect-on-unit` attachment is routing evidence only;
it never substitutes for required positive source coverage. The selected source
must still connect through actual Items to the unit's contracts.

No-effect routing always needs its own current receipt, exact original scope,
connected origin effects and unrelated routing targets. It cannot hide a unit
source, a selected-contract effect, a pending canonical source connection or a
related unresolved uncertainty. A successor with `accepted` Result does not
replace an original `origin_inputs` entry or its required explanation.

The [Stage 04 semantic review](reconcile-review-rubric.md) of source/routing
completeness and meaning remains required. The tool reports
`semantic_coverage_verified: false` and `approval_verified: false`; current hashes
do not authenticate a reviewer or approve a human scope change. Preserve the
input, Summary Result, Items and canonical source references. Open Decisions,
Unknowns, Conflicts, API claims, profiles, bindings, host/shared-target consent,
path reservations and snapshot/backstop checks still apply. Source coverage alone
does not make a request ready.

## Git backstop

After implementation, `forbidden-paths`, `report` and `run` re-read the request
(bytes and digest) and compare the actual `HEAD..worktree` (or `--staged` index)
diff with the baseline:

- every consumed authority file, the document/input inventories and every consumed
  API evidence path must be unchanged — an implementation diff cannot self-grant.
  An evidence path keeps its kind (missing, file or directory) and a directory
  keeps its members; the worktree check lists them on disk, Git-ignored entries
  included, while `--staged` reads the index only;
- only allowed, requested regular-file `A`/`M`/`D` targets with the requested
  change kind may change; `M` keeps its file mode, and `D` may remove only a
  baseline regular file. In the worktree a deleted target must be gone: a
  directory left at the path, even empty or holding only ignored files, is a type
  violation. A regular file put back at the path is no delete: the requested `D`
  is missing, and unless the file keeps its baseline bytes and mode, Git sees an
  unrequested modify. Under a directory left there Git reports only the files it
  does not ignore, as adds, and an add the request does not name is unrequested;
- renames, copies, type/mode changes, unrequested paths (an unrequested delete
  included) and missing requested changes are violations. The diff detects
  renames, so a requested `D` and `A` whose contents Git pairs as a rename are
  still a rename.

`workflow:forbidden-paths --work` stays advisory (exit 0) unless `--enforce`
(exit 1 on violations). Run states and exit codes are the same as
[current work](current-work.md#run-states).

## Adopted paths in fallback entries

An adopted owner's scoped paths (exact screen entry, surface implementation
paths, declared private/test roots and the adopted screens' active Candidate Slice
Paths) need `authority: scoped` with a unit. `readiness --path`, no-work
`forbidden-paths`, current work and visual-refresh v1 return
`work-selection-required` there instead of a broad allow, so a denied scoped task
cannot be retried under an older mode, another intent or current authority. Other
paths of the same owner keep their existing decisions, and no-selector readiness
summaries are unchanged.

## While a unit is blocked

A request under a blocked unit is not ready, whatever it changes — for example
while an open Decision, Unknown or Conflict reaches the unit. Maintenance
unrelated to the blocking row (a comment cleanup, a dead-file delete) is blocked
too: there is no maintenance exception, and the fallback guard above keeps current
work from taking the change over (#276). To unblock the unit, a person:

- resolves the blocking row through its normal workflow;
- adds or re-judges the row's binding (`decision_work_scopes` or
  `uncertainty_work_scopes`) so the row blocks fewer units, with a recomputed
  `basis_digest` ([binding status](#binding-basis-and-status)) and its
  `approval_ref`. A Decision binding's `blocks` applies as
  written; an Unknown or Conflict binding narrows only the row's native relation,
  so a unit whose selected evidence reaches that row stays blocked; or
- withdraws the owner's adoption ([rollback](#rollback-and-downgrade)), which
  returns its paths to the legacy authority.

## Rollback and downgrade

Stop scoped work first. Review the current diff and unfinished work, restore the
reviewed explicit deny boundaries, then withdraw adoption owner by owner: remove the
owner from the overlay's `owners`, then its `work_execution` declaration. Remove
the config's `policy_overlay` only after no owner document declares
`work_execution`; otherwise every entry refuses to judge. Do not delete
input/effect/work records to hide history. The vendored-kit upgrade planner refuses
to apply automatically a payload that cannot enforce adoption markers while tracked
`work_execution`/`decision_work_scopes`/`uncertainty_work_scopes` declarations
(the overlay included) remain in the consumer repository. A payload older than the
adoption config cannot read the overlay, so it counts as one that cannot enforce
them. An older kit binary run by hand is outside this guarantee.

## What the tool does not prove

The tool checks references, statuses, digests, paths, claims and snapshots. It
does not prove semantic equivalence of mixed visual/behavior edits, pixel parity,
the completeness of prose contracts or coverage receipts, development-only
isolation, or who approved a binding. Reviewers own those judgments.

## Known limits

- Only the five execution CLIs, visual-refresh and `workflow:binding-status` read
  `frontend-workflow.config.yaml`. Other commands (`workflow:state`, `validate`,
  `doctor` and the rest) still take the layout from `--layout` or the default, so
  pass the same layout to them. `workflow:report` passes the configured layout to
  its validate, forbidden-paths and check-generated runs.
- The library check that pairs `HEAD` with the index (`inspectScopedGit*`) takes
  its resources explicitly, the overlay as `policy_overlay`; it does not read the
  config.
- A layout `preset` is read only from a kit inside the project root.
- A selected mapping component cell must hold one literal repository path
  (optionally in one inline-code pair); other forms are reported as
  `surface-visual-evidence-unresolved`.
- Git evidence is `HEAD` against the worktree, or against the index with
  `--staged`; commit ranges are not an input. Committing the implementation moves
  the baseline, so check it with the packet-bound post-work `run` before that commit (standalone
  `forbidden-paths`/`report` remain available).
- The CLI reads one baseline snapshot. It does not see a row reopened with its
  binding left in place, because the reopened row has the bytes the binding was
  recorded for. As for Decisions, a library check that pairs `HEAD` with the
  index reports such a reopen, but no command runs it yet; reviewers check that
  a reopen diff removes the binding.
- A consumed API evidence directory is compared with its committed members, so an
  uncommitted or Git-ignored file there (OS or editor metadata too) is reported in
  the worktree check. Keep such directories clean, or name the evidence files.

# Scoped binding applicability — #333

HISTORICAL — implementation and review evidence for this slice; the current
contract lives in [scoped-work.md](../../../frontend-workflow-kit/docs/reference/scoped-work.md#binding-basis-and-status).

## Scope and baseline

- Issue: [#333](https://github.com/KiDooSong/k-frontend-workflow/issues/333).
- Baseline: `0269c8bdd72ffeed211cb29fa5c8741c2db5e340` (main, including #330).
- The fixtures contain only synthetic screens, sections, rows and approval refs.
- This change is independent of the owner-memory work in #332. It does not
  claim to reproduce the private consumer's entire local snapshot or resolve
  its runtime and memory observations.

## Diagnosis

Decision relation resolution already records the unit that reaches each
Decision. Both the binding inspector and the Decision scope evaluator discarded
that distinction when a binding was missing or stale and used every known unit
of the owner. A Decision reached only by `settings-ui` therefore also blocked
the independent `parse-result` unit.

The issue's proposed minimal condition — two screens selecting disjoint
sections of the same document — does **not** reproduce a relation on its own.
The regression fixture preserves that negative control for Decision, Unknown
and Conflict rows. Adding a real reference from `settings-ui`, directly or
through Unknown/Conflict rows, reproduces the incorrect owner-wide Decision
block on the baseline.

Other broad relations remain intentional: document metadata can lead two
selections to the same source and establish inverse evidence, and native
Unknown/Conflict scopes remain conservative. An owner spec's `decision_refs`
also participates in forward dependency traversal. This change preserves those
contracts and exposes their canonical witnesses instead of inferring that
different screens or sections are necessarily unrelated.

## Resulting behavior

| Case | Missing/stale Decision default |
| --- | --- |
| Only `settings-ui` reaches the Decision | `settings-ui` |
| Both units independently reach it | Both units |
| Any native application has `unit: null` | All current owner units |
| Decision is resolved | No Decision block |
| Current canonical binding exists | Its explicit `blocks` remains authoritative for scope calculation |

No binding, digest, status, approval evidence, graph edge or scope-basis version
is rewritten. Invalid references/declarations and invalid reopen transitions
retain their fail-closed behavior.

`binding-status` adds `applications` for the canonical potential relations and
`blocking_applications` for the relations that actually explain a missing
binding's `blocking_units`. An uncertainty relation reachable only through a
bound-out native row is absent from the latter. A surviving application also
omits individual witnesses whose `via` row was bound out for that owner/unit.
Resolved via rows still carry dependencies when their relation is kept.
Resolved missing rows have an empty list; current/stale/unresolved rows have
`null`. Text output includes the unit, relation, referrer and uncertainty witnesses.

## Regression evidence

The new `scoped-work-blocking-relations.test.mjs` contains 19 cases covering:
separate sections, one/both consuming units, indirect Unknown → Conflict →
Decision references, native scope, missing/stale bindings, resolved/current
bindings, malformed inputs, committed-HEAD CLI output, JSON/text witnesses,
progress stdout equality, repository preservation, and bound-out transitive
uncertainty explanations, mixed kept/excluded witnesses, and resolved via rows.

On the untouched baseline, a named selection of six new behavioral regressions
fails **6/6**: direct and indirect references, missing/stale-basis/stale-known-units
defaults, and the real binding-status CLI. Each fails because the independent
unit is included in `blocking_units`. The same cases pass with the change.

Existing binding tests had two expectations for the old owner-wide default.
They now assert the exact reached unit and, for an inverse relation, its
Unknown root. Native and malformed/transition tests retain their prior scope.

## Independent review

- Standards review: no remaining P0/P1/P2; an independent Node 20.20.2 run of
  the new fixture, Decision scopes and transitions passed 61/61 before the two
  final diagnostic/preservation cases were added.
- Spec/correctness review: found the two obsolete existing expectations; after
  their correction both focused cases passed. No remaining P0/P1/P2.
- Both reviewers examined the final two added cases and retained clean verdicts.
- A separate synthetic shared-metadata-source CLI experiment preserved the
  inverse blockers and reported the actual common source in JSON and text.
- A final mixed-path check found one diagnostic P2: a kept application could
  still list a witness through a bound-out row. The report now filters only
  its blocking witness copy by `(owner, unit, uncertainty)` kept membership;
  potential applications and all scope decisions stay unchanged. The new
  regression checks both the excluded witness and a resolved via row that must
  remain. The finding was corrected and independently re-reviewed.

Review findings were resolved before submission. Review and binding digests do
not authenticate a human approval or authorize a merge.

## Follow-up review — partial unit applicability removal (#334)

The subsequent user review identified a P2 missed by the initial review: both
transition inspectors only detected removal of a Decision from the entire
owner. With unit-scoped defaults, deleting one unit's reference could therefore
remove its block while another unit kept the same open Decision applicable.

An independent real-Git reproduction on submitted HEAD
`b91bddbcfa71a1a19a8d9832da0aa113b9592ae5` commits two different contract sections
that both refer to the same unbound open Decision. It then stages deletion of
only the `known` unit's reference. The before/after results are:

| Result | Submitted HEAD | Corrected transition |
| --- | --- | --- |
| `blocking_units` | `["other"]` | `["known", "other"]` |
| `known.decisions_clear` | `true` | `false` |
| `transition_valid` | `true` | `false` |
| `removed_open_applicability` | `false` | `true` |
| `violations` | `[]` | `[]` |
| `review_required` | `true` | `true` |

The lower transition inspector now compares applicable units per Decision,
derived from canonical applications rather than status-dependent blockers or a
binding's explicit `blocks`. A native `unit: null` expands against each
snapshot's own complete unit set. The output reports before, after and removed
applicable units; the scope composer consumes the same removal flag. Removal
with an open status on either side invalidates the transition and retains the
existing fallback to every current owner unit. A resolved-to-resolved change
does not introduce a block, and losing one route without losing a reached unit
does not count as unit removal. Single-snapshot scope calculations stay intact.

Nine new real-Git regressions in `scoped-work-decision-scopes.test.mjs` cover
missing/stale bindings, refreshed current empty blocks, native-to-unit scope,
retained alternate paths, resolved rows, an unbound reopen and per-Decision
changes hidden by an unchanged owner-wide union. The staged-removal cases also
restore HEAD bytes in the worktree and assert preservation of HEAD, raw index
bytes, status and worktree bytes. Both Git transition APIs are exercised. The
existing packed harness already includes this suite.

With the same suite copied beside the exact `b91bddb` runtime, 21 of 28 cases
pass and seven defect cases fail; the existing 19 cases and both new negative
controls pass. The corrected runtime passes all 28 cases. This separates
reproducing the reported gap from merely asserting new diagnostic fields.

The follow-up integrates main `c1424bffb84a0af6bb1650847b582097c51b9ef8`, including
the reviewed #332 fix `0ca823ae75930f2d89c02e1b365d1e683c21f309`. Merge conflicts
were limited to the packed resolver test list and the current roadmap; both
PRs' additions are retained. The correction changes library transition
judgment only: no public command invokes this transition check, and this
reproduction does not establish a `workflow:run` permission bypass.

The final independent Standards/Spec reviews and exact-head verification
results are recorded in PR #334.

## Validation

Validation results are recorded in the PR alongside the exact submitted commit.
The initial local 114-file Node 20 spec batch (packed gate run separately) hit
its 600-second process limit without an assertion failure in the emitted TAP;
it is not recorded as a complete pass. The final CI runs provide the full gate.
The new suite is included in the packed-runtime harness, so it exercises shipped
modules and the shipped CLI as well as source runtime. The package's existing
Node 20/24 and macOS workflows remain unchanged.

## Limit of the evidence

The private consumer's complete measured snapshot was not available in this
repository. The change proves the unit-to-owner expansion fix and adds enough
relation evidence to classify remaining blockers; it does not establish that
all reported consumer blockers disappear, that every broad inverse/native
relation is unnecessary, or that OOM and long-running evaluations are fixed.

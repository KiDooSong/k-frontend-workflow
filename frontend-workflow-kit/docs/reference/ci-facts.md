# CI facts — readiness input and evidence

`workflow:readiness --ci <file>` reads facts supplied by the consumer project.
The file records observed checks and review results; readiness evaluates those
values with the selected implementation policy. The shipped policy requires four
CI facts for `production-ready`. Other facts, Open Decisions and concrete-path
authorization still apply.

The conventional home is `docs/frontend-workflow/_meta/ci-facts.yaml`. Start from
[`ci-facts.template.yaml`](../../templates/meta/ci-facts.template.yaml), then pass
the file explicitly. There is no automatic discovery or CI-facts producer.

```bash
npm run workflow:readiness -- --screen COUPON-001 \
  --ci docs/frontend-workflow/_meta/ci-facts.yaml --json
```

`--screen` selects the reported result; it does not limit the CI values to that
screen. Check the [scope requirements](#scope-and-authorship) before supplying facts.

## File shape

Use a flat YAML mapping of these four keys. An empty mapping (`{}`) or a partial
mapping is valid; omitted and `null` values do not assert a successful check.
The template starts with every value unset:

```yaml
ci_lint: null
ci_schema_validation: null
state_coverage_complete: null
llm_semantic_review: null
```

| Key | Authoring values | Evidence to record |
|---|---|---|
| `ci_lint` | `pass`, `fail`, `null` | Exact lint command or CI check, tested revision and scope, result and output/run reference. |
| `ci_schema_validation` | `pass`, `fail`, `null` | The project's applicable schema/contract checks, exact invocation or check identity, result and output/run reference. |
| `state_coverage_complete` | `true`, `false`, `null` | The states and scope reviewed, their tests/stories or coverage record, and actual results. A filled State Matrix alone does not establish coverage. |
| `llm_semantic_review` | `pass`, `fail`, `null` | An explicit semantic-review result for the tested revision and scope, with review criteria, findings/disposition and a durable review reference. |

`null` means no usable result has been recorded. Keep unrun, interrupted or
unverified work unset; record an observed failure as `fail` or `false` rather
than inventing a success. Under the shipped policy, only the exact string `pass`
and the YAML boolean `true` satisfy the corresponding requirements. Strings such
as `"true"`, `passed` and `PASS` are not substitutes.

[`ci-facts.schema.json`](../../schemas/ci-facts.schema.json) is an **authoring/editor
schema**. It checks this mapping and its value types, permits empty/partial
mappings, and rejects additional keys when a schema validator is used. Associate
it with this file in an editor or the consumer's own schema-checking setup.
The runtime does not automatically enforce this schema, and `workflow:validate`
does not acquire a CI-facts check. Existing readers and their error behavior are
unchanged; this is not a new gate or a format migration.

Do not wrap the facts in `facts:`, add a version envelope, or put provenance in
extra YAML keys. A legacy file's extra keys are not newly rejected at runtime,
but they are outside this authoring contract. In particular, a mapping containing
only metadata keys already counts as a supplied CI mapping; it is not equivalent
to omitting `--ci` and does not provide any of the four facts.

## Record provenance without changing the mapping

Put provenance in YAML comments beside the values, or link a durable report that
contains it. Comments are ignored by the YAML reader. Preserve enough information
to identify and revisit each result:

- Project identity and the immutable tested source revision or build reference.
- Screens/surfaces and members influencing the evaluation, relevant paths,
  platform/environment and the scope actually checked. Include a durable
  diff/content reference if the tested work differs from the recorded source revision.
- For each fact, the exact command/check and observed result, or the semantic
  review reference and explicit outcome. Link the output, run or review evidence.
- The actor who ran/reviewed the work or recorded that result, and `observed_at`
  with a timezone. A report may hold these details once when shared by facts.

For example, retain the unset value until the placeholders have real evidence:

```yaml
# project: <consumer project>
# tested_revision: <full commit ID or immutable build reference>
# scope: <screen/surface IDs, paths, platform and environment actually checked>
# ci_lint: command=<exact command>; result=<observed result>; evidence=<durable ref>
# actor: <runner/operator>; observed_at: <timestamp with timezone>
ci_lint: null
# llm_semantic_review: review=<durable ref>; result=<explicit review outcome>
# actor: <reviewer>; observed_at: <timestamp with timezone>
llm_semantic_review: null
```

These comments are an audit trail, not machine-validated scope, freshness or
identity. Keep the record and referenced evidence available for review; the kit
does not verify signatures, reviewer identity, evidence contents or revision
freshness. Recheck affected facts when the source, scope, environment or review
criteria change. Do not carry a `pass` from unrelated or superseded evidence.

## Scope and authorship

The flat mapping applies throughout the **loaded project/workflow state**.
Readiness evaluates its screens and surfaces, including members, before applying
the `--screen` or `--surface` result filter. Those flags select what is reported;
they do not restrict CI values to the named ID. Concrete-path checks also consult
cross-owner claims from the full result.

Scope notes are not machine filters, and there is no per-screen or per-surface
fact map. Evidence must cover all owners and members that influence the
evaluation. Do not reuse a one-screen `pass` as a project-wide fact or rely on an
output filter to make that evidence sufficient.

An agent or operator may record checks it actually ran or verified from an
identified result. `llm_semantic_review=pass` requires an actual, explicit review
outcome matching the current source and scope. Do not infer it from lint, schema
validation, `workflow:validate`, a successful test suite, or readiness itself.
Keep an incomplete or unavailable review unset and preserve its unresolved work.

Recording a review result is not human approval. It does not resolve an Open
Decision, close an Unknown, accept a Component Gap or promote `confirmed`.
Those transitions follow [Stage 09](workflow-stages/09-human-decision-gates.md).
CI values can affect the fact-based mode under the existing policy; they do not
replace the decision cap, path checks or the selected work authority.

## Missing and partial data

With no CI mapping, unmet CI facts still prevent the shipped policy's
`production-ready` mode, but they remain omitted from `blocking`. When the
evaluated policy has an actionable unmet CI requirement, `next_actions` points
to supplying `--ci` and this contract. The hint does not change the mode, add a
blocker or grant permission. A policy with no unmet CI requirement does not
receive this missing-data hint.

An empty mapping behaves as no CI data. A nonempty partial mapping, including the
four-`null` template, is supplied data: failed or missing requirements retain the
existing CI blockers and action hints. Passing some facts never implies that
omitted facts passed. `blocking: []` alone does not establish that the highest
mode was reached; read `readiness_mode`, `next_mode` and `next_actions` together.

## CLI and snapshot boundaries

Use only the options supported by each command; see [Commands](../../COMMANDS.md).
Ordinary readiness accepts `--ci`. `workflow:state` and `workflow:validate` do not.
Ordinary no-work `packet`/`run` do not accept `--ci`; the existing `--work` and
explicit visual-refresh branches have their own resource options.

| Invocation | Existing CI resource behavior |
|---|---|
| Ordinary readiness, without `--work` or visual-refresh intent | Resolves `--ci` from the working directory. A nonexistent file retains the legacy empty-data fallback; malformed YAML retains its existing input-error handling. Check that the intended file was read instead of treating this fallback as validation. |
| Current/scoped `--work` | CI is an explicit project resource read from the immutable HEAD baseline. The file must satisfy the existing regular-file/resource rules and be present in that baseline. An untracked temporary YAML file is not baseline authority. |
| Explicit visual-refresh | CI follows the existing project-resource and selected snapshot rules, including resource provenance. A missing explicit resource is an error; the ordinary readiness fallback does not apply. |

For current/scoped work, prepare the CI record before the pre-work checkpoint and
repeat the same resource options for the packet-bound run. Resource identities
and bytes remain bound by the existing baseline and backstop; editing a record
or its comments during the work does not bypass that comparison. See
[current work](current-work.md#common-cli-flow) and
[scoped work](scoped-work.md). Visual-refresh retains its existing
[snapshot boundaries](visual-refresh-boundaries.md#raw-git-names-and-object-snapshots).

Record and report these facts during [Stage 08](workflow-stages/08-validate-and-report.md).
Use Stage 09 separately when a human-owned transition is requested. The authoring
schema and template do not add automatic check execution, evidence approval,
required CI checks or a new authority model.

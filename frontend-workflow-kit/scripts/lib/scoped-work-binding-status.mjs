// #275: a read-only report of the scope bindings of adopted owners on the committed
// HEAD, the snapshot `--work` evaluates. For each row that applies to an owner it
// shows the binding state, the recorded binding, and the scope-basis-v2 digest and
// component digests the tool computes; a binding declared for the owner on a row
// that does not apply to it is listed as unresolved. A person records a digest:
// this never writes a binding, verifies approval_ref or authorizes any work.
import path from 'node:path';
import { parseArgs } from './util.mjs';
import { enforceCliFlagContract } from './cli-args.mjs';
import { collectInputArtifacts } from './input-artifact.mjs';
import { materializeRawGitTree } from './visual-refresh-git-objects.mjs';
import { CurrentWorkExecutionError, resolveProjectRoot, gitIdentity, yamlFile } from './current-work-execution-core.mjs';
import { resolveWorkResources } from './current-work-execution-preflight.mjs';
import { byteCompare, ownerParts } from './current-work-request.mjs';
import { baselineArtifactIndex } from './scoped-work-execution.mjs';
import { parseScopedTargetRef } from './scoped-work-refs.mjs';
import { parseScopedPolicy, parseDecisionWorkScopes, parseUncertaintyWorkScopes } from './scoped-work-declarations.mjs';
import { inspectScopedDecisionBindings } from './scoped-work-bindings.mjs';
import { inspectScopedUncertaintyScopes } from './scoped-work-uncertainty-scopes.mjs';
import { SCOPE_BASIS_VERSION } from './scoped-work-basis.mjs';

const TOOL = 'binding-status';
const fail = (message) => { throw new CurrentWorkExecutionError(message); };
// The inspectors' binding states, named for a person reviewing them.
const STATES = { 'current-unverified': ['current', null], 'stale-basis': ['stale', 'basis'],
  'stale-known-units': ['stale', 'known-units'], missing: ['missing', null] };
const recorded = (binding) => binding ? { known_units: binding.known_units, blocks: binding.blocks,
  basis_digest: binding.basis_digest, approval_ref: binding.approval_ref } : null;

function ownerStatus(options, home) {
  const decisions = inspectScopedDecisionBindings(options), uncertainty = inspectScopedUncertaintyScopes(options);
  const row = (ref, kind, check) => {
    if (!STATES[check.binding_state]) fail(`unknown binding state ${check.binding_state}`);
    const [state, reason] = STATES[check.binding_state];
    return { ref, kind, status: check.status ?? null, home: home(parseScopedTargetRef(ref).ownerArtifactId), state, stale_reason: reason,
      recorded: recorded(check.declared_binding), computed_basis_digest: check.computed_basis_digest,
      components: check.computed_component_digests };
  };
  const rows = [...decisions.checks.map((check) => row(check.decision, 'decision', check)),
    ...uncertainty.checks.map((check) => row(check.uncertainty, check.kind, check))];
  const applicable = new Set(rows.map((entry) => entry.ref));
  for (const [id, entry] of options.targetIndex.artifacts) {
    const declared = [
      ...(parseDecisionWorkScopes(entry.fm.decision_work_scopes)?.bindings || []).map((binding) => [`decision:${binding.decision_id}@${id}`, 'decision', binding]),
      ...(parseUncertaintyWorkScopes(entry.fm.uncertainty_work_scopes)?.bindings || []).map((binding) => [`${binding.kind}:${binding.id}@${id}`, binding.kind, binding]),
    ];
    for (const [ref, kind, binding] of declared) if (binding.owner === options.owner && !applicable.has(ref)) {
      rows.push({ ref, kind, status: null, home: home(id), state: 'unresolved', stale_reason: null, recorded: recorded(binding),
        computed_basis_digest: null, components: null });
    }
  }
  return { owner: options.owner, known_units: decisions.known_units, rows: rows.sort((a, b) => byteCompare(a.ref, b.ref)) };
}

export function inspectScopedBindingStatus({ root, docs, src, policy, manifest, layout, owner } = {}) {
  const ctx = resolveProjectRoot(root);
  const identity = gitIdentity(ctx.repositoryRoot);
  const snapshot = materializeRawGitTree({ repositoryRoot: ctx.repositoryRoot, projectPrefix: ctx.projectPrefix, tree: identity.tree });
  try {
    const baselineRoot = snapshot.root;
    const { resources, baselineKitRoot } = resolveWorkResources(ctx, baselineRoot, { docs, src, policy, manifest, layout });
    const adopted = parseScopedPolicy(yamlFile(resources.policy.baseline, 'policy').work_execution)?.owners || [];
    if (owner !== undefined) {
      ownerParts(owner);
      if (!adopted.includes(owner)) fail(`owner ${owner} is not adopted in policy work_execution.owners`);
    }
    const docsRoot = resources.docs.baseline, { targetIndex } = baselineArtifactIndex(docsRoot);
    const options = { projectRoot: baselineRoot, docsDir: docsRoot, kitRoot: baselineKitRoot,
      policyFile: resources.policy.baseline, layoutFile: resources.layout.baseline, manifestFile: resources.manifest.baseline,
      registerFile: path.join(docsRoot, '_meta', 'reconciliation-register.md'), targetIndex,
      inputArtifacts: collectInputArtifacts(path.join(docsRoot, 'inputs')), srcDir: resources.src.baseline };
    const home = (artifactId) => {
      const entry = targetIndex.artifacts.get(artifactId);
      return entry ? path.relative(baselineRoot, entry.file).split(path.sep).join('/') : null;
    };
    return { binding_status: 1, basis_version: SCOPE_BASIS_VERSION, snapshot: { commit: identity.commit, tree: identity.tree },
      owners: (owner === undefined ? adopted : [owner]).map((id) => ownerStatus({ ...options, owner: id }, home)),
      approval_verified: false };
  } finally {
    snapshot.cleanup();
  }
}

const HELP = `Usage: npm run workflow:binding-status -- [--owner <screen:ID|surface:ID>] [--json]
       [--root <dir>] [--docs <dir>] [--src <dir>] [--policy <file>] [--manifest <file>] [--layout <file>]

Reports the decision_work_scopes and uncertainty_work_scopes bindings of the adopted owners
(every policy work_execution owner, or --owner) on the committed HEAD, which --work evaluates.
For each row that applies to an owner: its status, the binding state (current, stale, missing),
the recorded binding, and the scope-basis-v${SCOPE_BASIS_VERSION} digest and component digests
(target, relations, units, evidence) the tool computes. A binding declared for the owner on a
row that does not apply to it is unresolved. Read-only: a person records a digest; the tool
never writes a binding or verifies approval_ref. Exit 0 with a report; 2 on usage or input errors.
`;

function render(report) {
  const lines = [`binding-status — commit ${report.snapshot.commit} — scope-basis-v${report.basis_version} (read-only; approval_ref is not verified)`];
  if (!report.owners.length) lines.push('  no adopted owners');
  for (const entry of report.owners) {
    lines.push(`${entry.owner} (known units: ${entry.known_units.join(', ')})`);
    for (const row of entry.rows) {
      const state = row.stale_reason ? `${row.state} (${row.stale_reason})` : row.state;
      lines.push(`  ${row.ref}  ${row.status ?? '-'}  ${state}${row.state === 'missing' ? '  — blocks every unit; no binding' : ''}`);
      if (row.recorded) {
        lines.push(`    recorded ${row.recorded.basis_digest}  approval_ref ${row.recorded.approval_ref}  known_units ${row.recorded.known_units.join(', ')}` +
          `  blocks ${row.recorded.blocks.length ? row.recorded.blocks.join(', ') : '(none)'}  in ${row.home}`);
      }
      if (row.computed_basis_digest) {
        lines.push(`    computed ${row.computed_basis_digest}`);
        lines.push(`    components ${Object.entries(row.components).map(([key, value]) => `${key} ${value}`).join('  ')}`);
      }
    }
  }
  return `${lines.join('\n')}\n`;
}

export function cliMain(argv) {
  const parsed = parseArgs(argv);
  enforceCliFlagContract({ argv, flags: parsed.flags, positionals: parsed.positionals,
    valueFlags: new Set(['root', 'docs', 'src', 'policy', 'manifest', 'layout', 'owner']), booleanFlags: new Set(['json', 'help']),
    tool: TOOL, helpCommand: 'npm run workflow:binding-status --' });
  const { flags } = parsed;
  if (flags.help) { process.stdout.write(HELP); return; }
  try {
    if (argv.filter((token) => token === '--owner' || token.startsWith('--owner=')).length > 1) {
      fail('--owner accepts one owner; omit it to report every adopted owner');
    }
    const report = inspectScopedBindingStatus({ root: flags.root, docs: flags.docs, src: flags.src, policy: flags.policy,
      manifest: flags.manifest, layout: flags.layout, owner: flags.owner });
    process.stdout.write(flags.json ? `${JSON.stringify(report, null, 2)}\n` : render(report));
  } catch (error) {
    process.stderr.write(`${TOOL}: ${error?.message || String(error)}\n`);
    process.exitCode = 2;
  }
}

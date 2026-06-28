#!/usr/bin/env node
// upgrade-vendored-kit.mjs — safe, manifest-based upgrade for a consumer repo
// that vendors frontend-workflow-kit under tools/frontend-workflow/.
//
// Run this from the NEW packed kit, pointed at the consumer's current vendored
// kit and the new payload:
//
//   node /path/to/new/frontend-workflow-kit/scripts/upgrade-vendored-kit.mjs \
//     --current tools/frontend-workflow \
//     --next    /path/to/new/frontend-workflow-kit \
//     --dry-run --plan kit-upgrade-plan.md
//
// Default is --dry-run (no writes). --apply performs only safe updates and adds;
// it never overwrites locally modified files, never deletes upstream-removed
// files (unless --prune), and only ever writes inside --current.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, runCli } from './lib/util.mjs';
import { UPGRADE_DIR_NAME } from './lib/kit-manifest.mjs';
import { buildPlan, renderPlanMarkdown, applyPlan } from './lib/upgrade-planner.mjs';

const TOOL = 'upgrade-vendored-kit';

const HELP = `${TOOL} — safe vendored-kit upgrade planner/apply

Usage:
  node scripts/upgrade-vendored-kit.mjs --current <dir> --next <dir> [options]

Required:
  --current <path>   Current vendored kit in the consumer repo (e.g. tools/frontend-workflow).
  --next <path>      Newly packed kit payload (the new dist/frontend-workflow-kit).

Mode:
  --dry-run          Plan only; no writes (default).
  --apply            Apply safe updates and new files; refresh the install manifest.

Output:
  --plan <path>      Write the markdown upgrade plan to <path>.
                     On --apply (without --plan) a plan is written under
                     <current>/${UPGRADE_DIR_NAME}/upgrade-plan-<next-ref>.md.
  --json             Print the machine-readable plan to stdout.

Apply safety (all default OFF):
  --prune            Delete files removed upstream (orphans). Off by default.
  --allow-conflicts  Overwrite conflicted files with upstream. Off by default.
  --force-runtime    Overwrite conflicted consumer-runtime files only. Off by default.
  --backup-dir <p>   Copy each file before it is overwritten/pruned into <p>.

Notes:
  - Only files inside --current are ever modified.
  - Locally modified files are never overwritten unless you opt in explicitly.
  - Conflicts are written as <current>/.upgrade-conflicts/<path>.incoming for manual merge.
  - No migrations are run and no consumer docs/source are touched.
`;

function fail(message, code = 2) {
  process.stderr.write(`${TOOL}: ${message}\n`);
  process.exit(code);
}

function requireDir(label, value) {
  if (typeof value !== 'string' || !value) fail(`${label} is required`);
  const abs = path.resolve(value);
  let stat;
  try {
    stat = fs.statSync(abs);
  } catch {
    fail(`${label} path does not exist: ${abs}`);
  }
  if (!stat.isDirectory()) fail(`${label} path is not a directory: ${abs}`);
  return abs;
}

function sanitizeRef(ref) {
  if (!ref) return 'unknown';
  const short = /^[0-9a-f]{40}$/i.test(ref) ? ref.slice(0, 12) : ref;
  return short.replace(/[^\w.-]+/g, '-');
}

function renderHumanSummary(plan) {
  const c = plan.counts;
  const lines = [];
  lines.push(`${TOOL} — ${plan.options.apply ? 'apply' : 'dry-run'} (baseline: ${plan.baseline})`);
  lines.push(`  current ref : ${plan.current.source_ref || 'unknown'}`);
  lines.push(`  next ref    : ${plan.next.source_ref || 'unknown'}`);
  lines.push(`  safe-update=${c['safe-update']} new=${c['new-file']} conflict=${c.conflict} `
    + `local-modified=${c['local-modified']} orphan=${c['removed-upstream']} `
    + `missing=${c['missing-current']} unchanged=${c.unchanged} unknown-local=${c['unknown-local']}`);
  for (const w of plan.warnings) lines.push(`  ! ${w}`);
  return lines.join('\n') + '\n';
}

function main() {
  const { flags } = parseArgs(process.argv.slice(2));

  if (flags.help) {
    process.stdout.write(HELP);
    process.exit(0);
  }

  const currentDir = requireDir('--current', flags.current);
  const nextDir = requireDir('--next', flags.next);

  if (flags.apply && flags['dry-run']) fail('--apply and --dry-run are mutually exclusive');
  const apply = !!flags.apply;

  if ((flags['backup-dir'] === true || flags['backup-dir'] === '')) {
    fail('--backup-dir requires a value');
  }
  if (flags.plan === true || flags.plan === '') fail('--plan requires a value');

  const options = {
    apply,
    prune: !!flags.prune,
    allowConflicts: !!flags['allow-conflicts'],
    forceRuntime: !!flags['force-runtime'],
    backupDir: typeof flags['backup-dir'] === 'string' ? path.resolve(flags['backup-dir']) : null,
  };

  const plan = buildPlan({ currentDir, nextDir, options });
  const markdown = renderPlanMarkdown(plan);

  let applied = null;
  if (apply) {
    applied = applyPlan({ plan, currentDir, nextDir, options });
  }

  // Resolve where (if anywhere) to write the markdown plan.
  let planPath = null;
  if (typeof flags.plan === 'string') {
    planPath = path.resolve(flags.plan);
  } else if (apply) {
    planPath = path.join(currentDir, UPGRADE_DIR_NAME, `upgrade-plan-${sanitizeRef(plan.next.source_ref)}.md`);
  }
  if (planPath) {
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    fs.writeFileSync(planPath, markdown, 'utf8');
  }

  if (flags.json) {
    process.stdout.write(JSON.stringify({
      ok: true,
      mode: apply ? 'apply' : 'dry-run',
      plan,
      applied: applied ? applied.actions : null,
      plan_path: planPath ? path.relative(process.cwd(), planPath).split(path.sep).join('/') : null,
    }, null, 2) + '\n');
  } else {
    process.stdout.write(renderHumanSummary(plan));
    if (applied) {
      const writes = applied.actions.filter((a) => a.action !== 'none');
      process.stdout.write(`  applied ${writes.length} change(s); install manifest refreshed\n`);
    }
    if (planPath) {
      process.stdout.write(`  plan: ${path.relative(process.cwd(), planPath).split(path.sep).join('/')}\n`);
    } else {
      process.stdout.write('  (dry-run: pass --plan <path> to save the markdown plan, or --apply to update)\n');
    }
  }
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCli(main, TOOL);

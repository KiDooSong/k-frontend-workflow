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
// Default is --dry-run (no writes). --apply performs only safe content updates,
// mode-only chmods, and adds; it never overwrites locally modified files, never
// deletes upstream-removed files (unless --prune), and only ever writes inside
// --current.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, runCli, isCliEntry } from './lib/util.mjs';
import {
  UPGRADE_DIR_NAME,
  INSTALL_MANIFEST_NAME,
  PAYLOAD_MANIFEST_NAME,
  CONFLICTS_DIR_NAME,
} from './lib/kit-manifest.mjs';
import { buildPlan, renderPlanMarkdown, applyPlan, assertSafeWriteTarget } from './lib/upgrade-planner.mjs';

const TOOL = 'upgrade-vendored-kit';

const HELP = `${TOOL} — safe vendored-kit upgrade planner/apply

Usage:
  node scripts/upgrade-vendored-kit.mjs --current <dir> --next <dir> [options]

Required:
  --current <path>   Current vendored kit in the consumer repo (e.g. tools/frontend-workflow).
  --next <path>      Newly packed kit payload (the new dist/frontend-workflow-kit).

Mode:
  --dry-run          Plan only; no writes (default).
  --apply            Apply safe updates, mode-only chmods, and new files; refresh the install manifest.

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
  - Writes only inside --current, plus any --backup-dir / --plan path you pass.
  - Symlinked targets under --current are refused (no escape via links).
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

// Parse a boolean flag without the `!!` footgun: --flag and --flag=true enable;
// --flag=false/0/no/off (and absence) disable. Critical for destructive flags
// (--prune, --allow-conflicts, --force-runtime) where `!!'false'` === true.
function boolFlag(v) {
  if (v === undefined) return false;
  if (v === true) return true;
  const s = String(v).trim().toLowerCase();
  return !(s === 'false' || s === '0' || s === 'no' || s === 'off' || s === '');
}

function sanitizeRef(ref) {
  if (!ref) return 'unknown';
  const short = /^[0-9a-f]{40}$/i.test(ref) ? ref.slice(0, 12) : ref;
  return short.replace(/[^\w.-]+/g, '-');
}

// Posix-relative path of childAbs under parentAbs, or null when outside.
function relInside(parentAbs, childAbs) {
  const rel = path.relative(parentAbs, childAbs);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/');
}

// On --apply the plan file must survive the apply and must not corrupt its
// inputs: refuse a plan path inside --next (an apply source), inside
// --backup-dir (a backup copy could overwrite it), or colliding with anything
// the apply writes or tracks inside --current (payload files, conflict
// .incoming tree, install/payload manifests). Lexical, fail-closed, exit 2
// BEFORE the plan is written and before any mutation.
function assertPlanPathDoesNotCollide({ planPath, currentDir, nextDir, backupDir, plan }) {
  if (relInside(nextDir, planPath) != null) {
    fail(`--plan must not point inside --next (it would corrupt the upgrade payload): ${planPath}`);
  }
  if (backupDir && relInside(backupDir, planPath) != null) {
    fail(`--plan must not point inside --backup-dir (a backup could overwrite the plan): ${planPath}`);
  }
  const relCur = relInside(currentDir, planPath);
  if (relCur != null) {
    const tracked = plan.files.some((f) => f.path === relCur);
    if (
      tracked
      || relCur === INSTALL_MANIFEST_NAME
      || relCur === PAYLOAD_MANIFEST_NAME
      || relCur.startsWith(`${CONFLICTS_DIR_NAME}/`)
    ) {
      fail(`--plan collides with a path the apply writes or tracks inside --current: ${relCur}`);
    }
  }
}

function renderHumanSummary(plan) {
  const c = plan.counts;
  const lines = [];
  lines.push(`${TOOL} — ${plan.options.apply ? 'apply' : 'dry-run'} (baseline: ${plan.baseline})`);
  lines.push(`  current ref : ${plan.current.source_ref || 'unknown'}`);
  lines.push(`  next ref    : ${plan.next.source_ref || 'unknown'}`);
  lines.push(`  safe-update=${c['safe-update']} mode-update=${c['mode-update']} new=${c['new-file']} conflict=${c.conflict} `
    + `local-modified=${c['local-modified']} orphan=${c['removed-upstream']} `
    + `missing=${c['missing-current']} unchanged=${c.unchanged} unknown-local=${c['unknown-local']}`);
  for (const w of plan.warnings) lines.push(`  ! ${w}`);
  return lines.join('\n') + '\n';
}

function main() {
  const { flags } = parseArgs(process.argv.slice(2));

  if (boolFlag(flags.help)) {
    process.stdout.write(HELP);
    return; // help 도 자연 종료(exit 0) — process.exit(0) 금지 계약(cli-stdout-flush.test.mjs)
  }

  const currentDir = requireDir('--current', flags.current);
  const nextDir = requireDir('--next', flags.next);

  if (boolFlag(flags.apply) && boolFlag(flags['dry-run'])) fail('--apply and --dry-run are mutually exclusive');
  const apply = boolFlag(flags.apply);

  if ((flags['backup-dir'] === true || flags['backup-dir'] === '')) {
    fail('--backup-dir requires a value');
  }
  if (flags.plan === true || flags.plan === '') fail('--plan requires a value');

  const options = {
    apply,
    prune: boolFlag(flags.prune),
    allowConflicts: boolFlag(flags['allow-conflicts']),
    forceRuntime: boolFlag(flags['force-runtime']),
    backupDir: typeof flags['backup-dir'] === 'string' ? path.resolve(flags['backup-dir']) : null,
  };

  const plan = buildPlan({ currentDir, nextDir, options });

  // Resolve where (if anywhere) to write the markdown plan, and write it BEFORE
  // mutating, so a bad --plan path fails fast instead of leaving an applied kit
  // with no saved plan. The plan path is resolved first so the render can rebase
  // the embedded migration-note links against the plan's actual location.
  let planPath = null;
  let planInsideCurrent = false;
  if (typeof flags.plan === 'string') {
    planPath = path.resolve(flags.plan); // explicit, user-chosen destination
  } else if (apply) {
    planPath = path.join(currentDir, UPGRADE_DIR_NAME, `upgrade-plan-${sanitizeRef(plan.next.source_ref)}.md`);
    planInsideCurrent = true;
  }
  if (planPath) {
    if (apply) {
      assertPlanPathDoesNotCollide({
        planPath,
        currentDir,
        nextDir,
        backupDir: options.backupDir,
        plan,
      });
    }
    // The default in-kit plan path gets the same symlink containment as apply
    // (a symlinked _upgrade/ must not let the plan escape --current).
    if (planInsideCurrent) {
      assertSafeWriteTarget(fs.realpathSync(currentDir), planPath, 'current vendored kit');
    }
    const markdown = renderPlanMarkdown(plan, { currentDir, planPath });
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    fs.writeFileSync(planPath, markdown, 'utf8');
  }

  let applied = null;
  if (apply) {
    applied = applyPlan({ plan, currentDir, nextDir, options });
  }

  if (boolFlag(flags.json)) {
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
  // process.exit() 금지(stdout pipe 8KB flush) — readiness-eval.mjs 의 flush-safe 자연 종료 계약.
  process.exitCode = 0;
}

if (isCliEntry(import.meta.url)) runCli(main, TOOL);

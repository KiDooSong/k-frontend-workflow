// telemetry.test.mjs - MVP workflow:telemetry skeleton.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  CHILD_JSON_MAX_BUFFER,
  collectTelemetry,
  formatTelemetryHuman,
} from './telemetry.mjs';
import { KIT_ROOT } from './util.mjs';

const CLI = path.join(KIT_ROOT, 'scripts', 'telemetry.mjs');

function fakeRun(reports) {
  return ({ surface_id }) => ({
    status: 0,
    stdout: JSON.stringify(reports[surface_id]),
    stderr: '',
  });
}

function makeRoot(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'telemetry-'));
  for (const [name, body] of Object.entries(files)) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body, 'utf8');
  }
  return root;
}

function withRoot(files, fn) {
  const root = makeRoot(files);
  try {
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('aggregates fake surface reports into deterministic JSON', () => {
  const opts = {
    rootDir: '/repo',
    docsDir: '/repo/docs/frontend-workflow',
    scriptDir: '/kit/scripts',
    fileExists: () => true,
    runner: fakeRun({
      'route-cross-check': { tool: 'workflow:route-cross-check', warning_count: 2 },
      'doc-drift': { tool: 'workflow:doc-drift', warning_count: 1 },
      'readiness-eval': {
        tool: 'workflow:eval',
        total: 7,
        confusion: {
          false_open: { count: 1, cases: ['eval/a'] },
          false_closed: { count: 2, cases: ['eval/b', 'eval/c'] },
        },
        fail_closed_axis: { leaked: 3, leaked_cases: ['eval/d', 'eval/e', 'eval/f'] },
      },
    }),
  };
  const first = JSON.stringify(collectTelemetry(opts), null, 2);
  const second = JSON.stringify(collectTelemetry(opts), null, 2);
  assert.equal(first, second);
  assert.deepEqual(JSON.parse(first), {
    tool: 'workflow:telemetry',
    mode: 'warning-first',
    schema_version: 1,
    ok: true,
    surfaces: [
      {
        surface_id: 'route-cross-check',
        available: true,
        warning_count: 2,
        source_tool: 'workflow:route-cross-check',
      },
      {
        surface_id: 'doc-drift',
        available: true,
        warning_count: 1,
        source_tool: 'workflow:doc-drift',
      },
      {
        surface_id: 'readiness-eval',
        available: true,
        warning_count: 6,
        source_tool: 'workflow:eval',
        total: 7,
        false_open: 1,
        false_closed: 2,
        fail_closed_leaked: 3,
      },
    ],
  });
});

test('warning_count is numeric and can fall back to findings length', () => {
  const report = collectTelemetry({
    rootDir: '/repo',
    scriptDir: '/kit/scripts',
    fileExists: () => true,
    runner: fakeRun({
      'route-cross-check': { findings: [{}, {}] },
      'doc-drift': { warning_count: '3' },
      'readiness-eval': {
        confusion: {
          false_open: { count: '4' },
          false_closed: { count: 1 },
        },
        fail_closed_axis: { leaked: 2 },
      },
    }),
  });
  assert.equal(typeof report.surfaces[0].warning_count, 'number');
  assert.equal(report.surfaces[0].warning_count, 2);
  assert.equal(typeof report.surfaces[1].warning_count, 'number');
  assert.equal(report.surfaces[1].warning_count, 3);
  assert.equal(typeof report.surfaces[2].warning_count, 'number');
  assert.equal(report.surfaces[2].warning_count, 7);
});

test('unavailable child tool is recorded as available false', () => {
  const report = collectTelemetry({
    rootDir: '/repo',
    scriptDir: '/kit/scripts',
    fileExists: (p) => p.endsWith('route-cross-check.mjs'),
    runner: fakeRun({
      'route-cross-check': { warning_count: 0 },
    }),
  });
  assert.equal(report.surfaces[0].available, true);
  assert.equal(report.surfaces[1].surface_id, 'doc-drift');
  assert.equal(report.surfaces[1].available, false);
  assert.equal(report.surfaces[1].warning_count, 0);
  assert.equal(report.surfaces[1].unavailable_reason, 'script not found');
  assert.equal(report.surfaces[2].surface_id, 'readiness-eval');
  assert.equal(report.surfaces[2].available, false);
  assert.equal(report.surfaces[2].warning_count, 0);
  assert.equal(report.surfaces[2].unavailable_reason, 'script not found');
});

test('child command failures are unavailable, not telemetry failures', () => {
  const report = collectTelemetry({
    rootDir: '/repo',
    scriptDir: '/kit/scripts',
    fileExists: () => true,
    runner: ({ surface_id }) => (
      surface_id === 'doc-drift'
        ? { status: 1, stdout: '', stderr: 'boom' }
        : { status: 0, stdout: JSON.stringify({ warning_count: 0 }), stderr: '' }
    ),
  });
  assert.equal(report.ok, true);
  assert.equal(report.surfaces[1].available, false);
  assert.equal(report.surfaces[1].unavailable_reason, 'exit code 1');
});

test('child command ENOBUFS is surfaced explicitly if stdout still exceeds the buffer', () => {
  const report = collectTelemetry({
    rootDir: '/repo',
    scriptDir: '/kit/scripts',
    fileExists: () => true,
    runner: ({ surface_id }) => (
      surface_id === 'doc-drift'
        ? { status: null, stdout: '', stderr: '', error: { code: 'ENOBUFS' } }
        : { status: 0, stdout: JSON.stringify({ warning_count: 0 }), stderr: '' }
    ),
  });
  assert.equal(report.ok, true);
  assert.equal(report.surfaces[1].available, false);
  assert.equal(report.surfaces[1].unavailable_reason, 'stdout maxBuffer exceeded');
});

test('runSurfaceCommand accepts child --json output larger than Node spawnSync default maxBuffer', () => {
  assert.equal(CHILD_JSON_MAX_BUFFER, 16 * 1024 * 1024);
  withRoot(
    {
      'scripts/route-cross-check.mjs': [
        "const payload = { warning_count: 0, findings: [] };",
        "process.stdout.write(JSON.stringify(payload));",
        '',
      ].join('\n'),
      'scripts/doc-drift.mjs': [
        "const findings = Array.from({ length: 1200 }, (_, index) => ({",
        "  severity: 'warning',",
        "  check: 'dead-anchor',",
        "  source: `docs/${index}.md`,",
        "  link: '#missing',",
        "  target: `docs/${index}.md`,",
        "  reason: 'x'.repeat(1024),",
        "}));",
        "process.stdout.write(JSON.stringify({ warning_count: findings.length, findings }));",
        '',
      ].join('\n'),
    },
    (root) => {
      const report = collectTelemetry({
        rootDir: root,
        scriptDir: path.join(root, 'scripts'),
      });
      const drift = report.surfaces.find((s) => s.surface_id === 'doc-drift');
      assert.equal(drift.available, true);
      assert.equal(drift.warning_count, 1200);
    },
  );
});

test('CLI --json exits 0 and prints parseable JSON', () => {
  withRoot(
    {
      'docs/frontend-workflow/_meta/route-tree.txt': 'file.tsx route: /home\n',
      'docs/frontend-workflow/domains/app/screens/home/screen-spec.md':
        '---\nscreen_id: home\ndomain: app\nroute: "/home"\n---\n\n## Purpose\nHome\n',
      'docs/readme.md': '# Readme\n',
    },
    (root) => {
      const r = spawnSync(process.execPath, [CLI, '--root', root, '--json'], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stderr, '');
      const obj = JSON.parse(r.stdout);
      assert.equal(obj.tool, 'workflow:telemetry');
      assert.equal(obj.mode, 'warning-first');
      assert.equal(obj.surfaces.length, 3);
      assert.ok(obj.surfaces.every((s) => typeof s.warning_count === 'number'));
      const evalSurface = obj.surfaces.find((s) => s.surface_id === 'readiness-eval');
      assert.equal(evalSurface.available, true);
      assert.equal(evalSurface.warning_count, 0);
    },
  );
});

test('CLI exits 0 and collects warning counts when a surface has findings', () => {
  withRoot(
    {
      'docs/frontend-workflow/domains/app/screens/home/screen-spec.md':
        '---\nscreen_id: home\ndomain: app\nroute: "/home"\n---\n\n## Purpose\nHome\n',
      'docs/a.md': '[missing](./missing.md)\n',
    },
    (root) => {
      const r = spawnSync(process.execPath, [CLI, '--root', root, '--json'], { encoding: 'utf8' });
      assert.equal(r.status, 0);
      const obj = JSON.parse(r.stdout);
      const drift = obj.surfaces.find((s) => s.surface_id === 'doc-drift');
      assert.equal(drift.available, true);
      assert.equal(drift.warning_count, 1);
    },
  );
});

test('output omits timestamp, duration, absolute paths, and verdict fields', () => {
  withRoot(
    {
      'docs/a.md': '[missing](./missing.md)\n',
    },
    (root) => {
      const r = spawnSync(process.execPath, [CLI, '--root', root, '--json'], { encoding: 'utf8' });
      assert.equal(r.status, 0);
      const text = r.stdout;
      assert.equal(text.includes(root), false);
      assert.equal(/generated_at|timestamp|duration|verdict|threshold|promotion/i.test(text), false);
    },
  );
});

test('human mode is stdout-only and does not introduce a verdict', () => {
  const report = collectTelemetry({
    rootDir: '/repo',
    scriptDir: '/kit/scripts',
    fileExists: () => true,
    runner: fakeRun({
      'route-cross-check': { warning_count: 0 },
      'doc-drift': { warning_count: 1 },
      'readiness-eval': {
        confusion: { false_open: { count: 0 }, false_closed: { count: 0 } },
        fail_closed_axis: { leaked: 0 },
      },
    }),
  });
  const lines = formatTelemetryHuman(report);
  assert.match(lines[0], /warning-first/);
  assert.equal(lines.some((line) => /verdict|pass|fail/i.test(line)), false);
});

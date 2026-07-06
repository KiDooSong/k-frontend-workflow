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
  collectTelemetryLedger,
  collectTelemetryWithDeterminism,
  compareTelemetryLedger,
  formatTelemetryHuman,
  stableTelemetryJson,
  writeTelemetryLedger,
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

function fakeRunSequence(reports) {
  const calls = new Map();
  return ({ surface_id }) => {
    const index = calls.get(surface_id) || 0;
    calls.set(surface_id, index + 1);
    const surfaceReports = reports[surface_id];
    const report = Array.isArray(surfaceReports)
      ? surfaceReports[Math.min(index, surfaceReports.length - 1)]
      : surfaceReports;
    return {
      status: 0,
      stdout: JSON.stringify(report),
      stderr: '',
    };
  };
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
        blocking_kinds: { mismatch: { count: 4, cases: ['eval/g'] } },
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
        blocking_mismatch: 4,
      },
    ],
  });
});

test('collectTelemetryLedger adds deterministic observation schema and summary', () => {
  const ledger = collectTelemetryLedger({
    rootDir: '/repo',
    docsDir: 'docs/frontend-workflow',
    scriptDir: '/kit/scripts',
    determinismRuns: 1,
    fileExists: () => true,
    runner: fakeRun({
      'route-cross-check': { warning_count: 2 },
      'doc-drift': { warning_count: 1 },
      'readiness-eval': {
        total: 7,
        confusion: {
          false_open: { count: 1 },
          false_closed: { count: 2 },
        },
        fail_closed_axis: { leaked: 3 },
        blocking_kinds: { mismatch: { count: 4 } },
      },
    }),
  });

  assert.equal(ledger.tool, 'workflow:telemetry');
  assert.equal(ledger.mode, 'warning-first');
  assert.equal(ledger.schema_version, 1);
  assert.equal(ledger.ledger_version, 1);
  assert.equal(ledger.kind, 'observation-ledger');
  assert.deepEqual(ledger.inputs, {
    root: '.',
    docs: 'docs/frontend-workflow',
  });
  assert.deepEqual(ledger.summary, {
    surface_count: 3,
    available_count: 3,
    unavailable_count: 0,
    warning_count: 9,
  });
  assert.equal(ledger.surfaces.length, 3);
  assert.ok(ledger.surfaces.every((surface) => surface.determinism.runs === 1));
  assert.ok(ledger.surfaces.every((surface) => surface.determinism.identical === true));
});

test('stableTelemetryJson is byte-identical and includes trailing newline', () => {
  const report = collectTelemetryLedger({
    rootDir: '/repo',
    scriptDir: '/kit/scripts',
    fileExists: () => true,
    runner: fakeRun({
      'route-cross-check': { warning_count: 0 },
      'doc-drift': { warning_count: 0 },
      'readiness-eval': {},
    }),
  });
  const first = stableTelemetryJson(report);
  const second = stableTelemetryJson(report);
  assert.equal(first, second);
  assert.equal(first.endsWith('\n'), true);
  assert.equal(JSON.parse(first).kind, 'observation-ledger');
});

test('writeTelemetryLedger creates parent directories and writes stable JSON', () => {
  withRoot({}, (root) => {
    const report = collectTelemetryLedger({
      rootDir: root,
      scriptDir: '/kit/scripts',
      fileExists: () => true,
      runner: fakeRun({
        'route-cross-check': { warning_count: 0 },
        'doc-drift': { warning_count: 0 },
        'readiness-eval': {},
      }),
    });
    const result = writeTelemetryLedger({
      outPath: 'nested/telemetry-ledger.json',
      report,
      rootDir: root,
    });
    assert.equal(result.displayPath, 'nested/telemetry-ledger.json');
    assert.equal(fs.readFileSync(path.join(root, 'nested/telemetry-ledger.json'), 'utf8'), stableTelemetryJson(report));
  });
});

test('compareTelemetryLedger reports match, missing, drift, and invalid-json without throwing', () => {
  withRoot({}, (root) => {
    const report = collectTelemetryLedger({
      rootDir: root,
      scriptDir: '/kit/scripts',
      fileExists: () => true,
      runner: fakeRun({
        'route-cross-check': { warning_count: 0 },
        'doc-drift': { warning_count: 0 },
        'readiness-eval': {},
      }),
    });

    const missing = compareTelemetryLedger({
      filePath: 'missing/telemetry-ledger.json',
      report,
      rootDir: root,
    });
    assert.equal(missing.status, 'missing');
    assert.equal(missing.warning_count, 1);
    assert.equal(missing.findings[0].check, 'telemetry-ledger-missing');

    writeTelemetryLedger({ outPath: 'telemetry-ledger.json', report, rootDir: root });
    const match = compareTelemetryLedger({ filePath: 'telemetry-ledger.json', report, rootDir: root });
    assert.equal(match.status, 'match');
    assert.equal(match.warning_count, 0);
    assert.deepEqual(match.findings, []);

    const canonicalDrift = JSON.parse(stableTelemetryJson(report));
    canonicalDrift.schema_version = 999;
    canonicalDrift.ledger_version = 999;
    canonicalDrift.kind = 'unexpected-kind';
    canonicalDrift.generated_at = '2026-07-06T00:00:00Z';
    canonicalDrift.promotion = 'approved';
    fs.writeFileSync(path.join(root, 'telemetry-ledger.json'), `${JSON.stringify(canonicalDrift, null, 2)}\n`, 'utf8');
    const strictDrift = compareTelemetryLedger({ filePath: 'telemetry-ledger.json', report, rootDir: root });
    assert.equal(strictDrift.status, 'drift');
    assert.equal(strictDrift.warning_count, 1);
    assert.equal(strictDrift.findings[0].check, 'telemetry-ledger-drift');

    const drifted = JSON.parse(stableTelemetryJson(report));
    drifted.surfaces[0].warning_count = 1;
    fs.writeFileSync(path.join(root, 'telemetry-ledger.json'), stableTelemetryJson(drifted), 'utf8');
    const drift = compareTelemetryLedger({ filePath: 'telemetry-ledger.json', report, rootDir: root });
    assert.equal(drift.status, 'drift');
    assert.equal(drift.warning_count, 1);
    assert.equal(drift.findings[0].reason, 'current telemetry differs from ledger');

    fs.writeFileSync(path.join(root, 'telemetry-ledger.json'), '{', 'utf8');
    const invalid = compareTelemetryLedger({ filePath: 'telemetry-ledger.json', report, rootDir: root });
    assert.equal(invalid.status, 'invalid-json');
    assert.equal(invalid.warning_count, 1);
    assert.equal(invalid.findings[0].check, 'telemetry-ledger-invalid-json');
  });
});

test('collectTelemetryWithDeterminism marks identical normalized runs', () => {
  const report = collectTelemetryWithDeterminism({
    rootDir: '/repo',
    scriptDir: '/kit/scripts',
    determinismRuns: 2,
    fileExists: () => true,
    runner: fakeRun({
      'route-cross-check': { warning_count: 0 },
      'doc-drift': { warning_count: 0 },
      'readiness-eval': {},
    }),
  });
  assert.ok(report.surfaces.every((surface) => surface.determinism.runs === 2));
  assert.ok(report.surfaces.every((surface) => surface.determinism.identical === true));
  assert.ok(report.surfaces.every((surface) => /normalized-json/.test(surface.determinism.witness)));
});

test('collectTelemetryWithDeterminism uses first run surface values when later runs differ', () => {
  const report = collectTelemetryWithDeterminism({
    rootDir: '/repo',
    scriptDir: '/kit/scripts',
    determinismRuns: 2,
    fileExists: () => true,
    runner: fakeRunSequence({
      'route-cross-check': [{ warning_count: 0 }, { warning_count: 1 }],
      'doc-drift': { warning_count: 0 },
      'readiness-eval': {},
    }),
  });
  const route = report.surfaces.find((surface) => surface.surface_id === 'route-cross-check');
  assert.equal(route.warning_count, 0);
  assert.equal(route.determinism.identical, false);
  assert.equal(route.determinism.witness, 'normalized-json');
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
        blocking_kinds: { mismatch: { count: 5 } },
      },
    }),
  });
  assert.equal(typeof report.surfaces[0].warning_count, 'number');
  assert.equal(report.surfaces[0].warning_count, 2);
  assert.equal(typeof report.surfaces[1].warning_count, 'number');
  assert.equal(report.surfaces[1].warning_count, 3);
  assert.equal(typeof report.surfaces[2].warning_count, 'number');
  assert.equal(report.surfaces[2].warning_count, 7);
  assert.equal(report.surfaces[2].blocking_mismatch, 5);
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
      assert.equal(evalSurface.blocking_mismatch, 0);
    },
  );
});

test('CLI --out writes parseable deterministic ledger without absolute temp paths', () => {
  withRoot(
    {
      'docs/frontend-workflow/_meta/route-tree.txt': 'file.tsx route: /home\n',
      'docs/frontend-workflow/domains/app/screens/home/screen-spec.md':
        '---\nscreen_id: home\ndomain: app\nroute: "/home"\n---\n\n## Purpose\nHome\n',
      'docs/readme.md': '# Readme\n',
    },
    (root) => {
      const r = spawnSync(process.execPath, [
        CLI,
        '--root',
        root,
        '--out',
        'snapshots/telemetry-ledger.json',
        '--json',
      ], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stderr, '');
      const ledgerPath = path.join(root, 'snapshots/telemetry-ledger.json');
      assert.equal(fs.existsSync(ledgerPath), true);
      assert.equal(fs.readFileSync(ledgerPath, 'utf8'), r.stdout);
      const obj = JSON.parse(r.stdout);
      assert.equal(obj.kind, 'observation-ledger');
      assert.deepEqual(obj.inputs, {
        root: '.',
        docs: 'docs/frontend-workflow',
      });
      assert.equal(obj.summary.surface_count, 3);
      assert.ok(obj.surfaces.every((surface) => surface.determinism.runs === 2));
      assert.equal(r.stdout.includes(root), false);
      assert.equal(/generated_at|timestamp|duration|verdict|threshold|promotion/i.test(r.stdout), false);
    },
  );
});

test('CLI --check match exits 0 and includes check status in JSON', () => {
  withRoot(
    {
      'docs/frontend-workflow/_meta/route-tree.txt': 'file.tsx route: /home\n',
      'docs/frontend-workflow/domains/app/screens/home/screen-spec.md':
        '---\nscreen_id: home\ndomain: app\nroute: "/home"\n---\n\n## Purpose\nHome\n',
      'docs/readme.md': '# Readme\n',
    },
    (root) => {
      const out = spawnSync(process.execPath, [
        CLI,
        '--root',
        root,
        '--out',
        'telemetry-ledger.json',
      ], { encoding: 'utf8' });
      assert.equal(out.status, 0, out.stderr);

      const r = spawnSync(process.execPath, [
        CLI,
        '--root',
        root,
        '--check',
        'telemetry-ledger.json',
        '--json',
      ], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stderr, '');
      const obj = JSON.parse(r.stdout);
      assert.equal(obj.check.checked, true);
      assert.equal(obj.check.status, 'match');
      assert.equal(obj.check.warning_count, 0);
      assert.deepEqual(obj.check.findings, []);
    },
  );
});

test('CLI --check drift exits 0 and reports warning-only drift', () => {
  withRoot(
    {
      'docs/frontend-workflow/_meta/route-tree.txt': 'file.tsx route: /home\n',
      'docs/frontend-workflow/domains/app/screens/home/screen-spec.md':
        '---\nscreen_id: home\ndomain: app\nroute: "/home"\n---\n\n## Purpose\nHome\n',
      'docs/readme.md': '# Readme\n',
    },
    (root) => {
      const out = spawnSync(process.execPath, [
        CLI,
        '--root',
        root,
        '--out',
        'telemetry-ledger.json',
      ], { encoding: 'utf8' });
      assert.equal(out.status, 0, out.stderr);
      const ledgerPath = path.join(root, 'telemetry-ledger.json');
      const stale = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
      stale.surfaces[0].warning_count = stale.surfaces[0].warning_count + 1;
      fs.writeFileSync(ledgerPath, stableTelemetryJson(stale), 'utf8');

      const r = spawnSync(process.execPath, [
        CLI,
        '--root',
        root,
        '--check',
        'telemetry-ledger.json',
        '--json',
      ], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stderr, '');
      const obj = JSON.parse(r.stdout);
      assert.equal(obj.ok, true);
      assert.equal(obj.check.status, 'drift');
      assert.equal(obj.check.warning_count, 1);
      assert.equal(obj.check.findings[0].check, 'telemetry-ledger-drift');
    },
  );
});

test('CLI --check treats schema and forbidden extra field drift as warning-only drift', () => {
  withRoot(
    {
      'docs/frontend-workflow/_meta/route-tree.txt': 'file.tsx route: /home\n',
      'docs/frontend-workflow/domains/app/screens/home/screen-spec.md':
        '---\nscreen_id: home\ndomain: app\nroute: "/home"\n---\n\n## Purpose\nHome\n',
      'docs/readme.md': '# Readme\n',
    },
    (root) => {
      const out = spawnSync(process.execPath, [
        CLI,
        '--root',
        root,
        '--out',
        'telemetry-ledger.json',
      ], { encoding: 'utf8' });
      assert.equal(out.status, 0, out.stderr);
      const ledgerPath = path.join(root, 'telemetry-ledger.json');
      const stale = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
      stale.schema_version = 999;
      stale.ledger_version = 999;
      stale.kind = 'unexpected-kind';
      stale.generated_at = '2026-07-06T00:00:00Z';
      stale.promotion = 'approved';
      fs.writeFileSync(ledgerPath, `${JSON.stringify(stale, null, 2)}\n`, 'utf8');

      const r = spawnSync(process.execPath, [
        CLI,
        '--root',
        root,
        '--check',
        'telemetry-ledger.json',
        '--json',
      ], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stderr, '');
      const obj = JSON.parse(r.stdout);
      assert.equal(obj.ok, true);
      assert.equal(obj.check.status, 'drift');
      assert.equal(obj.check.warning_count, 1);
      assert.equal(obj.check.findings[0].check, 'telemetry-ledger-drift');
    },
  );
});

test('CLI --check missing exits 0 and reports warning-only missing ledger', () => {
  withRoot(
    {
      'docs/readme.md': '# Readme\n',
    },
    (root) => {
      const r = spawnSync(process.execPath, [
        CLI,
        '--root',
        root,
        '--check',
        'missing/telemetry-ledger.json',
        '--json',
      ], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stderr, '');
      const obj = JSON.parse(r.stdout);
      assert.equal(obj.ok, true);
      assert.equal(obj.check.status, 'missing');
      assert.equal(obj.check.warning_count, 1);
      assert.equal(obj.check.findings[0].reason, 'ledger file not found');
    },
  );
});

test('CLI rejects empty ledger path values with exit 2', () => {
  withRoot({}, (root) => {
    const out = spawnSync(process.execPath, [
      CLI,
      '--root',
      root,
      '--out=',
    ], { encoding: 'utf8' });
    assert.equal(out.status, 2);
    assert.match(out.stderr, /--out requires a file path/);

    const check = spawnSync(process.execPath, [
      CLI,
      '--root',
      root,
      '--check=',
    ], { encoding: 'utf8' });
    assert.equal(check.status, 2);
    assert.match(check.stderr, /--check requires a file path/);
  });
});

test('CLI rejects missing or fractional determinism runs with exit 2', () => {
  withRoot({}, (root) => {
    const missing = spawnSync(process.execPath, [
      CLI,
      '--root',
      root,
      '--out',
      'telemetry-ledger.json',
      '--determinism-runs',
    ], { encoding: 'utf8' });
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /--determinism-runs must be a positive integer/);

    const fractional = spawnSync(process.execPath, [
      CLI,
      '--root',
      root,
      '--out',
      'telemetry-ledger.json',
      '--determinism-runs',
      '1.9',
    ], { encoding: 'utf8' });
    assert.equal(fractional.status, 2);
    assert.match(fractional.stderr, /--determinism-runs must be a positive integer/);
  });
});

test('CLI rejects simultaneous --out and --check with exit 2', () => {
  withRoot({}, (root) => {
    const r = spawnSync(process.execPath, [
      CLI,
      '--root',
      root,
      '--out',
      'telemetry-ledger.json',
      '--check',
      'telemetry-ledger.json',
    ], { encoding: 'utf8' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /cannot be used together/);
  });
});

test('CLI human --check warnings stay exit 0 and print warning line to stderr', () => {
  withRoot(
    {
      'docs/readme.md': '# Readme\n',
    },
    (root) => {
      const r = spawnSync(process.execPath, [
        CLI,
        '--root',
        root,
        '--check',
        'missing/telemetry-ledger.json',
      ], { encoding: 'utf8' });
      assert.equal(r.status, 0);
      assert.match(r.stdout, /workflow:telemetry - warning-first/);
      assert.match(r.stderr, /warning-first: missing missing\/telemetry-ledger\.json - ledger file not found/);
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
        blocking_kinds: { mismatch: { count: 0 } },
      },
    }),
  });
  const lines = formatTelemetryHuman(report);
  assert.match(lines[0], /warning-first/);
  assert.ok(lines.some((line) => /readiness-eval: available, warnings=0, blocking_mismatch=0/.test(line)));
  assert.equal(lines.some((line) => /verdict|pass|fail/i.test(line)), false);
});

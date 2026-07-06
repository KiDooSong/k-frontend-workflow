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
  listTelemetrySurfaces,
  stableTelemetryJson,
  TELEMETRY_SURFACE_GROUPS,
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

// --- visual opt-in surface group ------------------------------------------

const DEFAULT_SURFACE_IDS = ['route-cross-check', 'doc-drift', 'readiness-eval'];
const ALL_SURFACE_IDS = [...DEFAULT_SURFACE_IDS, 'visual-consistency', 'visual-contract-bootstrap'];

const DEFAULT_FAKES = {
  'route-cross-check': { warning_count: 0 },
  'doc-drift': { warning_count: 0 },
  'readiness-eval': {},
};

const VISUAL_FAKES = {
  'visual-consistency': {
    tool: 'visual-consistency',
    contract_found: true,
    skipped: false,
    summary: { families: 1, screens: 2, errors: 0, warnings: 3, infos: 1 },
    findings: [{}, {}, {}, {}],
  },
  'visual-contract-bootstrap': {
    tool: 'visual-contract-bootstrap',
    summary: {
      screens: 2,
      candidate_families: 1,
      suggested_contract_rows: 3,
      component_gap_candidates: 1,
      errors: 0,
      warnings: 0,
      infos: 2,
    },
  },
};

function surfaceIds(report) {
  return report.surfaces.map((surface) => surface.surface_id);
}

test('surface registry lists default and visual groups in fixed order', () => {
  assert.deepEqual(TELEMETRY_SURFACE_GROUPS, ['default', 'visual']);
  assert.deepEqual(listTelemetrySurfaces(), [
    { surface_id: 'route-cross-check', groups: ['default'], source_tool: 'workflow:route-cross-check' },
    { surface_id: 'doc-drift', groups: ['default'], source_tool: 'workflow:doc-drift' },
    { surface_id: 'readiness-eval', groups: ['default'], source_tool: 'workflow:eval' },
    { surface_id: 'visual-consistency', groups: ['visual'], source_tool: 'workflow:visual-consistency' },
    { surface_id: 'visual-contract-bootstrap', groups: ['visual'], source_tool: 'workflow:visual-contract-bootstrap' },
  ]);
});

test('default telemetry surfaces stay unchanged without a visual opt-in', () => {
  const report = collectTelemetry({
    rootDir: '/repo',
    scriptDir: '/kit/scripts',
    fileExists: () => true,
    runner: fakeRun({ ...DEFAULT_FAKES, ...VISUAL_FAKES }),
  });
  assert.deepEqual(surfaceIds(report), DEFAULT_SURFACE_IDS);
});

test('includeGroups visual adds visual surfaces in fixed registry order', () => {
  const report = collectTelemetry({
    rootDir: '/repo',
    scriptDir: '/kit/scripts',
    includeGroups: ['visual'],
    fileExists: () => true,
    runner: fakeRun({ ...DEFAULT_FAKES, ...VISUAL_FAKES }),
  });
  assert.deepEqual(surfaceIds(report), ALL_SURFACE_IDS);
  const consistency = report.surfaces.find((s) => s.surface_id === 'visual-consistency');
  assert.deepEqual(consistency, {
    surface_id: 'visual-consistency',
    available: true,
    warning_count: 3,
    source_tool: 'workflow:visual-consistency',
    skipped: false,
    contract_found: true,
    screen_count: 2,
  });
  const bootstrap = report.surfaces.find((s) => s.surface_id === 'visual-contract-bootstrap');
  assert.deepEqual(bootstrap, {
    surface_id: 'visual-contract-bootstrap',
    available: true,
    warning_count: 0,
    source_tool: 'workflow:visual-contract-bootstrap',
    candidate_family_count: 1,
    suggested_addition_count: 3,
    component_gap_candidate_count: 1,
  });
});

test('includeGroups all equals default plus visual', () => {
  const report = collectTelemetry({
    rootDir: '/repo',
    scriptDir: '/kit/scripts',
    includeGroups: ['all'],
    fileExists: () => true,
    runner: fakeRun({ ...DEFAULT_FAKES, ...VISUAL_FAKES }),
  });
  assert.deepEqual(surfaceIds(report), ALL_SURFACE_IDS);
});

test('includeGroups default is a no-op alias for the default surfaces', () => {
  const report = collectTelemetry({
    rootDir: '/repo',
    scriptDir: '/kit/scripts',
    includeGroups: ['default'],
    fileExists: () => true,
    runner: fakeRun({ ...DEFAULT_FAKES, ...VISUAL_FAKES }),
  });
  assert.deepEqual(surfaceIds(report), DEFAULT_SURFACE_IDS);
});

test('includeSurfaces adds a single opt-in surface on top of the default surfaces', () => {
  const report = collectTelemetry({
    rootDir: '/repo',
    scriptDir: '/kit/scripts',
    includeSurfaces: ['visual-consistency'],
    fileExists: () => true,
    runner: fakeRun({ ...DEFAULT_FAKES, ...VISUAL_FAKES }),
  });
  assert.deepEqual(surfaceIds(report), [...DEFAULT_SURFACE_IDS, 'visual-consistency']);
});

test('unknown include group or surface id throws instead of being ignored', () => {
  const opts = {
    rootDir: '/repo',
    scriptDir: '/kit/scripts',
    fileExists: () => true,
    runner: fakeRun({ ...DEFAULT_FAKES, ...VISUAL_FAKES }),
  };
  assert.throws(() => collectTelemetry({ ...opts, includeGroups: ['nope'] }), /unknown surface group: nope/);
  assert.throws(() => collectTelemetry({ ...opts, includeSurfaces: ['nope'] }), /unknown surface id: nope/);
});

test('skipSurfaces removes visual-contract-bootstrap from an included visual group', () => {
  const report = collectTelemetry({
    rootDir: '/repo',
    scriptDir: '/kit/scripts',
    includeGroups: ['visual'],
    skipSurfaces: ['visual-contract-bootstrap'],
    fileExists: () => true,
    runner: fakeRun({ ...DEFAULT_FAKES, ...VISUAL_FAKES }),
  });
  assert.deepEqual(surfaceIds(report), [...DEFAULT_SURFACE_IDS, 'visual-consistency']);
});

test('skipSurfaces removes visual-consistency from an included visual group', () => {
  const report = collectTelemetry({
    rootDir: '/repo',
    scriptDir: '/kit/scripts',
    includeGroups: ['visual'],
    skipSurfaces: ['visual-consistency'],
    fileExists: () => true,
    runner: fakeRun({ ...DEFAULT_FAKES, ...VISUAL_FAKES }),
  });
  assert.deepEqual(surfaceIds(report), [...DEFAULT_SURFACE_IDS, 'visual-contract-bootstrap']);
});

test('visual surfaces forward docs/src/domain/screen/contract and never mutating flags', () => {
  const seen = new Map();
  collectTelemetry({
    rootDir: '/repo',
    docsDir: 'docs/frontend-workflow',
    srcDir: 'src',
    includeGroups: ['visual'],
    visual: {
      domain: 'auth',
      screen: 'AUTH-001,AUTH-002',
      contract: 'docs/frontend-workflow/design/visual-consistency-contract.md',
    },
    scriptDir: '/kit/scripts',
    fileExists: () => true,
    runner: (call) => {
      seen.set(call.surface_id, call.args);
      return { status: 0, stdout: JSON.stringify({ ...DEFAULT_FAKES, ...VISUAL_FAKES }[call.surface_id]), stderr: '' };
    },
  });
  const docsAbs = path.resolve('/repo', 'docs/frontend-workflow');
  const srcAbs = path.resolve('/repo', 'src');
  const contractAbs = path.resolve('/repo', 'docs/frontend-workflow/design/visual-consistency-contract.md');
  const expectedVisualArgs = [
    '--docs', docsAbs,
    '--json',
    '--src', srcAbs,
    '--domain', 'auth',
    '--screen', 'AUTH-001,AUTH-002',
    '--contract', contractAbs,
  ];
  assert.deepEqual(seen.get('visual-consistency'), expectedVisualArgs);
  assert.deepEqual(seen.get('visual-contract-bootstrap'), expectedVisualArgs);
  // Default surfaces are untouched by --src/visual filters.
  assert.deepEqual(seen.get('route-cross-check'), ['--docs', docsAbs, '--json']);
  for (const args of seen.values()) {
    for (const forbidden of ['--out', '--format', '--enforce', '--apply', '--overwrite']) {
      assert.equal(args.includes(forbidden), false);
    }
  }
});

test('missing visual scripts are unavailable while telemetry stays ok', () => {
  const report = collectTelemetry({
    rootDir: '/repo',
    scriptDir: '/kit/scripts',
    includeGroups: ['visual'],
    fileExists: (p) => !p.endsWith('visual-consistency.mjs') && !p.endsWith('visual-contract-bootstrap.mjs'),
    runner: fakeRun(DEFAULT_FAKES),
  });
  assert.equal(report.ok, true);
  for (const id of DEFAULT_SURFACE_IDS) {
    assert.equal(report.surfaces.find((s) => s.surface_id === id).available, true);
  }
  for (const id of ['visual-consistency', 'visual-contract-bootstrap']) {
    const surface = report.surfaces.find((s) => s.surface_id === id);
    assert.deepEqual(surface, {
      surface_id: id,
      available: false,
      warning_count: 0,
      source_tool: `workflow:${id}`,
      unavailable_reason: 'script not found',
    });
  }
});

test('visual child exit 1 is unavailable, not a telemetry failure', () => {
  const report = collectTelemetry({
    rootDir: '/repo',
    scriptDir: '/kit/scripts',
    includeGroups: ['visual'],
    fileExists: () => true,
    runner: ({ surface_id }) => (
      surface_id === 'visual-consistency'
        ? { status: 1, stdout: '', stderr: 'structural error' }
        : { status: 0, stdout: JSON.stringify({ ...DEFAULT_FAKES, ...VISUAL_FAKES }[surface_id]), stderr: '' }
    ),
  });
  assert.equal(report.ok, true);
  const surface = report.surfaces.find((s) => s.surface_id === 'visual-consistency');
  assert.equal(surface.available, false);
  assert.equal(surface.unavailable_reason, 'exit code 1');
  assert.equal(surface.warning_count, 0);
});

test('visual child invalid JSON is unavailable, not a telemetry failure', () => {
  const report = collectTelemetry({
    rootDir: '/repo',
    scriptDir: '/kit/scripts',
    includeGroups: ['visual'],
    fileExists: () => true,
    runner: ({ surface_id }) => (
      surface_id === 'visual-contract-bootstrap'
        ? { status: 0, stdout: 'not json', stderr: '' }
        : { status: 0, stdout: JSON.stringify({ ...DEFAULT_FAKES, ...VISUAL_FAKES }[surface_id]), stderr: '' }
    ),
  });
  assert.equal(report.ok, true);
  const surface = report.surfaces.find((s) => s.surface_id === 'visual-contract-bootstrap');
  assert.equal(surface.available, false);
  assert.equal(surface.unavailable_reason, 'invalid JSON');
});

test('visual warning_count falls back to generic warning_count and findings length', () => {
  const report = collectTelemetry({
    rootDir: '/repo',
    scriptDir: '/kit/scripts',
    includeGroups: ['visual'],
    fileExists: () => true,
    runner: fakeRun({
      ...DEFAULT_FAKES,
      'visual-consistency': { findings: [{}, {}] },
      'visual-contract-bootstrap': { warning_count: 2 },
    }),
  });
  const consistency = report.surfaces.find((s) => s.surface_id === 'visual-consistency');
  assert.deepEqual(consistency, {
    surface_id: 'visual-consistency',
    available: true,
    warning_count: 2,
    source_tool: 'workflow:visual-consistency',
    skipped: false,
    contract_found: false,
    screen_count: 0,
  });
  const bootstrap = report.surfaces.find((s) => s.surface_id === 'visual-contract-bootstrap');
  assert.deepEqual(bootstrap, {
    surface_id: 'visual-contract-bootstrap',
    available: true,
    warning_count: 2,
    source_tool: 'workflow:visual-contract-bootstrap',
    candidate_family_count: 0,
    suggested_addition_count: 0,
    component_gap_candidate_count: 0,
  });
});

test('no-contract skip stays an available visual surface with zero warnings', () => {
  const report = collectTelemetry({
    rootDir: '/repo',
    scriptDir: '/kit/scripts',
    includeGroups: ['visual'],
    fileExists: () => true,
    runner: fakeRun({
      ...DEFAULT_FAKES,
      ...VISUAL_FAKES,
      'visual-consistency': {
        tool: 'visual-consistency',
        contract_found: false,
        skipped: true,
        summary: { families: 0, screens: 0, errors: 0, warnings: 0, infos: 0 },
        findings: [],
      },
    }),
  });
  const surface = report.surfaces.find((s) => s.surface_id === 'visual-consistency');
  assert.equal(surface.available, true);
  assert.equal(surface.skipped, true);
  assert.equal(surface.contract_found, false);
  assert.equal(surface.warning_count, 0);
});

test('ledger with include visual counts visual surfaces and records opt-in inputs', () => {
  const ledger = collectTelemetryLedger({
    rootDir: '/repo',
    docsDir: 'docs/frontend-workflow',
    scriptDir: '/kit/scripts',
    determinismRuns: 1,
    includeGroups: ['visual'],
    visual: { domain: 'auth' },
    fileExists: () => true,
    runner: fakeRun({ ...DEFAULT_FAKES, ...VISUAL_FAKES }),
  });
  assert.deepEqual(ledger.inputs, {
    root: '.',
    docs: 'docs/frontend-workflow',
    src: 'src',
    include: ['default', 'visual'],
    visual: { domain: 'auth' },
  });
  assert.deepEqual(ledger.summary, {
    surface_count: 5,
    available_count: 5,
    unavailable_count: 0,
    warning_count: 3,
  });
  assert.deepEqual(surfaceIds(ledger), ALL_SURFACE_IDS);
  const consistency = ledger.surfaces.find((s) => s.surface_id === 'visual-consistency');
  assert.equal(consistency.skipped, false);
  assert.equal(consistency.contract_found, true);
  assert.equal(consistency.screen_count, 2);
  const bootstrap = ledger.surfaces.find((s) => s.surface_id === 'visual-contract-bootstrap');
  assert.equal(bootstrap.candidate_family_count, 1);
  assert.equal(bootstrap.suggested_addition_count, 3);
  assert.equal(bootstrap.component_gap_candidate_count, 1);
});

test('default ledger inputs keep the {root, docs} byte shape', () => {
  const ledger = collectTelemetryLedger({
    rootDir: '/repo',
    docsDir: 'docs/frontend-workflow',
    scriptDir: '/kit/scripts',
    determinismRuns: 1,
    fileExists: () => true,
    runner: fakeRun({ ...DEFAULT_FAKES, ...VISUAL_FAKES }),
  });
  assert.deepEqual(Object.keys(ledger.inputs), ['root', 'docs']);
});

test('determinism marks identical visual runs as identical even with findings', () => {
  const report = collectTelemetryWithDeterminism({
    rootDir: '/repo',
    scriptDir: '/kit/scripts',
    determinismRuns: 2,
    includeGroups: ['visual'],
    fileExists: () => true,
    runner: fakeRun({ ...DEFAULT_FAKES, ...VISUAL_FAKES }),
  });
  assert.equal(report.surfaces.length, 5);
  assert.ok(report.surfaces.every((surface) => surface.determinism.runs === 2));
  assert.ok(report.surfaces.every((surface) => surface.determinism.identical === true));
  const consistency = report.surfaces.find((s) => s.surface_id === 'visual-consistency');
  assert.equal(consistency.warning_count, 3);
  assert.equal(consistency.determinism.witness, 'normalized-json');
});

test('determinism marks changing visual warning counts as non-identical without failing', () => {
  const report = collectTelemetryWithDeterminism({
    rootDir: '/repo',
    scriptDir: '/kit/scripts',
    determinismRuns: 2,
    includeGroups: ['visual'],
    fileExists: () => true,
    runner: fakeRunSequence({
      ...DEFAULT_FAKES,
      ...VISUAL_FAKES,
      'visual-consistency': [
        { summary: { warnings: 3 } },
        { summary: { warnings: 4 } },
      ],
    }),
  });
  assert.equal(report.ok, true);
  const consistency = report.surfaces.find((s) => s.surface_id === 'visual-consistency');
  assert.equal(consistency.warning_count, 3);
  assert.equal(consistency.determinism.identical, false);
  const bootstrap = report.surfaces.find((s) => s.surface_id === 'visual-contract-bootstrap');
  assert.equal(bootstrap.determinism.identical, true);
});

test('CLI --list-surfaces --json prints the registry without running child CLIs', () => {
  withRoot({}, (root) => {
    const r = spawnSync(process.execPath, [CLI, '--root', root, '--list-surfaces', '--json'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stderr, '');
    assert.deepEqual(JSON.parse(r.stdout), {
      tool: 'workflow:telemetry',
      surfaces: listTelemetrySurfaces(),
    });
    // Registry listing only - no observation surfaces are executed or reported.
    assert.equal(r.stdout.includes('"available"'), false);

    const human = spawnSync(process.execPath, [CLI, '--root', root, '--list-surfaces'], { encoding: 'utf8' });
    assert.equal(human.status, 0, human.stderr);
    assert.match(human.stdout, /visual-consistency \[visual\] - workflow:visual-consistency/);
  });
});

test('CLI rejects unknown include groups and surface ids with exit 2', () => {
  withRoot({}, (root) => {
    const group = spawnSync(process.execPath, [CLI, '--root', root, '--include', 'nope'], { encoding: 'utf8' });
    assert.equal(group.status, 2);
    assert.match(group.stderr, /unknown --include group: nope/);

    const surface = spawnSync(process.execPath, [CLI, '--root', root, '--surface', 'nope'], { encoding: 'utf8' });
    assert.equal(surface.status, 2);
    assert.match(surface.stderr, /unknown --surface id: nope/);

    const bare = spawnSync(process.execPath, [CLI, '--root', root, '--include'], { encoding: 'utf8' });
    assert.equal(bare.status, 2);
    assert.match(bare.stderr, /--include requires a group name/);
  });
});

test('CLI rejects visual sub-flags without a visual opt-in with exit 2', () => {
  withRoot({}, (root) => {
    for (const args of [
      ['--visual-domain', 'auth'],
      ['--visual-screen', 'AUTH-001'],
      ['--visual-contract', 'contract.md'],
      ['--skip-visual-bootstrap'],
      ['--skip-visual-consistency'],
    ]) {
      const r = spawnSync(process.execPath, [CLI, '--root', root, ...args], { encoding: 'utf8' });
      assert.equal(r.status, 2, r.stderr);
      assert.match(r.stderr, /requires visual surfaces/);
    }
  });
});

test('CLI --include visual --json exits 0 with clean visual observation output', () => {
  withRoot(
    {
      'docs/frontend-workflow/_meta/route-tree.txt': 'file.tsx route: /home\n',
      'docs/frontend-workflow/domains/app/screens/home/screen-spec.md':
        '---\nscreen_id: home\ndomain: app\nroute: "/home"\n---\n\n## Purpose\nHome\n',
      'docs/readme.md': '# Readme\n',
    },
    (root) => {
      const r = spawnSync(process.execPath, [CLI, '--root', root, '--include', 'visual', '--json'], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stderr, '');
      const obj = JSON.parse(r.stdout);
      assert.equal(obj.ok, true);
      assert.deepEqual(surfaceIds(obj), ALL_SURFACE_IDS);
      const consistency = obj.surfaces.find((s) => s.surface_id === 'visual-consistency');
      assert.equal(consistency.available, true);
      assert.equal(consistency.skipped, true);
      assert.equal(consistency.contract_found, false);
      assert.equal(consistency.warning_count, 0);
      const bootstrap = obj.surfaces.find((s) => s.surface_id === 'visual-contract-bootstrap');
      assert.equal(bootstrap.available, true);
      assert.equal(typeof bootstrap.warning_count, 'number');
      // Output hygiene: no machine paths, timestamps, durations, or verdicts.
      assert.equal(r.stdout.includes(root), false);
      assert.equal(/generated_at|timestamp|duration|verdict|threshold|promotion|stderr/i.test(r.stdout), false);
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

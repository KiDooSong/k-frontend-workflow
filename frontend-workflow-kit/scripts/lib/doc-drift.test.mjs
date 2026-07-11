// doc-drift.test.mjs — Phase 0 doc-drift warning-first detector.
//
// 실행:
//   node --test scripts/lib/doc-drift.test.mjs
//
// 범위: Markdown relative target existence + conservative GitHub-like heading
// anchors only. Semantic drift, manifest/roadmap heuristics, external reachability,
// CHANGELOG ranges, and duplicate-copy detection stay out of Phase 0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  analyzeDocDrift,
  analyzeManifestRoadmapStatus,
  analyzeReleaseConsistency,
  collectHeadingSlugs,
  DocDriftInputError,
  formatDocDriftHuman,
  isHistoricalDoc,
  latestReleaseHeading,
} from './doc-drift.mjs';
import { KIT_ROOT } from './util.mjs';

const CLI = path.join(KIT_ROOT, 'scripts', 'doc-drift.mjs');

function makeRoot(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-drift-'));
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

test('existing relative link has warning 0', () => {
  withRoot(
    {
      'docs/foo.md': '[bar](./bar.md)\n',
      'docs/bar.md': '# Bar\n',
    },
    (root) => {
      const r = analyzeDocDrift({ rootDir: root });
      assert.equal(r.ok, true);
      assert.equal(r.warning_count, 0);
      assert.deepEqual(r.findings, []);
      assert.deepEqual(formatDocDriftHuman(r), [
        'workflow:doc-drift — ok (warning-first): no Phase 0 doc link drift found',
      ]);
    },
  );
});

test('existing relative directory link has warning 0', () => {
  withRoot(
    {
      'docs/foo.md': '[section](./section/)\n',
      'docs/section/readme.md': '# Section\n',
    },
    (root) => {
      const r = analyzeDocDrift({ rootDir: root });
      assert.equal(r.warning_count, 0);
    },
  );
});

test('missing relative file emits one broken-relative-link finding', () => {
  withRoot(
    {
      'docs/foo.md': '[missing](./missing.md)\n',
    },
    (root) => {
      const r = analyzeDocDrift({ rootDir: root });
      assert.equal(r.warning_count, 1);
      assert.deepEqual(r.findings, [
        {
          severity: 'warning',
          check: 'broken-relative-link',
          source: 'docs/foo.md',
          link: './missing.md',
          target: 'docs/missing.md',
          reason: 'target file not found',
        },
      ]);
    },
  );
});

test('existing heading anchor has warning 0', () => {
  withRoot(
    {
      'docs/foo.md': '[bar](./bar.md#some-heading)\n',
      'docs/bar.md': '# Some Heading\n',
    },
    (root) => {
      const r = analyzeDocDrift({ rootDir: root });
      assert.equal(r.warning_count, 0);
    },
  );
});

test('missing heading anchor emits one dead-anchor finding', () => {
  withRoot(
    {
      'docs/foo.md': '[bar](./bar.md#some-heading)\n',
      'docs/bar.md': '# Different Heading\n',
    },
    (root) => {
      const r = analyzeDocDrift({ rootDir: root });
      assert.equal(r.warning_count, 1);
      assert.deepEqual(r.findings, [
        {
          severity: 'warning',
          check: 'dead-anchor',
          source: 'docs/foo.md',
          link: './bar.md#some-heading',
          target: 'docs/bar.md',
          reason: "target heading slug 'some-heading' not found",
        },
      ]);
    },
  );
});

test('pure self anchor is checked against the source file', () => {
  withRoot(
    {
      'docs/foo.md': '# Present\n\n[ok](#present)\n[bad](#absent)\n',
    },
    (root) => {
      const r = analyzeDocDrift({ rootDir: root });
      assert.equal(r.warning_count, 1);
      assert.equal(r.findings[0].check, 'dead-anchor');
      assert.equal(r.findings[0].link, '#absent');
      assert.equal(r.findings[0].target, 'docs/foo.md');
    },
  );
});

test('conservative Phase 0 slug supports Korean heading anchors', () => {
  withRoot(
    {
      'docs/foo.md': '# 문서 지도\n\n[지도](#문서-지도)\n',
    },
    (root) => {
      const r = analyzeDocDrift({ rootDir: root });
      assert.equal(r.warning_count, 0);
    },
  );
});

test('conservative Phase 0 slug preserves GitHub-like double hyphen after punctuation removal', () => {
  withRoot(
    {
      'docs/foo.md': '# Flow-shaped / domain-level input\n\n[link](#flow-shaped--domain-level-input)\n',
    },
    (root) => {
      const r = analyzeDocDrift({ rootDir: root });
      assert.equal(r.warning_count, 0);
    },
  );
});

test('duplicate heading suffixes are assigned with GitHub-like -1 and -2 anchors', () => {
  withRoot(
    {
      'docs/foo.md': '# Intro\n\n# Intro\n\n# Intro\n\n[second](#intro-1)\n[third](#intro-2)\n',
    },
    (root) => {
      const r = analyzeDocDrift({ rootDir: root });
      assert.equal(r.warning_count, 0);
      assert.deepEqual([...collectHeadingSlugs('# Intro\n# Intro\n# Intro\n')], [
        'intro',
        'intro-1',
        'intro-2',
      ]);
    },
  );
});

// --- Issue #150: Phase 0 link-check false-positive classes ---------------------

test('GitHub line anchor #L12 on an existing file has warning 0', () => {
  withRoot(
    {
      'docs/foo.md': '[bar](./bar.md#L12)\n',
      'docs/bar.md': '# Bar\n',
    },
    (root) => {
      const r = analyzeDocDrift({ rootDir: root });
      assert.equal(r.warning_count, 0);
      assert.deepEqual(r.findings, []);
    },
  );
});

test('GitHub line range anchor #L12-L14 on an existing file has warning 0', () => {
  withRoot(
    {
      'docs/foo.md': '[bar](./bar.md#L12-L14)\n[self](#L10)\n',
      'docs/bar.md': '# Bar\n',
    },
    (root) => {
      const r = analyzeDocDrift({ rootDir: root });
      assert.equal(r.warning_count, 0);
      assert.deepEqual(r.findings, []);
    },
  );
});

test('line anchor on a missing file is still one broken-relative-link warning', () => {
  withRoot(
    {
      'docs/foo.md': '[bar](./missing.md#L12)\n',
    },
    (root) => {
      const r = analyzeDocDrift({ rootDir: root });
      assert.equal(r.warning_count, 1);
      assert.equal(r.findings[0].check, 'broken-relative-link');
      assert.equal(r.findings[0].link, './missing.md#L12');
    },
  );
});

test('link examples inside inline code spans are ignored', () => {
  withRoot(
    {
      'docs/foo.md': 'Use `[missing](./missing.md)` to link.\n',
    },
    (root) => {
      const r = analyzeDocDrift({ rootDir: root });
      assert.equal(r.warning_count, 0);
      assert.deepEqual(r.findings, []);
    },
  );
});

test('only the link outside an inline code span is scanned, including multi-backtick spans', () => {
  withRoot(
    {
      'docs/foo.md': [
        '`[in-span](./missing.md)` and [outside](./missing.md)',
        '``code ` [also-in-span](./missing.md) inner`` end',
        '',
      ].join('\n'),
    },
    (root) => {
      const r = analyzeDocDrift({ rootDir: root });
      assert.equal(r.warning_count, 1);
      assert.deepEqual(r.findings.map((f) => [f.check, f.link]), [
        ['broken-relative-link', './missing.md'],
      ]);
    },
  );
});

test('bare non-path-like bracket notation is info, not a warning', () => {
  withRoot(
    {
      'docs/foo.md': [
        '[이메일로 로그인](primary)',
        'str[](시행일 이력 최신순)',
        '[Select](select)',
        '',
      ].join('\n'),
    },
    (root) => {
      const r = analyzeDocDrift({ rootDir: root });
      assert.equal(r.warning_count, 0);
      assert.equal(r.info_count, 3);
      assert.ok(r.findings.every((f) => f.severity === 'info'));
      assert.ok(r.findings.every((f) => f.check === 'ambiguous-non-link-bracket-notation'));
      assert.ok(r.findings.every((f) => /non-path-like/.test(f.reason)));
    },
  );
});

test('path-like missing destinations keep the broken-relative-link warning', () => {
  withRoot(
    {
      'docs/foo.md': [
        '[missing](./missing.md)',
        '[missing](docs/foo)',
        '[missing](nope.md)',
        '',
      ].join('\n'),
    },
    (root) => {
      const r = analyzeDocDrift({ rootDir: root });
      assert.equal(r.warning_count, 3);
      assert.ok(r.findings.every((f) => f.severity === 'warning'));
      assert.ok(r.findings.every((f) => f.check === 'broken-relative-link'));
    },
  );
});

test('root-escaping relative link is unverifiable info by default', () => {
  withRoot(
    {
      'docs/foo.md': '[backend](../../backend/app/foo.md)\n',
    },
    (root) => {
      const r = analyzeDocDrift({ rootDir: root });
      assert.equal(r.warning_count, 0);
      assert.equal(r.info_count, 1);
      assert.deepEqual(r.findings.map((f) => [f.severity, f.check]), [
        ['info', 'relative-link-escapes-root'],
      ]);
      assert.match(r.findings[0].reason, /cannot be verified/);
    },
  );
});

test('escapesRootSeverity warning promotes root-escaping links to warning_count', () => {
  withRoot(
    {
      'docs/foo.md': '[backend](../../backend/app/foo.md)\n',
    },
    (root) => {
      const r = analyzeDocDrift({ rootDir: root, escapesRootSeverity: 'warning' });
      assert.equal(r.warning_count, 1);
      assert.equal('info_count' in r, false);
      assert.equal(r.findings[0].check, 'relative-link-escapes-root');
      assert.throws(
        () => analyzeDocDrift({ rootDir: root, escapesRootSeverity: 'fatal' }),
        DocDriftInputError,
      );
    },
  );
});

test('default info findings appear as INFO (never WARNING) in human output', () => {
  withRoot(
    {
      'docs/foo.md': '[이메일로 로그인](primary)\n[backend](../../backend/app/foo.md)\n',
    },
    (root) => {
      const r = analyzeDocDrift({ rootDir: root });
      const lines = formatDocDriftHuman(r);
      assert.equal(lines.length, 2);
      assert.ok(lines.every((line) => /— INFO /.test(line)));
      assert.ok(lines.every((line) => !/WARNING/.test(line)));
    },
  );
});

test('CLI --escapes-root-severity warning promotes and invalid values exit 2', () => {
  withRoot(
    {
      'docs/foo.md': '[backend](../../backend/app/foo.md)\n',
    },
    (root) => {
      const promoted = spawnSync(process.execPath, [
        CLI, '--root', root, '--escapes-root-severity', 'warning', '--json',
      ], { encoding: 'utf8' });
      assert.equal(promoted.status, 0, promoted.stderr);
      const obj = JSON.parse(promoted.stdout);
      assert.equal(obj.warning_count, 1);
      assert.equal(obj.findings[0].check, 'relative-link-escapes-root');

      const invalid = spawnSync(process.execPath, [
        CLI, '--root', root, '--escapes-root-severity', 'fatal',
      ], { encoding: 'utf8' });
      assert.equal(invalid.status, 2);
      assert.match(invalid.stderr, /--escapes-root-severity must be info or warning/);
    },
  );
});

test('CLI --json includes info_count only when default info findings exist', () => {
  withRoot(
    {
      'docs/foo.md': '[이메일로 로그인](primary)\n[ok](./bar.md)\n',
      'docs/bar.md': '# Bar\n',
    },
    (root) => {
      const r = spawnSync(process.execPath, [CLI, '--root', root, '--json'], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      const obj = JSON.parse(r.stdout);
      assert.equal(obj.warning_count, 0);
      assert.equal(obj.info_count, 1);
      assert.deepEqual(Object.keys(obj), ['tool', 'mode', 'root', 'ok', 'warning_count', 'info_count', 'findings']);
    },
  );
});

// --- Issue #150 review follow-up: escaped brackets, autolinks, anchor casing ---

test('escaped opening bracket is not scanned as a link', () => {
  withRoot(
    {
      'docs/foo.md': 'Write \\[x](./missing.md) to show the syntax.\n',
    },
    (root) => {
      const r = analyzeDocDrift({ rootDir: root });
      assert.equal(r.warning_count, 0);
      assert.deepEqual(r.findings, []);
    },
  );
});

test('escaped backslash before a bracket keeps the real link (odd/even backslashes)', () => {
  withRoot(
    {
      'docs/foo.md': 'A real link after an escaped backslash: \\\\[x](./missing.md)\n',
    },
    (root) => {
      const r = analyzeDocDrift({ rootDir: root });
      assert.equal(r.warning_count, 1);
      assert.equal(r.findings[0].check, 'broken-relative-link');
      assert.equal(r.findings[0].link, './missing.md');
    },
  );
});

test('markdown-looking text inside an autolink is not a relative link', () => {
  withRoot(
    {
      'docs/foo.md': 'See <http://example.com/[x](./missing.md)> for details.\n',
    },
    (root) => {
      const r = analyzeDocDrift({ rootDir: root });
      assert.equal(r.warning_count, 0);
      assert.deepEqual(r.findings, []);
    },
  );
});

test('autolink masking does not swallow angle-bracket relative destinations', () => {
  withRoot(
    {
      'docs/foo.md': '[x](<./missing.md>)\n',
    },
    (root) => {
      const r = analyzeDocDrift({ rootDir: root });
      assert.equal(r.warning_count, 1);
      assert.equal(r.findings[0].check, 'broken-relative-link');
      assert.equal(r.findings[0].target, 'docs/missing.md');
    },
  );
});

test('lowercase and query-prefixed line anchors on existing files have warning 0', () => {
  withRoot(
    {
      'docs/foo.md': '[a](./bar.md#l12)\n[b](./bar.md?plain=1#L12)\n',
      'docs/bar.md': '# Bar\n',
    },
    (root) => {
      const r = analyzeDocDrift({ rootDir: root });
      assert.equal(r.warning_count, 0);
      assert.deepEqual(r.findings, []);
    },
  );
});

test('nested bracket label with a real path keeps the broken-relative-link warning', () => {
  withRoot(
    {
      'docs/foo.md': '[[key]](./missing.md)\n',
    },
    (root) => {
      const r = analyzeDocDrift({ rootDir: root });
      assert.equal(r.warning_count, 1);
      assert.equal(r.findings[0].check, 'broken-relative-link');
      assert.equal(r.findings[0].link, './missing.md');
    },
  );
});

test('CLI default run reports root-escaping links as exit-0 info with warning 0', () => {
  withRoot(
    {
      'docs/foo.md': '[backend](../../backend/app/foo.md)\n',
    },
    (root) => {
      const r = spawnSync(process.execPath, [CLI, '--root', root, '--json'], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      const obj = JSON.parse(r.stdout);
      assert.equal(obj.warning_count, 0);
      assert.equal(obj.info_count, 1);
      assert.equal(obj.findings[0].check, 'relative-link-escapes-root');
    },
  );
});

test('dead links inside fenced code blocks are ignored', () => {
  withRoot(
    {
      'docs/foo.md': '```md\n[dead](./missing.md#nope)\n```\n',
    },
    (root) => {
      const r = analyzeDocDrift({ rootDir: root });
      assert.equal(r.warning_count, 0);
    },
  );
});

test('external URLs are ignored', () => {
  withRoot(
    {
      'docs/foo.md': '[external](https://example.invalid/missing.md#nope)\n![img](http://example.invalid/a.png)\n',
    },
    (root) => {
      const r = analyzeDocDrift({ rootDir: root });
      assert.equal(r.warning_count, 0);
    },
  );
});

test('JSON finding sorting is deterministic by source, check, and link', () => {
  withRoot(
    {
      'docs/b.md': '[z](./z.md)\n[a](#absent)\n# Present\n',
      'docs/a.md': '[b](#missing)\n# Present\n[link](./missing.md)\n',
    },
    (root) => {
      const r = analyzeDocDrift({ rootDir: root });
      assert.deepEqual(
        r.findings.map((f) => [f.source, f.check, f.link]),
        [
          ['docs/a.md', 'broken-relative-link', './missing.md'],
          ['docs/a.md', 'dead-anchor', '#missing'],
          ['docs/b.md', 'broken-relative-link', './z.md'],
          ['docs/b.md', 'dead-anchor', '#absent'],
        ],
      );
      const first = JSON.stringify(r, null, 2);
      const second = JSON.stringify(analyzeDocDrift({ rootDir: root }), null, 2);
      assert.equal(first, second);
      assert.equal(r.root, '.');
      assert.ok(r.findings.every((f) => !path.isAbsolute(f.source) && !path.isAbsolute(f.target)));
    },
  );
});

test('CLI --json exits 0 and prints parseable JSON to stdout', () => {
  withRoot(
    {
      'docs/foo.md': '[ok](./bar.md)\n',
      'docs/bar.md': '# Bar\n',
    },
    (root) => {
      const r = spawnSync(process.execPath, [CLI, '--root', root, '--json'], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stderr, '');
      const obj = JSON.parse(r.stdout);
      assert.equal(obj.tool, 'workflow:doc-drift');
      assert.equal(obj.mode, 'warning-first');
      assert.equal(obj.root, '.');
      assert.equal(obj.warning_count, 0);
    },
  );
});

test('CLI exits 0 even when findings exist', () => {
  withRoot(
    {
      'docs/foo.md': '[missing](./missing.md)\n',
    },
    (root) => {
      const r = spawnSync(process.execPath, [CLI, '--root', root], { encoding: 'utf8' });
      assert.equal(r.status, 0);
      assert.equal(r.stdout, '');
      assert.match(r.stderr, /WARNING broken-relative-link/);
    },
  );
});

// --- Phase 1 opt-in: manifest↔roadmap status heuristic ------------------------
// The heuristic is opt-in (--include status-heuristic) and info-only: findings
// are severity "info", counted in info_count, never in warning_count, and never
// change the exit code. It is a manual-review pointer, not semantic drift.

const HEURISTIC_MANIFEST = [
  'version: 1',
  'artifacts:',
  '  eslint-workflow-config:',
  '    kind: generated',
  '    status: planned',
  '  route-tree:',
  '    kind: generated',
  '    status: active',
  '  nav-graph:',
  '    kind: generated',
  '    status: active',
  '',
].join('\n');

const HEURISTIC_ROADMAP = [
  '# Roadmap',
  '',
  '- `eslint.workflow.config.mjs` 생성기는 구현 완료.',
  '- route-tree 생성기 승격은 대기.',
  '- nav-graph 매니페스트 status: planned → active 로 갱신.',
  '- unrelated-artifact 는 구현 완료.',
  '',
].join('\n');

function heuristicRoot(extra = {}) {
  return {
    'catalog/artifact-manifest.yaml': HEURISTIC_MANIFEST,
    'kit-dev/roadmap-current.md': HEURISTIC_ROADMAP,
    ...extra,
  };
}

function runHeuristic(root, extraArgs = []) {
  return spawnSync(process.execPath, [
    CLI,
    '--root', root,
    '--include', 'status-heuristic',
    '--manifest', 'catalog/artifact-manifest.yaml',
    ...extraArgs,
  ], { encoding: 'utf8' });
}

test('default output is byte-identical with the heuristic disabled (no include/info_count keys)', () => {
  withRoot(heuristicRoot({ 'docs/foo.md': '[ok](./bar.md)\n', 'docs/bar.md': '# Bar\n' }), (root) => {
    const r = analyzeDocDrift({ rootDir: root });
    assert.deepEqual(Object.keys(r), ['tool', 'mode', 'root', 'ok', 'warning_count', 'findings']);
    assert.equal('info_count' in r, false);
    assert.equal('include' in r, false);
  });
});

test('planned manifest with implemented roadmap wording is an info finding, not a warning', () => {
  withRoot(heuristicRoot(), (root) => {
    const findings = analyzeManifestRoadmapStatus({
      rootDir: root,
      manifestPath: path.join(root, 'catalog/artifact-manifest.yaml'),
      roadmapPath: path.join(root, 'kit-dev/roadmap-current.md'),
    });
    // Dot alias: eslint-workflow-config is matched via eslint.workflow.config.
    const eslintFinding = findings.find((f) => f.artifact_id === 'eslint-workflow-config');
    assert.deepEqual(eslintFinding, {
      severity: 'info',
      check: 'manifest-roadmap-status-heuristic',
      source: 'kit-dev/roadmap-current.md',
      target: 'catalog/artifact-manifest.yaml',
      artifact_id: 'eslint-workflow-config',
      manifest_status: 'planned',
      roadmap_signal: 'implemented',
      reason: 'roadmap wording looks implemented while manifest status is planned (heuristic; review manually)',
    });
  });
});

test('active manifest with planned roadmap wording is an info finding', () => {
  withRoot(heuristicRoot(), (root) => {
    const findings = analyzeManifestRoadmapStatus({
      rootDir: root,
      manifestPath: path.join(root, 'catalog/artifact-manifest.yaml'),
      roadmapPath: path.join(root, 'kit-dev/roadmap-current.md'),
    });
    const routeTree = findings.find((f) => f.artifact_id === 'route-tree');
    assert.equal(routeTree.manifest_status, 'active');
    assert.equal(routeTree.roadmap_signal, 'planned');
  });
});

test('negated wording (미완료 / not implemented / not active) does not read as implemented', () => {
  const roadmap = [
    '# Roadmap',
    '',
    '- `eslint.workflow.config.mjs` 생성기는 아직 미완료.',
    '- route-tree runner is not yet implemented.',
    '- nav-graph 는 not active.',
    '',
  ].join('\n');
  withRoot(heuristicRoot({ 'kit-dev/roadmap-current.md': roadmap }), (root) => {
    const findings = analyzeManifestRoadmapStatus({
      rootDir: root,
      manifestPath: path.join(root, 'catalog/artifact-manifest.yaml'),
      roadmapPath: path.join(root, 'kit-dev/roadmap-current.md'),
    });
    // eslint-workflow-config(planned) 미완료 → not implemented → no false info.
    // route-tree(active) "not yet implemented" and nav-graph(active) "not active"
    // are negations, not planned wording, so they also produce nothing.
    assert.deepEqual(findings, []);
  });
});

test('ambiguous lines (both signals) and unknown artifact ids produce no finding', () => {
  withRoot(heuristicRoot(), (root) => {
    const findings = analyzeManifestRoadmapStatus({
      rootDir: root,
      manifestPath: path.join(root, 'catalog/artifact-manifest.yaml'),
      roadmapPath: path.join(root, 'kit-dev/roadmap-current.md'),
    });
    // nav-graph line has planned AND active ("planned → active") - skipped.
    assert.equal(findings.some((f) => f.artifact_id === 'nav-graph'), false);
    // unrelated-artifact is not in the manifest - never reported.
    assert.equal(findings.some((f) => f.artifact_id === 'unrelated-artifact'), false);
    assert.equal(findings.length, 2);
  });
});

test('heuristic findings deduplicate repeated lines and sort deterministically', () => {
  const roadmap = [
    '- route-tree 승격 대기.',
    '- `eslint.workflow.config.mjs` 구현 완료.',
    '- route-tree 여전히 대기.',
    '',
  ].join('\n');
  withRoot(heuristicRoot({ 'kit-dev/roadmap-current.md': roadmap }), (root) => {
    const report = analyzeDocDrift({
      rootDir: root,
      statusHeuristic: {
        manifestPath: path.join(root, 'catalog/artifact-manifest.yaml'),
        roadmapPath: path.join(root, 'kit-dev/roadmap-current.md'),
      },
    });
    assert.deepEqual(report.include, ['status-heuristic']);
    assert.equal(report.info_count, 2);
    assert.equal(report.warning_count, 0);
    assert.deepEqual(
      report.findings.map((f) => [f.artifact_id, f.roadmap_signal]),
      [
        ['eslint-workflow-config', 'implemented'],
        ['route-tree', 'planned'],
      ],
    );
    const second = analyzeDocDrift({
      rootDir: root,
      statusHeuristic: {
        manifestPath: path.join(root, 'catalog/artifact-manifest.yaml'),
        roadmapPath: path.join(root, 'kit-dev/roadmap-current.md'),
      },
    });
    assert.equal(JSON.stringify(report, null, 2), JSON.stringify(second, null, 2));
  });
});

test('roadmap wording inside fenced code blocks is ignored by the heuristic', () => {
  const roadmap = [
    '# Roadmap',
    '',
    '```txt',
    'eslint-workflow-config 구현 완료',
    '```',
    '',
  ].join('\n');
  withRoot(heuristicRoot({ 'kit-dev/roadmap-current.md': roadmap }), (root) => {
    const findings = analyzeManifestRoadmapStatus({
      rootDir: root,
      manifestPath: path.join(root, 'catalog/artifact-manifest.yaml'),
      roadmapPath: path.join(root, 'kit-dev/roadmap-current.md'),
    });
    assert.deepEqual(findings, []);
  });
});

test('malformed manifest YAML and missing roadmap are typed input errors (lib level)', () => {
  withRoot(heuristicRoot({ 'catalog/artifact-manifest.yaml': 'artifacts: [broken' }), (root) => {
    assert.throws(
      () => analyzeManifestRoadmapStatus({
        rootDir: root,
        manifestPath: path.join(root, 'catalog/artifact-manifest.yaml'),
        roadmapPath: path.join(root, 'kit-dev/roadmap-current.md'),
      }),
      DocDriftInputError,
    );
  });
  withRoot(heuristicRoot(), (root) => {
    assert.throws(
      () => analyzeManifestRoadmapStatus({
        rootDir: root,
        manifestPath: path.join(root, 'catalog/artifact-manifest.yaml'),
        roadmapPath: path.join(root, 'kit-dev/missing.md'),
      }),
      DocDriftInputError,
    );
  });
});

test('CLI --include status-heuristic reports info findings with warning_count 0 and exit 0', () => {
  withRoot(heuristicRoot(), (root) => {
    const r = runHeuristic(root, ['--json']);
    assert.equal(r.status, 0, r.stderr);
    const obj = JSON.parse(r.stdout);
    assert.deepEqual(obj.include, ['status-heuristic']);
    assert.equal(obj.ok, true);
    assert.equal(obj.warning_count, 0);
    assert.equal(obj.info_count, 2);
    assert.ok(obj.findings.every((f) => f.severity === 'info'));
    assert.ok(obj.findings.every((f) => !path.isAbsolute(f.source) && !path.isAbsolute(f.target)));
  });
});

test('CLI human mode labels heuristic findings as info-only manual review, never a gate', () => {
  withRoot(heuristicRoot(), (root) => {
    const r = runHeuristic(root);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /INFO manifest-roadmap-status-heuristic/);
    assert.match(r.stderr, /review manually/);
    assert.match(r.stderr, /info-only/);
    assert.match(r.stderr, /not a gate, not a semantic-truth claim/);
    assert.doesNotMatch(r.stderr, /WARNING manifest-roadmap-status-heuristic/);
  });
});

test('CLI help documents the heuristic as opt-in review-only without semantic drift claims', () => {
  const r = spawnSync(process.execPath, [CLI, '--help'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /--include status-heuristic/);
  assert.match(r.stdout, /NOT a gate and NOT a semantic-truth\/semantic-drift\s+claim/);
});

test('CLI heuristic usage and input errors exit 2', () => {
  withRoot(heuristicRoot(), (root) => {
    const unknown = spawnSync(process.execPath, [CLI, '--root', root, '--include', 'nope'], { encoding: 'utf8' });
    assert.equal(unknown.status, 2);
    assert.match(unknown.stderr, /unknown --include value: nope/);

    const flagWithoutInclude = spawnSync(process.execPath, [
      CLI, '--root', root, '--roadmap', 'kit-dev/roadmap-current.md',
    ], { encoding: 'utf8' });
    assert.equal(flagWithoutInclude.status, 2);
    assert.match(flagWithoutInclude.stderr, /--roadmap requires --include status-heuristic/);
  });

  withRoot(heuristicRoot({ 'catalog/artifact-manifest.yaml': 'artifacts: [broken' }), (root) => {
    const malformed = runHeuristic(root, ['--json']);
    assert.equal(malformed.status, 2);
    assert.match(malformed.stderr, /artifact manifest YAML parse failed/);
  });

  withRoot({ 'catalog/artifact-manifest.yaml': HEURISTIC_MANIFEST }, (root) => {
    const missingRoadmap = runHeuristic(root);
    assert.equal(missingRoadmap.status, 2);
    assert.match(missingRoadmap.stderr, /roadmap-current\.md not found under --root/);
  });
});

test('CLI default run on a heuristic-triggering root stays Phase 0 (no info findings)', () => {
  withRoot(heuristicRoot(), (root) => {
    const r = spawnSync(process.execPath, [CLI, '--root', root, '--json'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const obj = JSON.parse(r.stdout);
    assert.equal('info_count' in obj, false);
    assert.equal('include' in obj, false);
    assert.equal(obj.findings.some((f) => f.check === 'manifest-roadmap-status-heuristic'), false);
  });
});

// --- Issue #163 opt-in: release-consistency ------------------------------------
// Narrow structural release/version ↔ implemented-status contradiction rules.
// Warning-first (exit 0 always), canonical_owner/fix_path on every finding,
// historical docs excluded, no automatic doc edits.

const RC_PACKAGE = JSON.stringify({
  name: 'fixture-kit',
  version: '0.3.0-mvp.1',
  scripts: {
    'workflow:telemetry': 'node scripts/telemetry.mjs',
    'workflow:validate': 'node scripts/validate.mjs',
    test: 'node scripts/run-tests.mjs',
  },
}, null, 2) + '\n';

const RC_CHANGELOG = [
  '# Changelog',
  '',
  '## Unreleased',
  '',
  '- pending work',
  '',
  '## 0.3.0-mvp.1 — 2026-07-11',
  '',
  '- release baseline',
  '',
  '## 0.2.0-mvp-b-rc1 — 2026-06-19',
  '',
].join('\n');

const RC_ROADMAP = '# Current Roadmap\n\n> 스냅샷: 2026-07-11 (release baseline)\n\n- 본문.\n';

// False-positive fixture README: a matching fixed count, a script mention
// without unimplemented wording, and a fenced contradiction that must be masked.
const RC_README = [
  '# Fixture',
  '',
  '검사 12종 통과가 정본이다.',
  '`workflow:telemetry` 를 실행한다.',
  '스크립트 2개.',
  '',
  '```md',
  '`workflow:telemetry` 는 미구현. 검사 8종.',
  '```',
  '',
].join('\n');

function rcRoot(extra = {}) {
  return {
    'package.json': RC_PACKAGE,
    'kit-dev/CHANGELOG.md': RC_CHANGELOG,
    'kit-dev/roadmap-current.md': RC_ROADMAP,
    'scripts/validate.mjs': '// stub\nprocess.stdout.write(\'workflow:validate — OK (검사 12종 통과)\\n\');\n',
    'scripts/telemetry.mjs': '// telemetry stub\n',
    'README.md': RC_README,
    ...extra,
  };
}

function rcAnalyze(root, extra = {}) {
  return analyzeReleaseConsistency({
    rootDir: root,
    packagePath: path.join(root, 'package.json'),
    changelogPath: path.join(root, 'kit-dev/CHANGELOG.md'),
    roadmapPath: path.join(root, 'kit-dev/roadmap-current.md'),
    ...extra,
  });
}

function runReleaseCli(root, extraArgs = []) {
  return spawnSync(process.execPath, [
    CLI, '--root', root, '--include', 'release-consistency', ...extraArgs,
  ], { encoding: 'utf8' });
}

test('release-consistency false-positive fixture is clean (no findings, exit 0)', () => {
  withRoot(rcRoot(), (root) => {
    assert.deepEqual(rcAnalyze(root), []);
    const r = runReleaseCli(root, ['--json']);
    assert.equal(r.status, 0, r.stderr);
    const obj = JSON.parse(r.stdout);
    assert.deepEqual(obj.include, ['release-consistency']);
    assert.equal(obj.warning_count, 0);
    assert.equal(obj.info_count, 0);
    assert.deepEqual(obj.findings, []);
  });
});

test('package version vs latest changelog release heading mismatch is a warning with owner/fix', () => {
  withRoot(rcRoot({ 'package.json': RC_PACKAGE.replace('0.3.0-mvp.1', '0.1.0-mvp-a') }), (root) => {
    const findings = rcAnalyze(root);
    assert.deepEqual(findings, [
      {
        severity: 'warning',
        check: 'package-version-changelog-mismatch',
        source: 'package.json',
        target: 'kit-dev/CHANGELOG.md',
        package_version: '0.1.0-mvp-a',
        changelog_version: '0.3.0-mvp.1',
        canonical_owner: 'kit-dev/CHANGELOG.md',
        fix_path: 'package.json',
        reason: "package version '0.1.0-mvp-a' does not match latest changelog release heading '0.3.0-mvp.1'",
      },
    ]);
  });
});

test('changelog with only Unreleased yields a missing-release-heading warning', () => {
  const changelog = '# Changelog\n\n## Unreleased\n\n- big pile of everything\n';
  withRoot(rcRoot({ 'kit-dev/CHANGELOG.md': changelog }), (root) => {
    const findings = rcAnalyze(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].check, 'package-version-changelog-mismatch');
    assert.equal(findings[0].changelog_version, null);
    assert.equal(findings[0].fix_path, 'kit-dev/CHANGELOG.md');
    assert.match(findings[0].reason, /no release heading/);
  });
});

test('latestReleaseHeading skips Unreleased and non-version H2 sections', () => {
  assert.deepEqual(
    latestReleaseHeading('## Unreleased\n\n## 배경 설명\n\n## `v1.2.3` — 2026-01-02\n'),
    { version: '1.2.3', date: '2026-01-02' },
  );
  assert.equal(latestReleaseHeading('## Unreleased\n\ntext\n'), null);
  assert.deepEqual(
    latestReleaseHeading('## 0.3.0-mvp.1\n'),
    { version: '0.3.0-mvp.1', date: null },
  );
});

test('roadmap snapshot predating the latest release date is a warning', () => {
  const roadmap = '# Current Roadmap\n\n> 스냅샷: 2026-07-03 (기준 커밋)\n';
  withRoot(rcRoot({ 'kit-dev/roadmap-current.md': roadmap }), (root) => {
    const findings = rcAnalyze(root);
    assert.deepEqual(findings.map((f) => [f.check, f.snapshot_date, f.release_date]), [
      ['roadmap-snapshot-stale', '2026-07-03', '2026-07-11'],
    ]);
    assert.equal(findings[0].severity, 'warning');
    assert.equal(findings[0].fix_path, 'kit-dev/roadmap-current.md');
  });
});

test('roadmap without a parsable snapshot line is silently skipped', () => {
  withRoot(rcRoot({ 'kit-dev/roadmap-current.md': '# Current Roadmap\n\n- 본문.\n' }), (root) => {
    assert.deepEqual(rcAnalyze(root), []);
  });
});

test('explicit --now enables the snapshot age rule; no wall clock is read by default', () => {
  // Release heading without a date so only the --now age rule can fire.
  const changelog = '# Changelog\n\n## 0.3.0-mvp.1\n';
  const roadmap = '# Current Roadmap\n\n> 스냅샷: 2026-05-01 (오래됨)\n';
  const files = rcRoot({ 'kit-dev/CHANGELOG.md': changelog, 'kit-dev/roadmap-current.md': roadmap });
  withRoot(files, (root) => {
    assert.deepEqual(rcAnalyze(root), []);
    const aged = rcAnalyze(root, { now: '2026-07-11' });
    assert.equal(aged.length, 1);
    assert.equal(aged[0].check, 'roadmap-snapshot-stale');
    assert.match(aged[0].reason, /71 days old as of 2026-07-11 \(threshold 30 days\)/);
    assert.deepEqual(rcAnalyze(root, { now: '2026-07-11', maxSnapshotAgeDays: 90 }), []);
  });
});

test('existing package script named on a doc line with 미구현 wording is a contradiction warning', () => {
  const readme = [
    '# Fixture',
    '',
    '- `workflow:telemetry` 는 아직 미구현.',
    '- telemetry.mjs is not implemented yet.',
    '',
  ].join('\n');
  withRoot(rcRoot({ 'README.md': readme }), (root) => {
    const findings = rcAnalyze(root);
    assert.deepEqual(
      findings.map((f) => [f.check, f.script, f.severity]).sort((a, b) => a[1].localeCompare(b[1])),
      [
        ['script-doc-unimplemented-contradiction', 'telemetry.mjs', 'warning'],
        ['script-doc-unimplemented-contradiction', 'workflow:telemetry', 'warning'],
      ],
    );
    assert.ok(findings.every((f) => f.canonical_owner === 'package.json'));
    assert.ok(findings.every((f) => f.fix_path === 'README.md'));
  });
});

test('script token matching is exact: superstrings and non-namespaced aliases never match', () => {
  const readme = [
    '# Fixture',
    '',
    '- workflow:telemetry-extra 는 미구현.',
    '- test 는 미구현.',
    '- 미구현 목록에는 스크립트 이름이 없다.',
    '',
  ].join('\n');
  withRoot(rcRoot({ 'README.md': readme }), (root) => {
    assert.deepEqual(rcAnalyze(root), []);
  });
});

test('fixed 검사 N종 count conflicting with the validate.mjs success line is a warning', () => {
  const readme = '# Fixture\n\nvalidate 는 검사 8종을 돈다.\n검사 12종 언급은 정합.\n';
  withRoot(rcRoot({ 'README.md': readme }), (root) => {
    const findings = rcAnalyze(root);
    assert.deepEqual(findings, [
      {
        severity: 'warning',
        check: 'fixed-count-mismatch',
        source: 'README.md',
        target: 'scripts/validate.mjs',
        doc_count: 8,
        code_count: 12,
        canonical_owner: 'scripts/validate.mjs',
        fix_path: 'README.md',
        reason: "doc fixed count '검사 8종' conflicts with the validate.mjs success line '검사 12종'",
      },
    ]);
  });
});

test('fixed 스크립트 N개 count vs top-level scripts/*.mjs files is info-only', () => {
  const readme = '# Fixture\n\n스크립트 5개가 있다.\n';
  withRoot(rcRoot({ 'README.md': readme }), (root) => {
    const findings = rcAnalyze(root);
    assert.deepEqual(findings.map((f) => [f.severity, f.check, f.doc_count, f.code_count]), [
      ['info', 'fixed-count-mismatch', 5, 2],
    ]);
    assert.match(findings[0].reason, /count-basis heuristic; review manually/);
    const report = analyzeDocDrift({
      rootDir: root,
      releaseConsistency: {
        packagePath: path.join(root, 'package.json'),
        changelogPath: path.join(root, 'kit-dev/CHANGELOG.md'),
        roadmapPath: path.join(root, 'kit-dev/roadmap-current.md'),
      },
    });
    assert.equal(report.warning_count, 0);
    assert.equal(report.info_count, 1);
  });
});

test('historical docs (HISTORICAL marker / 🗄) are excluded from rules 3 and 5', () => {
  const historical = [
    '# IMPLEMENTING — MVP-A historical build note',
    '',
    '> 🗄 **HISTORICAL (2026-07-11 강등)**: 당시 상태 그대로 보존.',
    '',
    '스크립트 3개 / 검사 8종.',
    '- `workflow:telemetry` 는 미구현.',
    '',
  ].join('\n');
  withRoot(rcRoot({ 'IMPLEMENTING.md': historical }), (root) => {
    assert.deepEqual(rcAnalyze(root), []);
  });
  // The same content without the marker IS scanned — the exclusion is the
  // marker, not the file name.
  const living = historical.split('\n').filter((line) => !line.includes('HISTORICAL')).join('\n');
  withRoot(rcRoot({ 'IMPLEMENTING.md': living }), (root) => {
    const checks = rcAnalyze(root).map((f) => f.check).sort();
    assert.deepEqual(checks, [
      'fixed-count-mismatch',
      'fixed-count-mismatch',
      'script-doc-unimplemented-contradiction',
    ]);
  });
  assert.equal(isHistoricalDoc('일반 문서에서 historical 이라는 단어를 소문자로 언급한다\n'), false);
  assert.equal(isHistoricalDoc('> 🗄 보관\n'), true);
  assert.equal(isHistoricalDoc(`${'x\n'.repeat(45)}HISTORICAL\n`), false);
});

test('missing/corrupt release-consistency inputs are typed input errors (lib level)', () => {
  withRoot(rcRoot({ 'package.json': '{ broken' }), (root) => {
    assert.throws(() => rcAnalyze(root), DocDriftInputError);
  });
  withRoot(rcRoot(), (root) => {
    assert.throws(
      () => rcAnalyze(root, { changelogPath: path.join(root, 'kit-dev/missing.md') }),
      DocDriftInputError,
    );
    assert.throws(() => rcAnalyze(root, { now: 'yesterday' }), DocDriftInputError);
    assert.throws(() => rcAnalyze(root, { now: '2026-02-30' }), DocDriftInputError);
    assert.throws(() => rcAnalyze(root, { maxSnapshotAgeDays: 0 }), DocDriftInputError);
  });
});

test('CLI release-consistency usage and input errors exit 2', () => {
  withRoot(rcRoot(), (root) => {
    const flagWithoutInclude = spawnSync(process.execPath, [
      CLI, '--root', root, '--package', 'package.json',
    ], { encoding: 'utf8' });
    assert.equal(flagWithoutInclude.status, 2);
    assert.match(flagWithoutInclude.stderr, /--package requires --include release-consistency/);

    const nowWithoutInclude = spawnSync(process.execPath, [
      CLI, '--root', root, '--now', '2026-07-11',
    ], { encoding: 'utf8' });
    assert.equal(nowWithoutInclude.status, 2);

    const ageWithoutNow = runReleaseCli(root, ['--max-snapshot-age-days', '10']);
    assert.equal(ageWithoutNow.status, 2);
    assert.match(ageWithoutNow.stderr, /--max-snapshot-age-days requires --now/);

    const badAge = runReleaseCli(root, ['--now', '2026-07-11', '--max-snapshot-age-days', 'lots']);
    assert.equal(badAge.status, 2);
    assert.match(badAge.stderr, /--max-snapshot-age-days must be a positive integer/);

    const badNow = runReleaseCli(root, ['--now', 'yesterday']);
    assert.equal(badNow.status, 2);
    assert.match(badNow.stderr, /invalid --now date/);
  });

  withRoot(rcRoot({ 'package.json': '{ broken' }), (root) => {
    const malformed = runReleaseCli(root, ['--json']);
    assert.equal(malformed.status, 2);
    assert.match(malformed.stderr, /package\.json parse failed/);
  });

  withRoot({ 'README.md': '# no kit here\n' }, (root) => {
    const missing = runReleaseCli(root);
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /package\.json not found under --root/);
  });
});

test('CLI reports release-consistency findings on exit 0 with owner/fix in human output', () => {
  withRoot(rcRoot({ 'package.json': RC_PACKAGE.replace('0.3.0-mvp.1', '0.1.0-mvp-a') }), (root) => {
    const r = runReleaseCli(root);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /WARNING package-version-changelog-mismatch/);
    assert.match(r.stderr, /\[owner: kit-dev\/CHANGELOG\.md; fix: package\.json\]/);
    assert.match(r.stderr, /release-consistency findings are warning-first observations/);
    assert.match(r.stderr, /not a gate, never auto-edited/);

    const json = runReleaseCli(root, ['--json']);
    assert.equal(json.status, 0, json.stderr);
    const obj = JSON.parse(json.stdout);
    assert.equal(obj.ok, true);
    assert.equal(obj.warning_count, 1);
    assert.ok(obj.findings.every((f) => !path.isAbsolute(f.source) && !path.isAbsolute(f.target)));
    assert.ok(obj.findings.every((f) => f.canonical_owner && f.fix_path));
  });
});

test('CLI composes both opt-ins with a sorted include array and deterministic output', () => {
  const files = {
    ...rcRoot(),
    'catalog/artifact-manifest.yaml': HEURISTIC_MANIFEST,
    'kit-dev/roadmap-current.md': `${RC_ROADMAP}\n- \`eslint.workflow.config.mjs\` 생성기는 구현 완료.\n`,
  };
  withRoot(files, (root) => {
    const run = () => spawnSync(process.execPath, [
      CLI, '--root', root,
      '--include', 'status-heuristic,release-consistency',
      '--manifest', 'catalog/artifact-manifest.yaml',
      '--json',
    ], { encoding: 'utf8' });
    const first = run();
    assert.equal(first.status, 0, first.stderr);
    const obj = JSON.parse(first.stdout);
    assert.deepEqual(obj.include, ['release-consistency', 'status-heuristic']);
    assert.equal(obj.warning_count, 0);
    assert.equal(obj.info_count, 1);
    assert.equal(obj.findings[0].check, 'manifest-roadmap-status-heuristic');
    assert.equal(first.stdout, run().stdout);
  });
});

test('CLI default run on a release-consistency fixture root stays Phase 0', () => {
  withRoot(rcRoot({ 'package.json': RC_PACKAGE.replace('0.3.0-mvp.1', '0.1.0-mvp-a') }), (root) => {
    const r = spawnSync(process.execPath, [CLI, '--root', root, '--json'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const obj = JSON.parse(r.stdout);
    assert.equal('include' in obj, false);
    assert.equal('info_count' in obj, false);
    assert.equal(obj.findings.some((f) => f.canonical_owner), false);
  });
});

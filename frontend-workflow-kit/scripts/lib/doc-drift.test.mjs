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
  collectHeadingSlugs,
  DocDriftInputError,
  formatDocDriftHuman,
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

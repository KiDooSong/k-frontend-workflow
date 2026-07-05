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
import { analyzeDocDrift, collectHeadingSlugs, formatDocDriftHuman } from './doc-drift.mjs';
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

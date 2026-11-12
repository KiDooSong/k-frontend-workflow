// util.test.mjs — isCliEntry(CLI 엔트리 판정)의 단위 + 스폰 테스트.
//   배경: 예전 가드 `import.meta.url === pathToFileURL(process.argv[1]).href` 는 argv[1] 이
//   symlink 경유 경로일 때 깨졌다 — Node 는 import.meta.url 을 realpath 로 해석하지만 argv[1] 은
//   호출자가 준 그대로 두므로 비교가 false 가 되고, main() 없이 exit 0 + 빈 stdout 으로 샜다.
//   실제 피해 경로: macOS os.tmpdir()(/var/folders → /private/var/folders, distribution.test.mjs 의
//   packed-kit 실행)와 npm bin 심링크(node_modules/.bin/workflow-* → scripts/*.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  createContentJsonCache,
  createTextKeyedCache,
  emitGeneratedYaml,
  frontmatterBody,
  isCliEntry,
  loadGeneratedWorkflowStateOrExit,
  loadYaml,
  loadYamlOrExit,
  readBoundedFileDescriptor,
  removeFileIfExists,
  splitFrontmatter,
  yamlParse,
} from './util.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UTIL_PATH = path.join(HERE, 'util.mjs');

test('#300 body-only frontmatter extraction preserves the existing delimiter and BOM boundaries', () => {
  const cases = [
    { raw: null, body: '', hasFrontmatter: false },
    { raw: undefined, body: '', hasFrontmatter: false },
    { raw: '', body: '', hasFrontmatter: false },
    { raw: '\ufeff', body: '', hasFrontmatter: false },
    { raw: '\ufeff\ufeffplain', body: '\ufeffplain', hasFrontmatter: false },
    { raw: 'plain\r\nbody\r', body: 'plain\r\nbody\r', hasFrontmatter: false },
    { raw: '\ufeffplain\nbody', body: 'plain\nbody', hasFrontmatter: false },
    { raw: '---\nvalue: one', body: '---\nvalue: one', hasFrontmatter: false },
    { raw: '\ufeff---\nvalue: one', body: '---\nvalue: one', hasFrontmatter: false },
    { raw: '---\rvalue: one\r---\rbody', body: '---\rvalue: one\r---\rbody', hasFrontmatter: false },
    { raw: '--- \nvalue: one\n---\nbody', body: '--- \nvalue: one\n---\nbody', hasFrontmatter: false },
    { raw: '\n---\nvalue: one\n---\nbody', body: '\n---\nvalue: one\n---\nbody', hasFrontmatter: false },
    { raw: '---\n---\nbody', body: '---\n---\nbody', hasFrontmatter: false },
    { raw: '---\n\n---\nbody', body: 'body', hasFrontmatter: true },
    { raw: '---\nvalue: one\n---', body: '', hasFrontmatter: true },
    { raw: '---\nvalue: one\n---body', body: 'body', hasFrontmatter: true },
    { raw: '---\nvalue: one\n----\nbody', body: '-\nbody', hasFrontmatter: true },
    { raw: '---\nvalue: one\n--- \nbody', body: ' \nbody', hasFrontmatter: true },
    { raw: '---\nvalue: one\n---\rbody', body: 'body', hasFrontmatter: true },
    { raw: '---\nvalue: one\n---\r\r\nbody', body: '\r\nbody', hasFrontmatter: true },
    { raw: '---\nvalue: [unclosed\n---\n## Facts\n- preserved\n', body: '## Facts\n- preserved\n', hasFrontmatter: true },
    { raw: '---\nvalue: one\n---\n\ufeff## Facts\n---\n', body: '\ufeff## Facts\n---\n', hasFrontmatter: true },
  ];
  for (const opener of ['\n', '\r\n']) for (const beforeClose of ['\n', '\r\n']) {
    for (const afterClose of ['', '\n', '\r\n', '\r']) for (const bom of ['', '\ufeff']) {
      const body = '\n## Facts\r\n- 한글 😀\r\n  trailing spaces  \n';
      cases.push({ raw: `${bom}---${opener}value: one${beforeClose}---${afterClose}${body}`,
        // The optional closing newline consumes the body's first LF when the
        // delimiter has no ending of its own (or only a CR).
        body: afterClose === '' || afterClose === '\r' ? body.slice(1) : body,
        hasFrontmatter: true });
    }
  }
  for (const { raw, body, hasFrontmatter } of cases) {
    const label = JSON.stringify(raw);
    assert.equal(frontmatterBody(raw), body, label);
    const parsed = splitFrontmatter(raw);
    assert.equal(parsed.body, body, label);
    assert.equal(parsed.hasFrontmatter, hasFrontmatter, label);
  }
});

test('#300 full frontmatter parsing still returns YAML values, alias identity and parse errors', () => {
  const body = '\n## Facts\n- kept exactly\n';
  const raw = `---\nsource: &source {value: one}\ncopy: *source\n---\n${body}`;
  const parsed = splitFrontmatter(raw);
  assert.equal(parsed.hasFrontmatter, true);
  assert.equal(Object.hasOwn(parsed, 'parseError'), false);
  assert.deepEqual(parsed.data, { source: { value: 'one' }, copy: { value: 'one' } });
  assert.equal(parsed.data.source, parsed.data.copy, 'YAML aliases keep their original identity');
  assert.equal(frontmatterBody(raw), body);
  assert.equal(parsed.body, body);

  for (const [yaml, expected] of [['null', {}], ['false', {}], ['42', 42], ['[one, two]', ['one', 'two']]]) {
    assert.deepEqual(splitFrontmatter(`---\n${yaml}\n---\n${body}`), { data: expected, body, hasFrontmatter: true });
  }
  for (const yaml of ['value: [unclosed', 'value: *missing', 'value: one\nvalue: two']) {
    const content = `---\n${yaml}\n---\n${body}`;
    const invalid = splitFrontmatter(content);
    assert.deepEqual(invalid.data, {});
    assert.equal(invalid.hasFrontmatter, true);
    assert.equal(invalid.body, body);
    assert.equal(typeof invalid.parseError, 'string');
    assert.ok(invalid.parseError.length > 0);
    assert.equal(frontmatterBody(content), body);
  }
});

test('#300 frontmatter integration: changed YAML is observed even when the Markdown body is unchanged', () => {
  const body = '## Facts\n- Identical body\n';
  const before = `---\nstatus: draft\nsource: {revision: one}\n---\n${body}`;
  const after = `---\nstatus: ready\nsource: {revision: two}\n---\n${body}`;
  for (let pass = 0; pass < 2; pass++) {
    assert.deepEqual(splitFrontmatter(before), {
      data: { status: 'draft', source: { revision: 'one' } }, body, hasFrontmatter: true,
    });
    assert.deepEqual(splitFrontmatter(after), {
      data: { status: 'ready', source: { revision: 'two' } }, body, hasFrontmatter: true,
    });
  }
});

test('#300 frontmatter integration: reused YAML preserves current body bytes and isolates returned metadata', () => {
  const yaml = 'input_id: IN-20261112-meeting-001\nsource: {values: [one, two]}';
  const bodies = ['## Facts\n- original\n', '\r\n## Facts\r\n- changed 😀  \r\n',
    '\ufeff## Facts\r- retained\r\n---\n'];
  for (const body of bodies) {
    const parsed = splitFrontmatter(`\ufeff---\n${yaml}\n---\n${body}`);
    assert.equal(parsed.body, body);
    assert.equal(parsed.hasFrontmatter, true);
    assert.deepEqual(parsed.data, yamlParse(yaml));
    parsed.data.source.values.push('caller mutation');
    parsed.data.input_id = 'changed';
  }
  assert.deepEqual(splitFrontmatter(`---\n${yaml}\n---\n${bodies[0]}`).data, yamlParse(yaml));
});

test('#300 frontmatter integration: falsy YAML and missing frontmatter keep fresh fallback objects', () => {
  for (const yaml of ['null', 'false', '0', '-0', '.nan', '""', '# empty document']) {
    const source = `---\n${yaml}\n---\nbody`;
    const first = splitFrontmatter(source);
    assert.deepEqual(first, { data: {}, body: 'body', hasFrontmatter: true });
    first.data.changed = true;
    const second = splitFrontmatter(source);
    assert.deepEqual(second, { data: {}, body: 'body', hasFrontmatter: true });
    assert.notEqual(first.data, second.data);
  }
  const first = splitFrontmatter('plain body');
  first.data.changed = true;
  assert.deepEqual(splitFrontmatter('plain body'), { data: {}, body: 'plain body', hasFrontmatter: false });
});

test('#300 frontmatter integration: warmed valid metadata cannot hide later parsing errors', () => {
  const body = '## Facts\n- still present\n';
  const valid = `---\nstatus: draft\n---\n${body}`;
  assert.deepEqual(splitFrontmatter(valid).data, { status: 'draft' });
  for (const yaml of ['status: [unclosed', 'status: one\nstatus: two', 'status: *missing']) {
    let expected;
    try { yamlParse(yaml); } catch (error) { expected = String(error.message || error); }
    assert.equal(typeof expected, 'string');
    for (let pass = 0; pass < 2; pass++) {
      assert.deepEqual(splitFrontmatter(`---\n${yaml}\n---\n${body}`), {
        data: {}, body, hasFrontmatter: true, parseError: expected,
      });
    }
  }
  assert.deepEqual(splitFrontmatter(valid), { data: { status: 'draft' }, body, hasFrontmatter: true });
});

// symlink 를 우리가 직접 만들어 macOS 가 아니어도 같은 시나리오를 재현한다.
function tmpdir(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-util-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function aliasHeavyWorkflowState(aliasCount = 101) {
  return [
    '# GENERATED FILE — DO NOT EDIT',
    '# Command: npm run workflow:state',
    'generated_at: 2026-08-07',
    'global: {}',
    'screens: {}',
    'legacy:',
    '  source: &source',
    '    path: docs/frontend-workflow/domains/example/screen-spec.md',
    '  copies:',
    ...Array.from({ length: aliasCount }, () => '    - *source'),
    '',
  ].join('\n');
}

function nestedAliasBomb(width = 101) {
  return [
    '# GENERATED FILE — DO NOT EDIT',
    '# Command: npm run workflow:state',
    'generated_at: 2026-08-07',
    'global: {}',
    'screens: {}',
    `leaf: &leaf [${Array.from({ length: width }, () => '0').join(', ')}]`,
    `branch: &branch [${Array.from({ length: width }, () => '*leaf').join(', ')}]`,
    `bomb: [${Array.from({ length: width }, () => '*branch').join(', ')}]`,
    '',
  ].join('\n');
}

// 디렉토리 symlink 생성 — win32 은 junction 을 쓰고(distribution.test.mjs 와 동일), symlink 자체가
// 불가한 플랫폼(권한 없는 CI, Windows Developer Mode off)은 이 리포의 symlinkOrSkip
// (api-manifest.test.mjs)처럼 t.skip 으로 우아하게 건너뛴다. 성공 시 true, 스킵 시 false.
function symlinkDirOrSkip(t, target, linkPath) {
  try {
    fs.symlinkSync(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
    return true;
  } catch (e) {
    if (['EACCES', 'EPERM', 'ENOSYS', 'ENOTSUP'].includes(e && e.code)) {
      t.skip(`symlink unavailable on this platform: ${e.code}`);
      return false;
    }
    throw e;
  }
}

function symlinkFileOrSkip(t, target, linkPath) {
  try {
    fs.symlinkSync(target, linkPath, 'file');
    return true;
  } catch (e) {
    if (['EACCES', 'EPERM', 'ENOSYS', 'ENOTSUP'].includes(e && e.code)) {
      t.skip(`symlink unavailable on this platform: ${e.code}`);
      return false;
    }
    throw e;
  }
}

test('emitGeneratedYaml: repeated objects are expanded without YAML anchors or aliases', () => {
  const shared = {
    path: 'docs/frontend-workflow/domains/example/screen-spec.md',
    line: 12,
  };
  const raw = emitGeneratedYaml(
    ['GENERATED FILE — DO NOT EDIT'],
    { sources: Array.from({ length: 120 }, () => shared) },
  );

  assert.doesNotMatch(raw, /&a\d+\b|\*a\d+\b/);
  const parsed = yamlParse(raw);
  assert.equal(parsed.sources.length, 120);
  assert.deepEqual(parsed.sources[0], shared);
});

test('loadGeneratedWorkflowStateOrExit: legacy generated state above the default alias limit is readable', (t) => {
  const dir = tmpdir(t);
  const file = path.join(dir, 'workflow-state.yaml');
  fs.writeFileSync(file, aliasHeavyWorkflowState(442), 'utf8');

  assert.throws(() => loadYaml(file), /Excessive alias count/);
  const state = loadGeneratedWorkflowStateOrExit(file, 'workflow-state', 'readiness');
  assert.equal(state.legacy.copies.length, 442);
  assert.deepEqual(state.legacy.copies[0], state.legacy.source);
});

test('loadYamlOrExit: policy/manifest named workflow-state.yaml cannot opt into the state fallback', (t) => {
  const dir = tmpdir(t);
  const file = path.join(dir, 'workflow-state.yaml');
  fs.writeFileSync(file, aliasHeavyWorkflowState(), 'utf8');

  for (const label of ['policy', 'manifest']) {
    const script = [
      `import { loadYamlOrExit } from ${JSON.stringify(pathToFileURL(UTIL_PATH).href)};`,
      `loadYamlOrExit(${JSON.stringify(file)}, ${JSON.stringify(label)}, 'test');`,
    ].join('\n');
    const r = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
      encoding: 'utf8',
    });
    assert.equal(r.status, 2, `${label} should keep the default alias limit`);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, new RegExp(`test: ${label} YAML 파싱 실패`));
    assert.match(r.stderr, /Excessive alias count/);
  }
});

test('loadGeneratedWorkflowStateOrExit: nested alias expansion above the finite legacy cap is rejected', (t) => {
  const dir = tmpdir(t);
  const file = path.join(dir, 'workflow-state.yaml');
  fs.writeFileSync(file, nestedAliasBomb(), 'utf8');
  const script = [
    `import { loadGeneratedWorkflowStateOrExit } from ${JSON.stringify(pathToFileURL(UTIL_PATH).href)};`,
    `loadGeneratedWorkflowStateOrExit(${JSON.stringify(file)}, 'workflow-state', 'readiness');`,
  ].join('\n');

  const r = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    encoding: 'utf8',
  });
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /readiness: workflow-state YAML 파싱 실패/);
  assert.match(r.stderr, /Excessive alias count/);
});

test('readBoundedFileDescriptor: exact-limit and empty files reach EOF without closing the descriptor', (t) => {
  const file = path.join(tmpdir(t), 'bytes.bin');
  for (const bytes of [Buffer.alloc(0), Buffer.from([0, 255, 128, 13, 10, 1])]) {
    fs.writeFileSync(file, bytes);
    const fd = fs.openSync(file, 'r');
    try {
      assert.deepEqual(readBoundedFileDescriptor(fd, { maxBytes: bytes.length, sizeHint: bytes.length }), bytes);
      assert.equal(fs.fstatSync(fd).size, bytes.length);
      assert.equal(fs.readSync(fd, Buffer.alloc(1), 0, 1, null), 0, 'the helper must observe actual EOF');
    } finally { fs.closeSync(fd); }
  }
});

test('readBoundedFileDescriptor: short reads fill one size-hinted buffer without a concat copy', (t) => {
  const file = path.join(tmpdir(t), 'short-reads.bin');
  const bytes = Buffer.from([0, 255, 128, 13, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  fs.writeFileSync(file, bytes);
  const fd = fs.openSync(file, 'r');
  const read = fs.readSync, alloc = Buffer.alloc, concat = Buffer.concat;
  const allocations = [], buffers = new Set();
  let reads = 0, concats = 0;
  t.mock.method(fs, 'readSync', function (target, buffer, offset, length, position) {
    if (target === fd) { buffers.add(buffer); reads += 1; }
    return read.call(this, target, buffer, offset, target === fd ? Math.min(length, 3) : length, position);
  });
  t.mock.method(Buffer, 'alloc', function (size, ...args) {
    allocations.push(size);
    return alloc.call(this, size, ...args);
  });
  t.mock.method(Buffer, 'concat', function (...args) { concats += 1; return concat.apply(this, args); });
  try {
    const result = readBoundedFileDescriptor(fd, { maxBytes: 1024, sizeHint: bytes.length });
    t.mock.restoreAll();
    assert.deepEqual(result, bytes);
    assert.deepEqual(allocations, [bytes.length + 1], 'a tiny file must not allocate fixed 64 KiB read/EOF buffers');
    assert.equal(buffers.size, 1, 'partial reads must keep filling the same allocation');
    assert.equal(reads, 7, 'six short reads plus the EOF probe');
    assert.equal(concats, 0, 'a healthy size hint must avoid copying all bytes at EOF');
    assert.equal(result.buffer, [...buffers][0].buffer);
  } finally { fs.closeSync(fd); }
});

test('readBoundedFileDescriptor: missing and underestimated hints still read all bounded bytes', (t) => {
  const file = path.join(tmpdir(t), 'underreported.bin');
  const bytes = Buffer.from(Array.from({ length: 2 * 64 * 1024 + 13 }, (_, i) => i % 256));
  fs.writeFileSync(file, bytes);
  for (const sizeHint of [undefined, 0, 1, 64 * 1024 - 1]) {
    const fd = fs.openSync(file, 'r');
    try {
      assert.deepEqual(readBoundedFileDescriptor(fd, { maxBytes: bytes.length, sizeHint }), bytes);
      assert.equal(fs.readSync(fd, Buffer.alloc(1), 0, 1, null), 0);
    } finally { fs.closeSync(fd); }
  }
});

test('readBoundedFileDescriptor: zero or missing size hints preserve a one-shot virtual file response', (t) => {
  const file = path.join(tmpdir(t), 'virtual.bin');
  fs.writeFileSync(file, '');
  const bytes = Buffer.from('4194304\n');
  const read = fs.readSync;
  for (const sizeHint of [undefined, 0]) {
    for (const maxBytes of [0, 3, bytes.length - 1, bytes.length, 64 * 1024 - 1, 64 * 1024, 128 * 1024]) {
      const fd = fs.openSync(file, 'r');
      const requests = [];
      // Like /proc/sys values, this response is only available on the first
      // read; a short initial request cannot recover the remainder later.
      const readMock = t.mock.method(fs, 'readSync', function (target, buffer, offset, length, position) {
        if (target !== fd) return read.call(this, target, buffer, offset, length, position);
        requests.push(length);
        return requests.length === 1 ? bytes.copy(buffer, offset, 0, length) : 0;
      });
      try {
        const result = readBoundedFileDescriptor(fd, { maxBytes, sizeHint });
        assert.deepEqual(result, bytes.length > maxBytes ? null : bytes);
        assert.equal(requests[0], Math.min(64 * 1024, maxBytes + 1));
        assert.equal(requests.length, bytes.length > maxBytes ? 1 : 2,
          'return on overflow; otherwise require the actual EOF response');
      } finally {
        readMock.mock.restore();
        fs.closeSync(fd);
      }
    }
  }
});

test('readBoundedFileDescriptor: overreported size is only a hint, never content or an overflow verdict', (t) => {
  const file = path.join(tmpdir(t), 'overreported.bin');
  const bytes = Buffer.from('actual bytes\0\xff', 'latin1');
  fs.writeFileSync(file, bytes);
  for (const sizeHint of [bytes.length + 50, Number.MAX_SAFE_INTEGER]) {
    const fd = fs.openSync(file, 'r');
    try {
      const result = readBoundedFileDescriptor(fd, { maxBytes: 64, sizeHint });
      assert.deepEqual(result, bytes, 'unused capacity must not become returned bytes');
      assert.equal(fs.fstatSync(fd).size, bytes.length);
    } finally { fs.closeSync(fd); }
  }
});

test('readBoundedFileDescriptor: overflow consumes exactly limit plus one and never concatenates', (t) => {
  const file = path.join(tmpdir(t), 'overflow.bin');
  const bytes = Buffer.from(Array.from({ length: 64 * 1024 + 32 }, (_, i) => i % 256));
  fs.writeFileSync(file, bytes);
  const read = fs.readSync;
  let activeFd = null, consumed = 0;
  t.mock.method(fs, 'readSync', function (target, ...args) {
    const count = read.call(this, target, ...args);
    if (target === activeFd) consumed += count;
    return count;
  });
  const concatMock = t.mock.method(Buffer, 'concat', () => assert.fail('overflow must return before any concat copy'));
  try {
    for (const maxBytes of [0, 7, 64 * 1024]) {
      for (const sizeHint of [0, maxBytes, maxBytes + 20]) {
        const fd = fs.openSync(file, 'r');
        activeFd = fd; consumed = 0;
        try {
          assert.equal(readBoundedFileDescriptor(fd, { maxBytes, sizeHint }), null);
          assert.equal(consumed, maxBytes + 1);
          const next = Buffer.alloc(1);
          assert.equal(read(fd, next, 0, 1, null), 1, 'overflow must leave the caller-owned descriptor open');
          assert.equal(next[0], bytes[maxBytes + 1], 'bytes beyond the overflow probe must remain unread');
        } finally { activeFd = null; fs.closeSync(fd); }
      }
    }
  } finally {
    // Node 20's recursive fs.rmSync cleanup also calls Buffer.concat, before
    // test-scoped mocks are automatically restored.
    concatMock.mock.restore();
  }
});

test('readBoundedFileDescriptor: a file growing past its original hint remains bounded', (t) => {
  const file = path.join(tmpdir(t), 'growing.bin');
  fs.writeFileSync(file, 'abc');
  const fd = fs.openSync(file, 'r');
  const read = fs.readSync;
  let grew = false, consumed = 0;
  t.mock.method(fs, 'readSync', function (target, ...args) {
    const count = read.call(this, target, ...args);
    if (target === fd) {
      consumed += count;
      if (!grew) { grew = true; fs.appendFileSync(file, 'defghijklmnop'); }
    }
    return count;
  });
  try {
    assert.equal(readBoundedFileDescriptor(fd, { maxBytes: 7, sizeHint: 3 }), null);
    assert.equal(grew, true);
    assert.equal(consumed, 8);
    assert.equal(fs.fstatSync(fd).size, 16);
  } finally { fs.closeSync(fd); }
});

test('readBoundedFileDescriptor: reads from the current offset and propagates IO errors without closing', (t) => {
  const file = path.join(tmpdir(t), 'offset.bin');
  fs.writeFileSync(file, 'skip|remaining');
  const fd = fs.openSync(file, 'r');
  try {
    fs.readSync(fd, Buffer.alloc(5), 0, 5, null);
    assert.deepEqual(readBoundedFileDescriptor(fd, { maxBytes: 9, sizeHint: 14 }), Buffer.from('remaining'));
    const failure = new Error('injected descriptor read failure');
    t.mock.method(fs, 'readSync', () => { throw failure; });
    assert.throws(() => readBoundedFileDescriptor(fd, { maxBytes: 9 }), (error) => error === failure);
    assert.equal(fs.fstatSync(fd).size, 14);
  } finally { fs.closeSync(fd); }
});

test('readBoundedFileDescriptor: rejects invalid budgets and hints before reading', (t) => {
  t.mock.method(fs, 'readSync', () => assert.fail('invalid options must not access the descriptor'));
  for (const maxBytes of [undefined, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER, '64']) {
    assert.throws(() => readBoundedFileDescriptor(0, { maxBytes }), /maxBytes and sizeHint/);
  }
  for (const sizeHint of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '64']) {
    assert.throws(() => readBoundedFileDescriptor(0, { maxBytes: 64, sizeHint }), /maxBytes and sizeHint/);
  }
});

test('removeFileIfExists: missing path is a no-op and regular file is removed', (t) => {
  const dir = tmpdir(t);
  const file = path.join(dir, 'run-report.md');
  assert.equal(removeFileIfExists(file), false);
  fs.writeFileSync(file, 'stale');
  assert.equal(removeFileIfExists(file), true);
  assert.equal(fs.existsSync(file), false);
});

test('removeFileIfExists: symlink itself is removed without following its target', (t) => {
  const dir = tmpdir(t);
  const target = path.join(dir, 'target.md');
  const link = path.join(dir, 'run-report.md');
  fs.writeFileSync(target, 'keep target');
  if (!symlinkFileOrSkip(t, target, link)) return;
  assert.equal(removeFileIfExists(link), true);
  assert.equal(fs.existsSync(link), false);
  assert.equal(fs.readFileSync(target, 'utf8'), 'keep target');
});

test('removeFileIfExists: directory removal fails and leaves the tree intact', (t) => {
  const dir = tmpdir(t);
  const destination = path.join(dir, 'run-report.md');
  const child = path.join(destination, 'child.txt');
  fs.mkdirSync(destination);
  fs.writeFileSync(child, 'keep child');
  assert.throws(() => removeFileIfExists(destination));
  assert.equal(fs.readFileSync(child, 'utf8'), 'keep child');
});

test('isCliEntry: argv[1] 이 스크립트 경로 그대로면 true', (t) => {
  const dir = tmpdir(t);
  const script = path.join(dir, 'entry.mjs');
  fs.writeFileSync(script, '');
  assert.equal(isCliEntry(pathToFileURL(script).href, script), true);
});

test('isCliEntry: argv[1] 이 symlink 경유 경로여도 realpath 가 일치하면 true', (t) => {
  const dir = tmpdir(t);
  const real = path.join(dir, 'real');
  fs.mkdirSync(real);
  const script = path.join(real, 'entry.mjs');
  fs.writeFileSync(script, '');
  const link = path.join(dir, 'link');
  if (!symlinkDirOrSkip(t, real, link)) return;
  const argv1 = path.join(link, 'entry.mjs');
  // Node 기본 동작처럼 import.meta.url 은 realpath 기준, argv[1] 은 symlink 경유.
  assert.equal(isCliEntry(pathToFileURL(script).href, argv1), true);
});

test('isCliEntry: 다른 파일·부재 파일·argv[1] 없음은 모두 false', (t) => {
  const dir = tmpdir(t);
  const script = path.join(dir, 'entry.mjs');
  const other = path.join(dir, 'other.mjs');
  fs.writeFileSync(script, '');
  fs.writeFileSync(other, '');
  assert.equal(isCliEntry(pathToFileURL(script).href, other), false);
  assert.equal(isCliEntry(pathToFileURL(script).href, path.join(dir, 'missing.mjs')), false);
  assert.equal(isCliEntry(pathToFileURL(script).href, undefined), false);
});

test('isCliEntry: 직접 실행은 true, import 로 로드하면 false (실제 Node 프로세스)', (t) => {
  const dir = tmpdir(t);
  const script = path.join(dir, 'entry.mjs');
  fs.writeFileSync(
    script,
    [
      `import { isCliEntry } from ${JSON.stringify(pathToFileURL(UTIL_PATH).href)};`,
      "process.stdout.write(String(isCliEntry(import.meta.url)));",
    ].join('\n'),
  );

  const direct = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(direct.status, 0, direct.stderr);
  assert.equal(direct.stdout, 'true', '직접 실행은 true 여야 한다');

  // import 로 로드하는 쪽: argv[1] 은 importer 스크립트 → 엔트리 판정 false.
  const importer = path.join(dir, 'importer.mjs');
  fs.writeFileSync(
    importer,
    [
      `await import(${JSON.stringify(pathToFileURL(script).href)});`,
      "process.stdout.write('|importer-done');",
    ].join('\n'),
  );
  const imported = spawnSync(process.execPath, [importer], { encoding: 'utf8' });
  assert.equal(imported.status, 0, imported.stderr);
  assert.equal(imported.stdout, 'false|importer-done');
});

test('isCliEntry: symlink 경유 직접 실행도 실제 Node 프로세스에서 true', (t) => {
  const dir = tmpdir(t);
  const real = path.join(dir, 'real');
  fs.mkdirSync(real);
  const script = path.join(real, 'entry.mjs');
  fs.writeFileSync(
    script,
    [
      `import { isCliEntry } from ${JSON.stringify(pathToFileURL(UTIL_PATH).href)};`,
      "process.stdout.write(String(isCliEntry(import.meta.url)));",
    ].join('\n'),
  );
  const link = path.join(dir, 'link');
  if (!symlinkDirOrSkip(t, real, link)) return;

  // 옛 가드가 조용히 빠지던 바로 그 경로: symlink 경유 절대경로로 직접 실행.
  const r = spawnSync(process.execPath, [path.join(link, 'entry.mjs')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'true', 'symlink 경유 직접 실행도 true 여야 한다');
});

test('createTextKeyedCache: keeps recently used text keys within the budget, never evicting the newest (#265)', () => {
  const cache = createTextKeyedCache(6);
  cache.set('aa', 1); cache.set('bb', 2); cache.set('cc', 3);
  assert.equal(cache.get('aa'), 1); // aa becomes the most recent
  cache.set('dd', 4); // 8 chars: the least recent (bb) leaves
  assert.equal(cache.get('bb'), undefined);
  assert.deepEqual([cache.get('aa'), cache.get('cc'), cache.get('dd')], [1, 3, 4]);
  const long = 'x'.repeat(10);
  cache.set(long, 5); // over the budget alone: kept, every older key leaves
  assert.equal(cache.get(long), 5);
  assert.deepEqual([cache.get('aa'), cache.get('cc'), cache.get('dd')], [undefined, undefined, undefined]);
});

test('createContentJsonCache: requires explicit positive integer limits and a string source', () => {
  for (const invalid of [undefined, 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '100']) {
    assert.throws(() => createContentJsonCache({ maxBytes: invalid, maxEntries: 1 }), RangeError);
    assert.throws(() => createContentJsonCache({ maxBytes: 256, maxEntries: invalid }), RangeError);
  }
  const cache = createContentJsonCache({ maxBytes: 1, maxEntries: 1 });
  assert.throws(() => cache.getOrCreate(null, () => null), TypeError);
  assert.throws(() => cache.getOrCreate('', null), TypeError);
  assert.equal(cache.getOrCreate('', () => null), null, 'a budget too small to admit a value still computes');
});

test('createContentJsonCache: stores JSON only and isolates nested caller mutations', () => {
  const cache = createContentJsonCache({ maxBytes: 2048, maxEntries: 4 });
  const expected = JSON.parse('{"sections":[["constructor",["original"]]],"meta":{"__proto__":{"kept":true}},"flags":[false,0,"",null]}');
  let calls = 0;
  let produced;
  const compute = () => { calls += 1; produced = structuredClone(expected); return produced; };
  const first = cache.getOrCreate('same body', compute);
  first.sections[0][1].push('poison');
  produced.meta.__proto__.kept = false;
  const second = cache.getOrCreate('same body', compute);
  assert.deepEqual(second, expected);
  assert.notEqual(first, second);
  assert.equal(Object.getPrototypeOf(second.meta), Object.prototype);
  second.flags.length = 0;
  second.sections[0][1][0] = 'poison';
  assert.deepEqual(cache.getOrCreate('same body', compute), expected);
  assert.equal(calls, 1);
});

test('createContentJsonCache: byte pressure evicts the least recently used projection', () => {
  const cache = createContentJsonCache({ maxBytes: 300, maxEntries: 10 });
  const calls = new Map();
  const read = (source) => cache.getOrCreate(source, () => {
    calls.set(source, (calls.get(source) || 0) + 1);
    return 'syntax';
  });
  // Two of these small projections fit, while a third exceeds the byte budget.
  read('a'); read('b'); read('a'); read('c'); read('a'); read('b');
  assert.deepEqual([...calls], [['a', 1], ['b', 2], ['c', 1]]);
});

test('createContentJsonCache: accounts for UTF-16 key and serialized value bytes at admission', () => {
  // One-character source: 66 key characters (length, colon, SHA-256 hex).
  // The JSON string "한" adds three characters, so the payload costs 138 bytes.
  for (const [maxBytes, expectedCalls] of [[138, 1], [137, 2]]) {
    const cache = createContentJsonCache({ maxBytes, maxEntries: 1 });
    let calls = 0;
    const compute = () => { calls += 1; return '한'; };
    assert.equal(cache.getOrCreate('a', compute), '한');
    assert.equal(cache.getOrCreate('a', compute), '한');
    assert.equal(calls, expectedCalls);
  }
});

test('createContentJsonCache: entry count limits small values independently of the byte budget', () => {
  const cache = createContentJsonCache({ maxBytes: 10000, maxEntries: 2 });
  const calls = new Map();
  const read = (source) => cache.getOrCreate(source, () => {
    calls.set(source, (calls.get(source) || 0) + 1);
    return false;
  });
  read('a'); read('b'); read('a'); read('c'); read('a'); read('b');
  assert.deepEqual([...calls], [['a', 1], ['b', 2], ['c', 1]]);
});

test('createContentJsonCache: a large source can reuse a tiny derived result', () => {
  const cache = createContentJsonCache({ maxBytes: 512, maxEntries: 2 });
  const source = `prefix ${'x'.repeat(1024 * 1024)}`;
  let calls = 0;
  const compute = () => { calls += 1; return [['facts', ['one']]]; };
  assert.deepEqual(cache.getOrCreate(source, compute), [['facts', ['one']]]);
  assert.deepEqual(cache.getOrCreate(Buffer.from(source).toString('utf8'), compute), [['facts', ['one']]]);
  assert.equal(calls, 1, 'source size must not consume the serialized-value budget');
});

test('createContentJsonCache: oversized projections stay uncached without displacing useful entries', () => {
  const cache = createContentJsonCache({ maxBytes: 512, maxEntries: 2 });
  const calls = new Map();
  const read = (source) => cache.getOrCreate(source, () => {
    calls.set(source, (calls.get(source) || 0) + 1);
    return source === 'large' ? 'x'.repeat(1000) : source;
  });
  read('a'); read('b');
  assert.equal(read('large').length, 1000);
  assert.equal(read('large').length, 1000);
  assert.deepEqual([read('a'), read('b')], ['a', 'b']);
  assert.deepEqual([...calls], [['a', 1], ['b', 1], ['large', 2]]);
});

test('createContentJsonCache: exact UTF-16 source identity preserves lone surrogates and line endings', () => {
  const cache = createContentJsonCache({ maxBytes: 10000, maxEntries: 12 });
  const sources = ['\ud800', '\ud801', '\udc00', '\ufffd', '\0', '\n', '\r', '한'];
  assert.deepEqual(Buffer.from(sources[0]), Buffer.from(sources[1]), 'UTF-8 alone would conflate distinct lone surrogates');
  let calls = 0;
  for (let pass = 0; pass < 2; pass += 1) {
    for (const source of sources) {
      assert.deepEqual(cache.getOrCreate(source, () => { calls += 1; return { source }; }), { source });
    }
  }
  assert.equal(calls, sources.length);
});

test('createContentJsonCache: computation and serialization failures are not cached or admitted', () => {
  const cache = createContentJsonCache({ maxBytes: 1024, maxEntries: 1 });
  let stableCalls = 0;
  const stable = () => { stableCalls += 1; return ['stable']; };
  cache.getOrCreate('stable', stable);
  const failure = new Error('parse failed');
  let failedComputations = 0;
  const cyclic = {}; cyclic.self = cyclic;
  let failedSerializations = 0;
  for (let pass = 0; pass < 2; pass += 1) {
    assert.throws(() => cache.getOrCreate('bad parse', () => {
      failedComputations += 1; throw failure;
    }), (error) => error === failure);
    assert.throws(() => cache.getOrCreate('bad serialization', () => {
      failedSerializations += 1; return cyclic;
    }), TypeError);
    assert.throws(() => cache.getOrCreate('no JSON data', () => undefined), /must be JSON data/);
    assert.deepEqual(cache.getOrCreate('stable', stable), ['stable']);
  }
  assert.equal(failedComputations, 2);
  assert.equal(failedSerializations, 2);
  assert.equal(stableCalls, 1);
  assert.deepEqual(cache.getOrCreate('bad parse', () => ['recovered']), ['recovered']);
  assert.deepEqual(cache.getOrCreate('bad parse', () => assert.fail('successful retry should now be cached')), ['recovered']);
});

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
import { isCliEntry, removeFileIfExists } from './util.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UTIL_PATH = path.join(HERE, 'util.mjs');

// symlink 를 우리가 직접 만들어 macOS 가 아니어도 같은 시나리오를 재현한다.
function tmpdir(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-util-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
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

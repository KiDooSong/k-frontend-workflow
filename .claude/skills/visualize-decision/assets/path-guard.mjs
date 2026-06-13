// 경로 가드 (build.mjs · serve.mjs 공유) — 읽기 전용 불변식을 엔진이 구조적으로 강제한다.
//
// 데이터(.json)/산출물(.html) 경로는 모두 다음을 만족해야 한다:
//   (a) realpath 로 정규화했을 때 저장소(cwd) 안에 있다 — symlink/junction 으로 밖으로 새지 못함.
//   (b) 그 부모 디렉터리가 (i) 엔진 `examples/` 직속(자체 검증·카탈로그) 또는
//       (ii) `.../docs/frontend-workflow/_viz`(스킬 산출물 — 중첩 프로젝트 docs 트리도 허용) 이다.
//   (c) 확장자가 허용 목록에 있다.
// → 엔진 소스(decision.template.html 등)·소스 문서·앱 코드·임의 `_viz` 디렉터리는 R/W 불가.
import fs from 'node:fs';
import path from 'node:path';

// 존재하는 가장 가까운 조상을 realpath 로 정규화한 뒤, 아직 없는 꼬리 세그먼트를 재결합한다.
// (산출물 파일은 아직 없을 수 있으나, 조상의 symlink 는 반드시 해석해야 이탈을 막는다.)
export function realpathSafe(p) {
  const missing = [];
  let cur = path.resolve(p);
  for (;;) {
    try { return path.join(fs.realpathSync.native(cur), ...missing); }
    catch (e) {
      if (e.code !== 'ENOENT') throw e;
      const parent = path.dirname(cur);
      if (parent === cur) throw new Error(`경로 해석 실패: ${p}`);
      missing.unshift(path.basename(cur));
      cur = parent;
    }
  }
}

const isInside = (base, target) => target === base || target.startsWith(base + path.sep);

// 산출 영역을 경유하면 안 되는 디렉터리 세그먼트(중첩 docs 트리 허용의 부작용 차단).
const DENY_SEGMENTS = new Set(['node_modules', '.git']);

// root(=저장소 루트), here(=엔진 폴더) 를 고정한 가드를 만든다. { safePath, realDirInZone } 반환.
export function makeGuard(root, here) {
  const realRoot = fs.realpathSync.native(root);
  const examplesDir = path.join(here, 'examples');
  const realExamples = fs.existsSync(examplesDir) ? fs.realpathSync.native(examplesDir) : examplesDir;

  // 디렉터리가 허용 산출 영역인가: realRoot 안 + (엔진 examples/ 직속 | .../docs/frontend-workflow/_viz),
  // 단 node_modules/.git 경유는 거부.
  function dirInZone(dir) {
    if (!isInside(realRoot, dir)) return false;
    const seg = dir.split(path.sep).map(s => s.toLowerCase());
    if (seg.some(s => DENY_SEGMENTS.has(s))) return false;
    if (dir === realExamples) return true;                              // 엔진 examples/ 직속
    return seg.length >= 3                                              // .../docs/frontend-workflow/_viz
      && seg[seg.length - 1] === '_viz'
      && seg[seg.length - 2] === 'frontend-workflow'
      && seg[seg.length - 3] === 'docs';
  }

  // 문자열 경로 1차 가드(I/O 전). 존재 조상을 realpath 로 정규화한 절대경로를 돌려준다.
  function safePath(p, exts) {
    if (typeof p !== 'string' || p.length === 0) throw new Error('빈 경로');
    const abs = realpathSafe(path.resolve(root, p));
    if (exts && !exts.includes(path.extname(abs).toLowerCase())) throw new Error(`확장자 거부(${exts.join('/')}): ${p}`);
    if (!isInside(realRoot, abs)) throw new Error(`경로 이탈 거부(저장소 밖): ${p}`);
    if (!dirInZone(path.dirname(abs))) throw new Error(`경로 거부(examples/ 또는 docs/frontend-workflow/_viz/ 안에서만 허용): ${p}`);
    return abs;
  }

  // TOCTOU 완화: 이미 존재하는 디렉터리를 realpath 로 재해석해 여전히 허용 영역인지 확인하고 canonical 경로를 돌려준다.
  // (요청 간/검증 전 symlink·junction 교체를 차단하고 write 직전 race window 를 축소 — 완전 제거는 Node 의 openat 부재로 불가.)
  function realDirInZone(dir) {
    const real = fs.realpathSync.native(dir);
    if (!dirInZone(real)) throw new Error(`경로 거부(symlink 등으로 허용 영역 밖): ${dir}`);
    return real;
  }

  return { safePath, realDirInZone };
}

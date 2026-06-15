// scripts/adapters/routers/expo-router.mjs — 내장 router 어댑터: Expo Router src/app 파일트리 발견(discovery).
//
// 경계(temp/proposals/tier2-router-codegen-adapter.md §6, customizable-architecture/tier2-router-adapter.md:151-163):
//   어댑터는 *발견(discovery)* 만 한다 — 파일트리를 스캔해 노드 트리를 반환할 뿐, 정규화/정렬/렌더/쓰기/결정성은
//   route-core 가 독점한다. 어댑터는 파일을 쓰지 않는다.
//
// 이 어댑터의 discover() 는 이전 scripts/lib/route-tree.mjs 의 scanAppDir 과 *동치*다 — 그래서
// route-core 로 렌더한 route-tree.txt 가 기존 골든(examples/route-tree/{basic-app,edge-cases})과 byte-identical 하다.
import fs from 'node:fs';
import path from 'node:path';

// route 를 갖는 화면 파일로 인정할 확장자 (Expo Router)
const ROUTE_EXTS = ['.tsx', '.ts', '.jsx', '.js'];

// 파일명이 route 를 갖는 화면 파일인지 (_layout 은 레이아웃 마커라 제외).
function isScreenFile(name) {
  const ext = path.extname(name);
  if (!ROUTE_EXTS.includes(ext)) return false;
  const base = name.slice(0, name.length - ext.length);
  return base !== '_layout';
}

// 디렉토리 세그먼트 배열 + 파일명 → route 문자열.
//   index.<ext>          → 디렉토리 route (루트면 '/')
//   <name>.<ext>         → 디렉토리 route + '/' + name
//   route 그룹 (tabs) 등  → 세그먼트 그대로 유지 (정규화하지 않는다)
//   동적 세그먼트 [id]    → 그대로 유지
export function computeRoute(dirSegments, fileName) {
  const ext = path.extname(fileName);
  const base = fileName.slice(0, fileName.length - ext.length);
  const segs = dirSegments.slice();
  if (base !== 'index') segs.push(base);
  return '/' + segs.join('/');
}

// app 디렉토리를 재귀 스캔해 결정적으로 정렬된 트리(children 배열)를 만든다.
// 노드: { name, isDir, children?, route? }
// 정렬: 파일 먼저(이름 오름차순) → 디렉토리(이름 오름차순). 기본 .sort() = UTF-16 코드유닛(로케일 비의존).
export function scanAppDir(appDir) {
  function walk(absDir, dirSegments) {
    let entries;
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      entries = [];
    }
    const files = [];
    const dirs = [];
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      if (e.isDirectory()) dirs.push(e.name);
      else if (e.isFile()) files.push(e.name);
    }
    files.sort();
    dirs.sort();
    const children = [];
    for (const name of files) {
      const node = { name, isDir: false };
      if (isScreenFile(name)) node.route = computeRoute(dirSegments, name);
      children.push(node);
    }
    for (const name of dirs) {
      children.push({
        name,
        isDir: true,
        children: walk(path.join(absDir, name), dirSegments.concat(name)),
      });
    }
    return children;
  }
  return walk(appDir, []);
}

// RouterAdapter 계약: { name, version, discover(ctx) }.
//   ctx.appDir : 스캔할 라우트 엔트리 디렉토리(CLI 가 --app 에서 해석해 절대경로로 준다).
//   반환       : 코어가 렌더할 노드 트리(children 배열). 파일 쓰기·정렬·렌더는 하지 않는다.
export const name = 'expo-router';
export const version = 1;
export function discover(ctx) {
  return scanAppDir((ctx && ctx.appDir) || 'src/app');
}

export default { name, version, discover };

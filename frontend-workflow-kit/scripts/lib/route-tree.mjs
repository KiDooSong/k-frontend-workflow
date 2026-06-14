// route-tree 생성기의 순수 로직 — Expo Router src/app 파일 트리를 스캔해
// 결정적(deterministic) route-tree 텍스트로 렌더링한다.
// 정본(source of truth)은 src/app 파일 트리다. ScreenSpec frontmatter.route 는 입력이 아니다(교차검증은 후속 PR).
import fs from 'node:fs';
import path from 'node:path';

// route 를 갖는 화면 파일로 인정할 확장자 (Expo Router)
const ROUTE_EXTS = ['.tsx', '.ts', '.jsx', '.js'];

// route 주석을 정렬해 붙이기 시작하는 고정 컬럼 (결정적 출력용)
export const ROUTE_COL = 37;

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

// children 배열을 박스드로잉 트리 라인들로 렌더링한다 (out 배열에 push).
//   연결자: 마지막 '└─ ', 그 외 '├─ '
//   상위 들여쓰기: 형제가 더 있으면 '│  ', 없으면 '   '
//   디렉토리는 끝에 '/', 화면 파일은 ROUTE_COL 정렬 후 'route: <route>'
function renderChildren(children, prefix, out) {
  children.forEach((node, i) => {
    const last = i === children.length - 1;
    const connector = last ? '└─ ' : '├─ ';
    const label = node.isDir ? node.name + '/' : node.name;
    let line = prefix + connector + label;
    if (!node.isDir && node.route) {
      const pad = line.length < ROUTE_COL ? ' '.repeat(ROUTE_COL - line.length) : '  ';
      line = line + pad + 'route: ' + node.route;
    }
    out.push(line);
    if (node.isDir && node.children && node.children.length) {
      renderChildren(node.children, prefix + (last ? '   ' : '│  '), out);
    }
  });
}

// 트리를 GENERATED 헤더 + 박스드로잉 본문 텍스트로 렌더링한다. 결정적(타임스탬프 없음).
export function renderRouteTree(children, opts) {
  const source = (opts && opts.source) || 'src/app/**';
  const command =
    (opts && opts.command) ||
    'node scripts/route-tree.mjs --app src/app --out docs/frontend-workflow/_meta/route-tree.txt';
  const out = [];
  out.push('# GENERATED FILE — DO NOT EDIT');
  out.push('# Source: ' + source);
  out.push('# Command: ' + command);
  out.push('');
  out.push('/');
  renderChildren(children, '', out);
  return out.join('\n') + '\n';
}

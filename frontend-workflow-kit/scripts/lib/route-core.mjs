// scripts/lib/route-core.mjs — route-tree 의 framework-무관 결정성 코어 + router 어댑터 로더.
//
// 경계(temp/proposals/tier2-router-codegen-adapter.md §5·§6, customizable-architecture/tier2-router-adapter.md:151-163):
//   어댑터 = 발견(discover) 만. 코어 = 정규화/정렬/렌더/쓰기/결정성 독점. 어댑터는 파일을 쓰지 않는다.
//   기본 expo-router 어댑터의 discover() 는 이전 scanAppDir 과 동치라 route-tree.txt 골든이 byte-identical 하다.
//
// 이 모듈은 (1) renderRouteTree — 무타임스탬프 결정적 박스드로잉 렌더(이전 lib/route-tree.mjs 에서 이관),
//          (2) loadRouterAdapter — 이름(매니페스트)·{module}·어댑터객체를 해소하고 version 을 검사하는 로더.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// 코어가 받아들이는 router 어댑터 계약 버전. 어댑터 version 이 이와 다르면 fail-closed(FC-3).
export const CORE_ROUTER_ADAPTER_VERSION = 1;

// route 주석을 정렬해 붙이기 시작하는 고정 컬럼 (결정적 출력용)
export const ROUTE_COL = 37;

const HERE = path.dirname(fileURLToPath(import.meta.url)); // scripts/lib
// 내장 어댑터 등록 매니페스트 위치(scripts/adapters/routers/manifest.json). 새 어댑터 = 매니페스트 1줄 + 모듈 1개.
const DEFAULT_ADAPTERS_DIR = path.resolve(HERE, '..', 'adapters', 'routers');

// 어댑터 해소/로드 오류 — CLI 가 exit 2(fail-closed)로 처리한다(조용한 폴백·추측 금지, FC-1/2/3).
export class RouterAdapterError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RouterAdapterError';
  }
}

function readAdapterManifest(adaptersDir) {
  const p = path.join(adaptersDir, 'manifest.json');
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch {
    throw new RouterAdapterError(`router 어댑터 매니페스트를 읽을 수 없음: ${p}`);
  }
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      throw new Error('매핑(객체) 아님');
    }
    return obj;
  } catch (e) {
    throw new RouterAdapterError(`router 어댑터 매니페스트 JSON 파싱 실패(${p}): ${e.message}`);
  }
}

// router 어댑터를 해소한다.
//   spec : 문자열(내장 어댑터 이름, 매니페스트 조회) | { module } (커스텀 모듈 경로) | 어댑터 객체(이미 로드됨).
//   opts : { adaptersDir?(매니페스트 디렉토리 오버라이드), baseDir?(상대 {module} 해석 기준) }
// fail-closed: 미지 이름(FC-1)·부재/로드실패 모듈(FC-2)·discover 부재·version 불일치(FC-3) → RouterAdapterError throw.
//   (조용히 expo-router 로 폴백하거나 빈 트리를 추측하지 않는다.)
export async function loadRouterAdapter(spec, opts = {}) {
  const adaptersDir = opts.adaptersDir || DEFAULT_ADAPTERS_DIR;
  let adapter;

  if (spec && typeof spec === 'object' && typeof spec.discover === 'function') {
    adapter = spec; // 이미 어댑터 객체
  } else {
    let modulePath;
    if (typeof spec === 'string') {
      const manifest = readAdapterManifest(adaptersDir);
      const entry = manifest[spec];
      if (!entry || typeof entry.module !== 'string') {
        const known = Object.keys(manifest).join(', ') || '(없음)';
        throw new RouterAdapterError(`알 수 없는 router 어댑터: '${spec}' (등록된 어댑터: ${known})`);
      }
      modulePath = path.resolve(adaptersDir, entry.module);
    } else if (spec && typeof spec === 'object' && typeof spec.module === 'string') {
      modulePath = path.isAbsolute(spec.module)
        ? spec.module
        : path.resolve(opts.baseDir || process.cwd(), spec.module);
    } else {
      throw new RouterAdapterError(`router 어댑터 지정이 잘못됨: ${JSON.stringify(spec)} (이름 문자열 | {module} | 어댑터 객체)`);
    }

    if (!fs.existsSync(modulePath)) {
      throw new RouterAdapterError(`router 어댑터 모듈을 찾을 수 없음: ${modulePath}`);
    }
    let mod;
    try {
      mod = await import(pathToFileURL(modulePath).href);
    } catch (e) {
      throw new RouterAdapterError(`router 어댑터 로드 실패(${modulePath}): ${e.message}`);
    }
    adapter = mod.default || mod.adapter || mod;
  }

  if (!adapter || typeof adapter.discover !== 'function') {
    throw new RouterAdapterError('router 어댑터에 discover(ctx) 함수가 없음');
  }
  if (adapter.version !== CORE_ROUTER_ADAPTER_VERSION) {
    throw new RouterAdapterError(
      `router 어댑터 version=${adapter.version} 이 코어 호환 버전(${CORE_ROUTER_ADAPTER_VERSION})과 다름 — 어댑터/코어 버전을 맞추세요`,
    );
  }
  return adapter;
}

// 결정성 정규화 — 어댑터가 어떤 순서로 발견하든 코어가 결정적 순서로 정렬한다(어댑터=발견, 코어=결정성).
//   정렬: 파일 먼저(isDir=false) → 디렉토리, 각 그룹은 이름 UTF-16 코드유닛 오름차순(이전 scanAppDir 와 동일 규약).
//   이미 그 순서인 expo-router 입력에는 no-op → route-tree.txt 골든 byte-identical.
// 코어가 정렬을 소유하므로 비결정적(미정렬) 어댑터도 결정적 출력을 낸다(determinism 단일 출처).
export function normalizeRouteTree(children) {
  if (!Array.isArray(children)) return [];
  const sorted = children.slice().sort((a, b) => {
    if (!!a.isDir !== !!b.isDir) return a.isDir ? 1 : -1; // 파일 먼저, 디렉토리 나중
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; // UTF-16 코드유닛(scanAppDir 의 .sort() 와 동일)
  });
  return sorted.map((node) =>
    node.isDir && Array.isArray(node.children)
      ? { ...node, children: normalizeRouteTree(node.children) }
      : node,
  );
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

// 트리(children 배열)를 GENERATED 헤더 + 박스드로잉 본문 텍스트로 렌더링한다. 결정적(타임스탬프 없음).
// 코어가 입력 트리를 normalizeRouteTree 로 먼저 정렬한다 — 어댑터 발견 순서와 무관히 결정적 출력 보장.
export function renderRouteTree(children, opts) {
  const source = (opts && opts.source) || 'src/app/**';
  const command =
    (opts && opts.command) ||
    'node scripts/route-tree.mjs --app src/app --out docs/frontend-workflow/_meta/route-tree.txt';
  const normalized = normalizeRouteTree(children || []);
  const out = [];
  out.push('# GENERATED FILE — DO NOT EDIT');
  out.push('# Source: ' + source);
  out.push('# Command: ' + command);
  out.push('');
  out.push('/');
  renderChildren(normalized, '', out);
  return out.join('\n') + '\n';
}

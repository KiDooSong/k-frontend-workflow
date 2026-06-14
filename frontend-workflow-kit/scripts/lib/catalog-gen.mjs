// catalog-gen.mjs (lib) — component-catalog 모델 빌더 + 렌더러 (읽기 전용 스캔, 쓰기는 CLI 가).
// 정본(source of truth)은 src/components/ui/** 파일 트리다 (catalog/artifact-manifest.yaml:183-184).
//
// v1 식별 규칙 (source-contract §2): 경로(components/ui/**) ∩ 파일 basename PascalCase ∩ 동명 named
// export(plain `export function`/`export const`). 다음은 의도적으로 제외한다:
//   - default export (라우트/스크린 관용) — §2
//   - memo/forwardRef 래퍼 (display-name 비결정성, §7.4(d)/OD-5)
//   - co-located *.styles / *.test / *.stories / *.d (basename 에 '.' 잔존) — §2
//   - 비-PascalCase basename (index, queryKeys, utils 등) — §2
//   - components/ui/ 밖 파일 (features/<domain>/components·screens 등) — §1 스코프
//
// props/docgen/NativeWind/style 분석은 후속 phase (이 skeleton 의 비목표, §3).
// 결정성 계약 (§7.4): 무타임스탬프 · plain 코드유닛 정렬 · posix 상대경로 · prettier 미사용.
//
// 참고: frontend-workflow-kit/temp/proposals/component-catalog-generation-source-contract.md
import path from 'node:path';
import { walkFiles, readFileSafe } from './util.mjs';

const SCAN_EXTS = ['.tsx', '.ts'];
// 스코프 가드 — 이 세그먼트를 포함하는 파일만 후보 (features/<domain>/components·screens 배제).
// --src 가 넓은 src 루트를 가리켜도 components/ui 밖은 걸러진다.
const UI_MARKER = '/components/ui/';
const PASCAL_RE = /^[A-Z][A-Za-z0-9]*$/;

// 임의 경로를 posix 슬래시로 정규화한다 (Windows 백슬래시 → '/'). 출력 경로 결정성용 (§7.4(f)).
function toPosix(p) {
  return p.replace(/\\/g, '/');
}

// 한 후보 파일이 v1 카탈로그 컴포넌트인지 판정한다.
//   반환: { name, source_path, export_kind, status } | null (비-컴포넌트)
// content 는 파일 본문(없으면 빈 문자열로 취급). IO 는 호출부가 한다(이 함수는 순수).
export function classifyComponentFile(absFile, content) {
  const posixAbs = toPosix(absFile);
  const idx = posixAbs.indexOf(UI_MARKER);
  if (idx === -1) return null; // components/ui/ 밖 → 제외 (§1 스코프)

  const ext = path.extname(absFile);
  if (!SCAN_EXTS.includes(ext)) return null;
  const base = path.basename(absFile, ext);

  // co-located *.styles.ts / *.test.tsx / *.stories.tsx / *.d.ts → basename 에 '.' 잔존 → 제외 (§2).
  if (base.includes('.')) return null;
  // PascalCase basename 만 후보 (index, queryKeys, utils 등 제외) (§2).
  if (!PASCAL_RE.test(base)) return null;

  // base 는 PascalCase 라 정규식 메타문자가 없다 → 그대로 보간 안전.
  const src = content || '';
  // memo/forwardRef 래퍼 → 제외 (v1 plain 선언만, §7.4(d)/OD-5). RHS 가 다음 줄에 와도
  // (`export const X =` 다음 줄 `  forwardRef(...)`) `=\s*` 의 \s 가 개행을 포함하므로 잡힌다.
  // 한계(v1 heuristic): `= /* @__PURE__ */ React.memo(…)` 처럼 주석이 끼거나 `= (React.memo)(…)`
  // 처럼 괄호로 감싼 표기는 못 잡아 false-include 될 수 있다(실트리엔 0건, 견고한 파싱은 후속 §3).
  const wrapRe = new RegExp(
    `^\\s*export\\s+const\\s+${base}\\b[^\\n]*=\\s*(?:React\\.)?(?:memo|forwardRef)\\b`,
    'm',
  );
  if (wrapRe.test(src)) return null;

  // 동명 named export(plain 함수 또는 const). `export default function <base>` 는 'export' 와
  // 'function' 사이의 'default' 때문에 매칭되지 않아 자연히 제외된다 (§2).
  // NOTE(v1 heuristic): 정규식 기반(AST 미사용, §3)이라 column-0 블록주석 `/* … export function <base> … */`
  // 안의 주석처리된 export 는 false-include 될 수 있다. 현재 실트리엔 0건이며, line/JSDoc 주석(`//`·` *`)은
  // `^\s*export` 앵커로 자연 배제된다. 견고한 파싱(주석 strip/AST)은 후속 phase 로 미룬다.
  const fnRe = new RegExp(`^\\s*export\\s+(?:async\\s+)?function\\s+${base}\\b`, 'm');
  const constRe = new RegExp(`^\\s*export\\s+const\\s+${base}\\b`, 'm');
  if (!fnRe.test(src) && !constRe.test(src)) return null;

  // source_path: 정본 글롭 기준 posix 상대경로 — 매니페스트 source(src/components/ui/**)와 일치.
  // --src 가 어디를 가리키든 첫 `/components/ui/` 세그먼트부터 앵커링해 결정적·이식적 경로를 낸다.
  // (전제: --src 아래 ui 루트는 하나 — v1 단일루트 계약. 여러 ui 루트를 한 번에 스캔하면 동일 상대경로 충돌 가능.)
  const rest = posixAbs.slice(idx + UI_MARKER.length); // 'Button.tsx' | 'forms/Field.tsx'
  const source_path = 'src/components/ui/' + rest;

  // v1 4필드만. export_kind 는 현재 항상 'named'(default 미수집), status 는 추출상태 'ok' (OD-2).
  return { name: base, source_path, export_kind: 'named', status: 'ok' };
}

// 정렬: (source_path, name) 튜플 비교 — plain 코드유닛 순서(route-tree 의 plain .sort() 관례, §7.4(b)).
// 매직 구분자 없이 필드별로 비교해 결정적 total order 를 만든다. source_path 는 파일당 유일하므로
// 실제 동률은 없지만, 안정 정렬(Array.prototype.sort)로 어떤 입력 순서에도 출력이 결정적이다.
function compareComponents(a, b) {
  if (a.source_path !== b.source_path) return a.source_path < b.source_path ? -1 : 1;
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  return 0;
}

// 순수 빌더: src 디렉토리를 스캔해 { components } 모델을 만든다. 직렬화/쓰기는 CLI 가 한다.
//   components: [{ name, source_path, export_kind, status }] — (source_path, name) 안정 정렬.
export function buildCatalog({ src }) {
  const root = path.resolve(src);
  const files = walkFiles(root, SCAN_EXTS); // 정렬된 절대경로(node_modules/dot 디렉토리 스킵)
  const components = [];
  for (const f of files) {
    const c = classifyComponentFile(f, readFileSafe(f));
    if (c) components.push(c);
  }
  components.sort(compareComponents);
  return { components };
}

// 생성물 헤더(H1 em-dash 마커) + ## Components 테이블을 결정적 Markdown 문자열로 렌더링한다.
// validate 검사 6 이 /GENERATED FILE\s+—\s+DO NOT EDIT/(em-dash) 를 grep 하므로 마커 글자 고정.
// Command 는 동작하는 직접 node 호출(존재하지 않는 npm alias 아님, §A.3). 무타임스탬프(§7.4(a)).
// 본문은 명시적 '\n' join + 단일 trailing newline (prettier 미사용, §7.4(e)).
// NOTE(header): H1 마커는 사용자 PR-4 동결 포맷을 따른다. contract §4 는 HTML-comment 블록 헤더(on-disk
//       `#` 미사용)를 권고하므로, 이 헤더 형태(H1 vs HTML-comment)는 PR-4 포맷 동결 시 최종 확정 대상이다.
export function renderCatalog(model) {
  const out = [];
  out.push('# GENERATED FILE — DO NOT EDIT');
  out.push('<!-- Source: src/components/ui/** -->');
  out.push(
    '<!-- Command: node scripts/catalog-gen.mjs --src src/components/ui --out docs/frontend-workflow/design/component-catalog.md -->',
  );
  out.push('');
  out.push('## Components');
  out.push('');
  out.push('| Name | Source Path | Export Kind | Status |');
  out.push('| --- | --- | --- | --- |');
  for (const c of model.components) {
    out.push(`| ${c.name} | ${c.source_path} | ${c.export_kind} | ${c.status} |`);
  }
  return out.join('\n') + '\n';
}

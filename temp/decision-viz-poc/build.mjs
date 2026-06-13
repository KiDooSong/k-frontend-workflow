// 조립 스크립트 (아키텍처 B 미리보기)
// 엔진 템플릿 + 결정 데이터 JSON → 자기완결형 단일 HTML.
// LLM 은 데이터 JSON 만 만들면 되고, 엔진(CSS+JS)은 한 번 고정된 채 재사용된다.
//
// 사용:  node build.mjs [data.json] [out.html] [--all]
//   기본:   node build.mjs decision-D-001.data.json decision-D-001.html
//   카탈로그: node build.mjs decision-D-001.data.json decision-D-001.catalog.html --all
//             (--all = views 를 무시하고 전체 뷰 렌더)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// CLI 인자 경로가 작업 폴더(here) 밖으로 새지 않도록 (../ 이탈·임의 파일 R/W 차단)
function safeInside(base, p, exts) {
  const r = path.resolve(base, p);
  if (r !== path.resolve(base) && !r.startsWith(path.resolve(base) + path.sep)) throw new Error(`경로 이탈 거부: ${p}`);
  if (exts && !exts.includes(path.extname(r).toLowerCase())) throw new Error(`확장자 거부(${exts.join('/')}): ${p}`);
  return r;
}
const argv = process.argv.slice(2);
const flags = argv.filter(a => a.startsWith('--'));
const pos = argv.filter(a => !a.startsWith('--'));
const dataFile = pos[0] || 'decision-D-001.data.json';
const outFile  = pos[1] || dataFile.replace(/\.data\.json$/, '.html').replace(/\.json$/, '.html');
const forceAll = flags.includes('--all') || flags.includes('--catalog');

const TPL = path.join(here, 'decision.template.html');
const SCHEMA = path.join(here, 'decision-data.schema.json');
const PLACEHOLDER = '__VIZ_DATA__';

const tpl = fs.readFileSync(TPL, 'utf8');
const dataRaw = fs.readFileSync(safeInside(here, dataFile, ['.json']), 'utf8');

let data;
try { data = JSON.parse(dataRaw); }
catch (e) { console.error('✗ data JSON 파싱 실패:', e.message); process.exit(1); }

// ---- 스키마 검증 (정본 decision-data.schema.json 의 required/enum 을 그대로 사용) ----
const schema = JSON.parse(fs.readFileSync(SCHEMA, 'utf8'));
function validate(d) {
  const errs = [];
  const need = (obj, keys, where) => {
    if (typeof obj !== 'object' || obj === null) { (keys || []).forEach(k => errs.push(`${where} 누락: ${k}`)); return; }
    (keys || []).forEach(k => { if (!(k in obj)) errs.push(`${where} 누락: ${k}`); });
  };
  need(d, schema.required, 'top-level');
  need(d.meta, schema.properties.meta.required, 'meta');
  if (typeof d.base !== 'string') errs.push('base 는 string');
  if (!Array.isArray(d.options) || d.options.length === 0) errs.push('options 가 비어있음');
  else {
    const oreq = schema.properties.options.items.required;
    d.options.forEach((o, i) => need(o, oreq, `options[${i}]`));
  }
  if (!Array.isArray(d.criteria)) errs.push('criteria 가 배열이 아님');
  // 뷰 키 유효성
  const allowed = schema.$defs.viewKey.enum;
  if (Array.isArray(d.views)) d.views.forEach(v => { if (!allowed.includes(v)) errs.push(`views 알 수 없는 키: ${v}`); });
  else if (d.views != null && d.views !== 'all') errs.push(`views 는 "all" 또는 배열이어야 함`);
  // 키 정합: criteria.t / journey.sat 의 키가 options.key 와 일치하는지
  const okeys = new Set((d.options || []).map(o => o.key));
  if ((d.options || []).length !== okeys.size) errs.push(`options[].key 가 중복됨 — 고유해야 함`);
  (d.criteria || []).forEach((r, i) => {
    if (!r || typeof r.k !== 'string') errs.push(`criteria[${i}].k 누락`);
    if (!r || typeof r.t !== 'object' || r.t === null) errs.push(`criteria[${i}].t 누락(객체여야 함)`);
    else Object.keys(r.t).forEach(k => { if (!okeys.has(k)) errs.push(`criteria[${i}].t 의 키 '${k}' 가 options.key 에 없음`); });
  });
  if (d.journey && d.journey.sat) Object.keys(d.journey.sat).forEach(k => { if (!okeys.has(k)) errs.push(`journey.sat 의 키 '${k}' 가 options.key 에 없음`); });
  if (d.gate != null) {
    if (typeof d.gate !== 'object' || Array.isArray(d.gate)) errs.push(`gate 는 object`);
    else {
      if (d.gate.decision && !['visualize', 'skip'].includes(d.gate.decision)) errs.push(`gate.decision 은 visualize|skip`);
      if ('trigger' in d.gate) {
        if (!Array.isArray(d.gate.trigger)) errs.push(`gate.trigger 는 배열`);
        else d.gate.trigger.forEach((t, i) => { if (typeof t !== 'object' || t === null || typeof t.label !== 'string' || typeof t.met !== 'boolean') errs.push(`gate.trigger[${i}] 는 {label:string, met:boolean}`); });
      }
    }
  }
  // 모든 criteria[].t 가 모든 옵션 key 를 포함하는지 (matrix 렌더 undefined.replace 방지)
  (d.criteria || []).forEach((r, i) => (d.options || []).forEach(o => { if (r.t && !(o.key in r.t)) errs.push(`criteria[${i}].t 에 옵션 '${o.key}' 누락`); }));
  // stars 는 0–3 정수 (repeat 크래시·aria-label 오염 방지)
  (d.options || []).forEach((o, i) => { if (!Number.isInteger(o.stars) || o.stars < 0 || o.stars > 3) errs.push(`options[${i}].stars 는 0–3 정수`); });
  // 옵션 필드 타입/범위 (presence 는 위 need() 가, 여기서는 타입과 schema 범위 — 잘못된 입력이 truthy·.map 크래시·무음 clamp 되는 것 방지)
  const isStr = v => typeof v === 'string';
  const inRange = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;
  (d.options || []).forEach((o, i) => {
    ['key', 'name', 'code', 'tag', 'why', 'risk', 'blk', 'branch', 'after'].forEach(k => { if (!isStr(o[k])) errs.push(`options[${i}].${k} 는 string`); });
    if (typeof o.recommend !== 'boolean') errs.push(`options[${i}].recommend 는 boolean`);
    ['pros', 'cons', 'changes'].forEach(k => { if (!(Array.isArray(o[k]) && o[k].every(isStr))) errs.push(`options[${i}].${k} 는 string[]`); });
    if ('value' in o && !inRange(o.value, 0, 10)) errs.push(`options[${i}].value 는 0–10`);
    if ('effort' in o && !inRange(o.effort, 0, 10)) errs.push(`options[${i}].effort 는 0–10`);
    if ('scores' in o && o.scores) Object.entries(o.scores).forEach(([ax, v]) => { if (!inRange(v, 0, 10)) errs.push(`options[${i}].scores['${ax}'] 는 0–10`); });
    if ('preview' in o && o.preview != null) {
      const p = o.preview;
      if (typeof p !== 'object' || p === null || Array.isArray(p)) errs.push(`options[${i}].preview 는 object`);
      else {
        if ('headline' in p && !isStr(p.headline)) errs.push(`options[${i}].preview.headline 는 string`);
        ['bullets', 'unknowns'].forEach(k => { if (k in p && !(Array.isArray(p[k]) && p[k].every(isStr))) errs.push(`options[${i}].preview.${k} 는 string[]`); });
      }
    }
  });
  // views 배열은 비어있지 않고 중복 없음
  if (Array.isArray(d.views)) {
    if (d.views.length === 0) errs.push(`views 빈 배열 불가 — 생략하거나 "all"`);
    if (new Set(d.views).size !== d.views.length) errs.push(`views 에 중복 항목`);
  }
  // journey 데이터 정합성 — 뷰 선택과 무관하게 데이터가 존재하면 항상 검증(sat 키·길이·범위·diverge)
  if (d.journey && Array.isArray(d.journey.steps)) {
    const n = d.journey.steps.length;
    (d.options || []).forEach(o => { const a = d.journey.sat && d.journey.sat[o.key];
      if (!Array.isArray(a)) errs.push(`journey.sat['${o.key}'] 누락`);
      else { if (a.length !== n) errs.push(`journey.sat['${o.key}'] 길이 ${a.length} ≠ steps ${n}`);
        a.forEach(v => { if (!inRange(v, 1, 5)) errs.push(`journey.sat['${o.key}'] 값은 1–5`); }); } });
    if (d.journey.diverge != null && (!Number.isInteger(d.journey.diverge) || d.journey.diverge < 0 || d.journey.diverge > n - 1)) errs.push(`journey.diverge 는 0–${n - 1} 정수`);
  }
  // 선택된 뷰 ↔ 필요 데이터 교차 검사 (뷰는 켰는데 데이터가 없어 런타임 크래시 나는 것 차단)
  // gate.decision==="skip" 이면 어떤 뷰도 그리지 않으므로 데이터 요건 면제.
  if (!(d.gate && d.gate.decision === 'skip')) {
    const sel = Array.isArray(d.views) ? d.views : allowed; // 'all'/미지정 → 전체
    const needData = (view, ok, msg) => { if (sel.includes(view) && !ok) errs.push(`'${view}' 뷰 선택됨 — ${msg}`); };
    needData('flow', Array.isArray(d.flow) && d.flow.length > 0, 'flow[] 필요');
    needData('journey', d.journey && Array.isArray(d.journey.steps) && d.journey.sat, 'journey.steps/sat 필요');
    needData('quad', d.quadrant && d.quadrant.xKey && d.quadrant.yKey, 'quadrant(축 설정) 필요');
    needData('scores', Array.isArray(d.scoreAxes) && d.scoreAxes.length > 0, 'scoreAxes 필요');
    // 값 수준 검증 (컨테이너뿐 아니라 옵션별 값까지 — NaN 좌표·빈 선 방지)
    const opts = d.options || [];
    if (sel.includes('scores') && Array.isArray(d.scoreAxes)) {
      opts.forEach(o => d.scoreAxes.forEach(ax => { if (!(o.scores && ax in o.scores)) errs.push(`options '${o.key}' 의 scores 에 축 '${ax}' 누락`); }));
      // 값 범위(0–10)는 위 옵션 루프에서 o.scores 전수 검사
    }
    if (sel.includes('quad') && d.quadrant) {
      ['xKey', 'yKey'].forEach(kk => opts.forEach(o => {
        if (!(d.quadrant[kk] in o)) errs.push(`options '${o.key}' 에 quadrant.${kk} '${d.quadrant[kk]}' 누락`);
        else if (!inRange(o[d.quadrant[kk]], 0, 10)) errs.push(`options '${o.key}' 의 quadrant.${kk} 가 가리키는 '${d.quadrant[kk]}' 값은 0–10`); }));
    }
  }
  return errs;
}

if (forceAll) data.views = 'all';

const errs = validate(data);
if (errs.length) { console.error('✗ 스키마 검증 실패:\n  - ' + errs.join('\n  - ')); process.exit(1); }

if (!tpl.includes(PLACEHOLDER)) { console.error('✗ 템플릿에', PLACEHOLDER, '플레이스홀더가 없습니다'); process.exit(1); }

// 함수 replacer 로 치환 ($& 등 특수문자 오해석 방지). 데이터는 JSON(=JS 리터럴의 부분집합)이라 그대로 주입.
// <script> 안에 안전하게: </script> 브레이크아웃과 U+2028/2029(JS 줄종결자) 를 \uXXXX 로 차단.
const compact = JSON.stringify(data)
  .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
  .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const out = tpl.replace(PLACEHOLDER, () => compact);
if (out.includes(PLACEHOLDER)) { console.error('✗ 치환 실패: 플레이스홀더가 남아있음'); process.exit(1); }

fs.writeFileSync(safeInside(here, outFile, ['.html']), out, 'utf8');

// ---- 분량 리포트 (토큰 절감 근거) ----
const ALL = schema.$defs.viewKey.enum;
const shown = data.views === 'all' || data.views == null ? ALL : data.views;
const enc = new TextEncoder();
const tplBytes = enc.encode(tpl).length;
const dataBytes = enc.encode(dataRaw).length;
const dataCompact = enc.encode(compact).length;
const outBytes = enc.encode(out).length;
const engineBytes = outBytes - dataCompact;
const pct = (a, b) => (100 * a / b).toFixed(1);

console.log('✓ 빌드 완료 →', outFile);
console.log('  뷰:', shown.join(', '), forceAll ? '(--all 카탈로그)' : `(데이터 선택, 전체 ${ALL.length}개 중 ${shown.length}개)`);
console.log('  ┌ 엔진 템플릿  decision.template.html : ' + tplBytes.toLocaleString() + ' B  (한 번 고정·재사용)');
console.log('  ├ 결정 데이터  ' + dataFile + ' : ' + dataBytes.toLocaleString() + ' B  (들여쓴 원본)');
console.log('  │                └ minify(주입분)          : ' + dataCompact.toLocaleString() + ' B');
console.log('  └ 산출물       ' + outFile + ' : ' + outBytes.toLocaleString() + ' B');
console.log('  매 호출 LLM 이 새로 만드는 양 = 데이터 ' + dataBytes.toLocaleString() + ' B (산출물의 ' + pct(dataBytes, outBytes) + '%) · 재사용(엔진) ≈ ' + pct(engineBytes, outBytes) + '%');

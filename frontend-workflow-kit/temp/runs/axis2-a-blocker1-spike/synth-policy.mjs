// blocker ① spike — layers: 스키마가 mode-policy 의 role-derived allowed/forbidden 을 byte-동치로
// 재생성할 수 있는가? 실제 implementation-mode-policy.yaml 을 truth 로 파싱해 v1/v2 생성기와 diff.
//
//   v1 = tier3 §3 안 그대로: layer 당 단일 `edits_at: <min mode>` → 그 모드부터 위로 spread (단조 누적)
//   v2 = blocker ① 제안 수정: layer 당 명시 per-mode allow[]/forbid[] (비단조 행렬)
//
// 비교 범위: 정책의 {roles.*} 토큰 항목만(= layers 가 생성한다고 주장하는 부분). 리터럴 blanket
// guard(src/features/**, openapi.yaml, src/**, docs/**)는 tier3 §3 이 "리터럴 유지"라 했으므로 범위 밖.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIT = path.resolve(HERE, '../../..'); // temp/runs/<run>/ → kit root
const policy = parse(fs.readFileSync(path.join(KIT, 'policies/implementation-mode-policy.yaml'), 'utf8'));
const ORDER = policy.order;

const ROLE_RE = /^\{roles\.([a-z_]+)\}$/;
const roleTokens = (list) => (list || []).filter((p) => ROLE_RE.test(p)).sort();

// --- TRUTH: 실제 정책에서 모드별 role-derived allowed/forbidden 추출 ---
const truth = {};
for (const m of ORDER) {
  truth[m] = { allow: roleTokens(policy.modes[m].allowed_paths), forbid: roleTokens(policy.modes[m].forbidden_paths) };
}

// --- v1: 단일 edits_at 임계값 (tier3 §3) — edits_at 모드부터 위로 모두 allowed ---
const layersV1 = [
  { role: 'route_entry', edits_at: 'route-skeleton' },
  { role: 'screen', edits_at: 'screen-skeleton' },
  { role: 'domain_component', edits_at: 'rough-fixture-ui' },
  { role: 'hook', edits_at: 'rough-fixture-ui' },
  { role: 'api_client', edits_at: 'api-integrated-ui' },
];
function genV1(layers) {
  const out = Object.fromEntries(ORDER.map((m) => [m, { allow: [], forbid: [] }]));
  for (const L of layers) {
    const i = ORDER.indexOf(L.edits_at);
    for (let j = i; j < ORDER.length; j++) out[ORDER[j]].allow.push(`{roles.${L.role}}`);
  }
  for (const m of ORDER) { out[m].allow.sort(); out[m].forbid.sort(); }
  return out;
}

// --- v2: per-mode allow/forbid 행렬 (blocker ① 제안 수정) ---
const layersV2 = [
  { role: 'route_entry', allow: ['route-skeleton'] },
  { role: 'screen', allow: ['screen-skeleton', 'rough-fixture-ui', 'final-fixture-ui'], forbid: ['api-integrated-ui'] },
  { role: 'domain_component', allow: ['rough-fixture-ui', 'final-fixture-ui'] },
  { role: 'hook', allow: ['rough-fixture-ui', 'api-integrated-ui'] },
  { role: 'api_client', allow: ['api-integrated-ui'], forbid: ['route-skeleton', 'screen-skeleton', 'rough-fixture-ui', 'final-fixture-ui'] },
];
function genV2(layers) {
  const out = Object.fromEntries(ORDER.map((m) => [m, { allow: [], forbid: [] }]));
  for (const L of layers) {
    for (const m of L.allow || []) out[m].allow.push(`{roles.${L.role}}`);
    for (const m of L.forbid || []) out[m].forbid.push(`{roles.${L.role}}`);
  }
  for (const m of ORDER) { out[m].allow.sort(); out[m].forbid.sort(); }
  return out;
}

function diff(gen) {
  const out = [];
  for (const m of ORDER) for (const k of ['allow', 'forbid']) {
    const g = gen[m][k].join(', '); const t = truth[m][k].join(', ');
    if (g !== t) out.push(`  ${m}.${k}\n      gen  : [${g || '∅'}]\n      truth: [${t || '∅'}]`);
  }
  return out;
}

console.log('=== TRUTH (실제 정책의 role-derived allowed/forbidden, 모드順) ===');
for (const m of ORDER) console.log(`  ${m}\n      allow : [${truth[m].allow.join(', ') || '∅'}]\n      forbid: [${truth[m].forbid.join(', ') || '∅'}]`);

const d1 = diff(genV1(layersV1));
console.log(`\n=== v1: 단일 edits_at 임계값 (tier3 §3 초안)  →  ${d1.length} mismatch ===`);
console.log(d1.join('\n') || '  (byte-동치)');

const d2 = diff(genV2(layersV2));
console.log(`\n=== v2: per-mode allow/forbid 행렬 (제안 수정)  →  ${d2.length} mismatch ===`);
console.log(d2.join('\n') || '  (byte-동치 — role-derived 항목 전부 일치)');

console.log('\n=== 판정 ===');
console.log(`  blocker ① (단일 edits_at 로 비단조 표현 불가): ${d1.length > 0 ? '실재 확인 (v1 ' + d1.length + ' 불일치)' : '반증'}`);
console.log(`  제안 수정(per-mode 행렬)로 byte-동치 회복: ${d2.length === 0 ? '가능 (v2 0 불일치)' : '불가 (' + d2.length + ' 잔존)'}`);

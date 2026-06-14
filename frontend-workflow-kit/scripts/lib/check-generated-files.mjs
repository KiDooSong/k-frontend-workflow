// check-generated-files.mjs (lib) — generated-file guard v1 의 로직.
//
// 2.5B(discovery): manifest 의 모든 생성물(kind:generated)을 분류한다(부작용 없음).
//   - selected = generated:true ∧ status:active ∧ do_not_edit:true ∧ id∈allowlist(route-tree·nav-graph).
//   - 그 외(planned·수동모드·비-allowlist)는 selected:false + skip 사유(must-not-fail).
// 2.5C(reproduce): selected(route-tree·nav-graph)를 임시 디렉토리에 재생성해 커밋본과 비교한다.
//   - 생성기를 명시 계약(V1_REPRODUCE)으로 서브프로세스 호출 — manifest/헤더의 command 문자열에
//     의존하지 않는다(설계 §2.1, §8.1). 헤더가 manifest command 와 다르다고 실패시키지 않는다.
//   - 정규화는 normalizeGeneratedViewText(CRLF→LF, \→/)만 — timestamp/date 정규화 없음(§4.3-4.4, §A.5).
//   - 커밋된 파일은 읽기만 한다 — 임시 디렉토리에만 쓰고 finally 로 정리(자동수정/덮어쓰기 없음, §4).
//
// 설계 출처: frontend-workflow-kit/temp/proposals/generated-file-guard-design.md
//   §1.7 · §2 · §4.3-4.4(regenerate) · §4.7(CG: 키) · §5(reproduce-not-diff) · §A.5(정규화 재사용).
//
// discovery(discoverArtifacts/selectArtifactIds)는 순수(IO 없음)다. reproduceArtifact 만
// 샌드박스 IO(임시 디렉토리·서브프로세스)를 하되 커밋 트리는 절대 건드리지 않는다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { KIT_ROOT, exists, isDir, readFileSafe } from './util.mjs';
// 정규화 원시함수는 골든 하니스와 동일한 것을 재사용한다(설계 §A.5 "reuse verbatim; do not invent").
import { normalizeGeneratedViewText, toPosix } from './test-fixture.mjs';

// v1 가드 대상 allowlist — whole-file generated artifact 중 route-tree·nav-graph 만.
// 정렬된 형태로 둔다(나열 출력 안정성). 설계 §1.7 "Guardable NOW" 두 항목.
export const V1_ARTIFACT_IDS = ['nav-graph', 'route-tree'];

// --artifact 입력을 v1 정책으로 해소한다(작업/표시 집합).
//   requested 없음        → v1 전체(route-tree·nav-graph).
//   requested 가 v1 대상  → 그 하나로 좁힘.
//   requested 가 비-v1    → 빈 배열(가드 대상 아님 — 호출부가 사유를 안내).
export function selectArtifactIds(requested) {
  if (requested == null) return [...V1_ARTIFACT_IDS];
  return V1_ARTIFACT_IDS.includes(requested) ? [requested] : [];
}

// ── 2.5B discovery (순수) ─────────────────────────────────────────────────────

// 생성물 1건을 v1 관점으로 분류한다(intrinsic — --artifact 와 무관).
//   selected = generated:true ∧ status:active ∧ do_not_edit:true ∧ id∈allowlist.
//   skip 이면 사유를 우선순위 순으로 모은다(skip_reasons[0] 이 가장 근본적인 1차 사유):
//     1) generated 플래그 없음, 2) status != active(planned, 생성기 미구현),
//     3) do_not_edit != true(수동 모드), 4) v1 allowlist 밖.
// 어떤 검사도 하지 않는다 — manifest 값을 읽어 분류만 한다(헤더/본문/파일 IO 없음).
function classifyArtifact(id, entry, allowlist) {
  const status = typeof entry.status === 'string' ? entry.status : null;
  const generated = entry.generated === true;
  const doNotEdit = entry.do_not_edit === true;

  const reasons = [];
  if (!generated) reasons.push("manifest 'generated' 플래그 없음");
  if (status !== 'active') {
    reasons.push(`status: ${status ?? '(없음)'} — 생성기 미구현(planned) → 재생성 안 함(must-not-fail)`);
  }
  if (!doNotEdit) {
    reasons.push(`do_not_edit: ${entry.do_not_edit ?? '(없음)'} — 수동 작성 모드 → 본문 강제 안 함`);
  }
  if (!allowlist.includes(id)) {
    reasons.push(`v1 가드 대상 아님 (v1: ${V1_ARTIFACT_IDS.join(', ')})`);
  }

  return {
    id,
    kind: entry.kind,
    generated,
    status,
    do_not_edit: doNotEdit,
    path: typeof entry.path === 'string' ? entry.path : null,
    command: typeof entry.command === 'string' ? entry.command : null,
    source: Array.isArray(entry.source) ? entry.source.slice() : [],
    selected: reasons.length === 0,
    skip_reasons: reasons,
  };
}

// manifest.artifacts 중 kind:generated 인 엔트리를 전부 분류해 id 정렬로 반환한다.
//   authoring 엔트리는 후보가 아니므로 제외한다.
//   allowlist 는 selected 판정에만 쓴다(기본 V1_ARTIFACT_IDS). 테스트가 주입할 수 있게 인자로 둔다.
export function discoverArtifacts(manifest, { allowlist = V1_ARTIFACT_IDS } = {}) {
  const artifacts =
    manifest && typeof manifest === 'object' && manifest.artifacts && typeof manifest.artifacts === 'object'
      ? manifest.artifacts
      : {};
  const out = [];
  for (const id of Object.keys(artifacts)) {
    const entry = artifacts[id] || {};
    if (entry.kind !== 'generated') continue; // 생성물만 후보(authoring 제외)
    out.push(classifyArtifact(id, entry, allowlist));
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

// ── 2.5C reproduce-to-scratch (IO; 커밋 트리 불변) ─────────────────────────────

// 표시/메시지용 경로 — cwd 상대 posix(머신 종속 절대경로를 출력에 흘리지 않음).
function relPosix(abs) {
  const rel = path.relative(process.cwd(), abs);
  return toPosix(rel || '.');
}

// v1 reproduce 계약 — 생성기 호출 방식을 코드로 고정한다(헤더/manifest command 문자열 비파싱).
//   resolveInput : --docs/--src 에서 생성기 입력 디렉토리.
//   inputFlag    : 생성기 입력 플래그.
//   outName      : _meta 산출 파일명(scratch 출력 파일명으로도 사용).
// route-tree: src/app 파일트리 → _meta/route-tree.txt.  nav-graph: docs → _meta/nav-graph.yaml.
export const V1_REPRODUCE = {
  'route-tree': {
    script: 'route-tree.mjs',
    inputFlag: '--app',
    resolveInput: ({ srcDir }) => path.join(srcDir, 'app'),
    outName: 'route-tree.txt',
  },
  'nav-graph': {
    script: 'nav-graph.mjs',
    inputFlag: '--docs',
    resolveInput: ({ docsDir }) => docsDir,
    outName: 'nav-graph.yaml',
  },
};

// 커밋된 산출물 경로 — 두 v1 산출물 모두 <docsDir>/_meta/<outName>.
//  (생성기 기본 --out 해석과 동일: nav-graph.mjs path.join(docsDir,'_meta',...), route-tree 기본값.)
function committedPathFor(contract, docsDir) {
  return path.join(docsDir, '_meta', contract.outName);
}

// 첫 번째 다른 줄을 사람이 읽게 — 회귀 디버깅용(정규화 후 비교).
function firstLineDiff(committed, regenerated) {
  const a = normalizeGeneratedViewText(committed).split('\n');
  const b = normalizeGeneratedViewText(regenerated).split('\n');
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      return `line ${i + 1}: 커밋=${JSON.stringify(a[i] ?? '<없음>')} 재생성=${JSON.stringify(b[i] ?? '<없음>')}`;
    }
  }
  return '내용 상이';
}

// route-tree·nav-graph 하나를 임시 디렉토리에 2회 재생성하고 커밋본과 비교한다.
//   반환: { id, status, committed, input, checks:[{check,ok,message}] }
//   status: ok | mismatch | nondeterministic | generator-error | missing-committed | missing-input | skip
//   설계 §4.7 CG: 키 — CG:run:N · CG:output:N · CG:deterministic · CG:content.
//   - 생성기를 import 하지 않고 서브프로세스(process.execPath)로 호출(계약 고정).
//   - 정규화 normalizeGeneratedViewText 만(CRLF/path-sep). timestamp 정규화 없음.
//   - 커밋본은 읽기만 — 임시 디렉토리에만 쓰고 finally 로 삭제(자동수정/덮어쓰기 없음).
export function reproduceArtifact(id, { docsDir, srcDir }) {
  const checks = [];
  const ok = (check, message) => checks.push({ check, ok: true, message });
  const fail = (check, message) => checks.push({ check, ok: false, message });

  const contract = V1_REPRODUCE[id];
  if (!contract) {
    fail('CG:config', `reproduce 계약 없음(v1 대상 아님): ${id}`);
    return { id, status: 'skip', committed: null, input: null, checks };
  }

  const scriptPath = path.join(KIT_ROOT, 'scripts', contract.script);
  const inputDir = contract.resolveInput({ docsDir, srcDir });
  const committed = committedPathFor(contract, docsDir);
  const result = (status) => ({ id, status, committed: relPosix(committed), input: relPosix(inputDir), checks });

  const committedRaw = readFileSafe(committed);
  const committedOk = committedRaw != null;
  const inputOk = isDir(inputDir);

  // 둘 다 없으면 이 트리에 해당 산출물이 없는 것 — skip(작업 없음, must-not-fail).
  if (!inputOk && !committedOk) {
    ok('CG:skip', '입력·커밋본 모두 없음 — 이 트리에 해당 산출물 없음');
    return result('skip');
  }
  if (!exists(scriptPath)) {
    fail('CG:config', `생성기 없음: ${relPosix(scriptPath)}`);
    return result('generator-error');
  }
  if (!inputOk) {
    fail('CG:input', `입력 디렉터리 없음(재생성 불가): ${relPosix(inputDir)}`);
    return result('missing-input');
  }
  if (!committedOk) {
    fail('CG:committed', `커밋된 산출물 없음(비교 대상 부재): ${relPosix(committed)}`);
    return result('missing-committed');
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `cgf-${id}-`));
  const outs = [
    path.join(tmpDir, `run1-${contract.outName}`),
    path.join(tmpDir, `run2-${contract.outName}`),
  ];
  const runOnce = (outFile) =>
    spawnSync(process.execPath, [scriptPath, contract.inputFlag, inputDir, '--out', outFile], {
      encoding: 'utf8',
    });

  let status = 'ok';
  try {
    let runOk = true;
    outs.forEach((outFile, i) => {
      const r = runOnce(outFile);
      const label = `CG:run:${i + 1}`;
      if (r.error) {
        fail(label, `실행 실패: ${r.error.message}`);
        runOk = false;
      } else if (r.status !== 0) {
        const snip = (r.stderr || '').trim().split('\n')[0] || '';
        fail(label, `exit ${r.status} (기대 0)${snip ? ' — ' + snip : ''}`);
        runOk = false;
      } else {
        ok(label, 'exit 0');
      }
    });

    const got = outs.map((o) => readFileSafe(o));
    got.forEach((g, i) => {
      if (g == null) {
        fail(`CG:output:${i + 1}`, `출력 파일 없음: ${relPosix(outs[i])}`);
        runOk = false;
      } else {
        ok(`CG:output:${i + 1}`, '출력 파일 생성');
      }
    });

    if (!runOk) {
      status = 'generator-error';
    } else {
      // 결정성(2회 출력 일치)
      if (normalizeGeneratedViewText(got[0]) === normalizeGeneratedViewText(got[1])) {
        ok('CG:deterministic', '동일 입력 2회 출력 일치');
      } else {
        fail('CG:deterministic', `동일 입력 2회 출력 불일치 — ${firstLineDiff(got[0], got[1])}`);
        status = 'nondeterministic';
      }
      // 커밋본과 본문 동등(reproduce-not-diff)
      if (normalizeGeneratedViewText(committedRaw) === normalizeGeneratedViewText(got[0])) {
        ok('CG:content', `${contract.outName} 커밋본과 일치`);
      } else {
        fail('CG:content', `${contract.outName} 커밋본과 불일치 — ${firstLineDiff(committedRaw, got[0])}`);
        if (status === 'ok') status = 'mismatch';
      }
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true }); // scratch 정리 — 커밋 트리 불변
  }
  return result(status);
}

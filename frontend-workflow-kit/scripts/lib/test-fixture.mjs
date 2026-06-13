// test-fixture.mjs — golden fixture 비교 하니스(MVP-B Phase 0)의 공유 라이브러리.
// reconcile-input 드라이런 출력(actual-llm-after)을 정답지(expected-llm-after)와 대조하는
// "올리기만(raise-only)" 불변식 검사와, 문서 생성 fixture 의 파싱 무결성 검사를 제공한다.
//
// 설계 근거 (temp/example-compare-harness-proposal.md, scripts/example-compare.mjs 초안의 일반화):
//  - 파싱 단일 출처: 직접 md 파싱 금지. lib/spec.mjs(parseTable·loadScreenSpec) 와
//    lib/util.mjs(splitFrontmatter·walkFiles 등)를 그대로 재사용한다 — validate/readiness 와
//    같은 파서라 검사기 표류가 없다(불변식).
//  - stage = llm-after 만: LLM 은 open 추가와 resolved→open 재오픈만 한다. 사람-전용 닫기/승격
//    (→ resolved · accepted · status:confirmed · Unknown 닫기)이 LLM 출력에 있으면 FAIL.
//  - reconcile 비교 대상은 expected-llm-after 뿐. human-final(expected-after)을 LLM 출력처럼
//    비교하지 않는다 (요구사항 #1·#2 — 호출부 manifest 가 expected 경로를 고정).
//  - 경로 경계(forbidden_paths) 검사는 여기서 하지 않는다 — Lane B 소관 (요구사항 #6).
//  - fail-closed: 행 부재·표 깨짐은 조용히 통과시키지 않고 FAIL 로 surface 한다(오타 하나로 게이트가
//    풀리는 fail-open 방지). frontmatter parseError 는 그 값을 실제 검사에 쓰는 screen-spec(status)
//    에서만 fail-closed 다 — register/decision/conflict/gap 검사는 본문 표만 읽으므로(splitFrontmatter
//    (raw).body → parseTable) frontmatter 와 무관.
import path from 'node:path';
import { readFileSafe, splitFrontmatter, exists, walkFiles, isDir } from './util.mjs';
import { parseTable, loadScreenSpec } from './spec.mjs';

// 경로 구분자 정규화 — Windows(\) ↔ POSIX(/). 보고/비교를 OS 독립적으로 (요구사항 #5).
export function toPosix(p) {
  return String(p).split(path.sep).join('/').replace(/\\/g, '/');
}

// 값 정규화 — 표 셀/상태 비교용. 앞뒤 공백 제거 + 소문자.
export function norm(v) {
  return String(v ?? '').trim().toLowerCase();
}

// 본문 정규화 — 휘발성 메타(generated_at·date·last_reviewed)와 CRLF 를 지워, 내용 동등 비교가
// 타임스탬프/줄끝 차이로 깨지지 않게 한다 (요구사항 #5). 하니스의 게이트 판정은 구조화 비교
// (파싱)를 쓰므로 raw 내용 비교는 게이트가 아니지만, E:content 정보성 집계와 Lane 간 재사용에 쓴다.
export function normalizeText(s) {
  return String(s ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/^(\s*(?:generated_at|date|last_reviewed)\s*:).*$/gim, '$1 <normalized>')
    .replace(/\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?\S*)?\b/g, '<date>');
}

// 느슨한 셀 접근 (헤더 공백/대소문자 무시) — spec.mjs 의 col 과 동일 규칙.
export function cell(row, name) {
  const want = norm(name).replace(/\s+/g, '');
  for (const k of Object.keys(row || {})) {
    if (norm(k).replace(/\s+/g, '') === want) return String(row[k] ?? '').trim();
  }
  return '';
}

// 파일 본문 첫 표에서 idCol==id 인 행의 statusCol 값(소문자). 부재는 사유 객체로.
export function rowStatus(file, idCol, id, statusCol = 'Status') {
  const raw = readFileSafe(file);
  if (raw == null) return { missing: true };
  const table = parseTable(splitFrontmatter(raw).body);
  if (!table) return { noTable: true };
  const row = table.rows.find((r) => cell(r, idCol) === id);
  if (!row) return { noRow: true };
  return { status: norm(cell(row, statusCol)) };
}

// 검사 누산기.
function makeResults() {
  const checks = [];
  return {
    checks,
    ok: (check, message) => checks.push({ check, ok: true, message }),
    fail: (check, message) => checks.push({ check, ok: false, message }),
  };
}

function finalize(r) {
  return { checks: r.checks, failed: r.checks.filter((c) => !c.ok).length };
}

// reconcile fixture(stage=llm-after) 검사:
//   E:files    expected-llm-after 의 모든 산출물이 actual 에 있는가 (존재 패리티만 — 경로 경계 X)
//   E:content  존재 파일의 정규화 후 동일/차이 집계 (정보성, 비게이트 — 요구사항 #5 데모)
//   R:register reconciliation-register 에 입력 N행 + 전부 reconciled
//   F:*        사람-전용 전이 부재 (decision/conflict/unknown 은 open 유지, gap 은 accepted 아님,
//              COUPON-001 status 는 confirmed 아님, Unknown 신설 없음)
//
//   expectedDir, actualDir : .../docs/frontend-workflow
//   manifest               : 검사 대상 ID·기대 상태 선언 (호출부)
// 반환: { checks:[{check,ok,message}], failed:Number }
export function runReconcileChecks(expectedDir, actualDir, manifest) {
  const r = makeResults();

  // E. 파일 존재 + 내용 정규화 집계
  if (!isDir(expectedDir)) {
    r.fail('E:files', `expected docs 디렉터리 없음: ${toPosix(expectedDir)}`);
  } else if (!isDir(actualDir)) {
    r.fail('E:files', `actual docs 디렉터리 없음: ${toPosix(actualDir)}`);
  } else {
    const expFiles = walkFiles(expectedDir, ['.md']);
    const missing = [];
    let identical = 0;
    let cosmetic = 0;
    for (const f of expFiles) {
      const rel = toPosix(path.relative(expectedDir, f));
      const actFile = path.join(actualDir, rel);
      if (!exists(actFile)) {
        missing.push(rel);
        continue;
      }
      // 내용 차이는 게이트가 아니다 (제목 라벨·주석·문구 등 cosmetic 차이 허용 — 런 리포트 참조).
      // generated_at·date·CRLF 를 지운 뒤 동일 여부만 정보성으로 센다.
      if (normalizeText(readFileSafe(f)) === normalizeText(readFileSafe(actFile))) identical++;
      else cosmetic++;
    }
    if (missing.length) {
      for (const m of missing) r.fail('E:files', `actual 에 없음: ${m}`);
    } else {
      r.ok('E:files', `expected 산출물 ${expFiles.length}개 모두 actual 에 존재`);
      r.ok('E:content', `정규화 후 동일 ${identical} · 차이(비게이트) ${cosmetic} / ${expFiles.length}`);
    }
  }

  // R. register — 입력 N행 + 전부 reconciled
  {
    const f = path.join(actualDir, manifest.registerFile);
    const raw = readFileSafe(f);
    if (raw == null) {
      r.fail('R:register', `register 파일 없음: ${toPosix(manifest.registerFile)}`);
    } else {
      const table = parseTable(splitFrontmatter(raw).body);
      if (!table) {
        r.fail('R:register', 'register 표 파싱 실패');
      } else {
        const statusCol = manifest.registerStatusCol || 'Reconcile Status';
        const want = norm(manifest.registerStatusValue || 'reconciled');
        let bad = 0;
        for (const id of manifest.registerInputs) {
          const row = table.rows.find((x) => cell(x, 'Input ID') === id);
          if (!row) {
            r.fail('R:register', `register 행 없음: ${id}`);
            bad++;
            continue;
          }
          const st = norm(cell(row, statusCol));
          if (st !== want) {
            r.fail('R:register', `${id} ${statusCol}=${st || '(빈값)'} (${want} 아님)`);
            bad++;
          }
        }
        if (!bad) r.ok('R:register', `입력 ${manifest.registerInputs.length}행 전부 ${want}`);
      }
    }
  }

  // F. 금지 전이 — 사람-전용 닫기/승격이 LLM 출력에 없어야 함.
  // 행 부재/표 깨짐도 fail-closed 로 surface 한다 (true 면 그 ID 처리 종료).
  const rowFail = (label, file, id, res) => {
    if (res.missing) { r.fail(`F:${label}`, `${toPosix(file)} 없음`); return true; }
    if (res.noTable) { r.fail(`F:${label}`, `${toPosix(file)} 표 없음`); return true; }
    if (res.noRow) { r.fail(`F:${label}`, `${id} 행 없음`); return true; }
    return false;
  };
  // 반드시 open 이어야 함 (LLM 은 닫지 않음). resolved 뿐 아니라 open 이 아닌 모든 값(빈값/오타/closed)도 FAIL.
  const mustBeOpen = (file, ids, label) => {
    for (const id of ids || []) {
      const res = rowStatus(path.join(actualDir, file), 'ID', id);
      if (rowFail(label, file, id, res)) continue;
      if (res.status === 'open') r.ok(`F:${label}`, `${id}=open (open 유지)`);
      else r.fail(`F:${label}`, `${id}=${res.status || '(빈값)'} (open 아님 — 사람-전용 전이/결함)`);
    }
  };
  // 특정 값으로 가면 안 됨 (gap: accepted 금지 — 승인은 사람). open/rejected 등 그 외는 허용.
  const mustNotBe = (file, ids, forbiddenStatus, label) => {
    for (const id of ids || []) {
      const res = rowStatus(path.join(actualDir, file), 'ID', id);
      if (rowFail(label, file, id, res)) continue;
      if (res.status === forbiddenStatus) r.fail(`F:${label}`, `${id}=${forbiddenStatus} (사람-전용 전이가 LLM 출력에 있음!)`);
      else r.ok(`F:${label}`, `${id}=${res.status || '(빈값)'} (${forbiddenStatus} 아님)`);
    }
  };
  mustBeOpen(manifest.decisionsFile, manifest.decisionsMustStayOpen, 'decision');
  mustBeOpen(manifest.conflictsFile, manifest.conflictsMustStayOpen, 'conflict');
  mustNotBe(manifest.gapsFile, manifest.gapsMustNotBeAccepted, 'accepted', 'gap');

  // COUPON-001 screen-spec: frontmatter status != confirmed + Unknowns(open 유지 / 미신설)
  const specPath = path.join(actualDir, manifest.couponSpec);
  if (!exists(specPath)) {
    r.fail('F:screen', `COUPON-001 screen-spec 없음: ${toPosix(manifest.couponSpec)}`);
  } else {
    const spec = loadScreenSpec(specPath);
    if (spec.parseError) {
      // frontmatter 가 깨지면 status 가 빈값이 되어 F:confirmed 가 거짓 통과(fail-open)한다 → 명시적 FAIL.
      r.fail('F:confirmed', `COUPON-001 frontmatter 파싱 오류: ${spec.parseError}`);
    } else {
      const st = norm(spec.frontmatter.status);
      if (st === 'confirmed') r.fail('F:confirmed', 'COUPON-001 status=confirmed (사람-전용 승격이 LLM 출력에 있음!)');
      else r.ok('F:confirmed', `COUPON-001 status=${st || '(빈값)'} (confirmed 아님)`);
    }

    const ut = parseTable(spec.sections['unknowns']);
    for (const id of manifest.unknownsMustStayOpen || []) {
      const row = ut && ut.rows.find((x) => cell(x, 'ID') === id);
      const st = row ? norm(cell(row, 'Status')) : null;
      if (!row) r.fail('F:unknown', `${id} 행 없음`);
      else if (st === 'open') r.ok('F:unknown', `${id}=open (open 유지)`);
      else r.fail('F:unknown', `${id}=${st || '(빈값)'} (open 아님 — Unknown 닫기는 사람!)`);
    }
    for (const id of manifest.unknownsMustNotExist || []) {
      if (ut && ut.rows.some((x) => cell(x, 'ID') === id)) r.fail('F:unknown', `${id} 신설됨 (golden 엔 없음 — 회귀)`);
      else r.ok('F:unknown', `${id} 미신설 (정상)`);
    }
  }

  return finalize(r);
}

// integrity fixture(문서 생성 예제/구현 run) 검사 — 파싱 무결성 + 선언 산출물 존재.
// readiness/validate 판정을 재구현하지 않는다(게이트 단일 출처 보존). 건강한 fixture 에서
// 절대 false-fail 하지 않는 보수적 단언만 한다:
//   I:exists   docs 트리에 screen-spec 이 1개 이상 있는가
//   I:parse    각 screen-spec 의 frontmatter 가 깨지지 않았는가 (loadScreenSpec parseError 부재)
//   I:reports  선언된 기대 리포트(있으면) 가 존재하는가
//   spec : { docsDir, requireReports?: [absPath...] }
export function runIntegrityChecks(spec) {
  const r = makeResults();
  const docsDir = spec.docsDir;
  if (!isDir(docsDir)) {
    r.fail('I:exists', `docs 디렉터리 없음: ${toPosix(docsDir)}`);
    return finalize(r);
  }
  const specs = walkFiles(docsDir, ['.md']).filter((f) => path.basename(f) === 'screen-spec.md');
  if (!specs.length) r.fail('I:exists', `screen-spec.md 없음: ${toPosix(docsDir)}`);
  else r.ok('I:exists', `screen-spec ${specs.length}개 발견`);

  let bad = 0;
  for (const f of specs) {
    // 파싱은 production 파서(loadScreenSpec)를 그대로 쓴다 — validate/readiness 와 단일 출처(제약 #5).
    const parsed = loadScreenSpec(f);
    if (parsed.parseError) {
      r.fail('I:parse', `frontmatter 파싱 오류: ${toPosix(path.relative(docsDir, f))} — ${parsed.parseError}`);
      bad++;
    }
  }
  if (!bad && specs.length) r.ok('I:parse', `screen-spec ${specs.length}개 frontmatter 모두 파싱됨`);

  for (const rep of spec.requireReports || []) {
    if (exists(rep)) r.ok('I:reports', `존재: ${toPosix(path.basename(rep))}`);
    else r.fail('I:reports', `없음: ${toPosix(rep)}`);
  }
  return finalize(r);
}

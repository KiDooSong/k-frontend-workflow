// workflow-run.mjs (lib) — auto-stop 상태기계의 순수 모델 + 렌더러.
// I/O 없음 · process.exit 없음 · 서브프로세스 없음 · 판정(게이트/승인) 없음.
//
// 불변식 (pr-plan §7, SYNTHESIS §9.2/§9.5, ambiguity-triage.md):
//  - workflow:run 은 workflow:packet(+report)를 엮는 auto-stop orchestrator 다 — 구현/auto-fix/auto-retry 0.
//  - HALT 은 *종료 상태*이지 게이트가 아니다. 어떤 HALT 도 머지를 차단하지 않는다(차단은 Open Decision readiness cap + 사람).
//  - readiness 재계산/대체 0 (packet 봉투를 소비만). Open Decision/Unknown/Conflict 를 닫거나 candidate→confirmed 로 올리지 않는다 (사람-전용).
//  - Safe To Proceed? / Ambiguity 를 exit 1 게이트로 만들지 않는다. 정상 auto-stop = exit 0, 도구 오류만 non-zero(2).
//
// 어휘 가드: 'verdict'/'approve'/'blocked' 를 능동 판정 용어로 쓰지 않는다 — HALT_*/Open Decision/Safe To Proceed? 를 쓴다.

export const STATES = {
  HALT_AMBIGUITY: 'HALT_AMBIGUITY',
  HALT_READY_FOR_WORK: 'HALT_READY_FOR_WORK',
  DONE_PENDING_REVIEW: 'DONE_PENDING_REVIEW',
  HALT_TOOL_ERROR: 'HALT_TOOL_ERROR',
};

// 각 상태의 exit code. 정상 auto-stop(HALT_AMBIGUITY/READY/DONE) = 0, 도구 오류만 2. exit 1 은 절대 쓰지 않는다.
export const STATE_EXIT = {
  HALT_AMBIGUITY: 0,
  HALT_READY_FOR_WORK: 0,
  DONE_PENDING_REVIEW: 0,
  HALT_TOOL_ERROR: 2,
};

export const STATE_HEADLINE = {
  HALT_AMBIGUITY: '애매함 미해결 — runner 가 구현 전 스스로 멈춤 (auto-stop · 기본 경로)',
  HALT_READY_FOR_WORK: '게이트 깨끗 · packet 발급 — 사람/지정 구현자 판단 대기 (구현 허가 아님)',
  DONE_PENDING_REVIEW: 'Run Report 생성 완료 — 사람 리뷰 대기 (green ≠ 승인)',
  HALT_TOOL_ERROR: '도구/입력 오류 — packet/report 생성 자체 실패 (fail-closed)',
};

const STATE_ORDER = ['HALT_AMBIGUITY', 'HALT_READY_FOR_WORK', 'DONE_PENDING_REVIEW', 'HALT_TOOL_ERROR'];

function cell(s) {
  return String(s == null ? '—' : s).replace(/\|/g, '\\|');
}
function q(v) {
  // YAML double-quoted scalar: 역슬래시 먼저, 그다음 따옴표 이스케이프 (Windows 경로가 섞여도 유효 YAML).
  return `"${String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
export function toPosix(p) {
  return String(p == null ? '' : p).replace(/\\/g, '/');
}

// packet 봉투가 "완전히 깨끗"한가 → HALT_READY_FOR_WORK / DONE_PENDING_REVIEW 진입 조건.
// 하나라도 미해결이면 HALT_AMBIGUITY(기본 경로). 재계산 0 — 봉투 필드만 읽는다(packet renderJsonEnvelope).
export function isPacketClean(env) {
  if (!env || typeof env !== 'object') return false;
  return (
    env.over_ceiling === false &&
    env.mode_known === true &&
    Number(env.blocking_count) === 0 &&
    Array.isArray(env.d_cand) && env.d_cand.length === 0 &&
    Array.isArray(env.u_cand) && env.u_cand.length === 0
  );
}

// HALT_AMBIGUITY 사유(사람에게 올릴 후보·신호). 판정 아님 — 표면화만.
export function ambiguityReasons(env) {
  if (!env) return ['packet 봉투를 읽지 못함'];
  const r = [];
  if (env.mode_known === false) {
    r.push(`requested_mode \`${env.requested_mode}\` 가 policy.order 사다리에 없음 — 천장 비교 불가 (needs-human)`);
  }
  if (env.over_ceiling === true) {
    r.push(`requested_mode \`${env.requested_mode}\` 가 readiness 천장 \`${env.readiness_mode}\` 초과 (over-ceiling)`);
  }
  const d = Array.isArray(env.d_cand) ? env.d_cand : [];
  const u = Array.isArray(env.u_cand) ? env.u_cand : [];
  if (d.length) r.push(`미해결 Open Decision 후보(D-cand): ${d.join(', ')} — 사람-전용 resolve`);
  if (u.length) r.push(`미해결 Unknown 후보(U-cand): ${u.join(', ')} — 사람-전용`);
  if (Number(env.blocking_count) > 0 && !d.length && !u.length) {
    r.push(`readiness blocking ${env.blocking_count}건 (상세는 Work Packet ## Blocking Items)`);
  }
  if (!r.length) r.push('애매함 신호 미상 — 보수적 정지');
  return r;
}

export function buildRunModel(opts) {
  const {
    screen,
    requestedMode,
    state,
    packet = null,
    report = null,
    paths = {},
    reason = null,
    date,
    seq = '001',
    generatedBy = 'workflow:run (PR4 auto-stop orchestrator)',
  } = opts;

  return {
    run_id: `RUN-${screen}-${requestedMode}-${seq}`,
    screen,
    requested_mode: requestedMode,
    state,
    exit: STATE_EXIT[state],
    headline: STATE_HEADLINE[state] || state,
    readiness_mode: packet ? packet.readiness_mode : null,
    next_mode: packet ? packet.next_mode : null,
    over_ceiling: packet ? !!packet.over_ceiling : null,
    mode_known: packet ? !!packet.mode_known : null,
    blocking_count: packet ? Number(packet.blocking_count) : null,
    d_cand: packet && Array.isArray(packet.d_cand) ? packet.d_cand : [],
    u_cand: packet && Array.isArray(packet.u_cand) ? packet.u_cand : [],
    readiness_source: packet ? packet.readiness_source : null,
    packet_warnings: packet && Array.isArray(packet.warnings) ? packet.warnings : [],
    ambiguity_reasons: state === STATES.HALT_AMBIGUITY ? ambiguityReasons(packet) : [],
    report_evidence: report ? report.evidence || null : null,
    report_blockers: report ? report.blockers || null : null,
    review_summary: report ? report.review_summary || null : null,
    reason,
    paths: {
      packet: paths.packet || null,
      report: paths.report || null,
      status: paths.status || null,
      docs: paths.docs || null,
    },
    created_at: date,
    generated_by: generatedBy,
  };
}

// --- 렌더 ------------------------------------------------------------------
function renderFrontmatter(m) {
  return [
    '---',
    `title: ${q(m.run_id + ' run status (' + m.state + ')')}`,
    `kind: ${q('run-status')}`,
    `state: ${q(m.state)}`,
    `run_id: ${q(m.run_id)}`,
    `screen: ${q(m.screen)}`,
    `requested_mode: ${q(m.requested_mode)}`,
    `readiness_mode: ${q(m.readiness_mode || 'unknown')}`,
    `date: ${q(m.created_at)}`,
    `generated_by: ${q(m.generated_by)}`,
    '---',
  ].join('\n');
}

function renderStateTable(m) {
  const head = '| 상태 | 의미 | exit |\n|---|---|---|';
  const rows = STATE_ORDER.map((s) => {
    const mark = s === m.state ? '▶ ' : '';
    return `| ${mark}\`${s}\` | ${cell(STATE_HEADLINE[s])} | ${STATE_EXIT[s]} |`;
  });
  return head + '\n' + rows.join('\n');
}

function renderWhy(m) {
  const out = [];
  if (m.state === STATES.HALT_AMBIGUITY) {
    out.push('runner 가 구현 전 스스로 멈췄다 (게이트가 막은 게 아니라 **runner 가 안 나아간 것**). 아래 후보를 사람이 검토/resolve 후 `npm run workflow:readiness` 재실행 → packet 재발급 → 재진입:');
    for (const r of m.ambiguity_reasons) out.push(`- ${r}`);
  } else if (m.state === STATES.HALT_READY_FOR_WORK) {
    out.push('게이트(readiness+validate 봉투) 깨끗 · packet 발급 완료. **구현 허가 아님** — 사람 또는 지정 구현자가 다음 행동(allowed_paths 안 작업)을 고른다. (Run Report 미생성 — 구현/검증 전 단계.)');
  } else if (m.state === STATES.DONE_PENDING_REVIEW) {
    out.push('게이트 깨끗 + 외부 구현 evidence(diff) 수집 → Run Report 생성. **green ≠ 승인** — evidence 가 준비됐다는 뜻이지 사람이 승인한 게 아니다. 머지/완료 결정은 사람/CI (runner 는 판정 안 함).');
  } else {
    out.push('packet/report 생성 자체가 실패했다 (signal script exit 2 / non-JSON — fail-closed). 사람이 환경/설정을 고친 뒤 재실행한다:');
    if (m.reason) out.push('```txt\n' + String(m.reason).slice(0, 1200) + '\n```');
  }
  return out.join('\n');
}

function renderSignals(m) {
  const out = [];
  out.push('| 항목 | 값 |');
  out.push('|---|---|');
  out.push(`| readiness_mode | \`${cell(m.readiness_mode || '—')}\` |`);
  out.push(`| next_mode | ${m.next_mode ? '`' + cell(m.next_mode) + '`' : '— (최상위/미상)'} |`);
  out.push(`| requested_mode | \`${cell(m.requested_mode)}\`${m.over_ceiling ? ' — ⚠ 천장 초과' : ''} |`);
  out.push(`| mode_known | ${m.mode_known} |`);
  out.push(`| blocking_count | ${m.blocking_count} |`);
  out.push(`| D-cand (Open Decision) | ${m.d_cand.length ? m.d_cand.map((x) => '`' + cell(x) + '`').join(', ') : '—'} |`);
  out.push(`| U-cand (Unknown) | ${m.u_cand.length ? m.u_cand.map((x) => '`' + cell(x) + '`').join(', ') : '—'} |`);
  out.push('');
  out.push('> D-cand/U-cand 는 readiness 출력에서 그대로 옮긴 **후보**다 — runner 는 닫거나 confirmed 로 올리지 않는다 (사람-전용). 상세는 Work Packet 의 `## Blocking Items` 참조.');
  if (m.packet_warnings.length) {
    out.push('');
    out.push('> ⚠ packet 경고 (warning-only):');
    for (const w of m.packet_warnings) out.push(`> - ${w}`);
  }
  return out.join('\n');
}

function renderEvidence(m) {
  const e = m.report_evidence;
  const out = [];
  const line = (k, v) => out.push(`- ${k}: ${v ? `status=\`${cell(v.status)}\` ok=${v.ok} exit=${v.exit}` : '미수집'}`);
  line('validate', e.validate);
  line('forbidden-paths', e.forbidden_paths);
  line('idempotency', e.idempotency);
  line('check-generated (advisory)', e.check_generated);
  if (m.report_blockers) out.push(`- blockers (verbatim): total ${m.report_blockers.total} (D ${m.report_blockers.decisions} · invalid ${m.report_blockers.invalid} · fact ${m.report_blockers.facts})`);
  if (m.review_summary) out.push(`- review_summary: **${cell(m.review_summary)}** (advisory — merge check 에 배선 안 함)`);
  out.push('');
  out.push('> evidence 가 fail 이어도 runner 는 auto-fix/auto-retry/머지차단 하지 않는다 — 사람이 리뷰/결정. exit 은 0 (생성 성공 신호일 뿐).');
  return out.join('\n');
}

function renderNextAction(m) {
  if (m.state === STATES.HALT_AMBIGUITY) {
    return '- 위 D-cand/U-cand 를 사람이 resolve/triage (LLM/runner 는 닫지 못함) → `npm run workflow:readiness` 재실행 → packet 재발급 → `workflow:run` 재진입.';
  }
  if (m.state === STATES.HALT_READY_FOR_WORK) {
    return '- 사람/지정 구현자가 allowed_paths(Work Packet 참조) 안에서 작업을 시작할지 결정한다. runner 는 자동 전진하지 않는다 (구현 허가 아님).';
  }
  if (m.state === STATES.DONE_PENDING_REVIEW) {
    return '- 사람이 Run Report evidence 를 리뷰 → 머지/완료 결정 (runner 는 판정 안 함). 필요 시 Review Artifact 생성(advisory).';
  }
  return '- 사람이 오류 원인(state/policy 부재 · corrupt YAML · git 실패 등)을 고친 뒤 재실행한다.';
}

export function renderStatusMarkdown(m) {
  const out = [];
  out.push(renderFrontmatter(m));
  out.push('');
  out.push('<!--');
  out.push('  이 파일은 `workflow:run` 이 workflow:packet(+report)를 엮어 낸 auto-stop 상태 요약이다 (PR4 orchestrator).');
  out.push('  구현/auto-fix/auto-retry 0 · 새 게이트 0 · readiness 재계산 0 (봉투 소비만).');
  out.push('  HALT 은 종료 상태이지 게이트가 아니다 — 어떤 HALT 도 머지를 차단하지 않는다(차단은 Open Decision readiness cap + 사람).');
  out.push('  Open Decision/Unknown/Conflict 는 닫거나 candidate→confirmed 로 올리지 않는다 (사람-전용). 다음 행동은 사람/지정 구현자가 정한다.');
  out.push('-->');
  out.push('');
  out.push(`# Run Status: ${m.screen} → ${m.state}`);
  out.push('');
  out.push(`**${m.state}** — ${m.headline} (exit ${m.exit}${m.exit === 0 ? ' — auto-stop, 게이트 아님' : ' — 도구 오류, fail-closed'}).`);
  out.push(`- 대상: screen \`${cell(m.screen)}\` · requested_mode \`${cell(m.requested_mode)}\` · readiness_mode \`${cell(m.readiness_mode || '—')}\``);
  out.push(`- 게이트 단일 출처: \`${cell(m.readiness_source || '—')}\` (readiness 출력 — 재계산 0)`);
  out.push('- ⚠ 이 상태는 auto-stop 결과다 — exit code·HALT 어느 것도 merge gate 가 아니다 (차단 권한은 Open Decision readiness cap + 사람).');
  out.push('');
  out.push('## State (이 PR: 4-state auto-stop — IMPLEMENT/auto-fix 전이 없음)');
  out.push(renderStateTable(m));
  out.push('');
  out.push('## Why');
  out.push(renderWhy(m));
  out.push('');
  if (m.readiness_mode != null || m.blocking_count != null) {
    out.push('## Readiness Signals (packet 봉투 — verbatim, 재계산 0)');
    out.push(renderSignals(m));
    out.push('');
  }
  if (m.report_evidence) {
    out.push('## Evidence (Run Report — advisory, 게이트 아님)');
    out.push(renderEvidence(m));
    out.push('');
  }
  out.push('## Artifacts');
  out.push(`- Work Packet: ${m.paths.packet ? '`' + toPosix(m.paths.packet) + '`' : '— (미기록 — --out 없음 또는 생성 실패)'}`);
  out.push(`- Run Report: ${m.paths.report ? '`' + toPosix(m.paths.report) + '`' : '— (미생성 — 클린 게이트 + --diff 일 때만)'}`);
  out.push('');
  out.push('## Next action (사람/지정 구현자)');
  out.push(renderNextAction(m));
  out.push('');
  out.push('---');
  out.push('> **HALT 은 종료 상태이지 게이트가 아니다.** auto-stop = "runner 가 스스로 안 나아간 것"이지 "게이트가 막은 것"이 아니다. 어떤 HALT 도');
  out.push('> 머지를 차단하지 않는다 — 차단 권한은 Open Decision(readiness cap) + 사람뿐. `HALT_READY_FOR_WORK` 는 **구현 허가가 아니다**.');
  out.push('> runner 는 구현/auto-fix/auto-retry 를 하지 않으며, Open Decision/Unknown/Conflict 를 닫거나 올리지 않는다 (사람-전용).');
  return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '') + '\n';
}

// --json 봉투 — auto-stop 상태 + 근거(머지 판정 아님).
export function renderJsonEnvelope(m) {
  return {
    run_id: m.run_id,
    screen: m.screen,
    requested_mode: m.requested_mode,
    state: m.state,
    exit: m.exit,
    readiness_mode: m.readiness_mode,
    next_mode: m.next_mode,
    over_ceiling: m.over_ceiling,
    mode_known: m.mode_known,
    blocking_count: m.blocking_count,
    d_cand: m.d_cand,
    u_cand: m.u_cand,
    ambiguity_reasons: m.ambiguity_reasons,
    evidence: m.report_evidence,
    review_summary: m.review_summary,
    packet: m.paths.packet ? toPosix(m.paths.packet) : null,
    report: m.paths.report ? toPosix(m.paths.report) : null,
    status_out: m.paths.status ? toPosix(m.paths.status) : null,
    reason: m.reason || null,
    note: 'auto-stop status — HALT 은 종료 상태이지 게이트/머지차단 아님; exit 0 = 정상 auto-stop(HALT_AMBIGUITY/READY/DONE), 2 = 도구 오류. exit 1 미사용.',
  };
}

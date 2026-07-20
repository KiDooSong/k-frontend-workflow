// workflow-packet.mjs (lib) — Work Packet 초안의 순수 모델 + 렌더러.
// 이 모듈은 readiness 출력을 "옮기기만" 한다. I/O 없음, process.exit 없음, readiness 재계산 없음.
//
// 불변식 (frontend-workflow-kit-implementation §5, work-packet.template.md 주석, ambiguity-triage.md):
//  - Work Packet 은 새 source of truth 도 새 gate 도 아니다 — readiness 게이트를 "한 세션"으로 포장하는 봉투.
//  - allowed_paths / forbidden_paths / readiness_mode 는 readiness 출력에서 글자 그대로 복사 (재유도 금지).
//  - Open Decision / Unknown / Conflict 를 닫거나 candidate→confirmed 로 올리지 않는다 (사람-전용).
//  - Safe To Proceed? 는 warning-only 텍스트 — 게이트를 *올리지* 못하고, 더 보수적으로만 멈춘다. exit 1 금지.
//  - 이 generator 는 의미 추론을 하지 않는다 — 기계적으로 readiness 출력을 매핑/표면화할 뿐이다.
//
// 어휘 가드(§3): 'verdict' / 'blocked' 를 능동 용어로 쓰지 않는다 — Safe To Proceed? / D-cand / U-cand /
//               blocker-candidate / HALT_AMBIGUITY / cap 을 쓴다.

import { loadLayoutProfile } from './layout-profile.mjs';
import { KIT_ROOT } from './util.mjs';

// 모드별 정답 산출물 힌트 — work-packet.template.md(Goal/Expected Output 주석)의 예시를 그대로 인코딩한 것.
// 화면 추론이 아니라 "모드 이름 → 정적 설명" 룩업이다(템플릿이 이미 제시한 형태를 옮김).
//
// 경로 카피(tier1 §6): 사람-대상 안내 카피의 *role* 경로는 resolvedLayout 의 role 글롭에서 생성한다
// (literal 'src/app/**' 등 하드코딩 금지). 리터럴 가드 경로(docs/frontend-workflow/**, src/**,
// src/features/**)는 role 이 아니므로 그대로 둔다. expo 프리셋에선 렌더 텍스트가 BYTE-동치.
//   route_entry → src/app/**, api_client → src/api/**, screen → src/features/{domain}/screens/**.
export function modeHintsFor(layout) {
  const g = (role) => layout.roleGlobs(role)[0] || `{roles.${role}}`;
  const routeEntry = g('route_entry');
  const apiClient = g('api_client');
  const screen = g('screen');
  return {
    'docs-only': {
      goal: 'docs/frontend-workflow/** 문서만 정리/작성한다 (src/** 무변경).',
      expectedOutput: 'docs/frontend-workflow/** 문서만 변경; src/** 변경 0 (git diff 로 확인).',
    },
    'route-skeleton': {
      goal: `라우트 엔트리(${routeEntry})만 세운다 (features/** 무접촉).`,
      expectedOutput: `${routeEntry} 라우트 엔트리만 존재; src/features/** 무접촉 (git diff 로 확인).`,
    },
    'screen-skeleton': {
      goal: '라우트에 연결된 화면 shell 만 세운다 (fixture UI·fake hook 없음).',
      expectedOutput: 'WHEN 라우트 진입 THEN 화면 shell 렌더; fixture UI·fake hook 부재.',
    },
    'rough-fixture-ui': {
      goal: `fixture 데이터로 화면을 구동한다 (실제 API 연동·${apiClient} 변경 없음).`,
      expectedOutput: `fixture 데이터로 화면 구동; ${apiClient} 변경 0; fake hook(AsyncState) 계약 충족.`,
    },
    'final-fixture-ui': {
      goal: '확정 ScreenSpec + figma 매핑 기반으로 fixture UI 를 마감한다 (API 미연동).',
      expectedOutput: `figma 매핑 반영된 fixture UI; ${apiClient} 변경 0.`,
    },
    'api-integrated-ui': {
      goal: 'fake hook 내부를 실제 API 로 교체한다 (화면 컴포넌트 무접촉).',
      expectedOutput: `hook 내부 API 연동; ${screen} 무접촉 (fake hook 계약).`,
    },
    'production-ready': {
      goal: 'CI 게이트(lint/schema/state coverage/LLM review)를 모두 통과시킨다.',
      expectedOutput: 'CI 4종 pass; src/** 산출물 완성 (state coverage 포함).',
    },
  };
}

// import 부작용 0(loader 와 동일 불변식): MODE_HINTS 를 모듈 로드 시점에 *eager* 로 만들지 않는다
// (그러면 import 만으로 YAML 파일을 읽게 됨). buildPacketModel 이 주입된 layout(또는 lazy 기본 로드)으로
// modeHintsFor 를 호출한다.

function genericHint(mode) {
  return {
    goal: `\`${mode}\` 천장이 허용하는 산출물 한 가지만 달성한다 (상위 모드 산출물 금지).`,
    expectedOutput: `\`${mode}\` 천장 산출물만; 변경은 Allowed Paths 안에만, allowed 밖 0 (git diff 확인). 상위 모드 UI/연동 없음.`,
  };
}

// 마크다운 표 셀 안전화 (| 만 이스케이프; readiness 글로브/ID 엔 보통 없음).
function cell(s) {
  return String(s == null ? '—' : s).replace(/\|/g, '\\|');
}

// 정규식 메타문자 이스케이프 — decision id 를 부분문자열이 아니라 토큰 경계로 매칭하기 위함.
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// readiness 출력의 allowed/forbidden 글로브에서 도메인을 best-effort 로 추출 (결정적, 추론 아님).
export function extractDomain(entry, explicit) {
  if (explicit && String(explicit).trim()) return String(explicit).trim();
  const paths = [...(entry.allowed_paths || []), ...(entry.forbidden_paths || [])];
  for (const p of paths) {
    const m = /(?:features|domains|screens)\/([^/*]+)\//.exec(String(p));
    if (m && m[1] && m[1] !== '{domain}') return m[1];
  }
  return null;
}

// readiness 출력 blocking[] 을 유형별로 분류 (매핑만 — 새 판정 없음).
export function classifyBlocking(entry) {
  const decisions = [];
  const invalidDecisions = [];
  const facts = [];
  for (const b of entry.blocking || []) {
    if (!b || typeof b !== 'object') continue;
    if (b.open_decision) {
      const d = b.open_decision;
      decisions.push({ id: d.id || '(no-id)', blocking_mode: d.blocking_mode || null, owner: d.owner || null });
      continue;
    }
    if (b.invalid_open_decision) {
      const d = b.invalid_open_decision;
      invalidDecisions.push({ id: d.id || '(no-id)', blocking_mode: d.blocking_mode || null });
      continue;
    }
    const k = Object.keys(b)[0];
    if (k) facts.push({ key: k, value: b[k] });
  }
  return { decisions, invalidDecisions, facts };
}

export function isAbsorbedReadinessEntry(entry) {
  return (
    entry != null &&
    typeof entry === 'object' &&
    entry.readiness_applicable === false &&
    entry.screen_lifecycle === 'absorbed' &&
    entry.readiness_mode === null &&
    typeof entry.absorbed_into === 'string' &&
    entry.absorbed_into.trim() !== ''
  );
}

// requested_mode vs readiness_mode 위치 비교. order 는 policy.order(모드 사다리) — readiness 재계산 아님,
// 순수 "사다리 위치" 비교일 뿐(천장·경로는 readiness 출력에서 옴).
export function compareModes(order, requested, readiness) {
  const has = Array.isArray(order) && order.length > 0;
  const rIdx = has ? order.indexOf(readiness) : -1;
  const qIdx = has ? order.indexOf(requested) : -1;
  const modeKnown = has && rIdx >= 0;
  const requestedKnown = has && qIdx >= 0;
  const overCeiling = requestedKnown && modeKnown && qIdx > rIdx;
  return { has, rIdx, qIdx, modeKnown, requestedKnown, overCeiling };
}

// Ambiguity Review Required 최소 표(4열) 행 생성.
//  - docs-only: 항상 yes.
//  - 1..readinessIdx: yes (readiness 가 이미 통과시킨 천장 이내 — 이 모드를 cap 하는 미해결 Open Decision 없음).
//  - readinessIdx 초과: '—' (평가 생략 — readiness 가 이미 cap).
//  - Blocking 후보 열: blocking_mode 가 그 모드인 Open Decision 을 D-cand 로 표면화(닫지 않음).
function buildAmbiguityRows(order, rIdx, readinessMode, decisions) {
  const byMode = {};
  for (const d of decisions) {
    if (d.blocking_mode) (byMode[d.blocking_mode] = byMode[d.blocking_mode] || []).push(d.id);
  }
  return order.map((mode, i) => {
    const caps = byMode[mode] || [];
    let safe;
    let reason;
    if (i === 0) {
      safe = 'yes';
      reason = '문서만 — 애매함을 여기서 표면화 (항상 yes)';
    } else if (rIdx >= 0 && i <= rIdx) {
      safe = 'yes';
      reason = `\`${readinessMode}\` 천장 이내 — 이 모드를 cap 하는 미해결 Open Decision 없음 (warning-only)`;
    } else {
      safe = '—';
      reason = `상위 모드 — \`${readinessMode}\` 가 이미 cap (평가 생략)`;
      if (caps.length) reason += ` · D-cand ${caps.join(', ')} 가 이 모드 cap`;
    }
    return { mode, safe, reason, candidates: caps.length ? caps.map((id) => `D-cand: ${cell(id)}`).join('<br>') : '—' };
  });
}

export function buildPacketModel(opts) {
  const {
    entry,
    screen,
    requestedMode,
    readinessSource,
    order = [],
    date,
    owner = 'workflow:packet',
    seq = '001',
    ambiguityLink = 'docs/reference/ambiguity-triage.md',
    layout,
  } = opts;
  // 레이아웃 프로파일(tier1): MODE_HINTS 경로 카피를 role 글롭에서 생성한다. 호출부가 주지 않으면
  // 기본 프로파일(expo-feature) 로드 — 토큰화 이전과 BYTE-동치(README §1.1).
  const resolvedLayout = layout || loadLayoutProfile({ kitRoot: KIT_ROOT });

  if (isAbsorbedReadinessEntry(entry)) {
    return {
      packet_id: `WP-${screen}-absorbed-${seq}`,
      packet_type: 'work-packet',
      status: 'draft',
      target_screen: screen,
      domain: opts.domain || null,
      requested_mode: requestedMode,
      readiness_applicable: false,
      screen_lifecycle: 'absorbed',
      readiness_mode: null,
      next_mode: null,
      absorbed_into: entry.absorbed_into,
      absorbed_at: typeof entry.absorbed_at === 'string' ? entry.absorbed_at : null,
      readiness_source: readinessSource,
      created_at: date,
      owner,
      generated_by: 'workflow:packet (PR2 draft generator)',
      allowed_paths: entry.allowed_paths || [],
      forbidden_paths: entry.forbidden_paths || [],
      blocking: classifyBlocking(entry),
      next_actions: entry.next_actions || [],
      order,
      has: Array.isArray(order) && order.length > 0,
      rIdx: -1,
      qIdx: Array.isArray(order) ? order.indexOf(requestedMode) : -1,
      modeKnown: false,
      requestedKnown: Array.isArray(order) && order.includes(requestedMode),
      overCeiling: false,
      ambiguityRows: [],
      warnings: [],
      modeHint: null,
      apiClientGlob: null,
      ambiguityLink,
      non_executable: true,
    };
  }

  const readinessMode = entry.readiness_mode || '(unknown)';
  const nextMode = entry.next_mode || null;
  const domain = extractDomain(entry, opts.domain);
  const blocking = classifyBlocking(entry);
  const cmp = compareModes(order, requestedMode, readinessMode);
  const ambiguityRows = cmp.has ? buildAmbiguityRows(order, cmp.rIdx, readinessMode, blocking.decisions) : [];

  const warnings = [];
  if (!cmp.has) {
    warnings.push(
      'mode ladder(policy.order) 미가용 — Ambiguity 표를 최소(docs-only + readiness_mode)로만 렌더. requested>readiness 비교 생략.',
    );
  }
  if (cmp.has && !cmp.requestedKnown) {
    warnings.push(`requested_mode '${requestedMode}' 가 policy.order 에 없음 — 천장 비교 불가 (경고만).`);
  }
  if (cmp.overCeiling) {
    warnings.push(
      `requested_mode '${requestedMode}' 가 readiness 천장 '${readinessMode}' 초과 — 구현 안 함, 천장 유지 (exit 0, 경고만).`,
    );
  }
  if (blocking.invalidDecisions.length) {
    warnings.push(
      `해석 불가한 Open Decision ${blocking.invalidDecisions.map((d) => d.id).join(', ')} → readiness 가 docs-only 로 고정.`,
    );
  }
  if (cmp.has) {
    // blocking_mode 가 사다리에 없는 D-cand 는 표 후보열에서 빠진다(Blocking Items·요약엔 남음). 외부 readiness 파일 점검용 경고.
    const orderSet = new Set(order);
    const stray = blocking.decisions
      .filter((d) => d.blocking_mode && !orderSet.has(d.blocking_mode))
      .map((d) => `${d.id}(cap ${d.blocking_mode})`);
    if (stray.length) {
      warnings.push(
        `Open Decision ${stray.join(', ')} 의 Blocking Mode 가 policy.order 에 없음 — Ambiguity 표 후보열 생략(Blocking Items·요약엔 표시). 외부 readiness 파일 점검 권장.`,
      );
    }
  }

  const modeHint = modeHintsFor(resolvedLayout)[readinessMode] || genericHint(readinessMode);
  // api_client role 글롭을 모델에 실어 Acceptance/Review prose 가 literal 'src/api/**' 대신 쓰게 한다(MINOR 6).
  // (openapi.yaml 은 role 이 아닌 리터럴 가드라 그대로 둔다 — modeHintsFor 의 리터럴 가드 정책과 일관.)
  const apiClientGlob = resolvedLayout.roleGlobs('api_client')[0] || 'src/api/**';

  return {
    packet_id: `WP-${screen}-${readinessMode}-${seq}`,
    packet_type: 'work-packet',
    status: 'draft',
    target_screen: screen,
    domain,
    requested_mode: requestedMode,
    readiness_mode: readinessMode,
    next_mode: nextMode,
    readiness_source: readinessSource,
    created_at: date,
    owner,
    generated_by: 'workflow:packet (PR2 draft generator)',
    allowed_paths: entry.allowed_paths || [],
    forbidden_paths: entry.forbidden_paths || [],
    blocking,
    next_actions: entry.next_actions || [],
    order,
    ...cmp,
    ambiguityRows,
    warnings,
    modeHint,
    apiClientGlob,
    ambiguityLink,
  };
}

// --- 렌더 -------------------------------------------------------------------

function renderFrontmatter(m) {
  const q = (v) => `"${String(v == null ? '' : v).replace(/"/g, '\\"')}"`;
  return [
    '---',
    `packet_id: ${q(m.packet_id)}`,
    `packet_type: ${q(m.packet_type)}`,
    `status: ${q(m.status)}`,
    `target_screen: ${q(m.target_screen)}`,
    `domain: ${q(m.domain || 'unknown')}`,
    `requested_mode: ${q(m.requested_mode)}`,
    m.readiness_applicable === false
      ? 'readiness_mode: null'
      : `readiness_mode: ${q(m.readiness_mode)}`,
    ...(m.readiness_applicable === false
      ? [
          'readiness_applicable: false',
          `screen_lifecycle: ${q(m.screen_lifecycle)}`,
          `absorbed_into: ${q(m.absorbed_into)}`,
          ...(m.absorbed_at ? [`absorbed_at: ${q(m.absorbed_at)}`] : []),
        ]
      : []),
    `readiness_source: ${q(m.readiness_source)}`,
    `created_at: ${q(m.created_at)}`,
    `owner: ${q(m.owner)}`,
    `generated_by: ${q(m.generated_by)}`,
    '---',
  ].join('\n');
}

function renderAbsorbedPacketMarkdown(m) {
  const out = [];
  out.push(renderFrontmatter(m));
  out.push('');
  out.push('<!--');
  out.push('  정상 ScreenSpec lifecycle 결과: source 는 absorbed provenance 이며 실행 대상이 아니다.');
  out.push('  canonical target 으로 자동 전환하거나 새 구현 범위를 승인하지 않는다.');
  out.push('-->');
  out.push('');
  out.push(`# Non-executable Work Packet: ${m.target_screen} → ${m.absorbed_into}`);
  out.push('');
  out.push('## Lifecycle Redirect');
  out.push(`- source screen: \`${cell(m.target_screen)}\``);
  out.push('- `readiness_applicable: false`');
  out.push('- `screen_lifecycle: absorbed`');
  out.push(`- canonical active screen: \`${cell(m.absorbed_into)}\``);
  if (m.absorbed_at) out.push(`- absorbed_at: \`${cell(m.absorbed_at)}\``);
  out.push('');
  out.push('이 결과는 손상된 readiness나 도구 오류가 아니다. source ScreenSpec에는 authoring/implementation을 수행하지 않는다.');
  out.push('canonical target으로 자동 전환해 실행하지 말고, source와 target을 보고한 뒤 이 실행을 정상 중단한다.');
  out.push('');
  out.push('## Allowed Paths');
  out.push(renderPathsBlock(m.allowed_paths, '# none — absorbed source is non-executable'));
  out.push('');
  out.push('## Forbidden Paths');
  out.push(renderPathsBlock(m.forbidden_paths, '# none — no implementation scope is authorized'));
  out.push('');
  out.push('## Next Actions');
  if (m.next_actions.length) {
    for (const action of m.next_actions) out.push(`- ${action}`);
  } else {
    out.push(`- use canonical screen ${m.absorbed_into}; do not author or implement the absorbed ScreenSpec`);
  }
  out.push('- target 작업이 필요하면 사람이 명시적으로 canonical Screen ID를 대상으로 새 실행을 시작한다.');
  return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '') + '\n';
}

function renderPathsBlock(paths, emptyNote) {
  if (!paths.length) return '```txt\n' + emptyNote + '\n```';
  return '```txt\n' + paths.join('\n') + '\n```';
}

function renderBlockingItems(m) {
  const { decisions, invalidDecisions, facts } = m.blocking;
  const rows = [];
  for (const d of decisions) {
    // 토큰 경계로 매칭 — 부분문자열(.includes)이면 D-1 이 D-10 의 next_action 힌트를 가로챈다.
    const idRe = new RegExp(`(^|\\W)${escapeRegExp(d.id)}(\\W|$)`);
    const hint = m.next_actions.find((a) => typeof a === 'string' && idRe.test(a)) || '—';
    rows.push(`| ${cell(d.id)} | decision | ${cell(hint)} | ${cell(d.blocking_mode || '—')} | ${cell(d.owner || '—')} | 닫지 말 것 (사람만) |`);
  }
  for (const d of invalidDecisions) {
    rows.push(`| ${cell(d.id)} | invalid-decision | 해석 불가 — Status/Blocking Mode 수정 필요 | ${cell(d.blocking_mode || '(none)')} | — | 고치기 전 docs-only 고정 (사람만) |`);
  }
  for (const f of facts) {
    rows.push(`| ${cell(f.key)} | missing-fact | ${cell(f.key)} = ${cell(f.value)} | — | — | 전제 충족 전까지 상위 모드 금지 |`);
  }
  const head =
    '| ID | 유형 | 내용 | Blocking Mode | Owner | 처리 |\n|---|---|---|---|---|---|';
  const body = rows.length
    ? rows.join('\n')
    : '| — | — | 없음 — readiness 출력 `blocking[]` 비어 있음 (현재 천장에서 미해결 항목 없음) | — | — | — |';
  return head + '\n' + body;
}

function renderAmbiguityTable(m) {
  const head =
    '| 모드 | Safe To Proceed? (yes/no) | 사유 | Blocking 후보 (D-cand / U-cand) |\n|---|---|---|---|';
  let rows;
  if (m.ambiguityRows.length) {
    rows = m.ambiguityRows
      .map((r) => `| \`${cell(r.mode)}\` | ${cell(r.safe)} | ${cell(r.reason)} | ${r.candidates} |`)
      .join('\n');
  } else {
    // policy.order 미가용 → 최소 2행만.
    rows = [
      '| `docs-only` | yes | 문서만 — 애매함을 여기서 표면화 (항상 yes) | — |',
      `| \`${cell(m.readiness_mode)}\` | yes | readiness 천장 (policy.order 미가용 — 사다리 미렌더) | — |`,
    ].join('\n');
  }
  return head + '\n' + rows;
}

function renderCandidateSummary(m) {
  const { decisions, invalidDecisions, facts } = m.blocking;
  const lines = [];
  for (const d of decisions) {
    lines.push(`- \`D-cand: ${cell(d.id)}\` — cap \`${cell(d.blocking_mode || '—')}\`, owner ${cell(d.owner || '—')} · 닫지 말 것 (사람만)`);
  }
  for (const d of invalidDecisions) {
    lines.push(`- \`D-cand: ${cell(d.id)}\` — invalid (Blocking Mode \`${cell(d.blocking_mode || '(none)')}\` 해석 불가) · 사람이 수정`);
  }
  for (const f of facts) {
    lines.push(`- \`U-cand: ${cell(f.key)}\` = ${cell(f.value)} — Blocking Mode 미지정(next_actions 참조) · 닫지 말 것 (사람만)`);
  }
  if (!lines.length) {
    return '없음 — readiness 출력에 미해결 Open Decision/Unknown 없음 (이 패스에서 새 후보 0; green ≠ done).';
  }
  return lines.join('\n');
}

function renderNextActions(m) {
  if (!m.next_actions.length) return '';
  return ['', '> next_actions (readiness 출력 그대로 — 이 packet 이 푸는 목록 아님):', ...m.next_actions.map((a) => `> - ${a}`)].join('\n');
}

function renderWarnings(m) {
  if (!m.warnings.length) return '';
  return ['', '> ⚠ 상태/경고 (warning-only — exit 0):', ...m.warnings.map((w) => `> - ${w}`)].join('\n');
}

export function renderPacketMarkdown(m) {
  if (m.readiness_applicable === false) return renderAbsorbedPacketMarkdown(m);

  const ceilingEvidence =
    `readiness 출력 기준 천장 = \`${m.readiness_mode}\`, next_mode = ${m.next_mode ? '`' + m.next_mode + '`' : '— (최상위)'}. ` +
    `상위 진행은 아래 Blocking Items 가 cap (Open Decision ${m.blocking.decisions.length}건 · 미충족 fact ${m.blocking.facts.length}건). 이 표는 소비물이며 재유도하지 않는다.`;

  const out = [];
  out.push(renderFrontmatter(m));
  out.push('');
  out.push('<!--');
  out.push('  이 파일은 `workflow:packet` 이 readiness 출력을 복사해 생성한 Work Packet 초안이다 (PR2 generator).');
  out.push('  새 source of truth/gate 아님 · readiness 재계산 0 · 구현 실행 0 · auto-fix/auto-run 0.');
  out.push('  allowed/forbidden/mode 는 readiness 출력에서 글자 그대로 복사. Open Decision/Unknown/Conflict 는 닫지 않는다(사람-전용).');
  out.push('  통과 ≠ 완료: 봉투 발급은 게이트가 깨끗하다는 뜻일 뿐, 설계 적합성은 사람이 따로 확인한다.');
  out.push('-->');
  out.push('');
  out.push(`# Work Packet: ${m.target_screen} ${m.readiness_mode}`);
  out.push(renderWarnings(m));
  out.push('');
  out.push('## Goal');
  out.push(`이 세션은 \`${m.readiness_mode}\` 안에서 한 가지만 달성한다: ${m.modeHint.goal} (상위 모드 산출물은 목표가 아니다.)`);
  out.push('');
  out.push('## Validity');
  out.push(`- 기준 스냅샷: \`${m.readiness_source}\` (실행/확인 시점: ${m.created_at}).`);
  out.push('- **무효조건 (하나라도 바뀌면 무효 → readiness 재실행 후 재발급):**');
  out.push(`  - [ ] readiness 재실행 결과의 \`readiness_mode\` 가 \`${m.readiness_mode}\` 와 달라짐.`);
  out.push('  - [ ] `readiness_source` 의 mode/facts(천장 근거 fact · allowed/forbidden)가 달라짐.');
  out.push('  - [ ] ScreenSpec `status` 가 readiness 스냅샷 시점과 달라짐.');
  out.push('  - [ ] Blocking Items 의 Open Decision 이 새로 열리거나 닫힘.');
  out.push('  - [ ] `readiness_source` 파일 자체가 갱신됨(날짜/내용 변경).');
  out.push('- 이 packet 은 스냅샷이다. 의심되면 집행 **전** `npm run workflow:readiness` 로 대조한다 (사람 확인 — 자동 차단 아님).');
  out.push('');
  out.push('## Must Read');
  out.push(`- ▶ **여기부터**: \`${m.readiness_source}\` — 이 세션의 게이트 사실(allowed/forbidden/mode)의 출처. readiness 출력.`);
  out.push(`- ScreenSpec (정본): \`docs/frontend-workflow/domains/${m.domain || '{domain}'}/screens/<screen-slug>/screen-spec.md\` — 정확 경로는 screen-inventory 확인 (초안: 링크만).`);
  out.push('- 관련 정책: `frontend-workflow-kit/policies/implementation-mode-policy.yaml`');
  out.push('- (해당 시) Open Decisions / Conflicts: `_meta/decision-log.md` · `_meta/conflicts.md`');
  out.push('');
  out.push('## Readiness Snapshot');
  out.push('| 항목 | 값 |');
  out.push('|---|---|');
  out.push(`| readiness_mode | \`${cell(m.readiness_mode)}\` |`);
  out.push(`| next_mode | ${m.next_mode ? '`' + cell(m.next_mode) + '`' : '— (최상위)'} |`);
  out.push(`| requested_mode | \`${cell(m.requested_mode)}\`${m.overCeiling ? ' — ⚠ 천장 초과 (경고만, exit 0)' : ''} |`);
  out.push(`| 천장 근거 | ${cell(ceilingEvidence)} |`);
  out.push('');
  out.push(`출처: \`${m.readiness_source}\` — \`readiness.mjs\` 출력. 이 표는 소비물이며, 이 packet 에서 다시 유도하지 않는다.`);
  out.push('');
  out.push('## Allowed Paths');
  out.push('<!-- readiness 출력의 allowed_paths 를 글로브 그대로 복사 (손으로 넓히거나 줄이지 않는다). -->');
  out.push(renderPathsBlock(m.allowed_paths, '# (readiness 출력에 allowed_paths 없음)'));
  out.push('');
  out.push('## Forbidden Paths');
  out.push('<!-- readiness 출력의 forbidden_paths 를 그대로 복사. 경계 검증은 validate 가 아니라 diff 로 본다. -->');
  out.push(renderPathsBlock(m.forbidden_paths, '# (readiness 출력에 forbidden_paths 없음)'));
  out.push('');
  out.push('## Blocking Items');
  out.push('<!-- "푸는" 목록이 아니라 "닫지 말 것" 목록. 게이트 해제(resolve/close/confirm)는 모두 사람. -->');
  out.push(renderBlockingItems(m));
  out.push('');
  out.push('> **Blocking Mode** = 이 항목이 cap 하는 모드. decision·missing-fact 는 cap 모드를 갖고, unknown 은 직접 cap 안 하면 `—`. close 는 사람-전용.');
  out.push(renderNextActions(m));
  out.push('');
  out.push('## Ambiguity Review Required');
  out.push('<!-- 코딩 전 먼저 채운다. warning-only 텍스트 — 코드 게이트 아님. 게이트는 readiness(Open Decision)+validate 뿐. -->');
  out.push('<!-- 이 generator 는 의미 추론 0 — readiness 출력만 옮기고, 후보는 "제안"으로만 표면화한다(닫지 않음). -->');
  out.push('');
  out.push(renderAmbiguityTable(m));
  out.push('');
  out.push(`> **Safe To Proceed?** 는 readiness 재계산이 아니다 — 천장은 항상 \`${m.readiness_mode}\` 이고, 이 표는 그 아래에서 **더 보수적으로만** 멈출 수 있다(게이트를 *올리지* 못함). 아래에서 위로 훑어 'no' 직전에서 멈춘다(=HALT_AMBIGUITY). \`${m.readiness_mode}\` 위 모드는 readiness 가 이미 cap 했으므로 평가하지 않는다.`);
  out.push('> **Blocking 후보**(D-cand/U-cand)는 *제안*일 뿐 — 닫거나 ScreenSpec 에 확정하는 것은 사람.');
  out.push('');
  out.push('**Blocking 후보 (warning-only — 닫지 말 것, 사람-전용):**');
  out.push(renderCandidateSummary(m));
  out.push('');
  out.push(`> Compact triage rules 와 mode별 \`Safe To Proceed?\` stop 기준은 → [${m.ambiguityLink}](${m.ambiguityLink}).`);
  out.push('> D-cand/U-cand 는 advisory 후보일 뿐이며, ScreenSpec/Open Decisions 에 확정하거나 닫는 일은 사람 몫이다.');
  out.push('');
  out.push('## Expected Output');
  out.push(`${m.modeHint.expectedOutput} 변경은 Allowed Paths 안에만, allowed 밖 0 (git diff 로 확인). 상위 모드 산출물(예: API 연동)은 정답이 아니다.`);
  out.push('');
  out.push('## Out of Scope');
  out.push('- Open Decision resolve / Conflict close / Unknown close — 금지 (사람만).');
  out.push('- candidate → confirmed 승격 — 금지 (사람만).');
  out.push('- API endpoint 발명, copy 문구 발명, design value 발명 — 금지. 막히면 ScreenSpec Unknowns / Open Decisions / `conflicts.md` 에 남긴다.');
  out.push('- generated file(`_meta/*.yaml`, `component-catalog.md` 등) · confirmed 산출물 hand-edit — 금지.');
  out.push(`- \`${m.next_mode || '(상위)'}\` 이상 상위 모드 산출물 — 금지 (천장은 \`${m.readiness_mode}\`).`);
  out.push('- ScreenSpec 대체 / readiness.mjs 대체 — 금지 (이 packet 은 인덱스일 뿐).');
  out.push('- allowed_paths 밖 작업 — 현재 세션에서 처리하지 않는다. 필요하면 Run Report 의 `## Discovered Work` 에 `scope-extension-request` 또는 `follow-up` 으로 기록한다(record-only/advisory, gate 아님).');
  out.push('- shared helper / refactor / shared-contract / architecture role 확장 — 별도 Work Packet 또는 사람 승인 후 layout/policy 변경으로만 다룬다.');
  out.push('');
  out.push('## Commands');
  out.push('```bash');
  out.push('npm run workflow:state       # workflow-state.yaml 재생성 (소스 무수정)');
  out.push('npm run workflow:readiness   # 화면별 readiness_mode 재산출 (판정 단일 출처)');
  out.push('npm run workflow:validate    # 스키마/구조 검사 (exit 0 = 통과)');
  out.push('```');
  out.push('<!-- 경계(allowed/forbidden) 검증은 validate 가 아니라 diff 로 본다 — Acceptance Criteria 참조. -->');
  out.push('');
  out.push('## Acceptance Criteria');
  out.push('- [ ] 변경 파일이 Allowed Paths(readiness 출력) 안에만 존재 — `git diff --name-only` 로 확인.');
  out.push(`- [ ] Forbidden Paths 무접촉 (특히 \`${m.apiClientGlob}\` · \`openapi.yaml\` 에 한 줄도 닿지 않음).`);
  out.push(`- [ ] 모드 천장(\`${m.readiness_mode}\`) 초과 산출물 없음 (상위 모드 UI/연동 욱여넣기 금지).`);
  out.push('- [ ] Blocking Items 의 결정/Unknown/Conflict 가 그대로 열려 있음 (이 세션이 닫지 않음).');
  out.push('- [ ] `npm run workflow:validate` exit 0, 재실행 멱등 (재생성물 외 빈 diff).');
  out.push('');
  out.push('## Review Checklist');
  out.push(`- [ ] **Pre-Implementation Review** — Ambiguity Review Required 의 \`Safe To Proceed?\` 가 \`${m.readiness_mode}\` 까지 검토됐고(빈 표면은 "없음—사유"), Validity 전제(readiness_source mode/facts) 무변경, Blocking 후보(D-cand/U-cand)가 분류돼 그대로 열림(이 세션이 닫지 않음).`);
  out.push(`- [ ] **게이트 판독** — readiness_mode/allowed/forbidden 이 \`${m.readiness_source}\` 와 글자 일치 (재계산·hand-edit 없음).`);
  out.push(`- [ ] **경로 준수** — diff 가 allowed 안에만, forbidden(특히 \`${m.apiClientGlob}\`) 무접촉.`);
  out.push(`- [ ] **천장 미초과** — \`${m.readiness_mode}\` 가 허용하는 산출물만 (과구현 없음).`);
  out.push('- [ ] **미확정 미발명** — API/copy/design value 추측 없음, tbd 행 그대로.');
  out.push('- [ ] **결정 미닫힘** — Open Decision/Conflict/Unknown 상태 보존 (사람-전용 불변식).');
  out.push('- [ ] **보고·멱등** — blocker 는 readiness 의 `blocking`/`next_actions` 그대로 보고, 재실행 최소 diff.');
  out.push('');
  // 연속 빈 줄 정리 (warning/next_actions 가 비면 '' 가 겹칠 수 있음).
  return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '') + '\n';
}

export function renderJsonEnvelope(m) {
  if (m.readiness_applicable === false) {
    return {
      packet_id: m.packet_id,
      target_screen: m.target_screen,
      domain: m.domain,
      requested_mode: m.requested_mode,
      readiness_applicable: false,
      screen_lifecycle: m.screen_lifecycle,
      readiness_mode: null,
      next_mode: null,
      absorbed_into: m.absorbed_into,
      ...(m.absorbed_at ? { absorbed_at: m.absorbed_at } : {}),
      allowed_paths: m.allowed_paths,
      forbidden_paths: m.forbidden_paths,
      non_executable: true,
      over_ceiling: false,
      mode_known: false,
      readiness_source: m.readiness_source,
      out: m.out || null,
      blocking_count: 0,
      d_cand: [],
      u_cand: [],
      next_actions: m.next_actions,
      safe_to_proceed: 'not applicable — absorbed source is non-executable; canonical target is a redirect hint, not an automatic scope switch',
      warnings: m.warnings,
    };
  }
  return {
    packet_id: m.packet_id,
    target_screen: m.target_screen,
    domain: m.domain,
    requested_mode: m.requested_mode,
    readiness_mode: m.readiness_mode,
    next_mode: m.next_mode,
    over_ceiling: !!m.overCeiling,
    mode_known: !!m.modeKnown,
    readiness_source: m.readiness_source,
    out: m.out || null,
    blocking_count: m.blocking.decisions.length + m.blocking.invalidDecisions.length + m.blocking.facts.length,
    d_cand: [...m.blocking.decisions, ...m.blocking.invalidDecisions].map((d) => d.id),
    u_cand: m.blocking.facts.map((f) => f.key),
    safe_to_proceed: 'warning-only (packet 의 Ambiguity Review Required 참조 — exit code 는 게이트 아님)',
    warnings: m.warnings,
  };
}

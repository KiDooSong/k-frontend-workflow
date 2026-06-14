// workflow-report.mjs (lib) — Run Report 초안의 순수 파서 + 모델 + 렌더러.
// 이 모듈은 수집된 evidence 를 run-report.template.md 구조로 "옮기기만" 한다.
// I/O 없음 · process.exit 없음 · 서브프로세스 없음 · 합격/승인 판정 없음.
//
// 불변식 (pr-plan §6, run-report.template.md, ambiguity-triage.md):
//  - Run Report 는 승인서도 merge gate 도 아니다 — evidence bundle(증거 묶음)이다.
//  - readiness_source / blocking / next_actions 는 packet(=readiness 출력)에서 글자 그대로 인용 (재계산·재유도 금지).
//  - Open Decision / Unknown / Conflict 를 닫거나 candidate→confirmed 로 올리지 않는다 (사람-전용).
//  - 도구 결과(validate/forbidden/test/check-generated)가 fail 이어도 그것은 *기록되는 evidence* 일 뿐,
//    이 Run Report 의 생성 성공/실패나 merge 판정으로 바뀌지 않는다.
//  - check-generated 결과는 advisory evidence 로만 첨부한다 (새 hard gate 아님 — warning-first 유지).
//  - review-artifact 는 advisory Review Evidence 로만 붙인다 (review_summary 를 merge check 에 배선 금지).
//
// 어휘 가드: 'verdict'/'approve'/'blocked' 를 능동 판정 용어로 쓰지 않는다 — evidence/collected/
//           review_summary / Open Decision / HALT 를 쓴다.

// --- 작은 헬퍼 -------------------------------------------------------------
// 마크다운 표 셀 안전화 (| 만 이스케이프).
export function cell(s) {
  return String(s == null ? '—' : s).replace(/\|/g, '\\|');
}
function q(v) {
  // YAML double-quoted scalar: 역슬래시를 먼저, 그다음 따옴표를 이스케이프해야 유효 YAML 이 된다
  // (Windows 역슬래시 경로가 readiness_source 등에 섞여도 frontmatter 파싱이 깨지지 않게).
  return `"${String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
export function toPosix(p) {
  return String(p == null ? '' : p).replace(/\\/g, '/');
}
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function stripTicks(s) {
  return s == null ? null : String(s).replace(/`/g, '').trim();
}

// --- packet(=readiness 출력) 파서 (순수 문자열) ---------------------------
// 본문에서 `## <heading>` 섹션 본문을 잘라낸다 (다음 `## ` 전까지, 선두 HTML 주석 제거).
export function extractSection(body, heading) {
  const lines = String(body == null ? '' : body).split(/\r?\n/);
  const startRe = new RegExp('^##\\s+' + escapeRegExp(heading) + '\\s*$');
  let i = lines.findIndex((l) => startRe.test(l));
  if (i === -1) return null;
  const out = [];
  for (let j = i + 1; j < lines.length; j++) {
    if (/^##\s+/.test(lines[j])) break;
    out.push(lines[j]);
  }
  let text = out.join('\n').replace(/^\s*\n/, '');
  text = text.replace(/^<!--[\s\S]*?-->\s*\n?/, '');
  return text.replace(/\s+$/, '');
}

// 섹션 안의 첫 ```txt 코드블록에서 비어있지 않은 줄(글로브)만 뽑는다.
// generator 는 raw 글로브를 \n 으로 join 한다 — `#` 로 시작하는 줄은 빈-센티넬뿐이라 제외.
export function extractFencedTxt(sectionText) {
  if (sectionText == null) return [];
  const m = /```txt\r?\n([\s\S]*?)```/.exec(sectionText);
  if (!m) return [];
  return m[1]
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.trim() && !l.trim().startsWith('#'));
}

// Readiness Snapshot 표에서 next_mode / 천장 근거를 best-effort 로 읽는다 (재계산 아님, 표면화).
export function extractReadinessSnapshot(body) {
  const sec = extractSection(body, 'Readiness Snapshot') || '';
  const grab = (label) => {
    const re = new RegExp('^\\|\\s*' + escapeRegExp(label) + '\\s*\\|\\s*(.+?)\\s*\\|\\s*$', 'm');
    const m = re.exec(sec);
    return m ? m[1].trim() : null;
  };
  return { next_mode: stripTicks(grab('next_mode')), ceiling: grab('천장 근거') };
}

// Blocking Items 섹션의 데이터 행을 유형별로 센다 (표면화 — 판정 아님). 빈-센티넬 감지.
export function summarizeBlocking(raw) {
  const text = String(raw == null ? '' : raw);
  const empty = /없음 — readiness 출력/.test(text);
  let decisions = 0;
  let facts = 0;
  let invalid = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!/^\|/.test(line)) continue;
    if (/^\|\s*-{2,}/.test(line)) continue; // |---|---| 구분선
    const cols = line.split('|').map((c) => c.trim());
    const type = (cols[2] || '').toLowerCase();
    if (type === 'decision') decisions++;
    else if (type === 'invalid-decision') invalid++;
    else if (type === 'missing-fact') facts++;
  }
  return { decisions, facts, invalid, total: decisions + facts + invalid, empty };
}

// next_actions 블록쿼트의 `> - ...` 줄을 그대로(verbatim) 뽑는다.
export function extractNextActions(body) {
  const sec = extractSection(body, 'Blocking Items') || '';
  const idx = sec.indexOf('next_actions');
  if (idx === -1) return [];
  const out = [];
  for (const line of sec.slice(idx).split(/\r?\n/)) {
    const m = /^>\s*-\s*(.+)$/.exec(line);
    if (m) out.push(m[1].trim());
  }
  return out;
}

// readiness_source 문자열에서 --docs 값을 best-effort 추출 (docs 자동 유도용).
export function docsFromReadinessSource(readinessSource) {
  // `--docs <dir>` 또는 `--docs=<dir>` — 다음 ` --` 플래그(또는 문자열 끝)까지 잡아 공백 포함 경로도 보존.
  const m = /--docs[ =]+(.+?)(?:\s+--|\s*$)/.exec(String(readinessSource == null ? '' : readinessSource));
  return m ? m[1].trim() : null;
}

// --- diff(name-status) 파서 (순수 문자열) ---------------------------------
// `git diff --name-status -M` 텍스트를 ADDED/MODIFIED/REMOVED 등으로 분류한다.
// 판정 아님 — 표면화만. forbidden-paths 가 쓰는 입력과 같은 형식.
export function parseNameStatus(text) {
  const added = [];
  const modified = [];
  const removed = [];
  const renamed = [];
  const typeChanged = [];
  for (const lineRaw of String(text == null ? '' : text).split(/\r?\n/)) {
    const line = lineRaw.replace(/\s+$/, '');
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const status = (parts[0] || '').trim();
    if (!status) continue;
    const code = status[0];
    if (code === 'A') added.push(parts[1]);
    else if (code === 'M') modified.push(parts[1]);
    else if (code === 'D') removed.push(parts[1]);
    else if (code === 'R') renamed.push({ from: parts[1], to: parts[2], score: status.slice(1) });
    else if (code === 'C') added.push(parts[2] || parts[1]); // copy: 새 경로가 write
    else if (code === 'T') typeChanged.push(parts[1]);
    else modified.push(parts[1] || status); // 미지 상태 → write 로 보수 처리
  }
  const total = added.length + modified.length + removed.length + renamed.length + typeChanged.length;
  return { added, modified, removed, renamed, typeChanged, total, empty: total === 0 };
}

// --- review-artifact 파서 (순수 문자열) -----------------------------------
// ```yaml findings: ``` 블록에서 severity 별 개수를 센다 (advisory — 판정 아님).
export function parseFindings(reviewBody) {
  const m = /```yaml\r?\n([\s\S]*?)```/.exec(String(reviewBody == null ? '' : reviewBody));
  const bySeverity = {};
  let count = 0;
  if (m) {
    const re = /(^|\n)\s*-\s*severity:\s*["']?([a-z-]+)/g;
    let mm;
    while ((mm = re.exec(m[1]))) {
      count++;
      const s = mm[2];
      bySeverity[s] = (bySeverity[s] || 0) + 1;
    }
  }
  return { count, bySeverity };
}

// --- 모델 빌드 -------------------------------------------------------------
// 모든 입력은 이미 파싱/수집된 값(순수). 여기서 표시용 파생값만 계산한다.
export function buildReportModel(opts) {
  const {
    packet = {}, // { frontmatter, body, allowedPaths, forbiddenPaths, blockingRaw, nextActions, snapshot }
    paths = {}, // { packetRel, outRel, docs, src, diffRel, reviewRel }
    diff = null, // parseNameStatus 결과 또는 null(미제공)
    diffProvided = false,
    validate = null, // 정규화된 도구 결과
    forbidden = null,
    idempotency = null, // test-fixtures 결과
    checkgen = null,
    review = null, // { frontmatter, findings } 또는 null
    date,
    seq = '001',
    generatedBy = 'workflow:report (PR3 evidence collector)',
  } = opts;

  const fm = packet.frontmatter || {};
  const targetScreen = fm.target_screen || '(unknown)';
  const readinessMode = fm.readiness_mode || '(unknown)';
  const snapshot = packet.snapshot || { next_mode: null, ceiling: null };
  const blockingSummary = summarizeBlocking(packet.blockingRaw);

  // collector 레벨 메모(경고 아님 — 수집 한계 표면화).
  const notes = [];
  if (!diffProvided) {
    notes.push('diff 미제공(--diff 없음) — Files Changed/Diff Summary 는 "완전 빈 diff"로, forbidden-paths 는 미수집으로 둔다(경계는 diff 로 판정).');
  }
  if (forbidden && forbidden.status === 'error') {
    notes.push(`forbidden-paths 실행 결과를 얻지 못함 (exit=${forbidden.exitCode == null ? '?' : forbidden.exitCode}) — evidence 로만 기록.`);
  }
  if (validate && validate.status === 'error') {
    notes.push(`validate 실행 결과를 얻지 못함 (exit=${validate.exitCode == null ? '?' : validate.exitCode}) — evidence 로만 기록(게이트 아님).`);
  }

  return {
    run_id: `RR-${targetScreen}-${readinessMode}-${seq}`,
    packet_id: fm.packet_id || `WP-${targetScreen}-${readinessMode}-${seq}`,
    target_screen: targetScreen,
    domain: fm.domain || 'unknown',
    requested_mode: fm.requested_mode || '(unknown)',
    readiness_mode: readinessMode,
    next_mode: snapshot.next_mode,
    ceiling_evidence: snapshot.ceiling,
    readiness_source: fm.readiness_source || '(unknown)',
    created_at: date,
    fixture: paths.packetRel || '(packet)',
    packet_rel: paths.packetRel || '(packet)',
    out_rel: paths.outRel || null,
    docs: paths.docs || null,
    src: paths.src || null,
    diff_rel: paths.diffRel || null,
    review_rel: paths.reviewRel || null,
    allowed_paths: packet.allowedPaths || [],
    forbidden_paths: packet.forbiddenPaths || [],
    blocking_raw: packet.blockingRaw || '',
    blocking_summary: blockingSummary,
    next_actions: packet.nextActions || [],
    diff,
    diff_provided: diffProvided,
    validate,
    forbidden,
    idempotency,
    checkgen,
    review,
    notes,
    generated_by: generatedBy,
  };
}

// --- 도구 결과 → 한 줄 라벨 (수집 보고일 뿐 — 합격 선고 아님) ------------
function validateLabel(v) {
  if (!v) return '⏳ 미수집';
  if (v.status === 'skipped') return 'ⓘ 건너뜀';
  if (v.status === 'error') return `⏳ 미수집 — 실행 불가 (exit=${v.exitCode == null ? '?' : v.exitCode})`;
  const errs = (v.errors || []).length;
  const warns = (v.warnings || []).length;
  return `ⓘ validate 보고: ok=${v.ok} (errors ${errs}, warnings ${warns}) — evidence`;
}
function forbiddenLabel(f) {
  if (!f) return '⏳ 미수집';
  if (f.status === 'not-collected') return `⏳ 미수집 — ${f.reason || 'no --diff'}`;
  if (f.status === 'error') return `⏳ 미수집 — 실행 불가 (exit=${f.exitCode == null ? '?' : f.exitCode})`;
  const n = (f.violations || []).length;
  return `ⓘ forbidden-paths 보고: ok=${f.ok} (violations ${n}) — evidence`;
}
function idempotencyLabel(t) {
  if (!t) return '⏳ 미수집';
  if (t.status === 'skipped') return 'ⓘ 건너뜀 (--skip-tests)';
  if (t.status === 'error') return `⏳ 미수집 — 실행 불가 (exit=${t.exitCode == null ? '?' : t.exitCode})`;
  return `ⓘ test-fixtures 보고: ok=${t.ok} — evidence`;
}
function checkgenLabel(c) {
  if (!c) return '⏳ 미수집';
  if (c.status === 'error') return `⏳ 미수집 — 실행 불가 (exit=${c.exitCode == null ? '?' : c.exitCode})`;
  const bad = (c.results || []).filter((r) => r && r.status !== 'ok' && r.status !== 'skip').length;
  return `ⓘ check-generated 보고(advisory): ok=${c.ok} (비-ok ${bad}) — evidence-only`;
}
function diffLabel(m) {
  if (!m.diff_provided) return '⏳ 미수집 — no --diff (완전 빈 diff 로 간주)';
  if (m.diff && m.diff.empty) return 'ⓘ 완전 빈 diff (added/modified/removed 모두 none)';
  const d = m.diff || { added: [], modified: [], removed: [], renamed: [], typeChanged: [] };
  return `ⓘ diff: +${d.added.length} ~${d.modified.length} -${d.removed.length} (rename ${d.renamed.length})`;
}
function reviewLabel(r) {
  if (!r) return 'ⓘ 리뷰 전 (Review Artifact 미생성)';
  const fmr = r.frontmatter || {};
  return `ⓘ review_summary=${fmr.review_summary || '?'} (advisory)`;
}

// --- 렌더 ------------------------------------------------------------------
function renderFrontmatter(m) {
  return [
    '---',
    `title: ${q(m.packet_id + ' Run Report (evidence draft)')}`,
    `status: ${q('draft')}`,
    `kind: ${q('run-report')}`,
    `run_id: ${q(m.run_id)}`,
    `packet_id: ${q(m.packet_id)}`,
    `fixture: ${q(m.fixture)}`,
    `readiness_source: ${q(m.readiness_source)}`,
    `date: ${q(m.created_at)}`,
    `generated_by: ${q(m.generated_by)}`,
    '---',
  ].join('\n');
}

function renderPathsBlock(paths, emptyNote) {
  if (!paths.length) return '```txt\n' + emptyNote + '\n```';
  return '```txt\n' + paths.join('\n') + '\n```';
}

function renderFilesChanged(m) {
  if (!m.diff_provided) return '- 변경 미수집 — `--diff` 미제공 (완전 빈 diff 로 간주). 변경 집합은 diff 로 본다.';
  const d = m.diff;
  if (!d || d.empty) return '- 변경 파일 없음 — 완전 빈 diff (거절/무변경이 정답일 수 있음).';
  const lines = [];
  for (const p of d.added) lines.push(`- \`${toPosix(p)}\` — ADDED`);
  for (const p of d.modified) lines.push(`- \`${toPosix(p)}\` — MODIFIED`);
  for (const p of d.removed) lines.push(`- \`${toPosix(p)}\` — REMOVED`);
  for (const r of d.renamed) lines.push(`- \`${toPosix(r.from)}\` → \`${toPosix(r.to)}\` — RENAMED`);
  for (const p of d.typeChanged) lines.push(`- \`${toPosix(p)}\` — TYPECHANGE`);
  return lines.join('\n');
}

function renderDiffSummary(m) {
  if (!m.diff_provided) {
    return '```txt\n(diff 미제공 — --diff 없음. 변경 집합 미수집, 완전 빈 diff 로 간주)\n```';
  }
  const d = m.diff || { added: [], modified: [], removed: [], renamed: [], typeChanged: [] };
  if (d.empty) {
    return '```txt\nADDED:\n  (none)\nMODIFIED:\n  (none)\nREMOVED:\n  (none)\n```\nrun diff **완전 빈 diff**(added/modified/removed 모두 none).';
  }
  const block = (label, arr, fmtFn) => {
    if (!arr.length) return `${label}:\n  (none)`;
    return `${label}:\n${arr.map((x) => '  ' + fmtFn(x)).join('\n')}`;
  };
  const out = [
    '```txt',
    block('ADDED', d.added, (p) => toPosix(p)),
    block('MODIFIED', d.modified, (p) => toPosix(p)),
    block('REMOVED', d.removed, (p) => toPosix(p)),
  ];
  if (d.renamed.length) out.push(block('RENAMED', d.renamed, (r) => `${toPosix(r.from)} -> ${toPosix(r.to)}`));
  if (d.typeChanged.length) out.push(block('TYPECHANGE', d.typeChanged, (p) => toPosix(p)));
  out.push('```');
  return out.join('\n');
}

function renderCommandsRun(m) {
  const lines = ['```bash'];
  if (m.validate && m.validate.invocation) {
    lines.push(`${m.validate.invocation}   # exit ${m.validate.exitCode == null ? '?' : m.validate.exitCode} (${m.validate.status})`);
  } else {
    lines.push('# validate: 미수집');
  }
  if (m.forbidden && m.forbidden.invocation) {
    lines.push(`${m.forbidden.invocation}   # exit ${m.forbidden.exitCode == null ? '?' : m.forbidden.exitCode} (${m.forbidden.status})`);
  } else {
    lines.push(`# forbidden-paths: 미수집 (${m.forbidden && m.forbidden.reason ? m.forbidden.reason : 'no --diff'})`);
  }
  if (m.idempotency && m.idempotency.invocation) {
    lines.push(`${m.idempotency.invocation}   # exit ${m.idempotency.exitCode == null ? '?' : m.idempotency.exitCode} (${m.idempotency.status})`);
  } else {
    lines.push(`# test-fixtures: 미수집 (${m.idempotency && m.idempotency.reason ? m.idempotency.reason : 'skipped'})`);
  }
  if (m.checkgen && m.checkgen.invocation) {
    lines.push(`${m.checkgen.invocation}   # exit ${m.checkgen.exitCode == null ? '?' : m.checkgen.exitCode} (advisory)`);
  } else {
    lines.push('# check-generated-files: 미수집 (advisory)');
  }
  lines.push('```');
  lines.push('<!-- exit code 는 수집 보고일 뿐 — 게이트/판정이 아니다. -->');
  return lines.join('\n');
}

function renderGateCompliance(m) {
  const forbiddenEvidence =
    m.forbidden && (m.forbidden.status === 'pass' || m.forbidden.status === 'fail')
      ? `forbidden-paths 보고 ok=${m.forbidden.ok} (violations ${(m.forbidden.violations || []).length}) — diff 기준`
      : `미수집 (${m.forbidden && m.forbidden.reason ? m.forbidden.reason : 'no --diff'}) — 경계는 diff 로 판정`;
  const head = '| 하드룰 | 확인 | 근거 (evidence) |\n|---|---|---|';
  const rows = [
    `| examples 원본 무수정 | ⏳ | ${cell('아래 ## Diff Summary 참조 — diff 기준 사람 확인 (collector 미판정)')} |`,
    `| API endpoint 발명 금지 (src/api/** · openapi.yaml) | ⏳ | ${cell(forbiddenEvidence)} |`,
    `| Open Decision/Conflict/Unknown 미닫힘 | ✅ | ${cell('Blockers Reported 를 그대로 인용 — collector 는 닫지/올리지 않음 (사람-전용 불변식)')} |`,
    `| readiness gate 무시 금지 | ✅ | ${cell('readiness_source 그대로 인용, 재계산 0 (## Readiness Used)')} |`,
  ];
  return [
    head,
    rows.join('\n'),
    '',
    '> ✅=collector 불변식상 보장(인용·무재계산·무수정), ⏳=diff/사람 확인 필요. 이 표는 evidence 포인터일 뿐 — 하드룰 최종 확인은 Review Artifact + 사람.',
  ].join('\n');
}

function renderBlockersReported(m) {
  if (m.blocking_summary.empty || (!m.blocking_raw || !m.blocking_raw.trim())) {
    return 'blocker 없음 — readiness 출력 `blocking[]` 비어 있음 (현재 천장에서 미해결 항목 없음). green ≠ done.';
  }
  const out = [
    '> readiness 의 `blocking`/`next_actions` 를 그대로 인용한다 (자체 추론 0 — collector 는 닫지/올리지 않음).',
    '',
    m.blocking_raw.replace(/\s+$/, ''),
  ];
  return out.join('\n');
}

function renderReviewEvidence(m) {
  if (!m.review) {
    return [
      '- Review Artifact: **(리뷰 전 — 미생성)**. 이 Run Report 는 collector 가 최초 생성한 evidence 초안이라 리뷰 evidence 가 아직 없다.',
      '- ⚠ 순서(순환 의존 회피): Review Artifact 가 이 Run Report 를 입력으로 리뷰한다 → 리뷰 후 이 섹션을 advisory 로 덧붙인다(post-review append).',
    ].join('\n');
  }
  const fmr = m.review.frontmatter || {};
  const f = m.review.findings || { count: 0, bySeverity: {} };
  const sevStr = Object.keys(f.bySeverity).length
    ? Object.entries(f.bySeverity).map(([k, v]) => `${k}:${v}`).join(', ')
    : '없음';
  return [
    `- Review Artifact: \`${cell(m.review_rel || '(review)')}\` / review_summary: **${cell(fmr.review_summary || '?')}** (advisory)`,
    `- review_status: \`${cell(fmr.review_status || 'advisory')}\` · human_action_required: ${cell(fmr.human_action_required)} · reviewer: ${cell(fmr.reviewer || '—')}`,
    `- findings 수: ${f.count} (severity 별: ${sevStr}; blocker-candidate ≠ blocker)`,
    '- ⚠ review_summary 가 needs-human-decision 이어도 이 Run Report 는 머지를 자동 차단하지 않는다 — 머지 결정은 사람. (review 결과를 merge check 에 배선하지 않음.)',
  ].join('\n');
}

function renderIdempotency(m) {
  const lines = [];
  const t = m.idempotency;
  if (!t) lines.push('- 재실행/픽스처 회귀: 미수집.');
  else if (t.status === 'skipped') lines.push('- 재실행/픽스처 회귀: 건너뜀 (`--skip-tests`).');
  else if (t.status === 'error') lines.push(`- 재실행/픽스처 회귀: 실행 불가 (exit=${t.exitCode == null ? '?' : t.exitCode}) — evidence 로만 기록.`);
  else lines.push(`- 재실행/픽스처 회귀(test-fixtures): \`ok=${t.ok}\` — ${cell(t.summary || '')}. (재실행=witness, 게이트 아님)`);

  const c = m.checkgen;
  if (!c) lines.push('- 생성물 표류(check-generated, advisory): 미수집.');
  else if (c.status === 'error') lines.push(`- 생성물 표류(check-generated, advisory): 실행 불가 (exit=${c.exitCode == null ? '?' : c.exitCode}).`);
  else {
    const bad = (c.results || []).filter((r) => r && r.status !== 'ok' && r.status !== 'skip');
    const detail = bad.length ? bad.map((r) => `${r.id}:${r.status}`).join(', ') : '비-ok 0';
    lines.push(`- 생성물 표류(check-generated, advisory — 새 gate 아님): \`ok=${c.ok}\` (${detail}). warning-first — evidence 로만 첨부.`);
  }
  lines.push('<!-- ⚠ MVP-C 종속: 재생성 화이트리스트/빈-diff 정의는 generated-file guard 확정 후 정렬. 지금은 라벨만. -->');
  return lines.join('\n');
}

function renderFollowup(m) {
  const lines = [];
  if (m.next_actions.length) {
    lines.push('> next_actions (readiness 출력 재표면화 — verbatim 원본은 ## Blockers Reported; 게이트 해제는 사람-전용):');
    for (const a of m.next_actions) lines.push(`> - ${a}`);
  } else {
    lines.push('- readiness next_actions 없음 — 현재 천장에서 후속 차단 항목 미표면화.');
  }
  lines.push('- Open Decision / Unknown / Conflict 의 resolve·close·candidate→confirmed 승격은 **사람-전용**. collector/리뷰어가 닫지 않는다.');
  return lines.join('\n');
}

export function renderReportMarkdown(m) {
  const out = [];
  out.push(renderFrontmatter(m));
  out.push('');
  out.push('<!--');
  out.push('  이 파일은 `workflow:report` 가 수집한 evidence 로 채운 Run Report 초안이다 (PR3 evidence collector).');
  out.push('  승인서/merge gate 아님 · evidence bundle 임 · 재계산 0 · auto-fix/auto-retry 0.');
  out.push('  readiness_source/blocking/next_actions 는 packet(=readiness 출력)에서 글자 그대로 인용. Open Decision 은 닫지 않는다(사람-전용).');
  out.push('  도구 결과가 fail 이어도 evidence 로 기록될 뿐, 이 보고서의 생성 성공/머지 판정으로 바뀌지 않는다.');
  out.push('-->');
  out.push('');
  out.push(`# Run Report: ${m.packet_id}`);
  out.push('');
  out.push(
    `이 Run Report 는 \`workflow:report\` 가 Work Packet \`${m.packet_id}\` 기준으로 git diff·validate·forbidden-paths·test-fixtures·check-generated 결과와 readiness blocker 를 수집해 채운 **evidence 초안**이다. 승인·머지·합격 판정 아님 — 다음 행동은 사람/구현자가 정한다.`,
  );
  out.push(`- 대상 Work Packet: \`${m.packet_rel}\` (packet_id = ${m.packet_id})`);
  out.push(`- 게이트 단일 출처: \`${m.readiness_source}\` (readiness 출력 — 재계산 0)`);
  out.push(`- 수집 docs/src: \`${toPosix(m.docs || '—')}\` / \`${toPosix(m.src || '—')}\``);
  out.push('- ⚠ 이 파일은 evidence bundle 이다 — exit code·아래 어떤 표도 merge gate 가 아니다.');
  if (m.notes.length) {
    out.push('');
    out.push('> ⚠ 수집 메모 (한계 표면화 — 경고일 뿐, 게이트 아님):');
    for (const n of m.notes) out.push(`> - ${n}`);
  }
  out.push('');
  out.push('## Summary');
  out.push('<!-- 수집된 evidence 인덱스일 뿐 — 합격/불합격 선고가 아니다. 채점(rubric)·승인은 Review Artifact + 사람 몫. -->');
  out.push('> ✅=collector 불변식상 보장(인용·무재계산), ⓘ=수집된 도구 보고(그 자체로 판정 아님), ⏳=diff/사람 확인 필요.');
  out.push('');
  out.push('| Evidence | 내용 | 출처 섹션 | 수집 결과 |');
  out.push('|---|---|---|---|');
  out.push(`| ① readiness_source | 어떤 readiness 를 봤나 | ## Readiness Used | ✅ 인용(재계산 0) |`);
  out.push(`| ② diff summary | 무엇을 바꿨나 | ## Diff Summary | ${cell(diffLabel(m))} |`);
  out.push(`| ③ validate | 구조 검사 | ## Commands Run | ${cell(validateLabel(m.validate))} |`);
  out.push(`| ④ forbidden-paths | 경계(diff 기준) | ## Gate Compliance | ${cell(forbiddenLabel(m.forbidden))} |`);
  out.push(`| ⑤ idempotency/test | 재실행·픽스처 | ## Idempotency | ${cell(idempotencyLabel(m.idempotency))} |`);
  out.push(`| ⑥ blockers | 왜 멈췄나 | ## Blockers Reported | ✅ verbatim 인용 |`);
  out.push(`| (＋) check-generated | 생성물 표류(advisory) | ## Idempotency | ${cell(checkgenLabel(m.checkgen))} |`);
  out.push(`| (＋) review | 리뷰(advisory) | ## Review Evidence | ${cell(reviewLabel(m.review))} |`);
  out.push('');
  out.push('> 이 표는 **수집 요약**이다 — 합격선고/승인이 아니다. 게이트는 readiness(Open Decision)+validate 뿐.');
  out.push('');
  out.push('## Evidence (사용자-facing 증거 6개)');
  out.push('```txt');
  out.push('1. readiness_source       — 어떤 readiness 를 봤나        → ## Readiness Used');
  out.push('2. diff summary           — 무엇을 바꿨나 (ADDED/MODIFIED/REMOVED, 빈 diff 명시) → ## Diff Summary / ## Files Changed');
  out.push('3. validate result        — 구조 검사 결과(evidence)       → ## Commands Run');
  out.push('4. forbidden-paths result — 경계(diff 기준, evidence)      → ## Gate Compliance');
  out.push('5. idempotency result     — 재실행 빈 diff?(evidence)      → ## Idempotency');
  out.push('6. blockers (verbatim)    — 왜 멈췄나 (readiness blocking/next_actions 그대로) → ## Blockers Reported');
  out.push('(＋) check-generated      — 생성물 표류(advisory, 있으면)  → ## Idempotency');
  out.push('```');
  out.push('');
  out.push('## Work Packet Reference');
  out.push(`- Work Packet: \`${m.packet_rel}\` (\`packet_id\` = ${m.packet_id})`);
  out.push(`- target_screen: \`${cell(m.target_screen)}\` / requested_mode: \`${cell(m.requested_mode)}\` / readiness_mode: \`${cell(m.readiness_mode)}\``);
  out.push('');
  out.push('## Readiness Used');
  out.push('<!-- readiness output 을 그대로 옮긴다. 재계산 금지. -->');
  out.push(`- \`readiness_mode\` = \`${cell(m.readiness_mode)}\`, \`next_mode\` = ${m.next_mode ? '`' + cell(m.next_mode) + '`' : '— (또는 미표기)'}.`);
  if (m.ceiling_evidence) out.push(`- 천장 근거(그대로 옮김): ${cell(m.ceiling_evidence)}`);
  out.push(`- readiness_source(verbatim): \`${m.readiness_source}\``);
  out.push('- 소비: packet frontmatter `readiness_source` + `## Readiness Snapshot` (이 보고서에서 다시 유도하지 않음).');
  out.push('');
  out.push('### Allowed Paths (packet 인용)');
  out.push(renderPathsBlock(m.allowed_paths.map(toPosix), '# (packet 에 allowed_paths 없음)'));
  out.push('### Forbidden Paths (packet 인용)');
  out.push(renderPathsBlock(m.forbidden_paths.map(toPosix), '# (packet 에 forbidden_paths 없음)'));
  out.push('');
  out.push('## Files Changed');
  out.push('<!-- 실제 변경 파일(diff 기준). allowed_paths 안에 있는지는 사람/Review 가 교차 검증. -->');
  out.push(renderFilesChanged(m));
  out.push('');
  out.push('## Commands Run');
  out.push(renderCommandsRun(m));
  out.push('');
  out.push('## Result');
  out.push(
    `수집 완료: validate=${m.validate ? m.validate.status : '미수집'}, forbidden-paths=${m.forbidden ? m.forbidden.status : '미수집'}, idempotency=${m.idempotency ? m.idempotency.status : '미수집'}, check-generated=${m.checkgen ? m.checkgen.status : '미수집'}; readiness blocker ${m.blocking_summary.total}건 인용(D ${m.blocking_summary.decisions} · invalid ${m.blocking_summary.invalid} · fact ${m.blocking_summary.facts}). **이 초안은 합격 판정이 아니다** — 도구 fail 도 evidence 로 기록될 뿐이며, 다음 행동은 사람/구현자가 정한다.`,
  );
  out.push('');
  out.push('## Gate Compliance');
  out.push('<!-- 하드룰 evidence 포인터. collector 는 판정하지 않는다 — 확인열은 evidence 보장(✅)/사람 확인 필요(⏳). -->');
  out.push(renderGateCompliance(m));
  out.push('');
  out.push('## Diff Summary');
  out.push('<!-- 경로 경계는 diff 로 본다. ADDED/MODIFIED/REMOVED + (none). 빈 diff 는 완전 빈 diff 로 명시. -->');
  out.push(renderDiffSummary(m));
  out.push('');
  out.push('## Blockers Reported');
  out.push(renderBlockersReported(m));
  out.push('');
  out.push('## Review Evidence (advisory — 게이트 아님)');
  out.push('<!-- Review Artifact 의 review_summary/findings 를 advisory evidence 로만 옮긴다. merge check 에 배선 금지. -->');
  out.push(renderReviewEvidence(m));
  out.push('');
  out.push('## Idempotency');
  out.push(renderIdempotency(m));
  out.push('');
  out.push('## Follow-up');
  out.push(renderFollowup(m));
  out.push('');
  out.push('---');
  out.push('> **통과 ≠ 완료. Run Report ≠ 사람 승인.** 위 evidence 가 전부 깨끗(빈 diff·validate ok·멱등)해도');
  out.push('> 그것은 *결정성·경계 준수*의 증거일 뿐 **제품적 정확성·사람 승인**이 아니다. 이 Run Report 는');
  out.push('> 머지 판단·승인을 하지 않는다 — 게이트는 readiness(Open Decision)+validate 뿐이고, 다음 행동은');
  out.push('> 사람/지정 구현자가 정한다. (도구 결과 fail 은 evidence 이지 이 보고서의 실패가 아니다.)');
  return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '') + '\n';
}

// --json 봉투 — 수집 상태 요약(머지 판정 아님).
export function renderJsonEnvelope(m) {
  const toolStatus = (t) => (t ? { status: t.status, ok: t.ok == null ? null : t.ok, exit: t.exitCode == null ? null : t.exitCode } : null);
  return {
    run_id: m.run_id,
    packet_id: m.packet_id,
    target_screen: m.target_screen,
    requested_mode: m.requested_mode,
    readiness_mode: m.readiness_mode,
    next_mode: m.next_mode,
    readiness_source: m.readiness_source,
    out: m.out_rel || null,
    diff_provided: m.diff_provided,
    diff: m.diff ? { added: m.diff.added.length, modified: m.diff.modified.length, removed: m.diff.removed.length, renamed: m.diff.renamed.length, empty: m.diff.empty } : null,
    evidence: {
      validate: toolStatus(m.validate),
      forbidden_paths: toolStatus(m.forbidden),
      idempotency: toolStatus(m.idempotency),
      check_generated: toolStatus(m.checkgen),
    },
    blockers: {
      total: m.blocking_summary.total,
      decisions: m.blocking_summary.decisions,
      invalid: m.blocking_summary.invalid,
      facts: m.blocking_summary.facts,
    },
    review_summary: m.review && m.review.frontmatter ? m.review.frontmatter.review_summary || null : null,
    notes: m.notes,
    note: 'evidence bundle — 생성 성공/실패 신호일 뿐, merge gate/approval 아님 (exit code 도 게이트 아님).',
  };
}

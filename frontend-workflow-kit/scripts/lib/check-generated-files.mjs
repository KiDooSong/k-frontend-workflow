// check-generated-files.mjs (lib) — generated-file guard v1 의 순수 로직.
//
// 2.5B(discovery): manifest 의 모든 생성물(kind:generated)을 분류한다.
//   - v1 가드 대상(selected) = generated:true ∧ status:active ∧ do_not_edit:true ∧ id∈allowlist.
//     v1 allowlist 는 route-tree·nav-graph 둘 뿐(설계 §0.3, §1.7).
//   - 그 외(planned·수동모드·비-allowlist)는 selected:false + skip 사유를 명시한다(설계 §2, §5
//     "planned, must-not-fail"). 존재하지 않는/생성기 없는 planned 도 여기서 사유와 함께 드러난다.
//   여전히 재생성/헤더 검사는 하지 않는다 — 그건 2.5C(reproduce-to-scratch).
//
// 설계 출처: frontend-workflow-kit/temp/proposals/generated-file-guard-design.md
//   §1.7 guardability matrix · §2 manifest contract · §5 direct-edit detection / planned skip.
//
// 이 모듈은 부작용이 없다(process.exit/IO 없음) — CLI 와 단위 테스트가 직접 소비한다.

// v1 가드 대상 allowlist — whole-file generated artifact 중 route-tree·nav-graph 만.
// 정렬된 형태로 둔다(나열 출력 안정성). 설계 §1.7 "Guardable NOW" 두 항목.
export const V1_ARTIFACT_IDS = ['nav-graph', 'route-tree'];

// --artifact 입력을 v1 정책으로 해소한다(작업/표시 집합).
//   requested 없음        → v1 전체(route-tree·nav-graph).
//   requested 가 v1 대상  → 그 하나로 좁힘.
//   requested 가 비-v1    → 빈 배열(가드 대상 아님 — 호출부가 사유를 안내).
// v1 은 언제나 route-tree·nav-graph 로 제한된다(설계 §0.3 hard scope).
export function selectArtifactIds(requested) {
  if (requested == null) return [...V1_ARTIFACT_IDS];
  return V1_ARTIFACT_IDS.includes(requested) ? [requested] : [];
}

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

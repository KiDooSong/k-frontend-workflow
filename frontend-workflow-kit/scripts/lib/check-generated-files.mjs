// check-generated-files.mjs (lib) — generated-file guard v1 의 순수 로직.
//
// 2.5A(skeleton): manifest 에서 "생성물 후보"를 읽어 v1 대상(route-tree·nav-graph)으로
//   한정해 나열한다. 강한 검사(헤더 무결성·본문 동등·재생성 비교)는 하지 않는다 — 그건
//   2.5B(discovery 정교화) / 2.5C(reproduce-to-scratch)에서 추가한다.
//
// 설계 출처: frontend-workflow-kit/temp/proposals/generated-file-guard-design.md (PR B 슬라이스).
//   - v1 범위 한정(route-tree·nav-graph whole-file): 설계 §0.3, §1.7, §9 PR B.
//   - component-catalog(§1.5)·eslint-workflow-config(§1.6)·in-file block(§1.4)은 v1 제외.
//
// 이 모듈은 부작용이 없다(process.exit/IO 없음) — CLI(check-generated-files.mjs)가 소비한다.

// v1 가드 대상 allowlist — whole-file generated artifact 중 route-tree·nav-graph 만.
// 정렬된 형태로 둔다(나열 출력 안정성). 설계 §1.7 "Guardable NOW" 두 항목.
export const V1_ARTIFACT_IDS = ['nav-graph', 'route-tree'];

// --artifact 입력을 v1 정책으로 해소한다.
//   requested 없음        → v1 전체(route-tree·nav-graph).
//   requested 가 v1 대상  → 그 하나로 좁힘.
//   requested 가 비-v1    → 빈 배열(가드 대상 아님 — 호출부가 사유를 안내).
// v1 은 언제나 route-tree·nav-graph 로 제한된다(설계 §0.3 hard scope).
export function selectArtifactIds(requested) {
  if (requested == null) return [...V1_ARTIFACT_IDS];
  return V1_ARTIFACT_IDS.includes(requested) ? [requested] : [];
}

// manifest.artifacts 에서 생성물 후보를 추린다(2.5A: "나열"만).
//   - kind: generated 인 엔트리만 후보.
//   - allowlist(기본 v1)에 든 id 만.
// 반환 배열은 id 로 안정 정렬한다(JSON/text 출력 안정성).
// 필드는 manifest 값을 그대로 읽어 정규화만 한다 — 여기서 어떤 검사도 하지 않는다.
export function listCandidates(manifest, { allowlist = V1_ARTIFACT_IDS } = {}) {
  const artifacts =
    manifest && typeof manifest === 'object' && manifest.artifacts && typeof manifest.artifacts === 'object'
      ? manifest.artifacts
      : {};
  const out = [];
  for (const id of Object.keys(artifacts)) {
    const entry = artifacts[id] || {};
    if (entry.kind !== 'generated') continue; // 생성물만 후보
    if (!allowlist.includes(id)) continue; // v1 대상(route-tree·nav-graph)만
    out.push({
      id,
      kind: entry.kind,
      generated: entry.generated === true,
      status: typeof entry.status === 'string' ? entry.status : null,
      do_not_edit: entry.do_not_edit === true,
      path: typeof entry.path === 'string' ? entry.path : null,
      command: typeof entry.command === 'string' ? entry.command : null,
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

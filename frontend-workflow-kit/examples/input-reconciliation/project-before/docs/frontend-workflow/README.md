# project-before — baseline 문서 트리

`input-reconciliation` fixture 의 **입력 전(before) baseline** 이다.
외부 입력 7건이 닿기 직전의 문서 상태를 고정한다 — reconcile-input 은 이 트리를 입력으로 받아
`expected-after/` 에 가까운 결과를 만들어야 한다.

- 이 트리는 production app 도, 코드 구현 예제도 아니다 (`src/` 없음, md-only).
- 화면 6개와 global/_meta 가 들어 있으며, 모든 frozen 사실(화면 ID·route·status·결정 ID 등)은 변하지 않는다.

## 구조

```txt
docs/frontend-workflow/
  global/
    llm-rules.md                  # 유일하게 artifact_type 을 갖는 prose 문서 (artifact_type: llm-rules)
    CONTEXT.md                    # 도메인 용어집
    frontend-architecture.md      # 라우팅·AsyncState·fake-hook 단계 개요 (doc-level)
    source-map.md                 # 예정 소스 구조 (이 fixture 엔 코드 없음)
    component-gap-register.md     # baseline: 열린 gap 없음 (manifest 경로 = global/)
  app/
    navigation-map.md             # 탭/가드/딥링크/크로스도메인 엣지 (뼈대)
  api/
    api-manifest.md               # 미확정 endpoint 목록 (전부 ≤ candidate)
  design/
    component-catalog.snapshot.md # SAMPLE 스냅샷 (SegmentedTabs 의도적 부재)
    component-guidelines.md       # 카탈로그 사용 가이드 (artifact_type: component-guidelines)
    figma-frame-index.md          # 화면 ↔ figma 프레임 인덱스
  domains/
    auth/      (domain-rules.md, flows.md (legacy/sample residue), screens/login/screen-spec.md)
    home/      (domain-rules.md, screens/home/screen-spec.md)
    coupons/   (domain-rules.md, screens/coupon-list/, coupon-detail/)
    profile/   (domain-rules.md, screens/profile-edit/screen-spec.md)
    notices/   (domain-rules.md, screens/notice-list/screen-spec.md)
  _meta/
    tags.md                       # 화면 ID↔도메인↔route 인덱스
    decision-log.md               # D-001/D-003/D-101/D-204/D-301/D-401 경량 ADR 로그
    conflicts.md                  # baseline: 열린 충돌 없음
    workflow-state.snapshot.md    # SAMPLE 스냅샷 (스크립트 산출 형태)
    screen-inventory.snapshot.md  # SAMPLE 스냅샷
```

coupon-feature golden example 과 같은 레이아웃을 따르되, 이 fixture 만의 차이가 둘 있다.
- `conflicts.md` 와 `decision-log.md` 가 `global/` 이 아니라 **`_meta/`** 아래 있다.
- `design/component-catalog.md` 가 아니라 `component-catalog.snapshot.md`(SAMPLE 스냅샷)다 — 생성된 진짜 카탈로그가 아니다.

## 화면 6개 (baseline)

모든 화면은 §2 canonical 표를 따른다. route 결과는 아래 6개 route 집합에서만 나온다.

| 화면 ID | 도메인 | screen dir | route | pattern | status | stub |
|---|---|---|---|---|---|---|
| AUTH-001 | auth | login | `/(auth)/login` | form | confirmed | no |
| HOME-001 | home | home | `/(tabs)/home` | dashboard | draft | no |
| COUPON-001 | coupons | coupon-list | `/(tabs)/coupons` | list | draft | no |
| COUPON-002 | coupons | coupon-detail | `/coupons/[id]` | detail | draft | **YES (stub)** |
| PROFILE-001 | profile | profile-edit | `/(tabs)/my` | form | draft | no |
| NOTICE-001 | notices | notice-list | `/notices` | list | draft | no |

- **AUTH-001** 은 유일한 `confirmed` 화면이다. frontmatter 에 승인 메타(`approved_by: 박PM`, `approved_at: 2026-06-10`, `decision_id: D-204`)를 갖는다. 로그인 후 이동은 항상 홈(D-204 resolved).
- **HOME-001** 은 draft. 대시보드 위젯 구성이 미정(D-101 open)이고 홈 요약 API 스펙 출처가 미정(U-101 open)이다.
- **COUPON-001** 은 draft. 만료 쿠폰 노출(D-001 open)·페이지네이션 방식(D-003 open)이 미정이고, 쿠폰 API 응답 예시 위치가 미정(U-001 open)이다. 입력 reconcile 의 주 무대다.
- **COUPON-002** 는 **STUB** 이다 — frontmatter 와 HTML 주석만 있고 본문 섹션이 없다. coupon-feature 의 coupon-detail stub 을 그대로 모사한다. 본문이 없으므로 readiness 가 full UI 를 막는다.
- **PROFILE-001** 은 draft. 편집 범위/필드가 미정(D-301 open)이라 게이트가 가장 낮게 눌린다.
- **NOTICE-001** 은 draft. 공지를 독립 화면으로 둘지(D-401 open)·콘텐츠 출처(U-401 open)가 미정이다.

## md-only 게이트 천장

이 트리는 코드가 없으므로 사실 기준 readiness 천장은 모든 화면이 `screen-skeleton` 이다.
일부 화면은 Open Decision 이 `decision_cap` 으로 게이트를 더 아래로 끌어내린다(PROFILE-001 → docs-only, NOTICE-001 → route-skeleton).
화면별 target readiness(design intent) 와 md-only 게이트 실제 출력의 대조는 fixture 루트 README 와 reports 에 정리되어 있다.

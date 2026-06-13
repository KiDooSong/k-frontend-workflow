# multi-screen-dry-run — 문서 트리

`multi-screen-dry-run` fixture 의 docs 트리. 완성도가 일부러 다른 화면 6개를 담아
workflow:state / workflow:readiness / implement-screen 의 입력으로 쓴다.

- 이 트리는 production app 도, 코드 구현 예제도 아니다 (md-only).
- 이 예제는 future skill 테스트용 fixture 다. 구현 결과물은 별도 implement-screen 세션에서 생성한다.
- coupon-feature golden example 을 대체하지 않는다.

## 구조 (lean 트리)

```txt
docs/frontend-workflow/
  app/
    navigation-map.md             # 탭/가드/딥링크/크로스도메인 엣지 (뼈대)
  api/
    api-manifest.md               # 미확정 endpoint 목록 (전부 ≤ candidate)
  design/
    component-catalog.snapshot.md # SAMPLE 스냅샷 (SegmentedTabs 의도적 부재)
    component-guidelines.md       # 카탈로그 사용 가이드 (artifact_type: component-guidelines)
  global/
    component-gap-register.md     # baseline: 열린 gap 없음 (manifest 경로 = global/)
  domains/
    auth/      (domain-rules.md, flows.md, screens/login/screen-spec.md)
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

> **이 트리는 lean 하다.** global prose(llm-rules·glossary·architecture·source-map)는 두지 않는다 —
> readiness/implement-screen 게이트 시연에는 불필요하기 때문이다 (그 문서들은
> `input-reconciliation/project-before/` 쪽에 있다). 다만 `global/` 에는 manifest 가 경로를 못박는
> `component-gap-register.md` 하나만 둔다. screen-spec / navigation-map / api-manifest /
> catalog snapshot / _meta 로 state·readiness 가 계산된다.

## 화면 6개 (baseline)

§2 canonical 표와 동일하다. route 결과는 6개 route 집합에서만 나온다.

| 화면 ID | 도메인 | screen dir | route | pattern | status | stub |
|---|---|---|---|---|---|---|
| AUTH-001 | auth | login | `/(auth)/login` | form | confirmed | no |
| HOME-001 | home | home | `/(tabs)/home` | dashboard | draft | no |
| COUPON-001 | coupons | coupon-list | `/(tabs)/coupons` | list | draft | no |
| COUPON-002 | coupons | coupon-detail | `/coupons/[id]` | detail | draft | **YES (stub)** |
| PROFILE-001 | profile | profile-edit | `/(tabs)/my` | form | draft | no |
| NOTICE-001 | notices | notice-list | `/notices` | list | draft | no |

- **AUTH-001** — 유일한 `confirmed`. 승인 메타(`approved_by: 박PM`, `approved_at: 2026-06-10`, `decision_id: D-204`) 보유. 로그인 후 항상 홈(D-204 resolved).
- **HOME-001** — draft. 위젯 구성 미정(D-101 open), 홈 요약 API 출처 미정(U-101 open).
- **COUPON-001** — draft. 만료 쿠폰 노출(D-001 open)·페이지네이션(D-003 open)·API 응답 예시 위치(U-001 open). implement-screen 테스트의 주 대상.
- **COUPON-002** — **STUB**: frontmatter + HTML 주석만, 본문 섹션 없음. 본문이 없어 readiness 가 full UI 를 막는다.
- **PROFILE-001** — draft. 편집 범위/필드 미정(D-301 open)이 게이트를 docs-only 로 끌어내린다.
- **NOTICE-001** — draft. 독립 화면 여부(D-401 open)·콘텐츠 출처(U-401 open).

## readiness

화면별 target readiness(design intent)와 md-only 게이트 실제 출력의 대조는 fixture 루트 README 와
`reports/expected-readiness.md` 에 있다. md-only 라서 사실 기준 천장은 모든 화면 `screen-skeleton` 이고,
일부 화면은 Open Decision 이 게이트를 더 아래로 cap 한다.

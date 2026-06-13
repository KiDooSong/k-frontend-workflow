# golden example — coupon-feature

쿠폰 목록 화면(COUPON-001)을 `stub → spec → 구현 → validate` 사이클로 완주한 1건.
이후 모든 화면 복제의 few-shot 기준이 된다 ("쿠폰 목록과 같은 구조로").

## 구조

```txt
docs/frontend-workflow/
  global/llm-rules.md
  app/navigation-map.md                         # 뼈대 (탭/가드/딥링크/크로스도메인 엣지)
  design/component-catalog.md                   # MVP-A: 수동 작성 (생성기는 MVP-C)
  domains/coupons/
    domain-rules.md
    screens/
      coupon-list/screen-spec.md                # 완성된 통합형 ScreenSpec (status: confirmed)
      coupon-detail/screen-spec.md              # STUB (frontmatter 만)
  _meta/                                         # ← 생성물 (npm run example:state)
    workflow-state.yaml
    screen-inventory.yaml
  raw/wireframes/coupon-list.md                 # sources 링크 대상

src/
  lib/asyncState.ts                             # 화면이 의존하는 유일한 계약
  api/schemas/coupon.schema.ts                  # zod (DTO 단일 출처)
  features/coupons/
    queryKeys.ts                                # invalidation 단일 출처
    fixtures/coupons.ts                         # zod 로 검증된 fixture
    hooks/useCoupons.ts                         # fake hook (AsyncState 반환)
    components/CouponCard.tsx
    screens/CouponListScreen.tsx                # 전 상태(State Matrix) 구현
  components/ui/*                               # 공통 컴포넌트 (Catalog 대상)
  app/(tabs)/coupons.tsx                        # Expo Router 라우트 → 화면 연결
```

## 사이클 재현

킷 루트(`frontend-workflow-kit/`)에서:

```bash
npm run example:state
#   → COUPON-001 derived: state_matrix_complete=true, copy_keys_has_tbd=true,
#     tbd_count=3, api_confidence_min=candidate, fake_hook_exists=true, figma_mapping_status=missing
#   → screen-inventory: 중복 ID/route 없음

npm run example:readiness
#   COUPON-001 → rough-fixture-ui  (blocking: figma_mapping missing, api_confidence candidate)
#   COUPON-002 → screen-skeleton   (stub: 본문 미작성 → full UI 금지)

npm run example:validate
#   → 검사 8종 통과 (exit 0)
```

## 이 예제가 보여주는 것

- **fake hook 교체단계 제거**: `CouponListScreen` 은 `useCoupons` 만 쓴다.
  지금은 fixture 기반 fake 구현, API 확정 후 내부만 `useQuery` 로 교체 — 화면 코드는 안 바뀐다.
- **AsyncState 계약**: 화면은 `status`(loading/success/empty/error) 만 보고 분기. TanStack Query 객체 비노출.
- **confirmed 승인 메타**: `coupon-list` 는 `status: confirmed` + `approved_by/approved_at/decision_id`.
  메타가 없으면 `validate` 검사 7로 실패한다.
- **stub 게이트**: `coupon-detail` 은 본문이 없어 readiness 가 full UI(rough-fixture-ui)를 막는다.
- **파생값은 본문에서**: `tbd_count` 등은 frontmatter 에 없다. `workflow-state.mjs` 가 Unknowns/Copy Keys/API Candidates 를 파싱해 계산한다.

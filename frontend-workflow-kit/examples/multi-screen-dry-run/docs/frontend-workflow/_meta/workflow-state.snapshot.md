> SAMPLE SNAPSHOT — NOT GENERATED
> This file shows the expected shape of generated output for documentation/testing only.
> Do not treat this as a source of truth.

# workflow-state — sample snapshot

이 파일은 `npm run workflow:state` 가 이 fixture 의 screen-spec 들로부터 생성하는 `_meta/workflow-state.yaml` 의 **예상 형태**다 (2026-06-13 실제 실행 결과를 그대로 캡처). 검증 세션에서는 아래로 진짜 `.yaml` 을 재생성해 비교한다. md-only 이므로 `fake_hook_exists=false`, `component_catalog_generated=false`.

```bash
node scripts/workflow-state.mjs \
  --docs examples/multi-screen-dry-run/docs/frontend-workflow \
  --src  examples/multi-screen-dry-run/__nosrc__ \
  --date 2026-06-13
```

생성 예상 내용:

```yaml
generated_at: 2026-06-13
global:
  navigation_map_status: draft
  component_catalog_generated: false
  stub_screen_specs_count: 6
screens:
  AUTH-001:
    status: confirmed
    domain: auth
    route: /(auth)/login
    stub: false
    derived:
      state_matrix_complete: true
      interaction_matrix_complete: true
      copy_keys_has_tbd: false
      tbd_count: 0
      unknown_count: 0
      open_decisions_count: 0
      blocking_decisions: []
      malformed_decisions: []
      api_confidence_min: candidate
      fake_hook_exists: false
      figma_mapping_status: missing
  COUPON-001:
    status: draft
    domain: coupons
    route: /(tabs)/coupons
    stub: false
    derived:
      state_matrix_complete: true
      interaction_matrix_complete: true
      copy_keys_has_tbd: true
      tbd_count: 1
      unknown_count: 1
      open_decisions_count: 2
      blocking_decisions:
        - id: D-001
          decision_needed: 만료 쿠폰을 목록에 노출할 것인가?
          blocking_mode: final-fixture-ui
          owner: PM
        - id: D-003
          decision_needed: 쿠폰 목록 페이지네이션 방식은?
          blocking_mode: api-integrated-ui
          owner: BE
      malformed_decisions: []
      api_confidence_min: candidate
      fake_hook_exists: false
      figma_mapping_status: missing
  COUPON-002:
    status: draft
    domain: coupons
    route: /coupons/[id]
    stub: true
    derived:
      state_matrix_complete: false
      interaction_matrix_complete: false
      copy_keys_has_tbd: false
      tbd_count: 0
      unknown_count: 0
      open_decisions_count: 0
      blocking_decisions: []
      malformed_decisions: []
      api_confidence_min: null
      fake_hook_exists: false
      figma_mapping_status: missing
  HOME-001:
    status: draft
    domain: home
    route: /(tabs)/home
    stub: false
    derived:
      state_matrix_complete: true
      interaction_matrix_complete: true
      copy_keys_has_tbd: true
      tbd_count: 1
      unknown_count: 1
      open_decisions_count: 1
      blocking_decisions:
        - id: D-101
          decision_needed: 홈 대시보드 위젯 구성/우선순위(쿠폰 요약·공지·추천)
          blocking_mode: rough-fixture-ui
          owner: PM
      malformed_decisions: []
      api_confidence_min: unknown
      fake_hook_exists: false
      figma_mapping_status: missing
  NOTICE-001:
    status: draft
    domain: notices
    route: /notices
    stub: false
    derived:
      state_matrix_complete: true
      interaction_matrix_complete: true
      copy_keys_has_tbd: false
      tbd_count: 1
      unknown_count: 1
      open_decisions_count: 1
      blocking_decisions:
        - id: D-401
          decision_needed: 공지를 독립 화면으로 둘지 홈 섹션으로 흡수할지
          blocking_mode: screen-skeleton
          owner: PM
      malformed_decisions: []
      api_confidence_min: candidate
      fake_hook_exists: false
      figma_mapping_status: missing
  PROFILE-001:
    status: draft
    domain: profile
    route: /(tabs)/my
    stub: false
    derived:
      state_matrix_complete: true
      interaction_matrix_complete: true
      copy_keys_has_tbd: false
      tbd_count: 1
      unknown_count: 1
      open_decisions_count: 1
      blocking_decisions:
        - id: D-301
          decision_needed: 프로필 편집 범위/필드 확정(닉네임·이메일·아바타·비밀번호 변경 포함 여부)
          blocking_mode: route-skeleton
          owner: PM
      malformed_decisions: []
      api_confidence_min: unknown
      fake_hook_exists: false
      figma_mapping_status: missing
```

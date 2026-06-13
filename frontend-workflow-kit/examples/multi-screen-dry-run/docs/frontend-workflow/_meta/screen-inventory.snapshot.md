> SAMPLE SNAPSHOT — NOT GENERATED
> This file shows the expected shape of generated output for documentation/testing only.
> Do not treat this as a source of truth.

# screen-inventory — sample snapshot

`npm run workflow:state` 가 함께 생성하는 `_meta/screen-inventory.yaml` 의 예상 형태 (2026-06-13 실행 캡처). 중복 ID/route 없음.

```yaml
screens:
  - id: AUTH-001
    domain: auth
    route: /(auth)/login
    status: confirmed
  - id: COUPON-001
    domain: coupons
    route: /(tabs)/coupons
    status: draft
  - id: COUPON-002
    domain: coupons
    route: /coupons/[id]
    status: draft
  - id: HOME-001
    domain: home
    route: /(tabs)/home
    status: draft
  - id: NOTICE-001
    domain: notices
    route: /notices
    status: draft
  - id: PROFILE-001
    domain: profile
    route: /(tabs)/my
    status: draft
checks:
  duplicate_ids: []
  duplicate_routes: []
```

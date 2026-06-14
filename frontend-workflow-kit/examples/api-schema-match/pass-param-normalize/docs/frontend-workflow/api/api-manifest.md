---
artifact_id: api-manifest
artifact_type: api-manifest
status: draft
---

# API Manifest (fixture: pass-param-normalize)

> ScreenSpec 의 :id / [id] 표기가 manifest 의 {id} / {couponId} 와 normEndpoint 정규화로 매칭됨을 검증.

## Endpoints
| Method | Path | Confidence | Linked Schema | Source |
|---|---|---|---|---|
| GET | /coupons/{id} | confirmed | CouponDetailSchema | openapi |
| POST | /coupons/{couponId}/use | confirmed | UseCouponSchema | openapi |

---
artifact_id: api-manifest
artifact_type: api-manifest
status: draft
---

# API Manifest (fixture: fail-duplicate-endpoint)

> 같은 (GET, /coupons) 가 서로 다른 Linked Schema 로 두 번 선언됨 — canonical 모순(행 순서 의존).

## Endpoints
| Method | Path | Confidence | Linked Schema | Source |
|---|---|---|---|---|
| GET | /coupons | confirmed | CouponListResponseSchema | openapi |
| GET | /coupons | confirmed | CouponDto | openapi |

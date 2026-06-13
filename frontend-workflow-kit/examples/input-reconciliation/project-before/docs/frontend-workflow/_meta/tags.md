---
title: Tags Index
status: draft
kind: index
---

# Tags Index

화면 ID·도메인·route 의 작은 인덱스와, blocking-register 접두사·status 어휘 사전.
이 문서는 prose/index 문서이므로 `artifact_type` 을 갖지 않는다.

## 화면 ID ↔ 도메인 ↔ route

| Screen ID | 도메인 | route | pattern | status |
|---|---|---|---|---|
| AUTH-001 | auth | `/(auth)/login` | form | confirmed |
| HOME-001 | home | `/(tabs)/home` | dashboard | draft |
| COUPON-001 | coupons | `/(tabs)/coupons` | list | draft |
| COUPON-002 | coupons | `/coupons/[id]` | detail | draft (stub) |
| PROFILE-001 | profile | `/(tabs)/my` | form | draft |
| NOTICE-001 | notices | `/notices` | list | draft |

## blocking-register 접두사

| 접두사 | 뜻 | 어디에 기록 | 누가 닫나 |
|---|---|---|---|
| U | Unknown — 사실 확인이 안 된 질문 | 해당 ScreenSpec 의 Unknowns | 사실이 들어오면 resolved (사람) |
| D | Decision — 산출물 형태를 바꾸는 결정 | ScreenSpec 의 Open Decisions / _meta/decision-log.md | 사람만 resolve |
| C | Conflict — 두 출처가 부딪힘 | _meta/conflicts.md | 사람만 close |
| G | Gap — 카탈로그에 없는 컴포넌트 제안 | global/component-gap-register.md | 사람만 accept |

LLM(reconcile-input)은 위 항목을 **올리기만** 한다 — `open` 행 추가, resolved→open 재오픈, 충돌·갭 제안.
닫는 전이(resolve / close / confirmed 승격 / accept)는 모두 사람 몫이다.

## status 어휘

- **artifact status**: `draft` → `confirmed`. confirmed 는 승인 메타(approved_by/approved_at/decision_id)를 동반한다.
- **confidence (API/입력)**: `unknown` → `candidate` → `confirmed`. baseline manifest 는 모두 ≤ candidate.
- **Unknown status**: `open` | `resolved`.
- **Decision status**: `open` | `resolved`.
- **Conflict status**: `open` | `closed`.
- **Gap status**: `open` | `accepted`.

## 현재 열린 항목 (baseline)

| ID | 종류 | 화면 | 상태 |
|---|---|---|---|
| D-001 | Decision | COUPON-001 | open |
| D-003 | Decision | COUPON-001 | open |
| D-101 | Decision | HOME-001 | open |
| D-204 | Decision | AUTH-001 | resolved |
| D-301 | Decision | PROFILE-001 | open |
| D-401 | Decision | NOTICE-001 | open |
| U-001 | Unknown | COUPON-001 | open |
| U-101 | Unknown | HOME-001 | open |
| U-401 | Unknown | NOTICE-001 | open |

baseline 에는 열린 충돌(C-)과 열린 갭(G-)이 없다. 입력 reconcile 후 C-001/G-001 이 추가된다.

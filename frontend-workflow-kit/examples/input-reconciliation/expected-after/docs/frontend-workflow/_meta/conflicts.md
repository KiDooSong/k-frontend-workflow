---
title: Conflicts (passive log) — expected-after
status: draft
kind: meta-register
---

# Conflicts — expected-after

> _meta passive 로그 (validate 제외) 이므로 manifest 식 `artifact_type: conflicts` 를 붙이지 않는다. 정식 검증 대상 conflicts 의 manifest 경로는 `global/conflicts.md` 다.
> A = 새 입력, B = 기존 결정/문서 (input-reconciliation.md 의 A/B 규약).
> C-001 은 IN-20260613-meeting-001 이 resolved 결정 D-204 에 도전하며 생겼다. 게이트를 실제로 건 것은 D-204 재오픈이다(Conflicts 는 신호).
> 사람이 D-204 를 재-resolve 하며 C-001 도 함께 닫았다(닫힘 동기화).

| ID | 충돌 지점 | A (출처/값) | B (출처/값) | 영향 화면 | Status |
|---|---|---|---|---|---|
| C-001 | 로그인 성공 후 리다이렉트 정책 | IN-20260613-meeting-001 / 기본 홈 + returnTo 우선 | D-204 / 항상 홈 | AUTH-001 | resolved |

<!-- Status: open(미해결) | resolved(출처 문서/결정 수정 완료) -->

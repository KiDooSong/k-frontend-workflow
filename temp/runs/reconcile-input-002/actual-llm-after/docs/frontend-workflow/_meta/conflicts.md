---
title: Conflicts (passive log)
status: draft
kind: meta-register
---

# Conflicts

> 문서/입력 간 충돌을 사람이 결정하도록 올리는 신호 로그 (passive log — readiness/validate 가 읽지 않음).
> 이 fixture 는 가이드 배치를 따라 `_meta/` 에 둔다 (validate 는 `_meta/` 제외 → 미검사). 그래서 manifest 식 `artifact_type: conflicts` 를 붙이지 않는다 — 정식 검증 대상 conflicts 산출물의 manifest 경로는 `global/conflicts.md` 다.
> C-001 open: IN-20260613-meeting-001 이 resolved D-204('항상 홈')에 도전 → D-204 재오픈. 게이트는 D-204(open)가 걸고, 닫힘은 사람(D-204 재-resolve 시 C-001 동기화).

| ID | 충돌 지점 | A (출처/값) | B (출처/값) | 영향 화면 | Status |
|---|---|---|---|---|---|
| C-001 | 로그인 성공 후 이동 위치 | IN-20260613-meeting-001 / 기본 홈 + protected redirect 시 returnTo 우선 | D-204 / 항상 홈(/(tabs)/home) | AUTH-001 | open |

<!-- Status: open(미해결) | resolved(출처 문서 수정 완료) -->

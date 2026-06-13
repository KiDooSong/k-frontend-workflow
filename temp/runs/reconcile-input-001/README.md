# reconcile-input-001 — pre-fix 블라인드 dry-run (⚠️ canonical 아님)

> ⚠️ 이 run 은 **수정 전 계약**으로 돌린 첫 블라인드 실행이다. **정답/기준으로 쓰지 말 것.**
> - 정답지(LLM 단독): `frontend-workflow-kit/examples/input-reconciliation/expected-llm-after/`
> - 수정 후 정합 성공 run: `../reconcile-input-002/`

## 이 run 이 한 일
`project-before` baseline + `inputs/` 5건을 (당시) 계약대로 reconcile 한 산출물이다.
게이트 경계(LLM 은 올리기만)는 정확했고, 변경 파일 footprint 도 golden 과 동일한 9개였다.
다만 한 가지 실질 divergence — **U-001 을 `resolved` 로 닫음** — 과 그 부수효과(U-002 신설),
그리고 일부 cosmetic 차이를 남겼다.

## 왜 보존하는가 (실패가 아니라 증거)
U-001 divergence 는 단순 버그가 아니라 **계약 결함을 드러낸 신호**다 —
당시 `input-reconciliation.md`/SKILL 의 `resolves-unknown` 분류가 "Unknown 을 `resolved` 처리"라고 적혀
LLM 이 Unknown 을 닫아도 되는 것처럼 읽혔다. 이 run 이 그 모호성을 노출시켜 **PR #1(계약/SKILL 수정)**으로 이어졌다.
"테스트가 제 일을 해서 계약 결함을 찾은" 케이스이지, intentionally-failing run 이 아니다.

- 격차 전체 분석(S1~S6): `reconcile-run-report.md`
- 수정 후 같은 입력 재실행 결과: `../reconcile-input-002/`

## 흐름
```
project-before
  → (pre-fix reconcile)
  → 이 run (resolves-unknown 모호성 노출)        ← 여기
  → (계약/SKILL 수정, PR #1)
  → reconcile-input-002 (golden 정합 PASS)
```

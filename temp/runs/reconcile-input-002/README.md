# reconcile-input-002 — post-fix 정합 dry-run (✅ canonical pass)

> ✅ 수정된 계약(`resolves-unknown` = 답/근거 연결 + Status `open` 유지, 닫기는 사람) 으로
> 같은 입력을 재실행한 run. `expected-llm-after/` 와 **실질 정합**(S1~S6 해소).
> 회귀 비교의 **성공 기준 run** 으로 쓸 수 있다.

## 이 run 이 한 일
`reconcile-input-001` 출력에서 출발해, 계약 수정으로 영향받는 6건(S1~S6)만 바로잡았다:
- **S1** U-001 `open` 유지 (닫기는 사람)
- **S2** U-002 미신설 (enum 매칭 확인은 U-001 에 귀속)
- **S3** 탭 Copy Keys `draft`
- **S4** COUPON-001 API Candidates 에 page-envelope DTO 비노출 (api-manifest 한정)
- **S5** register api 행 Result = `pending user decision`
- **S6** figma-component-mapping frontmatter `status: draft` (+비표준 `figma_frame_ref` 제거)

## 결과
- 변경 파일 footprint = golden 과 동일한 **9개**, `app/navigation-map.md` 미수정, 게이트 경계(올리기만) 보존.
- 남은 차이는 **cosmetic**(제목 라벨 `(expected-llm-after)`·해설 주석·문구·표 스키마)뿐 → reconcile **결론**은 golden 과 동일.
- 검증 상세: `reconcile-run-report.md` (Verdict **PASS**).

## 비교 기준
`frontend-workflow-kit/examples/input-reconciliation/expected-llm-after/` (LLM 단독 정답지).
사람 단계까지 끝낸 human-final 은 `.../expected-after/`.

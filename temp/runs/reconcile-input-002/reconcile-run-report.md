# reconcile-input dry-run report — reconcile-input-002 (corrected-contract re-run)

- **Run**: `temp/runs/reconcile-input-002/`
- **Date**: 2026-06-14
- **목적**: reconcile-input-001 이 드러낸 `resolves-unknown` 모호성을 계약+SKILL.md 에서 고친 뒤, **수정된 규칙으로 재실행**해 golden 과 정합되는지 확인.
- **계약 수정 커밋**: `0a42cdd` (PR #1 → main, merge `365e895`).
- **Baseline**: `project-before` (변동 없음). **Compared against**: `expected-llm-after/`.
- 코드/스크립트 미실행, `examples/`·`expected-*` 원본 미수정. 모든 쓰기는 `temp/runs/reconcile-input-002/` 한정.

## 방법
-002 는 -001 출력에서 출발해 **S1~S6 6건만** 수정했다(나머지는 동일). 그래서 이 리포트는 "수정한 6건이 golden 과 맞춰졌는가 + 나머지 불변식이 깨지지 않았는가"를 본다.

---

## 0. Verdict — ✅ PASS

| 검사 | -001 | -002 | golden |
|---|---|---|---|
| 변경 파일 footprint (9개) | ✅ 일치 | ✅ 일치 | 9개 |
| navigation-map 미수정 | ✅ | ✅ | 미수정 |
| 게이트 올리기만 (decision/conflict/confirmed/gap) | ✅ | ✅ | ✅ |
| **S1 U-001** | ❌ resolved | ✅ **open** | open |
| **S2 U-002** | ❌ 신설 | ✅ **없음** | 없음 |
| **S3 탭 Copy Keys** | ❌ tbd | ✅ **draft** | draft |
| **S4 API Candidates DTO 누수** | ❌ 누수 | ✅ **없음**(manifest 한정) | 없음 |
| **S5 register api Result** | ❌ accepted | ✅ **pending user decision** | pending user decision |
| **S6 figma frontmatter status** | ❌ 누락 | ✅ **status: draft**(+figma_frame_ref 제거) | status: draft |

→ -001 의 실질 격차 6건이 **전부 해소**. 남은 차이는 cosmetic(제목/주석/문구/표 스키마/sources 개수)뿐 — reconcile **결론**은 golden 과 동일.

---

## 1. S1~S6 검증 (side-by-side, 실측)

| # | 신호 | actual -002 | golden | 판정 |
|---|---|---|---|---|
| S1 | COUPON-001 U-001 Status | `open` | `open` | ✅ |
| S2 | COUPON-001 U-002 행 개수 | 0 | 0 | ✅ |
| S3 | coupon.tab.available/used/expired Status | `draft` ×3 | `draft` ×3 | ✅ |
| S4 | API Candidates `GET /coupons` | `(confidence: candidate)` (envelope 없음) | 동일 | ✅ |
| S4 | envelope DTO 위치 | api-manifest 에만 | api-manifest 에만 | ✅ |
| S5 | register api 행 Result | `pending user decision` | `pending user decision` | ✅ |
| S5 | register api Created Items | `U-001 (open), D-003 (open)` | `U-001 (open), D-003 (open)` | ✅ |
| S6 | figma-mapping frontmatter | `status: draft`, `figma_frame_ref` 없음 | 동일 | ✅ |

> S2 부수효과 정합: U-002 를 없애는 대신 enum 1:1 매칭 질문을 **U-001 에 귀속**시켰다(api-manifest 주석). golden 과 같은 처리.

## 2. 불변식 재확인 (실측)
- footprint vs baseline: **7 CHANGED + 2 NEW = 정확히 golden 의 9파일**. 무관 문서 무손상.
- `_meta/decision-log.md`: `resolved` status 셀 **0개** (D-204 포함 전부 `open`). LLM 이 닫은 결정 없음.
- `_meta/conflicts.md`: C-001 `open`.
- `AUTH-001/screen-spec.md`: `status: confirmed` 유지(강등 없음), D-204 `open`.
- **Unknown resolved 닫기 0건** (수정된 금지 규칙 준수).
- -002 가 -001 대비 바꾼 파일: `COUPON-001 screen-spec`, `figma-component-mapping`, `reconciliation-register`, `api-manifest` (+ reports/summary). 그 외는 -001(=golden 정합분) 그대로.

## 3. 남은 cosmetic 차이 (reconcile 결론에 영향 없음)
- 제목 `(expected-llm-after)` 라벨 + 상단 해설 HTML 주석 — golden 의 정답지 주석. actual 에 없음(정상).
- COUPON-001 `sources` 5건(typed) vs golden 1건 / Acceptance 항목 수 / UI Sections·Interaction 문구 / offline 행 위치는 정렬했으나 일부 표현 차이.
- figma-mapping 표 스키마(2행 vs golden 3행·구체 경로), api-error-policy 절 구성(미정 vs 적용 화면), register Result 괄호 부연 — 모두 표현 차이.
- reports/expected-readiness.md 는 -002 도 미생성(코드 미실행 범위). 추론은 summary "게이트 변화"와 일치.

## 4. 결론
- **계약+SKILL 수정이 유효함을 확인**: 같은 입력·같은 baseline 에서, 수정된 `resolves-unknown` 규칙을 따르면 reconcile-input 산출물이 golden 과 **실질 100% 정합**(S1~S6 해소, 게이트 경계·footprint 유지).
- reconcile-input-001 은 "수정 전 증거물"로, reconcile-input-002 는 "수정 후 정합 확인"으로 둘 다 보존.
- 후속 권고(선택): cosmetic 정합까지 원하면 (a) screen-spec 템플릿에 Copy Keys `draft` vs `tbd` 기준 명문화, (b) `figma-component-mapping` 전용 템플릿 추가(frontmatter 규약 고정)로 S3/S6 류 재현성을 docs 레벨에서 보장.

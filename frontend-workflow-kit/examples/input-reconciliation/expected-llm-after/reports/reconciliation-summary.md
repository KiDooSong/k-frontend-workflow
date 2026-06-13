# Reconciliation Summary — expected-llm-after (reconcile-input 단독)

5개 입력을 reconcile-input **만** 돌린 결과 요약(사람 결정 전). 입력당 1행. (계약: input-reconciliation.md)

| Input ID | Type | Result | Updated Artifacts | Created Unknowns | Created Decisions | Created Conflicts |
|---|---|---|---|---|---|---|
| IN-20260613-planning-001 | planning | pending user decision | COUPON-001 (UI Sections, Copy Keys=draft) | - | D-001 `open` (separate-tab 후보) | - |
| IN-20260613-figma-001 | figma | accepted | COUPON-001 (UI Sections), figma-component-mapping(신규) | - | - | - |
| IN-20260613-api-001 | api | pending user decision | api-manifest(page envelope), COUPON-001 (Data/API) | U-001 `open` (IN-api-001 가 답 제공, resolvable) | D-003 `open` (offset/page 후보) | - |
| IN-20260613-meeting-001 | meeting | pending user decision | AUTH-001 (D-204 재오픈) | - | D-204 `open` (resolved→open 재오픈) | C-001 `open` |
| IN-20260613-qa-001 | qa | accepted | COUPON-001 (State Matrix offline, Acceptance), api-error-policy | - | - | - |

## 메모

- **Created Gap**: IN-20260613-figma-001 은 G-001(SegmentedTabs)을 component-gap-register 에 `open` 으로 제안했다(위 표는 U/D/C 컬럼뿐이라 Gap 은 여기 별도 기록). accept 는 사람.
- **LLM 이 한 일 (이 트리에 반영됨)**: simple-update 반영(offline·page envelope·가로형 시각), U-001 resolvable 표시(open 유지), D-001/D-003 후보 좁히기(open 유지), D-204 재오픈, C-001 기록, G-001 제안.
- **사람이 할 일 (아직 안 함 → expected-after)**: D-001 → separate tab, D-003 → offset/page, U-001 → resolved, D-204 → 기본 홈+returnTo 로 재-resolve, C-001 닫기, COUPON-001 status confirmed 승격, navigation-map Route Guard returnTo 반영.
- **navigation-map 은 미수정**: meeting 입력의 returnTo 반영은 재오픈된 D-204 에 걸려 보류된다. 그래서 이 트리엔 navigation-map 변경이 없다(=LLM-vs-human 경계).
- **게이트는 Open Decision 이 건다**: Conflicts(C-001)는 신호일 뿐. AUTH-001 을 실제로 막은 건 D-204 재오픈이다(사람이 닫으며 해제).
- **멱등성**: 같은 input_id 를 다시 reconcile 하면 register 의 `reconciled` 행을 보고 멈춘다(중복 수정 없음).

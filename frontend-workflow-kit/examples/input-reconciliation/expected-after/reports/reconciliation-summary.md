# Reconciliation Summary — expected-after

5개 입력을 reconcile 한 결과 요약. 입력당 1행. (계약: input-reconciliation.md)

| Input ID | Type | Result | Updated Artifacts | Created Unknowns | Created Decisions | Created Conflicts |
|---|---|---|---|---|---|---|
| IN-20260613-planning-001 | planning | accepted | COUPON-001 (UI Sections, Copy Keys, Acceptance) | - | - (기존 D-001 resolve) | - |
| IN-20260613-figma-001 | figma | accepted | COUPON-001 (UI Sections), figma-component-mapping(신규) | - | - | - |
| IN-20260613-api-001 | api | accepted | api-manifest, COUPON-001 (Data/API) | - (U-001 resolve) | - (기존 D-003 resolve) | - |
| IN-20260613-meeting-001 | meeting | accepted | navigation-map(Route Guard), AUTH-001 | - | - (기존 D-204 재오픈→재resolve) | C-001 |
| IN-20260613-qa-001 | qa | accepted | COUPON-001 (State Matrix offline), api-error-policy | - | - | - |

## 메모

- **Created Gap**: IN-20260613-figma-001 은 G-001(SegmentedTabs)을 component-gap-register 에 `open` 으로 제안했다. (위 표는 가이드 컬럼이 U/D/C 만이라 Gap 은 여기 별도 기록.)
- **LLM vs 사람 경계**:
  - reconcile-input(LLM) 이 한 일: simple-update 반영, U-001 resolve 가능 표시, D-001/D-003 선택지 좁히기, D-204 재오픈, C-001 기록, G-001 제안.
  - 사람이 한 일(이 expected-after 에 반영됨): D-001 → separate tab, D-003 → offset/page, D-204 → 기본 홈+returnTo 로 **재-resolve**, C-001 닫기, COUPON-001 status confirmed 승격.
- **게이트는 Open Decision 이 건다**: Conflicts(C-001)는 신호일 뿐 게이트가 아니다. AUTH-001 을 실제로 막은 건 D-204 재오픈이었다(사람이 닫으며 해제).
- **멱등성**: 같은 input_id 를 다시 reconcile 하면 register 의 `reconciled` 행을 보고 멈춘다(중복 수정 없음).

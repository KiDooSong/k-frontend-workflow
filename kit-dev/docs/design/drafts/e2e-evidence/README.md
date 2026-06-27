# E2E Evidence — design drafts

> Status: **DESIGN / DRAFT (제안, 게이트 아님)**. 2026-06-21.
> 출처 evidence: [dogfood-001-l010](../../../../../docs/research/playwright/dogfood-001-l010.md) §6 + playwright 리서치 [01](../../../../../docs/research/playwright/01-playwright-agents-planner-generator-healer.md)·[02](../../../../../docs/research/playwright/02-expo-web-and-mobile-simulator.md)·[03](../../../../../docs/research/playwright/03-workflow-integration.md).
> 이 폴더의 문서는 **제안(설계 합의문 후보)** 이다. confirmed 승격·Open Decision resolve·hard gate 신설/상향·구현 착수는 **사람만**.

---

## 한 줄 불변식 (이 폴더 전체의 전제)

> **E2E는 evidence다. 게이트가 아니다.**
> 어떤 도구의 green(Playwright / Maestro / Detox)도 Open Decision을 닫지 못하고, status를 confirmed로 올리지 못하며, readiness 모드를 끌어올리지 못한다. 판정(passed/failed · confirmed · resolve)은 끝까지 사람 몫이다.

이건 킷 README 불변식 6("confirmed 승격은 사람만")·"통과 = 완료가 아니다"의 E2E 판이다. 리서치 [03 §4](../../../../../docs/research/playwright/03-workflow-integration.md)가 같은 결론을 "E2E를 4번째 방어선으로 추가하려는 충동을 거부한다"로 못 박았다.

## 문서

| 문서 | 무엇을 담나 |
|---|---|
| [testid-contract-candidate.md](testid-contract-candidate.md) | testID를 **screen-spec / accessibility / interaction 계약 후보**로 정리. 누가 선언 / 언제 삽입 / 누가 소비, 네이밍 규약, 금지, 템플릿 배치 권고 + 최소 문구 patch **제안**. |
| [e2e-evidence-discipline.md](e2e-evidence-discipline.md) | E2E evidence **운영 규율**(Web=Playwright, Native=Maestro/Detox), F9 **drift 처리**, **warning-first 후보**, 다음 구현 단계 **checklist**. |

## 무엇을 하지 않는가 (범위 밖 — 금지 재확인)

- **E2E hard gate 제안 안 함** — 전부 warning-first. hard 승격은 telemetry 후 *별도 사람 OD*.
- **Healer auto-fix를 CI에 넣지 않음** — 로컬/PR diff 전용. CI 무인 자동수정 금지.
- **실제 Playwright/Maestro harness를 repo에 추가하지 않음** — 리서치/도그푸드 하니스(`temp/runs/maestro-dogfood-001/`)는 비추적 로컬.
- **testID 네이밍/계약을 코드·정책·CI로 강제하지 않음** — 이 세션은 design/docs. 정본 템플릿 편집은 별도 명시 지시 + 순차 슬롯.
- **새 산출물 축을 만들지 않음** — E2E는 기존 Investigation/Verification 축의 evidence 생성기로만 들어간다([roadmap "산출물 축 닫힘"](../../../../roadmap-current.md)).

## Cross-links

- 리서치(evidence): [playwright/README](../../../../../docs/research/playwright/README.md) · [01](../../../../../docs/research/playwright/01-playwright-agents-planner-generator-healer.md) · [02](../../../../../docs/research/playwright/02-expo-web-and-mobile-simulator.md) · [03](../../../../../docs/research/playwright/03-workflow-integration.md) · [dogfood-001-l010](../../../../../docs/research/playwright/dogfood-001-l010.md)
- 템플릿(patch 제안 대상): [screen-spec.template.md](../../../../../frontend-workflow-kit/templates/screen/screen-spec.template.md) · [llm-rules.template.md](../../../../../frontend-workflow-kit/templates/global/llm-rules.template.md)
- 기존 evidence 축: [investigation-and-verification.md](../../../../investigation-and-verification.md) (Verification Matrix) · [input-reconciliation.md](../../../../../frontend-workflow-kit/docs/reference/input-reconciliation.md) (drift reconcile)
- substrate 의존(E2E role/index는 이 뒤): [tier3-layer-model.md](../customizable-architecture/tier3-layer-model.md) + [tier3-access-matrix-revision](../../../../temp/proposals/tier3-access-matrix-revision.md)
- 결정 기록 패턴 참고: [visual-spec-od-decisions.md](../visual-spec-od-decisions.md)

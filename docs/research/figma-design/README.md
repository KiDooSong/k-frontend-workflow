# Figma 디자인 시각 충실도 × frontend-workflow-kit — 리서치 보고서

> 날짜: 2026-06-21 · status: draft(리서치 산출물, 게이트 아님)
> "이 킷의 워크플로우(최종 구현 가정)로 디자이너의 Figma 화면을 어디까지 재현할 수 있는가, 그리고 무엇이 빠져 있는가"에 대한 3장짜리 분석 보고서.

이 폴더는 **리서치 evidence** 다 — 킷의 `docs/frontend-workflow/` 산출물(screen-spec·readiness·validate 대상)이 **아니며**, 어떤 게이트도 걸지 않는다. 여기 제안된 보강안은 별도 Open Decision 과 사람 승인을 따른다. ([docs/research/playwright/](../playwright/README.md) 와 같은 위상)

## 이 보고서가 답하는 질문

> 스펙 문서·네비게이션 맵 등 이 워크플로우가 수집·가공하는 문서를 전제로, **디자이너가 작업한 최종 Figma 스크린을 95% 수준으로 구현할 수 있는가?** 목적 달성을 위해 빠진 정보(예: Figma에서 추출한 레이아웃 위치·치수·토큰)는 무엇인가?

## 한 줄 결론

**이 킷은 "동작·상태·내비·데이터 계약"을 95%+ 로 정확히 재현하도록 설계됐지만, "Figma 픽셀/레이아웃 시각 충실도"는 의도적으로 가장 얇게 남긴 링크다.** 그대로 통과시키면 *"기획대로 동작하고 상태가 빠짐없는 화면"* 은 나오지만, *"디자이너가 그린 그 화면"* 이 95% 나온다는 보장은 **구조적으로 없다.** 이는 버그가 아니라 설계 선택이며, 비주얼 충실도를 끌어올리려면 세 가지(시각 계약 산출물 · 디자인 토큰 단일 출처 · 비주얼 검증 게이트)를 추가해야 한다.

## 이 보고서를 떠받치는 단 하나의 사실

> **이 킷에서 "사실의 단일 출처"는 모두 파일로 고정되고 기계로 검사되는데, 시각 디자인만 유일하게 그렇지 않다.**

[frontend-llm-workflow.md](../../../frontend-llm-workflow.md) 의 충돌 우선순위는 "시각 디자인: 최종 Figma 우선" 이라고 **선언**한다. 그러나 데이터(zod)·라우팅(route-tree)·컴포넌트 props(catalog)·동작(State/Interaction Matrix)과 달리, 그 Figma 시각 진실을 **담는 파일도, 검사하는 게이트도 존재하지 않는다.** 가장 결정적인 시각 출처가 유일하게 materialize 되지 않은 단일 출처다 — 이 비대칭이 보고서 전체를 관통한다.

## 축별 비대칭 (핵심 표)

| 축 | 단일 출처 | 파일로 고정? | 기계 검사? |
|---|---|---|---|
| 데이터 계약 | zod 스키마(코드) | ✅ `src/api/schemas/*.ts` | ✅ validate 검사 8 |
| 라우팅 | route-tree / nav-graph (생성) | ✅ `_meta/route-tree.txt` | ✅ 검사 13 / route-cross-check |
| 컴포넌트 props | component-catalog (코드에서 생성) | ✅ `design/component-catalog.md` | ✅ check-generated |
| 상태/동작 | screen-spec State/Interaction Matrix | ✅ `screen-spec.md` | ✅ readiness / validate |
| 카피/i18n | screen-spec Copy Keys | ✅ | ✅ workflow-state |
| **시각 디자인(색/간격/타이포/치수/레이아웃)** | **"최종 Figma 우선" 선언만** | ❌ 담을 칸 없음 | ❌ 게이트 0 |

## 보고서 (01–03 진단 · 04 구현 레퍼런스)

| # | 보고서 | 무엇을 답하나 |
|---|---|---|
| 01 | [킷이 보장하는 것 vs 시각 축의 비대칭](01-what-the-kit-captures.md) | 동작/상태/내비/데이터/컴포넌트/카피/a11y 는 어떤 산출물·게이트로 강제되는가. 시각 축만 왜 빠지는가. `layout-profile` 혼동 정정. |
| 02 | [파이프라인에서 시각 충실도가 새는 지점](02-where-visual-fidelity-leaks.md) | 입력 수집 → figma-component-mapping → 화면 구현 → §8 UI 보정 → 검증. 각 단계에서 Figma 시각값이 어떻게 사라지는지 추적. |
| 03 | [빠진 것과 95%로 좁히기](03-gaps-and-path-to-95.md) | 빠진 7가지(우선순위) + 95% 현실화 3단 처방 + 킷 사상(새 축 금지)과 정합하는 도입 경로 + 현실적 천장. |
| 04 | [Figma MCP × REST 2채널 데이터 수집·조합 (Professional 기준)](04-figma-mcp-rest-data-collection.md) | **무엇을** 수집하나(Visual Spec 13종 필드) · MCP vs REST **채널 역량** · **Professional 게이팅 매트릭스**(Variables REST ❌·커스텀 Code Connect ❌, 검증 반영) · **데이터×채널 매트릭스** · **조합 오케스트레이션 레시피**(토큰→컴포넌트→동결 visual-spec→조합→diff) + auto-layout→NativeWind flex 매핑. |

읽는 순서: **01 → 02 → 03**(진단·처방) → **04**(처방 1·2·3 을 MCP/REST 2채널로 *어떻게 구현·수집·조합* 하나의 레퍼런스). 04 는 [실험 프로토콜](../../../temp/proposals/figma-fidelity-experiment.md)·[EXTRACTION.md](../../../temp/runs/figma-fidelity-001/EXTRACTION.md) 의 채널 분담을 전제로 한다.

## 핵심 주장 검증 (실제 파일 대조 결과)

| 주장 | 판정 | 근거(실제 파일) |
|---|---|---|
| figma-component-mapping 은 **컴포넌트 레벨 매핑**만 담고 색/간격/치수 등 **값 레벨**은 못 담는다 | **confirmed** | [figma-component-mapping.template.md](../../../frontend-workflow-kit/templates/screen/figma-component-mapping.template.md) 표 컬럼 = `Figma Node \| UI 요소 \| 매핑 컴포넌트 \| 비고` |
| LLM 은 디자인 값을 추측하지 못하게 강제됨 → 값이 없으면 TODO 로 남음 | **confirmed** | [frontend-llm-workflow.md](../../../frontend-llm-workflow.md) "디자인 값을 추측하지 않는다. 모르면 TODO 주석으로 남긴다" · [component-guidelines.md](../../../frontend-workflow-kit/examples/input-reconciliation/project-before/docs/frontend-workflow/design/component-guidelines.md) "색상·간격·타이포 … TODO 로 남긴다" |
| 픽셀 정합성은 §8 "UI 보정"으로 미뤄지고, 그 추출은 "Figma MCP frame context" 한 줄에 의존 | **confirmed** | [frontend-llm-workflow.md](../../../frontend-llm-workflow.md) §7 "픽셀 정합성은 최종 Figma 단계에서 잡는다" · §8 "Figma MCP 로 frame context 를 가져와 매핑 문서 작성에 활용" |
| `figma_mapping_status` 게이트는 매핑 문서의 **존재(draft)** 만 보고 값 충실도/코드 일치는 안 본다 | **confirmed** | [figma-component-mapping.template.md](../../../frontend-workflow-kit/templates/screen/figma-component-mapping.template.md) "final-fixture-ui 게이트가 `figma_mapping_status >= draft` 로 읽는다" |
| MVP-A 게이트 인벤토리에 **시각/픽셀 fact 가 없다** | **confirmed** | [roadmap-current.md](../../../frontend-workflow-kit/roadmap-current.md) 게이트 인벤토리 fact 목록(`figma_mapping_status` 는 있으나 값이 아닌 존재 신호) |
| Figma 입력 산출물은 간격 수치를 잡을 수 *있으나* 정착지(mapping)에 칸이 없어 자연어 Notes 로만 남는다 | **confirmed** | [IN-20260614-figma-002.md](../../../frontend-workflow-kit/examples/input-validation/pass/docs/frontend-workflow/inputs/IN-20260614-figma-002.md) `Extracted Facts: 일러스트-문구 세로 간격 16 → 24` |
| 이 레포의 `layout-profile` 은 **폴더/role 경로**이지 시각 레이아웃이 아니다 | **confirmed** | [presets/expo-feature.yaml](../../../frontend-workflow-kit/presets/expo-feature.yaml) `route_entry: src/app/**` 등 role→glob |

## 조사 방법

- 정본 문서 통독: [roadmap-current.md](../../../frontend-workflow-kit/roadmap-current.md) · [README.md](../../../frontend-workflow-kit/README.md) · [frontend-llm-workflow.md](../../../frontend-llm-workflow.md)(핵심 설계·11단계 작업 순서·충돌 우선순위).
- 산출물 계약 대조: 템플릿([screen-spec](../../../frontend-workflow-kit/templates/screen/screen-spec.template.md) · [figma-component-mapping](../../../frontend-workflow-kit/templates/screen/figma-component-mapping.template.md)) ↔ golden example([coupon-feature screen-spec](../../../frontend-workflow-kit/examples/coupon-feature/docs/frontend-workflow/domains/coupons/screens/coupon-list/screen-spec.md) · figma-component-mapping · [component-catalog](../../../frontend-workflow-kit/examples/coupon-feature/docs/frontend-workflow/design/component-catalog.md) · [component-guidelines](../../../frontend-workflow-kit/examples/input-reconciliation/project-before/docs/frontend-workflow/design/component-guidelines.md)).
- 입력 파이프라인: [reconcile-input SKILL](../../../.claude/skills/reconcile-input/SKILL.md) · Figma 입력 예제([IN-20260614-figma-002](../../../frontend-workflow-kit/examples/input-validation/pass/docs/frontend-workflow/inputs/IN-20260614-figma-002.md)).
- 게이트 fact 인벤토리·"layout-profile" 의미 확인: roadmap 게이트 인벤토리 · [presets/expo-feature.yaml](../../../frontend-workflow-kit/presets/expo-feature.yaml).
- 모든 주장은 위 "핵심 주장 검증" 표에서 실제 파일과 1:1 대조했다 — 추측이 아니라 파일 근거.

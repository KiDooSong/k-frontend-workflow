# 다음 투입 아이디어 포트폴리오 — frontend-workflow-kit 리서치

> 날짜: 2026-07-05 · status: draft(리서치 산출물, 게이트 아님)
> "이 킷에 다음으로 **투입할 만한** 아이디어는 무엇이고, 각각이 킷의 불변식과 정합하는가"에 대한 5장짜리 딥리서치 묶음 + 인덱스.

이 폴더는 **리서치 evidence** 다 — 킷의 `docs/frontend-workflow/` 산출물(screen-spec·readiness·validate 대상)이 **아니며**, 어떤 게이트도 걸지 않는다. 여기 제안된 아이디어의 실제 도입은 전부 별도 Open Decision + 사람 승인을 따른다. ([docs/research/figma-design/](../figma-design/README.md) · [docs/research/playwright/](../playwright/README.md) 와 같은 위상.)

---

## 한 줄 결론

**이 킷은 "게이트를 만드는 능력"은 최상위 성숙도에 도달했지만, 그 게이트를 *측정·증거화·균일 소비·적대적 검증*하는 계층이 구조적으로 비어 있다.** 그래서 로드맵의 "다음 구현 후보"가 하나같이 *"telemetry/adoption 이후 승격"* 에서 멈춰 있다 — 정작 그 telemetry 를 **모을 수단이 없기 때문**이다. 아래 5개 아이디어는 새 산출물 축·새 게이트를 **하나도 만들지 않고**, 이미 있는 결정적·warning-first 도구 계열(`doctor`·`route-cross-check`·`check-generated`·`test-fixtures`)을 확장해 이 빈 계층을 채운다.

## 이 포트폴리오를 떠받치는 단 하나의 관찰

> **킷의 판정 게이트는 파일로 고정되고 기계로 강제되는데, 그 게이트의 *정확도·채택·무결성·정합성*을 보는 눈은 아무것도 파일로 고정돼 있지 않다.**

로드맵의 승격 결정들(`lint-pack` 하드 게이트, `Tier2` codegen/route, Interaction Matrix 검사 13)은 전부 **"observed telemetry / brownfield dogfood 이후 별도 Open Decision"** 을 조건으로 건다 ([roadmap-current.md](../../../kit-dev/roadmap-current.md) "다음 구현 후보"). 그런데 그 telemetry 는 지금 **수동 일회성 run report** 로만 존재하고([lint-gate-promotion-evidence-001](../../../kit-dev/temp/runs/lint-gate-promotion-evidence-001.md) · [tier2-gate-promotion-evidence-001](../../../kit-dev/temp/runs/tier2-gate-promotion-evidence-001.md)), 그마저 재현 불가·비결정적이다. 이 비대칭이 5장 전체를 관통한다.

## 관통 결핍 — 4개 빈 계층

| 빈 계층 | 지금 상태 | 채우는 리포트 |
|---|---|---|
| **증거(evidence)** — 승격에 필요한 telemetry 를 결정적으로 축적 | 수동 일회성 run report(재현 불가) | [01](01-telemetry-and-promotion-evidence.md) |
| **정확도(accuracy)** — 게이트 판정이 실제로 맞는지 측정 | 측정 0 (false-open 율 모름) | [02](02-eval-and-calibration-harness.md) |
| **소비(consumption)** — 이기종 에이전트가 게이트를 균일하게 소비 | 소비자마다 `--json` 파싱 재구현(드리프트) | [03](03-mcp-native-gate-serving.md) |
| **무결성(integrity)** — 게이트가 적대적 에이전트에 실제로 저항하는지 | 산발적 방어, 통합 적대 검증 부재 | [04](04-adversarial-reward-hacking-redteam.md) |
| **정합성(consistency)** — 정본 문서 자체의 드리프트 감지 | 수동 리콘사일(커밋 `0593bca`) | [05](05-canonical-doc-drift-detector.md) |

## 5개 아이디어

| # | 아이디어 | 한 줄 | 채우는 계층 |
|---|---|---|---|
| 01 | **Telemetry & Promotion-Evidence Harness** | 승격이 요구하는 증거를 결정적·멱등·warning-first 로 축적하는 관측 산출물 | 증거 |
| 02 | **Eval & Calibration Harness** | 라벨링된 golden 시나리오로 readiness 판정의 false-open/false-closed 율을 측정 | 정확도 |
| 03 | **MCP-native Gate Serving** | readiness/validate/state 를 MCP tool·resource 로 노출해 모든 에이전트가 균일 소비(판정은 여전히 `readiness.mjs`) | 소비 |
| 04 | **Adversarial / Reward-Hacking Red-Team Suite** | 금지 전이를 능동적으로 시도해 fail-closed 를 증명하는 위협모델 fixture 매트릭스 | 무결성 |
| 05 | **Canonical-Doc Drift Detector** | dead anchor·manifest↔roadmap status 불일치를 결정적·warning-first 로 감지 | 정합성 |

## 우선순위 스코어링

축: **임팩트**(무엇이 풀리나) · **불변식 안전성**(정합 위험) · **공수** · **다른 후보를 푸는가(unblocks)**. (1~5, 높을수록 유리. 공수는 낮을수록 유리하나 표는 "가치/난이도" 관점으로 서술.)

| # | 아이디어 | 임팩트 | 불변식 안전성 | 공수 | 다른 후보 unblock | 권고 |
|---|---|:--:|:--:|:--:|:--:|---|
| 01 | Telemetry & Promotion-Evidence | ★★★★★ | ★★★★★ | 중 | **직접**(승격 큐 전체) | **1순위** |
| 05 | Doc Drift Detector | ★★★☆☆ | ★★★★★ | 낮 | 간접 | **첫 착수(가장 얇음)** |
| 04 | Red-Team Suite | ★★★★☆ | ★★★★★ | 중 | 간접(무결성 신뢰) | 2순위 |
| 02 | Eval & Calibration | ★★★★★ | ★★★★☆ | 중상 | 간접(정확도 근거) | 전략적 |
| 03 | MCP Gate Serving | ★★★★☆ | ★★★★☆ | 중 | 간접(채택 가속) | 도입-시점 의존 |

> **읽는 순서 권고:** 관통 논지는 **01 → 02** (증거→정확도), 실행 위험이 가장 낮은 **첫 PR 후보는 05**(dead-link 감지, 거의 무위험), 킷의 핵심 전제를 지키는 **04**, 채택을 넓히는 **03** 순. 세 후보(01·04·05)는 전부 기존 결정적 도구(`doctor`/`route-cross-check`/`test-fixtures`) 패턴의 **확장**이라 새 실행경로 위험이 낮다.

## 불변식과의 관계 (전 아이디어 공통)

5개 모두 다음을 **지키도록** 설계 조사됐다 — 각 리포트의 `불변식 정합성` 표에서 항목별로 검증한다.

- **새 산출물 축을 만들지 않는다.** 전부 관측/측정/소비/검증 *도구*이지, 저작 대상 문서가 아니다 (로드맵 "새 축 금지" 준수).
- **새 게이트를 만들지 않는다.** 01·05 는 warning-first(always exit 0 posture), 02·04 는 측정/테스트, 03 은 얇은 wrapper. 실제 차단 권한은 여전히 readiness(Open Decision) + validate 뿐.
- **판정 로직은 한 곳(`readiness.mjs`).** 03 의 MCP 서버조차 subprocess 로 소비만 한다(execution-loop 의 "판정 재구현 0" 원칙과 동형).
- **LLM 이 게이트를 내리지 못한다.** 어떤 아이디어도 resolve/confirm/conflict-close 를 자동화하지 않는다 — 04 는 오히려 그 시도를 *탐지*한다.

## 기존 리서치와의 관계 (중복 아님)

이 묶음은 이미 있는 3개 리서치와 **다른 계층**을 다룬다.

| 기존 리서치 | 다룬 것 | 이 묶음이 안 다루는 이유 |
|---|---|---|
| [figma-design](../figma-design/README.md) | 시각 충실도(픽셀/토큰) 축의 비대칭 | 시각 축은 별도 처방(visual-spec) 진행 중 |
| [playwright](../playwright/README.md) | e2e evidence(선택형) | 이미 e2e-agent 스킬로 랜딩 |
| [execution-loop-research](../../../temp/execution-loop-research/SYNTHESIS.md) | 실행 루프/Work Packet runner | 이미 `workflow:packet/report/run` 로 랜딩 — 본 묶음은 그 위의 *측정/증거* 계층 |

특히 execution-loop SYNTHESIS §8 이 **"critic 실효성·ask 임계 보정 = coupon-feature A/B 측정 과제, 딥리서치로는 안 풀림"** 이라고 명시적으로 미뤄둔 지점을 [리포트 02](02-eval-and-calibration-harness.md)가 정면으로 받는다.

## 조사 방법

- 정본 통독: [roadmap-current.md](../../../kit-dev/roadmap-current.md) · [open-decisions.md](../../../kit-dev/open-decisions.md) · [doc-ownership.md](../../../frontend-workflow-kit/docs/reference/doc-ownership.md) · [IMPLEMENTING.md](../../../IMPLEMENTING.md)(9 불변식) · [package.json](../../../frontend-workflow-kit/package.json)(기존 스크립트 계약).
- 승격-증거 결핍 대조: 두 개의 수동 evidence run report([lint](../../../kit-dev/temp/runs/lint-gate-promotion-evidence-001.md) · [tier2](../../../kit-dev/temp/runs/tier2-gate-promotion-evidence-001.md)).
- 각 리포트의 `핵심 주장 검증` 표는 모든 주장을 실제 파일과 1:1 대조한다 — 추측이 아니라 파일 근거.

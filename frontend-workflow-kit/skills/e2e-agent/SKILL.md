---
name: e2e-agent
description: frontend-workflow ScreenSpec/visual 계약에서 Playwright 웹 E2E evidence를 계획, 생성, 검증, 수리한다. 사용자가 "e2e 짜줘", "웹 검증", "플레이라이트 테스트", "Playwright", "web evidence", "test plan", "run e2e", "heal failing test"를 요청할 때 사용. 선택형 증거이며 readiness, CI, 승인 게이트가 아니다.
---

# e2e-agent

ScreenSpec 기반 **선택형 웹 E2E evidence**를 만든다. 이 스킬은
[workflow spine](../../docs/reference/workflow-spine.md)의
[Stage 08](../../docs/reference/workflow-stages/08-validate-and-report.md) 보조 절차이며,
계획은 [Stage 05](../../docs/reference/workflow-stages/05-author-workflow-contracts.md),
제품 코드 변경은 [Stage 06](../../docs/reference/workflow-stages/06-implement-screen-or-code.md)
경계를 따른다. 세부 규칙의 정본은 [doc-ownership.md](../../docs/reference/doc-ownership.md).

## 핵심 불변식

- E2E green은 승인, `confirmed` 승격, Open Decision resolve, Gap accept, readiness 상승이 아니다.
- Playwright는 웹 표면 evidence다. fixture green은 실제 통합 동작 정확성을 증명하지 않는다.
- E2E green은 필요조건이지 충분조건이 아니다. faithful generator는 약한 plan 단언을 green-but-inert 테스트로 굳히므로(예: `.click()` 직후 `toBeFocused()`), assertion/locator 정밀도 게이트는 codegen이 아니라 plan/review에서 적용한다. app 정의 상태만 단언하고(브라우저 focus/`:active` 아티팩트 금지), 반복 행은 container testid+id로 스코핑한다. 규칙 정본은 [e2e-behavioral-rules.md](../../docs/reference/e2e-behavioral-rules.md).
- canonical Screen ID는 [screen-identity.md](../../docs/reference/screen-identity.md)가 정본이다. source alias로 만들지 않는다.
- 제품 코드 수정은 항상 Stage 06 readiness의 `allowed_paths`/`forbidden_paths`를 따른다.
- `tests/web-plans/**`와 `tests/web/**`는 consumer-owned E2E 표면이다. readiness path governance가 이 경로를 허용한다는 뜻이 아니며, 새 테스트 파일 생성은 사용자 요청/확인 뒤에만 한다.
- 테스트 파일은 Stage 07의 generated derived view가 아니다. route/nav/catalog/codegen/lint source가 바뀐 경우에만 [Stage 07](../../docs/reference/workflow-stages/07-regenerate-derived-views.md)을 수행한다.

## Mode Router

| 요청/상태 | Mode | 기준 stage |
|---|---|---|
| 테스트 계획, e2e 설계, planner preflight | `plan` | Stage 05 |
| 계획이 있고 앱/seed URL/locator가 준비됨 | `generate` | Stage 06 |
| 기존 테스트 실행, handoff evidence | `verify` | Stage 08 |
| 실패 evidence가 있고 사용자가 수리 요청 | `heal` | Stage 08/maintenance |

애매하면 `plan`으로 시작한다. deep/full coverage는 사용자가 요청했거나 핵심 business path, branchy interaction, prior bug/drift, resolved decision이 있을 때만 한다.

## 읽을 것

- 대상 ScreenSpec 또는 [screen-spec.template.md](../../templates/screen/screen-spec.template.md)의 State/Interaction/Acceptance 구조.
- 시각 evidence가 필요하면 [figma-component-mapping.template.md](../../templates/screen/figma-component-mapping.template.md) 계열 문서.
- 2차 산출물 판단은 [task-artifact-matrix.md](../../docs/reference/task-artifact-matrix.md).
- 명령 syntax는 [COMMANDS.md](../../COMMANDS.md), route/screen 관례는 [CONVENTIONS.md](../../CONVENTIONS.md).
- Playwright Test Agents setup은 [e2e-playwright-agents.md](../../docs/reference/e2e-playwright-agents.md). consumer repo 적용 순서(install/commit/ignore/run)+체크리스트는 [e2e-consumer-adoption.md](../../docs/reference/e2e-consumer-adoption.md).
- plan/generate/verify에서 적용·주입할 assertion·locator·coverage 규칙은 [e2e-behavioral-rules.md](../../docs/reference/e2e-behavioral-rules.md).
- planner context scaffold는 [web-plan.template.md](../../templates/e2e/web-plan.template.md).
- 기존 `tests/web-plans/**`, `tests/web/**`, Playwright config, web server command.

## Output Paths

기존 consumer 관례가 있으면 따른다. 없으면:

```txt
tests/web-plans/{domain}/{screen-slug}/plan.md
tests/web/{domain}/{screen-slug}/<suite>.spec.ts    # 화면당 폴더, suite 파일 1..N개
```

`{screen-slug}`는 canonical `screen_id`를 lowercase로 만들고 non-alphanumeric 문자를 `-`로 치환한 파일명이다(예: `COUPON-001` -> `coupon-001`, `AUTH/SIGNUP_EMAIL` -> `auth-signup-email`; ScreenSpec folder slug가 아니다). plan/test 첫머리에는 canonical `screen_id`, ScreenSpec path, seed/route 출처를 남겨 slug drift를 막는다.

**파일 패키징.** 생성 테스트는 화면당 폴더 `tests/web/{domain}/{screen-slug}/<suite>.spec.ts`(suite 파일 1..N개, 단일 suite도 폴더 하나)에 둔다. planner "suite"가 사실 별개의 canonical screen이면 그 screen의 `screen-slug`로 보낸다([screen-identity.md](../../docs/reference/screen-identity.md)). 패키징 세부(planner의 `File:` 재사용, `testDir` 불변, 합치지 않음)는 [e2e-playwright-agents.md → Kit Mapping](../../docs/reference/e2e-playwright-agents.md#kit-mapping).

`tests/web-plans/{domain}/{screen-slug}/plan.md`는 reviewed canonical final plan 경로다. raw planner output은 `specs/` 또는 run-isolated draft 경로에 두고, 검토 후 official planner output body를 보존한 canonical plan으로 옮긴다.

Kit repo 자체 dogfood에서는 repo-root `tests/web-plans/**`를 만들지 말고 consumer path shape를 `kit-dev/temp/runs/<run-id>/tests/web-plans/...` 아래에 보존한다.

Playwright report/trace는 기본 커밋하지 않는다. 결과는 run report, Stage 08 handoff, 또는 consumer가 정의한 verification note에 링크/요약한다.

## Preconditions

| Mode | 필요한 것 |
|---|---|
| `plan` | canonical Screen ID, ScreenSpec; actual planner run also needs runnable web app/seed and Playwright Test Agents setup |
| `generate` | approved plan, runnable web app, seed/entry URL, locator strategy, preferably `final-fixture-ui`+ |
| `verify` | existing tests, Playwright command/config, web server command |
| `heal` | failing evidence, limited test write scope, explicit user request |

`rough-fixture-ui`에서는 `plan`을 선호한다. 사용자가 명시하면 매우 얕은 smoke만 생성한다.

## 절차

1. mode, 대상 Screen ID, domain, route를 확정한다. 없거나 alias뿐이면 [Stage 02](../../docs/reference/workflow-stages/02-screen-identity-source-mapping.md)로 보낸다.
2. `generate`/구현 인접 작업이면:
   ```bash
   npm run workflow:state
   npm run workflow:readiness -- --screen <SCREEN_ID> --json
   ```
3. context packet을 만든다: screen id/domain/route, `seed_file`/`playwright_project`/`base_url`/`test_dir`, State/Interaction rows, 제외할 Open Decisions, copy/a11y/testID anchors, visual facts as evidence only. [e2e-behavioral-rules.md](../../docs/reference/e2e-behavioral-rules.md)의 assertion·locator 규칙을 packet에 포함한다.
4. `plan`: consumer repo에 Playwright Test Agents setup이 없으면 멈추고 setup required로 보고한다. 있으면 planner를 우선 호출한다. scenario는 app 정의 상태를 타깃하고(behavioral-rules §A), 커버리지 깊이는 planner가 책임진다(§C: state-transition·side-effect까지). template은 kit dogfood, preflight notes, human-reviewed context scaffold에만 쓰며 generator input으로 넘기지 않는다. Plan-only는 test runner, generator/healer를 실행하지 않고 `tests/web/**`를 만들지 않는다.
5. `generate`: approved plan + seed/entry URL로 generator를 쓰고 configured `test_dir` 아래에 둔다. generator(직접/위임) 프롬프트에 behavioral-rules 규칙을 주입한다 — dogfood에서 행 스코핑 규칙(§B1) 주입이 strict-mode 버그를 예방했다. 테스트는 화면당 폴더(`{screen-slug}/<suite>.spec.ts`)에 둔다(아래 Output Paths). 생성 전 사용자 확인을 받는다.
6. `verify`: 가장 작은 관련 Playwright command를 실행하고 결과 요약을 남긴다. 생성 세트 채택 전 behavioral-rules의 Review checklist로 inert 단언(`.click()` 직후 `toBeFocused()` 등)을 걸러낸다.
7. `heal`: 실패 evidence 뒤에만 healer를 쓰고 assertion weakening, broad regex, `test.fixme()`를 diff에서 확인한다.
8. plan-only가 아니거나 workflow docs가 바뀌었으면 `npm run workflow:validate`를 실행한다. 최종 보고는 evidence로만 말한다.

## Drift Handling

- app이 ScreenSpec을 어긴 듯하면 red evidence와 구현 수정 대상을 보고한다.
- ScreenSpec이 stale하면 `reconcile-input`/ScreenSpec 갱신 후보로 보고한다.
- visual-only mismatch는 visual mapping/gap/evidence 문제로 분리한다.
- ownership이 불명확하면 Open Decision 또는 verification note 후보로 올린다.
- 선언된 testID가 없으면 새 anchor를 발명하지 말고 계약 추가/수정을 제안한다.

## 확인 필요

다음은 명시 요청/확인 없이는 하지 않는다: 새 `tests/web/**` 생성, 큰 테스트 재작성, healer 실행, `test.fixme()`/약한 assertion 수용, CI/required check/hard gate/`--enforce` 배선.

## 금지

Open Decision resolve, Unknown close, Component Gap accept, `confirmed` 승격, readiness policy 변경, Playwright report/trace 기본 커밋, CI/hard gate 배선을 하지 않는다.

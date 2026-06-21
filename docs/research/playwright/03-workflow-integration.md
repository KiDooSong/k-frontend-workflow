# 03 — Playwright Agents 3종을 우리 워크플로우 어디에 어떻게 끼울 것인가

> 한 줄 요약: Playwright Planner/Generator/Healer 를 이 킷의 파이프라인·모드 사다리·Verification Matrix·방어선에 매핑하고, 테스트를 "4번째 방어선"이 아니라 **evidence** 로 다루는 끼우기 설계.
> 날짜: 2026-06-20 · status: draft

---

## 0. 이 보고서가 답하는 것 (그리고 안 하는 것)

이 보고서는 [01](01-playwright-agents-planner-generator-healer.md)·[02](02-expo-web-and-mobile-simulator.md) 와 짝이다. 01 은 "Planner/Generator/Healer 자체를 잘 쓰는 법", 02 는 "Expo 웹·모바일 환경에서 돌리는 법"을 다룬다. 여기 03 은 **그 둘을 우리 킷의 결정적 파이프라인에 어떻게 끼우느냐**만 다룬다. Playwright 의 일반 사용법은 01/02 로 미루고, 여기서는 킷 고유의 개념 — readiness/모드 사다리/게이트/Open Decision/Verification Matrix/blocks_mode/방어선/confirmed 승격/evidence/handoff/멱등/GENERATED 마커 — 에만 매핑한다.

전제(02 에서 검증된 사실, 여기서 반복하지 않고 결론만 사용):

- Playwright 는 브라우저/WebView 만 자동화한다. **Expo 에선 react-native-web 웹 빌드만** Planner/Generator/Healer 가 직접 커버하고, 네이티브 iOS/Android 시뮬레이터 E2E 는 [Maestro(Expo 공식)](https://docs.expo.dev/eas/workflows/examples/e2e-tests/)/Detox/Appium 영역이다. ([Playwright Test Agents](https://playwright.dev/docs/test-agents))
- react-native-web 은 RN `testID` 를 DOM `data-testid` 로, `accessibilityRole`/`role` 을 ARIA `role`(필요시 의미 HTML 요소)로, `accessibilityLabel`/`aria-label` 을 `aria-label` 로 내보낸다. 그래서 `getByTestId`/`getByRole` 가 **추가 설정 없이** Expo 웹에서 동작한다. ([createDOMProps 소스](https://github.com/necolas/react-native-web/blob/master/packages/react-native-web/src/modules/createDOMProps/index.js), [Playwright locators](https://playwright.dev/docs/locators))
- Playwright 공식 워크플로우는 **에디터 안 대화형 실행**이고, CI 무인 자동수정(Healer auto-fix) 모드는 공식 문서에 명시돼 있지 않다. ([Playwright Test Agents](https://playwright.dev/docs/test-agents)) → 이 결론이 (c)·(f) 의 핵심 제약이다.

핵심 한 줄(아래 전체를 관통한다): **이 킷에서 테스트는 게이트가 아니라 evidence 다.** validate 12종이 "통과 = 완료가 아니다"이듯, E2E 초록불도 confirmed 승격이나 Open Decision 닫기를 자동으로 못 한다.

---

## 1. 끼우는 자리: 핵심 루프와 산출물 축

킷의 닫힌 핵심 루프는 다음이다(`roadmap-current.md`):

```txt
Input Skill → Reconciliation → Documents → State → Readiness → Work → Validate
```

그리고 닫힌 산출물 축(roadmap "산출물 축"):

```txt
저작 문서        screen-spec / navigation-map / llm-rules / domain-rules
생성 상태        _meta/workflow-state.yaml · screen-inventory.yaml
결정             Open Decisions (readiness cap)
입력 정합        Input Reconciliation (register · conflict · re-open)
조사/검증        Investigation / Verification (evidence handoff)
```

> 이 목록은 roadmap 이 **"닫혔다"** 고 못박았다 — "지금 단계의 목표는 새 축을 더 만드는 게 아니라 위 축들의 경계를 선명히 하는 것". 따라서 **Playwright 를 새 산출물 축으로 추가하지 않는다.** E2E 는 기존 **조사/검증 축(Investigation / Verification)의 evidence 생성기**로 들어가고, 산출물은 기존 **Verification Matrix 의 `Web` 열을 채우는 evidence** 일 뿐이다. "리뷰도 새 축 아님"과 같은 원칙을 그대로 적용한다.

세 에이전트의 거친 매핑:

| Playwright 에이전트 | 산출물 | 킷에서의 위치 | 방어선 |
|---|---|---|---|
| **Planner** | `specs/*.plan.md`(Markdown 플랜) | screen-spec 의 Interaction/State Matrix·Investigation 을 **읽어** 플랜 초안 → 사람이 교정 | 보조 (저작 입력) |
| **Generator** | `tests/*.spec.ts`(`// spec:`·`// seed:` 헤더 부착) | Verification Matrix `Web` 열의 evidence 산출물 | evidence |
| **Healer** | 깨진 테스트 수정 diff / `test.fixme()` | evidence 유지보수. 자동수정도 **사람 리뷰 전엔 confirmed 아님** | evidence(요리뷰) |

---

## 2. (a) 모드 사다리의 어느 지점에서 어떤 테스트가 의미 있는가

모드 사다리(`policies/implementation-mode-policy.yaml`):

```txt
docs-only → route-skeleton → screen-skeleton → rough-fixture-ui
→ final-fixture-ui → api-integrated-ui → production-ready
```

핵심 통찰: **fixture-ui 모드들(`rough`/`final-fixture-ui`)은 화면이 `AsyncState` 계약을 따르는 fake hook 만 의존하고 `src/api/**` 를 forbidden 으로 막는다**(정책의 `final-fixture-ui.forbidden_paths: ["{roles.api_client}"]`). 즉 이 단계의 웹 빌드는 **결정적 픽스처로 모든 State Matrix 상태를 재현**할 수 있다 — 네트워크/백엔드 비결정성이 없다. 이건 Playwright Generator 의 라이브 locator 검증에 **이상적인 결정적 환경**이다(02 가 강조한 "Agents rely on consistent environments").

사다리별 권고:

| 모드 | 웹(Playwright) 권고 | 근거 |
|---|---|---|
| `docs-only` ~ `screen-skeleton` | **테스트 없음.** 화면 실체(픽스처 UI)가 없어 탐색할 게 없다. Planner 가 탐색할 라이브 페이지 자체가 미완. | Planner 는 라이브 page 컨텍스트 필수 |
| `rough-fixture-ui` | **선택: Planner 로 플랜 초안만.** UI 가 거칠어 셀렉터가 흔들리므로 `.spec.ts` 산출은 이르다. 플랜(Markdown)을 만들어 screen-spec 과 대조해두는 정도. | Generator 산출은 final 에서 |
| `final-fixture-ui` | **여기가 1차 진입점.** Planner 로 플랜 + Generator 로 **웹 E2E 초안** 작성. 픽스처가 안정적(`screen_spec_status >= confirmed`, `figma_mapping_status >= draft`)이고 모든 상태가 결정적으로 재현된다. State Matrix/Interaction Matrix 가 플랜의 시나리오로 1:1 매핑된다. | 결정적 픽스처 + 안정 셀렉터 |
| `api-integrated-ui` | **본격 E2E.** api-integrated 단계는 `{roles.screen}` 을 forbidden 으로 막고 hook 내부만 교체한다 — **화면 행동(Interaction)은 불변**이므로 final 에서 만든 웹 E2E 가 그대로 회귀 가드가 된다. 실데이터/에러 경로는 Network mock 으로 결정화. | 화면 불변 계약 = 테스트 안정 |
| `production-ready` | **E2E 풀 스위트 + Healer 유지보수.** `ci_lint`/`ci_schema_validation`/`llm_semantic_review` 가 걸리는 최종 모드. Healer 는 리팩터로 셀렉터가 움직였을 때 **로컬/PR 에서** 복구. | 최종 게이트 + 드리프트 추적 |

> 한 문장 규칙: **Planner 는 `final-fixture-ui` 에서 처음 의미가 있고, Generator 의 본격 산출은 `final` ~ `api-integrated-ui`, Healer 유지보수는 `production-ready` 에서 돈다.** 그 아래 모드(`docs-only`~`screen-skeleton`)에서 E2E 를 만들려는 건 "화면이 없는데 플랜을 쓰는" 카테고리 오류다.

네이티브 열(iOS/Android)은 Playwright 가 아니라 Maestro/Detox 가 채운다(§3). 모드 사다리 상으로는 동일하게 `final-fixture-ui`(dev-client 빌드 가능 시점) 이후가 의미 있다.

---

## 3. (b) Planner 플랜 ↔ screen-spec/Investigation 연결, Verification Matrix 열 분담

### 3.1 Planner 출력을 screen-spec 의 Matrix 와 잇기

Planner 가 내는 플랜(`planner_save_plan` 의 결정적 Markdown: `### N. Suite` / `#### N.M. test` / `**Steps:**` / `- expect:`)은 우리 screen-spec 의 두 표와 **구조적으로 대응**한다:

```txt
screen-spec ## Interaction Matrix  (User Action | Trigger | Result | Analytics Event)
   →  Planner suite 의 perform 스텝 (사용자 의도 = User Action/Trigger)

screen-spec ## State Matrix        (State | Condition | UI)
   →  Planner 스텝의 - expect: 라인 (관찰 가능한 결과 = 각 State 의 UI)
```

이게 우연이 아닌 이유: 킷은 이미 **Interaction Matrix 를 결정적 모델로 파싱**한다. `nav-graph.mjs` 가 각 screen-spec 의 `## Interaction Matrix` Result 컬럼(v2 면 `Result Type`/`Target`)에서 이동 엣지를 도출해 `_meta/nav-graph.yaml` 로 만든다. 즉 **Interaction Matrix 는 이미 기계가독 단일 출처**다. Planner 플랜은 이 단일 출처를 사람이 검토하는 표현형으로 보면 된다.

연결 규칙(저작 규율):

1. **Planner 입력은 screen-spec 이 단일 출처.** Planner 프롬프트에 "이 화면의 Interaction Matrix/State Matrix 를 커버하는 플랜을 만들라"고 주고, 플랜 범위를 화면 1개로 좁힌다(02 의 "one coherent flow per request").
2. **플랜은 evidence 후보지 정본이 아니다.** Planner 가 만든 `- expect:` 가 screen-spec 의 State 와 어긋나면, screen-spec 을 임의로 고치지 말고 **Unknowns/Open Decisions/`global/conflicts.md`** 로 표면화한다(implement-screen 의 "추측 금지"와 동일 규율).
3. **Investigation 과의 연결**: 플랫폼 동작이 걸리는 시나리오(예: 키보드가 CTA 를 가림, 딥링크 callback)는 Planner 가 웹에서 "발견"하더라도 그 자체로 닫지 않는다. 해당 토픽의 `docs/frontend-workflow/domains/{domain}/investigations/{topic}.md` 의 Evidence 표에 한 줄(웹 관찰 결과)로 흘려보내고, **막아야 하면 연결된 Open Decision 으로 승격**한다(킷 불변식: "막는 investigation 은 반드시 대응하는 Open Decision 을 가진다").

### 3.2 Verification Matrix 의 열 분담 (이게 가장 깔끔한 매핑)

`investigation-and-verification.md` 의 Verification Matrix 는 이미 `Case 행 × {iOS, Android, Web} 열 × Evidence × Status` 다:

```md
| Case | iOS | Android | Web | Evidence | Status |
|---|---|---|---|---|---|
| Kakao app installed     | pending | pending | n/a     | -                  | open |
| Keyboard overlaps CTA   | pending | pending | pending | -                  | open |
| User cancels login      | pending | pending | n/a     | -                  | open |
```

여기에 **도구 분담을 그대로 얹는다**:

```txt
Web 열      ← Playwright (Generator 가 만든 tests/web/*.spec.ts 실행 결과)
iOS 열      ← Maestro(Expo 공식) 또는 Detox  (.maestro/*.yml / detox e2e)
Android 열  ← Maestro 또는 Detox
Evidence 열 ← 각 도구 산출물 링크 (Playwright HTML 리포트/trace.zip, Maestro 실행 로그)
Status 열   ← open/in-progress/passed/failed/blocked/not-applicable (사람이 갱신)
```

규율:

- **한 Case 의 세 열은 서로 다른 도구가 채운다.** 같은 `testID` 컨벤션을 RN 컴포넌트에 심으면 web 은 `data-testid`(Playwright `getByTestId`), 네이티브는 `testID`(Maestro/Detox)로 동일 소스가 양쪽에 노출된다 — 한 번의 `testID` 작성으로 세 열이 모두 잡힌다.
- **`Web` 열이 `n/a` 인 Case 도 있다**(예: "Kakao app installed"는 네이티브 전용 → `Web: n/a`). Playwright 로 커버 불가임을 `not-applicable`/`n/a` 로 명시한다. 반대로 "Keyboard overlaps CTA"처럼 세 플랫폼 모두 의미 있는 Case 는 web 열도 Playwright 가 채운다.
- **`Status` 갱신은 사람.** Playwright 가 초록이어도 자동으로 `passed` 를 쓰지 않는다 — 도구 출력은 Evidence 링크로 남기고, `passed/failed` 판정은 사람이 한다(=evidence vs 판정 분리). `blocks_mode` 가 어떤 모드를 막는지는 여전히 **연결된 Open Decision 이 실제 게이트**(MVP-A 에선 Verification Matrix 가 readiness 를 직접 게이트하지 않는다).

---

## 4. (c) 테스트는 "4번째 방어선"이 아니라 evidence — 게이트는 사람이 유지

킷의 3차 방어선(README "3차 방어선 중 2차"):

```txt
(1) 결정적 스크립트 가드레일  — forbidden-paths · test-fixtures · route-tree · nav-graph · lint-*
(2) 명령(state/readiness/validate) — CI 게이트, exit 0/1
(3) 사람/Codex 의미·제품 리뷰   — confirmed 승격은 사람만
```

**E2E 를 "4번째 방어선"으로 추가하려는 충동을 명시적으로 거부한다.** 이유:

1. **Healer 는 게이트가 아니다 — 통과를 만드는 에이전트다.** Healer 의 1차 목표는 "테스트를 통과시키는 것"이라, 실제 회귀(버튼이 안 뜸)도 assertion 을 완화하거나 더 느슨한 locator 로 **통과시킬 수 있다**. ([healer.agent.md](https://github.com/microsoft/playwright/tree/main/packages/playwright/src/agents)) "통과 = 정상"이 아니다 — 킷의 "통과 = 완료가 아니다"와 정확히 같은 함정이다.
2. **Healer 는 비대화형이라 질문하지 않는다.** 소스 verbatim: *"Do not ask user questions, you are not interactive tool, do the most reasonable thing possible to pass the test."* 즉 프롬프트 내부에 **사람 승인 게이트가 없다**. 승인 경계는 바깥(에디터에서 사람이 호출 → diff 리뷰 → 머지)에서 만들어야 한다.
3. **`test.fixme()` 자동 스킵은 사일런트 커버리지 손실이다.** Healer 가 "테스트가 맞다는 확신"으로 `test.fixme()` 처리하면 그 시나리오는 조용히 빠진다(주석은 남지만 그린으로 보인다). 이건 잠재적 회귀를 "고친" 게 아니라 "꺼버린" 것이다.

따라서 다음을 **불변식으로 추가**(기존 README 불변식 6 "confirmed 승격은 사람만"의 확장):

```txt
8. E2E 결과(Playwright/Maestro)는 evidence 다. 게이트가 아니다.
   - 초록불이 Open Decision 을 닫지 못한다. confirmed 로 승격시키지 못한다.
   - Healer 자동수정 diff 는 사람 리뷰 전에는 confirmed 아님. PR 로만 머지.
   - test.fixme() 추가는 "복구 실패를 사람에게 넘긴 신호" → PR 에서 반드시 트리아지.
   - Verification Matrix Status(passed/failed)는 도구가 아니라 사람이 쓴다.
```

운영 형태(02 의 거버넌스 결론 적용):

- **Healer 는 로컬/PR 브랜치에서** 돌리고 모든 수정은 PR 로. CI 메인 파이프라인은 **결정적 `retries`+`trace`** 로 두고 라이브 자가치유를 넣지 않는다.
- CI 의 E2E 잡은 "실패를 그대로 노출"이 기본. 자동수정은 사람이 보는 세션으로 한정.

---

## 5. (d) 신규 스크립트/스킬 제안 (결정적·멱등·기존 정합)

> 원칙: roadmap 의 "지금 하지 말 것"을 지킨다 — 새 산출물 축 금지, 게이트를 LLM 이 내리게 만들기 금지. 아래는 전부 **읽기 전용 생성 뷰**(route-tree/nav-graph 와 동급) 또는 **warning-first 검사**로 시작하고, **하드 게이트 승격은 evidence 기반 후속 Open Decision** 으로 미룬다(MVP-C 생성 뷰가 밟은 길과 동일).

### 5.1 `workflow:e2e-index` — E2E 산출물 인덱스 생성 뷰 (읽기 전용, 멱등)

route-tree/nav-graph 처럼 **결정적·멱등 읽기 전용 생성기**. screen-spec 의 `## Acceptance Criteria` 가 이미 `→ maestro/coupon-list.yaml`, `→ CouponListScreen.test.tsx` 같은 테스트 핸들을 적고 있다(coupon-list·login 실제 예시). 이걸 역색인해 화면↔E2E 매핑 인덱스를 만든다.

```txt
입력(읽기만):
  docs/frontend-workflow/domains/**/screen-spec.md   # ## Acceptance Criteria 의 테스트 핸들
  specs/**/*.plan.md                                 # Planner 플랜 (있으면)
  tests/web/**/*.spec.ts                             # Generator 산출 (// spec: 헤더)
산출(생성물 1개):
  docs/frontend-workflow/_meta/e2e-index.yaml        # do_not_edit: true, GENERATED 헤더
```

매니페스트 등록(`catalog/artifact-manifest.yaml`, 기존 생성물 계약과 동일 필드):

```yaml
  e2e-index:
    kind: generated
    generated: true
    scope: global
    path: docs/frontend-workflow/_meta/e2e-index.yaml
    command: npm run workflow:e2e-index
    source:
      - docs/frontend-workflow/domains/**/screen-spec.md   # ## Acceptance Criteria
      - specs/**/*.plan.md                                 # Planner plans
      - tests/web/**                                       # Generator output (// spec: provenance)
    do_not_edit: true
    status: planned     # 생성기 구현 전까지 planned (= "계약만 등록, 구현 아님")
    mvp: E
```

> `status: planned` 규칙을 지킨다 — 생성기가 실제로 구현되기 전엔 `planned`. validate 검사 6 헤더 검사는 파일이 존재할 때만 헤더를 보므로 planned 엔트리는 무해하다(매니페스트 주석의 계약 그대로).

### 5.2 GENERATED 마커: screen-spec 의 `## Verification` 블록 (선택)

nav-graph 가 screen-spec 의 Entry Points 를 `<!-- GENERATED:START nav-graph --> ... <!-- GENERATED:END nav-graph -->` 마커 안에 채우듯, **E2E 커버리지 요약**을 같은 패턴으로 screen-spec 에 역주입할 수 있다(마커 밖은 절대 안 건드림 — 불변식 3):

```md
## Verification
<!-- GENERATED:START e2e-index -->
<!-- DO NOT EDIT MANUALLY. Generated from Acceptance Criteria handles + tests/web provenance. -->
- Web:     tests/web/coupon-list.spec.ts (plan: specs/coupon-list.plan.md)  [evidence-only]
- iOS:     .maestro/coupon-list.yml
- Android: .maestro/coupon-list.yml
<!-- GENERATED:END e2e-index -->
```

`generated_sections` 에 `{ name: verification, generator: e2e-index }` 를 추가하면 screen-spec 매니페스트 계약(이미 `entry-points/nav-graph` 가 등록된 자리)에 정합한다. **이 블록은 evidence 링크일 뿐 게이트 아님**을 주석에 명시한다.

### 5.3 `roles.web_e2e` — 레이아웃 프로파일에 테스트 role 추가

현재 `presets/expo-feature.yaml` 의 roles 에는 테스트 디렉토리 role 이 **없다**(`route_entry`/`screen`/`hook`/`api_client`/`api_schema` 등만). E2E 산출물 경로를 정책이 인지하게 하려면 role 을 하나 추가한다:

```yaml
# presets/expo-feature.yaml — roles 에 추가
roles:
  # ... 기존 roles ...
  web_e2e: tests/web/**           # Playwright (Generator 산출 web spec)
  native_e2e: .maestro/**         # Maestro flows (또는 e2e/native/** for Detox)
```

용도: forbidden-paths backstop(§5.4)·implement-screen 의 allowed_paths 가 `{roles.web_e2e}` 토큰으로 테스트 경로를 다룰 수 있게 된다. role 단위 교체 머지(preset < project-layout.roles < domains.roles)를 그대로 따르므로 소비 프로젝트가 경로를 갈아끼울 수 있다.

### 5.4 forbidden-paths 정합: 테스트는 코드 모드를 풀지 않는다

`forbidden-paths.mjs` 는 diff 기반 backstop(warning-first, `--enforce` 로 하드)다. **모드별로 무엇을 막는지 정의는 정책 단일 출처**이므로, 테스트 경로를 추가할 때 다음을 정책에 반영한다:

- `final-fixture-ui` 이하에서 `tests/web/**`(=`{roles.web_e2e}`) **작성은 허용하되**, 테스트가 `src/api/**` 를 import 하지 못하게 한다(픽스처 계약 유지). 즉 web E2E spec 은 화면을 픽스처로 구동하는 것만 허용.
- E2E spec 작성이 `{roles.screen}`/`{roles.api_client}` 수정을 우회하는 통로가 되지 않도록, forbidden-paths 의 guarded surface 계산에 테스트 role 을 포함하지 **않는다**(테스트는 프로덕션 경로가 아니므로 코드 모드 게이트와 독립).

> 핵심: **E2E 디렉토리에 쓰는 행위가 readiness 모드를 우회하는 escape hatch 가 되면 안 된다.** 테스트는 evidence 라인이지 프로덕션 코드 라인이 아니다.

### 5.5 validate 검사 후보 (warning-first → evidence 후 승격)

validate 검사 13 이 이미 보여준 패턴 — **route-tree.txt 의 `route:` 토큰과 Interaction Matrix v2 Target 을 EXACT 교차검증(생성물 부재 시 skip, warning-only)** — 을 그대로 복제한다:

| 후보 검사 | 무엇을 보나 | 등급 | 비고 |
|---|---|---|---|
| **검사 14(가칭) e2e-handle 정합** | screen-spec `## Acceptance Criteria` 의 테스트 핸들(`→ *.spec.ts`/`→ maestro/*.yml`)이 실제 `tests/web/**`·`.maestro/**` 파일로 해소되는가 | **warning-first** | 생성물(e2e-index) 부재 시 skip. 검사 13 의 "artifact 없으면 skip" 패턴 그대로 |
| **검사 15(가칭) test.fixme 트리아지** | `tests/web/**` 에 `test.fixme(` 가 있는데 연결된 Open Decision/Conflict 가 없으면 경고 | **warning-first** | Healer 의 사일런트 스킵을 사람 트리아지로 끌어올림 |
| **검사 16(가칭) GENERATED 헤더** | `tests/web/**` 산출물이 `// spec:`·`// seed:` provenance 헤더를 가졌는가 | **warning-first** | 검사 6 의 generated 헤더 검사를 web spec 으로 확장 |

> 전부 **warning-first(exit 0)** 로 시작하고 `--enforce` 로만 하드. lint-baseline 의 ratchet 철학(`current <= baseline` pass, 증가는 `--enforce` 때만 exit 1)과 동일하게, **하드 게이트 승격은 telemetry/dogfood evidence 수집 후 별도 Open Decision** 에서만 결정한다. roadmap 의 "evidence 기반 gate promotion decision" 원칙을 그대로 따른다.

### 5.6 스킬 제안: `e2e-plan` (implement-screen 의 형제)

- **`e2e-plan` 스킬**: 대상 Screen ID 를 받아 (1) `npm run workflow:readiness -- --screen <ID> --json` 으로 모드 확인 → `final-fixture-ui` **미만이면 거부**(implement-screen 과 동일한 게이트 소비 패턴, 판정 중복 금지), (2) screen-spec 의 Interaction/State Matrix 를 컨텍스트로 로드, (3) Planner 서브에이전트를 호출해 `specs/{screen}.plan.md` 초안 생성, (4) 플랜 ↔ Matrix 대조 결과를 보고(어긋남은 Unknowns/Open Decisions 로). **Generator/Healer 호출은 사람 승인 후** — adapt-lint-pack 이 "사람 승인 전에는 lint-gen 을 실행하지 않는다"를 지키듯, e2e-plan 도 승인 전 `.spec.ts` 를 만들지 않는다(drafts/플랜만).
- 기존 `adapt-lint-pack` 의 "scan → map → diff → propose, 자동 마이그레이션 아님" 계약을 그대로 차용한다.

---

## 6. (e) End-to-end 예시: `coupon-list`(COUPON-001) — 무엇이 어디에 남는가

대상은 실제 골든 example 의 `COUPON-001`(`/(tabs)/coupons`, `status: confirmed`). 이 화면의 screen-spec 은 이미 다음을 가진다(실제 파일):

- `## State Matrix`: loading/success/empty/error/refreshing (5 상태)
- `## Interaction Matrix`: 쿠폰 클릭 → `/coupons/[id]`, 상태 탭 변경, 새로고침(refetch), 재시도(refetch)
- `## Acceptance Criteria`: `- [ ] 쿠폰 클릭 시 상세 이동 → maestro/coupon-list.yaml` (**이미 네이티브 E2E 핸들이 적혀 있다**)
- `## Open Decisions`: D-001(만료 쿠폰 노출), D-002(정렬), D-003(페이지네이션) — 모두 open

전제: 이 화면이 `final-fixture-ui` 에 도달했다고 하자(스펙 confirmed + figma mapping draft + 픽스처 hook 존재). 이제 흐름:

**0) 게이트 확인 (e2e-plan 스킬)**
```bash
npm run workflow:state
npm run workflow:readiness -- --screen COUPON-001 --json
# → readiness_mode: final-fixture-ui  → E2E 플랜 착수 허용 (rough 이하였으면 여기서 멈춤)
```

**1) Planner → 플랜 산출**
- 입력: "COUPON-001 의 Interaction Matrix/State Matrix 를 커버하는 웹 플랜을 만들라" + seed(`tests/seed.spec.ts`, 픽스처로 쿠폰 목록 화면을 띄움).
- Planner 가 react-native-web 빌드(`npx expo start --web`)를 탐색 → 산출:
  ```txt
  specs/coupon-list.plan.md
    ### 1. Coupon List Display
    #### 1.1. shows-skeleton-then-list
      **File:** tests/web/coupon-list/shows-list.spec.ts
      **Steps:**
        1. Navigate to /(tabs)/coupons
          - expect: SkeletonList 가 보인다        ← State Matrix: loading
          - expect: CouponList 가 렌더된다         ← State Matrix: success
        2. ...
    #### 1.2. empty-state
      - expect: EmptyState 가 보인다              ← State Matrix: empty
    #### 1.3. tap-coupon-navigates
      1. Tap 첫 쿠폰 카드
        - expect: URL 이 /coupons/<id> 로 바뀐다   ← Interaction Matrix: 쿠폰 클릭 → /coupons/[id]
  ```
- **사람 게이트(리뷰)**: 플랜의 `- expect:` 가 State Matrix 5 상태와 Interaction Matrix 엣지를 모두 덮는지 사람이 검토·교정. D-001(만료 쿠폰 노출)이 **open** 이므로 "만료 쿠폰 표시" 시나리오는 플랜에 **넣지 않는다**(결정 전 추측 금지) — 대신 플랜 코멘트에 "D-001 resolve 후 추가" 로 남긴다.

**2) Generator → 웹 E2E 초안 (사람 승인 후)**
```txt
tests/web/coupon-list/shows-list.spec.ts
  // spec: specs/coupon-list.plan.md
  // seed: tests/seed.spec.ts
  test.describe('Coupon List Display', () => {
    test('shows-skeleton-then-list', async ({ page }) => {
      await page.goto('/(tabs)/coupons');
      await expect(page.getByTestId('coupon-list')).toBeVisible();   // RN testID → data-testid
      ...
    });
    test('tap-coupon-navigates', async ({ page }) => {
      await page.getByTestId('coupon-card-0').click();
      await expect(page).toHaveURL(/\/coupons\/.+/);
    });
  });
```
- Generator 는 라이브 픽스처 빌드에 붙어 locator 를 검증한다. `getByTestId` 가 바로 동작하는 건 RN `testID` → `data-testid` 매핑 덕분.
- **이 산출물은 evidence 다.** 초록이어도 D-001/D-002/D-003 을 닫지 못하고 COUPON-001 의 confirmed 상태에 아무 변화를 주지 않는다.

**3) 인덱스/마커 갱신 (결정적·멱등)**
```bash
npm run workflow:e2e-index        # _meta/e2e-index.yaml 재생성 + screen-spec ## Verification 마커 채움
npm run workflow:validate         # 검사 14~16(warning-first): 핸들 정합/fixme 트리아지/헤더 — 경고만
```
- `_meta/e2e-index.yaml`(do_not_edit, GENERATED 헤더)에 `COUPON-001 → { web: tests/web/coupon-list/shows-list.spec.ts, native: .maestro/coupon-list.yaml }` 가 기록된다. 멱등이므로 같은 입력 → byte-identical.

**4) Verification Matrix 채우기 (사람이 Status 기입)**
```md
docs/frontend-workflow/domains/coupons/verification/coupon-list-matrix.md
| Case | iOS | Android | Web | Evidence | Status |
|---|---|---|---|---|---|
| 쿠폰 목록 표시   | passed | passed | passed | playwright-report#shows-list / .maestro log | passed |
| 쿠폰 탭 → 상세   | passed | passed | passed | trace.zip / .maestro log                    | passed |
| 만료 쿠폰 노출   | -      | -      | -      | (D-001 open)                                | blocked |
```
- `Web` 열 = Playwright, `iOS/Android` 열 = Maestro(이미 screen-spec 이 `maestro/coupon-list.yaml` 을 가리킴). "만료 쿠폰 노출" Case 는 **D-001 이 open 이라 `blocked`** — 도구가 아니라 **연결된 Open Decision 이 실제 blocker**(MVP-A 게이트 규칙 그대로).

**5) api-integrated-ui 승격 후 — 회귀 가드**
- hook 내부가 실 API 로 교체돼도 `{roles.screen}` 은 forbidden(화면 불변). 따라서 (2)의 web E2E 가 **그대로 회귀 가드**가 된다. 실데이터/에러 경로는 Network mock 으로 결정화.

**6) production-ready — Healer 유지보수**
- 디자인 리팩터로 `coupon-card` 마크업이 바뀌어 spec 이 깨지면, **로컬/PR 에서** Healer 실행 → `browser_generate_locator` 로 새 locator 제안 → diff 가 PR 로 올라온다.
- 만약 Healer 가 "쿠폰 카드가 안 뜬다"를 복구 불가로 보고 `test.fixme()` 를 달면 → 검사 15(warning)가 "fixme 인데 연결 Open Decision 없음"을 경고 → **사람이 트리아지**(실제 회귀인지 의도된 변경인지). 자동수정 diff·fixme 모두 **사람 리뷰 전엔 confirmed 아님**.

**남는 산출물 한눈에**:
```txt
specs/coupon-list.plan.md                                  ← Planner (사람 교정)
tests/web/coupon-list/*.spec.ts                            ← Generator (evidence, // spec/seed 헤더)
docs/.../_meta/e2e-index.yaml                              ← 생성 뷰 (멱등, GENERATED 헤더)
docs/.../coupons/screens/coupon-list/screen-spec.md
    └ ## Verification (GENERATED 마커 안만)                ← e2e-index 역주입 (evidence 링크)
docs/.../coupons/verification/coupon-list-matrix.md        ← 사람이 Status 기입 (Web=PW, iOS/Android=Maestro)
```

> 로그인(AUTH-001)도 동형이다 — screen-spec 이 이미 `→ maestro/login.yaml`·`→ LoginScreen.test.tsx` 를 가지며, D-204(로그인 후 이동 위치)가 open 이면 "returnTo 분기" 시나리오는 플랜에 넣지 않고 D-204 resolve 후로 미룬다. **Conflict 는 신호, 게이트는 재오픈된 Open Decision** 규칙이 E2E 플랜 범위에도 그대로 적용된다.

---

## 7. (f) 단계적 도입 로드맵 (작게 → CI → evidence 기반 승격)

roadmap 의 순차 원칙("하나를 끝낸 뒤 다음", "병렬 정본 변경 금지")과 MVP-C 생성 뷰가 밟은 길(읽기 전용 → warning-first CI → 하드 게이트는 후속 OD)을 그대로 따른다.

**Phase E0 — docs-only 설계 계약 (게이트 0)**
- `investigation-and-verification.md` 에 "Web 열 = Playwright, iOS/Android 열 = Maestro/Detox, 도구 출력은 evidence·Status 는 사람" 분담을 명문화.
- README 불변식에 §4 의 불변식 8 추가("E2E 는 evidence, 게이트 아님").
- 산출물 축은 **건드리지 않는다**(새 축 금지). Verification 축의 evidence 생성기로만 위치.

**Phase E1 — Planner 만, 플랜 = 저작 입력 (게이트 0)**
- `e2e-plan` 스킬(§5.6) 추가: `final-fixture-ui` 게이트 소비 + Planner 호출 + Matrix 대조 보고. `.spec.ts` 산출 없음(플랜만).
- 산출 `specs/*.plan.md` 는 사람이 리뷰하는 Markdown. 킷 코드 강제 0.

**Phase E2 — Generator + 인덱스 생성 뷰 (읽기 전용, 멱등)**
- `workflow:e2e-index` 생성기(§5.1) + 매니페스트 `status: planned → active` 승격(생성기 구현 시).
- `tests/web/**` 에 Generator 산출(사람 승인 후). `roles.web_e2e` 추가(§5.3).
- golden fixture 회귀(`test-fixtures.mjs`)에 e2e-index 픽스처 등록 → 멱등/byte-identical 확인.

**Phase E3 — warning-first CI smoke**
- validate 검사 14~16(§5.5)을 **warning-only** 로 배선(lint-pack PR-5 처럼 `continue-on-error: true`).
- 별도 CI 잡으로 `npx playwright test`(web) 를 **결정적 retries+trace** 로 실행, 리포트 아티팩트 업로드. **메인 파이프라인에 라이브 Healer 자가치유 없음.**
- Healer 는 로컬/PR 전용으로 문서화.

**Phase E4 — evidence 기반 승격 결정 (별도 Open Decision)**
- telemetry/dogfood(검사 14~16 경고 빈도, e2e flake 율, Verification Matrix 채움률) 수집.
- 그 evidence 로 **별도 decision PR/Open Decision** 에서 결정: 어느 검사를 `--enforce`(하드)로 올릴지, web E2E 를 required check 로 만들지. lint-gate-promotion-evidence 가 밟은 정확한 절차.
- **이 결정 전에는 어떤 E2E 검사도 readiness/CI 하드 게이트가 아니다.**

```txt
E0 docs 계약  →  E1 Planner(플랜만)  →  E2 Generator+인덱스(읽기전용)
            →  E3 warning-first CI smoke  →  E4 evidence 기반 하드 승격(사람 OD)
```

---

## 8. 한 페이지 요약 (체크리스트)

```txt
[위치]   E2E 는 새 축이 아니라 Investigation/Verification 축의 evidence 생성기.
[모드]   Planner 진입 = final-fixture-ui. 본격 Generator = final~api-integrated.
         Healer 유지보수 = production-ready. screen-skeleton 이하에서 E2E 금지.
[연결]   Planner 플랜 ↔ screen-spec Interaction/State Matrix (nav-graph 가 이미 기계가독화).
         Web 열 = Playwright · iOS/Android 열 = Maestro/Detox · Status = 사람.
[방어선] E2E 는 "4번째 방어선" 아님 = evidence. Healer 자동수정/test.fixme()도
         사람 리뷰 전엔 confirmed 아님. Open Decision 게이트는 사람이 유지.
[스크립트] workflow:e2e-index(읽기전용·멱등·GENERATED 헤더) · roles.web_e2e ·
         forbidden-paths 정합(테스트가 코드 모드 우회 금지) ·
         validate 검사 14~16(warning-first) · e2e-plan 스킬(승인 전 .spec.ts 금지).
[로드맵] docs 계약 → Planner(플랜만) → Generator+인덱스(읽기전용) →
         warning-first CI smoke → evidence 기반 하드 승격(별도 OD).
```

> 마지막 못: 이 킷의 모든 결정적 장치(readiness·validate·forbidden-paths·생성 뷰)는 **"추론을 파일로 고정"하고 판정을 사람에게 남기는** 가드레일이다. Playwright 3종도 같은 규율로 들어온다 — **플랜·테스트·치유 결과는 파일로 고정된 evidence 이고, confirmed 승격과 Open Decision 닫기는 끝까지 사람 몫이다.** "통과 = 완료가 아니다"는 E2E 에도 똑같이 적용된다.

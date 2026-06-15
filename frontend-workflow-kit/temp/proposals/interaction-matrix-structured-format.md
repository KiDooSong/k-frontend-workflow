> **Status: DESIGN / SPEC ONLY — 2026-06-15.** 이 문서는 `screen-spec.md` 의 **## Interaction Matrix** 에 대한 *선택적(optional)* v2 구조화 포맷(`Result Type` / `Target` / `Params`)과 그 **dual-read 파싱 전략 · validate 검사 시점/심각도 · route-tree 교차검증(warning-first) · 마이그레이션 순서**를 확정하기 위한 설계 제안이다. **런타임 변경을 지시하지 않는다.** 코드/스크립트/매니페스트/CI/정책을 **지금 바꾸지 않으며**, 모든 변경은 *PROPOSED (future PR)* 로만 기술한다. 본 PR 의 산출물은 이 문서(설계)와 동반 run report 둘뿐이다. **v1 free-form Result 컬럼은 정본(source of truth)으로 유지되고, v2 는 제안일 뿐 의무가 아니다.**

# Interaction Matrix — Structured (v2) Format (Design)

하우스 스타일은 `frontend-workflow-kit/temp/proposals/component-catalog-generation-source-contract.md` 와 `frontend-workflow-kit/temp/proposals/generated-file-guard-design.md` 의 register-first / Options→Recommendation 형식을 따른다 (번호 매긴 섹션, 각 결정마다 Options a/b/c + Recommendation + file:line). 모든 결정 섹션은 **Options considered (a/b/c…)** 와 **Recommendation (근거 + file:line)** 를 포함한다.

> **인용 경로 주의:** 본 문서가 참조하는 지원 문서들은 단일 디렉토리에 모여 있지 않다 — 본 제안·`component-catalog-generation-source-contract.md`·`generated-file-guard-{design,followup}.md` 는 `frontend-workflow-kit/temp/proposals/` 에, 동반 run report 는 `frontend-workflow-kit/temp/runs/` 에, `frontend-workflow-kit-implementation.md`·`mvp-c-generated-views-scope.md` 는 repo root 에 있다. 아래 인용은 파일명/상대경로만으로 참조한다.

---

## 0. Title / Purpose / Scope / Non-goals

### 0.1 Purpose

현재 Interaction Matrix 의 **`Result` 컬럼은 자연어와 라우트가 한 칸에 혼재**한다. golden example 에서 같은 컬럼에 라우트(`/coupons/[id]`)와 자연어(`status filter 변경`, `refetch`)가 섞여 있다 (`examples/coupon-feature/docs/frontend-workflow/domains/coupons/screens/coupon-list/screen-spec.md:49-54`). 이 혼재 때문에:

- 라우트 추출이 **정규식 휴리스틱**에 의존한다 — 슬래시로 시작하는 토큰만 라우트로 본다 (`scripts/lib/spec.mjs:393`).
- "이동인데 라우트를 안 적은 행"이나 "라우트처럼 보이지만 이동이 아닌 자연어"를 **구조적으로 구분할 수 없다.**

roadmap 은 이 항목을 Tier 3 후속(그리고 "다음 구현 후보" 3번)으로 이미 등록했다: **"`Result` 컬럼 구조화 (Result Type/Target/Params 분리 → `Result Type=route` 행만 route 존재 검사. 현재는 단일 Result 컬럼에 자연어·route 혼재)"** (`roadmap-current.md:91`, 동일 항목 `:106`). 본 문서는 **그 항목의 설계**다 — roadmap 위에 세우되 모순되지 않는다.

핵심 원칙: **v1 을 깨지 않는다.** v2 는 *추가 컬럼*으로만 도입되는 **선택적·하위호환** 포맷이고, 파서는 v2 가 있으면 읽되 없으면 v1 free-form 으로 폴백한다. 라우트 추출 정규식은 **단일 출처**로 유지해 v1·v2 가 표류(drift)하지 않게 한다. 게이트는 **새로 만들지 않으며**, route-tree 교차검증은 **warning-first** 로 시작한다.

### 0.2 Scope (이 PR 이 다루는 것)

- 이 설계 문서 + 동반 run report **두 파일** (둘 다 `temp/` 하위 허용 위치).
- v2 컬럼 스키마(§3), dual-read 파싱 전략(§4), v1/v2 공존 기간(§5), validate 검사 시점·심각도(§6), route-tree 교차검증 warning-first(§7), 마이그레이션 순서(§8), 픽스처 범위(§9), Unknown/Open Decision 표면화(§10) 를 **기술**한다.
- 기존 두 생성기(route-tree, nav-graph)와 그 라우트-추출 단일출처 계약, 그리고 component-catalog 설계의 데이터-드리븐 졸업 규칙과 **일관되게** 기술한다.

### 0.3 Non-goals (HARD CONSTRAINTS — 명시적 비목표)

아래는 **지금 수행하지 않으며**, 최대한 *PROPOSED future-PR step* 으로만 기술된다:

- **NG-1** `scripts/lib/spec.mjs` 의 `interactionResultRoutes`·`parseTable` 등 파서를 **바꾸지 않는다** (dual-read 는 future PR).
- **NG-2** `scripts/lib/nav-graph.mjs` 의 `cellRoutes`·`outboundEdgesOf`·`buildNavGraph` 를 **바꾸지 않는다**.
- **NG-3** `scripts/validate.mjs` 의 검사 4(이동 대상 route 부재) 및 어떤 검사도 **바꾸지 않는다** (`scripts/validate.mjs:241-249`).
- **NG-4** `scripts/route-tree.mjs` / `scripts/lib/route-tree.mjs` 를 **바꾸지 않는다**.
- **NG-5** `templates/screen/screen-spec.template.md` 의 Interaction Matrix 표 헤더를 **바꾸지 않는다** (`templates/screen/screen-spec.template.md:60`).
- **NG-6** `examples/coupon-feature/**` 의 screen-spec 을 v2 로 **전환하지 않는다** (v2 fixture 도입 여부는 §9, 도입하더라도 future PR).
- **NG-7** `policies/implementation-mode-policy.yaml` · `scripts/readiness.mjs` · `scripts/workflow-state.mjs` 를 **바꾸지 않는다**. `interaction_matrix_complete` 의 게이트 함의는 **NOTE 만** 한다 (§2.3, §11).
- **NG-8** `package.json` / `package-scripts.template.json` / `.github/**` / `catalog/artifact-manifest.yaml` 을 **바꾸지 않는다**.
- **NG-9** 어떤 free-form Result 컬럼도 v2 로 자동 변환·하드 마이그레이션하지 않는다 (LLM 이 자연어를 `Result Type/Target` 으로 승격하는 것은 §10 의 candidate/Open Decision 규칙을 따른다).
- **NG-10** **하드 게이트 졸업 없음.** route-tree 교차검증은 warning-first 로만 설계한다 (§7).

---

## 1. What exists today (ground truth — 인용 검증됨)

### 1.1 free-form Result 컬럼 (현재 정본)

golden example 의 Interaction Matrix:

```
## Interaction Matrix
| User Action | Trigger | Result | Analytics Event |
|---|---|---|---|
| 쿠폰 클릭 | CouponCard press | /coupons/[id] | coupon_card_click |
| 상태 탭 변경 | Tab press | status filter 변경 | coupon_tab_change |
| 새로고침 | pull to refresh | refetch | - |
| 재시도 | ErrorState button | refetch | - |
```

(`examples/coupon-feature/docs/frontend-workflow/domains/coupons/screens/coupon-list/screen-spec.md:47-54`). **`Result` 한 컬럼에 라우트(`/coupons/[id]`)와 자연어(`status filter 변경`, `refetch`)가 혼재**한다 — 이것이 roadmap 이 지적한 정확한 문제다 (`roadmap-current.md:91`).

템플릿은 같은 4-컬럼 헤더를 정의하고, 주석으로 "Result 컬럼은 비워두지 않는다 (이동이면 라우트, 상태변경이면 동작을 적는다)" 라고 안내한다 (`templates/screen/screen-spec.template.md:57-62`).

### 1.2 Result 가 오늘 소비되는 방식 (전부 단일출처 정규식 위)

- **`interactionResultRoutes(spec)`** — Result 컬럼 셀에서 슬래시-시작 라우트들을 추출한다. 정규식 `/(?<![:/\w])\/(?!\/)[^\s?#]+/g` → 매칭 후 후행 구두점 `[),.;:]+$` 제거 → 길이 1(맨 `/`)은 버림 (`scripts/lib/spec.mjs:383-399`). 외부/protocol-relative URL(`http://…`, `//…`)·쿼리(`?`)·프래그먼트(`#`)는 배제한다.
- **validate 검사 4** — 각 spec 의 `interactionResultRoutes` 결과 라우트가 inventory 의 route 집합(모든 spec frontmatter.route 합집합)에 있는지 본다. 없으면 위반 발화 (`scripts/validate.mjs:241-249`, route 집합 구성 `:222-234`).
- **검사 P13** — `interactionResultRoutes` 의 다중 라우트 추출·후행 구두점/쿼리/외부 URL 제외를 고정하는 **유닛 테스트**다 (validate 의 검사 번호가 아니라 `scripts/lib/spec.test.mjs:80-95` 의 테스트 ID). nav-graph 가 "검사 4·검사 P13 과 동작 일치" 라고 부르는 대상이 이것이다 (`scripts/lib/nav-graph.mjs:7`).
- **nav-graph** — 이동 엣지를 Result 컬럼에서 도출한다. `cellRoutes(cellText)` 의 셀-단위 정규식 `ROUTE_RE` 는 `interactionResultRoutes` 와 **"글자 단위로 동일"** 하다 (drift 방지 — 헤더 주석 `scripts/lib/nav-graph.mjs:5-7,21-26`). `outboundEdgesOf` 는 행마다 `{ to_route(=Result 의 라우트), trigger(=Trigger), action(=User Action) }` 엣지를 만들고, **라우트를 1개도 못 내는 행(`refetch`, `status filter 변경`)은 엣지 없음**으로 건너뛴다 (`scripts/lib/nav-graph.mjs:88-103`). 그리고 셀-단위 추출 합집합이 `interactionResultRoutes(spec)` 와 같은 집합인지 **교차검증**하고 불일치면 던진다 (`:145-155`).
- **route-tree** — `src/app` 파일트리를 스캔해 결정적 `route-tree.txt` 를 만든다 (`scripts/route-tree.mjs:22-27`; 순수 빌더 `scripts/lib/route-tree.mjs:37-107`). golden 출력의 라우트 형태: `/(tabs)/home`, `/coupons/[id]` 등 (`examples/route-tree/basic-app/expected/route-tree.txt:7-12`). **이것이 v2 `Result Type=route` 행이 비교 대상으로 삼을 route 아티팩트다.**

### 1.3 nav-graph 가 Result 행을 구조로 변환하는 모습 (v2 의 자연스러운 형태를 이미 함의)

nav-graph 출력의 한 엣지는 `{ to_route, trigger, action }` 이다 (`examples/nav-graph/basic-flow/expected/nav-graph.yaml:10-13`):

```
outbound:
  - to_route: /coupons/[id]
    trigger: CouponCard press
    action: 쿠폰 클릭
```

즉 **`to_route` 가 곧 "Result 가 route 일 때의 Target"** 이고, `trigger`/`action` 은 이미 별도 컬럼(Trigger / User Action)에서 온다. v2 의 `Result Type=route` / `Target` 분리는 nav-graph 가 이미 내부적으로 하는 일을 **표 레벨로 끌어올리는 것**일 뿐이다 — 새 의미론이 아니다.

### 1.4 `interaction_matrix_complete` 는 오늘 게이트가 아니다 (정확히 유지)

`deriveMetrics` 는 Interaction Matrix 표 존재 + 모든 행 Result 비어있지 않음 → `interaction_matrix_complete` 를 계산한다 (`scripts/lib/spec.mjs:244-252`). 이 fact 는 readiness 입력으로 전달되고 (`scripts/readiness.mjs:42,179`), workflow-state 에도 방출된다 (`scripts/workflow-state.mjs:83`). **그러나 어떤 정책 `requires` 도 이 fact 를 쓰지 않는다** — `policies/implementation-mode-policy.yaml` 안에서 `interaction_matrix_complete` 는 **주석(`:12`)에만** 등장하고 어느 모드의 `requires` 에도 없다. roadmap 도 명시한다: "interaction_matrix_complete 는 fact 로 정의돼 있으나 어떤 requires 에도 안 쓰여 게이트가 아니다" (`roadmap-current.md:54`). **본 설계는 이 사실을 바꾸지 않는다** — v2 도입이 이 fact 를 게이트로 승격시키지 않는다 (§11 OD-5).

---

## 2. Design constraints (이 설계가 반드시 지키는 불변식)

### 2.1 라우트 추출 정규식 단일출처 (drift 금지)

`interactionResultRoutes`(spec.mjs)와 `cellRoutes`(nav-graph.mjs)는 **글자 단위로 동일한 정규식**을 의도적으로 공유하며, nav-graph 의 빌더는 둘이 같은 집합을 내는지 런타임 교차검증까지 한다 (`scripts/lib/nav-graph.mjs:5-7,145-155`). **v2 dual-read 는 이 단일출처를 깨면 안 된다.** v2 가 도입돼도 "free-form 셀에서 라우트를 뽑는 정규식"은 한 곳에 남고, v2 경로는 그 위에 *얹히는* 것이지 별도 라우트 파서를 만드는 게 아니다 (§4).

### 2.2 fail-closed / warning-first

malformed/모호 입력에는 fail-closed, 하드 강제 전에는 warning-first 라는 킷 불변식을 따른다. v2 의 새 검사·교차검증은 **warning-first 로 시작**하고 (§6·§7), 하드 게이트 승격은 별도·명시적 future PR 로만 한다 (component-catalog/guard 설계의 동일 시퀀싱 — `generated-file-guard-design.md:15,24`).

### 2.3 readiness 불변 (NOTE only)

`interaction_matrix_complete` 의 정의(§1.4)와 게이트 비참여를 **바꾸지 않는다**. v2 가 도입돼도 `deriveMetrics` 의 completeness 계산은 그대로 v1·v2 어느 쪽이든 "표 존재 + 모든 행 Result 비어있지 않음"으로 유지된다 (dual-read 는 "Result 가 비었는지" 판정만 v2-aware 로 확장 가능 — §4.4, 그러나 게이트는 여전히 없음).

---

## 3. v2 column schema

**Decision:** v2 가 추가하는 컬럼과 그 의미·허용값.

### Options considered

- **(3a) 3 컬럼 추가 — `Result Type` / `Target` / `Params`** — roadmap 이 명시한 정확한 분해 (`roadmap-current.md:91,106`). `Result Type` 이 행의 결과 종류(route / state / mutation / external / none …)를, `Target` 이 그 대상(route 면 라우트 문자열, state 면 동작 서술), `Params` 가 라우트 파라미터/추가 인자를 담는다. nav-graph 의 `to_route`/`trigger`/`action` 분해와 정합 (`examples/nav-graph/basic-flow/expected/nav-graph.yaml:10-13`).
- **(3b) 1 컬럼만 추가 — `Result Type`**, Target/Params 는 기존 `Result` 셀 재사용 — 가장 작지만, "route 행의 라우트"를 여전히 free-form `Result` 에서 정규식으로 뽑아야 해 v1 의 핵심 문제(혼재)를 덜 푼다.
- **(3c) `Result` 를 구조화 토큰(`route:/coupons/[id]`, `state:filter`)으로 인코딩** — 컬럼을 안 늘리나, 표 안에 mini-DSL 을 넣어 파싱 복잡도/오탐이 오히려 커지고 v1 free-form 과 같은 셀을 공유해 하위호환이 모호해진다.
- **(3d) 별도 섹션/YAML 블록으로 분리** — 표를 벗어나면 기존 `parseTable`/`getSections` 계약(`scripts/lib/spec.mjs:27-97`)을 벗어나고, 화면 이동의 "단일 선언 지점"이 표라는 현재 규약(`screen-spec.template.md:58`)과 충돌.

### Recommendation — **(3a): `Result Type` / `Target` / `Params` 세 컬럼을 v2 에서 추가.** 단, **전부 선택적(optional)** 이고 v1 `Result` 컬럼은 그대로 유지한다.

> **v2 표 (illustrative / non-binding):**
> ```
> | User Action | Trigger | Result | Result Type | Target | Params | Analytics Event |
> |---|---|---|---|---|---|---|
> | 쿠폰 클릭 | CouponCard press | /coupons/[id] | route | /coupons/[id] | id | coupon_card_click |
> | 상태 탭 변경 | Tab press | status filter 변경 | state | status filter 변경 |  | coupon_tab_change |
> | 새로고침 | pull to refresh | refetch | mutation | refetch |  | - |
> ```
> *(illustrative only — 컬럼 순서/값 집합은 OD-1/OD-2 가 닫히기 전까지 비구속.)*

**근거:**
- roadmap 이 정확히 이 3-way 분해를 적었다 (`roadmap-current.md:91`) — 본 설계는 그 위에 세운다.
- `Result Type=route` 행만 route 존재 검사 대상이 되게 하려면(roadmap 의 목표) "type 으로 route 행을 골라내는" 명시 컬럼이 필요하다 — (3b)/(3c)는 그 선별을 다시 정규식에 의존시킨다.
- nav-graph 가 이미 `to_route`/`trigger`/`action` 으로 행을 구조화하므로 (`scripts/lib/nav-graph.mjs:88-103`), `Target`(=route 일 때 to_route)·기존 Trigger/User Action 컬럼과 1:1 대응한다 — 새 의미론 도입이 아니다.

**`Result Type` 허용값(초안, OD-2 가 동결 전까지 비구속):** `route` | `state` | `mutation` | `external` | `none`. 이 집합의 정확한 멤버십(예: `mutation` 을 Mutation Matrix 로 미루고 여기선 안 둘지, `external` 을 둘지)은 **OD-2**.

**`Result` 컬럼은 v2 에서도 남는다:** v2 행은 `Result`(free-form, 사람이 읽는 요약)와 `Result Type`/`Target`/`Params`(기계용)를 **둘 다** 가진다. 이중-소스 표류 위험은 §4.3 에서 "v2 가 있으면 v2 가 권위, v1 은 표시용"으로 해소한다.

---

## 4. nav-graph / spec dual-read strategy

**Decision:** 파서(spec.mjs·nav-graph.mjs)가 v2 컬럼을 어떻게 읽고, 없을 때 v1 으로 어떻게 폴백하며, 정규식 단일출처를 어떻게 지키는가. **전부 future PR — NG-1/NG-2.**

### Options considered

- **(4a) v2 우선 dual-read, 단일 라우트 추출 정규식 유지** — 행에 `Result Type`/`Target` 컬럼이 **존재하면** v2 경로(타입으로 분기, Target 에서 라우트 취득)를, **없으면** 기존 `cellRoutes`/`interactionResultRoutes` 로 free-form 폴백. 라우트 문자열을 셀에서 뽑는 정규식은 여전히 한 곳(§2.1).
- **(4b) v1·v2 완전 분리 파서** — v2 전용 파서를 새로 둠. → 정규식 단일출처가 둘로 갈라져 drift 위험(§2.1 위반). 거부.
- **(4c) v2 를 무시하고 v1 만 영구 사용** — 가장 안전하나 roadmap 항목을 영영 안 푼다. v2 를 *선택적*으로라도 읽지 않으면 도입 의미가 없다.

### Recommendation — **(4a): v2-우선 dual-read + 라우트 추출 정규식 단일출처 유지.**

#### 4.1 폴백 규칙 (per-table, fail-closed)

표 헤더에 `Result Type`(느슨 매칭 — `hasHeader`, `scripts/lib/spec.mjs:124-127`)이 **있으면 v2 모드**, 없으면 **v1 모드**. 모드는 표 단위로 결정한다(한 화면 안에 표 하나). 같은 표에 `Result Type` 헤더는 있는데 일부 행만 채워진 경우는 **fail-closed**: 빈 `Result Type` 셀 행은 "구조화 미완 candidate"로 보고 v1 free-form 추출로 폴백하되, **그 폴백 사실을 surface** 한다 (§6 의 warning). 조용히 무시하지 않는다 (malformed→fail-closed 불변식 §2.2).

#### 4.2 라우트 취득 (정규식 단일출처 보존)

- **v1 모드:** 오늘과 동일 — `Result` 셀에 `cellRoutes`/`interactionResultRoutes` 적용 (`scripts/lib/spec.mjs:383-399`; `scripts/lib/nav-graph.mjs:31-39`). 변경 없음.
- **v2 모드, `Result Type=route` 행:** 라우트는 **`Target` 셀**에서 취득하되, **같은 단일출처 정규식(`cellRoutes`)을 `Target` 셀에 적용**한다. 즉 "어느 셀을 읽는가"만 v2-aware 로 바뀌고, "셀에서 라우트를 뽑는 규칙"은 한 곳에 남는다 — drift 불가능. (Expo 동적 세그먼트 `[id]`·그룹 `(tabs)` 보존, 템플릿 placeholder `{…}` 거부는 `isConcreteRoute` 가 그대로 담당 `scripts/lib/nav-graph.mjs:45-50`.)
- **v2 모드, `Result Type≠route` 행:** 라우트 0개 → nav-graph 엣지 없음 (오늘 `refetch`/`state` 행이 엣지 없음으로 빠지는 것과 동일 `scripts/lib/nav-graph.mjs:95`). **명시적 타입이 있으므로 "라우트처럼 보이는 자연어 오탐" 위험이 사라진다** — 이것이 v2 의 핵심 이득.

#### 4.3 v1↔v2 drift 방지 (교차검증, warning-first)

v2 행이 `Result`(free-form) 와 `Target`(route) 를 둘 다 가질 때, **v1 정규식이 `Result` 에서 뽑은 라우트 집합 ⊆ v2 `Target` 라우트 집합**인지 교차검증할 수 있다. 불일치(예: `Result` 에 `/x` 가 보이는데 `Result Type≠route` 거나 `Target` 이 비었음)는 **warning** 으로 surface(§6) — **던지지 않는다.** (nav-graph 가 오늘 `perRow` vs `viaHelper` 불일치에 던지는 것(`scripts/lib/nav-graph.mjs:149-154`)은 *내부 정규식 일관성* 검사다; v1↔v2 교차검증은 *저자 입력 일관성* 검사라 심각도가 다르다 — 후자는 warning.) **권위 순서:** v2 컬럼이 있으면 **v2 가 기계 판정의 권위**, `Result`(v1)는 사람이 읽는 요약. 둘이 어긋나면 v2 를 따르되 경고한다.

#### 4.4 completeness 계산 (게이트 불변 — NOTE)

`deriveMetrics` 의 `interaction_matrix_complete` 는 v2 모드에서 "Result 또는 (Result Type+Target) 중 하나라도 채워졌는가"로 확장 가능하나(§2.3), **이 fact 는 여전히 게이트가 아니다** (§1.4). 따라서 dual-read 의 completeness 변화는 readiness 에 영향을 주지 않는다 — 확장 자체가 **OD-5** 로 열려 있고 v2 PR 의 필수가 아니다.

#### 4.5 구현 분리 (future PR 가이드)

`cellRoutes`/`isConcreteRoute` 는 이미 nav-graph lib 의 export 된 순수 함수다 (`scripts/lib/nav-graph.mjs:31,45`). dual-read 는 **새 함수 `cellRoutesForRow(row, mode)`** 류를 spec.mjs/nav-graph.mjs 에 *추가*하고 기존 함수를 그 위에서 재사용하는 식으로, 기존 시그니처를 깨지 않고 얹는다 (component-catalog 설계의 "builder 를 lib 에 분리" 관례와 동형). **단 이것은 future PR — 본 PR 에서 코드 없음 (NG-1/NG-2).**

---

## 5. v1 / v2 coexistence (dual format) — 기간과 종료조건

**Decision:** v1 free-form 과 v2 structured 가 공존하는가, 얼마나 오래.

### Options considered

- **(5a) 영구 dual (v1 정본 유지, v2 영구 선택적)** — 가장 보수적. v1 을 절대 안 깨고, v2 는 원하는 화면만 채택. 종료 강제 없음.
- **(5b) 한시적 dual → v2 의무화(flag day)** — 언젠가 모든 화면을 v2 로 강제. 그러나 이는 하드 마이그레이션이라 NG-9/§2.2 와 충돌하고, "언제·누가" 가 미해결.
- **(5c) v2 없이 v1 만(=제안 폐기)** — roadmap 항목 미해결.

### Recommendation — **(5a): 영구 dual. v1 이 정본, v2 는 무기한 선택적.**

**근거:**
- v1 free-form 은 KEPT 가 결론 방향이다(태스크). v1 을 deprecate 하면 모든 기존 화면을 손대야 하고, 이는 LLM 이 자연어를 구조 타입으로 승격하는 일이라 §10 의 candidate 규칙상 사람 결정이 필요해진다 — 자동 일괄 변환 불가.
- 킷의 다른 생성물 전환도 "데이터-드리븐, 단계적, 강제는 별도 PR" 선례를 따른다 (component-catalog 마이그레이션 `component-catalog-generation-source-contract.md:184-190`).
- v2 의무화가 *필요해지는* 미래(예: 검사 4 를 v2-only 로 강화) 자체가 **OD-3** 로 열려 있고, 그 결정 전까지는 dual 이 안전 기본값.

**공존 중 파서 동작:** §4 의 per-table 모드 판정으로, v1 화면과 v2 화면이 **같은 리포에 섞여 있어도** 각각 올바르게 읽힌다. nav-graph/route-tree 출력은 v1 화면에 대해 **바이트 동일**하게 유지된다(§4.2 v1 경로 무변경) — 즉 v2 도입이 기존 golden fixture 를 깨지 않는다.

---

## 6. When validate inspects v2 (and at what severity)

**Decision:** validate 가 v2 컬럼을 **언제·어떤 심각도**로 본다. **전부 future PR — NG-3.**

### Options considered

- **(6a) v2 검사를 처음부터 error(검사 4 와 동급)** — `Result Type=route` 인데 Target 라우트가 inventory/route-tree 에 없으면 fail. → 하드 강제를 warning 단계 없이 켜는 것이라 §2.2/NG-10 위반.
- **(6b) v2 형식 검사는 warning-first, route 존재 교차검증도 warning-first(§7)** — 새 표면은 항상 경고로 도입, telemetry 후 별도 PR 에서 승격.
- **(6c) v2 를 validate 가 아예 안 봄(파서만 dual-read)** — nav-graph 는 v2 를 읽는데 validate 는 모르면, malformed v2(예: `Result Type=route` 인데 Target 빔)가 **조용히** 통과 → fail-open. 거부.

### Recommendation — **(6b): validate 는 v2 를 보되, 새 v2-특화 검사는 전부 warning-first.**

**v2 가 validate 시야에 들어오는 시점·항목 (future PR, warning-first):**

1. **형식 검사 (warning):** 표에 `Result Type` 헤더가 있으면(v2 모드), 각 행에 대해
   - `Result Type` 값이 허용 집합(§3, OD-2 동결 전까진 비구속)인가;
   - `Result Type=route` 인데 `Target` 이 비었거나 `cellRoutes(Target)` 가 0개면 **malformed→warning** (구조화 미완 candidate, §4.1);
   - `Result Type≠route` 인데 `Target`/`Result` 에 라우트처럼 보이는 토큰이 있으면 **불일치 warning** (§4.3).
   이는 기존 Open Decisions/Copy Keys 형식 검사(검사 9·10)가 *표 형식*을 보는 방식과 동형이되, **심각도만 warning** 이다.
2. **검사 4 와의 관계:** 검사 4 는 **변경하지 않는다**(NG-3). 검사 4 는 계속 `interactionResultRoutes`(=Result 셀 free-form, v1 경로)로 동작한다. v2 의 "route 행만 검사" 강화는 **검사 4 를 건드리지 않는 별도 신규 검사(예: 검사 13)** 로, **warning-first** 로 추가하는 것을 권고한다. 검사 4 를 v2-aware 로 *교체* 하는 것은 OD-3(공존 종료조건)이 닫힌 뒤에야 고려한다.

**근거:** 검사 9(Open Decisions)·검사 12(reconciliation)가 이미 "구조 망가짐=에러, 미처리/정책 신호=warning-first(`--enforce` 로 승격)" 라는 이원 심각도를 쓴다 (`scripts/validate.mjs:18-23`). v2 도 같은 패턴을 따르되, route 존재 교차검증(§7)은 telemetry 가 쌓이기 전까지 절대 에러로 켜지 않는다.

---

## 7. route-tree cross-check — warning-first (절대 하드 게이트로 시작 안 함)

**Decision:** `Result Type=route` 행의 `Target` 라우트가 **route-tree 아티팩트에 실재하는가**를 어떻게 검사하는가. **전부 future PR — NG-4/NG-10.**

오늘 검사 4 는 라우트가 **inventory(spec frontmatter.route 합집합)** 에 있는지만 본다 (`scripts/validate.mjs:222-249`). 그러나 진짜 라우트의 정본은 **route-tree.txt**(=`src/app` 파일트리 스캔)다 (`examples/route-tree/basic-app/expected/route-tree.txt:5-12`). v2 는 "route 행"을 명시적으로 알므로, **route-tree 와의 교차검증**을 정밀하게 할 수 있다.

### Options considered

- **(7a) `Result Type=route` Target ∉ route-tree → error** — 가장 강하지만 하드 게이트를 warning 단계 없이 켬. **NG-10 위반.** 또한 route-tree 는 생성물이고 stale 일 수 있어, 생성 타이밍 차이로 false-fail 위험.
- **(7b) `Result Type=route` Target ∉ route-tree → warning** — 정확히 태스크가 요구하는 방향. telemetry 후 별도 PR 에서 승격 검토.
- **(7c) route-tree 와 교차검증 안 함(inventory 만)** — 검사 4 와 동일 수준에 머묾. v2 의 정밀 이득(파일트리 실재 라우트와 대조)을 안 씀.

### Recommendation — **(7b): `Result Type=route` 행 Target 이 route-tree 에 없으면 warning (실패 아님).**

**설계 세부 (future PR, warning-first):**

- 비교 대상 라우트 집합 = `route-tree.txt` 가 내는 `route:` 토큰들 (`examples/route-tree/basic-app/expected/route-tree.txt:7,10,12` 의 `route: /…`). route-tree 의 라우트 형태(`/(tabs)/home`, `/coupons/[id]`)와 v2 `Target` 의 라우트 형태는 같은 Expo 표기라 직접 비교 가능.
- **EXACT 문자열 일치** 를 기본으로 한다 — 검사 4·nav-graph 의 해소가 이미 param 정규화 없는 EXACT 일치다 (`scripts/lib/nav-graph.mjs:122,138`). 동적 세그먼트(`[id]`)도 문자열 그대로 비교.
- route-tree 아티팩트가 **부재**하면(생성 전) 이 교차검증은 **skip(무발화)** — planned 산출물을 실패로 만들지 않는다는 component-catalog/guard 의 "must-not-fail" 관례 (`component-catalog-generation-source-contract.md:222`; `generated-file-guard-design.md:86`).
- **하드 게이트 승격은 별도 PR** — 관측된 false-positive rate 가 충분히 낮을 때만, `--enforce` 또는 `continue-on-error` 제거로 (guard 설계의 PR G 선례 `generated-file-guard-design.md:370`). 본 설계는 **그 승격을 하지 않는다.**

**근거:** route-tree 는 생성물이고 v2 Target 은 저자 입력이라, 둘의 불일치는 (i) 저자 오타 (ii) route-tree stale (iii) 의도된 미래 라우트 중 무엇이든 될 수 있다 — 이 모호성에서 **즉시 차단은 부적절**하고 warning 이 옳다 (§2.2). 또한 "이동 대상이 아직 stub/미생성"인 정상 상태가 존재하므로(nav-graph 가 stub destination 을 정상 해소하는 것 `scripts/lib/nav-graph.mjs:136-141`), 하드 fail 은 정상 흐름을 깬다.

---

## 8. Migration order

**Decision:** v1→v2 를 어떤 순서로 도입하는가. **전부 future PR — NG 전체.**

### Options considered

- **(8a) 파서 dual-read 를 먼저, 나머지는 그 위에 단계적으로** — nav-graph/route-tree 가 밟은 "생성기/파서 먼저, 검사·강제는 나중" 선례 (`mvp-c-generated-views-integration.md` 류; component-catalog 마이그레이션 `component-catalog-generation-source-contract.md:184-190`).
- **(8b) 템플릿/fixture 를 먼저 v2 로 바꾸고 파서는 나중** — 파서가 v2 를 못 읽는 동안 fixture 만 v2 면, 그 fixture 의 nav-graph 출력이 **틀려진다**(v2 Target 을 못 읽어 엣지 누락) → golden 깨짐. 순서 위험.
- **(8c) 검사(validate)부터** — 파서가 v2 를 모르는데 검사만 v2 를 보면 일관성 없음.

### Recommendation — **(8a): 파서 dual-read 가 첫 구현 단계. 그 외 아무것도 먼저 하지 않는다.**

**future-PR 순서 (이 PR 은 설계뿐):**

1. **(이 PR — 설계만)** 코드/템플릿/fixture/검사 무변경. v2 스키마·dual-read·warning-first 교차검증을 *기술*만.
2. **(FUTURE PR — 파서 dual-read)** spec.mjs/nav-graph.mjs 에 v2-aware 셀 선택을 **추가**(정규식 단일출처 보존 §4.2). v1 화면에 대한 nav-graph/route-tree 출력은 **바이트 불변**(기존 golden 그대로 통과)이어야 함. **이것이 첫 실제 코드 단계, 그 외 없음.**
3. **(FUTURE PR — validate v2 형식 검사, warning-first)** §6 의 형식 warning + (선택) 신규 검사 13(route 행 ↔ route-tree, warning) (§7). 검사 4 무변경.
4. **(FUTURE PR — 템플릿 v2 컬럼 안내)** `screen-spec.template.md` 의 Interaction Matrix 주석에 *선택적* v2 컬럼 사용법 추가 (헤더 변경이 아니라 안내 추가; 파서가 이미 dual-read 가능해진 뒤). NG-5 는 *이 PR* 의 제약이고, 이 단계는 future.
5. **(FUTURE PR — v2 fixture)** §9 의 골든 fixture 도입.
6. **(FUTURE PR — 강제 승격 논의)** route-tree 교차검증/형식 검사를 error 로 올릴지 telemetry 기반 결정 (별도 decision PR — NG-10 은 *이 PR* 에서 승격 금지).

각 PR 은 직전 PR 의 결정성/golden 이 통과한 뒤에만 — 생성기/검사 부재 시점에 강제를 먼저 넣지 않는다 (`generated-file-guard-followup.md` 의 "no diff gate before the first real generator" 정신, `component-catalog-generation-source-contract.md:285`).

---

## 9. examples/coupon-feature v2 fixture — in-scope?

**Decision:** golden example 에 v2 fixture 를 추가하는가, 이 PR 범위인가.

### Options considered

- **(9a) v2 fixture 를 이 PR 에서 추가** — 금지에 가깝다: NG-6(coupon-feature screen-spec 비전환), 그리고 v2 fixture 가 의미 있으려면 파서가 먼저 v2 를 읽어야 한다(§8 순서). 파서 없이 fixture 만 두면 nav-graph golden 이 깨진다(§8b).
- **(9b) 전용 fixture 디렉토리(`examples/interaction-matrix-v2/…`)를 future PR 에서, route-tree/nav-graph golden 레이아웃 미러** — 기존 nav-graph fixture 와 같은 구조(`run-metadata.json` + `docs/.../_meta/*.yaml` + `expected/*.yaml`, `examples/nav-graph/basic-flow/run-metadata.json:1-8`). 하니스가 kind-agnostic 이라 코어 변경 없이 드롭 가능.
- **(9c) 기존 coupon-feature 를 v2 로 전환** — golden 의 단일 end-to-end 완주를 건드려 리뷰 폭증 + NG-6 위반.

### Recommendation — **(9b): v2 fixture 는 future PR. 이 PR 범위 아님.** 도입 시 **새 디렉토리**(coupon-feature 비전환), nav-graph fixture 레이아웃 미러.

**future fixture 스케치 (illustrative, future PR):**
```
examples/interaction-matrix-v2/basic-flow/
├─ run-metadata.json     # { fixture:"nav-graph", docs:"docs/frontend-workflow",
│                         #   expected:"expected/nav-graph.yaml", expect:"pass" }
├─ docs/frontend-workflow/domains/**/screen-spec.md   # v2 컬럼을 가진 INPUT
├─ docs/frontend-workflow/_meta/nav-graph.yaml        # in-tree 생성 복사본
└─ expected/nav-graph.yaml                            # v2 Target 에서 도출된 GOLDEN (v1 과 동일 엣지)
```
*(illustrative — 코드 아님.)* **핵심 검증 의도:** v2 화면이 만든 nav-graph 엣지가 같은 의미의 v1 화면과 **동일**해야 한다(같은 `to_route`/`trigger`/`action`) — dual-read 가 의미를 보존함을 골든으로 고정. v2 fixture 의 정확한 `expected` 내용 동결은 **OD-4**.

**근거:** v2 fixture 는 파서 dual-read(§8 step 2)가 랜딩한 *뒤*라야 의미 있다 — 그 전엔 expected 를 산출할 코드가 없다. nav-graph fixture 가 이미 `run-metadata.json`+`expected/` 규약을 쓰므로(`examples/nav-graph/basic-flow/`), 새 케이스는 같은 규약으로 코어 변경 없이 추가된다.

---

## 10. Unknown / Open Decision surfacing in the matrix

**Decision:** v2 행의 대상이 **미확정**일 때(예: 이동 대상 화면/라우트가 아직 결정 안 됨, 또는 자연어를 route 로 승격할지 미정) 어떻게 표면화하는가. **LLM 은 미확정을 confirmed/resolved 로 승격하지 않는다 (핵심 원칙 4).**

### Options considered

- **(10a) 미확정 Target 을 candidate 로 표기, 결정은 Open Decision 으로** — 킷의 기존 미확정 관용과 정합: API 는 `(confidence: candidate)` (`screen-spec.template.md:73-74`), Mutation 은 `(candidate)` (`examples/.../coupon-list/screen-spec.md:60`), 사실확인은 Unknowns, 선택은 Open Decisions (`screen-spec.template.md:97-112`).
- **(10b) 미확정 행을 그냥 비워둠** — fail-open(검사가 "이동인데 라우트 없음"을 못 봄). 거부.
- **(10c) LLM 이 가장 그럴듯한 라우트를 채워 넣음** — 핵심 원칙 4(LLM 은 candidate 를 confirmed 로 승격 금지) 정면 위반. 거부.

### Recommendation — **(10a): 미확정은 candidate / Unknown / Open Decision 으로 남긴다 — LLM 은 절대 resolve 하지 않는다.**

**v2 에서의 구체 규칙 (설계 의도):**

- **이동 대상이 미정인 route 행:** `Result Type=route` 이되 `Target` 을 확정 라우트로 적지 말고, **candidate 표기**(예: `Target` 에 `/coupons/[id] (candidate)` 또는 빈 Target + 연결된 Open Decision ID)로 둔다. §7 의 route-tree 교차검증은 candidate/미해소 Target 에 대해 **warning(실패 아님)** 이므로 미확정이 흐름을 막지 않는다.
- **"자연어를 route 로 승격할지"가 결정 사안이면:** 그 자체를 **Open Decision(OD-n) 행**으로 남긴다 (해당 화면의 `## Open Decisions` 표, `screen-spec.template.md:103-112`). LLM 은 open 행 추가까지만, resolve 는 사람 (`screen-spec.template.md:104-107`).
- **사실 확인이 필요한 경우(예: "이 이동의 실제 라우트가 어디 정의됐나"):** `## Unknowns` 행으로 (`screen-spec.template.md:97-101`).
- **dual-read 가 만나는 malformed/미완 v2 행:** §4.1 대로 v1 폴백 + warning — 즉 파서가 미확정을 **조용히 confirmed 처럼** 처리하지 않는다.

**근거:** 킷 전체가 "LLM 은 Unknown/Open Decision/candidate 를 confirmed/resolved 로 승격하지 않는다"를 불변식으로 한다 (`screen-spec.template.md:104-108`). v2 도입이 이 경계를 흐리면 안 된다 — 구조화는 *기계 검사 가능성*을 높일 뿐, 미확정을 확정으로 바꾸는 도구가 아니다. 이 설계가 새로 떠올린 미확정 질문들도 본 문서 안에서 **OD-1…OD-5(§11)** 로만 기록하고 스스로 닫지 않는다.

---

## 11. Open decisions

각 항목은 **왜 열려 있는지 / 무엇을 막는지**. **이 설계 PR 을 막는 것은 없다** (전부 파서/검사/마이그레이션 future-PR 시점에 닫음). 선례: nav-graph 도 스키마를 Open Decision 으로 두고 generator 를 먼저 ship 한 뒤 닫고 등록했다 (`component-catalog-generation-source-contract.md:263`).

- **OD-1 — v2 컬럼 순서/이름/필수성 동결:** `Result Type`/`Target`/`Params` 의 컬럼 순서, 정확한 헤더 문자열, `Params` 를 둘지(라우트 파라미터를 Target 에 합칠지) 가 미정. **막는 것:** 첫 v2 fixture 의 byte-exact 표 + 템플릿 안내. **설계 PR 은 안 막음.**
- **OD-2 — `Result Type` 허용값 집합:** `route|state|mutation|external|none` 중 무엇을 포함/제외할지(특히 `mutation` 을 Mutation Matrix 로 미룰지, `external` 을 둘지). **막는 것:** validate v2 형식 검사(§6)의 enum.
- **OD-3 — v1/v2 공존 종료조건:** §5 는 영구 dual 을 권고하나, 미래에 검사 4 를 v2-only(또는 v2-우선)로 강화하려면 v2 의무화 시점·방식이 필요. **막는 것:** 검사 4 의 v2-aware 교체(있다면). **dual 기본값이라 설계 PR 은 안 막음.**
- **OD-4 — v2 fixture expected 동결:** v2 화면에서 도출된 nav-graph golden 의 정확한 내용(v1 과 동일 엣지여야 함을 어떤 케이스로 고정할지). **막는 것:** §9 fixture 의 byte-exact expected.
- **OD-5 — `interaction_matrix_complete` 의 v2 함의:** completeness 계산을 v2-aware 로 확장할지, 그리고 (별개로) 이 fact 를 언젠가 게이트로 쓸지. **현재 게이트 아님(§1.4)을 본 설계는 안 바꾼다.** **막는 것:** readiness/policy 변경(있다면 — 별도 결정). **NOTE-only 라 설계 PR 은 안 막음.**

---

## 12. Implementation slicing / next-PR candidates

**이 PR = 설계 only.** 이후는 전부 **future PR (마크됨):**

1. **(FUTURE) PR-2 — 파서 dual-read:** spec.mjs/nav-graph.mjs 에 v2-aware 셀 선택 *추가*, 라우트 추출 정규식 단일출처 보존(§4.2), v1 화면 nav-graph/route-tree 출력 **바이트 불변**. (NG-1/NG-2: 지금 안 함.) **첫 실제 구현 단계.**
2. **(FUTURE) PR-3 — validate v2 형식 검사(warning-first):** §6 형식 warning + (선택) 신규 검사 13 = route 행 ↔ route-tree warning(§7). **검사 4 무변경.** (NG-3/NG-4: 지금 안 함.)
3. **(FUTURE) PR-4 — 템플릿 v2 안내:** `screen-spec.template.md` Interaction Matrix 주석에 *선택적* v2 컬럼 사용법 추가(헤더 미변경). (NG-5 는 이 PR 제약.)
4. **(FUTURE) PR-5 — v2 골든 fixture:** `examples/interaction-matrix-v2/…`, nav-graph fixture 레이아웃 미러, "v2 엣지 == v1 엣지" 고정(§9). (NG-6 은 이 PR 제약.)
5. **(FUTURE) PR-6 — 강제 승격 논의:** telemetry 기반으로 route-tree 교차검증/형식 검사를 error 로 올릴지 결정하는 **decision PR** (§7·OD-3). (NG-10 은 이 PR 에서 승격 금지.)

각 PR 은 직전 PR 의 결정성/golden 통과 뒤에만 진행 — 파서가 v2 를 읽기 전에 fixture/검사/강제를 먼저 넣지 않는다 (§8 순서).

---

## Appendix A — Observed ground truth (인용 검증됨)

### A.1 현재 Interaction Matrix (free-form, 혼재)
`examples/coupon-feature/docs/frontend-workflow/domains/coupons/screens/coupon-list/screen-spec.md:47-54` — 4-컬럼 `User Action | Trigger | Result | Analytics Event`. `Result` 에 route(`/coupons/[id]` `:51`)와 자연어(`status filter 변경` `:52`, `refetch` `:53-54`) 혼재. 템플릿 동일 헤더 + "Result 비워두지 않음" 주석 (`templates/screen/screen-spec.template.md:57-62`).

### A.2 Result 소비 경로 (단일출처 정규식)
- `interactionResultRoutes(spec)` — Result 셀 라우트 추출 `/(?<![:/\w])\/(?!\/)[^\s?#]+/g` + 후행구두점 제거 + 길이>1 (`scripts/lib/spec.mjs:383-399`).
- validate 검사 4 — 추출 라우트 ∈ inventory route 집합 여부 (`scripts/validate.mjs:222-234,241-249`).
- 검사 P13 = `interactionResultRoutes` 유닛 테스트(다중 라우트·후행구두점·쿼리·외부 URL) (`scripts/lib/spec.test.mjs:80-95`).
- nav-graph — `cellRoutes` 정규식이 `interactionResultRoutes` 와 글자 단위 동일(drift 방지) (`scripts/lib/nav-graph.mjs:5-7,21-39`); `outboundEdgesOf` 가 `{to_route,trigger,action}` 엣지, 비-라우트 행은 엣지 없음 (`:88-103`); 셀-단위 vs spec-단위 추출 교차검증 후 불일치 시 던짐 (`:145-155`); EXACT 라우트 해소(param 정규화 없음) (`:122,138`); stub destination 정상 해소 (`:136-141`).
- route-tree — `src/app` 파일트리 스캔, 결정적 출력 (`scripts/route-tree.mjs:22-27`; `scripts/lib/route-tree.mjs:37-107`); golden 라우트 형태 `/(tabs)/home`·`/coupons/[id]` (`examples/route-tree/basic-app/expected/route-tree.txt:5-12`).

### A.3 nav-graph 가 이미 만드는 구조 (v2 의 함의)
`examples/nav-graph/basic-flow/expected/nav-graph.yaml:10-13` — outbound 엣지 `{to_route:/coupons/[id], trigger:CouponCard press, action:쿠폰 클릭}`. v2 의 `Target`(route) = nav-graph 의 `to_route`. fixture 규약: `run-metadata.json` + `docs/.../_meta/nav-graph.yaml` + `expected/nav-graph.yaml` (`examples/nav-graph/basic-flow/run-metadata.json:1-8`).

### A.4 게이트 좌표 (변경 없음 — 참조)
- `interaction_matrix_complete` 계산: 표 존재 + 모든 행 Result 비어있지 않음 (`scripts/lib/spec.mjs:244-252`).
- readiness 입력/방출: `scripts/readiness.mjs:42,179`; `scripts/workflow-state.mjs:83`.
- **게이트 아님:** policy 안에서 주석에만 등장(`policies/implementation-mode-policy.yaml:12`), 어느 `requires` 에도 없음; roadmap 명시 (`roadmap-current.md:54`).
- roadmap 항목 출처: `roadmap-current.md:91`(Tier 3), `:106`(다음 구현 후보 3); CHANGELOG 등록 `CHANGELOG.md:113`.

### A.5 검사 심각도 선례 (warning-first 이원 모델)
검사 9/12 가 "구조 망가짐=에러, 정책/미처리 신호=warning-first(`--enforce` 승격)" 를 씀 (`scripts/validate.mjs:18-23`). v2 형식·route 교차검증은 이 패턴의 warning 측을 따른다.

---

**End of design document.** No code, parser, validate, route-tree, nav-graph, template, fixture, manifest, package-script, policy, readiness, or CI changes are made by this task. v1 free-form Result 컬럼은 정본으로 유지되고, v2(`Result Type`/`Target`/`Params`)는 **선택적 제안**이며, dual-read 파서가 **유일한 첫 구현 단계**, route-tree 교차검증은 **warning-first** — 전부 **PROPOSED (future PR)** 로만 남는다.

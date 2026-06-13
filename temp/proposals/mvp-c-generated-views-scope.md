# MVP-C "Generated Views" — 스코프 제안

> 스냅샷: 2026-06-14. **설계 제안 초안일 뿐 구현이 아니다** — 이 세션의 산출물은 이 문서 하나다.
> scripts·package.json·기존 docs(README/CHANGELOG/roadmap/CI/templates/schemas/policies)는 건드리지 않는다.
> nav-graph / route-tree / catalog-gen / check-generated / workflow-state 등 **어떤 스크립트도 만들거나 고치지 않는다.** 각 생성기의 실제 착수는 명시적으로 하나를 고를 때만.
> 함께 읽을 것: [roadmap-current.md](../../frontend-workflow-kit/roadmap-current.md) ·
> [README.md](../../frontend-workflow-kit/README.md) ·
> [frontend-workflow-kit-implementation.md](../../frontend-workflow-kit-implementation.md) ·
> [artifact-manifest.yaml](../../frontend-workflow-kit/catalog/artifact-manifest.yaml) ·
> [package-scripts.template.json](../../frontend-workflow-kit/package-scripts.template.json) ·
> 선행 후보 초안 [mvp-b-validation-candidates.md](./mvp-b-validation-candidates.md)

> **표기 약속.**
> ① 명령↔스크립트 매핑의 **정본은 `package-scripts.template.json` 의 `//roadmap-scripts` 블록**이다(roadmap 보이기용 격리 — 대상 `.mjs` 가 없어 실행 불가). 본문의 명령은 모두 거기서 인용한다.
> ② **미존재 스크립트는 "(제안)"으로 표기**한다 — nav-graph.mjs · route-tree.mjs · catalog-gen.mjs · check-generated-files.mjs 는 오늘(2026-06-14) **존재하지 않는다.**
> ③ 코드 블록의 인터페이스/출력 형태는 전부 **스케치(제안)** 다. 완성된 `.mjs` 본문은 싣지 않는다.
> ④ 두 항목은 신규 생성기가 **아니다**: `screen-inventory` 는 기존 `workflow-state.mjs` 산출물의 **hardening**이고, `generated file guard` 는 산출 파일이 아니라 **`validate.mjs` 의 GENERATED 마커 검사(검사 6)의 확장/통합**이다.

## 목적

MVP-A(문서→상태→readiness→validate) 이후의 다음 단계인 **MVP-C "Generated Views"** 의 범위를 한 파일로 고정한다.
MVP-C 는 **새 산출물 축을 만들지 않는다**(roadmap "지금 하지 말 것"). 지금까지 LLM·사람이 **수동 작성하던 전역 뷰**(Entry Points·Component Catalog·route tree)를 **생성물로 전환**해, "LLM 추론 → 파일 고정" 파이프라인의 마지막 구멍을 메우는 일이다.
완료 기준은 roadmap/implementation 이 못박은 한 문장이다 — **"수동 작성하던 전역 뷰 3종(component-catalog, nav-graph, route-tree)이 전부 생성물로 전환"**(frontend-workflow-kit-implementation.md §11, line 389).

## 0. 기준선 — 지금 무엇이 있고 무엇이 비어 있나

뷰별 상세에 들어가기 전에, 강화/추가 대상이 되는 **현재 코드·정책 구조**를 고정한다.

```txt
workflow-state.mjs   frontmatter+본문 → _meta/workflow-state.yaml · screen-inventory.yaml (파생값 단일 계산)  ← 존재(MVP-A)
readiness.mjs        readiness_mode = min(fact_mode, decision_cap)                                          ← 존재(MVP-A)
validate.mjs         검사 12종, exit 0/1                                                                     ← 존재(MVP-A) · CI 게이트
lib/spec.mjs         ScreenSpec 파서(표/섹션) + deriveMetrics + interactionResultRoutes(L336-348)            ← 존재 · 재사용 자산
forbidden-paths.mjs  diff 기반 forbidden_paths backstop(warning-first)                                       ← 존재(MVP-B 백스톱)
```

MVP-C 가 정조준하는 **현재의 구멍**(전부 "수동 작성 임시 허용" 상태):

```txt
Entry Points        screen-spec 의 GENERATED:START nav-graph 블록을 MVP-A 에서 사람이 수동으로 채운다(임시 허용).
                    Interaction Matrix·Cross-Domain Edges 와 drift 가능 — 아무도 정합성을 안 본다.        → View 1 nav-graph
route 선언          frontmatter.route 와 src/app 파일 트리(Expo Router)를 대조하는 장치가 없다.
                    validate 검사 5 는 "route 중복"만 본다 — 고아 route·미등록 route 는 사각지대.          → View 2 route-tree
component-catalog   design/component-catalog.md 가 수동 작성(artifact-manifest do_not_edit: false).
                    component_catalog_generated 게이트가 rough-fixture-ui 진입을 막고 있다.                → View 3 component-catalog
screen-inventory    id/domain/route/status 4필드 + checks 만. stub·파생값 hint 가 없어 생성뷰가 재파싱해야.  → View 4 hardening
GENERATED 마커      검사 6 은 manifest 의 do_not_edit:true 항목·screen-spec Entry Points 만 본다.
                    catalog-gen/nav-graph/route-tree 도입 시 모든 생성물을 일괄 순회할 guard 가 없다.       → View 5 file guard
```

**명령↔스크립트 매핑(정본: `package-scripts.template.json` `//roadmap-scripts`).** 네 줄 모두 MVP-C 로 격리 기재돼 있고 대상 `.mjs` 가 없어 **아직 실행 불가**다:

```txt
workflow:catalog          -> scripts/catalog-gen.mjs           (MVP-C, 제안 — 미존재)
workflow:nav              -> scripts/nav-graph.mjs             (MVP-C, 제안 — 미존재)
workflow:route-tree       -> scripts/route-tree.mjs            (MVP-C, 제안 — 미존재)
workflow:check-generated  -> scripts/check-generated-files.mjs (MVP-C, 제안 — 미존재)
workflow:state            -> scripts/workflow-state.mjs        (MVP-A, 존재 — screen-inventory hardening 대상)
```

**평가 기준**(각 뷰 공통으로 채운다): 왜·source of truth·output file·generator(명령/스크립트)·validation·필요 fixtures·do-not-edit·오탐 위험·우선순위.

---

## 1. 왜 MVP-C 가 다음인가

MVP-A 게이트는 **동결**됐다(roadmap §MVP-A 게이트 인벤토리). 그 위에서 다음 단계로 generated views 가 오는 이유:

- **남은 "수동 임시 허용"이 정확히 이 세 뷰다.** `artifact-manifest.yaml`(line 118-119) 이 못박는다 — *"MVP-A 임시 허용: component-catalog 은 수동 작성 (catalog-gen 은 MVP-C). … C 단계에서 생성기 도입 시 true 로 전환한다."*(`mvp: C`, line 128). README 도 같은 취지를 §MVP-A 본문에서 적어 둔다 — *"lint-pack·Figma·생성뷰·훅은 이후 B~D"*(line 6) + MVP-A 구성요소 목록(§"MVP-A에 들어있는 것", line 13-25). 이 임시 허용을 닫는 단계가 곧 MVP-C 다. coupon-feature 예제의 screen-spec 도 *"MVP-A 임시: nav-graph 생성기 이전이라 아래는 수동 기재. MVP-C에서 생성으로 전환됩니다."* 라고 자기 코드에 적어 두었다.
- **로드맵 sequencing.** 명시 순서는 **B(lint 적응)→C(생성뷰)** 다(README line 6: *"lint-pack·Figma·생성뷰·훅은 이후 B~D"*). MVP-C 가 MVP-B 를 코드로 강하게 의존하지는 않지만(병렬 가능), 로드맵 순서상 B 다음이다.
- **마지막 아키텍처 구멍.** "LLM 추론 → 파일 고정" 파이프라인에서 전역 뷰 3종만 아직 사람 손에 남아 있다. 이걸 닫으면 불변식 #3(생성물엔 GENERATED 헤더/마커)·#7(생성기 멱등)이 전역 뷰까지 일관되게 적용된다.
- **이미 게이트가 기다리고 있다.** `implementation-mode-policy.yaml` 의 `rough-fixture-ui` 진입은 `component_catalog_generated == true` 를 요구한다(line 63). md-only fixture(`examples/multi-screen-dry-run`)의 readiness 천장이 `screen-skeleton` 인 이유가 바로 `component_catalog_generated == false` 라서다 — MVP-C 실행을 의도적으로 기다리는 상태다.

**범위 경계(중요).** MVP-C 는 **새 축 추가가 아니다.** nav-graph/route-tree/catalog-gen 은 모두 *기존* 저작 문서(screen-spec·navigation-map·src/components·src/app)에서 *파생*하는 뷰다. screen-inventory 는 *기존* 생성물의 hardening, file guard 는 *기존* validate 검사의 확장이다. roadmap line 99("새 산출물 축 추가 금지")를 위반하지 않는다.

---

## 2. 생성 뷰 목록 (이 세션이 다루는 5종)

```txt
View 1  nav-graph              npm run workflow:nav             scripts/nav-graph.mjs            (제안, 미존재)
View 2  route-tree            npm run workflow:route-tree      scripts/route-tree.mjs           (제안, 미존재)
View 3  component-catalog      npm run workflow:catalog         scripts/catalog-gen.mjs          (제안, 미존재)
View 4  screen-inventory       npm run workflow:state           scripts/workflow-state.mjs       (존재 — hardening)
        hardening
View 5  generated file guard   npm run workflow:check-generated scripts/check-generated-files.mjs(제안, 미존재 — validate 검사 6 확장)
```

View 1~3 은 **신규 생성기**(미존재, 제안)다. View 4 는 **기존 생성기의 출력 계약 강화**다. View 5 는 **산출 파일이 아니라 검증기**다 — 모든 생성물의 마커/헤더 무결성과 재생성 멱등성을 일괄 감시한다.

## 생성 뷰별 요약 표

| View | Source | Output | Generator | Validation | Risks |
|---|---|---|---|---|---|
| **nav-graph** (제안) | 모든 screen-spec 의 Interaction Matrix + navigation-map 의 Cross-Domain Edges | `_meta/nav-graph.yaml` + 각 screen-spec 의 Entry Points `GENERATED:START nav-graph` 블록 | `npm run workflow:nav` → `scripts/nav-graph.mjs` (미존재) | 마커 무결성·라우트 유효성(inventory 존재)·멱등성·중복 Entry Point | 공유 모달 오탐 / route 토큰 부분매칭 / 수동 비고 소실 / 크로스도메인 판정 |
| **route-tree** (제안) | screen-spec frontmatter.route + Interaction Matrix route + `src/app` 파일 트리(Expo Router) | `_meta/route-tree.txt`(권장) 또는 `.yaml` | `npm run workflow:route-tree` → `scripts/route-tree.mjs` (미존재) | route↔파일 대응·동적 세그먼트·중복(검사5 강화)·고아 route | 그룹 폴더 `(tabs)/` 미이해 오탐 / 확장자 가정 / generate-before-validate 순서 |
| **component-catalog** (제안) | `src/components/ui/**` (export + Props) | `docs/frontend-workflow/design/component-catalog.md` (do_not_edit false→**true**) | `npm run workflow:catalog` → `scripts/catalog-gen.mjs` (미존재) | rough-fixture-ui 게이트(`component_catalog_generated`)·헤더/마커·gap-register 교차참조·멱등성 | 제네릭 Props 오탐 / 삭제 컴포넌트 고아 / 수동본↔생성본 동등성 |
| **screen-inventory** hardening | (기존) screen-spec frontmatter — `workflow-state.mjs buildState()` | (기존) `docs/frontend-workflow/_meta/screen-inventory.yaml` | `npm run workflow:state` → `scripts/workflow-state.mjs` (**존재**) | 검사5(중복)·검사4(route 대상)·**제안**: route 형식·stub/파생 hint·domain 존재 | 모달 같은 route 오탐 / 파생값 재파싱(DRY 위반) / stub 상태 미기록 stale |
| **generated file guard** (제안) | (기존) `artifact-manifest.yaml` 의 `kind:generated`·`do_not_edit:true` + `generated_sections` | (산출 파일 없음 — exit code + stdout 위반 목록) | `npm run workflow:check-generated` → `scripts/check-generated-files.mjs` (미존재) | **validate 검사 6 의 확장**: 헤더/마커 무결성 + CI diff 멱등성 일괄 순회 | 비-생성 전역폴더 과검출 / generated_at drift / O(N×M) 비용 / 전체교체 vs granular |

---

## View 1 — nav-graph (신규 생성기, 제안)

**왜.** Entry Points 는 현재 MVP-A 에서 screen-spec 의 `GENERATED:START nav-graph` 블록에 **사람이 수동 기재**한다(coupon-feature 예제가 자기 주석으로 "MVP-C에서 생성으로 전환" 명시). nav-graph 가 생기면 (1) Interaction Matrix 의 이동 엣지를 수동 중복 입력할 필요가 없어져 **drift 원천 차단**, (2) 전역 `_meta/nav-graph.yaml` 로 앱 내비게이션 구조 가시화, (3) navigation-map 의 **Cross-Domain Edges** 와 로컬 이동(Interaction Matrix)을 **통합 그래프화**한다. MVP-C 완료 기준의 핵심 뷰 중 하나다.

**source of truth.** frontend-workflow-kit-implementation.md §9 "생성기 명세(요약)" — nav-graph 행: *입력 = 모든 screen-spec 의 Interaction Matrix + navigation-map 의 Cross-Domain Edges / 출력 = `_meta/nav-graph.yaml` + 각 screen-spec 의 Entry Points GENERATED 블록 / 비고 = 블록 밖은 수정 금지.* 근거 파일: `screen-spec.template.md`(GENERATED 블록), `templates/app/navigation-map.template.md`(Cross-Domain Edges 표), `lib/spec.mjs:336-348`(`interactionResultRoutes` — Result 컬럼에서 `/` 시작 라우트 토큰 추출, **재사용 가능**).

**output file.** `docs/frontend-workflow/_meta/nav-graph.yaml` — **GENERATED 파일**. (YAML/JSON·노드/엣지 스키마는 **설계 미정** — 본 제안의 미해소 결정.) 더불어 각 screen-spec 의 Entry Points GENERATED 블록도 갱신(인바운드 이동 엣지 자동 채우기). 출력 스케치(제안):

```yaml
# GENERATED FILE — DO NOT EDIT  (← 제안: 헤더 형태)
# Source: docs/frontend-workflow/domains/**/screen-spec.md (Interaction Matrix)
#       + docs/frontend-workflow/app/navigation-map.md (Cross-Domain Edges)
# Command: npm run workflow:nav
generated_at: <date>
nodes:
  - { screen_id: COUPON-001, route: /(tabs)/coupons }
edges:
  - { from: COUPON-001, to: COUPON-002, trigger: "쿠폰 카드 탭", kind: local }
  - { from: HOME-001, to: COUPON-001, trigger: "탭 진입", kind: cross-domain }
```

**generator.** `npm run workflow:nav` → `scripts/nav-graph.mjs` **(미존재, 제안)**.

**validation.** (1) Entry Points `GENERATED:START/END nav-graph` 마커 무결성 — 블록 밖 수정 금지, 블록 안만 재생성. (2) nav-graph.yaml 헤더 = GENERATED 마커 + Source/Command 메타. (3) Result 컬럼 라우트 추출은 `interactionResultRoutes` 재사용 — 단, 정규식 `/(\/[^\s]+)/`(spec.mjs L344)는 문자열 내 **첫 `/` 토큰**을 뽑을 뿐 start-anchored 가 아니므로(예: `https://…/path` 혼재 시 부분매칭 위험) 테스트 필수. (4) Cross-Domain Edges 는 navigation-map 표에서 추출(Interaction Matrix 와 구분). (5) Entry Points 합성 = navigation-map Tabs/Stack/Modals + Cross-Domain From→To + 모든 screen-spec 의 Result-가-라우트 행 집계. (6) **멱등성**: 같은 입력 → 같은 출력, 정렬 고정, `generated_at` 만 변동. (7) 라우트 유효성 = `screen-inventory.yaml` 에 존재하는 라우트만(validate 검사 4 와 같은 자산).

**fixtures.** `examples/coupon-feature`(현재 Entry Points 수동 작성된 COUPON-001 `/(tabs)/coupons`, COUPON-002 `/coupons/[id]` + nav-graph 가 찾아야 할 HOME-001 가정) — 생성 전후 diff 로 정상 작동 검증. `examples/multi-screen-dry-run`(탭/크로스도메인/모달/스택/딥링크 조합) 권장.

**do-not-edit.** `GENERATED FILE — DO NOT EDIT / Source: …screen-spec.md(Interaction Matrix) + …navigation-map.md(Cross-Domain Edges) / Command: npm run workflow:nav / Update: 원본 표를 수정하고 위 명령 실행 — 마커 내부는 재생성기가 전부 교체, 마커 밖은 건드리지 않음.`

**risks.** (a) **오탐**: 공유 모달(에러 다이얼로그 등)을 쓰는 모든 화면이 Entry Point 로 집계되면 노이즈 — 해소안: 크로스도메인 엣지만 포함 / 명시적 필터(설계 미정). (b) **라우트 추출 오류**: Result 에 자연어+route 혼재 시 부분 매칭 위험(예: `https://example.com/path` 에서 `//example.com/path` 가 뽑힐 수 있음) — `interactionResultRoutes` 는 문자열 내 첫 `/` 토큰을 추출하므로(정규식 `/(\/[^\s]+)/`, spec.mjs L344 — start-anchored 아님) URL 혼재 시 부분매칭 위험이 있어 테스트 필수. (c) **blast-radius**: 수동 편집(MVP-A)→생성(MVP-C) 전환 시 기존 수동 비고·주석이 전부 삭제됨 → **마이그레이션 가이드 필요**(현재 문서화 없음). (d) **drift**: Interaction Matrix 편집 후 `workflow:nav` 미실행 시 Entry Points stale(생성기 이전이라 validate 검사 6 은 마커만 보고 정합성은 안 봄). (e) **크로스도메인 정의 애매**: 도메인 경계 판정에 screen-id↔domain 매핑 필요(생성기 미정).

**priority: later.** (1) generated-views 번들의 일부. (2) MVP-A 가 Entry Points 수동 작성을 임시 허용(blocking 아님). (3) 로드맵 순서 B→C 상 B 이후. (4) **nav-graph.yaml 의 구체 구조(그래프 표현·노드/엣지 스키마·크로스도메인 필터 규칙)가 미정 → 설계 추가가 선행**. 단 라우트 추출 로직은 `interactionResultRoutes` 로 이미 존재.

---

## View 2 — route-tree (신규 생성기, 제안)

**왜.** route-tree 는 screen-spec 의 `route`(frontmatter)·Interaction Matrix route 와 **`src/app` 파일 트리(Expo Router 규칙)**를 대조해, 선언한 route 가 실제 파일에 존재하는지 검증하고 미등록·고아 route 를 찾는 생성 뷰다. `screen_id↔route` 단일 출처(frontmatter) 정책을 src/app 구조 관점에서 투영해 **validate 검사 5(route 중복)를 강화**한다. nav-graph 와 함께 landing 해 수동 작성 단계를 종료한다(implementation §11, line 389).

**source of truth.** frontend-workflow-kit-implementation.md §4(artifact-manifest)·§9(생성기 명세)·§11(MVP-C), line 330. 근거 파일: `screen-spec.template.md:6`(route frontmatter 단일 출처), `policies/implementation-mode-policy.yaml:44`(`src/app/**` Expo Router 구조 명시), `lib/spec.mjs:336-348`(`interactionResultRoutes` — route 추출 재사용), `scripts/workflow-state.mjs`(초기 route 수집/중복 추적).

**output file.** `docs/frontend-workflow/_meta/route-tree.txt`(권장, implementation §9 기술) 또는 `_meta/route-tree.yaml`(제안). 출력 스케치(제안):

```txt
# GENERATED FILE — DO NOT EDIT  (← 제안)
# Source: docs/frontend-workflow/domains/**/screen-spec.md (frontmatter.route) + src/app 파일 트리
# Command: npm run workflow:route-tree
# Generated at: <date>
/(tabs)/coupons          ← COUPON-001   [src/app/(tabs)/coupons.tsx]
/coupons/[id]            ← COUPON-002   [src/app/coupons/[id].tsx]
/(auth)/login            ← (고아: src/app 에 있으나 screen-spec 선언 없음)
```

**generator.** `npm run workflow:route-tree` → `scripts/route-tree.mjs` **(미존재, 제안)**.

**validation.** (1) 모든 screen-spec frontmatter.route 가 `src/app` 경로로 exact-match 매핑되는가. (2) Interaction Matrix Result route 들이 src/app 에 실제 파일/폴더로 존재하는가. (3) `(tabs)/`·`(auth)/`·`modal/` 그룹 폴더 규칙이 Expo Router 정책과 일치하는가. (4) 동적 세그먼트(`[id]`·`[slug]`)가 `/route/[param]` frontmatter 선언과 대응하는가. (5) **중복 route(검사 5 강화)**: 같은 route 가 여러 파일에 매핑되지 않는가. (6) **고아 route**: screen-spec 선언 없는 src/app 파일 검출. (7) generated 마커 완전성(해당 시 View 5 guard 와 통합).

**fixtures.** `examples/coupon-feature/src/app` 구조 확장 샘플(`(tabs)/coupons.tsx`·`coupons/[id].tsx`·`(auth)/login.tsx`) + expected `_meta/route-tree.txt` 산출 샘플 + negative: `examples/route-tree-mismatch`(route 선언 있으나 파일 없음).

**do-not-edit.** `GENERATED FILE — DO NOT EDIT / Source: …screen-spec.md(frontmatter.route) + src/app 파일 트리 / Command: npm run workflow:route-tree / Update: ScreenSpec 의 route 필드를 수정하고 위 명령 실행.`

**risks.** (a) **오탐**: Expo Router 그룹 폴더 규칙(`(groupname)/` 접두) 미이해 시 유효 라우트를 고아로 오분류. (b) **blast-radius**: 검사 5 가 route 중복만 보므로 route-tree 생성 실패 시 같은 경로의 여러 화면이 덮어써질 수 있음 → **generate-before-validate 순서 강제 필요**. (c) **drift**: route-tree.txt 직접 수정 시 src/app 과 불일치 → do_not_edit 마커 + View 5 guard 강제 필수. (d) **신뢰도**: src/app 이 TS/JSX 확장자만 가정 — CSS/config 섞인 구조 시 파서 강화 필요.

**priority: later.** implementation §11(382-389)의 "생성물 3종 전환" 중 하나로 nav-graph 와 동반 진입(로드맵 예약 단계). 단 `screen_id↔route` 중복 검사는 이미 MVP-A 의 `workflow-state.mjs`·`validate.mjs`(검사 5)에 포함 — route-tree 는 **src/app 구조 동기화**가 본질이라, MVP-B(lint 정책)와 묶어 우선순위를 올릴 여지는 있다.

---

## View 3 — component-catalog (신규 생성기, 제안)

**왜.** `component-catalog` 는 `artifact-manifest.yaml` 에 `kind=generated` 로 이미 등록돼 있으나(line 120-128), 템플릿·생성기(`catalog-gen.mjs`)가 없고 **`do_not_edit: false`(MVP-A 수동 모드)**다. **MVP-C readiness 게이트가 `component_catalog_generated == true` 를 요구**한다(`implementation-mode-policy.yaml:63`) — 이 fact 가 `false` 인 한 `rough-fixture-ui` 가 안 열린다. drift 위험: 저작(component-gap-register.md)과 생성(component-catalog.md) 사이 가시성 공백 — 화면이 컴포넌트를 참조하고 gap 을 선언하므로, catalog 가 실제 사용 + gap 을 집계해야 툴링·gap 추적이 이어진다.

**source of truth.** `artifact-manifest.yaml §component-catalog`(line 120-128: 경로/명령/source) + README §MVP-A(line 13-25, 118-129: "component-catalog 은 C 단계 생성기 도입") + `implementation-mode-policy.yaml`(line 63, 97-98, 104). 참조 산출물: coupon-feature 의 **수동 작성** `design/component-catalog.md`(MVP-A) — 생성기가 맞춰야 할 구체 출력 예시.

**output file.** `docs/frontend-workflow/design/component-catalog.md` (GENERATED) — `artifact-manifest.yaml:123` 과 일치해야 함. `do_not_edit` 은 MVP-C 핸드오프에서 **false→true** 전환(line 127).

**generator.** `npm run workflow:catalog` → `scripts/catalog-gen.mjs` **(미존재, 제안)**. source glob = `src/components/ui/**`(manifest line 125-126).

**validation.** (1) **rough-fixture-ui 진입 전 반드시 존재**(readiness fact `component_catalog_generated == true`). (2) GENERATED 헤더/마커 필수. (3) 출력 경로 = manifest line 123. (4) GENERATED:START/END 사이 불변(LLM 편집 금지). (5) **`do_not_edit=true` 전환**(MVP-A false → MVP-C true). (6) catalog 는 source(`src/components/ui/**`) + evidence(어느 screen-spec 이 어느 컴포넌트를 쓰는지)로 역링크. (7) 엔트리가 실제 `src/components/ui/{Name}.tsx` export + Props 인터페이스와 일치. (8) `component-gap-register.md` gap 과 교차참조(screen→uses→gap status).

**fixtures.** `examples/catalog-generation/`(coupon-feature 와 평행, catalog-gen 베이스라인) — `before-src/`(`src/components/ui/*.tsx`) + expected catalog 출력. coupon-feature 의 `src/components/ui/*.tsx`(Button·SkeletonList·EmptyState·ErrorState·SegmentedTabs)는 이미 수동 catalog.md 에 반영돼 있어 **멱등성 회귀 코퍼스**로 직접 재사용 가능.

**do-not-edit.** `GENERATED FILE — DO NOT EDIT / Source: src/components/ui/** / Command: npm run workflow:catalog / Update: 소스 컴포넌트 파일을 수정하고 위 명령 재실행. / NOTE(MVP-C): catalog 생성은 MVP-A 수동 작성을 대체. do_not_edit 은 MVP-C 핸드오프에서 false→true.`

**risks.** (a) **blast-radius**: `src/components/ui/**` 에서 추출 — TS 타입 깨짐·import 경로 변경 시 파서가 조용히 실패하거나 오탐(전체 AST 대신 `interface Props` 만 추출 권장). (b) **오탐**: 제네릭 `Props`/`React.ReactNode children` vs 명시 prop 목록(Button.tsx Props vs Wrapper 패턴) 일관성. (c) **drift**: gap 추적 경계 — component-gap-register.md 는 저작 유지, catalog 는 gap 의 proposed/accepted/rejected 를 **표시만**(집계, gap 변형 금지). (d) **coupling**: screen-spec 에 구조화된 "components used" 섹션이 아직 없어 catalog 가 State/Mutation Matrix 텍스트 파싱으로 추론 → screen-spec 섹션 추가 전까지 취약. (e) **고아**: 삭제된 컴포넌트(`src/components/ui/Old.tsx` 제거)를 우아하게 처리 — 엔트리가 실제 export 와 링크되는지 exists 검사. (f) **불일치**: MVP-A 수동 catalog.md(coupon-feature) ↔ MVP-C 생성기가 같은 입력에 동일 출력(멱등성, README line 100).

**priority: first.** (1) manifest 가 MVP-C 로 등록(line 124). (2) **readiness 게이트(`implementation-mode-policy.yaml:63`)가 rough-fixture-ui 를 `component_catalog_generated` 로 막고 있어, catalog-gen 이 가장 먼저 그 게이트를 푼다.** (3) 추출 알고리즘이 가장 단순(JSDoc/TS export 파싱 → import 경로 + 구조화 Props 표), 외부 의존 없음(순수 TS/JS AST). (4) coupon-feature 에 맞출 구체 reference 출력이 이미 있음. → catalog-gen 이 multi-dry-run 6-screen fixture 의 implement-screen 테스트를 가장 일찍 가능케 한다.

---

## View 4 — screen-inventory hardening (기존 생성물 강화 — 신규 생성기 아님)

> **명확화.** screen-inventory 는 **신규 생성기가 아니다.** 이미 `npm run workflow:state`(`workflow-state.mjs buildState()`, L29-132)가 생성해 `_meta/screen-inventory.yaml`(GENERATED, do_not_edit:true)로 emit 하고 있다(`artifact-manifest.yaml:100-107`). MVP-C 의 일은 **새 스크립트 작성이 아니라 기존 산출물의 출력 계약(필드·검증 규칙)을 hardening** 하는 것이다.

**왜.** screen-inventory 는 route/screen_id 유일성 검증의 SSoT 다. 킷이 MVP-A(문서)→MVP-B(입력 정합)→MVP-C(생성뷰)로 성숙하면서 inventory 는 하위 기능을 받칠 만큼 강해져야 한다 — (1) **nav-graph 생성은 구조화된 inventory 를 입력으로 필요**, (2) route-tree 는 실제 파일 route 와 교차검증, (3) readiness 게이트가 workflow-state 경유로 inventory 를 간접 참조, (4) 멀티도메인 오케스트레이션에 더 풍부한 메타(stub 상태·도메인 affinity) 필요. hardening 없이 inventory 위에 생성뷰를 쌓으면 stale·불일치가 번진다.

**source of truth.** `workflow-state.mjs buildState()`(L29-132) — screen-spec frontmatter 에서 id/domain/route/status 추출, duplicate_ids/duplicate_routes 계산, YAML emit(L156-163). 계약 = `frontmatter.schema.json`(artifact_id·screen_id·route·status enum). `artifact-manifest.yaml:100-107`(kind:generated, do_not_edit:true).

**output file.** (기존) `docs/frontend-workflow/_meta/screen-inventory.yaml`. 현재 형태 = id/domain/route/status 4필드 + checks(duplicate_ids·duplicate_routes). 제안 확장(hardening) 스케치:

```yaml
# GENERATED FILE — DO NOT EDIT  (← 기존 헤더 유지)
# Source: docs/frontend-workflow/domains/**/screen-spec.md (frontmatter)
# Command: npm run workflow:state
generated_at: <date>
screens:
  - id: COUPON-001
    domain: coupons
    route: /(tabs)/coupons
    status: confirmed
    # --- 제안(hardening): 하위 생성뷰 재파싱 방지용 hint ---
    stub: false
    derived_count: 7
checks:
  duplicate_ids: []
  duplicate_routes: []
```

**generator.** `npm run workflow:state` → `scripts/workflow-state.mjs` **(존재)**. hardening 은 `buildState()` 의 emit 필드 + 검증 규칙 강화이지 신규 스크립트가 아니다.

**validation.** *현행(코드 확인):* 검사 5(`validate.mjs` L192-195) screen_id/route 중복; 검사 4(L197-205) Interaction Matrix Result route 가 inventory route 집합에 존재; 검사 6(L207-226, 331-342) GENERATED 헤더/마커. *제안(MVP-C hardening, 미구현):* (a) **stub 플래그 검증** — stub=false 면 파생값(state_matrix_complete 등) 비어 있으면 안 됨; (b) **route 형식 일관성** — 모든 route 가 Expo Router 패턴(`/(tabs)/…` 또는 `/…/[id]`); (c) **domain affinity** — screen.domain 이 domain-rules artifact 로 존재; (d) **status lifecycle** — confirmed/draft/review 전환만; (e) **결정성** — screen 정렬 안정(현재 id 정렬, L117); (f) **메타 완전성** — stub/derived_count/readiness hint 를 inventory 에 인코딩해 하위 뷰의 재파싱 제거.

**fixtures.** `examples/coupon-feature`(2화면, 현행 테스트), `examples/multi-screen-dry-run`(5+ 화면 멀티도메인 — Tier2 reconcile·MVP-C nav-graph 테스트), `examples/input-reconciliation`(screen-inventory.snapshot.md 사용).

**do-not-edit.** `GENERATED FILE — DO NOT EDIT`(출력 YAML line 1). Source: `…domains/**/screen-spec.md`(frontmatter). Command: `npm run workflow:state`. (이미 적용 중 — hardening 은 이 계약을 더 엄격히 강제할 뿐 변경하지 않는다.)

**risks.** (a) **오탐(중복 오검출)**: 두 화면이 합법적으로 같은 route 공유(모달 오버레이) 시 검사 5 실패 — 완화: Status enum 에 alias/overlay 추가(향후 설계). [확률 낮음, blast 설계시점만] (b) **route 형식 취약**: Expo Router 문법이 아직 어디에도 regex 안 됨 — nav-graph 가 inventory 를 소비하면 broken route 가 nav-graph 를 깨뜨림. [확률 중·MVP-C, blast 높음] (c) **메타 stale**: 파생값은 line 46 에서 계산되나 inventory 는 4필드만 — 하위 생성뷰가 재파생/재파싱(DRY 위반·drift). hardening 으로 stub/derived hint 추가 권장. [확률 높음·MVP-C, blast 중간] (d) **domain 고아**: inventory 가 domain 의 domain-rules artifact 존재를 검증 안 함 — 신규 검사 권장. [확률 중] (e) **stub 무결성**: `isStub()`(spec.mjs L185-193)은 stub 을 판정하나 inventory 가 stub 상태를 export 안 함(workflow-state.mjs L52 엔 있음) — stub 변경 시 inventory stale. [확률 높음, blast 중간 — readiness/nav-graph 오독]

**priority: first.** inventory hardening 은 **foundational MVP-C 작업**이다 — (1) nav-graph 생성(구조화 입력 필요), (2) route-tree 검증(파일 route 교차), (3) readiness 게이트 강화(stub→mode 효과)를 모두 막는 전제. roadmap line 89-95 의 "다음 구현 후보"에 screen-inventory hardening 이 **명시되지 않았으나**, MVP-C 완료 기준(line 389)이 inventory hardening 을 함의한다. **권장: nav-graph.mjs 구현 전 초기 MVP-C 작업으로 스코프.**

---

## View 5 — generated file guard (산출 파일 아님 — validate 검사 6 의 확장/통합, 제안)

> **명확화.** generated file guard 는 **산출 파일을 만들지 않는다.** 검증 리포트(exit code + stdout 위반 목록)만 낸다. 또한 **완전히 새로운 검사가 아니라**, 이미 존재하는 `validate.mjs` **검사 6**("do_not_edit 산출물의 GENERATED 헤더/마커 훼손", L207-226·L331-342)을 **모든 생성뷰로 확장·통합**하는 것이다.

**왜.** 불변식 #3(생성물엔 GENERATED 헤더/마커)·#7(생성기 멱등)을 강제하는 **제3 방어선**이다. MVP-A 의 검사 6 은 manifest 의 `do_not_edit:true` 항목과 screen-spec Entry Points 만 단편적으로 본다. MVP-C 의 guard 는 catalog-gen/nav-graph/route-tree 가 도입되는 순간 **모든 생성뷰에 대해 마커 무결성 + 재생성 멱등성을 일괄 감시**해 drift 를 원천 차단한다.

**source of truth.** frontend-workflow-kit-implementation.md §3(Generated Block Convention, L51-99 — 적용 대상: Entry Points·workflow-state.yaml·screen-inventory.yaml·route-tree.txt·nav-graph.yaml·component-catalog.md·eslint.workflow.config.mjs; L99 명시: *"check-generated-files.mjs 는 마커/헤더 없는 생성물, 수동 편집 흔적을 검출한다"*) + §8(검사 6) + §11(MVP-C). README §불변식(#3·#6·#7). `validate.mjs:207-226, 331-342`(현행 검사 6 구현).

**output file.** **산출 파일 없음** — 검증 리포트/exit code 만, 마커/헤더 위반 목록은 stdout. 리포트 스케치(제안):

```txt
[check-generated] design/component-catalog.md: GENERATED 헤더 누락 (catalog-gen 산출물인데 마커 없음)
[check-generated] …/screen-spec.md: GENERATED:END nav-graph 누락/순서오류
[check-generated] (CI) nav-graph.yaml: 재생성 후 diff 발생 (generated_at 외 변경 — 멱등성 위반)
```

**generator.** `npm run workflow:check-generated` → `scripts/check-generated-files.mjs` **(미존재, 설계만 존재 — 제안)**.

**validation(이 guard 가 수행하는 규칙).** (1) **생성물 수집**: `artifact-manifest.yaml` 의 `kind=generated` 모든 항목 + `generated_sections`(screen-spec 의 Entry Points). (2) **헤더 검사**: 각 생성 파일 상단 ~400자 내 마커 — Markdown `<!-- GENERATED FILE — DO NOT EDIT -->` 또는 YAML `# GENERATED FILE — DO NOT EDIT`. (3) **섹션 마커 검사**: `GENERATED:START <gen>`/`GENERATED:END <gen>` 쌍 존재 + 순서(START < END) + generator 이름 일치(현행 검사 6 의 정규식 `GENERATED:START\s+{gen}\b` 재사용). (4) **마커 훼손 감지**: 누락·변경(명령행 오타·Source 경로 변경) → error. (5) **재생성 멱등성(CI only)**: 각 생성기 재실행 후 `git diff --exit-code` — 산출물이 이전과 동일(타임스탬프 제외). (6) **경계 전환 감지**: MVP-A 임시 허용(Entry Points·component-catalog 수동)의 `do_not_edit: false→true` 전환.

**fixtures.** `examples/coupon-feature`(`_meta/workflow-state.yaml`·`_meta/screen-inventory.yaml`·`design/component-catalog.md` 각 GENERATED 헤더 + Entry Points 마커 있는 screen-spec — 실제 헤더 예: `# GENERATED FILE — DO NOT EDIT` / `# Source: …` / `# Command: npm run workflow:state`), `examples/multi-screen-dry-run`(동일 생성물), `examples/path-backstop`(경계 검증 케이스).

**do-not-edit.** 생성기(catalog-gen/nav-graph/route-tree/check-generated 자신)만이 마커 내 콘텐츠를 교체하고, 마커 밖(헤더 이후·블록 외 섹션)은 직접 편집 금지. **마커 변경(generator 이름 오타 등)도 감시 대상.** 현행 검사 6 은 MVP-A 수동 단계의 현상 확인만, 진정한 강제는 MVP-C 에서 모든 생성기·생성물을 guard 가 일괄 순회할 때 성립.

**risks.** (a) **오탐**: 공유 `src/api`·`src/components/ui` 등 전역 폴더에 비-생성 파일이 있으면 헤더 검사 과다 적용 → **`do_not_edit:true` 마크된 것만** 필터링 필수. (b) **타임스탬프 drift**: 생성기가 `generated_at` 갱신하면 "멱등하지 않다" false fail → 비교 시 타임스탬프 정규화(기존 `test-fixture.mjs` 의 `normalizeText` 패턴 재사용). (c) **블록 감시 비용**: screen-spec 마다 모든 생성 섹션 검사 → O(N×M), 화면 많으면 캐싱/fail-fast 최적화. (d) **마커 문법 엄격성**: `GENERATED:START nav-graph` 뒤 공백/케이스 민감 → 정규식 정의 명확화 + lint-policy 보강. (e) **부분 변경 vs 전체 교체**: 생성기가 일부만 업데이트하려는 경우 마커 블록이 전체 교체만 허용 → **설계 결정 필요**(전체 교체만? granular update?).

**priority: first.** MVP-C 진입의 **첫 티켓**이어야 한다 — (1) 불변식 #3·#7 을 코드로 강제 안 하면 재현 불가, (2) CI 멱등성 게이트가 diff 기반이라 산출물이 정확히 일치해야 함(CHANGELOG: GitHub Actions `git diff --exit-code` 멱등성 게이트), (3) catalog-gen/nav-graph/route-tree 셋을 도입하는 순간 모두 마커를 가지므로 guard 도 동시에 필요. 현행 검사 6 은 점진 확장하되, check-generated 는 세 생성기와 함께 들어와야 한다.

---

## 3. 각 뷰 source of truth (요약)

| View | source of truth(입력 정본) |
|---|---|
| nav-graph | 모든 screen-spec `## Interaction Matrix` + navigation-map `Cross-Domain Edges` (impl §9) |
| route-tree | screen-spec `frontmatter.route` + Interaction Matrix route + `src/app` 파일 트리(Expo Router; policy:44) |
| component-catalog | `src/components/ui/**` export + Props (manifest:125-126) |
| screen-inventory | (기존) screen-spec frontmatter — `workflow-state.mjs buildState()` (manifest:105-106) |
| file guard | (기존) `artifact-manifest.yaml` 의 `kind:generated`·`do_not_edit:true` + `generated_sections` |

각 뷰의 정본은 **저작 문서/소스 코드**이지 생성물 자신이 아니다 — 생성물은 항상 파생이며, 편집은 정본을 고치고 명령을 재실행하는 것으로만 한다(불변식 #3).

## 4. 각 뷰 output file (요약)

| View | output file | kind |
|---|---|---|
| nav-graph | `_meta/nav-graph.yaml` + 각 screen-spec Entry Points 블록 | GENERATED (신규) |
| route-tree | `_meta/route-tree.txt`(권장) 또는 `.yaml` | GENERATED (신규) |
| component-catalog | `design/component-catalog.md` | GENERATED (do_not_edit false→**true**) |
| screen-inventory | `_meta/screen-inventory.yaml` | GENERATED (기존, 강화) |
| file guard | (없음 — exit code + stdout 위반 목록) | 검증 리포트 |

## 5. do-not-edit 규칙 (불변식 #3 의 MVP-C 적용)

불변식 #3(README line 96): *생성물엔 GENERATED 헤더/마커. 마커 밖은 생성기가 안 건드린다.* MVP-C 적용:

```txt
(1) 문서 섹션   <!-- GENERATED:START <generator> --> … <!-- GENERATED:END <generator> -->
                (screen-spec Entry Points; 마커 안만 재생성, 밖은 사람 편집 영역 — 생성기가 보존)
(2) 생성 파일   상단 헤더 블록 = "GENERATED FILE — DO NOT EDIT" + Source: + Command: + Update 안내
                (_meta/*.yaml, route-tree.txt, component-catalog.md)
(3) do_not_edit  manifest 의 do_not_edit:true 항목만 헤더 강제 대상.
                 component-catalog 은 MVP-A false → MVP-C 핸드오프에서 true 전환(manifest:127)
(4) 강제          check-generated-files.mjs(View 5)가: 마커 누락 → fail / 마커 내부 편집 흔적 → fail /
                  망가진 START·END 쌍 → fail. validate 검사 6 의 일괄·전수 확장.
```

핵심: **마커 밖 = 사람 영역, 마커 안 = 생성기 영역.** 생성기는 마커 밖을 절대 덮어쓰지 않고, guard 는 마커 안 수동 편집을 잡는다.

## 6. 생성기 명령 제안 (정본: `//roadmap-scripts`)

네 명령 모두 `package-scripts.template.json` 의 `//roadmap-scripts` 에만 존재(대상 `.mjs` 미존재 → 실행 시 "Cannot find module"). 각 스크립트 구현 시 해당 줄을 `scripts` 로 옮긴다 — 이는 **MVP-C 착수 때의 일이며 이 세션에서는 하지 않는다.**

```txt
npm run workflow:catalog          → scripts/catalog-gen.mjs            (제안)  # component-catalog (View 3)
npm run workflow:nav              → scripts/nav-graph.mjs              (제안)  # nav-graph (View 1)
npm run workflow:route-tree       → scripts/route-tree.mjs            (제안)  # route-tree (View 2)
npm run workflow:check-generated  → scripts/check-generated-files.mjs  (제안)  # file guard (View 5)
npm run workflow:state            → scripts/workflow-state.mjs        (존재)  # screen-inventory hardening (View 4)
```

## 7. validation 규칙 (현행 검사 ↔ MVP-C 강화)

**현행 `validate.mjs` 12종(코드 확인 — `validate.mjs` 헤더):** 1 frontmatter↔schema · 2 manifest 필수+경로 · 3 끊어진 참조(depends_on·sources) · 4 Interaction Matrix route 존재 · 5 screen_id/route 중복 · 6 GENERATED 헤더/마커 · 7 confirmed 승인 메타 · 8 API confirmed→zod/OpenAPI 존재 · 9 Open Decisions 형식 · 10 Copy Keys Status · 11 입력 결과물 frontmatter · 12 Reconciliation Register.

> 주: 선행 MVP-B 초안은 "검사 9종"으로 적었으나, 그 이후 검사 10·11·12 가 추가돼 **현재는 12종**이다(`validate.mjs:2` 헤더 및 최근 커밋 "검사 12종" 일치). MVP-C 는 새 검사 번호를 늘리기보다 **기존 검사 4·5·6 을 강화**하고 **생성기 자체에 멱등성·마커를 내장**하는 방향이다.

MVP-C 가 건드리는 검사:

```txt
검사 4   Interaction Matrix route 존재  → route-tree 가 src/app 파일 트리와도 대조(현재는 inventory route 집합만)
검사 5   screen_id/route 중복           → route-tree 가 고아 route·미등록 route 까지 확장
검사 6   GENERATED 헤더/마커            → check-generated-files.mjs(View 5)가 모든 생성뷰로 일괄 확장
신규     생성기 멱등성(불변식 #7)        → 각 생성기가 자체 보증 + CI git diff --exit-code (View 5)
```

**판정 단일 출처 불변식.** readiness(모드 판정)에는 생성뷰 검증을 넣지 않는다 — guard·route-tree 는 validate/별도 검증기에 산다. readiness 는 `component_catalog_generated` 같은 *존재 fact* 만 소비한다(이미 그렇게 동작).

## 8. 필요한 fixtures (요약)

```txt
View 1 nav-graph           examples/coupon-feature (Entry Points 수동본 diff) · examples/multi-screen-dry-run (이동 패턴 조합)
View 2 route-tree          examples/coupon-feature/src/app 확장 + expected route-tree.txt · examples/route-tree-mismatch (negative)
View 3 component-catalog    examples/catalog-generation (before-src + expected) · coupon-feature ui/*.tsx (멱등성 코퍼스)
View 4 screen-inventory     examples/coupon-feature · examples/multi-screen-dry-run · examples/input-reconciliation (snapshot)
View 5 file guard          examples/coupon-feature · examples/multi-screen-dry-run · examples/path-backstop (경계 케이스)
```

기존 골든 예제(coupon-feature·multi-screen-dry-run)를 **코퍼스로 재사용**하고, 생성뷰별로 expected 산출물을 커밋하는 게 기본 전략이다(MVP-B 후보 5 의 expected-비교 하니스 패턴과 동일).

## 9. CI 전략

기존 MVP-A CI(`frontend-workflow-kit.yml`)의 **warning-first → enforce** 패턴 위에 쌓는다(CHANGELOG·path-backstop 선례와 동일).

```txt
(1) Baseline      example:readiness 다음에 `workflow:catalog` + `workflow:nav` 추가(state 생성과 병렬)
(2) 멱등성 게이트  기존 `git diff --exit-code`(_meta/) 를 design/component-catalog.md ·
                  navigation-map Entry Points 섹션 · _meta/route-tree.txt 로 확장
(3) route-tree     _meta/route-tree.txt 를 커밋본과 diff (멱등 마커: `# Generated at: <date>` 만 변동 허용)
(4) check-generated example:validate 직전에 `workflow:check-generated` 를 최종 검증으로(fail-closed: 마커 누락 → exit 1)
(5) 골든 fixture   test-fixtures.mjs 엔트리는 warning-first(continue-on-error: true)로 시작,
                  FP(오탐) 확인 후 enforce 승격 (보드 §0/§7 룰)
(6) 멱등 불변식    네 생성기 모두 같은 입력 → 같은 출력. generated_at 한 줄만 변동(불변식 #7)
```

핵심은 **diff 기반 멱등성**이다 — 생성물이 byte-동일(타임스탬프 제외)이라야 CI 가 안정적으로 게이트한다. 그래서 View 5(guard)가 CI 전략의 중심축이다.

## 10. Work Packet 과의 상호작용

Work Packet(템플릿 `work-packet.template.md`)은 readiness 출력의 **Index/Handoff 보드**다 — 정본 ScreenSpec·readiness 를 복사하지 않고 **링크만** 건다("Must Read"). readiness_source 경로를 frontmatter 에 스냅샷하고, Readiness Snapshot 표와 Allowed/Forbidden Paths 를 readiness 출력에서 **글로 복사**한다. **게이트가 아니라 봉투**다 — readiness.mjs 가 계산한 readiness_mode/allowed_paths/forbidden_paths/blocking 을 "한 세션 봉투"로 포장할 뿐. status(draft|active|executed|reviewed|closed)는 사람-facing 라벨이지 readiness 게이트가 아니다(코드 강제 0).

**MVP-C 와의 접점.** 생성뷰는 Work Packet 에 **새 게이트를 추가하지 않는다.** nav-graph/route-tree/component-catalog 는 Work Packet 이 링크하는 readiness/검증의 *입력*을 정확하게 만들 뿐이다. 단 component-catalog 생성(View 3)이 `component_catalog_generated` fact 를 켜면, 그 fact 가 readiness_mode 를 올리고 → Work Packet 의 Readiness Snapshot·allowed_paths 가 따라 바뀐다. 즉 **MVP-C 는 Work Packet 의 내용(스냅샷)에 간접 영향**을 주지만, Work Packet 의 게이트 성격(없음)은 바꾸지 않는다. 불변식 #1: 모드 판정은 readiness.mjs 단일 출처.

## 11. forbidden-paths 와의 상호작용

`_meta/` 생성물(workflow-state.yaml·screen-inventory.yaml, 그리고 MVP-C 의 nav-graph.yaml·route-tree.txt)은 **forbidden_paths/backstop 과 분리된 영역**이다. 근거:

- `forbidden-paths.mjs`·`path-backstop.mjs` 는 **diff 기반 backstop(2차 방어선)** 이고 **트리 스캔 금지**(공유 `src/api` 오탐 방지). MVP-A guarded surface 는 `src/api/**`·`openapi.yaml/yml` 만이다.
- `validate.mjs` 의 authoring 문서 수집에서 **`_meta` 는 제외**된다(filter `!includes('_meta')`). 따라서 `_meta` 생성물 자체는 guarded 등록 대상이 아니라 **backstop diff 검사 경로가 아니다.**
- `do_not_edit:true` 생성물은 GENERATED 헤더로 표시돼 **diff 만 monitored** — 경로 경계 backstop 이 아니라 **View 5(file guard) 의 마커/멱등성 검사 영역**이다.

**경계 정리(중요).** MVP-C 의 생성물 보호는 **forbidden_paths(경로 경계 위반)가 아니라 GENERATED 마커 무결성(View 5)** 으로 한다. 두 방어선은 겹치지 않는다 — forbidden_paths 는 "모드가 못 만지는 경로를 만졌나"(src/api 등), file guard 는 "생성물을 손으로 고쳤나/멱등한가"(_meta·catalog 등). MVP-C 는 후자만 확장하고 전자(`src/api/**`·openapi)는 건드리지 않는다.

## 12. 무엇을 먼저 구현 (priority)

설계 성숙도·게이트 의존·blast-radius 를 종합한 제안 순서. **MVP-B 초안과 같은 철학 — 인프라/전제를 먼저 깔고, 게이트를 푸는 것부터.**

```txt
Phase 0  (전제·인프라)  View 4  screen-inventory hardening      ← nav-graph/route-tree 의 구조화 입력 전제
Phase 0  (방어선)       View 5  generated file guard            ← 세 생성기 도입과 동시에 필요(첫 티켓)
Phase 1  (게이트 해제)  View 3  component-catalog (catalog-gen)  ← rough-fixture-ui 게이트를 가장 먼저 푼다
Phase 2  (전역 뷰)      View 1  nav-graph                        ← Entry Points 수동→자동 (스키마 설계 선행)
Phase 2  (전역 뷰)      View 2  route-tree                       ← src/app 동기화 (nav-graph 와 동반)
```

**근거.**
- **View 4(hardening) 가 전제.** nav-graph·route-tree 가 구조화된 inventory(stub·파생 hint)를 입력으로 쓰므로, inventory 를 먼저 단단히 해야 위에 쌓을 수 있다. 코드 변경은 기존 `workflow-state.mjs` 강화라 신규 스크립트 위험이 없다.
- **View 5(guard) 가 첫 티켓.** 세 생성기를 도입하는 순간 모두 마커를 가지므로 guard 가 동시에 와야 한다. 불변식 #3·#7 을 코드로 강제하지 않으면 멱등성 CI 가 성립하지 않는다.
- **View 3(catalog-gen) 가 첫 생성기.** **유일하게 readiness 게이트(`component_catalog_generated`)를 직접 푼다** — rough-fixture-ui 진입을 막던 fact 를 켠다. 추출 알고리즘이 가장 단순(순수 TS/JS AST, 외부 의존 없음)하고, coupon-feature 에 맞출 reference 출력이 이미 있다.
- **View 1·2(nav-graph·route-tree) 는 동반·later.** "전역 뷰 3종 전환"의 나머지 둘. nav-graph 는 **nav-graph.yaml 스키마(노드/엣지·크로스도메인 필터)가 미정**이라 설계 선행이 필요해 catalog 보다 뒤. route-tree 는 nav-graph 와 같은 라우트 자산(`interactionResultRoutes`)을 공유해 함께 묶는다.

**대안 분기.** "전역 뷰 전환"을 빨리 보여 주고 싶으면 View 1(nav-graph)을 catalog 와 병행하되, nav-graph.yaml 스키마 결정을 별도 Open Decision 으로 먼저 닫아야 한다. md-only fixture 의 implement-screen 테스트를 빨리 열고 싶으면 View 3 을 최우선으로(현 권장).

## 13. 무엇을 아직 구현하지 말 것 (지금 하지 말 것)

이 세션은 **문서 한 장**이다. 아래는 MVP-C 착수 시점에도 명시적 결정 없이는 손대지 않는다.

```txt
이 세션에서 금지(절대 규칙):
  - nav-graph/route-tree/catalog-gen/check-generated/workflow-state 등 어떤 스크립트도 만들거나 고치지 않는다.
  - package.json · package-scripts.template.json · README · CHANGELOG · roadmap · .github(CI) ·
    기존 scripts/* · templates/* · schemas/* · policies/* 를 만들거나 수정하지 않는다.
  - //roadmap-scripts 의 네 줄을 scripts 로 옮기지 않는다(그건 각 생성기 구현 착수 때의 일).

MVP-C 범위 밖(다른 단계 — 끌어오지 않는다):
  - API↔OpenAPI 1:1 매칭 검사(검사 8 확장) — Tier 3, MVP-B 로 미룸(linked_schema 규약 선결).
  - Interaction Matrix Result 컬럼 구조화(Type/Target/Params) — Tier 3 후보, 설계 결정 필요(MVP-B).
  - forbidden_paths diff backstop 의 --enforce 승격 — 이미 forbidden-paths.mjs 에 warning-first 로 존재,
    FP 관측 후 승격(MVP-C 와 무관, 건드리지 않는다).
  - Work Packet & Review Artifacts — Future Candidate, 별도 결정 대기.
  - reconcile-input 의 hook/CI 강제 · Investigation/Verification blocks_mode 파싱 — Tier 2 후속.
  - 새 산출물 축 추가 — 명시적으로 금지(roadmap line 99). 생성뷰는 기존 저작물의 파생일 뿐.

MVP-C 안이지만 먼저 결정해야 할 것(Open Decision 감 — 구현 전 명시):
  - nav-graph.yaml 구조: YAML/JSON · 노드/엣지 스키마 · 크로스도메인 필터 규칙(공유 모달 오탐 해소).
  - nav-graph 마이그레이션: 수동 Entry Points → 자동 전환 시 기존 수동 비고/주석을 어디로 보낼지(현재 문서화 없음).
  - route-tree 출력 포맷: .txt(impl 권장) vs .yaml.
  - file guard 의 granular update 허용 여부: 마커 블록 "전체 교체만" vs "부분 갱신 허용".
  - LLM 이 게이트를 내리게 만드는 자동화 금지(resolve/confirm/conflict-close 는 사람-전용 불변식 유지).
```

**한 줄 요약.** MVP-C 는 *수동 작성하던 전역 뷰 3종(component-catalog·nav-graph·route-tree)을 생성물로 전환*하고, 그 전환을 안전하게 만드는 *screen-inventory hardening + generated file guard* 를 함께 깐다 — **새 축은 만들지 않고, 게이트는 여전히 readiness(Open Decision·정책 fact)만이 건다.** 이 세션의 산출물은 이 문서 하나뿐이다.

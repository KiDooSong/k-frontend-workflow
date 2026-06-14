# nav-graph-001 — MVP-C Phase 1 nav-graph 생성기 구현 run

읽기 전용 내비게이션 그래프 생성기(`scripts/nav-graph.mjs` + `scripts/lib/nav-graph.mjs`)와
golden fixture(`examples/nav-graph/basic-flow/`)를 추가한다. ScreenSpec 은 절대 수정하지 않는다.

## 1. implemented files

생성/추가 (절대경로):
- `.../frontend-workflow-kit/scripts/lib/nav-graph.mjs` — 순수 빌더 `buildNavGraph({ docsDir })` + `cellRoutes()` + `parseNavigationMapRoutes()` (IO 없음, 테스트/훅 재사용).
- `.../frontend-workflow-kit/scripts/nav-graph.mjs` — CLI (shebang + `--docs`/`--out`/`--json`). docs 읽고 그래프 빌드 후 `--out`(기본 `<docs>/_meta/nav-graph.yaml`)에 GENERATED YAML 작성.
- `.../examples/nav-graph/basic-flow/docs/frontend-workflow/app/navigation-map.md`
- `.../examples/nav-graph/basic-flow/docs/frontend-workflow/domains/home/screens/home/screen-spec.md` (HOME-001)
- `.../examples/nav-graph/basic-flow/docs/frontend-workflow/domains/coupons/screens/coupon-list/screen-spec.md` (COUPON-001)
- `.../examples/nav-graph/basic-flow/docs/frontend-workflow/_meta/nav-graph.yaml` (생성물)
- `.../examples/nav-graph/basic-flow/expected/nav-graph.yaml` (golden; `_meta/nav-graph.yaml` 와 byte-identical, 752 bytes)
- `.../frontend-workflow-kit/temp/runs/nav-graph-001.md` (이 문서)

재사용한 기존 라이브러리 (수정 없음): `lib/spec.mjs`(`loadScreenSpec`·`parseTable`·`col`·`isStub`·`getSections`·`interactionResultRoutes`), `lib/util.mjs`(`parseArgs`·`DEFAULTS`·`findFiles`·`readFileSafe`·`emitGeneratedYaml`·`writeFile`).

수정하지 않음 (hard rule): readiness.mjs, workflow-state.mjs, validate.mjs, package.json, 어떤 ScreenSpec Entry Points 블록, `catalog/artifact-manifest.yaml`(아래 6 참조).

## 2. route edge parsing rules

- **이동(outbound) 엣지는 SOURCE 화면 자신의 `## Interaction Matrix` Result 컬럼에서만** 도출한다. `parseTable(spec.sections['interaction matrix'])` 로 행을 직접 재순회하고 `col(row, 'Result'|'Trigger'|'User Action')` 로 읽는다. (`interactionResultRoutes` 는 행 메타데이터 없는 flat `route[]` 라 그대로는 못 쓰고, **화면당 교차검증**으로만 호출 — 셀 단위 합집합이 helper 결과를 포함하지 않으면 throw 해 정규식 drift 를 막는다.)
- **라우트 추출 정규식은 `spec.mjs` 의 `interactionResultRoutes` 와 글자 단위 동일**: `/(?<![:/\w])\/(?!\/)[^\s?#]+/g` → 매칭 후 `.replace(/[),.;:]+$/, '')` → `length > 1` 필터. `cellRoutes(cellText)` 헬퍼로 분리(셀 단위). 검사 4·검사 P13 과 동작 일치.
- **필드 매핑**: `to_route` = Result 의 라우트, `trigger` = Trigger 컬럼, `action` = User Action 컬럼. **Result 가 라우트를 ≥1개 낼 때만** 그 행이 outbound 엣지가 된다. 한 셀의 여러 라우트(matchAll)는 각각 엣지.
- **목적 화면 inbound 은 생성(역색인)**: 모든 outbound 엣지 `S -> R`(trigger T)에 대해 **항상** `routes[R].inbound += {from:S, trigger:T}`. 그 다음 어떤 로드된 화면이 `fm.route === R`(EXACT 문자열 일치, validate 검사 4 `routeSet.has` 와 동일 — param 정규화 없음)이면 그 화면 D 로 해소하고, `D !== S` 이면 `screens[D].inbound += {from:S, trigger:T, route:R}`.
- **navigation-map**: `## Structure` 불릿 + `## Deep Links` 표의 Route 컬럼에서 "알려진 라우트"를 `routes[]` 레지스트리에 **시드**한다(미참조라도 등장). `## Cross-Domain Edges` 는 **읽지 않는다**(이동 엣지는 source Interaction Matrix 단일 출처 — Must-follow).
- **데이터 모델**: `screens[id] = { inbound?, outbound? }`(빈 키 OMIT), `routes[route] = { inbound: [] }`(inbound 키 항상 존재). screenId = `fm.screen_id || fm.artifact_id || basename(dirname(specPath))`(workflow-state fallback 체인). 화면 노드는 엣지 ≥1 일 때만 포함.
- **결정성(diff 안정)**: 화면 id 정렬 · 라우트 경로 정렬 · 각 inbound/outbound 를 안정 복합키로 정렬. `emitGeneratedYaml(header, obj)` + `yamlStringify({lineWidth:0})` 로 직렬화. `generated_at` 같은 휘발 필드 없음 → 재실행 byte-identical(검증함).

## 3. ignored interaction rules

Result 셀이 leading-`/` 라우트 토큰을 안 내면 정규식이 0개를 내어 **엣지를 만들지 않는다**:
- `refetch`, `status filter 변경`, `modal open`, `비밀번호 마스킹 토글`, 슬래시 경로 없는 일반 prose → 무시.
- 외부 절대 URL `http(s)://…/path`(스킴의 `/` 가 `:`/단어문자 뒤 → lookbehind 로 거부), protocol-relative `//cdn/x`(`(?!/)` 로 거부) → 무시.
- `/(tabs)/home 이동 (D-204)` 같은 셀은 공백 뒤 prose 가 탈락해 `/(tabs)/home` 만 올바르게 추출(이 fixture 엔 미사용).
- fixture 실증: HOME-001 의 `refetch` 행과 COUPON-001 의 `status filter 변경` 행은 출력 어디에도 등장하지 않음(JSON 전수 검사로 `refetch`/`status filter`/`마스킹` 부재 확인).
- stub(본문 없는 screen-spec)은 `isStub` 로 그래프 기여에서 제외.

## 4. fixture matrix

fixture: `examples/nav-graph/basic-flow/` (test-fixtures.mjs 의 명시적 fixture 목록엔 미등록 — 하니스가 자동 발견하지 않으므로 `npm test` 에 영향 없음, additive).

요구 엣지 실증:
| # | 종류 | 엣지 | fixture 근거 | 결과 |
|---|---|---|---|---|
| a | screen→screen (라우트 경유) | HOME-001 → COUPON-001 | HOME-001 IM 행 Result `/(tabs)/coupons`, COUPON-001 `route: /(tabs)/coupons` 로 해소 | `screens.COUPON-001.inbound[0] = {from: HOME-001, trigger: 보유 쿠폰 카드, route: /(tabs)/coupons}` ✓ |
| b | screen→route (동적, 미해소) | COUPON-001 → /coupons/[id] | COUPON-001 IM 행 Result `/coupons/[id]`; 어떤 화면도 그 route 아님 → route-only | `screens.COUPON-001.outbound[0] = {to_route: /coupons/[id], trigger: CouponCard press, action: 쿠폰 클릭}` + `routes["/coupons/[id]"].inbound[0] = {from: COUPON-001, trigger: CouponCard press}` ✓ |
| c | 무시되는 비-라우트 | HOME-001 `refetch`, COUPON-001 `status filter 변경` | 라우트 0개 | 출력 어디에도 없음 ✓ |

부가: nav-map Structure 의 `/(tabs)/home`(HOME-001 자신의 route, 미참조)이 `routes["/(tabs)/home"].inbound: []` 로 시드되어 "알려진 라우트가 미참조라도 등장" 규칙을 실증.

전체 생성 YAML(= expected, 752 bytes):

```yaml
# GENERATED FILE — DO NOT EDIT
# Source: domains/**/screen-spec.md Interaction Matrix + app/navigation-map.md
# Command: npm run workflow:nav-graph
screens:
  COUPON-001:
    inbound:
      - from: HOME-001
        trigger: 보유 쿠폰 카드
        route: /(tabs)/coupons
    outbound:
      - to_route: /coupons/[id]
        trigger: CouponCard press
        action: 쿠폰 클릭
  HOME-001:
    outbound:
      - to_route: /(tabs)/coupons
        trigger: 보유 쿠폰 카드
        action: 보유 쿠폰 카드 클릭
routes:
  /(tabs)/coupons:
    inbound:
      - from: HOME-001
        trigger: 보유 쿠폰 카드
  /(tabs)/home:
    inbound: []
  /coupons/[id]:
    inbound:
      - from: COUPON-001
        trigger: CouponCard press
```

## 5. commands run

(모두 `cd <worktree>/frontend-workflow-kit && …`)
- `node --check scripts/lib/nav-graph.mjs` → OK
- `node --check scripts/nav-graph.mjs` → OK
- `node scripts/nav-graph.mjs --docs examples/nav-graph/basic-flow/docs/frontend-workflow --out examples/nav-graph/basic-flow/docs/frontend-workflow/_meta/nav-graph.yaml` → `2 screen(s), 3 route(s)`
- 요구 엣지 (a)~(d) JSON 전수 검사 → ALL_REQUIRED_EDGES_PASS: true
- `_meta/nav-graph.yaml` → `expected/nav-graph.yaml` 복사 → byte-identical (752/752)
- 재실행 idempotence → expected 와 일치 (휘발 필드 없음)
- `npm test` → exit 0 (`test-fixtures — PASS (21 fixtures: 20 pass, 1 xfail, 0 fail)` + 유닛 15/15 pass)
- `npm run example:state` → exit 0 (2 screens; 기존 생성물과 byte-identical 재생성 — tracked diff 없음)
- `npm run example:readiness` → exit 0
- `npm run example:validate` → exit 0 (`OK (검사 12종 통과)`)
- `git status --short` → 신규 파일만 untracked, **tracked 파일 수정 0** (ScreenSpec·manifest·스크립트·package.json 무변경)

## 6. known limitations

- **`npm run workflow:nav-graph` 스크립트는 이 PR 에서 package.json 에 추가하지 않았다**(hard rule: package.json 수정 금지). 생성 헤더의 `# Command: npm run workflow:nav-graph` 는 정본 명령 관례를 따른 placeholder 일 뿐, **현재 실제 호출은**: `node scripts/nav-graph.mjs --docs <dir> --out <file>` (`--out` 생략 시 `<docs>/_meta/nav-graph.yaml`).
- **`catalog/artifact-manifest.yaml` 에 nav-graph 생성물 메타데이터를 추가하지 않았다.** 스키마(kind/scope/path/command/source/do_not_edit)는 기존 `workflow-state`/`screen-inventory` 항목과 정확히 맞출 수 있으나, (1) 등록 시 `command: npm run workflow:nav-graph` 가 존재하지 않는 npm 스크립트를 가리키게 되고(package.json 수정 금지와 충돌), (2) `do_not_edit: true` 등록은 validate 검사 6 이 모든 검증 docs 의 `_meta/nav-graph.yaml` 헤더를 강제하게 만들어 "additive" 범위를 넘으며, (3) FINDINGS(scopeInfo)상 nav-graph.yaml 스키마는 아직 미결(Open Decision)이다. 과제 지침의 보수적 조건("EXACTLY 매칭 가능할 때만, 아니면 그대로 두고 보고")에 따라 **그대로 두었다**.
- nav-graph.yaml 을 어느 생성물 레지스트리에도 등록하지 않았으므로 validate 검사 6(생성 헤더 무결성)·idempotency 게이트가 자동으로 이 산출물을 보호하지는 않는다(헤더 자체는 정본 형식 `GENERATED FILE — DO NOT EDIT` em-dash 로 작성됨).
- 동적 라우트(`/coupons/[id]`)는 어떤 화면 frontmatter.route 와도 EXACT 일치하지 않으면 화면으로 해소되지 않고 `routes[]` 에만 남는다(설계대로). param 정규화는 하지 않는다(검사 4 와 동일).
- fixture 는 단일 도메인-간 흐름만 다룬다(다중 라우트 셀·외부 URL 혼재·stub 화면 등은 정규식/`isStub` 재사용으로 커버되나 별도 fixture 미작성).
- nav-graph fixture 는 `test-fixtures.mjs` 의 명시적 fixture 목록에 등록하지 않아 회귀 하니스가 자동 실행하지 않는다(현재 회귀 가드는 expected==generated byte 동일성 수동 확인).

## 7. next step recommendation

1. **스키마 Open Decision 종결 후 등록**: nav-graph.yaml node/edge 스키마(현재 `screens`/`routes` 형태)를 Open Decision 으로 확정한 뒤, package.json 에 `"workflow:nav-graph": "node scripts/nav-graph.mjs"` 를 추가하고 동시에 `artifact-manifest.yaml` 에 `nav-graph` 생성물(`kind: generated`, `do_not_edit: true`, `command: npm run workflow:nav-graph`, `source: [domains/**/screen-spec.md, app/navigation-map.md]`)을 등록 → validate 검사 6 이 헤더 무결성을, idempotency 게이트가 재현성을 보호하게.
2. **회귀 하니스 통합**: `examples/nav-graph/basic-flow` 를 `test-fixtures.mjs` 의 fixture(예: 새 `kind: nav-graph` 또는 integrity 확장)로 등록해 `_meta/nav-graph.yaml` 재생성 ↔ `expected/nav-graph.yaml` byte 대조를 자동화.
3. **Entry Points 생성으로 전환(MVP-C 완성 기준)**: 별도 PR 에서 각 screen-spec 의 `<!-- GENERATED:START nav-graph -->` 블록을 이 그래프의 inbound 엣지로 채우는 in-place writer 추가(마커 밖 불변 — `stripGeneratedBlocks` 규약 준수)와 `check-generated-files` 가드(Phase 0) 결합. 기존 수동 Entry Points 주석 마이그레이션 가이드도 함께(blast-radius 위험 (c)).
4. **lib 유닛 테스트**: `cellRoutes`(검사 P13 입력 재사용)·`buildNavGraph`(해소/미해소·비-라우트 무시·정렬 결정성)에 대한 `nav-graph.test.mjs` 추가.
5. **route-tree(View 2)** 는 별도 생성기로 nav-graph 와 함께 착지(라우트 발견을 nav-graph 에 접지 말 것 — FINDINGS scopeInfo).

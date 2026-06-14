# MVP-C Generated Views Integration Check

> 날짜: 2026-06-14
> 브랜치: `feature/mvp-c-generated-views-integration` (워크트리 — `main` 무변경)
> 성격: **읽기·검증** + 범위 내 **메타데이터/패키징/문서 정리 적용**. 생성기 로직·픽스처·게이트는 **불변**.
> 범위: MVP-C Phase 1 전역 생성 뷰 2종(route-tree·nav-graph) 통합 점검. 컴포넌트 카탈로그 생성·생성기 로직 변경·게이트 승격은 **하지 않는다**.
> 방법: 4-에이전트 병렬 inspect(route-tree 검증 · nav-graph 검증 · 매니페스트 일관성 · 패키징/CI/문서) → synthesize 워크플로우. 본 문서는 그 결과 기록.

## 0. 하드룰 준수 선언

검증 단계는 **읽기 전용**(스크래치 디렉토리만 쓰고 삭제, 추적 파일 0 수정). 이후 적용 단계는 **범위 내 비보호 파일만** 편집했다:

- route-tree/nav-graph **로직 무수정**: `scripts/route-tree.mjs`·`scripts/nav-graph.mjs`·`scripts/lib/route-tree.mjs`·`scripts/lib/nav-graph.mjs` 는 **읽기만** 했다.
- warning-first 체크의 **하드 게이트 승격 0**. CI 는 미배선(§4.4).
- 생성물/픽스처/커밋 산출물(`*/_meta/*`, `examples/**`, `temp/runs/**` 픽스처) **손대지 않음**.
- 컴포넌트 카탈로그 생성 **미구현(범위 밖)**.
- `npm ci`/`npm install` 은 워크트리 부트스트랩(검증 실행용 deps) 외에는 사용 안 함.
- 적용한 편집은 모두 **메타데이터/패키징/문서**(package.json · package-scripts.template.json · catalog/artifact-manifest.yaml[메타·주석만] · CHANGELOG · roadmap · README) — 보호 대상·생성물·픽스처·게이트가 아니다.

## 1. 대상과 출처

| 뷰 | 생성기(CLI / 순수 로직) | 입력(정본) | 기본 출력 | 헤더 Command |
|---|---|---|---|---|
| route-tree | `scripts/route-tree.mjs` / `scripts/lib/route-tree.mjs`(`scanAppDir`/`renderRouteTree`/`computeRoute`) | `src/app/**`(Expo Router 파일 트리) | `docs/frontend-workflow/_meta/route-tree.txt` | `npm run workflow:route-tree` |
| nav-graph | `scripts/nav-graph.mjs` / `scripts/lib/nav-graph.mjs`(`buildNavGraph`) | `domains/**/screen-spec.md` ## Interaction Matrix + `app/navigation-map.md` | `<docs>/_meta/nav-graph.yaml` | `node scripts/nav-graph.mjs --docs docs/frontend-workflow` |

두 생성기 모두 **결정적**(타임스탬프 없음, GENERATED 헤더만)·**읽기 전용**(screen-spec/src 를 수정하지 않음). 두 생성기 다 `import.meta.url` 가드로 직접 실행 시에만 `main()` 실행(import 부작용 없음).

## 2. 검증 방법과 결과 (Task 1·2)

> 환경 주의(Windows): Bash(Git-for-Windows) 툴은 파일 쓰기를 샌드박싱해 node 가 exit 0 으로 '성공' 해도 파일이 영속되지 않고 git 이 clean 으로 남는다. 쓰기 단계는 **PowerShell 툴**(비샌드박스)로 수행해야 실제 파일이 남는다. 본 점검의 쓰기 검증은 PowerShell 기준이다.

### 2.1 route-tree — PASS

- 호출: `node scripts/route-tree.mjs --app examples/route-tree/basic-app/src/app --out <scratch>/rt.1.txt` (2회: rt.1/rt.2), 그리고 `examples/route-tree/edge-cases/src/app -> edge.1.txt`.
- exitCode = **0**.
- 멱등성: rt.1 == rt.2 **byte-identical**(타임스탬프 없음).
- 커밋 픽스처 재현: scratch == `examples/route-tree/basic-app/{expected,docs/frontend-workflow/_meta}/route-tree.txt` (SHA256 일치). edge-cases 동일.
  - basic-app SHA256: `6E7F920487D39793F385445154C43B0C56AB4C94656A946B30493E1CE4E8F29C`
  - edge-cases SHA256: `704E3EB54CD14522468A3C66C59B553BB7DFBAB42AE935F67FFDB7E2A20B0219`
- 음성 테스트: 없는 `--app` → stderr `app 디렉토리를 찾을 수 없음`, **exit 2**, 출력 파일 미생성(`isDir` 가드가 `writeFile` 전에 발동).

### 2.2 nav-graph — PASS

- 호출: `node scripts/nav-graph.mjs --docs examples/nav-graph/basic-flow/docs/frontend-workflow --out <scratch>/ng.1.yaml`(2회: ng.1/ng.2). 추가: `--json`(stdout, 파일 미기록) 및 `examples/coupon-feature/docs/frontend-workflow`.
- exitCode = **0**. stdout: `2 screen(s), 3 route(s)`.
- 멱등성: ng.1 == ng.2 **byte-identical**.
- 커밋 픽스처 재현: scratch == `examples/nav-graph/basic-flow/docs/frontend-workflow/_meta/nav-graph.yaml` == `.../expected/nav-graph.yaml`(셋 다 동일).
  - SHA256: `19d1f7ae2442bd93a8ff5672f72b239eb7ca06311d6f1588f33887c56a487914`
- `--json` 모드: 유효 JSON 을 stdout 으로 출력하고 **파일을 쓰지 않음**. coupon-feature 에서 stub-destination 해소(COUPON-002 stub 이 COUPON-001 로부터 inbound)·nav-map route 시딩((auth)/login·signup, (tabs)/* 빈 inbound) 확인.
- 참고: `examples/coupon-feature` 에는 커밋된 `_meta/nav-graph.yaml`/`expected/nav-graph.yaml` 가 **없다**(픽스처 보유 디렉토리는 `examples/nav-graph/basic-flow`·`examples/nav-graph/stub-destination`). → CI diff 절(§4.4)에서 중요.

## 3. 메타데이터 일관성 (Task 3)

`catalog/artifact-manifest.yaml` 가 두 뷰를 모두 `artifacts:` 에 등록(route-tree, nav-graph): `kind: generated`, `generated: true`, `do_not_edit: true`, 경로는 생성기 기본 출력과 **일치**.

발견(근본 원인 = Phase-0-당시 vs 현재 타임라인 갭 — Phase 0 등록 후 생성기가 나중에 머지됐는데 매니페스트 status/주석이 갱신 안 됨):

| # | 내용 | 심각도 | 범위내 수정? | 처리 |
|---|---|---|---|---|
| 1 | nav-graph `status: planned` **stale** — 생성기 존재. 계약상 `active` 여야 함. | major | 예(메타데이터) | **적용**: → active |
| 2 | route-tree `status: planned` **stale** — 생성기 존재. | major | 예(메타데이터) | **적용**: → active |
| 3 | nav-graph `command: npm run workflow:nav` 은 **3번째 비존재 형태** — package.json 에도 없고 생성기 헤더(`node scripts/nav-graph.mjs ...`)와도 불일치. | minor | 예(매니페스트 문자열) | **적용**: → `npm run workflow:nav-graph`(신규 alias 와 정렬) |
| 4 | route-tree 생성기 **출력 헤더**가 댕글링 `npm run workflow:route-tree` 하드코드(`scripts/lib/route-tree.mjs`). nav-graph 가 29a401c 에서 고친 것과 동일 문제이나 route-tree 는 미수정. | minor | **아니오**(route-tree 로직 — 하드룰 금지) | **보류**: 별도 과제(단 alias 추가로 헤더 문자열은 이제 해소됨) |
| 5 | 전용 가드 `scripts/check-generated-files.mjs` 여전히 부재 → 두 뷰 무결성은 `validate.mjs` 검사 6(매니페스트 구동, **출력 파일 존재 시에만** 헤더 검사)에만 의존. 킷 자체 docs 트리엔 두 _meta 파일이 없어 오늘은 skip(설계대로 무해). | info | 아니오(가드 구현=범위 밖) | **보류**: generated-file-guard-followup.md §3.4 |
| 6 | 매니페스트 상단 enum·섹션 주석이 아직 route-tree/nav-graph 를 '미존재/planned' 로 서술 — #1/#2 와 동일 drift. | info | 예(주석 정정) | **적용**: 주석 정정 |

가드 직교성(정상): `forbidden-paths.mjs` 는 정책(`implementation-mode-policy.yaml`) forbidden_paths 에서만 가드 표면을 도출하며 `_meta/*` 는 **비가드 설계**(path-backstop-001.md T3) — 갭이 아니라 의도. 실제 생성물 무결성 가드는 `validate.mjs` 검사 6(존재-게이트, `kind==='generated' && do_not_edit===true` 필터 — `status` 미참조이므로 planned→active 플립은 게이트 동작 불변).

## 4. 결정 (Task 4·5·6·7)

### 4.1 alias 추가 (Task 4) — **YES: `workflow:route-tree` + `workflow:nav-graph`** ✅ 적용

근거: 두 생성기 머지+검증 완료. 템플릿 `//roadmap-scripts` 계약(병합 안전성 위해 미구현 .mjs 는 parked, **구현되면 active 로 이동**)의 트리거가 이 둘에 대해 충족(나머지 `catalog-gen.mjs`·`check-generated-files.mjs` 는 여전히 부재 → parked 유지). package.json 은 보호 대상(route-tree/nav-graph 로직)이 아니고 생성물/픽스처도 아니며, 스크립트 추가는 게이트 승격이 아니다. 부수효과: route-tree 헤더의 `npm run workflow:route-tree` 가 비로소 해소된다.

- 적용: `package.json` `scripts` 의 `workflow:forbidden-paths` 뒤에 bare `node scripts/...` 형 2줄.
- 적용 후 검증: `npm run workflow:route-tree` · `npm run workflow:nav-graph` 둘 다 alias 해소 + exit 0, 커밋 골든 픽스처 SHA256 재현 일치(route-tree `6E7F9204…`, nav-graph `19D1F7AE…`). 기존 게이트도 전부 통과 — `test:spec`(15/15) · `example:validate`("검사 12종 통과") · `npm test`(21 fixtures: 20 pass/1 xfail).

### 4.2 네이밍 — **`workflow:nav-graph` 채택**(템플릿의 `workflow:nav` 정렬) ✅ 적용

근거 3가지: (a) 태스크 요청, (b) 생성기 stdout 이 이미 `workflow:nav-graph` 로 자기서술(`nav-graph.mjs`), (c) `workflow:route-tree` 와 `workflow:<view>` 패밀리 일관. 새 생성기 발명 없음 — 동일 모듈 `scripts/nav-graph.mjs`. 템플릿 parked `workflow:nav` 키는 승격 시 `workflow:nav-graph` 로 **개명**, 매니페스트 nav-graph command 도 `npm run workflow:nav-graph` 로 정렬.

### 4.3 템플릿 (Task 5) — **YES** ✅ 적용

`package-scripts.template.json` 에서 `workflow:route-tree`·(개명)`workflow:nav-graph` 를 `//roadmap-scripts` → active `scripts`(`tools/frontend-workflow/scripts/...` 접두)로 이동. `workflow:catalog`·`workflow:check-generated` 는 parked 유지. 상단 `"//"` 주석에 두 뷰(MVP-C Phase 1 읽기 전용) 추가.

### 4.4 CI (Task 6) — **NOT-YET**(단, 추가 시 반드시 warning-first) — 변경 없음

CI(`.github/workflows/frontend-workflow-kit.yml`, **레포 루트** — 킷 하위 아님; job `validate-example`, `working-directory: frontend-workflow-kit`)의 기존 멱등성 diff 게이트는 `examples/coupon-feature/docs/frontend-workflow/_meta` 만 본다. 그런데 coupon-feature 에는 nav-graph/route-tree 커밋 산출물이 **없어** bare 생성기를 거기에 돌려도 diff 대상이 없다(의미있는 검사 불가). 두 생성기는 `scripts/test-fixtures.mjs` 에도 미등록 → 기존 warning-first golden-fixture step(`example:test`, `continue-on-error: true`)도 커버 안 함. 의미있는 warning-first 배선은 **신규 표면**(전용 example:* 스크립트+diff step, 또는 test-fixtures 픽스처 종류 등록)을 요구 — '새 기능 금지' 범위 밖.

→ 결론: 지금은 **미배선**. 선행 과제 = `test-fixtures.mjs` 에 두 뷰 픽스처 등록. 그러면 기존 warning-first `example:test` step 이 **새 CI step 없이** 자동 커버(precedent 정렬). 어떤 경우에도 하드 게이트 승격 없음.

### 4.5 문서 (Task 7) — README·roadmap·CHANGELOG 모두 갱신(최소·정확) ✅ 적용

머지+검증된 사실만 반영. 두 뷰는 Phase-1 **읽기 전용**(게이트 아님)임을 명시.
- README: 명령 절에 **읽기 전용** 표식의 명령 2줄(게이트 명령과 분리, 같은 fenced block 내 별도 주석).
- roadmap: L20 '여전히 제안' 에서 route-tree/nav 제거, 'MVP-C Phase 1' 절 신설, next-candidate item 2 를 잔여(component-catalog/check-generated)로 축소.
- CHANGELOG: **단일** 신규 dated 섹션 `0.3.0-mvp-c-phase1`(중복 회피) — 생성기 landed + alias 승격 + 매니페스트 status/command 정정 + 본 run 문서 포인터. 버전 문자열은 잠정(§6 열린 후속 #1).

## 5. 적용 vs 보류

**적용 완료(본 브랜치 `feature/mvp-c-generated-views-integration`)**:
- `package.json` — alias 2(`workflow:route-tree`·`workflow:nav-graph`).
- `package-scripts.template.json` — 승격+개명(`workflow:nav`→`workflow:nav-graph`), `"//"` 주석 동기화.
- `catalog/artifact-manifest.yaml` — status planned→active ×2, nav-graph command 정렬, stale 주석/섹션 헤더 정정(메타데이터 전용).
- `CHANGELOG.md` — 단일 `0.3.0-mvp-c-phase1` 항목.
- `roadmap-current.md` — 제안→landed(MVP-C Phase 1 절 신설 + next-candidate 축소).
- `README.md` — 읽기 전용 명령 블록.
- 본 문서 생성.

**보류/범위 밖**:
- route-tree 출력 헤더 댕글링 명령(`scripts/lib/route-tree.mjs`) — route-tree 로직 수정이라 하드룰 금지. 별도 과제(nav-graph 처럼 `node scripts/...` 형 통일).
- `scripts/check-generated-files.mjs` 가드 구현 — 범위 밖(generated-file-guard-followup.md §3.4).
- `test-fixtures.mjs` 에 두 뷰 픽스처 등록 — 신규 하니스 표면('새 기능 금지'). 단 CI warning-first 의 선행 과제로 권고.
- CI step 추가 — §4.4 NOT-YET.
- 컴포넌트 카탈로그 생성 — 범위 밖.

## 6. 열린 후속(사람 판단 필요)

1. CHANGELOG 버전 문자열 `0.3.0-mvp-c-phase1` 의 적정성(릴리스 시맨틱). 기존 패턴(`0.1.0-mvp-a` → `0.2.0-mvp-b-rc1`)을 따른 보수적 연속이지만 minor bump 여부는 사람 결정. 대안: `0.2.x-mvp-c-phase1` 또는 날짜만. (현재 잠정 표기.)
2. route-tree 헤더 댕글링 명령 통일을 별도 PR 로 진행할지(권고).
3. CI warning-first 배선의 선행 = `test-fixtures.mjs` 에 두 뷰 등록을 다음 슬롯으로 채택할지.
4. README 에 두 뷰의 '문서 지도' 표 행을 추가할지(현재는 게이트 오인 방지 위해 명령 블록만 적용).

## 7. 워크트리 상태

- 검증 단계: `git status --porcelain` 시작=끝 **EMPTY**(읽기 전용). 검증 스크래치 삭제됨.
- 적용 단계: §5 의 7개 파일이 본 브랜치에서 수정/생성됨 — 의도된 통합 산출물. 생성기 로직·픽스처·`_meta`·게이트는 불변(diff 없음).
- `main` 워크트리는 처음부터 끝까지 무변경.

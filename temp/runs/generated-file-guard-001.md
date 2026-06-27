# Run report — generated file guard / artifact-manifest hardening (MVP-C Phase 0)

- **Run id:** generated-file-guard-001
- **Date:** 2026-06-14
- **Branch / worktree:** `feature/mvp-c-phase0-generated-guard` @ `k-frontend-workflow-mvpc-phase0` (main 미변경)
- **Base:** main `f7e1e72` (PR #19 머지본)
- **세션 산출물(allowed files):**
  - `frontend-workflow-kit/catalog/artifact-manifest.yaml` (수정)
  - `frontend-workflow-kit/temp/proposals/generated-file-guard-followup.md` (신규)
  - `temp/runs/generated-file-guard-001.md` (이 파일)
- **참고:** [mvp-c-generated-views-scope.md](../proposals/mvp-c-generated-views-scope.md) · [generated-file-guard-followup.md](../../kit-dev/temp/proposals/generated-file-guard-followup.md) · [artifact-manifest.yaml](../../frontend-workflow-kit/catalog/artifact-manifest.yaml)

## 1. artifact-manifest 변경

생성물(`kind: generated`) 계약을 **일관화**하고, 아직 생성기가 없는 **planned 산출물을 등록**했다.
구현(생성기/스크립트)은 추가하지 않았다.

1. **헤더 주석에 Phase 0 하드닝 노트 추가** — 생성물 필드 계약·planned 표기 규칙·가드 문서 링크.
2. **공통 필드 계약 도입** — 모든 generated 엔트리에 일관 적용:
   `kind / generated: true / do_not_edit / source / command / path / status / mvp`.
   - `generated: true` 를 3개 기존 엔트리(screen-inventory·workflow-state·component-catalog)에 추가.
   - `status: active|planned` 필드 신설(기존엔 없던 규약). 활성 생성기=active, 미존재 생성기=planned.
   - `mvp:` 단계 태그를 모든 generated 엔트리에 부여(A/B/C).
3. **planned 산출물 신규 등록(구현 아님):**
   - `route-tree` (MVP-C, View 2) — `_meta/route-tree.txt`, `do_not_edit: true`, `status: planned`.
   - `nav-graph` (MVP-C, View 1) — `_meta/nav-graph.yaml`, `do_not_edit: true`, `status: planned`.
     (각 screen-spec 의 Entry Points in-file 블록 계약은 기존 `screen-spec.generated_sections` 에 이미
     있으므로 중복 등록하지 않고, whole-file `_meta/nav-graph.yaml` 만 등록.)
   - `eslint-workflow-config` (**MVP-B**, lint-pack) — `eslint.workflow.config.mjs`, `status: planned`.
     레지스트리 완전성을 위해 등록만. (Goal 의 "generated files include" 목록에 포함된 파일.)
4. **component-catalog 의 정직성 유지** — `do_not_edit: false` 그대로 두고 `status: planned` 부여.
   생성기(catalog-gen)는 planned, 수동 작성본은 현재 허용. **do_not_edit 을 true 로 올리지 않았다**
   (그러면 생성기가 있는 것처럼 보임 — hard rule 위반).

> 변경하지 않은 것: `validate.mjs`, `workflow-state.mjs`, `package.json`, templates/schemas/policies,
> CI, release 문서, 기존 example 산출물. (§5 가드레일)

## 2. generated artifacts 표

| key | path | do_not_edit | status | mvp | command | generator script | 산출 파일 |
|---|---|---|---|---|---|---|---|
| screen-inventory | `docs/frontend-workflow/_meta/screen-inventory.yaml` | `true` | **active** | A | `npm run workflow:state` | `workflow-state.mjs` ✅ | 있음(예제) |
| workflow-state | `docs/frontend-workflow/_meta/workflow-state.yaml` | `true` | **active** | A | `npm run workflow:state` | `workflow-state.mjs` ✅ | 있음(예제) |
| component-catalog | `docs/frontend-workflow/design/component-catalog.md` | `false` | **planned** | C | `npm run workflow:catalog` | `catalog-gen.mjs` ❌ | 있음(수동, 예제) |
| route-tree | `docs/frontend-workflow/_meta/route-tree.txt` | `true` | **planned** | C | `npm run workflow:route-tree` | `route-tree.mjs` ❌ | 없음 |
| nav-graph | `docs/frontend-workflow/_meta/nav-graph.yaml` | `true` | **planned** | C | `npm run workflow:nav` | `nav-graph.mjs` ❌ | 없음 |
| eslint-workflow-config | `eslint.workflow.config.mjs` | `true` | **planned** | B | `npm run workflow:lint-gen` | `lint-gen.mjs` ❌ | 없음 |

생성 파일 헤더 정본(생성기가 emit 해야 하는 형태, impl §3 / 실제 `workflow-state.mjs` 출력):
- YAML/JS: `# GENERATED FILE — DO NOT EDIT` (em-dash) + `# Source:` + `# Command:`
- Markdown: `<!-- ... GENERATED FILE — DO NOT EDIT ... -->`

## 3. missing commands (스크립트 미존재)

| 명령 | 스크립트 | 단계 | 상태 |
|---|---|---|---|
| `npm run workflow:state` | `scripts/workflow-state.mjs` | A | ✅ 존재(active) |
| `npm run workflow:catalog` | `scripts/catalog-gen.mjs` | C | ❌ 미존재 |
| `npm run workflow:route-tree` | `scripts/route-tree.mjs` | C | ❌ 미존재 |
| `npm run workflow:nav` | `scripts/nav-graph.mjs` | C | ❌ 미존재 |
| `npm run workflow:check-generated` | `scripts/check-generated-files.mjs` | C | ❌ 미존재 (가드 자체 — 산출물 생성기 아님) |
| `npm run workflow:lint-gen` | `scripts/lint-gen.mjs` | B | ❌ 미존재 |

- 이 planned 명령들은 `package-scripts.template.json` 의 `//roadmap-scripts` 격리 블록에만 존재한다
  (실행 가능한 `scripts` 블록 아님). **이 세션에서 옮기지 않았다**(hard rule: package.json 불변).
- 매니페스트는 명령을 **문자열로만** 들고 있고 validate 는 이를 **읽지도 실행하지도 않는다** → 무해.

## 4. validate 지원 상태

- **이미 generated 시맨틱을 지원한다.** 검사 6 = 섹션 마커 검사(screen-spec, `validate.mjs:239–258`, 코드 라벨 `6b`) + 헤더 검사(생성 파일 전체, `validate.mjs:432–443`, 코드 라벨 `6`).
- **변경 없음 / 변경 불필요.** do_not_edit:true 인데 파일이 아직 없는 planned 엔트리(route-tree·
  nav-graph·eslint)는 헤더 검사의 존재 가드 `if (!exists(full)) continue;`(`validate.mjs:438`)로
  건너뛴다. component-catalog 은 status:planned 이지만 do_not_edit:false 라 그 앞 필터
  (`validate.mjs:434`)에서 먼저 제외된다(존재 가드 이전). 또 매니페스트 스키마 검증이 없어 신규 필드
  (`generated`,`status`)는 무시되고, `command`/`source` 는 미독취·미실행.
- **증거 (편집된 매니페스트에 대해 실제 실행):**
  ```
  $ npm run example:validate    # node scripts/validate.mjs --docs examples/coupon-feature/... --src ...
  workflow:validate — OK (검사 12종 통과)
  EXIT=0
  ```
  (worktree 에 `node_modules` 정션 연결 후 실행. 정션은 gitignore 됨 — git status 무영향.)
- **알려진 가드 공백(향후 `check-generated-files.mjs` 몫, 후속 제안 §3 에 상술):**
  1. **본문 직접 편집 미탐지** — 헤더가 멀쩡하면 헤더 검사 통과. diff/훅 없이는 못 잡음.
  2. **섹션 마커 스캔이 screen-spec 전용** — 마커 검사가 `'screen-spec'` 키 하드코딩(`validate.mjs:241–242`).
  3. **루트 경로 미해소** — 헤더 검사 경로 매핑이 `docs/frontend-workflow/` 접두 가정(`validate.mjs:436`)이라
     루트 파일 `eslint.workflow.config.mjs` 를 영원히 건너뜀.

## 5. risks

- **`generated: true` 중복.** `kind: generated` 와 의미가 겹친다. 가드 셀렉터로 채택할지(`generated===true`)
  `kind` 만 쓸지 **결정 필요**(후속 제안 §4). 이 세션은 하드닝 스펙대로 추가만 했다.
- **`status` 는 신규 규약 — 아직 코드가 읽지 않는다.** 가드/CI 가 도입되기 전까진 **문서 수준 계약**.
- **eslint 루트 경로 잠복 이슈.** 현행 헤더 검사(:432–443)가 못 해소(위 §4-3). 지금은 파일이 없어 무해하나, 생성 시
  가드 수정 전까진 미보호. 후속 제안 §3.1 에 수정안.
- **MVP-B 항목을 MVP-C 세션에 등록.** `eslint-workflow-config` 는 lint-pack(B) 소속. Goal 의 generated
  목록에 들어 레지스트리 완전성 차원에서 등록했고 `mvp: B`·`status: planned` 로 명시 — 분리/되돌리기 쉽다.
- **planned 의 `do_not_edit: true`.** route-tree/nav-graph 를 누군가 헤더 없이 수동 stub 하면 파일 생성
  순간 헤더 검사가 실패한다 — **의도된 동작**(헤더 강제)이나 인지 필요.

## 6. next steps

1. **`generated: true` vs `kind`-only 셀렉터** 결정 → 가드와 매니페스트 일치.
2. **`check-generated-files.mjs` 설계 구현**(MVP-C, 후속 제안 §3): 헤더 검사 일반화(루트 경로 수정) +
   `generated_sections` 데이터 주도 블록 검사 + **첫 생성기(catalog-gen)와 함께** diff 멱등성 게이트.
3. **catalog-gen 착수 시**: component-catalog `do_not_edit: false→true`, `status: planned→active`.
4. **Open Decision 닫기**: route-tree 출력 포맷(.txt vs .yaml), nav-graph 노드/엣지 스키마.
5. **eslint 등록 범위 확인**: MVP-C 레지스트리에 유지할지 MVP-B 로 분리할지(현재 `mvp: B` 로 표기).

---
### Hard rules 준수 확인
- [x] route-tree / nav-graph / component-catalog **생성 미구현** (매니페스트 등록만).
- [x] `package.json` 미변경 · CI 미변경 · release 문서 미변경.
- [x] planned 산출물을 구현된 것처럼 표기하지 않음(`status: planned`, do_not_edit 미승격, 명령 "미존재" 명시).
- [x] validate 는 generated 시맨틱을 이미 지원 → **건드리지 않음**(example:validate exit 0 으로 확인).

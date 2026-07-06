# Changelog

킷 자체의 버전 관리 (템플릿/스크립트 계약 추적용).

## Unreleased

### Added
- **multi-screen visual reconciliation / consistency foundation**: 여러 화면에 걸친 visual/Figma/design batch update 에서 공통 shell/logo/header/CTA/layout ownership 이 화면별 ad-hoc patch 로 흩어지는 drift 를 warning-first 로 다루는 층. 새 workflow stage/artifact axis 없음 — 기존 spine(Stage 03/04/05/06/08) 과 authoring 축에 흡수.
  - artifact/template: `visual-consistency-contract`(authoring, `design/visual-consistency-contract.md`, `templates/design/visual-consistency-contract.template.md`) — screen family·shared component ownership·visual exception 을 **참조 중심**으로 정리하는 정합성 계약. route/screen identity·behavior 의 단일 출처가 아니며 confirmed 승격은 사람만. manifest 등록(readiness fact 아님·게이트 아님).
  - scripts: `workflow:visual-consistency`(`scripts/visual-consistency.mjs` + `lib/visual-consistency.mjs`) — contract ↔ ScreenSpec ↔ figma-component-mapping ↔ component-catalog ↔ (선택 `--src`) screen_entry 소스 대조. 검사: screen-not-found · figma-mapping-missing · component-gap-candidate(제안만) · direct-screen-import · adhoc-positioning(휴리스틱) · exception-hygiene · hardcoded-copy-candidate(info). contract 부재 = 조용히 skip(cold start 무차단), warning 은 exit 0, 구조 오류(docs 부재·malformed contract)만 exit 1, `--enforce` 는 opt-in(비-CI). deterministic `--json`/`--out` 지원.
  - skill: `skills/visual-reconcile` — multi-screen visual 입력을 Stage 03/04 계약(canonical input + register-first) 위에서 분류하고, shared ownership 변경을 contract/Component Gap/Open Decision 으로 올린 뒤 implement-screen(readiness allowed_paths)으로 handoff. behavior 는 ScreenSpec/Navigation Map/Open Decision 경로 유지, e2e visual capture 는 advisory Stage 08 evidence 그대로.
  - docs: `docs/reference/visual-reconciliation.md`(canonical home) + doc-ownership 행 + task-artifact-matrix(visual/Figma·reconcile·implement·shared component·regenerate 행 보강) + input-reconciliation §Visual/Figma cross-link + COMMANDS/README 절 + implement-screen/e2e-agent 경량 링크.
  - examples/tests: `examples/visual-reconciliation/auth-family` 골든 픽스처(통과 화면 1 + 경고 화면 1) + `lib/visual-consistency.test.mjs`(27 tests: fail-soft·검사별·필터·JSON 결정성·CLI exit) + distribution/pack 테스트 확장. hard gate/CI/required check/`--enforce` 승격 없음 — dogfood telemetry 후 별도 Open Decision 으로만 검토(설계: `kit-dev/temp/proposals/visual-reconciliation-consistency.md`).
- **check 4 route group false-positive 축소 + nav-graph route group resolution** (#129/#131): validate 검사 4(route ↔ src 존재)와 nav-graph 생성기가 route group 세그먼트(`(group)`)를 실제 경로에서 제외하도록 정렬 — 그룹 폴더를 route token 으로 오인해 내던 오탐을 줄인다. 게이트 동작 자체는 그대로(warning/exit 계약 불변), 매칭 정밀도만 개선.
- **no-api-required 화면 지원** (#123/#126): API 계약이 필요 없는 화면을 first-class 로 표기하고, no-api readiness 경로와 API backstop 게이트가 그 선언을 존중하도록 처리. no-api readiness 의 편집 경로(`allowed_paths`)를 제한해 API 레이어로 새지 않게 한다.
- **e2e-agent 스킬 (선택형 web E2E evidence)** (#112~#128/#130): `skills/e2e-agent` — plan/generate/verify/heal 모드 + Playwright agents MCP setup + path/session model + consumer adoption guide + behavioral rules(folder-per-screen 패키징) + visual capture 모드(#128) 및 plan-mode visual capture 후보(#130). `tests/web-plans/**`·`tests/web/**` 는 ScreenSpec/readiness 게이트가 아니며 green test 가 confirmed 승격·제품 승인·CI hard gate 를 뜻하지 않는다(Stage 08 evidence). 정본: `docs/reference/e2e-playwright-agents.md`·`e2e-behavioral-rules.md`·`e2e-consumer-adoption.md`.
- **session-learnings capture surface** (#110): consumer repo 가 세션 중 얻은 학습을 기록하는 표면 추가(scope 예시 + test pin). 게이트 동작 변경 없음.
- **safe vendored-kit upgrade planner** (#108): `scripts/upgrade-vendored-kit.mjs`(+`lib/upgrade-planner.mjs`) — packed payload 의 `.kit-payload-manifest.json`(파일별 sha256·classification) 기준 manifest-based 안전 업그레이드. 로컬 수정/ stale / upstream 삭제 파일을 구분해 safe-update·mode-update·new-file 만 자동 적용하고, conflict 는 `.upgrade-conflicts/<path>.incoming` 으로 남기며 orphan 은 `--prune` 없이는 보존한다. symlink 타깃 거부·`..` 경로 traversal 거부·`tools/frontend-workflow/` 밖 미터치로 consumer 밖 덮어쓰기를 차단. mode-only payload 업데이트(chmod)도 처리(#123 follow-up).
- **progressive-disclosure 문서 리팩터** (#109): skills + consumer 문서를 compact trigger+procedure(스킬) / 상세 계약(reference) 레이어로 분리. safety assertion 강화. `doc-ownership.md` 가 "one fact, one home" 지도.
- **grouped / domain·topic-aware input artifact directories** (#107): `inputs/` 를 domain/topic 하위로 그룹핑 가능하게 하고 README/index 파일은 walk 에서 무시. subdir strictness + migration 노트.
- **Tier3 custom-layer substrate + readiness access wiring** (#85/#87/#88): `project-layout.yaml` 로 Tier3/custom layer 를 선언하고 layer telemetry·domain layer access 를 readiness 로 합성(코드 강제 승격 없음, 진단 substrate).
- **Tier3 policy-draft 생성기** (#89): `scripts/policy-draft.mjs` — live policy 교체가 아니라 draft/review artifact 로 policy 변경을 다룬다. missing policy 파일에 fail-closed, generated path provenance·literal guard 보존.
- **adoption-probe (draft-only 온보딩 진단)** (#86/#91): `scripts/adoption-probe.mjs` — brownfield repo 를 draft/report 로만 진단(custom source root·flattened role·domain root 매칭). 게이트 아님.
- **generic input artifact producer + interaction matrix route extraction 하드닝** (#96/#97): `workflow:create-input` 계열 id/flag 검증 강화(duplicate id·valued boolean flag·unknown flag 거부), Interaction Matrix route 추출이 src 파일 경로·확장자성 토큰·route group·home 링크를 오인하지 않도록 정밀화.
- **adoption-compatible contracts / screen entries** (#94): 도입 초기 repo 의 contract evidence·screen entry 를 수용하되 symlink 로 프로젝트 밖 source 를 링크하는 것은 거부(Source 확장자 guard 보존).
- **Workflow spine stage guides**: consumer-agent routing layer over the existing workflow. `docs/reference/workflow-spine.md`(numbered index 00–10 + stage table + start-midstream/skip-earlier guidance + kit-vs-consumer ownership map) 와 `docs/reference/workflow-stages/00-start-here.md` … `10-policy-layout-tier3-changes.md`. 미드세션 진입 agent 가 현재 stage 식별 → 건너뛸 이전 stage 판단 → 읽을 stage doc 1개 → 작업 후 할 일 → kit-owned vs consumer-owned 경계를 빠르게 답하게 한다. 화면 식별(PR #105)을 first-class **Stage 02** 로 편입 — 새/미매핑 화면은 authoring/reconcile 전에 identity 를 푼다.
  - 설계 계약: **Stage 01**(source-specific input production)은 consumer-owned 커스터마이즈 템플릿(킷은 raw Figma/기획/API/QA/내부 export 를 파싱하지 않음, normalized handoff 만 기대). **Stage 03**(create canonical input artifact)은 kit-owned 이지만 wrapper-friendly("default implementation + safe extension points" — consumer producer 가 `workflow:create-input` 을 wrap 하거나, 같은 canonical input artifact 계약을 만족할 때만 직접 작성).
  - 연결: `templates/repo/AGENTS.template.md`(spine-first Start Here)·`README.md`(역할 구분)·`docs/reference/task-artifact-matrix.md`(새 "Stage Reference" 섹션 + intro)·`screen-identity.md`(Stage 02)·`input-reconciliation.md`(Stage 03/04)·`generated-files.md`(Stage 07)·`skills/reconcile-input`·`skills/implement-screen` 가 spine stage 로 cross-link. distribution: manifest `docs/reference/**` glob 로 자동 포함, packed-payload 테스트 확장.
  - tests: `lib/distribution.test.mjs` — spine/stage docs pack 포함, spine↔stage 링크, AGENTS spine-first 라우팅, matrix stage-number 참조, Stage 01/03 consumer-customization·Stage 02 screen-identity/create-screen 참조, 새 docs 의 상대 링크 무결성(no broken links). 런타임/게이트 동작 변경 없음(docs/distribution 전용).
- **Screen identity / source mapping**: source 화면 코드(planning `A-001`·design `J010`·Figma node id·slug)를 canonical workflow Screen ID 로 잇는 first-class 흐름. 핵심 원칙 — external source ids 는 alias/evidence 이고 canonical identity(`screen_id`/`route`/`domain`/screen-spec 경로)는 워크플로우가 소유한다.
  - templates: `templates/meta/screen-source-map.template.md` — Screen Source Map meta-register(canonical ↔ source alias 표 + `candidate`/`confirmed`/`ambiguous`/`split`/`merged`/`deprecated` status). reconciliation-register 처럼 `_meta/` 에 두며 validate authoring 검사에서 제외.
  - docs: `docs/reference/screen-identity.md` — canonical vs source alias 계약 + 5개 예시(코드 drift·node-only·중복·split·rename).
  - scripts: `create-screen.mjs`(+`lib/screen-scaffold.mjs`) — generic `workflow:create-screen` stub scaffolder. 필수 domain/screen_id/route, screen_id 유일성 강제, route 중복 경고, overwrite 기본 거부, STUB 모드(`--frontmatter-only`), next-steps 출력. screen-slug 형식 검증(path traversal 차단)·`--date` YYYY-MM-DD 검증. canonical id 발명·navigation-map 수정·Open Decision resolve·confirmed 승격을 하지 않는다. `package.json` bin/scripts + `package-scripts.template.json` 소비 alias 추가.
  - doctor: `lib/screen-source-map.mjs` warning-first 진단(canonical 에 ScreenSpec 부재·map↔spec route 불일치·split/ambiguous 없는 중복 alias·input `affected_screens` 가 알려진 alias(`input-alias`)인지 미지 raw(`input-unmapped`)인지 구분). `deprecated` 만 ScreenSpec 부재 면제(`merged` 는 현재 화면이라 필요). map 부재 시 NO-OP — cold-start 무차단.
  - reconcile-input/producer: SKILL·`input-reconciliation.md` 에 미매핑/새 화면 처리(scope-unclear·Open Decision·`create-screen`) 추가. source-specific producer 는 canonical id 를 발명하지 않고 optional `source_screen_refs`(body `## Source Screen Refs`, frontmatter 불변)로 alias evidence 를 싣는다.
  - spine/AGENTS: README·CONVENTIONS·task-artifact-matrix(새 4행)·AGENTS·llm-rules 템플릿이 새-화면 세션을 screen identity stage 로 라우팅. schema `artifact_type` enum 에 `screen-source-map` 추가.

### Changed
- **Breaking ScreenSpec contract**: State Matrix canonical mandatory states are now `loading / empty / error / success / disabled / refreshing`. Existing ScreenSpecs that only declare the old five states (`loading / success / empty / error / refreshing`) now report `state_matrix_complete=false` until they add a distinct `disabled` interactivity row.
- templates/readiness/examples: `screen-spec.template.md`, readiness next-action text, active examples, and expected readiness snapshots now use the 6-state order above. Treat `disabled` as an interactivity state, not a loading subcase.
- **catalog kebab-case component filenames** (#93): `catalog-gen` 이 kebab-case 컴포넌트 파일명을 지원하도록 확장.
- **dev/design/history 문서 repo-root 이관** (#101/#103): kit dev tooling·design/history/roadmap/run-report 문서를 소비 payload 에서 제외하고 repo-root `kit-dev/` 로 옮김. payload hygiene — 소비 repo 에는 runtime/reference surface 만 vendor.

## 0.3.0-mvp-c-phase1 — 2026-06-14

MVP-C Phase 1: 전역 생성 뷰 2종(route-tree·nav-graph) **읽기 전용** 생성기 통합. 새 게이트 없음 — 생성기는 src/app 트리·screen-spec/navigation-map 을 읽어 `_meta` 산출물을 만들 뿐 screen-spec 을 수정하지 않는다. `0.3.0-mvp-c-phase1` 은 정식 git 태그/릴리스가 아니라 MVP-C Phase 1 통합 마일스톤 라벨이다.

### Added
- scripts: `route-tree.mjs`(+`lib/route-tree.mjs`) · `nav-graph.mjs`(+`lib/nav-graph.mjs`) — 결정적·멱등 생성기. 커밋된 골든 픽스처(`examples/route-tree/{basic-app,edge-cases}`, `examples/nav-graph/basic-flow`)를 byte-identical 재현(검증 증거: `temp/runs/mvp-c-generated-views-integration.md`).
- scripts(`package.json`): `workflow:route-tree`·`workflow:nav-graph` alias 승격(대상 .mjs 존재·동작 확인 후). `package-scripts.template.json` 도 동기화(`//roadmap-scripts` → active `scripts`; 파킹돼 있던 `workflow:nav` → `workflow:nav-graph` 로 정렬).

### Changed
- `catalog/artifact-manifest.yaml`: route-tree·nav-graph `status: planned → active`(생성기 존재). nav-graph `command` 을 실제 동작 alias `npm run workflow:nav-graph` 로 정렬(이전 `npm run workflow:nav` 은 package.json·생성기 헤더 어디에도 없던 명령). stale '미존재' 주석 정정. **메타데이터 전용** — 생성기 로직·픽스처·게이트 불변.
- README/roadmap: route-tree·nav-graph 를 '제안(승격 금지)' 에서 'Phase 1 구현(읽기 전용)' 으로 정정.

### Notes
- **CI 미배선(의도)**: route-tree/nav-graph 는 아직 CI 에서 돌리지 않는다. 기존 멱등성 diff 게이트는 coupon-feature `_meta` 만 보는데 거기엔 두 뷰의 커밋 산출물이 없어 의미있는 diff 가 불가하고, 두 생성기는 `test-fixtures.mjs` 에도 미등록이다. 선행 과제 = `test-fixtures.mjs` 에 두 뷰 픽스처 등록 → 그러면 기존 warning-first golden-fixture CI step(`example:test`, `continue-on-error`)이 새 step 없이 자동 커버. 어떤 경우에도 warning-first 만, 하드 게이트 승격 없음.
- route-tree 생성기 출력 헤더가 여전히 `# Command: npm run workflow:route-tree` 를 하드코드(`scripts/lib/route-tree.mjs`) — 이제 npm alias 가 생겨 해소되나, nav-graph(29a401c)처럼 `node scripts/...` 형으로 통일하는 헤더 변경은 route-tree 로직 수정이라 별도 과제로 분리.

## 0.2.0-mvp-b-rc1 — 2026-06-14

MVP-B 릴리스 후보(rc1): **킷 런타임 코드 변경 0** — 외부 소비 프로젝트 도그푸드로 킷을 end-to-end 실증하고 그 증거를 고정한 뒤 문서를 정합한 **릴리스 준비** 마일스톤. 게이트 동작은 `0.2.0-mvp-b-phase0` 그대로(불변) — 기능 추가가 아니라 검증·증거·문서 정합이다.

### Added
- evidence: `temp/runs/consumer-dogfood-001/` — **킷 레포 밖** fresh Expo(sdk-56) 소비 프로젝트에서 `state → readiness → Work Packet → implement-screen → validate → forbidden-paths` 전 구간을 게이트 천장 안에서 완주한 실측 증거. `run-report.md` + `evidence/*`(생성된 `_meta/*.yaml` · `readiness.json` · `validate.txt` · `forbidden-paths-clean/subcheck.txt` · diff · `environment.txt`). 소비 프로젝트 자체는 ephemeral — 이 스냅샷이 정본 증거다. (PR #17)
- docs: `temp/runs/release-mvp-b-final-check.md` — MVP-B 릴리스 최종 체크리스트(PR #17 반영 · dogfood verdict · hard/warning-first 게이트 인벤토리 · docs/scripts/CI 정합성 · known limitations · 태그 권고/명령).

### Verified (consumer-dogfood-001)
- **게이트가 설계대로 동작**: `screen-skeleton`(HOME-001) **정상 진행** → 화면 shell 1파일, `validate` exit 0("검사 12종 통과"). `docs-only`(PROFILE-001, Open Decision `D-301` open) **거절이 정답** → `src` 변경 0(빈 diff).
- **forbidden-paths warning-first 확인**: 정상 diff = `OK ... exit 0`; 의도적 `src/api/dummy.ts` 위반(커밋 후) = `1 건 위반(경고)` 이지만 `--enforce` 없이 **exit 0**(이후 폐기). 경계 검증은 validate 가 아니라 diff 가 본다.
- **하드룰 준수**: 킷 레포 무수정(vendored copy 만) · API endpoint 발명 0 · Open Decision/Conflict 미닫힘(D-301 open 유지) · 변경 ⊆ allowed_paths · 멱등(`workflow:state` 재실행 byte-identical).
- **전이 유효성(transfer validity)**: 도그푸드가 실제로 돌린 런타임 스크립트(`workflow-state`·`readiness`·`validate`·`forbidden-paths` + 의존 lib)는 증거 소스 커밋 `4601347`↔`6bbe8bd` 사이 **byte-identical**. 그 구간의 유일한 런타임 변경은 도그푸드가 호출하지 않은 내부 회귀 하니스(`test-fixtures.mjs`·`lib/test-fixture.mjs`)의 **가산적** path-backstop fixture 종류뿐(커밋 `04773eb`) — 증거는 이 릴리스에 그대로 전이된다.

### Changed (문서 정합 — 코드 강제 0)
- README: 외부 consumer dogfood end-to-end 완주 사실을 경로-가정 노트에 1줄 추가(기존 MVP-A path-가정 dry-run 과 구분). 문서 지도 Work Packet 행의 "킷 미포함" 라벨 정정 — `templates/work-packet/*.template.md` 는 킷에 포함(여전히 코드 강제 0, Future Candidate).
- roadmap-current.md: 스냅샷·Phase 0 헤더에 consumer-dogfood-001 외부 검증(PR #17, 완료) 명시. "다음 구현 후보"를 ① API Candidates↔스키마 매칭(검사 8 강화 · PR #16 옵션 C 선결) ② MVP-C generated views(#13) ③ Interaction Matrix 구조화 ④ lint-pack/adapt-lint-pack 로 재정렬.
- docs/workflows/mvp-b.md: **내부 픽스처 검증**(`test-fixtures`/`example:test`, 킷 *안*) ↔ **외부 소비 dogfood**(consumer-dogfood-001, 킷 *밖*) 두 갈래를 구분하는 노트 추가(run-report 링크).
- ci: golden example 워크플로 주석의 stale "검사 9종" → "검사 12종" 동기화 — **주석 전용**(게이트 로직·warning-first 배선 불변, 하드 게이트 승격 없음).

### Notes
- `test-fixtures`(golden fixture)·`forbidden-paths` 는 CI 에서 **warning-first** 유지(`0.2.0-mvp-b-phase0` 의 `continue-on-error`/`--enforce` opt-in 계약 불변). 하드 gating 승격은 별도 PR(후속).
- **rc(릴리스 후보)인 이유**: test-fixtures/forbidden-paths 하드 게이팅 미승격 + 잔여 known limitations(reconcile-input 킷 vendor 전, forbidden-paths `--root` 호출 위치, Windows CRLF, forbidden-paths 전용 CI step 부재). 상세·go/no-go 는 `temp/runs/release-mvp-b-final-check.md`.
- 증거 run 의 킷 소스 커밋은 `4601347`(origin/main) — `run-report.md`/`environment.txt` 참조.

## 0.2.0-mvp-b-phase0 — 2026-06-14

MVP-B Phase 0: 회귀 하니스 + 경로 backstop + 입력/register 검증 (lanes A/B/C 통합). 대부분 warning-first — 기본 CI exit code 불변.

### Added
- scripts: `test-fixtures.mjs` (+ `lib/test-fixture.mjs`) — golden fixture 비교 하니스(MVP-B Phase 0). `reconcile`(raise-only 불변식) + integrity 검사. exit `0`/`1`/`2`, xfail witness(올바른 이유로 실패할 때만 증거 인정). (Lane A)
- scripts: `forbidden-paths.mjs` (+ `lib/path-backstop.mjs`) — diff 기반 `forbidden_paths` backstop(2차 방어선). warning-first(기본 exit `0`, `--enforce` 시 위반은 exit `1`). `examples/path-backstop/` 픽스처 동반. (Lane B)
- validate: 검사 11(입력 결과물 `inputs/*.md` frontmatter)·검사 12(Reconciliation Register) 추가 (+ `lib/input-artifact.mjs`, `lib/reconciliation-register.mjs`). 구조 검사=하드(exit `1`), 미처리(Reconcile Status `in-progress`/`failed`) 감지=warning-first(`--enforce` 로 하드). (Lane C)
- templates: `work-packet/{work-packet,run-report,review-artifact}.template.md` — 설계/문서 템플릿(코드 강제 0, 여전히 Future Candidate).
- docs: `docs/workflows/mvp-b.md` — MVP-B Phase 0 통합 노트.
- ci/wiring: kit `example:test` alias + golden fixture CI step(`continue-on-error` = **warning-only**, 비차단); `workflow:forbidden-paths` alias(kit `package.json` + 소비 템플릿). (lane 배선분)

### Changed
- validate 총 검사 수: 검사 9종 → 12종. README·roadmap·open-decisions 의 live 카운트 갱신.
- README/roadmap/open-decisions/input-reconciliation: `forbidden_paths` backstop·Reconciliation Register CI 강제의 "후속" 표현을 구현 상태(warning-first)로 정정.
- `package-scripts.template.json`: 구현된 `forbidden-paths` 를 active `scripts` 로 추가(warning-first; CI 에서 `git diff` 컨텍스트로 호출).

### Notes
- `test-fixtures`: kit `example:test` alias + CI golden fixture step 배선됨(`continue-on-error: true` = **warning-only**, 비차단). 하드 gating 승격은 후속(FP율 확인 후). forbidden-paths 전용 CI step 도 후속(현재 alias 만).
- 대부분 warning-first: 기본 exit code 불변, `--enforce` 로 하드 전환.

## 0.1.0-mvp-a — 2026-06-13

MVP-A: 문서 생성 + readiness 판정 + 검사. (구현 명세 §11 MVP-A)

### Added
- templates: `screen/screen-spec.template.md`(통합형+stub), `app/navigation-map.template.md`(뼈대),
  `global/llm-rules.template.md`, `domain/domain-rules.template.md`
- scripts: `workflow-state.mjs`, `readiness.mjs`, `validate.mjs` (+ 공유 lib: util/spec/schema)
- schemas: `frontmatter.schema.json` (최소 검증기로 검사)
- catalog: `artifact-manifest.yaml` (MVP-A 등록분)
- policies: `implementation-mode-policy.yaml` (모드별 허용/금지 경로)
- skills: `implement-screen/SKILL.md`
- examples: `coupon-feature` golden example (end-to-end 1회 완주)
- `package-scripts.template.json`

### Notes
- `readiness` 게이트에 `screen_spec_authored` 사실을 추가했다 — stub(frontmatter만)에는
  full UI(rough-fixture-ui)를 막아 "ScreenSpec 먼저" 원칙을 결정적으로 강제한다 (구현 명세 §7의 의도를 명시화).
- 임시 허용(MVP-A): Entry Points 수동 작성(nav-graph는 C), Component Catalog 수동 작성(catalog-gen은 C).

### Review fixes (Codex 1차 리뷰 반영)
- readiness 모드 선택을 **누적(cumulative) 사다리**로 변경 — 높은 모드가 낮은 모드의 전제를 건너뛰지 못한다.
- validate 검사 7: `decision_id` 도 confirmed 필수로 추가 (IMPLEMENTING §4 #6).
- validate 검사 2: manifest path 패턴 위반("잘못된 경로") 검출 추가 (impl §4).
- validate 검사 3: depends_on 이 manifest 키일 때 해당 concrete 파일 존재까지 확인.
- validate 검사 6: authored screen-spec 의 generated section 마커(GENERATED:START/END) 무결성 검사 추가.
- readiness 가 artifact-manifest 를 입력으로 로드 (§6 입력 계약) — 게이트는 정책이 단일 출처, 매니페스트는 next_actions 보강에만 사용.
- 스크립트 3종을 직접 실행 시에만 main() 실행하도록 가드 (import 부작용 제거 — computeReadiness/buildState 재사용 가능).
- 검사 8(confirmed API↔스키마)은 MVP-A 에서 "존재"만 확인. 후보↔스키마 1:1 매칭은 MVP-B 로 연기(코드 주석에 명시).

### Review fixes (Codex 2차 리뷰 반영)
- `package-scripts.template.json`: 동작하는 3개(state/readiness/validate)만 `scripts` 에 두고, 미구현 6개(lint-gen/lint-baseline=B, catalog/nav/route-tree/check-generated=C)는 npm 이 무시하는 `//roadmap-scripts` 키로 분리. 통째로 병합해도 깨지지 않고 로드맵은 그대로 보인다 (이전엔 없는 .mjs 를 가리켜 실행 시 'Cannot find module').
- Gap/Conflict 기록처를 정식화: `global/component-gap-register.md`·`global/conflicts.md` 템플릿 신설 + manifest 등록 + schema `artifact_type` enum 추가. llm-rules/SKILL 이 가리키던 "Component Gap Register"·"conflicts.md" 댕글링 참조에 구체 경로를 부여 (LLM 이 막혔을 때 어디에 남길지 결정적으로 고정).

### Docs consolidation (문서 정리 — 교차리뷰 후)
- **템플릿 재오픈 규칙 정렬**: `llm-rules.template.md`·`screen-spec.template.md` 가 canonical Open Decisions 규칙을 반영 — LLM 은 `open` 행 추가뿐 아니라 새 입력이 기존 `resolved` 결정과 충돌하면 `resolved → open` 재오픈 가능(재-resolve 는 사람-전용). 생성 프로젝트가 템플릿을 복사하므로 옛 문구는 미래 세션이 허용된 재오픈을 망설이게 만듦.
- golden example `llm-rules.md` 동기화 — 이전엔 Open Decisions 저작 규칙·게이트 무결성 불변식 자체가 누락되어 있었음(coupon-list 는 D-001~003 을 쓰는데 정작 그 규칙이 예제 LLM 룰에 없던 불일치).
- **README 문서 지도** 추가 — 문서별 역할·MVP 상태·구현 상태(코드 강제 vs 문서 계약만)를 표로 분리. "새 문서가 곧 강제됨"이라는 오해 차단.
- **`roadmap-current.md` 신설** — 구현됨 / 설계만 / 후속 / 다음 후보 / 지금 하지 말 것 을 한 파일로 고정.
- **Unknown 은 자동 게이트 아님 정합화**: input-reconciliation·investigation·open-decisions·roadmap 의 "Open Decision/Unknown 게이트" 표현을 코드(정책 fact + Open Decision `decision_cap`)에 맞춰 정정. 열린 Unknown 은 어떤 모드도 막지 않으므로 "Unknown 으로 막는다"는 silent fail-open 이었음. Unknown 을 fact-finding 큐 + 승격 사다리(사실→Unknown / 방향막힘→Open Decision / 장기검증→Investigation)로 명문화.
- **MVP-A 범위 3티어 재정리**: README·roadmap 을 Tier 1(구현·강제) / Tier 2(설계 계약, 코드 후속) / Future Candidate 로 분리하고 **게이트 인벤토리**(정확히 무엇을 막고 무엇을 안 막는가) 추가. Review Gates 를 독립 축에서 "Work Packet & Review Artifacts" Future Candidate 로 흡수.

### Review fixes (GPT-5.5 외부 리뷰 반영)
- **템플릿 frontmatter parser-safe 화**: 전 템플릿(screen-spec·navigation-map·domain-rules·llm-rules·component-gap-register·conflicts)의 frontmatter placeholder 를 따옴표 처리. `{SCREEN_ID}-screen-spec`·중첩 `{ ref: {...} }`·`{YYYY-MM-DD}` 가 invalid YAML 이라 GitHub preview·일부 parser 에서 깨지던 것을 해소(`yaml` 라이브러리로 6개 전부 파싱 통과 확인). placeholder 문법(`{X}`)은 유지 — 스크립트는 템플릿을 파싱하지 않아 안전.
- **readiness next_action 일관성**: `component_catalog_generated` 힌트가 미존재 명령 `npm run workflow:catalog`(MVP-C)를 안내하던 것을 `create ... component-catalog.md manually (catalog-gen is MVP-C)` 로 변경.
- **README "Readiness 정책" 절** 추가 — `implementation-mode-policy.yaml` 이 모드 사다리 단일 출처임을 명시 + 게이트 인벤토리 링크.
- roadmap Tier 1 강화 후보에 **API↔스키마 1:1 매칭 검사**·**Interaction Matrix Result 컬럼 구조화** 추가(둘 다 MVP-B+, 지금 구현 안 함).
- 반려(타당하지 않거나 의도된 결정): Entry Points generated marker 추가 제안 — 템플릿에 **이미 존재**(GitHub 가 HTML 주석을 렌더링 안 해 오판). component-gap-register 를 design/ 로 이동 — manifest·SKILL·llm-rules 가 **전부 global/ 로 일관**된 의도적 결정이라 유지.

### MVP-A 닫기 (CI 고정 + dry-run 반영)
- **GitHub Actions CI 추가** (`.github/workflows/frontend-workflow-kit.yml`): push/PR 에서 golden example 을 자동 검증한다. `example:state`/`readiness` 실행 후 **`git diff --exit-code` 멱등성 게이트**로 "생성기가 커밋된 `_meta` 산출물을 재현하는가"를 강제하고, 마지막에 `example:validate`(검사 8종). diff 게이트가 없으면 exit code 만으로는 "스크립트가 돈다"만 증명할 뿐 재현성은 증명하지 못한다(불변식 #7).
- **`.gitattributes` 추가** (`eol=lf`): `core.autocrlf=true` 환경에서 CI 멱등성 diff 가 OS 간 줄바꿈 차이(Windows CRLF ↔ Linux LF)로 헛실패하지 않도록 줄바꿈을 결정적으로 고정.
- **validate 검사 3 메시지에 해소 힌트 추가**: `depends_on 대상 부재`·`sources 링크 파일 부재` 에 "무엇이 틀렸나"뿐 아니라 "어떻게 고치나"(manifest 의 `template`→`path` 복사 안내)를 붙였다. readiness `next_actions` 와 동등한 actionability 확보.
- **README 설치 절차 보강** (dry-run 반영): step 1 에 런타임 필수 디렉토리 vs 개발 전용(`examples/`·`*.html`·설계 `*.md`) 구분, step 4 에 **최소 부트스트랩**(navigation-map + screen-spec stub)과 `depends_on: [navigation-map]` 의존성 명시 — 신선한 소비 프로젝트에서 "문서 하나 만들자마자 검사 3 실패"하던 막힘 해소.
- **implement-screen SKILL**: `workflow:readiness --json` 출력이 `{ "<screen_id>": {...} }` 형태임을 명시 — 스킬을 따르는 LLM 이 `readiness_mode` 를 최상위에서 찾다 못 찾는 혼동 차단.
- **실제 Expo 프로젝트 dry-run 1회 완료** (`npx create-expo-app@latest --template default`): 정책 경로(`src/app/**`·`src/components/ui/**`)가 최신 Expo 기본 템플릿(`src/` 기반)과 정합함을 확인. 최소 부트스트랩 절차로 state→validate 가 첫 시도에 통과, 멱등성도 실제 프로젝트에서 성립. README 에 경로 정합 노트 추가.
- **README: AsyncState 부트스트랩 안내**: fixture-ui 모드 진입 시 (1) 공유 `AsyncState` 타입 계약을 `examples/coupon-feature/src/lib/asyncState.ts` 에서 `src/lib/asyncState.ts` 로 복사, (2) `src/features/{domain}/hooks/useXxx.ts` 를 만들어 그 계약을 반환하도록 step 5 추가. `fake_hook_exists` 게이트는 (2)의 `hooks/` 파일 존재만 보며 (1)의 타입 계약 복사와는 별개다(혼동 방지). 계약이 예제에만 있어 소비자가 fixture-ui 로 넘어갈 때 빈손이던 갭 해소(state/readiness/validate 루프 자체는 영향 없음).

### Open Decisions validate 형식 검사 (검사 9 추가)
- **`validate.mjs` 검사 9 신설** — Open Decisions 표 형식 강제 (open-decisions.md "Validate 통합" 계약 구현). 항목: 섹션에 내용 있는데 표 아니면 실패 · 필수 6컬럼 존재 · **행별 필수 4필드(ID·Decision Needed·Blocking Mode·Status) 비어있지 않음** · `Status` ∈ {open,resolved} · `Blocking Mode` 가 정책 모드명(open 행은 docs-only floor 위; 정책 미로드 시 멤버십 검사 skip + 경고로 surface) · **전역 `D-xxx` ID 중복**(전 screen-spec 집계). 각 위반에 "→ 해소:" 행동 힌트 포함.
- **경고 채널 추가** — validate 출력에 `[경고 N]` 과 JSON `warnings[]` 신설. `resolved` 인데 Options 선택값 없음은 경고로 시작(exit code 무영향 — open-decisions.md 의 "약하게 시작").
- **파싱 단일 출처화** — Open Decisions 파서를 `lib/spec.mjs` 의 `parseOpenDecisions` 로 추출해 `deriveMetrics`(readiness 분류)와 `validate`(형식 검사)가 공유. 리팩터 후 state/readiness 출력 불변 확인(회귀 없음).
- **forbidden_paths 경계 backstop 은 보류(분리)** — 계약상 "경로 경계를 넘는 *변경*"을 보는 것이라 **diff 컨텍스트**가 필요하다. 트리 스캔으로 구현하면 공유 `src/api`(골든 예제에 실재) 같은 전역 forbidden 경로에서 즉시 false-positive 가 나 CI 를 깨뜨린다. CI 의 `git diff` 와 결합하는 **diff 기반 후속**으로 분리(roadmap Tier 1 강화 잔여).
- 카운트/상태 정합화: "검사 8종" → "검사 9종"(README·example README·roadmap 게이트 인벤토리), README 문서 지도·roadmap·open-decisions.md "Validate 통합" 구현 상태를 ✅ 로 갱신.

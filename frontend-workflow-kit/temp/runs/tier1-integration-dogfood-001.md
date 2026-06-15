# Tier1 layout-profile × workflow/catalog/check-generated 통합 dogfood (read-only)

- run_id: tier1-integration-dogfood-001
- 단계: **1단계 — read-only 실측** (코드 수정 0, 게이트 변경 0)
- 기준: `main` HEAD `6afeb5f` (= `origin/main`), 격리 worktree `worktree-tier1-integration-dogfood`
- 실행일: 2026-06-15
- 환경: Windows 11 · node v24.15.0 · npm 11.12.1 · git-bash (`/tmp` → `C:\Users\…\AppData\Local\Temp`)
- 범위: **default layout(`policies/project-layout.yaml` → preset `expo-feature`) 기준**. custom layout 은 별도 표기.

목적: Tier1 layout-profile(Phase 1a, 단일 `resolvedLayout` role→glob)이 새로 들어온
workflow `packet/report/run`, `check-generated-files`, `component-catalog`(catalog-gen),
route-tree/nav-graph 흐름과 **main 기준으로 충돌하지 않는지** 실측한다. 진단만 한다 — 결정/게이트/매니페스트는 건드리지 않는다.

---

## 0. 결론 (TL;DR)

- **default layout 기준 회귀 0.** 모든 기존 테스트·예제·워크플로우 명령이 그대로 동작한다(아래 실행표).
- **layout 소비처가 single source 로 일관 동작.** readiness 가 role→glob 을 도메인 치환해 산출하고
  (`src/features/coupons/screens/**` …), check-generated 가 `{roles.route_entry}` 에서 route-tree 입력을
  `--src` 기준으로 올바로 앵커한다(`<src>/app`).
- **hard gate 승격 0.** check-generated 는 warning-first(항상 exit 0), `--enforce` 미구현, CI 미배선.
  component-catalog 은 guard discovery 에서 `[skip]`(status: planned). manifest flip / guard 등록 없음.
- **catalog-gen 은 Tier1 layout-profile 과 완전 분리.** `loadLayoutProfile` 참조 0 — source contract 가 아직
  fixed `src/components/ui/**` 이므로(설계대로) role-glob 강제 전환 **안 함**.
- **Tier1 영향 의심 문제 2건(F1·F2): orchestrator(`workflow:run`·`workflow:report`)가 `--layout` 을
  하위 서브프로세스로 전달하지 않는다.** default layout 에선 byte-동치라 무해하지만, custom layout 에선
  split-brain. **현재 dogfood 범위(default)에선 회귀 아님 — forward-looking 결함.** 별도 prod PR 후속 권장.
- **component-catalog graduation 전 blocker-candidate 1건(BC1): `check-generated` 의
  `committedPathFor` 가 `_meta/` 를 하드코딩** → design-scope 산출물(component-catalog)을 graduation 시
  잘못된 위치에서 찾게 된다. 승격 전 반드시 해소해야 한다(이번 단계에선 표기만).
- **custom layout fixture: 필요(NEEDED).** F1/F2 회귀 가드 및 도메인 오버라이드 on-disk 검증용.
  read-only 단계에서 구현하지 않음(다음 test PR 범위).

---

## 1. 실행 명령 · exit code · 판정

| # | 명령 (cwd = `frontend-workflow-kit/`) | exit | 판정 | 비고 |
|---|---|---|---|---|
| 1 | `npm test` | 0 | **pass** | test-fixtures 25 fixture (24 pass / **1 xfail** = reconcile-input-001 의도된 증거) + `node --test` 25/25 pass (spec·api-manifest·layout-profile **10**종 포함). ※ 이 PR §7-1 보강 후 27/27(layout-profile 12종) |
| 2 | `npm run example:validate` | 0 | **pass** | `workflow:validate — OK (검사 12종 통과)` |
| 3 | `npm run example:test` | 0 | **pass** | test-fixtures(=#1 의 fixture 파트) |
| 4a | `workflow-packet … --screen COUPON-001 --requested-mode rough-fixture-ui --docs examples/coupon-feature/docs/frontend-workflow --out … --json --date 2026-06-15` | 0 | **pass** | readiness_mode=rough-fixture-ui, requested=rough-fixture-ui, over_ceiling=false, mode_known=true, blocking_count=5, warnings=[] |
| 4b | 4a + `--layout policies/project-layout.yaml` | 0 | **pass** | readiness_source 에 `--layout <abs>` 기록. packet 본문은 4a 와 **provenance 줄만 다르고 byte-동치** |
| 5 | `workflow-report --packet <4a> --docs … --src examples/coupon-feature/src --out … --json` | 0 | **pass** | validate=pass · forbidden-paths=not-collected(--diff 없음) · idempotency=pass · check-generated=mismatch(**advisory**) |
| 6a | `workflow-run --screen COUPON-001 --requested-mode rough-fixture-ui --docs … --json` | 0 | **HALT_AMBIGUITY** | 기본 경로(blocking_count=5 → packet not clean). D-cand D-001/D-002/D-003, U-cand figma_mapping/api_confidence |
| 6b | 6a + `--layout policies/project-layout.yaml --out <dir>` | 0 | **HALT_AMBIGUITY** | 생성된 work-packet 의 readiness_source 에 `--layout` **없음** → run 이 `--layout` 미전달(F1) |
| 7 | `check-generated-files --list --json` | 0 | **pass(warning-first)** | selected: nav-graph·route-tree. component-catalog/eslint = `[skip] status: planned`. screen-inventory·workflow-state = `[skip] 비-v1` |
| 8 | `check-generated-files --json` (default docs/src, cwd=kit) | 0 | **warning** | summary `missing-committed: 2`(nav-graph·route-tree). kit 루트에 `_meta/*` 없음 → warning-first exit 0 |
| 8b | `check-generated-files --json --docs examples/coupon-feature/docs/frontend-workflow --src examples/coupon-feature/src` | 0 | **warning** | route-tree `input=examples/coupon-feature/src/app`(role 앵커가 `--src` 추종), committed 부재 → missing-committed |
| 9 | `catalog-gen --src examples/component-catalog/basic-ui/src --out /tmp/component-catalog.md` | **2** | **error(예상 밖 입력)** | `--src is not a directory` — **이 경로가 main 에 없음**(아래 §5 O1). catalog-gen 의 fail-closed 는 정상 동작 |
| 9b | `catalog-gen --src examples/coupon-feature/src/components/ui --out /tmp/component-catalog.md` | 0 | **pass** | 5 component, v1 frozen format(4컬럼 Name/Source Path/Export Kind/Status) |

> 판정 어휘: **pass** = 기대대로 통과 · **xfail** = 의도된 실패 증거(strict witness, 비치명) ·
> **warning** = warning-first 산출물 결손 신호(exit 0, 게이트 아님) · **error** = 입력/설정 오류(exit 2, fail-closed).
> `workflow:run` 의 HALT_* 는 **종료 상태이지 게이트가 아니다**(어떤 HALT 도 머지 차단 안 함).

---

## 2. layout 관련 관찰

1. **role→glob + 도메인 치환 정상.** coupon-feature readiness(COUPON-001) allowed_paths =
   `src/features/coupons/screens/**`, `…/components/**`, `…/hooks/**`, forbidden =
   `src/api/**`, `openapi.yaml`. policy 의 `{roles.screen}` 등이 `resolvedLayout` 로 펼쳐지고 domain=`coupons` 로 치환됨 — 토큰화 이전과 의미 동일.
2. **`workflow:packet` 이 `--layout` 을 readiness 서브프로세스로 정상 전달(MAJOR 2 계약 확인).**
   `--layout` 미지정: `readiness.mjs --docs … --screen COUPON-001 --json (computed …)`.
   `--layout policies/project-layout.yaml` 지정: `… --screen COUPON-001 --layout <resolve 된 절대경로> --json …`.
   provenance 문자열이 **서브프로세스가 실제 받은 인자(절대경로)** 와 일치 — 왜곡 없음.
3. **default vs (default 가리키는) 명시 `--layout` 산출물이 byte-동치.** packet 본문 diff 는 readiness_source
   provenance 줄(과 그 에코)만 다르고 allowed/forbidden/mode/blocking 전부 동일 — **layout source/path 왜곡 0**.
4. **check-generated 의 route-tree 입력이 role 에서 파생되고 `--src` 를 추종.**
   default: `input=src/app` / coupon: `input=examples/coupon-feature/src/app`. `projectRootOf(srcDir)` +
   `layout.roleToDir('route_entry')` 앵커 동작 확인(literal `<srcDir>/app` 하드코딩 아님 — §6·§10).
5. **layout-profile.test.mjs 10종 전부 pass**(이 PR §7-1 보강으로 12종) — roleToDir/resolvePaths 동치, MAJOR 1 fail-closed,
   MINOR 1 domain='' 보존, §7-i materializeGuardedSurface == deriveGuardedSurface(expo byte-동치),
   MAJOR 3 도메인-스코프 forbidden 구체화, M3 clearance.
6. (minor) `--layout` 지정 시 readiness_source 에 **절대경로**가 박혀 packet 이 비-portable 해진다.
   default(미지정) 경로엔 절대경로 누출 없음. 설계상 의도된 provenance 정확성 trade-off — 회귀 아님, 표기만.

---

## 3. hard gate 승격 없음 — 확인

- `check-generated-files`: 2.5C warning-first — **검사 결과와 무관하게 항상 exit 0**(설정 오류만 exit 2).
  `--enforce` 는 v1 미구현(코드 주석·렌더에서 명시), CI 미배선. #7·#8·#8b 모두 exit 0.
- `component-catalog`: guard discovery 에서 `[skip]`(`status: planned` → 재생성 안 함, must-not-fail).
  selected 집합은 **nav-graph·route-tree 뿐**. component-catalog 은 reproduce 대상 아님 → guard 미등록 확인.
- `workflow:packet/report/run`: 정상 경로 exit 0, 도구 오류만 exit 2. **exit 1 을 게이트로 쓰는 경로 없음.**
  `workflow:run` HALT_* 는 종료 상태(머지 차단 아님). Safe To Proceed?/Ambiguity 를 exit 1 로 만들지 않음.
- 본 dogfood 는 새 hard gate / CI required check / manifest flip / guard 등록을 **하지 않았다**.

---

## 4. Tier1 영향으로 의심되는 문제

### F1 — `workflow:run` 이 `--layout` 을 packet(→readiness) 로 전달하지 않음 (default-invisible, 실측 확인)

- 증거: `workflow-run … --layout policies/project-layout.yaml --out <dir>` 실행 후 생성된
  `work-packet.md` 의 readiness_source = `… --screen COUPON-001 --json …` (`--layout` **없음**).
- 원인: 공용 `parseArgs`(util.mjs)는 `--layout` 을 일반적으로 `flags` 에 담지만, `scripts/workflow-run.mjs` 가
  `flags.layout` 을 **소비·검증하지 않고**(전용 처리 부재), `packetArgs` 에 `--layout` 을 넣지 않는다
  (현재 전달: screen/requested-mode/out/json/readiness/docs/policy/manifest/domain/owner/date/seq).
- 영향: **default layout 에선 무해**(packet 의 자체 loadLayoutProfile 도, readiness 서브프로세스도 동일한
  기본 expo 프로파일로 해소 → byte-동치). **custom `--layout` 사용 시 split-brain** — 운영자는 custom layout 을
  줬다고 믿지만 run 산하의 packet/readiness 는 기본 expo 로 게이트 사실을 산출.
  이는 `workflow-packet.mjs` 가 MAJOR 2 로 막아둔 split-brain("누락 시 readiness 는 기본(expo) 정책으로
  해소") 을 orchestrator 계층에서 **다시 도입**하는 셈.
- 판정: **현재 dogfood 범위(default layout)에선 회귀 아님.** custom layout 기능을 쓸 때만 발현하는 latent gap.

### F2 — `workflow:report` 가 `--layout` 을 evidence 서브프로세스로 전달하지 않음 (source 확인)

- `scripts/workflow-report.mjs` 도 (parseArgs 가 `flags.layout` 을 담더라도) 이를 **소비·전달하지 않으며**,
  `collectValidate`/`collectForbidden`/`collectCheckGenerated` 호출에 `--layout` 이 없다. 이들 leaf 도구(validate 검사 8/fake_hook,
  forbidden-paths 의 `{roles.X}` 정책 해소, check-generated 의 route-tree 입력)는 layout 을 소비한다.
- 영향: default 에선 무해. custom layout 에선 **evidence 가 기본 expo 로 계산** → evidence bundle 이
  split-brain. 단 report 는 advisory(게이트 아님)라 영향은 "오도하는 advisory evidence" 수준.
- 판정: F1 과 동일 root cause(− seam 이 leaf 스크립트·packet 엔 배선됐으나 두 orchestrator 엔 미배선).

> F1·F2 는 **이 read-only 단계의 검증 항목("workflow 이 packet/report 조합 시 layout 인자를 잃지 않는지")에
> 대한 명확한 negative 답**이다. 단, **default layout 기준 통합 회귀는 없다**. 수정은 prod(run/report) 변경이라
> 다음 test-only PR 범위 밖 → 별도 후속 PR(아래 §7).

---

## 5. 비-Tier1 / 환경 관찰 (참고)

- **O1 — `examples/component-catalog/basic-ui/src` 가 main 에 없음.** `examples/component-catalog/` 자체가 부재.
  task 전제("PR #38 golden fixture 까지 끝남")와 main HEAD `6afeb5f` 가 어긋남(PR #38 미머지이거나 fixture 가
  다른 경로). 현재 main 의 catalog 관련 산출물은 `examples/*/docs/frontend-workflow/design/component-catalog(.snapshot).md`
  (= 생성 산출물 문서)뿐이고, catalog-gen **source fixture(src/components/ui 트리)는 별도로 없다**.
  → #9 의 exit 2 는 catalog-gen 의 입력 fail-closed 가 정상 동작한 것(데이터 손실 방지). Tier1 무관.
- **O2 — 어떤 example 도 `_meta/route-tree.txt`·`_meta/nav-graph.yaml` 커밋본이 없다.** route-tree/nav-graph
  golden 은 `examples/route-tree/<case>`·`examples/nav-graph/<case>`(case-dir + run-metadata.json) 구조로
  test-fixtures 가 소비하지, check-generated 의 `_meta/` convention 으로 두지 않는다. 따라서 check-generated
  reproduce 는 모든 example 에서 missing-committed(warning-first)로 떨어진다 — 정상.

---

## 6. component-catalog graduation 전에 막아야 할 blocker-candidate

> (닫지 않음 — 표면화만. resolve/결정은 사람.)

- **BC1 (blocker) — `check-generated` 의 커밋본 경로 해소가 `_meta/` 하드코딩.**
  `scripts/lib/check-generated-files.mjs` `committedPathFor(contract, docsDir) = join(docsDir,'_meta',outName)`.
  component-catalog 는 `scope: design`, 실제 경로 `docs/frontend-workflow/design/component-catalog.md`.
  graduation 으로 `V1_REPRODUCE['component-catalog']` 를 추가하면 committed 를
  `docs/frontend-workflow/_meta/component-catalog.md`(틀린 위치)에서 찾게 됨 → 항상 missing-committed.
  **승격 전 design-scope 산출물의 committed 경로 해소를 일반화해야 함.** (이번 단계에선 수정/등록 안 함.)
- **BC2 (note) — catalog-gen 은 layout-agnostic + 출력 헤더/Source Path 가 고정 `src/components/ui` 정규화.**
  `--src` 를 다른 곳으로 줘도 출력의 `Source:`/`Command:`/Source Path 컬럼은 `src/components/ui/**` 로 고정.
  reproduce 계약 추가 시 입력 경로 규약(고정 src vs ui_primitive role)이 **미해소 결정**이다 — task 지침대로
  role-glob 강제 전환 금지. 승격 시 이 규약을 사람이 명시 결정해야 함(여기선 결정하지 않음).
- **BC3 (note) — graduation 은 `do_not_edit: false → true` + `status: planned → active` + allowlist 추가가
  동반된다.** 셋 다 manifest flip/guard 등록에 해당 → 본 세션 금지 범위. 승격 PR 에서 BC1 해소 후 일괄.

---

## 7. recommended next PR

1. **(이번에 진행) `test(tier1): add layout-profile integration dogfood`** — test-only.
   - `temp/runs/tier1-integration-dogfood-001.md` (이 보고서).
   - `examples/layout-profile/**` minimal **custom** layout fixture(도메인 오버라이드 + role 재바인딩 포함).
   - `scripts/lib/layout-profile.test.mjs` 보강(on-disk custom fixture 로 도메인 오버라이드 머지 회귀 가드).
   - **금지 유지**: component-catalog manifest flip · check-generated component-catalog 등록 ·
     package alias · CI hard gate 변경 · prod 스크립트(run/report) 수정.
2. **(후속, 별도 prod PR) `fix(tier1): thread --layout through workflow run/report orchestrators`** —
   F1·F2 해소. run/report 가 `--layout` 을 파싱해 packet/evidence 서브프로세스로 전달. §1 의 custom-layout
   fixture 로 회귀 테스트. **default layout byte-동치 유지가 HARD CONSTRAINT.**
3. **(후속, component-catalog 트랙) BC1 선행** — `check-generated` 의 committed 경로 해소를 scope 별로 일반화
   (`_meta/` 하드코딩 제거)한 뒤에야 component-catalog graduation(manifest flip + guard 등록) 가능.

---

## 8. custom layout fixture 판단

**필요(NEEDED).** 사유:
- F1/F2 회귀 가드(orchestrator forwarding)는 default 가 byte-동치라 default 만으로는 못 잡는다 —
  expo 와 **다른** role 바인딩을 가진 custom layout 이 있어야 split-brain 이 관측된다.
- 현 layout-profile.test.mjs 의 custom 케이스는 tmp 파일(MAJOR 3/M3)뿐 — on-disk committed fixture 로
  도메인 오버라이드(`domains.<d>.roles`) 머지 우선순위(preset < roles < domains.<d>.roles)를 고정하는 게 가치 있다.

read-only 단계에서는 **구현하지 않음**. 다음 test PR(§7-1)에서 `examples/layout-profile/**` 로 추가한다.

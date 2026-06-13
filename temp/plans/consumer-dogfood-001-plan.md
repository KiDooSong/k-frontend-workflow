---
title: "Consumer Dogfood Dry-Run Plan"
kind: plan
plan_id: consumer-dogfood-001
status: draft
date: 2026-06-14
owner: "{운영자 — 사람 또는 에이전트}"
depends_on:
  - "MVP-B release-check (test-fixtures harness · forbidden-paths backstop · 입력/register 검증 = 코드 완료)"
scope: "frontend-workflow-kit 을 실제 소비 Expo 프로젝트에 적용하는 1회 dogfood 시나리오 정의"
executes: false   # 이 문서는 계획서다. 여기 적힌 명령을 실행하지 않는다.
---

# Consumer Dogfood Dry-Run Plan — `consumer-dogfood-001`

> **이 문서는 계획서다.** 여기 적힌 어떤 명령도 실행하지 않는다. fresh Expo 프로젝트 생성·킷 복사·스크립트 실행·구현·검사는 전부 *후속 실행 세션*의 몫이며, 이 파일은 그 절차·기대 신호·기록 항목만 고정한다.
>
> 위치 근거: 이 dry-run 의 직접 선례는 [`temp/examples/work-packet-dry-run/`](../examples/work-packet-dry-run/README.md)(md-only 형태 예시)와 [`temp/runs/implement-screen-001/implement-run-report.md`](../runs/implement-screen-001/implement-run-report.md)(실제 게이트 준수 실행 보고)다. 차이: 그 둘은 킷 **내부** `examples/` 를 fixture 로 썼고, 이 dogfood 는 킷 **밖**의 진짜 소비 프로젝트(fresh Expo)를 대상으로 스크립트를 실제로 돌린다.

---

## 0. 목적과 한 줄 가설

**목적.** MVP-B release-check 직후, `frontend-workflow-kit` 이 *문서·예제로 닫힌 세계*를 벗어나 **새로 만든 소비 프로젝트**에서도 의도대로 동작하는지를 1회 통과로 확인한다.

**검증 가설(한 줄).** "fresh Expo 프로젝트에 킷을 복사하고 최소 문서만 부트스트랩하면, `state → readiness → Work Packet → implement-screen → validate → forbidden-paths(경고)` 가 **게이트 천장(screen-skeleton)을 지키며** 통과하고, 천장을 넘으려는 시도는 거절·경고로 잡힌다."

**무엇이 아닌가.** 제품 기능 검증이 아니다. *워크플로우 킷 자체*의 소비자-적용 가능성(install → bootstrap → gated implement)을 보는 메타 dry-run 이다. UI 품질·디자인 정확도는 채점 대상이 아니다.

---

## 1. 전제 (시작 전에 참이어야 하는 것)

| # | 전제 | 확인 방법 | 못 지켜지면 |
|---|---|---|---|
| P1 | MVP-B 검증 스위트가 release-check 통과 | `temp/workflows/mvp-b-board.md` §7 "전 lane 머지 후" 체크리스트 green (A·B·C 머지 + PR-WIRE) | dogfood 보류 — 검증 스크립트가 아직 불안정 |
| P2 | 4개 소비자-대면 스크립트가 동작 | 킷 루트에서 `npm run example:state && example:readiness && example:validate` 녹색, `node scripts/forbidden-paths.mjs --help`/fixture 동작 | 해당 스크립트 단위로 회귀 우선 |
| P3 | Node ≥ 18, npm, git, `create-expo-app` 사용 가능 | `node -v` / `git --version` / `npx create-expo-app --version` | 도구 설치 선행 |
| P4 | 운영자가 게이트 해제(사람-전용)와 추측 금지 불변식을 숙지 | [README 불변식](../../frontend-workflow-kit/README.md) · [SKILL.md 금지](../../frontend-workflow-kit/skills/implement-screen/SKILL.md) | 거절 시나리오를 "실패"로 오독할 위험 |

> P1·P2 는 **이 계획의 depends_on** 이다. release-check 가 끝나지 않았다면 이 dry-run 을 시작하지 않는다.

---

## 2. 산출물 위치와 안전 규약

이 dogfood 가 만드는 것은 **킷 밖**에 둔다. 킷 레포는 읽기 전용으로만 참조한다.

```txt
<소비 프로젝트>  =  킷 레포 밖의 새 디렉토리 (예: C:\Users\thdrl\source\repos\dogfood-expo-001\)
                     └ 여기서 create-expo-app · 킷 복사 · 스크립트 실행 · 구현이 전부 일어난다.
                     └ 자체 git repo (forbidden-paths 의 --base diff 가 진짜 git 으로 동작).

킷 레포(k-frontend-workflow)  =  복사 원본 + 정본 참조. 이 dry-run 으로 1바이트도 수정하지 않는다.
                     └ 단, 완료 후 run report 1장은 증거로 temp/runs/consumer-dogfood-001/ 에 복사해 둘 수 있다
                       (선례: temp/runs/implement-screen-001/). 이건 evidence 보관일 뿐 게이트 아님.
```

**안전 하드룰 (실행 세션이 지킬 것):**
1. 소비 프로젝트는 킷 레포 **바깥**에 만든다 — Expo 의 `node_modules` 로 킷 레포를 오염시키지 않는다.
2. 킷 레포의 `scripts/` · `package.json` · `package-scripts.template.json` · `README/CHANGELOG/roadmap` 은 **참조만**. 수정 0.
3. CI 추가 0 — 이 dry-run 은 로컬 수동 실행이다.
4. 게이트 해제(Open Decision resolve / candidate→confirmed 승격 / Conflict close)는 **사람만**. 에이전트는 open 추가/재오픈만.

---

## 3. 단계별 계획

각 단계 = **목표 / 명령 / 입력 / 기대 출력**. 명령은 *후속 실행 세션*이 소비 프로젝트 루트에서 돌릴 것의 모델이다(여기서 실행 안 함). 셸은 Windows PowerShell 기준이며, `npm run ... -- <flags>` 의 `--` passthrough 는 동일하게 동작한다.

### Step 1 — Fresh Expo project setup  *(Must-cover #1)*

- **목표:** 킷이 가정하는 `src/` 기반 레이아웃을 가진 깨끗한 Expo 프로젝트를 만들고 baseline 커밋을 찍는다.
- **명령(모델):**
  ```powershell
  npx create-expo-app@latest dogfood-expo-001
  # 결과 디렉토리로 이동(실행 세션에서). 이 계획서는 이동/실행을 하지 않는다.
  git init ; git add -A ; git commit -m "chore: baseline create-expo-app"   # forbidden-paths --base 의 기준점
  ```
- **입력:** 없음(템플릿 기본).
- **기대 출력 / 확인:**
  - `src/app/` (Expo Router) 가 존재한다. → 정책 경로 `src/app/**`·`src/features/{domain}/**`·`src/components/ui/**` 와 정합(README "경로 가정"이 최신 템플릿으로 확인했다고 명시).
  - baseline 커밋 SHA 를 기록(= `<BASELINE>`). Step 8 의 `--base` 기준 — 이후 구현은 **이 baseline 위 작업 브랜치에 커밋**해야 diff 백스톱이 본다(Step 7·8).
- **함정:** 템플릿이 루트 `app/`(src 없이)를 깔면 정책 글롭과 어긋난다 → 이 경우 `src/` 로 옮기거나 정책 경로 가정을 재확인(스코프 변경이므로 dry-run 중단·기록). **정책/스크립트는 고치지 않는다.**

### Step 2 — Copy kit to `tools/frontend-workflow`  *(Must-cover #2)*

- **목표:** 런타임에 필요한 최소 부분집합만 소비 프로젝트의 `tools/frontend-workflow/` 로 vendoring 한다.
- **복사 매니페스트(README 설치 §1 기준):**
  ```txt
  복사함:   scripts/  catalog/  policies/  schemas/  templates/  skills/  package.json  package-lock.json
  복사 안 함: examples/   *.html   설계 *.md(open-decisions/roadmap/README/CHANGELOG 등)   node_modules/
  ```
- **명령(모델):**
  ```powershell
  # 킷 레포에서 위 매니페스트만 tools/frontend-workflow/ 로 복사(robocopy/Copy-Item).
  # node_modules 는 복사하지 말고 아래에서 새로 설치.
  npm install --prefix tools/frontend-workflow   # 유일 의존성 yaml 하나
  ```
- **기대 출력 / 확인:**
  - `tools/frontend-workflow/scripts/{workflow-state,readiness,validate,forbidden-paths}.mjs` 존재.
  - `tools/frontend-workflow/node_modules/yaml/` 설치됨.
  - 스크립트는 manifest/policy/schema 를 **킷 위치 기준**으로 자동 해석하므로(README), 별도 경로 설정 불필요.
- **참고:** 여기서 복사되는 `package.json` 은 **vendored 킷용**(yaml dep + 킷-상대 `scripts/*.mjs`)이다. 소비자 루트 `package.json` 병합은 Step 3 에서 별개로 한다.

### Step 3 — package scripts merge  *(Must-cover #3)*

- **목표:** 소비 프로젝트 **루트** `package.json` 의 `scripts` 에 4개 워크플로우 alias 를 병합한다. 스킬·훅·(후속)CI 는 항상 이 이름으로 호출한다.
- **입력 원본:** [`package-scripts.template.json`](../../frontend-workflow-kit/package-scripts.template.json) 의 `scripts` 블록 — 이미 `tools/frontend-workflow/scripts/*.mjs` 를 가리키도록 작성돼 있어 **그대로 병합**하면 동작한다:
  ```json
  "workflow:state":           "node tools/frontend-workflow/scripts/workflow-state.mjs",
  "workflow:readiness":       "node tools/frontend-workflow/scripts/readiness.mjs",
  "workflow:validate":        "node tools/frontend-workflow/scripts/validate.mjs",
  "workflow:forbidden-paths": "node tools/frontend-workflow/scripts/forbidden-paths.mjs"
  ```
- **기대 출력 / 확인:**
  - 소비자 루트에서 `npm run workflow:state` 가 `tools/frontend-workflow/...` 모듈을 찾는다(Cannot find module 없음).
  - 템플릿의 `//roadmap-scripts`(lint-gen/catalog/nav 등)는 **대상 .mjs 가 없으므로 병합하지 않는다**(병합하면 실행 시 깨짐).
- **주의:** 병합은 **소비 프로젝트** package.json 에서 일어난다 — 킷 레포 package.json 은 건드리지 않는다(Do-not 준수).

### Step 4 — Minimum docs bootstrap  *(Must-cover #4)*

- **목표:** readiness 가 의미 있는 모드를 내기 위한 **최소 문서**를 `docs/frontend-workflow/` 에 만든다. 더 만들지 않는다(최소성 자체가 신호).
- **최소 부트스트랩(README 설치 §4 + manifest 의 depends_on 제약):**
  ```txt
  docs/frontend-workflow/
    app/navigation-map.md                              # templates/app/navigation-map.template.md, status: draft
    domains/{domain}/screens/{screen}/screen-spec.md   # templates/screen/screen-spec.template.md — STUB(frontmatter만)
  ```
  - screen-spec frontmatter 의 `depends_on: [navigation-map]` 때문에 navigation-map 이 없으면 **`workflow:validate` 검사 3(끊어진 참조)이 실패**한다 → navigation-map 은 필수.
  - 권장 대상 화면(예): `domain: home`, `screen_id: HOME-001`, `route: /`. (golden 의 COUPON-001 구조를 few-shot 으로 차용.)
- **두 시나리오용 부트스트랩(§4 참조):**
  - **시나리오 A(정상):** 위 stub 1개. Open Decision 없음 → 천장 `screen-skeleton`.
  - **시나리오 B(거절, 선택):** 두 번째 stub(예: `PROFILE-001`)에 ScreenSpec `Open Decisions` 표로 `D-301`(Status=open, Blocking Mode=`route-skeleton`, Owner=PM)을 1행 추가 → `decision_cap = docs-only`.
- **하지 말 것:** 본문(State Matrix/Interaction 등) 작성·confirmed 승격·design value 발명. stub 은 frontmatter 만. (본문을 채우면 `screen_spec_authored=true` 가 되지만, rough 진입엔 catalog·fake_hook 도 필요 — 이 dry-run 의 천장은 의도적으로 screen-skeleton 이다.)

### Step 5 — `workflow:state` / `readiness` / `validate`  *(Must-cover #5)*

3차 방어선 중 2차. 판정 단일 출처는 `readiness.mjs` — 아래 출력을 **소비만** 한다.

- **명령(모델, 소비자 루트):**
  ```powershell
  npm run workflow:state -- --date 2026-06-14
  #   → docs/frontend-workflow/_meta/workflow-state.yaml + screen-inventory.yaml 생성
  npm run workflow:readiness -- --json
  #   → 화면별 readiness_mode / next_mode / allowed_paths / forbidden_paths / blocking
  npm run workflow:validate
  #   → 검사 통과 시 exit 0 (CI 게이트)
  ```
- **사실 파생(이 dry-run 의 기대 신호 근거):**
  | fact | 파생 출처 | stub 부트스트랩에서의 값 |
  |---|---|---|
  | `navigation_map_status` | `app/navigation-map.md` frontmatter status (없으면 missing) | `draft` |
  | `stub_screen_specs_count` | screen-spec.md 파일 수 | `1`(A) / `2`(A+B) |
  | `screen_spec_authored` | stub≠true (본문 작성 여부) | `false` (stub) |
  | `component_catalog_generated` | `design/component-catalog.md` 존재 | `false` (안 만듦) |
  | `fake_hook_exists` | `src/features/{domain}/hooks/` 에 `.ts(x)` 존재 | `false` (없음) |
- **기대 출력(시나리오 A, HOME-001):**
  - `readiness_mode = screen-skeleton`, `next_mode = rough-fixture-ui`.
  - 근거: route-skeleton(stub_count>0 ∧ nav≥draft) ✓ · screen-skeleton(status≥draft) ✓ · rough-fixture-ui 는 `screen_spec_authored`·`component_catalog_generated`·`fake_hook_exists` 미충족으로 막힘.
  - `allowed_paths = ["src/features/home/screens/**"]`, `forbidden_paths = ["src/api/**","openapi.yaml"]`.
  - `validate` **exit 0**. (출력 라인은 코드 기준 "검사 12종 통과" — README 일부 문구의 "9종"은 stale. run report 엔 실제 출력 라인을 적는다.)
- **기대 출력(시나리오 B, PROFILE-001):** `readiness_mode = docs-only`, `next_mode = route-skeleton`, blocking 머리 = `open_decision D-301`.

### Step 6 — Create Work Packet  *(Must-cover #6)*

- **목표:** Step 5 의 readiness 출력을 **한 세션 단위 실행 봉투**로 포장한다. Work Packet 은 새 게이트가 아니라 인덱스/핸드오프 보드다.
- **템플릿:** [`templates/work-packet/work-packet.template.md`](../../frontend-workflow-kit/templates/work-packet/work-packet.template.md).
- **파일(모델):** `<소비 프로젝트>/work-packets/WP-HOME-001-screen-skeleton-001.md`.
- **채우는 규칙(템플릿 주석과 동일):**
  - `readiness_mode`/`next_mode`/`allowed_paths`/`forbidden_paths` 를 readiness 출력에서 **글자 그대로 복사**(재계산·hand-edit 금지).
  - `requested_mode = screen-skeleton`(= readiness_mode, 정상). `readiness_source` = Step 5 실행 시점·명령.
  - `Goal` = "라우트에 연결될 화면 shell **1개**만 세운다(fixture UI·fake hook 없음)."
  - `Blocking Items` = readiness `blocking` 을 옮기되 **닫지 않는다**(예: rough 진입을 막는 `component_catalog_generated==false`·`fake_hook_exists==false`; 시나리오 B 면 D-301).
  - `Acceptance Criteria`/`Review Checklist` = 템플릿 기본(경로 준수·천장 미초과·미발명·결정 미닫힘·멱등).
- **기대:** packet 은 ScreenSpec/ readiness 를 **복사하지 않고 링크**만. 시나리오 B 의 packet 은 `requested_mode(screen-skeleton) > readiness_mode(docs-only)` 라도 유효하다 — 초과분은 Step 7 에서 거절+blocker 로 처리된다(요청은 권한이 아니라 기록).

### Step 7 — implement-screen from Work Packet  *(Must-cover #7)*

- **목표:** Work Packet 이 가리키는 화면을 [`SKILL.md`](../../frontend-workflow-kit/skills/implement-screen/SKILL.md) 절차대로, **readiness 천장 안에서만** 구현한다. 구현 가능 여부를 직접 판단하지 않고 스크립트 출력을 따른다.
- **절차(SKILL.md 요약):**
  1. `npm run workflow:state` 재집계.
  2. `npm run workflow:readiness -- --screen HOME-001 --json` → 출력은 `result["HOME-001"]` 로 키 감싸짐. `readiness_mode`/`allowed_paths`/`forbidden_paths`/`blocking` 읽기.
  3. 게이트 판정: UI 허용 모드면 진행, `docs-only`/`route-skeleton` 등 UI 불가면 **구현하지 말고 blocking·next_actions 보고 후 멈춤**.
  4. 컨텍스트 로드: 해당 ScreenSpec·domain-rules·navigation-map·(있으면) component-catalog 만. 다른 도메인 문서는 로드 금지.
  5. 구현: `allowed_paths` 매칭 파일만 수정.
- **시나리오 A 기대 산출물:** `src/features/home/screens/HomeScreen.tsx` **단 1개** — 골격 셸.
  - 금지/부재 확인 신호: `hooks/`·`components/`·`*.fixture.*` **미생성**; `useState`/`useEffect`/`useXxx(`/`isLoading`/`fetch(`/`axios` **0건**; user-facing 문자열은 confirmed copy 만, tbd 는 키 이름 주석으로만(발명 0).
  - golden 의 `CouponListScreen.tsx`(useCoupons·State Matrix 5분기)는 rough/final 산출물 — 여기서 만들면 **과구현(B3) 실패**. 의도적으로 만들지 않는다.
- **시나리오 B 기대 동작:** `readiness_mode = docs-only` → `src/**` 전체 닫힘 → **구현 거절 + 빈 diff + D-301 blocker 보고**(SKILL.md:26). 이게 정답이며 "실패"가 아니다.
- **마무리:** `npm run workflow:validate` → **exit 0** 보고. 실패 항목은 고치거나 사람 결정 필요 시 그대로 보고.
- **구현 커밋(Step 8 의 전제):** 시나리오 A 는 화면 shell 을 **작업 브랜치에 커밋**한다(예: `git switch -c dogfood/home-001 ; git add -A ; git commit -m "feat(home): HOME-001 screen-skeleton shell"`). diff 백스톱(`--base`)은 **커밋된 변경만** 보므로(Step 8 선행 2), 커밋하지 않으면 새 화면 파일이 untracked 라 diff·`git diff --name-only` 어디에도 안 잡힌다. 시나리오 B(거절)는 커밋할 변경이 없다(빈 diff 가 정답).

### Step 8 — forbidden-paths warning-only check  *(Must-cover #8)*

- **목표:** hook 없는 환경의 2차 방어선(diff 백스톱)이 **경고 모드(`--enforce` 없음)**로 경계 위반을 어떻게 보는지 확인한다. warning-first = 위반이 있어도 **exit 0**.
- **선행 1 (state):** `forbidden-paths` 는 `docs/frontend-workflow/_meta/workflow-state.yaml` 을 요구한다(없으면 **exit 2**). → Step 5/7 의 `workflow:state` 가 먼저 돌아 있어야 한다.
- **선행 2 (diff 가시성 — Codex 리뷰 검증):** `--base <ref>` 는 내부적으로 `git diff $(merge-base <ref> HEAD)..HEAD` 로 **커밋된 변경만** 본다([path-backstop.mjs:320](../../frontend-workflow-kit/scripts/lib/path-backstop.mjs:320)). 따라서 **구현이 커밋(또는 최소 stage)돼 있어야** 새 화면/위반 파일이 diff 에 잡힌다 — untracked 신규 파일은 `--base` 에도 `git diff --name-status <ref>` 에도 안 보인다. Step 7 에서 작업 브랜치에 커밋했다는 전제.
- **명령(모델) — 커밋 기반(추천):**
  ```powershell
  # Step 7 에서 작업 브랜치에 커밋한 뒤(HEAD 가 baseline 너머로 이동):
  npm run workflow:forbidden-paths -- --base <BASELINE>           # git diff merge-base(BASELINE,HEAD)..HEAD = 커밋된 구현 포함
  ```
- **명령(모델) — 커밋 안 할 때(stage 대안):**
  ```powershell
  git add -A                                                      # 신규 파일까지 staged
  npm run workflow:forbidden-paths -- --staged                    # git diff --cached → staged 신규 파일 포함
  # (--diff 텍스트 입력을 쓰려면: git diff --cached --name-status > diff.txt ; ...forbidden-paths -- --diff diff.txt)
  ```
- **기대 출력(시나리오 A, 정상):**
  - (커밋/stage 후) 변경 쓰기 = `src/features/home/screens/HomeScreen.tsx` 뿐 → guarded surface(`src/api/**`,`openapi.yaml`,`openapi.yml`) 무접촉 → `forbidden-paths — OK (guarded surface 위반 없음)`, **exit 0**.
  - ⚠️ 구현이 **미커밋/untracked** 면 diff 가 비어 `OK` 가 나오지만, 이는 *"screens-only 라 통과"* 가 아니라 **헛통과**(아무것도 안 본 것)다 — 반드시 커밋/stage 후 확인한다.
- **백스톱 발화 확인(선택 sub-check):** 일부러 `src/api/dummy.ts` 를 만들고 **커밋(또는 `git add`)** 한 뒤 검사 → 어떤 화면도 `api-integrated-ui` 에 도달하지 못했으므로 **위반(경고) 1건** 출력 + `(warning-first: --enforce 없이는 exit 0)` + **여전히 exit 0**. (커밋/stage 안 하면 untracked 라 안 잡혀 백스톱 동작 증명에 실패한다.) 확인 후 그 변경은 폐기(소비 프로젝트에서만; 킷 무관).
- **하지 말 것:** `--enforce` 부여(이 dry-run 은 경고-모드 관찰만; 강제 승격은 FP 관찰 후 별도). base ref 해석 실패는 fail-open 금지 → **exit 2** 로 나오면 입력 오류로 기록.

---

## 4. 시나리오 대비 (정상 진행 vs 게이트 거절)

선례 [`work-packet-dry-run`](../examples/work-packet-dry-run/README.md) §4 의 2-시나리오 대비를 소비 프로젝트로 옮긴 것.

| | 시나리오 A — HOME-001 (정상) | 시나리오 B — PROFILE-001 (거절, 선택) |
|---|---|---|
| 부트스트랩 | stub 1개, Open Decision 없음 | stub + `D-301`(open, blocking `route-skeleton`) |
| `requested_mode` | `screen-skeleton` | `screen-skeleton` |
| `readiness_mode`(천장) | `screen-skeleton` | `docs-only` |
| `next_mode` | `rough-fixture-ui` | `route-skeleton` |
| 천장 근거 | **fact 천장**(`component_catalog`/`fake_hook` false) | **decision_cap**(D-301) |
| allowed_paths | `src/features/home/screens/**` | `docs/frontend-workflow/**` |
| 정답 동작 | 화면 shell 1개 생성 | **구현 거절 + blocker 보고 + src 변경 0** |
| Run Report `Result` | success | blocked / refused |
| forbidden-paths | (구현 커밋/stage 후) screens-only → OK(위반 0), exit 0 | 변경 없음 → OK, exit 0 |
| 열린 채로 둘 항목 | rough 전제(catalog/fake_hook) | D-301 |

> 두 시나리오를 모두 돌리면 "정상 통과"와 "게이트가 막아 거절"이 **둘 다 정답 신호**임을 한 run 에서 보여 줄 수 있다. 시간이 제한되면 A 만 필수, B 는 권장.

---

## 5. Expected pass/fail signals  *(Must-cover #9)*

각 단계의 **녹색(기대) 신호**와 **적색(중단·기록) 신호**. 적색이라고 전부 dry-run 실패는 아니다 — 거절(B)·경고(Step 8)는 *설계된 신호*다.

| 단계 | PASS (기대) | FAIL / 주의 (기록·진단) |
|---|---|---|
| 1 setup | `src/app/` 존재, baseline 커밋 | 템플릿이 `src/` 미사용 → 경로 가정 불일치(중단·기록, 정책 무수정) |
| 2 copy | 4 스크립트 + `node_modules/yaml` 존재 | `npm install` 실패 / 매니페스트 누락 |
| 3 merge | `npm run workflow:state` 모듈 해석됨 | `Cannot find module`(경로/병합 오류), roadmap-scripts 오병합 |
| 4 bootstrap | nav-map(draft)+stub 1~2개 | nav-map 누락 → 검사 3 실패 예약 |
| 5 state | `_meta/*.yaml` 생성, 멱등(같은 `--date`→동일) | 파싱 에러 / 파생 fact 예상과 다름 |
| 5 readiness | A=`screen-skeleton`·B=`docs-only`, allowed/forbidden 정확 | 모드가 천장보다 높게 나옴(정책/사실 불일치) |
| 5 validate | **exit 0** | exit 1 + `[검사 N]` 위반(특히 3=depends_on, 9=Open Decisions 형식) |
| 6 packet | readiness 글자-복사, 링크-only | 게이트 수치 재계산/hand-edit 흔적 |
| 7 implement (A) | screens/ 1파일, 과구현 0, 발명 0, validate exit 0 | hooks/components/fixture 생성·useState 등 등장(천장 초과) |
| 7 implement (B) | **빈 diff + D-301 보고** | docs-only인데 src 변경 발생(게이트 무시) |
| 8 forbidden(A) | (구현 커밋/stage 후) `OK (위반 없음)`, exit 0 | `_meta` 없어 exit 2 / base 해석 실패 exit 2 / **구현 미커밋·untracked → diff 비어 헛통과** |
| 8 forbidden(sub) | src/api 파일 **커밋/stage 후** → **경고 1건 + exit 0** | untracked 라 안 잡힘(백스톱 미발화) / --enforce 없이 exit 1(=warning-first 위반) |
| 멱등 | state/readiness/validate 재실행 후 빈 diff(재생성물 외) | 재실행마다 diff 발생 |

**전 단계 공통 불변식(하나라도 깨지면 적색):**
- 판정은 `readiness.mjs` 한 곳. Work Packet/Run Report 는 소비만.
- 게이트 해제(resolve/confirm/close)는 사람만. 에이전트가 닫았으면 실패.
- API endpoint/copy/design value 발명 0.

---

## 6. Run report 에 기록할 항목  *(Must-cover #10)*

작성 모델: [`templates/work-packet/run-report.template.md`](../../frontend-workflow-kit/templates/work-packet/run-report.template.md) + [`temp/runs/implement-screen-001/implement-run-report.md`](../runs/implement-screen-001/implement-run-report.md)(표 헤더·`✅`+근거구 관례). 파일(모델): `temp/runs/consumer-dogfood-001/run-report.md`.

기록할 섹션과 **반드시 담을 값**:

1. **Frontmatter** — `run_id: consumer-dogfood-001`, `packet_id`, `fixture`(소비 프로젝트 경로 + create-expo-app 버전/커밋 `<BASELINE>`), `readiness_source`, `date`.
2. **Summary** — Step 1~8 종합 판정 표(내용·대응 Check·`✅`/근거구). 시나리오 A/B 각각.
3. **Environment** — Node/npm/git/Expo 템플릿 버전, OS, 킷 커밋 SHA(복사 시점). 재현성 핵심.
4. **Copy Manifest** — 무엇을 `tools/frontend-workflow/` 로 복사했는지(매니페스트) + skip 목록 + `npm install` 결과.
5. **Readiness Used** — `readiness.mjs` 출력을 **그대로** 옮김(`readiness_mode`/`next_mode`/`allowed`/`forbidden`/`blocking`) + **실행 명령 verbatim**(소비 프로젝트 경로). 재계산 금지.
6. **Files Changed** — 실제 변경 파일(시나리오 A=`src/features/home/screens/HomeScreen.tsx` 1개; B=없음). allowed_paths 안에만 있는지 교차 검증.
7. **Commands Run** — 각 `npm run workflow:*` 와 **exit code**. `validate` 의 실제 출력 라인("검사 N종 통과")을 그대로(README 9 vs 코드 12 표기 차이를 그대로 노출).
8. **Result** — A=천장 안 산출물 생성·validate exit 0 / B=docs-only 거절이 정답·빈 diff.
9. **Gate Compliance(하드룰 4행)** — 킷 레포 무수정 · API endpoint 발명 금지 · Open Decision/Conflict/Unknown 미닫힘 · readiness gate 무시 금지(변경 ⊆ allowed_paths). 각 `✅` + 근거.
10. **Diff Summary** — `ADDED/MODIFIED/REMOVED` 라벨. 거절/무변경이면 **완전 빈 diff** 명시. (소비 프로젝트는 진짜 git 이라 `git diff` 직접 사용 — 단 **신규 파일은 커밋/stage 후**라야 보인다: untracked 는 `git diff` 에 안 나오므로 커밋 diff(`git diff <BASELINE>..HEAD`) 또는 `git status`/`git add -N` 로 확인. implement-screen-001 의 해시 스냅샷 대체는 불필요.)
11. **forbidden-paths 출력** — Step 8 의 `OK`/경고 본문 + exit code(경고-모드 exit 0 강조) + **diff 입력 방식(`--base <BASELINE>`=커밋 기반 / `--staged`)과 구현 커밋 여부**(헛통과 아님을 보이는 근거) + (선택) 의도적 src/api 위반 sub-check 결과.
12. **Blockers Reported** — readiness `blocking`/`next_actions` 인용블록(자체 추론 금지). A=rough 전제(catalog/fake_hook); B=D-301.
13. **Idempotency** — state/readiness/validate 2차 실행 빈 diff·byte 동일·exit 0.
14. **Follow-up** — rough-fixture-ui 로 올리려면 필요한 전제(authored 본문 + `component-catalog.md` + `src/features/{domain}/hooks/*.ts` + `src/lib/asyncState.ts` 계약), 그리고 사람-전용 후속(D-301 resolve 등).
15. **Kit-applicability findings** — *이 dry-run 의 진짜 산출물*: 설치/부트스트랩에서 마찰이 있었던 지점(예: Expo `src/` 가정, `--` passthrough, state 선행 요구), 문서/스크립트 개선 후보. **킷은 고치지 않고 후보만 기록**(별도 세션 입력).

---

## 7. 리스크 / 함정

| 리스크 | 영향 | 완화 |
|---|---|---|
| Expo 최신 템플릿이 `src/` 미사용 | 정책 경로 글롭 전부 어긋남 | Step 1 에서 `src/app/` 존재 확인. 어긋나면 중단·기록(정책 무수정) |
| `forbidden-paths` 가 state/ base 없이 호출됨 | exit 2(입력 오류) | Step 5/7 의 `workflow:state` 선행, `--base <BASELINE>` 명시 |
| **구현이 미커밋/untracked 인데 `--base`/`git diff` 로 검사** | diff 가 비어 **헛통과** — 위반·신규 파일이 안 보임(Codex 리뷰 검증) | Step 7 에서 구현 커밋(작업 브랜치) 후 `--base`, 또는 `git add -A`+`--staged`. 근거 [path-backstop.mjs:320](../../frontend-workflow-kit/scripts/lib/path-backstop.mjs:320) |
| `requested_mode` 를 권한으로 오해 | 천장 초과 구현 욱여넣기 | 실행은 항상 `readiness_mode` 천장으로 scope; 초과는 거절+보고 |
| 거절(B)·경고(Step 8)를 "실패"로 오독 | 잘못된 회귀 결론 | §5 표에서 "설계된 신호"로 명시; run report Result 에 success vs blocked 구분 |
| validate "9종" vs 코드 "12종" 표기 차 | 기록 혼선 | run report 7번에 **실제 출력 라인**을 그대로 적고 차이를 주석 |
| 에이전트가 게이트를 내림(resolve/confirm) | 사람-전용 불변식 위반 | SKILL.md 금지·§2 하드룰; Gate Compliance 표로 사후 확인 |
| 소비 프로젝트 `node_modules` 가 킷 레포 오염 | 레포 더러워짐 | 소비 프로젝트를 킷 레포 **밖**에 생성(§2) |

---

## 8. Out of scope / Do not (이 계획의 경계)

- **실행하지 않는다.** 이 문서는 절차·기대·기록 항목만 고정한다(`executes: false`).
- 킷 레포의 **scripts / package.json / package-scripts.template.json** 수정 0.
- 킷 레포의 **README / CHANGELOG / roadmap** 수정 0.
- **CI 추가 0.** 로컬 수동 dry-run.
- dogfood 자체 실행(create-expo-app·복사·구현) 0 — 후속 실행 세션의 몫.
- rough-fixture-ui 이상(fake hook·fixture UI·API 연동) 도달 시도 0 — 이 dry-run 의 천장은 **screen-skeleton**(거절 시 docs-only).
- 게이트 해제(Open Decision resolve / candidate→confirmed / Conflict close) 0 — 사람-전용.
- 발견된 킷 개선은 **기록만**(run report §15) — 이 계획·세션에서 고치지 않는다.

---

## 9. 참조 (정본 경로)

- 설치 절차: [`frontend-workflow-kit/README.md`](../../frontend-workflow-kit/README.md) §설치
- 스크립트 alias 원본: [`package-scripts.template.json`](../../frontend-workflow-kit/package-scripts.template.json)
- 모드 사다리·게이트 정책: [`policies/implementation-mode-policy.yaml`](../../frontend-workflow-kit/policies/implementation-mode-policy.yaml)
- 산출물 매니페스트: [`catalog/artifact-manifest.yaml`](../../frontend-workflow-kit/catalog/artifact-manifest.yaml)
- 구현 스킬: [`skills/implement-screen/SKILL.md`](../../frontend-workflow-kit/skills/implement-screen/SKILL.md)
- Work Packet / Run Report 템플릿: [`templates/work-packet/`](../../frontend-workflow-kit/templates/work-packet/)
- 선례(형태 예시·md-only): [`temp/examples/work-packet-dry-run/README.md`](../examples/work-packet-dry-run/README.md)
- 선례(실제 게이트 준수 실행): [`temp/runs/implement-screen-001/implement-run-report.md`](../runs/implement-screen-001/implement-run-report.md)
- 게이트 출처 표(읽기 모델): [`examples/multi-screen-dry-run/reports/expected-readiness.md`](../../frontend-workflow-kit/examples/multi-screen-dry-run/reports/expected-readiness.md)
- MVP-B release-check 상태: [`temp/workflows/mvp-b-board.md`](../workflows/mvp-b-board.md)
- 게이트 인벤토리(무엇을 막고 안 막나): [`roadmap-current.md`](../../frontend-workflow-kit/roadmap-current.md#mvp-a-게이트-인벤토리-정확히-무엇을-막는가)

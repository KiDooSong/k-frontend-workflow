# Run log — diff 기반 forbidden_paths backstop (MVP)

> 목적(한 줄): readiness 의 화면별 경계를 사후에 강제하는 **diff 기반** 2차 방어선(backstop)을 구현하고, 설계 테스트 매트릭스를 실측으로 통과시킨다.
>
> - 날짜: 2026-06-14
> - 브랜치: `feat/path-backstop`
> - 설계 문서: `temp/proposals/diff-based-forbidden-paths-backstop.md` (§1–§8)
> - 단계: Finalize (Implement + 3개 verifier lens 통과 후, 마이너 2건 반영 + 매트릭스 재실측 + 본 로그 기록)

---

## 1. 무엇을 만들었나

| 산출물 | 경로 | 역할 |
|---|---|---|
| CLI | `frontend-workflow-kit/scripts/forbidden-paths.mjs` | 옵션 파싱 → state/policy 로드 → `computeReadiness` 소비 → diff record 위반 루프 → human/JSON 출력 + exit code |
| lib | `frontend-workflow-kit/scripts/lib/path-backstop.mjs` | 순수 helper: `globToRegex`/`globMatches`, `classifyForbidden`/`covers`/`thresholdOf`/`deriveGuardedSurface`, `isCleared`/`highestScreenMode`, `parseNameStatusText`/`parseNameStatusZ`, `writePathsOf`, `gitChangedRecords`(+`resolveDefaultBranch`)/`stripRoot`, `GitError`. import 시 부작용 0. |
| 픽스처 | `frontend-workflow-kit/examples/path-backstop/**` | uncleared/cleared 2개 state + diff 7케이스(case1~4,6,7) + README |

핵심 불변식 준수:
- **모드 판정 단일 출처**: `computeReadiness({ state, policy, ci: {}, manifest })` 를 그대로 소비. readiness 규칙을 재구현하지 않음.
- **diff 기반 전용**: 트리 전체 스캔 없음(`readdir`/`walkFiles`/`globby` 등 부재) — "src/api 이미 존재" 오탐을 구조적으로 회피.
- **warning-first**: 기본 exit 0(위반이 있어도 경고만). `--enforce` 시에만 위반 → exit 1.

### Finalize 단계에서 반영한 verifier 지적 (마이너 2건)

1. **미사용 import `exists` 제거** (3개 lens 공통 지적) — `forbidden-paths.mjs` L21 의 `exists` 는 한 번도 참조되지 않는 dead import 였고, "FS 존재 확인 금지(트리 스캔 회피)" 의도와도 미세하게 어긋났다. import 목록에서 제거(`parseArgs, DEFAULTS, loadYaml, readFileSafe` 만 유지).
2. **`parseNameStatusZ` 의 NUL 구분자 가독성** (spec-conformance lens) — `s.split('<NUL>')` 의 구분자가 소스에 **리터럴 제어 바이트(0x00)** 로 박혀 있어, 에디터에서 공백처럼 보여 미래 유지보수자가 `' '`(공백)으로 오인·"수정"하면 공백 포함 경로가 깨질 위험이 있었다. 동작은 정확(hex 검증 0x00)했으나, `const NUL = String.fromCharCode(0); s.split(NUL)` 로 바꿔 소스에서 리터럴 제어문자를 제거하고 의도를 명시했다. -z 파서가 공백 포함 경로(`src/api/my file.ts`)를 여전히 한 토큰으로 유지함을 재검증.

> 위 둘은 비기능 클린업이며 매트릭스 결과를 바꾸지 않는다(반영 전/후 동일). 그 외 lens 지적은 없었다(blocker/major 0건).

---

## 2. guarded surface 파생 (정책에서, 하드코딩 아님)

`deriveGuardedSurface(policy)` 가 `policies/implementation-mode-policy.yaml` 에서 다음 절차로 도출:

1. 모든 모드의 `forbidden_paths` 를 모아 `classifyForbidden` 으로 분류
   - `{domain}`/`{screen}` 포함 → **domain-scoped** (파일→화면 attribution 필요, MVP 제외)
   - `src/**` (src 루트 전체) → **blanket** (공유 코드 오탐, MVP 제외)
   - 그 외 → **global+specific** (후보)
2. global+specific 중 **threshold(S) 가 정의된 것만** 채택 (= 어떤 비-blanket 모드의 `allowed_paths` 가 S 전체를 덮음 → 레이어 경계)
3. 추가로 `openapi.yaml` + `openapi.yml` 합산 (validate.mjs 가 yaml/yml 둘 다 OpenAPI 로 취급 → `.yml` parity)

현재 정책 실측 결과 → **`["openapi.yaml", "openapi.yml", "src/api/**"]`** (모든 JSON 실행의 `guarded_surface` 필드로 확인됨).

- `src/api/**` 는 `api-integrated-ui` 의 `allowed_paths` 에 리터럴로 존재 → threshold 가짐 → 채택.
- `src/features/**` 는 route-skeleton 의 `forbidden_paths` 에 있지만, **어떤 모드도 리터럴 `src/features/**` 를 allow 하지 않는다**(allow 는 전부 `src/features/{domain}/...` 도메인 스코프) → threshold 없음 → **올바르게 제외**(§8 후속으로 미룸).
- `openapi.yaml`/`openapi.yml` 은 threshold 없음 → `cleared` 가 항상 false → 변경 시 항상 플래그.

### threshold / clearance 정의

- `threshold(src/api/**) = api-integrated-ui` (그 모드가 `src/api/**` 를 allow; blanket `src/**` 는 threshold 정의에서 제외).
- `threshold(openapi.yaml) = threshold(openapi.yml) = (없음)`.
- `cleared(S)` = **프로젝트 단위**: `∃ screen. index(screen.readiness_mode) >= index(threshold(S))`. 사다리가 누적이므로 production-ready 도 api-integrated-ui 자격을 포함. threshold 없으면 항상 false.

readiness 실측(같은 정책·매니페스트, `ci:{}`):
- **UNCLEARED** state: `{ COUPON-001: rough-fixture-ui(3), AUTH-001: final-fixture-ui(4) }` → max 4 < 5 → `cleared(src/api/**) = false`.
- **CLEARED** state(AUTH-001 의 `api_confidence_min: candidate→confirmed` 한 줄만 차이): `{ COUPON-001: rough-fixture-ui(3), AUTH-001: api-integrated-ui(5) }` → `cleared(src/api/**) = true`.

---

## 3. 설계 5개 테스트 케이스 → T1–T7 매핑 (실측)

설계 §5/§6 의 5개 핵심 케이스를 픽스처 diff 로 분해해 T1–T7 로 실행. 모든 명령은 **절대경로**, exit code 는 `$LASTEXITCODE`(PowerShell) / `$?`(bash) 실측. 공통 변수:

```
SCRIPT    = C:/Users/thdrl/source/repos/k-frontend-workflow-path-backstop/frontend-workflow-kit/scripts/forbidden-paths.mjs
EX        = C:/Users/thdrl/source/repos/k-frontend-workflow-path-backstop/frontend-workflow-kit/examples/path-backstop
UNCLEARED = $EX/docs/frontend-workflow
CLEARED   = $EX/cleared/docs/frontend-workflow
DIFFS     = $EX/diffs
```

| T# | 설계 케이스 | 명령 (요지) | 기대 | 실측 결과 |
|---|---|---|---|---|
| **T1** | §5 src/api 쓰기 = 미확정 API 메우기 (핵심 true-positive) | `node $SCRIPT --diff $DIFFS/case1-api-write.txt --docs $UNCLEARED --json` | 2 위반, exit 0 | **2 위반** `src/api/coupon.ts` (M), `src/api/newClient.ts` (A); surface `src/api/**`; screen_modes COUPON-001=rough-fixture-ui, AUTH-001=final-fixture-ui; `ok:false` `enforced:false`; **EXIT 0** |
| **T1b** | warning-first → enforce 승격 | `... case1 ... --docs $UNCLEARED --enforce` | exit 1 | 동일 2 위반, `enforced:true`; **EXIT 1** |
| **T2** | §1(c) 화면/feature 경로는 guarded 아님 (allowed 영역) | `... --diff $DIFFS/case2-screen-allowed.txt --docs $UNCLEARED --json` | 0 위반, exit 0 | `src/features/coupons/screens/CouponListScreen.tsx` 만 변경 → 비guarded; `ok:true` 위반 0; **EXIT 0** |
| **T3** | §6 generated docs 무시 (경로 위반 아님) | `... --diff $DIFFS/case3-generated-docs.txt --docs $UNCLEARED --json` | 0 위반, exit 0 | docs `_meta/workflow-state.yaml` + `screen-spec.md` → 비guarded; `ok:true` 위반 0; **EXIT 0** |
| **T4** | §1(d) rough→final 같은-경로 품질 승격 (forward 담당, backstop 제외) | `... --diff $DIFFS/case4-rough-to-final-samepath.txt --docs $UNCLEARED --json` | 0 위반, exit 0 | `src/features/coupons/components/CouponCard.tsx` → 비guarded; `ok:true` 위반 0; **EXIT 0** |
| **T5** | §1/§5 프로젝트 단위 clearance (의도된 cross-screen masking) | `... --diff $DIFFS/case1-api-write.txt --docs $CLEARED --json` | 0 위반, exit 0 | AUTH-001=api-integrated-ui 가 `src/api/**` 를 프로젝트 전역으로 열어 `coupon.ts`·`newClient.ts` 쓰기 **둘 다 침묵**; `ok:true` 위반 0; **EXIT 0** |
| **T6** | §6 rename: 새 경로만 검사, 옛 경로·삭제 침묵 (writes-only) | `... --diff $DIFFS/case6-rename.txt --docs $UNCLEARED --json` | 1 위반(`src/api/newClient.ts` 만), exit 0 | rename-IN `src/lib/oldClient.ts→src/api/newClient.ts` 만 위반(change=R); rename-OUT `src/api/legacy.ts→src/features/...` 침묵(새 경로 비guarded, 옛 경로 삭제측); `D src/api/deprecated.ts` 침묵; **EXIT 0** |
| **T7** | §4/§8 openapi: 허용 모드 없음 → 항상 플래그 | `... --diff $DIFFS/case7-openapi.txt --docs $UNCLEARED --json` | 1 위반(`openapi.yaml`), exit 0 | `openapi.yaml` (M), surface `openapi.yaml`, reason "현재 정책에 openapi.yaml 를 allow 하는 모드가 없음 → 변경 시 항상 플래그"; **EXIT 0** |

추가 enforce 실측(매트릭스 보강): `T6 + --enforce → EXIT 1`(rename-in 1건), `T7 + --enforce → EXIT 1`(openapi 1건). default(--enforce 없음)는 모든 위반 케이스에서 **EXIT 0** 으로 확인(warning-first 불변식).

---

## 4. exit-code 매트릭스

| 모드 | 조건 | exit | 근거(실측) |
|---|---|---|---|
| 정상/경고 (warning-first) | 위반 0 **또는** (위반 있음 ∧ --enforce 없음) | **0** | T1·T6·T7 default = EXIT 0 (위반 있어도 0); T2~T5 = EXIT 0 (위반 0) |
| 차단 | --enforce ∧ 위반 ≥ 1 | **1** | T1b/T6e/T7e = EXIT 1 |
| 입력 오류 (fail-closed) | state/policy 부재, git/base ref 해석 실패 | **2** | **T8** 아래 |

### T8 — fail-closed (bad `--docs`)

```
node $SCRIPT --diff $DIFFS/case1-api-write.txt --docs $EX/NO_SUCH_DIR/docs/frontend-workflow
```
실측 stderr:
```
forbidden-paths: ...\examples\path-backstop\NO_SUCH_DIR\docs\frontend-workflow\_meta\workflow-state.yaml 없음. 먼저 `npm run workflow:state` 실행하거나 --docs 를 확인하세요.
```
**EXIT 2**. `--json` 을 붙여도 동일하게 **EXIT 2**(조용히 통과/fail-open 하지 않음). 라이브 git 경로에서도 base ref 미해석 시 `GitError` → exit 2 로 surface(설계 §3 fail-closed).

---

## 5. 프로젝트 단위 API clearance 동작 (T5 / 설계 §1 의 의도된 trade-off)

`src/api/**` 는 도메인 스코프가 **아니다**(`{domain}` 없음). 따라서 변경된 `src/api/*.ts` 가 "어느 화면 소유" 인지 경로만으로는 알 수 없다(공유 인프라일 수도 있음). 그래서 MVP 의 clearance 는 **프로젝트 단위**다:

> 화면 *하나라도* `api-integrated-ui` 에 도달하면, 그 diff 의 `src/api/**` 쓰기는 **전부** 통과된다 — 아직 cleared 되지 않은 *다른* 화면 소유여도.

T5 가 이를 실측으로 보인다: cleared 픽스처는 uncleared 와 **단 한 줄**(AUTH-001 `api_confidence_min: candidate→confirmed`)만 다르고, 이로써 AUTH-001 이 api-integrated-ui(5)로 승격된다. 그 결과 COUPON-001 이 여전히 rough-fixture-ui(3, 미cleared)임에도 **AUTH 의 자격이 src/api 쓰기를 프로젝트 전역에서 침묵**시킨다(T5 위반 0).

이는 버그가 아니라 **택한 trade-off**(설계 §1). 이 킷의 1순위는 false-positive 제거(트리 스캔을 버린 이유)이고, 파일→화면 attribution 이 없으면 정확한 화면별 판정은 불가능하다. 따라서 MVP 는 "프로젝트가 API 레이어를 열 자격을 얻었는가" 라는 굵은 게이트만 건다. 이 **의도된 false-negative**(cross-screen masking)는 §8 의 도메인 attribution 후속이 닫는다.

---

## 6. MVP 스코프 & 한계

- **writes-only**: A/M + rename 의 **새 경로**만 검사. 미확정 API 를 *작성*하는 것이 핵심 실패 모드.
- **삭제(D)·rename 옛 경로 비대상**: 제거는 환각 계약을 못 만든다(§8 `--include-deletions` 후속).
- **cross-screen masking**: clearance 가 프로젝트 단위(§1 의도된 false-negative). 화면별 attribution 은 §8.
- **warning-first**: 기본 비차단. FP 율 관찰 후 `--enforce`/CI 승격.
- **CI 미통합**: `.github/workflows/**` 미수정(이번 작업 범위 밖). 설계상 별도 step 제안만 존재.
- **guarded surface 미분할**: 정책이 sub-glob(예 `src/api/schemas/**`)을 더 낮은 모드에서 allow 하면 분할 필요 — MVP 는 미분할 가정(§8).
- **의존성**: Node 내장 + `yaml` 만.

### Do-not 확인 (불변식/제약 준수)

- `scripts/validate.mjs` — **미수정**(byte-for-byte). tracked diff·untracked status 모두 공란.
- `scripts/readiness.mjs` — **미수정**. `computeReadiness` 를 import 해 소비만 함(규칙 재구현 0).
- `package.json` — **미수정**. npm 스크립트/별칭 추가 없음.
- `.github/workflows/**` — **미수정**(CI 변경 없음).
- Open Decision — **하나도 해결하지 않음**.
- `git status --porcelain`(worktree) 실측: `?? examples/path-backstop/`, `?? scripts/forbidden-paths.mjs`, `?? scripts/lib/path-backstop.mjs` (+ 본 run log). 허용 표면 외 변경 없음.

---

## 7. run-log 경로 메모

work packet 은 run-log 경로를 두 가지로 적고 있다: `temp/runs/path-backstop-001.md` 와 `frontend-workflow-kit/temp/runs/path-backstop-001.md`. 스크립트/실행 CWD 가 `frontend-workflow-kit` 이므로 둘은 **같은 파일**로 resolve 된다. 본 로그가 그 파일이며, 절대경로는:

`C:/Users/thdrl/source/repos/k-frontend-workflow-path-backstop/frontend-workflow-kit/temp/runs/path-backstop-001.md`

---

## 8. Codex 리뷰 반영 (v2 — 2026-06-14)

후속 요청으로 Codex(`codex:rescue`)에 **read-only** 리뷰를 맡겨 "해소될 때까지" 반복했다. 3개 라운드 결과와 반영 내역(모든 수정은 허용 파일에만 — `forbidden-paths.mjs`/`lib/path-backstop.mjs`/`examples/path-backstop/**`).

### 라운드 1 — 2건, 모두 반영
1. **[blocker]** `resolveDefaultBranch()` 가 `origin/HEAD` 해석 실패 시 `'main'` 으로 폴백 → 엉뚱한 base 로 diff 하는 fail-open. **FIX**: 폴백 제거, `GitError` throw → CLI exit 2(설계 §3 "절대 fail-open 금지"). origin/HEAD 가 정상이면 happy path 는 그대로(Tg=exit0).
2. **[major]** 손상된 name-status 레코드를 조용히 skip/truncate → 손상 행이 guarded 쓰기를 가릴 수 있음. **FIX**: `DiffParseError` 도입, 두 파서(text/-z)가 손상 시 throw, CLI catch 가 `GitError||DiffParseError` → exit 2. 픽스처 `diffs/case8-malformed.txt` 추가 → **T9: exit 2**.

### 라운드 2 — 이전 2건 fixed 확인 + 신규 1건, 반영
3. **[major]** 파일은 있으나 YAML 이 손상된 state/policy/manifest 가 `try/catch` 밖에서 `YAMLParseError` 전파 → stack trace + **exit 1**(=enforce 위반 코드와 혼동). **FIX**: `forbidden-paths.mjs` 에 로컬 `loadYamlOrExit()` 래퍼 추가(state/policy/manifest) → 손상 YAML 도 exit 2. 공유 `util.loadYaml` 은 다른 스크립트 의존성이라 **미변경**. 픽스처 `malformed-state/.../workflow-state.yaml` 추가 → **T10: exit 2**.
   - *nit*: 에러 클래스가 사용처보다 뒤에 선언 → 파일 상단으로 이동(가독성). *nit*: `typeof flags.range==='string'` 은 방어적으로 올바름 → 유지.

### 라운드 3 — 이전 fixed 확인 + 3건(실제) + 1건(거짓양성)
4. **[major]** `writePathsOf` 가 `T`(typechange) 등 미지정 단일 경로 status 를 default 로 무음 drop → guarded 파일의 typechange 가 backstop 우회. **FIX**: `A/M/T`(+미지정 단일경로)→`[path]`, `R/C`→`[newPath]`, **`D` 만 침묵**. 픽스처 `diffs/case9-typechange.txt` 추가 → **T11: `src/api/legacy.ts`(T) 1건 위반**.
5. **[major]** 위반 루프가 `guardedSurface.find`(첫 매칭)만 검사 → 겹치는 surface 에서 broader-cleared 가 narrower-uncleared 를 가릴 수 있는 순서 의존. **FIX**: 매칭 surface 전체를 모아 **가장 좁은(구체적인)** surface 로 판정(설계 §4/§8 최협 매칭). 현재 MVP 정책엔 겹침이 없어 동작 동일(무회귀), 미래 surface 추가에 안전.
6. **[minor]** 텍스트 파서가 **초과** 필드를 무음 drop. **FIX**: 정확 필드수 강제(단일경로 2, rename/copy 3), 위반 시 `DiffParseError`.
   - **[blocker — 거짓양성, 철회]** "모듈이 구문상 깨져 파싱 불가(line 44 주석 안 `}`, 217/223/314 미닫힌 template literal)". → **반증**: `node --check` 가 양쪽 파일 모두 통과, 그리고 T1~T11 이 그 모듈을 정상 실행함. 지적된 줄은 `} else if ('.+?^${}()|[]\\'.includes(c)) {`(path-backstop.mjs:47) — 정규식 메타문자를 담은 **단일 인용 문자열**(template literal 아님)이다. 근거 제시 후 철회 요청.

### 최종 실측 매트릭스 (전부 green)

| T# | 시나리오 | exit | 위반 |
|---|---|---|---|
| T1 | src/api 쓰기(uncleared) | 0 | 2 (coupon.ts, newClient.ts) |
| T1b | + `--enforce` | 1 | 2 |
| T2 | feature/screen 경로 | 0 | 0 |
| T5 | src/api 쓰기(**cleared**) | 0 | 0 (프로젝트 단위 clearance) |
| T6 | rename(in/out) + D | 0 | 1 (newClient.ts, rename-IN만) |
| T7 | openapi.yaml | 0 | 1 |
| **T8** | state 부재 | **2** | — |
| **T9** | 손상 `--diff` | **2** | — |
| **T10** | 손상 state YAML | **2** | — |
| **T11** | `T` typechange on src/api | 0 | 1 (legacy.ts) |
| **T12** | 손상 status 토큰 `D123` | **2** | — |
| **Tg** | 라이브 git local-default happy path | 0 | 0 |

`node --check` 양쪽 OK. 최종 worktree 변경: `scripts/forbidden-paths.mjs`, `scripts/lib/path-backstop.mjs`, `examples/path-backstop/**`(state 2 + cleared + malformed-state + diffs 7종 + README), `temp/runs/path-backstop-001.md`. 금지 파일(validate.mjs/readiness.mjs/package.json/.github) 여전히 byte-for-byte 미변경.

### 라운드 4 (포그라운드, fresh thread — 2건, 모두 반영)
사용자 요청으로 **포그라운드** 재리뷰(새 fresh 스레드, 정상 동작). 2건 — 둘 다 malformed 입력 fail-closed 강화:
7. **[major]** 파서가 status 토큰을 **첫 글자로만** 분류 → `D123<TAB>path` 가 `D` 로 오분류돼 무음 drop(fail-open). **FIX**: 두 파서(text/-z)가 토큰 **전체** 검증 — `/^[RC]\d*$/`=2경로(rename/copy), `/^[A-Z]$/`=1경로 단일 status, 그 외 `DiffParseError`. 픽스처 `diffs/case10-bad-status.txt` → **T12: exit 2**.
8. **[minor]** `stripRoot` 가 `--root` 의 선행 `./` 를 정규화 안 함 → `./pkg/...` 가 repo-root 상대 diff 경로와 매칭 안 돼 monorepo false-negative. **FIX**: 선행 `./`·`/./`·후행 `/` 정규화. 유닛 체크 `stripRoot('frontend-workflow-kit/examples/coupon-feature/src/api/x.ts','./frontend-workflow-kit/examples/coupon-feature') === 'src/api/x.ts'` OK.

### 라운드 5 (포그라운드 확인 패스) — **NO ACTIONABLE FINDINGS** ✅
라운드 4 의 2건 반영 후 포그라운드 확인 리뷰에서 Codex 가 **"NO ACTIONABLE FINDINGS"** 로 클린 통과. → Codex 리뷰 루프 **수렴**.

### Codex 런타임 메모(정직성)
이 환경에서 Codex CLI 워커의 일부 셸 명령이 `declined(exit -1)` 되어 **라운드 2~3 세션이 교착**됐고(그때마다 rescue 서브에이전트가 파일 직접 읽기 + 수동 분석으로 리뷰 산출), 라운드 3 의 거짓양성(#1)도 워커가 `node --check` 를 못 돌린 정황과 일치한다. 멈춘 워커를 정리(cancel/kill)한 뒤 **새 fresh 스레드를 포그라운드로 띄우자 정상 동작**하여 라운드 4(실제 2건)와 라운드 5(클린 통과)를 받았다. 총 5라운드에서 **표면화된 모든 findings 는 반영·독립 검증 완료**, 마지막 확인 패스도 클린.

# route-tree generated header command 정렬 (nav-graph 형식)

> 날짜: 2026-06-14
> 브랜치: `fix/route-tree-header-command` (워크트리 `…/k-frontend-workflow-route-tree-header` — `main` 무변경)
> 베이스: `origin/main` @ `7fb6a61` (PR #23 머지 이후, PR #24 execution-loop 초안 포함)
> 성격: **작은 follow-up** — route-tree 생성기 출력 헤더의 `# Command:` 한 줄만 nav-graph 와 동일한 *생성기 직접 호출* 형태로 정렬. 라우트 추출/정규화 로직, 패키지 스크립트, CI, readiness/validate 는 **불변**.

## 1. 변경 파일

코드/픽스처 (6개, 추적):

| 파일 | 변경 내용 |
|---|---|
| `frontend-workflow-kit/scripts/route-tree.mjs` | CLI 가 `renderRouteTree` 에 넘기는 명시 `command` 문자열 교체 |
| `frontend-workflow-kit/scripts/lib/route-tree.mjs` | `renderRouteTree` 의 `command` 기본값(fallback) 문자열 교체 — 두 곳 모두 바꿔 댕글링 잔존 0 |
| `frontend-workflow-kit/examples/route-tree/basic-app/expected/route-tree.txt` | 헤더 3행만 |
| `frontend-workflow-kit/examples/route-tree/basic-app/docs/frontend-workflow/_meta/route-tree.txt` | 헤더 3행만 (생성기 재실행으로 재생성) |
| `frontend-workflow-kit/examples/route-tree/edge-cases/expected/route-tree.txt` | 헤더 3행만 |
| `frontend-workflow-kit/examples/route-tree/edge-cases/docs/frontend-workflow/_meta/route-tree.txt` | 헤더 3행만 (생성기 재실행으로 재생성) |

문서 (1개, 신규): `frontend-workflow-kit/temp/runs/route-tree-header-command-001.md` (본 문서).

`git status` 는 위 6개 추적 파일 수정 + 본 문서만 보여준다. 그 외 추적 파일 변경 0 (nav-graph·package.json·CI·validate·readiness·매니페스트·README/CHANGELOG/roadmap 무변경).

## 2. 이전 헤더 (old)

```txt
# Command: npm run workflow:route-tree
```

## 3. 새 헤더 (new)

```txt
# Command: node scripts/route-tree.mjs --app src/app --out docs/frontend-workflow/_meta/route-tree.txt
```

이 문자열은 (a) route-tree 생성기 출력, (b) 두 example 의 `expected/route-tree.txt` 골든, (c) 두 example 의 `docs/frontend-workflow/_meta/route-tree.txt` 생성본 **세 곳 모두에서 동일**하다. nav-graph 가 쓰는 형식(`# Command: node scripts/nav-graph.mjs --docs docs/frontend-workflow`, `scripts/nav-graph.mjs:35`)과 같은 *생성기 직접 호출* 패턴이며, 인자값은 route-tree CLI 의 문서화된 기본값(`scripts/route-tree.mjs:5-6`: `--app src/app  --out docs/frontend-workflow/_meta/route-tree.txt`)과 일치한다.

## 4. 왜 PR #23 과 분리되는가

- PR #23(MVP-C generated views 통합)의 **하드룰**은 route-tree 로직(`scripts/route-tree.mjs`·`scripts/lib/route-tree.mjs`) 및 픽스처 수정을 **금지**했다(메타데이터/패키징/문서 정리만 허용).
- PR #23 자체 보고서 `temp/runs/mvp-c-generated-views-integration.md` 가 이 댕글링 명령을 **명시적으로 식별·보류**했다:
  - §3 발견 #4: "route-tree 생성기 출력 헤더가 댕글링 `npm run workflow:route-tree` 하드코드(`scripts/lib/route-tree.mjs`). nav-graph 가 29a401c 에서 고친 것과 동일 문제이나 route-tree 는 미수정. → **보류: 별도 과제**".
  - §5 보류·§6 후속 #2: "route-tree 헤더 댕글링 명령 통일을 **별도 PR** 로 진행할지(권고)".
- 즉 nav-graph 의 동일 헤더는 PR #23 진행 중 커밋 29a401c 에서 이미 *직접 호출* 형태로 정렬됐고, route-tree 만 하드룰 때문에 남겨졌다. **본 PR 이 그 권고된 별도 후속**이며, 생성기 로직 + 픽스처를 함께 건드리므로 PR #23 범위(비로직)와 자연히 분리된다.
- 참고: PR #23 에서 `package.json` 에 `workflow:route-tree` alias 가 추가되어 alias *자체*는 이미 동작한다. 본 변경은 alias 를 없애는 게 아니라 **생성물 헤더가 안내하는 재현 명령**을 nav-graph 와 같은 결정적·자기완결 형태로 통일하는 것이다(alias 는 그대로 유효).

## 5. 픽스처 업데이트

- `expected/route-tree.txt` 골든 2개: 3행(`# Command:`)만 Edit. 본문(박스드로잉 트리 라인)은 무변경.
- `docs/frontend-workflow/_meta/route-tree.txt` 생성본 2개: 생성기 재실행으로 재생성 → 새 헤더 자동 반영, 본문 무변경.
- **`_meta` ↔ `expected` byte-identical 검증**(git blob 해시, 같은 example 내 동일):
  - basic-app: `_meta`·`expected` 모두 `2e3b12e → 2b6d0ac`
  - edge-cases: `_meta`·`expected` 모두 `9cb92c8 → 2be1fbb`
- `git diff` 가 네 파일 모두에서 `-# Command: npm run workflow:route-tree` / `+# Command: node scripts/route-tree.mjs …` **단 한 줄**만 보여준다(본문 변경 0).
- 주의: route-tree example 픽스처는 `scripts/test-fixtures.mjs` 가 검사하지 않는다(harness 는 reconcile/integrity/pipeline/path-backstop 종류만 다룸 + repo-root `temp/runs` 참조). 따라서 `expected`↔`_meta` 일관성은 **수동 유지**이며 위 해시 동일성으로 확인했다. (이 사실은 PR #23 §4.4 의 "두 생성기는 test-fixtures 미등록" 기록과 일치 — 본 PR 은 등록을 추가하지 않는다.)

## 6. 실행한 명령 (모두 워크트리 kit 디렉토리, PowerShell=비샌드박스)

> 환경 주의: 이 Windows 환경의 Bash 툴은 파일 쓰기를 샌드박싱한다(node 가 exit 0 이어도 파일 미영속). 쓰기·검증은 PowerShell 로 수행했다.

```text
npm install --no-audit --no-fund                       # 워크트리 dep 부트스트랩(yaml 1개), exit 0
node scripts/route-tree.mjs --app examples/route-tree/basic-app/src/app  --out examples/route-tree/basic-app/docs/frontend-workflow/_meta/route-tree.txt   # exit 0
node scripts/route-tree.mjs --app examples/route-tree/edge-cases/src/app --out examples/route-tree/edge-cases/docs/frontend-workflow/_meta/route-tree.txt  # exit 0
node --check scripts/route-tree.mjs                     # exit 0
node --check scripts/lib/route-tree.mjs                 # exit 0
npm run example:state                                   # exit 0 (2 screen(s) 생성)
npm run example:readiness                               # exit 0
npm run example:validate                                # exit 0 — "workflow:validate — OK (검사 12종 통과)"
npm test                                                # exit 0
```

`npm test` 결과:
- `test-fixtures — PASS (21 fixtures: 20 pass, 1 xfail, 0 xpass, 0 xdrift, 0 fail)` — PR #23 베이스라인(20 pass/1 xfail)과 동일.
- spec 스위트(`spec.test.mjs` + `api-manifest.test.mjs`): `tests 15, pass 15, fail 0`.

## 7. 패키지/CI/validate/readiness 동작 무변경 확인

- **package**: `package.json`·`package-scripts.template.json` 미수정. `workflow:route-tree` 등 alias 그대로 — alias 는 생성기를 호출할 뿐이고, 바뀐 건 생성기가 *출력하는* 헤더 문자열뿐이다.
- **CI**: `.github/workflows/**` 미수정. 신규 step·gate 추가 0.
- **nav-graph**: `scripts/nav-graph.mjs` 미수정 → nav-graph 출력 불변(헤더 형식의 *원본 패턴*이므로 본 변경은 nav-graph 를 따라 정렬한 것).
- **validate**: `example:validate` 12종 통과(베이스라인 동일). validate 검사 6 은 생성물의 `GENERATED FILE — DO NOT EDIT` 마커(em-dash)를 grep 하는데 그 줄은 **무변경**이고 `# Command:` 줄은 검사 대상이 아니다. 또한 `example:validate` 타깃은 `examples/coupon-feature` 로 route-tree `_meta` 를 포함하지 않아 본 변경과 직교한다.
- **readiness/state**: 결정적 생성기 재실행에도 `git status` 에 추가 diff 0 — 커밋된 출력과 동일. 판정 로직 무변경.
- **게이트 총평**: 변경된 추적 파일은 §1 의 6개뿐. route 추출 규칙·route group 정규화·라이브러리 로직 무변경(`scanAppDir`/`computeRoute`/`renderChildren` 손대지 않음; `renderRouteTree` 의 `command` 문자열만 교체).

## 8. 하드룰 준수

- ✅ route 추출 동작 무변경  ✅ route group 정규화 무변경  ✅ nav-graph 미터치
- ✅ 패키지 스크립트 추가 0  ✅ CI 추가 0  ✅ 릴리스 문서(README/CHANGELOG/roadmap) 미수정
- ✅ Forbidden 파일(package.json, package-scripts.template.json, .github/**, nav-graph.mjs, readiness.mjs, workflow-state.mjs, validate.mjs, artifact-manifest.yaml, README.md, CHANGELOG.md, roadmap-current.md) 전부 미터치

## 9. 워크트리/메인 상태

- 작업은 전부 격리 워크트리(`fix/route-tree-header-command`)에서 수행. `main` 체크아웃에는 커밋·편집하지 않았다.
- 참고(무해): 세션 중 외부 프로세스(IDE 자동 fetch 추정)가 로컬 `main` 을 `8d7b316 → 7fb6a61` 로 **fast-forward** 시켰다(reflog `pull --ff-only`). 이는 origin/main 의 무관한 execution-loop 초안 3커밋을 따라잡은 것뿐이며, route-tree 관련 내용·커밋 손실 0, 그리고 본 브랜치 베이스(7fb6a61)와 동일 커밋이라 정합적이다. 내가 `main` 에 가한 변경은 없다.

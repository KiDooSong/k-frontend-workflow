# Run report — check-generated-files 2.5A (skeleton)

> Status: IMPLEMENTATION (small). Date: 2026-06-14.
> Branch: `feat/mvp-c-check-generated-2-5a` (new, off `main`).
> Worktree: `../k-frontend-workflow-2-5a` (main checkout left untouched).
> Step: generated-file guard **v1 · 2.5A** — CLI skeleton + manifest read + candidate list.
> Design: [`generated-file-guard-design.md`](../proposals/generated-file-guard-design.md) (this is the
> first code slice of design **PR B**; design PR B's header/marker checks are split out — see §"무엇을 하지 않았는지").

---

## 0. 단계 번호 / 범위

generated-file guard **v1** 은 세 PR 로 쪼갠다:

| 단계 | 내용 | 본 PR |
|---|---|---|
| **2.5A** | CLI skeleton + manifest 읽기 + v1 후보(route-tree·nav-graph) 나열. 검사 없음. | ← 여기 |
| 2.5B | manifest 기반 discovery 정교화(kind/generated/status/do_not_edit) + skip 사유 + 안정 JSON. | 후속 |
| 2.5C | route-tree·nav-graph reproduce-to-scratch 비교(warning-first). | 후속 |

v1 대상은 **route-tree·nav-graph whole-file generated artifact 로만 한정**한다(설계 §0.3, §1.7).
component-catalog(§1.5)·eslint-workflow-config(§1.6)·in-file generated block(§1.4)·workflow-state·
screen-inventory 는 v1 제외.

---

## 1. 무엇을 했는지

- **`scripts/check-generated-files.mjs`** (CLI) 신규 추가. CLI 표면만 만든다:
  - `--list` · `--json` · `--docs <dir>` · `--src <dir>` · `--manifest <file>` · `--artifact <id>`.
  - manifest 를 읽어(`loadYamlOrExit`) v1 후보를 나열한다. 기본 실행 == `--list` (검사 없음).
  - 기본 exit 0. exit 1(검사 실패) 경로 없음.
- **`scripts/lib/check-generated-files.mjs`** (lib) 신규 추가. 부작용 없는 순수 로직:
  - `V1_ARTIFACT_IDS = ['nav-graph','route-tree']` — v1 allowlist.
  - `selectArtifactIds(requested)` — `--artifact` 를 v1 정책으로 해소(비-v1 면 빈 배열).
  - `listCandidates(manifest, {allowlist})` — `kind:generated` ∧ allowlist 인 엔트리를 id 정렬해 반환.
- CLI/lib 분리 이유: lib 를 2.5B/2.5C 단위 테스트로 직접 소비하기 위함(테스트 용이성).

### 동작 확인(요약)
- 기본/`--list`: `nav-graph`, `route-tree` 2개 후보 나열, exit 0.
- `--artifact route-tree`: route-tree 1개로 좁힘.
- `--artifact workflow-state`(비-v1): "v1 가드 대상 아님" 안내 + 후보 0, exit 0.
- `--manifest does-not-exist.yaml`: 설정 오류 → exit 2.
- `--list --json`: 안정적인 JSON(키 고정·후보 id 정렬). 경로는 cwd 상대 posix.

---

## 2. 무엇을 하지 않았는지 (deferral)

- **재생성 비교(reproduce-to-scratch) 없음** — 2.5C.
- **헤더/마커 무결성 검사 없음** (설계 §3). v1(2.5A–C)은 discovery + route-tree/nav-graph
  reproduce-to-scratch 에 집중한다 — 헤더-presence(§3.1–3.5)·in-file block marker(§3.6–3.8)는
  이 v1 범위 밖, 후속(설계 PR B 헤더 파트 / PR E).
- **manifest command ↔ 생성 헤더 `# Command:` 문자열 비교 없음**(설계 §2.1, §8.1). 헤더가 manifest
  command 와 다르다는 이유로 실패시키지 않는다.
- **exit 1 검사 없음 · `--enforce` 없음** — 2.5A 는 항상 exit 0(설정 오류만 exit 2).
- **package.json script 미추가** — 기본 방침대로 추가하지 않음(설계 §0.3: alias 는 `//roadmap`
  유지). CI 미배선.
- **CI 변경 없음**(`.github/**` 무수정) · **새 hard gate 없음** · `continue-on-error` 변경 없음.
- **validate/readiness/workflow-state/forbidden-paths 변경 없음**.
- **artifact-manifest.yaml 변경 없음**(필드 추가 없음 — `header_command` 는 설계상 PROPOSED-only).
- **component-catalog generator 미구현** · **in-file generated block guard 미구현**.
- **test-fixtures.mjs / lib/test-fixture.mjs 변경 없음** — golden 하니스 무수정.

---

## 3. 결정 (이 단계에서 못박은 것)

1. **lib/CLI 분리** — `scripts/lib/check-generated-files.mjs` 를 둔다(설계상 optional). 순수 로직을
   분리해 2.5B/2.5C 에서 단위 테스트한다.
2. **v1 allowlist 하드코딩** — `['nav-graph','route-tree']`. manifest 가 더 많은 생성물을 등록해도
   v1 은 이 둘만 본다(설계 §0.3 hard scope).
3. **`--artifact` 는 v1 교집합** — v1 대상 하나로만 좁힌다. 비-v1 id 는 빈 결과 + 안내(침묵 금지).
4. **warning-first / exit 계약** — 검사 실패로 인한 exit 1 은 도입하지 않는다. 설정 오류(manifest
   부재/형식오류/YAML 손상)만 exit 2 — validate 와 동일 계약(설계 §6.1; `validate.mjs:109-112`
   사후 null/객체 가드 복제).
5. **출력 경로 정규화** — 절대경로(머신 종속)를 흘리지 않고 cwd 상대 posix 로 표시(JSON 안정성).

---

## 4. 검증 결과

워크트리(`../k-frontend-workflow-2-5a/frontend-workflow-kit`)에서 실행. `main` 무수정.

| # | 명령 | 결과 |
|---|---|---|
| 1 | `node --check scripts/check-generated-files.mjs` | OK (exit 0) |
| 2 | `node --check scripts/lib/check-generated-files.mjs` | OK (exit 0) |
| 3 | `npm run example:validate` | `workflow:validate — OK (검사 12종 통과)` · exit 0 |
| 4 | `npm run example:test` | `test-fixtures — PASS (25 fixtures: 24 pass, 1 xfail, 0 fail)` · exit 0 |
| 5 | `npm test` | 위 PASS + node:test `pass 15 / fail 0` · exit 0 |
| 6 | `node scripts/check-generated-files.mjs` (기본) | route-tree·nav-graph 2개 나열 · exit 0 |
| 7 | `node scripts/check-generated-files.mjs --manifest does-not-exist.yaml` | 설정 오류 · exit 2 |
| 8 | `git diff -- .github package.json scripts/{validate,readiness,workflow-state,forbidden-paths}.mjs catalog/artifact-manifest.yaml scripts/test-fixtures.mjs scripts/lib/test-fixture.mjs` | **empty** |

`xfail` 1건은 의도된 expected-failure witness(`reconcile-input-001`) — 회귀 아님(하니스 `0 fail`).

---

## 5. 변경 파일

신규 2개만(허용 위치):

- `frontend-workflow-kit/scripts/check-generated-files.mjs` *(신규 — CLI)*
- `frontend-workflow-kit/scripts/lib/check-generated-files.mjs` *(신규 — lib)*
- `frontend-workflow-kit/temp/runs/check-generated-files-2-5a.md` *(신규 — 본 보고)*

추적 파일 수정 0(forbidden diff empty).

---

## 6. 하드룰 준수

| 하드룰 | 상태 | 근거 |
|---|---|---|
| hard gate 승격 금지 | ✅ | 검사 자체 없음 · `continue-on-error` 무수정 |
| required CI check 추가 금지 | ✅ | `.github/**` 무수정 |
| `.github/**` 변경 금지 | ✅ | diff empty |
| validate/readiness/workflow-state/forbidden-paths 변경 금지 | ✅ | diff empty |
| component-catalog generator 구현 금지 | ✅ | 미구현 |
| in-file generated block guard 구현 금지 | ✅ | 미구현 |
| manifest command ↔ 생성 헤더 문자열 비교 금지 | ✅ | 비교 코드 없음 |
| package.json script 추가 금지(기본) | ✅ | 무수정 |
| exit 1 검사 금지(2.5A) | ✅ | 검사 실패 exit 1 경로 없음(설정 오류만 exit 2) |
| manifest 필드 변경 금지 | ✅ | `catalog/artifact-manifest.yaml` 무수정 |
| route-tree/nav-graph 재생성 비교 구현 금지(2.5A) | ✅ | 미구현(2.5C) |

---

## 7. 다음 단계

**2.5B** — manifest 기반 discovery 정교화: `kind:generated ∧ generated:true ∧ status:active ∧
do_not_edit:true` 로 생성물을 찾되 v1 실검사 대상은 route-tree·nav-graph allowlist 로 제한, 존재하지
않는 planned/생성기 없는 항목은 skip 사유 명시, `--list --json` 안정 출력 보강.

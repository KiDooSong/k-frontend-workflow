# Run report — check-generated-files 2.5B (discovery)

> Status: IMPLEMENTATION (small). Date: 2026-06-14.
> Branch: `feat/mvp-c-check-generated-2-5b` (new, off `main` @ 2.5A).
> Worktree: `../k-frontend-workflow-2-5b` (main checkout left untouched).
> Step: generated-file guard **v1 · 2.5B** — manifest 기반 generated-artifact discovery.
> Design: [`generated-file-guard-design.md`](../proposals/generated-file-guard-design.md)
> (§1.7 guardability matrix · §2 manifest contract · §5 planned/must-not-fail).

---

## 0. 단계 번호 / 범위

generated-file guard **v1** 의 두 번째 슬라이스. 2.5A(skeleton) → **2.5B(discovery)** → 2.5C(reproduce).

이 단계는 manifest 의 **모든** 생성물(`kind:generated`)을 분류한다:
- **selected (v1 가드 대상)** = `generated:true ∧ status:active ∧ do_not_edit:true ∧ id∈allowlist`.
  allowlist 는 route-tree·nav-graph 둘 뿐.
- **skip** = 그 외(planned·수동모드·비-allowlist). skip 사유를 명시한다(must-not-fail).

여전히 **재생성/헤더/본문 검사는 하지 않는다** — 2.5C 소관.

---

## 1. 무엇을 했는지

- **`scripts/lib/check-generated-files.mjs`** — `listCandidates`(2.5A) 를 더 정교한
  **`discoverArtifacts(manifest, {allowlist})`** 로 교체:
  - manifest 의 `kind:generated` 엔트리를 **전부** 분류(authoring 제외).
  - 각 엔트리에 `selected` 와 `skip_reasons[]` 부여. `skip_reasons[0]` 이 1차(가장 근본) 사유:
    generated 플래그 없음 → status!=active(planned) → do_not_edit!=true(수동) → v1 allowlist 밖.
  - `source`(파생 입력 글롭)도 함께 읽어 둔다(2.5C 재생성 입력 준비).
  - 결과는 id 정렬(안정 출력). `V1_ARTIFACT_IDS`·`selectArtifactIds` 는 유지.
- **`scripts/check-generated-files.mjs`** — CLI 가 `discoverArtifacts` 를 소비. `--artifact` 는
  discovery 이후 **표시/작업 집합**을 좁히는 필터로 적용(분류 자체는 intrinsic). `--list --json`
  안정화: 키 고정 + 후보 id 정렬 + 경로 cwd-상대 posix.
- **`scripts/lib/check-generated-files.test.mjs`** (신규) — discovery/select 단위 테스트 9건.
  합성 manifest 로 분기 전수 + 실제 `artifact-manifest.yaml` 분류 일치까지 검증.
  **CI/package 미배선**(하드룰). 실행: `node --test scripts/lib/check-generated-files.test.mjs`.

### 실제 분류 결과(번들 manifest)
```
생성물 6개 (selected 2):
  [skip]     component-catalog       -- status: planned …
  [skip]     eslint-workflow-config  -- status: planned …
  [selected] nav-graph               -> docs/frontend-workflow/_meta/nav-graph.yaml
  [selected] route-tree              -> docs/frontend-workflow/_meta/route-tree.txt
  [skip]     screen-inventory        -- v1 가드 대상 아님 (v1: nav-graph, route-tree)
  [skip]     workflow-state          -- v1 가드 대상 아님 (v1: nav-graph, route-tree)
```
(`screen-spec` 등 authoring 엔트리는 후보가 아니라 목록에 없음.)

---

## 2. 무엇을 하지 않았는지 (deferral / 금지 준수)

- **재생성(reproduce-to-scratch) 비교 없음** — 최소 smoke 이상으로 확장하지 않음(2.5C). 생성기를
  실행하지 않는다.
- **헤더/마커 무결성 검사 없음** · **manifest command ↔ 헤더 `# Command:` 문자열 비교 없음**(§2.1, §8.1).
- **component-catalog 미포함** — planned 로 분류해 skip(생성기 실행 안 함). 생성기 구현 안 함.
- **workflow-state / screen-inventory 미포함** — v1 대상 아님으로 분류해 skip(재생성 안 함).
- **exit 1 검사 없음 · `--enforce` 없음** — 항상 exit 0(설정 오류만 exit 2).
- **package.json / CI 변경 없음** — 새 테스트도 npm test/CI 에 배선하지 않음(`//roadmap` 유지).
- **manifest 필드 변경 없음** — `catalog/artifact-manifest.yaml` 무수정(읽기만).
- **validate / readiness / workflow-state / forbidden-paths / test-fixtures / lib/test-fixture 무수정.**
- **in-file generated block guard 없음.**

---

## 3. 결정

1. **discovery 는 intrinsic, `--artifact` 는 view/action 필터** — `discoverArtifacts` 는 고정
   V1 allowlist 로 selected 를 판정한다(어떤 id 가 v1 대상인지/왜 skip 인지는 --artifact 와 무관).
   `--artifact` 는 그 위에서 표시·작업 집합만 좁힌다. → "route-tree 만 보고 싶다" 가 "nav-graph 는
   v1 대상 아님" 같은 오해 문구를 만들지 않는다.
2. **skip 사유 우선순위** — planned 가 do_not_edit/allowlist 보다 1차. 생성기 부재가 가장 근본
   원인이라 먼저 보여준다(component-catalog·eslint-workflow-config 가 "planned" 로 읽힘).
3. **JSON 스키마 안정화** — `candidates`(2.5A) → `artifacts`(분류 레코드) + `selected`(id 배열).
   이 단계가 JSON 을 고정하는 슬라이스라 2.5A→2.5B 스키마 변화는 의도된 것. 2.5C 는 여기에 검사
   결과를 **추가**만 한다.
4. **테스트 파일은 두되 미배선** — 하드룰상 package/CI 무변경. on-demand 실행 + run report 에 명령 기록.

---

## 4. 검증 결과

워크트리(`../k-frontend-workflow-2-5b/frontend-workflow-kit`)에서 실행. `main` 무수정.

| # | 명령 | 결과 |
|---|---|---|
| 1 | `node --check scripts/check-generated-files.mjs` | OK |
| 2 | `node --check scripts/lib/check-generated-files.mjs` | OK |
| 3 | `node --check scripts/lib/check-generated-files.test.mjs` | OK |
| 4 | `node --test scripts/lib/check-generated-files.test.mjs` | **tests 9 / pass 9 / fail 0** |
| 5 | `npm run example:validate` | `OK (검사 12종 통과)` |
| 6 | `npm run example:test` | `PASS (25 fixtures: 24 pass, 1 xfail, 0 fail)` |
| 7 | `npm test` | 위 PASS + node:test `pass 15 / fail 0` |
| 8 | `node scripts/check-generated-files.mjs --json` ×2 | **두 실행 출력 동일**(결정적) |
| 9 | forbidden-file `git diff` | **empty** |

`xfail` 1건은 의도된 witness(`reconcile-input-001`).

---

## 5. 변경 파일

- `frontend-workflow-kit/scripts/check-generated-files.mjs` *(수정 — discoverArtifacts 소비)*
- `frontend-workflow-kit/scripts/lib/check-generated-files.mjs` *(수정 — listCandidates→discoverArtifacts)*
- `frontend-workflow-kit/scripts/lib/check-generated-files.test.mjs` *(신규 — 단위 테스트, 미배선)*
- `frontend-workflow-kit/temp/runs/check-generated-files-2-5b.md` *(신규 — 본 보고)*

추적된 forbidden 파일 수정 0.

---

## 6. 하드룰 준수

| 하드룰 | 상태 | 근거 |
|---|---|---|
| hard gate 승격 금지 / CI 변경 금지 | ✅ | `.github/**` 무수정 · 검사 없음 |
| validate/readiness/workflow-state/forbidden-paths 변경 금지 | ✅ | diff empty |
| manifest 필드 변경 금지 | ✅ | `artifact-manifest.yaml` 무수정(읽기만) |
| component-catalog generator/guard 구현 금지 | ✅ | planned 로 skip · 생성기 미실행 |
| workflow-state/screen-inventory generated guard 금지 | ✅ | "v1 대상 아님" 으로 skip |
| in-file generated block guard 금지 | ✅ | 미구현 |
| regenerate-to-scratch 를 smoke 이상으로 확장 금지(2.5B) | ✅ | 생성기 미실행 — discovery 만 |
| package/CI 변경 금지 | ✅ | 무수정(테스트도 미배선) |
| manifest command ↔ 헤더 문자열 비교 금지 | ✅ | 비교 코드 없음 |
| exit 1 검사 금지 | ✅ | 항상 exit 0(설정 오류만 2) |

---

## 7. 다음 단계

**2.5C** — route-tree·nav-graph reproduce-to-scratch: selected 산출물을 임시 디렉토리에 재생성하고
커밋된 actual 출력과 비교(CRLF/path-sep 정규화만, timestamp 정규화 없음). 실패는 warning-first
report(기본 exit 0). examples 기반 smoke/golden 테스트로 양성(일치)·음성(변조 감지) 확인.

# examples/input-validation — Check 11 (입력 결과물 frontmatter 검증) 픽스처

`validate.mjs` 의 **검사 11**(입력 결과물 frontmatter 검증, `lib/input-artifact.mjs`)을 시연하는 픽스처 모음이다.
세 서브트리(`pass` / `warn` / `fail`)는 각각 "에러·경고 없음 / 경고만 / 에러" 케이스를 보여준다.

검사 11 은 `--docs` 디렉토리 아래 `inputs/` 폴더의 `*.md` 입력 결과물을 정본 입력 스키마([../../templates/input/input-artifact.template.md](../../templates/input/input-artifact.template.md),
[../../input-reconciliation.md](../../input-reconciliation.md) 의 *Input Result Contract*)와 대조한다. `inputs/` 가 없으면 NO-OP 다.

> 이 트리는 **검사 11 전용**이다. `_meta/reconciliation-register.md` 가 없으므로 검사 12(register 검증)는 NO-OP 이고,
> `docs/frontend-workflow` 아래에 `artifact_type` 을 가진 authoring 문서가 없으므로 검사 1~10 도 조용히 통과한다 — 출력은 검사 11 결과만 반영한다.

## 정본 입력 스키마 (요약)

- **required 9개**: `input_id`, `input_type`, `source_type`, `source_ref`, `captured_at`, `captured_by`, `status`, `affected_domains`, `affected_screens`
- **optional**: `confidence`(`unknown|candidate|confirmed`), `supersedes`(이전 `input_id` 또는 `null`; **자기 자신 금지**), `raw_artifacts`(목록)
- **deprecated alias (읽기 호환 — 쓰면 경고)**: `suggested_scope.domains/screens` → `affected_domains/affected_screens`, frontmatter `summary` → body `## Summary`
- **input_id 패턴**: `IN-{YYYYMMDD}-{source}-{NNN}` (정규식 `^IN-\d{8}-[a-z0-9]+(?:-[a-z0-9]+)*-\d{3,}$`)

`affected_domains`/`affected_screens` 는 **alias-resolves** 규칙을 탄다 — canonical 필드가 비어도 대응하는 `suggested_scope.*` 가
비어있지 않으면 required-missing 에러를 내지 않고 deprecated 경고만 낸다. canonical·alias 가 **둘 다** 비었을 때만 누락 에러다.

## 실행 방법

KIT 루트(`frontend-workflow-kit/`)에서 서브트리별로 실행한다:

```sh
# pass — 에러/경고 없음, exit 0
node scripts/validate.mjs --docs examples/input-validation/pass/docs/frontend-workflow

# warn — 검사 11 경고만, exit 0
node scripts/validate.mjs --docs examples/input-validation/warn/docs/frontend-workflow

# fail — 검사 11 에러, exit 1
node scripts/validate.mjs --docs examples/input-validation/fail/docs/frontend-workflow
```

`--docs` 는 현재 작업 디렉토리 기준 상대경로로 해석된다. KIT 루트가 아닌 곳에서 실행하면 절대경로를 쓴다(예:
`node scripts/validate.mjs --docs C:/Users/thdrl/source/repos/k-frontend-workflow-wt-biv/frontend-workflow-kit/examples/input-validation/pass/docs/frontend-workflow`).
기계가 읽을 출력이 필요하면 `--json` 을 덧붙인다(`{ ok, count, errors, warnings }`).

종료코드: 에러 0건이면 `0`, 1건 이상이면 `1`. 경고는 종료코드에 영향이 없다.

---

## `pass/` — 모두 유효 (exit 0, 검사 11 에러·경고 없음)

`inputs/`:

| 파일 | 검증 의도 | 검사 11 결과 |
|---|---|---|
| `IN-20260614-planning-001.md` | required 9개 + optional 전부(`confidence: candidate`, `supersedes: null`, `raw_artifacts: []`). 완전 유효 | 에러·경고 없음 |
| `IN-20260614-figma-001.md` | required 9개만, optional 전부 생략 — optional 생략이 통과임을 보증 | 에러·경고 없음 |
| `IN-20260614-figma-002.md` | 유효 + `supersedes: "IN-20260614-figma-001"` — 같은 디렉토리의 위 파일로 resolve | 에러·경고 없음(supersedes 대상 존재) |

> 셋 다 파일명 = `input_id` 이므로 파일명≠input_id 경고도 없다.

## `warn/` — 경고만 (exit 0, 검사 11 경고만)

`inputs/`:

| 파일 | 검증 의도 | 검사 11 결과 |
|---|---|---|
| `IN-20260614-planning-002.md` | `affected_domains/affected_screens` 대신 deprecated `suggested_scope: { domains, screens }` 사용 + deprecated frontmatter `summary` 사용. 나머지 8개 required 는 모두 채움 | **경고 2건**: ① `deprecated 'suggested_scope' 사용 → affected_domains/affected_screens 로 이전` ② `deprecated frontmatter 'summary' 사용 → body 의 ## Summary 가 정본`. **에러 없음**(alias 가 scope 를 충족하므로 required-missing 아님) |

## `fail/` — 에러 (exit 1, 검사 11 에러)

`inputs/`:

| 파일 | 검증 의도 | 검사 11 결과 |
|---|---|---|
| `IN-20260614-api-001.md` | 완전 유효한 기준 파일 — 이 id 에 걸리는 유일한 문제는 아래 중복뿐 | **에러**: `input_id 중복: 'IN-20260614-api-001' (2건) — input_id 는 전역 유일` (중복 양쪽 파일 모두에 보고) |
| `api-001-dup.md` | `input_id` 가 `IN-20260614-api-001` 로 위 파일과 중복 | **에러**: `input_id 중복: 'IN-20260614-api-001' (2건) — input_id 는 전역 유일`. **경고**: `파일명이 input_id 와 다름: 'api-001-dup' ≠ 'IN-20260614-api-001' (규약 {input_id}.md)` |
| `IN-20260614-qa-001.md` | required `source_type` 과 `captured_by` 누락 | **에러 2건**: `필수 frontmatter 누락: source_type (정본 입력 스키마)`, `필수 frontmatter 누락: captured_by (정본 입력 스키마)` |
| `no-input-id.md` | frontmatter 는 있으나 `input_id` 가 통째로 누락 | **에러**: `필수 frontmatter 누락: input_id (정본 입력 스키마)`. (`input_id` 가 없으므로 패턴/중복/파일명 검사는 적용되지 않는다) |
| `draft-coupon.md` | `input_id` 가 `draft-coupon` 으로 패턴 위반 | **에러**: `input_id 형식 위반: 'draft-coupon' (기대 IN-{YYYYMMDD}-{source}-{NNN})` |
| `IN-20260614-meeting-002.md` | `supersedes` 가 `IN-20260614-meeting-999`(존재하지 않음)를 가리킴 | **에러**: `supersedes 대상 'IN-20260614-meeting-999' 가 존재하지 않음` |
| `IN-20260614-figma-003.md` | `supersedes` 가 자기 자신(`IN-20260614-figma-003`)을 가리킴 (self-reference) | **에러**: `supersedes 가 자기 자신을 가리킴: 'IN-20260614-figma-003' (이전 input_id 여야 함)` |

`fail/` 합계: **에러 8건**(중복 2 + 누락 2 + input_id 누락 1 + 패턴 1 + dangling supersedes 1 + self-supersede 1), 경고 1건(파일명≠input_id) → exit 1.

> 메시지 문자열은 `lib/input-artifact.mjs` 의 정본을 따른다. 위 표는 그 의도와 한 줄 요지를 적은 것이며,
> 실제 출력 접두는 `[검사 11] <상대경로>: …` 형식이다.

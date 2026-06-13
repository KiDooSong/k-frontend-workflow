# reconciliation-validation — Check 12 (reconciliation-register 검증) 예제

`scripts/validate.mjs` 의 **Check 12**(reconciliation-register 검증)를 시연하는 픽스처다.
주요 두 트리(`pass/`, `fail/`)는 둘 다 **Check 11**(input frontmatter)도 통과하도록 모든 입력이 정본 스키마에 맞게 작성됐다 — 그래서 출력은 사실상 Check 12 결과만 보인다. 추가로 `malformed-register/`(8컬럼 스키마 위반), `no-register/`(register 부재 NO-OP), `unreconciled/`(미처리 warning-first + `--enforce`) 트리가 엣지 케이스를 덮는다.

> **미처리(reconcile 미완)는 warning-first 다 (결정 #1).** register 행이 없거나 `Reconcile Status=not-started` 인 입력은 정상 흐름(입력 추가 → reconcile-input)의 중간 상태라 **기본은 경고**(exit 0)다. CI 강제 시점엔 `--enforce` 로 에러 승격한다. 반면 in-progress(중단)/failed/enum/중복/8컬럼누락 같은 망가짐·중단 상태는 `--enforce` 와 무관하게 **항상 에러**.

> **헤드라인 가드 (candidate 6 의 핵심):**
> `Reconcile Status = reconciled` 인 행은 **자식 항목(C-/D-/U-/G-)이 `open` 이어도 통과한다.**
> Created Items 는 **링크만** 남기는 칸이고, `(open)` / `(reopened → open)` 주석은 표시일 뿐 Check 12 가 **절대 파싱하지 않는다.**
> 자식 open/closed 의 단일 출처는 Open Decisions / Conflicts / Unknowns 이지 register 가 아니다.
> Check 12 의 게이트는 **오직 `Reconcile Status`** 다 — child-open / Unknown / Conflict 는 게이트가 아니다.

세 축을 절대 섞지 않는다 (계약: `input-reconciliation.md`):
입력 frontmatter `status`(예: captured) ≠ register `Reconcile Status` ≠ 자식 항목 open/closed.
`reconciled` + 자식 `open` 은 **정상 상태**이며 실패가 아니다.

## 실행

KIT 루트(`frontend-workflow-kit/`)에서:

```bash
# PASS — exit 0 기대 ("workflow:validate — OK (검사 12종 통과)")
node scripts/validate.mjs --docs examples/reconciliation-validation/pass/docs/frontend-workflow

# FAIL — exit 1 기대 (Check 12 에러 4건 + 경고 2건)
node scripts/validate.mjs --docs examples/reconciliation-validation/fail/docs/frontend-workflow

# malformed-register — exit 1 기대 (8컬럼 필수 컬럼 누락 1건)
node scripts/validate.mjs --docs examples/reconciliation-validation/malformed-register/docs/frontend-workflow

# no-register — exit 0 기대 (register 부재 → Check 12 NO-OP)
node scripts/validate.mjs --docs examples/reconciliation-validation/no-register/docs/frontend-workflow

# unreconciled — 기본 exit 0 (미처리 경고 2건) / --enforce 시 exit 1 (에러 2건)
node scripts/validate.mjs --docs examples/reconciliation-validation/unreconciled/docs/frontend-workflow
node scripts/validate.mjs --docs examples/reconciliation-validation/unreconciled/docs/frontend-workflow --enforce
```

JSON 출력이 필요하면 `--json` 을 덧붙인다. 종료 코드 확인:

```bash
node scripts/validate.mjs --docs examples/reconciliation-validation/pass/docs/frontend-workflow; echo "exit=$?"
node scripts/validate.mjs --docs examples/reconciliation-validation/fail/docs/frontend-workflow; echo "exit=$?"
```

## pass/ — exit 0

`inputs/` : `IN-20260614-planning-001`, `IN-20260614-figma-001`, `IN-20260614-meeting-001` (모두 정본 스키마 충족).
`_meta/reconciliation-register.md` : 입력당 `reconciled` 행 1개.

| Input ID | Reconcile Status | Created Items | 기대 결과 |
|---|---|---|---|
| IN-20260614-planning-001 | reconciled | (Copy Key 링크) | OK |
| IN-20260614-figma-001 | reconciled | - | OK |
| IN-20260614-meeting-001 | reconciled | `C-001 (open), D-204 (reopened → open)` | **OK — 헤드라인 가드**: 자식이 open/reopened 여도 reconciled 는 통과 |

→ Check 11 / Check 12 모두 위반 없음 → **exit 0**.

## fail/ — exit 1

`inputs/` : 7건 모두 정본 스키마 충족 — `IN-20260614-planning-001`, `IN-20260614-figma-001`, `IN-20260614-api-001`, `IN-20260614-qa-001`, `IN-20260614-meeting-001`, `IN-20260614-user-note-001`, `IN-20260614-planning-002`.
`_meta/reconciliation-register.md` 행과 기대 결과:

| Input ID | Reconcile Status | 기대 결과 | 보고 위치 |
|---|---|---|---|
| IN-20260614-planning-001 | reconciled | **OK** — Created Items `D-010 (open)` 가 있어도 에러 없음 (fail 트리에서도 가드 증명) | — |
| IN-20260614-figma-001 | in-progress | **ERROR** — `Reconcile Status=in-progress (이전 실행 중단) — 이어서 reconcile 하세요` | register |
| IN-20260614-qa-001 (1행) | reconciled | **ERROR** — `register Input ID 중복 (2행)` (중복은 두 행 모두 대상) | register |
| IN-20260614-qa-001 (2행) | reconciled | **ERROR** — 같은 input_id 두 번째 행 (중복) | register |
| IN-20260614-meeting-001 | in-review | **ERROR** — `Reconcile Status enum 위반: 'in-review'` | register |
| IN-20260614-user-note-001 | failed | **ERROR** — `Reconcile Status=failed (reconcile 실패)` | register |
| IN-20260614-planning-002 | not-started | **WARNING** (warning-first) — `Reconcile Status=not-started`; `--enforce` 시 ERROR | register |
| IN-20260614-api-001 | (register 행 없음) | **WARNING** (warning-first) — `inputs/ 에 있으나 register 에 행 없음 (미처리)`; `--enforce` 시 ERROR | **input 파일**(`inputs/IN-20260614-api-001.md`) |

→ 기본: **에러 4건**(in-progress · 중복 · enum · failed) + **경고 2건**(not-started · 미처리) → **exit 1**. (`--enforce` 면 not-started·미처리도 에러로 승격 → 에러 6건.)

> 중복(qa-001)은 정수로 1건 메시지에 `(2행)` 으로 집계돼 표시되므로, 화면에는 중복 에러가 1줄로 나타날 수 있다. 핵심은 같은 input_id 가 register 에 2행 존재한다는 점이다.

## malformed-register/ — exit 1 (8컬럼 스키마 위반)

register 표가 필수 컬럼을 빠뜨린 경우. `Input ID | Reconcile Status` 2컬럼만 두고 나머지 6개(Source / Classification / Result / Touched Artifacts / Created Items / Supersedes)를 생략했다.

| 파일 | 기대 결과 |
|---|---|
| `_meta/reconciliation-register.md` | **ERROR**: `Reconciliation Register 표 필수 컬럼 누락: Source, Classification, Result, Touched Artifacts, Created Items, Supersedes` |

행 자체(`IN-20260614-planning-001` = reconciled, 대응 input 존재)는 유효하므로 다른 에러/경고는 없다 → **에러 1건, exit 1**. (8컬럼 스키마 단일 출처: `input-reconciliation.md`. 형식 검사 방식은 검사 9 Open Decisions 와 동일.)

## no-register/ — exit 0 (Check 12 NO-OP)

`inputs/` 에 유효한 입력 2건(`IN-20260614-planning-001`, `IN-20260614-figma-001`)이 있으나 `_meta/reconciliation-register.md` 가 **없다**. → Check 11 은 입력을 검증(통과), Check 12 는 register 부재로 **NO-OP** → **exit 0**. register 미도입(초기) 단계가 정상임을 입증하는 가드다.

> Check 11 의 역방향 NO-OP(`inputs/` 자체가 없을 때 Check 11 이 조용히 통과)은 `inputs/` 가 없는 기존 예제(`examples/coupon-feature`)와 baseline 회귀 실행이 입증한다.

## unreconciled/ — 미처리 warning-first (기본 exit 0 / `--enforce` exit 1)

"미처리(reconcile 미완)" 의 두 갈래를 한 트리에서 보여준다. 모든 입력은 정본 스키마 충족(Check 11 통과).

| Input ID | 상태 | 기본 모드 | `--enforce` |
|---|---|---|---|
| IN-20260614-planning-001 | reconciled | OK | OK |
| IN-20260614-figma-001 | register 행 없음 (미처리) | **경고** | **에러** |
| IN-20260614-api-001 | Reconcile Status=not-started | **경고** | **에러** |

- 기본: 경고 2건, 에러 0건 → **exit 0** (정상 흐름의 중간 상태를 막지 않음).
- `--enforce`: 같은 2건이 에러로 승격 → **exit 1** (CI 강제 시점).
- 근거: 결정 #1 warning-first — `input-reconciliation.md` "초기에는 hard fail 이 아니라" + Lane B backstop 의 warning-first 와 정합.

## 어떻게 동작하는가 (Check 12 활성화 조건)

- **ACTIVATION**: `_meta/reconciliation-register.md` 가 **없으면** Check 12 는 NO-OP(에러/경고 없음) — `inputs/` 에 파일이 있어도 그렇다 (초기/선택 채택, `input-reconciliation.md` 의 "초기에는 hard fail 이 아니라").
- register 가 있으면: frontmatter 분리 → 본문 → `parseTable`(첫 마크다운 표 = 8컬럼 register).
- 컬럼은 느슨한 헤더 매칭: `Input ID | Source | Classification | Reconcile Status | Result | Touched Artifacts | Created Items | Supersedes`.
- register 표는 **필수 8컬럼 존재**를 확인한다(누락 시 `필수 컬럼 누락` 에러; 검사 9 Open Decisions 와 같은 방식). 표가 아예 파싱되지 않으면 `파싱 가능한 register 표 없음` 에러.
- 두 트리의 register 본문에는 register 표 **뒤에** 산문/메모 표가 더 있을 수 있으나, `parseTable` 은 **첫 표만** 읽으므로 register 만 검사된다.
- MISSING ROW 크로스체크는 Check 11 이 모은 `inputs/*.md`(`input_id` 보유) 와 register 행을 대조하며, 보고는 **input 파일**에 단다. 이 '미처리' 와 `Reconcile Status=not-started` 는 **기본 경고**(warning-first)이고 `--enforce` 로 **에러 승격**한다. (in-progress/failed/enum/중복/컬럼누락 은 `--enforce` 와 무관하게 항상 에러.)

## 참고

- 계약: `../../input-reconciliation.md` (Reconciliation Register 스키마 / status vs Reconcile Status 3축 / register-first).
- 실제 8컬럼 register 형태: `../input-reconciliation/expected-llm-after/docs/frontend-workflow/_meta/reconciliation-register.md`.
- Check 11(input frontmatter) 전용 픽스처: `../input-validation/`.

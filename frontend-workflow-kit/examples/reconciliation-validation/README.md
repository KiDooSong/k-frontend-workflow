# reconciliation-validation — Check 12 (reconciliation-register 검증) 예제

`scripts/validate.mjs` 의 **Check 12**(reconciliation-register 검증)를 시연하는 픽스처다.
두 트리(`pass/`, `fail/`)는 둘 다 **Check 11**(input frontmatter)도 통과하도록 모든 입력이 정본 스키마에 맞게 작성됐다 — 그래서 출력은 사실상 Check 12 결과만 보인다.

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

# FAIL — exit 1 기대 (Check 12 위반 5건 + 경고 1건)
node scripts/validate.mjs --docs examples/reconciliation-validation/fail/docs/frontend-workflow
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
| IN-20260614-planning-002 | not-started | **WARNING only** — `Reconcile Status=not-started` (에러 아님, 종료 코드 영향 없음) | register |
| IN-20260614-api-001 | (register 행 없음) | **ERROR** — `inputs/ 에 있으나 register 에 행 없음 (미처리)` | **input 파일**(`inputs/IN-20260614-api-001.md`) |

→ **에러 5건**(in-progress · 중복 · enum · failed · 미처리) + **경고 1건**(not-started) → **exit 1**.

> 중복(qa-001)은 정수로 1건 메시지에 `(2행)` 으로 집계돼 표시되므로, 화면에는 중복 에러가 1줄로 나타날 수 있다. 핵심은 같은 input_id 가 register 에 2행 존재한다는 점이다.

## 어떻게 동작하는가 (Check 12 활성화 조건)

- **ACTIVATION**: `_meta/reconciliation-register.md` 가 **없으면** Check 12 는 NO-OP(에러/경고 없음) — `inputs/` 에 파일이 있어도 그렇다 (초기/선택 채택, `input-reconciliation.md` 의 "초기에는 hard fail 이 아니라").
- register 가 있으면: frontmatter 분리 → 본문 → `parseTable`(첫 마크다운 표 = 8컬럼 register).
- 컬럼은 느슨한 헤더 매칭: `Input ID | Source | Classification | Reconcile Status | Result | Touched Artifacts | Created Items | Supersedes`.
- 두 트리의 register 본문에는 register 표 **뒤에** 산문/메모 표가 더 있을 수 있으나, `parseTable` 은 **첫 표만** 읽으므로 register 만 검사된다.
- MISSING ROW 크로스체크는 Check 11 이 모은 `inputs/*.md`(`input_id` 보유) 와 register 행을 대조하며, 에러는 **input 파일**에 보고된다.

## 참고

- 계약: `../../input-reconciliation.md` (Reconciliation Register 스키마 / status vs Reconcile Status 3축 / register-first).
- 실제 8컬럼 register 형태: `../input-reconciliation/expected-llm-after/docs/frontend-workflow/_meta/reconciliation-register.md`.
- Check 11(input frontmatter) 전용 픽스처: `../input-validation/`.

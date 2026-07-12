---
title: "upgrade plan embedded migration-note 상대 링크 재배치 — 구현/검증 기록"
kind: kit-slice-run
date: 2026-07-12
base_commit: 3f05e73 (main HEAD, v0.3.0-mvp.2 이후)
verdict: PASS
---

# upgrade plan migration link rebase — run evidence 001

`v0.3.0-mvp.2` 실제 consumer 업그레이드 dogfood
([temp/runs/consumer-upgrade-0.3.0-mvp.2-dogfood-001/run-report.md](../../../temp/runs/consumer-upgrade-0.3.0-mvp.2-dogfood-001/run-report.md) §7,
[release-0.3.0-mvp.2-final-check.md](../../../temp/runs/release-0.3.0-mvp.2-final-check.md))가
"kit 후속 후보"로 기록한 `broken-relative-link` 2건의 **후속 해소** 기록이다.
과거 dogfood 가 당시 2건을 관측했다는 사실은 원문 그대로 보존한다 — 이 문서는 그 관측을 고쳐 쓰지 않는다.

## 1. Root cause

`upgrade-vendored-kit` 은 next payload 의 `docs/reference/upgrade-notes.md` 원문을
`renderPlanMarkdown` 이 plan 의 `## Consumer migrations` 아래에 **그대로** embed 했다.
원문 링크는 `docs/reference/` 기준이므로, plan 이 `<current>/_upgrade/upgrade-plan-<ref>.md`
(또는 임의의 `--plan` 경로)에 놓이면 다음처럼 잘못 해석된다.

```txt
원문:            [input-reconciliation.md](input-reconciliation.md)
의도한 target:   <current>/docs/reference/input-reconciliation.md
실제 해석:       <current>/_upgrade/input-reconciliation.md   ← 존재하지 않음
```

## 2. Before reproduction (변경 전 코드, synthetic payload)

Synthetic next payload(payload manifest + `docs/reference/upgrade-notes.md` 에 dogfood 의
실제 2개 링크 포함)로 temp dir 에서 재현 — live consumer 무접촉.

```bash
node scripts/upgrade-vendored-kit.mjs --current <temp-current> --next <synthetic-next> --apply
# exit 0 — plan: <temp-current>/_upgrade/upgrade-plan-NEXTREF.md
```

생성 plan 의 Consumer migrations (변경 전, verbatim):

```md
- See [input-reconciliation.md](input-reconciliation.md).
- See [screen-identity.md](screen-identity.md).
```

```bash
node scripts/doc-drift.mjs --root <temp-current> --json   # exit 0 (warning-first)
```

```json
"warning_count": 2,
"findings": [
  { "severity": "warning", "check": "broken-relative-link",
    "source": "_upgrade/upgrade-plan-NEXTREF.md",
    "link": "input-reconciliation.md", "target": "_upgrade/input-reconciliation.md",
    "reason": "target file not found" },
  { "severity": "warning", "check": "broken-relative-link",
    "source": "_upgrade/upgrade-plan-NEXTREF.md",
    "link": "screen-identity.md", "target": "_upgrade/screen-identity.md",
    "reason": "target file not found" }
]
```

— dogfood §7 의 telemetry doc-drift surface `warning_count: 2` 와 동형.

## 3. Fix design (요약)

- 링크 재배치는 **Markdown render 시점에만**: `rebaseMigrationNoteLinks` +
  `renderPlanMarkdown(plan, {currentDir, planPath})` optional context.
  `buildPlan()` JSON(`migration_notes.{path,body}` raw 원문 포함)은 불변,
  context 없는 `renderPlanMarkdown(plan)` 은 byte-identical.
- CLI 는 planPath 를 먼저 결정한 뒤 context 를 포함해 render — plan 은 여전히
  apply mutation 전에 쓰고, 잘못된 `--plan` 은 apply 전에 실패한다.
- 계산은 순수 lexical(파일 읽기/symlink 추적 없음): query/fragment 분리 보존 →
  `migration_notes.path` dirname 기준 해소 → `isSafeRelPath` 로 payload root 탈출 검사 →
  `currentDir` 아래 lexical target → plan dirname 기준 POSIX 상대경로.
- fenced code/inline code span/autolink/escaped bracket 안의 표기는 무수정
  (doc-drift 의 length-preserving masking helper `maskInlineCodeSpans`/`maskAutolinks` 공유,
  fence 는 길이 보존 변형을 로컬 구현 — doc-drift 기본 출력/판정 무변경).
- external/anchor-only/site-absolute/`data:` 불변. payload root 탈출·Windows cross-drive 는
  원문 유지 + deterministic 리뷰 note — absolute path/file URL 출력 0, apply 실패 0.

## 4. After — default `_upgrade` plan

같은 fixture, 변경 후:

```md
- See [input-reconciliation.md](../docs/reference/input-reconciliation.md).
- See [screen-identity.md](../docs/reference/screen-identity.md).
```

```bash
node scripts/doc-drift.mjs --root <temp-current> --json   # exit 0
# → "warning_count": 0, "findings": []
```

## 5. After — explicit `--plan` 경로 2종

```txt
current: <consumer>/tools/frontend-workflow
plan:    <consumer>/kit-upgrade-plan.md
→ [input-reconciliation.md](tools/frontend-workflow/docs/reference/input-reconciliation.md)

plan:    <consumer>/temp/reports/upgrades/kit-upgrade-plan.md
→ [input-reconciliation.md](../../../tools/frontend-workflow/docs/reference/input-reconciliation.md)
```

테스트는 문자열 비교에 더해 `path.resolve(planDir, link)` 가 apply 후 실제 파일과
canonical 하게 일치함을 대조한다.

## 6. JSON shape 불변

- `plan.migration_notes.path` = `docs/reference/upgrade-notes.md`, `body` = raw 원문 그대로
  (render 전후 `JSON.stringify(plan)` 동일 — 테스트로 고정).
- counts/files/warnings/options shape 무변경(기존 deterministic 테스트 전부 통과).
- `--json` 출력에 rebased 링크·absolute plan/current/next 경로 신규 노출 0 (테스트로 고정).

## 7. Packed payload smoke (실제 payload, 실행 명령·exit code)

```bash
cd frontend-workflow-kit
rm -rf ../dist/frontend-workflow-kit
npm run kit:pack                                          # exit 0 — 187 files
cd ../dist/frontend-workflow-kit && npm ci --omit=dev     # exit 0

node <dist>/scripts/upgrade-vendored-kit.mjs \
  --current <temp-current> --next <dist> --apply          # exit 0 — applied 187 change(s)
# plan: <temp-current>/_upgrade/upgrade-plan-3f05e73f6ac5.md
#   [input-reconciliation.md](../docs/reference/input-reconciliation.md)
#   [screen-identity.md](../docs/reference/screen-identity.md)

node <dist>/scripts/doc-drift.mjs --root <temp-current> --json   # exit 0
# → warning_count: 0, broken-relative-link (plan source): 0, findings: 0
```

packed payload 자체의 upgrade-notes 가 사용됐고(source tree import 비의존 — spawn 만),
payload boundary 변화 없음(`kit:pack` allowlist/manifest 무변경).

## 8. 검증 명령 전체 (exit code)

이 worktree(base `3f05e73`)에서 전부 실행:

```txt
npm ci                                                                  exit 0
node --test scripts/lib/upgrade-planner.test.mjs \
  scripts/lib/doc-drift.test.mjs scripts/lib/distribution.test.mjs      exit 0 (140 tests, 136 pass, 4 platform-skip)
npm test                                                                exit 0 (793 tests, 786 pass, 7 platform-skip)
npm run example:state                                                   exit 0 (golden _meta byte-identical — git status 변화 0)
npm run example:readiness                                               exit 0
npm run example:validate                                                exit 0 (검사 12종 통과)
npm run kit:pack                                                        exit 0
packed upgrade CLI --apply / packed doc-drift --json                    exit 0 / exit 0 (§7)
```

신규 테스트 16건: default `_upgrade` 재배치(fragment/query 보존·external/anchor/code/escaped/fenced/angle-bracket 불변·
2회 render byte-identical·absolute path/timestamp 부재) · explicit `--plan` root+nested 실파일 resolve ·
context 없는 render byte-compat · JSON plan 불변 · payload-escape·percent-encoded traversal 원문 유지+deterministic note ·
win32 cross-drive lexical(원문 유지·absolute 누출 0) · nested image 재배치 · plan-dir target `.` ·
CLI default apply 통합(dogfood 2건 링크 고정) · `--plan` collision 거부(next/backup/current payload·manifest·incoming 전수, mutation 0) ·
bad `--plan` fail-before-apply · doc-drift 회귀(warning 0·exit 0 계약 유지) · packed payload 재배치+packed doc-drift 0.

## 8.1 Codex 리뷰 라운드 1 반영

| 심각도 | finding | 처리 |
|---|---|---|
| High | `--apply` 시 `--plan` 이 apply 입력/출력과 충돌 가능(plan 이 manifest refresh 에 덮이거나 payload 오염) | `assertPlanPathDoesNotCollide` — `--next`/`--backup-dir` 내부, current 내부 payload/manifest/`.upgrade-conflicts` 경로를 plan 쓰기 전 exit 2 거부 + 전수 테스트 |
| Medium | escaped destination punctuation(`\#`·`\(`)을 raw 로 분해 | backslash 포함 destination 은 원문 그대로 유지(spec 의 escaped-notation 불변 규칙) |
| Medium | label 내 nested image 미재배치 | label 재귀 스캔으로 양쪽 destination 재배치 |
| Medium | blockquote 내 fence 등 masking 문법 한계 | 의도적 유지 — doc-drift Phase 0 문법과 동일해야 검증기와 일관(코드 주석으로 근거 고정), upgrade-notes 계약에 해당 구문 없음 |
| Medium | `%2e%2e/` percent-encoded traversal 이 escape 검사 우회 가능(가설) | 실검증 후 decoded path 에도 `isSafeRelPath` 적용 + 회귀 테스트 |
| Low | target == plan dir 이 cross-volume 으로 오분류 | `rel === ''` → `.` 렌더 + 테스트 |

## 8.2 Codex 리뷰 라운드 2 반영 (collision guard 잔여 bypass)

라운드 2 재검토는 라운드 1 의 6건 중 5건을 완전 해소로 확인했고, `--plan` collision guard 에서
경계/물리 우회 3건(High)을 추가 검출 — 전부 해소:

| bypass | 처리 |
|---|---|
| `--plan` == `--backup-dir` 자체(미존재 경로) — plan FILE 이 backup mkdir 를 mid-apply 에 차단 | `relTo` 가 equality('')를 포함해 검사 — `--next`/`--backup-dir`/`--current` 자체도 exit 2 |
| `--plan <current>/.upgrade-conflicts` (root 자체, 미존재) — descendants 만 검사했음 | `CONFLICTS_DIR_NAME` root equality 도 거부 |
| 명시적 in-current plan 경로가 physical symlink/junction 검사를 스킵 (`_upgrade` → `--next` junction 으로 lexical 검사 전체 우회) | in-current 로 lexically 판정되는 **모든** plan 경로에 `assertSafeWriteTarget` 적용 (default 한정 해제) |

테스트: equality 매트릭스 4건(backup root·conflicts root·next 자체·current 자체, mutation 0) +
junction escape 테스트(`_upgrade` → next junction 에서 plan 이 `--next` 로 탈출하지 않고 비-0 exit,
mutation 0 — Windows junction 실검증 통과).

## 8.3 Codex 리뷰 라운드 3 반영 (guard 정밀화 2건)

라운드 3(fresh thread 재검토)은 라운드 2 해소 3건을 nominal 케이스에서 정상으로 확인하고
High 2건을 추가 검출 — 전부 해소:

| finding | 처리 |
|---|---|
| `relTo` 의 `startsWith('..')` 가 `..foo` 같은 **유효한** in-tree 이름을 outside 로 오판 — collision 검사·physical containment 둘 다 skip 되어 tracked 파일을 plan 으로 덮을 수 있음 | outside 판정을 정확한 `..` **segment** 로 한정(`rel === '..' \|\| rel.startsWith('..'+sep)`) + `..foo.mjs` tracked 파일 clobber 회귀 테스트(exit 2·무변조) |
| collision guard 가 lexical 경로만 비교 — protected root(–-current/--next/--backup-dir)의 symlink/junction alias 경유 `--plan` 이 모든 검사를 우회 | `realpathDeepest`(미존재 remainder 는 lexical 재부착) 기반 physical form 을 양변에 추가해 lexical×physical 전 조합 검사; in-current 판정도 physical form 포함 | 

테스트: root alias 2건(`alias→next` stray plan · `alias→current` tracked 파일, 둘 다 exit 2·mutation 0,
Windows junction 실검증) + 기존 `_upgrade`→next junction 테스트는 physical collision guard 가 먼저 잡는
것을 허용하도록 메시지 매칭 확장. 전체 `npm test` 802 tests 795 pass 7 platform-skip.

## 9. 경계 준수

- upgrade classification/apply/manifest/conflict/prune 의미 무변경 (기존 테스트 전부 통과로 고정).
- `migration_notes.body` raw 원문·plan JSON shape 무변경.
- doc-drift 기본 출력/판정 무변경 (masking helper 는 기존 export 재사용만).
- warning-first → hard gate 승격 0 · CI required check 추가 0 · 버전 `0.3.0-mvp.2` 유지(release/tag 없음).
- historical evidence(`temp/runs/release-0.3.0-mvp.2-final-check.md`,
  `temp/runs/consumer-upgrade-0.3.0-mvp.2-dogfood-001/**`) 무수정 — 본 문서와 CHANGELOG 에서 후속 해소 링크만 건다.

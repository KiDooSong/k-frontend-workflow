---
title: "MVP-B 릴리스 최종 체크 (v0.2.0-mvp-b-rc1)"
kind: release-check
release: v0.2.0-mvp-b-rc1
branch: release/mvp-b-final-check
base_commit: 6bbe8bd
dogfood_run: consumer-dogfood-001
date: 2026-06-14
verdict: GO (rc1)
status: historical
---

> ⚠ **HISTORICAL (2026-07-11 표기)**: 이 문서는 `v0.2.0-mvp-b-rc1`(base commit `6bbe8bd`, 2026-06-14) 시점의 릴리스 체크다.
> 이후 telemetry/eval/red-team/doc-drift/visual/adoption 계층이 대량 병합되어 **현재 HEAD 의 최종 릴리스 증거가 아니다**.
> 현행 release baseline 은 `0.3.0-mvp.1`([kit-dev/CHANGELOG.md](../../kit-dev/CHANGELOG.md))이며,
> 최신 HEAD 검증 증거는 MVP closure tracker #167 의 MVP-05(#161)에서 별도로 생성한다.

# MVP-B 릴리스 최종 체크 — `v0.2.0-mvp-b-rc1`

PR #17(consumer-dogfood-001) 머지 후 MVP-B 를 릴리스 가능한 상태로 마감하기 위한 최종 점검.
**새 기능 구현 없음** — 검증·증거 기록 + 문서 정합만. 7-차원 read-only 감사
(consumer-dogfood / README / CHANGELOG / roadmap / mvp-b / scripts / CI) + 합성 결과를 고정한다.

> 작업 격리: 브랜치 `release/mvp-b-final-check`, 워크트리 `.claude/worktrees/release-mvp-b-final` — `main` 무변경.

---

## 1. PR #17 반영 여부

- **머지 상태**: PR #17 `test(dogfood): consumer-dogfood-001 dry-run 실행 + 실측 증거` = **MERGED**, 머지 커밋 `6bbe8bd`(현재 `main` HEAD). 신규 파일만(700 insertions, 기존 파일 수정 0).
- **in-tree 증거**: `temp/runs/consumer-dogfood-001/run-report.md`(status: done) + `evidence/*` 9개 파일 전부 존재.
- **본 릴리스에서의 반영**: 이 브랜치가 README/CHANGELOG/roadmap/mvp-b 를 dogfood 에 맞춰 정합(§5). PR #17 의 증거가 비로소 킷 **소비자 문서 표면**까지 노출된다.

## 2. consumer dogfood verdict

**PASS.** fresh `create-expo-app` sdk-56 프로젝트(킷 레포 밖)에서 `state → readiness → Work Packet → implement-screen → validate → forbidden-paths` 완주. 정상 진행과 게이트 거절을 한 run 에서 확인.

| 항목 | 결과 | 증거 |
|---|---|---|
| fresh Expo 적용 / `src/` 가정 | ✅ HOLDS | run-report.md:25,132; environment.txt:3 |
| workflow:state/readiness/validate | ✅ 전부 exit 0 | validate.txt:1-2 "OK (검사 12종 통과)" |
| Work Packet 사용 | ✅ `WP-HOME-001-screen-skeleton-001` | run-report.md:5,30 |
| implement-screen A (HOME-001) | ✅ screen-skeleton shell 1파일, validate exit 0 | run-report.md:31,63 |
| implement-screen B (PROFILE-001) | ✅ docs-only **거절이 정답**, src 변경 0 | run-report.md:32,80; readiness.json:47 |
| forbidden-paths warning-first | ✅ clean exit 0 / sub-check 1경고 exit 0 | forbidden-paths-clean.txt; -subcheck.txt |
| evidence 파일 | ✅ 9/9 존재 | evidence/ |

**전이 유효성(transfer validity)**: dogfood 가 실제로 돌린 런타임 스크립트(`workflow-state`·`readiness`·`validate`·`forbidden-paths` + lib)는 증거 소스 커밋 `4601347`↔`6bbe8bd` **byte-identical**. 그 구간의 유일한 런타임 변경은 도그푸드가 호출하지 않은 내부 회귀 하니스(`test-fixtures.mjs`·`lib/test-fixture.mjs`)의 **가산적** path-backstop fixture 종류뿐(`04773eb`) → 증거 그대로 전이. `validate.mjs` 는 여전히 "검사 12종 통과" 를 출력.

## 3. MVP-B hard gates

(릴리스 시점, exit 0/1 로 빌드를 깨는 것)

- **`validate`(검사 12종)** — `example:validate` CI step, no `continue-on-error`. **BLOCKING**.
- **멱등성 게이트** — `git diff --exit-code … _meta`, 불일치 시 `exit 1`. **BLOCKING**.
- **validate 검사 11·12 구조 검사**(입력 결과물 frontmatter + Reconciliation Register) — 형식 위반 = exit 1.
- **Open Decisions validate 형식 검사(검사 9) + `decision_cap`** — validate exit 0/1 안에서 하드.

## 4. MVP-B warning-first gates

(기본 exit 0, opt-in 으로만 하드 — **이번 릴리스에서 승격하지 않음 / 하드룰**)

- **`test-fixtures.mjs` golden-fixture 회귀** — CI `continue-on-error: true`(워크플로 유일). 자체 실행은 hard-exit 0/1/2, CI 는 비차단. 하드 게이팅 승격은 별도 PR(FP율 관찰 후).
- **`forbidden-paths.mjs` 경로 backstop** — 위반도 기본 exit 0, `--enforce` 로만 exit 1. **CI step 부재**(npm alias 만).
- **Reconciliation Register 미처리 감지**(검사 12 일부) — Reconcile Status `in-progress`/`failed` = 경고, `--enforce` 로 하드.

## 5. docs/scripts/CI 정합성

- **scripts** ✅ — `package.json`·`package-scripts.template.json` 의 active alias 9개 전부 실존 `.mjs` 로 해석(state/readiness/validate/forbidden-paths/example:test/test). 미구현 로드맵 스크립트 6개(lint-gen·lint-baseline·catalog·nav·route-tree·check-generated)는 npm 무시 `//roadmap-scripts` 키에만 존재. **수정 없음**.
- **CI** ✅ — 하드(validate + 멱등) / warning-first(golden fixture) 분리 정확, `continue-on-error: true` 는 golden fixture 1곳뿐, forbidden-paths/`--enforce` CI 부재. 게이트 로직 **무변경**(stale "9종" 주석만 "12종" 동기화 — 주석 전용).
- **docs** ✅(본 브랜치 적용 후) — README(dogfood 1줄 + work-packet 라벨 정정) · CHANGELOG(rc1 prepend, 검증 사실만) · roadmap(스냅샷/헤더/다음후보) · mvp-b(내부↔외부 검증 노트). 4개 문서 ↔ (무변경) scripts/CI 상호 일관.

## 6. 남은 known limitations

1. **`forbidden-paths` 호출 위치** — 소비자 repo *밖*에서 호출 시 `--root <consumer>` 로 git cwd 지정 필요(소비자 루트 `npm run` 은 불필요). 문서화됨, 결함 아님.
2. **Windows CRLF** — vendored 킷·docs 에 LF→CRLF git 경고. 동작 무해(스크립트 정규화). 소비자 `.gitattributes` 권고(미동봉).
3. **`test-fixtures` 가 CI warning-only** — 하드 게이팅 미승격. FP율 관찰 후 별도 PR.
4. **`forbidden-paths` 전용 CI step 부재** — npm alias 만. self-contained `--diff` step 후속.
5. **`reconcile-input` 리포-로컬** — `.claude/skills/`, 킷 `skills/` vendor 전(코드 강제 0; register 검증은 검사 12 로 커버).
6. **dogfood 이후 하니스 변경** — `test-fixtures.mjs`/`lib/test-fixture.mjs` 가 증거 커밋 이후 가산 변경(`04773eb`). "런타임 무변경" 은 문자적으론 거짓이나 도그푸드 미호출 하니스라 전이 유효(§2).
7. **(cosmetic)** `package.json` `version` 은 `0.1.0-mvp-a` 유지 — CHANGELOG 가 버전 SoT("킷 자체의 버전 관리")라 의도적 미동기. 필요 시 별도 결정.

## 7. tag recommendation

**권고: `v0.2.0-mvp-b-rc1` (릴리스 후보).** 최종(`v0.2.0-mvp-b`) 아님.

- **rc 근거**: test-fixtures/forbidden-paths 하드 게이팅 미승격(+하드룰상 이번 릴리스에서 승격 금지) · 잔여 known limitations(§6) 다수 · golden-fixture FP율 소크 윈도 필요.
- dogfood 자체는 clean PASS 이고 동결 스크립트 무변경 → **release-candidate 품질**. rc1 이 정확한 라벨.
- **최종 승격 조건**: (a) 본 브랜치 편집분 머지 + (b) 잔여 limitations 를 cosmetic 으로 수용(특히 test-fixtures/forbidden-paths 를 이번 릴리스에서 warning-first 로 유지). 단 test-fixtures 하드 승격은 그 자체로 **별도 PR**(하드룰) — 최종 태그라도 이 게이트는 뒤집지 않는다.

## 8. exact tag command

태그는 **본 브랜치 편집분 커밋 이후** 그 커밋에서 찍는다(증거 + 문서 정합 동시 포함). push 는 별도(이 세션은 태그/push 미수행).

```bash
git tag -a v0.2.0-mvp-b-rc1 -m "frontend-workflow-kit MVP-B Phase 0 release candidate (rc1)

Consumer dogfood (consumer-dogfood-001, PR #17) drove a fresh create-expo-app sdk-56
project end-to-end: state -> readiness -> Work Packet -> implement-screen -> validate
-> forbidden-paths. All gates as designed: screen-skeleton proceeded (validate exit 0,
'검사 12종 통과'); docs-only correctly refused (empty src diff, open D-301);
forbidden-paths warning-first (exit 0; --enforce to harden).

Gate posture: validate (검사 12종) + idempotency git-diff = HARD; test-fixtures +
forbidden-paths = warning-first. No kit runtime code changed since the dogfood source
(exercised scripts byte-identical 4601347..6bbe8bd; only additive test-harness coverage).

RC because test-fixtures/forbidden-paths are not yet hard-gated and known limitations
remain (reconcile-input not vendored, forbidden-paths --root call-site, Windows CRLF)."
```

> 최종 릴리스로 갈 경우: 위 메시지의 `-rc1` 제거, 태그명 `v0.2.0-mvp-b` — 단 §7 조건 충족 후.

---

## go / no-go 체크리스트

| # | 항목 | 상태 | 비고 |
|---|---|---|---|
| 1 | dogfood verdict = pass | ✅ done | §2 |
| 2 | evidence 9/9 존재·무수정 | ✅ done | read-only 감사 |
| 3 | 동결 `.mjs` 무변경(validate/readiness/workflow-state/forbidden-paths/test-fixtures) | ✅ done | 편집은 docs + CI 주석만 |
| 4 | scripts = 실존 alias 만 | ✅ done | §5 |
| 5 | CI 하드게이트 승격 없음 | ✅ done | §4, 주석만 변경 |
| 6 | expected fixture 의미 무변경 | ✅ done | 미접촉 |
| 7 | consumer dogfood evidence 무수정 | ✅ done | 미접촉(신규 파일만 추가) |
| 8 | README dogfood 반영 | ✅ done | 본 브랜치 |
| 9 | README work-packet 라벨 정정 | ✅ done | 본 브랜치 |
| 10 | CHANGELOG rc1 prepend(검증 사실만, prepend-only) | ✅ done | 본 브랜치 |
| 11 | roadmap 스냅샷/헤더/다음후보 | ✅ done | 본 브랜치 |
| 12 | mvp-b 내부↔외부 검증 노트 | ✅ done | 본 브랜치 |
| 13 | 릴리스 체크리스트 작성 | ✅ done | 이 파일 |
| 14 | 편집분 커밋 후 태그 | ⏳ pending | §8 — 사용자 결정(태그·push 미수행) |

> **판정: GO for `v0.2.0-mvp-b-rc1`** — 항목 1–13 충족. 14(태그/push)는 사용자 몫으로 남긴다.

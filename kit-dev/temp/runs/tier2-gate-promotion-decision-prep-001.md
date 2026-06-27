# tier2-gate-promotion-decision-prep-001

Date: 2026-06-21
Base: `main@cb75e9a`
Branch: `docs/tier2-gate-promotion-decision`
Worktree: `C:\Users\thdrl\source\repos\k-frontend-workflow\.claude\worktrees\tier2-gate-promotion-decision`
Status: **RESOLVED (2026-06-21)** — OD-11 = "no CI" (warning-first 유지); 승격은 실제 도입(adoption) telemetry 전까지 연기. 상세 → [## Resolution](#resolution-2026-06-21).

## Scope

PR #65 의 증거(`temp/runs/tier2-gate-promotion-evidence-001.md`)를 사람이 resolve 할 수
있도록 **공식 Open Decision(OD-11)** 으로 등재하고, 그 결정을 **일반인 + 개발자** 2버전으로
시각화한다. 이 슬라이스는 결정을 **준비(prep)만** 한다 — **resolve 는 사람 몫이다.**

이 보고서/슬라이스는 어떤 게이트도 승격하지 않고, 어떤 옵션도 선택/close 하지 않는다.
CI(`.github/workflows`)·`continue-on-error`·required check·`--enforce` 를 추가/수정하지 않고,
`artifact-manifest.yaml` status(planned/active)를 바꾸지 않으며, 소스/생성물/golden/테스트
로직을 건드리지 않는다.

## Inputs Read

- `frontend-workflow-kit/temp/runs/tier2-gate-promotion-evidence-001.md` (Decision Draft ·
  Promotion Telemetry Needed · Evidence 1d)
- `frontend-workflow-kit/roadmap-current.md` (item 2 — 잔여 = 승격 결정 하나)
- `frontend-workflow-kit/temp/proposals/tier2-router-codegen-adapter.md` (§16 OD 목록 OD-1..OD-10)
- `frontend-workflow-kit/temp/runs/lint-gate-promotion-evidence-001.md` (선례 — lint-pack 승격 OD)
- `docs/frontend-workflow/_viz/decision-OD-4-{easy,dev}.data.json` (시각화 산출 형식 미러)
- `.claude/skills/visualize-decision/{SKILL.md,assets/SCHEMA.md,assets/build.mjs,assets/path-guard.mjs}`

## 1) 공식 Open Decision 등재 — OD-11

`temp/proposals/tier2-router-codegen-adapter.md` §16 의 OD 목록에 다음 빈 id 인 **OD-11**
("Tier2 codegen/route warning-first → CI/gate 승격") 을 **status: open** 으로 추가했다. 기존
목록은 OD-1..OD-10 이었다(OD-4/OD-5/OD-6/OD-7/OD-8 은 이미 사람-결정으로 resolved).

등재 필드:

- **Decision Needed:** Tier2 warning-first 표면(codegen focused advisory check ·
  `route-cross-check --json` · v1 default guard)을 CI/hard gate/required check/`--enforce`
  로 승격할 것인가 — 안 둘까 / 경고만 둘까 / 막을까.
- **Options (3안, evidence Decision Draft 그대로 + evidence status):**
  1. **no CI (status quo)** — 현 상태. 로컬 결정적·exit 0; 멀티런 run history 없음.
  2. **warning-first CI smoke** — `continue-on-error: true` telemetry only. lint-pack PR-5
     미러지만 멀티런 smoke 이력·방향별 FP rate 부족으로 **아직 미정당화.**
  3. **hard CI / required check / `--enforce`** — **미지원.** Evidence 1d(component-catalog
     placeholder) + Direction-2 FP + 교차환경 결정성 + 사람 `decision_id` 필요; `--enforce`
     미구현.
- **Blocking Mode:** roadmap item 2 마감(잔여 = 이 승격 결정 하나)을 막는다. 설계 PR·다른
  OD 는 막지 않는다.
- **Owner:** 사람(메인테이너) — 별도 사람-승인 decision PR + `decision_id` + 명시 rationale.
- **근거 cross-link:** `tier2-gate-promotion-evidence-001.md` (+ 선례
  `lint-gate-promotion-evidence-001.md`).
- **Recommendation:** **warning-first 유지, pending** — 어떤 옵션도 선택/close 하지 않음.

## 2) 시각화 — visualize-decision 스킬, 2버전

repo 스킬 `visualize-decision` 으로 OD-11 을 **일반인 + 개발자** 2버전으로 생성했다(OD-4 산출
형식 미러). 데이터 JSON 을 직접 쓰고 `build.mjs` 로 빌드했다. 산출 위치는 repo-root
`docs/frontend-workflow/_viz/` (gitignore 대상 — 읽기 전용 미리보기, 추적되지 않음; OD-4 산출과
동일 디렉터리).

| 버전 | data.json | html | build | placeholder 잔여 |
|---|---|---|---|---|
| 개발자(dev) | `decision-OD-11-dev.data.json` | `decision-OD-11-dev.html` | exit 0 | 0 |
| 일반인(easy) | `decision-OD-11-easy.data.json` | `decision-OD-11-easy.html` | exit 0 | 0 |

- 공통: `views = [opt, diff, matrix]`. `base` = 현재 상태(Tier2 CI 0, 전부 warning-first/exit 0).
  옵션별 `after` = 그 선택 적용 후 게이트/CI 상태.
- **추천 보류(불변식 4):** 세 옵션 모두 `recommend: false` — pending 이므로 어떤 옵션도 추천/선택
  하지 않는다. 상대 강도는 `stars` 로만(no CI=2, smoke=2, hard=0; hard 는 evidence 가 "미지원"
  으로 명시). 비교 matrix 는 승자를 색칠하지 않는다(중립).
- **추측 금지(불변식 3):** 미측정 항목(방향별 FP rate, 교차환경 결정성, 승격 시 manifest 변경)은
  텍스트 끝 `(?)` 로 표시하고 비웠다.
- 개발자 버전 용어: `continue-on-error` · required check · Evidence 1d · Direction-2 FP ·
  `decision_id` · `--enforce` 미구현(check-generated-files.mjs:25-26).
- 일반인 버전: "경고만 vs 막기", "지금은 CI 없음" 평이한 말 + 맞춤법 검사기 비유
  (안 켬 / 빨간 줄만 / 틀리면 제출 불가).
- matrix 기준 5종: 기존 게이트 영향 · 소비 트리 깨짐 위험 · 필요한 증거 충족도 · 엄격도 ·
  drift 가시성.

## Explicit Non-Changes

- OD 를 resolve/close 하지 않음 — OD-11 은 status: open, 어떤 옵션도 미선택.
- 게이트(readiness/validate) 올리거나 내리지 않음.
- CI(`.github/workflows`)·`continue-on-error`·required check·`--enforce` 추가/수정 없음.
- `artifact-manifest.yaml` status(planned/active) 변경 없음.
- 소스/생성물/golden/테스트 로직 변경 없음.
- lint-pack/Interaction Matrix 작업 없음 (이 슬라이스는 Tier2 표면만).
- `_viz/` 산출물 외 어떤 문서/게이트/레지스터도 수정하지 않음(visualize-decision 읽기 전용 불변식).
- 추적 변경(git diff)은 이 슬라이스에서 design doc OD-11 추가 + 이 run report 둘뿐이다.
  `_viz/` 산출물 2쌍은 `.gitignore` 대상이라 추적되지 않는다(OD-4 산출과 동일).

## Verification

```txt
node .claude/skills/visualize-decision/assets/build.mjs docs/frontend-workflow/_viz/decision-OD-11-dev.data.json  docs/frontend-workflow/_viz/decision-OD-11-dev.html    → exit 0 (placeholder 0)
node .claude/skills/visualize-decision/assets/build.mjs docs/frontend-workflow/_viz/decision-OD-11-easy.data.json docs/frontend-workflow/_viz/decision-OD-11-easy.html   → exit 0 (placeholder 0)
npm test                       → exit 0 (test-fixtures PASS 27 · node --test 131/131) — 소스 무변경이라 영향 없음
git diff --check               → clean
```

(`npm test` 와 viz build 는 소스/스킬이 변경되지 않는 main 체크아웃에서 실행했다 — 이 브랜치는
docs 만 추가하므로 결과가 동일하다. viz 산출은 OD-4 와 같은 디렉터리에 두어 사람이 나란히 열 수
있게 했다.)

## Resolution (2026-06-21)

**OD-11 = resolved (decision_id: OD-11) — 사람 결정.** 선택: **"no CI" (현 상태 유지).** Tier2
codegen/route 의 모든 warning-first 표면(`check-generated-files` codegen focused target ·
`route-cross-check` · v1 default guard)을 **warning-first(exit 0) 그대로** 둔다.

- **승격은 도입(adoption) 후로 연기.** warning-first CI smoke / hard CI / required check /
  `--enforce` 는 실제 도입이 telemetry 를 만들 때까지 보류. 근거: PR #65 증거
  [`tier2-gate-promotion-evidence-001.md`](tier2-gate-promotion-evidence-001.md) (Decision Draft ·
  Promotion Telemetry Needed · Evidence 1d) — 도입 전엔 멀티런 smoke 이력·방향별 FP rate·소비
  트리 준비도·교차환경 결정성·사람 `decision_id` 가 없어 어떤 승격도 정당화되지 않는다(Evidence
  1d component-catalog placeholder 위험 포함).
- **CI 재분류 (GitLab):** CI 를 하게 되면 GitHub Actions(`.github/workflows`)가 아니라
  **GitLab(`.gitlab-ci.yml`) 기준**이어야 한다(현 킷 CI 는 타깃 환경과 불일치). 따라서 CI 는
  "승격 결정"이 아니라 **도입 작업**으로 재분류 — 이 슬라이스에서 GitLab CI 도 만들지 않는다.
- **재오픈 트리거:** 킷이 실제 프로젝트에 도입되어 warning-first telemetry(멀티런 smoke 이력 +
  방향별 FP 분류)가 생기면 그때 재검토.
- **이 슬라이스가 한 일(docs-only):** `temp/proposals/tier2-router-codegen-adapter.md` §16 에서
  OD-11 을 open → **Resolved by human decision — 2026-06-21** 블록으로 옮기고(decision_id 명시),
  `roadmap-current.md` item 2 잔여를 resolved/deferred 로 갱신, 본 보고서에 Resolution 기록.
  게이트(readiness/validate)·CI·`artifact-manifest.yaml` status·소스/생성물/golden/테스트 **무변경.**
- **resolve 는 사람 몫:** 위 결정은 사람이 내렸고 본 보고서는 그것을 *기록*만 한다. "no CI" 는 현
  상태 유지라 **적용된 코드/CI 변화가 없다** — 시각화는 이해 보조일 뿐 "확정/적용됨"이 아니다.
  (도입 작업: 온보딩/vendor/dogfood 는 이 슬라이스에서 시작하지 않으며 별도로 정한다.)

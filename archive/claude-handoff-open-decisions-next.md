# frontend-workflow-kit 작업 이어가기 (핸드오프)

> 🗄 **HISTORICAL (2026-07-11 이동)**: 원래 경로 `temp/claude-handoff-open-decisions-next.md`.
> `.gitignore` 의 `temp/claude-handoff*`(세션 핸드오프는 로컬 전용) 규칙과 달리 이 파일만
> 추적되고 있어, 규칙 일치를 위해 추적 유지한 채 `archive/` 로 이동했다(이슈 #165 · IMP-04).
> **세션 진입점으로 사용 금지** — 2026-06-13 시점 스냅샷이며, 현행 상태는
> [kit-dev/roadmap-current.md](../kit-dev/roadmap-current.md)가 정본이다.

> 스냅샷: 2026-06-13. 다음 세션(이 대화 기억 없음)이 그대로 읽고 이어가기 위한 자립형 프롬프트.

## 프로젝트
LLM이 프론트 프로젝트를 환각 없이 진행하게 만드는 워크플로우 킷. "LLM이 추론하던 것을 파일로 고정한다."
- 리포: `C:\Users\thdrl\source\repos\k-frontend-workflow` (Windows, GitHub: KiDooSong/k-frontend-workflow)
- 킷 위치: `frontend-workflow-kit/` (스크립트는 ESM `.mjs`, 의존성은 `yaml` 하나)
- 한국어로 소통. 작업 브랜치는 `main` 직접 사용+푸시(사용자 승인됨). 단 푸시는 외부작업이라 매번 확인받고, 푸시 전 코덱스 리뷰를 권장.

## 지금까지 완료 (origin/main = 9473b57)
- **MVP-A 닫힘**: GitHub Actions CI(`.github/workflows/frontend-workflow-kit.yml`)가 golden example을 자동 검증 — `example:state`/`readiness` 후 `git diff --exit-code`로 `_meta` 멱등성 게이트, 그 뒤 `example:validate`. `.gitattributes`(eol=lf)로 CRLF 헛실패 차단(core.autocrlf=true 환경).
- 실제 Expo 프로젝트 dry-run 1회 완료(경로 정합 확인). 태그 **v0.1.0-mvp-a = 679887b** (MVP-A 베이스라인, Open Decisions validate 이전).
- **Open Decisions validate 형식 검사(검사 9)** 구현+코덱스 리뷰 통과: `validate.mjs` 검사 9 = 표 형식·필수 6컬럼·행별 필수 4필드(ID·Decision Needed·Blocking Mode·Status)·`Status` enum(open|resolved)·`Blocking Mode` 정책 모드(open은 docs-only floor 위, 정책 미로드 시 skip+경고)·전역 `D-xxx` ID 중복. `resolved`→Options 빈값은 경고. Open Decisions 파서는 `lib/spec.mjs`의 `parseOpenDecisions`로 단일 출처화(readiness↔validate 공유). validate 출력에 경고 채널(`[경고 N]` + JSON `warnings[]`) 있음.

## 깨면 안 되는 불변식 (README "불변식" + roadmap "지금 하지 말 것")
1. 판정 로직 단일 출처 = `readiness.mjs`. validate/hook/스킬은 출력을 **소비만**. 파싱 공유는 `lib/spec.mjs`.
2. 게이트를 "내리는" 전이(resolve / status confirmed 승격 / conflict 닫기)는 **사람-전용**. LLM은 올리기만(open 추가, resolved→open 재오픈).
3. 생성기는 **멱등** — 같은 입력 → 같은 출력(타임스탬프 `generated_at` 한 줄만). `_meta/*.yaml`은 생성물(do_not_edit, GENERATED 헤더/마커).
4. 파생값(tbd_count 등)은 frontmatter에 쓰지 않는다 — 스크립트가 본문에서 계산.
5. 새 산출물 축 추가 금지(리뷰도 새 축 아님 → Work Packet 후보로 흡수). MVP-A 게이트는 **정책 fact + Open Decision decision_cap 뿐**(Unknown/Conflict는 자동 게이트 아님).
6. 문서↔코드 정합성 유지: 검사 카운트("검사 N종")·구현 상태(✅/후속)를 코드와 일치. 변경 시 README·roadmap-current.md·open-decisions.md·CHANGELOG 동기화.
7. fixture-ui의 `fake_hook` 게이트 = `src/features/{domain}/hooks/`의 `.ts(x)` 파일 존재(`asyncState.ts` 복사와 별개).

## 검증 루틴 (변경 후 반드시)
```
cd frontend-workflow-kit
npm install
npm run example:state
git diff --exit-code -- examples/coupon-feature/docs/frontend-workflow/_meta   # 멱등성 게이트 — diff 0이어야 함
npm run example:readiness
npm run example:validate    # 검사 9종 통과, exit 0
```
- 음성 테스트: `/tmp`에 임시 docs+src를 만들어 새 검사가 실제로 발화하는지 확인(통과만 보지 말 것).
- 핵심 코드 변경 시 **코덱스 리뷰** 권장: `codex:codex-rescue` 서브에이전트(Agent tool)에 diff 범위와 점검 포인트를 주고, 지적 해소될 때까지 반복 후 푸시.

## 다음 작업
`roadmap-current.md` "다음 구현 후보"에서 **하나를 명시적으로 골라** 착수(아무거나 시작 금지):

> **업데이트(2026-06-14):** 아래 1순위 `reconcile-input` 스킬은 이미 작성·출하됨(리포-로컬 `.claude/skills/reconcile-input/`). 현재 `roadmap-current.md` "다음 구현 후보" 순서는 **① Work Packet & Review Artifacts · ② Open Decisions `forbidden_paths` backstop · ③ reconcile-input 후속(킷 `skills/` vendor + hook/CI)** 이다. 아래 목록은 2026-06-13 스냅샷이라 reconcile-input 을 1순위로 적고 있으니, 우선순위는 roadmap 을 1차 출처로 본다.

1. **reconcile-input 스킬** — Tier 2 구현 첫발 (계약: `input-reconciliation.md`). ← 현재 1순위
2. **Work Packet & Review Artifacts** 최소 도입 — Future Candidate (초안: `temp/work-packet-review-artifacts-proposal.md`)
3. **Open Decisions `forbidden_paths` 경계 backstop** — diff/CI 기반(트리 스캔은 공유 `src/api`에 오탐이라 부적합). CI의 `git diff`와 결합하는 자리.

먼저 `roadmap-current.md`와 해당 계약 문서를 읽고 설계를 잡은 뒤 구현.

## 주의
- untracked 디렉토리 `examples/input-reconciliation/`, `examples/multi-screen-dry-run/`, `temp/_fixture-contract.md` 등은 이전 세션(나) 작업물이 **아님** — 사용자 WIP일 수 있으니 함부로 커밋하지 말 것. 커밋은 항상 **명시적 경로만** `git add`.
- 커밋 메시지 끝: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- `feat/mvp-a-frontend-workflow-kit` 브랜치는 main보다 뒤처진 stale 상태(정리 안 함). 작업은 main에서.

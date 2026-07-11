# Run evidence 보존·분류 정책 — retention and indexing for historical run evidence

> v1 (2026-07-11) · 출처: 이슈 #165 (open-improvements-backlog IMP-04).
> **이 문서는 정책 문서다. 그 자체로 아무것도 게이트하지 않는다.** 이 문서의 도입으로
> 새 CI hard gate·새 required check·새 artifact 축은 하나도 생기지 않고, 어떤 warning-first
> surface 도 승격되지 않으며, consumer payload allowlist([distribution-manifest.yaml](../frontend-workflow-kit/distribution-manifest.yaml))는
> 바뀌지 않는다. 분류를 검사하는 도구/스크립트도 만들지 않는다 — 이 정책은 사람과 LLM 이
> 문서를 배치·검색할 때 따르는 prose 규칙이다. 게이트 해제(resolve/confirmed 승격)는
> 여전히 사람 전용이다.

## 목적

dev 문서를 `kit-dev/` 로 옮기고 consumer payload 에서 제외하는 경계는 이미 설계돼 있다.
그러나 저장소 루트 `temp/` 에는 과거 board·proposal·run report·release check 가 다수 남아
있어, "현재 계획"을 찾을 때 historical evidence 와 active plan 이 섞인다. 이 문서는
**(1) 산출물 분류 3종, (2) run evidence 의 canonical 위치, (3) 보존·아카이브 규칙**을 한 곳에
고정한다. release/dogfood evidence 인덱스는 [temp/runs/README.md](../temp/runs/README.md)
(repo-level)와 roadmap 링크(kit 개발 slice — 아래 §canonical 위치)가 담당한다.

## 분류 3종

모든 계획/증거 산출물은 다음 셋 중 하나다.

```txt
active           현행 사실의 정본. "현재 계획/상태" 질문에 답할 때 읽는 문서.
                 - 계획·구현 상태·게이트 인벤토리: kit-dev/roadmap-current.md
                 - 릴리스 이력·버전 baseline:      kit-dev/CHANGELOG.md
                 - 열린 결정:                      kit-dev/open-decisions.md
                 - warning-first 승격 상태:        kit-dev/warning-first-promotion-policy.md
                 - 최신 릴리스 검증 증거:          temp/runs/ 의 release check 중 frontmatter
                                                   `status: current` 인 단 한 파일
                 temp/ 아래에서 active 는 그 release check 하나뿐이다. 그 밖의 temp/ 문서를
                 현행 계획으로 읽지 않는다.

historical       종결된 board·plan·proposal·run report·과거 release check. 당시 결정의
                 근거(evidence)로서 보존하며 삭제하지 않는다. 정본 자격은 없다 —
                 active 문서와 충돌하면 언제나 active 가 이긴다.
                 표기: 문서 첫 줄들에 대문자 `HISTORICAL` 마커(또는 🗄 글리프)를 포함한
                 배너. doc-drift 의 canonical 문서 스캔도 이 마커를 기계적으로 skip 한다.

generated-local  git 이 추적하지 않는 로컬 전용 산출물. 재생성 가능하거나(빌드/캐시)
                 민감 원본(회사 Figma 소스·consumer 코드 카피)을 임베드해서 추적이
                 금지된 것. 규칙의 정본은 .gitignore 이며 아래 매핑 표는 그 요약이다.
```

## Canonical 위치 — 어떤 run evidence 가 어디로 가는가

두 개의 runs 디렉토리가 있고, 각각 canonical 범위가 다르다. 기존 파일은 **제자리 보존**한다
(이동하면 roadmap·run report·머지된 PR 본문의 상대 링크가 깨진다) — 위치가 아니라
인덱스와 배너로 분류를 표현한다.

| 위치 | canonical 범위 | 인덱스 |
|---|---|---|
| `temp/runs/` (repo 루트) | repo-level 증거: **release check**, consumer/워크플로우 dogfood(kit 레포 밖 프로젝트에 킷을 적용한 실측), 저장소 종합 분석 보고서 | [temp/runs/README.md](../temp/runs/README.md) — 날짜·commit·status 표 |
| `kit-dev/temp/runs/` | kit 개발 slice run evidence: 기능 slice 구현/검증 기록, gate promotion evidence, 채택 probe | 1차 인덱스는 [roadmap-current.md](roadmap-current.md) 의 evidence 링크 (재인덱스하지 않음 — one fact, one home). 분류 안내: [kit-dev/temp/README.md](temp/README.md) |
| `frontend-workflow-kit/temp/**` | **금지.** dev 산출물은 킷 아래에 두지 않는다. distribution-manifest 의 `temp/**` exclude 는 안전 가드로만 유지 | — |

- 새 release check 는 `temp/runs/release-*.md` 에 만들고, frontmatter 계약을 따른다:
  `kind: release-check`, `release`, `base_commit`, `date`, `verdict`, `status: current|historical`.
  새 check 가 `current` 가 될 때 직전 `current` 를 같은 PR 에서 `historical` 로 강등하고
  HISTORICAL 배너를 단다(선례: [release-mvp-b-final-check.md](../temp/runs/release-mvp-b-final-check.md)).
  `status: current` 는 항상 정확히 한 파일이다.
- 새 kit 개발 slice run report 는 `kit-dev/temp/runs/` 에 만들고 roadmap 해당 항목에서
  링크한다 — roadmap 링크가 곧 인덱스다.
- 루트 `temp/` 의 나머지(plans/proposals/workflows/evaluations/prompts/examples 등)는
  MVP 시대의 historical 작업공간이다. 새 board/plan 을 여기에 만들지 않는다 — 계획은
  roadmap, 설계 제안은 `kit-dev/temp/proposals/` 로 간다.

## 보존·아카이브 규칙

1. **삭제보다 archive 우선.** historical 문서는 지우지 않는다. 자리를 옮겨야 할 이유가
   있으면(추적/ignore 모순 등) `archive/`(repo 루트, 추적됨)로 `git mv` 하고 문서 첫 줄에
   원래 경로·이동 날짜를 남긴다.
2. **증거를 제거하려면 대체 링크 또는 보존 근거가 필수.** 파일을 지우는 PR 은
   (a) 같은 사실을 담은 대체 문서 링크, 또는 (b) 재생성 방법·민감성 등 보존하지 않는
   근거를 PR 본문과 인덱스에 남겨야 한다. git history rewrite 는 하지 않는다.
3. **superseded 는 양방향 표기.** 새 문서가 옛 문서를 대체하면 새 문서가 옛 문서를
   명시적으로 링크하고("~를 대체한다"), 옛 문서 첫 줄들에 HISTORICAL/superseded 배너 +
   대체 문서 링크를 단다.
4. **민감 원본은 기존 ignore 원칙 유지.** 회사 Figma 디자인 소스·카피·consumer 앱 코드가
   임베드된 run 산출물은 계속 git-ignore 한다(추적 전환 금지). 공유 가능한 findings 는
   `docs/research/` 에 추적하는 기존 분리를 따른다.
5. **HISTORICAL 마커 규약.** historical 배너는 문서 첫 줄들 안에 대문자 `HISTORICAL`
   (또는 🗄)을 포함해, `workflow:doc-drift` 의 historical skip 과 일치시킨다.

## generated-local ↔ .gitignore 매핑

규칙의 정본은 [.gitignore](../.gitignore) 다. 이 표는 "무엇이 왜 로컬 전용인지"의 요약이며,
.gitignore 를 바꾸는 PR 은 이 표도 함께 맞춘다.

| .gitignore 패턴 | 왜 로컬 전용인가 | 보존/대체 근거 |
|---|---|---|
| `temp/runs/figma-fidelity-001/` | 회사 Figma 디자인 소스·카피·렌더 임베드(민감) | 일반 분석은 `docs/research/` 에 추적 |
| `temp/runs/maestro-dogfood-001/` | 위 figma 앱을 구동하는 하니스 — 앱 카피·소스 임베드(동일 범주) | findings 는 `docs/research/playwright/` 에 추적 |
| `temp/runs/consumer-ck-ai-mobile-adoption-001.md` · `temp/runs/2026-06-15/` | consumer(ck) 코드·맥락 임베드 probe raw(민감) | 해소 현황·결론은 [2026-06-16 보고서](../temp/runs/2026-06-16/consumer-ck-adoption-resolution-status.md)에 추적 |
| `temp/runs/*/app/node_modules/` · `.expo/` · `dist/` · `web-build/` | Expo/RN 샌드박스 빌드 산출물(재생성 가능) | 소스는 추적 유지 |
| `temp/runs/**/node.rest.json` | Figma REST 추출 원본(6~10k줄) — 재생성 가능 | 정본은 `implementation-facts.json`(추적) |
| `temp/archive/` · `temp/claude-handoff*` · `temp/local-pull-blockers-20260627/` | 세션 임시 작업물 | 보존 가치가 생기면 repo 루트 `archive/` 로 승격(추적) — 선례: [archive/claude-handoff-open-decisions-next.md](../archive/claude-handoff-open-decisions-next.md) |
| `/dist/` | `kit:pack` 빌드 산출물 | `npm run kit:pack` 으로 재생성 |
| `docs/frontend-workflow/_viz/` · `docs/frontend-workflow_viz/` | visualize-decision 스킬 출력(읽기 전용 보조물) | 스킬로 재생성 |
| `.codex/` · `.serena/` · `.claude/worktrees/` · `.claude/skills/wt/` · `.claude/skills/write-a-skill/` | 로컬 도구 스캐폴딩/워크스페이스 | 재생성 가능 |
| `figma-pat` | Figma 개인 액세스 토큰 — **절대 커밋 금지** | — |

## 경계 — 이 문서가 하지 않는 것

- 분류/보존 준수를 검사하는 새 스크립트·CI step·hard gate 를 만들지 않는다.
- 새 artifact 축을 만들지 않는다 — `_meta/` 산출물이 아니라 kit-dev prose 정책이다.
- consumer payload allowlist 를 바꾸지 않는다(더 엄격해지는 방향만 허용).
- 기존 historical 문서의 대량 이동·삭제·git history rewrite 를 요구하지 않는다.
- warning-first surface 승격, resolve/confirmed 전이와 무관하다(모두 사람 전용 그대로).

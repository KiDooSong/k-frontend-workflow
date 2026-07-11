# temp/runs/ — repo-level run/release evidence index

> 분류·보존 규칙: [kit-dev/evidence-retention-policy.md](../../kit-dev/evidence-retention-policy.md).
> 이 디렉토리는 repo-level 증거(release check · consumer/워크플로우 dogfood · 종합 분석)의
> canonical 위치다. kit 개발 slice run evidence 는 `kit-dev/temp/runs/` 에 있고, 그 인덱스는
> [roadmap-current.md](../../kit-dev/roadmap-current.md) 의 evidence 링크다.
> **`status: current` 인 release check 는 항상 정확히 1건** — 그 외 전부 HISTORICAL 이다.

## Release checks

| 문서 | release | base commit | 날짜 | verdict | status |
|---|---|---|---|---|---|
| [release-0.3.0-mvp.1-final-check.md](release-0.3.0-mvp.1-final-check.md) | v0.3.0-mvp.1 | `89d6564` | 2026-07-11 | GO | **current** |
| [release-mvp-b-final-check.md](release-mvp-b-final-check.md) | v0.2.0-mvp-b-rc1 | `6bbe8bd` | 2026-06-14 | GO (rc1) | historical |

새 release check 를 추가할 때: frontmatter(`kind: release-check` · `release` · `base_commit` ·
`date` · `verdict` · `status`)를 채우고, 직전 `current` 를 같은 PR 에서 `historical` 로
강등(HISTORICAL 배너 포함)한 뒤 이 표를 갱신한다.

## Dogfood / 워크플로우 run evidence (전부 historical)

| 항목 | 날짜 | 도입 commit | 내용 · 결과 |
|---|---|---|---|
| [consumer-dogfood-001/](consumer-dogfood-001/run-report.md) | 2026-06-14 | `6bbe8bd` (#17) | fresh Expo 프로젝트에 킷 적용, state→readiness→packet→implement→validate 완주 — **PASS** (evidence/ 9파일) |
| [implement-screen-001/](implement-screen-001/implement-run-report.md) | 2026-06-13 | `c6acfc2` | implement-screen 스킬 dry-run — done |
| [reconcile-input-001/](reconcile-input-001/reconcile-run-report.md) | 2026-06-13 | `4225ddf` | reconcile-input dry-run (입력 5건) + LLM-after 산출물 |
| [reconcile-input-002/](reconcile-input-002/reconcile-run-report.md) | 2026-06-13 | `4225ddf` | reconcile-input dry-run 2차 |
| [2026-06-16/consumer-ck-adoption-resolution-status.md](2026-06-16/consumer-ck-adoption-resolution-status.md) | 2026-06-16 | `fe311ec` | consumer-ck 도입 이슈 해소 현황 — 2026-06-15 설계의도 리뷰를 대체(원 리뷰·probe raw 는 local-only, 아래 참조) |
| [api-schema-match-001.md](api-schema-match-001.md) | 2026-06-14 | `2776367` (#19) | validate 검사 8 구현 증거 |
| [api-schema-match-dogfood-001.md](api-schema-match-dogfood-001.md) | 2026-06-14 | `7c6f878` | 검사 8 dogfood |
| [execution-loop-pr1a-001.md](execution-loop-pr1a-001.md) · [pr1b](execution-loop-pr1b-001.md) | 2026-06-14 | `c4d45ed` · `9ee5829` | execution-loop PR1a/1b 문서화 실행 기록 |
| [generated-file-guard-001.md](generated-file-guard-001.md) | 2026-06-14 | `46650fa` | generated 산출물 계약 일관화 (MVP-C Phase 0) |
| [input-validation-001.md](input-validation-001.md) | 2026-06-14 | `5a7b3c8` | validate 검사 11·12 구현 증거 |
| [route-tree-001.md](route-tree-001.md) | 2026-06-14 | `455b509` | route-tree generator (MVP-C Phase 0) |
| [test-harness-001.md](test-harness-001.md) | 2026-06-14 | `4225ddf` | golden fixture 비교 하니스 (MVP-B Phase 0) |
| [project-analysis-report-2026-06-14.md](project-analysis-report-2026-06-14.md) | 2026-06-14 | `ae97ab8` | 저장소 종합 분석 보고서 |
| `_snapshots/` · `_tools/` | 2026-06-13 | `c6acfc2` | implement-screen dry-run 의 상태 스냅샷과 스냅샷 도구 |

## Local-only (git-ignored — 추적 전환 금지)

| 항목 | 왜 로컬 전용인가 | 대체/보존 근거 |
|---|---|---|
| `figma-fidelity-001/` | 회사 Figma 디자인 소스·카피·렌더 임베드(민감) | 일반 분석은 `docs/research/` 에 추적 |
| `maestro-dogfood-001/` | 위 figma 앱 구동 하니스(앱 소스·카피 임베드) | findings 는 `docs/research/playwright/` 에 추적 |
| `consumer-ck-ai-mobile-adoption-001.md` · `2026-06-15/`(설계의도 리뷰) | consumer(ck) 코드/맥락 임베드 probe raw | 해소 현황·결론은 [2026-06-16 보고서](2026-06-16/consumer-ck-adoption-resolution-status.md)에 추적 |
| `*/app/node_modules/` 등 빌드 산출물 · `**/node.rest.json` | 재생성 가능 | [.gitignore](../../.gitignore) 주석 참조 |

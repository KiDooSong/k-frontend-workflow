# kit-dev/temp/ — kit 개발 run evidence·제안 작업공간

> 분류·보존 규칙: [evidence-retention-policy.md](../evidence-retention-policy.md).
> 여기는 **kit 개발 slice run evidence 의 canonical 위치**다. repo-level 증거
> (release check·consumer dogfood)는 repo 루트 [temp/runs/](../../temp/runs/README.md)로 간다.
> consumer payload 에는 포함되지 않는다(`kit-dev/` 전체가 payload 밖).

| 경로 | 내용 | 인덱스 / 정본 |
|---|---|---|
| `runs/` | 기능 slice 구현·검증 run report, gate promotion evidence, 채택 probe | **재인덱스하지 않는다** — 각 run 은 [roadmap-current.md](../roadmap-current.md) 해당 항목의 evidence 링크로 찾는다(one fact, one home). roadmap 에서 링크가 빠진 run 은 historical 로 간주 |
| `proposals/` | 설계 제안 초안 | 제안일 뿐 상태 정본 아님 — 구현/채택 여부는 roadmap 이 정본 |
| `reports/` | 채택 평가 등 일회성 보고서 | historical evidence |

새 slice run report 는 `runs/` 에 만들고 같은 PR 에서 roadmap 해당 항목에 링크한다.
여기 문서가 roadmap/CHANGELOG 과 충돌하면 언제나 roadmap/CHANGELOG 이 이긴다.

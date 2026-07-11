# temp/ — HISTORICAL 작업공간 (현재 계획 아님)

> 🗄 **HISTORICAL.** 이 디렉토리는 MVP 시대(2026-06)의 board·plan·proposal·run evidence
> 작업공간이다. **"현재 계획/상태"를 찾는다면 여기를 읽지 말 것:**
>
> - 현재 계획·구현 상태·게이트 인벤토리 → [kit-dev/roadmap-current.md](../kit-dev/roadmap-current.md)
> - 릴리스 이력·버전 baseline → [kit-dev/CHANGELOG.md](../kit-dev/CHANGELOG.md)
> - 분류·보존 규칙 → [kit-dev/evidence-retention-policy.md](../kit-dev/evidence-retention-policy.md)
>
> temp/ 아래에서 유일한 active 문서는 `runs/` 의 `status: current` release check 하나다
> ([evidence index](runs/README.md)). 새 board/plan 을 여기에 만들지 않는다.

## 지도

| 경로 | 내용 | 분류 |
|---|---|---|
| [runs/](runs/README.md) | repo-level run/release evidence — **날짜·commit·status 인덱스는 runs/README.md** | historical + release check `current` 1건 |
| [workflows/mvp-b-board.md](workflows/mvp-b-board.md) | MVP-B 병렬 작업 보드 (2026-06-14 종결, 전 lane 머지) | historical (superseded) |
| [plans/consumer-dogfood-001-plan.md](plans/consumer-dogfood-001-plan.md) | consumer dogfood 계획 (run 완료됨) | historical |
| proposals/ | MVP-B/C 시대 설계 제안 — 이후 제안은 `kit-dev/temp/proposals/` | historical |
| evaluations/ | dry-run 채점 rubric/checklist | historical |
| examples/ | work-packet dry-run 예시 산출물 | historical |
| execution-loop-research/ | 실행 루프 리서치 노트·리포트 | historical |
| prompts/ | MVP 종료 세션 프롬프트 (tracker #167) | historical (세션 소진 후) |
| 루트 `*.md` · `*.html` | 개별 제안/스킬 초안/시각화 프로토타입 | historical |

git 이 추적하지 않는 로컬 전용 항목(`archive/`, `claude-handoff*`,
`runs/figma-fidelity-001/` 등)은 [.gitignore](../.gitignore) 와
[retention 정책의 매핑 표](../kit-dev/evidence-retention-policy.md#generated-local--gitignore-매핑)를 따른다.

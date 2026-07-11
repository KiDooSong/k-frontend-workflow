# IMPLEMENTING — MVP-A historical build note

> 🗄 **HISTORICAL (2026-07-11 강등)**: 이 문서는 **MVP-A(2026-06-12~13) 최초 구현 세션의 킥오프 노트**다.
> MVP-A 는 완료되었고, 이후 MVP-B/C·telemetry/eval/red-team/doc-drift·visual·adoption 계층까지 랜딩되어
> 현재 킷은 이 문서가 말하는 "스크립트 3개 / 검사 8종" 범위를 훨씬 넘는다 (release baseline `0.3.0-mvp.1`).
> **이 문서를 세션 진입점으로 쓰지 마라.** 현행 진입점과 정본은:
> - 저장소 전체 개요: [README.md](README.md) (루트)
> - 구현 상태·티어·게이트 인벤토리 정본: [kit-dev/roadmap-current.md](kit-dev/roadmap-current.md)
> - 릴리스 이력: [kit-dev/CHANGELOG.md](kit-dev/CHANGELOG.md)
> - 문서별 소유권: [doc-ownership.md](frontend-workflow-kit/docs/reference/doc-ownership.md)
> - 열린 결정: [kit-dev/open-decisions.md](kit-dev/open-decisions.md)
>
> 아래 본문은 MVP-A 당시 상태 그대로 보존한다 — 설계 사상·불변식(§4)의 역사적 근거로만 읽고,
> 게이트·검사 수·스크립트 목록 등 현행 사실은 반드시 위 정본에서 확인하라.

> ⚠ **진입점 주의 (2026-06-14 추가)**: 아래 §0~§1 이 "빌드 스펙"으로 가리키는 4종 설계 문서는 **설계 배경**이다.
> 게이트·검사·티어·모드의 **현행 정본**은 [roadmap-current.md](kit-dev/roadmap-current.md) ·
> [문서 소유권 지도](frontend-workflow-kit/docs/reference/doc-ownership.md) · [open-decisions.md](kit-dev/open-decisions.md) 다.
> 4종은 사상·구조 근거로 읽되, `decision_cap`·검사 9~12 등 최신 게이트는 현행 정본에서 확인하라 (분석 보고서 P3/P4).

> 작성일: 2026-06-12
> 용도(당시): frontend-workflow-kit을 **직접 만드는** 세션의 진입점.
> 이 세션은 설계 대화의 맥락이 없다고 가정한다 — 필요한 모든 출발점을 여기 고정한다.
>
> ※ 이 파일은 "어디를 읽고 무엇을 만들지"만 가리킨다. 실제 스펙은 각 문서에 있고,
>   여기에 사본을 두지 않는다 (사본은 반드시 드리프트한다).

---

## 0. (당시) 만들던 것

`frontend-workflow-kit` — LLM이 프론트 프로젝트를 환각 없이 진행하게 만드는 워크플로우 킷.
당시 목표는 **MVP-A**: 문서 생성과 readiness 판정까지. 린트팩·Figma·훅은 이후 단계(B~D)였다.
(→ 이후 전부 또는 대체 형태로 랜딩됨. 현행 범위는 [roadmap-current.md](kit-dev/roadmap-current.md).)

설계 문서 4종 (읽는 우선순위 순):
1. [frontend-workflow-kit-implementation.md](frontend-workflow-kit-implementation.md) — 빌드 스펙 (구현자용)
2. [frontend-llm-workflow.md](frontend-llm-workflow.md) — Core 워크플로우 (사용자용, 템플릿의 근거)
3. [frontend-llm-workflow-expanded.md](frontend-llm-workflow-expanded.md) — 산출물 카탈로그/상태 모델
4. [frontend-workflow-skillpack-concept.md](frontend-workflow-skillpack-concept.md) — 개념/디렉토리/스킬 흐름

---

## 1. 읽는 순서 (MVP-A)

전부 정독하지 않는다. 빌드할 산출물에 필요한 절만 집어 읽는다.

| 순위 | 문서 | 읽을 절 | 왜 |
|---|---|---|---|
| 1 | kit-implementation.md | **전체** (§2,4,5,6,7,8,11,12 핵심) | 빌드 스펙 그 자체 |
| 2 | frontend-llm-workflow.md | **§2 ScreenSpec 구조** (+ §6 AsyncState/query key) | workflow-state.mjs가 본문을 파싱 → 템플릿과 파서가 같은 구조여야 함 |
| 3 | expanded.md | **§1 상태 모델** | frontmatter 스키마(status vs confidence, 승인 메타) 출처 |
| 4 | skillpack-concept.md | **§2 디렉토리, §4 생성 구조, §8 스킬 흐름** | 파일이 어디에 생기는지 |

**건너뛸 것:** `archive/**`, lint-pack/adapt/Figma/nav-graph/hooks 관련 절 (전부 MVP-B 이후), 케이스 예제.

---

## 2. 산출물 ↔ 읽을 곳

| 만들 것 | 읽어야 할 곳 |
|---|---|
| `templates/screen/screen-spec.template.md` | Core §2 + Expanded §1 |
| `scripts/workflow-state.mjs` | impl §5 (파싱 규칙 표) + 위 템플릿 |
| `scripts/readiness.mjs` | impl §6 (입출력 계약) + §7 (mode-policy) |
| `scripts/validate.mjs` | impl §8 (검사 8종) + §4 (artifact-manifest) + frontmatter 스키마 |
| `skills/implement-screen/SKILL.md` | impl §6 출력 + concept §8 |
| `catalog/artifact-manifest.yaml` | impl §4 |
| `policies/implementation-mode-policy.yaml` | impl §7 |
| `package-scripts.template.json` | impl §2 |
| `examples/coupon-feature/` (golden example) | Core 전체 (end-to-end 1회 완주) |

---

## 3. MVP-A 범위와 완료 기준

만드는 것 (impl §11 MVP-A):

```txt
templates: screen-spec(통합형+stub), navigation-map(뼈대), llm-rules, domain-rules
scripts:   workflow-state.mjs / readiness.mjs / validate.mjs   ← 스크립트는 이 3개뿐
skills:    implement-screen
schemas:   frontmatter.schema.json
registry:  artifact-manifest.yaml (위 산출물 등록분만)
examples:  coupon-feature golden example
```

이 단계에서 **임시 허용** (해당 생성기는 MVP-C에서):
- Entry Points 수동 작성 (nav-graph 없음)
- Component Catalog 수동 작성 (catalog-gen 없음)

**완료 기준:** 실프로젝트 화면 1개를 `stub → spec → 구현 → validate` 사이클로 완주.

---

## 4. 깨면 안 되는 불변식

구현 중 흔들리기 쉬운 원칙. 코드/템플릿이 이걸 위반하면 설계가 무너진다.

```txt
1. 판정 로직은 한 곳. readiness 판정은 readiness.mjs에만. 훅·스킬은 그 출력을 소비만.
2. 파생값은 frontmatter에 쓰지 않는다. tbd_count 등은 workflow-state.mjs가 본문에서 계산.
3. 생성물에는 GENERATED 마커/헤더. 마커 밖은 생성기가 건드리지 않는다. (impl §3)
4. 사실의 단일 출처: zod 스키마=코드파일, query key=factory, props=컴포넌트 코드.
   문서는 링크/의도만. 문서 속 코드 사본 금지.
5. 화면은 AsyncState 계약만 의존. TanStack Query 객체를 화면에 그대로 노출 금지. (Core §6)
6. confirmed 승격은 사람만. 승인 메타(approved_by/at/decision_id) 없으면 validate 실패.
7. 생성기는 멱등. 같은 입력 → 같은 출력. 정렬 고정, 타임스탬프는 generated_at 한 줄만.
8. 최종 방어선은 npm scripts + CI. 훅은 얇은 wrapper일 뿐. (concept 방어선 3층)
9. 스크립트는 --json 모드 지원 (스킬이 파싱). 의존성 최소 (Node 내장 + gray-matter/yaml).
```

---

## 5. 첫 세션 추천 시작점

```txt
1. 이 파일 + impl §11(MVP-A) 읽기
2. screen-spec.template.md 먼저 (파서·readiness·golden example이 전부 여기에 의존)
3. artifact-manifest.yaml + frontmatter.schema.json (validate의 기준)
4. workflow-state.mjs → readiness.mjs → validate.mjs 순
5. coupon golden example로 end-to-end 검증
6. implement-screen 스킬은 readiness 출력이 안정된 뒤
```

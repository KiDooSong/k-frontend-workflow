# Changelog

킷 자체의 버전 관리 (템플릿/스크립트 계약 추적용).

## 0.1.0-mvp-a — 2026-06-13

MVP-A: 문서 생성 + readiness 판정 + 검사. (구현 명세 §11 MVP-A)

### Added
- templates: `screen/screen-spec.template.md`(통합형+stub), `app/navigation-map.template.md`(뼈대),
  `global/llm-rules.template.md`, `domain/domain-rules.template.md`
- scripts: `workflow-state.mjs`, `readiness.mjs`, `validate.mjs` (+ 공유 lib: util/spec/schema)
- schemas: `frontmatter.schema.json` (최소 검증기로 검사)
- catalog: `artifact-manifest.yaml` (MVP-A 등록분)
- policies: `implementation-mode-policy.yaml` (모드별 허용/금지 경로)
- skills: `implement-screen/SKILL.md`
- examples: `coupon-feature` golden example (end-to-end 1회 완주)
- `package-scripts.template.json`

### Notes
- `readiness` 게이트에 `screen_spec_authored` 사실을 추가했다 — stub(frontmatter만)에는
  full UI(rough-fixture-ui)를 막아 "ScreenSpec 먼저" 원칙을 결정적으로 강제한다 (구현 명세 §7의 의도를 명시화).
- 임시 허용(MVP-A): Entry Points 수동 작성(nav-graph는 C), Component Catalog 수동 작성(catalog-gen은 C).

### Review fixes (Codex 1차 리뷰 반영)
- readiness 모드 선택을 **누적(cumulative) 사다리**로 변경 — 높은 모드가 낮은 모드의 전제를 건너뛰지 못한다.
- validate 검사 7: `decision_id` 도 confirmed 필수로 추가 (IMPLEMENTING §4 #6).
- validate 검사 2: manifest path 패턴 위반("잘못된 경로") 검출 추가 (impl §4).
- validate 검사 3: depends_on 이 manifest 키일 때 해당 concrete 파일 존재까지 확인.
- validate 검사 6: authored screen-spec 의 generated section 마커(GENERATED:START/END) 무결성 검사 추가.
- readiness 가 artifact-manifest 를 입력으로 로드 (§6 입력 계약) — 게이트는 정책이 단일 출처, 매니페스트는 next_actions 보강에만 사용.
- 스크립트 3종을 직접 실행 시에만 main() 실행하도록 가드 (import 부작용 제거 — computeReadiness/buildState 재사용 가능).
- 검사 8(confirmed API↔스키마)은 MVP-A 에서 "존재"만 확인. 후보↔스키마 1:1 매칭은 MVP-B 로 연기(코드 주석에 명시).

### Review fixes (Codex 2차 리뷰 반영)
- `package-scripts.template.json`: 동작하는 3개(state/readiness/validate)만 `scripts` 에 두고, 미구현 6개(lint-gen/lint-baseline=B, catalog/nav/route-tree/check-generated=C)는 npm 이 무시하는 `//roadmap-scripts` 키로 분리. 통째로 병합해도 깨지지 않고 로드맵은 그대로 보인다 (이전엔 없는 .mjs 를 가리켜 실행 시 'Cannot find module').
- Gap/Conflict 기록처를 정식화: `global/component-gap-register.md`·`global/conflicts.md` 템플릿 신설 + manifest 등록 + schema `artifact_type` enum 추가. llm-rules/SKILL 이 가리키던 "Component Gap Register"·"conflicts.md" 댕글링 참조에 구체 경로를 부여 (LLM 이 막혔을 때 어디에 남길지 결정적으로 고정).

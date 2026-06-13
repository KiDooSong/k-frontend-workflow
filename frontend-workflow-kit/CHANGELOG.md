# Changelog

킷 자체의 버전 관리 (템플릿/스크립트 계약 추적용).

## 0.2.0-mvp-b-phase0 — 2026-06-14

MVP-B Phase 0: 회귀 하니스 + 경로 backstop + 입력/register 검증 (lanes A/B/C 통합). 대부분 warning-first — 기본 CI exit code 불변.

### Added
- scripts: `test-fixtures.mjs` (+ `lib/test-fixture.mjs`) — golden fixture 비교 하니스(MVP-B Phase 0). `reconcile`(raise-only 불변식) + integrity 검사. exit `0`/`1`/`2`, xfail witness(올바른 이유로 실패할 때만 증거 인정). (Lane A)
- scripts: `forbidden-paths.mjs` (+ `lib/path-backstop.mjs`) — diff 기반 `forbidden_paths` backstop(2차 방어선). warning-first(기본 exit `0`, `--enforce` 시 위반은 exit `1`). `examples/path-backstop/` 픽스처 동반. (Lane B)
- validate: 검사 11(입력 결과물 `inputs/*.md` frontmatter)·검사 12(Reconciliation Register) 추가 (+ `lib/input-artifact.mjs`, `lib/reconciliation-register.mjs`). 구조 검사=하드(exit `1`), 미처리(Reconcile Status `in-progress`/`failed`) 감지=warning-first(`--enforce` 로 하드). (Lane C)
- templates: `work-packet/{work-packet,run-report,review-artifact}.template.md` — 설계/문서 템플릿(코드 강제 0, 여전히 Future Candidate).
- docs: `docs/workflows/mvp-b.md` — MVP-B Phase 0 통합 노트.
- ci/wiring: kit `example:test` alias + golden fixture CI step(`continue-on-error` = **warning-only**, 비차단); `workflow:forbidden-paths` alias(kit `package.json` + 소비 템플릿). (lane 배선분)

### Changed
- validate 총 검사 수: 검사 9종 → 12종. README·roadmap·open-decisions 의 live 카운트 갱신.
- README/roadmap/open-decisions/input-reconciliation: `forbidden_paths` backstop·Reconciliation Register CI 강제의 "후속" 표현을 구현 상태(warning-first)로 정정.
- `package-scripts.template.json`: 구현된 `forbidden-paths` 를 active `scripts` 로 추가(warning-first; CI 에서 `git diff` 컨텍스트로 호출).

### Notes
- `test-fixtures`: kit `example:test` alias + CI golden fixture step 배선됨(`continue-on-error: true` = **warning-only**, 비차단). 하드 gating 승격은 후속(FP율 확인 후). forbidden-paths 전용 CI step 도 후속(현재 alias 만).
- 대부분 warning-first: 기본 exit code 불변, `--enforce` 로 하드 전환.

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

### Docs consolidation (문서 정리 — 교차리뷰 후)
- **템플릿 재오픈 규칙 정렬**: `llm-rules.template.md`·`screen-spec.template.md` 가 canonical Open Decisions 규칙을 반영 — LLM 은 `open` 행 추가뿐 아니라 새 입력이 기존 `resolved` 결정과 충돌하면 `resolved → open` 재오픈 가능(재-resolve 는 사람-전용). 생성 프로젝트가 템플릿을 복사하므로 옛 문구는 미래 세션이 허용된 재오픈을 망설이게 만듦.
- golden example `llm-rules.md` 동기화 — 이전엔 Open Decisions 저작 규칙·게이트 무결성 불변식 자체가 누락되어 있었음(coupon-list 는 D-001~003 을 쓰는데 정작 그 규칙이 예제 LLM 룰에 없던 불일치).
- **README 문서 지도** 추가 — 문서별 역할·MVP 상태·구현 상태(코드 강제 vs 문서 계약만)를 표로 분리. "새 문서가 곧 강제됨"이라는 오해 차단.
- **`roadmap-current.md` 신설** — 구현됨 / 설계만 / 후속 / 다음 후보 / 지금 하지 말 것 을 한 파일로 고정.
- **Unknown 은 자동 게이트 아님 정합화**: input-reconciliation·investigation·open-decisions·roadmap 의 "Open Decision/Unknown 게이트" 표현을 코드(정책 fact + Open Decision `decision_cap`)에 맞춰 정정. 열린 Unknown 은 어떤 모드도 막지 않으므로 "Unknown 으로 막는다"는 silent fail-open 이었음. Unknown 을 fact-finding 큐 + 승격 사다리(사실→Unknown / 방향막힘→Open Decision / 장기검증→Investigation)로 명문화.
- **MVP-A 범위 3티어 재정리**: README·roadmap 을 Tier 1(구현·강제) / Tier 2(설계 계약, 코드 후속) / Future Candidate 로 분리하고 **게이트 인벤토리**(정확히 무엇을 막고 무엇을 안 막는가) 추가. Review Gates 를 독립 축에서 "Work Packet & Review Artifacts" Future Candidate 로 흡수.

### Review fixes (GPT-5.5 외부 리뷰 반영)
- **템플릿 frontmatter parser-safe 화**: 전 템플릿(screen-spec·navigation-map·domain-rules·llm-rules·component-gap-register·conflicts)의 frontmatter placeholder 를 따옴표 처리. `{SCREEN_ID}-screen-spec`·중첩 `{ ref: {...} }`·`{YYYY-MM-DD}` 가 invalid YAML 이라 GitHub preview·일부 parser 에서 깨지던 것을 해소(`yaml` 라이브러리로 6개 전부 파싱 통과 확인). placeholder 문법(`{X}`)은 유지 — 스크립트는 템플릿을 파싱하지 않아 안전.
- **readiness next_action 일관성**: `component_catalog_generated` 힌트가 미존재 명령 `npm run workflow:catalog`(MVP-C)를 안내하던 것을 `create ... component-catalog.md manually (catalog-gen is MVP-C)` 로 변경.
- **README "Readiness 정책" 절** 추가 — `implementation-mode-policy.yaml` 이 모드 사다리 단일 출처임을 명시 + 게이트 인벤토리 링크.
- roadmap Tier 1 강화 후보에 **API↔스키마 1:1 매칭 검사**·**Interaction Matrix Result 컬럼 구조화** 추가(둘 다 MVP-B+, 지금 구현 안 함).
- 반려(타당하지 않거나 의도된 결정): Entry Points generated marker 추가 제안 — 템플릿에 **이미 존재**(GitHub 가 HTML 주석을 렌더링 안 해 오판). component-gap-register 를 design/ 로 이동 — manifest·SKILL·llm-rules 가 **전부 global/ 로 일관**된 의도적 결정이라 유지.

### MVP-A 닫기 (CI 고정 + dry-run 반영)
- **GitHub Actions CI 추가** (`.github/workflows/frontend-workflow-kit.yml`): push/PR 에서 golden example 을 자동 검증한다. `example:state`/`readiness` 실행 후 **`git diff --exit-code` 멱등성 게이트**로 "생성기가 커밋된 `_meta` 산출물을 재현하는가"를 강제하고, 마지막에 `example:validate`(검사 8종). diff 게이트가 없으면 exit code 만으로는 "스크립트가 돈다"만 증명할 뿐 재현성은 증명하지 못한다(불변식 #7).
- **`.gitattributes` 추가** (`eol=lf`): `core.autocrlf=true` 환경에서 CI 멱등성 diff 가 OS 간 줄바꿈 차이(Windows CRLF ↔ Linux LF)로 헛실패하지 않도록 줄바꿈을 결정적으로 고정.
- **validate 검사 3 메시지에 해소 힌트 추가**: `depends_on 대상 부재`·`sources 링크 파일 부재` 에 "무엇이 틀렸나"뿐 아니라 "어떻게 고치나"(manifest 의 `template`→`path` 복사 안내)를 붙였다. readiness `next_actions` 와 동등한 actionability 확보.
- **README 설치 절차 보강** (dry-run 반영): step 1 에 런타임 필수 디렉토리 vs 개발 전용(`examples/`·`*.html`·설계 `*.md`) 구분, step 4 에 **최소 부트스트랩**(navigation-map + screen-spec stub)과 `depends_on: [navigation-map]` 의존성 명시 — 신선한 소비 프로젝트에서 "문서 하나 만들자마자 검사 3 실패"하던 막힘 해소.
- **implement-screen SKILL**: `workflow:readiness --json` 출력이 `{ "<screen_id>": {...} }` 형태임을 명시 — 스킬을 따르는 LLM 이 `readiness_mode` 를 최상위에서 찾다 못 찾는 혼동 차단.
- **실제 Expo 프로젝트 dry-run 1회 완료** (`npx create-expo-app@latest --template default`): 정책 경로(`src/app/**`·`src/components/ui/**`)가 최신 Expo 기본 템플릿(`src/` 기반)과 정합함을 확인. 최소 부트스트랩 절차로 state→validate 가 첫 시도에 통과, 멱등성도 실제 프로젝트에서 성립. README 에 경로 정합 노트 추가.
- **README: AsyncState 부트스트랩 안내**: fixture-ui 모드 진입 시 (1) 공유 `AsyncState` 타입 계약을 `examples/coupon-feature/src/lib/asyncState.ts` 에서 `src/lib/asyncState.ts` 로 복사, (2) `src/features/{domain}/hooks/useXxx.ts` 를 만들어 그 계약을 반환하도록 step 5 추가. `fake_hook_exists` 게이트는 (2)의 `hooks/` 파일 존재만 보며 (1)의 타입 계약 복사와는 별개다(혼동 방지). 계약이 예제에만 있어 소비자가 fixture-ui 로 넘어갈 때 빈손이던 갭 해소(state/readiness/validate 루프 자체는 영향 없음).

### Open Decisions validate 형식 검사 (검사 9 추가)
- **`validate.mjs` 검사 9 신설** — Open Decisions 표 형식 강제 (open-decisions.md "Validate 통합" 계약 구현). 항목: 섹션에 내용 있는데 표 아니면 실패 · 필수 6컬럼 존재 · **행별 필수 4필드(ID·Decision Needed·Blocking Mode·Status) 비어있지 않음** · `Status` ∈ {open,resolved} · `Blocking Mode` 가 정책 모드명(open 행은 docs-only floor 위; 정책 미로드 시 멤버십 검사 skip + 경고로 surface) · **전역 `D-xxx` ID 중복**(전 screen-spec 집계). 각 위반에 "→ 해소:" 행동 힌트 포함.
- **경고 채널 추가** — validate 출력에 `[경고 N]` 과 JSON `warnings[]` 신설. `resolved` 인데 Options 선택값 없음은 경고로 시작(exit code 무영향 — open-decisions.md 의 "약하게 시작").
- **파싱 단일 출처화** — Open Decisions 파서를 `lib/spec.mjs` 의 `parseOpenDecisions` 로 추출해 `deriveMetrics`(readiness 분류)와 `validate`(형식 검사)가 공유. 리팩터 후 state/readiness 출력 불변 확인(회귀 없음).
- **forbidden_paths 경계 backstop 은 보류(분리)** — 계약상 "경로 경계를 넘는 *변경*"을 보는 것이라 **diff 컨텍스트**가 필요하다. 트리 스캔으로 구현하면 공유 `src/api`(골든 예제에 실재) 같은 전역 forbidden 경로에서 즉시 false-positive 가 나 CI 를 깨뜨린다. CI 의 `git diff` 와 결합하는 **diff 기반 후속**으로 분리(roadmap Tier 1 강화 잔여).
- 카운트/상태 정합화: "검사 8종" → "검사 9종"(README·example README·roadmap 게이트 인벤토리), README 문서 지도·roadmap·open-decisions.md "Validate 통합" 구현 상태를 ✅ 로 갱신.

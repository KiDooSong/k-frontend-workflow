# frontend-workflow-kit

LLM이 프론트 프로젝트를 **환각 없이** 진행하게 만드는 워크플로우 킷.
"LLM이 추론하던 것을 파일로 고정한다" — 상태/판정/검사를 결정적 스크립트로 옮긴다.

## 이 킷이 보장하는 것 / 보장하지 않는 것

스크립트는 **가드레일이지 리뷰어가 아니다.** "검증 없는 루프는 그냥 자동화"다.

| 스크립트가 하는 것 (기계적·결정적) | 스크립트가 **안** 하는 것 (사람·리뷰 몫) |
|---|---|
| readiness = 화면별 구현 가능 **모드의 기계적 상한** 계산 | 이 설계가 **제품적으로 맞는지** 판단 |
| validate = frontmatter·manifest·route·승인메타 등 **구조 검사** | 빠진 상태/엣지케이스/UX/정책 의도 **의미 리뷰** |
| forbidden-paths·test-fixtures = **경로·회귀** 검증 | 기획 의도 반영·납득되는 설계인지 **사람 판단** |
| 통과/실패를 **반복 가능하게** 보고 | candidate→confirmed·Open Decision·Unknown **닫기** |

> **통과 = 완료가 아니다.** 아래는 이 킷에서 *금지된 착각*이다:
> - `readiness 통과` ≠ 설계 리뷰 완료
> - `validate 통과` ≠ 제품적으로 올바름
> - `Unknown open` ≠ 구현해도 항상 안전
> - `draft` ≠ 리뷰 완료
> - `Work Packet` ≠ 구현 허가서
> - `Run Report` ≠ 사람 승인
>
> 스크립트가 초록불을 줘도, **의미·제품 리뷰(사람 또는 Codex)와 confirmed 승인(사람)은 따로** 거쳐야 한다.

> 현재 단계: **MVP-A** 강제 코어 + **MVP-B Phase 0**(golden fixture 회귀 하니스 · forbidden_paths backstop[warning-first] · 입력/register 검증 검사 11·12) + **MVP-C Phase 1 생성 뷰**(route-tree·nav-graph·component-catalog, 읽기 전용). 추가 랜딩: 검사 8 API-스키마 매칭(엔드포인트 단위·하드) · Interaction Matrix v2 dual-read(warning-first) · Tier2 route-tree 어댑터 솔기 · **Tier2 codegen 어댑터 첫 slice**(`codegen-core` + `openapi-client` 후보 manifest golden, 실제 TS client/hook 생성·hard gate 없음) · Follow-up Quarantine/Role Expansion 설계 초안(#50, docs-only, 게이트 0) · **lint-pack PR-2 lint-gen**(deterministic `eslint.workflow.config.mjs` 생성기 + `--check`) · **lint-pack PR-3 adapt-lint-pack**(brownfield scan/propose 스킬, drafts/reports only, 승인 전 생성기 실행 없음) · **lint-pack PR-4 lint-baseline**(warning-first ratchet runner, `--enforce` opt-in) · **lint-pack PR-5 smoke CI**(`lint-gen --check` + `lint-baseline --json` warning-only 배선). evidence 기반 gate promotion decision·hard gate·Figma·실제 codegen TS 산출물·typed 훅 생성은 이후 잔여 — 상세·티어링: [roadmap-current.md](roadmap-current.md). ([docs/workflows/mvp-b.md](docs/workflows/mvp-b.md))
> 설계 문서: [Core](../frontend-llm-workflow.md) · [확장판](../frontend-llm-workflow-expanded.md) ·
> [스킬팩 개념](../frontend-workflow-skillpack-concept.md) · [구현 명세](../frontend-workflow-kit-implementation.md)
> 입력 중 결정 대기 항목 분리: [Open Decisions](open-decisions.md)
> 새 입력 반영/충돌 검토: [Input Reconciliation](input-reconciliation.md)
> 장기 조사/플랫폼 검증: [Investigation And Verification](investigation-and-verification.md)

## MVP-A에 들어있는 것

```txt
templates/   screen-spec(통합형+stub), navigation-map(뼈대), llm-rules, domain-rules,
             component-gap-register, conflicts (막힘 기록용 전역 레지스터),
             figma-component-mapping (화면별 figma 시각 매핑; reconcile-input 산출물),
             api-manifest (## Endpoints — 검사 8 API Candidates↔스키마 매칭 입력)
scripts/     workflow-state.mjs · readiness.mjs · validate.mjs   (MVP-A 코어 3개)
skills/      implement-screen
schemas/     frontmatter.schema.json
catalog/     artifact-manifest.yaml (등록분만)
policies/    implementation-mode-policy.yaml
examples/    coupon-feature (golden example, end-to-end 1회 완주)
```

> MVP-B Phase 0 추가분(warning-first/회귀): `scripts/forbidden-paths.mjs`(경로 backstop) · `scripts/test-fixtures.mjs`(golden fixture 회귀). 상세는 [docs/workflows/mvp-b.md](docs/workflows/mvp-b.md).

> MVP-B lint-pack 추가분: `scripts/lint-gen.mjs`(PR-2 deterministic flat-config fragment emission) · `skills/adapt-lint-pack`(PR-3 brownfield proposal workflow) · `scripts/lint-baseline.mjs`(PR-4 warning-first ratchet comparison; `--enforce` 때만 증가 exit 1). PR-5 는 CI 에 warning-only smoke step 만 추가한다(`continue-on-error: true`); observed telemetry/brownfield dogfood 기반 gate promotion decision 과 hard gate 승격은 후속이다.

## 문서 지도

각 문서가 **무엇을 정의하고, 그게 코드로 강제되는지**를 구분한다. "문서 계약만"인 항목은 아직 스크립트가 강제하지 않는다 — 설계 합의일 뿐 live 게이트가 아니다.

| 문서 | 역할 | 티어 | 구현 상태 |
|---|---|---|---|
| [open-decisions.md](open-decisions.md) | 결정 대기 분리 + readiness cap | **Tier 1 (MVP-A 코어)** | ✅ 템플릿·파서·readiness 다운그레이드·validate 형식검사(검사 9) / forbidden_paths backstop ✅ 구현(warning-first, diff/CI) |
| [input-reconciliation.md](input-reconciliation.md) | 새 입력 반영·충돌·`resolved→open` 재오픈 계약 | **Tier 2 (설계 계약)** | 📄 계약 동결 + reconcile-input 스킬 작성(리포-로컬 `.claude/skills/`, 절차 가이드일 뿐 코드 강제 0) — 킷 `skills/` vendor·hook·CI 후속 |
| [investigation-and-verification.md](investigation-and-verification.md) | 장기 조사·플랫폼 검증·evidence 핸드오프 | **Tier 2 (설계 계약)** | 📄 문서 계약만 — 템플릿·manifest·readiness 파싱 후속 |
| [docs/workflows/mvp-b.md](docs/workflows/mvp-b.md) | MVP-B Phase 0 통합 노트(lanes A/B/C) | **MVP-B Phase 0** | 🆕 회귀 하니스(하드)·경로 backstop/register 미처리(warning-first) |
| [docs/workflows/lint-policy-catalog.md](docs/workflows/lint-policy-catalog.md) / [lint-policy-rollout-ratchet.md](docs/workflows/lint-policy-rollout-ratchet.md) | MVP-B lint-pack policy catalog · rollout/adoption 계약 | **MVP-B PR-1~5** | 📄 PR-1 schema/template/docs + 🆕 PR-2 `lint-gen.mjs` deterministic `eslint.workflow.config.mjs` emission(`--check`) + 🆕 PR-3 `skills/adapt-lint-pack` scan/propose workflow + 🆕 PR-4 `lint-baseline.mjs` warning-first ratchet runner + 🆕 PR-5 warning-first CI smoke 배선 — evidence 기반 promotion decision·hard gate·required check 는 후속 Open Decision 전까지 미승격 |
| [docs/design/README.md](docs/design/README.md) | 장기 설계 초안 인덱스(customizable architecture · follow-up quarantine) | **Design Drafts / Future Candidate** | 📄 PR #50 로 follow-up quarantine/role expansion 초안 랜딩 — 실행 게이트 0 |
| `temp/work-packet-review-artifacts-proposal.md` (킷 외부) | Work Packet & Review Artifacts (리뷰 관문 흡수) | **Future Candidate** | 📝 설계 제안 초안(리포에 추적됨) — 단 `templates/work-packet/*.template.md` 는 킷에 포함(코드 강제 0, 여전히 Future Candidate) |

**Tier 1 — MVP-A 구현·강제됨:** 템플릿 · `scripts/`(workflow-state·readiness·validate) · schemas·catalog·policies · skills/implement-screen · Open Decisions readiness cap · golden example.

**Tier 2 — 설계 계약 (코드 강제 0):** Input Reconciliation(reconcile-input 스킬 작성됨 — 절차 가이드일 뿐 코드 게이트 아님) · Investigation/Verification. MVP-A 코드 게이트에는 들어가지 않는다.

**MVP-A 가 게이트하는 것 = 정책 fact + Open Decision `decision_cap` 뿐.** Unknown·Conflict·investigation `blocks_mode`·review 는 자동 차단하지 않는다 (상세: roadmap 의 [게이트 인벤토리](roadmap-current.md#mvp-a-게이트-인벤토리-정확히-무엇을-막는가)).

전체 3티어 티어링과 다음 후보는 [roadmap-current.md](roadmap-current.md).

## 설치 (소비 프로젝트)

1. 이 디렉토리를 프로젝트의 `tools/frontend-workflow/` 로 복사한다.
   런타임에 필요한 것은 `scripts/` `catalog/` `policies/` `schemas/` `templates/` `skills/` `package*.json` 과
   `docs/workflows/lint-policy-*.md` 뿐이다 —
   `examples/` · `*.html` · 기타 설계 `*.md`(open-decisions/roadmap 등)는 개발용이라 복사하지 않아도 된다.
2. `tools/frontend-workflow/` 에서 `npm install` (의존성은 `yaml` 하나).
3. `package-scripts.template.json` 의 `scripts` 를 프로젝트 `package.json` 에 병합한다.
4. 문서는 `docs/frontend-workflow/` 에 템플릿을 복사해 만든다.
   **최소 부트스트랩**: `app/navigation-map.md`(템플릿) + 화면 하나의 `domains/{domain}/screens/{screen}/screen-spec.md`(stub=frontmatter만).
   screen-spec 의 `depends_on: [navigation-map]` 때문에 navigation-map 이 없으면 `workflow:validate` 검사 3 이 실패한다.
5. (fixture-ui 모드로 진행할 때만) 아래 **둘은 별개**다:
   - **AsyncState 타입 계약** — `examples/coupon-feature/src/lib/asyncState.ts` 를 `src/lib/asyncState.ts` 로 복사 (화면·hook 이 의존하는 shape).
   - **fake hook 파일** — `src/features/{domain}/hooks/useXxx.ts` 를 만들어 `AsyncState` 를 반환. `rough-fixture-ui` 의 `fake_hook_exists` 게이트는 **이 `hooks/` 디렉토리의 `.ts(x)` 파일 존재**만 본다 — `asyncState.ts` 복사만으로는 충족되지 않는다.

   (state/readiness/validate 루프만 쓰는 단계에서는 둘 다 불필요.)

> 경로 가정: 정책의 `src/app/**`·`src/features/{domain}/**`·`src/components/ui/**` 는 최신 Expo 기본 템플릿(`src/` 기반)과 정합한다 (실제 `create-expo-app` dry-run 으로 확인). 더 나아가 신선한 Expo 소비 프로젝트(킷 레포 **밖**)에 킷을 vendoring 해 `state→readiness→Work Packet→implement-screen→validate→forbidden-paths` 를 게이트 천장 안에서 **end-to-end 1회 완주**(consumer dogfood)도 확인 — 정상 진행(screen-skeleton)과 게이트 거절(docs-only) 둘 다 정답대로 동작 ([temp/runs/consumer-dogfood-001/run-report.md](../temp/runs/consumer-dogfood-001/run-report.md)).

스크립트는 설정 파일(manifest/policy/schema)을 **킷 위치 기준**으로 자동 해석하고,
문서는 `--docs docs/frontend-workflow` (기본값)에서 읽는다.

## 명령 (3차 방어선 중 2차)

```bash
npm run workflow:state       # frontmatter+본문 → _meta/workflow-state.yaml + screen-inventory.yaml
npm run workflow:readiness   # 화면별 readiness_mode / allowed·forbidden paths / blocking
npm run workflow:validate    # 검사 12종, exit 0/1 (CI 게이트)

# MVP-B Phase 0 추가 명령:
npm run workflow:forbidden-paths -- --diff <file> --docs <dir>   # 경로 backstop (warning-first; --enforce 로 하드)
npm run example:test                                             # golden fixture 회귀 하니스 (킷 내부; CI 는 warning-only)

# MVP-C Phase 1 생성 뷰 (읽기 전용 — 게이트 아님, screen-spec/src 를 수정하지 않음):
npm run workflow:route-tree   # src/app 트리 → _meta/route-tree.txt (결정적·멱등)
npm run workflow:nav-graph    # screen-spec Interaction Matrix + navigation-map → _meta/nav-graph.yaml

# MVP-B lint-pack PR-2 생성기 (deterministic eslint flat-config fragment; CI 에서는 warning-only --check):
npm run workflow:lint-gen                          # 킷 예제 fixture 재생성 (examples/lint-gen/basic-policy/)
node scripts/lint-gen.mjs --docs <dir> --check     # 소비 프로젝트: lint-policy.yaml → eslint.workflow.config.mjs drift 검사

# MVP-B lint-pack PR-4/5 ratchet runner (warning-first; CI 는 --json 관측, hard gate 는 --enforce opt-in):
npm run workflow:lint-baseline
node scripts/lint-baseline.mjs --docs <dir> --counts <file> --enforce
```

MVP-B lint-pack PR-3의 `skills/adapt-lint-pack`은 brownfield 프로젝트에서
scan -> map -> diff -> rollout -> propose 보고서와 `lint-policy.yaml` 초안만 만든다.
사람 승인 전에는 `lint-gen.mjs`를 실행하지 않는다.

각 스크립트는 `--json` (스킬 파싱용), `--docs`, `--src` 플래그를 지원한다.
`readiness.mjs` 는 `--screen <ID>`, `--ci <file>`, `--out <file>` 도 받는다.

## Readiness 정책

화면별 구현 가능 모드의 **단일 출처**는 [policies/implementation-mode-policy.yaml](policies/implementation-mode-policy.yaml) 다.
`readiness.mjs` 가 이 파일을 읽어 각 화면의 최고 허용 모드를 계산한다 (`readiness_mode = min(fact_mode, decision_cap)`). 모드 사다리:

```txt
docs-only → route-skeleton → screen-skeleton → rough-fixture-ui
→ final-fixture-ui → api-integrated-ui → production-ready
```

정확히 무엇이 게이트를 거는지(정책 fact + Open Decision)와 무엇이 안 거는지(Unknown·Conflict·investigation·review)는
[roadmap 게이트 인벤토리](roadmap-current.md#mvp-a-게이트-인벤토리-정확히-무엇을-막는가) 참조.

## 깨면 안 되는 불변식 (요약)

```txt
1. 판정 로직은 readiness.mjs 한 곳. 훅·스킬은 출력을 소비만.
2. 파생값(tbd_count 등)은 frontmatter 에 쓰지 않는다 — 스크립트가 본문에서 계산.
3. 생성물엔 GENERATED 헤더/마커. 마커 밖은 생성기가 안 건드린다.
4. 사실의 단일 출처: zod=코드, query key=factory, props=컴포넌트. 문서는 링크/의도만.
5. 화면은 AsyncState 계약만 의존. TanStack Query 객체 노출 금지.
6. confirmed 승격은 사람만. 승인 메타 없으면 validate 실패.
7. 생성기는 멱등. 같은 입력 → 같은 출력 (타임스탬프는 generated_at 한 줄만).
```

## golden example 돌려보기

```bash
npm run example:state       # examples/coupon-feature 에 _meta/*.yaml 생성
npm run example:readiness   # COUPON-001=rough-fixture-ui, COUPON-002(stub)=screen-skeleton
npm run example:validate    # 검사 12종 통과
```

자세한 흐름은 [examples/coupon-feature/README.md](examples/coupon-feature/README.md).

# Current Roadmap

> 스냅샷: 2026-07-12 (기준 커밋 `7eb06ec` = post-MVP 안정화 PR #170~#176 이 전부 랜딩된 main HEAD, release candidate **`0.3.0-mvp.2`** — 버전/문서 정합·release cut 커밋은 그 위에 얹힌다). 2026-07-11 스냅샷(release baseline `0.3.0-mvp.1`, tracker #167) 이후 랜딩 — 전부 post-MVP 안정화이며 **새 기능·새 artifact axis·warning-first→hard 승격 0**: **support contract + 0.3.0-mvp.1 릴리스 검증 증거**(#160/#161, #170 — engines `node >=20` · CI compat/macos smoke · Windows best-effort 명시) · **warning-first 승격 evidence 임계 정책 + surface inventory**(#162/IMP-01, #171 — 승격 후보 8 전부 `deferred`, 관측 계기 9 `rejected`, 상태 전이는 사람 승인 decision PR 전용) · **doc-drift release-consistency opt-in**(#163/IMP-02, #172 — `--include release-consistency`, 기본 출력 byte-identical) · **evidence retention/index 정책**(#165/IMP-04, #173 — `kit-dev/evidence-retention-policy.md` + temp/runs 인덱스, `status: current` release check 는 항상 정확히 1건) · **packed payload CLI smoke**(#166/IMP-05, #174 — distribution.test.mjs, 공개 CLI spawn 계약) · **CLI stdout flush-safe 자연 종료 통일 + validate 인자 계약**(#175) · **core workflow-state·readiness 인자 계약 fail-closed**(#176 — unknown/invalid 인자를 파일 쓰기·판정 전에 exit 2 로 거부, `scripts/lib/cli-args.mjs` additive helper; 감사: [core-cli-argument-contract-audit-001.md](temp/runs/core-cli-argument-contract-audit-001.md)). 세부 계약은 [CHANGELOG](CHANGELOG.md) `0.3.0-mvp.2` 참조.
> 이전 스냅샷(2026-07-11): 기준 커밋 `59a2b8d` = 2026-07-11 MVP 진단 보고서의 기준 main HEAD, release baseline **`0.3.0-mvp.1`** — MVP closure tracker #167. baseline 자체의 버전/문서 정합 커밋은 그 위에 얹힌다. 2026-07-03 스냅샷 이후 랜딩(PR #132~#156, 새 하드 게이트 승격 0) — **관측/증거 계층**: telemetry & promotion-evidence 하니스(`workflow:telemetry`, +opt-in visual/adoption/redteam surface) · eval & calibration(`workflow:eval`) · adversarial red-team suite(`workflow:redteam`, warning-first 관측 매트릭스) · canonical doc-drift detector(`workflow:doc-drift`, +opt-in status heuristic info-only) — next-ideas 01/02/04/05 가 전부 landed(03 MCP serving 만 열린 연구). **visual consistency 계층**: visual-consistency-contract artifact + `workflow:visual-consistency` + `workflow:visual-contract-bootstrap`(review-only draft) + adoption-probe `--visual` + telemetry visual surface(#144~#147). **consumer 실사용 수정**: doc-drift Phase 0 링크 오탐 축소(#150/#152) · GitLab CI telemetry artifact 매핑 문서화(#151/#155) · visual bootstrap silent no-op/consumer 실채택 관측 갭(#153/#156) · symlink 경유 CLI entry guard realpath(#154). **reconcile-input 킷 vendoring 완료**(`frontend-workflow-kit/skills/reconcile-input/SKILL.md` + manifest `skills/**` payload 포함). 이 스냅샷으로 기능 범위를 동결하고 버전·문서·검증 증거를 release baseline 으로 닫는다 — 새 기능과 warning-first→hard 승격은 tracker #167 범위 밖. 세부 계약은 [CHANGELOG](CHANGELOG.md) `0.3.0-mvp.1` 참조.
> 이전 스냅샷(2026-07-03): 2026-06-19 스냅샷 이후 대량 랜딩(PR #85~#131, 대부분 warning-first/docs/생성물 계층 — 새 하드 게이트 승격은 개별 사람 결정으로 유지) — **Tier3 custom-layer substrate + readiness access wiring**(#85/#87/#88) · **adoption-probe**(draft-only 온보딩 진단, #86/#91) · **Tier3 policy-draft 생성기**(#89, draft/review artifact) · **adoption-compatible contracts/screen entries**(#94) · **generic input artifact producer**(#96) · **interaction matrix route extraction 하드닝**(#96/#97) · **disabled ScreenSpec state**(#104, State Matrix 6-state — breaking) · **screen identity / source map**(#105, canonical↔source alias + `create-screen`) · **workflow spine stage guides**(#106, consumer-agent 라우팅 00–10) · **grouped input artifact directories**(#107, domain/topic-aware inputs) · **safe vendored-kit upgrade planner**(#108, manifest 기반 안전 업그레이드 + symlink/traversal 하드닝) · **progressive-disclosure 문서 리팩터**(#109) · **session-learnings capture surface**(#110) · **e2e-agent 스킬**(plan/generate/verify/heal + playwright agents + path/session model + consumer adoption guide + behavioral rules + visual capture, #112~#128/#130, 선택형 evidence — ScreenSpec/readiness 게이트 아님) · **no-api-required 화면 지원**(#123/#126, no-api readiness + API backstop 게이트) · **check 4 route group 오탐 축소 + nav-graph route group resolution**(#129/#131). 세부 계약은 [CHANGELOG](CHANGELOG.md) 참조.
> 이전 스냅샷(2026-06-19): MVP-B Phase 0 완료분 위에 **2026-06-15~19 추가 랜딩** — **검사 8 API-스키마 매칭 엔드포인트 단위 격상**(구현·하드, PR #19) · **Interaction Matrix v2 dual-read + 검사 13**(warning-first, #48) 및 route-tree EXACT 정밀화(여전히 warning-first) · **Tier2 route-tree 어댑터 솔기**(#49) · **Tier2 codegen 어댑터 첫 slice + real emitter slice + generated-file guard advisory 정합 slice + output strategy 정리**(`codegen-core` + `openapi-client` + 후보 manifest golden + 실제 client/hook TS golden + focused `check-generated-files` target + codegen `outputs[]`, hard gate 없음) · **component-catalog phase2-1 배럴 reconcile 진단**(warning-first, stderr-only) 및 **phase2 첫 additive `Default Export Candidates` 섹션**(append-only, candidate-only) · **Follow-up Quarantine / Role Expansion 설계 초안**(#50, docs-only, 실행 게이트 0) + **Option A 템플릿/생성기 가드**(Discovered Work/Out of Scope, 게이트 0) · **MVP-B lint-gen PR-2 skeleton**(deterministic `eslint.workflow.config.mjs` flat-config fragment emission) · **MVP-B adapt-lint-pack PR-3 / MR #55**(brownfield scan/propose skill, drafts/reports only) · **MVP-B lint-baseline PR-4**(warning-first ratchet runner/fixtures, `--enforce` opt-in) · **MVP-B lint-pack PR-5 smoke**(warning-first CI smoke: `lint-gen --check` + `lint-baseline --json`, `continue-on-error`). 잔여는 아래 "다음 구현 후보" 로 이어진다.
> 이전 스냅샷(2026-06-14): MVP-B Phase 0 **완료** — 회귀 하니스·경로 backstop[warning-first]·입력/register 검증; consumer-dogfood-001 외부 소비 dry-run 으로 end-to-end 검증, PR #17.
> 목적: **MVP-A 구현 범위 / 설계 계약(코드 후속) / Future Candidate** 세 티어의 경계를 한 파일로 고정한다.
> 문서별 역할·링크는 [문서 소유권 지도](../frontend-workflow-kit/docs/reference/doc-ownership.md) 참조.

## 핵심 루프

```txt
Input Skill → Reconciliation → Documents → State → Readiness → Work → Validate
```

MVP-A 에서 코드로 강제되는 구간은 **Documents → State → Readiness → Validate** 다.
앞단(Input Skill·Reconciliation)은 아직 문서 계약이며, 실제 게이트는 readiness 다운그레이드가 담당한다.

## MVP-B Phase 0 — 구현 / 경고-전용 / 제안 (2026-06-14, 완료 — consumer-dogfood-001 외부 검증 PR #17)

- **구현·강제(하드)**: validate 검사 11·12 구조 검사(입력 결과물 frontmatter + Reconciliation Register) · `test-fixtures.mjs` golden fixture 회귀 하니스(CI 배선됨 — warning-only/`continue-on-error`; 하드 gating 후속).
- **경고-전용(warning-first, `--enforce` 로 하드)**: `forbidden-paths.mjs` 경로 backstop(Lane B) · Reconciliation Register 미처리 감지(검사 12 일부, Lane C).
- **여전히 제안(승격 금지)**: lint gate promotion decision(PR-5 smoke 이후 후속: observed telemetry/brownfield dogfood 기반 required check/`--enforce` 판단) · check-generated alias/CI promotion(MVP-C 잔여) · Work Packet & Review Artifacts(템플릿만 존재, 강제 0). (reconcile-input 킷 vendor 와 API-스키마 매칭·Interaction Matrix `Result` 구조화는 이후 완료 — 2026-07-11 스냅샷/Tier 3 절 참조.) `lint-gen.mjs` 는 PR-2 skeleton 으로 runnable 하고 `lint-baseline.mjs` 는 PR-4 warning-first runner 로 runnable 하며, PR-5 smoke 로 둘 다 CI warning-only 에 올라갔다. root generated guard/CI hard gate 는 아직 승격하지 않는다.

## MVP-C Phase 1 — 생성 뷰 3종 (2026-06-14~16, 구현·읽기 전용)

- **구현(읽기 전용, 게이트 아님)**: `route-tree.mjs`(src/app 트리 → `_meta/route-tree.txt`) · `nav-graph.mjs`(screen-spec `## Interaction Matrix` + navigation-map → `_meta/nav-graph.yaml`) · `catalog-gen.mjs`(src/components/ui 트리 → `design/component-catalog.md`). 결정적·멱등, 커밋된 골든 픽스처 byte-identical 재현. 입력 문서/소스는 **읽기만** 하고 생성 산출물만 쓴다.
- **패키징**: alias `workflow:route-tree`·`workflow:nav-graph`·`workflow:catalog` 승격(`package.json` + `package-scripts.template.json`). 매니페스트 `status: planned → active`.
- **CI 미배선(의도)**: warning-first 배선의 선행 = `test-fixtures.mjs` 에 생성 뷰 픽스처 등록(그 후 기존 `example:test` warning-only step 이 자동 커버). 하드 게이트 승격 없음.
- 통합 점검 기록: [temp/runs/mvp-c-generated-views-integration.md](temp/runs/mvp-c-generated-views-integration.md).

## 산출물 축 (artifact axes)

```txt
저작 문서        screen-spec / navigation-map / llm-rules / domain-rules
생성 상태        _meta/workflow-state.yaml · screen-inventory.yaml
결정             Open Decisions (readiness cap)
입력 정합        Input Reconciliation (register · conflict · re-open)
조사/검증        Investigation / Verification (evidence handoff)
```

이 목록은 **닫혔다**. 지금 단계의 목표는 새 축을 더 만드는 게 아니라 위 축들의 경계를 선명히 하는 것이다.
리뷰는 **별도 축이 아니라** 아래 Future Candidate "Work Packet & Review Artifacts" 안에서 다룬다.

## MVP-A 게이트 인벤토리 (정확히 무엇을 막는가)

MVP-A 의 readiness/validate 가 게이트하는 것은 **딱 이것뿐**이다 — 여기 없는 건 자동 차단하지 않는다.

```txt
readiness_mode = min(fact_mode, decision_cap)

fact_mode      정책 fact 로만 도달 가능한 최고 모드.
               (implementation-mode-policy.yaml 의 requires 에 실제 쓰이는 fact:
                stub_screen_specs_count · navigation_map_status · screen_spec_status · screen_spec_authored ·
                component_catalog_generated · fake_hook_exists · figma_mapping_status · api_confidence_min ·
                state_matrix_complete · CI: ci_lint · ci_schema_validation · state_coverage_complete · llm_semantic_review)
               (interaction_matrix_complete 는 fact 로 정의돼 있으나 어떤 requires 에도 안 쓰여 게이트가 아니다)
decision_cap   열린 Open Decision 의 최저 Blocking Mode 바로 아래.
               (malformed Open Decision 은 fail-closed → docs-only 로 고정)
validate       검사 12종, CI exit 0/1
```

게이트하지 **않는** 것 (= MVP-A 자동 차단 없음):

```txt
Unknowns        fact-finding 큐. tbd_count 는 next-action 메시지에만 쓰이고 모드는 안 막는다.
Conflicts       passive log. 막으려면 Open Decision 으로 승격해야 한다.
Investigation   blocks_mode 를 readiness 가 직접 파싱하지 않는다. 막으려면 연결된 Open Decision 필요.
Review          MVP-A 에 없음 (Future Candidate).
```

## Tier 1 — MVP-A: 구현·강제됨 (코드)

- 템플릿: screen-spec(통합형+stub) · navigation-map(뼈대) · llm-rules · domain-rules · component-gap-register · conflicts
- `scripts/`: `workflow-state.mjs` · `readiness.mjs` · `validate.mjs` (+ 공유 lib: util/spec/schema)
- `schemas/frontmatter.schema.json` · `catalog/artifact-manifest.yaml` · `policies/implementation-mode-policy.yaml`
- `skills/implement-screen`
- Open Decisions readiness cap — 저작 규칙 + **게이트 해제는 사람-전용** 불변식 (LLM 은 open 추가/재오픈만)
- Open Decisions **validate 형식 검사**(검사 9) — 표 컬럼·`Status` enum·`Blocking Mode` 정책 모드·전역 ID 중복 (resolved→Options 는 경고)
- Open Decisions **canonical cross-screen reference**(#193) — optional `global/open-decisions.md` register + ScreenSpec `decision_refs`; state/readiness fan-out과 source provenance, malformed/unresolved fail-closed. 기존 결정 축의 additive 확장(새 CI/promotion 없음)
- golden example: `coupon-feature` (end-to-end 1회 완주)

## Tier 2 — 설계 계약 작성됨 / 코드 강제 후속

문서로 계약은 동결됐지만 **스크립트 강제는 0** 이다. MVP-A 의 코드 게이트(위 인벤토리)에 들어가지 않는다.

- **Input Reconciliation** ([input-reconciliation.md](../frontend-workflow-kit/docs/reference/input-reconciliation.md)) — register · Reconcile Status 라이프사이클 · conflict 수동 로그 · `resolved→open` 재오픈 계약. 실제 게이트는 Open Decision(readiness)이 담당.
- **Investigation / Verification** ([investigation-and-verification.md](investigation-and-verification.md)) — 조사/검증 문서는 evidence 핸드오프 아티팩트. 막는 조사는 연결된 Open Decision 을 만들어야 하고, 그 Open Decision 이 blocker.

## Tier 3 — 후속 / Later (구현 안 함)

**Tier 1 강화:**
- ✅ Open Decisions validate **형식 검사** 구현됨(검사 9: 표·`Status`·`Blocking Mode`·전역 ID 중복). ✅ `forbidden_paths` 경계 backstop 구현(MVP-B Phase 0, diff 기반, warning-first — `scripts/forbidden-paths.mjs`; `--enforce` 로 하드).
- ✅ **API Candidate ↔ contract evidence 매칭 검사 구현됨**(검사 8, 하드·exit 1): confirmed ScreenSpec 후보의 (Method, Path) → api-manifest Endpoints → Linked Contract + Contract Kind 해소까지. zod 는 기존 Linked Schema 5컬럼 레거시 표와 src/api/schemas/*.ts 런타임 export 매칭을 유지하고, ts-type 은 Source 경로의 export type/export interface 정적 evidence 를 인정한다. openapi|manual|unknown kind 는 evidence 종류 기록용 호환 경로이며, TS type evidence 를 런타임 validation 으로 주장하거나 Zod/runtime validator 를 생성하지 않는다. manifest 부재 시 옛 전역 존재검사(hasZod || hasOpenApi)로 폴백한다. 증거: [api-schema-match-001.md](../temp/runs/api-schema-match-001.md).
- 🔶 Interaction Matrix **`Result` 컬럼 구조화 — v2 dual-read + 정밀화 구현됨**(#48 + follow-up): 선택적 `Result Type`/`Target`/`Params` 컬럼 파서 + **검사 13(warning-only)** + v2 골든 픽스처. v1 free-form Result 는 정본 유지, v2 출력 byte-identical. `Result Type` enum 은 `route|state|mutation|external|none` 으로 코드 단일 출처에 동결했고, `Result Type=route` Target 은 route-tree.txt 의 `route: <token>` 과 **EXACT** 로 경고 교차검증한다(route-tree artifact 부재 시 skip). **잔여:** 하드 게이트 승격 없음; telemetry 후 별도 decision PR 에서만 검토. 증거: [interaction-matrix-v2-dual-read-001.md](temp/runs/interaction-matrix-v2-dual-read-001.md).
- decision-log.md 전역 이관 · deferred+Reversible+Assumptions 묶음 (open-decisions.md 후속 절). ✅ canonical 교차-화면 참조는 #193으로 구현; shared-surface 적용은 #192 후속

**Tier 2 구현:**
- ✅ **reconcile-input 스킬** 작성·**킷 vendoring 완료** — `frontend-workflow-kit/skills/reconcile-input/SKILL.md` 존재 + `distribution-manifest.yaml` 이 `skills/**` 를 payload 에 포함(절차 가이드·코드 강제 0). 리포-로컬 `.claude/skills/reconcile-input/` 은 kit 개발 세션용 사본.
- ✅ Reconciliation Register **검증 구현**(validate 검사 12 — 구조=하드, 미처리 감지=warning-first; +검사 11 입력 결과물 frontmatter). 남은 것: pre-edit/commit hook 으로의 확장.
- Investigation / Verification **템플릿 + manifest 등록** · `blocks_mode` **readiness 파싱**

**Future Candidate (새 축 아님 — 흡수형):**
- **Work Packet & Review Artifacts** — 작업 단위 인덱스/핸드오프 보드(Work Packet) + 리뷰 상세(Review Artifacts). **Review Gates 는 독립 축이 아니라 여기 안에서** 다룬다(처음엔 Work Packet 의 required 행으로 시작). Open Decision 이 여전히 readiness 게이트이고 Work Packet 은 인덱스일 뿐이다. *템플릿 초안이 킷 `templates/work-packet/`(work-packet·run-report·review-artifact)에 추가됨 — 설계/문서일 뿐 코드 강제 0, 여전히 Future Candidate. 원 설계 제안: `temp/work-packet-review-artifacts-proposal.md`.*
- **Follow-up Quarantine / Role Expansion** — PR #50 으로 [설계 초안](docs/design/drafts/follow-up-quarantine-and-role-expansion.md)이 `docs/design/drafts/` 에 랜딩됨. Option A 로 run-report template/`workflow:report` 의 `## Discovered Work` 와 work-packet template/`workflow:packet` 의 `Out of Scope` 기록 규칙이 반영돼, 작업 중 발견한 범위 밖 후속과 role 확장을 현재 세션이 흡수하지 못하게 record-only 로 격리한다. **실행 게이트·전역 레지스터·role metadata 는 여전히 0**. Option B(collector)나 Option C(Follow-up Register)는 필요성이 반복될 때 별도 decision PR 로만 검토한다.

## 다음 구현 후보 (순차 진행 — 하나를 끝낸 뒤 다음 착수)

> **최근 랜딩(완료분, 2026-06-15~19):** ① 검사 8 API-스키마 매칭 엔드포인트 단위 격상(구현·하드, PR #19) · ② Interaction Matrix v2 dual-read + 검사 13(warning-first, #48) 및 route-tree EXACT 정밀화(warning-first) · ③ Tier2 route-tree 어댑터 솔기(#49) · ④ Tier2 codegen 어댑터 첫 slice + real emitter slice + generated-file guard advisory 정합 slice + output strategy 정리(`codegen-core` + `openapi-client` + 후보 manifest golden + 실제 client/hook TS golden + focused `check-generated-files` target + codegen `outputs[]`, hard gate 없음) · ⑤ component-catalog generated artifact + `check-generated` 가드(#40/#42), phase2-1 배럴 reconcile **진단** 슬라이스(warning-first, stderr-only), phase2 첫 additive `Default Export Candidates` 섹션 · ⑥ Follow-up Quarantine / Role Expansion 설계 초안(#50, docs-only, 게이트 0) + Option A 템플릿/생성기 가드(게이트 0) · ⑦ MVP-B lint-pack PR-2/PR-3(MR #55)/PR-4/PR-5 smoke 배선 완료분. 완료 항목은 활성 후보에서 제외하고, 각 항목의 **잔여**만 아래 후보다.

> **승격 정책:** warning-first → hard gate/required check 승격의 evidence 임계·decision 상태(`deferred`/`eligible`/`rejected`/`promoted`)는 [warning-first-promotion-policy.md](warning-first-promotion-policy.md) 가 canonical 이다(#162). 개별 후보의 승격 논의는 그 임계·절차를 따르고, 상태 전이는 사람 승인 decision PR 전용.

> **evidence 보존·분류:** run/release evidence 의 분류(`active`/`historical`/`generated-local`)·canonical 위치·archive-first 보존 규칙은 [evidence-retention-policy.md](evidence-retention-policy.md) 가 canonical 이다(#165). 이 roadmap 의 evidence 링크가 `kit-dev/temp/runs/` 의 1차 인덱스이고, repo-level release/dogfood 인덱스는 [temp/runs/README.md](../temp/runs/README.md) 다.

> **순차 원칙:** 병렬 구현·병렬 정본 변경을 열지 않는다. 각 항목은 PR/run report/roadmap 정리까지 끝낸 뒤 다음 항목에 착수한다. 설계 보강이 필요해도 다음 항목의 구현을 앞당기지 않는다.

> **완료 처리(2026-06-16):** component-catalog phase2 첫 additive `## Default Export Candidates` 섹션은 완료. props/docgen, wrapper/default alias 확장, lifecycle status 등은 별도 future PR/OD 로 유지하며 readiness/validate/hard gate 승격 없음.

1. **lint-pack / adapt-lint-pack — PR-1 docs-only 완료, PR-2 lint-gen skeleton 완료, PR-3 adapt-lint-pack 완료, PR-4 lint-baseline 완료, PR-5 warning-first CI smoke 배선 완료** — 기존 로드맵의 `lint-gen/lint-baseline(MVP-B)` 생성물 lint 게이트와 **동일 개념**의 라벨(별도 신규 스킬/파일 아님 — `lint-gen.mjs`+`lint-baseline.mjs` 생성기 + 브라운필드 도입용 `adapt-lint-pack` 스킬, frontend-workflow-kit-implementation.md §11). 설계 refresh: [lint-pack-design-refresh.md](temp/proposals/lint-pack-design-refresh.md). PR-1 은 `docs/frontend-workflow/_meta/lint-policy.yaml` canonical path, [policy catalog](docs/workflows/lint-policy-catalog.md), [rollout/ratchet adoption](docs/workflows/lint-policy-rollout-ratchet.md), schema/template/manifest source 정렬을 완료했다. PR-2 는 `lint-gen.mjs` skeleton 과 deterministic `eslint.workflow.config.mjs` flat-config fragment emission, `--check`, package-script smoke, focused fixtures 를 추가했고, Codex 리뷰를 반영했다(`no-fetch-in-screens` 가 type-only axios import 를 무시 · `defaults.paths`/include·exclude 글롭의 `..` 부모-디렉토리 탈출 거부). PR-3 는 `skills/adapt-lint-pack` 을 추가해 brownfield 도입을 자동 마이그레이션이 아닌 scan → map → diff → rollout → propose 제안 workflow 로 고정하고, lint adaptation report · `lint-policy.yaml` draft · conflict report · measured counts · rollout plan 출력 계약을 문서화했다. PR-4 는 `lint-baseline.mjs` 와 ratchet fixtures 를 추가해 `current <= baseline` pass, `current > baseline` increase, `current < baseline` improvement 를 보고하고 기본은 warning-first(exit 0), `--enforce` 때만 증가를 exit 1 로 만든다. PR-5 는 `lint-gen --check` 와 `lint-baseline --json` 을 CI 에 `continue-on-error` 로 올려 smoke 신호만 시작했다. 단, `eslint-workflow-config` manifest status 는 repo-root generated guard 가 준비될 때까지 `planned` 유지이며, CI hard gate 는 아직 없다. **잔여:** observed telemetry/brownfield dogfood 이후 hard gate/required check/`--enforce` 승격 여부를 별도 Open Decision 으로 검토.
   - 2026-06-18 evidence 수집: [lint-gate-promotion-evidence-001.md](temp/runs/lint-gate-promotion-evidence-001.md)에서 PR-5 smoke/fixture 결과와 promotion 판단에 필요한 telemetry를 기록했다. decision pending; hard gate/required check/`--enforce` CI 승격 없음.
2. **Tier2 codegen/route 어댑터 — 첫 slice + 실제 client/hook emitter slice + guard advisory 정합 slice + output strategy + custom-adapter dogfood + route cross-check 완료, 승격 결정 resolved(OD-11: no CI/도입 후 연기) — 사실상 마감** — route-tree 어댑터 솔기(#49)에 이어 `scripts/lib/codegen-core.mjs`(결정성/정렬/렌더/출력 naming) + `scripts/adapters/codegens/openapi-client.mjs` + codegen 매니페스트 + `examples/codegen-adapter/openapi-client` golden fixture 를 추가했고, 후속 real emitter slice 로 deterministic `*.client.ts` 및 `{domain}/hooks/*.ts` 렌더/golden 비교를 고정했다. advisory 정합 slice 는 `check-generated-files` 의 focused target `codegen-openapi-client` 로 실제 fixture client/hook 6개 출력을 `codegen-core` `renderCodegenFiles`/`checkCodegenFiles` 로 재현·확인한다. 이번 output strategy 정리는 OD-5/OD-6/OD-7 을 사람 결정대로 닫아 새 `api_generated` role 없이 기존 `roles.api_client`/`roles.hook` 을 쓰고, endpoint/file 별 artifact 폭증 없이 하나의 `codegen-openapi-client` artifact 가 `outputs[]` 로 다중 산출물을 표현하며, hook 출력은 domain-scoped `src/features/{domain}/hooks/**` 로 유지한다. stale detection 은 generated-owned 파일( manifest-listed outputs + GENERATED marker/header )만 대상으로 삼아 hand-written hook 오탐을 막고, validate 검사 6 은 TS ASCII GENERATED header 와 기존 em-dash header 를 모두 인정한다. `validate/readiness/nav-graph` 의 codegen adapter 직접 소비·CI/hard gate/required check/`--enforce` 승격은 하지 않는다. 이번 custom-adapter dogfood 슬라이스는 `examples/codegen-adapter/minimal-custom`(my-codegen.mjs + 코어 생성 manifest/client/hook 골든 + README)을 추가해 `loadCodegenAdapter` 가 비-내장 `{module}`/경로 어댑터를 해소하고 codegen-core 가 그 발견을 결정적으로 렌더함을 `codegen-core.test.mjs` C21–C25(route-core S3/S5/S7/S4 미러)로 고정한다 — 내장 매니페스트 등록·focused guard target·artifact 엔트리 없이 단위 입력으로만(라우터 dogfood 동형). 이번 route cross-check 슬라이스는 OD-4/OD-8 을 사람 결정대로 닫고 **별도 warning-only 도구**(`scripts/route-cross-check.mjs` + `scripts/lib/route-cross-check.mjs` + test)를 추가해, ScreenSpec frontmatter `route` 집합 ↔ route-tree.txt `route: <token>` 집합(어댑터 rawPath 투영)을 EXACT 양방향 대조해 불일치를 경고로만 낸다(기본 stderr + `--json` stdout, **항상 exit 0**). validate/nav-graph/route-tree 에 결합하지 않고 어댑터도 직접 import 하지 않으며(산출물 2개만 읽음), route-tree.txt 부재/screen-spec 0건이면 조용히 skip 한다(검사 13 동형). OD-8 대로 nav-graph 생성기는 cross-check 를 소비하지 않으며, 첫 슬라이스는 route 차원만 — nav 차원(navigation-map drift)·codegen output↔docs 차원은 defer. **잔여:** 없음 — 승격 결정은 **OD-11 로 resolved(2026-06-21, decision_id: OD-11)**: no CI(warning-first 유지), 승격(warning-first CI smoke/hard/required/`--enforce`)은 실제 도입(adoption) telemetry 전까지 **연기**, CI 는 GitHub Actions 아닌 **GitLab(`.gitlab-ci.yml`) 기준 도입 작업**으로 재분류. item 2 사실상 **마감**(서브슬라이스 완료 + 승격 의도적 연기); 재오픈 트리거 = 실제 도입 후 warning-first telemetry 발생. 결정 기록: [tier2-gate-promotion-decision-prep-001.md](temp/runs/tier2-gate-promotion-decision-prep-001.md). 설계: `temp/proposals/tier2-router-codegen-adapter.md` §6/§11/§13/§17. 기록: [tier2-route-tree-adapter-seam-001.md](temp/runs/tier2-route-tree-adapter-seam-001.md), [tier2-codegen-adapter-seam-001.md](temp/runs/tier2-codegen-adapter-seam-001.md), [tier2-codegen-emitter-001.md](temp/runs/tier2-codegen-emitter-001.md), [tier2-codegen-generated-file-guard-001.md](temp/runs/tier2-codegen-generated-file-guard-001.md), [tier2-codegen-output-strategy-001.md](temp/runs/tier2-codegen-output-strategy-001.md), [tier2-codegen-custom-adapter-dogfood-001.md](temp/runs/tier2-codegen-custom-adapter-dogfood-001.md), [tier2-route-cross-check-001.md](temp/runs/tier2-route-cross-check-001.md).
   - 2026-06-21 evidence 수집: [tier2-gate-promotion-evidence-001.md](temp/runs/tier2-gate-promotion-evidence-001.md)에서 Tier2 codegen/route warning-first 표면(codegen focused guard · route cross-check · v1 generated guard)의 determinism/drift/false-positive/test/no-coupling telemetry를 기록했다. decision pending; CI/hard gate/required check/`--enforce` 승격 없음.
3. **Interaction Matrix telemetry / 승격 decision (later, 아직 하드 게이트 아님)** — 정밀화(route-tree.txt `route: <token>` EXACT 교차검증 + `Result Type` enum 동결)는 warning-first 로 랜딩됨(위 Tier 3 절). 남은 것은 telemetry 후 검사 13 의 하드 게이트 승격 여부를 별도 decision PR 에서 검토하는 것뿐이며, 현재 readiness/정책 게이트는 변경하지 않는다.

> 이 순차 정렬로 직전 후보(Work Packet · reconcile-input 킷 vendor · test-fixtures 하드 게이팅 승격)는 *우선순위 슬롯*에서 내려가지만 문서 내 다른 곳에 그대로 남는다 — Work Packet=Future Candidate(아래) · reconcile-input vendor=**완료**(Tier 2 절 참조) · test-fixtures 하드 게이팅=Phase 0 "하드 gating 후속".

*이번 세션 완료: reconcile-input 스킬 작성(write-a-skill 방법론 + 코덱스 medium 1건 반영) — 리포-로컬 `.claude/skills/`.*
*MVP-B Phase 0 통합: test-fixtures 하니스 + forbidden_paths backstop(warning-first) + 입력/register 검증(검사 11·12).*

## 지금 하지 말 것

- 새 산출물 축 추가 — idea surface 확장 금지 (리뷰도 새 축 아님, Work Packet 후보로 흡수)
- 구현 후보 중 하나를 명시적으로 고르지 않은 채 MVP-A 확장
- 다음 구현 후보를 병렬 구현하거나, 앞 항목 완료 전에 뒤 항목의 정본 파일(`README`/roadmap/package/manifest/policy/templates/scripts)을 바꾸기
- LLM 이 게이트를 **내리게** 만드는 자동화 (resolve/confirm/conflict-close 는 사람-전용 불변식 유지)
- Unknown/Conflict/Work Packet/Review/Discovered Work 를 readiness 게이트로 만들기 (게이트는 Open Decision + 정책 fact 뿐)

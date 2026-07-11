# Warning-first 승격 정책 — evidence thresholds for gate promotion

> v1 (2026-07-11) · 출처: 이슈 #162 (open-improvements-backlog IMP-01).
> **이 문서는 정책 문서다. 그 자체로 아무것도 게이트하지 않는다.** 이 문서의 도입으로
> 새 CI hard gate·새 required check·새 artifact 축은 하나도 생기지 않고, 어떤 warning-first
> surface 도 승격되지 않으며, telemetry 형식(ledger schema/CLI)은 바뀌지 않는다.
> 실제 승격은 언제나 **별도 사람 승인 decision PR** 로만 일어난다 — LLM/도구는 증거를 모으고
> 초안을 쓸 뿐, 상태 전이(resolve/승인)는 사람 전용이다(게이트 해제 사람-전용 불변식,
> [open-decisions.md](open-decisions.md) · [roadmap "지금 하지 말 것"](roadmap-current.md)).

## 목적

lint baseline, test fixtures, forbidden paths, check-generated, Interaction Matrix 검사 13 등
여러 표면이 "telemetry 이후 별도 결정" 상태로 유예돼 있다. telemetry(`workflow:telemetry`)가
구현된 지금, 개별 PR 마다 같은 승격 논의를 반복하지 않도록 **무엇을 몇 회 관측해야
승격 후보가 되는지 / 어떤 단위로 warning·FP 를 기록하는지 / consumer 별 차이를 어떻게
다루는지 / 승격하지 않기로 한 결정이 왜 pending 처럼 보이지 않게 하는지**를 한 곳에 고정한다.

이 문서는 warning-first surface 의 **승격 decision 상태의 canonical home** 이다
(구현 상태·게이트 인벤토리의 home 은 여전히 [roadmap-current.md](roadmap-current.md),
per-artifact status 는 artifact-manifest — [doc-ownership](../frontend-workflow-kit/docs/reference/doc-ownership.md) 참조).

## 경계 — 이 문서가 하지 않는 것

- 실제 CI hard gate 를 추가하지 않는다(이슈 #162 제외 범위).
- 자동 threshold promotion 을 도입하지 않는다 — 임계 충족을 판정해 `eligible` 을 **출력하는
  도구를 만들지 않는다.** telemetry 는 카운트만 내고 verdict 를 내지 않는다는 기존 계약 유지.
- readiness 판정 로직을 재구현하지 않는다.
- telemetry ledger 형식을 바꾸지 않는다 — FP 분류 등 이 정책이 요구하는 사람-판단 기록은
  run report/이슈에 남기고, ledger 는 지금 그대로 소비한다.
- 새 artifact 축을 만들지 않는다 — 이 문서는 `_meta/` 산출물이 아니라 kit-dev prose 정책이다.

## 승격 단계 (promotion targets)

승격은 두 단계로 구분하며, 서로 다른 임계를 적용한다.

```txt
required check 승격   도구의 exit contract 는 그대로 두고 CI 배선만 blocking 으로 바꾸는 것.
                      (예: continue-on-error 제거, GitHub required status check 지정)

hard gate 승격        도구/검사의 기본 exit contract 자체를 위반 시 exit 1 로 바꾸는 것.
                      (예: --enforce 기본화, validate warning 검사의 "검사 12종" 편입)

영구 advisory         어느 쪽도 하지 않기로 고정한 표면. 상태 rejected + 재오픈 trigger 명시.
(observation-only)    "pending" 이 아니라 닫힌 결정이다.
```

## Decision 상태 모델

인벤토리의 각 surface 는 다음 네 상태 중 하나를 가진다. **모든 상태 전이는 사람 전용이며
이 문서를 고치는 decision PR 안에서만 일어난다.** 재검토 날짜는 쓰지 않는다 — 날짜는
지나가면 pending 으로 되돌아갈 뿐이므로, 모든 비-promoted 상태는 **재오픈/승격 trigger**
(그 사건이 일어나면 decision PR 을 열 수 있는 관측 가능한 조건)를 대신 가진다.

```txt
deferred    기본값. 승격 후보이지만 evidence 가 임계 미달. trigger 충족 전에는 승격 논의를
            개별 PR 에서 반복하지 않는다.
eligible    사람이 evidence 를 검토해 임계 충족을 확인하고 이 문서에 기록한 상태.
            자동 판정 금지 — eligible 전이 자체가 사람 PR 이다. eligible 은 "승격해도 된다"가
            아니라 "승격 decision PR 을 열 자격이 있다"일 뿐이다.
rejected    승격하지 않기로 닫은 결정(영구 advisory 포함). 만료되지 않으며, 명시된
            재오픈 trigger 가 실제로 관측될 때만 재논의한다.
promoted    별도 사람 승인 decision PR 로 승격 완료. decision_id/PR 링크를 행에 남긴다.
```

전이 규칙: `deferred → eligible → promoted` 또는 `deferred|eligible → rejected`,
`rejected → deferred`(재오픈 trigger 관측 시). 어떤 전이도 LLM/도구/CI 가 수행하지 않는다.

## Evidence 단위 — 관측·FP 기록 계약

**관측 1회** = 하나의 consumer 컨텍스트에서 생성된 telemetry ledger 스냅샷 1개
(CI artifact 또는 커밋된 `--out` 산출물). telemetry 가 커버하지 않는 표면은 CI run 1회
또는 기록된 수동 run(run report) 1회로 센다. `examples/**` 골든 픽스처 실행은 회귀 검증이지
관측이 아니다 — 관측 횟수에 세지 않는다.

**기록 단위** = `(surface, consumer repo, 관측 스냅샷)`. warning 수는 telemetry 의
`warning_count`(또는 해당 도구 `--json` 출력)를 그대로 쓴다. **FP 분류는 사람이 한다**:
warning 이 가리킨 것이 실제 계약 위반이 아니라고 사람이 판정한 경우를 run report 또는
이슈에 `(surface, repo, 스냅샷, 사유)` 로 남긴다. telemetry 는 FP 필드를 갖지 않는다
(형식 불변).

**consumer 집계 규칙 — 평균 금지.** consumer repo 별 관측은 분리해 기록하고, 임계 판정은
**관측된 모든 repo 가 각각** 기준을 충족해야 한다(최악 repo 기준). repo 간 평균·합산으로
임계를 채우는 것을 금지한다 — 한 repo 의 조용함이 다른 repo 의 오탐을 가리면 안 된다.
kit 자체 CI(golden example 경로)는 consumer 1개로 세되, **kit CI 단독으로는 "소비 repo 수"
요건을 채울 수 없다**(외부/실사용 consumer ≥ 1 필수).

## 임계 (class defaults)

아래는 승격 단계별 기본 임계다. 개별 surface 의 추가 요건은 인벤토리 행에 적는다.
임계값의 완화·조정 역시 이 문서를 고치는 사람 승인 PR 로만 한다.

| 요건 | required check 승격 | hard gate 승격 |
|---|---|---|
| 서로 다른 consumer repo | ≥ 2 (실사용 repo ≥ 1) | ≥ 2 (실사용 repo ≥ 1) |
| repo 당 최소 관측 횟수 | ≥ 10 | ≥ 20 |
| FP 허용치 (repo 별) | FP율 ≤ 5% (분모 = 그 repo 의 warning 발화 총수) | 최근 20회 관측 창에서 FP 0건 |
| flake (같은 입력, 다른 결과) | 0건 | 0건 + determinism witness 2-run identical |
| true-positive witness | 권장 | **필수 ≥ 1** (실제 위반을 잡은 기록, 또는 red-team/골든 fixture 가 재현하는 방어 witness) |
| cross-platform 관측 | 불요 | 필수 (최소 ubuntu + macos smoke 급에서 동일 finding-set) |

## 단순 기준 금지 (anti-criteria)

다음은 승격 근거로 **인정하지 않는다.**

- **"경고가 0회여서 승격"** — warning 0 은 표면이 깨끗하다는 뜻일 수도, 아무것도 관측하지
  못한다는 뜻일 수도 있다. 승격에는 위 true-positive witness(표면이 잡아야 할 것을 실제로
  잡는다는 증거)와 FP 분류 이력이 필요하다. 조용한 표면은 hard gate 후보가 아니라
  "커버리지 미확인" 이다.
- **임계 충족 = 자동 승격** — eligible 은 decision PR 을 열 자격일 뿐이다. 어떤 도구도
  임계 판정·승격을 수행하지 않는다.
- **repo 평균으로 FP율 충족** — 위 집계 규칙 위반.
- **관측 계기의 게이트화** — 아래 observation-only 계약 참조.

## 관측 계기 observation-only 계약 (고정)

visual(`visual-consistency`·`visual-contract-bootstrap`) / telemetry / red-team 은 — eval ·
doc-drift · doctor · adoption-probe · policy-draft 와 함께 — 승격 **대상**이 아니라 승격
**증거를 만드는 계기**다. 계기가 게이트가 되면 증거 수집 자체가 오염된다(게이트를 통과하려는
압력이 관측을 왜곡한다). 따라서:

- 이들 표면은 인벤토리 B 에 **rejected(영구 observation-only)** 로 등록한다. pending 이 아니라
  닫힌 결정이며, 각 행의 재오픈 trigger 가 관측될 때만 재논의한다.
- 관측/finding/gap/드리프트로 **절대 exit 1 하지 않는다**(usage/config 오류 exit 2 는 게이트가
  아니라 입력 계약). CI 에 올릴 땐 `continue-on-error`/artifact 수집 전용을 유지한다.
- `visual-consistency --enforce` 같은 opt-in 강제 플래그는 **소비 repo 의 로컬 결정**으로만
  남는다. kit CI·validate 에 배선하는 것은 별도 사람 결정 없이는 금지(기존 COMMANDS 계약).
- telemetry ledger 를 readiness/validate 가 읽게 만들지 않는다.

## Surface inventory — A. 승격 후보 (canonical register)

> 상태 열이 이 저장소에서 승격 decision 상태의 정본이다. 아래 모든 행의 공통 요건은 위
> class defaults 이고, "추가 요건/FP 단위" 열은 surface 별 특이사항만 적는다.

| Surface | Entry / 현재 계약 | Evidence source | 승격 단계 후보 | 추가 요건 / FP 단위 | 상태 | 승격 불가 사유 (현재) | trigger |
|---|---|---|---|---|---|---|---|
| test-fixtures 골든 회귀 CI step | `scripts/test-fixtures.mjs` — 스크립트는 exit 1 가능하나 CI 가 `continue-on-error` | CI run 이력(warning-only step 로그) + run report | required check (`continue-on-error` 제거) | FP = "의도된 계약 변경으로 인한 fixture 실패"를 회귀와 구분해 분류한 기록 | deferred | 실사용 consumer 관측 0. fixture 실패의 FP(의도 변경 vs 회귀) 분류 이력 없음 | 임계 충족 evidence 를 정리한 decision PR |
| forbidden-paths diff backstop | `scripts/forbidden-paths.mjs` — 기본 warning, `--enforce` 시 exit 1 | red-team `path-backstop` witness(telemetry `--include redteam`) + run report | hard gate (`--enforce` 상시화 + CI diff 결합) | FP = 공유 경로(`src/api` 등) 정상 편집이 위반으로 잡힌 사례. 실도입 repo 의 실제 diff 관측 필수 | deferred | 실도입 repo diff 관측 0. 전역 경로 오탐 우려가 설계 시점부터 기록됨([open-decisions.md](open-decisions.md) §Validate 통합) | 실도입 repo 에서 diff 기반 관측 누적 후 decision PR |
| lint-gen `--check` drift smoke | `scripts/lint-gen.mjs` — CI `continue-on-error` smoke | CI smoke 이력 + [lint evidence run report](temp/runs/lint-gate-promotion-evidence-001.md) | required check | drift 발화가 "정당한 정책 변경" 인지 분류. repo-root generated guard 준비가 선행 | deferred | manifest `eslint-workflow-config` 가 `planned`(guard 부재). brownfield dogfood 없음(roadmap 후보 1) | brownfield dogfood + guard 준비 후 decision PR |
| lint-baseline ratchet smoke | `scripts/lint-baseline.mjs` — 기본 warning-first, `--enforce` 시 increase = exit 1 | CI smoke(`--json`) 이력 + per-policy history | required check (smoke) / hard gate (`--enforce`) | FP = 정당한 코드 증가(예: 대량 리팩터)로 인한 increase. per-policy 단위로 기록 | deferred | per-policy 시계열 부재. brownfield dogfood 없음(roadmap 후보 1) | 동일 |
| check-generated (generated-file guard) | `scripts/check-generated-files.mjs` — 항상 exit 0, `--enforce` 미구현(의도) | focused target 실행 기록 + [tier2 evidence run report](temp/runs/tier2-gate-promotion-evidence-001.md) | hard gate (`--enforce` 구현+기본화) | FP = `CG:stale` 이 hand-written 파일을 generated-owned 로 오인한 사례(real-repo 기준) | deferred | real-repo `CG:stale` FP rate 미관측(tier2 리포트가 요구 신호로 명시) | 실도입 repo 관측 누적 후 decision PR |
| validate 검사 13 (Interaction Matrix v2) | `scripts/validate.mjs` — warning-only, "검사 12종" 미포함 | validate 경고 출력 관측 + consumer 채택 기록 | hard gate (검사 12종 편입) | v2 표를 실제 작성하는 consumer ≥ 1 선행. route-tree artifact 부재 시 skip 이므로 skip 비율도 기록 | deferred | v2 형식 실채택 consumer 관측 0 — 커버리지 자체가 미확인(roadmap 후보 3) | v2 실채택 + 관측 누적 후 decision PR |
| validate 검사 14 (policy requires 문법) | `scripts/validate.mjs` — warning-only, 검사 13 과 동형 | validate 경고 출력 관측 | hard gate (검사 12종 편입) | 커스텀 policy 를 쓰는 consumer 관측 선행 | deferred | 커스텀 policy consumer 관측 0 | 동일 |
| route-cross-check | `scripts/route-cross-check.mjs` — 항상 exit 0 | telemetry default surface `route-cross-check` (direction 별 카운트) | required check | FP 를 direction 별(`spec_not_in_tree` vs `tree_not_in_spec`)로 분리 기록(tier2 리포트 계약) | deferred (OD-11, 2026-06-21 resolved: 연기) | 실제 도입(adoption) 전 — OD-11 이 승격을 명시적으로 연기 | 실제 도입 후 warning-first telemetry 발생(OD-11 원문 그대로) |

## Surface inventory — B. 관측 계기 (rejected · observation-only 영구)

이 표의 상태는 전부 **rejected** 다 — 승격 대기가 아니라 "게이트로 만들지 않는다"는 닫힌
결정이다. 공통 재오픈 trigger: **그 표면이 계기가 아니라 계약 검증기로 재설계되고, 그 관측을
대체할 독립 계기가 따로 존재하게 될 때**만 decision PR 로 재논의할 수 있다. 그 외의 개별
trigger 는 행에 적는다.

| Surface | Entry / 현재 계약 | 역할 (evidence 를 만드는 쪽) | 승격 불가 사유 (영구) |
|---|---|---|---|
| telemetry | `scripts/telemetry.mjs` — 항상 exit 0, verdict 필드 없음 | 승격 evidence 의 수집기 그 자체 | 수집기가 게이트면 관측이 왜곡된다. ledger 를 readiness 가 읽는 것도 금지([next-ideas 01](../docs/research/next-ideas/01-telemetry-and-promotion-evidence.md) §7) |
| red-team suite | `scripts/redteam.mjs` — 관측 라벨만, 항상 exit 0 | 방어 witness·observed-gap 생산 | gap 관측이 실패로 취급되면 gap 을 기록할 유인이 사라진다(backlog "열지 말아야 할 이슈") |
| eval (readiness-eval) | `scripts/readiness-eval.mjs` — metric mismatch 로 실패하지 않음 | readiness 판정 품질의 측정 | 측정 하니스의 게이트화는 판정 로직의 사실상 이중화 |
| doc-drift | `scripts/doc-drift.mjs` — 항상 exit 0, status-heuristic 은 info-only | 문서 정합 관측 | 휴리스틱 기반 — semantic truth 를 주장하지 않는다는 계약. info 는 warning 에도 미합산 |
| visual-consistency | `scripts/visual-consistency.mjs` — 경고 exit 0, `--enforce` 는 소비 repo 로컬 opt-in | 시각 일관성 관측 | 시각 판단은 사람 리뷰 증거. kit CI/validate 배선은 별도 사람 결정 없이 금지(COMMANDS 계약) |
| visual-contract-bootstrap | `scripts/visual-contract-bootstrap.mjs` — review-only draft | contract 초안 제안 | canonical 문서를 쓰지 않는 draft 생성기 — 게이트 개념 자체가 없음 |
| adoption-probe | `scripts/adoption-probe.mjs` — draft-only 진단 | 온보딩/채택 fact 생산 | 진단이 게이트면 온보딩 자체를 막는다 |
| doctor | `scripts/doctor.mjs` — 진단 전용 | 환경/일관성 진단 | 동일 |
| policy-draft | `scripts/policy-draft.mjs` — draft/review artifact | Tier3 정책 초안 제안 | live policy 는 사람이 반영 — draft 는 게이트가 될 수 없음 |

## 승격 절차 (decision PR)

1. **evidence 정리** — ledger 스냅샷/CI artifact/run report 링크와 repo 별 관측·FP 표를
   decision PR 본문 또는 run report 에 만든다(LLM 이 초안 가능).
2. **이 문서 갱신** — 해당 inventory 행의 상태 전이 + decision_id/PR 링크 기록. 상태 전이가
   포함된 PR 은 곧 decision PR 이다.
3. **사람 승인** — 승격(및 eligible 전이·rejected 재오픈)은 사람이 리뷰·승인·머지한다.
   LLM 은 어떤 행의 상태도 스스로 바꾸지 않는다.
4. 승격이 실제 게이트 배선(CI/validate 변경)을 수반하면 그 배선도 같은 decision PR 계열에서
   사람 승인으로만 한다.

## 불변식 정합

- **새 hard gate 0 · 새 required check 0** — 이 문서는 기준만 정의한다.
- **새 artifact 축 아님** — kit-dev prose 정책 문서. `_meta/` 산출물·manifest 엔트리 없음.
- **warning-first surface 승격 0** — 모든 A 행이 deferred, B 행이 rejected 로 시작한다.
- **사람 전용 resolve/confirmed 유지** — 모든 상태 전이·임계 조정·게이트 배선은 사람 승인
  PR 전용. LLM 은 evidence 수집과 초안만.
- **telemetry 형식 불변** — FP 등 사람-판단 축은 run report/이슈에 산다.

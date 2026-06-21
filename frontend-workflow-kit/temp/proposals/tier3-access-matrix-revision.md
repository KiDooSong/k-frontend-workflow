# tier3 layer-model 정정안 — `edits_at` 임계값 → mode×layer access matrix

> Status: **DESIGN / PROPOSAL ONLY**. 2026-06-21 · branch `docs/tier3-access-matrix`.
> 코드·정책·CI·매니페스트 변경 0. PR #68 `tier3-layer-model.md` 초안을 PR #71 실측 evidence 에 맞춰
> 정정하기 위한 제안서다. **resolve·승격·구현 착수는 사람만.**
> 대상 문서: `docs/design/drafts/customizable-architecture/tier3-layer-model.md` (PR #68, ADDED).
> 근거 evidence (main 동봉, PR #71):
> - `temp/runs/axis2-a-blocker1-spike/SPIKE-REPORT.md` + `synth-policy.mjs` (정책 재생성 diff)
> - `temp/runs/multilayer-adoption-dryrun/EXPERIMENT-REPORT.md` (Clean Arch 6계층 dry-run F1~F5)
> 정본 코드: `policies/implementation-mode-policy.yaml` · `scripts/lib/layout-profile.mjs` ·
> `scripts/lib/spec.mjs:308-318` · `templates/meta/lint-policy.template.yaml:15-26` · `presets/expo-feature.yaml`.

---

## 0. 한 줄 결론

PR #71 스파이크를 **독립 재현**했다(`node frontend-workflow-kit/temp/runs/axis2-a-blocker1-spike/synth-policy.mjs`):

| 생성기 | role-derived 14셀 中 불일치 | 판정 |
|---|---|---|
| **v1** = tier3 §3 초안 단일 `edits_at: <min mode>` | **10 / 14** | ❌ byte-동치 불가 |
| **v2** = per-(layer×mode) `allow[]`/`forbid[]` 행렬 | **0 / 14** | ✅ byte-동치 |

> 정직한 해석(SPIKE-REPORT §정직한 한계): **v2=0/14 는 부분적으로 *정의적***(행렬이 행렬을 재현)이다.
> 비자명한 결과는 두 가지 — (a) **v1 의 10/14 실패**(=§3 단일 임계값이 부족), (b) 정책 재현에 필요한
> **최소 스키마 표현력의 하한이 per-mode 행렬**이라는 것. "행렬이면 무조건 맞다"가 아니라 "행렬보다 약한
> 스키마로는 못 맞춘다"가 핵심 증거다.

따라서 **`edits_at` 단일 임계값을 canonical 로 유지할 수 없다.** tier3 §3 의 source-of-truth 스키마를
**mode×layer access matrix** 로 교체하고, `edits_at` 은 (남긴다면) 손실 있는 편의 alias / v1 draft 로 격하한다.
이 정정은 "새 산출물 축" 추가가 **아니다** — 기존 **readiness/mode 정책의 access 표현력 일반화**(+ gate
semantics 일반화)다. roadmap "산출물 축" 닫힌 목록(`roadmap-current.md:30-40`)은 건드리지 않는다.

---

## 1. 작업 질문 7개에 대한 판단

### Q1. PR #71 evidence 가 PR #68 의 무엇을 강화하고 무엇을 수정하게 하는가

**강화 (추론 → 실측):**
- §1 "3계층 천장" 과 §3 의 동기. EXPERIMENT 가 정본 Clean Architecture 6계층 Expo "profile" 피처를
  실제로 만들고 추가 role 7개를 선언했는데 **전부 inert**(F1: readiness 출력의 allowed/forbidden 에 단 한 번도
  안 나옴), 도메인+데이터 계층이 **허용도 금지도 아님**(F2), 그리고 **6계층 완비 vs 도메인+데이터 통째 삭제를
  readiness 가 byte-동일로 답함**(F3). → "킷이 Axis 2 를 게이트 못 한다"가 추론이 아니라 실측이 됐다.
- §3 의 `<role>_present` fact + mode↔layer 결합 필요성. F3 이 정확히 "`repository_present` 류 fact 부재"를
  원인으로 지목 → §4 fact 일반화의 직접 근거.

**수정 강제:**
- **§10① 은 "우려"가 아니라 "실측된 설계 결함, 문서가 말한 것보다 심함"으로 확정.** 단일 `edits_at` =
  10/14 불일치(재현). §3 초안은 자신의 §7 수용기준(byte-동치)을 **통과 못 한다** → 그대로는 구현 불가.
- **§2 "두 직교축의 곱 / orthogonal compose" 서사는 반증됨.** fake-hook seam 이 "api-integrated 에서
  screen 을 *특정해서* 막는다"는 건 maturity×depth **교차 제약**이지 두 독립축의 곱이 아니다. 정책은 환원
  불가한 **mode×layer 행렬**(SPIKE 해석 §2).
- **§7/§11 byte-동치 수용기준은 행렬 스키마에서만 성립**(v2=0). `edits_at` 로는 forbidden 5/5 셀이 통째로
  사라지고 allowed 가 번진다 → 자기모순(§10① 원지적).

### Q2. `edits_at` 단일 임계값은 폐기/축소해야 하는가 · 새 스키마

**격하한다.** `edits_at` 이 표현 못 하는 세 가지(재현된 10셀 불일치의 구조):
1. **명시 forbidden** — §3 스키마에 forbid 산출 필드가 없어 `route~final` 의 `{roles.api_client}` 금지,
   `api-integrated` 의 `{roles.screen}` 금지를 **하나도** 못 만든다(forbid 5/5 전멸).
2. **비누적 allow** — `edits_at` spread 는 단조 누적이라 `{roles.route_entry}` 가 route-skeleton 이후 모든
   모드로, `{roles.screen}` 이 api-integrated 로(실제론 forbidden), 전부 production 으로(실제론 `src/**`
   리터럴만) 번진다.
3. **비연속 allow** — `{roles.hook}` 은 rough 에서 allowed, **final 에서 GAP**, api-integrated 에서 다시
   allowed. 단조 임계값은 이 구멍을 못 만든다.

**canonical = per-(layer×mode) access matrix** (SPIKE v2, 0/14 재현). `edits_at` 은 **삭제하거나**, 남긴다면
"재-잠금·GAP 없는 신규 leaf 계층" 한정 **손실 alias**(`edits_at: M` ≡ `allow:[M..top]`)로만, "byte-동치 비보장 ·
v1 draft" 명시. §3 의 "단일 한 줄 depth" 셀링포인트는 줄어든다(정직하게 — SPIKE 해석 §4: byte-동치를 받으려면
layer 당 명시 mode 멤버십 필요 = 정책 role-derived 절반과 동일 정보량).

**정정 §3 스키마(layer-major source, 실측 byte-동치):**

```yaml
# policies/project-layout.yaml / presets/expo-feature.yaml  (PROPOSED)
# 단일 스키마: layers = 순서 있는 엔트리 리스트. 리스트 순서 = depth order(화면 근처 → 데이터 근처).
# 한 엔트리 = role + fact(존재) + access(편집권 행렬) + gates(선택). Q5 의 3필드 분리를 한 곳에 담는다.
layers:
  - role: route_entry
    fact: dir_has_files
    access: { allow: [route-skeleton] }
  - role: screen
    fact: dir_has_files
    access: { allow: [screen-skeleton, rough-fixture-ui, final-fixture-ui],
              forbid: [api-integrated-ui] }              # fake-hook 재-잠금
  - role: domain_component
    fact: dir_has_files
    access: { allow: [rough-fixture-ui, final-fixture-ui] }
  - role: hook
    fact: dir_has_files
    access: { allow: [rough-fixture-ui, api-integrated-ui] }   # final 에서 GAP(비연속) — 의도
    # gates: <mode> 생략 → "경로 허용만"(게이트 아님). expo back-compat: fake_hook_exists := hook_present
  - role: api_client
    fact: dir_has_files
    access: { allow: [api-integrated-ui],
              forbid: [route-skeleton, screen-skeleton, rough-fixture-ui, final-fixture-ui] }
```

> **lint DAG 의 `order` 는 이 리스트에서 import-경계 계층만 추려 파생**한다(Q6) — `route_entry` 는 access
> 행은 갖지만 import-경계 노드가 아니므로 lint `order` 에는 안 들어간다(별도 subset). access 와 lint 는 같은
> 엔트리 리스트의 *다른 subset/투영*이지 동일 `order` 가 아니다(Codex M2).

> **리터럴/blanket guard 는 layers 밖**(§3 "리터럴 유지"): `src/**`(docs-only forbid / production-ready allow),
> `src/features/**`(route-skeleton), `openapi.yaml`(screen-skeleton·rough), `docs/frontend-workflow/**`(docs-only)
> 는 `implementation-mode-policy.yaml` 에 손수 유지. **production-ready 의 screen 재허용은 이 `src/**` 리터럴
> 효과이지 layer 셀이 아니다** — "열림→재잠금→재열림" 호의 마지막 구간은 리터럴이 담당한다.

**로더가 합성하는 resolved 정책(mode-major, role-token 셀만 — 재현된 TRUTH):**

| mode | allow (roles) | forbid (roles) |
|---|---|---|
| docs-only | — | — |
| route-skeleton | route_entry | api_client |
| screen-skeleton | screen | api_client |
| rough-fixture-ui | screen, domain_component, hook | api_client |
| final-fixture-ui | screen, domain_component | api_client |
| api-integrated-ui | hook, api_client | **screen** |
| production-ready | — (리터럴 `src/**`) | — |

> 오리엔테이션: **source = layer-major `access:` 행**(ordered `layers:` 개념과 일치, SPIKE 가 실증).
> **resolved = mode-major 정책**(= `implementation-mode-policy.yaml` 현 구조). 둘은 **전치(transpose)**다.
> byte-동치는 resolved(mode-major)에서 검증한다. (작업지시 예시는 mode-major 였는데 동일 행렬의 전치이며,
> 실제 채택값은 위 expo 실측이다 — 지시대로 "예시 그대로 채택하지 않고 현 policy byte-동치"로 도출.)

### Q3. source of truth — `layers` vs `implementation-mode-policy.yaml` vs "preset 합성 resolved policy"

§10② 의 충돌(§5 "layers 가 정책 합성" vs §11 "정책 불변")을 다음으로 정리한다:

- **authoritative source = `layers:`/`access:`** (preset + project-layout + domains 머지). role-token 셀의
  단일 인간 저작 출처.
- **resolved policy = 로더(`layout-profile.mjs` 확장)가 합성** — mode-major allowed/forbidden. readiness 가
  소비하는 in-memory 산출물. tier1 이 이미 `{roles.X}` 토큰을 펼치는 것과 **같은 계열의 합성**(`resolvePaths`
  L161-195 연장).
- **`implementation-mode-policy.yaml` 은 role-token 셀을 더는 손수 쓰지 않는다(→ 생성).** 그 파일에 손수
  남는 것: (a) **리터럴/blanket guard** 셀(위 박스), (b) **`requires:` fact 조건**과 **mode `order`**(maturity
  사다리 자체). 즉 "정책 불변"은 *사다리·리터럴·requires* 에 한해 참, "정책 합성"은 *role-token 셀* 에 한해 참 —
  §5/§11 을 이 경계로 분리하면 둘 다 성립한다.
- **머지 규칙:** tier1 의 `mergeRoles`(L70-76) 우선순위를 계승 — `preset.layers < project-layout.layers <
  domains.<d>.layers`, **layer 단위 교체**(glob 병합 아님). resolved = `synthesize(layers)`(role-token 셀)
  **∪** 손수 리터럴 셀.
- **drift 방지 = `_meta` 멱등성 CI 와 *동일 패턴*(재생성→git diff→exit 1)을 합성 정책에 적용.** ⚠ 단
  현행 멱등성 step(`frontend-workflow-kit.yml:45,49`)은 `examples/coupon-feature/.../_meta` 만 diff 하므로,
  resolved 정책(또는 그 fixture)을 재생성·비교하는 **새 check target 추가가 필요**하다(Codex M3) — 메커니즘은
  기존 것과 같지만 *현행 CI 로 공짜로 따라오지 않는다*. 새 *종류*의 게이트는 아니나 새 *대상*이며, 그 추가는
  구현 OD 범위(코드/CI 변경이므로 이 제안서 밖).
- **남는 사람 결정(구현 OD):** "정책 파일이 *생성물* 이 되어 리터럴 셀만 주입하나" vs "layers 는 *추가만*
  하고 정책은 손수 유지(이중 보유 drift 감수)". 보수적으로는 전자(생성+멱등성). → OD-12-impl.

### Q4. fake-hook 비단조(screen @ api-integrated forbidden) byte-동치 보존

두 층위로 보존한다:

1. **forward gate(정책):** 행렬 스키마가 직접 인코딩 — `screen.forbid:[api-integrated-ui]`. SPIKE v2 가
   `api-integrated-ui.forbid == {roles.screen}` 를 **0 불일치**로 재현. 행렬에 forbid 필드가 있으면 기계적.
2. **diff backstop(clearance) 는 건드리지 않는다.** `layout-profile.mjs:211-215` 가 명시: screen 재-잠금
   표면(`src/features/{domain}/screens/**`, api-integrated 에서 금지)은 `forbiddingIdx(5) ≥ tIdx(2)` 라
   `materializeGuardedSurface` 가 **의도적으로 채택 안 함** → 이게 expo BYTE-동치를 지킨다. 재-잠금은
   **forward 게이트·readiness 의 몫**이지 백스톱 clearance 모델 대상이 아니다.

→ **결론: layers 는 forward gate(정책 allowed/forbidden)만 구동. 백스톱은 합성된 정책으로부터 기존
`materializeGuardedSurface` 가 **무수정** 파생.** tier3 가 백스톱까지 layers 로 구동하려 하면
`forbiddingIdx ≥ tIdx` 채택 규칙을 흔들어 expo parity 가 깨질 수 있다. **byte-동치 회귀는 두 면 모두** 검증:
(a) forward-gate parity(SPIKE 식 0/14), (b) backstop guarded-surface parity(기존 expo assert). §7/§11 의
byte-동치 주장을 이 *forward-gate* 범위로 한정 표기해야 한다.

### Q5. fact 일반화(`<role>_present`) vs access matrix — 분리

**한 `layers:` 엔트리가 내는 두 개의 서로 다른 산출물.** 절대 혼동 금지:

| | `fact` → `<role>_present` | `access` → allow/forbid 행렬 |
|---|---|---|
| 무엇을 답하나 | "이 계층이 **존재/완성** 됐나" | "모드 M 에서 이 계층 파일을 **편집 가능**한가" |
| 어디로 가나 | readiness **`requires:`** 입력 | mode 정책 **allowed_paths/forbidden_paths** |
| 성격 | **readiness 입력**(판정 전제) | **edit surface**(경로 게이트) |
| 파생 위치 | `spec.mjs:308-318` 일반화(layer 집합 순회) | 로더 합성(Q3) |
| PR #71 근거 | F3(=`repository_present` 부재로 완비/공백 구분 불가) | F1/F2(추가 계층이 allow/forbid 어디에도 없음) |

- 둘은 **역할이 직교**하되 같은 엔트리에서 나온다: 한 layer 가 (1) readiness 입력 vocabulary 에 fact 1개,
  (2) access 행렬에 allow/forbid 행 1개를 기여. **access 만 있고 gate 안 함**(경로 허용하되 `<role>_present`
  를 어떤 `requires` 도 참조 안 함) = 안전한 점진 도입 기본값. 반대로 fact 가 그 layer 가 편집 안 되는 모드를
  gate 할 수도 있음. → `fact`(존재) / `access`(편집권) / `gates`(어느 `requires` 합성) **3개 분리 필드**.
  원초안의 `edits_at`+`gates` 혼선이 정확히 이 둘을 뭉갠 것.
- **불변식 #1 보존:** spec 은 fact 를 더 *공급*만, 행렬은 경로 셀을 더 *공급*만. `min(fact_mode,
  decision_cap)` 판정은 `readiness.mjs` 단일 출처 그대로(일반화 ≠ 판단 추가).

### Q6. layer-boundaries N계층 DAG — access matrix 와 별도인가, 같은 `layers` 파생인가

**서로 다른 관계지만 같은 `layers:` 선언에서 파생 — 한 선언의 두 투영(projection). 단 각 투영은 *관련
subset* 만 쓴다(동일 `order` 아님).** 합치지 말 것:

| | access matrix | layer-boundaries lint DAG |
|---|---|---|
| 관계 | (layer × **mode**) → 편집권 | (layer × **layer**) → import 허용 |
| 축 | maturity 사다리(시간/단계) | 정적 의존성 방향 |
| 질문 | "**언제** 편집하나" | "**무엇이 무엇을** import 하나" |
| 출처 | §3 엔트리의 `access:` | §6 `layer_rules`(import-경계 subset 의 order + `forbid_upward` + `allow:` 예외) |
| 멤버십 | 모든 layer(route_entry 포함) | **import-경계 계층만**(route_entry 제외) |

- 둘 다 같은 `layers:` 엔트리 리스트의 투영이되 **멤버십이 다르다**: access 는 모든 layer(진입점
  `route_entry` 포함)에 행을 주지만, lint DAG 는 **import 경계를 갖는 계층만**(FSD 6레벨, Clean Arch
  screen→use_case→repository-interface) 노드로 쓴다. `route_entry` 는 access 행은 있으나 import-경계 노드가
  아니므로 lint `order` 에서 제외. **한 `layers:` 선언, 두 파생 산출물**(시간적 edit-gate + 정적 import-DAG) —
  한쪽 셀이 다른 쪽 셀을 함의하지 않으므로 한 표로 합치면 안 된다.
- **현행 lint 제약(Codex M2):** `lint-policy.template.yaml:15-26`/`lint-gen-core.mjs` 가 아는 계층은
  api/screens/ui **3종 고정**이다. §6 의 N계층 DAG 는 이 3종 하드코딩을 일반화하는 PROPOSED 작업이며, 그
  전까지 `route_entry` 등 비-import 계층을 lint `order` 에 넣으면 **미지원 계층 오류**가 난다 → access 가 쓰는
  순서(= `layers:` 리스트 순서 전체)와 lint `order`(import-경계 subset)를 분리(같은 선언, 다른 subset)하는 게 필수.
- 함의: §6 `layer_rules` 는 §3 access 의 **형제**(같은 선언, 다른 subset)이지 "또 다른 축"이 아니다 →
  "일반화이지 새 축 아님" 프레이밍과 정합.

### Q7. OD-12 분리(방향 승인 vs 구현 OD) · 사람 최소 결정 목록

**분리한다.** decision-prep §5 가 이미 제안("이 OD 는 방향 승인 + tier3 초안 검토 착수까지; 구현은 별도 OD").
PR #71 + 스키마 반증이 분리를 더 정당화: **방향**(Axis 2 일반화가 바람직 + 거버넌스 허용)은 이제 evidence-backed
지만, **스키마**(edits_at 반증, 행렬은 제안됐으나 E2E 미구현)는 미정. → §아래 두 OD.

---

## 2. tier3-layer-model.md 수정 방향 (§2/§3/§10/§11) — patch 제안

> 적용 대상: PR #68 가 ADD 하는 `docs/design/drafts/customizable-architecture/tier3-layer-model.md`.
> 아래는 **section-anchored 교체 블록**(PR 작성자가 기계적으로 반영 가능). 라인번호 대신 현재 텍스트 앵커 사용.

### §2 — "직교 합성" → "얽힌 mode×layer 행렬" (REFRAME)

- 현재 ASCII("maturity 축 … readiness 가 둘을 합성 … depth 축") 아래에 **정정 박스 추가**:
  > ⚠ 2026-06-21 정정(PR #71 스파이크): 두 축은 **직교가 아니다**. fake-hook seam 이 api-integrated 에서
  > screen 을 특정해 막으므로 maturity×depth 는 **교차 제약된 mode×layer 행렬**이다. 아래 "합성"은
  > *행렬 합성*으로 읽는다(독립 두 축의 곱 아님). 근거: SPIKE-REPORT §2.
- "두 축이 합성된다" 문장의 *orthogonal/직교* 함의 제거.

### §3 — 스키마 교체 (단일 `edits_at` → access 행렬) [핵심]

- 현 `layers:` 예시(layer 당 `fact`/`edits_at`/`gates`)에서 **`edits_at:` 스칼라를 `access: {allow:[],
  forbid:[]}` 로 교체**. §1 본문 "정정 §3 스키마" 블록(layer-major)을 그대로 채택.
- `fact` / `access` / `gates` 를 **3개 분리 필드**로 명시(Q5 표).
- `edits_at` 은 삭제 또는 "손실 alias(재-잠금·GAP 없는 신규 leaf 한정), byte-동치 비보장, v1 draft" 주석으로 격하.
- 불릿 "`edits_at` → allowed_paths 파생" 을 "`access.allow`/`access.forbid` → 해당 모드 allowed/forbidden
  파생; 리터럴 guard 는 정책에 손수 유지" 로 교체.

### §7/§11 — byte-동치 범위 한정 + 영향파일 갱신

- §7: "expo-feature layers = 현 3계층 = 같은 readiness" 주장 옆에 **범위 한정**:
  > byte-동치는 **두 면**에서 검증한다 — (a) **forward-gate 정책**(로더 합성 allowed/forbidden ==
  > 현 `implementation-mode-policy.yaml` role-derived 셀, SPIKE v2 식 0/14), (b) **backstop guarded-surface**
  > (`materializeGuardedSurface` == 현 expo 표면, 무수정). production-ready 의 `src/**` 리터럴은 layers 밖.
- §11 표 갱신:
  - `implementation-mode-policy.yaml` 행을 "(선택) requires 일반 참조 — **role-token allowed/forbidden 셀은
    생성**, 리터럴·requires·order 만 손수" 로.
  - `layout-profile.mjs` 행에 "`access.allow/forbid` → resolved 정책 합성(전치) + 멱등성 비교 대상" 추가.
  - **회귀 기준** 줄을 "forward-gate parity(0/14) + backstop parity + coupon golden + `fake_hook_exists ==
    hook_present` alias" 로 확장.

### §10 — ①을 "강등(해결가능)"으로 확정, 본문 정정 반영

- §10① 끝에 **resolution 확정 문구**:
  > **resolution(2026-06-21, 독립 재현):** blocker ① = "구현 불가" 아님 → **"스키마 교체로 해결되는 설계 결함"**
  > 으로 강등. §3 을 per-(layer×mode) 행렬로 교체하면 byte-동치 회복(v1 10/14 → v2 0/14). 단 §3 단일
  > `edits_at` 은 폐기/격하, §2 서사도 "얽힌 행렬"로 정정(위). 셀링포인트 "한 줄 depth"는 축소(정직).
- §10③("depth 축" 용어): "**readiness/mode 축의 depth 일반화**로 표현 통일" 채택 명시 + README 표/§1 의
  "depth 축" 라벨에 "포지셔닝일 뿐 새 artifact 축 아님(roadmap 닫힌 목록 불변)" 각주.

---

## 3. OD-12 에 남길 사람 결정 목록 (방향/구현 분리)

> 불변식 재확인: **게이트 내리기(allowed_paths 자가확장·gates 제거)·confirmed 승격·hard gate 승격·
> Open Decision resolve 는 사람만.** LLM 은 새 계층 *추가 제안*만. 아래는 사람이 닫을 최소 결정.

### OD-12 (방향) — 지금 resolve

1. **선회 방향: Option A / B / C 택1** (decision-prep §5). A=Axis 2 일반화(추천), B=현행 유지+도입 강행,
   C=하이브리드.
2. **거버넌스 확인:** Axis 2/tier3 = **기존 readiness/mode + gate semantics 의 일반화**이지 **새 산출물 축
   아님**을 명문화 → `roadmap-current.md:30-40`(닫힌 목록)은 불변, `:123-125`("새 산출물 축 추가" 금지)에
   "이 일반화는 그 축 추가가 아님" 예외 각주. ("새 축 금지" 족쇄가 이 선회를 막지 않음을 확정.)
3. **tier3 §3 재설계 인가**(행렬 스키마로) + **신규 계층 게이트는 warning-first 기본**(도입 telemetry 전 hard
   승격 없음).

### OD-12-impl (구현 OD) — A 일 때만 별도로 열고, 지금은 resolve 안 함

4. **source-of-truth & 머지(Q3):** 정책 role-token 셀 소유권을 합성 `layers:` 에 양도(정책=리터럴+requires+
   order 만 손수, 생성+멱등성) **vs** layers 는 추가만(정책 손수 유지, drift 감수).
5. **스키마 오리엔테이션/잔재(Q2):** layer-major `access` 행(canonical, 실증) → mode-major 정책 합성 확정 +
   `edits_at` 손실 alias 잔류 vs 완전 삭제.
6. **게이트 강도 기본값:** 신규 계층은 `access`(경로 허용)만, `gates`(requires) 는 엄격 opt-in + 사람 승격.
7. **byte-동치 범위(Q4):** 회귀는 forward-gate parity(SPIKE) **AND** backstop guarded-surface parity 둘 다;
   layers 는 forward gate 만 구동, 백스톱 무수정.
8. **`layers` 물리 위치:** tier1 **OD-10**(킷 내부 vs 소비 루트)과 같은 파일에서 함께 닫기.
9. **`fact` 종류 로드맵:** v1 `dir_has_files` 만; props/export/test 존재 fact 는 후속.

---

## 4. 구현 착수 전 checklist

- [ ] **OD-12(방향) = A** 사람 resolve + roadmap cross-link + "새 축 아님" 예외 각주.
- [ ] **OD-12-impl** open + 결정 4~9 사람 resolve.
- [ ] tier3 **§3 재작성**: `edits_at` 스칼라 → per-(layer×mode) `access:{allow[],forbid[]}`; `fact`/`access`/
      `gates` 3필드 분리; `edits_at` 격하/삭제.
- [ ] tier3 **§2 reframe**: "직교 합성" → "얽힌 mode×layer 행렬"(fake-hook 교차 제약).
- [ ] tier3 **§7/§11 byte-동치 범위 한정**: forward-gate parity + backstop parity + production `src/**` 리터럴
      별도 + `fake_hook_exists == hook_present` alias.
- [ ] tier3 **§10③ + README**: "depth 축" → "readiness/mode 의 depth 일반화" 통일.
- [ ] **회귀 하니스를 코드보다 먼저 정의**: expo-feature `layers` = 본 문서 §1 행렬 → 합성 정책 ==
      `implementation-mode-policy.yaml` role-derived 셀(0 diff, SPIKE 재현) + `materializeGuardedSurface` ==
      현 expo 표면(0 diff) + coupon-feature golden readiness 불변.
- [ ] **spec.mjs fact 일반화 가드 보존**(L313-318: `srcDir && domain && layout`, `roleToDir` 비공백) →
      `hook_present == fake_hook_exists` byte-동치.
- [ ] **§8 Axis-1 선결**(P1 catalog-gen `ui_primitive`, P3 doctor) 랜딩/예약 — F4: 비표준 ui 경로는 Axis 2
      이전에 도입 자체를 막는다.
- [ ] **불변식 #1 확인**: `layers` 는 데이터만, `readiness.mjs` `min(fact,cap)` 판정 무수정.
- [ ] 정책 role-token 셀이 *생성* 으로 바뀌면 **멱등성 CI 에 새 check target 추가** — 현행은
      `examples/coupon-feature/.../_meta` 만 diff(`frontend-workflow-kit.yml:45,49`)하므로 resolved 정책
      재생성·비교는 별도 추가(같은 패턴, 새 대상; 구현 OD).
- [ ] **사람-전용 불변식 명시 유지**(§3 상단 목록): 게이트 내리기(allowed_paths 자가확장·gates 제거)·confirmed
      승격·hard gate 승격·OD resolve 는 사람만; LLM 은 계층 *추가 제안*만.

---

## 5. PR #68 코멘트용 짧은 요약 (postable)

> **tier3 §3 `edits_at` → mode×layer access matrix 로 정정 필요 (PR #71 evidence 반영).**
>
> PR #71 스파이크를 독립 재현했다(`node frontend-workflow-kit/temp/runs/axis2-a-blocker1-spike/synth-policy.mjs`):
> - **v1 (§3 초안 단일 `edits_at`) = 10/14 불일치** — forbidden 5/5 전멸 + allowed 비누적/비연속 미표현.
> - **v2 (per-(layer×mode) `allow[]`/`forbid[]` 행렬) = 0/14 byte-동치.**
>   (0/14 는 부분적으로 *정의적* — 비자명한 근거는 v1 실패 + "per-mode 행렬이 정책 재현 최소 스키마"라는 하한.)
>
> 따라서 §10① 은 "구현 불가"가 아니라 **"스키마 교체로 해결되는 설계 결함"으로 강등**되지만, **§3 의 단일
> `edits_at` 을 canonical 로 유지할 수 없다.** 정정 제안:
> 1. §3: `edits_at` 스칼라 → `access:{allow[],forbid[]}` 행렬(`fact`/`access`/`gates` 3필드 분리). `edits_at`
>    은 손실 alias 로 격하/삭제.
> 2. §2: "두 직교축의 곱" → "fake-hook 으로 얽힌 mode×layer 행렬"로 reframe.
> 3. §7/§11: byte-동치를 **forward-gate parity + backstop(`materializeGuardedSurface`) parity** 두 면으로
>    한정(production `src/**` 리터럴은 layers 밖, `layout-profile.mjs:211-215` 의 재-잠금 비채택 규칙 무수정).
> 4. source-of-truth: `layers` authoritative → 로더가 정책 role-token 셀 **합성**(리터럴·requires·order 만 손수).
>    drift 는 resolved-policy 재생성·비교하는 **새 check target 추가 후** 차단(현행 멱등성 CI 는 coupon `_meta`
>    만 diff — 같은 패턴, 새 대상; 구현 OD). §5/§11 충돌은 "role-token 셀 vs 리터럴/requires" 경계 분리로 둘 다 성립.
> 5. OD-12 를 **방향 승인(now) / 구현 OD(별도)** 로 분리 — 스키마·source-of-truth·게이트 강도는 구현 OD 로.
>
> 표현: 이건 **새 산출물 축이 아니라 readiness/mode 정책의 access 표현력 일반화**다(roadmap 닫힌 목록 불변).
> 상세: `temp/proposals/tier3-access-matrix-revision.md`.

---

## 6. evidence / 재현

```
# 정책 재생성 diff (v1 10/14 ≠ 0, v2 0/14 = byte-동치) — 독립 재현 완료 2026-06-21
node frontend-workflow-kit/temp/runs/axis2-a-blocker1-spike/synth-policy.mjs
```

- TRUTH(재현): `route-skeleton.forbid=[api_client]` … `api-integrated-ui.forbid=[screen]` … (본 문서 §1 표와 일치).
- SPIKE-REPORT.md / EXPERIMENT-REPORT.md (PR #71, main 동봉) · `implementation-mode-policy.yaml` ·
  `layout-profile.mjs:211-215`(재-잠금 비채택) · `spec.mjs:308-318`(fake_hook_exists) · `expo-feature.yaml`(7 role).

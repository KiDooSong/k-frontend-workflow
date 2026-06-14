# Ambiguity Triage — Unknown → Open Decision triage 가이드

Work Packet 의 `## Ambiguity Review Required` 섹션이 **링크로 참조하는 판단 가이드**다. 템플릿에는 **최소 표(`Safe To Proceed?`)만** 두고(과적재 방지 — Work Packet=얇은 봉투 불변식), 결정트리·신호표·Blocking Mode 매핑·모드별 Safe-To-Proceed·상세 4블록 스키마의 **전체**는 이 문서에서만 유지한다.

> ⚠ **적용 범위 주의 — 코드화 금지.** 이 문서는 **사람이 읽고 LLM 이 대화로 따르는 판단 가이드**다. 어떤 부분도 스크립트/게이트로 코드화하지 않는다(§7). 유일한 코드 게이트는 변함없이 `readiness.mjs`(Open Decision cap + 정책 fact) + `validate.mjs`(구조)뿐이다.

- **모드 사다리 정본**: [`frontend-workflow-kit/policies/implementation-mode-policy.yaml`](../../policies/implementation-mode-policy.yaml) (`order:`).
- **authoring/reconcile 계약 정본**: `global/llm-rules.md` · [`input-reconciliation.md`](../../input-reconciliation.md) (LLM 이 `open` 행 추가 / `resolved → open` 재오픈을 할 수 있는 단계).
- **설계 근거(연구 트랙)**: `temp/execution-loop-research/` (reports/01 ambiguity-gate · SYNTHESIS §9.1/§9.2/§9.6) — 추적용.

---

## 1. 이 문서가 무엇이고 무엇이 아닌가

- **무엇인가**: 구현 전에 발견한 애매함(Unknown/모호함)을 어떻게 분류(triage)할지에 대한 판단 가이드. 분류 결과는 항상 **후보 제안**이다 — `Unknown Candidate`(U-cand) 또는 `Open Decision Candidate`(D-cand)로 *제안만* 하고, `Safe To Proceed?` 표에 그 영향을 표면화한다.
- **무엇이 아닌가**:
  - **게이트가 아니다.** 이 문서의 어떤 분기도 exit 1 / 머지 차단 / required check 로 배선하지 않는다(§7).
  - **결정을 닫지 않는다.** 승격(promote)·해소(resolve)·종료(close)·`candidate→confirmed` 는 **전부 사람** 몫이다(불변식 4).
  - **새 산출물 축이 아니다.** 분류 결과가 사는 곳은 기존 Work Packet 의 `Ambiguity Review Required` 섹션(후보 표)과 ScreenSpec(사람이 확정한 뒤)뿐이다.
- **링크 관계**: Work Packet 템플릿 → 이 문서(전체 rubric). 템플릿은 `Safe To Proceed?` **최소 표 + 이 문서로의 링크 한 줄**만 갖는다. 상세 4블록(New Unknowns / New Open Decision Candidates / Possibly Blocking / Safe To Proceed?) 스키마는 아래 [부록 A](#부록-a--상세-4블록-스키마-템플릿엔-최소-표만).

---

## 2. 목적 / 원칙

**목적**: 구현 전에 애매함을 표면화한다. 시스템의 첫 질문은 "구현 가능?"이 아니라 **"애매한 거 놓친 거 없나?"** 이다.

**원칙 (전부 동시 성립):**

1. **후보만 제안 — 단, 이 가이드를 쓰는 단계 한정(`workflow:packet` / `workflow:run` / review).** 이 단계의 LLM 은 U-cand / D-cand 를 *제안*만 한다 — 분류 결과를 Work Packet 의 `Ambiguity Review Required` / Review Evidence 에 후보로 올리되, ScreenSpec 의 `## Unknowns` / `## Open Decisions` 에 **자동 반영하지 않는다**.
   - **예외 — authoring / reconcile 단계는 기존 규칙대로.** ScreenSpec **authoring / reconcile** 단계의 LLM 은 기존 계약대로 `## Unknowns` / `## Open Decisions` 에 **`open` 행을 추가**하거나, 새 입력이 기존 `resolved` 결정과 충돌하면 `resolved → open` 으로 **재오픈**할 수 있다(`global/llm-rules.md` · `input-reconciliation.md` — 게이트를 *올리는* 방향만).
   - **항상 사람만**: resolve / close / `candidate→confirmed` 승격 / 재-resolve(불변식 4). 즉 "직접 쓰지 않는다"는 이 가이드(packet/run/review) 단계 한정이며, "LLM 이 ScreenSpec 에 아무것도 못 쓴다"는 뜻이 아니다.
2. **calibrate — 무차별 질문 금지.** 모든 불확실성을 D-cand 로 올리지 않는다. **강(strong) 신호**가 켜질 때만 Open Decision 후보로 제안하고, 약한 불확실성은 Unknown 으로 남긴다(clarification fatigue·checklist-worship 회피).
3. **전부 warning-only.** 이 문서의 분류·`Safe To Proceed?` 는 readiness/validate 같은 **공식 게이트로 승격하지 않는다**. exit 1 금지.
4. **유일 게이트 = readiness(Open Decision cap) + validate(구조).** 실제로 도달을 막는 권한은 사람이 ScreenSpec 에 확정한 Open Decision 과 정책 fact 뿐이다.
5. **green ≠ done.** `Ambiguity Review` 가 비었다는 것은 "이번 패스가 새 애매함을 못 찾음"일 뿐 "설계가 충분함"이 아니다. 의미/제품 리뷰(Codex/사람)는 별도다.
6. **형식주의 회피.** 빈 블록은 "없음 — \<사유\>" 한 줄로 명시한다. 억지 행은 신호를 희석한다.

**warning-first 와 auto-stop 은 다른 층위다(충돌 아님):**

| 층위 | 정의 | 이 문서에서의 모습 |
|---|---|---|
| warning-first (게이트 *승격* 층위) | Ambiguity·`Safe To Proceed?` 를 공식 게이트로 안 올림. exit 1 금지. | 분류·표는 텍스트 증거일 뿐. 막는 건 사람이 승격한 Open Decision. |
| auto-stop (실행 *전진* 층위) | runner 가 구현으로 자동 전진하지 않고 packet/report 에서 멈춤. | `Safe To Proceed?=no` 가 곧 `HALT_AMBIGUITY`(runner 가 스스로 안 나아감). |

→ `HALT_AMBIGUITY` 는 "게이트가 막은 것"이 아니라 "runner 가 스스로 안 나아간 것"이다.

---

## 3. 결정트리 — Unknown / 애매함 발견 시

발견한 애매함 하나를 아래 트리에 통과시킨다. 출구는 셋: **(a) Open Decision Candidate(D-cand) 로 승격 제안**, **(b) 그냥 Unknown(U-cand) 유지**, **(c) Possibly Blocking 으로 표시(`Safe To Proceed?`=no 후보, 사람 판단 요청)**. 어느 출구든 닫는 건 사람이다.

```txt
[애매함/Unknown 발견]
        │
        ▼
Q1. 답이 "사실 1개"로 닫히나(조사하면 끝), 아니면 "선택"이 필요한가(여러 합리적 옵션)?
    ├─ 선택 필요 ──────────────────────────────────────────► (a) Open Decision Candidate(D-cand)  → Q4(Blocking Mode 제안)
    └─ 사실 1개 ──────────────────────────────────────────► Q2
        │
        ▼
    Q2. 그 사실을 모른 채 만든 산출물이, 사실 판명 시 "형태"가 바뀌나?
        ├─ 안 바뀜(값만 채워넣음) ─────────────────────────► (b) Unknown 유지(U-cand)   → Q3(가드)
        └─ 바뀜(구조/상태집합/계약이 갈림) ────────────────► 사실상 선택 내포 ► (a) Open Decision Candidate(D-cand) → Q4
            예) "API 가 pagination 을 주나?" 는 사실 질문처럼 보이나,
                답에 따라 무한스크롤 vs 페이지 UI 로 산출물 형태가 갈린다 → D-cand.
        │
        ▼
    Q3. (가드) Unknown 으로 둘 때, 틀렸을 경우 되돌리기 비용이 큰가?
        ├─ 작음(싸게 되돌림) ──────────────────────────────► (b) Unknown 유지 확정(U-cand)
        └─ 큼(재작업/마이그레이션) ────────────────────────► (c) Possibly Blocking
                                                             (사람 판단 요청 — 판단 전엔 보수적으로 해당 모드를 막음)

Q4. Blocking Mode 제안 = 이 결정이 없으면 못 넘는 "첫" 모드 (사다리에서 가장 낮은 곳에 둔다)
    └─ §5 Blocking Mode 매핑표로 모드명을 "제안값"으로 채운다. 확정·승격은 사람.
```

**각 분기의 닫힘 규칙(중요):**

- **(a) D-cand**: `New Open Decision Candidates` 표에 후보로 적는다. Blocking Mode 는 §5 표로 **제안값**만. 승격(= 사람이 ScreenSpec `## Open Decisions` 에 open 행 확정 → `npm run workflow:readiness` 재실행)은 사람.
- **(b) U-cand**: `New Unknowns` 표에 후보로 적고, "ScreenSpec `## Unknowns` 에 open 행 추가"를 *제안*만 한다. Unknown 은 기본 게이트가 아니다(원칙 5) — 막아야 할 애매함이면 (a) 또는 (c)로 간다.
- **(c) Possibly Blocking**: `Possibly Blocking Ambiguities` 표에 켜진 신호와 함께 "사람이 판단해 달라"로 남긴다. 판단 전까지는 fail-safe — 해당 모드를 `Safe To Proceed?`=no 쪽으로 보수적으로 반영한다.

> 경계선 사례(Q2 의 핵심): "사실 질문처럼 보이지만 답이 산출물 형태를 가르는 것"은 **사실상 결정**이다. pagination(cursor/offset/none), 정렬 기본값이 목록 구조를 바꾸는 경우, 빈/에러 상태의 존재 여부 등이 대표적. 이들은 Q1 에서 "사실"로 빠져도 Q2 에서 D-cand 로 되돌아온다.

---

## 4. 신호표 — 신호 → 강도 → 권고 route + 제안 Blocking Mode

각 애매함에 대해 아래 신호를 평가한다.

| 신호 | Unknown 쪽 (약 / weak) | Open Decision 쪽 (강 / strong) |
|---|---|---|
| 답의 성격 | 단일·발견 가능한 사실 | 여러 합리적 선택지 |
| 산출물 영향 | 값만 채움 | 구조 / 상태집합 / 계약이 바뀜 |
| 가역성 | 싸게 되돌림 | 되돌리기 비쌈(재작업·마이그레이션) |
| owner | 조회/문서로 충분 | 권한 있는 결정자(PM/디자인/BE) 필요 |
| 성격 | 구현 디테일 | 제품 / UX / 정책 방향 |
| audit 필요성 | 낮음 | 높음(나중에 "왜 이렇게 했나?" 추적됨) |

> ⚠ **calibration 기본값 — 실측으로 보정.** **하나라도 "강"이면 Open Decision 후보(D-cand)로 제안**하고, 전부 "약"이면 Unknown(U-cand)으로 남긴다. 단 **"강 신호 1개 이상 → D-cand"는 초기 *보수* 기본값**이다(over-asking 위험을 감수하고 안전 쪽으로). **실제 임계(몇 개·어떤 조합에서 승격할지)는 이 문서에서 닫지 않는다 — coupon-feature A/B 같은 별도 실측 트랙으로 보정한다**(§8-1). "강 신호의 blocking" 은 warning 텍스트로 표면화하되 **실제 cap 은 기존 readiness 가 건다**(신설 게이트 아님).

**신호 강도 → 권고 route (review/triage 산출물의 `route` 필드와 동일 어휘):**

| 켜진 신호 패턴 | 권고 route | 의미 | 제안 분류 |
|---|---|---|---|
| 전부 약 (약 신호만) | `recommended-fix` | 사실 조회/문서화로 채우면 됨. 사람이 채우거나, 확정 후 LLM 이 값만 채움. | (b) Unknown 유지 (U-cand) |
| "성격=제품/UX/정책 방향" 또는 "owner=결정자 필요" 가 강 | `human-only-decision` | 권한 있는 사람의 선택이 필요. LLM 은 옵션 초안만 제시. | (a) Open Decision Candidate (D-cand) |
| "가역성=비쌈" + "산출물 영향=형태 바뀜" 이 강 (특히 generated/계약 표면) | `do-not-auto-fix` | 자동 수정/추측 시 손해가 큼. 추측·발명 금지, 멈춰서 사람에게. | (a) D-cand, 또는 경계면 (c) Possibly Blocking |

> route 어휘 주의: `recommended-fix | human-only-decision | do-not-auto-fix` 는 review-artifact advisory 스키마의 `route` 와 같은 값이다. 새 이름을 만들지 않는다. `route` 는 "어떻게 다룰지 권고"일 뿐 — 어떤 값도 자동 차단을 의미하지 않는다.

**강 신호 → 제안 Blocking Mode 의 기본 결합(상세는 §5):** "산출물 영향=형태 바뀜" 이 강일 때, *무엇의* 형태가 바뀌는지로 §5 표를 골라 Blocking Mode 제안값을 채운다.

---

## 5. Blocking Mode 매핑 — 어떤 애매함이 어떤 모드를 cap(도달 차단) 제안하는가

사다리(정본 `implementation-mode-policy.yaml` `order:`, 7단): `docs-only` → `route-skeleton` → `screen-skeleton` → `rough-fixture-ui` → `final-fixture-ui` → `api-integrated-ui` → `production-ready`.

Blocking Mode = "이 결정이 없으면 **도달을 막는** 모드". 그 결정을 cap 하면, readiness 는 `min(fact_mode, decision_cap)` 으로 그 **바로 아래**까지만 연다. LLM 은 이 매핑으로 **후보값을 제안**하고, 사람이 ScreenSpec 에 확정한다.

| 결정/애매함이 바꾸는 것 | 제안 Blocking Mode | 비고 |
|---|---|---|
| 문서 수준만 | (cap 없음) | `docs-only` 통과. 애매함을 문서로 표면화하는 게 목적. |
| navigation-map 자체가 미정/충돌 (route 엣지 표면) | `route-skeleton` | nav-map 미해결/충돌이면 route-skeleton 에서 멈춤(§6 `route-skeleton` 행과 정합). ⚠ MVP-C 종속 — Session C route-tree/nav-graph 가 이 표면을 바꿀 수 있음. |
| 어떤 화면이 존재하는가 · 화면 간 이동(nav) 엣지 | `screen-skeleton` | ⚠ MVP-C 종속 — Session C nav-graph 가 nav 엣지 표면을 바꿀 수 있음. nav-graph 확정 후 정렬. |
| 레이아웃 / 상태 표현 / 거친 UI 형태 / 상태 집합 | `rough-fixture-ui` | fixture UI 형태가 갈리는 결정. |
| 픽셀 확정 디자인 · confirmed copy · 완전한 state matrix | `final-fixture-ui` | 확정 디자인/문구 미정. |
| API 엔드포인트 / 응답 스키마 / 에러 / pagination / auth | `api-integrated-ui` | 계약 표면. 추측·발명 금지. |
| (배포/CI 게이트만) | `production-ready` | 통상 ambiguity triage 범위 밖(CI fact 가 결정). 참고용. |

**유형별 cap 보유 규칙 (work-packet 템플릿 Blocking Items 주석과 정합):**

> **Blocking Mode** = 이 항목이 cap 하는(=도달을 막는) 모드. decision·missing-fact 는 cap 모드를 갖지만, unknown 은 모드를 직접 cap 하지 않으면 `—` 로 둔다 (그래도 close 는 사람-전용).

- **decision (D-cand)** → cap 모드 보유. §5 표로 제안값을 채운다.
- **missing-fact** → cap 모드 보유(예: `component_catalog_generated == false` 면 `rough-fixture-ui` cap). 단 이 문서의 주 대상은 사람의 선택이 필요한 ambiguity 이고, missing-fact 는 readiness 가 fact 로 직접 본다 — 여기서는 "어떤 fact 가 빠졌는지"만 후보로 적고 cap 은 readiness 출력에서 복사한다.
- **unknown (U-cand)** → 모드를 직접 cap 하지 않으면 `—`. (cap 하려면 (a)/(c)로 승격해야 한다 — 원칙 5: Unknown 은 기본 게이트 아님.)

> ⚠ MVP-C 종속 — Session C generated-file guard 확정 후 정렬: "어떤 파일이 generated 인가"(예: `_meta/*.yaml`, `component-catalog.md`)의 판정은 Session C 가 확정 중이다. generated 표면을 건드리는 결정(예: catalog 재생성 트리거 변경)이 어느 모드를 cap 하는지는 guard 확정 후 정렬한다. 지금은 "generated 표면 영향 있음"만 표시하고 모드값은 보류한다. 참고: `frontend-workflow-kit/temp/proposals/generated-file-guard-followup.md`.

---

## 6. 모드별 Safe-To-Proceed — auto-stop 판단 (readiness 재계산 아님)

`Safe To Proceed?` 는 Work Packet 의 `Ambiguity Review Required` 하위 표다. 각 모드에 대해 **"지금 코딩해도 미해결 애매함이 이 모드 산출물을 위태롭게 하나?"** 만 본다. readiness 를 다시 유도하지 않는다.

**사용법(3줄):**
- **아래에서 위로** 훑어 "no"가 처음 나오는 모드 **직전**에서 멈춘다(= `HALT_AMBIGUITY`).
- **천장 불변**: `Safe? = yes` 라도 `requested_mode > readiness_mode` 면 코딩하지 않는다. 천장은 항상 `readiness_mode`(hard ceiling — readiness 가 단일 출처).
- **보수적 단방향**: `Safe To Proceed?` 의 "no"는 `readiness_mode` 아래에서 더 일찍 멈추게만 한다 — 게이트를 *내리는* 신호이지 *올리는* 신호가 아니다. ("no" → 해당 후보를 사람에게 올리고, 사람이 ScreenSpec 반영 → `workflow:readiness` 재실행 → packet 재발급.)

| 모드 | 기본값 | "no" 트리거 (이게 미해결이면 멈춤) | 진행 가능/주의 신호 · 근거 문구 템플릿 |
|---|---|---|---|
| `docs-only` | 항상 **yes** | (없음 — 애매함을 문서로 표면화하는 게 이 모드의 목적) | 진행 가능: 항상. "문서만 — 모든 Unknown/Decision 을 여기서 적으면 됨." |
| `route-skeleton` | **yes** | navigation-map 자체가 미정/충돌 | 주의: nav-map 충돌 시에만 no. "라우트 엔트리뿐 — 화면 내부 결정과 무관. 단 nav-map 충돌 시 no." ⚠ MVP-C 종속 — Session C nav-graph 가 nav-map 표면을 바꿀 수 있음. |
| `screen-skeleton` | 조건부 | "이 화면이 존재하는가 / 어디로 이동하는가"가 미승격 D-cand | 주의: 화면 존재·이동이 결정에 달렸으면 no(D-cand-XXX). "화면 shell — 화면 존재·이동이 결정에 묶였으면 no." |
| `rough-fixture-ui` | 조건부 | 상태 집합 · 핵심 UX 분기 · fixture 형태를 바꾸는 D-cand 미승격 | 주의: 상태/분기 형태를 바꾸는 미승격 결정(D-cand-XXX) 있으면 no. "거친 fixture UI — 형태를 가르는 미승격 결정 있으면 no." |
| `final-fixture-ui` | 조건부 | confirmed 문구 · 확정 디자인 · 완전한 state matrix 가 결정/Unknown 에 묶임 | 주의: copy/design/state 미확정이면 no. "확정 UI — 미확정이면 no(상위 모드는 readiness 가 이미 cap)." |
| `api-integrated-ui` | 조건부 | API 계약 · 응답 스키마 · 에러 · pagination · auth 미결정 | 주의: 응답/에러/pagination 결정 전이면 no. "API 연동 — 결정 전이면 no. 추측·발명 금지." |
| `production-ready` | 조건부 | (통상 ambiguity triage 범위 밖 — CI fact 가 결정) | 참고: CI 게이트는 readiness fact 로 본다. ambiguity 표면화 대상 아님. |

> 표 작성 시 평가 생략 규칙: `readiness_mode` 보다 위의 모드는 readiness 가 이미 cap 하므로 "—"(평가 생략)로 둔다. `Safe To Proceed?` 는 `readiness_mode` 까지만 보수적으로 평가한다.

**예시(채워진 표):**

| 모드 | Safe? | 근거 |
|---|---|---|
| `docs-only` | yes | 문서만 — 모든 애매함은 여기서 Unknown/Decision 으로 표면화하면 됨 |
| `route-skeleton` | yes | 라우트 엔트리뿐 — 화면 내부 결정과 무관(nav-map 충돌 시에만 no) |
| `screen-skeleton` | yes | 화면 shell — 화면 존재·이동이 결정에 안 묶임 |
| `rough-fixture-ui` | **no** | D-cand-001(만료 쿠폰 노출 방식) 미승격 — fixture UI 형태가 갈리므로 여기서 멈춤 |
| `final-fixture-ui` | — | (상위 모드 — `readiness_mode` 가 이미 cap. 평가 생략) |
| `api-integrated-ui` | — | (상위 모드 — `readiness_mode` 가 이미 cap. 평가 생략) |

---

## 7. "절대 코드화 금지" 재확인

이 rubric 은 **사람이 읽고 LLM 이 대화로 따르는** 가이드다. runner/스크립트가 아래를 하면 불변식 위반이다:

- `Ambiguity Review` · `Safe To Proceed?` 를 파싱해 **exit 1** (warning-only 유지 — §2 원칙 3).
- 강 신호 분류를 **머지 차단 / required-approval(merge check)** 에 배선 (사내 GitLab: MR approval rules·merge checks·protected branches 에 연결 금지).
- **blocking Unknown 을 게이트로** 취급 (막는 건 승격된 Open Decision 만 — 원칙 5).
- 이 문서의 결정트리/신호표를 **자동 분류 스크립트**로 굳혀 readiness 를 덮어쓰기/우회.
- LLM 이 `D-cand` / `U-cand` 를 ScreenSpec 의 `## Open Decisions` / `## Unknowns` 에 **직접 확정/close** (승격·resolve·close 전부 사람 — 불변식 4). *(authoring/reconcile 단계의 `open` 행 추가·`resolved → open` 재오픈은 별개로 허용 — §2 원칙 1.)*

→ 실제 게이트는 변함없이 **readiness(Open Decision cap) + validate(구조)** 뿐이다. 이 문서는 그 게이트에 *입력될 후보*를 사람에게 제안하는 대화 가이드일 뿐이다.

---

## 8. 남은 사람-결정 (닫지 말 것 — "결정 필요"로)

이 문서로 닫히지 않는다. 사람이 정한다:

1. **calibration 임계의 실전값**: "강 신호"를 몇 개·어떤 조합에서 D-cand 로 승격할지. over-asking 회피 튜닝은 경험적 — 초기 기본값은 "강 신호 1개 이상"(§4)이나, **실측 보정은 별도 트랙(coupon-feature A/B 측정)**. **결정 필요.**
2. **후보 ID 수명주기**: `U-cand-XXX`/`D-cand-XXX` 가 사람 승격 시 ScreenSpec 의 `U-00x`/`D-00x` 로 매핑되는 규약. LLM 이 닫지 않으면서 추적성을 유지하는 최소 규약(reconcile-input register 와 접점). **결정 필요.**
3. **fail-safe 기본값 확정**: `Possibly Blocking`(c)을 기본 "막음"으로 둘지 repo 차원 합의. MVP 권고는 fail-safe(§3)이나 마찰↑ — **결정 필요.**
4. **이 문서의 최종 형식**: `docs/workflows/ambiguity-triage.md` 로 확정(현재 위치)할지, 아니면 proposal 로 둘지 — 사람 재확인 대상. **결정 필요.**

> ⚠ MVP-C 종속 — Session C generated-file guard 확정 후 정렬: §5 의 generated 표면 cap 판정, "어떤 파일이 generated 인가". 참고: `frontend-workflow-kit/temp/proposals/generated-file-guard-followup.md`.

---

## 부록 A — 상세 4블록 스키마 (템플릿엔 최소 표만)

이 문서는 전체 4블록을 갖고, **Work Packet 템플릿에는 `Safe To Proceed?` 최소 표 + 이 문서 링크만** 넣는다(과적재 방지). 아래는 packet 을 채울 때(=`workflow:packet`) 사용하는 상세 골격이다. 어느 블록이든 **후보 제안**이며 닫는 건 사람이다.

```md
## Ambiguity Review Required
<!--
  workflow:packet 의 첫 산출물 — 코딩 전에 먼저 채운다.
  좋은 첫 질문: "애매한 거 놓친 거 없나?" (나쁜 첫 질문: "구현 가능?")
  불변식: LLM 은 후보를 "제안"만. 승격/resolve/close/confirmed 는 사람.
  분류 기준(결정트리·신호표·Blocking Mode 매핑·모드별 Safe-To-Proceed) 전체는 이 문서(§3~§6) 참조.
  빈 블록은 "없음 — <사유>" 한 줄로 명시(억지로 채우지 않는다).
-->

### New Unknowns  (사실 확인 후보 — 게이트 아님)
| 후보 ID | Question | 왜 Unknown 인가 | 제안 owner | ScreenSpec 반영 제안 |
|---|---|---|---|---|

### New Open Decision Candidates  (결정 후보 — 사람이 승격하면 readiness cap)
| 후보 ID | Decision Needed | Options(초안) | 제안 Blocking Mode | 제안 owner | 승격 근거(rubric 신호) |
|---|---|---|---|---|---|

### Possibly Blocking Ambiguities  (승격 경계선 — 사람 판단 요청)
| 항목 | 켜진 신호 | Unknown 으로 충분? | Decision 으로 올려야? | 막힐 수 있는 모드 |
|---|---|---|---|---|

### Safe To Proceed?  (모드별 auto-stop 판단 — readiness 재계산 아님)
<!-- 아래에서 위로 훑어 'no' 가 처음 나오는 모드 직전에서 멈춘다(HALT_AMBIGUITY). 천장은 readiness_mode. -->
| 모드 | Safe? | 근거 |
|---|---|---|
```

> 위 블록은 **표 골격**이다. 결정트리·신호표·Blocking Mode 매핑·모드별 트리거 설명은 템플릿에 **넣지 않는다** — 전부 이 문서(§3~§6)에서만 유지한다. Work Packet 템플릿이 본문에 두는 것은 `Safe To Proceed?` 한 표 + 이 문서 링크뿐이다.

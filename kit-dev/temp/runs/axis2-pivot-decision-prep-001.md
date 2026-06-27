# OD-12 Decision Prep — 3계층 고정 → Axis 2(layer-depth) 선회 + 잔여 재우선순위 + warning-first 목적지화

> Status: **DECISION PREP (open)** · 2026-06-21 · decision_id: **OD-12 (제안)** · owner: **maintainer(사람)**
> 성격: roadmap-direction / gate-semantics 결정 (OD-11 선례와 동형 — run-report 로 prep, **resolve 는 사람만**).
> 이 문서는 결정을 **준비**한다. 게이트를 풀거나 정본(roadmap/policy)을 바꾸지 않는다 — resolve 후 사람이 roadmap 에 cross-link.
> 근거 보고서(세션 산출, 이 브랜치에 vendored): [../reports/kit-multilayer-adoption-assessment-20260621.md](../reports/kit-multilayer-adoption-assessment-20260621.md) (멀티에이전트 조사 + 코드 실측).
> 짝 설계 초안: [tier3-layer-model.md](../../docs/design/drafts/customizable-architecture/tier3-layer-model.md) (2026-06-21 **access matrix 로 정정**: canonical = mode×layer `access` 행렬, `edits_at` 격하) · 정정 제안서 [tier3-access-matrix-revision.md](../proposals/tier3-access-matrix-revision.md).
> 실측 검증(별도 PR #71 로 main 동봉): [다층 도입 dry-run](multilayer-adoption-dryrun/EXPERIMENT-REPORT.md) — 킷이 현재 Axis 2 를 게이트 못 함을 Clean Arch 6계층으로 실측 · [A안 blocker① 스파이크](axis2-a-blocker1-spike/SPIKE-REPORT.md) — blocker ① 실재하나 per-mode 행렬로 해결가능.

---

## 1. 결정 필요 (Decision Needed)

킷을 **`screen → fake hook(AsyncState) → api` 3계층 고정**에서 **데이터주도 N계층 모델(Axis 2)**로 선회할 것인가?
그리고 그 선회를 위해 잔여 Top5 를 **재우선순위**(대부분 보류 + 도입 선결 버그만 처리)할 것인가?

이 결정이 푸는 족쇄: roadmap "지금 하지 말 것 — 새 산출물 축 추가 금지". 아래 §4 에서 *Axis 2 는 새 축이 아님*을 밝혀,
족쇄가 사실 이 선회를 금지하지 않음을 정리한다.

## 2. 배경 — 왜 지금 (adoption deadlock)

세션 조사(코드 실측)가 확인한 핵심:

```txt
3계층(screen/hook/api)이 실프로젝트 구조와 불일치  →  도입(adoption) 불가
        →  도입이 없으니 warning-first 표면의 telemetry 가 안 쌓임
        →  "telemetry 후 승격"이라던 항목들이 영구 보류 (데드락)
```

- 킷의 모든 라이브 게이트가 **3계층을 코드 수준에서 못박음**: 모드 사다리·게이트 fact(`fake_hook_exists`)·layer-boundaries 린트가 전부 screen/hook/api 만 안다.
- `fake-hook/AsyncState seam` 이 "화면과 HTTP 사이의 모든 것"을 단일 `hook` role 하나로 접어, repository/use-case/service/view-model 이 들어갈 **게이트 자리 자체를 제거**한다.
- 결론: **병목은 "승격"이 아니라 "도입"이다.** 도입을 막는 건 3계층 모델의 경직성이다.

### 2.1 아키텍처 시나리오 적대 검증 (보고서 요약)

| 시나리오 (Expo RN) | 판정 | 핵심 |
|---|---|---|
| Clean Architecture (4계층) | 🔴 unsupported | 4계층 모두 role/게이트/fact 없음 |
| MVVM | 🟡 partial | VM(핵심)이 hook role 에 욱여넣어짐 |
| Feature-Sliced Design | 🟡 partial | widgets/entities 자리 없음 + 하드코딩 3종 차단 |
| Repository + Service | 🟡 partial | hook↔api 중간 계층 자리 없음 |

근거(코드): `policies/implementation-mode-policy.yaml:21-101` · `scripts/lib/spec.mjs:308-318`(fake_hook_exists) ·
`templates/meta/lint-policy.template.yaml:15-26`(layer 3종) · `presets/expo-feature.yaml:7-14`(role 7개).

## 3. warning-first 재정의 (이 결정의 일부)

현행 roadmap 은 warning-first 표면을 *"hard gating 후속"(임시 대기상태)*로 기술한다. 본 결정은 이를 뒤집는다:

```txt
[현행]  warning-first = 하드 승격을 기다리는 임시 상태 ("아직 안 끝남")
[제안]  warning-first = 실제 도입 telemetry 가 쌓이기 전까지의 의도된 목적지 ("설계 결정")
```

- 근거: 경고만으로도 LLM/사람이 진행 중 판단할 수 있고, **필요성이 입증되면 그때 승격**하면 된다. 킷 철학("스크립트는 가드레일이지 리뷰어가 아니다", README)과 정합.
- 효과: 잔여 Top5 의 "승격 압박" 항목들(lint·Interaction Matrix·Tier2 codegen/route)이 **보류 = 미룸**이 아니라 **보류 = 정당한 설계 상태**가 된다. 데드락의 "승격" 축이 해소된다.

## 4. 거버넌스 정합성 — "새 축 금지"와의 관계

> roadmap "지금 하지 말 것: 새 산출물 축 추가" 의 *축*은 **artifact axes**(저작문서 / 생성상태 / 결정 / 입력정합 / 조사검증)를 가리킨다(roadmap "산출물 축" 절). 그 목록은 "닫혔다".

- **Axis 2(layer-depth)는 새 artifact 축이 아니다.** 새 문서 종류·레지스터를 만들지 않는다. 기존 **readiness/mode 축을 데이터주도로 일반화**할 뿐이다 — tier1(layout profile)이 경로를 데이터화한 것과 같은 계열의 *심화*다.
- 따라서 "새 축 금지" 족쇄는 이 선회를 **금지하지 않는다**. 실제로 잡아야 할 것은 두 가지뿐:
  1. **게이트 의미 변경의 거버넌스** — 새 fact·mode↔role 결합은 게이트 의미를 바꾸므로 **사람 결정 필요**(= 이 OD).
  2. **도입 선결 버그** — fail-open/회귀 구멍(§6 완료분).
- 보존 불변식: 판정 로직 한 곳(readiness) · 생성기 멱등 · **게이트 푸는 전이는 사람만** · 새 계층 검사는 warning-first 기본.

## 5. 옵션 (Options)

| ID | 옵션 | 내용 | 트레이드오프 |
|---|---|---|---|
| **A** | **Axis 2 선회 (추천)** | `project-layout.yaml` 에 순서 있는 `layers:` 선언(role glob + 완성도 fact + mode×layer `access` 행렬, `fact`/`access`/`gates` 3필드) → readiness/spec/lint 일반화. expo-feature 프리셋 = 현 3계층 = byte-동치 회귀. | 게이트 의미 변경(코드+거버넌스). 단 tier1/tier2 와 동일 메커니즘(데이터화)이라 재발명 아님. |
| B | 현행 유지 + 도입 강행 | 3계층 고정 유지, 도입 프로젝트가 screen→hook→api 로 평탄화하도록 권장. | 실프로젝트 다수가 다층이라 도입률↓ → 데드락 지속. |
| C | 하이브리드(문서 가이드) | 3계층 코어 유지 + production-ready 자유영역 + "다층은 게이트 밖" 문서 가이드. | 다층이 단계적으로 게이트되지 않음(킷 핵심 가치 일부 포기). |

**추천: A.** 단, A 는 큰 설계라 **이 OD 는 "방향 승인 + tier3 설계 초안 검토 착수"까지만** 결정하고, 실제 구현 착수는 tier3 초안 합의 후 **별도 구현 OD**로 연다(순차 원칙).

## 6. 재우선순위 (잔여 Top5 + α)

| 항목 | 이전 분류 | 본 결정 후 |
|---|---|---|
| orphan 테스트 3종 CI 등록 | (신규 발견) | ✅ **완료** (별도 머지 — main `8919a6d`, PR #67) |
| validate cold-start 경고 (vacuous-green fail-open) | (신규 발견) | ✅ **완료** (별도 머지 — main, PR #67, warning-first) |
| catalog-gen `ui_primitive` 바인딩 | Top5 #3 | 🔄 **Axis 2 선결**로 흡수 (tier3 §8) |
| doctor/preflict 오설정 탐지 | Top5 #4 | 🔄 Axis 2 선결 후보 (warning) |
| adapt 온보딩 스킬 | Top5 #1 | ⏸ **Axis 2 이후로 보류** (바뀔 모델 위 온보딩 자동화는 헛수고) |
| Tier2 어댑터 런타임 배선 | Top5 #2 | ⏸ 보류 (read-only/ warning-first 로 충분) |
| 모든 warning→hard 승격(lint·IM v2·Tier2) | Top5 #5 | ⏸ **보류 = 설계 상태**(§3) |
| GitLab CI 주장 vs 부재 | ⚠ 모순 | 🟡 roadmap 텍스트 정직화(별도, 경량) |

## 7. 영향 / 리스크

- **+** 다층 실프로젝트가 게이트 천장 안에서 도입 가능 → telemetry 루프 가동 → 승격 판단의 데이터 확보.
- **+** tier1/tier2 와 일관된 "경로·의미·계층을 데이터로" 라인 완성.
- **−** 게이트 의미 변경 = 회귀 위험. **완화: expo-feature 프리셋 byte-동치**(tier1 선례대로 골든 회귀 기준)로 "현 동작 불변 + 출처만 이동" 보장.
- **−** 범위 확대 유혹. **완화: 이 OD 는 방향만, 구현은 별도 OD.** 새 계층 검사는 warning-first 로만 출시.

## 8. 다음 단계 / 재오픈 트리거

1. 도입 선결 버그 2건은 **별도로 main 머지 완료**(PR #67, `8919a6d`). 이 PR 은 tier3 설계 초안 동봉 + 실측 증거 cross-link(PR #71).
2. **사람 resolve**: 옵션 A/B/C 선택. A 면 roadmap 에 OD-12 cross-link + "지금 하지 말 것"에서 Axis 2 예외 명문화.
3. resolve=A 시 → tier3 초안 리뷰(코덱스 포함) → 구현 OD(별도) → 구현(expo-feature byte-동치 회귀 기준).
4. 재오픈 트리거: tier3 초안이 byte-동치 회귀를 깨거나, 실제 도입에서 N계층 모델의 결함이 드러나면.

### 8.1 tier3 초안 리뷰(코덱스)가 표면화한 쟁점 — 정정 반영(2026-06-21)

resolve=A(구현 착수) 전에 tier3 §10 에서 닫아야 했던 ①~③ 은, 정정 제안서(PR #74) + blocker① 스파이크
**독립 재현**으로 방향이 정리됐다(여전히 사람 resolve 대상 — 이 prep 은 닫지 않는다):

1. **비단조 allow/forbidden 표현력 — 강등(구현불가 → 해결되는 설계 결함).** 단일 `edits_at` = 정책 role-derived
   **10/14 불일치**(독립 재현), per-(layer×mode) `access:{allow[],forbid[]}` 행렬 = **0/14 byte-동치**. → "구현
   불가" 아님. tier3 §3 canonical 을 `edits_at`→행렬로 **교체 완료**(tier3 §3, PR #74 반영). 단 "한 줄 depth"
   셀링포인트는 축소(byte-동치엔 layer 당 명시 mode 멤버십 필요). [SPIKE-REPORT](axis2-a-blocker1-spike/SPIKE-REPORT.md).
2. **`layers` ↔ 정책 단일출처 — 정리됨.** role-token allowed/forbidden 셀 = `layers/access` authoritative(→ 생성),
   리터럴·`requires`·`order` = 정책 손수. §5/§11 충돌을 **셀 종류 경계**로 해소(tier3 §5).
3. **"depth 축" 용어 — 통일.** "readiness/mode 정책의 access 표현력 일반화"로 표기 통일, "depth 축"은 포지셔닝
   라벨(새 artifact 축 아님) 각주(tier3 §9·§10③, README).

상세·patch: [tier3-layer-model.md](../../docs/design/drafts/customizable-architecture/tier3-layer-model.md) (정정 반영됨) ·
[tier3-access-matrix-revision.md](../proposals/tier3-access-matrix-revision.md).

### 8.2 OD-12 사람 결정 — 방향(now) / 구현(별도) 분리

> 불변식: confirmed 승격·OD resolve·hard gate 신설/상향·구현 착수는 **사람만**. 이 prep 은 결정을 *준비*만 한다.

**OD-12 (방향) — 지금 resolve:**

- **(D1) 선회 방향 택1:** **A**(추천)/B/C (§5).
- **(D2) 거버넌스:** "새 산출물 축 아님 = readiness/mode access 표현력 일반화" 명문화 → roadmap 닫힌 목록
  (`roadmap-current.md:30-40`) 불변, "새 축 금지"(`:125`)에 "이 일반화는 그 금지 대상 아님" 예외 각주.
- **(D3)** tier3 §3 행렬 스키마 재설계 인가 + 신규 계층 게이트 **warning-first 기본**(telemetry 전 hard 승격 없음).

**OD-12-impl (구현 OD) — A 일 때만 별도로 열고 지금은 resolve 안 함:**

- **(I1)** 정책 파일 전환 방식 & 머지: authoritative=`layers/access` 는 확정(§8.1②). 정책 *파일* 처리만 택1 —
  (a) 즉시 생성물화(role-token 셀 제거 + 멱등성 CI) vs (b) 점진 전환(layers 가 single-source, 정책은 재생성·검증).
  보수적 기본=(a). 머지는 tier1 `mergeRoles` 우선순위 계승.
- **(I2)** `edits_at` 손실 alias 잔류(tier3 §3.1) vs 완전 삭제.
- **(I3)** 게이트 강도 기본값: 신규 계층은 `access`(경로 허용)만, `gates`(requires) 엄격 opt-in + 사람 승격.
- **(I4)** byte-동치 범위: forward-gate parity(SPIKE 0/14) **AND** backstop guarded-surface parity 둘 다.
- **(I5)** `layers` 물리 위치: tier1 **OD-10**(킷 내부 vs 소비 루트)과 같은 파일에서 함께.
- **(I6)** `fact` 종류 로드맵: v1 `dir_has_files` 만; props/export/test 존재는 후속.
- **(I7)** 멱등성 CI **새 check target**: role-token 셀이 생성물이 되면 resolved 정책 재생성·diff(현행은 coupon
  `_meta` 만 diff — 같은 패턴, 새 대상).

상세·선택지: [tier3-layer-model.md §10](../../docs/design/drafts/customizable-architecture/tier3-layer-model.md).

---

## 증거 / 링크

- 조사 보고서: [../reports/kit-multilayer-adoption-assessment-20260621.md](../reports/kit-multilayer-adoption-assessment-20260621.md) (세션, 멀티에이전트 + 코드 실측; 이 브랜치에 vendored)
- **실측 검증 (PR #71, main 동봉):** [다층 도입 dry-run](multilayer-adoption-dryrun/EXPERIMENT-REPORT.md) (Clean Arch 6계층 → F1~F5 게이트 사각지대) · [A안 blocker① 스파이크](axis2-a-blocker1-spike/SPIKE-REPORT.md) (정책 재생성 diff — blocker ① 실재+해결가능)
- 설계 초안: [tier3-layer-model.md](../../docs/design/drafts/customizable-architecture/tier3-layer-model.md)
- 선례: [tier2-gate-promotion-decision-prep-001.md](tier2-gate-promotion-decision-prep-001.md) (OD-11 prep 형식)
- 핵심 코드: `policies/implementation-mode-policy.yaml` · `scripts/lib/spec.mjs:308-318` · `presets/expo-feature.yaml` · `templates/meta/lint-policy.template.yaml`

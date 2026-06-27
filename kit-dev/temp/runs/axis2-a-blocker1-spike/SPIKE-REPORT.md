# Option A 사전검증 스파이크 — blocker ①(비단조 forbidden) make-or-break

> 2026-06-21 · branch `verify/axis2-a-blocker1-spike` · 목적: OD-12 추천안 A(Axis 2 선회)가
> **빌드 가능한가**를, A 스스로 "구현 불가"라 자인한 단 한 점(tier3 §10 blocker ①)으로 판가름.
> 방법: 실제 `policies/implementation-mode-policy.yaml` 을 truth 로 파싱 → `layers:` 생성기 2종으로
> mode-policy 의 role-derived allowed/forbidden 을 재생성 → diff. 실행 하니스: `synth-policy.mjs`.

## 질문
tier3 §3 의 `layers:` 스키마(layer 당 단일 `edits_at: <min mode>` → 그 모드부터 위로 spread)로
현 정책을 **byte-동치**(=tier3 §7 수용기준)로 재생성할 수 있는가? 특히 fake-hook 계약의 비단조 패턴
(`{roles.screen}` 이 screen-skeleton~final 에서 allowed → **api-integrated 에서 forbidden** → production 에서 재허용)을.

## 결과 (실측)

| 생성기 | role-derived 14셀 中 불일치 | 판정 |
|---|---|---|
| **v1** = tier3 §3 단일 `edits_at` 임계값 | **10 / 14** | ❌ 재생성 불가 |
| **v2** = per-mode `allow[]`/`forbid[]` 행렬 (blocker ① 제안 수정) | **0 / 14** | ✅ byte-동치 |

### v1 이 틀리는 곳 (대표)
- **forbidden 전멸 (5/5):** §3 스키마엔 forbidden 을 산출하는 필드가 없어 `route-skeleton~final` 의
  `{roles.api_client}` 금지, `api-integrated` 의 `{roles.screen}` 금지를 **하나도** 못 만든다.
- **allowed 비누적성 (5/5 모드에서 번짐):** `edits_at` spread 는 단조 누적이라 `{roles.route_entry}` 가
  route-skeleton 이후 모든 모드로, `{roles.hook}` 이 final 로(실제론 빠짐), `{roles.screen}` 이
  api-integrated 로(실제론 forbidden), 모두 production 으로(실제론 `src/**` 리터럴만) 번진다.

## 해석

1. **blocker ① 은 실재하며, 문서가 말한 것보다 더 심하다.** 비단조는 screen 한 케이스가 아니라,
   정책의 `allowed_paths` 가 **"각 단계의 작업 표면"(per-stage working set)** 이라 *본질적으로 비누적*이다.
   단조 임계값(`edits_at`)은 거의 모든 셀을 틀린다(4/14 만 우연히 맞음).

2. **근본 원인 = maturity 축과 depth 축이 깨끗이 분리되지 않는다.** fake-hook seam 이 "api-integrated 에서
   screen 을 *특정해서* 막는다"는 건 maturity×depth **교차 제약**이지 두 직교축의 곱이 아니다.
   → tier3 §2 의 "두 축이 합성된다(orthogonal compose)" 프레이밍은 이 얽힘을 과소표현한다. 정책은
   환원 불가한 **mode×layer 행렬**이다.

3. **수정 가능성: per-mode allow/forbid 행렬이면 byte-동치 회복(v2 = 0).** blocker ① 의 선택지 중
   "`forbidden_at` 추가(명시 per-mode allow/deny)"가 **충분**함을 실측 확인. 즉 **A 는 빌드 가능하다 —
   단 tier3 §3 의 스키마로는 불가, 행렬 스키마로 교체해야 한다.**

4. **대가(정직하게): "간결한 depth 선언"이라는 셀링포인트는 줄어든다.** v1 은 layer 당 스칼라 1개(`edits_at`)
   였지만, byte-동치를 받으려면 v2 처럼 layer 당 **명시 mode 멤버십**(여기선 5 layer × 평균 ~3 모드 = 14 항목)을
   담아야 한다 — 정책의 role-derived 절반과 **같은 정보량**. tier3 §2/§3 의 "단일 edits_at 한 줄로 depth" 는 반증됨.

## OD-12 에 주는 결론
- **A(추천안)는 죽지 않았다 — 빌드 가능.** blocker ① 은 "구현 불가"가 아니라 **"스키마 교체로 해결되는 설계 결함"**으로 강등.
- **단, tier3 §3 은 재설계 필요:** `edits_at: <min mode>`(단조) → **per-(layer×mode) allow/forbid 행렬**(비단조).
  그리고 tier3 §2 의 "직교 두 축 합성" 서사도 "얽힌 mode×layer 행렬"로 정정 권장.
- **byte-동치(수용기준)는 그 행렬 스키마에서 성립**(v2 실증). 회귀 안전망은 유지된다.

## 정직한 한계
- v2 의 "0 불일치"는 부분적으로 정의적(행렬이 행렬을 재현)이다. **비-자명한 결과는 v1 의 실패**(=§3 안이 부족)와,
  정책 재현에 필요한 **최소 스키마 표현력이 per-mode 행렬**이라는 하한이다.
- 이 스파이크는 정책 *합성* 한 점만 봤다. 실제 `layout-profile.mjs`/`spec.mjs` 배선·readiness E2E·
  expo-feature 골든 통과까지는 미수행(focused 스파이크 범위 밖, 후속 구현 OD 몫).
- role-derived 항목만 비교(리터럴 blanket guard 는 tier3 §3 대로 범위 밖).

## 재현
```
node frontend-workflow-kit/temp/runs/axis2-a-blocker1-spike/synth-policy.mjs
```

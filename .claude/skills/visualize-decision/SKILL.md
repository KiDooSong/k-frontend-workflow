---
name: visualize-decision
description: Open Decision(또는 인터뷰/소크라테스 질문)을 사람에게 제시할 때, 질문과 선택지별 전/후 결과를 자기완결형 HTML로 시각화해 이해를 돕는다. 사용자가 "이 결정 시각화", "visualize decision", "선택지 비교 보여줘"를 요청하거나, resolve 직전 복잡한 Open Decision 을 설명해야 할 때 사용. 읽기 전용 — 어떤 문서도 수정하지 않고 게이트도 바꾸지 않으며, `_viz/` 산출물만 생성한다.
---

# visualize-decision

Open Decision/질문을 사람이 더 쉽게 이해하도록 자기완결형 HTML 로 시각화한다.
**읽기 전용** — 게이트(readiness/validate)·소스 문서를 건드리지 않고, resolve 는 사람이 한다. 스킬은 *보여줄* 뿐 결정하지 않는다.
데이터 계약(필드·뷰키·불변식): [assets/SCHEMA.md](assets/SCHEMA.md) (정본 JSON Schema: [assets/decision-data.schema.json](assets/decision-data.schema.json)). 설계 근거: [temp/decision-visualization-skill-draft.md](../../../temp/decision-visualization-skill-draft.md).

## 아키텍처 (먼저 이해 — 토큰 절감의 핵심)

```
[결정 데이터 JSON]  --(build.mjs: 스키마검증 + 이스케이프 + __VIZ_DATA__ 치환)-->  [자기완결 단일 HTML]
   ↑ 매 호출 LLM 이 생성(≈15%)                         ↑ 고정 엔진(assets/decision.template.html, 재사용 ≈85%)
```

엔진(`assets/decision.template.html`)은 Codex 하드닝된 고정 렌더러다. **당신이 만드는 건 데이터 JSON 하나뿐**이고, 엔진은 절대 다시 출력하지 않는다(재출력하면 절감이 사라진다). 어려운 건 HTML 이 아니라 **데이터(추론)** — 전/후 diff·장단점·추천은 결정마다 다르니 당신 몫이다.

## 입력
- 대상 Open Decision ID(들) (예: `D-001`) — 해당 화면 `screen-spec.md` 의 `## Open Decisions` 표에서 읽는다. 또는 인터뷰/소크라테스 질문 1건(자유 텍스트). 없으면 사용자에게 묻는다.
- (선택) 대상 screen/domain — 전/후 파급을 계산할 컨텍스트.

## 핵심 불변식
1. **읽기 전용.** `docs/frontend-workflow/_viz/` 안의 산출물(`decision-{ID}.html` + 소스 `decision-{ID}.data.json`)만 생성/갱신한다. 소스 문서·게이트·레지스터·앱 코드(screen-spec·Open Decisions·`_meta`·`src` 등)는 **절대 수정하지 않는다**. (`build.mjs` 가 출력을 엔진 폴더·`_viz/` 밖으로 못 쓰게 구조적으로 막는다.)
2. **resolve 는 사람.** 게이트(open→resolved)를 바꾸지 않고, readiness/validate 판정을 흉내내지 않는다. 미리보기를 "확정/적용됨"으로 표현하지 않는다.
3. **추측 금지.** 모르는 파급은 칸/불릿 끝에 `(?)` 로 명시하고 비운다 — 그럴듯한 가짜 미리보기·근거 없는 추천이 가장 위험하다(앵커링 + 환각).
4. **조건부 추천.** 추천은 `recommend`(배지)·`why`(근거)·장단점과 **함께만**. 옵션 간 상대 강도는 `stars`(0–3, 추천 아님). **셋 다 불확실/애매하면 추천 보류**(`recommend` 모두 false). 비교 데이터(`criteria`/`scores`)는 승자를 칠하지 않는다(중립).
5. **조건부 트리거.** 옵션 빈약·자명한 결정엔 시각화하지 않는다(아래 게이트). 억지 시각화는 역효과.
6. **자기완결.** 외부 CDN 금지(오프라인·의존성 0). diff 는 색(초록+/빨강−)만이 아니라 `+`/`−` 기호로도 구분(WCAG 1.4.1). 다크/라이트 자동 대응.

## 트리거 게이트 (그리기 전에 먼저 판단)
아래 중 **하나라도** 해당하면 시각화한다. 아니면 멈추고 "텍스트 질문이 더 낫다"고 보고한다:
- 옵션이 3개 이상 / 선택지 간 실재 트레이드오프(어느 쪽도 자명히 우월하지 않음) / 답에 따라 산출물(문서·화면·플로우) 형태가 바뀜 / 다중턴 명료화가 예상됨.

미충족이면 데이터에 `gate.decision: "skip"` 으로 사유만 담아 보고하고 뷰는 그리지 않는다(자명한 yes/no·단발 확인 → 텍스트가 효율적).

## 절차

1. **대상 결정을 읽는다.** ID 가 주어지면 해당 `screen-spec.md` 의 `## Open Decisions` 표에서 행(Decision Needed·Options·Blocking Mode·Owner·Status)을 찾고, 같은 ScreenSpec 의 관련 섹션(State Matrix·Interaction Matrix·API·Copy·Data Requirements)과 frontmatter(screen_id 등)를 읽어 **전/후 파급의 근거**를 모은다. 자유 질문이면 그 텍스트를 쓴다. 입력이 없으면 사용자에게 묻는다.

2. **트리거 게이트를 판단한다.** 4개 조건의 충족 여부를 `gate.trigger[]`(`{label, met}`)와 `gate.decision`(`visualize`|`skip`)에 적는다. 미충족 → `skip` 으로 보고하고 **멈춘다**.

3. **뷰를 고른다.** 결정 성격 → 뷰(아래 매핑). `views`(키 배열, 순서대로)와 `viewRationale`(한 줄 근거)에 적는다. **무조건 다 그리지 않는다** — 이 결정에 필요한 뷰만. 켠 뷰엔 대응 데이터가 반드시 있어야 한다(없으면 빌드 실패).

4. **데이터 JSON 을 추론·작성한다(가장 중요).** [assets/SCHEMA.md](assets/SCHEMA.md) 에 맞춰:
   - `base` = 현재 ScreenSpec 관련 상태 텍스트. 각 옵션 `after` = 그 선택을 적용한 뒤 상태(같은 줄 구조 위 줄 단위 diff 대상). **실제 ScreenSpec 에서 파생** — 지어내지 않는다.
   - 옵션별 `pros`/`cons`/`changes`, `risk`/`blk`(Blocking 영향), `recommend`/`stars`/`why`(불변식 4).
   - 고른 뷰가 필요로 하는 값만: `criteria`(matrix) · `scores`+`scoreAxes`(scores) · `value`/`effort`+`quadrant`(quad) · `journey`(journey) · `flow`(flow) · `preview`(whatif).
   - **모르는 파급은 텍스트 끝에 `(?)`.** 추측으로 채우지 않는다. 키 정합: `options[].key` 는 고유하며 `criteria.t`·`journey.sat` 의 키와 정확히 일치.

5. **조립한다(build).** 데이터 JSON 을 `docs/frontend-workflow/_viz/decision-{ID}.data.json` 으로 **직접 쓴다**(이 sidecar 쓰기는 에이전트 몫 — `build.mjs` 는 읽기만 하고, 가드가 `_viz`/`examples` 밖 쓰기를 막는다). 그다음 저장소 루트에서:
   ```
   node .claude/skills/visualize-decision/assets/build.mjs \
     docs/frontend-workflow/_viz/decision-{ID}.data.json \
     docs/frontend-workflow/_viz/decision-{ID}.html
   ```
   build 가 **스키마 검증 + 뷰↔데이터 교차검증 + `</script>`/U+2028 이스케이프**를 한다. `exit 1` 이면 보고된 위반을 **데이터에서 고쳐** 다시 빌드한다(엔진은 건드리지 않는다). 플레이스홀더 잔여 0 이어야 한다.
   - 인라인 빠른 확인이 필요하면 `mcp__visualize__show_widget` 에 빌드 산출 HTML 을 넣을 수 있으나, 이때는 엔진 전체를 다시 출력하므로 **토큰 절감이 사라진다** — 작은 결정·일회성에만.

6. **검증한다.** build `exit 0` 확인. 필요하면 미리보기로 콘솔 에러 0 을 확인한다(`assets/serve.mjs` + preview 도구, 또는 `.claude/launch.json` 의 `decision-viz`). 산출물은 자기완결이라 그대로 열어도 된다.

7. **안내한다.** 산출물 경로(또는 인라인)를 알리고 **"이건 resolve 직전 이해 보조이고, 결정을 닫는 것(resolve)은 사람"** 임을 분명히 한다. 미리보기를 확정으로 표현하지 않는다.

## 뷰 매핑 (결정 성격 → 뷰)

| 결정의 성격 | 뷰 키 |
|---|---|
| (항상) 선택지·장단점·추천 개요 | `opt` |
| 상태·문서·설정이 **바뀜** | `diff` (전/후) |
| 답이 **경로를 가름** | `tree`, `flow` |
| **전체 흐름 속 위치** | `flow`, `journey` |
| **A/B/C 비교** | `matrix`, `scores`, `quad` |
| **결정 직전 확인** | `whatif`, `cards` |

전체 10개 뷰 키와 각 필요 데이터는 [assets/SCHEMA.md](assets/SCHEMA.md)의 "뷰 키" 표 참조. `--all` 카탈로그 빌드는 전 뷰를 펼치는 데모/디버그용이며, 실제 결정 시각화는 고른 뷰만 쓴다.

## 금지
- 소스 문서·게이트·레지스터·앱 코드 수정 (읽기 전용 — `_viz/` 산출물만).
- 게이트(open→resolved) 변경 / readiness·validate 판정 흉내.
- 파급·옵션 결과를 **추측해서 그리기** (모르면 `(?)`/TBD — 가짜 미리보기가 가장 위험).
- **근거(`why`)·라벨·보류 규칙 없이** 한 옵션을 추천/강조 (셋 다 불확실하면 보류).
- 비교 데이터(`criteria`·`scores`)에서 **승자를 색으로 칠하기** (추천은 `recommend`/`stars` 로만 분리).
- 미리보기를 "**확정/적용됨**"으로 오인하게 하는 카피.
- 트리거 미충족인데 **억지 시각화** (옵션 빈약 시 역효과 → `skip`).
- diff add/del 을 **색만으로** 구분 (`+`/`−` 기호·라벨 병행 필수).
- 외부 CDN 로드 (자기완결·의존성 0 깨짐).
- 엔진(`decision.template.html`)을 매 호출 다시 출력 (데이터 JSON 만 생성 — 토큰 절감의 전제).

## 통합 (선택)
reconcile-input 이 새 입력으로 `resolved→open` 재오픈할 때, 이 스킬로 "무엇이 왜 바뀌나"를 시각화하면 충돌 이해가 빨라진다(중간 확인 지점 — 설계 근거 §7). 이때도 읽기 전용·resolve 는 사람 불변식은 동일하다.

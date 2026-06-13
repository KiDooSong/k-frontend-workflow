# 데이터 계약 — visualize-decision 입력 스키마

정본(기계 검증용): [`decision-data.schema.json`](decision-data.schema.json) (JSON Schema, Draft 2020-12).
`build.mjs` 가 빌드 시 이 스키마의 `required`/`enum` 으로 데이터를 검증한다.

> 핵심 원칙: **엔진은 고정·재사용, LLM 은 이 스키마에 맞는 데이터 JSON 만 생성**한다.
> 그래서 매 호출 출력의 ~85%(엔진)가 빠지고, 결정마다 다른 "내용"만 만들어진다.

## 최상위 필드

| 필드 | 필수 | 타입 | 설명 |
|---|---|---|---|
| `meta` | ✅ | object | 헤더 메타(아래) |
| `base` | ✅ | string | 결정 **전** 상태 텍스트. 옵션별 `after` 와 줄 단위 diff 의 기준. 줄바꿈 `\n` |
| `options` | ✅ | array | 선택지(아래). 색은 **인덱스 순서로 자동 배정** |
| `criteria` | ✅ | array | 트레이드오프 표의 행 |
| `scoreAxes` | — | string[] | 점수 막대·레이더 축 이름. `options[].scores` 키와 일치 |
| `quadrant` | — | object | 2D 사분면 축 설정(`xLabel/yLabel/xKey/yKey/note`) |
| `flow` | — | array | 사용자 흐름 노드 `[라벨, 서브, here(0\|1)]` |
| `journey` | — | object | 여정 맵(단계별 만족도) |
| `views` | — | `"all"` \| key[] | 렌더할 뷰. 생략/`"all"` → 전체(카탈로그). 배열이면 그 뷰만 |
| `viewRationale` | — | string | 왜 이 뷰들을 골랐는지 한 줄 |
| `gate` | — | object | 트리거 게이트 판정 |

### `meta` (모두 필수, `eyebrow` 만 선택)
`id` · `title`(H1) · `eyebrow` · `screen` · `blocking` · `owner` · `readiness` · `status` · `question`(트리 노드용 짧은 질문)

### `options[]` (필수 필드)
`key`(고유; `criteria.t`·`journey.sat` 키와 일치) · `name` · `code` · `tag` · `recommend`(bool) ·
`stars`(0–3, 상대 강도 — **추천 아님**) · `why` · `pros[]` · `cons[]` · `changes[]`(트리에 최대 3줄) ·
`risk` · `blk` · `branch` · `after`(diff 대상, `\n`)

선택: `scores`(기준명→0–10) · `value`/`effort`(0–10, 사분면 축) · `preview`(`headline`/`bullets[]`/`unknowns[]`)

### `criteria[]`
`k`(기준명) · `t`(옵션 key → 칸 텍스트). 불확실 항목은 텍스트 끝에 `(?)`.

### `journey`
`steps[]` · `sat`(옵션 key → 길이 `steps` 와 같은 1–5 배열) · `diverge`(갈리기 시작하는 step 인덱스) · `title`/`note`.

## 뷰 키 (`views` / `$defs.viewKey`)

| key | 뷰 | 필요 데이터 |
|---|---|---|
| `opt` | 선택지 카드(장단점·추천) | options |
| `diff` | 전/후 diff(unified↔split) | base, options[].after |
| `tree` | 의사결정 트리(카드 + SVG + Mermaid 소스) | options[].changes/branch |
| `flow` | 사용자 흐름 + 옵션 분기 | flow, options[].branch |
| `journey` | 여정 맵(만족도) | journey |
| `matrix` | 트레이드오프 표 | criteria |
| `quad` | 2D 우선순위 사분면 | quadrant, options[].value/effort |
| `scores` | 기준별 막대 + 레이더 | scoreAxes, options[].scores |
| `whatif` | 확정 전 확인 카드 | options[].preview |
| `cards` | Adaptive 스타일 미리보기 카드 | options |

## 트리거 게이트 (`gate`)

초안 §3 의 "무조건 그리지 않는다"를 데이터로 표현.

```json
"gate": {
  "decision": "visualize",          // 또는 "skip"
  "trigger": [ {"label":"옵션 3개 (≥3)","met":true}, ... ],
  "reason": "..."
}
```

- `decision: "visualize"` → 게이트 통과 배너 + 선택된 뷰 렌더.
- `decision: "skip"` → **뷰를 그리지 않고** "텍스트 질문이 더 적합" 배너만. (옵션 빈약·자명한 yes/no 등)

## 불변식 (데이터 작성 규칙)

1. **추측 금지** — 모르는 파급은 칸/불릿 끝에 `(?)`. 그럴듯한 가짜 미리보기·근거 없는 추천이 가장 위험.
2. **조건부 추천** — `recommend` 는 근거(`why`)·장단점과 함께. 셋 다 불확실하면 모두 `false`(보류).
3. **비교는 중립** — `criteria`·`scores` 는 승자를 칠하지 않는다. 추천은 `recommend`/`stars` 로만 분리.
4. **키 정합** — `options[].key` 는 `criteria.t`·`journey.sat` 의 키와 정확히 일치해야 한다.
5. **조건부 트리거** — 시각화가 부적합하면 `gate.decision="skip"`.
6. **뷰↔데이터 정합** — `views` 에 켠 뷰는 대응 데이터가 있어야 한다(`flow`→`flow[]`, `journey`→`journey.steps/sat`, `quad`→`quadrant`, `scores`→`scoreAxes`). `build.mjs` 가 교차검증해 없으면 빌드 실패(`skip` 게이트는 면제).

## 예시

전체 예시는 [`examples/decision-D-001.data.json`](examples/decision-D-001.data.json) 참고(트리거 통과 + 6개 뷰 선택).

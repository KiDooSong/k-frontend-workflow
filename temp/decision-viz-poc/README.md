# decision-viz PoC — 엔진/데이터 분리 + 전체 뷰 갤러리

`temp/decision-D-001-prototype.html`(통짜 단일 파일)을 두 가지 목적으로 재구성한 개념 검증:

1. **엔진/데이터 분리** — 재사용 엔진(CSS+JS) 1벌 + 결정별 데이터(JSON) 1개. 스킬 호출 시 LLM이 새로
   만드는 건 데이터뿐 → 출력 토큰·생성시간 절감, 엔진은 테스트된 채 고정(일관성).
2. **“못 본” 뷰 전부 노출** — 초안엔 있지만 프로토타입엔 없던 뷰까지 한 페이지 갤러리로.

## 파일

| 파일 | 역할 | 누가 만드나 |
|---|---|---|
| `decision.template.html` | **엔진** — CSS + diff/렌더 JS + HTML 스켈레톤. `var DATA = __VIZ_DATA__;` 한 곳만 플레이스홀더 | 스킬에 **번들**(1회 고정·재사용) |
| `decision-D-001.data.json` | **결정 데이터** — 옵션·장단점·전후·점수·여정·미리보기 | **호출마다 LLM 생성** |
| `build.mjs` | 조립 — 템플릿 + 데이터 → 자기완결 단일 HTML (placeholder 치환 + JSON 검증 + 분량 리포트) | 결정 스크립트(1회 고정) |
| `decision-D-001.html` | **산출물** — 빌드 결과(의존성 0, 오프라인) | 자동 생성물 |
| `decision-data.schema.json` / `SCHEMA.md` | 데이터 계약(정본 JSON Schema + 사람용 문서) | — |
| `_test-adversarial.data.json` / `_test-skip.data.json` | 회귀 테스트 픽스처(XSS·오버플로·N≠3·skip 게이트) | — |
| `serve.mjs` / `.claude/launch.json` | 미리보기용 정적 서버 (검증 전용, 스킬 산출물 아님) | — |

## 재빌드 / 미리보기

```bash
node temp/decision-viz-poc/build.mjs
# → decision-D-001.html 생성 + 분량 리포트 출력

# 다른 결정도 동일 엔진으로:  node build.mjs my.data.json my.html
```

미리보기: 산출물 `decision-D-001.html` 을 브라우저로 직접 열거나, `node serve.mjs` 후 http://localhost:4178/.

## 측정된 절감 (이 PoC 실측)

```
엔진 템플릿  decision.template.html : 45,496 B   (한 번 고정·재사용)
결정 데이터  decision-D-001.data.json: 7,750 B    (호출마다 생성)
산출물       decision-D-001.html     : 52,317 B

→ 매 호출 LLM 이 새로 만드는 양 = 데이터 ≈ 산출물의 14.8%
→ 재사용(엔진)으로 안 만드는 양  ≈ 산출물의 86.9%
```

**핵심: 절감되는 건 보일러플레이트(엔진), 추론(데이터)이 아니다.** 전후 diff 내용·장단점·추천·점수처럼
결정마다 달라지는 “생각”은 여전히 LLM 몫. 엔진을 안 뱉는 것만으로 출력의 ~85%가 빠진다.

> 실현 메커니즘: `Write`로 통째로 다시 쓰면 엔진을 또 출력해서 절감이 안 된다. **(A) 템플릿 복사 후
> 플레이스홀더만 `Edit` 치환** 또는 **(B) build.mjs 로 조립**(LLM은 JSON만) 이어야 출력에서 엔진이 빠진다.

## 뷰 목록 (4 코어 + 6 추가)

코어(프로토타입에 있던 것): ① 선택지 카드 ② 전/후 diff(unified↔split) ③ 의사결정 트리(카드) ④ 사용자 흐름 ⑤ 트레이드오프 표.

**이번에 추가(“못 본” 것들):**

- **2b 의사결정 트리 — SVG 노드-엣지 다이어그램** (다이아몬드 decision node + 분기, 자기완결)
- **2c Mermaid 소스 패널** — flowchart 구문(토큰 효율적). 단 렌더엔 mermaid.js 번들 필요(CDN은 자기완결을 깸) → 기본은 2b SVG. 그 트레이드오프를 눈으로 보여주는 참고.
- **여정 맵(journey)** — Mermaid journey가 쓰는 “단계별 만족도” 포맷. 옵션별 만족도 라인(SVG).
- **2D 우선순위 사분면** — NN/g, 가치 vs 노력 축에 옵션 배치(SVG). 중립(승자 미색칠).
- **기준별 점수 — 막대 + 레이더** — Chart.js 대체를 순수 SVG/HTML로(의존성 0).
- **What-if 확정 전 확인 카드** — Nielsen #5 + 중간 확인(CHI 2026). 버튼 비활성(resolve는 사람).
- **구조화 미리보기 카드** — Adaptive Cards(참조 모델) fact+action 패턴을 정적 HTML로.

전 뷰 공통 규약 유지: 자기완결(CDN 0), diff 색+기호 중복 인코딩(WCAG 1.4.1), 비교 뷰 중립(추천은 카드 ★·(추천)로만 분리), 모르는 파급 `(?)`, 다크/라이트 대응.

## 일반화 메모 (프로토타입 → 엔진)

- 옵션 색을 `.o-show/.o-hide/.o-tab`(결정 종속) → **인덱스 기반 팔레트**(`col(i)` + 인라인 `--c/--cbg/--cbd`)로. N개 옵션 자동.
- 데이터 스키마는 N옵션 × M기준 일반형. 렌더 함수는 전부 `DATA.options`/`DATA.criteria` 순회(데이터 주도).

## 뷰 선택 + 트리거 게이트 (구현됨)

이제 **항상 다 그리지 않는다**(초안 §3·§4). 데이터의 `gate`/`views` 로 제어:

- `gate.decision`: `visualize`(트리거 충족 배너 + 선택 뷰) / `skip`(뷰 안 그리고 “텍스트 질문이 낫다”만).
- `views`: 렌더할 뷰 키 배열(순서대로) 또는 `"all"`(카탈로그). 생략 시 전체.
- D-001 은 6개 뷰만 선택(`opt,diff,tree,flow,matrix,whatif`), 분석 보조 4개는 생략 — `--all` 로 카탈로그 빌드.
- 섹션 번호·TOC·DOM 순서가 선택/순서를 따라 동적 재배치.

## 보안·견고성 (Codex 리뷰 반영)

데이터가 전부 `innerHTML`/`<script>` 주입이므로 다음을 하드닝:

- **`</script>` 브레이크아웃 차단** — build 가 주입 JSON 의 `<`/`>`/`&`/U+2028/2029 를 `\uXXXX` 로 escape.
- **속성 컨텍스트 XSS** — `escAttr()`(따옴표 포함)로 `data-opt` 등 속성값 이스케이프.
- **수치 클램프** — 점수·축값을 0–10(만족도 1–5)로 clamp → 사분면/레이더/막대 오버플로 방지.
- **트리 SVG 폭** — 옵션 수 N 에 맞춰 viewBox 확장(rect 음수폭 방지).
- **뷰↔데이터 정합** — build 가 선택된 뷰에 필요한 데이터 존재를 교차검증(없으면 빌드 실패). 엔진도 방어 가드.

## 검증 (이 PoC)

- `build.mjs`: 스키마 검증(required/enum/키 정합/뷰-데이터) 통과, 치환 후 플레이스홀더 잔여 0.
- 정상 데이터: 콘솔 에러 0, 선택 6뷰만 표시(숨김 4)·동적 번호 ∗·1–5, SVG 좌표 이탈 0.
- **적대적 픽스처**(`</script>`·`<img onerror>`·키에 `"`·점수 99/-5/50/-3·N=5): XSS 미발화, `data-opt="q&quot;x"` 이스케이프+동작, 4 SVG 좌표 이탈 0, 트리 viewBox 728 로 확장.
- **skip 픽스처**: 게이트 배너만, 전체 섹션·nav 숨김, 콘솔 에러 0.

## 다음 단계 (승격 시)

- 엔진을 `frontend-workflow-kit/templates/_viz/decision.template.html` 로, build를 결정 스크립트로.
- 데이터 계약(`decision-data.schema.json`)을 Tier 2 설계 계약(`decision-visualization.md`)에 흡수.
- 스킬은 트리거 게이트 판단 → 결정 성격에 맞는 `views` 만 생성(카탈로그는 데모/디버그용).

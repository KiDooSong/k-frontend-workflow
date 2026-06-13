# visualize-decision 엔진 번들

`visualize-decision` 스킬이 번들로 참조하는 렌더 엔진·데이터 계약·예시. 스킬 진입점은 [../SKILL.md](../SKILL.md).
(PoC `temp/decision-viz-poc/` 에서 승격되어 이 위치로 이동.)

설계의 핵심:

1. **엔진/데이터 분리** — 재사용 엔진(CSS+JS) 1벌 + 결정별 데이터(JSON) 1개. 스킬 호출 시 LLM이 새로
   만드는 건 데이터뿐 → 출력 토큰·생성시간 절감, 엔진은 테스트된 채 고정(일관성).
2. **뷰 선택 + 트리거 게이트** — 무조건 다 그리지 않고 결정 성격에 맞는 뷰만(전체 10뷰는 `--all` 카탈로그).

## 파일

| 파일 | 역할 | 누가 만드나 |
|---|---|---|
| `decision.template.html` | **엔진** — CSS + diff/렌더 JS + HTML 스켈레톤. `var DATA = __VIZ_DATA__;` 한 곳만 플레이스홀더 | 번들(1회 고정·재사용) |
| `build.mjs` | 조립 — 템플릿 + 데이터 → 자기완결 단일 HTML (placeholder 치환 + JSON 검증 + 경로가드 + 분량 리포트) | 번들(1회 고정) |
| `decision-data.schema.json` / `SCHEMA.md` | 데이터 계약(정본 JSON Schema + 사람용 문서) | — |
| `serve.mjs` | 미리보기용 정적 서버 (검증 전용, 스킬 산출물 아님). 저장소 `.claude/launch.json` 에 설정 3종 | — |
| `examples/decision-D-001.data.json` | **결정 데이터 예시** — 옵션·장단점·전후·점수·여정·미리보기 (golden D-001) | 런타임엔 **호출마다 LLM 생성** |
| `examples/_test-adversarial.data.json` / `_test-skip.data.json` | 회귀 테스트 픽스처(XSS·오버플로·N≠3·skip 게이트) | — |
| `examples/*.html` | 빌드 산출물(검증용, `.gitignore`) | 자동 생성물 |

## 재빌드 / 미리보기

```bash
# 엔진 폴더에서 (cwd = assets):
node build.mjs examples/decision-D-001.data.json examples/decision-D-001.html       # 선택 6뷰
node build.mjs examples/decision-D-001.data.json examples/decision-D-001.catalog.html --all  # 전체 10뷰

# 스킬 런타임 (cwd = 저장소 루트, _viz 로 산출):
node .claude/skills/visualize-decision/assets/build.mjs \
  docs/frontend-workflow/_viz/decision-{ID}.data.json docs/frontend-workflow/_viz/decision-{ID}.html
```

미리보기: 산출 `.html` 을 브라우저로 직접 열거나, `node serve.mjs examples/decision-D-001.html` 후 http://127.0.0.1:4178/ (또는 `.claude/launch.json` 의 `decision-viz`).
> 빌드 산출 `examples/*.html` 은 `.gitignore` 대상이라 **fresh checkout 에선 먼저 위 build 를 돌린 뒤** preview/`launch.json` 을 써야 한다.

## 측정된 절감 (현재 실측 — golden D-001)

```
엔진 템플릿  decision.template.html      : 51,993 B   (한 번 고정·재사용)
결정 데이터  examples/decision-D-001.data.json : 8,706 B  (호출마다 생성)
산출물       examples/decision-D-001.html : 59,555 B

→ 매 호출 LLM 이 새로 만드는 양 = 데이터 ≈ 산출물의 14.6%
→ 재사용(엔진)으로 안 만드는 양  ≈ 산출물의 87.3%
```

**핵심: 절감되는 건 보일러플레이트(엔진), 추론(데이터)이 아니다.** 전후 diff 내용·장단점·추천·점수처럼
결정마다 달라지는 “생각”은 여전히 LLM 몫. 엔진을 안 뱉는 것만으로 출력의 ~87%가 빠진다.

> 실현 메커니즘: `Write`로 통째로 다시 쓰면 엔진을 또 출력해서 절감이 안 된다. **build.mjs 로 조립**(LLM은 JSON만)
> 이 기본 — 스키마 검증 + 이스케이프까지 해준다. (템플릿 복사 후 `__VIZ_DATA__` 만 `Edit` 치환하는 우회는
> 검증·이스케이프를 건너뛰므로 권장하지 않음.)

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
- **적대적 픽스처**(`</script>`·`<img onerror>`·키에 `"`·N=5): build 스키마 검증 통과(값은 0–10/1–5 범위 내), 런타임 XSS 미발화, `data-opt="q&quot;x"` 등 속성 이스케이프+동작, SVG 좌표 이탈 0, 트리 viewBox N에 맞춰 확장. (범위 밖 수치는 이제 build 가 거부 — 엔진의 clamp 는 추가 방어선.)
- **skip 픽스처**: 게이트 배너만, 전체 섹션·nav 숨김, 콘솔 에러 0.

## 승격 상태 / 남은 일

- ✅ 엔진·계약·예시를 `.claude/skills/visualize-decision/assets/` 로 이동, `build.mjs` 경로가드를 `_viz/` 출력 허용으로 조정.
- ✅ 스킬 진입점 [../SKILL.md](../SKILL.md) — 트리거 게이트 판단 → 결정 성격에 맞는 `views` 생성 절차(카탈로그는 데모/디버그용).
- ⬜ (선택) 데이터 계약을 Tier 2 설계 계약 `frontend-workflow-kit/decision-visualization.md` 로 승격(SCHEMA.md 흡수).
- ⬜ (선택) reconcile-input `resolved→open` 재오픈 시 자동 시각화 통합.

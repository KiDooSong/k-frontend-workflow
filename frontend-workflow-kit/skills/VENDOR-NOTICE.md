# Vendored skills — 출처/라이선스 고지

이 디렉토리의 일부 스킬·포맷 문서는 외부 저장소에서 **그대로(verbatim) 벤더링**한 것이다.
원본은 수정하지 않는다(킷 통합은 *결선*으로만 — 아래 "통합 범위" 참고).

## 출처

- **저장소**: [mattpocock/skills](https://github.com/mattpocock/skills) — "Skills for Real Engineers."
- **라이선스**: MIT (© 2026 Matt Pocock).

벤더링 시점 원본 경로:

| 킷 내 위치 | 원본 경로 | 비고 |
|---|---|---|
| `grill-me/SKILL.md` | `skills/productivity/grill-me/SKILL.md` | 심문 엔진(ephemeral). **그대로.** |
| `grill-with-docs/CONTEXT-FORMAT.md` | `skills/engineering/grill-with-docs/CONTEXT-FORMAT.md` | 글로서리(CONTEXT.md) 포맷. **그대로.** |
| `grill-with-docs/ADR-FORMAT.md` | `skills/engineering/grill-with-docs/ADR-FORMAT.md` | 기록 결정(ADR) 포맷. **그대로.** |

## 통합 범위 (지금 / 나중)

- **지금 반영(이번 벤더링)**: 위 3개 파일(엔진 1 + 포맷 2)을 그대로 가져왔다. 킷 글로서리 산출물의
  표준 명칭을 **`CONTEXT.md`** 로 채택한다(CONTEXT-FORMAT.md 기준). 기록 결정 축은 `docs/adr/` (ADR-FORMAT.md 기준).
- **first-party 포함**: `reconcile-input/SKILL.md` 는 이 킷의 소비자 workflow skill 이며 외부 벤더링 원본이 아니다. 계약 정본은
  [`docs/reference/input-reconciliation.md`](../docs/reference/input-reconciliation.md) 이다.
- **나중(보류)**: grill-with-docs 의 **라이브 인터뷰 스킬(SKILL.md)** 는 가져오지 않았다. reconcile-input 과 책임이 겹쳐,
  조건부로만 켠다. 통합 설계·write-back 불변식·삽입 지점 지도는 kit-dev history/proposal 자료를 참고한다.

## 불변식 (킷에서 grill 계열을 쓸 때)

- **write-back 필수**: grill-me 는 ephemeral(산출물 0)이다. 심문 결과는 반드시 게이트가 보는 표면
  (Open Decision 행 / Reconciliation Register / Ambiguity Review 표)에 *적어야* 의미가 있다.
- **게이팅 분리**: CONTEXT(글로서리)·ADR(기록)은 지식/기록 축(링크·참조). 진행을 막는 결정은
  킷의 **Open Decision** 만 소유한다. grill 이 게이트를 resolve 하지 않는다(사람-전용 불변식 유지).

---

> 원본 라이선스 전문(MIT):
>
> Copyright (c) 2026 Matt Pocock
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

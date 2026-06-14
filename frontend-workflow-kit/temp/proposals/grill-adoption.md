# grill 계열 채택 — 진행/보류 노트

> 상태: **포맷+개명+엔진 벤더링 = 완료(이번)**, **라이브 인터뷰 통합 = 보류(나중)**.
> 원본: [mattpocock/skills](https://github.com/mattpocock/skills) (MIT). 고지: [`skills/VENDOR-NOTICE.md`](../../skills/VENDOR-NOTICE.md).

## 1. 지금 반영됨 (이번 작업)

- 벤더링(그대로): `skills/grill-me/SKILL.md`(엔진) · `skills/grill-with-docs/CONTEXT-FORMAT.md` · `skills/grill-with-docs/ADR-FORMAT.md`(포맷 2장).
- 개명(전방 컨벤션): 킷 글로서리 산출물 표준 명칭 = **`CONTEXT.md`** (CONTEXT-FORMAT 기준). `templates/domain/domain-rules.template.md` 의 글로서리 참조 1줄을 `CONTEXT.md` 로 갱신.
- 예제 retro-rename: `input-reconciliation/project-before` 의 `domain-glossary.md` → `CONTEXT.md` (git mv + title/H1 + README 트리 참조, 폭 보존). 골든 픽스처(npm test 15/0)·validate 12종 통과로 무회귀 확인.
- **건드리지 않은 것**: 매니페스트/validate/readiness **게이트 로직**, 생성 골든 픽스처(출력물), grill-with-docs 의 라이브 SKILL.md.

## 2. 나중 (보류 — 코어 끝난 뒤 조건부)

### 2.1 삽입 지점 지도 (어디에 grill 을 켜나)

| # | 자리 (트리거) | 스킬 | 추천도 | 그대로/우리식 |
|---|---|---|---|---|
| ① | 도입·온보딩 (브라운필드 adapt) | grill-me | ◐ 선택(브라운필드면 권장) | **우리식 새 스킬** (킷 사다리/정책 매핑은 grill 이 모름) |
| ② | 도메인 언어 정의 (글로서리/ADR) | grill-with-docs | ●● 필수(신규 도메인) | **그대로** (포맷 채택, 출력만 축에 연결) |
| ③ | 입력 충돌 해소 (reconcile-input) | grill-me | ◐ 선택(보조) | **그대로** (write-back = 기존 Register) |
| ④ | 결정(게이트) 해소 (Open Decision) | grill-me | ● 권장 | **얇게 변형** (사람-only resolve 가드 + 결과를 Decision 행에) |
| ⑤ | 착수 직전 (Ambiguity Review) | grill-me | ●● 필수 | **거의 그대로** (결과를 Ambiguity 표/Open Decision 으로) |
| ⑥ | 확정 승인 (confirmed 승격) | — | △ 비권장 | grill 아님 → review-artifact **체크리스트** |
| ✕ | Unknown(사실조사) · state/readiness/validate · 생성뷰 | — | ✕ 금지 | 결정적·기계적 단계 |

### 2.2 비협상 불변식

- **write-back**: grill-me 는 ephemeral. 결과를 표면(Decision/Register/Ambiguity)에 적는 결선이 빠지면 "심문은 했는데 파일엔 0" = *위장된 under-gating*. 엔진은 그대로, **결선만 우리가 책임진다.**
- **게이팅 분리**: CONTEXT/ADR = 지식·기록 축(링크). 진행을 막는 건 Open Decision(킷 소유)만. grill 이 게이트를 내리지 않는다.

### 2.3 남은 결정 (열어둠)

- grill-with-docs **라이브 인터뷰(SKILL.md)** vendor 여부 — 켠다면 ②에서만, 신규·모호 도메인 트리거 조건부.
- ① 온보딩 **adapt 스킬** 신규 작성(질문법만 grill-me 차용).
- `CONTEXT.md` 를 **artifact-manifest 등록 + validate 검사**로 승격할지 — 지금은 미등록 prose. 승격은 게이트 결합이라 별도 결정.
- 예제 `CONTEXT.md` **내용**을 CONTEXT-FORMAT(`**Term**`/`_Avoid_`) 형식으로 재구성 — 이번엔 파일명·라벨만 rename, 내용 변환은 보류.

## 3. 메타룰

> 두 스킬은 **거의 그대로** 쓴다. 우리가 만드는 건 "스킬"이 아니라 **write-back 결선**(엔진 결과 → 게이트가 보는 표면) 하나. 예외는 **①온보딩(새 스킬)** 과 **⑥확정(체크리스트)**.

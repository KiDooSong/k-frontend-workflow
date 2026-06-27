---
artifact_id: screen-source-map
artifact_type: screen-source-map
status: draft
last_reviewed: "{YYYY-MM-DD}"
---

# Screen Source Map

> 외부 입력(기획 Figma·디자인 Figma·planning doc 등)이 들고 오는 **source 화면 코드**를
> 워크플로우가 소유하는 **canonical Screen ID** 로 잇는 매핑 레지스터다.
> 계약·예시: [`../../docs/reference/screen-identity.md`](../../docs/reference/screen-identity.md).
> 저장 위치(권장): `docs/frontend-workflow/_meta/screen-source-map.md` (validate 가 `_meta/` 를 authoring 검사에서 제외하므로
> 이 표가 artifact_type 검사에 걸리지 않는다 — reconciliation-register 와 같은 meta-register 가족).
>
> **핵심 원칙**: source id 는 **alias/evidence** 이고 canonical identity 가 아니다. canonical identity 는
> 워크플로우가 소유한다 — `screen_id` / `route` / `domain` / ScreenSpec 경로. planning 코드, design 코드,
> Figma node id, slug, input id 는 전부 source alias 다. 이 표는 그 alias 들을 canonical 화면에 **명시적으로** 잇고,
> 애매하면 잇지 않고 ambiguity 로 남긴다.
>
> placeholder `{X}` 는 실제 값으로 치환한다. 매핑이 없으면 표는 헤더만 두면 된다.

| Canonical Screen ID | Domain | Route | ScreenSpec Path | Planning IDs | Design IDs | Figma Node IDs | Source Inputs | Mapping Status | Decision / Notes |
|---|---|---|---|---|---|---|---|---|---|
| {AUTH-SIGNUP-EMAIL} | {auth} | {/signup/email} | {domains/auth/screens/signup-email/screen-spec.md} | {A-001} | {J010} | {1:234} | {IN-20260625-visual-spec-001} | {confirmed} | {- 또는 결정 메모} |

## Mapping Status

reconcile-input·doctor 와 사람이 공유하는 어휘다. (`status` frontmatter 는 표가 아니라 register 문서 자체의 라이프사이클.)

| Status | 의미 | 다음 행동 |
|---|---|---|
| `candidate` | source id ↔ canonical 후보. 아직 사람이 확정 안 함 | 사람이 확인 → `confirmed`, 또는 막히면 Open Decision |
| `confirmed` | source id ↔ canonical 확정. ScreenSpec 이 있거나 곧 만든다 | ScreenSpec 없으면 `workflow:create-screen` 로 stub 생성 |
| `ambiguous` | 같은 source id 가 둘 이상 canonical 후보를 가리키거나 근거 부족 | 자동 선택 금지. `scope-unclear` 로 분류하고 막으면 Open Decision |
| `split` | 한 source code 가 의도적으로 여러 canonical 화면으로 나뉨 | 각 canonical 행에 `split` + 사유. 두 화면 모두 명시 |
| `merged` | 여러 source id 가 한 canonical 화면으로 합쳐짐 | canonical 행 1개에 source alias 들을 모두 나열 |
| `deprecated` | source code 가 사라졌거나 더 이상 쓰지 않음 | alias 는 이력용으로 보존, canonical 행 유지/정리 |

## 다중성 규칙 (multiplicity)

- 한 canonical 화면은 **여러 source alias** 를 가질 수 있다 (planning 코드 + design 코드 + node id 가 한 화면을 가리킴 = 정상).
- 하나의 source code 가 **여러 canonical 화면**을 가리키는 것은 `split` 이거나 명시적으로 정당화된 경우에만 허용한다.
- `split`/`merged` 설명 없이 **같은 source alias 가 여러 canonical 화면에 중복**되면 ambiguous 다 — 자동 라우팅하지 않는다.
- source-specific producer 는 매핑이 ambiguous 일 때 **canonical Screen ID 를 발명하지 않는다**. source id 를 extracted facts 에 남기고 `scope-unclear` 로 reconcile 에 넘긴다.

## 미매핑 / ambiguity 메모

- {새 입력이 들고 온 source code 중 이 표에 없는 것: 후보 행(`candidate`)으로 남기거나 `scope-unclear` 로 reconcile.}
- {같은 design code 가 두 화면에 보이면: `ambiguous`/`split` 으로 표기하고 자동 선택하지 않는다 — 막으면 Open Decision.}
- {route hint 는 evidence 일 뿐 identity 가 아니다 — route 가 같아도 canonical 화면이 다를 수 있다.}

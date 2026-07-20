# Screen Identity

> Consumer reference for how external source screen codes (planning Figma, design Figma, node ids, slugs) map to canonical workflow Screen IDs. It defines the Screen Source Map contract and when to scaffold a ScreenSpec. It does not define source-specific Figma/planning parsers.

> Workflow stage: this is the contract for **Stage 02** ([workflow-stages/02-screen-identity-source-mapping.md](workflow-stages/02-screen-identity-source-mapping.md)) in the [workflow spine](workflow-spine.md). New/unmapped screens resolve identity here before authoring or reconcile.

새 페이지·화면이 기획/디자인 입력에서 들어올 때, 그 입력은 자기만의 화면 코드를 들고 온다. 이 문서는 그 source 코드를 **워크플로우가 소유하는 canonical Screen ID** 로 안전하게 잇는 규칙이다.

## Core Principle

External source ids are **aliases / evidence**, not canonical workflow screen ids.

canonical identity 는 워크플로우가 소유한다:

```text
screen_id            # 전역 유일한 canonical 화면 식별자
route                # canonical 라우트
domain               # 도메인
screen-spec path     # docs/frontend-workflow/domains/{domain}/screens/{screen}/screen-spec.md
route_entry / screen_entry hints
```

planning 코드(`A-001`), design 코드(`J010`), Figma node id(`1:234`), slug, input id 는 전부 **source alias** 다. canonical 화면 하나가 여러 alias 를 가질 수 있고, alias 는 시간에 따라 변한다.

## Why source ids are not identity

source 코드는 믿을 수 있는 키가 아니다.

- **drift** — 기획 Figma 는 `A-001` 을 쓰고, 디자인 Figma 는 접두어를 붙이거나(또는 빼고) `J010` 을 쓴다.
- **duplicate** — 레이어를 복사하면 stale/중복 코드가 따라온다. 서로 다른 제품 화면이 같은 source 코드를 공유할 수 있다.
- **disappear** — 어떤 디자인 프레임은 안정적 코드 없이 node id / slug 만 가진다.
- **copied** — 복사된 화면이 원본의 코드를 그대로 들고 있어 두 화면이 같은 코드를 가리킨다.

그래서 source 코드를 그대로 canonical Screen ID 로 쓰면 서로 다른 화면이 조용히 한 화면으로 합쳐지거나, 한 화면이 두 코드로 갈라진다. **route hint 도 identity 가 아니다** — 라우트가 같아도 canonical 화면이 다를 수 있고(예: 동적 세그먼트), 라우트가 바뀌어도 화면은 같을 수 있다. route 는 evidence 로만 쓴다.

## Screen Source Map

source alias ↔ canonical Screen ID 매핑은 **Screen Source Map** 한 곳에 둔다.

```text
docs/frontend-workflow/_meta/screen-source-map.md
```

템플릿: [`../../templates/meta/screen-source-map.template.md`](../../templates/meta/screen-source-map.template.md). reconciliation-register 와 같은 meta-register 가족이라 `_meta/` 에 두며, `validate` 의 authoring 검사에서 제외된다(artifact_type 검사에 걸리지 않는다).

| 컬럼 | 의미 |
|---|---|
| Canonical Screen ID | 워크플로우가 소유한 화면 id. 정본 키 |
| Domain / Route / ScreenSpec Path | canonical identity 의 나머지 |
| Planning IDs / Design IDs / Figma Node IDs | source alias 들 (한 화면에 여러 개 가능) |
| Source Inputs | 이 매핑을 만든 `input_id` 들 |
| Mapping Status | `candidate` / `confirmed` / `ambiguous` / `split` / `merged` / `deprecated` |
| Decision / Notes | 결정·근거 메모 |

### Mapping Status

```text
candidate   source ↔ canonical 후보. 사람이 아직 확정 안 함.
confirmed   확정. ScreenSpec 이 있거나 곧 만든다(workflow:create-screen).
ambiguous   같은 source 가 여러 canonical 후보를 가리키거나 근거 부족. 자동 선택 금지.
split       한 source code 가 의도적으로 여러 canonical 화면으로 나뉨(사유 기록).
merged      여러 source id 가 한 canonical 화면으로 합쳐짐.
deprecated  source code 가 사라졌거나 더 이상 쓰지 않음(이력 보존).
```

### 다중성 규칙

- 한 canonical 화면은 **여러 source alias** 를 가질 수 있다(정상).
- 하나의 source code 가 **여러 canonical 화면**을 가리키는 것은 `split` 이거나 명시적으로 정당화될 때만 허용.
- `split`/`merged` 설명 없이 **같은 source alias 가 여러 canonical 화면에 중복**되면 ambiguous 다 — 자동 라우팅 금지.
- source-specific producer 는 매핑이 ambiguous 일 때 **canonical Screen ID 를 발명하지 않는다.**

## Resolution Order

매핑은 ScreenSpec 을 만들거나 고치기 **전에** 푸는 것을 원칙으로 한다.

```text
1. 입력의 source 코드를 Screen Source Map 에서 찾는다.
2. confirmed canonical 이 있으면 그 screen_id 를 쓴다.
   - ScreenSpec 이 없으면 workflow:create-screen 으로 stub 을 만든 뒤 내용 반영.
3. 매핑이 ambiguous 면:
   - canonical Screen ID 를 만들지 않는다.
   - scope-unclear 로 분류한다.
   - 구현이 막히면 Open Decision 을 올린다(게이트는 사람이 내린다).
   - 적절하면 candidate 행을 Screen Source Map 에 남긴다.
4. 입력이 분명히 새 화면을 도입하지만 canonical id 가 아직 없으면:
   - candidate 행을 만들고 사람에게 canonical screen_id/route 확인을 받는다.
   - 확정 후 workflow:create-screen 으로 stub 을 만든다.
```

unresolved 매핑은 **identity 발명이 아니라** `scope-unclear` + 필요 시 Open Decision 으로 남긴다. canonical identity 생성은 사람-확인 또는 명시적 `workflow:create-screen`(주어진 canonical id) 둘 중 하나로만 일어난다 — reconcile-input 이 임의로 만들지 않는다. 자세한 reconcile 동작은 [`input-reconciliation.md`](input-reconciliation.md), scaffold 명령은 [`../../COMMANDS.md`](../../COMMANDS.md) 를 본다.

기존 canonical 화면이 다른 active sibling에 흡수된 경우 새 ID를 발명하거나 source alias 상태와
섞지 않는다. source ScreenSpec은 [`screen_lifecycle: absorbed`와 `absorbed_into`](screen-lifecycle.md)로
최종 active canonical target을 직접 가리키고 provenance 파일로 남긴다.

## Examples

**1. 같은 화면을 가리키는 두 source 코드.** 기획 코드 `A-001` 과 디자인 코드 `J010` 이 둘 다 `AUTH-SIGNUP-EMAIL` 을 가리킨다.

```text
| AUTH-SIGNUP-EMAIL | auth | /signup/email | domains/auth/screens/signup-email/screen-spec.md | A-001 | J010 | 1:234 | IN-...-001 | confirmed | - |
```

한 canonical 행에 alias 를 모두 나열한다(merged 축). source 코드가 다르다고 화면을 둘로 만들지 않는다.

**2. 코드 없는 디자인 프레임 → node id + route hint 로 매핑.** 디자인 프레임에 안정적 코드가 없고 node id `1:234` 와 route hint `/signup/email` 만 있다.

```text
| AUTH-SIGNUP-EMAIL | auth | /signup/email | ... | - | - | 1:234 | IN-...-002 | confirmed | node-only frame |
```

node id + route hint 를 evidence 로 써서 기존 canonical 에 잇는다. route hint 는 근거일 뿐 identity 가 아니므로, 같은 route 라도 다른 화면일 가능성을 배제하지 않는다.

**3. 두 디자인 프레임이 같은 코드 `J010` 을 재사용하지만 서로 다른 화면.** 복사된 레이어가 stale 코드를 들고 온 경우다.

```text
| AUTH-SIGNUP-EMAIL | auth | /signup/email | ... | - | J010 | 1:234 | IN-...-003 | ambiguous | J010 도 reset 화면에 보임 |
| AUTH-RESET        | auth | /reset        | ... | - | J010 | 1:888 | IN-...-003 | ambiguous | 같은 코드 충돌 |
```

자동으로 한쪽을 고르지 않는다. `ambiguous` 로 표기하고, 구현이 막히면 Open Decision 으로 올린다. (doctor 가 split/ambiguous 없는 중복 alias 를 경고한다.)

**4. 같은 기획 코드가 구현상 두 화면으로 나뉘어야 함.** 기획 `A-010` 한 코드가 list + detail 두 구현 화면이 된다.

```text
| COUPON-LIST   | coupons | /coupons      | ... | A-010 | - | - | IN-...-004 | split | A-010 = list+detail, split 결정 D-021 |
| COUPON-DETAIL | coupons | /coupons/[id] | ... | A-010 | - | - | IN-...-004 | split | 위와 동일 split |
```

두 canonical Screen ID 를 만들고 양쪽 행에 `split` + 사유(결정 링크)를 남긴다. 이건 의도된 다중성이라 허용된다.

**5. 기존 canonical 화면의 이름/위치 변경.** 화면은 같은데 route/slug 가 바뀐다.

```text
| AUTH-SIGNUP-EMAIL | auth | /auth/signup/email | domains/auth/screens/signup-email/screen-spec.md | A-001 | J010 | 1:234 | IN-...-005 | confirmed | route moved 2026-06 |
```

source alias(`A-001`/`J010`)는 보존하고 route·ScreenSpec 경로만 갱신한다. canonical screen_id 는 유지해 input 이력을 끊지 않는다. (route 변경은 navigation-map/route-tree 와 함께 다룬다 — Screen Source Map 이 navigation-map 을 자동 수정하지 않는다.)

## Boundaries

- 킷은 source-specific Figma/planning 파서를 포함하지 않는다 — alias 추출·해석은 consumer 의 source-specific producer 몫이다.
- `workflow:create-screen` 은 canonical identity 가 확정된 뒤 stub ScreenSpec 만 만든다. canonical id 를 발명하거나, navigation-map 을 자동 수정하거나, Open Decision 을 resolve 하거나, status 를 confirmed 로 올리지 않는다.
- Screen Source Map 일관성은 아직 hard gate 가 아니다 — doctor 가 warning-first 로만 표면화한다.

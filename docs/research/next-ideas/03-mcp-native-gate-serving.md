# MCP-native Gate Serving — 이기종 에이전트가 게이트를 균일하게 소비 — frontend-workflow-kit 투입 아이디어 리서치

> 날짜: 2026-07-05 · status: draft(리서치 산출물, 게이트 아님)
> 이 문서는 리서치 근거일 뿐이며 어떤 것도 게이트하지 않는다. 실제 채택은 별도 Open Decision + 사람 승인을 거친다.

---

## 한 줄 결론

**킷은 이미 이기종 에이전트(canonical Claude skills + Codex 호환 wrapper)에게 소비되고 있고, 모든 소비자가 "`.mjs`를 spawn → `--json` 파싱 → 라우팅"이라는 같은 접착제를 각자 재구현한다.** 이 중복은 킷이 다른 곳에서 싸우는 바로 그 드리프트 위험이다. MCP(Model Context Protocol) 서버는 이 접착제를 **한 곳으로 모으는 얇은 어댑터**다 — `state`/`readiness`/`validate`를 MCP **tool**로, 정본 문서(doc-ownership·spine·정책)를 MCP **resource**로 노출한다. 판정은 여전히 `readiness.mjs` 한 곳(불변식 1)이고 서버는 subprocess로 그 출력을 소비만 한다. **새 축·새 게이트·새 판정을 하나도 추가하지 않으면서 소비 방식만 현대화**하는 제안이다.

이 장은 게이트를 늘리자는 제안이 **아니다**. 오히려 킷의 방어선(불변식 8: 최종 방어선은 npm+CI, 훅은 얇은 wrapper)과 동형으로, MCP 서버를 "훅과 같은 계층의 또 다른 얇은 wrapper"로 두는 것이 핵심 규율이다.

---

## 핵심 주장 검증

| 주장 | 판정 | 근거 (실제 파일) |
|---|---|---|
| 킷은 이기종 에이전트에게 소비된다 — canonical Claude skills(`.claude/skills/`) + Codex 호환 wrapper(`.codex/skills/`) | 확인 | [`../../../AGENTS.md`](../../../AGENTS.md) L3–13: "canonical repo-local agent skills in `.claude/skills/`" + "Local Codex compatibility wrappers may exist under `.codex/skills/` … they mostly mirror the Claude skills" |
| 소비자마다 같은 "spawn + `--json` 파싱" 접착제를 재구현한다 | 확인 | Codex wrapper가 Claude skill을 "mostly mirror"([`../../../AGENTS.md`](../../../AGENTS.md) L10–13)한다는 것 자체가 동일 로직 복제. 실행 계약은 [`../../../frontend-workflow-kit/COMMANDS.md`](../../../frontend-workflow-kit/COMMANDS.md) L9–27의 `npm run workflow:* -- --json`으로 고정 |
| 모든 서빙 대상 스크립트가 CLI/`--json` 계약을 이미 지원한다(불변식 9) | 확인 | [`../../../frontend-workflow-kit/package.json`](../../../frontend-workflow-kit/package.json) L17–36 `scripts`(state/readiness/validate/packet/report/run/route-cross-check/adoption-probe 등) + [`../../../IMPLEMENTING.md`](../../../IMPLEMENTING.md) L96 불변식 9 "스크립트는 --json 모드 지원" |
| 판정은 `readiness.mjs` 한 곳이며 나머지는 소비만 한다(불변식 1) | 확인 | [`../../../IMPLEMENTING.md`](../../../IMPLEMENTING.md) L87 "판정 로직은 한 곳. readiness 판정은 readiness.mjs에만. 훅·스킬은 그 출력을 소비만" |
| 정본 문서에는 "one fact, one home" 지도가 있어 MCP resource 후보가 명확하다 | 확인 | [`../../../frontend-workflow-kit/docs/reference/doc-ownership.md`](../../../frontend-workflow-kit/docs/reference/doc-ownership.md) L25–49 ownership map(stage routing·task-artifact-matrix·generated-files·정책 등 canonical home 표) |
| 킷은 allowlist(`distribution-manifest.yaml`)로 payload만 vendoring하며 전체 repo를 복사하지 않는다 | 확인 | [`../../../frontend-workflow-kit/README.md`](../../../frontend-workflow-kit/README.md) L15–31 "소비 repo에는 `distribution-manifest.yaml` allowlist로 만든 packed payload만 vendoring한다" |
| MCP tool=model-controlled, resource=application-controlled, prompt=user-controlled로 소비 제어권이 분리된다 | 확인 | MCP 스펙 개념(modelcontextprotocol.io). 아래 §2 참조 |
| resolve/confirm/conflict-close는 사람-전용이며 자동화 금지 | 확인 | [`../../../AGENTS.md`](../../../AGENTS.md) L32–33 "Do not resolve Open Decisions or close human-owned gates unless the user explicitly asks" + [`../../../frontend-workflow-kit/README.md`](../../../frontend-workflow-kit/README.md) L9 "Open Decision resolve, confirmed 승격"은 사람 몫 |

관측되지 않은/추정 주장은 §7에 별도로 표기한다(과대주장 금지).

---

## §1. 문제 — 이기종 소비자의 접착제 중복이 곧 드리프트 위험

킷의 신조는 **"판정은 한 곳, 나머지는 소비만"**([`../../../IMPLEMENTING.md`](../../../IMPLEMENTING.md) L87)이다. 그런데 그 "소비" 자체가 지금은 소비자별로 흩어져 있다.

- **canonical Claude skills** (`.claude/skills/`): `SKILL.md`가 `npm run workflow:readiness -- --screen <ID> --json`을 부르고 JSON을 읽어 `allowed_paths`/`forbidden_paths`로 분기한다([`../../../frontend-workflow-kit/COMMANDS.md`](../../../frontend-workflow-kit/COMMANDS.md) L24–26, [`../../../frontend-workflow-kit/README.md`](../../../frontend-workflow-kit/README.md) L207–213).
- **Codex 호환 wrapper** (`.codex/skills/`): AGENTS.md가 명시하듯 이들은 Claude skills를 **"mostly mirror"** 한다([`../../../AGENTS.md`](../../../AGENTS.md) L10–13). "mostly"라는 단어가 문제의 핵심이다 — mirror가 완전하지 않으면 두 소비자가 같은 게이트를 다르게 해석할 여지가 생긴다.
- **미래 소비자**: Cursor, IDE 에이전트, 다른 MCP 클라이언트가 붙으면 각자 또 한 벌의 "spawn `.mjs` → parse `--json` → route"를 재구현해야 한다.

여기서 재구현되는 것은 **판정이 아니라 판정 소비 접착제**다(어느 스크립트를 어떤 인자로 부르고, 어떤 JSON 필드를 읽어, 어떤 분기로 라우팅하는가). 판정 자체는 `readiness.mjs`에 이미 단일화되어 있으므로 안전하지만, 접착제가 N벌로 복제되면:

1. **계약 드리프트**: `readiness --json`의 출력 필드가 진화할 때 N개 소비자를 각자 갱신해야 하고, 갱신이 어긋나면 소비자마다 다른 판정을 본다.
2. **호출 규약 드리프트**: `--root`/`--src`/`--layout`을 언제 넘기는지([`../../../frontend-workflow-kit/COMMANDS.md`](../../../frontend-workflow-kit/COMMANDS.md) L29–31) 같은 운영 규칙이 소비자마다 미묘하게 달라진다.
3. **문서 정본 드리프트**: doc-ownership이 "one fact, one home"([`../../../frontend-workflow-kit/docs/reference/doc-ownership.md`](../../../frontend-workflow-kit/docs/reference/doc-ownership.md))을 강제하는데, 정작 그 문서를 어느 경로에서 읽어오는지는 소비자별로 하드코딩된다.

이 셋은 킷이 다른 표면(frontmatter 파생값 금지·GENERATED 마커·사실의 단일 출처, [`../../../IMPLEMENTING.md`](../../../IMPLEMENTING.md) L88–91)에서 이미 규율로 제거한 것과 **정확히 같은 종류의 드리프트**다. 소비 계층만 예외로 남겨둘 이유가 없다.

---

## §2. MCP 개요 — tools vs resources vs prompts, transport (간단·정확)

Model Context Protocol(MCP, modelcontextprotocol.io)은 에이전트/LLM 클라이언트가 외부 능력을 **표준 JSON-RPC 인터페이스**로 소비하게 하는 개방 프로토콜이다. 서버는 세 가지 primitive를 노출하고, 각 primitive는 **제어 주체가 다르다** — 이 구분이 본 제안의 안전성 핵심이다.

| Primitive | 제어 주체 | 뜻 | 본 킷에서의 매핑 |
|---|---|---|---|
| **Tool** | model-controlled | 모델이 문맥에 따라 스스로 호출 | `state`/`readiness`/`validate` 같은 **읽기·판정 소비** 호출 |
| **Resource** | application-controlled | 클라이언트 앱이 언제/어떻게 넣을지 결정, 모델이 임의로 액션하지 않음 | doc-ownership·spine·정책 같은 **정본 문서** 노출 |
| **Prompt** | user-controlled | 사람이 명시적으로 선택해 트리거 | (선택) 데일리 루프 같은 사람-개시 절차 템플릿 |

핵심은 **tool = 모델이 부를 수 있는 것 / resource = 앱이 넣어주는 읽기 데이터 / prompt = 사람이 고르는 것**이다. resolve/confirm처럼 "사람이 명시적으로 시작해야 하는 전이"는 tool로 노출하면 안 된다(§6에서 상술).

**Transport**: MCP는 두 가지를 표준화한다.

- **stdio**: 같은 머신의 로컬 서버. 클라이언트가 서버 프로세스를 띄우고 표준입출력으로 통신. vendored 킷과 궁합이 좋다(소비 repo 안의 `tools/frontend-workflow/`를 그대로 로컬 실행).
- **Streamable HTTP**(+SSE): 원격/다중 클라이언트. HTTPS 위에서 여러 에이전트가 공유.

**서버는 얇은 어댑터다.** MCP 서버는 능력을 "노출"할 뿐 판정을 소유하지 않는다. 본 제안에서 서버는 `readiness.mjs`를 subprocess로 실행해 그 `--json`을 그대로 되돌려주는 어댑터이며, 그 이상의 로직을 가지지 않는다.

> 출처: [Tools — Model Context Protocol](https://modelcontextprotocol.io/specification/2025-06-18/server/tools), [Resources — MCP](https://modelcontextprotocol.info/docs/concepts/resources/), [Prompts — MCP](https://modelcontextprotocol.info/docs/concepts/prompts/), [MCP Cheat Sheet (2026) — Webfuse](https://www.webfuse.com/mcp-cheat-sheet).

---

## §3. 제안 설계 — 판정은 그대로, 소비만 균일화

### 3.1 아키텍처 한 장

```txt
   ┌─────────────┐   ┌─────────────┐   ┌──────────────┐
   │ Claude Code │   │  Codex CLI  │   │ Cursor / IDE │   ← 이기종 MCP 클라이언트
   └──────┬──────┘   └──────┬──────┘   └──────┬───────┘
          └────────── MCP (JSON-RPC) ─────────┘
                            │  tools / resources
                   ┌────────▼─────────┐
                   │  workflow-mcp    │  ← 얇은 어댑터 (판정 0, 로직 0)
                   │  (subprocess만)  │
                   └────────┬─────────┘
                            │  spawn `node scripts/*.mjs --json`
          ┌─────────────────┼──────────────────┐
     workflow-state     readiness.mjs        validate.mjs   ← 판정 단일출처 (불변식 1)
```

서버는 오케스트레이션도 하지 않는다. 한 tool 호출 = 한 subprocess 실행 = 그 stdout(`--json`)을 구조화해 반환. 이는 execution-loop 연구의 **"판정 재구현 0"** 원칙([`../../../temp/execution-loop-research/SYNTHESIS.md`](../../../temp/execution-loop-research/SYNTHESIS.md) §1: readiness가 판정 단일출처, 나머지는 그 상태를 소비)과 동형이다.

### 3.2 어떤 스크립트가 tool인가

[`../../../frontend-workflow-kit/package.json`](../../../frontend-workflow-kit/package.json) L17–36의 `workflow:*` 스크립트는 모두 `--json`을 지원한다(불변식 9). 서빙 후보를 성격별로 나눈다.

| 스크립트 | 성격 | MCP tool 노출 | 비고 |
|---|---|---|---|
| `workflow:state` | 읽기·상태 스냅샷 | Phase 0 | `_meta/workflow-state.yaml` 재계산([COMMANDS L16](../../../frontend-workflow-kit/COMMANDS.md)) |
| `workflow:readiness` | **판정 소비**(모드·allowed/forbidden) | Phase 0 | 판정 자체는 `readiness.mjs`; 서버는 출력만 반환 |
| `workflow:validate` | 구조 무결성 검사 | Phase 0 | frontmatter·manifest·register 검사([COMMANDS L18](../../../frontend-workflow-kit/COMMANDS.md)) |
| `workflow:route-cross-check` | 읽기·비교 | Phase 1 | 메타 비교, 게이트 아님([COMMANDS L105](../../../frontend-workflow-kit/COMMANDS.md)) |
| `workflow:adoption-probe` | 채택 평가 리포트 | Phase 1 | "review evidence, not a CI hard gate"([COMMANDS L207](../../../frontend-workflow-kit/COMMANDS.md)) |
| `workflow:packet` | readiness 소비 산출물 | Phase 2 | "Packets consume readiness output"([COMMANDS L114–116](../../../frontend-workflow-kit/COMMANDS.md)) |
| `workflow:report` | 리포트 생성 | Phase 2 | packet 기반 리포트 |
| `workflow:run` | packet 흐름 실행 | Phase 2(신중) | 오케스트레이션 성격 — §5·§6에서 경계 |

모든 tool은 **read/analysis 성격**이다. `create-input`/`create-screen`처럼 파일을 쓰는 스크립트, `resolve`/`confirm`/`conflict-close`처럼 게이트를 내리는 전이는 tool 후보에서 **제외**한다(§6).

### 3.3 어떤 정본 문서가 resource인가

doc-ownership map([`../../../frontend-workflow-kit/docs/reference/doc-ownership.md`](../../../frontend-workflow-kit/docs/reference/doc-ownership.md) L25–49)은 이미 "each repeated fact is canonically owned"를 선언한다. 그 canonical home들이 그대로 MCP **resource** 후보다.

| Resource (application-controlled) | Canonical home |
|---|---|
| stage routing | `workflow-spine.md` + `workflow-stages/00-start-here.md` |
| task → secondary artifact | `task-artifact-matrix.md` |
| generated/do_not_edit 권한 | `generated-files.md` |
| doc-ownership map 자체 | `docs/reference/doc-ownership.md` |
| 프로젝트 정책·우선순위 | `docs/frontend-workflow/global/llm-rules.md`([README L67](../../../frontend-workflow-kit/README.md)) |
| 명령 구문 | `COMMANDS.md` |

resource로 노출하면 소비자마다 문서 경로를 하드코딩하지 않고 **application-controlled**로 정본을 당겨쓴다 — "one fact, one home"이 소비 계층까지 연장된다.

> **telemetry와의 합성**: 형제 보고서 [`./01-telemetry-and-promotion-evidence.md`](./01-telemetry-and-promotion-evidence.md)가 제안하는 promotion evidence/telemetry 집계물도 자연스러운 **read-only MCP resource** 후보다 — "지금 이 화면의 승격 근거가 무엇인가"를 이기종 에이전트가 균일하게 조회. 단, telemetry가 게이트를 만들지 않는다는 그 보고서의 경계를 그대로 승계한다(resource는 읽기일 뿐 판정이 아니다).

### 3.4 tool 응답 계약 = 스크립트 `--json`의 pass-through

서버는 응답 스키마를 **새로 정의하지 않는다**. `readiness.mjs`가 내는 `--json` 구조를 그대로 통과시키고, 얇게 감싸는 메타(어떤 스크립트를 어떤 인자로 불렀는지)만 덧붙인다. 이래야 불변식 1이 유지된다 — 서버가 필드를 재해석/재계산하는 순간 "제2의 판정처"가 생기기 때문이다(§4·§6의 최대 리스크).

---

## §4. 불변식 정합성 — MCP 서버는 판정을 재구현하지 않는다(제안의 급소)

| 불변식 / "지금 하지 말 것" | 정합성 | 분석 |
|---|---|---|
| **1. 판정은 readiness.mjs 한 곳, 나머지는 소비만** | 정합(단, 최대 리스크) | 서버는 subprocess로 `readiness.mjs`를 실행하고 출력만 반환. **위험**: 서버가 편의상 판정 로직을 흡수하려는 유혹(§6-1). 규율: 서버 코드에 mode-policy·allowed/forbidden 계산 금지, pass-through만 |
| **2. 파생값 frontmatter 금지** | 무영향 | 서버는 문서를 쓰지 않는다. resource는 읽기 전용 |
| **3. GENERATED 마커** | 무영향 | 서버는 생성물을 만들지 않는다. 생성은 기존 스크립트가 담당 |
| **4. 사실의 단일 출처** | **강화** | resource가 doc-ownership canonical home을 그대로 노출 → 정본이 소비 계층까지 단일화 |
| **5. AsyncState 계약** | 무영향 | 화면 런타임 계약과 무관 |
| **6. confirmed 승격은 사람만** | 정합(규율 필요) | confirm/resolve/conflict-close는 tool로 **절대 노출 금지**([AGENTS L32–33](../../../AGENTS.md)). 읽기 tool만 |
| **7. 멱등** | 정합 | tool은 read/analysis라 부작용 없음. 같은 입력 → 같은 출력. write 스크립트는 서빙 대상 아님 |
| **8. 최종 방어선 npm+CI, 훅은 얇은 wrapper** | **동형** | MCP 서버 = 훅과 같은 계층의 또 다른 얇은 wrapper. 방어선은 여전히 npm scripts + CI. 서버는 방어선이 **아니다** |
| **9. --json + 의존성 최소** | 정합(주의) | tool은 기존 `--json` 계약 재사용. **주의**: MCP SDK 도입이 "의존성 최소" 원칙과 긴장 — §5·§7에서 다룬다 |
| 새 축 금지 | 정합 | 새 판정 축·모드 없음. 기존 축을 그대로 서빙만 |
| 후보 미선택 확장 금지 | 정합 | 새 게이트/후보 없음 |
| 병렬/선행 정본 변경 금지 | 정합 | 정본 문서는 그대로. resource는 읽기 노출일 뿐 |
| **LLM이 게이트 내리는 자동화 금지 (resolve/confirm/conflict-close 사람-전용)** | 정합(급소) | 이 전이들은 **MCP tool로도 노출 금지**. §6-2 |
| Unknown/Conflict/Review 게이트화 금지 | 정합 | 서버는 이 상태들을 읽어 전달만; 새 게이트로 만들지 않음 |

**정직한 평가**: 이 제안의 최대 위험은 기술이 아니라 **유혹**이다. 서버라는 계층이 생기면 "여기서 조금만 계산하면 편하잖아"라는 압력이 상시 존재한다. 그 순간 불변식 1이 깨진다. 따라서 서버는 코드 리뷰·테스트에서 "pass-through 외 로직 0"을 강제해야 하며, 이는 execution-loop 연구가 `verdict`를 사회적 게이트로 만들지 말라고 경계한 것([`../../../temp/execution-loop-research/SYNTHESIS.md`](../../../temp/execution-loop-research/SYNTHESIS.md) §0 코덱스 리뷰 반영)과 같은 규율이다.

---

## §5. 단계적 도입 — read-only 먼저, write/orchestration은 뒤로(또는 영영 아님)

킷의 도입 철학("cold start·점진 도입", [`../../../frontend-workflow-kit/README.md`](../../../frontend-workflow-kit/README.md) L133)을 그대로 따른다.

### Phase 0 — read-only resources + 판정 소비 tools (최소·안전)

- **resources**: doc-ownership map·spine·task-artifact-matrix·generated-files·정책(llm-rules)·COMMANDS를 read-only로 노출(§3.3).
- **tools**: `state`·`readiness`·`validate` 세 개만. 모두 read/analysis, `--json` pass-through.
- **transport**: stdio 우선(vendored 로컬 킷과 궁합, §2).
- **성공 기준**: 한 이기종 클라이언트(예: Codex)가 자기 wrapper의 "spawn+parse" 접착제를 이 서버로 대체하고도 동일 판정을 본다 — 즉 "mostly mirror"의 "mostly"가 사라진다.

### Phase 1 — 읽기 확장

- `route-cross-check`·`adoption-probe` 추가. 둘 다 명시적으로 "review evidence, not a hard gate"([COMMANDS L105, L207](../../../frontend-workflow-kit/COMMANDS.md)).

### Phase 2 — packet/report (신중)

- `packet`·`report` 추가. packet은 readiness 소비물이라 판정을 새로 만들지 않는다([COMMANDS L114–116](../../../frontend-workflow-kit/COMMANDS.md)).
- `run`은 오케스트레이션 성격이라 **신중히** 판단한다(§6-3). 노출하더라도 read/plan 산출까지, 게이트 전이는 절대 포함하지 않는다.

### 절대 하지 않는 것 (모든 Phase 공통)

- `create-input`/`create-screen`(파일 쓰기)·`resolve`/`confirm`/`conflict-close`(게이트 전이)를 tool로 노출하지 않는다.
- 원격 HTTP transport를 인증 설계 없이 먼저 열지 않는다(§6-4).

---

## §6. 리스크

### 6-1. 서버가 logic을 흡수하려는 유혹 (최대 리스크, 불변식 1)

서버 계층은 판정을 재구현하기 가장 쉬운 자리다. 방어: (a) 서버에 mode-policy/allowed-forbidden 계산 코드가 0줄임을 테스트로 고정, (b) 서버 응답은 `readiness.mjs --json`의 superset이 아니라 **동일 필드 pass-through + 호출 메타**로 제한, (c) 코드 리뷰 체크리스트에 "이 서버가 스크립트 없이 답을 만들어낼 수 있는가? 있으면 위반" 항목.

### 6-2. write / 게이트-전이 tool의 위험 (사람-전용 침범)

resolve/confirm/conflict-close는 사람-전용 전이다([`../../../AGENTS.md`](../../../AGENTS.md) L32–33, [`../../../frontend-workflow-kit/README.md`](../../../frontend-workflow-kit/README.md) L9). MCP tool은 **model-controlled**(§2)이므로 이 전이를 tool로 노출하면 "LLM이 게이트를 내리는 자동화"를 정확히 만들어 버린다("지금 하지 말 것" 정면 위반). 규율: 이 전이는 tool·prompt 어느 형태로도 서버에 넣지 않는다. 사람-개시가 꼭 필요하면 MCP **prompt**(user-controlled)로 "사람이 직접 고르는 절차 안내"까지만, 실제 전이는 여전히 사람이 CLI/문서 편집으로 수행.

### 6-3. orchestration tool(`run`)의 경계

`workflow:run`은 여러 단계를 엮는다. 서버가 이를 그대로 노출하면 "얇은 어댑터"가 "오케스트레이터"로 번진다(불변식 8 위반 방향). 방어: `run`은 Phase 2에서도 read/plan 산출까지만, 게이트 전이·write는 절대 미포함. 오케스트레이션 자체는 execution-loop runner([`../../../temp/execution-loop-research/SYNTHESIS.md`](../../../temp/execution-loop-research/SYNTHESIS.md))의 몫이며, 본 MCP 서버는 그것을 **중복하지 않고 합성**한다 — runner도 결국 같은 MCP tool로 판정을 소비하면 접착제가 한 번 더 단일화된다.

### 6-4. 인증 / 원격 transport 위험

원격 HTTP transport(§2)를 열면 다중 클라이언트가 공유하지만 인증·권한 표면이 생긴다. read-only tool이라도 소비 repo의 문서·상태를 노출하므로, Phase 0는 stdio 로컬에 한정하고 HTTP는 인증 설계가 선 뒤에만 별도 사람 결정으로 연다.

### 6-5. 의존성 최소 원칙과의 긴장 (불변식 9)

킷은 의존성을 `yaml` 하나로 억제한다([`../../../frontend-workflow-kit/package.json`](../../../frontend-workflow-kit/package.json) L45–47, 불변식 9 "의존성 최소"). MCP SDK를 도입하면 이 원칙과 긴장한다. 완화안: (a) 서버를 **payload 밖의 선택적 add-on**으로 배포(distribution-manifest allowlist 밖, [README L15–17](../../../frontend-workflow-kit/README.md)) — 킷 코어 의존성은 그대로, (b) 또는 JSON-RPC over stdio를 얇게 직접 구현해 SDK 없이 시작. 어느 쪽이든 **코어 스크립트의 의존성 표면은 건드리지 않는다**.

### 6-6. resource의 신선도(stale) 위험

resource로 노출한 문서가 소비 repo에서 갱신됐는데 서버가 캐시된 사본을 주면 정본이 어긋난다. 방어: resource는 파일을 실시간 읽기(캐시 금지 또는 mtime 무효화), 사본을 서버가 소유하지 않는다("사실의 단일 출처", 불변식 4).

---

## §7. 관측되지 않은/추정 주장 (과대주장 방지)

- **"소비자마다 접착제가 실제로 어긋나 있다"** 는 것은 이 리서치 시점에 코드로 관측한 것이 아니라 "mostly mirror"([`../../../AGENTS.md`](../../../AGENTS.md) L10–13)라는 문서 표현에서 추론한 **위험 가설**이다. `.codex/skills/`는 git-ignore되어 있어([AGENTS L10–11](../../../AGENTS.md)) 실제 drift를 이 세션에서 diff로 확인하지 못했다. 채택 전 실측(현행 Claude/Codex wrapper 대조)을 Open Decision의 근거로 요구한다.
- **MCP SDK vs 직접 구현의 의존성 비용**은 정량 측정하지 않았다(§6-5). 실제 SDK 크기·전이 의존성은 채택 결정 시 실측 필요.
- **형제 보고서 `./01-telemetry-and-promotion-evidence.md`** 는 본 리서치와 병렬로 작성 중이라 이 세션에서 내용을 확정 확인하지 못했다 — telemetry=resource 합성은 개념적 제안이며, 그 보고서의 최종 경계(telemetry가 게이트를 만들지 않음)를 승계한다는 조건부다.
- **modelcontextprotocol.io 1차 스펙 페이지**(concepts/architecture)는 이 세션에서 403으로 직접 페치하지 못했고, primitive 제어권(tool=model / resource=application / prompt=user)과 transport(stdio/streamable HTTP)는 스펙 미러·요약 출처(§2 하단 링크)로 교차확인했다. 개념 수준 인용이며 특정 스키마 버전을 고정 주장하지 않는다.

---

## §8. 남은 사람 결정

1. **채택 여부 자체** — 이 리서치는 게이트하지 않는다. 별도 Open Decision + 사람 승인.
2. **실측 근거 수집** — `.claude/skills/` ↔ `.codex/skills/` 접착제 실제 drift를 diff로 측정(§7 첫 항목)해 문제의 크기를 확정.
3. **SDK vs 직접 구현** — 의존성 최소 원칙(불변식 9)과의 트레이드오프 결정(§6-5).
4. **배포 위치** — payload 안(distribution-manifest allowlist)인가, payload 밖 선택적 add-on인가([README L15–31](../../../frontend-workflow-kit/README.md)).
5. **transport 범위** — Phase 0 stdio 로컬 한정 확정, HTTP는 인증 설계 후 별도 결정(§6-4).
6. **tool 노출 경계 재확인** — write/게이트-전이 스크립트를 영구 제외한다는 규칙을 문서화(§5·§6-2).

---

## 관련 문서

- [`../../../AGENTS.md`](../../../AGENTS.md) — Claude+Codex 이중 skill 호환 스토리("mostly mirror")
- [`../../../frontend-workflow-kit/package.json`](../../../frontend-workflow-kit/package.json) — 서빙 후보 `workflow:*` 스크립트 + 불변식 9 계약
- [`../../../frontend-workflow-kit/COMMANDS.md`](../../../frontend-workflow-kit/COMMANDS.md) — 명령 구문·`--json`·게이트 아님 표현
- [`../../../frontend-workflow-kit/README.md`](../../../frontend-workflow-kit/README.md) — 배포(distribution-manifest)·정본 문서 지도
- [`../../../frontend-workflow-kit/docs/reference/doc-ownership.md`](../../../frontend-workflow-kit/docs/reference/doc-ownership.md) — MCP resource 후보(canonical home)
- [`../../../IMPLEMENTING.md`](../../../IMPLEMENTING.md) §4 — 9개 불변식
- 형제: [`./01-telemetry-and-promotion-evidence.md`](./01-telemetry-and-promotion-evidence.md) — telemetry가 MCP resource가 될 수 있음
- 합성(중복 아님): [`../../../temp/execution-loop-research/SYNTHESIS.md`](../../../temp/execution-loop-research/SYNTHESIS.md) — execution-loop runner의 "판정 재구현 0" 원칙과 동형; runner도 같은 MCP tool로 판정 소비 가능

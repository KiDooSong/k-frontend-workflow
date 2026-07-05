# Canonical-Doc Drift Detector — 정본 드리프트 자동 감지(warning-first) · frontend-workflow-kit 투입 아이디어 리서치

> 날짜: 2026-07-05 · status: draft(리서치 산출물, 게이트 아님)
> 이 문서는 research evidence 일 뿐이다. 어떤 것도 gate 하지 않으며, 실제 도입은 별도 Open Decision + 사람 승인을 따른다.

## 한 줄 결론

킷은 **제품 사실**(zod 스키마·route-tree·component-catalog)에는 "one fact, one home"을 광적으로 강제하면서, 정작 **자기 자신의 governance 문서**(roadmap-current.md · CHANGELOG.md · doc-ownership.md · artifact-manifest.yaml)는 손으로 동기화한다. 그 드리프트는 누군가 수동으로 리콘사일할 때까지 감지되지 않는다(근거: 커밋 `0593bca` 전체가 드리프트 정리 목적으로만 존재). 제안은 기존 `doctor`/`route-cross-check`/`check-generated` 와 **동형의 결정적·읽기 전용·warning-first** 도구 `workflow:doc-drift` 다 — 기계적으로 감지 가능한 드리프트(dead anchor·orphan cross-ref·manifest status↔roadmap 문구 불일치)만 경고로 낸다. **절대 게이트가 아니고**, **내용의 옳고 그름은 판단하지 않는다** — 오직 기계적 정합성만 본다.

---

## 1. 문제 — 정본 드리프트가 "수동 리콘사일"에 의존한다

### 1.1 크럭스: dedup 규칙은 사람 규율일 뿐, 기계 검사가 0이다

킷의 정본 지도인 [`doc-ownership.md`](../../../frontend-workflow-kit/docs/reference/doc-ownership.md) 는 "The dedup rule"을 이렇게 정의한다:

> 같은 문단·표·규칙이 **2개 이상의 skill/doc** 에 나타나면 단일 home 이 없는 것이다. 위 표에서 canonical home 을 고르고(또는 행을 추가), 전체 텍스트를 거기 두고, 나머지 사본은 한 문장 요약 + 링크로 바꿔라.

이건 불변식 4번("사실의 단일 출처 — 문서는 링크/의도만")을 **governance 문서 자신에게** 적용한 규칙이다. 그런데 이 규칙을 지키는지 확인하는 스크립트는 없다. `package.json` 의 스크립트 인벤토리를 보면(readiness·validate·doctor·route-tree·nav-graph·catalog·route-cross-check·check-generated…) **정본 문서 자체의 정합성을 검사하는 도구는 하나도 없다**([package.json](../../../frontend-workflow-kit/package.json)). ownership 표의 링크가 살아 있는지, manifest 의 `status` 가 roadmap 의 "완료/planned" 문구와 맞는지 — 전부 사람 눈에 맡겨져 있다.

즉 킷은 제품 사실의 드리프트는 코드로 막지만, 자기 governance 의 드리프트는 **"다음에 누가 알아채면 고친다"** 는 인간 규율에 걸어 두었다.

### 1.2 스모킹 건: 커밋 `0593bca` 는 드리프트 정리만을 위해 존재한다

`git log` 에서 바로 확인된다:

```txt
0ae501c fix: readiness fail-closed on malformed policy requires ...
0593bca docs: reconcile roadmap/CHANGELOG drift + fix dead doc-map anchors   ← 이 커밋
a669f8b Merge pull request #131 ...
```

커밋 `0593bca "docs: reconcile roadmap/CHANGELOG drift + fix dead doc-map anchors"` 의 `--stat` 은 정확히 세 종류의 드리프트를 손으로 되돌린 흔적이다:

```txt
 IMPLEMENTING.md                            |  2 +-
 frontend-llm-workflow-expanded.md          |  2 +-
 frontend-llm-workflow.md                   |  2 +-
 frontend-workflow-kit-implementation.md    |  2 +-
 frontend-workflow-kit/scripts/validate.mjs |  2 +-
 frontend-workflow-skillpack-concept.md     |  2 +-
 kit-dev/CHANGELOG.md                       | 14 ++++++++++++++
 kit-dev/docs/workflows/mvp-b.md            |  2 +-
 kit-dev/roadmap-current.md                 |  5 +++--
 9 files changed, 24 insertions(+), 9 deletions(-)
```

커밋 메시지가 스스로 밝힌 세 작업:

1. **Dead doc-map anchor** — `README.md#문서-지도` 앵커가 죽어 있었다. 문서 지도가 `README.md` 에서 `docs/reference/doc-ownership.md` 로 옮겨졌는데(progressive-disclosure 리팩터 #109), **7개 활성 문서**가 여전히 옛 `README.md#문서-지도` 앵커를 가리키고 있었다. 실제 diff:

   ```diff
   - > 문서별 역할·링크는 [README 문서 지도](../frontend-workflow-kit/README.md#문서-지도) 참조.
   + > 문서별 역할·링크는 [문서 소유권 지도](../frontend-workflow-kit/docs/reference/doc-ownership.md) 참조.
   ```

   이건 **순수하게 기계적으로 감지 가능한** 드리프트다. 상대 링크의 앵커가 대상 파일의 실제 heading 과 매칭되지 않는다 — 사람 판단이 전혀 필요 없는 종류.

2. **Roadmap↔CHANGELOG 발산** — roadmap 스냅샷이 2026-06-19 에 멈춰 있었고(PR #85~#131 랜딩이 통째로 누락), CHANGELOG 의 Unreleased 는 #105 에서 끊겨 있었다. 사람이 두 문서를 대조해 채웠다.

3. **manifest/주석 status 표기 정합** — validate.mjs 헤더 주석이 "12 hard-gate + check 13(warning-first)"를 명확히 하도록 수정.

핵심: **이 드리프트는 `0593bca` 가 만들어질 때까지 아무 신호 없이 누적됐다.** 7개 파일이 죽은 앵커를 가리키는 상태로 여러 PR 동안 방치됐고, 릴리스 로그가 26개 PR 만큼 뒤처졌다. 감지기가 있었다면 이건 매 세션 경고 한 줄로 드러났을 것이다.

### 1.3 왜 지금 이 관측이 유효한가

킷은 최근 관측 도구 계열(`doctor`·`route-cross-check`·`adoption-probe`·`check-generated`)을 계속 warning-first 로 늘려 왔다. 이들은 전부 "게이트를 내리지 않고 신호만 준다"는 동일 posture 다. 정본 드리프트 감지기는 **그 계열에 딱 들어맞는 빈칸**이다 — 제품 표면이 아니라 governance 표면을 관측 대상으로 삼을 뿐, 도구의 성격(결정적·읽기 전용·exit 0)은 완전히 같다.

---

## 2. 핵심 주장 검증

| 주장 | 판정 | 근거(실제 파일/커밋) |
|---|---|---|
| dedup 규칙은 기계 검사 없는 사람 규율이다 | ✅ 확인 | [`doc-ownership.md`](../../../frontend-workflow-kit/docs/reference/doc-ownership.md) "The dedup rule" — 절차만 서술, enforcing 스크립트 부재 |
| 정본 문서 정합성을 검사하는 도구가 없다 | ✅ 확인 | [`package.json`](../../../frontend-workflow-kit/package.json) scripts — readiness/validate/doctor/route-tree/nav-graph/catalog/route-cross-check/check-generated 중 doc-consistency 도구 0 |
| 드리프트 정리만을 위한 커밋이 실재한다 | ✅ 확인 | `0593bca "docs: reconcile roadmap/CHANGELOG drift + fix dead doc-map anchors"` (9 files changed) |
| dead anchor 가 7개 활성 문서에 방치됐다 | ✅ 확인 | `0593bca` diff — `README.md#문서-지도` → `doc-ownership.md` 를 IMPLEMENTING.md·frontend-llm-workflow(-expanded).md·frontend-workflow-kit-implementation.md·frontend-workflow-skillpack-concept.md·kit-dev/docs/workflows/mvp-b.md·roadmap-current.md 에서 repoint |
| roadmap 이 CHANGELOG 대비 발산해 수동 대조가 필요했다 | ✅ 확인 | `0593bca`: roadmap 스냅샷 06-19→07-03, CHANGELOG Unreleased(#105→#131) 채움 |
| manifest 는 status 라는 기계 진리를 이미 들고 있다 | ✅ 확인 | [`artifact-manifest.yaml`](../../../frontend-workflow-kit/catalog/artifact-manifest.yaml) — `status: active|planned` 필드 계약 명시(예: `eslint-workflow-config: planned`, `route-tree: active`) |
| warning-first·always-exit-0 posture 는 이미 확립된 패턴이다 | ✅ 확인 | [`route-cross-check.mjs`](../../../frontend-workflow-kit/scripts/route-cross-check.mjs) `process.exit(0)` 항상; [`doctor.mjs`](../../../frontend-workflow-kit/scripts/doctor.mjs) "warning-only: exit 0" |
| 의미(semantic) 드리프트까지 잡을 수 있다 | ❌ 아님(범위 밖) | 아래 §3 매트릭스 — 내용 옳고 그름은 사람 판단, 감지기는 기계적 정합만 |

---

## 3. 무엇이 드리프트하나 — 드리프트 종류 매트릭스

정직하게: **드리프트의 일부만 기계로 감지된다.** 감지기의 가치와 한계는 이 표에 다 담긴다.

| 드리프트 종류 | 기계 감지 가능? | 감지 방법 | 오탐 위험 |
|---|---|---|---|
| dead anchor(`file.md#heading` 의 heading 부재) | ✅ 예 | 대상 md 파일을 파싱해 GitHub-slug 규칙으로 heading 집합 생성, 앵커와 대조 | 낮음 — 단, 한글/특수문자 slug 규칙(공백→`-`, 대소문자·기호 처리)을 정확히 구현해야 오탐 없음. 이게 `0593bca` 가 고친 바로 그 드리프트 |
| broken relative link(대상 파일 자체가 없음/이동됨) | ✅ 예 | 링크 경로를 resolve 해 파일 존재 확인(fs) | 매우 낮음 — 순수 존재 검사. 외부 URL·mailto 는 skip |
| orphaned cross-ref(이름 변경된 문서를 가리킴) | ✅ 예(broken link 의 특수형) | 위와 동일 — 대상 경로 부재로 드러남 | 낮음 |
| manifest `status` ↔ roadmap "완료/planned" 문구 | 🔶 부분 | manifest `status` 를 정본으로 읽고, roadmap 이 같은 artifact 를 "완료/active/구현됨"으로 서술하는데 manifest 는 `planned` 면(또는 역) 경고 | 중간 — 문구 매칭이 heuristic. artifact 이름↔산문 매핑이 느슨하면 오탐. Phase 0 에서 제외, 좁은 화이트리스트로 후속 |
| CHANGELOG Unreleased ↔ roadmap 스냅샷 PR 범위 | 🔶 부분 | 양쪽에서 `#NNN` PR 참조를 추출해 집합 차이 보고(한쪽에만 있는 PR) | 중간 — "누락"이 의도적 요약일 수 있음(roadmap 은 요약, CHANGELOG 는 상세). diff 를 경고가 아니라 info 로 |
| GENERATED 마커/파일 헤더 정합 | ✅ 예(이미 존재) | — | — 이미 `check-generated`/validate 검사 6 이 담당. **중복 금지**, 감지기가 손대지 않음 |
| ScreenSpec route ↔ route-tree | ✅ 예(이미 존재) | — | — 이미 `route-cross-check` 가 담당. **중복 금지** |
| 의미 드리프트(문서 서술이 실제 코드 동작과 어긋남) | ❌ 아니오 | 없음 — 내용의 옳고 그름 판단 필요 | — **범위 밖.** 이건 사람/리뷰 몫. 감지기는 절대 이걸 주장하지 않는다 |
| 정본 이관 후 사본 잔존(dedup 규칙 위반) | ⚠️ 이론상 부분 | 동일 문단 fingerprint 중복 탐지 | 높음 — 정당한 요약+링크와 위반 사본을 기계가 구분 못 함. **Phase 0 범위 밖**, 아마 영원히 사람 몫 |

정리: **dead anchor + broken/orphan link 세 줄**이 기계적으로 가장 확실하고 오탐이 거의 없는 감지 대상이다(그리고 그게 `0593bca` 가 고친 실제 드리프트다). manifest↔roadmap status 는 감지 가능하지만 heuristic 이라 후속 단계. 의미 드리프트와 dedup 사본 잔존은 **기계 감지 불가 → 명시적으로 범위 밖**.

---

## 4. 선행 사례 — docs-as-code link check / lint

이 아이디어는 새롭지 않다. docs-as-code 관행에는 정확히 같은 계층의 도구가 표준화돼 있다:

- **Markdown link 체커**(예: `markdown-link-check`, `lychee`, `markdownlint` 의 link rule 계열) — 상대 링크·앵커·외부 URL 의 도달 가능성을 CI 에서 검사. 대개 **경고/리포트로 시작**해 팀이 신뢰를 쌓은 뒤 게이트로 올린다.
- **"docs drift" 관행** — 코드/스키마와 문서가 어긋나는 것을 CI 신호로 잡는 패턴. 흔히 "문서 옳음"이 아니라 "문서 참조 유효성"만 기계로 보고, 내용 정확성은 리뷰에 남긴다.
- **Anchor 검증의 함정** — 여러 링크 체커가 헤딩 slug 규칙(특히 유니코드/CJK·중복 헤딩 접미사 `-1`)에서 미묘한 오탐을 낸다. 이 킷은 한글 헤딩(`#문서-지도`)이 실제 드리프트의 대상이었으므로, slug 규칙을 GitHub 렌더러와 **정확히** 맞추는 게 오탐 회피의 핵심이다.

교훈(킷에 그대로 적용): 이런 도구는 **warning-first 로 시작**하고, slug 규칙을 정확히 구현하며, 외부 네트워크 의존(외부 URL 체크)은 결정성을 깨므로 **로컬 파일 대상만** 검사한다. 이는 킷의 불변식 9(의존성 최소·`--json`)와 정확히 정합한다.

개념적 인용이므로 특정 도구 채택을 제안하지 않는다 — 킷은 이미 자체 결정적 도구 하니스(`scripts/*.mjs` + `scripts/lib/*` + `--test`)를 갖고 있어, 외부 의존 대신 **동형의 in-repo 도구**를 쓰는 게 불변식 8·9 와 맞는다.

---

## 5. 제안 설계 — `workflow:doc-drift`

### 5.1 성격(기존 도구를 그대로 미러)

[`route-cross-check.mjs`](../../../frontend-workflow-kit/scripts/route-cross-check.mjs) 와 [`doctor.mjs`](../../../frontend-workflow-kit/scripts/doctor.mjs) 의 posture 를 **한 글자도 바꾸지 않고** 물려받는다:

- **결정적·멱등** — 같은 tree 를 두 번 돌리면 byte-identical 리포트. 시각·네트워크·랜덤 없음.
- **읽기 전용** — 정본 문서를 **읽기만** 한다. 어떤 파일도 쓰지 않는다(생성 산출물조차 없음 — 순수 리포터).
- **warning-first · always exit 0** — route-cross-check 의 `process.exit(0)`(항상), doctor 의 "warning-only: exit 0, no CI/hard gate promotion" 을 그대로. 불일치가 있든 없든 exit 0.
- **`--json` + 의존성 최소** — 기본은 사람-읽기 경고를 stderr 로, `--json` 은 안정적 JSON 을 stdout 으로(route-cross-check `emitJson` 미러). 새 npm 의존 0(`yaml` 은 이미 존재).
- **조용한 skip** — 검사 대상 파일이 없으면 조용히 skip(route-cross-check·검사 13 동형). cold-start 무차단.

### 5.2 무엇을 검사하나 (Phase 0 확정 범위)

1. **Dead anchor**: 저장소 내 md 파일의 `[텍스트](경로#앵커)` 에서, 대상 md 를 파싱해 heading→slug 집합을 만들고 앵커가 그 집합에 있는지 확인. GitHub slug 규칙(소문자화·공백→`-`·특정 기호 제거·CJK 보존)을 정확히 구현. → `0593bca` 의 `README.md#문서-지도` 드리프트를 잡는다.
2. **Broken relative link / orphan cross-ref**: 상대 경로 링크를 resolve 해 파일 존재 확인. 부재면 경고. 외부 URL(`http(s):`)·`mailto:`·순수 앵커(`#…` 자기참조는 1번에서 처리)는 skip.

이 두 줄이 Phase 0 의 전부다. **오탐이 거의 0 인 검사만** 먼저 낸다.

### 5.3 무엇을 검사하지 **않나** (명시적 비목표)

- **내용의 옳고 그름** — 문서 서술이 코드 동작과 의미적으로 맞는지 절대 판단 안 함(§3 의미 드리프트 = 범위 밖).
- **이미 다른 도구가 담당하는 것** — GENERATED 마커/헤더(→ `check-generated`/validate 검사 6), ScreenSpec route↔route-tree(→ `route-cross-check`). **중복 검사 금지**(불변식 4·7 의 정신 — 검사도 단일 home).
- **dedup 사본 잔존** — 정당한 요약+링크와 위반 사본을 기계가 구분 못 함 → 사람 몫.
- **외부 URL 도달성** — 네트워크는 결정성·멱등성을 깨므로 검사 안 함(불변식 7·9).
- **정본 파일 수정** — 감지기는 리콘사일을 **하지 않는다**. drift 를 고치는 건 여전히 사람(불변식 6 정신 — 판정/승격은 사람).

### 5.4 배치와 배선

- `scripts/doc-drift.mjs`(얇은 CLI) + `scripts/lib/doc-drift.mjs`(순수 로직) + `scripts/lib/doc-drift.test.mjs`(golden fixture) — route-cross-check 의 파일 3분할을 그대로. CLI 는 argv 파싱·출력만, 로직은 lib(테스트가 lib 를 직접 소비).
- `package.json` 에 `"workflow:doc-drift": "node scripts/doc-drift.mjs"` alias(다른 warning-first 도구와 동일 라인). bin 등록은 선택.
- **CI 미배선(의도)** — 최소한 첫 도입은 로컬/수동. 배선하더라도 `continue-on-error`(lint-pack PR-5·route-cross-check 선례). 하드 게이트/required check 승격은 **별도 Open Decision + telemetry** 후에만.

### 5.5 리포트 형태(예시)

`--json` 은 route-cross-check 처럼 **안정 정렬된** 리포트를 stdout 으로 낸다(경로·앵커 순 정렬 → byte-identical 재현). 개념 형태:

```json
{
  "tool": "workflow:doc-drift",
  "ok": true,
  "warning_count": 1,
  "findings": [
    {
      "severity": "warning",
      "check": "dead-anchor",
      "source": "kit-dev/roadmap-current.md",
      "link": "../frontend-workflow-kit/README.md#문서-지도",
      "reason": "target heading slug '문서-지도' not found in README.md"
    }
  ]
}
```

`ok` 는 **항상 true** 다(warning-first — 경고가 있어도 실패가 아니다). doctor 의 리포트 객체(`tool`/`ok`/`warning_count`/`findings[]`)와 동일 골격이라, 이미 있는 리포트 스키마를 그대로 물려받는다. 사람-읽기 모드는 finding 당 한 줄을 stderr 로(`[warning:dead-anchor] roadmap-current.md → README.md#문서-지도 (heading 부재)`), 경고가 없으면 `ok: no doc drift` 한 줄.

### 5.6 telemetry 연결(자매 보고서)

이 감지기의 `--json` 리포트는 그 자체로 하나의 관측 신호다. 자매 보고서 [`./01-telemetry-and-promotion-evidence.md`](./01-telemetry-and-promotion-evidence.md) 의 warning-first 관측 계열과 동형이며, doc-drift 의 경고 카운트(예: dead-anchor 발생 빈도)는 telemetry 가 수집하는 한 신호가 될 수 있다 — "정본 드리프트가 얼마나 자주 어디서 생기나"를 결정론적으로 계량해, 훗날 게이트 승격 여부를 사람이 근거로 판단하게 한다. 둘 다 **결정적·warning-first 관측 도구 계열**이라는 점에서 짝을 이룬다.

---

## 6. 단계적 도입

| Phase | 범위 | posture | 승격 |
|---|---|---|---|
| **Phase 0** | dead anchor + broken/orphan relative link 만 | warning-first, exit 0, CI 미배선(또는 `continue-on-error`) | 없음 |
| **Phase 1** | manifest `status` ↔ roadmap "완료/planned" 문구(좁은 화이트리스트 heuristic) | 여전히 warning-first, info 레벨 | 없음 — telemetry 관찰만 |
| **Phase 2(가정)** | CHANGELOG Unreleased ↔ roadmap PR 범위 diff | info-only | 없음 |
| **(승격은 별도 사안)** | dead-anchor 검사만 hard gate 화 검토 | — | **오직 telemetry + Open Decision + 사람 승인 후** |

순차 원칙(roadmap "지금 하지 말 것" 정합): Phase 0 완결 전 Phase 1 정본(manifest·roadmap 문구 매핑) 을 건드리지 않는다. 각 Phase 는 PR/run-report 정리까지 끝낸 뒤 다음.

---

## 7. 불변식 정합성

IMPLEMENTING.md §4 의 9 불변식 + roadmap "지금 하지 말 것" 대조.

| 불변식 / 금지 | 감지기의 태도 |
|---|---|
| 1. 판정은 readiness.mjs 한 곳 | ✅ 감지기는 **판정하지 않는다** — readiness 에 손대지 않음, 순수 리포터 |
| 2. 파생값 frontmatter 금지 | ✅ frontmatter 안 씀·안 만듦 |
| 3. GENERATED 마커 | ✅ 산출물 자체가 없음(순수 리포터). 마커 검사는 check-generated 몫, 중복 안 함 |
| 4. 사실의 단일 출처 | ✅ **바로 이 불변식을 governance 문서에도 적용**하려는 도구. 링크 유효성만 보고, 새 사실을 만들지 않음 |
| 5. AsyncState | ➖ 무관(문서 도구) |
| 6. confirmed 승격 사람만 | ✅ 아무것도 승격·resolve·confirm 안 함. 드리프트 수정도 사람 |
| 7. 멱등 | ✅ 결정적·멱등(route-cross-check 미러). 네트워크·시각 없음 |
| 8. 최종 방어선 npm+CI, 훅은 얇은 wrapper | ✅ npm alias 로 노출, CLI 는 얇음(로직은 lib). 훅 배선은 후속·선택 |
| 9. `--json` + 의존성 최소 | ✅ `--json` 지원, 새 npm 의존 0 |
| 금지: 새 산출물 축 추가 | ✅ **새 축 없음** — 저작자에게 추가 요구 0. 이미 존재하는 정본 문서를 읽기만 함 |
| 금지: 후보 미선택 확장 | ✅ 관측 도구일 뿐 MVP 확장 아님. 별도 후보로만 다룸 |
| 금지: 병렬/선행 정본 변경 | ✅ Phase 0 는 정본을 안 바꿈(읽기 전용). 순차 원칙 준수 |
| 금지: LLM 이 게이트 내리는 자동화 | ✅ 게이트를 올리지도 내리지도 않음 — always exit 0 |
| 금지: Unknown/Conflict/Review 게이트화 | ✅ drift 를 게이트로 만들지 않음. 경고일 뿐 |

한 줄: **이 도구는 새 축을 만들지 않고, 저작자에게 아무 것도 요구하지 않으며, 게이트를 건드리지 않는다.** 기존 정본을 읽어 기계적 정합성만 경고한다 — 불변식·금지 목록과 정면으로 정합.

---

## 8. 리스크

- **오탐으로 신뢰 상실 (최대 리스크).** 링크 체커의 실패 모드는 slug 규칙 미스매치로 멀쩡한 앵커를 죽었다고 보고하는 것. 한글 헤딩(`#문서-지도`)이 실제 대상이므로 **GitHub slug 규칙을 정확히 재현**하지 못하면 도구가 첫날부터 신뢰를 잃는다. → 완화: Phase 0 를 오탐 최저 검사(파일 존재 + 정확 slug)로 좁히고, golden fixture 로 CJK·중복 헤딩·기호 케이스를 고정.
- **게이트로 승격하려는 유혹.** "이미 잡히는데 왜 안 막나" → route-cross-check·interaction-matrix v2·lint-pack 이 모두 겪은 압력. 규율: **telemetry + Open Decision + 사람 승인 없이는 exit 1 로 올리지 않는다.** always-exit-0 을 코드 주석으로 못박는다(route-cross-check 선례).
- **범위 크립(scope creep).** manifest↔roadmap heuristic 이 유혹적이지만 오탐이 많다. Phase 0 에 넣지 않는다. 의미 드리프트/dedup 사본은 **영원히 범위 밖**임을 문서에 고정.
- **다른 도구와 검사 중복.** GENERATED 마커·route↔route-tree 를 다시 검사하면 "검사의 단일 home" 정신을 스스로 위반. → 명시적 비목표로 배제(§5.3).
- **저비용이지만 저가치일 위험.** dead anchor 는 드물게 생긴다(반증: `0593bca` 는 7개 파일에서 한꺼번에 터졌다). 가치는 "매 세션 0줄, 드리프트 순간 1줄"이라는 **조용한 상시 관측**에 있지, 빈발 경고에 있지 않다.

---

## 9. 남은 사람 결정

이 리서치는 아무 것도 확정하지 않는다. 다음은 사람이 별도 Open Decision 으로 정할 사안:

1. **채택 여부** — 이 감지기를 후보로 승격할지(현재 roadmap "다음 구현 후보"는 순차 진행 중이며 이건 그 큐에 없다). "지금 하지 말 것 — 후보 미선택 확장 금지"에 걸리므로, 착수하려면 명시적 선택이 필요.
2. **Phase 0 범위 동결** — dead anchor + broken link 두 줄로 시작하는 데 동의하는지.
3. **CI 배선 여부** — 로컬-only 로 둘지, `continue-on-error` smoke 로 올릴지.
4. **slug 규칙 정본** — GitHub 렌더러 규칙을 따를지, 별도 명세를 둘지(테스트 골든의 기준).
5. **manifest↔roadmap heuristic 진입 시점** — Phase 1 을 열지, 오탐 우려로 무기한 보류할지.

이 중 어느 것도 LLM 이 자동으로 결정하지 않는다(불변식 6). 이 문서는 그 결정을 위한 **evidence 핸드오프**일 뿐이다.

---

### 부록 — 검증 메모

- 커밋 해시 `0593bca` 및 9-파일 stat 은 `git show --stat 0593bca` 로 직접 확인.
- dead anchor diff(`README.md#문서-지도` → `doc-ownership.md`)는 `git show 0593bca -- kit-dev/roadmap-current.md` / `IMPLEMENTING.md` / `kit-dev/docs/workflows/mvp-b.md` 로 확인.
- "7개 활성 문서"는 `0593bca` stat 에서 앵커 repoint 된 파일 수(IMPLEMENTING.md·frontend-llm-workflow.md·frontend-llm-workflow-expanded.md·frontend-workflow-kit-implementation.md·frontend-workflow-skillpack-concept.md·kit-dev/docs/workflows/mvp-b.md·kit-dev/roadmap-current.md)로 확인.
- warning-first·exit-0 posture 는 `scripts/route-cross-check.mjs`(`process.exit(0)` 항상)·`scripts/doctor.mjs`("warning-only: exit 0") 원문 확인.
- 자매 보고서 `./01-telemetry-and-promotion-evidence.md` 는 본 세션에서 병렬 작성 중 — 상호 참조 링크는 파일명 규약에 따른 것으로, 작성 완료 시 유효.

# Visual Spec Intake Note — {PROJECT_NAME}

<!--
  adoption-probe 가 산출하는 read-only/draft-only 노트. 게이트 트리 밖.
  목적: 이 레포 도입 시 **시각(Figma) 입력을 어떻게 받아 적을지**의 계약을 적는다.
  ★ 핵심 경계(불변식): 킷 core 는 Figma 수집기·디자인-토큰 생성기를 **구현/번들하지 않는다**.
    소비 레포가 *수집한* facts/token-manifest/baseline 을 킷이 *받아 적기만* 한다.
    이 노트는 수집을 시키지 않는다 — "소비 레포가 무엇을 제공하면 킷이 어디에 받아 적는가"만 기술.
  근거: docs/design/drafts/design-token-naming-convention.md (VS-2, W1/W2) ·
        templates/screen/figma-component-mapping.template.md (## Frame · ## Visual Spec · Provenance).
-->

> **Status: PROBE / READ-ONLY — {YYYY-MM-DD}.** 시각 충실도는 **게이트가 아니라 Verification 축 evidence**다.
> 이 노트는 게이트를 신설/상향하지 않는다. confirmed/OD/CI/소스 불변.

## 0. 책임 경계 (한 화면)

| 책임 | 킷 core | 소비 레포 |
|---|---|---|
| Figma **수집**(get_metadata·get_design_context·get_screenshot·get_variable_defs / REST /files·/nodes·/images) | ❌ 안 함 | ✅ 소유 |
| 디자인 토큰 **값·source·생성기**(Style Dictionary/Tokens Studio …) | ❌ 안 함·번들 안 함 | ✅ 소유 |
| 토큰 **manifest**(존재 검사용 ID 목록) | ❌ 생성·추적 안 함 | ⬜ 선택 제공(있으면 W2 가능) |
| 수집된 facts/token/baseline 을 표준 문서에 **받아 적기** | ✅ 표준 계약(figma-component-mapping) | (값을 채움) |

## 1. 소비 레포가 제공하면 → 킷이 받아 적는 위치

> 프로브는 아래 *제공 여부*만 관찰한다. 미제공이면 그 행은 **skip(no-op, 실패 아님)**.

| 소비 레포 제공물 | 형식(소비 레포 소유) | 받아 적는 위치(킷 표준) | 이 레포 제공? |
|---|---|---|---|
| 프레임/노드 식별 | node-id · W×H · mode | figma-component-mapping `## Frame` | {예/아니오} |
| 기계 facts | `implementation-facts.json`(rel 경로 참조만) | `## Frame` 의 `facts {rel}` 마커 | {예/아니오/N/A} |
| baseline 이미지 | `baseline.png`(rel 경로 참조만) | `## Frame` 의 `baseline {rel}` 마커 | {예/아니오} |
| 토큰 ID(시각 값) | `space.4`·`bg.surface`·`raw N` + 출처마커 | `## Visual Spec` 8컬럼 + Provenance | {예/아니오} |
| 토큰 manifest | ID 목록(경로/형식 선언) | (W2 존재검사 입력 — 킷은 읽기만) | {예/아니오} |
| token dialect | separator/scale/aliases | manifest 헤더 또는 dialect 메모 | {예/아니오} |

> file_key·실제 baseline·facts 같은 **비공개 런 산출물은 public 킷에 넣지 않는다**(placeholder 만). 비추적 가능.

## 2. token dialect 선언 스텁 (소비 레포 소유 — 킷 미생성)

> 있으면 W1/W2 정규화에 쓰인다. 없으면 W1 은 권장 문법(점 구분·semantic head)으로 폴백.

```yaml
# (소비 레포 소유. 킷이 생성/번들하지 않음 — 받아 적기만.)
token-dialect:
  separator: "{. | /}"            # 기본 "."
  scale: "{numeric | tshirt}"
  aliases:                        # head 생략/유틸리티 → 네임스페이스
    "{bg.*}": color
    "{p-*}": space
    "{rounded-*}": radius
    "{text-<type>}": type
```

## 3. 검사 위치(W1/W2) — 전부 warning-only, never hard gate

| 검사 | 무엇 | 전제 | 등급 |
|---|---|---|---|
| **W1**(형식) | 토큰 ID 가 §문법/`raw N`/placeholder/enum 중 하나인가 | 문서만(킷 단독) | warning-first |
| **W2**(존재) | 토큰 ID 가 소비 레포 manifest 에 있나(dialect 정규화 후) | **manifest 있을 때만** | warning-only · `figma_mapping_status` 불합치 |

- **W1/W2 구현은 이 세션/프로브 범위 밖**(VS-3 + 명시 지시). 여기선 "어디서 검사할지"만 적는다.
- `figma_mapping_status` readiness fact 는 문서의 **존재/라이프사이클**만 본다 — 시각 *충실도*는 안 본다.
  시각 충실도(픽셀 일치)는 OD-VS-4(비주얼 회귀) = Verification evidence. **게이트 아님.**

## 4. 이 레포 관찰 요약

- Figma source: {제공/없음} · facts: {제공/없음} · baseline: {제공/없음} · token manifest: {제공/없음}.
- 결론: {시각 intake 계약 적용 가능 / 소비 레포 수집물 미제공이라 skip}.
- **프로브가 한 일:** 받아 적는 위치 매핑만. 수집/생성/검증 0(킷 범위 밖).

## 5. 금지 재확인

- 토큰 수집기/생성기 킷 편입 ✗ · 특정 DS token set 정본화 ✗ · 토큰 존재(W2) hard gate ✗ ·
  시각 충실도를 readiness/게이트로 ✗ · confirmed/OD/CI/소스 변경 ✗.

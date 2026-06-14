# Run report — check-generated-files 2.5C (reproduce-to-scratch)

> Status: IMPLEMENTATION (small). Date: 2026-06-14.
> Branch: `feat/mvp-c-check-generated-2-5c` (new, off `main` @ 2.5B).
> Worktree: `../k-frontend-workflow-2-5c` (main checkout left untouched).
> Step: generated-file guard **v1 · 2.5C** — route-tree·nav-graph reproduce-to-scratch 비교.
> Design: [`generated-file-guard-design.md`](../proposals/generated-file-guard-design.md)
> (§4.3-4.4 regenerate · §4.7 CG: 키 · §5 reproduce-not-diff · §A.5 정규화 재사용 · §6 exit/CI posture).

---

## 0. 단계 번호 / 범위

generated-file guard **v1** 의 마지막 슬라이스. 2.5A(skeleton) → 2.5B(discovery) → **2.5C(reproduce)**.

route-tree·nav-graph(selected v1 산출물)을 **임시 디렉토리에 재생성**하고 **커밋된 actual 출력**과
비교한다. 기본 동작이 검사(reproduce-to-scratch)로 바뀐다. `--list` 는 2.5B discovery 를 유지.

---

## 1. 무엇을 했는지

- **`scripts/lib/check-generated-files.mjs`** — `reproduceArtifact(id, {docsDir, srcDir})` 추가:
  - **명시 계약 `V1_REPRODUCE`** 로 생성기를 서브프로세스(`process.execPath`) 호출 — manifest/헤더의
    `command` 문자열을 **파싱/비교하지 않는다**(설계 §2.1, §8.1).
    - route-tree: `--app <src>/app` → `<docs>/_meta/route-tree.txt`.
    - nav-graph: `--docs <docs>` → `<docs>/_meta/nav-graph.yaml`.
  - `os.tmpdir()` scratch 에 **2회 재생성**(결정성 `CG:deterministic`) 후 커밋본과 본문 비교
    (`CG:content`). 정규화는 **`normalizeGeneratedViewText`(CRLF→LF, `\`→`/`)만** — timestamp/date
    정규화 없음(route-tree/nav-graph 는 불필요, 설계 §4.3-4.4). 정규화 원시함수는 골든 하니스의
    것을 **재사용**(설계 §A.5).
  - status: `ok | mismatch | nondeterministic | generator-error | missing-committed | missing-input | skip`.
  - **커밋 트리 불변** — 커밋본은 읽기만, scratch 만 쓰고 `finally` 로 삭제. 자동수정/덮어쓰기 없음.
- **`scripts/check-generated-files.mjs`** — 기본 동작을 **check** 로(선택된 v1 산출물 reproduce),
  `--list` 는 discovery 유지. 요약 tally + `--json` 안정 출력. `--enforce` 는 인지하되 **미구현**
  (안내만, 항상 exit 0).
- **`scripts/lib/check-generated-files.test.mjs`** — reproduce smoke 추가(총 14건):
  route-tree·nav-graph 픽스처 재현(ok), 변조→mismatch 감지, 입력·커밋본 부재→skip, 음성 테스트가
  실제 픽스처를 건드리지 않음(트리 불변) 확인. **CI/package 미배선**.

### CLI 동작 확인
```
# 양성 — 픽스처 재현
$ node scripts/check-generated-files.mjs --docs examples/route-tree/basic-app/docs/frontend-workflow \
      --src examples/route-tree/basic-app/src --artifact route-tree
  [ok] route-tree  (CG:run/output/deterministic/content 전부 ok)   exit 0
$ node scripts/check-generated-files.mjs --docs examples/nav-graph/basic-flow/docs/frontend-workflow \
      --artifact nav-graph
  [ok] nav-graph                                                    exit 0

# 음성 — 커밋본 변조(임시 복사본)
  [mismatch] route-tree  CG:content FAIL line N …                   exit 0  ← warning-first

# 기본(킷 루트, _meta·src/app 없음) — missing-committed 2             exit 0  ← warning-first
#   (active v1 산출물의 커밋본 부재를 surface — 조용히 skip 하지 않음, 설계 §5)
```

---

## 2. 무엇을 하지 않았는지 (deferral / 금지 준수)

- **`--enforce`(exit 1) 미구현** — v1 은 warning-first 만. 도입 애매 → 보류, 후속 과제로 문서화
  (설계 §6, §9 PR G). 도입하더라도 **CI 미배선** 전제. `--enforce` 가 들어오면 안내만 하고 exit 0.
- **CI 변경 없음**(`.github/**` 무수정) · **새 hard gate 없음** · `continue-on-error` 무수정.
- **package.json script 미추가** — 가드 alias 도, 새 테스트도 npm/CI 에 배선하지 않음(`//roadmap` 유지).
- **manifest command ↔ 생성 헤더 `# Command:` 문자열 비교 없음** — 계약 호출로 우회(§2.1).
- **timestamp/date 정규화 없음** — route-tree/nav-graph 에 불필요. 광역 `normalizeText`(ISO 날짜
  마스킹) 사용 안 함(설계 §8.9, §A.5).
- **생성 파일 자동 수정/덮어쓰기 없음** — scratch 에만 재생성, 커밋본 불변.
- **component-catalog / workflow-state / screen-inventory / in-file block 미포함** — discovery 에서
  skip 으로만 분류(생성기 미실행).
- **validate/readiness/workflow-state/forbidden-paths/route-tree/nav-graph 생성기/test-fixtures/
  lib/test-fixture 무수정** · **manifest 필드 무변경** · **validate 검사 종수 증가 없음**.

---

## 3. 결정

1. **명시 계약으로 생성기 호출** — `V1_REPRODUCE` 가 (script, inputFlag, resolveInput, outName)을
   코드로 고정. 헤더/manifest command 문자열에 의존하지 않아 §2.1/§8.1 의 FP 함정을 원천 차단.
   커밋본 위치는 `<docs>/_meta/<outName>` 로 해석(생성기 기본 `--out` 과 동일) — v1 두 산출물이
   모두 `_meta` 밑이라 docs-prefix 논쟁(repo-root eslint 경로)과 무관.
2. **정규화 재사용** — `normalizeGeneratedViewText`/`toPosix` 를 `lib/test-fixture.mjs` 에서 import.
   골든 하니스와 **정확히 같은** 비교 의미(설계 §A.5 "reuse verbatim; do not invent").
3. **warning-first, exit 0 고정** — 검사 결과(mismatch 포함)와 무관하게 exit 0. 설정 오류만 exit 2.
   `report.ok` 는 향후 `--enforce` 가 게이트로 쓸 신호로 남겨 두되 exit 에는 영향 없음.
4. **`--enforce` 보류** — 추가 여부가 애매하므로(하드룰 "애매하면 추가 말 것") 도입하지 않고 후속으로
   문서화. CLI 는 플래그를 인지해 "미구현" 안내만 한다(거짓 게이트 오해 방지).
5. **테스트는 examples 기반 smoke/golden** — 양성·음성·트리불변. on-demand 실행(미배선).

---

## 3.1 Codex 리뷰 반영 (changes-requested 1건)

- **[P2] both-missing 을 skip 으로 숨기지 말 것** (`lib/check-generated-files.mjs`).
  초기 구현은 selected active 산출물의 입력·커밋본이 **둘 다** 없으면 `skip`(=ok 취급)을 반환했다 —
  active 산출물의 커밋본 부재(설계 §5: active + 출력 부재 → 위반)를 조용히 통과시킬 수 있었다.
  **수정:** both-missing 분기를 제거하고, 커밋본 부재는 입력 유무와 무관하게 `missing-committed`
  로 surface 한다(입력도 없으면 `CG:input` 사유를 덧붙임). `skip` 은 이제 v1 계약이 없는 비-v1 id
  (방어적)에서만 발생한다. 단위 테스트도 `missing-committed` 기대로 갱신. warning-first(exit 0)는 유지.

---

## 4. 검증 결과

워크트리(`../k-frontend-workflow-2-5c/frontend-workflow-kit`)에서 실행. `main` 무수정.

| # | 명령 | 결과 |
|---|---|---|
| 1 | `node --check scripts/check-generated-files.mjs` | OK |
| 2 | `node --check scripts/lib/check-generated-files.mjs` | OK |
| 3 | `node --check scripts/lib/check-generated-files.test.mjs` | OK |
| 4 | `node --test scripts/lib/check-generated-files.test.mjs` | **tests 14 / pass 14 / fail 0** (reproduce 포함) |
| 5 | `npm run example:validate` | `OK (검사 12종 통과)` |
| 6 | `npm run example:test` | `PASS (25 fixtures: 24 pass, 1 xfail, 0 fail)` |
| 7 | `npm test` | 위 PASS + node:test `pass 15 / fail 0` |
| 8 | CLI route-tree/nav-graph 픽스처 | 둘 다 `[ok]` · exit 0 |
| 9 | CLI 변조 임시본 | `[mismatch]` 감지 · exit 0(warning-first) |
| 10 | CLI 기본(킷 루트) | `missing-committed 2` surface · exit 0(warning-first) |
| 11 | forbidden-file `git diff`(+route-tree/nav-graph 생성기) | **empty** |

`xfail` 1건은 의도된 witness(`reconcile-input-001`).

---

## 5. 변경 파일

- `frontend-workflow-kit/scripts/check-generated-files.mjs` *(수정 — check 기본 동작 + reproduce 렌더)*
- `frontend-workflow-kit/scripts/lib/check-generated-files.mjs` *(수정 — reproduceArtifact + V1_REPRODUCE)*
- `frontend-workflow-kit/scripts/lib/check-generated-files.test.mjs` *(수정 — reproduce smoke 5건 추가)*
- `frontend-workflow-kit/temp/runs/check-generated-files-2-5c.md` *(신규 — 본 보고)*

추적된 forbidden 파일 수정 0(생성기 route-tree.mjs/nav-graph.mjs 도 무수정 — 서브프로세스 호출만).

---

## 6. 하드룰 준수

| 하드룰 | 상태 | 근거 |
|---|---|---|
| CI 변경 금지 / hard gate 승격 금지 | ✅ | `.github/**` 무수정 · warning-first 유지 |
| package script 추가 보류(추가 시 CI 미배선·warning-first 명시) | ✅ | 미추가(테스트도 미배선) |
| generated file 자동 수정 금지 | ✅ | scratch 에만 재생성 — 커밋본 읽기만 |
| 재생성 결과로 커밋본 자동 덮어쓰기 금지 | ✅ | finally 로 scratch 삭제 · 덮어쓰기 코드 없음 |
| manifest command ↔ 헤더 문자열 비교 금지 | ✅ | 명시 계약 호출 — 문자열 비교 코드 없음 |
| 헤더가 manifest command 와 다르다고 실패시키지 말 것 | ✅ | 헤더 command 자체를 읽지 않음 |
| CRLF/path-sep 만 정규화(timestamp/date 정규화 금지) | ✅ | `normalizeGeneratedViewText` 만 사용 |
| validate 검사 종수 증가 금지 | ✅ | validate.mjs 무수정(검사 12종 그대로) |
| component-catalog/workflow-state/screen-inventory/in-file block 미포함 | ✅ | discovery skip — 생성기 미실행 |
| manifest 필드 변경 금지 | ✅ | `artifact-manifest.yaml` 무수정 |
| route-tree/nav-graph 만 v1 대상 | ✅ | `V1_REPRODUCE`/allowlist 가 두 산출물로 제한 |

---

## 7. v1 마무리 / 후속

generated-file guard **v1(2.5A·2.5B·2.5C) 완료**: discovery + route-tree·nav-graph reproduce-to-scratch
(warning-first). 후속(이번 범위 밖):
- `--enforce`(exit 1) 도입 여부 — FP율 관찰 후 결정(설계 §9 PR G).
- 헤더/마커 무결성 검사(설계 §3), in-file generated block(§4.6), workflow-state `generated_at`
  처리(§4.1), component-catalog(생성기 도입 시 data-driven 승격, §4.5).
- CI warning-first 배선(설계 §9 PR F) — 별도 PR, `continue-on-error: true` 전제.

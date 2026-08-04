# Issue #202-C implementation replay — warning-only semantic drift analyzers

> 최초 실행일: 2026-08-03
> review correction: 2026-08-04
> 범위: `RR-ROUTE-101`, `RR-STALE-101/102/103`의 frozen-corpus validator replay
> baseline: `533d2a69a1cc3b4831b2ebbef7ff0a313ca4c4fe` (PR #216 merge commit)
> stored treatment snapshot: `3199f3f8706a86306c8bdaeb96d5e979f5064e0a`
> precision-fix implementation/tests: `cd269fc98b48db9ab0fb039c003dd2efd3bdac42`
> evidence bundle: [`issue-202-reconciliation-dogfood-001/`](issue-202-reconciliation-dogfood-001/)
> status: **PARTIAL — implementation/model replay. Stale Result historical TP 1건은 평가 가능하지만 routing acceptance evidence와 실제 review-round 비교는 미완료**

## 1. 이 bundle이 입증하는 것과 입증하지 않는 것

이 bundle은 PR #216 baseline validator와 202-C treatment validator를 동일한 frozen v2 corpus에 적용해 다음 구현 동작을 재현한다.

- baseline에는 없던 `RR-ROUTE-101`·`RR-STALE-103` warning이 treatment에서 나타난다.
- 새 warning은 `--enforce`로 error 승격되지 않고 exit 0을 유지한다.
- routing/Result를 정합하게 고친 after corpus에서는 새 warning이 사라진다.
- frozen corpus와 출력은 SHA256 manifest로 고정돼 있다.

하지만 다음 acceptance evidence는 입증하지 않는다.

- 실제 historical consumer routing 문장이 canonical input ID 2개와 현재 marker allowlist를 사용했는지
- treatment가 실제 historical routing finding을 round 0에 잡았는지
- 실제 consumer corpus에서 routing false positive가 몇 건인지
- reviewer가 실제로 발견한 in-scope missed finding 수
- 실제 `reconcile-stage04-v1` review session의 stop round가 감소했는지

routing 문장은 detector 조건을 안 뒤 작성됐다. 따라서 그 결과는 implementation positive fixture와 modeled replay에는 유효하지만, detector와 독립된 historical/live 관측으로 취급할 수 없다.

## 2. Evidence provenance와 분류

### 2.1 Routing case — synthetic structural positive

Issue #202의 LRN-0017은 실제 consumer Stage 04 review가 11라운드로 늘어났고 finding family에 “입력↔입력 상호배타는 Unknown이 아니라 Conflict”가 포함됐다고 기록한다. 다만 private 원문, 당시 canonical input token, lexical marker, 동일 before corpus는 이 저장소에 없다.

`IN-20260803-meeting-101`의 문장은 다음 detector 조건을 재현하도록 새로 작성됐다.

- exact `/NN` bullet
- current input + second canonical input ID
- affirmative `충돌` marker
- 질문·불확실성·부정 없음
- `scope-unclear/scope-unclear` + `unknown:*`

따라서 R1의 정확한 분류는 **synthetic structural positive (detector-shaped)**다. “historical routing TP”라고 세지 않는다. R2/R3도 synthetic negative/corrected controls이며 실제 corpus FP evidence가 아니다.

### 2.2 Stale Result case — real historical upstream finding replay

다음은 저장소에 추적된 사람이 판정한 finding과 correction이다.

- [`temp/runs/reconcile-input-001/reconcile-run-report.md`](../../../temp/runs/reconcile-input-001/reconcile-run-report.md) S5:
  `IN-20260613-api-001`의 Result가 accepted인데 `D-003`이 open인 상태를 substantive divergence로 판정
- [`temp/runs/reconcile-input-002/reconcile-run-report.md`](../../../temp/runs/reconcile-input-002/reconcile-run-report.md):
  같은 입력의 Result를 pending user decision으로 정렬한 뒤 PASS

S1은 이 tracked Decision/Result 상태를 v2 typed corpus로 옮긴 **real historical upstream finding replay**다. 이 범위에서는 `RR-STALE-103`을 TP로 판정할 수 있다.

## 3. Frozen corpus와 무결성

- before corpus tree digest: `85450a41430c355358674e56739dea93fd767d643613c3277e303b0ba5abe8c9`
- after corpus tree digest: `fd1318ad8a377562ade1883292a12b646b75b2b76d0ea065f5fbe42c83313da9`
- file manifest: [`SHA256SUMS`](issue-202-reconciliation-dogfood-001/SHA256SUMS)
- manifest digest: `2d921869318a6d03ec1291a08f559a138ac0356a2b9280f25b34d36973dc1ecd`

Baseline와 treatment는 동일한 before corpus를 읽는다. 교정은 별도의 after corpus에만 있다. 모든 ID와 경로는 공개 fixture 또는 익명 synthetic ID다.

## 4. Case inventory와 올바른 판정

| Case | Corpus classification | Before state | Oracle/source | Treatment output | Evidence verdict |
|---|---|---|---|---|---|
| R1 | synthetic structural positive, detector-shaped | `scope-unclear/scope-unclear`, `unknown:U-901`, exact evidence에 2 canonical input refs + `충돌` | Issue #202 finding family를 바탕으로 detector 조건에 맞춰 재구성 | `RR-ROUTE-101` 1건 | synthetic positive; **TP로 세지 않음** |
| R2 | synthetic negative control | 같은 구조지만 “충돌인지 확인 필요” | 작성된 polarity control | 무발화 | unit/adversarial control; **real FP evidence 아님** |
| S1 | real historical upstream finding replay | `Result=accepted`, typed `D-003`, 현재 Status=open | reconcile-input-001 S5 + reconcile-input-002 correction | `RR-STALE-103` 1건 | **TP** |
| S2 | synthetic current-result control | `Result=pending-user-decision`, typed `D-204`, 현재 Status=open | 현재 상태와 Summary가 정합하도록 작성 | 무발화 | control; real FP evidence 아님 |
| R3 | synthetic corrected control | R1을 `input-input-conflict/conflict:C-901`로 재라우팅 | hard routing 정합 상태 | 무발화 | correction control |
| S3 | historical-shaped corrected control | S1 Summary를 `pending-user-decision`으로 정렬 | tracked correction과 의미 정합 | 무발화 | correction control |

`RR-STALE-101/102`의 precision boundary는 unit/adversarial fixture가 소유한다. 존재하지 않는 historical positive를 만들지 않았다.

## 5. 저장된 baseline/treatment 출력

### Before corpus

Baseline(PR #216):

- errors: 0
- warnings: 0
- exit: 0
- [`baseline-before.json`](issue-202-reconciliation-dogfood-001/outputs/baseline-before.json)

Stored treatment snapshot:

- errors: 0
- warnings: 2
- exit: 0
- `RR-STALE-103` — real historical upstream replay S1
- `RR-ROUTE-101` — synthetic structural positive R1
- [`treatment-before.json`](issue-202-reconciliation-dogfood-001/outputs/treatment-before.json)

Treatment `--enforce`:

- errors: 0
- warnings: 동일한 2건
- exit: 0
- default output과 byte-identical SHA256 `5a357ad066de7dc476ae41ea94e8491dd9b1a4974ff92a0305b9169a7e7845cb`
- [`treatment-before-enforce.json`](issue-202-reconciliation-dogfood-001/outputs/treatment-before-enforce.json)

### After corpus

- R1을 declared conflict routing으로 정렬
- S1 Summary Result를 pending-user-decision으로 정렬
- baseline/treatment 모두 errors 0 / warnings 0 / exit 0

출력:

- [`baseline-after.json`](issue-202-reconciliation-dogfood-001/outputs/baseline-after.json)
- [`treatment-after.json`](issue-202-reconciliation-dogfood-001/outputs/treatment-after.json)

이 출력은 analyzer wiring, warning-only severity, correction silence의 reproducible witness다. 실제 routing corpus precision이나 실제 review convergence의 witness는 아니다.

## 6. Modeled review replay — 실제 round 측정과 구분

기존 문서의 `2 → 1` 표는 live reviewer session이 아니라 source/synthetic oracle을 이용한 **modeled review replay**다.

| Modeled metric | Baseline | Treatment |
|---|---:|---:|
| round 0 validator output | 0 | 2 (historical stale 1 + synthetic routing 1) |
| modeled reviewer round 1 추가 항목 | 2 | 0 |
| modeled correction 후 stop round | 2 | 1 |

이 표에서 `reconcile-stage04-v1`의 batch finding과 stop condition을 절차적으로 적용했지만, 별도 reviewer가 실제 consumer diff를 blind-review한 것이 아니다. 따라서 “review round 감소 evidence”가 아니라 “warning을 먼저 소비한다고 가정한 modeled consequence”로만 읽는다.

실제 측정값:

| Acceptance metric | Result |
|---|---|
| actual consumer baseline stop round | Not evaluated |
| actual consumer treatment stop round | Not evaluated |
| actual reviewer round 1 added in-scope findings | Not evaluated |
| actual routing FP | Not evaluated |
| actual routing missed | Not evaluated |
| independent human oracle | Not available |

## 7. TP / FP / missed 요약

평가 가능한 실제/역사적 evidence만 세면:

- TP: **1** — `RR-STALE-103`의 tracked upstream historical replay
- routing TP: **Not evaluated**
- real-corpus FP: **Not evaluated**
- real-corpus missed: **Not evaluated**
- synthetic positive: **1** — R1
- synthetic controls: R2/S2/R3/S3

synthetic control에서 warning이 없었다는 사실은 regression test에는 유효하지만, 실제 corpus의 FP=0을 의미하지 않는다.

## 8. 남은 실제 dogfood requirement

Issue #202 close를 다시 검토하려면 최소 다음이 필요하다.

1. detector 조건을 보고 새로 작성하지 않은 privacy-safe historical/live routing sample
2. 실제 문장의 canonical ID/marker/polarity 특징을 유지한 사전 정의 anonymization 또는 salted correspondence
3. 동일 frozen candidate에 대한 PR #216 baseline과 현재 treatment 실행
4. analyzer 작성과 독립된 human reviewer의 TP/FP/Missed 판정
5. 최소 한 개 이상의 실제 negative routing candidate
6. `reconcile-stage04-v1` batch finding 규칙과 stop condition을 실제 review session에서 사용한 기록
7. consumer baseline/treatment 또는 vendored-kit integrity를 재현할 commit/manifest 정보

현재 연결된 저장소에서는 이 workflow를 vendored한 consumer checkout과 해당 historical Stage 04 corpus를 식별하지 못했다. private 원문이나 provenance를 발명하지 않는다.

## 9. Issue #202 판단

구현 상태:

- `RR-ROUTE-101` 구현 및 precision/adversarial fixtures 완료
- `RR-STALE-101/102/103` 구현 완료
- warning-only / `--enforce` 비승격 / v1 silence / public JSON shape compatibility 유지
- stale Result historical replay TP 1건 보유

Acceptance evidence 상태:

- actual historical/live routing TP: 미완료
- real-corpus FP/missed: 미완료
- actual review stop-round comparison: 미완료
- independent human dogfood judgment: 미완료

따라서 PR #217은 **`Refs #202`**로 연결하고 Issue #202는 open으로 유지한다. 이 bundle은 hard/CI/readiness promotion의 근거가 아니며, warning의 승격은 별도 사람 승인이다.

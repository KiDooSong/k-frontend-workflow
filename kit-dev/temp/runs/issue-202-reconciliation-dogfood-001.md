# Issue #202-C historical/reproducible dogfood — warning-only semantic drift analyzers

> 실행일: 2026-08-03
> 범위: `RR-ROUTE-101`, `RR-STALE-101/102/103` 중 bounded corpus에서 재현 가능한 routing/stale positive와 negative controls
> baseline: `533d2a69a1cc3b4831b2ebbef7ff0a313ca4c4fe` (PR #216 merge commit)
> treatment implementation commit: `3199f3f8706a86306c8bdaeb96d5e979f5064e0a`
> evidence bundle: [`issue-202-reconciliation-dogfood-001/`](issue-202-reconciliation-dogfood-001/)
> verdict: **PASS — 두 source-backed in-scope finding을 round 0에 표면화, FP 0, bounded-oracle missed 0; hard promotion 없음**

## 1. 이 증거가 말하는 것과 말하지 않는 것

이 run은 private consumer 원문을 upstream에 복사하지 않는다. 대신 다음 두 historical source에서
**이번 202-C 범위에 해당하는 최소 구조만 익명화해 frozen v2 corpus로 재현**했다.

1. **Routing historical finding — maintainer source-backed, anonymized reconstruction**
   - [Issue #202](https://github.com/KiDooSong/k-frontend-workflow/issues/202)의 LRN-0017 근거는 실제 consumer
     Stage 04 review가 11라운드로 늘어났고, 그 finding family에 “입력↔입력 상호배타는 Unknown이 아니라
     Conflict” routing이 포함됐다고 기록한다.
   - private 문장·사내 이름·경로는 보존하지 않았다. corpus의 `IN-20260803-meeting-101`은 그 판정 조건만
     재현한 **anonymized historical reconstruction**이다. raw consumer corpus의 실제 TP라고 부르지 않는다.

2. **Stale Result historical finding — tracked upstream dry-run**
   - [`temp/runs/reconcile-input-001/reconcile-run-report.md`](../../../temp/runs/reconcile-input-001/reconcile-run-report.md)
     S5는 `IN-20260613-api-001`의 Result가 accepted인데 D-003이 open인 상태를 substantive divergence로 판정했다.
   - [`temp/runs/reconcile-input-002/reconcile-run-report.md`](../../../temp/runs/reconcile-input-002/reconcile-run-report.md)는
     같은 입력에서 Result를 pending user decision으로 정렬한 뒤 PASS를 기록한다.
   - corpus는 이 tracked finding의 typed Decision/Result 상태를 v2 register로 옮긴 **real historical upstream finding replay**다.

따라서 이 결과는 **이번 두 analyzer가 담당하는 finding family를 round 0으로 당긴다**는 증거다. 실제 private
consumer의 전체 11라운드 세션을 동일 원문으로 재실행한 것이 아니며, “11 → 1”로 줄었다고 주장하지 않는다.

## 2. Frozen corpus와 무결성

- before corpus tree digest: `85450a41430c355358674e56739dea93fd767d643613c3277e303b0ba5abe8c9`
- after corpus tree digest: `fd1318ad8a377562ade1883292a12b646b75b2b76d0ea065f5fbe42c83313da9`
- file manifest: [`SHA256SUMS`](issue-202-reconciliation-dogfood-001/SHA256SUMS)
- manifest digest: `2d921869318a6d03ec1291a08f559a138ac0356a2b9280f25b34d36973dc1ecd`

Baseline와 treatment는 **동일한 before corpus**를 읽는다. 교정은 별도의 after corpus에만 있고, validator 비교
사이에 candidate 문서를 바꾸지 않았다. 모든 input ID와 경로는 공개 fixture 또는 안정된 익명 ID다.

## 3. Corpus 구성과 source-backed 판정

| Case | Corpus classification | Before state | Source-backed oracle | Expected treatment | 판정 |
|---|---|---|---|---|---|
| R1 | historical finding + anonymized structural reconstruction | `scope-unclear/scope-unclear`, `unknown:U-901`, exact evidence에 현재 input + 기존 input + affirmative `충돌` | Issue #202/LRN-0017의 Unknown↔Conflict routing finding family | `RR-ROUTE-101` 1건 | TP |
| R2 | negative control | 같은 구조지만 “충돌인지 확인 필요” | 질문형/불확실성은 Conflict 단정이 아님 | 무발화 | TN |
| S1 | real tracked historical upstream finding replay | `Result=accepted`, typed `D-003`, 현재 Status=open | reconcile-input-001 S5 substantive + reconcile-input-002 correction | `RR-STALE-103` 1건 | TP |
| S2 | current-result negative control | `Result=pending-user-decision`, typed `D-204`, 현재 Status=open | 현재 상태와 Summary가 일치 | 무발화 | TN |
| R3 | corrected control | R1을 `input-input-conflict/conflict:C-901`로 재라우팅 | declared routing이 정합 | 무발화 | TN |
| S3 | corrected control | S1 Summary를 `pending-user-decision`으로 정렬 | open Decision과 Summary가 정합 | 무발화 | TN |

`RR-STALE-101/102`의 full precision boundary는 unit/adversarial fixture가 소유한다. 이 bounded historical replay는
실제 source-backed stale positive인 `RR-STALE-103` 하나를 사용하며, 존재하지 않는 과거 101/102 사례를 만들지 않았다.

## 4. 실행 명령

독립 worktree 두 개에 dependencies를 설치한 뒤 다음으로 재현한다.

```bash
git worktree add /tmp/kfw-202-baseline 533d2a69a1cc3b4831b2ebbef7ff0a313ca4c4fe
git worktree add /tmp/kfw-202-treatment 3199f3f8706a86306c8bdaeb96d5e979f5064e0a
(
  cd /tmp/kfw-202-baseline/frontend-workflow-kit
  npm ci
)
(
  cd /tmp/kfw-202-treatment/frontend-workflow-kit
  npm ci
)

bash kit-dev/temp/runs/issue-202-reconciliation-dogfood-001/replay.sh \
  /tmp/kfw-202-baseline \
  /tmp/kfw-202-treatment
```

스크립트는 before corpus를 baseline/default treatment/`--enforce` treatment로 실행하고, after corpus를 두
validator로 다시 실행한다. 검토된 출력은 [`outputs/`](issue-202-reconciliation-dogfood-001/outputs/)에 고정했다.

## 5. Baseline / treatment 결과

### Round 0 — before corpus

Baseline(PR #216):

- errors: 0
- warnings: 0
- exit: 0
- 출력: [`baseline-before.json`](issue-202-reconciliation-dogfood-001/outputs/baseline-before.json)

Treatment(PR #217 candidate):

- errors: 0
- warnings: 2
- exit: 0
- `RR-STALE-103` — `IN-20260613-api-001`, open `D-003`
- `RR-ROUTE-101` — `IN-20260803-meeting-101#01`, `U-901`, exact evidence, distinct input refs 2개, marker `충돌`
- 출력: [`treatment-before.json`](issue-202-reconciliation-dogfood-001/outputs/treatment-before.json)

Treatment `--enforce`:

- errors: 0
- warnings: 동일한 2건
- exit: 0
- default treatment output과 byte-identical SHA256
  `5a357ad066de7dc476ae41ea94e8491dd9b1a4974ff92a0305b9169a7e7845cb`
- 출력: [`treatment-before-enforce.json`](issue-202-reconciliation-dogfood-001/outputs/treatment-before-enforce.json)

### Correction / stop check — after corpus

- R1: `input-input-conflict/conflict:C-901`로 정렬
- S1: Summary Result를 `pending-user-decision`으로 정렬
- negative controls는 변경하지 않음

Baseline와 treatment 모두 errors 0 / warnings 0 / exit 0이다.

- [`baseline-after.json`](issue-202-reconciliation-dogfood-001/outputs/baseline-after.json)
- [`treatment-after.json`](issue-202-reconciliation-dogfood-001/outputs/treatment-after.json)

## 6. Review replay와 stop condition

이 표의 round는 live private consumer 세션이 아니라 **source-backed bounded review replay**다.
`reconcile-stage04-v1`의 필수 finding 일괄 제출과 stop condition을 적용했다.

| 지표 | Baseline | Treatment |
|---|---:|---:|
| round 0 validate가 표면화한 in-scope finding | 0 | 2 |
| reviewer round 1에 추가된 in-scope finding | 2 (한 batch) | 0 |
| 교정 후 첫 stop round | 2 | 1 |
| FP | 0 | 0 |
| bounded-oracle missed | 0 | 0 |
| Non-evaluable | 0 | 0 |

Baseline replay:

1. round 0 validate는 두 semantic drift를 보지 못한다.
2. round 1 reviewer가 source-backed oracle의 R1/S1 두 finding을 **한 batch**로 제출한다.
3. after corpus로 교정한다.
4. round 2에서 hard error, warning, 추가 in-scope finding이 없어 stop condition을 충족한다.

Treatment replay:

1. round 0 validate가 R1/S1 두 finding을 함께 경고한다.
2. reviewer 전에 after corpus로 교정한다.
3. round 1 reviewer가 추가 in-scope finding을 찾지 못하고 stop condition을 충족한다.

개선은 bounded replay의 stop round `2 → 1`, round-0 finding `0 → 2`, reviewer round-1 추가 finding
`2 → 0`이다. 실제 LRN-0017의 11라운드 전체 중 다른 finding family까지 줄였다는 증거는 아니다.

## 7. TP / FP / missed 판정 근거와 한계

- TP 2: R1은 maintainer-authored Issue #202의 historical routing 판정, S1은 tracked run report의 substantive 판정과
  corrected rerun을 oracle로 삼았다.
- FP 0: 질문형 routing negative, current open-Decision Result, corrected routing/Result에서 warning이 없었다.
- missed 0: bounded oracle가 지정한 202-C in-scope finding은 R1/S1 두 건이고 treatment가 둘 다 round 0에 냈다.
- 이 판정은 **새 독립 blind human review가 아니다**. 이미 사람이 유지한 issue/report 판정을 익명 corpus에 투영한
  maintainer-source-backed replay다. raw private consumer 원문이 없으므로 lexical coverage나 실제 corpus prevalence를
  평가하지 않는다.
- 이 evidence는 warning의 hard 승격, required CI, readiness fact 추가를 정당화하지 않는다. promotion은 별도 사람 결정이다.

## 8. Issue #202 판단

202-A/202-B, parser hardening, review profile에 더해 이번 PR은 정확히 다음을 완료한다.

- `RR-ROUTE-101`
- `RR-STALE-101/102/103`
- warning-only / `--enforce` 비승격 / v1 silence / JSON shape compatibility
- source-backed historical/reproducible baseline-treatment evidence
- TP/FP/missed bounded 판정
- batch finding 및 stop condition replay
- 이번 두 finding family의 first-round/stop-round 개선

따라서 PR #217은 **`Closes #202`**로 연결할 수 있다. 단, 이 결론은 “모든 reconcile review가 1라운드가 된다”거나
warning을 hard gate로 승격할 수 있다는 뜻이 아니다. 새로운 live consumer corpus에서 precision drift가 관측되면 별도
follow-up issue로 다루고, #202의 완료 범위를 소급 확장하지 않는다.

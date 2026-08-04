from pathlib import Path
import re


def sub_once_or_present(path, pattern, replacement, present_marker, *, flags=0):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if present_marker in text:
        return
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{path}: expected one replacement, got {count}')
    p.write_text(updated, encoding='utf-8')


def replace_once_or_present(path, old, new, present_marker):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if present_marker in text:
        return
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one exact block, got {count}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')


sub_once_or_present(
    'frontend-workflow-kit/docs/reference/input-reconciliation.md',
    r"- `RR-ROUTE-101`: trusted `scope-unclear/scope-unclear` item.*?validator는 rewrite/create/close하지 않는다\.",
    """- `RR-ROUTE-101`: 같은 input의 Summary projection과 item group이 모두 trusted인
  `scope-unclear/scope-unclear` item이 `unknown:*` target을 갖고, exact `/NN` Evidence의 visible prose에서
  Evidence input을 포함한 distinct canonical input이 2개 이상이며 affirmative conflict marker가 발견된 경우다.
  input token은 검사 11과 같은 shared `INPUT_ID_PATTERN`
  (`IN-{YYYYMMDD}-{lowercase-source}-{NNN+}`)을 통과해야 하고, Evidence pointer와 visible prose의 각 input ID가
  shared input index에서 정확히 한 artifact로 해소돼야 한다. URL·파일 경로·`{input_id}.md`·대문자 source·짧은
  sequence·underscore/dot suffix 같은 lookalike는 source로 세지 않는다. Korean marker는 `충돌`, `상충`,
  `양립 불가`, `양립할 수 없`, `서로 모순`, `동시에 만족할 수 없`; English marker는 `conflict`,
  `conflicts with`, `contradict`, `contradicts`, `contradictory`, `mutually exclusive`, `incompatible`,
  `cannot both`다. 질문·불확실성·명시적 부정은 marker가 놓인 local clause에서 판정하므로, 다른 clause의
  unrelated negation은 실제 affirmative marker를 숨기지 않는다. `different`/`mismatch`/`vs`/`불일치` 같은
  약한 표현은 억제한다. 같은 input의 untrusted Summary는 candidate-local suppress하지만, 다른 input의 hard error로
  모든 analyzer를 전역 disable하지 않는다. reviewer는 실제 input↔input 충돌인지와
  Basis/Classification/Conflict target만 재검토하며 validator는 rewrite/create/close하지 않는다.""",
    '검사 11과 같은 shared `INPUT_ID_PATTERN`',
    flags=re.S,
)

sub_once_or_present(
    'kit-dev/docs/design/drafts/issue-202-reconciliation-contract-v2.md',
    r"## Implementation status \(2026-08-03\)\n.*?> 최초 작성일: 2026-07-20 · 현재 확인일: 2026-08-03\n",
    """## Implementation status (2026-08-04)

- 작업 시작 `main` SHA는 `533d2a69a1cc3b4831b2ebbef7ff0a313ca4c4fe`이며, PR #216 merge commit과 동일하다.
- PR #205/#207/#208/#212로 Reconciliation Contract v2 구조·참조·routing hard enforcement,
  Stage 04 `reconcile-stage04-v1`, Markdown AST hardening, CRLF 회귀 수정이 완료됐다.
- PR #216(`533d2a69a1cc3b4831b2ebbef7ff0a313ca4c4fe`)으로 202-B provenance floor가 완료됐고
  Issue #209는 closed다. `input_contract: 2`, `reconciliation_contract: 2`,
  `provenance_contract: 1`은 계속 독립 계약이다.
- PR #217은 202-C 구현 범위를 `RR-ROUTE-101`과 Decision 기반 `RR-STALE-101/102/103`으로 고정한다.
  모두 검사 12 warning이며 `--enforce`로 승격되지 않는다.
- review follow-up에서 `RR-ROUTE-101` precision을 강화했다. input token은 검사 11의 shared
  `INPUT_ID_PATTERN`을 사용하고 shared input index에서 unique하게 해소되는 ID만 센다. 파일명·URL·noncanonical
  lookalike는 배제하며, 같은 input의 `summaryTrust`가 false면 candidate-local suppress한다. marker polarity는
  local clause에서 질문·불확실성·marker별 부정을 판정한다.
- visual behavior leakage keyword warning은 초기 202-C에서 제외한다. 선언된
  `Basis=visual-evidence`의 behavior target은 이미 `RR-ROUTE-004` hard rule이 소유하고, 자유서술 keyword만으로
  추가 warning을 낼 정밀도 근거가 아직 없다. 별도 고정밀 누락이 dogfood에서 확인될 때 follow-up으로만 검토한다.
- [`issue-202-reconciliation-dogfood-001.md`](../../temp/runs/issue-202-reconciliation-dogfood-001.md)는
  implementation/model replay로 유지한다. tracked `reconcile-input-001` S5와 `reconcile-input-002` correction을
  옮긴 stale Result 사례만 real historical upstream TP로 평가 가능하다. routing 사례는 detector 조건을 안 뒤 작성한
  **synthetic structural positive**이며 실제 historical/live TP, real-corpus FP/missed, 실제 review-round 감소의 증거가 아니다.
- 현재 연결된 저장소에서 이 workflow를 vendored한 consumer checkout과 privacy-safe historical Stage 04 corpus를
  식별하지 못했다. 따라서 실제 routing sample의 baseline/treatment, 독립 human TP/FP/missed, 실제 batch finding과
  stop round 비교가 남아 있다.
- PR #217의 기본 연결은 `Refs #202`이고 Issue #202는 open으로 유지한다. hard/CI/readiness promotion은 여전히
  별도 사람 승인이다.

> 상태: 202-C implementation 및 precision review fix 완료 · actual consumer dogfood evidence 대기 · Issue #202 open
> 기준 저장소: `KiDooSong/k-frontend-workflow`
> 작업 시작 브랜치: `main` (`533d2a69a1cc3b4831b2ebbef7ff0a313ca4c4fe`)
> 역사적 초기 확인점: `fa9fc6b`(현재 기준 SHA가 아님)
> 대상 이슈: `#202 reconcile 계약 불변식이 validate 미강제 → LLM 리뷰 O(n) 라운드 팽창`
> 제안 위치: `kit-dev/docs/design/drafts/issue-202-reconciliation-contract-v2.md`
> 최초 작성일: 2026-07-20 · 현재 확인일: 2026-08-04
""",
    '## Implementation status (2026-08-04)',
    flags=re.S,
)

replace_once_or_present(
    'kit-dev/docs/design/drafts/issue-202-reconciliation-contract-v2.md',
    """| Input data | 이미 파싱된 Summary/Items group, shared input index, exact `/NN` AST-visible Evidence text, target index |
| Positive condition | trusted group·unknown target·exact bullet + distinct canonical input 2개 이상 + affirmative marker |
| Suppression | 질문/불확실성/부정/약한 표현, section-only/out-of-range, duplicate input/owner/row, 관련 hard-invalid 구조, 이미 conflict basis |""",
    """| Input data | 이미 파싱된 Summary/Items group, 검사 11과 공유하는 `INPUT_ID_PATTERN`, shared input index, exact `/NN` AST-visible Evidence text, target index |
| Positive condition | 같은 input의 trusted Summary·group·unknown target·exact bullet + index에서 unique하게 해소되는 distinct canonical input 2개 이상 + affirmative marker |
| Suppression | marker-local 질문/불확실성/부정/약한 표현, URL·파일명·noncanonical input lookalike, section-only/out-of-range, duplicate/missing input·owner·row, 같은 input의 untrusted Summary/item projection, 이미 conflict basis |""",
    '같은 input의 trusted Summary·group·unknown target',
)

sub_once_or_present(
    'kit-dev/docs/design/drafts/issue-202-reconciliation-contract-v2.md',
    r"초기 기본 연결은 `Refs #202`였으나, PR #217은 maintainer-source-backed historical finding을.*?warning hard/CI/readiness promotion은 언제나 별도 사람 승인이다\.",
    """기본 연결은 `Refs #202`다. PR #217의 frozen bundle은 warning-only 구현과 동일-corpus validator output을
재현하는 model replay다. stale Result 사례는 tracked upstream historical finding으로 TP 판정이 가능하지만, routing 사례는
heuristic 조건을 안 뒤 만든 synthetic structural positive여서 실제 historical/live routing TP·real-corpus FP/missed·실제
review-round 감소를 입증하지 못한다. privacy-safe consumer corpus의 baseline/treatment와 독립 human 판정, 실제 batch
finding/stop condition 기록이 추가될 때까지 Issue #202는 open으로 유지한다. warning hard/CI/readiness promotion은
언제나 별도 사람 승인이다.""",
    '실제 historical/live routing TP·real-corpus FP/missed',
    flags=re.S,
)

sub_once_or_present(
    'kit-dev/CHANGELOG.md',
    r"- 검사 12의 Contract v2 advisory 단계에 `RR-ROUTE-101`을 추가했다\..*?item당 1건으로 dedupe한다\.",
    """- 검사 12의 Contract v2 advisory 단계에 `RR-ROUTE-101`을 추가했다. 같은 input의 Summary와 item projection이
  trusted인 `scope-unclear/scope-unclear` + `unknown:*` candidate만 보며, exact `/NN` Evidence의 visible prose에서
  검사 11과 공유하는 `INPUT_ID_PATTERN`을 통과하고 shared input index에서 unique하게 해소되는 distinct input 2개 이상과
  강한 Korean/English conflict marker가 함께 있을 때만 경고한다. URL·파일 경로·`{input_id}.md`·대문자/짧은 sequence·
  underscore/dot suffix lookalike는 세지 않는다. 질문·불확실성·marker별 부정은 local clause에서 억제해 unrelated clause의
  negation이 valid marker를 숨기지 않게 했고, 같은 input Summary hard-invalid는 candidate-local suppress한다.
  malformed/ambiguous evidence/target도 억제하며 item당 1건으로 dedupe한다.""",
    '같은 input Summary hard-invalid는 candidate-local suppress한다',
    flags=re.S,
)

sub_once_or_present(
    'kit-dev/CHANGELOG.md',
    r"- historical/reproducible dogfood bundle을 `kit-dev/temp/runs/issue-202-reconciliation-dogfood-001\.md`에 추가했다\..*?scoped acceptance가 완료되어 PR #217은 `Closes #202`로 연결한다\.",
    """- `kit-dev/temp/runs/issue-202-reconciliation-dogfood-001.md`의 frozen bundle은 implementation/model replay로
  재분류했다. stale Result 사례는 tracked `reconcile-input-001` S5/`reconcile-input-002` correction에서 온 real
  historical upstream TP다. routing 사례와 negative controls는 heuristic 조건을 안 뒤 만든 synthetic structural
  positive/control이므로 실제 routing TP·real-corpus FP/missed·실제 stop-round 감소로 세지 않는다. 저장된 `2 → 1`은
  modeled replay일 뿐이며, privacy-safe consumer corpus의 baseline/treatment, 독립 human 판정, 실제 batch finding과
  stop condition이 남아 있다. 따라서 PR #217은 `Refs #202`이고 Issue #202는 open으로 유지한다.""",
    'frozen bundle은 implementation/model replay로',
    flags=re.S,
)

sub_once_or_present(
    'kit-dev/roadmap-current.md',
    r"# Current Roadmap\n\n> 2026-08-03.*?\n\n(?=> 2026-07-31 구현 갱신)",
    """# Current Roadmap

> 2026-08-04 review follow-up(#202-C): 검사 12 advisory 단계의 `RR-ROUTE-101`과 Decision 기반
> `RR-STALE-101/102/103` 구현은 유지한다. `RR-ROUTE-101`은 검사 11의 shared `INPUT_ID_PATTERN`과 input index의
> unique resolution을 사용해 파일명·URL·noncanonical lookalike를 배제하고, 같은 input의 `summaryTrust`를 요구하며,
> 질문·불확실성·marker별 부정을 local clause에서 판정한다. v1 complete silence, public JSON shape/check 12/기존 warning
> order, `--enforce` 비승격은 그대로다. [frozen replay](temp/runs/issue-202-reconciliation-dogfood-001.md)의 stale 사례는
> tracked upstream historical TP지만 routing 사례와 controls는 detector-shaped synthetic data다. 저장된 `2 → 1`은
> modeled stop-round일 뿐 실제 consumer review-round 감소나 real-corpus FP/missed를 입증하지 않는다. privacy-safe
> historical/live routing corpus의 baseline/treatment와 독립 human TP/FP/missed, 실제 batch finding/stop condition이
> 추가될 때까지 PR #217은 `Refs #202`, Issue #202는 open이다. hard/CI/readiness promotion은 별도 사람 결정이다.

""",
    '> 2026-08-04 review follow-up(#202-C):',
    flags=re.S,
)

# Add route-specific integration coverage for actual Summary trust failures.
test_path = Path('frontend-workflow-kit/scripts/lib/reconciliation-items.test.mjs')
test_text = test_path.read_text(encoding='utf-8')
test_marker = "RR-ROUTE-101: same-input Summary hard diagnostics suppress locally"
if test_marker not in test_text:
    anchor = "\ntest('RR-STALE-101/102/103: Decision-only current status comparison emits exact warning family', (t) => {"
    if test_text.count(anchor) != 1:
        raise SystemExit('reconciliation-items.test.mjs: stale-test anchor not unique')
    block = r'''
test('RR-ROUTE-101: same-input Summary hard diagnostics suppress locally; unrelated Summary errors do not', (t) => {
  const facts = ['- 기존 IN-20260720-figma-001 정책과 충돌한다.'];
  const assertSuppressed = (name, result, code) => {
    assert.ok(hasCode(result.errors, code), `${name}: expected ${code}`);
    assert.equal(warningMessagesByCode(result, 'RR-ROUTE-101').length, 0, name);
  };

  assertSuppressed(
    'RR-SCHEMA-006',
    runScopeUnknown(t, facts, {
      summaryRows: [
        DEFAULT_SUMMARY_ROWS[0],
        SCOPE_UNKNOWN_SUMMARY.replace('| scope-unclear |', '| scope-unclear + invalid-classification |'),
      ],
    }),
    'RR-SCHEMA-006',
  );

  assertSuppressed(
    'RR-ITEM-005',
    runScopeUnknown(t, facts, {
      summaryRows: [
        DEFAULT_SUMMARY_ROWS[0],
        SCOPE_UNKNOWN_SUMMARY.replace('| scope-unclear |', '| simple-update |'),
      ],
    }),
    'RR-ITEM-005',
  );

  const screenWithSecondUnknown = SCREEN_SPEC_DOC.replace(
    '| U-001 | 페이지 크기 | open |',
    '| U-001 | 페이지 크기 | open |\n| U-002 | 정렬 기준 | open |',
  );
  assertSuppressed(
    'RR-ITEM-006',
    runScopeUnknown(t, facts, {
      files: {
        'domains/coupons/screens/coupon-list/screen-spec.md': screenWithSecondUnknown,
      },
      summaryRows: [
        DEFAULT_SUMMARY_ROWS[0],
        SCOPE_UNKNOWN_SUMMARY.replace(
          'unknown:U-001@COUPON-001-screen-spec',
          'unknown:U-001@COUPON-001-screen-spec; unknown:U-002@COUPON-001-screen-spec',
        ),
      ],
    }),
    'RR-ITEM-006',
  );

  assertSuppressed(
    'RR-ITEM-007',
    runScopeUnknown(t, facts, {
      summaryRows: [
        DEFAULT_SUMMARY_ROWS[0],
        SCOPE_UNKNOWN_SUMMARY.replace(
          'artifact:COUPON-001-screen-spec',
          'artifact:open-decision-register',
        ),
      ],
    }),
    'RR-ITEM-007',
  );

  const duplicateSummary = runScopeUnknown(t, facts, {
    summaryRows: [DEFAULT_SUMMARY_ROWS[0], SCOPE_UNKNOWN_SUMMARY, SCOPE_UNKNOWN_SUMMARY],
  });
  assert.ok(duplicateSummary.errors.length > 0);
  assert.equal(warningMessagesByCode(duplicateSummary, 'RR-ROUTE-101').length, 0);

  const unrelatedSummaryError = runScopeUnknown(t, facts, {
    summaryRows: [
      DEFAULT_SUMMARY_ROWS[0].replace(
        'simple-update + component-gap',
        'simple-update + invalid-classification',
      ),
      SCOPE_UNKNOWN_SUMMARY,
    ],
  });
  assert.ok(hasCode(unrelatedSummaryError.errors, 'RR-SCHEMA-006'));
  assert.equal(warningMessagesByCode(unrelatedSummaryError, 'RR-ROUTE-101').length, 1);
});
'''
    test_path.write_text(test_text.replace(anchor, f'\n{block}\n{anchor}', 1), encoding='utf-8')

# Replace the evidence report/README with corrected acceptance classification.
Path('kit-dev/temp/runs/issue-202-reconciliation-dogfood-001.md').write_text(r'''# Issue #202-C implementation replay — warning-only semantic drift analyzers

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
''', encoding='utf-8')

Path('kit-dev/temp/runs/issue-202-reconciliation-dogfood-001/README.md').write_text(r'''# Issue #202-C implementation replay bundle

Canonical report: [`../issue-202-reconciliation-dogfood-001.md`](../issue-202-reconciliation-dogfood-001.md)

- `corpus-before/`: frozen implementation candidates and controls
- `corpus-after/`: corrected states used to verify warning silence
- `outputs/`: PR #216 baseline and stored treatment-snapshot JSON outputs
- `replay.sh`: two-worktree validator replay command
- `SHA256SUMS`: tracked corpus/output manifest

Evidence classification:

- routing R1: **synthetic structural positive (detector-shaped)** — not a historical/live TP
- routing controls: synthetic — not real-corpus FP evidence
- stale Result S1: **real historical upstream finding replay** from tracked reconcile-input runs
- stored `2 → 1`: modeled review replay, not an actual consumer review-round measurement

The bundle supports implementation wiring, warning-only severity, and correction silence. It does not satisfy Issue #202's remaining actual routing TP/FP/missed and review-convergence evidence requirement; PR #217 therefore uses `Refs #202` and the issue remains open.
''', encoding='utf-8')

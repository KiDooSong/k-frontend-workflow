# MVP 종료 — Fable 세션별 실행 프롬프트

- 기준: [MVP release closure tracker #167](https://github.com/KiDooSong/k-frontend-workflow/issues/167)
- 원칙: 세션 1개 = PR 1개. 정본 변경 PR을 병렬로 열지 않고, 하나가 병합된 뒤 다음 세션을 시작한다.
- 공통 불변식 (모든 세션 프롬프트에 포함됨):
  - 새 기능·새 artifact axis·새 hard gate를 추가하지 않는다.
  - warning-first surface(visual/telemetry/red-team/doc-drift 등)를 hard gate로 승격하지 않는다.
  - 사람 전용 resolve/confirmed 불변식을 유지한다.

---

## 세션 1 — PR A: release baseline (#157 + #158 + #159, optional #164)

작업량: 문서·버전 중심, 코드 변경 없음. 1세션에 충분.

```text
k-frontend-workflow 저장소에서 MVP 종료 PR A(chore/mvp-release-baseline)를 작업해줘.
새 브랜치를 워크트리로 격리해서 진행해줘 (/wt).

대상 이슈: #157(릴리스 식별자), #158(정본 문서 동기화), #159(루트 README), 그리고 여유가 되면 #164(.gitattributes).
전체 맥락은 tracker #167과 docs/research/raw/k-frontend-workflow_mvp-closure-report_2026-07-11.md §5를 먼저 읽어줘.

작업 내용:
1. [#157] 릴리스 식별자 확정
   - frontend-workflow-kit/package.json version을 0.1.0-mvp-a에서 새 기준선으로 올려줘.
     기본 권고는 0.3.0-mvp.1 이며, CHANGELOG의 Unreleased 규모를 보고 더 적절한 이름이 있으면 근거와 함께 제안만 하고 기본값으로 진행해.
   - kit-dev/CHANGELOG.md의 Unreleased 내용을 새 release heading으로 이동 (release cut).
   - release note 초안에 hard gate와 warning-first surface를 구분해 기술.
   - 과거 mvp-b-rc1 release check(temp/runs/release-mvp-b-final-check.md)에 historical 표기 추가.
2. [#158] 정본 문서 동기화
   - kit-dev/roadmap-current.md snapshot을 현재 HEAD 기준으로 갱신. reconcile-input vendoring은 이미 완료
     (frontend-workflow-kit/skills/reconcile-input/SKILL.md 존재, manifest가 skills/** 포함)이므로 완료 처리.
   - IMPLEMENTING.md를 현행 구현 가이드로 다시 쓰거나 "MVP-A historical build note"로 강등 — 실제 파일을 읽고 적은 쪽 수정으로 판단해.
   - docs/research/next-ideas/README.md에서 01/02/04/05를 landed로, 03 MCP만 열린 연구로 표시.
   - 문서 소유권 지도에 현재 status source of truth를 명시.
3. [#159] 루트 README.md 신규 작성
   - 한 문장 설명 / kit 개발 저장소 vs consumer payload 구분 / 현재 릴리스·상태 /
     빠른 검증 명령 / frontend-workflow-kit/README.md·roadmap·doc ownership·CHANGELOG 링크 /
     hard gate vs warning-first 구분 / 비밀·사내 Figma 원본 미커밋 원칙.
4. [#164, optional] 루트 .gitattributes 추가 (md/mjs/js/ts/tsx/json/yaml/yml/sh → eol=lf, 이미지·zip → binary).
   추가 후 golden test가 checkout EOL에 의존하지 않는지 확인하고, 대규모 재정규화가 발생하면 이 항목은 PR에서 빼고 이슈에 사유를 남겨.

제약:
- 새 기능·새 hard gate·새 artifact axis 금지. warning-first surface 승격 금지.
- 각 이슈의 수용 기준 체크리스트를 기준으로 자체 검증.

완료 기준:
- cd frontend-workflow-kit && npm test 와 npm run example:validate 통과.
- 각 이슈 수용 기준 충족 여부를 PR 본문에 체크리스트로 기록하고, Closes #157 #158 #159 (해당 시 #164) 포함.
- PR 생성 후 URL을 알려줘. 병합은 사람이 한다.
```

---

## 세션 2 — PR B: CI 지원 계약 + 릴리스 증거 (#160 + #161)

작업량: CI workflow 수정 + 전체 테스트/pack 실행·증거 기록. 1세션에 충분.
전제: PR A 병합 후 시작.

```text
k-frontend-workflow 저장소에서 MVP 종료 PR B(ci/mvp-support-contract)를 작업해줘.
PR A(release baseline)가 main에 병합된 상태여야 한다 — 먼저 확인하고, 아니면 중단하고 알려줘.
새 브랜치를 워크트리로 격리해서 진행해줘 (/wt).

대상 이슈: #160(Node/플랫폼 지원 계약), #161(최신 HEAD 릴리스 검증 증거). 맥락은 tracker #167 참고.

작업 내용:
1. [#160] .github/workflows/frontend-workflow-kit.yml 확장
   - hard-gate job: Ubuntu + 주력 Node (현행 유지)
   - compatibility smoke: engines 최소 버전 (node >=18 유지 시 Node 18)
   - macOS job: #154 유형 symlink/realpath entry guard focused test 포함
   - Windows는 required로 만들지 말고, 별도 smoke 또는 "명시적 미지원"으로 README 지원 표에 기록
   - package engines 선언과 README 지원 표, CI matrix가 서로 모순되지 않게 정리.
     지원 범위를 좁히는 선택(A)과 matrix 확장(B) 중 CI 비용이 낮고 계약이 정직한 쪽을 골라 PR 본문에 근거를 적어.
2. [#161] 릴리스 검증 증거 생성
   - main 최신 커밋에서: cd frontend-workflow-kit && npm ci && npm test && npm run example:validate
   - rm -rf ../dist/frontend-workflow-kit && npm run kit:pack
   - packed payload boundary 확인: find ../dist/frontend-workflow-kit -maxdepth 3 -type f | sort 로
     개발 전용 문서/fixtures 누출 여부 검사
   - smoke: node ../dist/frontend-workflow-kit/scripts/validate.mjs --help,
     node ../dist/frontend-workflow-kit/scripts/telemetry.mjs --list-surfaces --json
   - 결과(명령, 커밋 SHA, Node/OS, exit code, 테스트 수, payload 파일 목록/hash)를
     temp/runs/release-<새버전>-final-check.md 로 기록해 PR에 포함.

제약:
- 새 hard gate 추가 금지(기존 hard gate job의 플랫폼/버전 확장은 허용).
- visual/telemetry/red-team을 required check로 만들지 않는다.

완료 기준:
- 로컬 전체 테스트·pack·boundary 검사 통과, 실패 시 원인 분석 후 보고 (릴리스는 NO-GO).
- PR 본문에 Closes #160 #161, 수용 기준 체크리스트, 증거 문서 링크 포함.
- PR 생성 후 URL을 알려줘. 병합과 태그 생성 승인은 사람이 한다.
```

---

## 세션 3 — 태그·release note·tracker 종료 (소형)

전제: PR B 병합 + CI green. 사람 승인 후 실행.

```text
k-frontend-workflow 저장소 MVP 종료 마지막 단계를 진행해줘. PR A/B가 모두 main에 병합되고 CI가 green인지 먼저 확인해.

1. main 최신 커밋이 release-check 문서의 커밋과 일치하는지 확인.
2. package.json 버전과 동일한 이름으로 annotated tag를 만들고 push 해줘 (push 전에 태그 이름과 대상 커밋을 나에게 확인받아).
3. GitHub release note를 생성 — CHANGELOG release heading 기반, hard gate와 warning-first surface 구분 유지.
4. tracker #167의 Required 체크박스를 갱신하고, 판정 규칙에 따라 GO 코멘트를 남긴 뒤 tracker를 닫아줘.
```

---

## 세션 4 이후 — post-MVP (P1), 이슈당 1세션

MVP 태그 이후, 필요 시 아래 순서로 세션당 이슈 1건씩:

| 세션 | 이슈 | 프롬프트 요지 |
|---|---|---|
| 4 | #162 IMP-01 | warning-first surface inventory + 승격 정책 문서 작성. hard gate 추가 금지, 정책 문서만. 수용 기준은 이슈 본문 체크리스트. |
| 5 | #163 IMP-02 | doc-drift에 version/status 모순 narrow rule 5종 추가 (warning-first, 기본 exit 0, FP fixture 포함). |
| 6 | #165 IMP-04 | temp/ historical evidence 분류·archive 이동·index 생성. 삭제 대신 이동, payload allowlist 불변. |
| 7 | #166 IMP-05 | packed payload에서 core/adoption/observation/visual CLI smoke 확장. 느리면 core required + nightly 분리. |

각 세션 프롬프트 공통 접두:

```text
k-frontend-workflow 저장소에서 이슈 #<번호>를 처리해줘. 새 브랜치를 워크트리로 격리해서 진행해줘 (/wt).
이슈 본문의 배경/작업 범위/수용 기준/제외 범위를 그대로 계약으로 삼아.
공통 불변식: 새 hard gate·새 artifact axis 금지, warning-first surface 승격 금지, 사람 전용 resolve/confirmed 유지.
완료 기준: npm test + example:validate 통과, PR 본문에 수용 기준 체크리스트와 Closes #<번호> 포함, PR URL 보고. 병합은 사람이 한다.
```

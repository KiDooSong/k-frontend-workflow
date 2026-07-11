# k-frontend-workflow MVP 종료·릴리스 준비 보고서

- 기준일: **2026-07-11 (KST)**
- 대상: [https://github.com/KiDooSong/k-frontend-workflow](https://github.com/KiDooSong/k-frontend-workflow)
- 기준 브랜치: `main`
- 기준 커밋: [`59a2b8d30e60481c3d1dea53d259eb99a13b84e5`](https://github.com/KiDooSong/k-frontend-workflow/commit/59a2b8d30e60481c3d1dea53d259eb99a13b84e5)
- 최신 병합: [PR #156](https://github.com/KiDooSong/k-frontend-workflow/pull/156), 2026-07-07 11:58 KST
- 판정: **조건부 GO — 기능 MVP 완료, 릴리스 정합성 5개 항목 종료 필요**

---

## 1. 경영 요약

이 저장소는 더 이상 “MVP 기능을 만드는 초기 프로젝트”로 보기 어렵다. 이미 다음이 구현되어 있다.

- 상태·준비도·구조 검증의 결정적 코어
- 입력 생성과 reconciliation
- 경로 backstop과 생성 파일 검증
- route/nav/catalog/codegen 보조 도구
- brownfield adoption probe와 안전한 vendored-kit upgrade
- E2E 계획·생성·검증·수리 절차
- telemetry, eval, red-team, doc-drift 관측 계층
- visual consistency contract와 bootstrap/adoption 흐름
- 다수의 회귀 테스트와 배포 payload 정합성 검사

최근 PR들은 새로운 축을 무작정 늘리는 대신 실제 소비 저장소에서 나온 오탐·silent no-op·문서 공백·플랫폼 문제를 수정했다. 이는 기능 MVP 이후의 **제품화·신뢰성 단계**에 해당한다.

현재 GitHub에는 열린 이슈와 열린 PR이 없다. 따라서 “열린 것을 닫는” 작업은 GitHub 큐 정리가 아니라, 저장소 문서와 릴리스 상태에 남은 **암묵적 미완료를 명시적으로 종료하는 것**이다.

### 최종 판정

| 영역 | 판정 | 설명 |
|---|---|---|
| 핵심 기능 | 완료 | core loop와 주요 보조 surface가 구현됨 |
| 소비자 실사용 피드백 | 완료·지속 | 최근 #150, #151, #153 등이 수정 PR로 병합됨 |
| 회귀 방어 | 강함 | unit/golden/distribution/fail-open/red-team 테스트가 존재 |
| GitHub 작업 큐 | 정리됨 | 열린 이슈 0, 열린 PR 0 |
| 릴리스 식별자 | 미완료 | package는 여전히 `0.1.0-mvp-a`, CHANGELOG는 대규모 Unreleased |
| 현행 문서 | 미완료 | roadmap·IMPLEMENTING·next-ideas가 실제 구현보다 뒤처짐 |
| 저장소 진입점 | 미완료 | 루트 README 부재 |
| 지원 환경 계약 | 미완료 | Node `>=18` 선언과 Node 20 단일 CI 사이 간극 |
| 최종 릴리스 증거 | 미확인 | 최신 HEAD에서 테스트·pack을 이번 진단에서 독립 재실행하지 못함 |

---

## 2. 현재 저장소 스냅샷

### 2.1 GitHub 작업 상태

- 열린 이슈: **0**
- 열린 PR: **0**
- 최신 병합 PR: [#156 visual consumer adoption gap 보강](https://github.com/KiDooSong/k-frontend-workflow/pull/156)
- 최신 병합 시각: **2026-07-07 11:58 KST**
- 최신 PR #156의 저장소 기록상 검증:
  - `npm run test:spec`: 702 pass
  - `npm test`: pass
  - `npm run example:validate`: OK

위 테스트 결과는 PR 설명에 기록된 증거이며, 본 보고서 작성 환경에서 재실행한 결과는 아니다.

### 2.2 최근 닫힌 주요 문제

| 이슈/PR | 닫힌 내용 | MVP에 주는 의미 |
|---|---|---|
| [#150](https://github.com/KiDooSong/k-frontend-workflow/issues/150) / [#152](https://github.com/KiDooSong/k-frontend-workflow/pull/152) | doc-drift 링크 검사 오탐 축소 | 관측 도구의 신호 품질 개선 |
| [#151](https://github.com/KiDooSong/k-frontend-workflow/issues/151) / [#155](https://github.com/KiDooSong/k-frontend-workflow/pull/155) | GitLab CI telemetry artifact 매핑 문서화 | GitHub Actions 외 소비 환경 지원 |
| [#153](https://github.com/KiDooSong/k-frontend-workflow/issues/153) / [#156](https://github.com/KiDooSong/k-frontend-workflow/pull/156) | visual bootstrap silent no-op, 후보 분류, catalog scope, upgrade note, schema 불일치 수정 | 실제 소비자 adoption에서 확인된 제품 결함 해소 |
| [#154](https://github.com/KiDooSong/k-frontend-workflow/pull/154) | symlink 경유 CLI entry guard 수정 | macOS/Node 환경의 조용한 exit 0 문제 해소 |
| [#148](https://github.com/KiDooSong/k-frontend-workflow/pull/148)–[#149](https://github.com/KiDooSong/k-frontend-workflow/pull/149) | telemetry adoption ingest, red-team, doc-drift heuristic | 승격 판단용 관측·적대 검증 기반 확보 |
| [#144](https://github.com/KiDooSong/k-frontend-workflow/pull/144)–[#147](https://github.com/KiDooSong/k-frontend-workflow/pull/147) | visual contract, bootstrap, adoption probe, telemetry 연결 | visual 다중 화면 정합 흐름 완성 |

### 2.3 구현 범위

[`frontend-workflow-kit/package.json`](https://github.com/KiDooSong/k-frontend-workflow/blob/59a2b8d30e60481c3d1dea53d259eb99a13b84e5/frontend-workflow-kit/package.json)은 다음 명령군을 제공한다.

- Core: `state`, `readiness`, `validate`
- Authoring/adoption: `create-input`, `create-screen`, `doctor`, `adoption-probe`
- Boundaries: `forbidden-paths`, `check-generated`
- Generated views: `route-tree`, `nav-graph`, `catalog`
- Lint: `lint-gen`, `lint-baseline`
- Evidence: `route-cross-check`, `doc-drift`, `eval`, `redteam`, `telemetry`
- Visual: `visual-consistency`, `visual-contract-bootstrap`
- Execution: `packet`, `report`, `run`
- Policy: `policy-draft`
- Distribution: `kit:pack`

이 범위는 `package.json` 설명의 “MVP-A: 문서 생성 + readiness 판정”보다 훨씬 넓다.

---

## 3. 이미 닫힌 것으로 처리할 항목

다음은 MVP 종료를 이유로 다시 열 필요가 없다.

### 3.1 최근 소비자 이슈

#150, #151, #153은 각각 수정 PR이 병합되어 닫혔다. 같은 증상이 새 소비자 저장소에서 재현되지 않는 한 재오픈하지 않는다.

### 3.2 MVP-B Phase 0

[`temp/workflows/mvp-b-board.md`](https://github.com/KiDooSong/k-frontend-workflow/blob/59a2b8d30e60481c3d1dea53d259eb99a13b84e5/temp/workflows/mvp-b-board.md)와 과거 릴리스 체크에 따르면 다음은 완료되었다.

- golden fixture harness
- diff 기반 forbidden path backstop
- 입력 결과물 및 reconciliation register 검사
- fresh Expo consumer dogfood

### 3.3 reconcile-input vendoring

[`kit-dev/roadmap-current.md`](https://github.com/KiDooSong/k-frontend-workflow/blob/59a2b8d30e60481c3d1dea53d259eb99a13b84e5/kit-dev/roadmap-current.md)는 `reconcile-input`을 아직 repo-local이며 kit vendoring이 남았다고 설명하지만, 실제로는 [`frontend-workflow-kit/skills/reconcile-input/SKILL.md`](https://github.com/KiDooSong/k-frontend-workflow/blob/59a2b8d30e60481c3d1dea53d259eb99a13b84e5/frontend-workflow-kit/skills/reconcile-input/SKILL.md)가 존재하고 [`distribution-manifest.yaml`](https://github.com/KiDooSong/k-frontend-workflow/blob/59a2b8d30e60481c3d1dea53d259eb99a13b84e5/frontend-workflow-kit/distribution-manifest.yaml)이 `skills/**`를 payload에 포함한다.

따라서 이 항목은 **구현 완료**로 닫고 roadmap만 갱신한다.

### 3.4 다음 아이디어 중 이미 구현된 항목

[`docs/research/next-ideas/README.md`](https://github.com/KiDooSong/k-frontend-workflow/blob/59a2b8d30e60481c3d1dea53d259eb99a13b84e5/docs/research/next-ideas/README.md)는 telemetry, eval, red-team, doc-drift가 비어 있다고 설명하지만 현재는 모두 명령과 테스트가 존재한다.

- Telemetry & promotion evidence: 구현됨
- Eval & calibration harness: 구현됨
- Adversarial red-team: 구현됨
- Canonical doc-drift detector: 구현됨
- MCP-native gate serving: 연구 단계 유지

이 문서는 아이디어 포트폴리오가 아니라 **구현 상태 회고 인덱스**로 전환하는 것이 맞다.

---

## 4. MVP에서 의도적으로 닫을 후속

아래는 “미완성”이 아니라 **MVP 범위 밖으로 명시적으로 연기**해 닫아야 한다. 즉, 지금 구현하지 않는다는 결정과 재오픈 조건을 기록하면 된다.

| 항목 | MVP 처리 | 재오픈 조건 |
|---|---|---|
| lint-gen/lint-baseline hard gate 승격 | `deferred-by-evidence`로 닫음 | 실제 소비자 telemetry에서 오탐률·증가율 임계치를 충족 |
| golden fixture CI hard gate 승격 | warning-first 유지 | 일정 기간 flake/FP 0 및 실패 분류 프로세스 마련 |
| forbidden-paths 전용 required check | warning-first 유지 | 최소 2개 소비 repo에서 정상 diff와 위반 diff를 안정적으로 분리 |
| Interaction Matrix 검사 13 hard 승격 | warning-first 유지 | route 그룹·v1/v2 혼용 telemetry가 충분하고 오탐 기준 합의 |
| visual/telemetry/red-team CI hard gate | 승격 금지 | 도구 계약 자체가 observation/review-only이므로 별도 제품 결정 없이는 재오픈 금지 |
| MCP-native gate serving | post-MVP candidate | CLI 소비 마찰 또는 에이전트별 JSON 파싱 drift가 반복 관측될 때 |
| deferred/Assumptions/Dependencies/decision-log | post-MVP model extension | 실제 소비자에서 같은 분류 요구가 반복되고 새 축 없이 흡수 가능한 설계가 승인될 때 |
| Work Packet review enforcement | post-MVP | 인덱스만으로 handoff 누락이 반복될 때; readiness gate로 만들지 않음 |

이렇게 닫으면 MVP 종료 시 “무엇이 빠졌는가”가 아니라 “무엇을 왜 넣지 않았는가”가 선명해진다.

---

## 5. 공식 MVP 종료 전 반드시 닫을 5개 항목

### MVP-01. 릴리스 식별자와 버전 정합

**문제**

[`frontend-workflow-kit/package.json`](https://github.com/KiDooSong/k-frontend-workflow/blob/59a2b8d30e60481c3d1dea53d259eb99a13b84e5/frontend-workflow-kit/package.json)은 아직 `0.1.0-mvp-a`다. 반면 과거 릴리스 체크는 `v0.2.0-mvp-b-rc1`을 권고했고, 이후 telemetry/eval/red-team/visual/adoption 기능이 대량 병합되었다. [`kit-dev/CHANGELOG.md`](https://github.com/KiDooSong/k-frontend-workflow/blob/59a2b8d30e60481c3d1dea53d259eb99a13b84e5/kit-dev/CHANGELOG.md)는 큰 `Unreleased` 섹션을 유지한다.

**종료 작업**

- 현재 HEAD를 나타내는 단일 버전/태그 이름을 사람 결정으로 고정
- package version, CHANGELOG release heading, release note, tag를 동일하게 맞춤
- 과거 `mvp-b-rc1` 체크를 현 HEAD의 최종 릴리스 증거로 오해하지 않도록 historical 표기
- package가 `private: true`여도 버전은 vendored payload 추적 식별자로 사용

**권고**

현재 기능이 MVP-B 이후 크게 확장되었으므로 `0.1.0-mvp-a`나 오래된 RC 이름을 그대로 재사용하지 않는다. 예를 들어 `v0.3.0-mvp.1` 같은 새 기준선을 선택할 수 있으나, 실제 이름은 릴리스 담당자가 확정한다.

**수용 기준**

- [ ] package version과 태그가 동일한 릴리스 계열
- [ ] CHANGELOG의 현재 기능이 `Unreleased`에서 새 release heading으로 이동
- [ ] release note에 hard gate와 warning-first surface가 구분됨
- [ ] packed payload에 버전 식별자가 포함되고 재현 가능함

### MVP-02. 현행 정본 문서 동기화

**문제**

- [`kit-dev/roadmap-current.md`](https://github.com/KiDooSong/k-frontend-workflow/blob/59a2b8d30e60481c3d1dea53d259eb99a13b84e5/kit-dev/roadmap-current.md): snapshot이 2026-07-03이며 PR #131까지 중심으로 설명
- [`IMPLEMENTING.md`](https://github.com/KiDooSong/k-frontend-workflow/blob/59a2b8d30e60481c3d1dea53d259eb99a13b84e5/IMPLEMENTING.md): “현재 목표 MVP-A”, “스크립트 3개”, “validate 8종” 등 historical 내용이 핵심 진입점에 남음
- [`docs/research/next-ideas/README.md`](https://github.com/KiDooSong/k-frontend-workflow/blob/59a2b8d30e60481c3d1dea53d259eb99a13b84e5/docs/research/next-ideas/README.md): 이미 구현된 telemetry/eval/red-team/doc-drift를 미구현으로 설명
- [`AGENTS.md`](https://github.com/KiDooSong/k-frontend-workflow/blob/59a2b8d30e60481c3d1dea53d259eb99a13b84e5/AGENTS.md): roadmap와 IMPLEMENTING을 시작점으로 가리키므로 stale 상태가 에이전트 세션에 전파됨

**종료 작업**

- roadmap snapshot을 최신 HEAD 기준으로 갱신
- reconcile-input vendoring 등 이미 끝난 항목을 완료 처리
- IMPLEMENTING을 현행 구현 가이드로 다시 쓰거나 “MVP-A historical build note”로 명확히 강등
- next-ideas의 01/02/04/05를 landed로 표시하고 03 MCP만 열린 연구로 남김
- 문서 소유권 지도에 현재 status source of truth를 명시

**수용 기준**

- [ ] 신규 기여자가 루트 진입점만 읽고 현재 기능/단계/다음 작업을 오해하지 않음
- [ ] “MVP-A”, “스크립트 3개”, “미구현 telemetry” 같은 현재와 충돌하는 서술이 없음
- [ ] 완료·연기·열림 상태가 한 문서에서 서로 모순되지 않음

### MVP-03. 루트 README 추가

**문제**

저장소 루트에 `README.md`가 없다. 실제 consumer README는 `frontend-workflow-kit/README.md`에 있지만 GitHub 첫 화면에서는 프로젝트 목적, 현재 상태, 시작 명령, 문서 지도를 바로 알 수 없다.

**종료 작업**

루트 README에 최소한 다음을 포함한다.

- 프로젝트 한 문장 설명
- “kit 개발 저장소”와 “consumer payload”의 구분
- 현재 릴리스/상태
- 빠른 검증 명령
- `frontend-workflow-kit/README.md`, roadmap, doc ownership, CHANGELOG 링크
- hard gate와 warning-first 도구의 구분
- 보안상 비밀·사내 Figma 원본을 커밋하지 않는 원칙

**수용 기준**

- [ ] GitHub 첫 화면에서 2분 안에 목적·실행법·현재 상태 파악 가능
- [ ] consumer 설치와 kit 개발 명령이 혼동되지 않음
- [ ] 오래된 IMPLEMENTING을 무조건 첫 진입점으로 만들지 않음

### MVP-04. Node 및 플랫폼 지원 계약 고정

**문제**

package는 `node >=18`을 선언하지만 CI는 Ubuntu + Node 20 한 조합만 실행한다. 최근 #154는 symlink/realpath와 macOS 임시 경로 차이에서 발생한 문제였다. 선언한 지원 범위보다 실제 검증 범위가 좁다.

**종료 선택지**

A. 지원 범위를 실제 검증 범위로 좁힌다.  
B. 최소 지원 버전과 대표 최신 버전, Linux와 macOS smoke를 CI matrix로 검증한다.

MVP에는 전체 조합이 아니라 다음 최소 기준이면 충분하다.

- hard-gate job: Ubuntu + 주력 Node
- compatibility smoke: `engines` 최소 버전
- path/symlink 관련 focused test: macOS
- Windows는 즉시 required로 만들지 않고 별도 smoke 또는 명시적 미지원으로 기록

**수용 기준**

- [ ] package `engines`와 README 지원 표가 CI에 의해 검증됨
- [ ] #154 유형의 symlink entry test가 적어도 한 macOS job에서 실행됨
- [ ] 지원하지 않는 플랫폼은 암묵적으로 약속하지 않음

### MVP-05. 최종 릴리스 검증 증거 생성

**문제**

최신 PR에는 테스트 통과 기록이 있지만, 이번 진단에서는 최신 HEAD의 CI status와 로컬 실행을 독립 확인하지 못했다. 과거 `release-mvp-b-final-check.md`는 6월 14일 시점이라 현재 HEAD의 최종 증거가 아니다.

**권장 실행**

```bash
git checkout main
git pull --ff-only

cd frontend-workflow-kit
npm ci
npm test
npm run example:validate

rm -rf ../dist/frontend-workflow-kit
npm run kit:pack
```

추가 확인:

```bash
# packed payload에서 개발 전용 문서/fixtures가 새지 않는지 확인
find ../dist/frontend-workflow-kit -maxdepth 3 -type f | sort

# 배포 manifest 및 주요 명령 smoke
node ../dist/frontend-workflow-kit/scripts/validate.mjs --help
node ../dist/frontend-workflow-kit/scripts/telemetry.mjs --list-surfaces --json
```

**종료 작업**

- 명령, 커밋 SHA, Node/OS, exit code, 테스트 수를 새 release-check 문서에 기록
- 생성 payload의 manifest hash 또는 파일 목록을 증거로 보관
- GitHub Actions required check 또는 명시적 수동 승인 결과와 연결

**수용 기준**

- [ ] 최신 release commit에서 `npm ci`, `npm test`, example validate, kit pack 성공
- [ ] payload boundary 검사 성공
- [ ] release-check가 과거 RC가 아니라 새 태그를 가리킴
- [ ] 태그 생성 후 release note와 source commit이 일치

---

## 6. 권장 MVP 종료 PR 구조

불필요한 병렬 정본 변경을 피하기 위해 한 개의 tracker와 최대 두 개 PR을 권고한다.

### PR A — `chore/mvp-release-baseline`

- package version
- CHANGELOG release cut
- root README
- roadmap / IMPLEMENTING / next-ideas 동기화
- optional `.gitattributes`

### PR B — `ci/mvp-support-contract`

- Node/platform support matrix
- release verification workflow 또는 focused smoke
- 새 release-check evidence

PR B가 통과한 commit에 태그를 만든다. 새 기능은 이 두 PR에 포함하지 않는다.

---

## 7. GO / NO-GO 체크리스트

### 기능 및 결함

- [x] 열린 GitHub 이슈 0
- [x] 열린 GitHub PR 0
- [x] 최근 소비자 visual/doc-drift/CI 문서 이슈 병합
- [x] core hard gate 구현
- [x] observation surface의 warning-first 경계 유지
- [x] distribution manifest와 payload test 존재

### 릴리스 정합

- [ ] 새 릴리스 식별자 확정
- [ ] package version 동기화
- [ ] CHANGELOG release cut
- [ ] root README 추가
- [ ] roadmap / IMPLEMENTING / next-ideas 동기화
- [ ] Node/platform 지원 계약 확정
- [ ] 최신 HEAD 전체 테스트 및 payload pack 증거
- [ ] tag와 release note 생성

### 판정 규칙

- 위 릴리스 정합 8개가 모두 체크되면: **GO**
- 테스트 또는 payload boundary가 실패하면: **NO-GO**
- warning-first 관측 결과만 존재하는 경우: 자동 NO-GO가 아니라 사람 리뷰 후 기록
- 새 기능 아이디어가 남아 있다는 이유만으로: **MVP 종료를 막지 않음**

---

## 8. GitHub MVP 종료 Tracker용 본문

아래를 단일 tracker issue로 복사할 수 있다.

```md
# MVP release closure tracker

## Goal
현재 기능 범위를 동결하고, 버전·문서·지원 환경·검증 증거를 하나의 release baseline으로 닫는다.
새 기능과 warning-first → hard gate 승격은 이 tracker 범위가 아니다.

## Required
- [ ] 릴리스 식별자 결정 및 package version 갱신
- [ ] CHANGELOG `Unreleased` release cut
- [ ] 루트 README 추가
- [ ] `kit-dev/roadmap-current.md` 최신화
- [ ] `IMPLEMENTING.md` 현행화 또는 historical 강등
- [ ] `docs/research/next-ideas/README.md` landed/open 상태 교정
- [ ] Node/platform 지원 계약과 CI 검증 범위 정합
- [ ] 최신 release commit에서 `npm ci`
- [ ] `npm test`
- [ ] `npm run example:validate`
- [ ] `npm run kit:pack`
- [ ] packed payload boundary 검증
- [ ] release-check evidence 커밋
- [ ] tag/release note 생성

## Explicitly deferred
- lint/test-fixtures/forbidden-paths hard gate promotion
- Interaction Matrix check 13 hard promotion
- visual/telemetry/red-team hard gating
- MCP-native serving
- decision-log/deferred/Dependencies model extension
- Work Packet review enforcement

## Done when
태그가 가리키는 commit에서 모든 Required 항목이 완료되고, release note가 hard gate와 advisory surface를 구분한다.
```

---

## 9. 근거 링크

- [현재 package.json](https://github.com/KiDooSong/k-frontend-workflow/blob/59a2b8d30e60481c3d1dea53d259eb99a13b84e5/frontend-workflow-kit/package.json)
- [consumer README](https://github.com/KiDooSong/k-frontend-workflow/blob/59a2b8d30e60481c3d1dea53d259eb99a13b84e5/frontend-workflow-kit/README.md)
- [CI workflow](https://github.com/KiDooSong/k-frontend-workflow/blob/59a2b8d30e60481c3d1dea53d259eb99a13b84e5/.github/workflows/frontend-workflow-kit.yml)
- [validate hard/warning checks](https://github.com/KiDooSong/k-frontend-workflow/blob/59a2b8d30e60481c3d1dea53d259eb99a13b84e5/frontend-workflow-kit/scripts/validate.mjs)
- [current roadmap](https://github.com/KiDooSong/k-frontend-workflow/blob/59a2b8d30e60481c3d1dea53d259eb99a13b84e5/kit-dev/roadmap-current.md)
- [IMPLEMENTING](https://github.com/KiDooSong/k-frontend-workflow/blob/59a2b8d30e60481c3d1dea53d259eb99a13b84e5/IMPLEMENTING.md)
- [next ideas index](https://github.com/KiDooSong/k-frontend-workflow/blob/59a2b8d30e60481c3d1dea53d259eb99a13b84e5/docs/research/next-ideas/README.md)
- [CHANGELOG](https://github.com/KiDooSong/k-frontend-workflow/blob/59a2b8d30e60481c3d1dea53d259eb99a13b84e5/kit-dev/CHANGELOG.md)
- [distribution manifest](https://github.com/KiDooSong/k-frontend-workflow/blob/59a2b8d30e60481c3d1dea53d259eb99a13b84e5/frontend-workflow-kit/distribution-manifest.yaml)
- [과거 MVP-B release check](https://github.com/KiDooSong/k-frontend-workflow/blob/59a2b8d30e60481c3d1dea53d259eb99a13b84e5/temp/runs/release-mvp-b-final-check.md)
- [최신 PR #156](https://github.com/KiDooSong/k-frontend-workflow/pull/156)

---

## 10. 분석 한계

- GitHub 파일·이슈·PR·커밋은 직접 조회했다.
- 현재 환경에서는 저장소 clone이 되지 않아 테스트를 독립 재실행하지 못했다.
- 최신 merge commit의 Actions status가 조회되지 않아 “현재 CI green”이라고 단정하지 않았다.
- tag/release publication 여부는 별도 확인하지 못했다.
- 따라서 본 문서의 최종 GO는 MVP-05의 실제 실행 증거를 전제로 한다.

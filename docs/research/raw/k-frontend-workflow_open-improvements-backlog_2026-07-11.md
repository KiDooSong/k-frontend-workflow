# k-frontend-workflow 열린 개선 과제 백로그

- 기준일: **2026-07-11 (KST)**
- 대상 저장소: [https://github.com/KiDooSong/k-frontend-workflow](https://github.com/KiDooSong/k-frontend-workflow)
- 기준 커밋: [`59a2b8d30e60`](https://github.com/KiDooSong/k-frontend-workflow/commit/59a2b8d30e60481c3d1dea53d259eb99a13b84e5)
- 목적: 현재 GitHub 큐는 비어 있으므로, 실제 남은 작업을 우선순위와 수용 기준이 있는 **새 이슈 후보**로 정리한다.
- 원칙: 새 산출물 축이나 새 hard gate를 자동 도입하지 않는다. 사람 전용 gate 해제 불변식을 유지한다.

---

## 1. 우선순위 요약

| ID | 우선순위 | 제목 | MVP 차단 | 권장 처리 |
|---|---|---|---|---|
| MVP-01 | P0 | 릴리스 식별자·버전·CHANGELOG 기준선 확정 | 예 | MVP closure PR |
| MVP-02 | P0 | roadmap/IMPLEMENTING/next-ideas 현행화 | 예 | MVP closure PR |
| MVP-03 | P0 | 루트 README와 저장소 진입점 추가 | 예 | MVP closure PR |
| MVP-04 | P0 | Node·플랫폼 지원 계약과 CI 정합 | 예 | CI PR |
| MVP-05 | P0 | 최신 HEAD release verification evidence | 예 | CI/Release PR |
| IMP-01 | P1 | warning-first 도구 승격 정책과 telemetry 임계치 | 아니오 | 별도 decision issue |
| IMP-02 | P1 | 문서·버전·manifest 상태 drift 자동 검사 | 아니오 | warning-first CI |
| IMP-03 | P1 | `.gitattributes` 및 cross-platform text contract | 아니오 | 작은 hygiene PR |
| IMP-04 | P1 | run-report/temp evidence 보존·아카이브 정책 | 아니오 | docs/cleanup PR |
| IMP-05 | P1 | 배포 payload 소비자 smoke test 확장 | 아니오 | test PR |
| IMP-06 | P2 | GitHub 기여·보안·PR/Issue 템플릿 | 아니오 | governance PR |
| IMP-07 | P2 | dependency update 자동화 | 아니오 | Dependabot/Renovate |
| IMP-08 | P2 | MCP-native gate serving 검증 spike | 아니오 | research/prototype |
| IMP-09 | P2 | 릴리스 자동화와 provenance | 아니오 | release engineering |
| IMP-10 | P2 | 경고 surface 운영 dashboard/추세 요약 | 아니오 | adoption 이후 |

P0는 MVP 종료 보고서의 필수 항목과 동일하다. 아래에는 GitHub 이슈로 바로 옮길 수 있는 P1/P2 본문을 제공한다.

---

## 2. P1 — 다음 사이클에서 우선 처리

## IMP-01. warning-first 도구 승격 정책과 telemetry 임계치

**권장 이슈 제목**

`docs(governance): define evidence thresholds for warning-first gate promotion`

**배경**

저장소는 warning-first 원칙을 일관되게 지켜왔다. 다만 lint baseline, test fixtures, forbidden paths, check-generated, Interaction Matrix check 13 등 여러 표면이 “telemetry 이후 별도 결정” 상태다. telemetry가 이제 구현되었으므로, 개별 PR마다 같은 논의를 반복하지 않도록 승격 정책이 필요하다.

**문제**

- 무엇을 몇 회 관측해야 hard gate 후보가 되는지 기준이 없음
- warning 수와 false positive를 어떤 단위로 기록할지 불명확
- consumer별 차이를 평균으로 합쳐도 되는지 정의되지 않음
- 승격하지 않기로 한 결정도 만료 조건이 없어 계속 pending처럼 보임

**작업 범위**

- 승격 대상 surface inventory 작성
- surface별 최소 관측 횟수·소비 repo 수·FP 허용치 정의
- hard gate 후보, required check 후보, 영구 advisory 구분
- decision 상태: `deferred`, `eligible`, `rejected`, `promoted`
- 재검토 날짜 대신 재오픈 trigger 사용
- visual/telemetry/red-team 자체는 observation-only라는 계약을 별도 고정

**수용 기준**

- [ ] 모든 warning-first surface가 inventory에 존재
- [ ] 각 surface에 evidence source와 승격 불가 사유가 정의됨
- [ ] “경고가 0이어서 승격” 같은 단순 기준을 금지
- [ ] 승격은 별도 사람 승인 PR 없이는 일어나지 않음
- [ ] telemetry 형식 변경 없이 정책 문서로 시작

**제외 범위**

- 이 이슈에서 실제 CI hard gate를 추가하지 않음
- 자동 threshold promotion 금지
- readiness 판정 로직 재구현 금지

**권장 라벨**

`governance`, `telemetry`, `decision-required`, `post-mvp`

---

## IMP-02. 문서·버전·manifest 상태 drift 자동 검사

**권장 이슈 제목**

`feat(doc-drift): detect release/version and implemented-status contradictions`

**배경**

현재 수동 진단에서 다음 불일치가 발견되었다.

- package version은 `0.1.0-mvp-a`
- CHANGELOG는 큰 `Unreleased`
- roadmap은 2026-07-03 snapshot
- next-ideas는 이미 구현된 4개 계층을 미구현으로 설명
- IMPLEMENTING은 scripts 3개·MVP-A 중심

기존 doc-drift는 링크와 일부 status heuristic을 다루므로, narrow rule을 추가할 수 있다.

**작업 범위**

처음에는 warning-first로 다음만 검사한다.

1. package version ↔ latest release heading
2. manifest active/planned ↔ canonical roadmap status
3. package script 존재 ↔ “미구현/없음” 키워드의 명백한 충돌
4. canonical status document snapshot age
5. README/IMPLEMENTING의 고정 카운트가 코드와 충돌하는지

**수용 기준**

- [ ] 의미 추론이 아니라 좁은 구조 규칙만 사용
- [ ] 기본 exit 0
- [ ] false positive fixture 포함
- [ ] historical/archive 문서는 대상에서 제외
- [ ] finding마다 canonical owner와 수정 경로 표시
- [ ] 자동 문서 수정 없음

**제외 범위**

- 자유 서술 전체의 semantic truth 판정
- 외부 URL reachability
- hard gate 승격

**권장 라벨**

`doc-drift`, `warning-first`, `quality`, `post-mvp`

---

## IMP-03. `.gitattributes` 및 cross-platform text contract

**권장 이슈 제목**

`chore(repo): add LF and text normalization policy for vendored payload`

**배경**

과거 MVP-B release check는 Windows CRLF 경고를 known limitation으로 기록했다. 현재 루트에 `.gitattributes`가 없다. vendored kit은 Markdown, YAML, JSON, MJS, TS golden 파일의 byte-level determinism을 중요하게 다루므로 줄바꿈 계약을 저장소에 고정하는 것이 유리하다.

**작업 범위**

예시:

```gitattributes
* text=auto
*.md text eol=lf
*.mjs text eol=lf
*.js text eol=lf
*.ts text eol=lf
*.tsx text eol=lf
*.json text eol=lf
*.yaml text eol=lf
*.yml text eol=lf
*.sh text eol=lf
*.png binary
*.jpg binary
*.jpeg binary
*.zip binary
```

추가로 pack 및 golden test가 checkout EOL에 의존하지 않는지 확인한다.

**수용 기준**

- [ ] 주요 text artifact의 EOL 정책 명시
- [ ] binary 파일 오분류 방지
- [ ] 현재 저장소 전체를 불필요하게 대규모 재작성하지 않음
- [ ] Linux CI와 최소 한 cross-platform smoke에서 golden test 통과
- [ ] consumer upgrade planner의 hash 의미가 문서화됨

**권장 라벨**

`repository-hygiene`, `cross-platform`, `distribution`

---

## IMP-04. run-report/temp evidence 보존·아카이브 정책

**권장 이슈 제목**

`docs(repo): define retention and indexing for historical run evidence`

**배경**

dev 문서를 `kit-dev/`로 옮기고 consumer payload에서 제외하는 경계는 잘 설계되어 있다. 그러나 저장소 루트 `temp/`에도 과거 board, proposal, run report, release check가 다수 남아 있다. payload 누출 문제는 아니지만 현재 상태를 찾을 때 historical evidence와 active plan이 섞인다.

**작업 범위**

- active / historical / generated-local 세 분류 정의
- `temp/runs`, `kit-dev/temp/runs`의 canonical 위치 결정
- 중요한 release/dogfood evidence index 생성
- 오래된 board에 superseded banner 추가
- 삭제보다 `archive/` 이동을 우선
- 민감한 Figma/consumer 원본은 기존 ignore 원칙 유지

**수용 기준**

- [ ] “현재 계획” 검색 시 historical board가 상위 결과로 오해되지 않음
- [ ] release evidence를 날짜·commit·status로 찾을 수 있음
- [ ] consumer payload allowlist는 변하지 않거나 더 엄격해짐
- [ ] 증거 삭제 시 대체 링크 또는 보존 근거가 있음
- [ ] local-only 산출물 규칙이 `.gitignore`와 일치

**제외 범위**

- 모든 historical 문서 삭제
- git history rewrite
- 사내 민감 자료 공개

**권장 라벨**

`documentation`, `repository-hygiene`, `evidence`

---

## IMP-05. 배포 payload 소비자 smoke test 확장

**권장 이슈 제목**

`test(distribution): run core and optional CLI smoke against packed payload`

**배경**

distribution test는 manifest·schema·template 정합과 packed 동작을 폭넓게 검사한다. 기능 surface가 늘어난 만큼, 개발 tree에서는 통과하지만 payload에서 누락되는 회귀를 release 단계에서 더 직접 잡을 수 있다.

**작업 범위**

packed payload에서 다음을 확인한다.

- core: `state`, `readiness`, `validate`
- adoption: `doctor`, `create-input`, `create-screen`
- observation: `doc-drift`, `eval`, `redteam`, `telemetry --list-surfaces`
- visual: structural smoke 및 contract-absent safe skip
- upgrade planner에 필요한 파일
- 모든 `package-scripts.template.json` target의 실존성
- packed payload 내부 relative link

**수용 기준**

- [ ] source tree import에 우연히 의존하지 않음
- [ ] examples 미포함 consumer payload에서도 fail-soft 계약 유지
- [ ] 각 CLI의 exit 0/1/2 계약 중 필요한 최소 경로 검증
- [ ] absolute path·timestamp가 golden에 들어가지 않음
- [ ] test duration이 과도하면 core required + optional nightly로 분리

**권장 라벨**

`testing`, `distribution`, `consumer-adoption`

---

## 3. P2 — MVP 이후 선택적 개선

## IMP-06. GitHub 기여·보안·PR/Issue 템플릿

**권장 이슈 제목**

`chore(governance): add contribution, security, and review templates`

**현재 부재가 확인된 파일**

- 루트 `CONTRIBUTING.md`
- 루트 `SECURITY.md`
- `.github/pull_request_template.md`
- 구조화된 issue template/config

**작업 범위**

- 로컬 개발·테스트·pack 명령
- warning-first와 hard gate 구분
- 사람 전용 resolve/confirmed 불변식
- 민감한 Figma PAT·consumer 원본 신고/처리 원칙
- PR 체크리스트: tests, docs owner, payload boundary, no new gate
- bug report에 reproduction, Node/OS, consumer/kit commit 포함

**수용 기준**

- [ ] 외부 또는 미래 기여자가 동일한 검증 절차를 재현 가능
- [ ] 보안 취약점 공개 채널을 issue와 분리
- [ ] PR 템플릿이 형식적인 체크박스가 아니라 핵심 불변식을 검토
- [ ] README와 중복 최소화

**권장 라벨**

`governance`, `documentation`, `security`

---

## IMP-07. dependency update 자동화

**권장 이슈 제목**

`chore(deps): add low-noise dependency update automation`

**배경**

런타임 의존성은 현재 `yaml` 하나로 작지만 GitHub Actions와 Node compatibility도 지속 갱신 대상이다. `.github/dependabot.yml`은 현재 없다.

**작업 범위**

- npm과 GitHub Actions update source
- 월간 또는 저빈도 schedule
- major update는 자동 merge 금지
- distribution/golden tests를 required
- lockfile drift를 명확히 표시

**수용 기준**

- [ ] update PR 빈도가 프로젝트 규모에 맞게 낮음
- [ ] Actions와 npm을 분리 그룹화
- [ ] 자동 merge가 사람 승인 규칙을 우회하지 않음
- [ ] update PR에서 pack/test 증거 확인 가능

**권장 라벨**

`dependencies`, `maintenance`

---

## IMP-08. MCP-native gate serving 검증 spike

**권장 이슈 제목**

`research(mcp): validate a thin read-only wrapper over existing workflow CLIs`

**배경**

next-ideas의 다섯 아이디어 중 실질적으로 아직 연구 단계인 항목이다. 단, CLI와 package script가 이미 충분히 풍부하므로 실제 소비 마찰이 확인되기 전에는 제품 구현을 서두르지 않는다.

**검증 질문**

- 에이전트별 `--json` 파싱 중복이 실제 장애인가
- MCP wrapper가 install/upgrade 복잡성을 줄이는가
- subprocess 소비만으로 판정 단일 출처를 유지할 수 있는가
- stdio lifecycle과 repo root 선택이 안정적인가
- read-only resource와 mutating tool을 명확히 분리할 수 있는가

**스파이크 범위**

- `state`, `readiness`, `validate` read-only 도구 3개
- 기존 CLI subprocess 호출
- 자동 resolve/confirm/write 없음
- 임시 consumer repo에서 latency·error mapping 측정
- 구현 채택 여부를 decision note로 종료

**수용 기준**

- [ ] readiness 로직 재구현 0
- [ ] exit 0/1/2가 안정된 tool error로 매핑
- [ ] 절대경로·민감 파일이 응답에 새지 않음
- [ ] CLI 대비 명확한 adoption 이점이 측정됨
- [ ] 이점이 없으면 “채택 안 함”으로 정상 종료

**권장 라벨**

`research`, `mcp`, `post-mvp`, `decision-required`

---

## IMP-09. 릴리스 자동화와 provenance

**권장 이슈 제목**

`feat(release): generate reproducible payload metadata and release notes`

**배경**

kit은 `private` package지만 실제 배포는 packed payload vendoring이다. npm publish보다 payload provenance가 중요하다.

**작업 범위**

- release commit SHA, kit version, manifest version을 payload metadata에 기록
- pack 결과의 deterministic manifest/hash 생성
- release note 초안 생성
- tag와 payload source commit 검증
- GitHub release asset은 필요성 검토 후 선택

**수용 기준**

- [ ] 같은 commit에서 같은 payload manifest 생성
- [ ] local modification을 release artifact에 섞지 않음
- [ ] consumer upgrade planner가 source version을 표시
- [ ] release 자동화가 사람 승인 없이 태그를 만들지 않음

**권장 라벨**

`release-engineering`, `distribution`, `provenance`

---

## IMP-10. 경고 surface 운영 dashboard/추세 요약

**권장 이슈 제목**

`feat(telemetry): summarize warning trends without introducing a gate`

**배경**

telemetry ledger와 여러 surface가 구현되었지만, 장기 추세를 사람이 비교하는 운영 표면은 제한적이다. 이 작업은 실제 consumer runs가 축적된 뒤에만 가치가 있다.

**작업 범위**

- run별 surface availability와 warning count 추세
- 새 경고·해소 경고·지속 경고 구분
- consumer identity는 익명/로컬 별칭
- verdict, pass/fail, 자동 promotion 없음
- markdown 또는 JSON summary 생성

**수용 기준**

- [ ] raw warning 수만으로 품질 점수를 만들지 않음
- [ ] unavailable과 zero-warning을 구분
- [ ] baseline reset과 tool version 변경을 표시
- [ ] 민감한 파일 경로·copy·consumer 이름을 노출하지 않음
- [ ] CI required check로 연결하지 않음

**권장 라벨**

`telemetry`, `analytics`, `warning-first`, `post-adoption`

---

## 4. 열지 말아야 할 이슈

다음은 현재 증거만으로 새 이슈를 만들 필요가 없다.

- #150/#151/#153 재오픈
- visual/telemetry/red-team을 hard gate로 만드는 작업
- 새 artifact axis 추가
- Unknowns/Conflicts/Work Packet을 readiness gate로 만드는 작업
- LLM이 Open Decision을 자동 resolve하는 기능
- 모든 historical `temp/` 파일을 일괄 삭제하는 cleanup
- 완전한 semantic document truth 판정
- MCP 도입을 전제로 한 대규모 아키텍처 변경

---

## 5. 추천 이슈 생성 순서

1. **MVP release closure tracker** 한 건
2. P0 문서·버전 PR
3. P0 CI·release evidence PR
4. IMP-01 승격 정책
5. IMP-02 status drift 검사
6. IMP-03 `.gitattributes`
7. IMP-04 evidence archive/index
8. IMP-05 packed payload smoke
9. P2는 실제 필요가 관측될 때만 생성

이 순서는 저장소의 기존 원칙인 “정본 변경을 병렬로 열지 않고, 하나를 완료한 뒤 다음으로 이동”과 일치한다.

---

## 6. 분석 근거

- [package.json](https://github.com/KiDooSong/k-frontend-workflow/blob/59a2b8d30e60481c3d1dea53d259eb99a13b84e5/frontend-workflow-kit/package.json)
- [CI workflow](https://github.com/KiDooSong/k-frontend-workflow/blob/59a2b8d30e60481c3d1dea53d259eb99a13b84e5/.github/workflows/frontend-workflow-kit.yml)
- [roadmap](https://github.com/KiDooSong/k-frontend-workflow/blob/59a2b8d30e60481c3d1dea53d259eb99a13b84e5/kit-dev/roadmap-current.md)
- [IMPLEMENTING](https://github.com/KiDooSong/k-frontend-workflow/blob/59a2b8d30e60481c3d1dea53d259eb99a13b84e5/IMPLEMENTING.md)
- [next ideas](https://github.com/KiDooSong/k-frontend-workflow/blob/59a2b8d30e60481c3d1dea53d259eb99a13b84e5/docs/research/next-ideas/README.md)
- [CHANGELOG](https://github.com/KiDooSong/k-frontend-workflow/blob/59a2b8d30e60481c3d1dea53d259eb99a13b84e5/kit-dev/CHANGELOG.md)
- [distribution manifest](https://github.com/KiDooSong/k-frontend-workflow/blob/59a2b8d30e60481c3d1dea53d259eb99a13b84e5/frontend-workflow-kit/distribution-manifest.yaml)
- [.gitignore](https://github.com/KiDooSong/k-frontend-workflow/blob/59a2b8d30e60481c3d1dea53d259eb99a13b84e5/.gitignore)
- [PR #156](https://github.com/KiDooSong/k-frontend-workflow/pull/156)
- [과거 MVP-B release check](https://github.com/KiDooSong/k-frontend-workflow/blob/59a2b8d30e60481c3d1dea53d259eb99a13b84e5/temp/runs/release-mvp-b-final-check.md)

---

## 7. 분석 한계

이 백로그는 GitHub 원격 상태와 소스 파일을 기준으로 작성했다. 테스트를 로컬에서 재실행하지 못했고 최신 merge commit의 Actions 결과도 별도로 확인되지 않았다. 따라서 테스트 실패·플랫폼 오류가 새로 확인되면 P0 우선순위를 재조정해야 한다.

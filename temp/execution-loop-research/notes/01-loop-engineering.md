# 루프 엔지니어링과 `k-frontend-workflow` 확장 가능성 메모

작성일: 2026-06-14  
목적: Claude 등 다른 LLM으로 가져가서 `k-frontend-workflow` 프로젝트의 루프 엔지니어링 확장 방향을 더 구체화하기 위한 정리.

---

## 1. 요즘 떠오르는 루프 엔지니어링이란?

요즘 말하는 **루프 엔지니어링(loop engineering)**은 대체로 **AI 에이전트, 특히 코딩 에이전트를 사람이 매번 프롬프트로 조종하는 대신, 에이전트가 스스로 “실행 → 관찰 → 판단 → 수정 → 검증 → 반복/중단”하도록 반복 시스템을 설계하는 방법**을 뜻한다.

아직 정식 학문 분야라기보다는 2026년 6월 전후로 AI 개발자 커뮤니티에서 빠르게 퍼진 신조어에 가깝다. Addy Osmani는 이를 “에이전트에게 프롬프트하는 사람 역할을 시스템으로 대체하는 것”이라고 설명하면서도, 아직 초기 단계이고 토큰 비용과 검증 실패를 조심해야 한다고 본다.

참고:
- Addy Osmani, *Loop Engineering*: https://addyosmani.com/blog/loop-engineering/
- Firecrawl, *Loop Engineering*: https://www.firecrawl.dev/blog/loop-engineering
- Louis Bouchard, *Loop Engineering*: https://www.louisbouchard.ai/loop-engineering/
- OpenAI Agents guide: https://developers.openai.com/api/docs/guides/agents
- LangChain, *Give your AI agent its own computer*: https://www.langchain.com/blog/give-your-ai-agent-its-own-computer
- MindStudio, *What is loop engineering?*: https://www.mindstudio.ai/blog/what-is-loop-engineering-ai-coding-agents
- SonarSource, *Loop engineering without verification is just automation*: https://www.sonarsource.com/blog/loop-engineering-without-verification-is-just-automation/

### 핵심 아이디어

기존 방식은 이랬다.

```txt
사람: “이 버그 고쳐줘”
AI: 코드 수정
사람: 테스트 실행
테스트 실패
사람: 에러 붙여넣기
AI: 다시 수정
사람: 다시 확인
...
```

루프 엔지니어링은 이 반복을 사람이 직접 하지 않도록 만든다.

```txt
시스템이 이슈/CI 실패/PR/문서 변경을 감지
→ 에이전트가 작업 선택
→ 코드 수정 또는 문서 작성
→ 테스트/린트/타입체크/리뷰 에이전트로 검증
→ 실패하면 원인 분석 후 재시도
→ 성공하면 PR 생성 또는 사람에게 승인 요청
→ 정해진 조건에 도달하면 중단
```

그래서 프롬프트 하나를 잘 쓰는 기술이라기보다, **프롬프트를 포함한 전체 반복 구조를 설계하는 기술**에 가깝다. Firecrawl은 루프의 중심을 “act, observe, reason, repeat”로 설명하고, 모델을 채팅 상대가 아니라 루프 안에서 호출되는 함수처럼 다루는 관점으로 정리한다.

### 프롬프트 엔지니어링과의 차이

| 구분 | 프롬프트 엔지니어링 | 루프 엔지니어링 |
|---|---|---|
| 관심사 | 한 번의 입력을 잘 쓰기 | 여러 번의 실행과 피드백을 설계 |
| 사람 역할 | 매 턴 지시하고 결과 확인 | 목표, 도구, 검증, 중단 조건 설계 |
| AI 역할 | 답변 생성 | 상태를 보고 다음 행동 선택 |
| 적합한 일 | 단발성 질의, 초안 작성 | 디버깅, 리팩터링, 모니터링, 반복 조사 |
| 핵심 리스크 | 답변 품질 | 무한 반복, 비용 폭주, 잘못된 자동 배포 |

중요한 차이는 **단순 자동화와도 다르다**는 점이다. cron job처럼 정해진 스크립트를 반복 실행하는 것이 아니라, 에이전트가 현재 상태를 보고 다음 행동을 고르고, 계속할지/되돌릴지/멈출지를 판단한다는 점이 루프 엔지니어링의 핵심이다.

### 왜 지금 뜨는가

첫째, AI 코딩 에이전트가 단순 답변을 넘어 파일을 읽고, 코드를 수정하고, 테스트를 실행하고, 결과를 보고 다시 고치는 수준으로 발전했기 때문이다.

둘째, 에이전트에게 실제 작업 환경을 주는 흐름이 강해졌기 때문이다. 코드 실행형 에이전트에는 검색 API나 계산기 같은 고정 도구만으로는 한계가 있고, 에이전트가 코드를 작성·실행하고 결과를 관찰할 수 있는 안전한 샌드박스 환경이 필요하다.

셋째, 개발자 입장에서 “AI에게 계속 에러를 붙여넣고 다시 시키는 일” 자체가 병목이 됐기 때문이다. 루프 엔지니어링은 그 병목을 줄여, 사람이 매번 마이크로매니징하는 대신 **반복되는 판단과 검증을 시스템화**하려는 시도다.

### 좋은 루프의 구성 요소

실무적으로는 보통 이런 부품들이 필요하다.

1. **트리거**: 언제 시작할 것인가. 예를 들어 CI 실패, 새 이슈, PR 생성, 일정 시간, 특정 문서 변경.
2. **목표**: 무엇을 달성해야 하는가. “버그 고치기”보다 “테스트 X가 통과하고 타입체크가 깨지지 않게 수정”처럼 검증 가능해야 한다.
3. **작업 환경**: repo, 브랜치, worktree, 파일 시스템, 샌드박스, API, DB, 브라우저 등.
4. **에이전트 실행부**: 코드를 고치거나 문서를 작성하거나 데이터를 수집하는 주체.
5. **관찰/로그**: 실행 결과, 에러, diff, 테스트 결과, 비용, 토큰 사용량을 기록.
6. **검증기**: 테스트, 린트, 타입체크, 보안 스캔, 리뷰 에이전트, 사람 승인.
7. **메모리/상태**: 이미 시도한 방법, 실패 원인, 진행 중인 작업, 다음 액션.
8. **중단 조건**: 성공, 반복 횟수 초과, 비용 초과, 진전 없음, 위험 작업 감지.

잘 설계된 루프에는 명확한 목표와 종료 조건, 도구 접근, 컨텍스트 관리, 실패 탈출 조건, 단순 재시도가 아닌 실제 오류 처리 전략이 필요하다.

### 예시: 자동 버그 수정 루프

```txt
매일 아침 또는 CI 실패 시 시작
→ 실패한 테스트와 최근 변경 사항 읽기
→ 원인 후보 정리
→ 별도 브랜치/워크트리에서 수정
→ 테스트 실행
→ 실패하면 에러를 읽고 1~2회 재시도
→ 성공하면 diff 요약과 함께 PR 생성
→ 위험하거나 애매하면 사람에게 넘김
```

이때 핵심은 “AI야 버그 고쳐줘”가 아니라, **어떤 테스트를 기준으로 성공을 판단할지, 몇 번까지 재시도할지, 어떤 파일은 건드리면 안 되는지, 언제 사람에게 넘길지**를 설계하는 것이다.

### 어디에 잘 맞나

루프 엔지니어링이 특히 잘 맞는 일은 세 조건을 만족한다.

**반복적이고**, **검증 가능하고**, **자동화할 만큼 가치가 있는 일**이다.

| 분야 | 루프 예시 |
|---|---|
| 소프트웨어 개발 | 실패한 테스트 고치기, 작은 리팩터링, 의존성 업데이트 후 회귀 테스트 |
| 문서화 | SDK 변경사항 감지 → 문서 수정 → 예제 코드 검증 |
| 데이터/리서치 | 경쟁사 페이지 변경 감지 → 요약 → 내부 리포트 갱신 |
| 운영 | 에러 로그 분석 → 원인 후보 정리 → 티켓 생성 |
| QA | UI 스펙과 실제 화면 비교 → 이슈 생성 |
| 고객지원 | 반복 문의 분류 → 초안 작성 → 사람 승인 후 발송 |

반대로 “우리 회사 전략을 알아서 개선해줘”, “좋은 글을 끝없이 다듬어줘”처럼 성공 기준이 모호한 일은 루프가 불필요하게 오래 돌거나 엉뚱한 방향으로 최적화될 수 있다.

### 가장 큰 위험: 검증 없는 루프

루프 엔지니어링에서 제일 위험한 부분은 **AI가 스스로 ‘완료했다’고 말하는 것을 완료 조건으로 믿는 것**이다. 검증 없는 루프 엔지니어링은 사실상 자동화에 불과하며, 최종 게이트는 재현 가능한 테스트·보안·품질 검증처럼 결정적인 체크여야 한다.

위험은 크게 네 가지다.

1. **비용 폭주**: 에이전트가 스스로 계속 프롬프트하고 재시도하면 토큰과 API 비용이 빠르게 늘어날 수 있다.
2. **무한 루프**: 종료 조건이 없거나 “충분히 좋아질 때까지” 같은 모호한 목표를 주면 계속 수정만 반복할 수 있다.
3. **품질 착시**: 테스트는 통과했지만 요구사항을 잘못 이해했거나, 문서만 그럴듯하게 바꾸고 실제 동작은 틀릴 수 있다.
4. **이해 부채(comprehension debt)**: AI가 만든 코드가 머지됐는데 팀이 그 코드를 이해하지 못하면 나중에 유지보수 비용이 커진다.

### 실무적으로 시작하는 법

처음부터 “자율 개발자”를 만들려고 하기보다, 작은 폐쇄 루프부터 시작하는 게 좋다.

```txt
1. 반복되는 귀찮은 작업 하나를 고른다.
2. 성공/실패를 기계적으로 판단할 수 있는 기준을 만든다.
3. 에이전트가 볼 수 있는 컨텍스트와 만질 수 있는 도구를 제한한다.
4. 최대 반복 횟수, 최대 비용, 최대 실행 시간을 둔다.
5. 테스트·린트·타입체크 같은 결정적 검증을 넣는다.
6. 배포, 결제, 데이터 삭제 같은 위험 작업은 사람 승인 뒤에만 하게 한다.
7. 로그를 남겨서 왜 그런 결정을 했는지 추적한다.
```

제일 좋은 첫 프로젝트는 보통 “실패한 테스트 하나를 고치는 루프”, “문서 링크 깨짐을 고치는 루프”, “정해진 형식의 이슈를 정리하는 루프”처럼 범위가 좁고 성공 기준이 분명한 작업이다.

### 한 문장 정리

**루프 엔지니어링은 ‘AI에게 좋은 지시를 쓰는 법’에서 한 단계 올라가, AI가 스스로 일하고 검증하고 멈추는 반복 시스템을 설계하는 방법**이다. 다만 진짜 실력은 에이전트를 오래 돌리는 데 있지 않고, **언제 멈추게 할지, 무엇으로 검증할지, 어디까지 자율권을 줄지**를 정교하게 설계하는 데 있다.

---

## 2. `KiDooSong/k-frontend-workflow`와 연결해서 본 확장 가능성

대상 repo: https://github.com/KiDooSong/k-frontend-workflow

결론부터 말하면, **“새 산출물 축을 하나 더 늘리는 건 지금은 비추천, 대신 기존 `Work Packet & Review Artifacts`를 ‘실행 루프 축’으로 키우는 건 유망”**하다.

현재 repo는 이미 루프 엔지니어링 쪽으로 설계가 많이 가 있다. `roadmap-current.md`에 핵심 루프가 다음처럼 고정되어 있다.

```txt
Input Skill → Reconciliation → Documents → State → Readiness → Work → Validate
```

그리고 코드로 강제되는 구간은 `Documents → State → Readiness → Validate`라고 명시되어 있다.

근거:
- `frontend-workflow-kit/roadmap-current.md`, 핵심 루프 및 MVP-A 강제 구간.

### 지금 축을 “그냥 하나 더” 늘리면 안 좋아 보이는 이유

로드맵에 이미 산출물 축이 닫혀 있다.

```txt
저작 문서        screen-spec / navigation-map / llm-rules / domain-rules
생성 상태        _meta/workflow-state.yaml · screen-inventory.yaml
결정             Open Decisions (readiness cap)
입력 정합        Input Reconciliation (register · conflict · re-open)
조사/검증        Investigation / Verification (evidence handoff)
```

그리고 바로 아래에 “이 목록은 닫혔다”, “지금 단계의 목표는 새 축을 더 만드는 게 아니라 위 축들의 경계를 선명히 하는 것”이라고 적혀 있다. 더 강하게는 “지금 하지 말 것”에 **새 산출물 축 추가 금지**, **LLM이 게이트를 내리게 만드는 자동화 금지**, **Unknown/Conflict/Work Packet/Review를 readiness 게이트로 만들기 금지**가 들어가 있다.

근거:
- `frontend-workflow-kit/roadmap-current.md`
  - 산출물 축 목록 및 “이 목록은 닫혔다” 부분.
  - “지금 하지 말 것” 섹션.

그래서 새 `artifact_type`이나 새 canonical 문서 축을 추가하는 방향은 지금 프로젝트 철학과 충돌한다.

### 그래도 늘릴 수 있는 한 축: “실행 루프 축”

늘린다면 이름은 대략 이렇게 잡는 게 좋아 보인다.

> **Execution Loop / Work Packet Runner 축**  
> 기존 `readiness → work → validate`를 사람이 손으로 굴리는 대신, 한 작업 단위로 포장하고 실행 결과를 증거로 남기는 축.

이건 새 source of truth가 아니라, **기존 게이트를 소비하는 실행 봉투**다.

실제로 `work-packet.template.md`도 Work Packet을 “새로운 source of truth도, 새로운 gate도 아니다”라고 정의하고, readiness 출력을 재계산하지 말고 그대로 소비하라고 한다.

근거:
- `frontend-workflow-kit/templates/work-packet/work-packet.template.md`
  - Work Packet은 source of truth/gate가 아님.
  - readiness output을 재계산하지 않고 소비.
  - allowed_paths / forbidden_paths는 readiness output에서 그대로 복사.

즉 “축을 늘린다”기보다는, 이미 Future Candidate로 잡힌 `Work Packet & Review Artifacts`를 **루프 엔지니어링 관점의 실행 계층으로 승격**하는 쪽이다. 로드맵도 이 항목을 Future Candidate로 두고, Review Gates를 독립 축으로 만들지 말고 Work Packet 안에서 다루라고 적고 있다.

### 현재 repo와 잘 맞는 루프 형태

지금 repo에는 루프의 핵심 부품들이 이미 있다.

#### 1. `workflow-state.mjs`

`workflow-state.mjs`는 ScreenSpec들을 읽어 `_meta/workflow-state.yaml`과 `screen-inventory.yaml`을 생성하고, 상태·route·stub 여부·derived metrics를 모은다.

근거:
- `frontend-workflow-kit/scripts/workflow-state.mjs`
  - `buildState({ docsDir, srcDir, date })`
  - `screen-spec.md` 수집
  - `workflow-state.yaml` / `screen-inventory.yaml` 생성.

#### 2. `readiness.mjs`

`readiness.mjs`는 상태와 정책을 읽어 화면별 다음 정보를 산출한다.

```txt
readiness_mode
next_mode
allowed_paths
forbidden_paths
blocking
next_actions
```

근거:
- `frontend-workflow-kit/scripts/readiness.mjs`
  - `computeReadiness({ state, policy, ci, manifest })`
  - 화면별 readiness 결과 생성.

#### 3. `validate.mjs`

`validate.mjs`는 frontmatter, manifest, 참조, route, generated marker, 승인 메타데이터, Open Decisions, inputs/register 등 12종 검사를 CI 게이트 성격으로 수행한다.

근거:
- `frontend-workflow-kit/scripts/validate.mjs`
  - 검사 12종 주석.
  - Open Decisions 형식 검사.
  - API Candidates ↔ api-manifest ↔ zod export 매칭 강화.

#### 4. `forbidden-paths.mjs`

`forbidden-paths.mjs`도 이미 루프의 좋은 방어선이다. readiness를 다시 판단하지 않고 `computeReadiness`를 소비해서, diff가 아직 열리지 않은 경로를 건드렸는지 잡는다. 설계상 live gate가 아니라 훅 없는 환경과 CI용 backstop이다.

근거:
- `frontend-workflow-kit/scripts/forbidden-paths.mjs`
  - forward/live gate와 backstop 분리.
  - diff 기반 경계 검사.
  - `computeReadiness`를 import해서 소비.
  - warning-first, `--enforce`로 hard gate 가능.

### 추천 루프

추가 축은 이런 식이면 자연스럽다.

```txt
Trigger
→ workflow:state
→ workflow:readiness
→ Work Packet 생성
→ implement-screen 실행 또는 사람/에이전트 작업
→ workflow:validate
→ workflow:forbidden-paths
→ npm test / test-fixtures
→ Run Report + Review Artifact
→ 통과면 PR/머지 후보, 실패면 blocker/next_actions 보고 후 중단
```

여기서 중요한 건 **에이전트가 결정을 닫거나 confirmed로 승격하지 않는 것**이다.

`implement-screen` 스킬도 readiness를 직접 판단하지 않고 스크립트 출력을 그대로 따르며, 금지 경로와 추측을 막는 구조다.

근거:
- `frontend-workflow-kit/skills/implement-screen/SKILL.md`
  - readiness 출력 소비.
  - 직접 판단 금지.
  - allowed_paths 안에서만 수정.
  - forbidden_paths 수정 금지.
  - API endpoint / 디자인 값 / 문구 추측 금지.

### 추천하는 구체적 확장 단위

가장 좋은 1차 PR은 **새 산출물 축이 아니라 `workflow:packet` 또는 `workflow:run` 계열의 얇은 runner**다.

예를 들면:

```json
{
  "workflow:packet": "node scripts/work-packet.mjs",
  "workflow:report": "node scripts/run-report.mjs",
  "workflow:loop:check": "npm run workflow:state && npm run workflow:readiness && npm run workflow:validate && npm run workflow:forbidden-paths"
}
```

현재 `package.json`에는 이미 다음 명령이 있다.

```json
{
  "workflow:state": "node scripts/workflow-state.mjs",
  "workflow:readiness": "node scripts/readiness.mjs",
  "workflow:validate": "node scripts/validate.mjs",
  "workflow:forbidden-paths": "node scripts/forbidden-paths.mjs",
  "example:state": "node scripts/workflow-state.mjs --docs examples/coupon-feature/docs/frontend-workflow --src examples/coupon-feature/src --date 2026-06-13",
  "example:readiness": "node scripts/readiness.mjs --docs examples/coupon-feature/docs/frontend-workflow",
  "example:validate": "node scripts/validate.mjs --docs examples/coupon-feature/docs/frontend-workflow --src examples/coupon-feature/src",
  "example:test": "node scripts/test-fixtures.mjs",
  "test": "node scripts/test-fixtures.mjs"
}
```

근거:
- `frontend-workflow-kit/package.json`

그러니 완전히 새 시스템을 붙이기보다, 이 명령들을 **하나의 실행 단위로 묶는 얇은 orchestration**이 맞다.

#### `work-packet.mjs`의 최소 역할

```txt
입력: --screen COUPON-001 --requested-mode rough-fixture-ui

1. workflow-state 실행 또는 기존 state 확인
2. readiness --json 실행
3. readiness_mode / allowed_paths / forbidden_paths / blocking 복사
4. templates/work-packet/work-packet.template.md 채워서 temp/runs/<run-id>/work-packet.md 생성
5. UI 구현 가능 모드가 아니면 "거절 packet" + blocker 보고 후 종료
```

#### `run-report.mjs`의 최소 역할

```txt
1. git diff --name-status 수집
2. validate 결과 수집
3. forbidden-paths 결과 수집
4. test-fixtures 결과 수집
5. templates/work-packet/run-report.template.md 채움
```

이미 `run-report.template.md`도 readiness를 재계산하지 말고 source를 소비하고, 경계 준수는 validate가 아니라 diff/해시 스냅샷으로 보고하라고 되어 있다. 그리고 Gate Compliance 표와 Idempotency 섹션까지 있어, 루프 실행 결과를 남기기에 딱 맞다.

근거:
- `frontend-workflow-kit/templates/work-packet/run-report.template.md`
  - readiness_source 소비.
  - 경계 준수는 diff/해시 스냅샷으로 보고.
  - Gate Compliance.
  - Idempotency.

### 왜 이 축이 루프 엔지니어링에 맞는가

지금 프로젝트는 “LLM이 추론하던 것을 파일로 고정한다”는 방향이다.

- 상태는 `workflow-state`.
- 판정은 `readiness`.
- 검증은 `validate`.
- 경로 위반은 `forbidden-paths`.
- 회귀는 `test-fixtures`.

`test-fixtures.mjs`도 손으로 하던 hash/grep 대조를 코드화하고, 기존 예제와 드라이런 결과를 반복 가능한 회귀 검사로 굳힌다고 설명되어 있다.

근거:
- `frontend-workflow-kit/scripts/test-fixtures.mjs`
  - golden fixture 비교 하니스.
  - 손으로 하던 hash+grep 대조를 코드화.
  - state/readiness/validate 출력 재현 회귀.
  - forbidden_paths 검사는 Lane B 소관으로 분리.

그러면 남은 빈칸은 **판정 자체가 아니라 “판정 이후의 실행을 어떻게 반복 가능하게 만들 것인가”**다.

현재는:

```txt
state/readiness/validate는 기계화됨
하지만 "이번 실행이 어떤 readiness를 보고 무엇을 했는지"는 아직 사람이 세션 단위로 관리
```

추천 축은 이 빈칸을 메운다.

```txt
판정 결과를 Work Packet으로 고정
→ 실행
→ diff/validate/forbidden-paths/test-fixtures로 평가
→ Run Report로 증거화
→ 다음 루프의 입력으로 넘김
```

### 하지 않는 게 좋은 방향

#### 1. Review를 독립 readiness gate로 만들기

이미 로드맵이 Review를 새 축이 아니라 Work Packet 후보 안에서 다루라고 한다.

#### 2. Investigation/Verification을 직접 readiness gate로 파싱하기

로드맵은 Investigation이 직접 막는 것이 아니라, 막아야 하면 연결된 Open Decision이 blocker가 되어야 한다고 못박고 있다.

#### 3. LLM이 open decision, unknown, conflict를 닫게 만드는 자동 루프

Work Packet 템플릿도 Open Decision, Unknown, Conflict를 닫지 말고 나열만 하라고 되어 있고, Out of Scope에서도 결정/Unknown/Conflict close와 candidate→confirmed 승격을 금지한다.

근거:
- `frontend-workflow-kit/templates/work-packet/work-packet.template.md`
  - Blocking Items는 “푸는 목록”이 아니라 “닫지 말 것” 목록.
  - Open Decision resolve / Conflict close / Unknown close 금지.
  - candidate → confirmed 승격 금지.

### 한 줄 판단

**여지는 있다. 다만 새 “문서/상태/결정” 축을 추가하지 말고, 기존 `Work Packet & Review Artifacts`를 `Execution Loop`로 키우는 방식이 가장 안전하다.**

추천 축:

```txt
Work Packet Runner 축
= readiness 결과를 소비해 한 세션의 허용 범위·작업·검증·리뷰 증거를 자동 포장하는 실행 루프
```

첫 구현은 `workflow:packet` + `workflow:report` 정도로 얇게 시작하는 게 좋다. 이렇게 하면 프로젝트의 핵심 불변식인 **판정 단일 출처, 사람 전용 승인, 게이트 확장 금지**를 유지하면서도 루프 엔지니어링의 장점인 **반복 실행·관찰·검증·보고 자동화**를 추가할 수 있다.

---

## 3. Claude에 넘겨볼 구체화 질문

아래 질문을 Claude에게 그대로 던지면 다음 단계 설계로 이어가기 좋다.

```txt
아래 전제에서 k-frontend-workflow에 Execution Loop / Work Packet Runner 축을 추가하려고 한다.

전제:
- 새 source of truth나 새 readiness gate는 만들지 않는다.
- readiness.mjs가 판정의 단일 출처다.
- Work Packet은 readiness output을 소비하는 실행 봉투다.
- Open Decision / Unknown / Conflict / candidate→confirmed 승격은 사람 전용이다.
- validate, forbidden-paths, test-fixtures는 실행 후 검증 증거로만 사용한다.

요청:
1. workflow:packet / workflow:report의 최소 MVP 스코프를 정의해줘.
2. scripts/work-packet.mjs와 scripts/run-report.mjs의 입출력 계약을 제안해줘.
3. artifact-manifest.yaml에 등록해야 하는지, 아니면 Future Candidate 문서로만 두는 게 좋은지 판단해줘.
4. 기존 invariants를 깨뜨릴 수 있는 위험을 체크리스트로 정리해줘.
5. 첫 PR을 200~400 LOC 이내로 쪼갠다면 어떤 파일만 건드리는 게 좋은지 제안해줘.
```

---

## 4. 핵심 불변식 요약

```txt
1. readiness.mjs = 판정 단일 출처.
2. Work Packet = 실행 봉투, source of truth 아님.
3. Review = 독립 gate 아님, Work Packet 안의 evidence/checklist.
4. Investigation/Verification = 직접 gate 아님. 막아야 하면 Open Decision으로 연결.
5. LLM은 결정을 닫지 않는다.
6. LLM은 unknown/conflict를 닫지 않는다.
7. LLM은 candidate를 confirmed로 올리지 않는다.
8. generated file은 직접 편집하지 않는다.
9. allowed_paths/forbidden_paths는 readiness output에서 복사만 한다.
10. 검증 없는 루프는 금지. validate + forbidden-paths + test-fixtures + diff evidence가 필요하다.
```

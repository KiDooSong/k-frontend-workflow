# Expected Validation — multi-screen-dry-run

> `npm run workflow:validate` 의 예상 결과. 2026-06-13 실제 실행으로 검증됨.

## 실행

```bash
node scripts/validate.mjs \
  --docs examples/multi-screen-dry-run/docs/frontend-workflow \
  --src  examples/multi-screen-dry-run/__no_src__
```

## 예상 결과

```
workflow:validate — OK (검사 9종 통과)
exit 0
```

이 fixture 는 의도적으로 **검사 9종을 모두 통과**한다 (깨끗한 입력). implement-screen 테스트가 게이트 위반을 만들면 그때 validate 가 잡아야 한다.

## 화면별로 이 fixture 가 만족하는 검사

| 검사 | 내용 | 이 fixture 에서 |
|---|---|---|
| 1 | frontmatter ↔ schema | screen-spec/navigation-map/domain-rules/component-gap-register/component-guidelines/api-manifest 만 `artifact_type` 보유 (schema enum). flows/policy/glossary 및 `_meta/`(conflicts·decision-log·tags) 는 `artifact_type` 없음 → 검사 제외 |
| 2 | manifest 필수 frontmatter + 경로 | screen-spec/navigation-map/domain-rules/component-gap-register 가 manifest 경로·필수 필드 충족. component-gap-register 는 manifest 규정대로 `global/` 에 둠 |
| 3 | 끊어진 참조 | `depends_on: [navigation-map]` 만 사용(파일 존재). sources 는 모두 non-local ref → 파일 존재 검사 비대상 |
| 4 | 이동 대상 route 존재 | 모든 Interaction Matrix route 결과가 6개 화면 route 집합 안에 있음 |
| 5 | screen_id / route 중복 | 중복 없음 |
| 6 | 생성물 헤더 + GENERATED 마커 | 비-stub screen-spec 의 Entry Points `GENERATED:START/END nav-graph` 정상. (raw 생성물 .yaml 은 커밋하지 않음 — .snapshot.md 로 대체) |
| 7 | confirmed 승인 메타 | AUTH-001(confirmed) 에 approved_by/approved_at/decision_id 존재 |
| 8 | confirmed API → 스키마 | baseline 의 API Candidate 는 모두 ≤ candidate → 검사 비대상 (confirmed 없음) |
| 9 | (그 외) | 통과 |

## 메모: 구조 정합

- 가이드 트리는 `component-gap-register.md` 를 `design/` 아래로 그렸지만, 킷의 `artifact-manifest.yaml` 은 이 산출물의 경로를 `global/component-gap-register.md` 로 못박는다. `design/` 에 두면 검사 2(잘못된 경로)에 걸리므로 **manifest 경로(`global/`)** 를 따랐다. 그래서 이 트리에는 `component-gap-register.md` 만 담은 최소 `global/` 디렉토리가 있다.
- `conflicts.md`·`decision-log.md` 는 가이드대로 `_meta/` 에 둔다. validate 가 `_meta/` 를 제외하므로 검사 대상이 아니다. 특히 `conflicts.md` 는 `artifact_type` 없는 passive 로그로 두었다 — 정식 검증 대상 conflicts 산출물의 manifest 경로는 `global/conflicts.md` 다.

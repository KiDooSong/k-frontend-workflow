# evidence/ — verbatim 캡처 경계

이 디렉토리의 파일은 dogfood run 중 실행한 명령의 **verbatim 산출물/출력 캡처**다
(분류·판정은 [../run-report.md](../run-report.md)가 정본).

- [upgrade-plan-dry-run.md.txt](upgrade-plan-dry-run.md.txt) 는 planner 가 생성한 plan 문서를
  그대로 복사한 것이다(내용 무수정 — 저장소 markdown 링크 검사 대상이 되지 않도록 확장자만
  `.txt`). plan 이 embed 하는 upgrade-notes 본문의 상대 링크
  (`input-reconciliation.md` · `screen-identity.md`)는 원래 킷의
  `docs/reference/` 기준 링크라서 **plan 파일 위치(및 consumer 의 `_upgrade/` 위치)에서는
  해석되지 않는다** — 캡처를 수정해 링크를 고치지 않고 그대로 보존한다.
  같은 현상이 consumer 쪽 plan 파일에서 doc-drift `broken-relative-link` warning 2건으로
  관측되었고, run-report §7 에 kit 후속 이슈 후보로 분류되어 있다.
- `*.json` 은 기계 판독용 원본(재검증용)이며 사람용 요약은 run-report 표가 담당한다.

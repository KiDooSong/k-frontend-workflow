# telemetry-adoption-probe 픽스처 (telemetry ingest 전용)

`workflow:telemetry --include adoption` 의 **ingest 입력 픽스처**다.
여기 있는 `probe-summary.json` 들은 `workflow:adoption-probe` 출력 스키마를 흉내 낸
**synthetic(합성) 파일**이며, 실제 `temp/runs/adoption-probe-*` run dir 이 아니다.

- telemetry 는 이 summary 파일을 **읽기만** 한다 — adoption-probe 를 실행하지 않고,
  probe run dir/scratch copy 를 만들지 않으며, summary 이외의 observation 파일을 파싱하지 않는다.
- 경로 placeholder(`<probe-run>`, `<target-repo>`)는 adoption-probe 의 sanitized 출력 규약을 따른 것으로,
  telemetry 는 이 값들을 해석하지 않는다 (ledger 에는 summary 파일의 root-relative 경로만 기록).
- 여기의 `draft_only`/`gate:false` 는 probe 의 기존 boundary 필드 보존 시연일 뿐, verdict 가 아니다.

| 픽스처 | 내용 |
|---|---|
| `basic-run/probe-summary.json` | `--visual` 없이 실행된 probe 의 최소 summary (visual.enabled=false) |
| `visual-run/probe-summary.json` | `--visual` probe summary (bootstrap/consistency 카운트 포함) |

사용 예:

```bash
npm run workflow:telemetry -- --include adoption \
  --adoption-run examples/telemetry-adoption-probe/visual-run --json

npm run workflow:telemetry -- --include adoption \
  --adoption-summary examples/telemetry-adoption-probe/visual-run/probe-summary.json --json
```

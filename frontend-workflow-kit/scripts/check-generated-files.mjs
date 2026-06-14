#!/usr/bin/env node
// check-generated-files.mjs — generated-file guard v1 (CLI).
//
// 2.5A(skeleton): CLI 표면 + manifest 읽기 + v1 후보(route-tree·nav-graph) 나열만 한다.
//   강한 검사 없음(헤더/본문/재생성 비교 없음). 기본 실행 exit 0. exit 1(검사 실패) 없음.
//   헤더↔manifest command 문자열 비교 같은 것도 하지 않는다(설계 §2.1, §8.1).
//
// 설계: temp/proposals/generated-file-guard-design.md
// 단계 보고: temp/runs/check-generated-files-2-5a.md
//
// 사용:
//   node scripts/check-generated-files.mjs [--list] [--json]
//       [--docs <dir>] [--src <dir>] [--manifest <file>] [--artifact <id>]
//
// 옵션:
//   --list            v1 생성물 후보를 나열한다(2.5A 에선 기본 동작과 동일).
//   --json            기계가독 JSON 출력.
//   --docs <dir>      문서 루트(기본 docs/frontend-workflow). 2.5A 에선 보고용 표시만.
//   --src  <dir>      소스 루트(기본 src). 2.5A 에선 보고용 표시만.
//   --manifest <file> 산출물 레지스트리(기본 catalog/artifact-manifest.yaml).
//   --artifact <id>   v1 대상 중 하나로 좁힘(route-tree|nav-graph).
//
// exit code:
//   0  정상(warning-first; 2.5A 는 검사를 하지 않으므로 항상 0).
//   2  설정 오류: manifest 부재/형식오류/YAML 손상 — validate 와 같은 계약(설계 §6.1).
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, DEFAULTS, loadYamlOrExit } from './lib/util.mjs';
import { V1_ARTIFACT_IDS, selectArtifactIds, listCandidates } from './lib/check-generated-files.mjs';

// 표시용 경로 정규화 — cwd 상대 + posix(\→/). 절대경로(머신 종속)를 출력에 흘리지 않는다.
function toPosixRel(abs) {
  const rel = path.relative(process.cwd(), abs);
  return (rel || '.').split(path.sep).join('/');
}

function renderText(report, notV1) {
  const w = (s) => process.stdout.write(s);
  w(`check-generated-files — v1 ${report.step} (skeleton, warning-first)\n`);
  w(`  manifest : ${report.manifest}\n`);
  w(`  docs     : ${report.docs}\n`);
  w(`  src      : ${report.src}\n`);
  w(`  v1 대상  : ${report.v1_targets.join(', ')}\n`);
  if (report.artifact_filter) w(`  --artifact: ${report.artifact_filter}\n`);
  if (notV1) {
    w(`  주의: '${report.artifact_filter}' 는 v1 가드 대상이 아님 (v1: ${report.v1_targets.join(', ')})\n`);
  }
  if (!report.candidates.length) {
    w('  생성물 후보 없음.\n');
  } else {
    w(`  생성물 후보 ${report.candidates.length}개:\n`);
    for (const c of report.candidates) {
      w(`    - ${c.id}  [status=${c.status} do_not_edit=${c.do_not_edit}]  ${c.path}\n`);
    }
  }
  w('  (2.5A: 검사 없음 — 헤더/본문/재생성 비교는 2.5B/2.5C. 항상 exit 0.)\n');
}

function main() {
  const { flags } = parseArgs(process.argv.slice(2));

  const docsDir = path.resolve(typeof flags.docs === 'string' ? flags.docs : DEFAULTS.docs);
  const srcDir = path.resolve(typeof flags.src === 'string' ? flags.src : DEFAULTS.src);
  const manifestPath = path.resolve(
    typeof flags.manifest === 'string' ? flags.manifest : DEFAULTS.manifest,
  );

  // manifest 로드 — YAML 손상은 loadYamlOrExit 가 exit 2. 부재(null)/비객체도 exit 2 로
  //  surface 한다(validate.mjs:109-112 사후 가드와 같은 계약 — 가드가 조용히 무력화되지 않게).
  const manifest = loadYamlOrExit(manifestPath, 'manifest', 'check-generated-files');
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    process.stderr.write(
      `check-generated-files: manifest 를 읽을 수 없음(부재/형식 오류): ${toPosixRel(manifestPath)}\n`,
    );
    process.exit(2);
  }

  // --artifact 해소(v1 정책). 비-v1 id 면 빈 결과 + 사유 안내.
  const requested = typeof flags.artifact === 'string' ? flags.artifact : null;
  const notV1 = requested != null && !V1_ARTIFACT_IDS.includes(requested);
  const ids = selectArtifactIds(requested);
  const candidates = listCandidates(manifest, { allowlist: ids });

  const report = {
    tool: 'check-generated-files',
    version: 'v1',
    step: '2.5A',
    mode: 'list', // 2.5A: 기본 실행과 --list 동작 동일(검사 없음)
    ok: true, // 2.5A 는 검사를 하지 않음 — 항상 ok
    manifest: toPosixRel(manifestPath),
    docs: toPosixRel(docsDir),
    src: toPosixRel(srcDir),
    v1_targets: [...V1_ARTIFACT_IDS],
    artifact_filter: requested,
    candidates,
  };

  if (flags.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    renderText(report, notV1);
  }

  process.exit(0); // 2.5A: 항상 0 (검사 없음 — exit 1 검사 도입 금지)
}

// 직접 실행될 때만 main() (import 시 부작용 없음 — 테스트가 lib 를 직접 소비)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

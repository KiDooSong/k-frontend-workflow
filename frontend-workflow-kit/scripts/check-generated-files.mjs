#!/usr/bin/env node
// check-generated-files.mjs — generated-file guard v1 (CLI).
//
// 2.5C(reproduce): selected(route-tree·nav-graph·component-catalog)를 임시 디렉토리에 재생성해 커밋본과 비교한다.
//   기본 동작 = 검사(reproduce-to-scratch). `--list` 는 2.5B discovery(분류 나열)만.
//   warning-first: 검사 결과가 어떻든 **항상 exit 0**. 설정 오류(manifest)만 exit 2.
//   생성기는 명시 계약으로 호출 — manifest/헤더 command 문자열 비교 없음(설계 §2.1, §8.1).
//   생성 파일을 자동수정/덮어쓰지 않는다(임시 디렉토리에서만 재생성).
//
// 설계: temp/proposals/generated-file-guard-design.md  ·  단계 보고: temp/runs/check-generated-files-2-5c.md
//
// 사용:
//   node scripts/check-generated-files.mjs [--json] [--docs <dir>] [--src <dir>]
//       [--manifest <file>] [--artifact <id>]            # 기본: route-tree·nav-graph·component-catalog 재생성 비교
//   node scripts/check-generated-files.mjs --list [...]   # 분류 나열만(검사 없음)
//
// 옵션:
//   --list            생성물 분류를 나열만(검사 없음).
//   --json            기계가독 JSON 출력(안정적).
//   --docs <dir>      문서 루트(기본 docs/frontend-workflow). nav-graph 입력·_meta 커밋본 위치.
//   --src  <dir>      소스 루트(기본 src). route-tree 입력 app 디렉터리는 <src>/app.
//   --manifest <file> 산출물 레지스트리(기본 catalog/artifact-manifest.yaml).
//   --artifact <id>   v1 대상 하나로 좁힘(route-tree|nav-graph|component-catalog).
//
// 후속(미구현, 의도적 보류): --enforce(위반 시 exit 1). v1 은 warning-first 만 — 후속 PR 에서
//   FP율 관찰 후 도입 여부 결정(설계 §6, §9 PR G). 도입하더라도 CI 미배선이 전제.
//
// exit code:
//   0  정상(warning-first — 검사 결과가 mismatch 여도 0).
//   2  설정 오류: manifest 부재/형식오류/YAML 손상 — validate 와 같은 계약(설계 §6.1).
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, DEFAULTS, KIT_ROOT, loadYamlOrExit, runCli } from './lib/util.mjs';
import { loadLayoutProfile } from './lib/layout-profile.mjs';
import {
  V1_ARTIFACT_IDS,
  selectArtifactIds,
  discoverArtifacts,
  reproduceArtifact,
} from './lib/check-generated-files.mjs';

// 검사 결과 status — 요약 키 순서 고정(JSON 안정성).
const STATUS_ORDER = [
  'ok',
  'mismatch',
  'nondeterministic',
  'generator-error',
  'missing-committed',
  'missing-input',
  'skip',
];

// 표시용 경로 정규화 — cwd 상대 + posix(\→/). 절대경로(머신 종속)를 출력에 흘리지 않는다.
function toPosixRel(abs) {
  const rel = path.relative(process.cwd(), abs);
  return (rel || '.').split(path.sep).join('/');
}

function summarize(results) {
  const t = {};
  for (const s of STATUS_ORDER) {
    const n = results.filter((r) => r.status === s).length;
    if (n) t[s] = n;
  }
  return t;
}

function renderHead(report, notV1) {
  const w = (s) => process.stdout.write(s);
  w(`check-generated-files — v1 ${report.step} (${report.mode === 'list' ? 'discovery' : 'reproduce-to-scratch'}, warning-first)\n`);
  w(`  manifest : ${report.manifest}\n`);
  w(`  docs     : ${report.docs}\n`);
  w(`  src      : ${report.src}\n`);
  w(`  v1 대상  : ${report.v1_targets.join(', ')}\n`);
  if (report.artifact_filter) w(`  --artifact: ${report.artifact_filter}\n`);
  if (notV1) {
    w(`  주의: '${report.artifact_filter}' 는 v1 가드 대상이 아님 (v1: ${report.v1_targets.join(', ')})\n`);
  }
}

// --list 렌더(2.5B discovery).
function renderList(report, notV1) {
  const w = (s) => process.stdout.write(s);
  renderHead(report, notV1);
  if (!report.artifacts.length) {
    w('  생성물 없음.\n');
  } else {
    w(`  생성물 ${report.artifacts.length}개 (selected ${report.selected.length}):\n`);
    for (const a of report.artifacts) {
      if (a.selected) w(`    [selected] ${a.id}  ->  ${a.path}\n`);
      else w(`    [skip]     ${a.id}  --  ${a.skip_reasons[0] || '사유 미상'}\n`);
    }
  }
  w('  (--list: 분류 나열만 — 재생성 비교는 기본 동작.)\n');
}

// 기본(check) 렌더(2.5C reproduce).
function renderCheck(report, notV1) {
  const w = (s) => process.stdout.write(s);
  renderHead(report, notV1);
  if (report.enforce_requested) {
    w('  주의: --enforce 는 v1 미구현 — 항상 warning-first(exit 0). 후속 과제(설계 §9 PR G).\n');
  }
  if (!report.results.length) {
    w('  검사할 selected 산출물 없음.\n');
  } else {
    w(`  검사 결과 (selected ${report.results.length}):\n`);
    for (const r of report.results) {
      w(`    [${r.status}] ${r.id}\n`);
      for (const c of r.checks) w(`        ${c.ok ? 'ok  ' : 'FAIL'} [${c.check}] ${c.message}\n`);
    }
  }
  w(`  요약: ${Object.entries(report.summary).map(([k, v]) => `${k} ${v}`).join(' / ') || '(없음)'}\n`);
  w('  (2.5C: warning-first — 항상 exit 0. 생성 파일 자동수정/덮어쓰기 없음. --enforce/CI 미배선.)\n');
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

  // 전체 생성물을 intrinsic v1 기준으로 분류. 그 뒤 --artifact 로 표시/작업 집합을 좁힌다.
  const requested = typeof flags.artifact === 'string' ? flags.artifact : null;
  const notV1 = requested != null && !V1_ARTIFACT_IDS.includes(requested);
  const actionIds = selectArtifactIds(requested);
  const discovered = discoverArtifacts(manifest);
  const shown = requested == null ? discovered : discovered.filter((d) => actionIds.includes(d.id));

  const base = {
    tool: 'check-generated-files',
    version: 'v1',
    step: '2.5C',
    manifest: toPosixRel(manifestPath),
    docs: toPosixRel(docsDir),
    src: toPosixRel(srcDir),
    v1_targets: [...V1_ARTIFACT_IDS],
    artifact_filter: requested,
  };

  // --list: 분류 나열만(검사 없음).
  if (flags.list) {
    const report = {
      ...base,
      mode: 'list',
      ok: true,
      selected: shown.filter((d) => d.selected).map((d) => d.id),
      artifacts: shown,
    };
    if (flags.json) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    else renderList(report, notV1);
    process.exit(0);
  }

  // 기본(check): selected 산출물을 reproduce-to-scratch 비교.
  // 레이아웃 프로파일(tier1): route-tree 입력 디렉토리를 {roles.route_entry} 에서 파생한다.
  const layout = loadLayoutProfile({ kitRoot: KIT_ROOT, flags });
  const results = shown.filter((d) => d.selected).map((d) => reproduceArtifact(d.id, { docsDir, srcDir, layout }));
  const summary = summarize(results);
  const bad = results.filter((r) => r.status !== 'ok' && r.status !== 'skip');
  const report = {
    ...base,
    mode: 'check',
    ok: bad.length === 0, // 검사 통과 여부(향후 --enforce 가 게이트로 쓸 신호) — exit 는 별개로 항상 0
    enforce_requested: flags.enforce === true,
    summary,
    results,
  };
  if (flags.json) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  else renderCheck(report, notV1);

  process.exit(0); // 2.5C: warning-first — 검사 결과와 무관하게 항상 0(설정 오류만 위에서 exit 2)
}

// 직접 실행될 때만 main() (import 시 부작용 없음 — 테스트가 lib 를 직접 소비)
// runCli: 레이아웃 설정 오류(미정의 role·부재 --layout)를 exit 2 로 surface(설정 오류 계약과 일치).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCli(main, 'check-generated-files');

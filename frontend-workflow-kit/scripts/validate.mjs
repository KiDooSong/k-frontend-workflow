#!/usr/bin/env node
// validate.mjs — 검사 8종 (impl §8). exit code 0/1 로 CI 게이트가 된다.
//   1. frontmatter ↔ frontmatter.schema.json
//   2. artifact-manifest 기준 필수 frontmatter 누락
//   3. 끊어진 참조 (depends_on 대상 부재, sources 로컬 파일 부재)
//   4. 이동 대상 부재 (Interaction Matrix Result route 가 inventory 에 없음)
//   5. screen_id 중복, route 중복
//   6. do_not_edit 산출물의 GENERATED 헤더/마커 훼손
//   7. confirmed 문서의 승인 메타데이터(approved_by/approved_at) 누락
//   8. API Candidates 가 confirmed 인데 zod 스키마/OpenAPI 부재
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  parseArgs,
  DEFAULTS,
  loadYaml,
  walkFiles,
  findFiles,
  readFileSafe,
  splitFrontmatter,
  exists,
  dirHasFiles,
} from './lib/util.mjs';
import { validateSchema } from './lib/schema.mjs';
import {
  loadScreenSpec,
  parseApiCandidates,
  interactionResultRoutes,
  isStub,
} from './lib/spec.mjs';

function isLocalRef(ref) {
  if (typeof ref !== 'string') return false;
  if (/^https?:\/\//i.test(ref)) return false;
  return (
    ref.startsWith('docs/') ||
    ref.startsWith('src/') ||
    ref.startsWith('./') ||
    ref.startsWith('../')
  );
}

// 경로를 항상 forward-slash 로 정규화 (Windows 대응)
function toPosix(p) {
  return p.split(path.sep).join('/');
}

// manifest 의 path 패턴(docs/frontend-workflow/... + {domain}/{screen})을 정규식으로.
// docs/frontend-workflow/ 접두는 제거 — docsDir 기준 상대경로와 비교한다.
function manifestPathRegex(pattern) {
  const stripped = pattern.replace(/^docs\/frontend-workflow\//, '');
  const esc = stripped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const withVars = esc
    .replace(/\\\{domain\\\}/g, '[^/]+')
    .replace(/\\\{screen\\\}/g, '[^/]+');
  return new RegExp('^' + withVars + '$');
}

// depends_on 대상이 실제로 존재하는지. manifest 키면 concrete 경로(placeholder 없음)일 때 파일 존재 요구.
function dependencyResolves(dep, { knownArtifactIds, manifest, docsDir }) {
  if (knownArtifactIds.has(dep)) return true; // 로드된 문서의 artifact_id → 파일 존재함
  const entry = (manifest.artifacts || {})[dep];
  if (!entry) return false; // 알 수 없는 대상
  const p = entry.path || '';
  const hasPlaceholder = /[{*]/.test(p);
  if (hasPlaceholder) return true; // 어느 인스턴스인지 특정 불가 — 관대하게 통과
  const rel = p.replace(/^docs\/frontend-workflow\//, '');
  return exists(path.join(docsDir, rel));
}

function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  const docsDir = path.resolve(flags.docs || DEFAULTS.docs);
  const srcDir = path.resolve(flags.src || DEFAULTS.src);
  const projectRoot = flags.root ? path.resolve(flags.root) : path.dirname(srcDir);
  const manifest = loadYaml(path.resolve(flags.manifest || DEFAULTS.manifest)) || {};
  const schema = JSON.parse(readFileSafe(path.resolve(flags.schema || DEFAULTS.schema)) || '{}');

  const errors = [];
  const add = (check, file, message) =>
    errors.push({ check, file: path.relative(projectRoot, file), message });

  // --- authoring 문서 수집 (docs/ 하위, _meta 제외) ---
  const mdFiles = walkFiles(docsDir, ['.md']).filter(
    (f) => !f.split(path.sep).includes('_meta'),
  );
  const docs = [];
  for (const f of mdFiles) {
    const { data, hasFrontmatter, parseError } = splitFrontmatter(readFileSafe(f));
    if (parseError) add(1, f, `frontmatter YAML 파싱 실패: ${parseError}`);
    if (!hasFrontmatter || !data.artifact_type) continue; // 규칙 문서가 아님
    docs.push({ file: f, fm: data });
  }

  const knownArtifactIds = new Set(docs.map((d) => d.fm.artifact_id).filter(Boolean));

  // --- 검사 1, 2, 3(depends_on/sources), 7 ---
  for (const { file, fm } of docs) {
    // 1. 스키마
    for (const e of validateSchema(fm, schema)) add(1, file, e);

    // 2. manifest 필수 frontmatter + 잘못된 경로 (impl §4: 누락 frontmatter / 잘못된 경로)
    const mEntry = (manifest.artifacts || {})[fm.artifact_type];
    if (mEntry?.required_frontmatter) {
      for (const key of mEntry.required_frontmatter) {
        if (fm[key] === undefined || fm[key] === null || fm[key] === '') {
          add(2, file, `필수 frontmatter 누락: ${key} (artifact_type=${fm.artifact_type})`);
        }
      }
    }
    if (mEntry?.path) {
      const rel = toPosix(path.relative(docsDir, file));
      if (!manifestPathRegex(mEntry.path).test(rel)) {
        add(2, file, `잘못된 경로: ${fm.artifact_type} 는 ${mEntry.path} 패턴이어야 함 (실제 docs 상대경로: ${rel})`);
      }
    }

    // 3a. depends_on 대상 존재 (manifest 키면 concrete 경로의 파일 존재까지 확인)
    if (Array.isArray(fm.depends_on)) {
      for (const dep of fm.depends_on) {
        if (!dependencyResolves(dep, { knownArtifactIds, manifest, docsDir })) {
          // 다음 행동 힌트: manifest 에 등록된 산출물이면 어디서 만들지 알려준다.
          const entry = (manifest.artifacts || {})[dep];
          const hint = entry?.template
            ? ` → 해소: ${entry.template} 를 복사해 ${entry.path} 에 생성하세요`
            : ` → 해소: depends_on 에서 '${dep}' 를 제거하거나 해당 문서를 생성하세요`;
          add(3, file, `depends_on 대상 부재: ${dep}${hint}`);
        }
      }
    }
    // 3b. sources 로컬 파일 존재
    if (Array.isArray(fm.sources)) {
      for (const s of fm.sources) {
        const ref = s?.ref;
        if (isLocalRef(ref) && !exists(path.resolve(projectRoot, ref))) {
          add(3, file, `sources 링크 파일 부재: ${ref} → 해소: 파일을 생성하거나 ref 를 올바른 경로로 고치세요 (외부 링크면 http(s):// 로)`);
        }
      }
    }

    // 7. confirmed 승인 메타데이터 (IMPLEMENTING §4 #6: approved_by/at/decision_id)
    if (fm.status === 'confirmed') {
      if (!fm.approved_by) add(7, file, 'status=confirmed 인데 approved_by 누락');
      if (!fm.approved_at) add(7, file, 'status=confirmed 인데 approved_at 누락');
      if (!fm.decision_id) add(7, file, 'status=confirmed 인데 decision_id 누락');
    }
  }

  // --- screen-spec 전용 검사 (4, 5, 8) ---
  const specPaths = findFiles(path.join(docsDir, 'domains'), 'screen-spec.md');
  const routeSet = new Set();
  const idCount = new Map();
  const routeCount = new Map();
  const specs = [];
  for (const p of specPaths) {
    const spec = loadScreenSpec(p);
    specs.push(spec);
    const id = spec.frontmatter.screen_id;
    const route = spec.frontmatter.route;
    if (route) routeSet.add(route);
    if (id) idCount.set(id, (idCount.get(id) || 0) + 1);
    if (route) routeCount.set(route, (routeCount.get(route) || 0) + 1);
  }

  // 5. 중복
  for (const [id, n] of idCount) if (n > 1) add(5, path.join(docsDir, 'domains'), `screen_id 중복: ${id} (${n}건)`);
  for (const [r, n] of routeCount)
    if (n > 1) add(5, path.join(docsDir, 'domains'), `route 중복: ${r} (${n}건)`);

  // 4. Interaction Matrix Result route 가 inventory(route 집합)에 있는지
  for (const spec of specs) {
    const targets = interactionResultRoutes(spec);
    for (const t of targets) {
      if (!routeSet.has(t)) {
        add(4, spec.path, `Interaction Matrix 이동 대상 route 가 화면에 없음: ${t}`);
      }
    }
  }

  // 6b. generated_sections 마커 무결성 (authored screen-spec 의 Entry Points GENERATED:START/END)
  //     stub(frontmatter만)에는 본문이 없으므로 검사 대상이 아니다.
  const screenSpecGenSections =
    (manifest.artifacts || {})['screen-spec']?.generated_sections || [];
  for (const spec of specs) {
    if (isStub(spec)) continue;
    for (const sec of screenSpecGenSections) {
      const gen = sec.generator;
      // START/END 모두 generator 이름까지 일치해야 하고, START 가 END 보다 앞서야 한다.
      const startM = new RegExp(`GENERATED:START\\s+${gen}\\b`).exec(spec.body);
      const endM = new RegExp(`GENERATED:END\\s+${gen}\\b`).exec(spec.body);
      if (!startM || !endM || startM.index >= endM.index) {
        add(
          6,
          spec.path,
          `generated section 마커 부재/훼손/순서오류: ${sec.name} (GENERATED:START ${gen} … GENERATED:END ${gen})`,
        );
      }
    }
  }

  // 8. API Candidates confirmed → zod 스키마(src/api/schemas/*.ts) 또는 openapi.yaml 필요
  //    MVP-A 범위: 스키마 소스의 "존재" 만 확인한다. 후보↔스키마 1:1 매칭(엔드포인트→스키마명)은
  //    api-manifest/OpenAPI 통합이 들어오는 MVP-B 에서 강화한다.
  const hasZod = dirHasFiles(path.join(srcDir, 'api', 'schemas'), ['.ts']);
  const hasOpenApi =
    exists(path.join(projectRoot, 'openapi.yaml')) ||
    exists(path.join(projectRoot, 'openapi.yml'));
  for (const spec of specs) {
    const items = parseApiCandidates(spec.sections['api candidates']);
    const confirmed = items.filter((it) => it.confidence === 'confirmed');
    if (confirmed.length && !hasZod && !hasOpenApi) {
      add(
        8,
        spec.path,
        `confirmed API ${confirmed.length}건인데 zod 스키마(src/api/schemas/*.ts)/OpenAPI 부재`,
      );
    }
  }

  // --- 6. do_not_edit 생성물 헤더/마커 무결성 ---
  for (const [name, entry] of Object.entries(manifest.artifacts || {})) {
    if (entry.kind !== 'generated' || entry.do_not_edit !== true) continue;
    // manifest path 는 docs/frontend-workflow/... 기준. docsDir 로 매핑.
    const rel = entry.path.replace(/^docs\/frontend-workflow\//, '');
    const full = path.join(docsDir, rel);
    if (!exists(full)) continue; // 아직 생성 전이면 건너뜀
    const head = (readFileSafe(full) || '').slice(0, 400);
    if (!/GENERATED FILE\s+—\s+DO NOT EDIT/.test(head)) {
      add(6, full, `생성물(${name})의 GENERATED 헤더 훼손/부재`);
    }
  }

  // --- 결과 출력 ---
  if (flags.json) {
    process.stdout.write(
      JSON.stringify({ ok: errors.length === 0, count: errors.length, errors }, null, 2) + '\n',
    );
  } else if (errors.length === 0) {
    process.stdout.write('workflow:validate — OK (검사 8종 통과)\n');
  } else {
    process.stdout.write(`workflow:validate — ${errors.length} 건 위반\n`);
    for (const e of errors) {
      process.stdout.write(`  [검사 ${e.check}] ${e.file}: ${e.message}\n`);
    }
  }
  process.exit(errors.length === 0 ? 0 : 1);
}

// 직접 실행될 때만 main()
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

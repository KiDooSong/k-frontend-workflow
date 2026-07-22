// Shared helpers for the workflow scripts.
// 의존성 최소 원칙: Node 내장 + `yaml` 한 개만 사용한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';

// 킷 루트(scripts/..)를 스크립트 위치 기준으로 해석한다.
// 소비 프로젝트에서는 tools/frontend-workflow/ 에 킷 전체가 복사되고,
// 문서는 docs/frontend-workflow/ 에 생기므로 설정 파일은 킷 루트 기준으로 찾는다.
export const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const DEFAULTS = {
  docs: 'docs/frontend-workflow',
  src: 'src',
  manifest: path.join(KIT_ROOT, 'catalog', 'artifact-manifest.yaml'),
  policy: path.join(KIT_ROOT, 'policies', 'implementation-mode-policy.yaml'),
  schema: path.join(KIT_ROOT, 'schemas', 'frontmatter.schema.json'),
};

// --- 인자 파싱 -------------------------------------------------------------
// 지원 형식: --flag value, --flag=value, --bool
export function parseArgs(argv) {
  // null-prototype: 일반 객체면 `--__proto__=x` 가 상속 setter 에 흡수돼 own property 가 안 생기고
  // Object.keys 에서 사라진다 — allowlist 검증(cli-args.mjs)이 unknown option 을 못 보는 구멍.
  // 파싱 결과를 있는 그대로 보존만 하며(거부는 여전히 CLI 별 allowlist 몫) 소비부는 전부
  // property 접근·Object.keys·`in` 만 쓰므로 동작 동일.
  const flags = Object.create(null);
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          flags[a.slice(2)] = next;
          i++;
        } else {
          flags[a.slice(2)] = true;
        }
      }
    } else {
      positionals.push(a);
    }
  }
  return { flags, positionals };
}

// --- 파일시스템 ------------------------------------------------------------
export function readFileSafe(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

export function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

// 정확한 destination 하나만 제거한다. 선행 존재검사를 두지 않아 TOCTOU 창을 만들지 않고,
// unlink 이므로 symlink target이나 디렉터리 트리를 따라가지 않는다.
export function removeFileIfExists(file) {
  try {
    fs.unlinkSync(file);
    return true;
  } catch (err) {
    if (err && err.code === 'ENOENT') return false;
    throw err;
  }
}

export function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// dir 가 비어있지 않은(파일 1개 이상) 디렉토리인지
export function dirHasFiles(dir, exts) {
  if (!isDir(dir)) return false;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  return entries.some((e) => {
    if (!e.isFile()) return false;
    if (!exts) return true;
    return exts.some((ext) => e.name.endsWith(ext));
  });
}

// 디렉토리 트리에서 basename 이 일치하는 파일을 모두 찾는다 (정렬된 결과).
export function findFiles(root, basename) {
  const out = [];
  if (!isDir(root)) return out;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        stack.push(full);
      } else if (e.isFile() && e.name === basename) {
        out.push(full);
      }
    }
  }
  return out.sort();
}

// 디렉토리 트리의 모든 파일 (확장자 필터 가능, 정렬됨).
export function walkFiles(root, exts) {
  const out = [];
  if (!isDir(root)) return out;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        stack.push(full);
      } else if (e.isFile()) {
        if (!exts || exts.some((ext) => e.name.endsWith(ext))) out.push(full);
      }
    }
  }
  return out.sort();
}

export function writeFile(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
}

// --- frontmatter -----------------------------------------------------------
// `---\n...\n---\n본문` 형식을 분리한다. gray-matter 대신 직접 분리해 의존성을 줄인다.
export function splitFrontmatter(content) {
  if (content == null) return { data: {}, body: '', hasFrontmatter: false };
  // BOM 제거
  const text = content.replace(/^﻿/, '');
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { data: {}, body: text, hasFrontmatter: false };
  let data = {};
  try {
    data = yamlParse(m[1]) || {};
  } catch (err) {
    return { data: {}, body: m[2], hasFrontmatter: true, parseError: String(err.message || err) };
  }
  return { data, body: m[2], hasFrontmatter: true };
}

export function loadYaml(p) {
  const raw = readFileSafe(p);
  if (raw == null) return null;
  return yamlParse(raw);
}

// 손상된(파싱 실패) YAML 설정 파일을 exit 2(입력 오류)로 우아하게 처리한다.
// 부재(파일 없음)는 loadYaml 이 null 을 돌려주므로 호출부가 별도 처리 — 여기선 "손상"만 잡는다.
// forbidden-paths.mjs 가 먼저 쓰던 패턴을 공유화: readiness/validate 도 같은 exit 2 계약을 따른다
// (이전엔 손상 설정에서 stack trace + exit 1 로 새, 도구마다 exit code 가 갈리던 비대칭을 해소).
export function loadYamlOrExit(p, label, tool = 'workflow') {
  try {
    return loadYaml(p);
  } catch (err) {
    process.stderr.write(`${tool}: ${label} YAML 파싱 실패 — ${p}\n  ${err.message}\n`);
    process.exit(2);
  }
}

// 프로젝트 루트(=role 글롭의 앵커) 단일 출처(MINOR 2). role 글롭은 프로젝트-루트 상대(src/...)이므로
// 존재검사·입력 디렉토리 해소는 모두 이 값에 resolve 한다. 세 소비처(spec.mjs fake_hook,
// validate 검사 8, check-generated-files route-tree 입력)가 같은 식을 쓰게 한다.
//   flags.root 가 있으면(monorepo: repo-root 상대 프로젝트 접두) 그것을, 없으면 표준 <root>/src 가정으로
//   dirname(srcDir) 를 쓴다. (workflow-state·check-generated-files 는 --root 를 노출하지 않으므로 사실상
//    항상 dirname(srcDir) 이지만, 식을 공유해 표류를 막고 --root 도입 시 자동 정합.)
export function projectRootOf(srcDir, flags = {}) {
  return flags && typeof flags.root === 'string' && flags.root
    ? path.resolve(flags.root)
    : path.dirname(srcDir);
}

// CLI 엔트리 래퍼: main() 을 실행하되 레이아웃 설정 오류(LayoutConfigError — layout-profile.mjs)는
// 도구/설정 오류로 보고 exit 2 로 surface 한다(정의되지 않은 {roles.X}·부재한 --layout 경로 등).
//   loadYamlOrExit·forbidden-paths 등과 같은 exit 2 계약: 잘못된 설정이 stack trace+exit 1 로 새지 않게.
//   순환 import 회피를 위해 instanceof 가 아니라 err.name 으로 덕타이핑한다(util ← layout-profile ← util).
//   그 외 예외는 그대로 던져 기존 동작(미처리 → exit 1)을 보존한다.
export function runCli(main, tool = 'workflow') {
  try {
    main();
  } catch (err) {
    if (err && err.name === 'LayoutConfigError') {
      process.stderr.write(`${tool}: ${err.message}\n`);
      process.exit(2);
    }
    throw err;
  }
}

// CLI 엔트리 판정: `node <script>` 로 직접 실행됐을 때만 true (import 시 false).
// 단순 `import.meta.url === pathToFileURL(argv[1]).href` 비교는 macOS 에서 깨진다:
// argv[1] 이 symlink 경유 경로(예: os.tmpdir() 의 /var/folders → /private/var/folders)면
// Node 는 import.meta.url 을 realpath 로 해석하되 argv[1] 은 호출자가 준 그대로 두므로
// 비교가 false 가 되고, main() 이 실행되지 않은 채 exit 0 + 빈 stdout 으로 샌다.
// 그래서 원문 비교(--preserve-symlinks-main 환경의 정답)를 먼저, realpath 비교를 보강으로 한다.
export function isCliEntry(importMetaUrl, argv1 = process.argv[1]) {
  if (!argv1) return false;
  if (importMetaUrl === pathToFileURL(argv1).href) return true;
  try {
    return importMetaUrl === pathToFileURL(fs.realpathSync(argv1)).href;
  } catch {
    return false; // argv1 이 삭제·접근 불가면 직접 실행으로 볼 근거가 없다
  }
}

// --- 순서값(ordinal) 비교 --------------------------------------------------
export const STATUS_ORDER = [
  'missing',
  'draft',
  'review',
  'confirmed',
  'implemented',
  'verified',
];
export const CONFIDENCE_ORDER = ['unknown', 'candidate', 'confirmed'];

export function statusRank(s) {
  const i = STATUS_ORDER.indexOf(String(s || 'missing').toLowerCase());
  return i === -1 ? 0 : i;
}

export function confidenceRank(c) {
  const i = CONFIDENCE_ORDER.indexOf(String(c || 'unknown').toLowerCase());
  return i === -1 ? 0 : i;
}

// --- YAML 출력 (결정적) ----------------------------------------------------
// 생성물 헤더 + 본문. 키 순서는 호출부가 제어하므로 sortMapEntries 는 쓰지 않는다.
export function emitGeneratedYaml(headerLines, obj) {
  const header = headerLines.map((l) => (l ? `# ${l}` : '#')).join('\n');
  const body = yamlStringify(obj, { lineWidth: 0 });
  return `${header}\n${body}`;
}

export { yamlParse, yamlStringify };

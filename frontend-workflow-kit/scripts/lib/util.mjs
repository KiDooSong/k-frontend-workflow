// Shared helpers for the workflow scripts.
// 의존성 최소 원칙: Node 내장 + `yaml` 한 개만 사용한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
  const flags = {};
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

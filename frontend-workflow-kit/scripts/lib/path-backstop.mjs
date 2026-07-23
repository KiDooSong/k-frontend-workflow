// path-backstop.mjs — diff 기반 forbidden_paths backstop 의 순수 helper 모음.
// 설계: temp/proposals/diff-based-forbidden-paths-backstop.md
//
// 불변식:
//   - 모드 판정은 readiness.mjs(computeReadiness)가 단일 출처. 여기엔 readiness 로직을 두지 않는다.
//   - diff 기반만 다룬다 — 트리 전체 스캔 금지(공유 src/api 오탐 회피).
//   - import 시 부작용 없음(top-level side effect 0). CLI(forbidden-paths.mjs)와 테스트가 재사용한다.
//
// 책임: glob→regex, 정책에서 guarded surface/threshold 파생, 프로젝트 단위 clearance,
//       diff(name-status) 파싱(텍스트 + -z), record→write_paths, base ref 해석 + git diff 실행(fail-closed).
import { execFileSync } from 'node:child_process';
import path from 'node:path';

// 에러 타입 — 파일 상단에 선언해 모든 helper 가 참조할 수 있게 한다(class 는 함수와 달리 hoist 되지
// 않으므로 사용처보다 앞에 둔다).
//   GitError       : git 실행/ref 미해석 실패. fail-open 금지 — 호출부가 잡아 exit 2.
//   DiffParseError : --diff 파일 / name-status 스트림 손상(필드 수 불일치, status/경로 누락 등). 조용히
//                    건너뛰지 않고 surface → 호출부가 exit 2(손상된 입력이 guarded 쓰기를 가리지 못하게).
class GitError extends Error {}
class DiffParseError extends Error {}
export { GitError, DiffParseError };

// 경로를 항상 forward-slash 로 정규화 (Windows 대응). validate.mjs L51 의 toPosix 미러
// (그 함수는 export 되지 않으므로 여기서 동일 구현을 둔다).
export function toPosix(p) {
  return String(p).split(path.sep).join('/').replace(/\\/g, '/');
}

// glob → RegExp. validate.mjs 의 manifestPathRegex 는 재사용 불가다:
// 그 함수는 정규식 메타문자를 *전부* escape 해 `*` 를 리터럴로 만든다.
// 여기서는 정책 글롭의 `**`/`*` 를 실제 와일드카드로 해석한다.
//   **  → 경로구분(/) 포함 임의 (.*)
//   *   → / 제외 임의 ([^/]*)
//   그 외 메타문자는 escape, ^...$ 앵커.
export function globToRegex(glob) {
  const g = toPosix(glob);
  let out = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        out += '.*'; // ** : 경로구분 포함
        i++; // 두 번째 * 소비
      } else {
        out += '[^/]*'; // * : 세그먼트 내
      }
    } else if ('.+?^${}()|[]\\'.includes(c)) {
      out += '\\' + c; // 정규식 메타문자 escape
    } else {
      out += c;
    }
  }
  return new RegExp('^' + out + '$');
}

// glob 매칭 헬퍼: F(파일 경로)가 glob 에 매칭되는가. 둘 다 posix 정규화 후 비교.
export function globMatches(glob, file) {
  return globToRegex(glob).test(toPosix(file));
}

// Effective file authorization shared by readiness consumers and the diff backstop.
// A matching forbidden glob always wins over any matching allowed glob.
export function pathAuthorization(file, allowedPaths = [], forbiddenPaths = []) {
  const allowedBy = (allowedPaths || []).filter((glob) => globMatches(glob, file));
  const forbiddenBy = (forbiddenPaths || []).filter((glob) => globMatches(glob, file));
  return {
    allowed: allowedBy.length > 0 && forbiddenBy.length === 0,
    allowed_by: allowedBy,
    forbidden_by: forbiddenBy,
  };
}

// --- guarded surface 파생 (정책에서) -------------------------------------
// classify(forbidden glob):
//   domain-scoped   : "{domain}" 포함 → 파일→화면 attribution 필요. MVP 제외.
//   blanket         : "src/**" (= src 루트 전체) → 공유 코드 오탐. MVP 제외.
//   global+specific : 그 외.
export function classifyForbidden(glob) {
  const g = toPosix(glob);
  if (g.includes('{domain}') || g.includes('{screen}')) return 'domain-scoped';
  if (g === 'src/**') return 'blanket';
  return 'global+specific';
}

// "G 가 S 전체를 덮는가" — 둘 다 posix 정규화.
//   true if G === S, OR (G 가 "/**" 로 끝나고 S 가 G 의 "**" 제거 접두로 시작).
// 예) G=src/api/** 는 S=src/api/** 을 덮고, S=src/api/x.ts 도 덮는다.
//     하지만 G=src/api/schemas/** 는 S=src/api/** 을 덮지 못한다(좁은 sub-glob).
export function covers(glob, surface) {
  const g = toPosix(glob);
  const s = toPosix(surface);
  if (g === s) return true;
  if (g.endsWith('/**')) {
    const prefix = g.slice(0, -2); // "src/api/**" → "src/api/"
    return s.startsWith(prefix);
  }
  return false;
}

// 정책의 모든 모드 allowed_paths 를 훑어, S 전체를 덮는 글롭을 올리는 가장 낮은 모드(order index 기준)를
// threshold 로 본다. 단 blanket src/** 은 threshold '정의'에서 제외(낮은 모드가 우연히 blanket allow 를
// 가져도 게이트를 열지 않도록 — 설계 §4). 없으면 null.
export function thresholdOf(policy, surface) {
  const order = policy.order || Object.keys(policy.modes || {});
  const modes = policy.modes || {};
  for (let i = 0; i < order.length; i++) {
    const mode = modes[order[i]];
    if (!mode) continue;
    const allowed = mode.allowed_paths || [];
    for (const g of allowed) {
      if (toPosix(g) === 'src/**') continue; // blanket 제외
      if (covers(g, surface)) return order[i]; // 가장 낮은(=먼저 만나는) 모드
    }
  }
  return null;
}

// guarded surface 파생:
//   1) 모든 모드의 forbidden_paths 를 모아 global+specific 만 추린다(domain-scoped·blanket 제외).
//   2) 그 중 threshold(S)가 정의된 것만 GUARDED (= 어떤 비-blanket 모드가 S 전체를 allow → 레이어 경계).
//   3) 추가로 openapi.yaml + openapi.yml 을 합친다(validate.mjs L218-220 가 yaml/yml 둘 다 OpenAPI 로 취급 →
//      .yml parity). 이 둘은 threshold 가 없어 cleared 가 항상 false → 변경 시 항상 플래그.
// 결과는 글롭 문자열의 정렬·중복제거된 배열.
export function deriveGuardedSurface(policy) {
  const modes = policy.modes || {};
  const set = new Set();
  for (const name of Object.keys(modes)) {
    const forbidden = modes[name].forbidden_paths || [];
    for (const f of forbidden) {
      const g = toPosix(f);
      if (classifyForbidden(g) !== 'global+specific') continue;
      if (thresholdOf(policy, g) == null) continue; // threshold 없으면 레이어 경계가 아님 → 비채택
      set.add(g);
    }
  }
  // openapi parity (정책엔 yaml 만 있을 수 있다)
  set.add('openapi.yaml');
  set.add('openapi.yml');
  return [...set].sort();
}

// 프로젝트 단위 clearance (설계 §1 의 의도된 trade-off — 화면별 아님).
//   cleared(S) = ∃ screen. index(screen.readiness_mode) >= index(threshold(S))
//   사다리는 누적이므로 상위 모드(production-ready)도 api-integrated-ui 자격을 포함한다.
//   threshold(S) 가 null 이면 항상 false(예: openapi.yaml/yml).
// readinessOutput: computeReadiness 의 반환값({ [screenId]: { readiness_mode, ... } }).
export function isCleared(surface, readinessOutput, policy, options = {}) {
  const order = policy.order || Object.keys(policy.modes || {});
  const threshold = thresholdOf(policy, surface);
  return isClearedAt(threshold, readinessOutput, order, options);
}

// threshold(모드 이름)를 직접 받아 clearance 를 판정한다(M3): 호출부가 표면의 *구체* threshold 를
// 이미 알고 있을 때(materializeGuardedSurface 가 도메인별 구체 정책으로 계산한 값) thresholdOf 를
// 토큰화된 정책으로 재계산하지 않고 그 값을 그대로 쓰게 한다. isCleared 가 이 함수에 위임한다 —
// "어떤 화면의 readiness_mode 가 threshold 에 도달/초과하는가" 로직은 변경 없음.
//   threshold==null → false(예: openapi.yaml/yml, 또는 미채택 표면).
export function isClearedAt(threshold, readinessOutput, order, options = {}) {
  if (threshold == null) return false;
  const ord = order || [];
  const tIdx = ord.indexOf(threshold);
  if (tIdx < 0) return false;
  const requireApiRequired = options.requireApiRequired === true;
  for (const screenId of Object.keys(readinessOutput || {})) {
    const screen = readinessOutput[screenId] || {};
    if (requireApiRequired && screen.api_required === false) continue;
    const mode = screen.readiness_mode;
    const sIdx = ord.indexOf(mode);
    if (sIdx >= tIdx) return true;
  }
  return false;
}

// 프로젝트에서 가장 높은 화면 readiness_mode(이름). reason 출력용. 화면이 없으면 null.
export function highestScreenMode(readinessOutput, policy, options = {}) {
  const order = policy.order || Object.keys(policy.modes || {});
  const requireApiRequired = options.requireApiRequired === true;
  let bestIdx = -1;
  let best = null;
  for (const screenId of Object.keys(readinessOutput || {})) {
    const screen = readinessOutput[screenId] || {};
    if (requireApiRequired && screen.api_required === false) continue;
    const mode = screen.readiness_mode;
    const idx = order.indexOf(mode);
    if (idx > bestIdx) {
      bestIdx = idx;
      best = mode;
    }
  }
  return best;
}

// --- diff 파싱 (상태 인식 레코드) ----------------------------------------
// 경로만 flatten 하지 않는다 — rename 의 모순(옛/새 경로)을 피하려고 status 를 유지한다.
//
// record 모양: { status: 'A'|'M'|'D'|'R'|'C', path, oldPath?, newPath?, raw }
//   - A/M/D: { status, path }
//   - R/C  : { status, oldPath, newPath }
//   raw 는 원본 status 토큰(점수 포함, 예 "R100") — 출력 change 표기에 쓴다.

// 텍스트 형식(--diff <file>, `git diff --name-status -M` 텍스트):
//   한 줄당 한 레코드, 필드는 단일 TAB 구분.
//   A/M/D:  <STATUS><TAB><path>
//   R/C  :  <STATUS><TAB><oldPath><TAB><newPath>   (STATUS 에 점수 가능, 예 R100)
export function parseNameStatusText(str) {
  const records = [];
  if (str == null) return records;
  const lines = String(str).split(/\r?\n/);
  for (const line of lines) {
    if (line.trim() === '') continue;
    const fields = line.split('\t');
    const token = fields[0] || '';
    // status 토큰 '전체'를 검증한다 — 첫 글자만 보면 'D123' 같은 손상 토큰이 D 로 오분류돼 무음 drop 된다.
    //   R/C   : 'R'/'C' + (선택)유사도 점수숫자  → 2-경로(rename/copy)
    //   단일자 : 정확히 대문자 1글자(A/M/D/T/U/X/B …)  → 1-경로
    //   그 외  : 손상 → surface(fail-closed)
    if (/^[RC]\d*$/.test(token)) {
      if (fields.length !== 3 || !fields[1] || !fields[2]) {
        throw new DiffParseError(
          `name-status 손상: rename/copy 행은 'status<TAB>old<TAB>new'(정확히 3필드)여야 함: "${line}"`,
        );
      }
      records.push({ status: token[0], oldPath: fields[1], newPath: fields[2], raw: token });
    } else if (/^[A-Z]$/.test(token)) {
      if (fields.length !== 2 || !fields[1]) {
        throw new DiffParseError(
          `name-status 손상: '${token}' 행은 'status<TAB>path'(정확히 2필드)여야 함: "${line}"`,
        );
      }
      records.push({ status: token, path: fields[1], raw: token });
    } else {
      throw new DiffParseError(`name-status 손상: 알 수 없는 status 토큰 '${token}': "${line}"`);
    }
  }
  return records;
}

// -z(NUL 구분) 형식(라이브 git: `git diff --name-status -M -z`):
//   토큰을 NUL 로 walk. status 가 R/C 로 시작하면 path 토큰 2개를 더 소비, 아니면 1개.
//   공백/유니코드 경로에 안전. buf 는 Buffer 또는 string.
export function parseNameStatusZ(buf) {
  const records = [];
  if (buf == null) return records;
  const s = Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf);
  // NUL(0x00) 로 분할(마지막 빈 토큰 제거). 구분자는 공백이 아니라 NUL 바이트다 —
  // 공백 포함 경로(예: "my file.ts")가 한 토큰으로 유지되도록. (-z 출력의 토큰 구분)
  const NUL = String.fromCharCode(0); // 에디터에서 보이지 않는 리터럴 제어문자 회피
  const tokens = s.split(NUL).filter((t) => t.length > 0);
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i++];
    // status 토큰 '전체' 검증(첫 글자만 보면 'D123' 등이 오분류). R/C=2경로, 단일 대문자=1경로, 그 외 손상.
    if (/^[RC]\d*$/.test(token)) {
      const oldPath = tokens[i++];
      const newPath = tokens[i++];
      if (oldPath === undefined || newPath === undefined) {
        throw new DiffParseError(`name-status(-z) 손상: rename/copy '${token}' 의 경로 토큰 부족`);
      }
      records.push({ status: token[0], oldPath, newPath, raw: token });
    } else if (/^[A-Z]$/.test(token)) {
      const p = tokens[i++];
      if (p === undefined) {
        throw new DiffParseError(`name-status(-z) 손상: '${token}' 의 경로 토큰 부족`);
      }
      records.push({ status: token, path: p, raw: token });
    } else {
      throw new DiffParseError(`name-status(-z) 손상: 알 수 없는 status 토큰 '${token}'`);
    }
  }
  return records;
}

// record → write 경로 집합 (writes-only):
//   A, M, T → [ path ]    (내용 생성/수정 + typechange. T=파일 타입/모드 변경도 '쓰기'로 보수 포함)
//   R       → [ newPath ] (rename: 새 위치만 쓰기; 옛 경로는 삭제측)
//   C       → [ newPath ] (-M 에선 생성되지 않지만 R 처럼 방어적으로 처리)
//   D       → [ ]         (삭제만 명시적으로 침묵 — MVP 비대상, 환각 계약을 못 만든다)
//   기타     → [ path ]    (U/X/B 등 예기치 못한 단일 경로 status 도 guarded 쓰기를 조용히 흘리지 않게 보수 포함)
export function writePathsOf(record) {
  if (!record) return [];
  switch (record.status) {
    case 'D':
      return []; // 삭제만 침묵
    case 'R':
    case 'C':
      return record.newPath != null ? [record.newPath] : [];
    case 'A':
    case 'M':
    case 'T':
    default:
      // A/M/T + 알 수 없는 단일 경로 status: 내용/타입 '쓰기' → path 가 있으면 write 로 취급(보수적·fail-closed).
      return record.path != null ? [record.path] : [];
  }
}

// --- base ref 해석 + git diff 실행 (fail-closed) --------------------------
// git 실패/ref 미해석 시 절대 fail-open 하지 않는다 — 호출부가 throw 를 잡아 exit 2 로 surface.
// (GitError/DiffParseError 타입은 파일 상단에 선언됨.)

function git(args, cwd) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'buffer' });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString('utf8') : '';
    throw new GitError(`git ${args.join(' ')} 실패: ${stderr.trim() || err.message}`);
  }
}

// 기본 브랜치(origin/HEAD)의 short 이름. 해석 실패 시 'main' 등으로 추측하지 않고 fail-closed 한다
// (설계 §3: "--base 자동 해석이 실패하면 ... exit 2", "절대 fail-open 금지"). 추측한 base 로 엉뚱한
// 범위를 diff 하면 guarded 쓰기를 놓칠 수 있다. 호출부가 GitError 를 잡아 exit 2 로 surface.
export function resolveDefaultBranch(cwd) {
  let out;
  try {
    out = git(['rev-parse', '--abbrev-ref', 'origin/HEAD'], cwd).toString('utf8').trim();
  } catch (err) {
    throw new GitError(
      `기본 브랜치(origin/HEAD)를 해석할 수 없음 (origin/HEAD 미설정/origin 미fetch?). ` +
        `--base 또는 --range 로 base ref 를 명시하세요. (원인: ${err.message})`,
    );
  }
  // "origin/main" → "main"
  const slash = out.indexOf('/');
  const name = slash >= 0 ? out.slice(slash + 1) : out;
  if (!name) {
    throw new GitError(
      `기본 브랜치(origin/HEAD)가 비어 있음 — --base 또는 --range 로 base ref 를 명시하세요.`,
    );
  }
  return name;
}

// diff source 결정 우선순위(설계 §3, 높은 것부터):
//   1. opts.range  "A...B"         → git diff A...B --name-status -M -z
//   2. opts.staged                 → git diff --cached --name-status -M -z
//   3. opts.base <ref>             → git diff $(merge-base <ref> HEAD)..HEAD (3-dot 의미)
//   4. local 기본                  → base = merge-base HEAD origin/<default> ; diff base..HEAD
// 반환: 상태 인식 record 배열. 실패 시 GitError throw(호출부가 exit 2).
// (opts.diffFile 은 여기서 다루지 않는다 — CLI 가 파일을 읽어 parseNameStatusText 로 처리한다.)
export function gitChangedRecords(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const zFlags = ['--name-status', '-M', '-z'];
  let buf;
  if (opts.range) {
    buf = git(['diff', opts.range, ...zFlags], cwd);
  } else if (opts.staged) {
    buf = git(['diff', '--cached', ...zFlags], cwd);
  } else if (opts.base) {
    const mb = git(['merge-base', opts.base, 'HEAD'], cwd).toString('utf8').trim();
    if (!mb) throw new GitError(`base ref '${opts.base}' 의 merge-base 를 구할 수 없음`);
    buf = git(['diff', `${mb}..HEAD`, ...zFlags], cwd);
  } else {
    const def = opts.defaultBranch || resolveDefaultBranch(cwd);
    const ref = `origin/${def}`;
    const mb = git(['merge-base', 'HEAD', ref], cwd).toString('utf8').trim();
    if (!mb) {
      throw new GitError(
        `로컬 기본 base 해석 실패: merge-base HEAD ${ref} 비어있음 (origin 미fetch?). --base/--range 로 명시하세요`,
      );
    }
    buf = git(['diff', `${mb}..HEAD`, ...zFlags], cwd);
  }
  return parseNameStatusZ(buf);
}

// --root 접두 제거 + posix 정규화. F 가 root 접두로 시작하면 그 부분을 떼고,
// 항상 forward-slash 로 normalize 한다(정책 경로와 매칭하기 위함). root 가 없으면 정규화만.
export function stripRoot(file, root) {
  let f = toPosix(file);
  if (root) {
    // root 정규화: 선행 './' 제거 + '/./' 축약 + 후행 '/' 제거.
    // (사용자가 './pkg/...' 처럼 줘도 repo-root 상대 diff 경로와 매칭되게 — 안 하면 monorepo false-negative.)
    let r = toPosix(root)
      .replace(/^(?:\.\/)+/, '')
      .replace(/\/\.(?=\/)/g, '')
      .replace(/\/+$/, '');
    if (r && (f === r || f.startsWith(r + '/'))) {
      f = f.slice(r.length).replace(/^\/+/, '');
    }
  }
  return f;
}

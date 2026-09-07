import fs from 'node:fs';
import path from 'node:path';
import { DEFAULTS, parseArgs, yamlStringify } from './util.mjs';
import { enforceCliFlagContract } from './cli-args.mjs';
import { normalizeVisualAuthorityTuple } from './visual-refresh-boundary-paths.mjs';
import {
  canonicalAuthorityPath,
  evaluateVisualRefreshAuthority,
  routeVisualBackstopRecords,
  VISUAL_REFRESH_INTENT,
  VisualRefreshError,
} from './visual-refresh-runtime.mjs';
import {
  materializeGitTree,
  resolveRepositoryContext,
  resolveVisualDiffContext,
  sourceHeadContext,
  stripProjectPrefix,
  VisualRefreshGitError,
} from './visual-refresh-git.mjs';
import { assertSnapshotPath, VisualRefreshResourceError } from './visual-refresh-resources.mjs';

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function requireString(flags, name) {
  const value = flags[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new VisualRefreshError(`--${name}에는 값이 필요함`);
  }
  return value.trim();
}

function optionalString(flags, name) {
  return own(flags, name) ? requireString(flags, name) : undefined;
}

function parseTuple(argv, kind) {
  const { flags, positionals } = parseArgs(argv);
  const commonValues = new Set([
    'screen', 'path', 'docs', 'src', 'policy', 'manifest', 'layout', 'ci', 'out', 'root', 'intent', 'input',
  ]);
  const valueFlags = kind === 'backstop'
    ? new Set([...commonValues, 'range', 'base', 'diff'])
    : commonValues;
  const booleanFlags = kind === 'backstop'
    ? new Set(['h', 'help', 'json', 'staged', 'enforce'])
    : new Set(['h', 'help', 'json']);
  enforceCliFlagContract({
    argv,
    flags,
    positionals,
    valueFlags,
    booleanFlags,
    tool: kind === 'backstop' ? 'forbidden-paths' : 'readiness',
  });

  const intent = requireString(flags, 'intent');
  if (intent !== VISUAL_REFRESH_INTENT) {
    throw new VisualRefreshError(`지원하지 않는 --intent: ${intent}`);
  }
  const screen = requireString(flags, 'screen');
  const input = requireString(flags, 'input');
  if (kind === 'backstop' && own(flags, 'diff')) {
    throw new VisualRefreshError(
      'visual-refresh는 --diff(name/status only)를 지원하지 않음; --staged/--range/--base를 사용하세요',
    );
  }

  const options = {
    docs: optionalString(flags, 'docs'),
    src: optionalString(flags, 'src'),
    policy: optionalString(flags, 'policy'),
    manifest: optionalString(flags, 'manifest'),
    layout: optionalString(flags, 'layout'),
    ci: optionalString(flags, 'ci'),
  };
  // Syntax is checked before Git I/O. Physical identity is checked in the view
  // actually supplying authority: current authoring for forward, B for backstop.
  for (const [name, value] of Object.entries(options)) {
    if (value !== undefined) canonicalAuthorityPath(value, `--${name}`);
  }
  const checkedPath = optionalString(flags, 'path');
  if (checkedPath !== undefined) canonicalAuthorityPath(checkedPath, '--path');
  if (kind === 'backstop' && checkedPath === undefined) {
    throw new VisualRefreshError('visual-refresh backstop은 --path가 필수임');
  }
  return {
    flags,
    screen,
    input,
    checkedPath,
    root: optionalString(flags, 'root'),
    options,
  };
}

function publicResult(result) {
  const { _context, ...publicFields } = result;
  if (_context && publicFields.intent_authorization?.intent === VISUAL_REFRESH_INTENT) {
    const snapshot = publicFields.intent_authorization.snapshot || {};
    const decision = publicFields.path_authorization || null;
    publicFields.visual_refresh_audit = {
      intent: VISUAL_REFRESH_INTENT,
      selected_screen: _context.selected_screen || null,
      input_id: publicFields.intent_authorization.input_id || null,
      authorized_path:
        _context.authorized_path || publicFields.intent_authorization.authorized_path || null,
      checked_path:
        decision?.checked_path || publicFields.intent_authorization.checked_path || null,
      path_allowed: decision?.allowed === true,
      path_reason: decision?.reason ?? null,
      path_grant: decision?.grant ?? null,
      path_authorization: decision,
      source_tree: snapshot.source_tree || null,
      destination_tree: snapshot.destination_tree || null,
      diff_kind: snapshot.diff_kind || null,
      readiness_entry: _context.readiness || null,
    };
  }
  return publicFields;
}

function emit(result, flags) {
  const serializable = publicResult(result);
  const output = flags.json
    ? `${JSON.stringify(serializable, null, 2)}\n`
    : yamlStringify(serializable, { lineWidth: 0 });
  if (own(flags, 'out')) {
    const destination = path.resolve(requireString(flags, 'out'));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, output, 'utf8');
  } else {
    process.stdout.write(output);
  }
}

function absoluteFrom(root, relative) {
  return path.join(root, ...String(relative).split('/'));
}

function assertCopySourceConfined(projectRoot, source) {
  const realRoot = fs.realpathSync(projectRoot);
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) {
    throw new VisualRefreshError(
      `forward authority view는 symlink를 읽지 않음: ${path.relative(projectRoot, source)}`,
    );
  }
  const real = fs.realpathSync(source);
  if (real !== realRoot && !real.startsWith(`${realRoot}${path.sep}`)) {
    throw new VisualRefreshError(
      `forward authority source가 --root 밖으로 이탈함: ${path.relative(projectRoot, source)}`,
    );
  }
}

function overlayAuthorityPath(projectRoot, destinationRoot, relative) {
  const source = absoluteFrom(projectRoot, relative);
  const destination = absoluteFrom(destinationRoot, relative);
  if (!fs.existsSync(source)) {
    fs.rmSync(destination, { recursive: true, force: true });
    return;
  }
  const sourceStat = fs.lstatSync(source);
  assertSnapshotPath(projectRoot, relative, {
    label: 'forward authority source',
    type: sourceStat.isDirectory() ? 'directory' : 'file',
  });
  assertCopySourceConfined(projectRoot, source);
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, {
    recursive: true,
    dereference: false,
    filter(current) {
      assertCopySourceConfined(projectRoot, current);
      return true;
    },
  });
}

// Forward uses current authoring but never current implementation facts. The
// resolved role/layer boundary is checked both before copying and in the resulting
// authority view, so a changing layout cannot bypass the overlay guard.
function materializeForwardAuthorityView(repository, sourceTree, options) {
  const destination = materializeGitTree({
    repositoryRoot: repository.repositoryRoot,
    projectPrefix: repository.projectPrefix,
    tree: sourceTree,
  });
  try {
    const overlays = new Set([options.docs || DEFAULTS.docs]);
    for (const key of ['policy', 'manifest', 'layout', 'ci']) {
      if (options[key]) overlays.add(options[key]);
    }
    for (const relative of overlays) {
      overlayAuthorityPath(repository.projectRoot, destination.root, relative);
    }
    return destination;
  } catch (error) {
    destination.cleanup();
    throw error;
  }
}

function isCurrentRegularFile(projectRoot, relative) {
  try {
    const absolute = absoluteFrom(projectRoot, relative);
    const stat = fs.lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) return false;
    const realRoot = fs.realpathSync(projectRoot);
    const real = fs.realpathSync(absolute);
    return real.startsWith(`${realRoot}${path.sep}`);
  } catch {
    return false;
  }
}

function applyForwardFileIdentity(result, projectRoot) {
  const intent = result?.intent_authorization;
  const authorizedPath = intent?.authorized_path;
  if (!intent?.applicable || !authorizedPath || isCurrentRegularFile(projectRoot, authorizedPath)) {
    return result;
  }
  result.intent_authorization = {
    ...intent,
    applicable: false,
    reasons: [
      ...(intent.reasons || []),
      {
        code: 'VR-SCREEN-009',
        message: 'current forward view의 authorized screen_entry가 existing regular file이 아님',
      },
    ],
  };
  if (result.path_authorization) {
    result.path_authorization = { ...result.path_authorization, allowed: false };
  }
  return result;
}

export function runVisualReadinessCli(argv = process.argv.slice(2)) {
  let tuple = parseTuple(argv, 'readiness');
  const repository = resolveRepositoryContext(tuple.root || process.cwd());
  const source = sourceHeadContext(repository);
  if (!source) {
    const output = {
      intent_authorization: {
        intent: VISUAL_REFRESH_INTENT,
        input_id: tuple.input,
        applicable: false,
        reasons: [{ code: 'VR-GIT-001', message: 'HEAD가 없어 source authority context를 만들 수 없음' }],
      },
    };
    emit(output, tuple.flags);
    process.exitCode = 0;
    return output;
  }
  let destination;
  try {
    tuple = normalizeVisualAuthorityTuple(tuple, {
      authorityRoot: repository.projectRoot, sourceRoot: source.materialized.root,
    });
    destination = materializeForwardAuthorityView(repository, source.source_tree, tuple.options);
    tuple = normalizeVisualAuthorityTuple(tuple, {
      authorityRoot: destination.root, sourceRoot: source.materialized.root,
    });
    const output = applyForwardFileIdentity(
      evaluateVisualRefreshAuthority({
        sourceRoot: source.materialized.root,
        destinationRoot: destination.root,
        observationRoot: repository.projectRoot,
        selectedScreen: tuple.screen,
        selectedInputId: tuple.input,
        checkedPath: tuple.checkedPath,
        options: tuple.options,
        snapshot: {
          source_tree: source.source_tree,
          destination_tree: source.destination_tree,
          diff_kind: source.diff_kind,
        },
      }),
      repository.projectRoot,
    );
    emit(output, tuple.flags);
    process.exitCode = 0;
    return output;
  } finally {
    source.materialized.cleanup();
    destination?.cleanup();
  }
}

function authorityViolation(authority) {
  return {
    file: '(authority)',
    change: '?',
    code: 'VR-BACKSTOP-010',
    reason: 'visual-refresh authority is inapplicable; no visual record can be granted',
    authority_reasons: authority.intent_authorization.reasons || [],
  };
}

function normalizeChangedRecords(records, projectPrefix) {
  const normalized = [];
  for (const record of records || []) {
    if (record?.status === 'R' || record?.status === 'C') {
      const oldPath = stripProjectPrefix(record.oldPath, projectPrefix);
      const newPath = stripProjectPrefix(record.newPath, projectPrefix);
      if (oldPath != null && newPath != null) normalized.push({ ...record, oldPath, newPath });
      continue;
    }
    const file = stripProjectPrefix(record?.path, projectPrefix);
    if (file != null) normalized.push({ ...record, path: file });
  }
  return normalized;
}

export function runVisualForbiddenPathsCli(argv = process.argv.slice(2)) {
  let tuple = parseTuple(argv, 'backstop');
  const repository = resolveRepositoryContext(tuple.root || process.cwd());
  const diff = resolveVisualDiffContext({
    repositoryRoot: repository.repositoryRoot,
    staged: tuple.flags.staged === true,
    range: optionalString(tuple.flags, 'range'),
    base: optionalString(tuple.flags, 'base'),
  });
  const source = materializeGitTree({
    repositoryRoot: repository.repositoryRoot,
    projectPrefix: repository.projectPrefix,
    tree: diff.source_tree,
  });
  let destination;
  try {
    destination = materializeGitTree({
      repositoryRoot: repository.repositoryRoot,
      projectPrefix: repository.projectPrefix,
      tree: diff.destination_tree,
    });
    // A/B authority is independent of the current checkout's resource existence,
    // spelling, symlinks or bytes. Only the captured destination supplies resources.
    tuple = normalizeVisualAuthorityTuple(tuple, {
      authorityRoot: destination.root, sourceRoot: source.root,
    });
    const authority = evaluateVisualRefreshAuthority({
      sourceRoot: source.root,
      destinationRoot: destination.root,
      selectedScreen: tuple.screen,
      selectedInputId: tuple.input,
      checkedPath: tuple.checkedPath,
      options: tuple.options,
      snapshot: {
        source_tree: diff.source_tree,
        destination_tree: diff.destination_tree,
        diff_kind: diff.diff_kind,
      },
    });
    const violations = authority.intent_authorization.applicable
      ? routeVisualBackstopRecords({
          records: diff.records,
          authority,
          projectPrefix: repository.projectPrefix,
        }).violations
      : [authorityViolation(authority)];
    if (tuple.checkedPath && tuple.checkedPath !== authority._context?.authorized_path) {
      violations.push({
        file: tuple.checkedPath,
        change: '?',
        code: 'VR-BACKSTOP-011',
        reason: '--path does not equal stable authorized screen_entry',
      });
    }
    const enforced = tuple.flags.enforce === true;
    const output = {
      ok: violations.length === 0,
      enforced,
      intent_authorization: authority.intent_authorization,
      ...(authority.path_authorization ? { path_authorization: authority.path_authorization } : {}),
      violations,
      changed_records: normalizeChangedRecords(diff.records, repository.projectPrefix),
      diff_context: {
        source_tree: diff.source_tree,
        destination_tree: diff.destination_tree,
        diff_kind: diff.diff_kind,
      },
    };
    emit(output, tuple.flags);
    process.exitCode = output.ok ? 0 : enforced ? 1 : 0;
    return output;
  } finally {
    source.cleanup();
    destination?.cleanup();
  }
}

export function runVisualCliSafely(fn, toolName) {
  try {
    return fn();
  } catch (error) {
    const known =
      error instanceof VisualRefreshError ||
      error instanceof VisualRefreshGitError ||
      error instanceof VisualRefreshResourceError;
    const message = known
      ? error.message
      : `${error?.name || 'Error'}: ${error?.message || String(error)}`;
    process.stderr.write(`${toolName}: ${message}\n`);
    process.exitCode = 2;
    return null;
  }
}

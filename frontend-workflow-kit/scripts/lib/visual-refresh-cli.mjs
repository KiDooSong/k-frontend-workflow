import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, yamlStringify } from './util.mjs';
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
  VisualRefreshGitError,
} from './visual-refresh-git.mjs';

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

function rejectUnknown(flags, allowed) {
  const unknown = Object.keys(flags).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw new VisualRefreshError(`알 수 없는 옵션: ${unknown.map((key) => `--${key}`).join(', ')}`);
  }
}

function parseTuple(argv, kind) {
  const { flags, positionals } = parseArgs(argv);
  if (positionals.length) {
    throw new VisualRefreshError(`알 수 없는 positional argument: ${positionals.join(' ')}`);
  }
  const common = new Set([
    'h',
    'help',
    'json',
    'screen',
    'path',
    'docs',
    'src',
    'policy',
    'manifest',
    'layout',
    'ci',
    'out',
    'root',
    'intent',
    'input',
  ]);
  const allowed =
    kind === 'backstop'
      ? new Set([...common, 'staged', 'range', 'base', 'enforce', 'diff'])
      : common;
  rejectUnknown(flags, allowed);

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
  for (const [name, value] of Object.entries(options)) {
    if (value !== undefined) canonicalAuthorityPath(value, `--${name}`);
  }
  const checkedPath = optionalString(flags, 'path');
  if (checkedPath !== undefined) canonicalAuthorityPath(checkedPath, '--path');
  if (kind === 'backstop' && checkedPath === undefined) {
    throw new VisualRefreshError('visual-refresh backstop은 --path가 필수임');
  }
  for (const booleanFlag of kind === 'backstop' ? ['staged', 'enforce', 'json'] : ['json']) {
    if (own(flags, booleanFlag) && flags[booleanFlag] !== true) {
      throw new VisualRefreshError(`--${booleanFlag}는 값을 받지 않는 boolean flag임`);
    }
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

export function runVisualReadinessCli(argv = process.argv.slice(2)) {
  const tuple = parseTuple(argv, 'readiness');
  const repository = resolveRepositoryContext(tuple.root || process.cwd());
  const source = sourceHeadContext(repository);
  if (!source) {
    const output = {
      intent_authorization: {
        intent: VISUAL_REFRESH_INTENT,
        input_id: tuple.input,
        applicable: false,
        reasons: [
          {
            code: 'VR-GIT-001',
            message: 'HEAD가 없어 source authority context를 만들 수 없음',
          },
        ],
      },
    };
    emit(output, tuple.flags);
    process.exitCode = 0;
    return output;
  }
  try {
    const output = evaluateVisualRefreshAuthority({
      sourceRoot: source.materialized.root,
      destinationRoot: repository.projectRoot,
      selectedScreen: tuple.screen,
      selectedInputId: tuple.input,
      checkedPath: tuple.checkedPath,
      options: tuple.options,
      snapshot: {
        source_tree: source.source_tree,
        destination_tree: source.destination_tree,
        diff_kind: source.diff_kind,
      },
    });
    emit(output, tuple.flags);
    process.exitCode = 0;
    return output;
  } finally {
    source.materialized.cleanup();
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

export function runVisualForbiddenPathsCli(argv = process.argv.slice(2)) {
  const tuple = parseTuple(argv, 'backstop');
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
  const destination = materializeGitTree({
    repositoryRoot: repository.repositoryRoot,
    projectPrefix: repository.projectPrefix,
    tree: diff.destination_tree,
  });
  try {
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
      ...(authority.path_authorization
        ? { path_authorization: authority.path_authorization }
        : {}),
      violations,
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
    destination.cleanup();
  }
}

export function runVisualCliSafely(fn, toolName) {
  try {
    return fn();
  } catch (error) {
    const known = error instanceof VisualRefreshError || error instanceof VisualRefreshGitError;
    const message = known
      ? error.message
      : `${error?.name || 'Error'}: ${error?.message || String(error)}`;
    process.stderr.write(`${toolName}: ${message}\n`);
    process.exitCode = 2;
    return null;
  }
}

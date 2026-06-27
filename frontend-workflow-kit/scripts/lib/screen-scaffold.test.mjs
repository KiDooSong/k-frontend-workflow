import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ScreenScaffoldError,
  buildScreenSpec,
  screenSlugFromId,
  writeScreenSpec,
} from './screen-scaffold.mjs';
import { isStub, loadScreenSpec } from './spec.mjs';
import { splitFrontmatter } from './util.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIT_ROOT = path.resolve(HERE, '..', '..');
const CLI = path.join(KIT_ROOT, 'scripts', 'create-screen.mjs');

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
}

function tmpdir(t, prefix = 'screen-scaffold-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function existingSpec({ domain, slug, screenId, route }) {
  return [
    '---',
    `artifact_id: ${screenId}-screen-spec`,
    'artifact_type: screen-spec',
    `domain: ${domain}`,
    `screen_id: ${screenId}`,
    `route: ${route}`,
    'status: draft',
    '---',
    '',
    `# ScreenSpec: ${screenId}`,
    '',
  ].join('\n');
}

test('screenSlugFromId derives a kebab slug from the canonical screen id', () => {
  assert.equal(screenSlugFromId('AUTH-SIGNUP-EMAIL'), 'auth-signup-email');
  assert.equal(screenSlugFromId('COUPON_List 01'), 'coupon-list-01');
});

test('buildScreenSpec requires domain, screen_id, and route', () => {
  assert.throws(() => buildScreenSpec({ docsDir: 'x' }), ScreenScaffoldError);
  assert.throws(() => buildScreenSpec({ domain: 'auth', screenId: 'AUTH-001' }), /route is required/);
  assert.throws(() => buildScreenSpec({ domain: 'Auth', screenId: 'AUTH-001', route: '/x' }), /domain must match/);
  assert.throws(() => buildScreenSpec({ domain: 'auth', screenId: 'AUTH-001', route: 'signup' }), /route must start with/);
});

// Case 5: new screen confirmed -> create-screen writes a stub ScreenSpec.
test('writeScreenSpec writes a stub ScreenSpec that readiness treats as a stub', (t) => {
  const docsDir = path.join(tmpdir(t), 'docs', 'frontend-workflow');
  const result = writeScreenSpec({
    docsDir,
    domain: 'auth',
    screenId: 'AUTH-SIGNUP-EMAIL',
    screenSlug: 'signup-email',
    route: '/signup/email',
    title: 'Signup Email',
    sourceInput: 'IN-20260625-visual-spec-001',
    date: '2026-06-25',
  });

  assert.equal(result.wrote, true);
  assert.equal(
    result.outputPath,
    path.join(docsDir, 'domains', 'auth', 'screens', 'signup-email', 'screen-spec.md'),
  );
  assert.ok(fs.existsSync(result.outputPath));

  const spec = loadScreenSpec(result.outputPath);
  assert.equal(spec.parseError, undefined);
  assert.equal(spec.frontmatter.artifact_id, 'AUTH-SIGNUP-EMAIL-screen-spec');
  assert.equal(spec.frontmatter.artifact_type, 'screen-spec');
  assert.equal(spec.frontmatter.domain, 'auth');
  assert.equal(spec.frontmatter.screen_id, 'AUTH-SIGNUP-EMAIL');
  assert.equal(spec.frontmatter.route, '/signup/email');
  assert.equal(spec.frontmatter.status, 'draft'); // never confirmed
  assert.deepEqual(spec.frontmatter.depends_on, ['navigation-map']);
  assert.deepEqual(spec.frontmatter.sources, [{ type: 'input', ref: 'IN-20260625-visual-spec-001' }]);
  // Stub: no ## content sections -> readiness keeps the screen at the screen-skeleton ceiling.
  assert.equal(isStub(spec), true);
  assert.match(spec.body, /# ScreenSpec: Signup Email/);
  // It does not promote status or write implementation code.
  assert.doesNotMatch(spec.body, /## State Matrix/);
});

test('writeScreenSpec --frontmatter-only omits the title heading and stays a stub', (t) => {
  const docsDir = path.join(tmpdir(t), 'docs', 'frontend-workflow');
  const result = writeScreenSpec({
    docsDir,
    domain: 'auth',
    screenId: 'AUTH-002',
    route: '/login',
    frontmatterOnly: true,
  });
  assert.doesNotMatch(result.text, /# ScreenSpec:/);
  assert.equal(isStub(loadScreenSpec(result.outputPath)), true);
});

// Case 6: create-screen refuses a duplicate screen_id.
test('writeScreenSpec refuses a screen_id already used by another ScreenSpec', (t) => {
  const docsDir = path.join(tmpdir(t), 'docs', 'frontend-workflow');
  write(
    path.join(docsDir, 'domains', 'auth', 'screens', 'login', 'screen-spec.md'),
    existingSpec({ domain: 'auth', slug: 'login', screenId: 'AUTH-LOGIN', route: '/login' }),
  );
  assert.throws(
    () =>
      writeScreenSpec({
        docsDir,
        domain: 'auth',
        screenId: 'AUTH-LOGIN', // same canonical id, different slug
        screenSlug: 'login-copy',
        route: '/login/copy',
      }),
    /screen_id already exists/,
  );
});

// Case 7: create-screen refuses to overwrite by default.
test('writeScreenSpec refuses overwrite by default and allows it explicitly', (t) => {
  const docsDir = path.join(tmpdir(t), 'docs', 'frontend-workflow');
  const target = path.join(docsDir, 'domains', 'auth', 'screens', 'signup-email', 'screen-spec.md');
  write(target, existingSpec({ domain: 'auth', slug: 'signup-email', screenId: 'AUTH-SIGNUP-EMAIL', route: '/signup/email' }));

  assert.throws(
    () =>
      writeScreenSpec({
        docsDir,
        domain: 'auth',
        screenId: 'AUTH-SIGNUP-EMAIL',
        screenSlug: 'signup-email',
        route: '/signup/email',
      }),
    /already exists/,
  );

  const result = writeScreenSpec({
    docsDir,
    domain: 'auth',
    screenId: 'AUTH-SIGNUP-EMAIL',
    screenSlug: 'signup-email',
    route: '/signup/email',
    title: 'Overwritten',
    overwrite: true,
  });
  assert.equal(result.overwritten, true);
  assert.match(fs.readFileSync(target, 'utf8'), /# ScreenSpec: Overwritten/);
});

test('writeScreenSpec warns (but does not block) when the route is already used', (t) => {
  const docsDir = path.join(tmpdir(t), 'docs', 'frontend-workflow');
  write(
    path.join(docsDir, 'domains', 'auth', 'screens', 'login', 'screen-spec.md'),
    existingSpec({ domain: 'auth', slug: 'login', screenId: 'AUTH-LOGIN', route: '/login' }),
  );
  const result = writeScreenSpec({
    docsDir,
    domain: 'auth',
    screenId: 'AUTH-LOGIN-ALT',
    screenSlug: 'login-alt',
    route: '/login', // duplicate route, distinct id
  });
  assert.equal(result.wrote, true);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /route already used/);
});

test('writeScreenSpec --dry-run does not write but returns the text and next steps', (t) => {
  const docsDir = path.join(tmpdir(t), 'docs', 'frontend-workflow');
  const result = writeScreenSpec({
    docsDir,
    domain: 'auth',
    screenId: 'AUTH-003',
    route: '/verify',
    dryRun: true,
  });
  assert.equal(result.wrote, false);
  assert.equal(fs.existsSync(result.outputPath), false);
  assert.match(result.text, /screen_id: AUTH-003/);
  assert.ok(result.next_steps.some((s) => /screen-source-map/.test(s)));
  assert.ok(result.next_steps.some((s) => /workflow:state/.test(s)));
});

test('CLI scaffolds a stub and prints next steps', (t) => {
  const docs = path.join(tmpdir(t), 'docs', 'frontend-workflow');
  const res = spawnSync(
    process.execPath,
    [CLI, '--docs', docs, '--domain', 'auth', '--screen-id', 'AUTH-RESET', '--route', '/reset', '--json'],
    { encoding: 'utf8' },
  );
  assert.equal(res.status, 0, res.stderr);
  const body = JSON.parse(res.stdout);
  assert.equal(body.screen_id, 'AUTH-RESET');
  assert.equal(body.wrote, true);
  assert.ok(Array.isArray(body.next_steps) && body.next_steps.length >= 1);
  const written = path.join(docs, 'domains', 'auth', 'screens', 'auth-reset', 'screen-spec.md');
  assert.equal(fs.existsSync(written), true);
  const { data } = splitFrontmatter(fs.readFileSync(written, 'utf8'));
  assert.equal(data.screen_id, 'AUTH-RESET');
  assert.equal(data.status, 'draft');
});

test('CLI exits 2 for missing required identity', (t) => {
  const docs = path.join(tmpdir(t), 'docs', 'frontend-workflow');
  const res = spawnSync(process.execPath, [CLI, '--docs', docs, '--domain', 'auth'], { encoding: 'utf8' });
  assert.equal(res.status, 2);
  assert.match(res.stderr, /screen_id is required[\s\S]*route is required|route is required/);
});

test('CLI exits 2 for a duplicate screen_id rather than inventing a path', (t) => {
  const docs = path.join(tmpdir(t), 'docs', 'frontend-workflow');
  write(
    path.join(docs, 'domains', 'auth', 'screens', 'login', 'screen-spec.md'),
    existingSpec({ domain: 'auth', slug: 'login', screenId: 'AUTH-LOGIN', route: '/login' }),
  );
  const res = spawnSync(
    process.execPath,
    [CLI, '--docs', docs, '--domain', 'auth', '--screen-id', 'AUTH-LOGIN', '--screen-slug', 'dupe', '--route', '/login/dupe'],
    { encoding: 'utf8' },
  );
  assert.equal(res.status, 2);
  assert.match(res.stderr, /screen_id already exists/);
});

test('CLI rejects unknown flags before writing', (t) => {
  const docs = path.join(tmpdir(t), 'docs', 'frontend-workflow');
  const res = spawnSync(
    process.execPath,
    [CLI, '--docs', docs, '--domain', 'auth', '--screen-id', 'AUTH-X', '--route', '/x', '--bogus'],
    { encoding: 'utf8' },
  );
  assert.equal(res.status, 2);
  assert.match(res.stderr, /unknown flag: --bogus/);
});

import path from 'node:path';
import { isRealDate } from './schema.mjs';
import { publicScreenKeyOf } from './spec.mjs';

export const SCREEN_LIFECYCLE_VALUES = Object.freeze(['active', 'absorbed']);

const CANONICAL_SCREEN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function relPosix(fromDir, file) {
  const rel = path.relative(fromDir, file);
  return String(rel || '.').split(path.sep).join('/');
}

function sourceOf(docsDir, spec) {
  return {
    path: relPosix(docsDir, spec.path),
  };
}

function lifecycleError(code, message, check, extra = {}) {
  return { code, message, check, ...extra };
}

function compareErrors(left, right) {
  const byCheck = Number(left.check || 0) - Number(right.check || 0);
  if (byCheck !== 0) return byCheck;
  const byCode = String(left.code).localeCompare(String(right.code));
  if (byCode !== 0) return byCode;
  const byTarget = String(left.absorbed_into || '').localeCompare(String(right.absorbed_into || ''));
  if (byTarget !== 0) return byTarget;
  return String(left.message).localeCompare(String(right.message));
}

function isCanonicalScreenId(value) {
  return typeof value === 'string' && CANONICAL_SCREEN_ID_PATTERN.test(value);
}

export function screenLifecycleOf(spec) {
  const fm = spec?.frontmatter || {};
  return hasOwn(fm, 'screen_lifecycle') ? fm.screen_lifecycle : 'active';
}

export function isAbsorbedScreenSpec(spec) {
  return screenLifecycleOf(spec) === 'absorbed';
}

function absorptionTrail(record, byPublicKey) {
  const visited = new Set([record.public_key]);
  const trail = [record.public_key];
  let cursor = record;
  while (cursor.lifecycle === 'absorbed' && isCanonicalScreenId(cursor.absorbed_into)) {
    const targetKey = String(cursor.absorbed_into);
    trail.push(targetKey);
    if (visited.has(targetKey)) return { kind: 'cycle', trail };
    visited.add(targetKey);
    const targets = byPublicKey.get(targetKey) || [];
    if (targets.length !== 1) return { kind: 'chain', trail };
    cursor = targets[0];
    if (cursor.lifecycle !== 'absorbed') return { kind: 'chain', trail };
  }
  return { kind: 'chain', trail };
}

export function analyzeScreenLifecycles({ specs, docsDir }) {
  const records = (specs || []).map((spec) => {
    const fm = spec.frontmatter || {};
    return {
      spec,
      screen_id: fm.screen_id,
      public_key: publicScreenKeyOf(spec),
      lifecycle: screenLifecycleOf(spec),
      absorbed_into: fm.absorbed_into,
      absorbed_at: fm.absorbed_at,
      valid: true,
      errors: [],
      source: sourceOf(docsDir, spec),
    };
  });
  records.sort((a, b) => a.source.path.localeCompare(b.source.path));

  const byPublicKey = new Map();
  const bySpec = new Map();
  for (const record of records) {
    const rows = byPublicKey.get(record.public_key) || [];
    rows.push(record);
    byPublicKey.set(record.public_key, rows);
    bySpec.set(record.spec, record);
  }

  for (const record of records) {
    const fm = record.spec.frontmatter || {};
    const lifecycle = record.lifecycle;

    if (typeof lifecycle !== 'string' || !SCREEN_LIFECYCLE_VALUES.includes(lifecycle)) {
      record.errors.push(
        lifecycleError(
          'invalid-screen-lifecycle',
          `screen_lifecycle must be ${SCREEN_LIFECYCLE_VALUES.join('|')} (actual: ${JSON.stringify(lifecycle)})`,
          1,
        ),
      );
    }

    if (hasOwn(fm, 'absorbed_at') && (typeof fm.absorbed_at !== 'string' || !isRealDate(fm.absorbed_at))) {
      record.errors.push(
        lifecycleError(
          'invalid-absorbed-at',
          `absorbed_at must be a real YYYY-MM-DD date (actual: ${JSON.stringify(fm.absorbed_at)})`,
          1,
        ),
      );
    }

    if (lifecycle === 'active') {
      for (const field of ['absorbed_into', 'absorbed_at']) {
        if (!hasOwn(fm, field)) continue;
        record.errors.push(
          lifecycleError(
            'active-with-absorbed-field',
            `active ScreenSpec must not declare ${field}`,
            2,
            { field },
          ),
        );
      }
      continue;
    }

    if (lifecycle !== 'absorbed') continue;

    if (!isCanonicalScreenId(record.screen_id)) {
      record.errors.push(
        lifecycleError(
          'invalid-source-screen-id',
          `absorbed ScreenSpec screen_id must be a canonical string (actual: ${JSON.stringify(record.screen_id)})`,
          2,
        ),
      );
    }

    if (!hasOwn(fm, 'absorbed_into') || fm.absorbed_into === null || fm.absorbed_into === '') {
      record.errors.push(
        lifecycleError(
          'missing-absorbed-into',
          'screen_lifecycle=absorbed requires absorbed_into',
          2,
        ),
      );
    } else if (!isCanonicalScreenId(fm.absorbed_into)) {
      record.errors.push(
        lifecycleError(
          'invalid-absorbed-into',
          `absorbed_into must be a canonical Screen ID string (actual: ${JSON.stringify(fm.absorbed_into)})`,
          1,
        ),
      );
    }
  }

  // A lifecycle-bearing source participates in direct lookup semantics, so its public key must
  // identify exactly one source record. Run this after the per-record syntax/shape checks: malformed
  // enum values and active records carrying absorbed-only fields are lifecycle concerns too. Mark
  // every colliding record so workflow-state's deterministic Map selection cannot hide the blocker.
  for (const [publicKey, sources] of byPublicKey) {
    if (sources.length <= 1) continue;
    const hasLifecycleConcern = sources.some((source) => {
      const fm = source.spec.frontmatter || {};
      return (
        hasOwn(fm, 'screen_lifecycle') ||
        hasOwn(fm, 'absorbed_into') ||
        hasOwn(fm, 'absorbed_at') ||
        source.errors.length > 0
      );
    });
    if (!hasLifecycleConcern) continue;

    const locations = sources.map((source) => source.source.path).sort();
    for (const source of sources) {
      source.errors.push(
        lifecycleError(
          'ambiguous-absorption-source',
          `lifecycle-bearing source is duplicated in the public Screen ID namespace: ${String(publicKey)}`,
          3,
          { locations },
        ),
      );
    }
  }

  for (const record of records) {
    if (record.lifecycle !== 'absorbed') continue;
    if (!isCanonicalScreenId(record.screen_id) || !isCanonicalScreenId(record.absorbed_into)) continue;

    if (record.screen_id === record.absorbed_into) {
      record.errors.push(
        lifecycleError(
          'self-absorption',
          `absorbed_into must differ from source screen_id: ${record.screen_id}`,
          3,
          { absorbed_into: record.absorbed_into },
        ),
      );
      continue;
    }

    const targets = byPublicKey.get(String(record.absorbed_into)) || [];
    if (targets.length === 0) {
      record.errors.push(
        lifecycleError(
          'missing-absorption-target',
          `absorbed_into target does not exist: ${record.absorbed_into}`,
          3,
          { absorbed_into: record.absorbed_into },
        ),
      );
      continue;
    }
    if (targets.length > 1) {
      record.errors.push(
        lifecycleError(
          'ambiguous-absorption-target',
          `absorbed_into target is duplicated in the public Screen ID namespace: ${record.absorbed_into}`,
          3,
          {
            absorbed_into: record.absorbed_into,
            locations: targets.map((target) => target.source.path).sort(),
          },
        ),
      );
      continue;
    }

    const target = targets[0];
    if (!isCanonicalScreenId(target.screen_id) || target.screen_id !== record.absorbed_into) {
      record.errors.push(
        lifecycleError(
          'noncanonical-absorption-target',
          `absorbed_into must resolve to a ScreenSpec whose original screen_id is exactly ${record.absorbed_into}`,
          3,
          { absorbed_into: record.absorbed_into, target: target.source },
        ),
      );
      continue;
    }

    if (target.lifecycle === 'absorbed') {
      const trail = absorptionTrail(record, byPublicKey);
      record.errors.push(
        lifecycleError(
          'absorbed-absorption-target',
          `absorbed_into must point directly to an active ScreenSpec: ${record.absorbed_into}`,
          3,
          { absorbed_into: record.absorbed_into, target: target.source },
        ),
      );
      record.errors.push(
        lifecycleError(
          trail.kind === 'cycle' ? 'absorption-cycle' : 'absorption-chain',
          `ScreenSpec absorption ${trail.kind} is not allowed: ${trail.trail.join(' -> ')}`,
          3,
          { absorbed_into: record.absorbed_into, trail: trail.trail },
        ),
      );
      continue;
    }

    if (target.lifecycle !== 'active' || target.errors.length > 0) {
      record.errors.push(
        lifecycleError(
          'invalid-absorption-target',
          `absorbed_into target must have a valid active lifecycle declaration: ${record.absorbed_into}`,
          3,
          { absorbed_into: record.absorbed_into, target: target.source },
        ),
      );
    }
  }

  for (const record of records) {
    record.errors.sort(compareErrors);
    record.valid = record.errors.length === 0;
  }

  const absorbedRecords = records.filter(
    (record) => record.lifecycle === 'absorbed' && record.valid,
  );
  const invalidRecords = records.filter((record) => !record.valid);
  const liveSpecs = records
    .filter((record) => !(record.lifecycle === 'absorbed' && record.valid))
    .map((record) => record.spec);

  return {
    records,
    liveSpecs,
    absorbedRecords,
    invalidRecords,
    byPublicKey,
    bySpec,
  };
}

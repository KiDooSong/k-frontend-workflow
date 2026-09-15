// Use the canonical validators; warnings are observations, never new C gates.
import path from 'node:path';
import { walkFiles, splitFrontmatter, readFileSafe } from './util.mjs';
import { validateReconciliationRegister } from './reconciliation-register.mjs';
import { parseRegisterContract, parseReconciliationItems, validateReconciliationV2 } from './reconciliation-items.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { CurrentWorkExecutionError } from './current-work-execution-core.mjs';

export function validateCurrentReconciliation({ register, registerFile, inputArtifacts, docsRoot, baselineRoot }) {
  const base = validateReconciliationRegister({ register, registerFile, inputArtifacts, enforce: false });
  const contract = parseRegisterContract(register.fm);
  let artifactFiles = null;
  let targetIndex = null;
  const errors = [...base.errors];
  if (register.exists && contract.version === 2) {
    // Same document domain as validate.mjs. Pin every scanned file, including
    // non-artifact Markdown: its frontmatter controls membership in the index.
    artifactFiles = walkFiles(docsRoot, ['.md']).filter(file =>
      !path.relative(docsRoot, file).split(path.sep).includes('_meta'));
    const docs = [];
    for (const file of artifactFiles) {
      const { data, hasFrontmatter, parseError } = splitFrontmatter(readFileSafe(file));
      if (parseError) errors.push({ file, message: `artifact frontmatter: ${parseError}` });
      if (hasFrontmatter && data?.artifact_type) docs.push({ file, fm: data });
    }
    targetIndex = buildReconciliationTargetIndex({ docs });
  }
  const typed = validateReconciliationV2({ register, registerFile, inputArtifacts, targetIndex });
  errors.push(...typed.errors);
  if (errors.length) {
    throw new CurrentWorkExecutionError(`reconciliation register: ${errors.map(e => e.message).join('; ')}`);
  }
  const warnings = [...base.warnings, ...typed.warnings].map(w => ({
    ...w, file: path.relative(baselineRoot, w.file).split(path.sep).join('/'),
  }));
  return { targetIndex, artifactFiles, warnings,
    itemTable: register.exists && contract.version === 2 ? parseReconciliationItems(register.body) : null };
}

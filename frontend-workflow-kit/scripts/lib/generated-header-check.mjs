// Check 6 preserves its existing marker semantics while sharing declaration,
// spelling and symlink checks with visual generated ownership.
import path from 'node:path';
import { GENERATED_HEADER_RE } from './glob.mjs';
import { readFileSafe } from './util.mjs';
import { canonicalManifestPattern, manifestGeneratedPaths, resolveManifestFiles } from './artifact-path.mjs';

export function generatedHeaderIssues(manifest, { projectRoot, docsDir, manifestPath }) {
  const issues = [];
  for (const [name, entry] of Object.entries(manifest.artifacts || {})) {
    if (entry.kind !== 'generated' || entry.do_not_edit !== true) continue;
    try {
      for (const output of manifestGeneratedPaths(entry, name)) {
        const pattern = canonicalManifestPattern(output.raw, { label: output.label });
        const prefix = 'docs/frontend-workflow/';
        // Ordinary validate supports an independently supplied docs root. This is
        // an explicit anchor, not permission for .. inside a manifest declaration.
        const docsOutput = pattern.startsWith(prefix);
        const root = docsOutput ? docsDir : projectRoot;
        const relative = docsOutput ? pattern.slice(prefix.length) : pattern;
        for (const file of resolveManifestFiles(root, relative, { label: output.label })) {
          const head = (readFileSafe(file) || '').slice(0, 400);
          if (!output.primary && !/GENERATED FILE/i.test(head)) continue;
          if (!GENERATED_HEADER_RE.test(head)) {
            issues.push({ file, message: `생성물(${name})의 GENERATED 헤더 훼손/부재` });
          }
        }
      }
    } catch (error) {
      issues.push({
        file: manifestPath || path.join(projectRoot, 'artifact-manifest.yaml'),
        message: `${error.code || 'WF-ARTIFACT-PATH'}: ${error.message}`,
      });
    }
  }
  return issues;
}

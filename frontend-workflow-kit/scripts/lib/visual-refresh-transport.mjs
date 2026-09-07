// Audit transport only. These helpers never evaluate or create visual authority.
export function visualAuditFromReadiness(data) {
  const auth = data?.intent_authorization;
  if (auth?.intent !== 'visual-refresh') return null;
  const audit = data.visual_refresh_audit || {};
  const snapshot = auth.snapshot || {};
  const decision = data.path_authorization || null;
  return {
    intent: auth.intent,
    selected_screen: audit.selected_screen ?? null,
    authority_applicable: auth.applicable === true,
    input_id: auth.input_id ?? audit.input_id ?? null,
    authorized_path: auth.authorized_path ?? audit.authorized_path ?? null,
    checked_path: decision?.checked_path ?? audit.checked_path ?? auth.checked_path ?? null,
    path_allowed: decision?.allowed === true,
    path_reason: decision?.reason ?? null,
    path_grant: decision?.grant ?? null,
    path_authorization: decision,
    source_tree: audit.source_tree ?? snapshot.source_tree ?? null,
    destination_tree: audit.destination_tree ?? snapshot.destination_tree ?? null,
    diff_kind: audit.diff_kind ?? snapshot.diff_kind ?? null,
    reasons: Array.isArray(auth.reasons) ? auth.reasons : [],
  };
}

// Check the copied decision, never infer it from intent applicability or broad paths.
// Wrong concrete paths are normal denied results, not malformed evaluator output.
export function visualPreworkIssues(audit, { screen, input, checkedPath }) {
  if (!audit) return ['visual-refresh audit is unavailable'];
  const issues = [];
  if (audit.intent !== 'visual-refresh') issues.push('visual intent mismatch');
  if (audit.selected_screen !== screen) issues.push('selected screen does not match --screen');
  if (audit.input_id !== input) issues.push('selected input does not match --input');
  if (audit.authorized_path !== checkedPath) issues.push('authorized path does not match --path');
  if (audit.checked_path !== checkedPath) issues.push('checked path does not match --path');
  if (audit.authority_applicable !== true) issues.push('visual-refresh authority is not applicable');
  if (audit.path_allowed !== true || audit.path_authorization?.allowed !== true ||
      audit.path_authorization?.checked_path !== checkedPath) {
    issues.push(audit.path_reason || 'concrete visual path authorization is not allowed');
  }
  return issues;
}

export function injectVisualAuditFrontmatter(markdown, audit) {
  if (!audit) return markdown;
  const q = (value) => JSON.stringify(value == null ? '' : String(value));
  const lines = [
    `visual_intent: ${q(audit.intent)}`,
    `visual_selected_screen: ${q(audit.selected_screen)}`,
    `visual_authority_applicable: ${audit.authority_applicable === true}`,
    `visual_input_id: ${q(audit.input_id)}`,
    `visual_authorized_path: ${q(audit.authorized_path)}`,
    `visual_checked_path: ${q(audit.checked_path)}`,
    `visual_path_allowed: ${audit.path_allowed === true}`,
    `visual_path_reason: ${q(audit.path_reason)}`,
    `visual_path_grant: ${q(audit.path_grant)}`,
    `visual_source_tree: ${q(audit.source_tree)}`,
    `visual_destination_tree: ${q(audit.destination_tree)}`,
    `visual_diff_kind: ${q(audit.diff_kind)}`,
  ];
  return markdown.replace(/^---\n/, `---\n${lines.join('\n')}\n`);
}

export function appendVisualPreworkStatus(markdown, audit, issues = []) {
  if (!audit) return markdown;
  const lines = [
    '## Visual Pre-work (current readiness decision; audit-only)',
    '```json',
    JSON.stringify(audit, null, 2),
    '```',
    ...(issues.length ? ['Pre-work stop reasons:', ...issues.map((issue) => `- ${issue}`)] : []),
    'This copied decision is not a reusable grant. Post-work authority is independently evaluated from the selected snapshot.',
  ];
  return markdown.replace('\n## Artifacts\n', `\n${lines.join('\n')}\n\n## Artifacts\n`);
}

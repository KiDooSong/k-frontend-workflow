import { stripProjectPrefix } from './visual-refresh-git.mjs';

export function visualPathIdentity(repositoryPath, projectPrefix = '') {
  const projectPath = stripProjectPrefix(repositoryPath, projectPrefix);
  return {
    repository_path: repositoryPath,
    project_path: projectPath,
    outside_selected_root: projectPath == null,
  };
}

// Lossless audit of the one resolved Git record set. `path`/oldPath/newPath remain
// convenient display paths; explicit identities and repository_record remove any
// ambiguity between project-relative and repository-relative paths.
export function visualChangedRecords(records, projectPrefix = '') {
  return (records || []).map((record) => {
    if (record.status === 'R' || record.status === 'C') {
      const oldIdentity = visualPathIdentity(record.oldPath, projectPrefix);
      const newIdentity = visualPathIdentity(record.newPath, projectPrefix);
      return {
        ...record,
        oldPath: oldIdentity.project_path ?? oldIdentity.repository_path,
        newPath: newIdentity.project_path ?? newIdentity.repository_path,
        old_path_identity: oldIdentity,
        new_path_identity: newIdentity,
        outside_selected_root: oldIdentity.outside_selected_root || newIdentity.outside_selected_root,
        repository_record: { ...record },
      };
    }
    const identity = visualPathIdentity(record.path, projectPrefix);
    return {
      ...record,
      path: identity.project_path ?? identity.repository_path,
      ...identity,
      repository_record: { ...record },
    };
  });
}

export function displayVisualChangedRecord(record) {
  if (record.status === 'R' || record.status === 'C') {
    return { ...record, old_path: record.oldPath, new_path: record.newPath };
  }
  return { ...record };
}

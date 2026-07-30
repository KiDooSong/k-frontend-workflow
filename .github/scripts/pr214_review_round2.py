from pathlib import Path
import re

ROOT = Path.cwd()


def read(rel):
    return (ROOT / rel).read_text(encoding='utf-8')


def write(rel, content):
    (ROOT / rel).write_text(content, encoding='utf-8')


def replace_once(rel, old, new):
    text = read(rel)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{rel}: expected one replacement target, found {count}')
    write(rel, text.replace(old, new, 1))


def regex_once(rel, pattern, replacement, flags=re.S):
    text = read(rel)
    updated, count = re.subn(pattern, lambda _: replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f'{rel}: expected one regex replacement target, found {count}')
    write(rel, updated)


# 1) Packed executor contracts: make concrete path_authorization the final authority and
# split hook/API-client/null/invalid ownership semantics instead of re-imposing integration.
replace_once(
    'frontend-workflow-kit/skills/implement-screen/SKILL.md',
    """    `path_authorization.allowed`가 `true`가 아니면 수정하지 않는다. active v2 claim은 소유 화면이
    `api-integrated-ui` 이상이어야 하며, integrated v2 hook/API-client의 unowned 경로는 production-ready에서도 금지한다.
""",
    """    concrete `path_authorization.allowed:true`가 최종 권한이다. v2 candidate는 다음을 그대로 따른다.
    - **valid active hook claim**: owning screen이 `rough-fixture-ui` 또는 `final-fixture-ui` 이상이고 effective
      envelope가 허용하면 편집할 수 있다.
    - **active API-client / `surface_kind:null`**: owning screen이 `api-integrated-ui` 이상이어야 한다.
    - **invalid contract / deferred / conflict / non-owner / `api_required:false`**: 항상 거부한다.
    integrated v2 hook/API-client의 unowned 경로는 `production-ready`에서도 금지한다.
""",
)

replace_once(
    'frontend-workflow-kit/docs/reference/workflow-stages/06-implement-screen-or-code.md',
    """- Before editing each concrete path, run
  `npm run workflow:readiness -- --screen <SCREEN_ID> --path <project-relative-path> --json`
  and require `path_authorization.allowed: true`. This shared file-level helper keeps the
  forward check aligned with `workflow:forbidden-paths`: explicit active candidate paths require
  their API-integrated owner, and integrated v2 hook/API-client surfaces reject unowned paths
  even at `production-ready`.
""",
    """- Before editing each concrete path, run
  `npm run workflow:readiness -- --screen <SCREEN_ID> --path <project-relative-path> --json`
  and require `path_authorization.allowed: true`; that concrete result is the final authority.
  The shared helper keeps the forward check aligned with `workflow:forbidden-paths`:
  - **valid active hook claim** — editable by its owning screen at `rough-fixture-ui` /
    `final-fixture-ui` when the effective envelope allows the path;
  - **active API-client / `surface_kind:null`** — requires its owning screen at
    `api-integrated-ui` or above;
  - **invalid contract / deferred / conflict / non-owner / `api_required:false`** — always denied.
  Integrated v2 hook/API-client surfaces reject unowned paths even at `production-ready`.
""",
)

replace_once(
    'frontend-workflow-kit/COMMANDS.md',
    'violations. A **valid** confirmed active hook Slice Path may pass for its owning screen\n',
    'violations. A **valid active hook** Slice Path may pass for its owning screen\n',
)

# 2) Forward authorization: distinguish true below-rough state from a base-envelope denial,
# including explicit shared-surface delegation. Expose the same remediation to backstop callers.
replace_once(
    'frontend-workflow-kit/scripts/lib/path-backstop.mjs',
    """function reachesApiIntegration(entry, modeOrder) {
  const order = modeOrder || [];
  const threshold = order.indexOf('api-integrated-ui');
  const actual = order.indexOf(entry?.readiness_mode);
  return threshold >= 0 && actual >= threshold;
}
""",
    """function reachesMode(entry, modeOrder, targetMode) {
  const order = modeOrder || [];
  const threshold = order.indexOf(targetMode);
  const actual = order.indexOf(entry?.readiness_mode);
  return threshold >= 0 && actual >= threshold;
}

function reachesApiIntegration(entry, modeOrder) {
  return reachesMode(entry, modeOrder, 'api-integrated-ui');
}

function reachesRoughFixture(entry, modeOrder) {
  return reachesMode(entry, modeOrder, 'rough-fixture-ui');
}

function delegatedSharedSurfaceForFile(entry, file) {
  return (entry?.delegated_shared_surfaces || [])
    .filter((surface) =>
      (surface.implementation_paths || []).some((implementationPath) =>
        globMatches(implementationPath, file),
      ),
    )
    .sort((a, b) => String(a.surface_id).localeCompare(String(b.surface_id)))[0] || null;
}

function basePathDenial(entry, file, base) {
  const delegated = delegatedSharedSurfaceForFile(entry, file);
  if (delegated) {
    return {
      kind: 'delegated-shared-surface',
      reason:
        `path is delegated to shared surface ${delegated.surface_id}; ` +
        `screen-scoped editing is forbidden`,
      would_clear:
        `run workflow:readiness -- --surface ${delegated.surface_id} --json and use ` +
        `implement-shared-surface`,
    };
  }
  if (base.forbidden_by.length > 0) {
    return {
      kind: 'forbidden',
      reason: 'matching forbidden_paths takes precedence',
      would_clear:
        'use the owning workflow or change the approved effective readiness envelope; ' +
        'never bypass forbidden_paths',
    };
  }
  return {
    kind: 'outside-allowed',
    reason: 'path is outside allowed_paths',
    would_clear:
      'raise the owning readiness context or change the approved policy until the path is ' +
      'inside effective allowed_paths',
  };
}
""",
)

replace_once(
    'frontend-workflow-kit/scripts/lib/path-backstop.mjs',
    """  const baseDenialReason =
    base.forbidden_by.length > 0
      ? 'matching forbidden_paths takes precedence'
      : 'path is outside allowed_paths';
""",
    """  const baseDenial = basePathDenial(entry, normalizedFile, base);
""",
)

regex_once(
    'frontend-workflow-kit/scripts/lib/path-backstop.mjs',
    r"  const activeMatches = claimsMatching\(claims\.active, normalizedFile\);\n.*?\n  if \(!base\.allowed\) \{",
    """  const activeMatches = claimsMatching(claims.active, normalizedFile);
  const integrated = reachesApiIntegration(entry, modeOrder);
  const roughReady = reachesRoughFixture(entry, modeOrder);
  if (activeMatches.length > 0) {
    const owned = activeMatches.filter((claim) => claim.screen_id === screenId);
    const authorization = entry.api_candidate_authorization;
    const contractValid =
      authorization?.contract_version === 2 && authorization.valid === true;
    const hookOnly =
      owned.length > 0 && owned.every((claim) => claim.surface_kind === 'hook');
    // Fixture-mode hook seam (#211): a valid owning hook claim opens only after the
    // owning screen actually reaches rough-fixture-ui, and only while the effective
    // base envelope permits the concrete path.
    const ownedFixtureHook = contractValid && hookOnly && roughReady;
    const allowed =
      base.allowed &&
      entry.api_required !== false &&
      contractValid &&
      owned.length > 0 &&
      (integrated || ownedFixtureHook);
    const ownerIds = [
      ...new Set(activeMatches.map((claim) => claim.screen_id).filter(Boolean)),
    ];
    const ownerLabel = ownerIds.length > 0 ? ownerIds.join(', ') : '(unknown)';
    let reason;
    let wouldClear;
    if (allowed) {
      reason = integrated
        ? 'explicit active candidate claim owned by an API-integrated screen'
        : 'explicit active hook claim owned by this screen within its fixture-mode allowed paths';
    } else if (owned.length === 0) {
      reason =
        `explicit active candidate claim requires its owning screen; it is owned by another ` +
        `screen (${ownerLabel}), so use the owning screen`;
      wouldClear = `switch to the owning screen context: ${ownerLabel}`;
    } else if (!contractValid) {
      reason = 'API Candidates v2 contract is invalid; fix the reported contract issues';
      wouldClear = 'fix the reported API Candidates v2 contract issues';
    } else if (entry.api_required === false) {
      reason = 'screen declares api_required:false and cannot authorize explicit API candidate claims';
      wouldClear =
        'remove the contradictory active claim or record a human-approved API requirement decision';
    } else if (hookOnly && !roughReady) {
      reason =
        'explicit active hook claim requires its owning screen at rough-fixture-ui or above ' +
        'within effective allowed_paths';
      wouldClear = 'raise the owning screen to rough-fixture-ui or above';
    } else if (!base.allowed) {
      reason = baseDenial.reason;
      wouldClear = baseDenial.would_clear;
      if (!hookOnly && !integrated) {
        reason +=
          '; active API-client or unclassified claims also require the owning screen at ' +
          'api-integrated-ui or above';
        wouldClear += '; then reach api-integrated-ui or above';
      }
    } else if (!integrated) {
      reason =
        'explicit active API-client or unclassified candidate claim requires its owning screen ' +
        'at api-integrated-ui or above';
      wouldClear = 'raise the owning screen to api-integrated-ui or above';
    } else {
      reason = baseDenial.reason;
      wouldClear = baseDenial.would_clear;
    }
    return {
      ...base,
      allowed,
      file: normalizedFile,
      screen_id: screenId,
      reason,
      ...(wouldClear ? { would_clear: wouldClear } : {}),
      candidate_matches: activeMatches,
    };
  }

  if (!base.allowed) {""",
)

replace_once(
    'frontend-workflow-kit/scripts/lib/path-backstop.mjs',
    """      reason: baseDenialReason,
      candidate_matches: [],
""",
    """      reason: baseDenial.reason,
      ...(baseDenial.would_clear ? { would_clear: baseDenial.would_clear } : {}),
      candidate_matches: [],
""",
)

# 3) Diff backstop: preserve the owning screen's actual forward denial/remediation instead of
# re-deriving a threshold solely from surface_kind.
replace_once(
    'frontend-workflow-kit/scripts/forbidden-paths.mjs',
    """function screenAuthorizesApiFile(file, screenId, entry, order, claims) {
  return readinessPathAuthorization({
    file,
    screenId,
    entry,
    modeOrder: order,
    claims,
  }).allowed;
}

function anyScreenAuthorizesApiFile(file, readinessOutput, order, claims) {
  return Object.entries(readinessOutput || {}).some(([screenId, entry]) =>
    screenAuthorizesApiFile(file, screenId, entry, order, claims),
  );
}
""",
    """function screenApiFileAuthorization(file, screenId, entry, order, claims) {
  return {
    screen_id: screenId,
    authorization: readinessPathAuthorization({
      file,
      screenId,
      entry,
      modeOrder: order,
      claims,
    }),
  };
}

function apiFileAuthorizationResults(file, readinessOutput, order, claims) {
  return Object.entries(readinessOutput || {})
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .map(([screenId, entry]) =>
      screenApiFileAuthorization(file, screenId, entry, order, claims),
    );
}

function anyScreenAuthorizesApiFile(file, readinessOutput, order, claims) {
  return apiFileAuthorizationResults(file, readinessOutput, order, claims).some(
    (result) => result.authorization.allowed,
  );
}
""",
)

replace_once(
    'frontend-workflow-kit/scripts/forbidden-paths.mjs',
    'resolve tracking and change the candidate to an explicit confirmed active slice before editing',
    'resolve tracking and change the candidate to a valid active slice before editing; API integration still requires confirmed actionable confidence',
)

regex_once(
    'frontend-workflow-kit/scripts/forbidden-paths.mjs',
    r"function describeUnownedCandidateViolation\(file, matches, readinessOutput = \{\}\) \{.*?\n\}\n\n// 위반 1건",
    """function describeUnownedCandidateViolation(file) {
  return {
    reason:
      `API-related path '${file}' is not authorized by any screen's effective ` +
      `allowed_paths/forbidden_paths candidate model`,
    would_clear:
      `declare one valid active Slice Path on its owning screen; hook slices may clear at ` +
      `rough-fixture-ui, while API integration still requires confirmed actionable confidence`,
  };
}

function describeActiveCandidateViolation(file, matches, authorizationResults) {
  const ownerIds = [
    ...new Set(matches.map((claim) => claim.screen_id).filter(Boolean)),
  ].sort((a, b) => String(a).localeCompare(String(b)));
  const ownerResults = authorizationResults.filter((result) =>
    ownerIds.includes(result.screen_id),
  );
  const deniedOwner = ownerResults.find((result) => !result.authorization.allowed);
  if (deniedOwner) {
    return {
      reason: deniedOwner.authorization.reason,
      would_clear:
        deniedOwner.authorization.would_clear ||
        `use the owning screen context ${deniedOwner.screen_id} and satisfy its effective paths`,
    };
  }
  return describeUnownedCandidateViolation(file);
}

// 위반 1건""",
)

replace_once(
    'frontend-workflow-kit/scripts/forbidden-paths.mjs',
    """      if (activeClaims.length > 0) {
        if (anyScreenAuthorizesApiFile(F, readinessOutput, order, claims)) continue;
        seenFiles.add(F);
        const { reason, would_clear } = describeUnownedCandidateViolation(F, activeClaims, readinessOutput);
        violations.push({
""",
    """      if (activeClaims.length > 0) {
        const authorizationResults = apiFileAuthorizationResults(
          F,
          readinessOutput,
          order,
          claims,
        );
        if (authorizationResults.some((result) => result.authorization.allowed)) continue;
        seenFiles.add(F);
        const { reason, would_clear } = describeActiveCandidateViolation(
          F,
          activeClaims,
          authorizationResults,
        );
        violations.push({
""",
)

for old in [
    'describeUnownedCandidateViolation(F, [], readinessOutput)',
    'describeUnownedCandidateViolation(F, [])',
]:
    text = read('frontend-workflow-kit/scripts/forbidden-paths.mjs')
    if old in text:
        write(
            'frontend-workflow-kit/scripts/forbidden-paths.mjs',
            text.replace(old, 'describeUnownedCandidateViolation(F)'),
        )

# 4) Regression coverage: shared-surface reservation at final fixture mode must not be
# misdiagnosed as below-rough; backstop must reuse the exact forward result.
replace_once(
    'frontend-workflow-kit/scripts/lib/fixture-hook-mode-ladder.test.mjs',
    """function readinessOf(screens, { ci = {}, selectedLayout = layout, selectedPolicy = policy } = {}) {
  return computeReadiness({
    state: { global: GLOBAL, screens },
""",
    """function readinessOf(
  screens,
  { ci = {}, selectedLayout = layout, selectedPolicy = policy, surfaces } = {},
) {
  return computeReadiness({
    state: { global: GLOBAL, screens, ...(surfaces ? { surfaces } : {}) },
""",
)

marker = '// --- 사다리 순서·warning-first 의미 불변 ----------------------------------------------\n'
new_test = r"""
test('delegated shared hook reservation preserves forward/backstop surface remediation', (t) => {
  const derived = derivedFor(v2ActiveSpec({ stateMatrix: false }));
  derived.fake_hook_exists = true;
  derived.figma_mapping_status = 'draft';
  derived.state_matrix_complete = false;
  const screens = {
    'CREATE-ATTACH': screenEntry({ status: 'confirmed', derived }),
  };
  const surfaceId = 'CREATE-ATTACHMENTS-HOOK';
  const surfaces = {
    [surfaceId]: {
      status: 'confirmed',
      domain: 'create',
      stub: false,
      member_screens: ['CREATE-ATTACH'],
      implementation_paths: [HOOK_SLICE],
      source: {
        path: 'domains/create/surfaces/create-attachments-hook/surface-spec.md',
      },
      derived: {
        api_required: false,
        state_matrix_complete: false,
        interaction_matrix_complete: true,
        blocking_decisions: [],
        malformed_decisions: [],
        lifecycle_errors: [],
        decision_refs: [],
        contract_errors: [],
        identity_errors: [],
        membership_errors: [],
        path_errors: [],
        decision_fanout_errors: [],
      },
    },
  };

  const readiness = readinessOf(screens, { surfaces });
  const entry = readiness['CREATE-ATTACH'];
  assert.equal(entry.readiness_mode, 'final-fixture-ui');
  assert.equal(entry.delegated_shared_surfaces[0].surface_id, surfaceId);
  assert.ok(entry.forbidden_paths.includes(HOOK_SLICE));

  const forward = authorize(readiness, 'CREATE-ATTACH', HOOK_SLICE);
  assert.equal(forward.allowed, false);
  assert.match(forward.reason, /delegated to shared surface CREATE-ATTACHMENTS-HOOK/);
  assert.doesNotMatch(forward.reason, /rough-fixture-ui/);
  assert.match(forward.would_clear, /workflow:readiness -- --surface CREATE-ATTACHMENTS-HOOK/);
  assert.match(forward.would_clear, /implement-shared-surface/);

  const surfaceReadiness = computeReadiness({
    state: { global: GLOBAL, screens, surfaces },
    policy,
    ci: {},
    manifest: {},
    layout,
    surfaceOnlyId: surfaceId,
  })[surfaceId];
  assert.equal(surfaceReadiness.readiness_mode, 'final-fixture-ui');
  assert.ok(surfaceReadiness.allowed_paths.includes(HOOK_SLICE));
  assert.equal(
    surfaceReadiness.path_authorization.find((row) => row.path === HOOK_SLICE).allowed,
    true,
  );

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-hook-shared-delegation-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docs = path.join(root, 'docs', 'frontend-workflow');
  fs.mkdirSync(path.join(docs, '_meta'), { recursive: true });
  fs.writeFileSync(
    path.join(docs, '_meta', 'workflow-state.yaml'),
    yamlStringify({
      generated_at: '2026-07-30',
      global: GLOBAL,
      screens,
      surfaces,
    }),
    'utf8',
  );
  const diffPath = path.join(root, 'changes.diff');
  fs.writeFileSync(diffPath, `M\t${HOOK_SLICE}\n`, 'utf8');
  const backstop = spawnSync(
    process.execPath,
    [FORBIDDEN_CLI, '--docs', docs, '--diff', diffPath, '--enforce', '--json'],
    { cwd: root, encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS },
  );
  assert.equal(backstop.status, 1, backstop.stderr);
  const violation = JSON.parse(backstop.stdout).violations[0];
  assert.equal(violation.reason, forward.reason);
  assert.equal(violation.would_clear, forward.would_clear);
});

"""
replace_once(
    'frontend-workflow-kit/scripts/lib/fixture-hook-mode-ladder.test.mjs',
    marker,
    new_test + marker,
)

# 5) Packed payload regression locks the executor and canonical Stage 06 wording.
replace_once(
    'frontend-workflow-kit/scripts/lib/distribution.test.mjs',
    """  assert.match(packedImplementScreen, /blocking.*보다 먼저/);
""",
    """  assert.match(packedImplementScreen, /blocking.*보다 먼저/);

  const packedStage06 = fs.readFileSync(
    path.join(out, 'docs', 'reference', 'workflow-stages', '06-implement-screen-or-code.md'),
    'utf8',
  );
  for (const [label, content] of [
    ['implement-screen skill', packedImplementScreen],
    ['Stage 06', packedStage06],
  ]) {
    assert.match(content, /valid active hook claim/i, `${label}: hook seam contract`);
    assert.match(
      content,
      /rough-fixture-ui[\\s\\S]{0,160}final-fixture-ui/i,
      `${label}: rough/final hook modes`,
    );
    assert.match(
      content,
      /active API-client[\\s\\S]{0,160}surface_kind:null[\\s\\S]{0,160}api-integrated-ui/i,
      `${label}: API-client/null integration gate`,
    );
    assert.match(
      content,
      /invalid contract[\\s\\S]{0,180}deferred[\\s\\S]{0,180}conflict[\\s\\S]{0,180}non-owner[\\s\\S]{0,180}api_required:false/i,
      `${label}: always-denied cases`,
    );
    assert.match(
      content,
      /path_authorization\\.allowed:\\s*true/i,
      `${label}: concrete authorization is final`,
    );
    assert.doesNotMatch(
      content,
      /active v2 claim[\\s\\S]{0,180}api-integrated-ui 이상이어야/i,
      `${label}: stale all-active integration invariant`,
    );
    assert.doesNotMatch(
      content,
      /explicit active candidate paths require[\\s\\S]{0,100}API-integrated owner/i,
      `${label}: stale Stage 06 invariant`,
    );
  }

  const packedCommands = fs.readFileSync(path.join(out, 'COMMANDS.md'), 'utf8');
  assert.match(packedCommands, /valid active hook/i);
  assert.doesNotMatch(packedCommands, /confirmed active hook/i);
""",
)

# 6) Design/changelog truth follows the runtime and packed executor contract.
replace_once(
    'kit-dev/docs/design/drafts/fixture-hook-mode-ladder.md',
    """        ∧ ( owner 가 api-integrated-ui 이상
          ∨ owned claim 전부 surface_kind === 'hook'  # fixture seam (#211)
          )
""",
    """        ∧ ( owner 가 api-integrated-ui 이상
          ∨ (owner 가 rough-fixture-ui 이상
             ∧ owned claim 전부 surface_kind === 'hook')  # fixture seam (#211)
          )
""",
)

replace_once(
    'kit-dev/docs/design/drafts/fixture-hook-mode-ladder.md',
    """surface_kind 는 readiness 가 provenance 에 한 번 계산해 싣고, 두 소비자는 재판정하지
않는다. 거부 진단도 같은 판정 결과를 따라 non-owner(owning screen 컨텍스트), invalid
contract(계약 issue 수정), owned hook(rough-fixture-ui), API-client/null(api-integrated-ui)로
분리한다. Work Packet / Run Report 는 effective allowed/forbidden paths 와
""",
    """surface_kind 는 readiness 가 provenance 에 한 번 계산해 싣고, 두 소비자는 재판정하지
않는다. 거부 진단도 같은 판정 결과를 따라 non-owner(owning screen 컨텍스트), invalid
contract(계약 issue 수정), 실제 rough 미도달 hook(rough-fixture-ui), API-client/null
(api-integrated-ui), base envelope 거부로 분리한다. 특히 delegated shared surface는 surface
readiness와 implement-shared-surface로 라우팅하고, diff backstop은 owner에 대해 얻은 forward
authorization의 reason/would_clear를 그대로 사용한다. Work Packet / Run Report 는 effective allowed/forbidden paths 와
""",
)

replace_once(
    'kit-dev/CHANGELOG.md',
    """- consumer `COMMANDS.md`·API candidate reference·upgrade notes를 새 seam에 맞췄고,
  업그레이드 후 readiness 및 Work Packet/Run Report 재생성 절차를 명시했다.
""",
    """- consumer `COMMANDS.md`·API candidate reference·upgrade notes를 새 seam에 맞췄고,
  업그레이드 후 readiness 및 Work Packet/Run Report 재생성 절차를 명시했다.
- packed `implement-screen` skill과 canonical Stage 06도 valid active hook의 rough/final seam,
  API-client/null integration gate, concrete `path_authorization.allowed:true` 최종 권한으로 정렬했다.
  fixture hook seam은 `confirmed` confidence를 별도 요구하지 않으며 confirmed actionable
  confidence는 API-integrated 승격 게이트에 남는다.
- 이미 fixture mode인 owned hook이 shared-surface reservation/custom forbidden으로 base 거부될
  때 rough 승격으로 오진하지 않는다. delegated surface는 surface readiness/skill로 라우팅하고,
  diff backstop은 owner의 forward reason/would_clear를 재사용한다.
""",
)

expected = {
    'frontend-workflow-kit/COMMANDS.md',
    'frontend-workflow-kit/docs/reference/workflow-stages/06-implement-screen-or-code.md',
    'frontend-workflow-kit/skills/implement-screen/SKILL.md',
    'frontend-workflow-kit/scripts/lib/path-backstop.mjs',
    'frontend-workflow-kit/scripts/forbidden-paths.mjs',
    'frontend-workflow-kit/scripts/lib/fixture-hook-mode-ladder.test.mjs',
    'frontend-workflow-kit/scripts/lib/distribution.test.mjs',
    'kit-dev/docs/design/drafts/fixture-hook-mode-ladder.md',
    'kit-dev/CHANGELOG.md',
}
print('\n'.join(sorted(expected)))

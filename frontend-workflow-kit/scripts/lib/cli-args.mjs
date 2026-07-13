// cli-args.mjs — CLI 인자 계약 검증 (additive helper — validate.mjs PR #175 allowlist 의 공유화).
//
// parseArgs(util.mjs) 는 파서일 뿐 아무것도 거부하지 않는다: 모든 --foo 가 flags 에 실리고,
// bare value flag 는 boolean true 가 되며, boolean flag 뒤의 non-`--` 토큰은 값으로 흡수된다.
// 그대로 두면 오타(--jsno·--outt·--screeen·--polciy)가 "다른 실행"으로 조용히 진행되는
// fail-open 이 된다 — 프로젝트 원칙은 usage/입력 오류 exit 2 다(readiness-eval 선례).
//
// 이 helper 는 parseArgs semantics/반환값을 바꾸지 않는다. 선택적으로 raw argv 를 함께 받아
// 각 occurrence 의 문법을 먼저 검증한 뒤, parseArgs 의 최종 결과(flags/positionals)를 CLI 별
// allowlist 로 다시 검증한다. raw 검증은 flags 를 만들지 않는 validator 이며 정상 scalar duplicate 의
// last-wins 결과는 parseArgs 가 그대로 소유한다:
//   - unknown option                          → exit 2
//   - value flag 가 bare/빈 값(--flag= 또는 --flag '') → exit 2
//   - boolean flag 에 =value / 뒤따르는 값    → exit 2
//   - positional argument                     → exit 2
// 스칼라 중복(last-wins)·repeatable flag 정책은 바꾸지 않되, 앞선 invalid occurrence 가 뒤의
// 정상 duplicate 로 덮여 사라지는 것은 허용하지 않는다.
// 메시지·exit 2 계약은 validate.mjs 의 inline allowlist 와 동형이다(후속 migration 대비).
export function enforceCliFlagContract({ argv, flags, positionals, valueFlags, booleanFlags, tool, helpCommand }) {
  const usageError = (message) => {
    process.stderr.write(`${tool}: ${message}\n`);
    if (helpCommand) process.stderr.write(`Try \`${helpCommand} --help\`.\n`);
    process.exit(2);
  };

  // parseArgs 는 같은 이름의 마지막 값만 보존한다. raw argv 를 주는 CLI 는 occurrence 를 순서대로
  // 검사해 `--out= --out valid`, `--docs '' --docs valid`, `--json=false --json` 같은
  // 앞선 문법 오류도 fail-closed 로 잡는다.
  // 값 소비 규칙은 parseArgs 와 동일하다: 다음 token 이 `--` 로 시작하지 않으면 value 로 소비한다.
  if (Array.isArray(argv)) {
    for (let i = 0; i < argv.length; i++) {
      const token = argv[i];
      if (!token.startsWith('--')) {
        usageError(`positional arguments are not supported: ${token}`);
      }
      const eq = token.indexOf('=');
      const name = token.slice(2, eq === -1 ? undefined : eq);
      if (!valueFlags.has(name) && !booleanFlags.has(name)) usageError(`unknown option --${name}`);

      if (eq !== -1) {
        if (valueFlags.has(name) && token.slice(eq + 1) === '') usageError(`--${name} requires a value`);
        if (booleanFlags.has(name)) usageError(`--${name} does not accept a value`);
        continue;
      }

      const next = argv[i + 1];
      if (valueFlags.has(name)) {
        if (next === undefined || next === '' || next.startsWith('--')) {
          usageError(`--${name} requires a value`);
        }
        i++;
      } else if (next !== undefined && !next.startsWith('--')) {
        usageError(`--${name} does not accept a value`);
      }
    }
  }

  for (const name of Object.keys(flags)) {
    if (!valueFlags.has(name) && !booleanFlags.has(name)) usageError(`unknown option --${name}`);
    // bare(--flag → boolean true)와 빈 값(--flag= → '')을 함께 거부한다 — 빈 값이 기본값
    // fallback(--out= 이 기본 _meta 로, --ci= 가 "CI 미제공"으로)으로 조용히 진행되지 않게.
    if (valueFlags.has(name) && (typeof flags[name] !== 'string' || flags[name] === '')) {
      usageError(`--${name} requires a value`);
    }
    if (booleanFlags.has(name) && flags[name] !== true) usageError(`--${name} does not accept a value`);
  }
  if (positionals.length > 0) usageError(`positional arguments are not supported: ${positionals.join(' ')}`);
  // CLI 고유 usage 오류(예: readiness 의 빈 --screen 값)가 같은 형식/exit 2 경로를 재사용하게 돌려준다.
  return usageError;
}

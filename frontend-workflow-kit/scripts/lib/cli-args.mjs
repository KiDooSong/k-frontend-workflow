// cli-args.mjs — CLI 인자 계약 검증 (additive helper — validate.mjs PR #175 allowlist 의 공유화).
//
// parseArgs(util.mjs) 는 파서일 뿐 아무것도 거부하지 않는다: 모든 --foo 가 flags 에 실리고,
// bare value flag 는 boolean true 가 되며, boolean flag 뒤의 non-`--` 토큰은 값으로 흡수된다.
// 그대로 두면 오타(--jsno·--outt·--screeen·--polciy)가 "다른 실행"으로 조용히 진행되는
// fail-open 이 된다 — 프로젝트 원칙은 usage/입력 오류 exit 2 다(readiness-eval 선례).
//
// 이 helper 는 파서 semantics 를 재구현하지 않고 parseArgs 의 *결과*(flags/positionals)를
// CLI 별 allowlist 로 검증만 한다:
//   - unknown option                          → exit 2
//   - value flag 가 bare(값 없음)             → exit 2
//   - boolean flag 에 =value / 뒤따르는 값    → exit 2
//   - positional argument                     → exit 2
// 스칼라 중복(last-wins)·repeatable flag 정책은 다루지 않는다(기존 동작 유지 — 범위 밖).
// 메시지·exit 2 계약은 validate.mjs 의 inline allowlist 와 동형이다(후속 migration 대비).
export function enforceCliFlagContract({ flags, positionals, valueFlags, booleanFlags, tool, helpCommand }) {
  const usageError = (message) => {
    process.stderr.write(`${tool}: ${message}\n`);
    if (helpCommand) process.stderr.write(`Try \`${helpCommand} --help\`.\n`);
    process.exit(2);
  };
  for (const name of Object.keys(flags)) {
    if (!valueFlags.has(name) && !booleanFlags.has(name)) usageError(`unknown option --${name}`);
    if (valueFlags.has(name) && typeof flags[name] !== 'string') usageError(`--${name} requires a value`);
    if (booleanFlags.has(name) && flags[name] !== true) usageError(`--${name} does not accept a value`);
  }
  if (positionals.length > 0) usageError(`positional arguments are not supported: ${positionals.join(' ')}`);
  // CLI 고유 usage 오류(예: readiness 의 빈 --screen 값)가 같은 형식/exit 2 경로를 재사용하게 돌려준다.
  return usageError;
}

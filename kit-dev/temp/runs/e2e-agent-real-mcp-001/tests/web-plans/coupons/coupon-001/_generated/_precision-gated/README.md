# _precision-gated — recommended adopted set (assertion hygiene applied)

- Coverage source: [`plan.agent.md`](../../plan.agent.md) (4 suites / 17 tests).
- Codegen base: [`_generated/from-agent-plan/direct-gen/`](../from-agent-plan/direct-gen/)
  (compact, data-driven; ran 17/17).

Two clean-ups applied — the "precision gate" this dogfood argues for:

1. **Removed browser-artifact assertions.** Every `toBeFocused()` / `not.toBeFocused()`
   was dropped. The Coupons app sets no "active" class; those lines asserted
   `document.activeElement` (focus), which is invariant right after `.click()` — they pass
   regardless of app logic (best case tautological, worst case flaky on headless/CI). Real
   coverage is unchanged: status text, button label (`Applied`), `.applied` class,
   visibility, and the accumulate / reset-on-back / status-clear behaviors are all still
   asserted. The "…makes it active again" scenario is renamed to state the real behavior
   (status updates, no applied state reverts).
2. **Normalized row scoping.** Rows use the container testid plus id —
   `[data-testid="coupon-item"][data-coupon-id="<ID>"]` — never `[data-coupon-id]` alone,
   because the app's View/Copy/Apply buttons also carry `data-coupon-id`, so the bare
   selector matches the row and its three buttons (strict-mode hazard).

Same 17 scenarios, still green, with no inert assertions. Adopt this set; the four raw
variants under `_generated/` are kept only as the comparison record.

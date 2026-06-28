# COUPON-001 Web E2E Plan Draft

> Plan-only dogfood output. This is optional evidence only. It is not approval, not a
> `confirmed` promotion, not readiness elevation, not CI/hard-gate wiring, and not
> an Open Decision or Unknown resolution.

## Identity

- Mode: `plan`
- Canonical screen_id: `COUPON-001`
- Domain: `coupons`
- Route: `/(tabs)/coupons`
- Consumer-shape plan path: `tests/web-plans/coupons/coupon-001.plan.md`
- Actual dogfood path: `kit-dev/temp/runs/e2e-agent-dogfood-001/tests/web-plans/coupons/coupon-001.plan.md`
- ScreenSpec: [screen-spec.md](../../../../../../../frontend-workflow-kit/examples/multi-screen-dry-run/docs/frontend-workflow/domains/coupons/screens/coupon-list/screen-spec.md)
- Supporting docs: [navigation-map.md](../../../../../../../frontend-workflow-kit/examples/multi-screen-dry-run/docs/frontend-workflow/app/navigation-map.md), [api-manifest.md](../../../../../../../frontend-workflow-kit/examples/multi-screen-dry-run/docs/frontend-workflow/api/api-manifest.md), [domain-rules.md](../../../../../../../frontend-workflow-kit/examples/multi-screen-dry-run/docs/frontend-workflow/domains/coupons/domain-rules.md), [flows.md](../../../../../../../frontend-workflow-kit/examples/multi-screen-dry-run/docs/frontend-workflow/domains/coupons/flows.md)
- Skill: [e2e-agent/SKILL.md](../../../../../../../frontend-workflow-kit/skills/e2e-agent/SKILL.md)
- Dogfood notes: [dogfood-notes.md](../../../dogfood-notes.md)

## Output Path Decision

The skill's default output shape is `tests/web-plans/{domain}/{screen-slug}.plan.md`,
but this repository is the kit repository, and `tests/web-plans/**` is described by
the skill as consumer-owned E2E surface. To avoid mistaking this dogfood artifact
for a consumer payload or live test plan, this run preserves the consumer shape
inside `kit-dev/temp/runs/e2e-agent-dogfood-001/`.

`screen-slug` follows the skill rule: lowercase the canonical `screen_id` and
replace non-alphanumeric characters with `-`. Therefore `COUPON-001` becomes
`coupon-001`, even though the ScreenSpec folder slug is `coupon-list`.

## Selected Screen

`COUPON-001` was kept as the target. It has enough State Matrix and Interaction
Matrix content for a plan-mode draft, while still exposing useful uncertainty:
two open decisions, one open Unknown, one TBD copy key, candidate API contracts,
and missing testID guidance. Other example screens either have broader unresolved
scope (`PROFILE-001`) or a less settled primary interaction (`NOTICE-001`).

## Shallow Smoke Scope

Shallow smoke should cover only stable behavior already present in the ScreenSpec:

1. Route smoke: load `/(tabs)/coupons` in an authenticated/private-route context and
   assert the coupon list screen shell renders with the confirmed title copy `쿠폰`.
2. Success-list smoke: with a small deterministic `GET /coupons` fixture containing
   at least one available coupon, assert a coupon list is visible and at least one
   coupon card is reachable as a button-like element.
3. Coupon-card navigation smoke: activate one coupon card and assert navigation
   targets `/coupons/[id]` with the fixture id. Do not assert detail content from
   `COUPON-002` because that screen is outside this plan.
4. Error retry smoke, if the fixture harness can force a `GET /coupons` error:
   assert an error state exposes a retry control and activating it triggers refetch
   or returns to loading/success after the fixture is flipped.

Not included in shallow smoke: exhaustive rendering of all six State Matrix states,
pagination, expired-coupon policy, detailed refreshing gestures, analytics delivery,
auth guard behavior, deep links, or visual parity.

## Exclusions

- `D-001`: expired coupon visibility policy (`show / hide / separate tab`) is open
  and must not be asserted.
- `D-003`: pagination style (`cursor / offset / none`) is open and must not be
  asserted.
- `U-001`: coupon API response examples are open; fixture fields should stay minimal
  and should not be treated as confirmed API shape.
- `coupon.list.empty`: copy is `TBD`; do not assert exact empty-state text.
- `/coupons/[id]` detail content belongs to `COUPON-002`; this plan may only assert
  navigation target from `COUPON-001`.
- API endpoint confidence is `candidate`; test fixtures may model it, but the plan
  must not promote it to confirmed contract evidence.

## Locator And testID Strategy

Current anchor quality is insufficient for robust generation.

- Available stable copy: `coupon.list.title` = `쿠폰` with status `confirmed`.
- Available accessibility contract: `CouponCard` has `accessibilityRole="button"`
  and `accessibilityLabel="{title}, {만료일}"`.
- Missing or underspecified anchors:
  - no declared web `data-testid` or cross-platform testID contract for the screen,
    coupon card, retry button, list container, skeleton, empty state, or refresh
    control;
  - no exact retry button label;
  - empty-state copy is `TBD`;
  - no fixture ids or fixture data source are declared.

Generator guidance: prefer role/name or visible text where confirmed, but do not
invent new selectors. If generation is later approved, request or reconcile testID
guidance before producing stable `tests/web/**` code.

## Context Packet Draft

```yaml
mode: plan
artifact_status: draft-evidence-only
screen:
  screen_id: COUPON-001
  domain: coupons
  route: "/(tabs)/coupons"
  screen_spec: "frontend-workflow-kit/examples/multi-screen-dry-run/docs/frontend-workflow/domains/coupons/screens/coupon-list/screen-spec.md"
  source_status: draft
output:
  consumer_shape: "tests/web-plans/coupons/coupon-001.plan.md"
  dogfood_path: "kit-dev/temp/runs/e2e-agent-dogfood-001/tests/web-plans/coupons/coupon-001.plan.md"
  note: "Do not create repo-root tests/web-plans or tests/web files during this run."
states:
  - state: loading
    condition: "query.isLoading"
    ui: "SkeletonList"
  - state: empty
    condition: "data.length === 0"
    ui: "EmptyState"
    caveat: "exact empty copy is TBD"
  - state: error
    condition: "query.isError"
    ui: "ErrorState + Retry"
    caveat: "retry label/testID not specified"
  - state: success
    condition: "data.length > 0"
    ui: "CouponList"
  - state: disabled
    condition: "major action precondition unmet or request pending"
    ui: "disabled control/state"
    caveat: "not part of shallow smoke"
  - state: refreshing
    condition: "query.isRefreshing"
    ui: "RefreshControl"
    caveat: "not part of shallow smoke unless gesture harness is explicit"
interactions:
  - action: "coupon click"
    trigger: "CouponCard press"
    result: "/coupons/[id]"
    analytics_event: "coupon_card_click"
    shallow_assertion: "route target only"
  - action: "pull to refresh"
    trigger: "pull to refresh"
    result: "refetch"
    shallow_assertion: "exclude unless web gesture/harness is explicit"
  - action: "retry"
    trigger: "ErrorState button"
    result: "refetch"
    shallow_assertion: "optional if error fixture can be toggled"
data:
  api_candidates:
    - "GET /coupons (candidate)"
    - "GET /coupons/{id} (candidate)"
  fixture_minimum:
    coupons:
      - id: "coupon-1"
        title: "샘플 쿠폰"
        expires_at: "future-date"
        status: "available"
copy:
  confirmed:
    coupon.list.title: "쿠폰"
  tbd:
    coupon.list.empty: "TBD"
a11y_and_locator_hints:
  coupon_card:
    role: "button"
    accessible_name_pattern: "{title}, {expires_at_or_expiry_copy}"
  gaps:
    - "No declared data-testid/testID contract."
    - "No exact retry label."
    - "No fixture source or seed URL."
exclude:
  open_decisions:
    - "D-001 expired coupon visibility policy"
    - "D-003 coupon list pagination policy"
  unknowns:
    - "U-001 coupon API response examples"
  behaviors:
    - "COUPON-002 detail assertions"
    - "analytics delivery"
    - "auth guard/deep-link behavior"
    - "visual parity"
generator_boundaries:
  do_not:
    - "Do not create tests/web/**."
    - "Do not run Playwright."
    - "Do not resolve Open Decisions or Unknowns."
    - "Do not promote readiness or confirmed status."
  generate_later_requires:
    - "explicit user approval"
    - "runnable web app and seed/entry URL"
    - "locator/testID strategy"
    - "approved plan"
```

## Plan-Only Verdict

The `plan` mode can produce a useful shallow smoke draft from the current
ScreenSpec, but it should stop before generation. The main blocker for generation
is not the ScreenSpec's State/Interaction content; it is the missing locator,
testID, seed URL, and fixture contract.

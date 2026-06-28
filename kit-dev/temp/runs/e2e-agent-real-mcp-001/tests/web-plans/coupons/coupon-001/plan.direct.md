# Coupons app test plan

## Application Overview

The Coupons app is a single-page coupon wallet served as a static page. The home screen shows a heading reading Your Coupons, a polite status line, and a list of three coupons: Welcome 10% (code WELCOME10, 10% off, expires 2026-12-31), Free Shipping (code FREESHIP, free delivery, expires 2026-09-30), and Save 20K (code SAVE20, 20,000 KRW off, expires 2026-07-15). Each coupon row exposes a View, a Copy code, and an Apply button. Clicking View hides the list and reveals a detail view with the coupon title, a meta line of code, discount and expiry, and a longer description; the Back button returns to the list. Clicking Copy code writes a confirmation into the status line reading Copied followed by the coupon id. Clicking Apply turns that button into an Applied state with a highlighted style and writes Applied followed by the coupon id into the status line. The app also has an empty-state branch that shows the message No coupons available right now when the coupon array is empty, but that branch is not reachable without editing the application source, so it is recorded here as a known un-exercised scenario rather than tested. The only console error observed is an unrelated favicon not-found request.

## Test Scenarios

### 1. Coupon list

**Seed:** `tests/web/seed.spec.ts`

#### 1.1. should list all available coupons with their details

**File:** `tests/web/coupons/coupon-list.spec.ts`

**Steps:**
  1. Open the coupon app home page.
    - expect: The page heading reads Your Coupons.
    - expect: The coupon list shows exactly three coupons: Welcome 10%, Free Shipping, and Save 20K.
  2. Inspect each coupon row in the list.
    - expect: Each row shows its coupon code: WELCOME10, FREESHIP, and SAVE20 respectively, along with its discount text and expiry date.
    - expect: Each row shows a View, a Copy code, and an Apply button.

### 2. Coupon detail

**Seed:** `tests/web/seed.spec.ts`

#### 2.1. should open the detail view for a coupon

**File:** `tests/web/coupons/coupon-detail.spec.ts`

**Steps:**
  1. Click the View button on the Welcome 10% coupon.
    - expect: The coupon list is hidden.
    - expect: The detail view shows the title Welcome 10%, a meta line containing code WELCOME10 with its discount and expiry, and the description First order discount for new members.

#### 2.2. should return to the list from the detail view

**File:** `tests/web/coupons/coupon-detail.spec.ts`

**Steps:**
  1. Open the Welcome 10% detail view, then click the Back button.
    - expect: The detail view is hidden.
    - expect: The coupon list is shown again with all three coupons.

### 3. Coupon actions

**Seed:** `tests/web/seed.spec.ts`

#### 3.1. should copy a coupon code and confirm in the status line

**File:** `tests/web/coupons/coupon-actions.spec.ts`

**Steps:**
  1. Click the Copy code button on the Free Shipping coupon.
    - expect: The status line reads Copied FREESHIP to clipboard.

#### 3.2. should apply a coupon and reflect the applied state

**File:** `tests/web/coupons/coupon-actions.spec.ts`

**Steps:**
  1. Click the Apply button on the Save 20K coupon.
    - expect: The button label changes to Applied and takes on the applied highlight style.
    - expect: The status line reads Applied SAVE20.

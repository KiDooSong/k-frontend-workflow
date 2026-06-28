# Coupons app test plan

## Application Overview

The Coupons app is a single-page, server-rendered HTML application served at http://127.0.0.1:3100/. It displays a list of three hardcoded coupons: "Welcome 10%" (code WELCOME10, 10% off, expires 2026-12-31), "Free Shipping" (code FREESHIP, free delivery, expires 2026-09-30), and "Save 20K" (code SAVE20, 20,000 KRW off, expires 2026-07-15). The page title is "Your Coupons". All state is held in memory; reloading the page resets everything.

Each coupon card in the list shows a title heading, a metadata line (code, discount description, expiry date), and three action buttons: View, Copy code, and Apply. A shared live-region status bar (role=status) sits above the list and displays feedback messages.

Clicking View transitions to a detail panel showing the coupon title, meta line, and a descriptive sentence; a Back button returns to the list. Clicking Copy code marks that button as active and shows "Copied {CODE} to clipboard" in the status region. Clicking Apply changes the button label to "Applied" with green styling and an active state, and sets the status to "Applied {CODE}". Multiple coupons can each be put into the Applied state independently. Clicking an already-Applied button again makes it the most recently active one without reverting it. Navigating to a detail view and back resets all Applied states because the list is fully re-rendered on every return.

One known un-exercised scenario exists: the empty-state element (#empty-state, text "No coupons available right now.") is only shown when the COUPONS JavaScript array is empty. Because the array is hardcoded in the page source with three entries, this branch cannot be reached through normal UI interaction and was not exercised during exploration.

## Test Scenarios

### 1. Coupon list page

**Seed:** `tests/web/seed.spec.ts`

#### 1.1. Page loads with correct title and three coupon cards

**File:** `tests/web/coupons/coupon-list.spec.ts`

**Steps:**
  1. Navigate to http://127.0.0.1:3100/
    - expect: The page title in the browser tab reads 'Coupons'
    - expect: A level-1 heading 'Your Coupons' is visible on the page
    - expect: The status region (role=status) is present and empty
    - expect: The coupon list contains exactly three list items
  2. Inspect the first coupon card
    - expect: A level-2 heading 'Welcome 10%' is visible
    - expect: The metadata line reads 'Code WELCOME10 · 10% off · expires 2026-12-31'
    - expect: Three buttons labelled 'View', 'Copy code', and 'Apply' are present on the card
  3. Inspect the second coupon card
    - expect: A level-2 heading 'Free Shipping' is visible
    - expect: The metadata line reads 'Code FREESHIP · Free delivery · expires 2026-09-30'
    - expect: Three buttons labelled 'View', 'Copy code', and 'Apply' are present on the card
  4. Inspect the third coupon card
    - expect: A level-2 heading 'Save 20K' is visible
    - expect: The metadata line reads 'Code SAVE20 · 20,000 KRW off · expires 2026-07-15'
    - expect: Three buttons labelled 'View', 'Copy code', and 'Apply' are present on the card

#### 1.2. Coupon list is visible and detail panel is hidden on initial load

**File:** `tests/web/coupons/coupon-list.spec.ts`

**Steps:**
  1. Navigate to http://127.0.0.1:3100/
    - expect: The coupon list element (data-testid=coupon-list) is visible
    - expect: The detail panel (data-testid=coupon-detail) is not visible (hidden attribute is set)
    - expect: The empty-state element (data-testid=empty-state) is not visible

### 2. View coupon detail

**Seed:** `tests/web/seed.spec.ts`

#### 2.1. View Welcome 10% coupon detail and return to list

**File:** `tests/web/coupons/coupon-detail.spec.ts`

**Steps:**
  1. Navigate to http://127.0.0.1:3100/
    - expect: The coupon list is displayed with three items
  2. Click the 'View' button on the 'Welcome 10%' coupon card
    - expect: The coupon list is hidden
    - expect: The detail panel is visible
    - expect: The detail panel shows a level-2 heading 'Welcome 10%'
    - expect: The detail panel shows the meta line 'Code WELCOME10 · 10% off · expires 2026-12-31'
    - expect: The detail panel shows the description 'First order discount for new members.'
    - expect: A '← Back' button is present in the detail panel
    - expect: The status region is empty (clicking View clears any previous status)
  3. Click the '← Back' button
    - expect: The detail panel is hidden
    - expect: The coupon list is visible again with all three coupon cards

#### 2.2. View Free Shipping coupon detail

**File:** `tests/web/coupons/coupon-detail.spec.ts`

**Steps:**
  1. Navigate to http://127.0.0.1:3100/
    - expect: The coupon list is displayed
  2. Click the 'View' button on the 'Free Shipping' coupon card
    - expect: The detail panel becomes visible
    - expect: The level-2 heading reads 'Free Shipping'
    - expect: The meta line reads 'Code FREESHIP · Free delivery · expires 2026-09-30'
    - expect: The description reads 'No minimum spend on standard delivery.'

#### 2.3. View Save 20K coupon detail

**File:** `tests/web/coupons/coupon-detail.spec.ts`

**Steps:**
  1. Navigate to http://127.0.0.1:3100/
    - expect: The coupon list is displayed
  2. Click the 'View' button on the 'Save 20K' coupon card
    - expect: The detail panel becomes visible
    - expect: The level-2 heading reads 'Save 20K'
    - expect: The meta line reads 'Code SAVE20 · 20,000 KRW off · expires 2026-07-15'
    - expect: The description reads 'Orders over 100,000 KRW.'

#### 2.4. Viewing a coupon detail clears the status region

**File:** `tests/web/coupons/coupon-detail.spec.ts`

**Steps:**
  1. Navigate to http://127.0.0.1:3100/
    - expect: The coupon list is displayed
  2. Click 'Copy code' on the 'Welcome 10%' coupon to produce a status message
    - expect: The status region shows 'Copied WELCOME10 to clipboard'
  3. Click the 'View' button on the 'Welcome 10%' coupon
    - expect: The detail panel is shown
    - expect: The status region is now empty (the status message has been cleared)

#### 2.5. Returning from detail view resets all applied coupon states

**File:** `tests/web/coupons/coupon-detail.spec.ts`

**Steps:**
  1. Navigate to http://127.0.0.1:3100/
    - expect: The coupon list is displayed
  2. Click 'Apply' on the 'Welcome 10%' coupon
    - expect: The Apply button changes to 'Applied' and is styled as active (green)
  3. Click 'View' on the 'Free Shipping' coupon to navigate to the detail view
    - expect: The detail panel for Free Shipping is shown
  4. Click '← Back' to return to the list
    - expect: The coupon list is visible with all three cards
    - expect: The 'Welcome 10%' card's button now shows 'Apply' again (applied state was lost when the list was re-rendered)

### 3. Copy coupon code

**Seed:** `tests/web/seed.spec.ts`

#### 3.1. Copy code for Welcome 10% coupon shows correct status

**File:** `tests/web/coupons/coupon-copy.spec.ts`

**Steps:**
  1. Navigate to http://127.0.0.1:3100/
    - expect: The coupon list is displayed and the status region is empty
  2. Click the 'Copy code' button on the 'Welcome 10%' coupon card
    - expect: The status region shows 'Copied WELCOME10 to clipboard'
    - expect: The 'Copy code' button on the Welcome 10% card gains the active state

#### 3.2. Copy code for Free Shipping coupon shows correct status

**File:** `tests/web/coupons/coupon-copy.spec.ts`

**Steps:**
  1. Navigate to http://127.0.0.1:3100/
    - expect: The coupon list is displayed and the status region is empty
  2. Click the 'Copy code' button on the 'Free Shipping' coupon card
    - expect: The status region shows 'Copied FREESHIP to clipboard'
    - expect: The 'Copy code' button on the Free Shipping card gains the active state

#### 3.3. Copy code for Save 20K coupon shows correct status

**File:** `tests/web/coupons/coupon-copy.spec.ts`

**Steps:**
  1. Navigate to http://127.0.0.1:3100/
    - expect: The coupon list is displayed and the status region is empty
  2. Click the 'Copy code' button on the 'Save 20K' coupon card
    - expect: The status region shows 'Copied SAVE20 to clipboard'
    - expect: The 'Copy code' button on the Save 20K card gains the active state

#### 3.4. Copying a second coupon code updates the status to the new code

**File:** `tests/web/coupons/coupon-copy.spec.ts`

**Steps:**
  1. Navigate to http://127.0.0.1:3100/
    - expect: The coupon list is displayed
  2. Click 'Copy code' on the 'Welcome 10%' coupon
    - expect: The status region shows 'Copied WELCOME10 to clipboard'
  3. Click 'Copy code' on the 'Free Shipping' coupon
    - expect: The status region now shows 'Copied FREESHIP to clipboard'
    - expect: The 'Copy code' button on the Free Shipping card is active
    - expect: The 'Copy code' button on the Welcome 10% card is no longer active

#### 3.5. Copying the code of an already-applied coupon still shows the copy status

**File:** `tests/web/coupons/coupon-copy.spec.ts`

**Steps:**
  1. Navigate to http://127.0.0.1:3100/
    - expect: The coupon list is displayed
  2. Click 'Apply' on the 'Free Shipping' coupon
    - expect: The Apply button changes to 'Applied'
  3. Click 'Copy code' on the 'Free Shipping' coupon
    - expect: The status region shows 'Copied FREESHIP to clipboard'
    - expect: The 'Copy code' button gains the active state
    - expect: The Apply button still shows 'Applied'

### 4. Apply coupon

**Seed:** `tests/web/seed.spec.ts`

#### 4.1. Applying Welcome 10% coupon changes button label and status

**File:** `tests/web/coupons/coupon-apply.spec.ts`

**Steps:**
  1. Navigate to http://127.0.0.1:3100/
    - expect: All three coupon cards show an 'Apply' button
  2. Click the 'Apply' button on the 'Welcome 10%' coupon card
    - expect: The status region shows 'Applied WELCOME10'
    - expect: The button on the Welcome 10% card now reads 'Applied' and is styled with green background and active state
    - expect: The Free Shipping and Save 20K cards still show 'Apply' buttons

#### 4.2. Applying Free Shipping coupon changes button label and status

**File:** `tests/web/coupons/coupon-apply.spec.ts`

**Steps:**
  1. Navigate to http://127.0.0.1:3100/
    - expect: All three coupon cards show an 'Apply' button
  2. Click the 'Apply' button on the 'Free Shipping' coupon card
    - expect: The status region shows 'Applied FREESHIP'
    - expect: The button on the Free Shipping card now reads 'Applied' and is styled as active
    - expect: The Welcome 10% and Save 20K cards still show 'Apply' buttons

#### 4.3. Applying Save 20K coupon changes button label and status

**File:** `tests/web/coupons/coupon-apply.spec.ts`

**Steps:**
  1. Navigate to http://127.0.0.1:3100/
    - expect: All three coupon cards show an 'Apply' button
  2. Click the 'Apply' button on the 'Save 20K' coupon card
    - expect: The status region shows 'Applied SAVE20'
    - expect: The button on the Save 20K card now reads 'Applied' and is styled as active

#### 4.4. Applying multiple coupons in sequence accumulates applied states

**File:** `tests/web/coupons/coupon-apply.spec.ts`

**Steps:**
  1. Navigate to http://127.0.0.1:3100/
    - expect: All three coupon cards show 'Apply' buttons
  2. Click 'Apply' on the 'Welcome 10%' coupon
    - expect: The Welcome 10% card shows 'Applied' (active), status shows 'Applied WELCOME10'
  3. Click 'Apply' on the 'Free Shipping' coupon
    - expect: The Free Shipping card now shows 'Applied' (active)
    - expect: The Welcome 10% card still shows 'Applied' but is no longer in the active state
    - expect: The status region updates to 'Applied FREESHIP'
  4. Click 'Apply' on the 'Save 20K' coupon
    - expect: The Save 20K card shows 'Applied' (active)
    - expect: Both Welcome 10% and Free Shipping cards show 'Applied' without active state
    - expect: The status region shows 'Applied SAVE20'

#### 4.5. Clicking an already-applied coupon button makes it active again without reverting

**File:** `tests/web/coupons/coupon-apply.spec.ts`

**Steps:**
  1. Navigate to http://127.0.0.1:3100/
    - expect: The coupon list is displayed
  2. Click 'Apply' on the 'Welcome 10%' coupon
    - expect: Welcome 10% shows 'Applied' as active
  3. Click 'Apply' on the 'Free Shipping' coupon
    - expect: Free Shipping shows 'Applied' as active, Welcome 10% shows 'Applied' but not active
  4. Click the 'Applied' button on the 'Welcome 10%' coupon
    - expect: The status region updates to 'Applied WELCOME10'
    - expect: The Welcome 10% card's button becomes active again
    - expect: The Free Shipping card retains 'Applied' state but is no longer the active one
    - expect: Neither coupon reverts to 'Apply' state

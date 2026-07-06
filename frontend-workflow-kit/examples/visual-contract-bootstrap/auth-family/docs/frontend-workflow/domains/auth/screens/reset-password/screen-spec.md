---
artifact_id: "AUTH-003-screen-spec"
artifact_type: screen-spec
domain: "auth"
screen_id: "AUTH-003"
route: "/reset-password"
screen_entry: "src/features/auth/ResetPasswordScreen.tsx"
status: draft
sources:
  - { type: planning, ref: "planning://auth-reset-password" }
depends_on: [navigation-map]
last_reviewed: "2026-07-06"
---

# ScreenSpec: 비밀번호 재설정

## Purpose
사용자가 이메일 인증으로 비밀번호를 재설정한다.

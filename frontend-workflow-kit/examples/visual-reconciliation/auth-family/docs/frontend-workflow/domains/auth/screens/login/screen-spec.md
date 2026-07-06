---
artifact_id: "AUTH-001-screen-spec"
artifact_type: screen-spec
domain: "auth"
screen_id: "AUTH-001"
route: "/login"
screen_entry: "src/features/auth/LoginScreen.tsx"
status: draft
sources:
  - { type: planning, ref: "planning://auth-login" }
depends_on: [navigation-map]
last_reviewed: "2026-07-06"
---

# ScreenSpec: 로그인

## Purpose
사용자가 이메일/비밀번호로 로그인한다.

## Copy Keys
| Key | 문구 | Status |
|---|---|---|
| auth.login.title | 로그인 | confirmed |
| auth.login.cta | 시작하기 | draft |

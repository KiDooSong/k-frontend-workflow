---
title: Domain Glossary
status: draft
kind: glossary
---

# Domain Glossary

"샘플 커머스 앱"의 도메인 용어집. 화면·문서·입력에서 같은 말을 같은 뜻으로 쓰기 위한 단일 출처다.
이 문서는 prose 문서이므로 `artifact_type` 을 갖지 않는다.

## 쿠폰 도메인
- **쿠폰 (coupon)**: 사용자가 결제 시 적용할 수 있는 할인/혜택 단위.
- **보유 쿠폰**: 현재 사용자가 소지한 쿠폰 목록. 화면 COUPON-001 의 대상.
- **사용 가능 (active)**: 아직 쓰지 않았고 만료되지 않은 쿠폰 상태.
- **사용 완료 (used)**: 이미 결제에 적용해 소진된 쿠폰 상태.
- **만료 (expired)**: 유효기간이 지나 더 이상 쓸 수 없는 쿠폰 상태. 목록 노출 여부는 D-001(open).
- **쿠폰 상태 enum**: 사용 가능/사용 완료/만료는 서버 enum 을 단일 출처로 삼는다. 화면에서 임의 파생 금지.

## 홈·공지 도메인
- **홈 대시보드 (home dashboard)**: 쿠폰 요약·공지·추천 등을 모아 보여주는 진입 화면(HOME-001). 위젯 구성은 D-101(open).
- **홈 요약 (home summary)**: 홈 대시보드가 호출하는 요약 데이터(`/home/summary`). 스펙 출처 미정(U-101).
- **공지 (notice)**: 운영자가 사용자에게 알리는 게시물. 독립 화면(NOTICE-001) 또는 홈 섹션 여부는 D-401(open).

## 프로필·인증 도메인
- **프로필 / 마이 (profile / my)**: 사용자 개인 정보 조회·수정 화면(PROFILE-001, `/(tabs)/my`). 편집 범위/필드는 D-301(open).
- **세션 (session)**: 로그인 성공 후 유지되는 사용자 인증 상태. 화면 로컬 state 가 아니라 session layer 가 소유한다.
- **토큰 (token)**: 로그인 응답의 인증 토큰. session layer 가 단일 출처로 보관하며 로그·analytics·에러 메시지에 남기지 않는다.
- **returnTo**: protected redirect 로 로그인에 들렀을 때, 인증 성공 후 되돌아갈 원래 목적지. 적용 규칙의 단일 출처는 Navigation Map 의 Route Guard 다. baseline 의 로그인 후 이동은 "항상 홈"(D-204 resolved)이며, returnTo 우선 반영은 이후 회의 입력으로 다뤄진다.

## 워크플로/fixture 용어
- **fixture**: 코드 없이 문서로만 구성한 테스트 입력/정답 세트. 이 예제 전체가 fixture 다.
- **fake hook / fixture-first**: 화면이 의존하는 데이터 훅을 처음에는 fixture 기반 fake 로 구현하고, API 확정 후 내부만 교체하는 방식. 화면 코드는 안 바뀐다. (이 fixture 엔 코드가 없어 개념으로만 존재.)
- **readiness mode**: 화면이 현재 어디까지 구현 가능한지를 나타내는 등급. `min(fact_mode, decision_cap)` 로 계산된다.
- **Blocking Mode**: Open Decision 이 게이트를 어느 등급 미만으로 막는지를 가리키는 보수적 상한.
- **snapshot (`*.snapshot.md`)**: 생성기가 만들 산출물의 기대 형태를 보여주는 SAMPLE 파일. 실제 생성물도, source of truth 도 아니다.

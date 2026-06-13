// CouponListScreen — 화면 골격 셸 (readiness_mode = screen-skeleton).
//
// 이 단계의 정답은 "화면 자리 + 확정된 것만" 이다. fixture/hook 이전 단계라
// 데이터 훅·State Matrix 상태 분기·카탈로그 컴포넌트·픽스처는 만들지 않는다.
// 그건 다음 모드(rough-fixture-ui)의 몫이고, 지금은 게이트가 막는다.
//
// Gate (readiness.mjs · COUPON-001):
//   readiness_mode = screen-skeleton  /  next_mode = rough-fixture-ui
//   allowed_paths  = src/features/coupons/screens/**
//   forbidden      = src/api/**, openapi.yaml
//   rough 로 못 올라가는 이유: component_catalog 미생성 + fake hook 부재.
//
// 미확정은 추측하지 않는다 (screen-spec 단일 출처):
//   - D-001 (open): 만료 쿠폰 노출 정책 미정 → 목록 노출 방식을 코드로 단정하지 않는다.
//   - D-003 (open): 페이지네이션 방식 미정.
//   - U-001 (open): 쿠폰 API 응답 예시 위치 미정 → 엔드포인트/DTO/데이터 의존을 도입하지 않는다.
//   - coupon.list.empty: Copy Key status = tbd → 문구를 발명하지 않고 키 이름 그대로 둔다.
import { Text, View } from 'react-native';

export function CouponListScreen() {
  // 골격 셸: 화면 컴포넌트 자리와 확정 제목만 둔다.
  return (
    <View>
      {/* Header — Copy Keys: coupon.list.title = "쿠폰" (confirmed) */}
      <Text accessibilityRole="header">쿠폰</Text>

      {/* UI Sections(screen-spec): Header / Coupon List / Empty State / Error State.
          데이터 훅 + State Matrix 5상태 + 카탈로그 컴포넌트로의 환원은 rough-fixture-ui 에서.
          그 전제(생성된 catalog·fake hook)와 D-001·D-003·U-001·coupon.list.empty(tbd)는
          아직 미해결 → 여기서는 골격까지만 진행한다. */}
    </View>
  );
}

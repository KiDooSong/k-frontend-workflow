// Expo Router 라우트: /(tabs)/coupons → COUPON-001
// 라우트 파일은 화면 컴포넌트를 연결만 한다 (로직은 features 에).
import { CouponListScreen } from '@/features/coupons/screens/CouponListScreen';

export default function CouponsTab() {
  return <CouponListScreen />;
}

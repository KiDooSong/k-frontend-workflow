import { Pressable, Text, View } from 'react-native';
import type { Coupon } from '@/api/schemas/coupon.schema';

type Props = {
  coupon: Coupon;
  onPress: (id: string) => void;
};

// feature 컴포넌트. 공통 버튼/카드는 components/ui 를 사용하지만,
// 카드 전체를 누르는 행은 화면 이동 트리거라 Pressable 래퍼를 둔다 (Interaction Matrix: 쿠폰 클릭).
export function CouponCard({ coupon, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${coupon.title}, ${coupon.expiresAt} 만료`}
      onPress={() => onPress(coupon.id)}
    >
      <View>
        <Text>{coupon.title}</Text>
        <Text>{coupon.expiresAt} 까지</Text>
        {coupon.conditions ? <Text>{coupon.conditions}</Text> : null}
      </View>
    </Pressable>
  );
}

// CouponListScreen — fake hook 기반 presentational screen.
// ScreenSpec(COUPON-001)의 State Matrix 전 상태 + Interaction Matrix 를 구현한다.
// 규칙: useCoupons 만 사용 (src/api 미접근). 문구는 Copy Keys 의 confirmed 값만.
import { useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonList } from '@/components/ui/SkeletonList';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';

import { useCoupons } from '@/features/coupons/hooks/useCoupons';
import { CouponCard } from '@/features/coupons/components/CouponCard';

const TABS = [
  { key: 'available', label: '사용 가능' },
  { key: 'used', label: '사용 완료' },
  { key: 'expired', label: '만료' },
];

export function CouponListScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState('available');
  const { data, status, isRefreshing, refetch } = useCoupons(filter);

  const goDetail = (id: string) => router.push(`/coupons/${id}`);

  return (
    <View>
      {/* Header — Copy Keys: coupon.list.title (confirmed) */}
      <Text accessibilityRole="header">쿠폰</Text>

      {/* Coupon Status Tabs */}
      <SegmentedTabs items={TABS} value={filter} onChange={setFilter} />

      {/* State Matrix */}
      {status === 'loading' && <SkeletonList count={4} />}

      {status === 'error' && (
        // TODO(design): 에러 문구는 Copy Keys 미확정. 키 이름 노출.
        <ErrorState message="coupon.list.error" onRetry={refetch} />
      )}

      {status === 'empty' && (
        // Copy Keys: coupon.list.empty = TBD → 키 이름 그대로 표시
        <EmptyState title="coupon.list.empty" />
      )}

      {status === 'success' && (
        <FlatList
          data={data}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => <CouponCard coupon={item} onPress={goDetail} />}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refetch} />}
        />
      )}

      {/* 재시도 버튼은 ErrorState 내부에서 처리 (Interaction Matrix: 재시도 → refetch) */}
      {status === 'error' && (
        <Button variant="secondary" size="md" onPress={refetch}>
          다시 시도
        </Button>
      )}
    </View>
  );
}

// useCoupons — 조회 hook. 화면은 처음부터 이 hook 을 쓰고, 내부 구현만 단계에 따라 바뀐다.
// 현재(MVP-A): API 미확정 → fixture 기반 fake 구현. 반환 타입(UseCouponsResult)을 먼저 고정한다.
// API 확정 후: 내부를 useQuery 로 교체한다. 화면 코드는 한 줄도 바뀌지 않는다.
// 참고: frontend-llm-workflow.md §6 (방법 A)
import type { AsyncState } from '@/lib/asyncState';
import type { Coupon, CouponStatus } from '@/api/schemas/coupon.schema';
import { couponFixtures } from '@/features/coupons/fixtures/coupons';

export type UseCouponsResult = AsyncState<Coupon[]>;

const STATUS_FILTER: Record<string, CouponStatus> = {
  available: 'AVAILABLE',
  used: 'USED',
  expired: 'EXPIRED',
};

// 1단계: fixture 를 같은 인터페이스(UseCouponsResult)로 반환한다.
export function useCoupons(filter: keyof typeof STATUS_FILTER): UseCouponsResult {
  const status = STATUS_FILTER[filter];
  const data = couponFixtures.filter((c) => c.status === status);
  return {
    data,
    status: data.length ? 'success' : 'empty',
    isLoading: false,
    isRefreshing: false,
    isError: false,
    error: null,
    refetch: async () => {},
  };
}

/*
 * 2단계 (API 확정 후) — 내부만 교체. 화면은 그대로:
 *
 * import { useQuery } from '@tanstack/react-query';
 * import { couponKeys } from '@/features/coupons/queryKeys';
 * import { getCoupons } from '@/api/coupon.api';
 * import { toAsyncState } from '@/lib/asyncState';
 *
 * export function useCoupons(filter): UseCouponsResult {
 *   const status = STATUS_FILTER[filter];
 *   const query = useQuery({
 *     queryKey: couponKeys.list(status),
 *     queryFn: () => getCoupons({ status }),
 *   });
 *   return toAsyncState(query);
 * }
 */

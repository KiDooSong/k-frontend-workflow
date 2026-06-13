// query key factory — invalidation 의 단일 출처.
// 화면/hook 이 ['coupons', id] 같은 문자열 배열을 손으로 쓰지 않게 한다.
// 참고: frontend-llm-workflow.md §6
import type { CouponStatus } from '@/api/schemas/coupon.schema';

export const couponKeys = {
  all: ['coupons'] as const,
  list: (status: CouponStatus) => ['coupons', 'list', status] as const,
  detail: (id: string) => ['coupons', 'detail', id] as const,
};

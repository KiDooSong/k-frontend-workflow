// fixture 는 zod 스키마로 검증한다 ("실제 API와 동일한 형태"를 사람이 아니라 스키마가 보장).
import { CouponListSchema, type Coupon } from '@/api/schemas/coupon.schema';

const raw: Coupon[] = [
  {
    id: 'c-1001',
    title: '신규가입 3,000원 할인',
    status: 'AVAILABLE',
    expiresAt: '2026-07-31',
    conditions: '20,000원 이상 구매 시',
  },
  {
    id: 'c-1002',
    title: '여름 시즌 10% 할인',
    status: 'AVAILABLE',
    expiresAt: '2026-08-15',
  },
  {
    id: 'c-1003',
    title: '첫 주문 무료배송',
    status: 'USED',
    expiresAt: '2026-06-01',
  },
  {
    id: 'c-1004',
    title: '봄맞이 5,000원 할인',
    status: 'EXPIRED',
    expiresAt: '2026-05-01',
  },
];

// 모듈 로드 시 스키마 검증 — fixture 가 DTO 와 어긋나면 즉시 실패한다.
export const couponFixtures: Coupon[] = CouponListSchema.parse(raw);

// DTO 단일 출처 (zod). 타입은 z.infer 로 파생한다. fixture 도 이 스키마로 검증한다.
// 참고: frontend-llm-workflow.md §0-2, §5
import { z } from 'zod';

export const CouponStatusSchema = z.enum(['AVAILABLE', 'USED', 'EXPIRED']);
export type CouponStatus = z.infer<typeof CouponStatusSchema>;

export const CouponSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: CouponStatusSchema,
  expiresAt: z.string(), // ISO date
  imageUrl: z.string().optional(),
  conditions: z.string().optional(),
});
export type Coupon = z.infer<typeof CouponSchema>;

export const CouponListSchema = z.array(CouponSchema);

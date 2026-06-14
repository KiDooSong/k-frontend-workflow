// fixture zod schema — 검사 8 의 Linked Schema export 심볼 해소 대상.
import { z } from 'zod';

export const CouponSchema = z.object({
  id: z.string(),
  title: z.string(),
});

export const CouponListResponseSchema = z.array(CouponSchema);

// fixture: Linked Schema=CouponListResponseSchema 를 만족하는 export 가 없다(CouponSchema 만 존재).
import { z } from 'zod';

export const CouponSchema = z.object({ id: z.string() });

// fixture: 두 스키마 모두 export — 그래서 유일한 에러는 manifest 의 충돌 중복(해소 자체는 통과).
import { z } from 'zod';

export const CouponDto = z.object({ id: z.string() });
export const CouponListResponseSchema = z.array(CouponDto);

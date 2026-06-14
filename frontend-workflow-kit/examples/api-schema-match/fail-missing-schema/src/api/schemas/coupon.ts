// fixture: 스키마는 존재하지만 manifest 가 endpoint 를 스키마에 연결하지 않았다(Linked Schema=TBD).
import { z } from 'zod';

export const CouponSchema = z.object({ id: z.string() });

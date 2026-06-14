// fixture: 경로 파라미터 표기 정규화(:id / [id] / {id} / {couponId}) 매칭 검증용 zod export.
import { z } from 'zod';

export const CouponDetailSchema = z.object({ id: z.string(), title: z.string() });
export const UseCouponSchema = z.object({ ok: z.boolean() });

// api_schema — DTO (서버 응답 계약, zod)
import { z } from 'zod';

export const profileSchema = z.object({
  id: z.string(),
  full_name: z.string(),
  email: z.string().email(),
  tier: z.enum(['free', 'pro']),
});

export type ProfileDTO = z.infer<typeof profileSchema>;

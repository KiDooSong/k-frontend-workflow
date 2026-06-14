import { z } from 'zod';

export const LoginResponseSchema = z.object({ token: z.string() });

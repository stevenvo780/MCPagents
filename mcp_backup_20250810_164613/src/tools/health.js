import { z } from 'zod';

export const HealthParamsSchema = z.object({}).optional();

export async function health(params = {}) {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };
}

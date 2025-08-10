import { z } from 'zod';

export const HealthParamsSchema = z.object({
  // No parameters for health check
});

export type HealthParams = z.infer<typeof HealthParamsSchema>;

export async function health(params: HealthParams) {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };
}

import { Polar } from '@polar-sh/sdk';
import { env } from '../config/env';
import { logger } from './logger';

export const polar = env.POLAR_ACCESS_TOKEN
  ? new Polar({
      accessToken: env.POLAR_ACCESS_TOKEN,
      server: env.POLAR_SERVER === 'production' ? 'production' : 'sandbox',
    })
  : null;

if (!polar) {
  logger.warn('Polar.sh SDK initialized without POLAR_ACCESS_TOKEN. Billing features will be limited.');
} else {
  logger.info(`Polar.sh SDK initialized in [${env.POLAR_SERVER}] environment.`);
}

import { auth } from '../config/auth';
import { prisma } from '../config/db';
import { logger } from '../utils/logger';
import { env } from '../config/env';

export async function seedAdmin() {
  const adminEmail = (env.ADMIN_EMAIL || 'admin@ahsanul.dev').trim();
  const adminPassword = 'labtobit@#01';
  const adminName = 'Labto Admin';

  try {
    logger.info('Checking for existing Admin user...');
    let existingUser = await prisma.user.findUnique({
      where: { email: adminEmail },
    });

    if (!existingUser) {
      logger.info('Creating Admin account via Better Auth...');
      try {
        await auth.api.signUpEmail({
          body: {
            email: adminEmail,
            password: adminPassword,
            name: adminName,
          },
        });
      } catch (err: any) {
        logger.warn('Sign up error (user might already exist partially):', err?.message);
      }
    }

    // Ensure emailVerified is true, role is ADMIN, planTier is ENTERPRISE
    const updated = await prisma.user.update({
      where: { email: adminEmail },
      data: {
        emailVerified: true,
        role: 'ADMIN',
        planTier: 'ENTERPRISE',
      },
    });

    logger.info(`Admin user ready: ${updated.email} | Role: ${updated.role} | Verified: ${updated.emailVerified}`);
  } catch (error) {
    logger.error('Error seeding Admin user:', error);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  seedAdmin().then(() => {
    logger.info('Seed process finished.');
    process.exit(0);
  });
}

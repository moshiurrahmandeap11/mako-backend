import { auth } from "../config/auth";
import { prisma } from "../config/db";
import { logger } from "../utils/logger";

export async function seedAdmin(targetEmail?: string, password?: string) {
  const adminEmail = (
    targetEmail ||
    process.env.ADMIN_EMAIL ||
    "labtobit@gmail.com"
  ).trim();
  const adminName = "Labto Super Admin";

  try {
    logger.info(`Promoting user ${adminEmail} to ADMIN role...`);
    let existingUser = await prisma.user.findUnique({
      where: { email: adminEmail },
    });

    if (!existingUser && password) {
      logger.info("Creating Admin account via Better Auth...");
      try {
        await auth.api.signUpEmail({
          body: {
            email: adminEmail,
            password: password,
            name: adminName,
          },
        });
      } catch (err: any) {
        logger.warn(
          "Sign up error (user might already exist partially):",
          err?.message,
        );
      }
    }

    // Ensure emailVerified is true, role is ADMIN, planTier is ENTERPRISE
    const updated = await prisma.user.update({
      where: { email: adminEmail },
      data: {
        emailVerified: true,
        role: "ADMIN",
        planTier: "ENTERPRISE",
      },
    });

    logger.info(
      `Admin user ready: ${updated.email} | Role: ${updated.role} | Verified: ${updated.emailVerified}`,
    );
  } catch (error) {
    logger.error("Error seeding Admin user:", error);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  seedAdmin().then(() => {
    logger.info("Seed process finished.");
    process.exit(0);
  });
}

import { Request, Response } from "express";
import { prisma } from "../../config/db";
import { uploadImageToCloudinary } from "../../services/cloudinary.service";
import { logger } from "../../utils/logger";

export async function submitBugReport(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { title, description, imageUrl, userEmail } = req.body;

    if (!description || String(description).trim().length < 5) {
      res
        .status(400)
        .json({
          error:
            "Please provide a clear description of the bug (minimum 5 characters).",
        });
      return;
    }

    let finalImageUrl = imageUrl ? String(imageUrl).trim() : null;
    if (finalImageUrl && finalImageUrl.startsWith("data:image")) {
      try {
        finalImageUrl = await uploadImageToCloudinary(
          finalImageUrl,
          "mako_bug_reports",
        );
      } catch (uploadErr) {
        logger.warn("Cloudinary Bug Image Upload Warning:", uploadErr);
        // Fallback: continue with null or existing if upload fails
      }
    }

    const bug = await (prisma as any).bugReport.create({
      data: {
        title: title ? String(title).trim() : "Issue Reported",
        description: String(description).trim(),
        imageUrl: finalImageUrl,
        userEmail: userEmail ? String(userEmail).trim().toLowerCase() : null,
        status: "OPEN",
      },
    });

    logger.info(
      `[BugReport] New bug reported (ID: ${bug.id}, User: ${bug.userEmail || "Anonymous"})`,
    );

    res.status(201).json({
      success: true,
      message:
        "Bug report submitted successfully! Thank you for helping us improve Labto AI.",
      reportId: bug.id,
    });
  } catch (error) {
    logger.error("Submit Bug Report Error:", error);
    res
      .status(500)
      .json({ error: "Failed to submit bug report. Please try again." });
  }
}

import { Request, Response } from "express";
import { prisma } from "../../config/db";
import { logger } from "../../utils/logger";

export function generateSlug(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[\s\W-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function calculateReadTime(content: string): string {
  const plainText = content.replace(/<[^>]+>/g, "");
  const wordCount = plainText.trim().split(/\s+/).length;
  const minutes = Math.max(1, Math.ceil(wordCount / 200));
  return `${minutes} min read`;
}

export async function getPublicBlogs(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(
      50,
      Math.max(1, parseInt(req.query.limit as string, 10) || 9),
    );
    const skip = (page - 1) * limit;
    const category = req.query.category
      ? String(req.query.category).trim()
      : "";
    const search = req.query.search ? String(req.query.search).trim() : "";

    const where: any = {
      published: true,
    };

    if (category && category !== "All") {
      where.category = { equals: category, mode: "insensitive" };
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { excerpt: { contains: search, mode: "insensitive" } },
        { content: { contains: search, mode: "insensitive" } },
      ];
    }

    const [total, blogs, categoriesRaw] = await Promise.all([
      (prisma as any).blogPost.count({ where }),
      (prisma as any).blogPost.findMany({
        where,
        orderBy: { publishedAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          slug: true,
          excerpt: true,
          coverImage: true,
          category: true,
          tags: true,
          authorName: true,
          authorAvatar: true,
          authorRole: true,
          publishedAt: true,
          readTime: true,
          views: true,
        },
      }),
      (prisma as any).blogPost.findMany({
        where: { published: true },
        select: { category: true },
        distinct: ["category"],
      }),
    ]);

    const categories = categoriesRaw
      .map((c: any) => c.category)
      .filter(Boolean);

    res.json({
      blogs,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      categories,
    });
  } catch (error) {
    logger.error("Public Get Blogs Error:", error);
    res.status(500).json({ error: "Failed to fetch blogs." });
  }
}

export async function getPublicBlogBySlug(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const rawSlug = req.params.slug;
    if (!rawSlug) {
      res.status(400).json({ error: "Slug parameter is required." });
      return;
    }

    const slug = String(rawSlug).toLowerCase().trim();

    const blog = await (prisma as any).blogPost.findFirst({
      where: {
        slug,
        published: true,
      },
    });

    if (!blog) {
      res.status(404).json({ error: "Blog post not found or not published." });
      return;
    }

    // Increment view count asynchronously
    (prisma as any).blogPost
      .update({
        where: { id: blog.id },
        data: { views: { increment: 1 } },
      })
      .catch((err: any) => logger.warn("Failed to increment blog views:", err));

    // Fetch related articles (same category or recent, excluding current)
    const relatedBlogs = await (prisma as any).blogPost.findMany({
      where: {
        published: true,
        id: { not: blog.id },
        category: blog.category,
      },
      orderBy: { publishedAt: "desc" },
      take: 3,
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        coverImage: true,
        category: true,
        readTime: true,
        publishedAt: true,
      },
    });

    res.json({
      blog,
      relatedBlogs,
    });
  } catch (error) {
    logger.error("Public Get Blog By Slug Error:", error);
    res.status(500).json({ error: "Failed to retrieve blog post." });
  }
}

export async function getPublicBlogCategories(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const categoriesRaw = await (prisma as any).blogPost.groupBy({
      by: ["category"],
      where: { published: true },
      _count: {
        category: true,
      },
    });

    const categories = categoriesRaw.map((item: any) => ({
      name: item.category,
      count: item._count.category,
    }));

    res.json({ categories });
  } catch (error) {
    logger.error("Public Blog Categories Error:", error);
    res.status(500).json({ error: "Failed to fetch categories." });
  }
}

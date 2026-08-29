import { Response } from 'express';
import { prisma } from '../../config/db';
import { DashboardAuthRequest } from '../../middleware/authenticateDashboard';
import { logger } from '../../utils/logger';
import { generateSlug, calculateReadTime } from '../blog/blog.controller';

export async function getAdminBlogs(req: DashboardAuthRequest, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 15));
    const skip = (page - 1) * limit;
    const status = req.query.status ? String(req.query.status).toUpperCase() : 'ALL';
    const search = req.query.search ? String(req.query.search).trim() : '';
    const category = req.query.category ? String(req.query.category).trim() : '';

    const where: any = {};

    if (status === 'PUBLISHED') {
      where.published = true;
    } else if (status === 'DRAFT') {
      where.published = false;
    }

    if (category && category !== 'ALL') {
      where.category = category;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        { excerpt: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, blogs, totalPublished, totalDrafts, totalViewsAgg] = await Promise.all([
      (prisma as any).blogPost.count({ where }),
      (prisma as any).blogPost.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      (prisma as any).blogPost.count({ where: { published: true } }),
      (prisma as any).blogPost.count({ where: { published: false } }),
      (prisma as any).blogPost.aggregate({
        _sum: { views: true },
      }),
    ]);

    res.json({
      blogs,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      stats: {
        totalBlogs: totalPublished + totalDrafts,
        publishedCount: totalPublished,
        draftCount: totalDrafts,
        totalViews: totalViewsAgg._sum.views || 0,
      },
    });
  } catch (error) {
    logger.error('Admin Get Blogs Error:', error);
    res.status(500).json({ error: 'Failed to fetch admin blog posts.' });
  }
}

export async function getAdminBlogById(req: DashboardAuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const blog = await (prisma as any).blogPost.findUnique({
      where: { id },
    });

    if (!blog) {
      res.status(404).json({ error: 'Blog post not found.' });
      return;
    }

    res.json({ blog });
  } catch (error) {
    logger.error('Admin Get Blog By ID Error:', error);
    res.status(500).json({ error: 'Failed to fetch blog post.' });
  }
}

export async function createAdminBlog(req: DashboardAuthRequest, res: Response): Promise<void> {
  try {
    const {
      title,
      slug: customSlug,
      excerpt,
      content,
      coverImage,
      category,
      tags,
      authorName,
      authorRole,
      authorAvatar,
      published,
      metaTitle,
      metaDescription,
      metaKeywords,
      canonicalUrl,
      ogImage,
    } = req.body;

    if (!title || !content) {
      res.status(400).json({ error: 'Title and content are required.' });
      return;
    }

    // Auto-generate unique slug
    let baseSlug = customSlug ? generateSlug(customSlug) : generateSlug(title);
    if (!baseSlug) {
      baseSlug = 'blog-' + Date.now();
    }

    let finalSlug = baseSlug;
    let collisionCount = 1;
    while (await (prisma as any).blogPost.findUnique({ where: { slug: finalSlug } })) {
      finalSlug = baseSlug + '-' + collisionCount;
      collisionCount++;
    }

    const readTime = calculateReadTime(content);
    const isPublished = Boolean(published);

    const newBlog = await (prisma as any).blogPost.create({
      data: {
        title: title.trim(),
        slug: finalSlug,
        excerpt: excerpt ? excerpt.trim() : null,
        content,
        coverImage: coverImage ? coverImage.trim() : null,
        category: category ? category.trim() : 'AI & E-commerce',
        tags: Array.isArray(tags) ? tags : [],
        authorName: authorName ? authorName.trim() : 'Labto AI Team',
        authorRole: authorRole ? authorRole.trim() : 'AI Research & Product',
        authorAvatar: authorAvatar ? authorAvatar.trim() : null,
        published: isPublished,
        publishedAt: isPublished ? new Date() : null,
        readTime,
        metaTitle: metaTitle ? metaTitle.trim() : title.trim(),
        metaDescription: metaDescription ? metaDescription.trim() : (excerpt ? excerpt.trim() : null),
        metaKeywords: metaKeywords ? metaKeywords.trim() : null,
        canonicalUrl: canonicalUrl ? canonicalUrl.trim() : null,
        ogImage: ogImage ? ogImage.trim() : (coverImage ? coverImage.trim() : null),
      },
    });

    res.status(201).json({ success: true, blog: newBlog });
  } catch (error) {
    logger.error('Admin Create Blog Error:', error);
    res.status(500).json({ error: 'Failed to create blog post.' });
  }
}

export async function updateAdminBlog(req: DashboardAuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const existing = await (prisma as any).blogPost.findUnique({ where: { id } });

    if (!existing) {
      res.status(404).json({ error: 'Blog post not found.' });
      return;
    }

    const {
      title,
      slug: newSlug,
      excerpt,
      content,
      coverImage,
      category,
      tags,
      authorName,
      authorRole,
      authorAvatar,
      published,
      metaTitle,
      metaDescription,
      metaKeywords,
      canonicalUrl,
      ogImage,
    } = req.body;

    const data: any = {};

    if (title !== undefined) data.title = title.trim();
    if (excerpt !== undefined) data.excerpt = excerpt ? excerpt.trim() : null;
    if (content !== undefined) {
      data.content = content;
      data.readTime = calculateReadTime(content);
    }
    if (coverImage !== undefined) data.coverImage = coverImage ? coverImage.trim() : null;
    if (category !== undefined) data.category = category ? category.trim() : 'AI & E-commerce';
    if (tags !== undefined) data.tags = Array.isArray(tags) ? tags : [];
    if (authorName !== undefined) data.authorName = authorName.trim();
    if (authorRole !== undefined) data.authorRole = authorRole.trim();
    if (authorAvatar !== undefined) data.authorAvatar = authorAvatar ? authorAvatar.trim() : null;
    if (metaTitle !== undefined) data.metaTitle = metaTitle ? metaTitle.trim() : null;
    if (metaDescription !== undefined) data.metaDescription = metaDescription ? metaDescription.trim() : null;
    if (metaKeywords !== undefined) data.metaKeywords = metaKeywords ? metaKeywords.trim() : null;
    if (canonicalUrl !== undefined) data.canonicalUrl = canonicalUrl ? canonicalUrl.trim() : null;
    if (ogImage !== undefined) data.ogImage = ogImage ? ogImage.trim() : null;

    // Handle slug change
    if (newSlug && newSlug !== existing.slug) {
      const cleanSlug = generateSlug(newSlug);
      const collision = await (prisma as any).blogPost.findFirst({
        where: { slug: cleanSlug, id: { not: id } },
      });
      if (collision) {
        res.status(400).json({ error: 'Slug already exists. Please choose a unique slug.' });
        return;
      }
      data.slug = cleanSlug;
    }

    // Handle publish state change
    if (published !== undefined) {
      const isPub = Boolean(published);
      data.published = isPub;
      if (isPub && !existing.publishedAt) {
        data.publishedAt = new Date();
      }
    }

    const updated = await (prisma as any).blogPost.update({
      where: { id },
      data,
    });

    res.json({ success: true, blog: updated });
  } catch (error) {
    logger.error('Admin Update Blog Error:', error);
    res.status(500).json({ error: 'Failed to update blog post.' });
  }
}

export async function toggleAdminBlogStatus(req: DashboardAuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const existing = await (prisma as any).blogPost.findUnique({ where: { id } });

    if (!existing) {
      res.status(404).json({ error: 'Blog post not found.' });
      return;
    }

    const newStatus = !existing.published;
    const updated = await (prisma as any).blogPost.update({
      where: { id },
      data: {
        published: newStatus,
        publishedAt: newStatus && !existing.publishedAt ? new Date() : existing.publishedAt,
      },
    });

    res.json({ success: true, published: updated.published });
  } catch (error) {
    logger.error('Admin Toggle Blog Status Error:', error);
    res.status(500).json({ error: 'Failed to toggle blog status.' });
  }
}

export async function deleteAdminBlog(req: DashboardAuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    await (prisma as any).blogPost.delete({ where: { id } });
    res.json({ success: true, message: 'Blog post deleted successfully.' });
  } catch (error) {
    logger.error('Admin Delete Blog Error:', error);
    res.status(500).json({ error: 'Failed to delete blog post.' });
  }
}

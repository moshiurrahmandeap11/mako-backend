import { Response } from 'express';
import { prisma, executeRawNeonQuery } from '../../config/db';
import { generateEmbedding } from '../../utils/embeddings';
import { logger } from '../../utils/logger';
import { DashboardAuthRequest } from '../../middleware/authenticateDashboard';

export async function createProduct(req: DashboardAuthRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant?.id!;
    const { externalId, title, description, price, currency, imageUrl, productUrl, category, inStock } = req.body;

    if (!externalId || !title || price === undefined || !productUrl) {
      res.status(400).json({ error: 'externalId, title, price, and productUrl are required.' });
      return;
    }

    // Generate vector embedding
    const textToEmbed = `${title} ${description || ''} ${category || ''}`;
    const vector = await generateEmbedding(textToEmbed);

    const product = await prisma.product.create({
      data: {
        merchantId,
        externalId: String(externalId),
        title,
        description,
        price,
        currency: currency || 'USD',
        imageUrl,
        productUrl,
        category,
        inStock: inStock !== undefined ? Boolean(inStock) : true,
      },
    });

    // Update embedding in pgvector column via raw SQL
    await executeRawNeonQuery(
      `UPDATE "Product" SET embedding = $1 WHERE id = $2`,
      [vector, product.id]
    );

    res.status(201).json({ message: 'Product created successfully', product });
  } catch (error) {
    logger.error('Create Product Error:', error);
    res.status(500).json({ error: 'Failed to create product.' });
  }
}

export async function listProducts(req: DashboardAuthRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant?.id!;
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '20', 10);
    const search = (req.query.search as string || '').trim();

    const skip = (page - 1) * limit;

    const where: any = { merchantId };
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.product.count({ where }),
    ]);

    res.json({
      products,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error('List Products Error:', error);
    res.status(500).json({ error: 'Failed to fetch products.' });
  }
}

export async function updateProduct(req: DashboardAuthRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant?.id!;
    const productId = req.params.id as string;
    const { title, description, price, currency, imageUrl, productUrl, category, inStock } = req.body;

    const existingProduct = await prisma.product.findFirst({
      where: { id: productId, merchantId },
    });

    if (!existingProduct) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }

    const updatedProduct = await prisma.product.update({
      where: { id: productId },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(price !== undefined && { price }),
        ...(currency !== undefined && { currency }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(productUrl !== undefined && { productUrl }),
        ...(category !== undefined && { category }),
        ...(inStock !== undefined && { inStock }),
      },
    });

    // Re-generate vector embedding if content changed
    if (title !== undefined || description !== undefined || category !== undefined) {
      const textToEmbed = `${updatedProduct.title} ${updatedProduct.description || ''} ${updatedProduct.category || ''}`;
      const vector = await generateEmbedding(textToEmbed);
      await executeRawNeonQuery(
        `UPDATE "Product" SET embedding = $1 WHERE id = $2`,
        [vector, updatedProduct.id]
      );
    }

    res.json({ message: 'Product updated successfully', product: updatedProduct });
  } catch (error) {
    logger.error('Update Product Error:', error);
    res.status(500).json({ error: 'Failed to update product.' });
  }
}

export async function deleteProduct(req: DashboardAuthRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant?.id!;
    const productId = req.params.id as string;

    const existingProduct = await prisma.product.findFirst({
      where: { id: productId, merchantId },
    });

    if (!existingProduct) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }

    await prisma.product.delete({ where: { id: productId } });

    res.json({ message: 'Product deleted successfully.' });
  } catch (error) {
    logger.error('Delete Product Error:', error);
    res.status(500).json({ error: 'Failed to delete product.' });
  }
}

export async function importProducts(req: DashboardAuthRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant?.id!;
    const { products } = req.body;

    if (!Array.isArray(products) || products.length === 0) {
      res.status(400).json({ error: 'Body must contain a non-empty products array.' });
      return;
    }

    let createdCount = 0;
    let updatedCount = 0;

    for (const item of products) {
      if (!item.externalId || !item.title || item.price === undefined || !item.productUrl) {
        continue;
      }

      const externalId = String(item.externalId);
      const textToEmbed = `${item.title} ${item.description || ''} ${item.category || ''}`;
      const vector = await generateEmbedding(textToEmbed);

      const existing = await prisma.product.findUnique({
        where: { merchantId_externalId: { merchantId, externalId } },
      });

      if (existing) {
        const updated = await prisma.product.update({
          where: { id: existing.id },
          data: {
            title: item.title,
            description: item.description,
            price: item.price,
            currency: item.currency || 'USD',
            imageUrl: item.imageUrl,
            productUrl: item.productUrl,
            category: item.category,
            inStock: item.inStock !== undefined ? Boolean(item.inStock) : true,
          },
        });

        await executeRawNeonQuery(
          `UPDATE "Product" SET embedding = $1 WHERE id = $2`,
          [vector, updated.id]
        );
        updatedCount++;
      } else {
        const created = await prisma.product.create({
          data: {
            merchantId,
            externalId,
            title: item.title,
            description: item.description,
            price: item.price,
            currency: item.currency || 'USD',
            imageUrl: item.imageUrl,
            productUrl: item.productUrl,
            category: item.category,
            inStock: item.inStock !== undefined ? Boolean(item.inStock) : true,
          },
        });

        await executeRawNeonQuery(
          `UPDATE "Product" SET embedding = $1 WHERE id = $2`,
          [vector, created.id]
        );
        createdCount++;
      }
    }

    res.json({
      message: 'Import complete',
      createdCount,
      updatedCount,
      totalProcessed: createdCount + updatedCount,
    });
  } catch (error) {
    logger.error('Import Products Error:', error);
    res.status(500).json({ error: 'Failed to import catalog.' });
  }
}

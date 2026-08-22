"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProduct = createProduct;
exports.listProducts = listProducts;
exports.updateProduct = updateProduct;
exports.deleteProduct = deleteProduct;
exports.importProducts = importProducts;
const db_1 = require("../../config/db");
const embeddings_1 = require("../../utils/embeddings");
const logger_1 = require("../../utils/logger");
async function createProduct(req, res) {
    try {
        const merchantId = req.merchant?.id;
        const { externalId, title, description, price, currency, imageUrl, productUrl, category, inStock } = req.body;
        if (!externalId || !title || price === undefined || !productUrl) {
            res.status(400).json({ error: 'externalId, title, price, and productUrl are required.' });
            return;
        }
        // Generate vector embedding
        const textToEmbed = `${title} ${description || ''} ${category || ''}`;
        const vector = await (0, embeddings_1.generateEmbedding)(textToEmbed);
        const product = await db_1.prisma.product.create({
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
        await (0, db_1.executeRawNeonQuery)(`UPDATE "Product" SET embedding = $1 WHERE id = $2`, [vector, product.id]);
        res.status(201).json({ message: 'Product created successfully', product });
    }
    catch (error) {
        logger_1.logger.error('Create Product Error:', error);
        res.status(500).json({ error: 'Failed to create product.' });
    }
}
async function listProducts(req, res) {
    try {
        const merchantId = req.merchant?.id;
        const page = parseInt(req.query.page || '1', 10);
        const limit = parseInt(req.query.limit || '20', 10);
        const search = (req.query.search || '').trim();
        const skip = (page - 1) * limit;
        const where = { merchantId };
        if (search) {
            where.OR = [
                { title: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
                { category: { contains: search, mode: 'insensitive' } },
            ];
        }
        const [products, total] = await Promise.all([
            db_1.prisma.product.findMany({
                where,
                skip,
                take: limit,
                orderBy: { updatedAt: 'desc' },
            }),
            db_1.prisma.product.count({ where }),
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
    }
    catch (error) {
        logger_1.logger.error('List Products Error:', error);
        res.status(500).json({ error: 'Failed to fetch products.' });
    }
}
async function updateProduct(req, res) {
    try {
        const merchantId = req.merchant?.id;
        const productId = req.params.id;
        const { title, description, price, currency, imageUrl, productUrl, category, inStock } = req.body;
        const existingProduct = await db_1.prisma.product.findFirst({
            where: { id: productId, merchantId },
        });
        if (!existingProduct) {
            res.status(404).json({ error: 'Product not found.' });
            return;
        }
        const updatedProduct = await db_1.prisma.product.update({
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
            const vector = await (0, embeddings_1.generateEmbedding)(textToEmbed);
            await (0, db_1.executeRawNeonQuery)(`UPDATE "Product" SET embedding = $1 WHERE id = $2`, [vector, updatedProduct.id]);
        }
        res.json({ message: 'Product updated successfully', product: updatedProduct });
    }
    catch (error) {
        logger_1.logger.error('Update Product Error:', error);
        res.status(500).json({ error: 'Failed to update product.' });
    }
}
async function deleteProduct(req, res) {
    try {
        const merchantId = req.merchant?.id;
        const productId = req.params.id;
        const existingProduct = await db_1.prisma.product.findFirst({
            where: { id: productId, merchantId },
        });
        if (!existingProduct) {
            res.status(404).json({ error: 'Product not found.' });
            return;
        }
        await db_1.prisma.product.delete({ where: { id: productId } });
        res.json({ message: 'Product deleted successfully.' });
    }
    catch (error) {
        logger_1.logger.error('Delete Product Error:', error);
        res.status(500).json({ error: 'Failed to delete product.' });
    }
}
async function importProducts(req, res) {
    try {
        const merchantId = req.merchant?.id;
        const { products } = req.body;
        if (!Array.isArray(products) || products.length === 0) {
            res.status(400).json({ error: 'Body must contain a non-empty products array.' });
            return;
        }
        let createdCount = 0;
        let updatedCount = 0;
        for (const [idx, item] of products.entries()) {
            if (!item.title || item.price === undefined) {
                continue;
            }
            const externalId = String(item.externalId || item.sku || `item_${Date.now()}_${idx}`);
            const productUrl = String(item.productUrl || item.url || `/products#${externalId}`);
            const textToEmbed = `${item.title} ${item.description || ''} ${item.category || ''}`;
            const vector = await (0, embeddings_1.generateEmbedding)(textToEmbed);
            const existing = await db_1.prisma.product.findUnique({
                where: { merchantId_externalId: { merchantId, externalId } },
            });
            if (existing) {
                const updated = await db_1.prisma.product.update({
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
                await (0, db_1.executeRawNeonQuery)(`UPDATE "Product" SET embedding = $1 WHERE id = $2`, [vector, updated.id]);
                updatedCount++;
            }
            else {
                const created = await db_1.prisma.product.create({
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
                await (0, db_1.executeRawNeonQuery)(`UPDATE "Product" SET embedding = $1 WHERE id = $2`, [vector, created.id]);
                createdCount++;
            }
        }
        res.json({
            message: 'Import complete',
            createdCount,
            updatedCount,
            totalProcessed: createdCount + updatedCount,
        });
    }
    catch (error) {
        logger_1.logger.error('Import Products Error:', error);
        res.status(500).json({ error: 'Failed to import catalog.' });
    }
}

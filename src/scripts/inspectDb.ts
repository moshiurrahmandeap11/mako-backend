import { prisma } from '../config/db';

async function inspect() {
  const merchants = await prisma.user.findMany({
    select: { id: true, name: true, email: true, allowedDomains: true },
  });

  for (const m of merchants) {
    const chunkCount = await prisma.knowledgeChunk.count({ where: { merchantId: m.id } });
    console.log(`\n======================================================`);
    console.log(`Merchant: ${m.name} | Email: ${m.email} | ID: ${m.id}`);
    console.log(`Allowed Domains:`, m.allowedDomains);
    console.log(`Total Knowledge Chunks: ${chunkCount}`);

    const chunks = await prisma.knowledgeChunk.findMany({
      where: { merchantId: m.id },
      select: { id: true, url: true, content: true },
      take: 15,
    });

    chunks.forEach((c, idx) => {
      console.log(`\n--- [Chunk ${idx + 1}] Source: ${c.url} ---`);
      console.log(c.content.substring(0, 300) + (c.content.length > 300 ? '...' : ''));
    });

    const products = await prisma.product.findMany({
      where: { merchantId: m.id },
      select: { id: true, title: true, price: true, productUrl: true },
    });
    console.log(`\nProducts (${products.length}):`, products);
  }
}

inspect().then(() => {
  prisma.$disconnect();
  process.exit(0);
});

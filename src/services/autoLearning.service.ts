import { prisma } from '../config/db';
import { generateEmbedding } from '../utils/embeddings';
import { keyRotator } from '../utils/keyRotator';
import { logger } from '../utils/logger';

/**
 * Asynchronously inspects a completed/active conversation, extracts reusable store Q&A knowledge,
 * redacting all PII (names, phone numbers, addresses, emails, order IDs),
 * generates vector embeddings, and saves them to pgvector as auto-learned knowledge chunks.
 */
export async function autoLearnFromConversation(merchantId: string, sessionId: string): Promise<void> {
  try {
    const conversation = await prisma.conversation.findFirst({
      where: { merchantId, sessionId },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 30 } },
    });

    if (!conversation || conversation.messages.length < 2) {
      return; // Not enough message turns to learn from
    }

    // Format chat transcript
    const transcript = conversation.messages
      .map((m) => `${m.role === 'user' ? 'Customer' : 'Assistant'}: ${m.content}`)
      .join('\n');

    const extractionPrompt = `You are an AI Data Sanitizer and Knowledge Extractor.
Analyze the following customer support chat transcript between a Customer and an AI Assistant:

--- TRANSCRIPT START ---
${transcript}
--- TRANSCRIPT END ---

Your task is to extract general, reusable store Knowledge Q&A pairs (e.g. shipping fees, return policies, showcase portfolio capabilities, pricing details, custom service offerings, store locations).

STRICT EXTRACTION RULES:
1. PRIVACY & PII REDACTION (CRITICAL): Strip ALL Personally Identifiable Information — customer names, phone numbers, delivery addresses, personal order IDs, emails, payment details.
2. NOISE FILTER: Ignore simple greetings ("hi", "hello", "thanks", "bye"), casual small talk, or raw code snippets.
3. FACTUALITY: Only extract Q&A pairs where the Assistant provided a clear, helpful, factual answer.
4. Output MUST be a valid JSON array of objects with "question" and "answer" keys.
Example format:
[
  {
    "question": "What is the delivery fee for orders outside Dhaka?",
    "answer": "Delivery fee for outside Dhaka is 150 BDT."
  }
]
If NO reusable store factual knowledge exists in this transcript, return an empty array: [].`;

    let extractedJsonStr = '';

    // Call fast LLM via keyRotator
    if (keyRotator.hasGeminiKeys()) {
      const res = await keyRotator.executeGeminiCompletion(
        'gemini-3.6-flash',
        [{ role: 'user', content: extractionPrompt }],
        450
      );
      extractedJsonStr = res.content;
    } else if (keyRotator.hasGroqKeys()) {
      const res = await keyRotator.executeGroqCompletion(
        'llama-3.3-70b-versatile',
        [{ role: 'user', content: extractionPrompt }],
        450
      );
      extractedJsonStr = res.content;
    } else if (keyRotator.hasOpenRouterKeys()) {
      const res = await keyRotator.executeOpenRouterCompletion(
        'google/gemini-2.5-flash',
        [{ role: 'user', content: extractionPrompt }],
        450
      );
      extractedJsonStr = res.content;
    }

    if (!extractedJsonStr) return;

    // Parse JSON array out of response
    const jsonMatch = extractedJsonStr.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;

    const qaPairs: { question: string; answer: string }[] = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(qaPairs) || qaPairs.length === 0) return;

    for (const item of qaPairs) {
      if (!item.question || !item.answer) continue;

      const formattedContent = `[Auto-Learned FAQ]\nQuestion: ${item.question.trim()}\nAnswer: ${item.answer.trim()}`;
      const sourceUrl = 'Chat History (Auto-Learned)';

      // Check if highly identical chunk already exists to prevent duplicate vectors
      const existing = await prisma.knowledgeChunk.findFirst({
        where: {
          merchantId,
          url: sourceUrl,
          content: formattedContent,
        },
      });

      if (existing) continue;

      // Generate embedding and save chunk
      const embedding = await generateEmbedding(formattedContent);

      await prisma.$executeRawUnsafe(
        `INSERT INTO "KnowledgeChunk" ("id", "merchantId", "url", "content", "embedding", "createdAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4::vector, NOW())`,
        merchantId,
        sourceUrl,
        formattedContent,
        JSON.stringify(embedding)
      );

      logger.info(`[AutoLearning] Automatically indexed Q&A for merchant ${merchantId}: "${item.question}"`);
    }
  } catch (error) {
    logger.error('[AutoLearning] Error in background conversation auto-learning:', error);
  }
}

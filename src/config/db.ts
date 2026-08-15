import { PrismaClient } from '@prisma/client';
import https from 'https';
import { env } from './env';
import { logger } from '../utils/logger';

export const prisma = new PrismaClient();

const connectionString = env.DATABASE_URL;

function getNeonSqlEndpoint(connStr: string): string {
  try {
    const sanitized = connStr.replace(/^postgres(ql)?:\/\//i, 'http://');
    const parsed = new URL(sanitized);
    return `https://${parsed.host}/sql`;
  } catch {
    return 'https://ep-long-cell-ay5y8og7-pooler.c-5.us-east-2.aws.neon.tech/sql';
  }
}

// Raw HTTPS query helper for pgvector cosine similarity search
export function executeRawNeonQuery<T = any>(query: string, params: any[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    if (!connectionString) {
      resolve([]);
      return;
    }

    let formattedQuery = query;
    params.forEach((param, index) => {
      let valStr = '';
      if (Array.isArray(param)) {
        valStr = `'[${param.join(',')}]'::vector`;
      } else if (typeof param === 'string') {
        valStr = `'${param.replace(/'/g, "''")}'`;
      } else if (param === null || param === undefined) {
        valStr = 'NULL';
      } else {
        valStr = String(param);
      }
      formattedQuery = formattedQuery.replace(new RegExp(`\\$${index + 1}`, 'g'), valStr);
    });

    const endpoint = getNeonSqlEndpoint(connectionString);
    const data = JSON.stringify({ query: formattedQuery });

    const req = https.request(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Neon-Connection-String': connectionString,
          'Content-Length': Buffer.byteLength(data),
        },
        family: 4,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsed = JSON.parse(body);
              resolve(parsed.rows || []);
            } catch (e) {
              resolve([]);
            }
          } else {
            logger.warn(`Neon HTTP SQL returned status ${res.statusCode}: ${body}`);
            resolve([]);
          }
        });
      }
    );

    req.on('error', (err) => {
      logger.warn('Neon HTTPS request failed:', err.message);
      resolve([]);
    });
    req.write(data);
    req.end();
  });
}

export async function connectDB() {
  try {
    await prisma.$connect();
    logger.info('Connected to PostgreSQL Database via Prisma');
  } catch (error) {
    logger.warn('Prisma $connect notice:', error);
  }
}

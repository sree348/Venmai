import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString || connectionString === 'placeholder') {
  console.warn('DATABASE_URL is not configured. Prisma routes require a real PostgreSQL connection.');
}

const pool = new Pool({
  connectionString: connectionString && connectionString !== 'placeholder' ? connectionString : undefined,
});
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });

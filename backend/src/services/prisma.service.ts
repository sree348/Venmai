import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString || connectionString === 'placeholder') {
  console.warn('DATABASE_URL is not configured. Prisma routes require a real PostgreSQL connection.');
}

function buildPoolConfig() {
  if (!connectionString || connectionString === 'placeholder') {
    return undefined;
  }

  // Render Postgres requires SSL for external URLs; internal URLs are fine either way.
  const needsSsl =
    /sslmode=require/i.test(connectionString) ||
    /onrender\.com/i.test(connectionString) ||
    process.env.NODE_ENV === 'production';

  return {
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  };
}

const pool = new Pool(buildPoolConfig());
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });

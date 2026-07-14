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

  // External Render URLs (*.onrender.com / sslmode=require) need TLS.
  // Internal Render DB hosts (dpg-*-a) should not force SSL — that can hang boot.
  const needsSsl =
    /sslmode=require/i.test(connectionString) ||
    /\.onrender\.com/i.test(connectionString);

  return {
    connectionString,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    max: 5,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  };
}

const pool = new Pool(buildPoolConfig());
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });

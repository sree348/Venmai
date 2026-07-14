import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../services/prisma.service.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const agentDataDir = path.resolve(currentDir, '../../agent-data');

/** Prefer a single high-signal dataset so startup stays under Render's boot window. */
const PREFERRED_FILES = [
  'cai_mahindra_2026-04-20_to_2026-05-31.csv',
  'agency_2026-04-20_to_2026-05-31.csv',
];

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cols[index] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  values.push(current);
  return values.map(value => value.trim());
}

function toNumber(value: string | undefined, fallback = 0) {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function readSeedRows() {
  for (const file of PREFERRED_FILES) {
    try {
      const text = await readFile(path.join(agentDataDir, file), 'utf8');
      const rows = parseCsv(text);
      if (rows.length > 0) {
        console.log(`[seed] using ${file} (${rows.length} rows)`);
        return rows;
      }
    } catch {
      // try next preferred file
    }
  }
  return [];
}

async function seedFromCsv() {
  const existing = await prisma.campaignData.count();
  if (existing > 0) {
    console.log(`[seed] campaign_data already has ${existing} rows; skipping.`);
    return;
  }

  const allRows = await readSeedRows();
  if (allRows.length === 0) {
    console.warn('[seed] No CSV rows found; skipping.');
    return;
  }

  const parsedDates = allRows
    .map(row => new Date(`${row.date}T00:00:00.000Z`))
    .filter(date => !Number.isNaN(date.getTime()));
  const maxSourceTime = parsedDates.length
    ? Math.max(...parsedDates.map(date => date.getTime()))
    : Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const targetMax = Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate() - 1,
  );
  const shiftMs = targetMax - maxSourceTime;

  const byKey = new Map<string, {
    tenantId: string;
    clientId: string | null;
    date: Date;
    platform: string;
    campaignId: string;
    campaignName: string;
    spend: number;
    impressions: number;
    clicks: number;
    reach: number;
    frequency: number;
    ctr: number;
    cpc: number;
    cpm: number;
    conversions: number;
    actionValue: number;
    roas: number | null;
    status: string;
  }>();

  for (const row of allRows) {
    const tenantId = row.tenant_id || 'agency';
    const campaignId = row.campaign_id;
    const dateRaw = row.date;
    if (!campaignId || !dateRaw) continue;

    const sourceDate = new Date(`${dateRaw}T00:00:00.000Z`);
    if (Number.isNaN(sourceDate.getTime())) continue;
    const date = new Date(sourceDate.getTime() + shiftMs);
    const platformRaw = (row.platform || 'meta').toLowerCase();
    const platform = platformRaw.charAt(0).toUpperCase() + platformRaw.slice(1);
    const key = `${tenantId}|${date.toISOString()}|${campaignId}`;

    byKey.set(key, {
      tenantId,
      clientId: row.client_id || null,
      date,
      platform,
      campaignId,
      campaignName: row.campaign_name || campaignId,
      spend: toNumber(row.spend),
      impressions: Math.round(toNumber(row.impressions)),
      clicks: Math.round(toNumber(row.clicks)),
      reach: Math.round(toNumber(row.reach)),
      frequency: toNumber(row.frequency),
      ctr: toNumber(row.ctr),
      cpc: toNumber(row.cpc),
      cpm: toNumber(row.cpm),
      conversions: Math.round(toNumber(row.conversions)),
      actionValue: toNumber(row.action_value),
      roas: row.roas ? toNumber(row.roas) : null,
      status: row.status || 'active',
    });
  }

  const records = [...byKey.values()];
  const chunkSize = 100;
  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    await prisma.campaignData.createMany({
      data: chunk,
      skipDuplicates: true,
    });
  }

  console.log(`[seed] inserted ${records.length} campaign_data rows (shifted by ${Math.round(shiftMs / dayMs)} days).`);
}

seedFromCsv()
  .catch(error => {
    console.error('[seed] failed (non-fatal):', error);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });

import 'dotenv/config';
import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { prisma } from '../services/prisma.service.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const agentDataDir = path.resolve(currentDir, '../../agent-data');

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

async function loadCsv(filePath: string) {
  const stream = createReadStream(filePath, { encoding: 'utf8' });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  let headers: string[] = [];
  const rows: Record<string, string>[] = [];

  for await (const line of lines) {
    if (!line.trim()) continue;
    const cols = parseCsvLine(line);
    if (headers.length === 0) {
      headers = cols;
      continue;
    }
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cols[index] ?? '';
    });
    rows.push(row);
  }

  return rows;
}

async function seedFromCsv() {
  const existing = await prisma.campaignData.count();
  if (existing > 0) {
    console.log(`[seed] campaign_data already has ${existing} rows; skipping.`);
    return;
  }

  const files = (await readdir(agentDataDir))
    .filter(name => name.endsWith('.csv'))
    .sort();

  if (files.length === 0) {
    console.warn('[seed] No CSV files found in agent-data.');
    return;
  }

  let inserted = 0;
  const allRows: Record<string, string>[] = [];
  for (const file of files) {
    const rows = await loadCsv(path.join(agentDataDir, file));
    allRows.push(...rows);
    console.log(`[seed] loaded ${rows.length} rows from ${file}`);
  }

  const parsedDates = allRows
    .map(row => new Date(`${row.date}T00:00:00.000Z`))
    .filter(date => !Number.isNaN(date.getTime()));
  const maxSourceTime = parsedDates.length
    ? Math.max(...parsedDates.map(date => date.getTime()))
    : Date.now();
  // Shift historical CSV dates so the newest day lands on yesterday (keeps dashboards in range).
  const dayMs = 24 * 60 * 60 * 1000;
  const targetMax = Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate() - 1,
  );
  const shiftMs = targetMax - maxSourceTime;

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

    await prisma.campaignData.upsert({
      where: {
        tenantId_date_campaignId: {
          tenantId,
          date,
          campaignId,
        },
      },
      create: {
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
      },
      update: {
        clientId: row.client_id || null,
        platform,
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
      },
    });
    inserted += 1;
  }

  console.log(`[seed] upserted ${inserted} campaign_data rows (shifted by ${Math.round(shiftMs / dayMs)} days).`);
}

seedFromCsv()
  .catch(error => {
    console.error('[seed] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

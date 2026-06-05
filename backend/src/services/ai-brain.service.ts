// ─────────────────────────────────────────────────────────────────────────────
// ai-brain.service.ts — updated to use prompts/index.js
// Changes from original:
//   • All inline system prompt strings replaced with imported builders
//   • CONVERSATION_HISTORY_LIMIT raised 6 → 12
//   • resolveAmbiguousFollowup: no more .slice(0,300) truncation
//   • buildMetaAdsReply: mdSnapshot token guard (trims to top campaigns by spend)
//   • AI_BRAIN_DATE_WINDOW: now derived from DB, falls back to hardcoded
// ─────────────────────────────────────────────────────────────────────────────

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from './prisma.service.js';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import {
  KNOWLEDGE_BASE_PROMPT,
  buildAnalystPrompt,
  buildAmbiguousPrompt,
  buildClassifierPrompt,
  formatHistory,
  type ConversationMessage,
} from './prompts/index.js';

// ─── Tone ────────────────────────────────────────────────────────────────────
export const MIP_AI_TONE = 'Sharp, fast, specific, senior, action-first, data-grounded, and never generic.';
export const MARBLISM_AI_TONE = MIP_AI_TONE;

// ─── Types ───────────────────────────────────────────────────────────────────
export type AiIntent = 'knowledge_base' | 'meta_ads_search' | 'ambiguous_followup';

export interface ClassifyResult {
  intent: AiIntent;
  confidence: 'high' | 'medium' | 'low';
  detected_entities: string[];
}

export { ConversationMessage };

// ─── Constants ───────────────────────────────────────────────────────────────
// Raised from 6 → 12: agency analysts ask 8–12 turn chains per campaign
const CONVERSATION_HISTORY_LIMIT = 12;

// Guard: if snapshot exceeds this, trim to top campaigns by spend
const MAX_SNAPSHOT_CHARS = 24_000; // ~8K tokens

const META_ANALYTICS_TERMS = [
  'ad', 'ads', 'campaign', 'campaigns', 'meta', 'facebook', 'instagram',
  'spend', 'budget', 'cpc', 'cpl', 'ctr', 'cpm', 'roas',
  'lead', 'leads', 'conversion', 'conversions',
  'click', 'clicks', 'impression', 'impressions',
  'frequency', 'fatigue', 'pause', 'scale',
  'performance', 'waste', 'report', 'worst', 'best',
  'urgent', 'immediate', 'compare', 'why', 'how much',
];

const GREETING_PATTERNS = [
  /\bhi\b/i, /\bhello\b/i, /\bhey\b/i,
  /\bgood\s+(morning|afternoon|evening)\b/i,
  /\bthanks?\b/i, /\bthank\s+you\b/i,
  /\bwelcome\b/i, /\bwho\s+are\s+you\b/i,
  /வணக்கம்/, /நன்றி/,
];

// ─── Date Window ─────────────────────────────────────────────────────────────
export const AI_BRAIN_DATE_WINDOW_FALLBACK = {
  from: '2026-04-20',
  to: '2026-05-31',
};

/**
 * Derive date window from actual DB data for a client.
 * Falls back to hardcoded window if no data found.
 */
export async function getDateWindow(
  tenantId: string,
  clientId?: string | null,
): Promise<{ from: string; to: string }> {
  try {
    const agg = await prisma.campaignData.aggregate({
      where: {
        tenantId,
        ...(clientId && clientId !== 'agency' ? { clientId } : {}),
      },
      _min: { date: true },
      _max: { date: true },
    });
    const from = agg._min.date?.toISOString().slice(0, 10);
    const to = agg._max.date?.toISOString().slice(0, 10);
    if (from && to) return { from, to };
  } catch {
    // fall through to hardcoded
  }
  return AI_BRAIN_DATE_WINDOW_FALLBACK;
}

// Keep static export for places that still need a fixed window reference
export const AI_BRAIN_DATE_WINDOW = AI_BRAIN_DATE_WINDOW_FALLBACK;

// ─── Framework ───────────────────────────────────────────────────────────────
export const AI_BRAIN_FRAMEWORK = {
  framework: 'LangChain',
  modelProvider: 'Anthropic / OpenAI',
  purpose: 'Route knowledge-base replies locally; complex Meta Ads questions into campaign data retrieval.',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function dateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function endOfDate(value: string) {
  return new Date(`${value}T23:59:59.999Z`);
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function toMoney(value: number) {
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function getLlmModel(temperature = 0.1, modelKwargs?: Record<string, unknown>) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (anthropicKey) {
    const anthropicModel = process.env.ANTHROPIC_MODEL || process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
    return new ChatAnthropic({
      apiKey: anthropicKey,
      model: anthropicModel,
      temperature,
      maxRetries: 0,
    });
  }
  return new ChatOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MINI_MODEL || 'gpt-4o-mini',
    temperature,
    modelKwargs,
  } as any);
}

/**
 * Guard against oversized snapshots.
 * Trims markdown to first MAX_SNAPSHOT_CHARS characters.
 * If over limit, keeps the Account Totals and Benchmarks sections,
 * then truncates the Campaign Summary table to the top rows.
 */
function guardSnapshotSize(mdSnapshot: string): string {
  if (mdSnapshot.length <= MAX_SNAPSHOT_CHARS) return mdSnapshot;

  // Keep everything up to Campaign Summary table, then truncate rows
  const cutMarker = '## Campaign Summary';
  const cutIndex = mdSnapshot.indexOf(cutMarker);
  if (cutIndex === -1) return mdSnapshot.slice(0, MAX_SNAPSHOT_CHARS);

  const header = mdSnapshot.slice(0, cutIndex + cutMarker.length);
  const body = mdSnapshot.slice(cutIndex + cutMarker.length);
  const lines = body.split('\n');

  let kept = '';
  let chars = header.length;
  for (const line of lines) {
    if (chars + line.length > MAX_SNAPSHOT_CHARS) break;
    kept += line + '\n';
    chars += line.length + 1;
  }

  return header + kept + '\n\n[Snapshot truncated — showing top campaigns by spend only]\n';
}

function cleanJsonString(str: string): string {
  let clean = str.trim();
  if (clean.includes('</think>')) {
    clean = clean.split('</think>').pop()!.trim();
  }
  if (clean.startsWith('```')) {
    const lines = clean.split('\n');
    if (lines[0].startsWith('```')) lines.shift();
    if (lines[lines.length - 1].startsWith('```')) lines.pop();
    clean = lines.join('\n').trim();
  }
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    clean = clean.substring(firstBrace, lastBrace + 1);
  }
  return clean;
}

// ─── Intent Classifier ───────────────────────────────────────────────────────
export async function classifyAiIntent(
  prompt: string,
  conversationHistory: ConversationMessage[] = [],
): Promise<ClassifyResult> {
  const normalized = prompt.trim().toLowerCase();

  // Fast path: pure greeting — skip LLM call entirely
  const hasMetaTerm = META_ANALYTICS_TERMS.some(t => normalized.includes(t));
  if (!hasMetaTerm && GREETING_PATTERNS.some(p => p.test(prompt))) {
    return { intent: 'knowledge_base', confidence: 'high', detected_entities: [] };
  }

  const apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return { intent: 'meta_ads_search', confidence: 'low', detected_entities: [] };
  }

  try {
    const model = getLlmModel(0.1, { response_format: { type: 'json_object' } });
    const filledPrompt = buildClassifierPrompt(conversationHistory);

    const response = await model.invoke([
      new SystemMessage(filledPrompt),
      new HumanMessage(prompt),
    ]);

    const raw = String(response.content).trim();
    const result: ClassifyResult = JSON.parse(cleanJsonString(raw));

    if (['knowledge_base', 'meta_ads_search', 'ambiguous_followup'].includes(result.intent)) {
      return result;
    }
  } catch (err) {
    console.error('[classifyAiIntent] LLM failed, keyword fallback:', err);
  }

  return {
    intent: hasMetaTerm ? 'meta_ads_search' : 'knowledge_base',
    confidence: 'low',
    detected_entities: [],
  };
}

// ─── Knowledge Base Reply ────────────────────────────────────────────────────
export async function buildKnowledgeBaseReply(prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;

  if (apiKey) {
    try {
      const model = getLlmModel(0.3);
      const response = await model.invoke([
        new SystemMessage(KNOWLEDGE_BASE_PROMPT),
        new HumanMessage(prompt),
      ]);
      return String(response.content).trim();
    } catch (err) {
      console.error('[buildKnowledgeBaseReply] LLM failed, static fallback:', err);
    }
  }

  // Static fallback
  const n = prompt.trim().toLowerCase();
  if (/\bthanks?\b|\bthank\s+you\b|நன்றி/.test(n))
    return 'You are welcome. Ask me which campaign is wasting budget today.';
  if (/\bwho\s+are\s+you\b/.test(n))
    return "I am MIP — CAI Media's Meta Ads intelligence agent. I can tell you which campaign has the worst CPL right now, which creative is showing fatigue, and where your budget is leaking.";
  return "Hello. I am MIP — CAI Media's Meta Ads brain. Ask me about spend, CPL, fatigue, or scaling and I will give you the real numbers.";
}

// ─── Meta Ads Reply ──────────────────────────────────────────────────────────
export async function buildMetaAdsReply(
  prompt: string,
  mdSnapshot: string,
  conversationHistory: ConversationMessage[] = [],
  detectedEntities: string[] = [],
): Promise<string> {
  if (!mdSnapshot || mdSnapshot.trim().length < 100) {
    return 'No campaign data is available for this client. Please sync your Meta Ads data first.';
  }

  const safeSnapshot = guardSnapshotSize(mdSnapshot);
  const model = getLlmModel(0.2);

  const historyMessages = conversationHistory
    .slice(-CONVERSATION_HISTORY_LIMIT)
    .map(m => m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content));

  const systemPrompt = buildAnalystPrompt(safeSnapshot, detectedEntities);

  const response = await model.invoke([
    new SystemMessage(systemPrompt),
    ...historyMessages,
    new HumanMessage(prompt),
  ]);

  return String(response.content).trim();
}

// ─── Ambiguous Followup Handler ──────────────────────────────────────────────
export async function resolveAmbiguousFollowup(
  prompt: string,
  mdSnapshot: string,
  conversationHistory: ConversationMessage[],
): Promise<string> {
  const safeSnapshot = guardSnapshotSize(mdSnapshot);
  const model = getLlmModel(0.2);

  // Use full conversation — no truncation (fix from original .slice(0,300))
  const systemPrompt = buildAmbiguousPrompt(safeSnapshot, conversationHistory);

  const historyMessages = conversationHistory
    .slice(-CONVERSATION_HISTORY_LIMIT)
    .map(m => m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content));

  const response = await model.invoke([
    new SystemMessage(systemPrompt),
    ...historyMessages,
    new HumanMessage(prompt),
  ]);

  return String(response.content).trim();
}

// ─── Main Chat Router ─────────────────────────────────────────────────────────
export async function handleAgentChat(params: {
  prompt: string;
  mdSnapshot: string;
  conversationHistory?: ConversationMessage[];
}): Promise<{ reply: string; intent: AiIntent; entities: string[] }> {
  const { prompt, mdSnapshot, conversationHistory = [] } = params;

  const classified = await classifyAiIntent(prompt, conversationHistory);
  const { intent, detected_entities } = classified;

  let reply: string;

  if (intent === 'knowledge_base') {
    reply = await buildKnowledgeBaseReply(prompt);
  } else if (intent === 'ambiguous_followup') {
    reply = await resolveAmbiguousFollowup(prompt, mdSnapshot, conversationHistory);
  } else {
    reply = await buildMetaAdsReply(prompt, mdSnapshot, conversationHistory, detected_entities);
  }

  return { reply, intent, entities: detected_entities };
}

// ─── Extract Widget ──────────────────────────────────────────────────────────
/**
 * Extract widget metadata block (chartdata) from the LLM markdown response.
 */
export function extractWidgetFromMarkdown(content: string): any {
  const chartdataRegex = /```chartdata\s*(\{[\s\S]*?\})\s*```|chartdata\s*(\{[\s\S]*?\})(?=\s*(?:\||#|---|$))/gi;
  const match = chartdataRegex.exec(content);
  if (match) {
    try {
      const jsonStr = (match[1] || match[2] || '').trim();
      const chartJson = JSON.parse(jsonStr);

      const mappedData = chartJson.labels?.map((label: string, idx: number) => {
        const record: Record<string, any> = { label };
        chartJson.datasets?.forEach((dataset: any) => {
          record[dataset.label || 'value'] = dataset.data?.[idx] ?? 0;
        });
        return record;
      }) || [];

      return {
        chart_type: chartJson.type === 'line' ? 'line_chart' : 'bar_chart',
        title: chartJson.title || 'Campaign Performance Comparison',
        data: mappedData,
        config: {
          x_axis: 'label',
          y_axis: chartJson.datasets?.[0]?.label || 'value',
          sort: null,
        },
        sql: '',
      };
    } catch (e) {
      console.warn('Failed to parse chartdata from response:', e);
    }
  }
  return null;
}

// ─── Streaming variant (wire to SSE route) ───────────────────────────────────
export const STREAMING_ROUTE_EXAMPLE = 'See comment in prompts/index.ts or agent.service.ts for SSE streaming wiring.';

// ─── Data Pruning ─────────────────────────────────────────────────────────────
export async function pruneCampaignDataOutsideBrainWindow(
  tenantId: string,
  clientId?: string | null,
) {
  const window = await getDateWindow(tenantId, clientId);
  const result = await prisma.campaignData.deleteMany({
    where: {
      tenantId,
      ...(clientId && clientId !== 'agency' ? { clientId } : {}),
      OR: [
        { date: { lt: dateOnly(window.from) } },
        { date: { gt: endOfDate(window.to) } },
      ],
    },
  });
  return result.count;
}

// ─── Export Agent Snapshot ────────────────────────────────────────────────────
export async function exportAgentDataSnapshot(tenantId: string, clientId?: string | null) {
  const window = await getDateWindow(tenantId, clientId);
  const from = dateOnly(window.from);
  const to = endOfDate(window.to);

  const rows = await prisma.campaignData.findMany({
    where: {
      tenantId,
      ...(clientId && clientId !== 'agency' ? { clientId } : {}),
      date: { gte: from, lte: to },
    },
    orderBy: [{ date: 'asc' }, { campaignName: 'asc' }],
  });

  const grouped = await prisma.campaignData.groupBy({
    by: ['campaignId', 'campaignName', 'platform', 'status'],
    where: {
      tenantId,
      ...(clientId && clientId !== 'agency' ? { clientId } : {}),
      date: { gte: from, lte: to },
    },
    _sum: { spend: true, impressions: true, clicks: true, reach: true, conversions: true, actionValue: true },
    _avg: { frequency: true },
  });

  const campaignSummary = grouped.map(campaign => {
    const spend = Number(campaign._sum.spend ?? 0);
    const clicks = Number(campaign._sum.clicks ?? 0);
    const impressions = Number(campaign._sum.impressions ?? 0);
    const conversions = Number(campaign._sum.conversions ?? 0);
    const actionValue = Number(campaign._sum.actionValue ?? 0);
    const frequency = Number(campaign._avg.frequency ?? 0);

    // NOTE: 'commercial' checked first — wins for mixed names like "XEV Commercial May"
    const name = campaign.campaignName.toLowerCase();
    const type = name.includes('commercial') ? 'COMMERCIAL'
      : name.includes('branding') || name.includes('insta') || name.includes('esuv') ? 'BRANDING'
      : 'LEAD_GEN';

    return {
      campaignId: campaign.campaignId,
      campaignName: campaign.campaignName,
      platform: campaign.platform,
      status: campaign.status,
      type,
      spend,
      impressions,
      clicks,
      reach: Number(campaign._sum.reach ?? 0),
      conversions,
      actionValue,
      frequency,
      cpc: clicks > 0 ? spend / clicks : null,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      cpl: conversions > 0 ? spend / conversions : null,
      cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
      roas: spend > 0 && actionValue > 0 ? actionValue / spend : null,
    };
  });

  // Sort by spend descending for snapshot (top campaigns first)
  campaignSummary.sort((a, b) => b.spend - a.spend);

  const benchmarks = {
    LEAD_GEN: campaignSummary.filter(c => c.type === 'LEAD_GEN' && c.cpl !== null).sort((a, b) => (a.cpl ?? 0) - (b.cpl ?? 0))[0] ?? null,
    COMMERCIAL: campaignSummary.filter(c => c.type === 'COMMERCIAL').sort((a, b) => b.ctr - a.ctr)[0] ?? null,
    BRANDING: campaignSummary.filter(c => c.type === 'BRANDING' && c.cpm !== null).sort((a, b) => (a.cpm ?? 0) - (b.cpm ?? 0))[0] ?? null,
  };

  const totalSpend = campaignSummary.reduce((s, r) => s + r.spend, 0);
  const totalClicks = campaignSummary.reduce((s, r) => s + r.clicks, 0);
  const totalConversions = campaignSummary.reduce((s, r) => s + r.conversions, 0);
  const totalImpressions = campaignSummary.reduce((s, r) => s + r.impressions, 0);

  const outputDir = path.resolve(process.cwd(), 'agent-data');
  await mkdir(outputDir, { recursive: true });

  const scope = clientId && clientId !== 'agency' ? clientId : tenantId;
  const baseName = `${scope}_${window.from}_to_${window.to}`;
  const csvPath = path.join(outputDir, `${baseName}.csv`);
  const mdPath = path.join(outputDir, `${baseName}.md`);

  const csvHeaders = [
    'date','tenant_id','client_id','platform',
    'campaign_id','campaign_name','campaign_type',
    'spend','impressions','clicks','reach','frequency',
    'ctr','cpc','cpm','conversions','action_value','roas','status',
  ];

  const csv = [
    csvHeaders.join(','),
    ...rows.map(row => {
      const rn = row.campaignName.toLowerCase();
      const rt = rn.includes('commercial') ? 'COMMERCIAL'
        : rn.includes('branding') || rn.includes('insta') || rn.includes('esuv') ? 'BRANDING'
        : 'LEAD_GEN';
      return [
        row.date.toISOString().slice(0, 10), row.tenantId, row.clientId ?? '',
        row.platform, row.campaignId, row.campaignName, rt,
        row.spend, row.impressions, row.clicks, row.reach, row.frequency,
        row.ctr, row.cpc, row.cpm, row.conversions, row.actionValue, row.roas ?? '', row.status,
      ].map(csvCell).join(',');
    }),
  ].join('\n');

  const campaignRows = campaignSummary.map(row => {
    const benchmark = benchmarks[row.type as keyof typeof benchmarks];
    const action =
      row.conversions === 0 && row.spend > 1000 ? '🔴 Pause or audit waste' :
      row.frequency >= 4 ? '🔴 Refresh creative NOW' :
      row.frequency >= 3 ? '⚠️ Refresh creative' :
      row.cpl !== null && row.cpl <= 150 ? '✅ Scale carefully' : '👀 Monitor';
    const benchmarkNote = benchmark && benchmark.campaignName !== row.campaignName
      ? `vs ${benchmark.campaignName}` : 'This IS the benchmark';

    return `| ${row.campaignName} | ${row.type} | ${row.platform} | ${row.status} | ${toMoney(row.spend)} | ${row.clicks.toLocaleString('en-IN')} | ${row.conversions.toLocaleString('en-IN')} | ${row.cpl !== null ? toMoney(row.cpl) : 'N/A'} | ${row.ctr.toFixed(2)}% | ${row.cpm !== null ? toMoney(row.cpm) : 'N/A'} | ${row.frequency.toFixed(2)} | ${action} | ${benchmarkNote} |`;
  });

  const md = [
    '# MIP AI Brain — Campaign Data Snapshot',
    '',
    `**Date window:** ${window.from} → ${window.to}`,
    `**Tenant:** ${tenantId}  |  **Client:** ${clientId ?? 'agency'}`,
    `**Campaigns:** ${campaignSummary.length}  |  **Data rows:** ${rows.length}`,
    '',
    '## Account Totals',
    '| Metric | Value |',
    '|--------|-------|',
    `| Total Spend | ${toMoney(totalSpend)} |`,
    `| Total Clicks | ${totalClicks.toLocaleString('en-IN')} |`,
    `| Total Impressions | ${totalImpressions.toLocaleString('en-IN')} |`,
    `| Total Conversions | ${totalConversions.toLocaleString('en-IN')} |`,
    `| Blended CPC | ${totalClicks > 0 ? toMoney(totalSpend / totalClicks) : 'N/A'} |`,
    `| Blended CTR | ${totalImpressions > 0 ? `${((totalClicks / totalImpressions) * 100).toFixed(2)}%` : 'N/A'} |`,
    `| Blended CPL | ${totalConversions > 0 ? toMoney(totalSpend / totalConversions) : 'N/A'} |`,
    '',
    '## Benchmarks by Type',
    '| Type | Best Campaign | Key Metric |',
    '|------|--------------|------------|',
    benchmarks.LEAD_GEN ? `| LEAD_GEN | ${benchmarks.LEAD_GEN.campaignName} | CPL: ${toMoney(benchmarks.LEAD_GEN.cpl!)} |` : '| LEAD_GEN | No data | — |',
    benchmarks.COMMERCIAL ? `| COMMERCIAL | ${benchmarks.COMMERCIAL.campaignName} | CTR: ${benchmarks.COMMERCIAL.ctr.toFixed(2)}% |` : '| COMMERCIAL | No data | — |',
    benchmarks.BRANDING ? `| BRANDING | ${benchmarks.BRANDING.campaignName} | CPM: ${toMoney(benchmarks.BRANDING.cpm!)} |` : '| BRANDING | No data | — |',
    '',
    '## Campaign Summary (sorted by spend desc)',
    '| Campaign | Type | Platform | Status | Spend | Clicks | Conversions | CPL | CTR | CPM | Frequency | Action | Benchmark |',
    '|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|---|',
    ...campaignRows,
    '',
    '## Agent Rules',
    '- Greetings / thanks / chitchat → knowledge_base only.',
    '- All campaign/metric questions → search this snapshot first.',
    '- Campaign type priority: "commercial" wins over all others in name matching.',
    '- Benchmark within type only — never cross-type comparisons.',
    '- Every response ends with sticky hook: 2 insights + 3 questions with real ₹ numbers.',
    '',
    `## Tone`,
    'Sharp, fast, specific, senior, action-first, data-grounded. Never generic.',
  ].join('\n');

  await Promise.all([writeFile(csvPath, csv, 'utf8'), writeFile(mdPath, md, 'utf8')]);

  return {
    tenantId, clientId: clientId ?? null,
    dateWindow: window,
    framework: AI_BRAIN_FRAMEWORK,
    rows: rows.length, campaignCount: campaignSummary.length,
    benchmarks: {
      LEAD_GEN: benchmarks.LEAD_GEN?.campaignName ?? null,
      COMMERCIAL: benchmarks.COMMERCIAL?.campaignName ?? null,
      BRANDING: benchmarks.BRANDING?.campaignName ?? null,
    },
    csvPath, mdPath,
  };
}
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from './prisma.service.js';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';

// ─── Date Window ────────────────────────────────────────────────────────────
export const AI_BRAIN_DATE_WINDOW = {
  from: '2026-04-20',
  to: '2026-05-31',
};

// ─── Framework ──────────────────────────────────────────────────────────────
export const AI_BRAIN_FRAMEWORK = {
  framework: 'LangChain',
  modelProvider: 'OpenAI',
  purpose:
    'Route simple knowledge-base replies locally and complex CAI Media Meta Ads questions into campaign data retrieval.',
};

// ─── Tone ────────────────────────────────────────────────────────────────────
export const MIP_AI_TONE =
  'Sharp, fast, specific, senior, action-first, data-grounded, and never generic.';

export const MARBLISM_AI_TONE = MIP_AI_TONE;

// ─── Types ───────────────────────────────────────────────────────────────────
export type AiIntent = 'knowledge_base' | 'meta_ads_search' | 'ambiguous_followup';

export interface ClassifyResult {
  intent: AiIntent;
  confidence: 'high' | 'medium' | 'low';
  detected_entities: string[];
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────
const CONVERSATION_HISTORY_LIMIT = 6;

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
  /\bhi\b/i,
  /\bhello\b/i,
  /\bhey\b/i,
  /\bgood\s+(morning|afternoon|evening)\b/i,
  /\bthanks?\b/i,
  /\bthank\s+you\b/i,
  /\bwelcome\b/i,
  /\bwho\s+are\s+you\b/i,
  /வணக்கம்/,
  /நன்றி/,
];

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
  return `INR ${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
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

// ─── Intent Classifier ───────────────────────────────────────────────────────
export async function classifyAiIntent(
  prompt: string,
  conversationHistory: ConversationMessage[] = [],
): Promise<ClassifyResult> {
  const normalized = prompt.trim().toLowerCase();

  // Fast path: pure greeting with no marketing terms
  // NOTE: We test GREETING_PATTERNS against the original 'prompt', NOT 'normalized'.
  // This is intentional so that Tamil greeting patterns (/வணக்கம்/, /நன்றி/) match correctly,
  // preventing changes to 'normalized' from accidentally breaking Tamil support.
  const hasMetaTerm = META_ANALYTICS_TERMS.some(term => normalized.includes(term));
  if (!hasMetaTerm && GREETING_PATTERNS.some(pattern => pattern.test(prompt))) {
    return { intent: 'knowledge_base', confidence: 'high', detected_entities: [] };
  }

  const apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return { intent: 'meta_ads_search', confidence: 'low', detected_entities: [] };
  }

  try {
    const model = getLlmModel(0.1, { response_format: { type: 'json_object' } });

    const recentHistory = conversationHistory.slice(-CONVERSATION_HISTORY_LIMIT)
      .map(m => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n');

    const systemPrompt = `You are an intent classifier for a Meta Ads marketing analytics assistant.

TASK:
Classify the user's message into EXACTLY ONE intent. Return raw JSON only.

═══════════════════════════════════
INTENT DEFINITIONS
═══════════════════════════════════

"knowledge_base":
  - Greetings: "hi", "hello", "hey", "good morning", "வணக்கம்"
  - Farewells: "bye", "goodbye", "see you", "thanks", "thank you", "நன்றி"
  - Identity questions: "who are you", "what can you do", "help"
  - Chitchat: "how are you", "what's up", anything unrelated to ads/marketing
  - Compliments or feedback: "good", "nice", "great answer"

"meta_ads_search":
  - Campaign performance: spend, impressions, clicks, reach, frequency
  - Lead metrics: CPL, total leads, lead quality, form submissions
  - Efficiency metrics: CTR, CPC, CPM, ROAS, conversion rate
  - Campaign health: delivery status, budget pacing, ad fatigue
  - Actions: pause, scale, optimize, fix, launch, compare
  - Time-based queries: "last week", "this month", "April vs May"
  - Specific campaigns: any campaign name or ad set reference
  - Audience: targeting, lookalike, retargeting
  - Creatives: ad performance, best creative, worst creative
  - Analysis: worst, best, urgent, immediate attention needed

"ambiguous_followup":
  - Very short messages that depend on prior context: "what about this?", "and XEV?", "why?"
  - Pronoun-only references: "what about it", "show me that too"
  - Single words that could be campaign names or metrics

═══════════════════════════════════
RECENT CONVERSATION CONTEXT
═══════════════════════════════════
${recentHistory || 'No prior conversation.'}

═══════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════
Return ONLY valid JSON. No markdown. No explanation.

{
  "intent": "knowledge_base" | "meta_ads_search" | "ambiguous_followup",
  "confidence": "high" | "medium" | "low",
  "detected_entities": []
}

═══════════════════════════════════
EXAMPLES
═══════════════════════════════════
"hi" → {"intent":"knowledge_base","confidence":"high","detected_entities":[]}
"which campaign has worst CPL?" → {"intent":"meta_ads_search","confidence":"high","detected_entities":["CPL"]}
"what about XEV?" → {"intent":"ambiguous_followup","confidence":"high","detected_entities":["XEV"]}
"why?" → {"intent":"ambiguous_followup","confidence":"medium","detected_entities":[]}
"Commercial May performance" → {"intent":"meta_ads_search","confidence":"high","detected_entities":["Commercial May"]}
"நன்றி" → {"intent":"knowledge_base","confidence":"high","detected_entities":[]}
"Sales May vs Commercial May" → {"intent":"meta_ads_search","confidence":"high","detected_entities":["Sales May","Commercial May"]}`;

    const response = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(prompt),
    ]);

    const raw = String(response.content).trim();
    const result: ClassifyResult = JSON.parse(raw);

    if (['knowledge_base', 'meta_ads_search', 'ambiguous_followup'].includes(result.intent)) {
      return result;
    }
  } catch (err) {
    console.error('[classifyAiIntent] LLM failed, falling back to keyword match:', err);
  }

  // Keyword fallback
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
      const systemPrompt = `You are CAI Media's Meta Ads intelligence agent.
Tone: ${MIP_AI_TONE}
Respond to greetings, farewells, thanks, and chitchat warmly and concisely.
Always remind the user you are ready to analyze CAI Media campaign performance, waste, fatigue, and scaling opportunities.
Keep replies under 3 sentences.`;

      const response = await model.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(prompt),
      ]);

      return String(response.content).trim();
    } catch (err) {
      console.error('[buildKnowledgeBaseReply] LLM failed, using static fallback:', err);
    }
  }

  // Static fallback
  const normalized = prompt.trim().toLowerCase();
  if (/\bthanks?\b|\bthank\s+you\b|நன்றி/.test(normalized)) {
    return 'You are welcome. I am here when you want a clean read on CAI Media campaign movement, waste, fatigue, or scaling opportunities.';
  }
  if (/\bwho\s+are\s+you\b/.test(normalized)) {
    return "I am CAI Media's Meta Ads intelligence agent: focused on campaign health, budget risk, same-category benchmarks, and next actions.";
  }
  return "Hello. I am CAI Media's Meta Ads intelligence agent. Ask me naturally, and I will read the campaign data before giving you the real story.";
}

// ─── Meta Ads Reply ──────────────────────────────────────────────────────────
export async function buildMetaAdsReply(
  prompt: string,
  mdSnapshot: string,
  conversationHistory: ConversationMessage[] = [],
  detectedEntities: string[] = [],
): Promise<string> {
  if (!mdSnapshot || mdSnapshot.trim().length < 100) {
    return "No campaign data is available for the current window. Please sync your Meta Ads data first.";
  }

  const model = getLlmModel(0.2);

  const historyMessages = conversationHistory.slice(-CONVERSATION_HISTORY_LIMIT).map(m =>
    m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content),
  );

  const entityHint = detectedEntities.length > 0
    ? `\nUser is asking about: ${detectedEntities.join(', ')}`
    : '';

  const systemPrompt = `You are CAI Media's Meta Ads intelligence agent.
Tone: ${MIP_AI_TONE}

═══════════════════════════════════
CAMPAIGN TYPE DETECTION
═══════════════════════════════════
Auto-detect from campaign name:
- "Sales" / "XEV" / "Passenger" / "Leads" → LEAD_GEN
  Focus: CPL, Total Leads, Click-to-Lead CVR, Form drop-off rate
  Benchmark: lowest CPL campaign of same type

- "Commercial" → COMMERCIAL
  Focus: CTR, ROAS, Reach, Frequency, CPM
  Benchmark: highest CTR campaign

- "Branding" / "Insta" / "eSUV" → BRANDING
  Focus: CPM, Engagement Rate, Frequency, Reach
  Benchmark: lowest CPM campaign

Never mix metrics across campaign types.

═══════════════════════════════════
RESPONSE STRUCTURE
═══════════════════════════════════
1. ONE punchy headline — the real story in 1 line

2. Metrics table (type-specific):
   | Metric | This Campaign | Best in Category | Gap |
   (Only show metrics relevant to the campaign type)

3. 2–3 red flags with emoji:
   🔴 Critical  ⚠️ Warning  ✅ Good

4. Root cause — 1 paragraph, specific to the numbers

5. Recommendation table:
   | Action | Why | Priority |

6. Chart data block (always include):
\`\`\`chartdata
{
  "type": "bar",
  "title": "...",
  "labels": [...],
  "datasets": [{"label": "...", "data": [...], "color": "#..."}]
}
\`\`\`

7. STICKY HOOK — end EVERY response with:
---
🔍 **You should also look at:**
→ [Specific insight about their data they haven't asked — use real numbers]
→ [A hidden risk or opportunity in the numbers — be specific]

💬 **Ask me:**
- "[Question 1 — use real campaign name + real number, curiosity-triggering]"
- "[Question 2 — surface a problem they don't know exists]"
- "[Question 3 — about next action to take]"
---

STICKY HOOK RULES:
✅ Use real campaign names and real ₹ numbers in every question
✅ Make it feel like: "wait, I didn't know that was a problem"
✅ Never repeat a question already answered in this session
❌ Never write: "Would you like to know more?"
❌ Never write: "Let me know if you have questions"

MEMORY RULES:
- Build on previous answers in this session
- Connect dots across campaigns automatically
- If prior answer mentioned a campaign, reference it in new answers

CURRENCY: Always use ₹, never $
LANGUAGE: Match the user's language (Tamil or English)

DATE WINDOW LIMITATION:
- CRITICAL: Do NOT mention the specific date range "April 20 to May 31" (or "April 20 - May 31", "April 20th to May 31st", or similar variations) or refer to the limits/timeframe of the data window in your response. State campaign facts, missing campaigns, or performance directly without mentioning this specific date range or data window.

═══════════════════════════════════
CAMPAIGN DATA
═══════════════════════════════════
${mdSnapshot}
${entityHint}`;

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
  // Attach last assistant message as context and re-route to meta ads reply
  const lastAssistant = [...conversationHistory].reverse().find(m => m.role === 'assistant');
  const contextualPrompt = lastAssistant
    ? `[Context from previous answer: ${lastAssistant.content.slice(0, 300)}...]\n\nUser follow-up: ${prompt}`
    : prompt;

  return buildMetaAdsReply(contextualPrompt, mdSnapshot, conversationHistory, []);
}

// ─── Main Chat Router ────────────────────────────────────────────────────────
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

// ─── Data Pruning ─────────────────────────────────────────────────────────────
export async function pruneCampaignDataOutsideBrainWindow(
  tenantId: string,
  clientId?: string | null,
) {
  const result = await prisma.campaignData.deleteMany({
    where: {
      tenantId,
      ...(clientId && clientId !== 'agency' ? { clientId } : {}),
      OR: [
        { date: { lt: dateOnly(AI_BRAIN_DATE_WINDOW.from) } },
        { date: { gt: endOfDate(AI_BRAIN_DATE_WINDOW.to) } },
      ],
    },
  });

  return result.count;
}

// ─── Export Agent Snapshot ────────────────────────────────────────────────────
export async function exportAgentDataSnapshot(tenantId: string, clientId?: string | null) {
  const from = dateOnly(AI_BRAIN_DATE_WINDOW.from);
  const to = endOfDate(AI_BRAIN_DATE_WINDOW.to);

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
    _sum: {
      spend: true,
      impressions: true,
      clicks: true,
      reach: true,
      conversions: true,
      actionValue: true,
    },
    _avg: { frequency: true },
  });

  const campaignSummary = grouped.map(campaign => {
    const spend = Number(campaign._sum.spend ?? 0);
    const clicks = Number(campaign._sum.clicks ?? 0);
    const impressions = Number(campaign._sum.impressions ?? 0);
    const conversions = Number(campaign._sum.conversions ?? 0);
    const actionValue = Number(campaign._sum.actionValue ?? 0);
    const frequency = Number(campaign._avg.frequency ?? 0);

    // Campaign type detection
    // NOTE: Priority order is crucial for mixed-name campaigns (e.g., "XEV Commercial May").
    // 'commercial' is checked first and wins over others. Keep this order to avoid breaking behavior.
    const name = campaign.campaignName.toLowerCase();
    const type = name.includes('commercial')
      ? 'COMMERCIAL'
      : name.includes('branding') || name.includes('insta') || name.includes('esuv')
        ? 'BRANDING'
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

  // Per-type benchmarks
  const benchmarks = {
    LEAD_GEN: campaignSummary
      .filter(c => c.type === 'LEAD_GEN' && c.cpl !== null)
      .sort((a, b) => (a.cpl ?? 0) - (b.cpl ?? 0))[0] ?? null,
    COMMERCIAL: campaignSummary
      .filter(c => c.type === 'COMMERCIAL')
      .sort((a, b) => b.ctr - a.ctr)[0] ?? null,
    BRANDING: campaignSummary
      .filter(c => c.type === 'BRANDING' && c.cpm !== null)
      .sort((a, b) => (a.cpm ?? 0) - (b.cpm ?? 0))[0] ?? null,
  };

  const totalSpend = campaignSummary.reduce((sum, r) => sum + r.spend, 0);
  const totalClicks = campaignSummary.reduce((sum, r) => sum + r.clicks, 0);
  const totalConversions = campaignSummary.reduce((sum, r) => sum + r.conversions, 0);
  const totalImpressions = campaignSummary.reduce((sum, r) => sum + r.impressions, 0);

  const outputDir = path.resolve(process.cwd(), 'agent-data');
  await mkdir(outputDir, { recursive: true });

  const scope = clientId && clientId !== 'agency' ? clientId : tenantId;
  const baseName = `${scope}_${AI_BRAIN_DATE_WINDOW.from}_to_${AI_BRAIN_DATE_WINDOW.to}`;
  const csvPath = path.join(outputDir, `${baseName}.csv`);
  const mdPath = path.join(outputDir, `${baseName}.md`);

  // ── CSV ──
  const csvHeaders = [
    'date', 'tenant_id', 'client_id', 'platform',
    'campaign_id', 'campaign_name', 'campaign_type',
    'spend', 'impressions', 'clicks', 'reach', 'frequency',
    'ctr', 'cpc', 'cpm', 'conversions', 'action_value', 'roas', 'status',
  ];

  const csv = [
    csvHeaders.join(','),
    ...rows.map(row => {
      // NOTE: Priority order is crucial for mixed-name campaigns (e.g., "XEV Commercial May").
      // 'commercial' is checked first and wins over others. Keep this order to avoid breaking behavior.
      const rowName = row.campaignName.toLowerCase();
      const rowType = rowName.includes('commercial')
        ? 'COMMERCIAL'
        : rowName.includes('branding') || rowName.includes('insta') || rowName.includes('esuv')
          ? 'BRANDING'
          : 'LEAD_GEN';
      return [
        row.date.toISOString().slice(0, 10),
        row.tenantId,
        row.clientId ?? '',
        row.platform,
        row.campaignId,
        row.campaignName,
        rowType,
        row.spend,
        row.impressions,
        row.clicks,
        row.reach,
        row.frequency,
        row.ctr,
        row.cpc,
        row.cpm,
        row.conversions,
        row.actionValue,
        row.roas ?? '',
        row.status,
      ].map(csvCell).join(',');
    }),
  ].join('\n');

  // ── Markdown ──
  const campaignRows = campaignSummary.map(row => {
    const benchmark = benchmarks[row.type as keyof typeof benchmarks];

    const action =
      row.conversions === 0 && row.spend > 1000 ? '🔴 Pause or audit waste' :
        row.frequency >= 3 ? '⚠️ Refresh creative' :
          row.cpl !== null && row.cpl <= 150 ? '✅ Scale carefully' :
            '👀 Monitor';

    const benchmarkNote =
      benchmark && benchmark.campaignName !== row.campaignName
        ? `Benchmark: ${benchmark.campaignName}`
        : 'This IS the benchmark';

    return `| ${row.campaignName} | ${row.type} | ${row.platform} | ${row.status} | ${toMoney(row.spend)} | ${row.clicks.toLocaleString('en-IN')} | ${row.conversions.toLocaleString('en-IN')} | ${row.cpl !== null ? toMoney(row.cpl) : 'N/A'} | ${row.ctr.toFixed(2)}% | ${row.cpm !== null ? toMoney(row.cpm) : 'N/A'} | ${row.frequency.toFixed(2)} | ${action} | ${benchmarkNote} |`;
  });

  const md = [
    '# MIP AI Brain — Agent Data Snapshot',
    '',
    `**Framework:** ${AI_BRAIN_FRAMEWORK.framework} + ${AI_BRAIN_FRAMEWORK.modelProvider}`,
    `**Tone:** ${MIP_AI_TONE}`,
    `**Date window:** ${AI_BRAIN_DATE_WINDOW.from} → ${AI_BRAIN_DATE_WINDOW.to}`,
    `**Tenant:** ${tenantId}`,
    `**Client scope:** ${clientId ?? 'agency'}`,
    `**Total rows:** ${rows.length}`,
    `**Campaigns:** ${campaignSummary.length}`,
    '',
    '## Account Totals',
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total Spend | ${toMoney(totalSpend)} |`,
    `| Total Clicks | ${totalClicks.toLocaleString('en-IN')} |`,
    `| Total Impressions | ${totalImpressions.toLocaleString('en-IN')} |`,
    `| Total Conversions | ${totalConversions.toLocaleString('en-IN')} |`,
    `| Blended CPC | ${totalClicks > 0 ? toMoney(totalSpend / totalClicks) : 'N/A'} |`,
    `| Blended CTR | ${totalImpressions > 0 ? `${((totalClicks / totalImpressions) * 100).toFixed(2)}%` : 'N/A'} |`,
    `| Blended CPL | ${totalConversions > 0 ? toMoney(totalSpend / totalConversions) : 'N/A'} |`,
    '',
    '## Benchmarks by Campaign Type',
    '',
    `| Type | Best Campaign | Key Metric |`,
    `|------|--------------|------------|`,
    benchmarks.LEAD_GEN ? `| LEAD_GEN | ${benchmarks.LEAD_GEN.campaignName} | CPL: ${toMoney(benchmarks.LEAD_GEN.cpl!)} |` : '| LEAD_GEN | No data | — |',
    benchmarks.COMMERCIAL ? `| COMMERCIAL | ${benchmarks.COMMERCIAL.campaignName} | CTR: ${benchmarks.COMMERCIAL.ctr.toFixed(2)}% |` : '| COMMERCIAL | No data | — |',
    benchmarks.BRANDING ? `| BRANDING | ${benchmarks.BRANDING.campaignName} | CPM: ${toMoney(benchmarks.BRANDING.cpm!)} |` : '| BRANDING | No data | — |',
    '',
    '## Campaign Summary',
    '',
    '| Campaign | Type | Platform | Status | Spend | Clicks | Conversions | CPL | CTR | CPM | Frequency | Action | Benchmark |',
    '|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|---|',
    ...campaignRows,
    '',
    '## Agent Instructions',
    '',
    '- Greetings, thanks, and chitchat → answer from knowledge base only.',
    '- For all campaign/performance questions → search this data window first.',
    '',
    '### Campaign Type Rules',
    '- Name contains "Sales/XEV/Passenger/Leads" → LEAD_GEN → show: CPL, Leads, Click-to-Lead CVR',
    '- Name contains "Commercial" → COMMERCIAL → show: CTR, ROAS, Reach, CPM',
    '- Name contains "Branding/Insta/eSUV" → BRANDING → show: CPM, Engagement Rate, Frequency',
    '- Always benchmark within same type only.',
    '',
    '### Sticky Hook Rule',
    '- End EVERY answer with 2 specific insights + 3 pre-written questions using real campaign names and real ₹ numbers.',
    '- Never use generic closings like "Let me know if you need anything."',
    '',
    `### Tone`,
    MIP_AI_TONE,
  ].join('\n');

  await Promise.all([
    writeFile(csvPath, csv, 'utf8'),
    writeFile(mdPath, md, 'utf8'),
  ]);

  return {
    tenantId,
    clientId: clientId ?? null,
    dateWindow: AI_BRAIN_DATE_WINDOW,
    framework: AI_BRAIN_FRAMEWORK,
    rows: rows.length,
    campaignCount: campaignSummary.length,
    benchmarks: {
      LEAD_GEN: benchmarks.LEAD_GEN?.campaignName ?? null,
      COMMERCIAL: benchmarks.COMMERCIAL?.campaignName ?? null,
      BRANDING: benchmarks.BRANDING?.campaignName ?? null,
    },
    csvPath,
    mdPath,
  };
}
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from './prisma.service.js';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { getTraceCostEstimate, traceRunnableStep } from './langsmith-tracing.service.js';
import { getAnthropicApiKey, getAnthropicModel, logLlmProviderSelection } from './llm-provider.service.js';

// ── Change 1: Import from prompts_final.ts ───────────────────────────────────
import {
  KNOWLEDGE_BASE_PROMPT,
  buildAnalystPrompt,
  buildAmbiguousPrompt,
  buildClassifierPrompt,
  type ConversationMessage,
} from './prompts_final.js';
export { type ConversationMessage };



// ─── Date Window ────────────────────────────────────────────────────────────
export const AI_BRAIN_DATE_WINDOW = {
  from: '2026-04-20',
  to: '2026-05-31',
};

// ─── Framework ──────────────────────────────────────────────────────────────
export const AI_BRAIN_FRAMEWORK = {
  framework: 'LangChain',
  modelProvider: 'Claude / OpenAI',
  purpose:
    'Route simple knowledge-base replies locally and complex CAI Media Meta Ads questions into campaign data retrieval.',
};

// ─── Tone ────────────────────────────────────────────────────────────────────
export const MIP_AI_TONE =
  'Concise, direct, data-grounded. Answer in 1-4 sentences. No emojis, no tables, no decorative formatting. Say what matters and stop.';

export const MARBLISM_AI_TONE = MIP_AI_TONE;

// ─── Types ───────────────────────────────────────────────────────────────────
export type AiIntent = 'knowledge_base' | 'meta_ads_search' | 'ambiguous_followup';

export interface ClassifyResult {
  intent: AiIntent;
  confidence: 'high' | 'medium' | 'low';
  detected_entities: string[];
}

// NOTE: ConversationMessage is imported from ./prompts/index.js (Change 1).
// Local interface removed to avoid duplicate identifier error.

// ─── Constants ───────────────────────────────────────────────────────────────
const CONVERSATION_HISTORY_LIMIT = 6;
type LlmTier = 'classifier' | 'analysis';

const CHEAP_OPENAI_MODEL = process.env.OPENAI_MINI_MODEL || 'gpt-4o-mini';
const CHEAP_ANTHROPIC_MODEL =
  process.env.ANTHROPIC_CHEAP_MODEL ||
  process.env.CLAUDE_CHEAP_MODEL ||
  getAnthropicModel('classifier');
const ANALYSIS_OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';
const ANALYSIS_ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL ||
  process.env.CLAUDE_MODEL ||
  getAnthropicModel('analysis');

const META_ANALYTICS_TERMS = [
  'ad', 'ads', 'campaign', 'campaigns', 'meta', 'facebook', 'instagram',
  'spend', 'budget', 'cpc', 'cpl', 'ctr', 'cpm', 'roas',
  'lead', 'leads', 'conversion', 'conversions',
  'click', 'clicks', 'impression', 'impressions',
  'frequency', 'fatigue', 'pause', 'scale',
  'performance', 'waste', 'report', 'worst', 'best',
  'urgent', 'immediate', 'compare', 'why', 'how much',
];

const MIP_KNOWLEDGE_TERMS = [
  'mip', 'marketiq', 'market iq', 'ai brain', 'brain',
  'product', 'platform', 'feature', 'features', 'dashboard', 'dashboards',
  'what can you do', 'how do i use', 'how to use', 'who built', 'about you',
];

const EXPLICIT_ANALYTICS_TERMS = [
  'spend', 'budget', 'cpc', 'cpl', 'ctr', 'cpm', 'roas',
  'lead', 'leads', 'conversion', 'conversions', 'click', 'clicks',
  'impression', 'impressions', 'frequency', 'fatigue', 'pause', 'scale',
  'waste', 'worst', 'best', 'compare',
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

export function getAgentDataSnapshotPaths(tenantId: string, clientId?: string | null) {
  const scope = clientId && clientId !== 'agency' ? clientId : tenantId;
  const baseName = `${scope}_${AI_BRAIN_DATE_WINDOW.from}_to_${AI_BRAIN_DATE_WINDOW.to}`;
  const outputDir = path.resolve(process.cwd(), 'agent-data');

  return {
    outputDir,
    csvPath: path.join(outputDir, `${baseName}.csv`),
    mdPath: path.join(outputDir, `${baseName}.md`),
  };
}

function getConfiguredModelName(tier: LlmTier) {
  if (tier === 'classifier' && process.env.OPENAI_API_KEY) return CHEAP_OPENAI_MODEL;
  const anthropicKey = getAnthropicApiKey();
  if (anthropicKey) return tier === 'classifier' ? CHEAP_ANTHROPIC_MODEL : ANALYSIS_ANTHROPIC_MODEL;
  return tier === 'classifier' ? CHEAP_OPENAI_MODEL : ANALYSIS_OPENAI_MODEL;
}

function estimateTokenCount(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function getModelPricing(modelName: string) {
  const lower = modelName.toLowerCase();
  if (lower.includes('gpt-4o-mini')) return { inputPerMillion: 0.15, outputPerMillion: 0.60 };
  if (lower.includes('gpt-4o')) return { inputPerMillion: 2.50, outputPerMillion: 10.00 };
  if (lower.includes('haiku')) return { inputPerMillion: 0.80, outputPerMillion: 4.00 };
  if (lower.includes('sonnet')) return { inputPerMillion: 3.00, outputPerMillion: 15.00 };
  return { inputPerMillion: 1.00, outputPerMillion: 5.00 };
}

function logLlmCost(modelName: string, inputText: string, outputText = '') {
  const { inputTokens, outputTokens, tokens, estimate } = getTraceCostEstimate(modelName, inputText, outputText);
  console.log(`[Cost] ${modelName}  ${tokens} tokens = $${estimate.toFixed(6)}`);
}

function getLlmModel(tier: LlmTier, temperature = 0.1, modelKwargs?: Record<string, unknown>) {
  const modelName = getConfiguredModelName(tier);
  const anthropicKey = getAnthropicApiKey();
  if (tier === 'analysis' && anthropicKey) {
    logLlmProviderSelection(`ai-brain:${tier}`, 'anthropic', modelName);
    return new ChatAnthropic({
      apiKey: anthropicKey,
      anthropicApiKey: anthropicKey,
      model: modelName,
      temperature,
      maxRetries: 0,
    });
  }

  if (tier === 'classifier' && anthropicKey && !process.env.OPENAI_API_KEY) {
    logLlmProviderSelection(`ai-brain:${tier}`, 'anthropic', modelName);
    return new ChatAnthropic({
      apiKey: anthropicKey,
      anthropicApiKey: anthropicKey,
      model: modelName,
      temperature,
      maxRetries: 0,
    });
  }

  logLlmProviderSelection(`ai-brain:${tier}`, 'openai', modelName);
  return new ChatOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    model: modelName,
    temperature,
    modelKwargs,
  } as any);
}

// ─── Intent Classifier ───────────────────────────────────────────────────────
function formatMemoryForPrompt(conversationHistory: ConversationMessage[]) {
  return conversationHistory
    .slice(-CONVERSATION_HISTORY_LIMIT)
    .map(message => `${message.role.toUpperCase()}: ${message.content}`)
    .join('\n') || 'No prior conversation.';
}

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
  const hasMipKnowledgeTerm = MIP_KNOWLEDGE_TERMS.some(term => normalized.includes(term));
  const hasExplicitAnalyticsTerm = EXPLICIT_ANALYTICS_TERMS.some(term => normalized.includes(term));

  if (hasMipKnowledgeTerm && !hasExplicitAnalyticsTerm) {
    return { intent: 'knowledge_base', confidence: 'high', detected_entities: ['MIP'] };
  }

  if (!hasMetaTerm && GREETING_PATTERNS.some(pattern => pattern.test(prompt))) {
    return { intent: 'knowledge_base', confidence: 'high', detected_entities: [] };
  }

  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  const hasConversationContext = conversationHistory.length > 0;
  if (hasConversationContext && wordCount <= 4 && /^(why|how|what about|and\b|show me|this|that|it)\b/i.test(normalized)) {
    return { intent: 'ambiguous_followup', confidence: 'high', detected_entities: [] };
  }

  if (hasMetaTerm) {
    const detectedEntities = META_ANALYTICS_TERMS.filter(term => normalized.includes(term)).slice(0, 8);
    return { intent: 'meta_ads_search', confidence: 'high', detected_entities: detectedEntities };
  }

  const apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return { intent: 'meta_ads_search', confidence: 'low', detected_entities: [] };
  }

  try {
    const modelName = getConfiguredModelName('classifier');
    const model = getLlmModel('classifier', 0.1, { response_format: { type: 'json_object' } });

    // Use buildClassifierPrompt from prompts/index.ts
    const systemPrompt = buildClassifierPrompt(conversationHistory);

    const messages = [
      new SystemMessage(systemPrompt),
      new HumanMessage(prompt),
    ];
    const response = await traceRunnableStep(
      'classify',
      { prompt, historyTurns: conversationHistory.length },
      () => model.invoke(messages),
      {
        model: modelName,
        stage: 'classify',
        historyTurns: conversationHistory.length,
      },
    );

    const raw = String(response.content).trim();
    logLlmCost(modelName, `${systemPrompt}\n${prompt}`, raw);
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
export async function buildKnowledgeBaseReply(
  prompt: string,
  conversationHistory: ConversationMessage[] = [],
): Promise<string> {
  const normalized = prompt.trim().toLowerCase();
  const recentMemory = conversationHistory
    .filter(message => message.role !== 'system')
    .slice(-4)
    .map(message => `${message.role}: ${message.content}`)
    .join(' | ');

  if (/\b(previous|earlier|last|remember|memory|conversation)\b/.test(normalized)) {
    return recentMemory
      ? `I remember the recent conversation: ${recentMemory}`
      : 'I remember the recent chat in this session.';
  }

  if (/\bthanks?\b|\bthank\s+you\b|à®¨à®©à¯à®±à®¿/.test(normalized)) {
    return 'You are welcome.';
  }
  if (/\bwhat\s+can\s+you\s+do\b|\bhelp\b|\bfeatures?\b|\bdashboards?\b|\breports?\b|\bintegrations?\b/.test(normalized)) {
    return 'I analyze campaign data to spot waste, fatigue, and scaling opportunities across Meta and Google Ads.';
  }
  if (/\bmip\b|\bmarketiq\b|\bmarket iq\b|\bai brain\b|\bbrain\b|\bproduct\b|\bplatform\b/.test(normalized)) {
    return 'MIP is a marketing intelligence platform that analyzes campaign performance and recommends next actions.';
  }
  if (/\bwho\s+are\s+you\b/.test(normalized)) {
    return "I am a marketing intelligence assistant for campaign health, budget risk, and platform guidance.";
  }

  // ── FIX 1: Removed early blanket return so LLM path is reachable ────────────
  const apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;

  if (apiKey) {
    try {
      const model = getLlmModel('analysis', 0.3);
      // Use KNOWLEDGE_BASE_PROMPT from prompts/index.ts
      const systemPrompt = KNOWLEDGE_BASE_PROMPT;

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
  const fallbackNormalized = prompt.trim().toLowerCase();
  if (/\bthanks?\b|\bthank\s+you\b|நன்றி/.test(fallbackNormalized)) {
    return 'You are welcome.';
  }
  if (/\bmip\b|\bmarketiq\b|\bmarket iq\b|\bai brain\b|\bbrain\b/.test(fallbackNormalized)) {
    return 'MIP is a marketing intelligence platform that analyzes campaign performance and recommends next actions.';
  }
  if (/\bwho\s+are\s+you\b/.test(fallbackNormalized)) {
    return "I am a marketing intelligence assistant for campaign health, budget risk, and platform guidance.";
  }
  return "I analyze campaign performance and recommend actions.";
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

  const modelName = getConfiguredModelName('analysis');
  const model = getLlmModel('analysis', 0.0);

  const historyMessages = conversationHistory.slice(-CONVERSATION_HISTORY_LIMIT).map(m => {
    if (m.role === 'system') return new SystemMessage(m.content);
    return m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content);
  });

  // Change 2: use buildAnalystPrompt from prompts/index.ts
  const systemPrompt = buildAnalystPrompt(mdSnapshot, detectedEntities);

  const messages = [
    new SystemMessage(systemPrompt),
    ...historyMessages,
    new HumanMessage(prompt),
  ];
  const response = await traceRunnableStep(
    'ai_brain_llm_call',
    {
      prompt,
      snapshotChars: mdSnapshot.length,
      historyTurns: conversationHistory.length,
    },
    () => model.invoke(messages),
    {
      model: modelName,
      stage: 'llm_call',
      intent: 'meta_ads_search',
      historyTurns: conversationHistory.length,
      snapshotChars: mdSnapshot.length,
    },
  );

  const output = String(response.content).trim();
  logLlmCost(
    modelName,
    `${systemPrompt}\n${conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')}\n${prompt}`,
    output,
  );
  return output;
}

// ─── Ambiguous Followup Handler ──────────────────────────────────────────────
function messageContentToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part: any) => typeof part === 'string' ? part : part?.text || '')
      .join('');
  }
  return '';
}

export async function* streamAgentChatReply(params: {
  prompt: string;
  mdSnapshot: string;
  conversationHistory?: ConversationMessage[];
  classification?: ClassifyResult;
}): AsyncGenerator<string> {
  const { prompt, mdSnapshot, conversationHistory = [], classification } = params;
  const classified = classification ?? await classifyAiIntent(prompt, conversationHistory);

  if (classified.intent === 'knowledge_base') {
    const reply = await buildKnowledgeBaseReply(prompt, conversationHistory);
    for (const chunk of reply.match(/.{1,24}/gs) || [reply]) {
      yield chunk;
    }
    return;
  }

  if (!mdSnapshot || mdSnapshot.trim().length < 100) {
    yield 'No campaign data is available for the current window. Please sync your Meta Ads data first.';
    return;
  }

  const modelName = getConfiguredModelName('analysis');
  const model = getLlmModel('analysis', 0.25);
  const historyMessages = conversationHistory.slice(-CONVERSATION_HISTORY_LIMIT).map(m => {
    if (m.role === 'system') return new SystemMessage(m.content);
    return m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content);
  });

  // Use buildAmbiguousPrompt or buildAnalystPrompt based on intent
  const systemPrompt = classified.intent === 'ambiguous_followup'
    ? buildAmbiguousPrompt(mdSnapshot, conversationHistory)
    : buildAnalystPrompt(mdSnapshot, classified.detected_entities);

  const messages = [
    new SystemMessage(systemPrompt),
    ...historyMessages,
    new HumanMessage(prompt),
  ];
  const streamStartedAt = Date.now();
  const stream = await traceRunnableStep(
    'ai_brain_stream_start',
    {
      prompt,
      snapshotChars: mdSnapshot.length,
      historyTurns: conversationHistory.length,
    },
    () => model.stream(messages, {
      runName: 'ai_brain_stream_llm',
      metadata: {
        model: modelName,
        stage: 'llm_call',
        streaming: true,
        historyTurns: conversationHistory.length,
        snapshotChars: mdSnapshot.length,
      },
    } as any),
    {
      model: modelName,
      stage: 'llm_call',
      streaming: true,
    },
  );
  let streamedOutput = '';

  for await (const chunk of stream) {
    const text = messageContentToText(chunk.content);
    if (text) {
      streamedOutput += text;
      yield text;
    }
  }

  logLlmCost(
    modelName,
    `${systemPrompt}\n${conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')}\n${prompt}`,
    streamedOutput,
  );
  console.log('[LangSmithMetrics]', {
    runName: 'ai_brain_stream_llm',
    model: modelName,
    latencyMs: Date.now() - streamStartedAt,
    ...getTraceCostEstimate(
      modelName,
      `${systemPrompt}\n${conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')}\n${prompt}`,
      streamedOutput,
    ),
  });
}

export async function resolveAmbiguousFollowup(
  prompt: string,
  mdSnapshot: string,
  conversationHistory: ConversationMessage[],
): Promise<string> {
  const modelName = getConfiguredModelName('analysis');
  const model = getLlmModel('analysis', 0.0);

  // Change 3: use buildAmbiguousPrompt from prompts/index.ts
  const systemPrompt = buildAmbiguousPrompt(mdSnapshot, conversationHistory);

  const historyMessages = conversationHistory.slice(-CONVERSATION_HISTORY_LIMIT).map(m => {
    if (m.role === 'system') return new SystemMessage(m.content);
    return m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content);
  });

  const messages = [
    new SystemMessage(systemPrompt),
    ...historyMessages,
    new HumanMessage(prompt),
  ];

  const response = await traceRunnableStep(
    'ai_brain_llm_call',
    { prompt, snapshotChars: mdSnapshot.length, historyTurns: conversationHistory.length },
    () => model.invoke(messages),
    { model: modelName, stage: 'llm_call', intent: 'ambiguous_followup' },
  );

  const output = String(response.content).trim();
  logLlmCost(
    modelName,
    `${systemPrompt}\n${conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')}\n${prompt}`,
    output,
  );
  return output;
}

// ─── Main Chat Router ────────────────────────────────────────────────────────
export async function handleAgentChat(params: {
  prompt: string;
  mdSnapshot: string;
  conversationHistory?: ConversationMessage[];
  classification?: ClassifyResult;
}): Promise<{ reply: string; intent: AiIntent; entities: string[] }> {
  const { prompt, mdSnapshot, conversationHistory = [], classification } = params;

  const classified = classification ?? await classifyAiIntent(prompt, conversationHistory);
  const { intent, detected_entities } = classified;

  let reply: string;

  if (intent === 'knowledge_base') {
    reply = await buildKnowledgeBaseReply(prompt, conversationHistory);
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
      const rawType = String(chartJson.type || '').toLowerCase();
      const chartTypeMap: Record<string, string> = {
        bar: 'bar_chart',
        line: 'line_chart',
        pie: 'pie_chart',
        doughnut: 'pie_chart',
        donut: 'pie_chart',
        table: 'table',
        kpi: 'kpi_card',
        scatter: 'scatter_chart',
        bubble: 'bubble_chart',
      };
      const firstDataset = chartJson.datasets?.[0] || {};

      const isPointChart = rawType === 'scatter' || rawType === 'bubble';
      const mappedData = isPointChart && Array.isArray(firstDataset.data) && typeof firstDataset.data[0] === 'object'
        ? firstDataset.data.map((point: any, idx: number) => ({
          label: point.label ?? chartJson.labels?.[idx] ?? `Point ${idx + 1}`,
          x: point.x ?? point.spend ?? 0,
          y: point.y ?? point.cpl ?? point.value ?? 0,
          z: point.z ?? point.size ?? point.leads ?? point.conversions ?? 1,
        }))
        : chartJson.labels?.map((label: string, idx: number) => {
          const record: Record<string, any> = { label };
          chartJson.datasets?.forEach((dataset: any) => {
            record[dataset.label || 'value'] = dataset.data?.[idx] ?? 0;
          });
          return record;
        }) || [];

      return {
        chart_type: chartTypeMap[rawType] || 'bar_chart',
        title: chartJson.title || 'Campaign Performance Comparison',
        data: mappedData,
        config: {
          x_axis: isPointChart ? 'x' : 'label',
          y_axis: isPointChart ? 'y' : firstDataset.label || 'value',
          z_axis: isPointChart ? 'z' : null,
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

  const { outputDir, csvPath, mdPath } = getAgentDataSnapshotPaths(tenantId, clientId);
  await mkdir(outputDir, { recursive: true });

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
    '### Response Format Rule',
    '- Match the format to the user intent. Do not force reports, tables, charts, sticky hooks, or suggested questions unless the user explicitly asks for them. Exception: Mode E new-campaign/full-funnel requests must include the mandatory funnel format and sticky hook.',
    '- Use charts only when they clarify a comparison, trend, forecast, or requested visual.',
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

export async function exportAgentDataSnapshotsForTenant(tenantId: string) {
  const clientRows = await prisma.campaignData.findMany({
    where: {
      tenantId,
      clientId: { not: null },
    },
    distinct: ['clientId'],
    select: { clientId: true },
  });

  const snapshots = [await exportAgentDataSnapshot(tenantId)];

  for (const row of clientRows) {
    if (row.clientId) {
      snapshots.push(await exportAgentDataSnapshot(tenantId, row.clientId));
    }
  }

  return snapshots;
}

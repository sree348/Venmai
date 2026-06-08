import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { prisma } from '../services/prisma.service.js';
import { requireJwtAuth, type AuthenticatedRequest } from '../middleware/auth.middleware.js';
import {
  buildKnowledgeBaseReply,
  classifyAiIntent,
  getAgentDataSnapshotPaths,
  handleAgentChat,
  streamAgentChatReply,
  extractWidgetFromMarkdown,
  type ConversationMessage,
} from '../services/ai-brain.service.js';
import { invalidateVerifiedCampaignContextCache, runAgentWorkflow } from '../services/agent.service.js';
import { traceRunnableStep } from '../services/langsmith-tracing.service.js';
import { hasAnthropicProvider, hasOpenAiProvider, getAnthropicModel, logLlmProviderSelection } from '../services/llm-provider.service.js';

export const chatRouter = Router();

const SEMANTIC_RESPONSE_CACHE_TTL_MS = 5 * 60 * 1000;
const SNAPSHOT_MAX_AGE_MS = Number(process.env.AGENT_SNAPSHOT_MAX_AGE_MS || 35 * 60 * 1000);

type CachedChatResponse = {
  response: Record<string, unknown>;
  timestamp: number;
};

type SnapshotCampaign = {
  name: string;
  type: string;
  platform: string;
  spend: string;
  conversions: string;
  cpl: string;
  ctr: string;
  frequency: string;
  action: string;
};

const semanticResponseCache = new Map<string, CachedChatResponse>();

function normalizeQueryForCache(prompt: string) {
  return prompt
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

function getSemanticResponseCacheKey(tenantId: string, clientId: string | undefined, prompt: string) {
  const normalized = normalizeQueryForCache(prompt);
  const hash = crypto.createHash('sha256').update(normalized).digest('hex');
  const scope = clientId || tenantId;
  return `${tenantId}:${scope}:${hash}`;
}

function getCachedChatResponse(cacheKey: string) {
  const cached = semanticResponseCache.get(cacheKey);
  if (!cached) return null;

  if (Date.now() - cached.timestamp > SEMANTIC_RESPONSE_CACHE_TTL_MS) {
    semanticResponseCache.delete(cacheKey);
    return null;
  }

  return cached.response;
}

function setCachedChatResponse(cacheKey: string, response: Record<string, unknown>) {
  semanticResponseCache.set(cacheKey, {
    response,
    timestamp: Date.now(),
  });
}

async function readCachedAgentSnapshot(tenantId: string, clientId?: string | null) {
  const snapshotPaths = getAgentDataSnapshotPaths(tenantId, clientId || tenantId);

  return traceRunnableStep(
    'snapshot_read',
    { tenantId, clientId: clientId || tenantId, source: 'cache_only' },
    async () => {
      const stat = await fs.stat(snapshotPaths.mdPath);
      const snapshotAgeMs = Date.now() - stat.mtimeMs;

      if (snapshotAgeMs > SNAPSHOT_MAX_AGE_MS) {
        throw new Error(`Cached AI Brain snapshot is stale (${Math.round(snapshotAgeMs / 1000)}s old).`);
      }

      return {
        mdSnapshot: await fs.readFile(snapshotPaths.mdPath, 'utf8'),
        snapshotAgeMs,
      };
    },
    {
      tenantId,
      clientId: clientId || tenantId,
      source: 'cache_only',
      maxAgeMs: SNAPSHOT_MAX_AGE_MS,
    },
  );
}

function parseSnapshotCampaigns(mdSnapshot: string): SnapshotCampaign[] {
  const lines = mdSnapshot.split('\n');
  const campaigns: SnapshotCampaign[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || trimmed.includes('|---') || trimmed.includes('| Campaign |')) continue;
    const cells = trimmed
      .split('|')
      .map(cell => cell.trim())
      .filter(Boolean);

    if (cells.length < 13) continue;
    campaigns.push({
      name: cells[0],
      type: cells[1],
      platform: cells[2],
      status: cells[3],
      spend: cells[4],
      conversions: cells[6],
      cpl: cells[7],
      ctr: cells[8],
      frequency: cells[10],
      action: cells[11],
    } as SnapshotCampaign);
  }

  return campaigns;
}

function normalizeForMatch(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshteinDistance(a: string, b: string) {
  const matrix = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[a.length][b.length];
}

function similarity(a: string, b: string) {
  if (!a || !b) return 0;
  return 1 - levenshteinDistance(a, b) / Math.max(a.length, b.length);
}

const CAMPAIGN_MATCH_STOP_WORDS = new Set([
  'give', 'full', 'brief', 'campaign', 'cai', 'mahindra', '2026', 'about', 'tell', 'show',
  'report', 'performance', 'the', 'this', 'that', 'for', 'on', 'me', 'a', 'an',
]);

const MONTH_WORDS = new Set([
  'january', 'jan', 'february', 'feb', 'march', 'mar', 'april', 'apr', 'may', 'june', 'jun',
  'july', 'jul', 'august', 'aug', 'september', 'sep', 'october', 'oct', 'november', 'nov',
  'december', 'dec',
]);

function getCampaignIntentTokens(value: string) {
  return normalizeForMatch(value)
    .split(' ')
    .filter(token => token.length > 2)
    .filter(token => !CAMPAIGN_MATCH_STOP_WORDS.has(token))
    .filter(token => !MONTH_WORDS.has(token));
}

function findCampaignCorrection(prompt: string, campaigns: SnapshotCampaign[]) {
  const normalizedPrompt = normalizeForMatch(prompt);
  if (!normalizedPrompt || campaigns.length === 0) return null;

  for (const campaign of campaigns) {
    if (normalizedPrompt.includes(normalizeForMatch(campaign.name))) return null;
  }

  const promptIntentTokens = getCampaignIntentTokens(prompt);
  if (promptIntentTokens.length > 0) {
    const tokenMatches = campaigns
      .map(campaign => {
        const campaignName = normalizeForMatch(campaign.name);
        const matchedTokens = promptIntentTokens.filter(token => campaignName.split(' ').some(campaignToken => similarity(token, campaignToken) >= 0.88));
        return {
          campaign,
          matchedTokens,
          score: matchedTokens.length / promptIntentTokens.length,
        };
      })
      .filter(match => match.score >= 0.75)
      .sort((a, b) => b.score - a.score || b.matchedTokens.length - a.matchedTokens.length);

    if (tokenMatches.length > 0) {
      return {
        campaign: tokenMatches[0].campaign,
        score: tokenMatches[0].score,
        phrase: promptIntentTokens.join(' '),
      };
    }
  }

  const words = normalizedPrompt.split(' ').filter(word => word.length > 2);
  const phrases = new Set<string>();
  for (let start = 0; start < words.length; start++) {
    for (let size = 1; size <= Math.min(5, words.length - start); size++) {
      phrases.add(words.slice(start, start + size).join(' '));
    }
  }

  let best: { campaign: SnapshotCampaign; score: number; phrase: string } | null = null;
  for (const campaign of campaigns) {
    const campaignName = normalizeForMatch(campaign.name);
    for (const phrase of phrases) {
      const score = Math.max(
        similarity(phrase, campaignName),
        ...campaignName.split(' ').map(token => similarity(phrase, token)),
      );
      if (!best || score > best.score) {
        best = { campaign, score, phrase };
      }
    }
  }

  return best && best.score >= 0.78 ? best : null;
}

function isVagueMarketingQuestion(prompt: string) {
  const normalized = normalizeForMatch(prompt);
  return /^(tell me something interesting|what is interesting|any insights|give me insights|show insights|what should i know|anything important|surprise me)$/.test(normalized);
}

function isOutOfScopeQuestion(prompt: string) {
  const normalized = normalizeForMatch(prompt);
  return /\b(invoice|billing|payment|subscription|refund|contract|password|login|user access|account manager|pricing|plan|seat|permission)\b/.test(normalized) &&
    !/\b(campaign|ad|ads|spend|cpl|cpc|ctr|budget|lead|conversion|meta|google)\b/.test(normalized);
}

function buildSuggestedQuestions(campaigns: SnapshotCampaign[], pageContext: any, prompt: string) {
  const page = String(pageContext?.page || '').replace(/_/g, ' ') || 'campaigns';
  const top = campaigns.slice(0, 4);
  const risk = top.find(c => /pause|audit|risk|refresh/i.test(c.action)) || top[0];
  const efficient = top.find(c => /scale/i.test(c.action)) || top[1] || top[0];
  const platform = top.find(c => c.platform)?.platform || 'Meta vs Google';

  const questions = [
    risk ? `Why is ${risk.name} marked "${risk.action}" and what should I do today?` : `What is the biggest risk on the ${page} page?`,
    efficient ? `Can I scale ${efficient.name} without increasing CPL?` : `Which campaign should I scale next?`,
    top.length > 1 ? `Compare ${top[0].name} vs ${top[1].name} on CPL, CTR, and spend.` : `Compare ${platform} performance to the last period.`,
  ];

  if (/compare|last period|trend/i.test(prompt)) {
    questions[2] = risk ? `What changed for ${risk.name} compared with the previous period?` : 'What changed compared with the previous period?';
  }

  return questions.slice(0, 3);
}

function appendSuggestedQuestions(insight: string, campaigns: SnapshotCampaign[], pageContext: any, prompt: string) {
  const withoutExisting = insight.replace(/\n---\n\*\*Suggested Questions\*\*[\s\S]*$/i, '').trim();
  const questions = buildSuggestedQuestions(campaigns, pageContext, prompt);
  return [
    withoutExisting,
    '',
    '---',
    '**Suggested Questions**',
    ...questions.map(question => `- "${question}"`),
  ].join('\n');
}

function stripSuggestedQuestions(insight: string) {
  return insight.replace(/\n---\n\*\*Suggested Questions\*\*[\s\S]*$/i, '').trim();
}

function isChartRequest(prompt: string) {
  return /\b(chart|graph|visual|plot)\b/i.test(prompt) || /\b(line|bar|pie|bubble|scatter)\s+chart\b/i.test(prompt);
}

function getRequestedChartType(prompt: string) {
  const normalized = prompt.toLowerCase();
  if (/\bline\b/.test(normalized)) return 'line_chart';
  if (/\bpie|donut|doughnut\b/.test(normalized)) return 'pie_chart';
  if (/\bbubble\b/.test(normalized)) return 'bubble_chart';
  if (/\bscatter\b/.test(normalized)) return 'scatter_chart';
  if (/\bbar\b/.test(normalized)) return 'bar_chart';
  return 'bar_chart';
}

function parseMetricNumber(value: string) {
  const cleaned = value.replace(/[₹,\s]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildFallbackChartWidget(prompt: string, insight: string, conversationMemory: ConversationMessage[]) {
  if (!isChartRequest(prompt)) return null;

  const sourceText = [
    ...conversationMemory
      .filter(message => message.role === 'assistant')
      .slice(-4)
      .map(message => message.content),
    insight,
  ].join('\n');

  const monthPattern = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b\s+(?:had|has|was|:)?\s*([^.;\n]+)/gi;
  const rows: Array<Record<string, string | number>> = [];
  let match: RegExpExecArray | null;

  while ((match = monthPattern.exec(sourceText)) !== null) {
    const month = match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
    const segment = match[2];
    const row: Record<string, string | number> = { month };

    const spend = segment.match(/₹\s*([\d,]+(?:\.\d+)?)\s*(?:spend|total spend)?/i)
      || segment.match(/(?:total\s+)?spend\s*(?:was|is|:)?\s*₹\s*([\d,]+(?:\.\d+)?)/i);
    const ctr = segment.match(/([\d,]+(?:\.\d+)?)\s*%\s*CTR/i)
      || segment.match(/CTR\s*(?:was|is|:)?\s*([\d,]+(?:\.\d+)?)\s*%/i);
    const cpc = segment.match(/₹\s*([\d,]+(?:\.\d+)?)\s*CPC/i)
      || segment.match(/(?:average\s+|avg\s+)?CPC\s*(?:was|is|:)?\s*₹\s*([\d,]+(?:\.\d+)?)/i);
    const cpl = segment.match(/₹\s*([\d,]+(?:\.\d+)?)\s*(?:CPL|CPR)/i)
      || segment.match(/(?:average\s+|avg\s+)?(?:CPL|CPR)\s*(?:was|is|:)?\s*₹\s*([\d,]+(?:\.\d+)?)/i);
    const impressions = segment.match(/([\d,]+(?:\.\d+)?)\s*impressions?/i);

    if (spend) row.spend = parseMetricNumber(spend[1]) ?? 0;
    if (ctr) row.ctr = parseMetricNumber(ctr[1]) ?? 0;
    if (cpc) row.cpc = parseMetricNumber(cpc[1]) ?? 0;
    if (cpl) row.cpl = parseMetricNumber(cpl[1]) ?? 0;
    if (impressions) row.impressions = parseMetricNumber(impressions[1]) ?? 0;

    if (Object.keys(row).length > 1 && !rows.some(existing => existing.month === month)) {
      rows.push(row);
    }
  }

  if (rows.length === 0) return null;

  const firstMetric = Object.keys(rows[0]).find(key => key !== 'month') || 'spend';
  return {
    chart_type: getRequestedChartType(prompt),
    title: 'Monthly Performance Trend',
    data: rows,
    config: {
      x_axis: 'month',
      y_axis: firstMetric,
      z_axis: null,
      sort: null,
    },
    sql: null,
    insight,
  };
}

function buildVagueQuestionResponse(campaigns: SnapshotCampaign[], pageContext: any, prompt: string) {
  const risk = campaigns.find(c => /pause|audit|risk/i.test(c.action)) || campaigns[0];
  const opportunity = campaigns.find(c => /scale/i.test(c.action)) || campaigns[1] || campaigns[0];
  const changed = campaigns.find(c => /refresh/i.test(c.action)) || campaigns[2] || campaigns[0];

  const insight = [
    'Here are 3 things:',
    `1. Biggest risk - ${risk ? `${risk.name} needs attention because its current action is "${risk.action}" with spend ${risk.spend} and CPL ${risk.cpl}.` : 'No campaign risk is visible in the current snapshot.'}`,
    `2. Top opportunity - ${opportunity ? `${opportunity.name} is the first campaign to inspect for scaling because its current action is "${opportunity.action}" and CTR is ${opportunity.ctr}.` : 'No scale opportunity is visible in the current snapshot.'}`,
    `3. What changed - ${changed ? `${changed.name} should be checked for trend movement, especially frequency ${changed.frequency} and CTR ${changed.ctr}.` : 'Trend detail needs a previous-period comparison.'}`,
  ].join('\n');

  return stripSuggestedQuestions(insight);
}

function buildOutOfScopeResponse(campaigns: SnapshotCampaign[], pageContext: any, prompt: string) {
  return 'I can help with campaign analysis, performance diagnosis, budget risk, platform comparison, creative fatigue, and MIP guidance. For billing, account access, contracts, or subscription changes, please contact the account/admin support owner.';
}

function writeSse(res: any, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

chatRouter.get('/agent/refresh-cache', requireJwtAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const tenantId = req.query.tenantId ? String(req.query.tenantId) : req.auth!.tenantId;

    if (req.auth!.tenantId !== 'agency' && tenantId !== req.auth!.tenantId) {
      return res.status(403).json({ error: 'Token is not allowed to refresh this tenant cache.' });
    }

    invalidateVerifiedCampaignContextCache(tenantId);
    console.log(`[AgentContext] manual cache invalidation tenant=${tenantId}`);

    return res.json({
      success: true,
      tenantId,
      message: 'Agent campaign context cache invalidated.',
    });
  } catch (error) {
    return next(error);
  }
});

const MEMORY_TOKEN_BUDGET = 4000;

function estimateTokens(content: string) {
  return Math.ceil(content.length / 4);
}

function summarizeTruncatedMessages(messages: ConversationMessage[]) {
  const userTopics = messages
    .filter(message => message.role === 'user')
    .map(message => message.content.replace(/\s+/g, ' ').slice(0, 90))
    .slice(-6);
  const assistantFacts = messages
    .filter(message => message.role === 'assistant')
    .map(message => message.content.replace(/\s+/g, ' ').slice(0, 120))
    .slice(-4);

  return [
    `Earlier conversation summary: the user previously asked about ${userTopics.join('; ') || 'campaign performance and MIP guidance'}.`,
    `Prior assistant findings/actions included ${assistantFacts.join('; ') || 'campaign risks, opportunities, and next actions'}; avoid repeating answered questions unless the user asks.`,
  ].join(' ');
}

function applyMemoryTokenBudget(messages: ConversationMessage[]) {
  let totalTokens = messages.reduce((sum, message) => sum + estimateTokens(message.content), 0);
  if (totalTokens <= MEMORY_TOKEN_BUDGET) {
    return { messages, truncatedCount: 0, estimatedTokens: totalTokens };
  }

  const keepStart = Math.max(0, messages.length - 2);
  const mustKeep = new Set<number>([keepStart, keepStart + 1].filter(index => index < messages.length));
  const kept = messages.map((message, index) => ({ message, index }));
  const truncated: ConversationMessage[] = [];

  while (
    kept.length > 0 &&
    totalTokens > MEMORY_TOKEN_BUDGET &&
    kept.some(item => !mustKeep.has(item.index))
  ) {
    const removeAt = kept.findIndex(item => !mustKeep.has(item.index));
    if (removeAt === -1) break;
    const [removed] = kept.splice(removeAt, 1);
    truncated.push(removed.message);
    totalTokens -= estimateTokens(removed.message.content);
  }

  const budgetedMessages = kept.map(item => item.message);
  if (truncated.length > 0) {
    const summary: ConversationMessage = {
      role: 'system',
      content: summarizeTruncatedMessages(truncated),
    };
    budgetedMessages.unshift(summary);
    totalTokens += estimateTokens(summary.content);
  }

  return {
    messages: budgetedMessages,
    truncatedCount: truncated.length,
    estimatedTokens: totalTokens,
  };
}

function normalizeConversationMessage(message: any): ConversationMessage | null {
  if (!message || (message.role !== 'user' && message.role !== 'assistant' && message.role !== 'system')) {
    return null;
  }

  let content = typeof message.content === 'string' ? message.content : '';
  if (message.role === 'assistant') {
    try {
      const parsed = JSON.parse(content);
      content = parsed.insight || parsed.widget?.insight || content;
    } catch {
      // Stored assistant content can be plain text or JSON.
    }
  }

  content = content.trim();
  return content ? { role: message.role, content } : null;
}

async function loadConversationMemory(tenantId: string, frontendHistory: any[]) {
  const storedRows = await prisma.conversationHistory.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const storedHistory = storedRows
    .reverse()
    .map(normalizeConversationMessage)
    .filter((message): message is ConversationMessage => Boolean(message));

  const incomingHistory = Array.isArray(frontendHistory)
    ? frontendHistory
      .map(normalizeConversationMessage)
      .filter((message): message is ConversationMessage => Boolean(message))
    : [];

  const merged = [...storedHistory, ...incomingHistory];
  const deduped: ConversationMessage[] = [];
  const seen = new Set<string>();

  for (const message of merged) {
    const key = `${message.role}:${message.content}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(message);
    }
  }

  const budgeted = applyMemoryTokenBudget(deduped);
  return {
    messages: budgeted.messages,
    truncatedCount: budgeted.truncatedCount,
    estimatedTokens: budgeted.estimatedTokens,
  };
}

chatRouter.post('/chat', requireJwtAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const startedAt = Date.now();
    const timings: Record<string, number> = {};
    const mark = (label: string, from: number) => {
      timings[label] = Date.now() - from;
    };

    const { prompt, tenantId = req.auth!.tenantId, clientId, history = [], pageContext } = req.body || {};

    if (!prompt || !tenantId) {
      return res.status(400).json({ error: 'prompt and tenantId are required.' });
    }

    if (req.auth!.tenantId !== 'agency' && tenantId !== req.auth!.tenantId) {
      return res.status(403).json({ error: 'Token is not allowed to query this tenant or client scope.' });
    }

    const shouldStream = Boolean(req.body?.stream);
    const semanticCacheKey = getSemanticResponseCacheKey(tenantId, clientId || tenantId, prompt);
    const cachedResponse = getCachedChatResponse(semanticCacheKey);

    if (cachedResponse) {
      console.log('[SemanticCache] hit', {
        tenantId,
        clientId: clientId || tenantId,
        normalizedQuery: normalizeQueryForCache(prompt),
        totalMs: Date.now() - startedAt,
      });

      if (shouldStream) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'x-cache-hit': 'true',
        });

        const insight = typeof cachedResponse.insight === 'string' ? cachedResponse.insight : '';
        if (insight) {
          writeSse(res, 'token', { token: insight });
        }
        writeSse(res, 'done', {
          type: '[DONE]',
          ...cachedResponse,
          cacheHit: true,
        });
        return res.end();
      }

      res.setHeader('x-cache-hit', 'true');
      return res.json({
        ...cachedResponse,
        cacheHit: true,
      });
    }

    res.setHeader('x-cache-hit', 'false');
    console.log('[SemanticCache] miss', {
      tenantId,
      clientId: clientId || tenantId,
      normalizedQuery: normalizeQueryForCache(prompt),
    });

    if (isOutOfScopeQuestion(prompt)) {
      const insight = buildOutOfScopeResponse([], pageContext, prompt);
      const responsePayload = {
        widget: null,
        insight,
        intent: 'knowledge_base',
        dataSnapshot: null,
        prunedRows: 0,
        guardrail: 'out_of_scope',
      };
      setCachedChatResponse(semanticCacheKey, responsePayload);

      if (shouldStream) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'x-cache-hit': 'false',
        });
        writeSse(res, 'token', { token: insight });
        writeSse(res, 'done', { type: '[DONE]', ...responsePayload });
        return res.end();
      }

      return res.json(responsePayload);
    }

    if (isVagueMarketingQuestion(prompt)) {
      try {
        const cachedSnapshot = await readCachedAgentSnapshot(tenantId, clientId || tenantId);
        const snapshotCampaigns = parseSnapshotCampaigns(cachedSnapshot.mdSnapshot);
        const insight = buildVagueQuestionResponse(snapshotCampaigns, pageContext, prompt);
        const responsePayload = {
          widget: null,
          insight,
          intent: 'meta_ads_search',
          dataSnapshot: null,
          prunedRows: 0,
          snapshotSource: 'cache',
          snapshotAgeMs: cachedSnapshot.snapshotAgeMs,
          guardrail: 'vague_question_template',
        };
        setCachedChatResponse(semanticCacheKey, responsePayload);

        if (shouldStream) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'x-cache-hit': 'false',
          });
          writeSse(res, 'token', { token: insight });
          writeSse(res, 'done', { type: '[DONE]', ...responsePayload });
          return res.end();
        }

        return res.json(responsePayload);
      } catch (snapshotErr: any) {
        return res.status(503).json({
          error: 'AI Brain snapshot is not ready. Please wait for the scheduled snapshot refresh.',
          snapshotSource: 'missing',
          snapshotMaxAgeMs: SNAPSHOT_MAX_AGE_MS,
          detail: snapshotErr?.message,
        });
      }
    }

    const memoryStartedAt = Date.now();
    const memoryResult = await loadConversationMemory(tenantId, history);
    const conversationMemory = memoryResult.messages;
    mark('memoryMs', memoryStartedAt);

    const classifyStartedAt = Date.now();
    const classification = await traceRunnableStep(
      'classify',
      { tenantId, prompt, historyTurns: conversationMemory.length },
      () => classifyAiIntent(prompt, conversationMemory),
      { tenantId, stage: 'classify', historyTurns: conversationMemory.length },
    );
    mark('classifyMs', classifyStartedAt);
    const intent = classification.intent;
    let effectivePrompt = prompt;
    let fuzzyCorrection: ReturnType<typeof findCampaignCorrection> = null;

    if (shouldStream) {
      let mdSnapshot = '';
      let dataSnapshot: any = null;
      let snapshotSource: 'cache' | 'missing' | 'none' = 'none';
      let snapshotAgeMs: number | null = null;
      let snapshotCampaigns: SnapshotCampaign[] = [];

      if (intent !== 'knowledge_base') {
        try {
          const snapshotStartedAt = Date.now();
          const cachedSnapshot = await readCachedAgentSnapshot(tenantId, clientId || tenantId);
          mdSnapshot = cachedSnapshot.mdSnapshot;
          snapshotAgeMs = cachedSnapshot.snapshotAgeMs;
          snapshotCampaigns = parseSnapshotCampaigns(mdSnapshot);
          fuzzyCorrection = findCampaignCorrection(prompt, snapshotCampaigns);
          if (fuzzyCorrection) {
            effectivePrompt = `${prompt}\n\nCampaign name fuzzy match: interpret "${fuzzyCorrection.phrase}" as "${fuzzyCorrection.campaign.name}".`;
          }
          snapshotSource = 'cache';
          mark('snapshotMs', snapshotStartedAt);
        } catch (snapshotErr: any) {
          snapshotSource = 'missing';
          console.error('AI Brain cached snapshot missing or stale during streaming:', snapshotErr);
          return res.status(503).json({
            error: 'AI Brain snapshot is not ready. Please wait for the scheduled snapshot refresh.',
            snapshotSource,
            snapshotMaxAgeMs: SNAPSHOT_MAX_AGE_MS,
            detail: snapshotErr?.message,
          });
        }
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'x-cache-hit': 'false',
      });

      let liveInsight = '';
      let widget = null;

      try {
        const llmStartedAt = Date.now();
        for await (const token of streamAgentChatReply({
          prompt: effectivePrompt,
          mdSnapshot,
          conversationHistory: conversationMemory,
          classification,
        })) {
          liveInsight += token;
          writeSse(res, 'token', { token });
        }
        mark('llmMs', llmStartedAt);
        widget = extractWidgetFromMarkdown(liveInsight);
        liveInsight = stripSuggestedQuestions(liveInsight);
        widget = widget || buildFallbackChartWidget(prompt, liveInsight, conversationMemory);

        try {
          const historyStartedAt = Date.now();
          await prisma.conversationHistory.create({
            data: {
              tenantId,
              role: 'user',
              content: prompt,
            },
          });

          await prisma.conversationHistory.create({
            data: {
              tenantId,
              role: 'assistant',
              content: JSON.stringify({ widget, insight: liveInsight }),
            },
          });
          mark('historyWriteMs', historyStartedAt);
        } catch (historyErr) {
          console.error('Failed to store streamed conversation history:', historyErr);
        }

        console.log('[Chat Route] streamed', {
          intent,
          snapshotSource,
          snapshotAgeMs,
          fuzzyCorrection: fuzzyCorrection ? fuzzyCorrection.campaign.name : null,
          memoryTurns: conversationMemory.length,
          memoryTruncated: memoryResult.truncatedCount,
          memoryEstimatedTokens: memoryResult.estimatedTokens,
          totalMs: Date.now() - startedAt,
          ...timings,
        });

        const responsePayload = {
          widget,
          insight: liveInsight,
          intent,
          dataSnapshot,
          prunedRows: 0,
          snapshotSource,
          snapshotAgeMs,
          fuzzyCorrection: fuzzyCorrection ? fuzzyCorrection.campaign.name : null,
          memoryTurns: conversationMemory.length,
          memoryTruncated: memoryResult.truncatedCount,
          memoryEstimatedTokens: memoryResult.estimatedTokens,
        };
        setCachedChatResponse(semanticCacheKey, responsePayload);
        writeSse(res, 'done', {
          type: '[DONE]',
          ...responsePayload,
        });
        return res.end();
      } catch (streamErr: any) {
        console.error('Streaming chat error:', streamErr);
        writeSse(res, 'error', {
          error: streamErr?.message || 'Streaming chat failed.',
        });
        return res.end();
      }
    }

    if (intent === 'knowledge_base') {
      const replyStartedAt = Date.now();
      let insight = await traceRunnableStep(
        'final_answer',
        { tenantId, intent },
        () => buildKnowledgeBaseReply(prompt, conversationMemory),
        { tenantId, intent, stage: 'static_final_answer' },
      );
      insight = stripSuggestedQuestions(insight);
      mark('replyMs', replyStartedAt);

      try {
        const historyStartedAt = Date.now();
        await prisma.conversationHistory.create({
          data: {
            tenantId,
            role: 'user',
            content: prompt,
          },
        });

        await prisma.conversationHistory.create({
          data: {
            tenantId,
            role: 'assistant',
            content: JSON.stringify({ widget: null, insight }),
          },
        });
        mark('historyWriteMs', historyStartedAt);
      } catch (historyErr) {
        console.error('Failed to store conversation history:', historyErr);
      }

      console.log('[Chat Route] completed', {
        intent,
        snapshotSource: 'none',
        memoryTurns: conversationMemory.length,
        memoryTruncated: memoryResult.truncatedCount,
        memoryEstimatedTokens: memoryResult.estimatedTokens,
        totalMs: Date.now() - startedAt,
        ...timings,
      });

      const responsePayload = {
        widget: null,
        insight,
        intent,
        dataSnapshot: null,
        prunedRows: 0,
        memoryTurns: conversationMemory.length,
        memoryTruncated: memoryResult.truncatedCount,
        memoryEstimatedTokens: memoryResult.estimatedTokens,
      };
      setCachedChatResponse(semanticCacheKey, responsePayload);
      return res.json(responsePayload);
    }

    let mdSnapshot = '';
    let dataSnapshot: any = null;
    let snapshotSource: 'cache' | 'missing' = 'missing';
    let snapshotAgeMs: number | null = null;
    let snapshotCampaigns: SnapshotCampaign[] = [];
    try {
      const snapshotStartedAt = Date.now();
      const cachedSnapshot = await readCachedAgentSnapshot(tenantId, clientId || tenantId);
      mdSnapshot = cachedSnapshot.mdSnapshot;
      snapshotAgeMs = cachedSnapshot.snapshotAgeMs;
      snapshotCampaigns = parseSnapshotCampaigns(mdSnapshot);
      fuzzyCorrection = findCampaignCorrection(prompt, snapshotCampaigns);
      if (fuzzyCorrection) {
        effectivePrompt = `${prompt}\n\nCampaign name fuzzy match: interpret "${fuzzyCorrection.phrase}" as "${fuzzyCorrection.campaign.name}".`;
      }
      snapshotSource = 'cache';
      mark('snapshotMs', snapshotStartedAt);
    } catch (snapshotErr: any) {
      console.error('AI Brain cached snapshot missing or stale:', snapshotErr);
      return res.status(503).json({
        error: 'AI Brain snapshot is not ready. Please wait for the scheduled snapshot refresh.',
        snapshotSource,
        snapshotMaxAgeMs: SNAPSHOT_MAX_AGE_MS,
        detail: snapshotErr?.message,
      });
    }

    const anthropicActive = hasAnthropicProvider();
    let liveInsight = '';
    let widget = null;

    if (anthropicActive) {
      console.log('[Chat Route] Claude key is active. Using handleAgentChat for single-turn snapshot analysis...');
      logLlmProviderSelection('chat-route', 'anthropic', getAnthropicModel('analysis'));
      const llmStartedAt = Date.now();
      try {
        const chatResult = await traceRunnableStep(
          'final_answer',
          { tenantId, intent, provider: 'anthropic' },
          () => handleAgentChat({
            prompt: effectivePrompt,
            mdSnapshot,
            conversationHistory: conversationMemory,
            classification,
          }),
          { tenantId, intent, provider: 'anthropic', stage: 'final_answer' },
        );
        mark('llmMs', llmStartedAt);
        liveInsight = chatResult.reply;
        widget = extractWidgetFromMarkdown(liveInsight);
      } catch (anthropicErr: any) {
        console.error('[Chat Route] Anthropic call failed, falling back to OpenAI ReAct loop:', anthropicErr?.message || anthropicErr);
        if (hasOpenAiProvider()) {
          console.log('[Chat Route] Falling back to OpenAI agentic workflow ReAct loop...');
          logLlmProviderSelection('chat-route', 'openai', process.env.OPENAI_MODEL || 'gpt-4o');
          const reactResult = await traceRunnableStep(
            'final_answer',
            { tenantId, intent, provider: 'openai_react' },
            () => runAgentWorkflow(
              effectivePrompt,
              tenantId,
              clientId || tenantId,
              conversationMemory,
              pageContext
            ),
            { tenantId, intent, provider: 'openai_react', stage: 'final_answer' },
          );
          liveInsight = reactResult.insight;
          widget = reactResult.widget;
        } else {
          throw anthropicErr;
        }
      }
    } else {
      console.log('[Chat Route] OpenAI key is active. Falling back to agentic workflow ReAct loop...');
      logLlmProviderSelection('chat-route', 'openai', process.env.OPENAI_MODEL || 'gpt-4o');
      const llmStartedAt = Date.now();
      const reactResult = await traceRunnableStep(
        'final_answer',
        { tenantId, intent, provider: 'openai_react' },
        () => runAgentWorkflow(
          effectivePrompt,
          tenantId,
          clientId || tenantId,
          conversationMemory,
          pageContext
        ),
        { tenantId, intent, provider: 'openai_react', stage: 'final_answer' },
      );
      mark('llmMs', llmStartedAt);
      liveInsight = reactResult.insight;
      widget = reactResult.widget;
    }

    widget = widget || extractWidgetFromMarkdown(liveInsight);
    liveInsight = stripSuggestedQuestions(liveInsight);
    widget = widget || buildFallbackChartWidget(prompt, liveInsight, conversationMemory);

    // Store each turn in ConversationHistory table
    // 1. Store user message
    try {
      const historyStartedAt = Date.now();
      await prisma.conversationHistory.create({
        data: {
          tenantId,
          role: 'user',
          content: prompt,
        },
      });

      // 2. Store assistant message
      const assistantPayload = {
        widget,
        insight: liveInsight,
      };

      await prisma.conversationHistory.create({
        data: {
          tenantId,
          role: 'assistant',
          content: JSON.stringify(assistantPayload),
        },
      });
      mark('historyWriteMs', historyStartedAt);
    } catch (historyErr) {
      console.error('Failed to store conversation history:', historyErr);
    }

    console.log('[Chat Route] completed', {
      intent,
      snapshotSource,
      snapshotAgeMs,
      fuzzyCorrection: fuzzyCorrection ? fuzzyCorrection.campaign.name : null,
      memoryTurns: conversationMemory.length,
      memoryTruncated: memoryResult.truncatedCount,
      memoryEstimatedTokens: memoryResult.estimatedTokens,
      totalMs: Date.now() - startedAt,
      ...timings,
    });

    const responsePayload = {
      widget,
      insight: liveInsight,
      intent,
      dataSnapshot,
      prunedRows: 0,
      snapshotSource,
      snapshotAgeMs,
      fuzzyCorrection: fuzzyCorrection ? fuzzyCorrection.campaign.name : null,
      memoryTurns: conversationMemory.length,
      memoryTruncated: memoryResult.truncatedCount,
      memoryEstimatedTokens: memoryResult.estimatedTokens,
    };
    setCachedChatResponse(semanticCacheKey, responsePayload);
    return res.json(responsePayload);
  } catch (error: any) {
    console.error('Chat error:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error during chat analysis.',
    });
  }
});

// GET /api/v1/chat/history?clientId=
chatRouter.get('/chat/history', requireJwtAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const clientId = req.query.clientId as string;
    if (!clientId) {
      return res.status(400).json({ error: 'clientId query parameter is required.' });
    }

    if (req.auth!.tenantId !== 'agency' && clientId !== req.auth!.tenantId) {
      return res.status(403).json({ error: 'Token is not allowed to read this chat history.' });
    }

    // Fetch the last 50 messages from ConversationHistory, sorted by createdAt ASC
    const history = await prisma.conversationHistory.findMany({
      where: {
        tenantId: clientId,
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: 50,
    });

    // Format the response. If the role is assistant, parse the content as JSON to retrieve the widget.
    const messages = history.map(msg => {
      let content = msg.content;
      let widget = null;
      let insight = msg.content;

      if (msg.role === 'assistant') {
        try {
          const parsed = JSON.parse(msg.content);
          widget = parsed.widget;
          insight = parsed.insight || parsed.widget?.insight || '';
          content = insight;
        } catch (e) {
          // Fallback if not valid JSON
        }
      }

      return {
        id: msg.id,
        tenantId: msg.tenantId,
        role: msg.role,
        content,
        widget,
        insight,
        createdAt: msg.createdAt,
      };
    });

    return res.json(messages);
  } catch (error: any) {
    return next(error);
  }
});

// DELETE /api/v1/chat/history?clientId=
chatRouter.delete('/chat/history', requireJwtAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const clientId = req.query.clientId as string;
    if (!clientId) {
      return res.status(400).json({ error: 'clientId query parameter is required.' });
    }

    if (req.auth!.tenantId !== 'agency' && clientId !== req.auth!.tenantId) {
      return res.status(403).json({ error: 'Token is not allowed to clear this chat history.' });
    }

    await prisma.conversationHistory.deleteMany({
      where: {
        tenantId: clientId,
      },
    });

    return res.json({ success: true, message: 'Chat history cleared successfully.' });
  } catch (error: any) {
    return next(error);
  }
});

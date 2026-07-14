import fs from 'node:fs/promises';
import path from 'node:path';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { AI_BRAIN_DATE_WINDOW } from './ai-brain.service.js';
import { executeReadOnlySql, queryOne } from './db.service.js';
import { prepareAiSql } from './sql-safety.service.js';
import { getTraceCostEstimate, traceRunnableStep } from './langsmith-tracing.service.js';
import { getAnthropicApiKey, getAnthropicModel, logLlmProviderSelection } from './llm-provider.service.js';
import axios from 'axios';

const VERIFIED_CONTEXT_CACHE_TTL_MS = 5 * 60 * 1000;

type VerifiedCampaignContextCacheEntry = {
  data: any[];
  expiresAt: number;
  lastSyncedAt: number | null;
};

const verifiedCampaignContextCache = new Map<string, VerifiedCampaignContextCacheEntry>();
const verifiedCampaignContextRefreshes = new Map<string, Promise<any[]>>();

const AGENT_ACTIONS = [
  'read_agent_data_snapshot',
  'query_campaign_database',
  'get_marketing_benchmarks',
  'search_web_for_benchmarks',
  'none',
] as const;

type AgentAction = typeof AGENT_ACTIONS[number];

type AgentStructuredResponse = {
  thought: string;
  action: AgentAction;
  action_input: string;
  final_answer: string;
  widget: {
    chart_type: 'bar_chart' | 'line_chart' | 'table' | 'kpi_card' | 'pie_chart' | 'bubble_chart' | 'scatter_chart';
    title: string;
    config: {
      x_axis: string | null;
      y_axis: string | null;
      z_axis?: string | null;
      sort: 'ASC' | 'DESC' | null;
    };
    sql: string;
    data?: any[];
  } | null;
};

function messagesToTraceText(messages: any[]) {
  return messages
    .map(message => String(message?.content ?? ''))
    .join('\n');
}

const AGENT_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    thought: { type: 'string' },
    action: { type: 'string', enum: AGENT_ACTIONS },
    action_input: { type: 'string' },
    final_answer: { type: 'string' },
    widget: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            chart_type: {
              type: 'string',
              enum: ['bar_chart', 'line_chart', 'table', 'kpi_card', 'pie_chart', 'bubble_chart', 'scatter_chart'],
            },
            title: { type: 'string' },
            config: {
              type: 'object',
              additionalProperties: false,
              properties: {
                x_axis: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                y_axis: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                z_axis: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                sort: { anyOf: [{ type: 'string', enum: ['ASC', 'DESC'] }, { type: 'null' }] },
              },
              required: ['x_axis', 'y_axis', 'z_axis', 'sort'],
            },
            sql: { type: 'string' },
          },
          required: ['chart_type', 'title', 'config', 'sql'],
        },
        { type: 'null' },
      ],
    },
  },
  required: ['thought', 'action', 'action_input', 'final_answer', 'widget'],
} as const;

const OPENAI_AGENT_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'agent_response',
    strict: true,
    schema: AGENT_RESPONSE_JSON_SCHEMA,
  },
} as const;

const ANTHROPIC_AGENT_RESPONSE_TOOL = {
  name: 'agent_response',
  description: 'Return the next ReAct loop decision or final marketing analysis in a structured object.',
  input_schema: AGENT_RESPONSE_JSON_SCHEMA,
} as const;

function cleanAgentFinalAnswer(answer: string): string {
  if (!answer) return answer;
  let clean = answer.trim();

  const oldHeaderPattern = /###\s*(?:🚨|URGENT).*?\n[\s\S]*?###\s*(?:✅|PRIORITY).*?\n/i;
  if (oldHeaderPattern.test(clean) && !clean.includes('```chartdata')) {
    clean = clean.replace(oldHeaderPattern, '').trim();
  }

  return clean;
}

function isModeENewCampaignRequest(prompt: string): boolean {
  return /\b(new campaign|campaign idea|suggest a campaign|festival|launch strategy|what should i run|upcoming campaign|design a campaign|full funnel)\b/i.test(prompt);
}

function hasModeEFunnel(answer: string): boolean {
  return /Campaign Concept:/i.test(answer)
    && /AWARENESS \(Top of Funnel\)/i.test(answer)
    && /CONSIDERATION \(Mid Funnel\)/i.test(answer)
    && /CONVERSION \(Bottom Funnel\)/i.test(answer)
    && /RE-ENGAGEMENT/i.test(answer);
}

function formatInr(value: unknown): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '₹0';
  return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function numberOrFallback(value: unknown, fallback: number): number {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : fallback;
}

function buildModeEFunnelAnswer(prompt: string, verifiedCampaignContext: any[]): string {
  const campaigns = Array.isArray(verifiedCampaignContext) ? verifiedCampaignContext : [];
  const leadBenchmarks = campaigns
    .filter(row => String(row?.campaign_type || '').toUpperCase() === 'LEAD_GEN' && Number(row?.cpl) > 0)
    .sort((a, b) => Number(a.cpl) - Number(b.cpl));
  const benchmark = leadBenchmarks[0] || campaigns.find(row => Number(row?.cpl) > 0) || campaigns[0] || {};

  const benchmarkName = String(benchmark.campaign_name || 'best available lead-gen campaign');
  const benchmarkCpl = numberOrFallback(benchmark.cpl, 150);
  const benchmarkCtr = numberOrFallback(benchmark.ctr, 1.5);
  const benchmarkCpc = numberOrFallback(Number(benchmark.spend) / Number(benchmark.clicks), 25);
  const benchmarkCpm = numberOrFallback(benchmark.cpm, 100);
  const benchmarkCvr = numberOrFallback(benchmark.click_to_lead_cvr, 8);
  const benchmarkReach = Math.round(numberOrFallback(benchmark.reach, 50000));
  const totalBudget = Math.max(25000, Math.round(numberOrFallback(benchmark.spend, 100000) / 1000) * 1000);

  const awarenessBudget = Math.round(totalBudget * 0.30);
  const considerationBudget = Math.round(totalBudget * 0.25);
  const conversionBudget = Math.round(totalBudget * 0.35);
  const reengagementBudget = totalBudget - awarenessBudget - considerationBudget - conversionBudget;

  const projectedImpressions = Math.max(1, Math.round((totalBudget / benchmarkCpm) * 1000));
  const projectedClicks = Math.max(1, Math.round(projectedImpressions * (benchmarkCtr / 100)));
  const projectedFormOpens = Math.max(1, Math.round(projectedClicks * 0.20));
  const projectedLeads = Math.max(1, Math.round(conversionBudget / benchmarkCpl));
  const considerationLeads = Math.max(1, Math.round(projectedLeads * 0.15));
  const reengagementLeads = Math.max(1, Math.round(reengagementBudget / (benchmarkCpl * 1.2)));

  const conceptName = /\bxev\b/i.test(prompt)
    ? 'Mahindra XEV High-Intent Test Drive Funnel'
    : /\bthar\b/i.test(prompt)
      ? 'Mahindra Thar Adventure Lead Funnel'
      : 'Mahindra High-Intent Lead Funnel';

  return `💡 Campaign Concept: ${conceptName}
Lead generation | Estimated CPL: ${formatInr(benchmarkCpl)} based on ${benchmarkName}

The idea in one sentence: Use a full-funnel Meta campaign to build qualified vehicle interest first, then convert warm engagers through a higher-intent lead form using ${benchmarkName} as the efficiency benchmark.

\`\`\`
AWARENESS (Top of Funnel)
 Format: Video/Reels/Stories
 Audience: Auto intenders, Mahindra SUV interests, in-market car buyers
 Budget: ${formatInr(awarenessBudget)} (30% of total)
 KPI: CPM  ${formatInr(benchmarkCpm)} | Reach target ${benchmarkReach.toLocaleString('en-IN')}

       

CONSIDERATION (Mid Funnel)
 Format: Carousel/Static
 Audience: Lookalike of leads + auto interest retargeting
 Budget: ${formatInr(considerationBudget)} (25% of total)
 KPI: CTR  ${benchmarkCtr.toFixed(2)}% | CPC  ${formatInr(benchmarkCpc)}

       

CONVERSION (Bottom Funnel)
 Format: Lead Form — Higher Intent
 Audience: Video viewers 50%+ + form openers
 Budget: ${formatInr(conversionBudget)} (35% of total)
 KPI: CPL  ${formatInr(benchmarkCpl)} | CVR  ${benchmarkCvr.toFixed(2)}%

       

RE-ENGAGEMENT
 Format: WhatsApp / Retargeting
 Audience: Unconverted leads
 Budget: ${formatInr(reengagementBudget)} (10% of total)
 KPI: Re-engagement CPL  ${formatInr(benchmarkCpl * 1.2)}
\`\`\`

| Stage | Budget | Projected Leads | CPL Target |
|---|---:|---:|---:|
| Awareness | ${formatInr(awarenessBudget)} | 0 | ${formatInr(benchmarkCpl)} |
| Consideration | ${formatInr(considerationBudget)} | ${considerationLeads} | ${formatInr(benchmarkCpl)} |
| Conversion | ${formatInr(conversionBudget)} | ${projectedLeads} | ${formatInr(benchmarkCpl)} |
| Re-engagement | ${formatInr(reengagementBudget)} | ${reengagementLeads} | ${formatInr(benchmarkCpl * 1.2)} |

\`\`\`chartdata
{"type":"bar","title":"Projected Funnel — ${conceptName}","labels":["Impressions","Clicks","Form Opens","Leads"],"datasets":[{"label":"Projected Volume","data":[${projectedImpressions},${projectedClicks},${projectedFormOpens},${projectedLeads}],"color":"#6366F1"}]}
\`\`\`

You should also look at ${benchmarkName}, because its current ${formatInr(benchmarkCpl)} CPL is the benchmark this new funnel must beat before scaling beyond ${formatInr(totalBudget)}.`;
}

function normalizeAgentStructuredResponse(value: any): AgentStructuredResponse {
  if (!value || typeof value !== 'object') {
    throw new Error('Structured agent response is not an object.');
  }

  if (!AGENT_ACTIONS.includes(value.action)) {
    throw new Error(`Structured agent response has invalid action: ${value.action}`);
  }

  const widget = value.widget ?? null;
  if (widget !== null) {
    const validChartTypes = ['bar_chart', 'line_chart', 'table', 'kpi_card', 'pie_chart', 'bubble_chart', 'scatter_chart'];
    if (!validChartTypes.includes(widget.chart_type)) {
      throw new Error(`Structured agent response has invalid widget chart_type: ${widget.chart_type}`);
    }
  }

  return {
    thought: String(value.thought ?? ''),
    action: value.action,
    action_input: String(value.action_input ?? ''),
    final_answer: String(value.final_answer ?? ''),
    widget: widget === null ? null : {
      chart_type: widget.chart_type,
      title: String(widget.title ?? ''),
      config: {
        x_axis: widget.config?.x_axis ?? null,
        y_axis: widget.config?.y_axis ?? null,
        z_axis: widget.config?.z_axis ?? null,
        sort: widget.config?.sort ?? null,
      },
      sql: String(widget.sql ?? ''),
      data: Array.isArray(widget.data) ? widget.data : [],
    },
  };
}

async function invokeStructuredAgentModel(params: {
  model: any;
  messages: any[];
  provider: 'anthropic' | 'openai';
}): Promise<AgentStructuredResponse> {
  if (params.provider === 'anthropic') {
    const response = await params.model.invoke(params.messages, {
      tools: [ANTHROPIC_AGENT_RESPONSE_TOOL],
      tool_choice: { type: 'tool', name: 'agent_response' },
      strict: true,
    });
    const toolCall = response.tool_calls?.find((call: any) => call.name === 'agent_response') || response.tool_calls?.[0];
    if (!toolCall?.args) {
      throw new Error('Claude did not return the required agent_response tool call.');
    }
    return normalizeAgentStructuredResponse(toolCall.args);
  }

  const response = await params.model.invoke(params.messages);
  return normalizeAgentStructuredResponse(JSON.parse(String(response.content)));
}

async function invokeStructuredFallbackModel(params: {
  messages: any[];
  anthropicKey?: string;
  anthropicModel: string;
}): Promise<AgentStructuredResponse> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    const fallbackModelName = process.env.OPENAI_MODEL || 'gpt-4o';
    console.warn(`[Agent] Structured output failed. Falling back to ${fallbackModelName} with JSON Schema...`);
    const fallbackModel = new ChatOpenAI({
      apiKey: openaiKey,
      model: fallbackModelName,
      temperature: 0.2,
      maxRetries: 0,
      modelKwargs: {
        response_format: OPENAI_AGENT_RESPONSE_FORMAT,
      },
    } as any);
    return invokeStructuredAgentModel({ model: fallbackModel, messages: params.messages, provider: 'openai' });
  }

  throw new Error('No fallback model API key is configured. Set OPENAI_API_KEY as a fallback for when Anthropic is unavailable.');
}


export type ChatHistoryMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

// 1. Tool implementations
async function readAgentDataSnapshot(tenantId: string, clientId?: string | null): Promise<string> {
  return traceRunnableStep('snapshot_read', { tenantId, clientId }, async () => {
    const scope = clientId && clientId !== 'agency' ? clientId : tenantId;
    const baseName = `${scope}_${AI_BRAIN_DATE_WINDOW.from}_to_${AI_BRAIN_DATE_WINDOW.to}`;
    const outputDir = path.resolve(process.cwd(), 'agent-data');
    const mdPath = path.join(outputDir, `${baseName}.md`);
    try {
      const data = await fs.readFile(mdPath, 'utf8');
      return data;
    } catch (err: any) {
      return `Error reading snapshot: ${err.message}. Please verify if the sync has run first.`;
    }
  }, { tenantId, clientId, tool: 'read_agent_data_snapshot' });
}

async function queryCampaignDatabase(sql: string, tenantId: string): Promise<string> {
  return traceRunnableStep('tool_call', { tenantId, tool: 'query_campaign_database' }, async () => {
    try {
      const sqlToRun = prepareAiSql(sql, tenantId);
      console.log('Agent executed SQL tool:', sqlToRun);
      const rows = await executeReadOnlySql(sqlToRun);
      return JSON.stringify(rows.slice(0, 30), null, 2); // Limit output to prevent model context flooding
    } catch (err: any) {
      return `SQL Query execution failed: ${err.message}. Verify column names, tables, and syntax.`;
    }
  }, { tenantId, tool: 'query_campaign_database' });
}

async function getVerifiedCampaignContext(tenantId: string): Promise<any[]> {
  const sql = `
SELECT
  campaign_name,
  CASE
    WHEN campaign_name ILIKE '%Commercial%' THEN 'COMMERCIAL'
    WHEN campaign_name ILIKE '%Branding%' OR campaign_name ILIKE '%Insta%' OR campaign_name ILIKE '%eSUV%' THEN 'BRANDING'
    WHEN campaign_name ILIKE '%Sales%' OR campaign_name ILIKE '%XEV%' OR campaign_name ILIKE '%Passenger%' OR campaign_name ILIKE '%Leads%' THEN 'LEAD_GEN'
    ELSE 'LEAD_GEN'
  END AS campaign_type,
  SUM(spend)::float AS spend,
  SUM(conversions)::float AS leads,
  SUM(clicks)::float AS clicks,
  SUM(impressions)::float AS impressions,
  SUM(reach)::float AS reach,
  AVG(frequency)::float AS frequency,
  (SUM(spend)::numeric / NULLIF(SUM(conversions), 0))::float AS cpl,
  ((SUM(conversions)::numeric / NULLIF(SUM(clicks), 0)) * 100)::float AS click_to_lead_cvr,
  ((SUM(clicks)::numeric / NULLIF(SUM(impressions), 0)) * 100)::float AS ctr,
  ((SUM(spend)::numeric / NULLIF(SUM(impressions), 0)) * 1000)::float AS cpm,
  (SUM(action_value)::numeric / NULLIF(SUM(spend), 0))::float AS roas
FROM GOLD_CAMPAIGN_DAILY
WHERE date >= DATE '${AI_BRAIN_DATE_WINDOW.from}'
  AND date <= DATE '${AI_BRAIN_DATE_WINDOW.to}'
GROUP BY campaign_id, campaign_name, campaign_type
ORDER BY spend DESC
LIMIT 80`;

  try {
    console.time(`[AgentContext] verified context SQL ${tenantId}`);
    const rows = await executeReadOnlySql(prepareAiSql(sql, tenantId));
    console.timeEnd(`[AgentContext] verified context SQL ${tenantId}`);
    return rows;
  } catch (err) {
    console.timeEnd(`[AgentContext] verified context SQL ${tenantId}`);
    console.error('Failed to build verified campaign context:', err);
    return [];
  }
}

async function getCampaignLastSyncedAt(tenantId: string): Promise<number | null> {
  try {
    console.time(`[AgentContext] last synced check ${tenantId}`);
    const row = await queryOne<{ lastSyncedAt: Date | string | null }>(
      'SELECT MAX(updated_at) AS "lastSyncedAt" FROM campaign_data WHERE tenant_id = $1',
      [tenantId],
    );
    console.timeEnd(`[AgentContext] last synced check ${tenantId}`);

    if (!row?.lastSyncedAt) return null;
    const timestamp = new Date(row.lastSyncedAt).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  } catch (err) {
    console.timeEnd(`[AgentContext] last synced check ${tenantId}`);
    console.error('Failed to check campaign last synced timestamp:', err);
    return null;
  }
}

export function invalidateVerifiedCampaignContextCache(tenantId?: string) {
  if (tenantId) {
    verifiedCampaignContextCache.delete(tenantId);
    verifiedCampaignContextRefreshes.delete(tenantId);
    return;
  }

  verifiedCampaignContextCache.clear();
  verifiedCampaignContextRefreshes.clear();
}

export async function getCachedVerifiedCampaignContext(tenantId: string): Promise<any[]> {
  const now = Date.now();
  const cached = verifiedCampaignContextCache.get(tenantId);
  const lastSyncedAt = await getCampaignLastSyncedAt(tenantId);

  if (cached && cached.expiresAt > now && cached.lastSyncedAt === lastSyncedAt) {
    console.log(`[AgentContext] cache hit tenant=${tenantId} rows=${cached.data.length} ttlMs=${cached.expiresAt - now}`);
    return cached.data;
  }

  const refreshReason = !cached
    ? 'miss'
    : cached.lastSyncedAt !== lastSyncedAt
      ? 'last_synced_changed'
      : 'expired';

  console.log(`[AgentContext] cache refresh tenant=${tenantId} reason=${refreshReason}`);
  const inFlightRefresh = verifiedCampaignContextRefreshes.get(tenantId);
  if (inFlightRefresh) {
    console.log(`[AgentContext] awaiting in-flight refresh tenant=${tenantId}`);
    return inFlightRefresh;
  }

  const refreshPromise = (async () => {
    console.time(`[AgentContext] refresh ${tenantId}`);
    try {
      return await getVerifiedCampaignContext(tenantId);
    } finally {
      console.timeEnd(`[AgentContext] refresh ${tenantId}`);
      verifiedCampaignContextRefreshes.delete(tenantId);
    }
  })();

  verifiedCampaignContextRefreshes.set(tenantId, refreshPromise);
  const data = await refreshPromise;

  verifiedCampaignContextCache.set(tenantId, {
    data,
    expiresAt: now + VERIFIED_CONTEXT_CACHE_TTL_MS,
    lastSyncedAt,
  });

  return data;
}

function getMarketingBenchmarks(): string {
  return `CAI Media Meta Ads benchmarks by campaign type:
- LEAD_GEN campaign names contain Sales, XEV, Passenger, or Leads. Primary focus: CPL, Total Leads, Click-to-Lead CVR, and Form drop-off. Good CPL below \\u20B9150, watch \\u20B9150-\\u20B9200, poor above \\u20B9200. Good Click-to-Lead CVR above 8%.
- COMMERCIAL campaign names contain Commercial. Primary focus: CTR, ROAS, Reach, Frequency, and CPM. Good CTR above 2%, efficient CPM below \\u20B980, frequency risk above 4.0.
- BRANDING campaign names contain Branding, Insta, or eSUV. Primary focus: CPM, Engagement Rate, Frequency, and Reach. Efficient CPM below \\u20B960, frequency risk above 4.0.
- Industry CPC context for India auto/retail campaigns: efficient below \\u20B980, watch \\u20B980-\\u20B9150, poor above \\u20B9150.
- Industry CPL context for Indian automotive lead generation: efficient below \\u20B9250, watch \\u20B9250-\\u20B9500, poor above \\u20B9500. Flag CPL below the relevant industry average as "ðŸ”µ opportunity".
- Trend context: show spend, CPL, and CTR as ↑/↓ percentage deltas when previous-window data exists. If prior-period data is missing, mark Trend as not available.
- Budget pacing context: daily burn = spend divided by elapsed days in the window. If projected spend exceeds budget before the window end, flag "ðŸš¨ Budget Risk".
- Creative fatigue context: frequency > 3.0 plus declining CTR requires a creative refresh recommendation. Frequency > 4.0 is urgent even if days-since-change is unavailable.
- Standard delivery metrics (Spend, Clicks, Impressions, CTR, CPC, Frequency) are tracked and can be reported for all campaign types.
- Never benchmark across types. Compare LEAD_GEN only to LEAD_GEN, COMMERCIAL only to COMMERCIAL, BRANDING only to BRANDING.
- Use \\u20B9 for all money values. Current active year is assumed to be 2026.`;
}

async function searchWebForBenchmarks(query: string): Promise<string> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    console.warn('TAVILY_API_KEY is not configured in environment variables.');
    return "Web search is currently not configured on this server. Please configure TAVILY_API_KEY in backend/.env.";
  }

  return traceRunnableStep('tool_call', { tool: 'search_web_for_benchmarks', query }, async () => {
    try {
      const response = await axios.post('https://api.tavily.com/search', {
        api_key: apiKey,
        query: query,
        search_depth: "basic",
        include_answer: true,
        max_results: 3
      });

      return response.data.answer || JSON.stringify(response.data.results);
    } catch (err: any) {
      console.error('Tavily API call failed:', err);
      return `Web search failed: ${err.message}`;
    }
  }, { tool: 'search_web_for_benchmarks' });
}

// 2. ReAct Agent Loop Prompt
const AGENT_SPEED_OPTIMIZATION_PROMPT = `Speed optimization: if the user's question can be answered from the verified campaign context below, respond immediately with action: 'none'. Do not call tools.`;

const AGENT_SYSTEM_PROMPT = `You are a performance marketing analyst with access to CAI Mahindra's campaign data.

Role:
You behave like a senior marketing analyst, not a report generator. Infer the user intent first, then choose the smallest response format that fully answers it. The question decides the format.

Adaptive response rules:
1. Answer the actual question directly in the first sentence unless the user explicitly asks for a brief, forecast, or report.
2. Use exact campaign names and numbers from the verified context or tool observations. Every important claim needs a number.
3. Do not force a template. A simple question can be 1-3 natural sentences. A brief/report can use sections. A comparison can use a table. A forecast can use scenarios.
4. Use a widget only when the user asks for a visual or when a chart/table materially improves the answer. Return widget: null for quick explanations, yes/no answers, short recommendations, or simple single-metric answers.
5. Choose chart types intelligently: bar_chart for ranked comparisons, line_chart for trends, pie_chart for share-of-total with few categories, bubble_chart/scatter_chart for trade-offs such as spend vs CPL with leads as bubble size, table for dense multi-metric comparisons, kpi_card for a few headline metrics.
6. For chart-change follow-ups like "bubble chart instead", reuse the prior question and prior data from chat history. Change only the visualization type and keep the analysis short.
7. For campaign briefs, write like an account manager: short executive summary, key metrics, what is working/not working, and next actions.
8. For forecasts, show assumptions and scenario math. Be clear about uncertainty.
9. Do not mention internal tables, SQL, tool calls, data window, or developer details.
10. Never end with "Let me know" or generic next prompts.
11. Use INR/rupee notation consistently and match the user language.
12. If you return a widget, its data array must contain actual rows to render unless you provide a valid SQL query that will return those rows. Never return an empty data array with an empty SQL string.

Mode E: New campaign idea / strategy
Triggered by: "new campaign", "campaign idea", "suggest a campaign", "festival", "launch strategy", "what should I run", "upcoming campaign", "design a campaign", "full funnel".
When triggered, final_answer MUST use this exact shape:
Start with "💡 Campaign Concept: [Name]".
Next line: "[Objective] | Estimated CPL: ₹[X] based on [existing benchmark campaign]".
Then: "The idea in one sentence: [What this does and why it will work]".
Then include a plain triple-backtick ASCII funnel block with exactly these stage labels: AWARENESS (Top of Funnel), CONSIDERATION (Mid Funnel), CONVERSION (Bottom Funnel), RE-ENGAGEMENT.
After the funnel, include this table: | Stage | Budget | Projected Leads | CPL Target |.
Then include a chartdata fenced block for Projected Funnel.
Then end with a sticky hook using real campaign names and real ₹ numbers.
Strict rule for Mode E: NEVER use "## A. Awareness" / "## B. Consideration" style headers. The ASCII funnel block is mandatory and must be visible in final_answer.

Date window: ${AI_BRAIN_DATE_WINDOW.from} to ${AI_BRAIN_DATE_WINDOW.to}.

Analysis to consider when relevant:
- Cross-platform: Compare Meta vs Google when both exist
- vs Industry: Use marketing benchmarks if available
- Trend: Compare to previous period if data exists
- Budget pacing: Flag if spend velocity risks early exhaustion
- Creative fatigue: Flag if frequency > 3.0 and CTR declining

You have access to the following tools:
1. read_agent_data_snapshot: Use this to read the overall exported campaign performance summary.
2. query_campaign_database(sql): Use this to query the database table \`GOLD_CAMPAIGN_DAILY\` (maps to campaign_data).
   Columns: tenant_id, client_id, date, platform, campaign_id, campaign_name, spend, impressions, clicks, reach, frequency, ctr, cpc, cpm, roas(nullable), conversions, action_value, status.
   Strict Rules:
   - CPC = SUM(spend)/SUM(clicks) always. Never AVG(cpc). Never select the cpc column directly.
   - CTR = (SUM(clicks)::numeric / NULLIF(SUM(impressions),0)) * 100. Never AVG(ctr). Never select the ctr column directly.
   - CPM = (SUM(spend)::numeric / NULLIF(SUM(impressions),0)) * 1000. Never AVG(cpm). Never select the cpm column directly.
   - CPL = SUM(spend)::numeric / NULLIF(SUM(conversions),0). Never select the cpl column directly; there is no cpl column in the database schema.
   - Click-to-Lead CVR = (SUM(conversions)::numeric / NULLIF(SUM(clicks),0)) * 100. Never select the CVR column directly.
   - ROAS = SUM(action_value)::numeric / NULLIF(SUM(spend),0). Use AVG(roas) only if action_value is unavailable.
   - Reach = SUM(reach).
   - Frequency = AVG(frequency) always. Never calculate frequency from impressions and reach. Never select or filter by the frequency column directly in WHERE; always GROUP BY campaign_id, campaign_name and use HAVING AVG(frequency) > X.
   - Active campaigns filter: LOWER(status) = 'active'
   - Meta campaigns filter: platform ILIKE 'meta'
   - Google Ads filter: platform ILIKE 'Google Ads' or platform ILIKE 'google%'
   - Multi-platform querying: By default, query both Google Ads and Meta Ads campaigns to get a unified performance picture, unless the user specifically asks for a single platform.
   - Avoid SELECT *; always query only the specific columns you need to prevent large payloads.
   - SQL Syntax Rule: When using GROUP BY, all non-grouped columns in the SELECT clause MUST be wrapped in aggregate functions.
   - PAST PERIOD QUERYING: To compare with a previous period, query the database with WHERE date BETWEEN 'earlier_start' AND 'earlier_end'. Use the same campaign_id or campaign_name filter. Example: to compare May 1-15 with Apr 16-30, run two queries and compare in your final_answer.
3. get_marketing_benchmarks: Use this to retrieve CAI campaign type thresholds.
4. search_web_for_benchmarks(query): Use this to search the internet (via Tavily) for competitor campaign stats, industry CPC/CPL benchmarks, marketing trends, or general digital marketing best practices.

Campaign type auto-detection:
- LEAD_GEN: campaign_name contains Sales, XEV, Passenger, or Leads.
- COMMERCIAL: campaign_name contains Commercial.
- BRANDING: campaign_name contains Branding, Insta, or eSUV.
- Never mix benchmark comparisons across types.

SQL campaign_type CASE to use when needed:
CASE
  WHEN campaign_name ILIKE '%Commercial%' THEN 'COMMERCIAL'
  WHEN campaign_name ILIKE '%Branding%' OR campaign_name ILIKE '%Insta%' OR campaign_name ILIKE '%eSUV%' THEN 'BRANDING'
  WHEN campaign_name ILIKE '%Sales%' OR campaign_name ILIKE '%XEV%' OR campaign_name ILIKE '%Passenger%' OR campaign_name ILIKE '%Leads%' THEN 'LEAD_GEN'
  ELSE 'LEAD_GEN'
END

Session memory:
- Use the supplied chat history to avoid repeating the same points.
- Build on earlier findings when useful.

Speed reminder: only query tools when the answer is not available in the verified campaign context.

Your JSON output must match this schema:
{
  "thought": "Your reasoning about what data you need or what tool to call next.",
  "action": "read_agent_data_snapshot" | "query_campaign_database" | "get_marketing_benchmarks" | "search_web_for_benchmarks" | "none",
  "action_input": "The argument to pass to the tool (e.g. the SQL query string for query_campaign_database, or empty string otherwise)",
  "final_answer": "Only fill this in if action is \"none\". Natural analyst answer adapted to the user intent. No rigid template unless the user asked for a structured brief/report.",
  "widget": {
    "chart_type": "bar_chart" | "line_chart" | "table" | "kpi_card" | "pie_chart" | "bubble_chart" | "scatter_chart",
    "title": "A descriptive title for the chart/data",
    "config": {
      "x_axis": "column name for x axis (e.g. platform, date, campaign_name or null)",
      "y_axis": "column name for y axis (e.g. spend, conversions or null)",
      "z_axis": "column name for bubble size, usually conversions/leads, or null",
      "sort": "ASC" | "DESC" | null,
      "chart_style": "comparison" | "trend" | "distribution" | "forecast" | null
    },
    "sql": "The SQL query that was run or would return this chart data"
  } or null
}

You must respond in raw JSON format. Keep looping until you have enough observation to provide your "final_answer". When you are ready to answer, set action to "none".`;


export async function runAgentWorkflow(
  prompt: string,
  tenantId: string,
  clientId?: string | null,
  history: ChatHistoryMessage[] = [],
  pageContext?: { page: string; data?: any }
): Promise<{ widget: any; insight: string }> {
  const workflowStartedAt = Date.now();
  const toolsUsed: string[] = [];
  const verifiedCampaignContext = await traceRunnableStep(
    'snapshot_read',
    { tenantId, source: 'verified_campaign_context_cache' },
    () => getCachedVerifiedCampaignContext(tenantId),
    { tenantId, source: 'verified_campaign_context_cache' },
  );
  const openaiModel = process.env.OPENAI_MODEL || 'gpt-4o';

  const anthropicKey = getAnthropicApiKey();
  const anthropicModel = getAnthropicModel('analysis');
  let model: any;
  let modelProvider: 'anthropic' | 'openai';
  if (anthropicKey) {
    console.log(`[Agent] Initializing Claude model (${anthropicModel}) as the primary model...`);
    logLlmProviderSelection('agent-workflow', 'anthropic', anthropicModel);
    modelProvider = 'anthropic';
    model = new ChatAnthropic({
      apiKey: anthropicKey,
      anthropicApiKey: anthropicKey,
      model: anthropicModel,
      temperature: 0.35,
      maxRetries: 0,
    });
  } else {
    console.log(`[Agent] Initializing ${openaiModel} as the primary model...`);
    logLlmProviderSelection('agent-workflow', 'openai', openaiModel);
    modelProvider = 'openai';
    model = new ChatOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      model: openaiModel,
      temperature: 0.35,
      maxRetries: 0,
      modelKwargs: {
        response_format: OPENAI_AGENT_RESPONSE_FORMAT,
      },
    } as any);
  }

  let pagePrompt = '';
  if (pageContext && pageContext.page) {
    pagePrompt = `User is currently on the ${pageContext.page} page. Live screen data: ${JSON.stringify(pageContext.data || {})}. Prioritize matching screen numbers.`;
  }

  const messages: any[] = [
    new SystemMessage(`${AGENT_SPEED_OPTIMIZATION_PROMPT}\n\n${AGENT_SYSTEM_PROMPT}\n${pagePrompt}`),
    new HumanMessage(`Verified CAI Meta Ads context for ${AI_BRAIN_DATE_WINDOW.from} to ${AI_BRAIN_DATE_WINDOW.to}. Treat these numbers as source of truth and do not contradict them:\n${JSON.stringify(verifiedCampaignContext, null, 2)}`),
    ...history.map(msg => {
      if (msg.role === 'system') return new SystemMessage(msg.content);
      if (msg.role === 'assistant') return new AIMessage(msg.content);
      return new HumanMessage(msg.content);
    }),
    new HumanMessage(`tenantId: ${tenantId}\nQuestion: ${prompt}`),
  ];

  let iteration = 0;
  const maxIterations = 2;
  let lastResponse: any = null;

  while (iteration < maxIterations) {
    iteration++;
    console.log(`Agent Iteration ${iteration}...`);

    let parsed: AgentStructuredResponse;
    let content = '';
    try {
      parsed = await traceRunnableStep(
        'agent_loop',
        { tenantId, iteration, provider: modelProvider },
        () => invokeStructuredAgentModel({ model, messages, provider: modelProvider }),
        {
          tenantId,
          iteration,
          model: modelProvider === 'anthropic' ? anthropicModel : openaiModel,
          provider: modelProvider,
          stage: 'llm_call',
        },
      );
    } catch (structuredErr) {
      console.error('[Agent] Structured output failed:', structuredErr);
      parsed = await traceRunnableStep(
        'agent_loop_fallback',
        { tenantId, iteration },
        () => invokeStructuredFallbackModel({
          messages,
          anthropicKey,
          anthropicModel,
        }),
        {
          tenantId,
          iteration,
          model: process.env.OPENAI_MODEL || anthropicModel,
          stage: 'fallback_llm_call',
        },
      );
    }

    content = JSON.stringify(parsed);
    console.log(`Agent Structured Output:`, parsed);

    lastResponse = parsed;

    if (!parsed.action || parsed.action === 'none') {
      break;
    }

    console.log(`Agent calling tool: ${parsed.action} with input: ${parsed.action_input}`);
    toolsUsed.push(parsed.action);
    let observation = '';
    if (parsed.action === 'read_agent_data_snapshot') {
      observation = await readAgentDataSnapshot(tenantId, clientId);
    } else if (parsed.action === 'query_campaign_database') {
      observation = await queryCampaignDatabase(parsed.action_input, tenantId);
    } else if (parsed.action === 'get_marketing_benchmarks') {
      observation = await traceRunnableStep(
        'tool_call',
        { tenantId, tool: 'get_marketing_benchmarks' },
        () => getMarketingBenchmarks(),
        { tenantId, tool: 'get_marketing_benchmarks' },
      );
    } else if (parsed.action === 'search_web_for_benchmarks') {
      observation = await searchWebForBenchmarks(parsed.action_input);
    } else {
      observation = `Unknown tool: ${parsed.action}`;
    }

    console.log(`Tool Observation (first 200 chars):`, observation.slice(0, 200));

    messages.push(new AIMessage(content));
    messages.push(new HumanMessage(`Observation from ${parsed.action}: ${observation}`));
  }

  console.log(`[Agent] completed in ${iteration} iteration(s)`);

  if (!lastResponse || !lastResponse.final_answer || lastResponse.action !== 'none') {
    console.warn('Agent ReAct loop ended prematurely or did not produce a final answer. Running structured final-answer fallback...');
    try {
      const finalFallbackMessages = [
        ...messages.filter(m => !(m instanceof AIMessage && String(m.content).includes('"action"'))),
        new HumanMessage('Return the final answer now. Use action "none", leave action_input empty, and follow the required final_answer markdown structure. Include widget only when you can provide a valid chart/table SQL.'),
      ];
      lastResponse = await traceRunnableStep(
        'final_answer',
        { tenantId, reason: 'structured_final_answer_fallback' },
        () => invokeStructuredFallbackModel({
          messages: finalFallbackMessages,
          anthropicKey,
          anthropicModel,
        }),
        {
          tenantId,
          stage: 'final_answer',
          model: process.env.OPENAI_MODEL || anthropicModel,
          iterationCount: iteration,
          toolsUsed,
        },
      );
    } catch (fallbackErr) {
      console.error('Structured final-answer fallback failed:', fallbackErr);
    }
  }

  if (!lastResponse) {
    throw new Error('Agent failed to generate a structured response.');
    console.warn('Agent ReAct loop ended prematurely or did not produce a final answer. Running one-shot fallback...');
    try {
      const fallbackModel = new ChatOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        temperature: 0.35,
      });
      const fallbackMessages = [
        ...messages.filter(m => !(m instanceof AIMessage && String(m.content).includes('"action"'))),
        new HumanMessage(`Based on the conversation and observations above, write your final response.

Rules:
1. Answer the question in the first sentence. Directly.
2. Use 1-4 sentences. Every claim needs a number.
3. No emojis, no decorative formatting, no tables unless essential.
4. No suggested follow-up questions. For new-campaign / full-funnel strategy requests, include the required sticky hook.
5. End with a decision — what to do and why.
6. Use ₹. Never describe how you arrived at the answer.
7. Do NOT wrap the entire response in JSON. Output raw text.`),
      ];
      const fallbackResponse = await traceRunnableStep(
        'final_answer',
        { tenantId, reason: 'one_shot_fallback' },
        () => fallbackModel.invoke(fallbackMessages),
        {
          tenantId,
          stage: 'final_answer',
          model: process.env.OPENAI_MODEL || 'gpt-4o',
          iterationCount: iteration,
          toolsUsed,
        },
      );
      const fallbackContent = String(fallbackResponse.content).trim();

      const fallbackCost = getTraceCostEstimate(
        process.env.OPENAI_MODEL || 'gpt-4o',
        messagesToTraceText(fallbackMessages),
        fallbackContent,
      );
      console.log('[LangSmithMetrics]', {
        runName: 'agent_workflow',
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        totalTokens: fallbackCost.tokens,
        costEstimate: fallbackCost.estimate,
        latencyMs: Date.now() - workflowStartedAt,
        iterationCount: iteration,
        toolsUsed,
      });

      return {
        widget: null,
        insight: fallbackContent || 'Analysis complete.',
      };
    } catch (fallbackErr) {
      console.error('One-shot fallback failed:', fallbackErr);
    }
  }

  if (!lastResponse) {
    throw new Error('Agent failed to generate a response.');
  }

  let widgetData: any[] = Array.isArray(lastResponse.widget?.data) ? lastResponse.widget.data : [];
  if (lastResponse.widget && lastResponse.widget.sql) {
    try {
      const sqlRows = await traceRunnableStep(
        'final_answer',
        { tenantId, stage: 'widget_sql' },
        async () => {
          const sqlToRun = prepareAiSql(lastResponse.widget.sql, tenantId);
          return executeReadOnlySql(sqlToRun);
        },
        {
          tenantId,
          stage: 'widget_sql',
          iterationCount: iteration,
          toolsUsed,
        },
      );
      if (Array.isArray(sqlRows) && sqlRows.length > 0) {
        widgetData = sqlRows;
      }
    } catch (dbErr) {
      console.error('Failed to fetch widget data for agent final output:', dbErr);
    }
  }

  const rawFinalAnswer = cleanAgentFinalAnswer(lastResponse.final_answer) || 'Analysis complete.';
  const cleanedFinalAnswer = isModeENewCampaignRequest(prompt) && !hasModeEFunnel(rawFinalAnswer)
    ? buildModeEFunnelAnswer(prompt, verifiedCampaignContext)
    : rawFinalAnswer;

  const widget = lastResponse.widget && widgetData.length > 0 ? {
    chart_type: lastResponse.widget.chart_type || 'kpi_card',
    title: lastResponse.widget.title || 'Marketing Intelligence',
    data: widgetData,
    config: lastResponse.widget.config || { x_axis: null, y_axis: null, sort: null },
    sql: lastResponse.widget.sql || null,
    insight: cleanedFinalAnswer,
  } : null;

  const modelName = modelProvider === 'anthropic' ? anthropicModel : openaiModel;
  const cost = getTraceCostEstimate(modelName, messagesToTraceText(messages), cleanedFinalAnswer);
  console.log('[LangSmithMetrics]', {
    runName: 'agent_workflow',
    model: modelName,
    totalTokens: cost.tokens,
    inputTokens: cost.inputTokens,
    outputTokens: cost.outputTokens,
    costEstimate: cost.estimate,
    latencyMs: Date.now() - workflowStartedAt,
    iterationCount: iteration,
    toolsUsed,
  });

  return {
    widget,
    insight: cleanedFinalAnswer,
  };
}


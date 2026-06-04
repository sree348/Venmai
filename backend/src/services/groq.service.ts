import { ChatGroq } from '@langchain/groq';
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { AI_BRAIN_DATE_WINDOW, MARBLISM_AI_TONE } from './ai-brain.service.js';

type ChatHistoryMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type WidgetSpec = {
  chart_type: 'bar_chart' | 'line_chart' | 'table' | 'kpi_card' | 'pie_chart';
  title: string;
  data: any[];
  config: {
    x_axis: string | null;
    y_axis: string | null;
    sort: 'ASC' | 'DESC' | 'asc' | 'desc' | null;
  };
  sql: string;
  insight: string;
};

const SYSTEM_PROMPT = `You are a marketing analytics SQL expert and MIP AI strategist. ${MARBLISM_AI_TONE}
Table: GOLD_CAMPAIGN_DAILY (maps to campaign_data).
Columns: tenant_id, date, platform, campaign_id, campaign_name, spend, impressions, clicks, reach, frequency, ctr, cpc, cpm, roas(nullable), conversions, status.

Strict Rules:
1. CPC = SUM(spend)/SUM(clicks) always. Never AVG(cpc). Never select the cpc column directly.
2. CTR = (SUM(clicks)::numeric / NULLIF(SUM(impressions),0)) * 100. Never AVG(ctr). Never select the ctr column directly.
3. FREQUENCY must always use AVG(frequency) when aggregating. For "high frequency" campaigns use:
   GROUP BY campaign_id, campaign_name, platform
   HAVING AVG(frequency) > 3
   ORDER BY AVG(frequency) DESC
   Never use WHERE frequency > X on raw rows — frequency is a daily metric.
4. Default AI brain date range = ${AI_BRAIN_DATE_WINDOW.from} to ${AI_BRAIN_DATE_WINDOW.to} unless user explicitly asks for a narrower range. Use: date >= DATE '${AI_BRAIN_DATE_WINDOW.from}' AND date <= DATE '${AI_BRAIN_DATE_WINDOW.to}'
5. Active campaigns filter: LOWER(status) = 'active'
6. Week labels = DATE_TRUNC week, return week_label as "Mar 1–7" format in data array, x_axis: "week_label". In PostgreSQL, format this exactly as: TO_CHAR(DATE_TRUNC('week', date), 'Mon FMDD') || '–' || TO_CHAR(DATE_TRUNC('week', date) + INTERVAL '6 days', 'FMDD') AS week_label.
7. Insight = specific numbers and observation. Never start with "This query" or "This chart".
8. If dates are queried, assume current year is 2026.
9. Never use exact matching with IN or = for campaign_name filters (e.g. IN ('Mahindra XUV700', 'Mahindra Thar')) because campaign names in the database have full descriptive platform/type suffixes (like ' - Google Search Brand'). Always use ILIKE partial matching, e.g. (campaign_name ILIKE '%XUV700%' OR campaign_name ILIKE '%Thar%').
10. SQL Syntax Rule: When using GROUP BY (e.g. GROUP BY campaign_id, campaign_name, platform), any other column in the SELECT clause must be wrapped in an aggregate function (e.g. SUM(spend), SUM(conversions), AVG(roas), AVG(frequency)) to prevent database syntax errors.


When generating the SQL:
1. Always constrain the query by tenant_id, e.g. "tenant_id = 'agency'".
2. Always constrain Meta Ads questions to platform ILIKE 'meta' unless the user explicitly asks for another platform.
3. Note that roas can be null and should be handled with NULLIF.
4. Keep the query precise.

Example — High frequency campaigns query:
SELECT campaign_name, platform, AVG(frequency)::float AS avg_frequency, SUM(spend)::float AS spend
FROM GOLD_CAMPAIGN_DAILY
WHERE tenant_id = 'agency' AND platform ILIKE 'meta' AND date >= DATE '${AI_BRAIN_DATE_WINDOW.from}' AND date <= DATE '${AI_BRAIN_DATE_WINDOW.to}'
GROUP BY campaign_id, campaign_name, platform
HAVING AVG(frequency) > 1
ORDER BY avg_frequency DESC
LIMIT 20

Always return only this JSON:
{
  "chart_type": "bar_chart" | "line_chart" | "table" | "kpi_card" | "pie_chart",
  "title": "A descriptive title for the chart/data",
  "data": [],
  "config": {
    "x_axis": "column name for x axis (e.g. platform, date, campaign_name or null)",
    "y_axis": "column name for y axis (e.g. spend, conversions or null)",
    "sort": "ASC" | "DESC" | null
  },
  "sql": "SELECT ... FROM GOLD_CAMPAIGN_DAILY WHERE tenant_id = ...",
  "insight": "A brief premium MIP AI marketing insight based on what this query answers"
}`;


function extractJson(content: string): WidgetSpec {
  let cleanContent = content.trim();
  if (cleanContent.startsWith('```')) {
    const lines = cleanContent.split('\n');
    if (lines[0].startsWith('```')) {
      lines.shift();
    }
    if (lines[lines.length - 1].startsWith('```')) {
      lines.pop();
    }
    cleanContent = lines.join('\n').trim();
  }



  const parsed = JSON.parse(cleanContent) as WidgetSpec;

  if (!parsed.sql || typeof parsed.sql !== 'string') {
    throw new Error('Groq response did not include SQL.');
  }

  return parsed;
}

export async function queryWithGroq(
  prompt: string,
  tenantId: string,
  history: ChatHistoryMessage[] = [],
  pageContext?: { page: string; data?: any }
): Promise<WidgetSpec> {
  const model = new ChatGroq({
    apiKey: process.env.GROQ_API_KEY,
    model: 'llama-3.3-70b-versatile',
    temperature: 0.1,
    modelKwargs: {
      response_format: { type: 'json_object' },
    },
  } as any);

  let systemPrompt = SYSTEM_PROMPT;
  if (pageContext && pageContext.page) {
    systemPrompt = `User is currently on the ${pageContext.page} page.
Live data they are looking at: ${JSON.stringify(pageContext.data || {})}.
Answer their question in the context of this page and this data.
Reference the actual numbers they can see on screen.

[SYSTEM CRITICAL]: You MUST still generate and return a valid, precise SQL query in the "sql" key of the JSON object matching the user's request. Never return an empty or null "sql" string, as the analytics layer requires it to query GOLD_CAMPAIGN_DAILY.

` + SYSTEM_PROMPT;
  }

  const formattedMessages = [
    new SystemMessage(systemPrompt),
    ...history.map(msg => {
      if (msg.role === 'system') return new SystemMessage(msg.content);
      if (msg.role === 'assistant') return new AIMessage(msg.content);
      return new HumanMessage(msg.content);
    }),
    new HumanMessage(`tenantId: ${tenantId}\nQuestion: ${prompt}`),
  ];

  const response = await model.invoke(formattedMessages);
  const content = String(response.content);

  if (!content) {
    throw new Error('Groq returned an empty response.');
  }

  return extractJson(content);
}

export async function generateInsightFromData(
  prompt: string,
  sql: string,
  data: unknown[],
  tenantId: string,
  pageContext?: { page: string; data?: any }
): Promise<string> {
  const model = new ChatGroq({
    apiKey: process.env.GROQ_API_KEY,
    model: 'llama-3.3-70b-versatile',
    temperature: 0.2,
  });

  let prepend = '';
  if (pageContext && pageContext.page) {
    prepend = `User is currently on the ${pageContext.page} page.
Live data they are looking at on their screen: ${JSON.stringify(pageContext.data || {})}.
You MUST answer their question by analyzing the live screen data they are looking at above. Reference the actual numbers, metrics, and names they see on screen.

`;
  }

  const promptMessage = prepend + `You are the AI analytics layer for the MIP marketing dashboard.
The user asked this marketing question: "${prompt}"
You ran this SQL query: "${sql}" which returned these database rows:
${JSON.stringify(data, null, 2)}

Write a concise, professional, and natural language answer to the user's question.
- CRITICAL: Prioritize the "Live data they are looking at on their screen" (provided above) over the database results. Ensure all key numbers, spend, CPC, and conversions in your response match exactly what is displayed on their screen.
- Use MIP AI tone: calm, premium, concise, action-first, and data-grounded.
- NEVER mention internal technical database terms, metadata, or queries (such as "GOLD_CAMPAIGN_DAILY", "SQL query", "database", "rows", "table", "tenant id", or developer-level details). Speak purely as a premium, business-level marketing strategist describing what is on their screen.
- Use the database rows only to supplement or add specific details that align with the screen context. Never mention numbers that contradict the active screen data.
- Reference specific platform names, campaign names, and metrics from the screen context.
- Format money values (which are in INR) clearly with standard currency notation (e.g. \u20B983,576 or \u20B915.3L).
- Format CPC/CPL clearly (e.g. \u20B94.14 CPC or \u20B9230 Cost Per Lead) and prioritize Cost Per Click (CPC) or CPL over ROAS since this ad account represents lead generation campaigns.
- Keep the response direct and short (2-3 sentences max).
- If both the screen data and database data are empty, mention that no active campaigns or conversions were found.
`;

  const response = await model.invoke([
    new HumanMessage(promptMessage),
  ]);

  return String(response.content) || 'Here is your campaign summary data.';
}

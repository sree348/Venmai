import Groq from 'groq-sdk';

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

const SYSTEM_PROMPT = `You are a marketing analytics SQL expert. Table: GOLD_CAMPAIGN_DAILY.
Columns: tenant_id, date, platform, campaign_id, campaign_name, spend, impressions, clicks, reach, frequency, ctr, cpc, cpm, roas(nullable), conversions, status.

Strict Rules:
1. CPC = SUM(spend)/SUM(clicks) always. Never AVG(cpc). Never select the cpc column directly.
2. Week labels = DATE_TRUNC week, return week_label as "Mar 1–7" format in data array, x_axis: "week_label". In PostgreSQL, format this exactly as: TO_CHAR(DATE_TRUNC('week', date), 'Mon FMDD') || '–' || TO_CHAR(DATE_TRUNC('week', date) + INTERVAL '6 days', 'FMDD') AS week_label.
3. Insight = specific numbers and observation. Never start with "This query" or "This chart".

When generating the SQL:
1. Always constrain the query by tenant_id, e.g. "tenant_id = 'agency'".
2. Note that roas can be null and should be handled.
3. If dates are queried, assume current year is 2026.
4. Keep the query precise.

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
  "insight": "A brief premium marketing insight based on what this query answers"
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
  history: ChatHistoryMessage[] = []
): Promise<WidgetSpec> {
  const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
  });

  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      {
        role: 'user',
        content: `tenantId: ${tenantId}\nQuestion: ${prompt}`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;

  if (!content) {
    throw new Error('Groq returned an empty response.');
  }

  return extractJson(content);
}

export async function generateInsightFromData(
  prompt: string,
  sql: string,
  data: unknown[],
  tenantId: string
): Promise<string> {
  const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
  });

  const promptMessage = `
You are the AI analytics layer for the MIP marketing dashboard.
The user asked this marketing question: "${prompt}"
You generated and ran this SQL query: "${sql}"
The database returned these rows:
${JSON.stringify(data, null, 2)}

Based strictly on the database results above, write a concise, professional, and natural language answer to the user's question.
- Reference specific numbers, metrics, platform names, and campaign names from the data.
- Format money values (which are in INR) clearly with standard currency notation (e.g. ₹83,576 or ₹15.3L).
- Format CPC/CPL clearly (e.g. ₹4.14 CPC or ₹230 Cost Per Lead) and prioritize Cost Per Click (CPC) or CPL over ROAS since this ad account represents lead generation campaigns.
- Keep the response direct and short (2-3 sentences max).
- If the data is empty, mention that no active campaigns or conversions were found matching their criteria.
`;

  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    temperature: 0.2,
    messages: [
      { role: 'user', content: promptMessage },
    ],
  });

  return completion.choices[0]?.message?.content || 'Here is your campaign summary data.';
}

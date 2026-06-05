const { Pool } = require('pg');
const { OpenAI } = require('openai');
const dotenv = require('dotenv');

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres:123@localhost:5432/MIP",
});

const SYSTEM_PROMPT = `You are a marketing analytics SQL expert. Table: GOLD_CAMPAIGN_DAILY (maps to campaign_data).
Columns: tenant_id, date, platform, campaign_id, campaign_name, spend, impressions, clicks, reach, frequency, ctr, cpc, cpm, roas(nullable), conversions, status.

Strict Rules:
1. CPC = SUM(spend)/SUM(clicks) always. Never AVG(cpc). Never select the cpc column directly.
2. CTR = (SUM(clicks)::numeric / NULLIF(SUM(impressions),0)) * 100. Never AVG(ctr). Never select the ctr column directly.
3. FREQUENCY must always use AVG(frequency) when aggregating. For "high frequency" campaigns use:
   GROUP BY campaign_id, campaign_name, platform
   HAVING AVG(frequency) > 3
   Never use WHERE frequency > X on raw rows — frequency is a daily metric.
4. Default date range = last 90 days unless user specifies. Use: date >= NOW() - INTERVAL '90 days'
5. Active campaigns filter: LOWER(status) = 'active'
6. Week labels = DATE_TRUNC week, return week_label as "Mar 1–7" format in data array, x_axis: "week_label". In PostgreSQL, format this exactly as: TO_CHAR(DATE_TRUNC('week', date), 'Mon FMDD') || '–' || TO_CHAR(DATE_TRUNC('week', date) + INTERVAL '6 days', 'FMDD') AS week_label.
7. Insight = specific numbers and observation. Never start with "This query" or "This chart".
8. If dates are queried, assume current year is 2026.
9. Never use exact matching with IN or = for campaign_name filters (e.g. IN ('Mahindra XUV700', 'Mahindra Thar')) because campaign names in the database have full descriptive platform/type suffixes (like ' - Google Search Brand'). Always use ILIKE partial matching, e.g. (campaign_name ILIKE '%XUV700%' OR campaign_name ILIKE '%Thar%').

When generating the SQL:
1. Always constrain the query by tenant_id, e.g. "tenant_id = 'agency'".
2. Note that roas can be null and should be handled with NULLIF.
3. Keep the query precise.

Example — High frequency campaigns query:
SELECT campaign_name, platform, AVG(frequency)::float AS avg_frequency, SUM(spend)::float AS spend
FROM GOLD_CAMPAIGN_DAILY
WHERE tenant_id = 'agency' AND date >= NOW() - INTERVAL '90 days'
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
  "insight": "A brief premium marketing insight based on what this query answers"
}`;

function prepareAiSql(rawSql, scopeId) {
  const mappedSql = rawSql.replace(/\bGOLD_CAMPAIGN_DAILY\b/gi, 'campaign_data');

  // Strip trailing semicolon
  let trimmed = mappedSql.trim().replace(/;\s*$/, '').trim();

  // Remove existing scope predicates
  let unscopedSql = trimmed
    .replace(/\s+and\s+tenant_id\s*=\s*('[^']*'|"[^"]*"|[a-zA-Z0-9_-]+)/gi, '')
    .replace(/\s+where\s+tenant_id\s*=\s*('[^']*'|"[^"]*"|[a-zA-Z0-9_-]+)\s+and\s+/gi, ' WHERE ')
    .replace(/\s+where\s+tenant_id\s*=\s*('[^']*'|"[^"]*"|[a-zA-Z0-9_-]+)/gi, '')
    .replace(/\s+and\s+client_id\s*=\s*('[^']*'|"[^"]*"|[a-zA-Z0-9_-]+)/gi, '')
    .replace(/\s+where\s+client_id\s*=\s*('[^']*'|"[^"]*"|[a-zA-Z0-9_-]+)\s+and\s+/gi, ' WHERE ')
    .replace(/\s+where\s+client_id\s*=\s*('[^']*'|"[^"]*"|[a-zA-Z0-9_-]+)/gi, '');

  const predicate = !scopeId || scopeId === 'agency'
    ? "tenant_id = 'agency'"
    : `tenant_id = 'agency' AND client_id = '${scopeId}'`;

  // Add scope predicate
  const clauseMatch = unscopedSql.match(/\s+(group\s+by|having|order\s+by|limit|offset)\b/i);
  const predicateTarget = clauseMatch ? unscopedSql.slice(0, clauseMatch.index).trim() : unscopedSql;
  const suffix = clauseMatch ? unscopedSql.slice(clauseMatch.index) : '';
  const hasWhere = /\bwhere\b/i.test(predicateTarget);

  let scopedSql = `${predicateTarget}${hasWhere ? ' AND' : ' WHERE'} ${predicate}${suffix}`;

  // Add LIMIT 500
  if (!/\s+limit\s+\d+\s*$/i.test(scopedSql)) {
    scopedSql = `${scopedSql} LIMIT 500`;
  }

  return scopedSql;
}

async function test() {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = "Compare the performance of Mahindra XUV700 versus Mahindra Thar campaigns.";

  console.log("Asking OpenAI...");
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `tenantId: cai_mahindra\nQuestion: ${prompt}` }
    ]
  });

  const content = completion.choices[0]?.message?.content;
  console.log("OpenAI raw response:", content);

  const spec = JSON.parse(content);
  console.log("Generated SQL:", spec.sql);

  const sqlToRun = prepareAiSql(spec.sql, 'cai_mahindra');
  console.log("Prepared SQL to run:", sqlToRun);

  const dbRes = await pool.query(sqlToRun);
  console.log(`Database returned ${dbRes.rows.length} rows:`);
  console.log(dbRes.rows);

  const promptMessage = `
You are the AI analytics layer for the MIP marketing dashboard.
The user asked this marketing question: "${prompt}"
You generated and ran this SQL query: "${spec.sql}"
The database returned these rows:
${JSON.stringify(dbRes.rows, null, 2)}

Based strictly on the database results above, write a concise, professional, and natural language answer to the user's question.
- Reference specific numbers, metrics, platform names, and campaign names from the data.
- Format money values (which are in INR) clearly with standard currency notation (e.g. ₹83,576 or ₹15.3L).
- Format CPC/CPL clearly (e.g. ₹4.14 CPC or ₹230 Cost Per Lead) and prioritize Cost Per Click (CPC) or CPL over ROAS since this ad account represents lead generation campaigns.
- Keep the response direct and short (2-3 sentences max).
- If the data is empty, mention that no active campaigns or conversions were found matching their criteria.
`;

  console.log("\nGenerating live answer...");
  const completion2 = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.2,
    messages: [
      { role: 'user', content: promptMessage }
    ]
  });

  console.log("\nAI Live Answer:\n", completion2.choices[0]?.message?.content);
}

test()
  .catch(console.error)
  .finally(() => pool.end());

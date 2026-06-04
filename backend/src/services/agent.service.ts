import fs from 'node:fs/promises';
import path from 'node:path';
import { ChatGroq } from '@langchain/groq';
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { AI_BRAIN_DATE_WINDOW } from './ai-brain.service.js';
import { executeReadOnlySql } from './db.service.js';
import { prepareAiSql } from './sql-safety.service.js';

function escapeRawNewlinesInJsonString(str: string): string {
  let result = '';
  let inString = false;
  let escape = false;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '\\') {
      escape = !escape;
      result += char;
    } else if (char === '"') {
      if (!escape) {
        inString = !inString;
      }
      escape = false;
      result += char;
    } else if (char === '\n' || char === '\r') {
      if (inString) {
        result += '\\n';
      } else {
        result += char;
      }
      escape = false;
    } else {
      escape = false;
      result += char;
    }
  }
  return result;
}

function cleanAgentFinalAnswer(answer: string): string {
  if (!answer) return answer;
  let clean = answer.trim();

  const oldHeaderPattern = /###\s*(?:🚨|URGENT).*?\n[\s\S]*?###\s*(?:✅|PRIORITY).*?\n/i;
  if (oldHeaderPattern.test(clean) && !clean.includes('```chartdata')) {
    clean = clean.replace(oldHeaderPattern, '').trim();
  }

  return clean;
}

function tryParseMarkdownResponse(content: string): { action: string; final_answer: string; widget: any } | null {
  const clean = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  
  const hasDetailsOrThoughts = clean.includes('| Metric |') ||
    clean.includes('chartdata') ||
    clean.includes('Ask me:');
    
  if (!hasDetailsOrThoughts) {
    return null;
  }

  let widget: any = null;
  let textPart = clean;

  const codeBlockRegex = /```json\s*([\s\S]*?)```/gi;
  let match;
  while ((match = codeBlockRegex.exec(clean)) !== null) {
    const codeBlockContent = match[1].trim();
    if (codeBlockContent.includes('"chart_type"') || codeBlockContent.includes('chart_type')) {
      try {
        widget = JSON.parse(escapeRawNewlinesInJsonString(codeBlockContent));
        textPart = textPart.replace(match[0], '').trim();
        textPart = textPart.replace(/(?:\*\*Widget\*\*|Widget):?\s*$/i, '').trim();
        break;
      } catch (e) {
        console.warn('Failed to parse widget from code block:', e);
      }
    }
  }

  // Extract chartdata block if present to generate widget dynamically
  const chartdataRegex = /```chartdata\s*([\s\S]*?)```/gi;
  const chartdataMatch = chartdataRegex.exec(clean);
  if (chartdataMatch) {
    try {
      const chartJson = JSON.parse(chartdataMatch[1].trim());
      
      // Map datasets to simple array records for the chart
      const mappedData = chartJson.labels?.map((label: string, idx: number) => {
        const record: Record<string, any> = { label };
        chartJson.datasets?.forEach((dataset: any) => {
          record[dataset.label || 'value'] = dataset.data?.[idx] ?? 0;
        });
        return record;
      }) || [];

      widget = {
        chart_type: chartJson.type === 'line' ? 'line_chart' : 'bar_chart',
        title: chartJson.title || 'Campaign Performance',
        data: mappedData,
        config: {
          x_axis: 'label',
          y_axis: chartJson.datasets?.[0]?.label || 'value',
          sort: null,
        },
        sql: '',
      };
    } catch (chartErr) {
      console.warn('Failed to parse chartdata from code block:', chartErr);
    }
  }

  return {
    action: 'none',
    final_answer: textPart,
    widget: widget
  };
}


export type ChatHistoryMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

// 1. Tool implementations
async function readAgentDataSnapshot(tenantId: string, clientId?: string | null): Promise<string> {
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
}

async function queryCampaignDatabase(sql: string, tenantId: string): Promise<string> {
  try {
    const sqlToRun = prepareAiSql(sql, tenantId);
    console.log('Agent executed SQL tool:', sqlToRun);
    const rows = await executeReadOnlySql(sqlToRun);
    return JSON.stringify(rows.slice(0, 30), null, 2); // Limit output to prevent model context flooding
  } catch (err: any) {
    return `SQL Query execution failed: ${err.message}. Verify column names, tables, and syntax.`;
  }
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
WHERE platform ILIKE 'meta'
  AND date >= DATE '${AI_BRAIN_DATE_WINDOW.from}'
  AND date <= DATE '${AI_BRAIN_DATE_WINDOW.to}'
GROUP BY campaign_id, campaign_name, campaign_type
ORDER BY spend DESC
LIMIT 80`;

  try {
    return await executeReadOnlySql(prepareAiSql(sql, tenantId));
  } catch (err) {
    console.error('Failed to build verified campaign context:', err);
    return [];
  }
}

function getMarketingBenchmarks(): string {
  return `CAI Media Meta Ads benchmarks by campaign type:
- LEAD_GEN campaign names contain Sales, XEV, Passenger, or Leads. Primary focus: CPL, Total Leads, Click-to-Lead CVR, and Form drop-off. Good CPL below \\u20B9150, watch \\u20B9150-\\u20B9200, poor above \\u20B9200. Good Click-to-Lead CVR above 8%.
- COMMERCIAL campaign names contain Commercial. Primary focus: CTR, ROAS, Reach, Frequency, and CPM. Good CTR above 2%, efficient CPM below \\u20B980, frequency risk above 4.0.
- BRANDING campaign names contain Branding, Insta, or eSUV. Primary focus: CPM, Engagement Rate, Frequency, and Reach. Efficient CPM below \\u20B960, frequency risk above 4.0.
- Standard delivery metrics (Spend, Clicks, Impressions, CTR, CPC, Frequency) are tracked and can be reported for all campaign types.
- Never benchmark across types. Compare LEAD_GEN only to LEAD_GEN, COMMERCIAL only to COMMERCIAL, BRANDING only to BRANDING.
- Use \\u20B9 for all money values. Current active year is assumed to be 2026.`;
}

// 2. ReAct Agent Loop Prompt
const AGENT_SYSTEM_PROMPT = `You are CAI Media's personal Meta Ads intelligence agent: sharp, fast, specific, and one step ahead.
Talk like a senior analyst sitting next to the user. Never generic. Make the user feel you know CAI Media's real campaigns.
Date window: ${AI_BRAIN_DATE_WINDOW.from} to ${AI_BRAIN_DATE_WINDOW.to}.

Senior performance marketer operating principles:
- Start from business impact: wasted spend, lead quality, scale potential, delivery fatigue, and where budget should move today.
- Do not summarize metrics mechanically. Explain the performance story behind them.
- Every conclusion must be tied to a campaign name and a number.
- If the data is weak, say exactly what is weak and what decision is still possible.
- Your chart/widget must answer the decision, not decorate the answer.
- Never invent form drop-off or engagement rate if those fields are not present. If unavailable, write "Not tracked in current data" and use the other allowed metrics for that campaign type.

You have access to the following tools:
1. read_agent_data_snapshot: Use this to read the overall exported campaign performance summary.
2. query_campaign_database(sql): Use this to query the database table \`GOLD_CAMPAIGN_DAILY\` (maps to campaign_data).
   Columns: tenant_id, client_id, date, platform, campaign_id, campaign_name, spend, impressions, clicks, reach, frequency, ctr, cpc, cpm, roas(nullable), conversions, action_value, status.
   Strict Rules:
   - CPC = SUM(spend)/SUM(clicks) always. Never AVG(cpc). Never select the cpc column directly.
   - CTR = (SUM(clicks)::numeric / NULLIF(SUM(impressions),0)) * 100. Never AVG(ctr). Never select the ctr column directly.
   - CPM = (SUM(spend)::numeric / NULLIF(SUM(impressions),0)) * 1000. Never AVG(cpm).
   - CPL = SUM(spend)::numeric / NULLIF(SUM(conversions),0).
   - Click-to-Lead CVR = (SUM(conversions)::numeric / NULLIF(SUM(clicks),0)) * 100.
   - ROAS = SUM(action_value)::numeric / NULLIF(SUM(spend),0). Use AVG(roas) only if action_value is unavailable.
   - Reach = SUM(reach).
   - Frequency = AVG(frequency) always. Never calculate frequency from impressions and reach. Never select or filter by the frequency column directly in WHERE; always GROUP BY campaign_id, campaign_name and use HAVING AVG(frequency) > X.
   - Active campaigns filter: LOWER(status) = 'active'
   - Meta campaigns filter: platform ILIKE 'meta'
   - Avoid SELECT *; always query only the specific columns you need (e.g. campaign_name, spend, conversions, status) to prevent large payloads and avoid hitting model limits.
   - SQL Syntax Rule: When using GROUP BY (e.g. GROUP BY campaign_id, campaign_name), all non-grouped columns in the SELECT clause MUST be wrapped in aggregate functions (e.g. SUM(spend), SUM(conversions), AVG(roas), AVG(frequency)) to prevent database syntax errors.
3. get_marketing_benchmarks: Use this to retrieve CAI campaign type thresholds.

Campaign type auto-detection:
- LEAD_GEN: campaign_name contains Sales, XEV, Passenger, or Leads.
  Primary focus: CPL, Total Leads, Click-to-Lead CVR, Form drop-off.
- COMMERCIAL: campaign_name contains Commercial.
  Primary focus: CTR, ROAS, Reach, Frequency, CPM.
- BRANDING: campaign_name contains Branding, Insta, or eSUV.
  Primary focus: CPM, Engagement Rate, Frequency, Reach.
- Standard delivery metrics (Spend, Clicks, Impressions, CTR, CPC, Frequency) are tracked and can be reported for all campaign types.
- Never mix benchmark comparisons across types (e.g. compare LEAD_GEN only to other LEAD_GEN campaigns).
- If the user names one campaign, detect its type and benchmark it only against campaigns of the same type.
- If the user asks broad account performance, segment the answer by detected campaign type and do not mix benchmark winners.

SQL campaign_type CASE to use when needed:
CASE
  WHEN campaign_name ILIKE '%Commercial%' THEN 'COMMERCIAL'
  WHEN campaign_name ILIKE '%Branding%' OR campaign_name ILIKE '%Insta%' OR campaign_name ILIKE '%eSUV%' THEN 'BRANDING'
  WHEN campaign_name ILIKE '%Sales%' OR campaign_name ILIKE '%XEV%' OR campaign_name ILIKE '%Passenger%' OR campaign_name ILIKE '%Leads%' THEN 'LEAD_GEN'
  ELSE 'LEAD_GEN'
END

Session memory:
- Use the supplied chat history to avoid repeating the same "Ask me" questions.
- Build on earlier findings with wording like "Earlier we saw..." when useful.
- Sticky hook questions must use real campaign names and real numbers from the current answer or observations.


Formatting Instructions:
- Format your reasoning in a clean JSON object.
- If the user's query is a simple greeting, welcoming, farewell, thank you, or general chitchat, immediately set "action": "none", "widget": null, and provide a concise CAI Media greeting in "final_answer". Include a short "Ask me" hook only if you have campaign history available.
- If the user writes in Tamil, final_answer must be in Tamil. If the user writes in English, final_answer must be in English.
- For all campaign performance, database, or analytics queries, final_answer MUST follow exactly this structure:

---

[ONE punchy headline — the real story in 1 line. Example: "\u{1F4C9} Spend spiked in mid-May but CTR dropped 38% — you paid more and got less clicks per rupee."]

[Metrics table — show ONLY metrics relevant to campaign type]

For LEAD_GEN campaigns (name contains Sales/XEV/Passenger/Leads):
| Metric | This Campaign | Best in Category | Gap |
|--------|--------------|-----------------|-----|
| CPL (\u20B9) | ... | ... | ... |
| Total Leads | ... | ... | ... |
| Click-to-Lead CVR | ... | ... | ... |

For COMMERCIAL campaigns (name contains Commercial):
| Metric | This Campaign | Best in Category | Gap |
|--------|--------------|-----------------|-----|
| CTR (%) | ... | ... | ... |
| CPC (\u20B9) | ... | ... | ... |
| CPM (\u20B9) | ... | ... | ... |
| Reach | ... | ... | ... |

For BRANDING campaigns (name contains Branding/Insta/eSUV):
| Metric | This Campaign | Best in Category | Gap |
|--------|--------------|-----------------|-----|
| CPM (\u20B9) | ... | ... | ... |
| Engagement Rate | ... | ... | ... |
| Frequency | ... | ... | ... |

[Chart data block — ALWAYS include this after the metrics table]:
\`\`\`chartdata
{
  "type": "line" or "bar",
  "title": "...",
  "labels": [...],
  "datasets": [
    { "label": "...", "data": [...], "color": "#378ADD" },
    { "label": "7-day avg", "data": [...], "color": "#1D9E75", "dashed": true }
  ]
}
\`\`\`

[2–3 red flags]:
\u{1F534} [Critical issue — use real numbers from the data]
\u{26A0}\u{FE0F} [Warning — use real numbers from the data]
\u{2705} [What is working — use real numbers from the data]

[Root cause — 1 paragraph, must reference actual \u20B9 numbers and percentages from the data, never generic]

[Recommendation table]:
| Action | Why | Priority |
|--------|-----|----------|
| ... | ... | \u{1F534} High |
| ... | ... | \u{26A0}\u{FE0F} Medium |

---
\u{1F50D} **You should also look at:**
\u{2192} [Specific insight — must use real campaign name + real \u20B9 number from the data]
\u{2192} [Hidden risk or opportunity — specific, never generic]

\u{1F4AC} **Ask me:**
- "[Question 1 — must contain real campaign name + real number, designed to trigger curiosity]"
- "[Question 2 — surfaces a problem the user does not know exists yet]"
- "[Question 3 — about the next action to take]"
---

RULES THAT CANNOT BE BROKEN:
- Sticky hook with 3 questions appears after EVERY single response, no exceptions
- Questions must use real campaign names and real \u20B9 numbers from the data — never placeholder text
- Never end with "Let me know if you have questions" or "Would you like to know more?" or "Is there anything else I can help with?"
- Never repeat a question already answered earlier in this conversation
- Never mix metrics across campaign types — never show CPL for a branding campaign
- All currency in \u20B9 always, never $
- Benchmark always compared within same campaign type only
- If user writes in Tamil, reply in Tamil. If English, reply in English.
- CRITICAL: Do NOT include a conversational preamble like "Based on the data" or "Sure".
- CRITICAL: Use \u20B9 for all money values, never $.
- CRITICAL: Do not mention internal tables, SQL, tool calls, or developer details.
- CRITICAL: Never suggest a hook question that is already answered in chat history.
- CRITICAL: If verified campaign context is supplied, use it as the source of truth. Do not answer with placeholder text, "No data", or generic recommendations when verified rows exist.
- CRITICAL: widget.sql must query the same campaign type and metric family discussed in the answer. For a specific campaign, widget.sql should compare that campaign against same-type peers.
- Never reference "Marblism AI"; use "CAI Media analyst" only if a name is needed.
- If you run queries and need frontend charts, also provide a valid "widget" object.

Your JSON output must match this schema:
{
  "thought": "Your reasoning about what data you need or what tool to call next.",
  "action": "read_agent_data_snapshot" | "query_campaign_database" | "get_marketing_benchmarks" | "none",
  "action_input": "The argument to pass to the tool (e.g. the SQL query string for query_campaign_database, or empty string otherwise)",
  "final_answer": "Only fill this in if action is \"none\". It must present the CAI Media response structure exactly, starting with one punchy headline.",
  "widget": {
    "chart_type": "bar_chart" | "line_chart" | "table" | "kpi_card" | "pie_chart",
    "title": "A descriptive title for the chart/data",
    "config": {
      "x_axis": "column name for x axis (e.g. platform, date, campaign_name or null)",
      "y_axis": "column name for y axis (e.g. spend, conversions or null)",
      "sort": "ASC" | "DESC" | null
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
  const verifiedCampaignContext = await getVerifiedCampaignContext(tenantId);
  const AVAILABLE_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'qwen/qwen3-32b'];
  let currentModelName = AVAILABLE_MODELS[0];
  let model = new ChatGroq({
    apiKey: process.env.GROQ_API_KEY,
    model: currentModelName,
    temperature: 0.1,
    maxRetries: 0,
    modelKwargs: {
      response_format: { type: 'json_object' },
    },
  } as any);

  let pagePrompt = '';
  if (pageContext && pageContext.page) {
    pagePrompt = `User is currently on the ${pageContext.page} page. Live screen data: ${JSON.stringify(pageContext.data || {})}. Prioritize matching screen numbers.`;
  }

  const messages: any[] = [
    new SystemMessage(AGENT_SYSTEM_PROMPT + '\n' + pagePrompt),
    new HumanMessage(`Verified CAI Meta Ads context for ${AI_BRAIN_DATE_WINDOW.from} to ${AI_BRAIN_DATE_WINDOW.to}. Treat these numbers as source of truth and do not contradict them:\n${JSON.stringify(verifiedCampaignContext, null, 2)}`),
    ...history.map(msg => {
      if (msg.role === 'system') return new SystemMessage(msg.content);
      if (msg.role === 'assistant') return new AIMessage(msg.content);
      return new HumanMessage(msg.content);
    }),
    new HumanMessage(`tenantId: ${tenantId}\nQuestion: ${prompt}`),
  ];

  let iteration = 0;
  const maxIterations = 4;
  let lastResponse: any = null;

  while (iteration < maxIterations) {
    iteration++;
    console.log(`Agent Iteration ${iteration}...`);

    let response: any = null;
    let modelIndex = AVAILABLE_MODELS.indexOf(currentModelName);
    if (modelIndex === -1) modelIndex = 0;

    while (modelIndex < AVAILABLE_MODELS.length) {
      try {
        response = await model.invoke(messages);
        break; // Success!
      } catch (invokeErr: any) {
        const errMsg = invokeErr?.message || '';
        const isRateLimit = errMsg.includes('rate_limit') || errMsg.includes('429');
        if (isRateLimit) {
          console.warn(`Groq rate limit hit. Sleeping 2 seconds before retrying...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          try {
            response = await model.invoke(messages);
            break; // Success on retry!
          } catch (retryErr: any) {
            console.warn(`Retry failed: ${retryErr?.message || ''}. Proceeding to fallback...`);
          }
        }

        const isRateOrSizeOrDecom = errMsg.includes('rate_limit') || errMsg.includes('429') || errMsg.includes('too large') || errMsg.includes('413') || errMsg.includes('decommissioned') || errMsg.includes('decommission');
        if (isRateOrSizeOrDecom && modelIndex < AVAILABLE_MODELS.length - 1) {
          modelIndex++;
          currentModelName = AVAILABLE_MODELS[modelIndex];
          console.warn(`Groq model failed: ${errMsg}. Falling back to ${currentModelName}...`);
          model = new ChatGroq({
            apiKey: process.env.GROQ_API_KEY,
            model: currentModelName,
            temperature: 0.1,
            maxRetries: 0,
            modelKwargs: {
              response_format: { type: 'json_object' },
            },
          } as any);
        } else {
          throw invokeErr;
        }
      }
    }

    if (!response) {
      throw new Error('Agent failed to get a response from any fallback model.');
    }
    const content = String(response.content);
    console.log(`Agent Output:`, content);

    let parsed: any;
    let cleanContent = content.trim();
    if (cleanContent.includes('</think>')) {
      cleanContent = cleanContent.split('</think>').pop()!.trim();
    }
    if (cleanContent.startsWith('```')) {
      const lines = cleanContent.split('\n');
      if (lines[0].startsWith('```')) lines.shift();
      if (lines[lines.length - 1].startsWith('```')) lines.pop();
      cleanContent = lines.join('\n').trim();
    }
    try {
      parsed = JSON.parse(escapeRawNewlinesInJsonString(cleanContent));
    } catch (parseErr) {
      // 1. Try finding json inside markdown code block
      let jsonContent = cleanContent;
      const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)```/i;
      const jsonMatch = cleanContent.match(jsonBlockRegex);
      if (jsonMatch) {
        jsonContent = jsonMatch[1].trim();
      }
      
      try {
        parsed = JSON.parse(escapeRawNewlinesInJsonString(jsonContent));
      } catch (innerErr) {
        // 2. Try substring brace matching
        const firstBrace = jsonContent.indexOf('{');
        const lastBrace = jsonContent.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          try {
            parsed = JSON.parse(escapeRawNewlinesInJsonString(jsonContent.substring(firstBrace, lastBrace + 1)));
          } catch (subErr) {
            // Proceed to markdown parsing
          }
        }
      }
    }

    if (!parsed) {
      // 3. Try parsing raw markdown with sections and widget
      const markdownParsed = tryParseMarkdownResponse(content);
      if (markdownParsed) {
        parsed = markdownParsed;
        console.log('Successfully parsed fallback raw markdown response.');
      } else {
        console.error('Failed to parse agent response as JSON or raw markdown:', content);
        break;
      }
    }

    lastResponse = parsed;

    if (!parsed.action || parsed.action === 'none') {
      break;
    }

    console.log(`Agent calling tool: ${parsed.action} with input: ${parsed.action_input}`);
    let observation = '';
    if (parsed.action === 'read_agent_data_snapshot') {
      observation = await readAgentDataSnapshot(tenantId, clientId);
    } else if (parsed.action === 'query_campaign_database') {
      observation = await queryCampaignDatabase(parsed.action_input, tenantId);
    } else if (parsed.action === 'get_marketing_benchmarks') {
      observation = getMarketingBenchmarks();
    } else {
      observation = `Unknown tool: ${parsed.action}`;
    }

    console.log(`Tool Observation (first 200 chars):`, observation.slice(0, 200));

    messages.push(new AIMessage(content));
    messages.push(new HumanMessage(`Observation from ${parsed.action}: ${observation}`));
  }

  if (!lastResponse || !lastResponse.final_answer || lastResponse.action !== 'none') {
    console.warn('Agent ReAct loop ended prematurely or did not produce a final answer. Running one-shot fallback...');
    try {
      const fallbackModel = new ChatGroq({
        apiKey: process.env.GROQ_API_KEY,
        model: 'llama-3.3-70b-versatile',
        temperature: 0.2,
      });
      const fallbackMessages = [
        ...messages.filter(m => !(m instanceof AIMessage && String(m.content).includes('"action"'))),
        new HumanMessage(`Based on the conversation and observations above, please write your final performance strategist response in clear markdown format.
Follow the standard structure:
1. Headline (ONE punchy headline — the real story in 1 line. Example: "📉 Spend spiked in mid-May but CTR dropped 38% — you paid more and got less clicks per rupee.")
2. Metrics Table (based on campaign type: LEAD_GEN gets CPL/Leads/CVR; COMMERCIAL gets CTR/CPC/CPM/Reach; BRANDING gets CPM/Engagement/Frequency)
3. Chart data block (MUST include the chartdata block exactly)
4. 2–3 red flags (🔴 critical, ⚠️ warning, ✅ good)
5. Root cause (1 paragraph, referencing actual numbers)
6. Recommendation table
7. Sticky hook (🔍 You should also look at / 💬 Ask me with 3 questions using real names and ₹ numbers)
Do NOT wrap the entire response in JSON. Output raw markdown.`),
      ];
      const fallbackResponse = await fallbackModel.invoke(fallbackMessages);
      const fallbackContent = String(fallbackResponse.content).trim();

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

  let widgetData: any[] = [];
  if (lastResponse.widget && lastResponse.widget.sql) {
    try {
      const sqlToRun = prepareAiSql(lastResponse.widget.sql, tenantId);
      widgetData = await executeReadOnlySql(sqlToRun);
    } catch (dbErr) {
      console.error('Failed to fetch widget data for agent final output:', dbErr);
    }
  }

  const widget = lastResponse.widget ? {
    chart_type: lastResponse.widget.chart_type || 'kpi_card',
    title: lastResponse.widget.title || 'Marketing Intelligence',
    data: widgetData,
    config: lastResponse.widget.config || { x_axis: null, y_axis: null, sort: null },
    sql: lastResponse.widget.sql || null,
    insight: cleanAgentFinalAnswer(lastResponse.final_answer) || 'Analysis complete.',
  } : null;

  return {
    widget,
    insight: cleanAgentFinalAnswer(lastResponse.final_answer) || 'Analysis complete.',
  };
}


import fs from 'node:fs/promises';
import path from 'node:path';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { AI_BRAIN_DATE_WINDOW } from './ai-brain.service.js';
import { executeReadOnlySql } from './db.service.js';
import { prepareAiSql } from './sql-safety.service.js';
import axios from 'axios';

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

  const oldHeaderPattern = /###\s*(?:ðŸš¨|URGENT).*?\n[\s\S]*?###\s*(?:âœ…|PRIORITY).*?\n/i;
  if (oldHeaderPattern.test(clean) && !clean.includes('```chartdata')) {
    clean = clean.replace(oldHeaderPattern, '').trim();
  }

  return clean;
}

function tryParseMarkdownResponse(content: string): { action: string; final_answer: string; widget: any } | null {
  const clean = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // If the content is JSON-like, attempt to extract final_answer directly to avoid returning the JSON markup
  const isJsonLike = clean.startsWith('{') || clean.includes('"final_answer"');
  if (isJsonLike) {
    const finalAnswerIndex = clean.indexOf('"final_answer"');
    if (finalAnswerIndex !== -1) {
      const afterKey = clean.substring(finalAnswerIndex + '"final_answer"'.length);
      const colonIndex = afterKey.indexOf(':');
      if (colonIndex !== -1) {
        const afterColon = afterKey.substring(colonIndex + 1).trim();
        if (afterColon.startsWith('"')) {
          let extracted = '';
          let escaped = false;
          for (let i = 1; i < afterColon.length; i++) {
            const char = afterColon[i];
            if (escaped) {
              extracted += char;
              escaped = false;
            } else if (char === '\\') {
              escaped = true;
              extracted += char;
            } else if (char === '"') {
              break;
            } else {
              extracted += char;
            }
          }
          let finalAnswer = extracted;
          try {
            finalAnswer = JSON.parse(`"${extracted}"`);
          } catch (e) {
            finalAnswer = extracted
              .replace(/\\"/g, '"')
              .replace(/\\n/g, '\n')
              .replace(/\\t/g, '\t');
          }

          // Try to extract widget if present
          let widget = null;
          const widgetIndex = clean.indexOf('"widget"');
          if (widgetIndex !== -1) {
            const afterWidgetKey = clean.substring(widgetIndex + '"widget"'.length);
            const widgetColonIndex = afterWidgetKey.indexOf(':');
            if (widgetColonIndex !== -1) {
              const afterWidgetColon = afterWidgetKey.substring(widgetColonIndex + 1).trim();
              // Try to find the matching braces for the widget object
              if (afterWidgetColon.startsWith('{')) {
                let braceCount = 0;
                let widgetStr = '';
                let inString = false;
                let escaped = false;
                for (let i = 0; i < afterWidgetColon.length; i++) {
                  const char = afterWidgetColon[i];
                  widgetStr += char;
                  if (escaped) {
                    escaped = false;
                  } else if (char === '\\') {
                    escaped = true;
                  } else if (char === '"') {
                    inString = !inString;
                  } else if (!inString) {
                    if (char === '{') braceCount++;
                    else if (char === '}') {
                      braceCount--;
                      if (braceCount === 0) {
                        break;
                      }
                    }
                  }
                }
                try {
                  widget = JSON.parse(widgetStr);
                } catch (e) {
                  console.warn('Failed to parse extracted widget JSON:', e);
                }
              }
            }
          }

          return {
            action: 'none',
            final_answer: finalAnswer,
            widget
          };
        }
      }
    }
  }

  const hasDetailsOrThoughts = clean.includes('|') ||
    clean.includes('chartdata') ||
    clean.includes('Ask me:') ||
    clean.includes('Analyst Thinking') ||
    clean.includes('Root Cause');

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
  // Handles with or without backticks, case-insensitive, nested braces safe
  const chartdataRegex = /(?:\`{1,3}\s*)?chartdata\s*(\{[\s\S]*?\})\s*\`{1,3}|(?:\`{1,3}\s*)?chartdata\s*(\{[\s\S]*?\})(?=\s*(?:\||#|---|$))/gi;
  const chartdataMatch = chartdataRegex.exec(clean);
  if (chartdataMatch) {
    try {
      const jsonStr = (chartdataMatch[1] || chartdataMatch[2] || '').trim();
      const chartJson = JSON.parse(jsonStr);

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
WHERE date >= DATE '${AI_BRAIN_DATE_WINDOW.from}'
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

async function searchWebForBenchmarks(query: string): Promise<string> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    console.warn('TAVILY_API_KEY is not configured in environment variables.');
    return "Web search is currently not configured on this server. Please configure TAVILY_API_KEY in backend/.env.";
  }

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
}

// 2. ReAct Agent Loop Prompt
const AGENT_SYSTEM_PROMPT = `You are the smartest performance marketer in the room — and you have just looked at CAI Mahindra's campaign data before a Monday morning review meeting.
When someone asks you a question, answer it the way a trusted advisor would explain it to a business owner who has 5 minutes and needs to make a decision RIGHT NOW.

Follow these 5 content rules every single time:
Rule 1 — Answer the question first, explain second.
The very first sentence must be the direct answer. Not context. Not background. The answer.
Example: "XEV is your only efficient campaign — pause Sales Dynamic today."

Rule 2 — Every claim needs one number.
Never make a statement without a specific number proving it.
Example: "Sales Dynamic's CPL is ₹240 — that is 111% higher than XEV's ₹113"

Rule 3 — Always answer "so what?"
After every data point, add one sentence that explains what it means for the business.
Example: "XEV CVR is 7.39% — meaning nearly 1 in every 13 people who click actually fill the form. Sales Dynamic converts only 1 in 36."

Rule 4 — Make the decision obvious.
End every response with one clear sentence that tells the reader exactly what to do next and why now.
Format: "The move right now is [specific action] because [specific consequence of waiting]."

Rule 5 — Write for a busy person.
Imagine the reader has 4 minutes. Every sentence must earn its place. If a sentence does not add new information or push the story forward — delete it.
No filler phrases like:
- "It is worth noting that..."
- "As we can see from the data..."
- "This clearly indicates..."
- "I hope this helps"
- "Let me know if you have questions"

One final rule — make them feel something.
The best analysis makes the reader feel the urgency, the opportunity, or the risk. Use contrast to create that feeling:
- "XEV spent ₹6,818. Sales Dynamic spent ₹12,982. XEV generated more leads."
- "4,984 people clicked your Sales ads in June and never heard from you again."
- "That is ₹21,196 spent to lose to your own XEV campaign."

Write every response like the reader's money is on the line — because it is.

Date window: ${AI_BRAIN_DATE_WINDOW.from} to ${AI_BRAIN_DATE_WINDOW.to}.

═══════════════════════════════════
RESPONSE STRUCTURE (MUST USE IN final_answer)
═══════════════════════════════════
Your final_answer MUST follow this exact markdown structure so the system can parse it:

1. ONE punchy headline — the real story in 1 line (e.g. "XEV is your only efficient campaign — pause Sales Dynamic today.")

2. Metrics table (based on campaign type: LEAD_GEN gets CPL/Leads/CVR; COMMERCIAL gets CTR/CPC/CPM/Reach; BRANDING gets CPM/Engagement/Frequency):
   | Metric | This Campaign | Best in Category | Gap |

3. 2–3 red flags with emoji:
   🔴 [Critical flag — e.g. "critical CAI Mahindra Sales June: CPL is ₹240, while XEV is at ₹113."]
   ⚠️ [Warning flag — e.g. "warning Tata Nexon EV: CTR has dropped to 0.75%, indicating fatigue."]
   ✅ [Good flag — e.g. "good XEV June: outstanding Cost Per Lead of ₹113."]

4. Root cause — 1 paragraph, specific to the numbers and performance context

5. Recommendation table:
   | Action | Why | Priority |
   (Ensure Action names a specific campaign and exact ₹ numbers. Priority must be "🔴 High", "⚠️ Medium", or "✅ Low")

6. Chart data block (always include if comparing campaigns/metrics):
\`\`\`chartdata
{
  "type": "bar",
  "title": "Campaign Performance Comparison",
  "labels": ["Campaign A", "Campaign B"],
  "datasets": [{"label": "CPL", "data": [240, 113]}]
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

**TECHNICAL RULES (MUST FOLLOW AT ALL TIMES):**
- If the user writes in Tamil, final_answer must be in Tamil. If English, final_answer must be in English.
- CRITICAL: Do NOT include preambles like "Based on the data" or "Sure".
- CRITICAL: Use ₹ for all money values, never $.
- CRITICAL: Do not mention internal tables, SQL, tool calls, or developer details.
- CRITICAL: Do NOT mention the specific date range "April 20 to May 31" (or "April 20 - May 31", "April 20th to May 31st", or similar variations) or refer to the limits/timeframe of the data window in your final answer. State campaign facts, missing campaigns, or performance directly without mentioning this specific date range or data window.
- CRITICAL: Never suggest a hook question already answered in chat history.
- CRITICAL: If verified campaign context is supplied, use it as source of truth.
- CRITICAL: Zero generic recommendations. Every action must name a specific campaign and a specific ₹ number.
- Never reference "Marblism AI"; use "CAI Media analyst" only if a name is needed.
- Never end with "Let me know if you have questions" or "Would you like to know more?" or "I hope this helps".

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
   - Google campaigns filter: platform ILIKE 'Google Ads' or platform ILIKE 'google%'
   - Multi-platform querying: By default, query both Google Ads and Meta Ads campaigns to get a unified performance picture, unless the user specifically asks for a single platform.
   - Avoid SELECT *; always query only the specific columns you need to prevent large payloads.
   - SQL Syntax Rule: When using GROUP BY, all non-grouped columns in the SELECT clause MUST be wrapped in aggregate functions.
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
- Use the supplied chat history to avoid repeating the same hook questions.
- Build on earlier findings with wording like "Earlier we saw..." when useful.
- Sticky hook questions must use real campaign names and real numbers from the current answer.

SPEED OPTIMIZATION (CRITICAL): If the user's question can be answered using the provided "Verified CAI Meta Ads context", do NOT call any tools. Set "action": "none" immediately on the first turn to return the final answer as fast as possible. Only query the database or search the web if the question explicitly requires data not present in the context.

Your JSON output must match this schema:
{
  "thought": "Your reasoning about what data you need or what tool to call next.",
  "action": "read_agent_data_snapshot" | "query_campaign_database" | "get_marketing_benchmarks" | "search_web_for_benchmarks" | "none",
  "action_input": "The argument to pass to the tool (e.g. the SQL query string for query_campaign_database, or empty string otherwise)",
  "final_answer": "Only fill this in if action is \"none\". Must follow the 5 content rules and the final urgency rule exactly.",
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
  const envModel = process.env.OPENAI_MODEL || 'gpt-4o';
  const AVAILABLE_MODELS = [envModel, 'gpt-4o', 'gpt-4o-mini'];
  let currentModelName = AVAILABLE_MODELS[0];

  const anthropicKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  const anthropicModel = process.env.ANTHROPIC_MODEL || process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
  let model: any;
  if (anthropicKey) {
    console.log(`[Agent] Initializing Claude model (${anthropicModel}) as the primary model...`);
    model = new ChatAnthropic({
      apiKey: anthropicKey,
      model: anthropicModel,
      temperature: 0.35,
      maxRetries: 0,
    });
  } else {
    console.log(`[Agent] Initializing ${currentModelName} as the primary model...`);
    model = new ChatOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      model: currentModelName,
      temperature: 0.35,
      maxRetries: 0,
      modelKwargs: {
        response_format: { type: 'json_object' },
      },
    } as any);
  }

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
          console.warn(`OpenAI rate limit hit. Sleeping 2 seconds before retrying...`);
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
          console.warn(`OpenAI model failed: ${errMsg}. Falling back to ${currentModelName}...`);
          model = new ChatOpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            model: currentModelName,
            temperature: 0.35,
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
    // Try strategy 1: Direct parse
    try {
      parsed = JSON.parse(escapeRawNewlinesInJsonString(cleanContent));
    } catch (parseErr1) {
      // Try strategy 2: Unescape escaped keys/quotes and try parsing
      try {
        let unescapedContent = cleanContent;
        if (unescapedContent.includes('\\"final_answer\\"') || unescapedContent.includes('\\"thought\\"') || unescapedContent.includes('\\"action\\"')) {
          unescapedContent = unescapedContent.replace(/\\"/g, '"');
        }
        parsed = JSON.parse(escapeRawNewlinesInJsonString(unescapedContent));
      } catch (parseErr2) {
        // Try strategy 3: Try finding json inside markdown code block
        let jsonContent = cleanContent;
        const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)```/i;
        const jsonMatch = cleanContent.match(jsonBlockRegex);
        if (jsonMatch) {
          jsonContent = jsonMatch[1].trim();
        }

        try {
          parsed = JSON.parse(escapeRawNewlinesInJsonString(jsonContent));
        } catch (innerErr1) {
          try {
            let unescapedJson = jsonContent;
            if (unescapedJson.includes('\\"final_answer\\"') || unescapedJson.includes('\\"thought\\"') || unescapedJson.includes('\\"action\\"')) {
              unescapedJson = unescapedJson.replace(/\\"/g, '"');
            }
            parsed = JSON.parse(escapeRawNewlinesInJsonString(unescapedJson));
          } catch (innerErr2) {
            // Try strategy 4: Try substring brace matching
            const firstBrace = jsonContent.indexOf('{');
            const lastBrace = jsonContent.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
              const braceSubstring = jsonContent.substring(firstBrace, lastBrace + 1);
              try {
                parsed = JSON.parse(escapeRawNewlinesInJsonString(braceSubstring));
              } catch (subErr1) {
                try {
                  let unescapedBrace = braceSubstring;
                  if (unescapedBrace.includes('\\"final_answer\\"') || unescapedBrace.includes('\\"thought\\"') || unescapedBrace.includes('\\"action\\"')) {
                    unescapedBrace = unescapedBrace.replace(/\\"/g, '"');
                  }
                  parsed = JSON.parse(escapeRawNewlinesInJsonString(unescapedBrace));
                } catch (subErr2) {
                  // Proceed to markdown parsing
                }
              }
            }
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
    } else if (parsed.action === 'search_web_for_benchmarks') {
      observation = await searchWebForBenchmarks(parsed.action_input);
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
      const fallbackModel = new ChatOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        temperature: 0.35,
      });
      const fallbackMessages = [
        ...messages.filter(m => !(m instanceof AIMessage && String(m.content).includes('"action"'))),
        new HumanMessage(`Based on the conversation and observations above, please write your final performance strategist response in clear markdown format.
Follow the standard structure:
1. Headline (ONE punchy headline â€” the real story in 1 line. Example: "ðŸ“‰ Spend spiked in mid-May but CTR dropped 38% â€” you paid more and got less clicks per rupee.")
2. Metrics Table (based on campaign type: LEAD_GEN gets CPL/Leads/CVR; COMMERCIAL gets CTR/CPC/CPM/Reach; BRANDING gets CPM/Engagement/Frequency)
3. Chart data block (MUST include the chartdata block exactly)
4. 2â€“3 red flags (ðŸ”´ critical, âš ï¸ warning, âœ… good)
5. Root cause (1 paragraph, referencing actual numbers)
6. Recommendation table
7. Sticky hook (ðŸ” You should also look at / ðŸ’¬ Ask me with 3 questions using real names and â‚¹ numbers)
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


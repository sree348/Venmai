import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { prisma } from '../services/prisma.service.js';
import {
  AI_BRAIN_DATE_WINDOW,
  MARBLISM_AI_TONE,
} from '../services/ai-brain.service.js';
import { getAnthropicApiKey, getAnthropicModel, logLlmProviderSelection } from '../services/llm-provider.service.js';

const SYSTEM_PROMPT = `You are a senior performance marketing strategist managing Indian ad campaigns. ${MARBLISM_AI_TONE}
You have live campaign data below. Identify real problems and real opportunities.

Return a JSON array of 5 objects. Each must have:
type: anomaly|opportunity|warning|recommendation
priority: critical|warning|info
title: specific campaign name + metric + direction (max 8 words)
body: what is happening + why it matters + what will happen if ignored (2 sentences, real numbers from the data)
campaign_name: exact name from the data
metric: the primary metric driving this insight
current_value: actual number from the data
threshold: the benchmark or target it should be at
confidence: 0.0 to 1.0
suggested_action: verb + object + expected outcome (max 8 words)

Rules:
- Every insight must reference a real campaign name from the data
- Every body must contain at least 2 actual numbers from the data
- CPC benchmark for India = ₹15–₹80. Above ₹80 is critical.
- Frequency above 3.0 = warning. Above 4.0 = critical. Pause immediately.
- Cost Per Lead (CPL) benchmark = ₹100–₹500. Above ₹500 is critical. Below ₹150 is excellent, scale budget.
- CTR below 0.5% = creative fatigue. Above 2% = performing well.
- Zero conversions with spend above ₹1000 = budget waste, flag as critical.
- If a campaign is healthy, flag it as opportunity to scale.
Only JSON array. No markdown. No explanation.`;

function cleanJsonString(content: string): string {
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
  return cleanContent;
}

export async function runBrainAnalysis(clientId: string, tenantId: string = 'agency') {
  console.log(`Running AI Brain Analysis for clientId: ${clientId}, tenantId: ${tenantId}...`);

  const fromDate = new Date(`${AI_BRAIN_DATE_WINDOW.from}T00:00:00.000Z`);
  const toDate = new Date(`${AI_BRAIN_DATE_WINDOW.to}T23:59:59.999Z`);

  // 1. Fetch aggregated campaign data for the configured AI brain window
  const rawCampaigns = await prisma.campaignData.groupBy({
    by: ['campaignId', 'campaignName', 'platform', 'status'],
    where: {
      tenantId,
      ...(clientId && clientId !== 'agency' ? { clientId } : {}),
      date: { gte: fromDate, lte: toDate },
    },
    _sum: {
      spend: true,
      clicks: true,
      impressions: true,
      conversions: true,
      reach: true,
    },
    _avg: { frequency: true },
  });

  if (rawCampaigns.length === 0) {
    console.log('No campaign data found in database. Skipping AI Brain insights.');
    return;
  }

  // 2. Format campaigns for Groq prompt
  // 2. Format campaigns for Groq prompt using aggregated metrics
  const campaignsList = rawCampaigns.map(c => {
    const realSpend = Number(c._sum.spend || 0);
    const realClicks = Number(c._sum.clicks || 0);
    const realImpr = Number(c._sum.impressions || 0);
    const realConv = Number(c._sum.conversions || 0);
    const realCPC = realClicks > 0 ? realSpend / realClicks : null;
    const realCTR = realImpr > 0 ? (realClicks / realImpr) * 100 : 0;
    const realFreq = Number(c._avg.frequency || 0);

    return {
      campaign_id: c.campaignId,
      campaign_name: c.campaignName,
      platform: c.platform,
      status: c.status,
      spend: realSpend,
      clicks: realClicks,
      impressions: realImpr,
      conversions: realConv,
      cpc: realCPC,
      ctr: realCTR,
      frequency: realFreq,
    };
  });

  console.log(`Formatted ${campaignsList.length} campaigns for Groq analysis.`);

  // 3. Query LLM (OpenAI or Claude)
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const anthropicApiKey = getAnthropicApiKey();

  if (!openaiApiKey && !anthropicApiKey) {
    console.error('Neither OPENAI_API_KEY nor CLAUDE_API_KEY/ANTHROPIC_API_KEY is configured. Skipping insights generation.');
    return;
  }

  try {
    let model: any;
    if (anthropicApiKey) {
      const anthropicModel = getAnthropicModel('analysis');
      console.log(`[Brain Job] Using Claude model (${anthropicModel}) for insights generation...`);
      logLlmProviderSelection('brain-job', 'anthropic', anthropicModel);
      model = new ChatAnthropic({
        apiKey: anthropicApiKey,
        anthropicApiKey,
        model: anthropicModel,
        temperature: 0.1,
        maxRetries: 0,
      });
    } else {
      console.log(`[Brain Job] Using OpenAI model (${process.env.OPENAI_MODEL || 'gpt-4o'}) for insights generation...`);
      logLlmProviderSelection('brain-job', 'openai', process.env.OPENAI_MODEL || 'gpt-4o');
      model = new ChatOpenAI({
        apiKey: openaiApiKey,
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        temperature: 0.1,
        modelKwargs: {
          response_format: { type: 'json_object' },
        },
      } as any);
    }

    const response = await model.invoke([
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage(`Here is the live campaign data:\n${JSON.stringify(campaignsList, null, 2)}`),
    ]);

    const responseText = String(response.content);
    if (!responseText) {
      throw new Error('LLM returned an empty response.');
    }

    const cleanJson = cleanJsonString(responseText);
    
    // Parse Groq JSON array (which could be wrapped in an object or array)
    let parsedJson = JSON.parse(cleanJson);
    let insightsArray: any[] = [];

    if (Array.isArray(parsedJson)) {
      insightsArray = parsedJson;
    } else if (parsedJson.insights && Array.isArray(parsedJson.insights)) {
      insightsArray = parsedJson.insights;
    } else if (typeof parsedJson === 'object') {
      // Find the first array property in the object
      const arrayProp = Object.values(parsedJson).find(val => Array.isArray(val));
      if (arrayProp) {
        insightsArray = arrayProp as any[];
      } else {
        insightsArray = [parsedJson]; // Fallback single item
      }
    }

    // Sort insights: critical → warning → opportunity → info
    const insightOrder = { critical: 0, warning: 1, opportunity: 2, info: 3 };
    insightsArray.sort((a, b) => {
      const aPri = insightOrder[a.priority?.toLowerCase() as keyof typeof insightOrder] ?? 4;
      const bPri = insightOrder[b.priority?.toLowerCase() as keyof typeof insightOrder] ?? 4;
      return aPri - bPri;
    });

    // Keep exactly 5 insights
    insightsArray = insightsArray.slice(0, 5);

    // Save insights in the database
    console.log(`Saving ${insightsArray.length} insights into database for clientId: ${clientId}...`);
    await prisma.brainInsight.deleteMany({ where: { tenantId: clientId } });

    for (const insight of insightsArray) {
      await prisma.brainInsight.create({
        data: {
          tenantId: clientId,
          type: String(insight.type || 'recommendation'),
          priority: String(insight.priority || 'info'),
          title: String(insight.title || 'Marketing Opportunity'),
          body: String(insight.body || ''),
          campaignName: String(insight.campaign_name || ''),
          metric: String(insight.metric || ''),
          currentValue: Number(insight.current_value || 0),
          threshold: Number(insight.threshold || 0),
          confidence: Number(insight.confidence || 0.9),
          suggestedAction: String(insight.suggested_action || ''),
        },
      });
    }

    console.log('Insights saved successfully!');
  } catch (error) {
    console.error('Failed to generate insights from OpenAI:', error);
  }

  // 4. Calculate and store Campaign Scores
  console.log('Calculating campaign performance scores...');

  // Find max date in the database to establish our reference timeline for weekly trend
  const maxDateResult = await prisma.campaignData.aggregate({
    where: {
      tenantId,
      ...(clientId && clientId !== 'agency' ? { clientId } : {}),
    },
    _max: {
      date: true,
    },
  });

  const maxDate = maxDateResult._max.date || new Date();

  // This week = last 7 days of campaign data: [maxDate - 6 days, maxDate]
  const thisWeekStart = new Date(maxDate);
  thisWeekStart.setDate(thisWeekStart.getDate() - 6);
  thisWeekStart.setHours(0, 0, 0, 0);

  const thisWeekEnd = new Date(maxDate);
  thisWeekEnd.setHours(23, 59, 59, 999);

  // Last week = [maxDate - 13 days, maxDate - 7 days]
  const lastWeekStart = new Date(maxDate);
  lastWeekStart.setDate(lastWeekStart.getDate() - 13);
  lastWeekStart.setHours(0, 0, 0, 0);

  const lastWeekEnd = new Date(maxDate);
  lastWeekEnd.setDate(lastWeekEnd.getDate() - 7);
  lastWeekEnd.setHours(23, 59, 59, 999);

  // Fetch campaign metrics grouped for this week
  const thisWeekMetrics = await prisma.campaignData.groupBy({
    by: ['campaignName'],
    where: {
      tenantId,
      ...(clientId && clientId !== 'agency' ? { clientId } : {}),
      date: {
        gte: thisWeekStart,
        lte: thisWeekEnd,
      },
    },
    _sum: {
      spend: true,
      impressions: true,
      clicks: true,
      conversions: true,
      actionValue: true,
    },
    _avg: {
      frequency: true,
    },
  });

  // Fetch campaign metrics grouped for last week
  const lastWeekMetrics = await prisma.campaignData.groupBy({
    by: ['campaignName'],
    where: {
      tenantId,
      ...(clientId && clientId !== 'agency' ? { clientId } : {}),
      date: {
        gte: lastWeekStart,
        lte: lastWeekEnd,
      },
    },
    _sum: {
      spend: true,
      impressions: true,
      clicks: true,
      conversions: true,
      actionValue: true,
    },
    _avg: {
      frequency: true,
    },
  });

  // Helper to calculate score based on the new formula (no hard‑coded 80 fallback)
  const calculateScoreFromSumAvg = (sum: any, avg: any) => {
    const realSpend = Number(sum?.spend || 0);
    const realClicks = Number(sum?.clicks || 0);
    const realImpr = Number(sum?.impressions || 0);
    const realConv = Number(sum?.conversions || 0);
    const realFreq = Number(avg?.frequency || 0);

    const realCPC = realClicks > 0 ? realSpend / realClicks : null;
    const realCTR = realImpr > 0 ? (realClicks / realImpr) * 100 : 0;

    const cpcScore = realCPC !== null && realCPC < 80 ? 25 : 0;
    const ctrScore = realCTR > 0.5 ? 30 : realCTR > 0.3 ? 15 : 0;
    const convScore = realConv > 0 ? 25 : 0;
    const freqPenalty = realFreq > 4 ? 30 : realFreq > 3 ? 15 : 0;
    const zeroPenalty = realConv === 0 && realSpend > 5000 ? 60 : 0;

    let score = cpcScore + ctrScore + convScore - freqPenalty - zeroPenalty;
    if (Number.isNaN(score)) score = 0;
    return Math.max(0, Math.min(100, Math.round(score)));
  };

  // Compute budget at risk while iterating
  let budgetAtRisk = 0;
  const riskCampaignIds: string[] = [];

  for (const c of campaignsList) {
    // Log metrics before scoring
    console.log('Scoring campaign', c.campaign_name, {
      spend: c.spend,
      clicks: c.clicks,
      conversions: c.conversions,
      ctr: c.ctr,
      frequency: c.frequency,
      calculatedCPC: c.cpc,
    });

    // 1. Calculate overall score using aggregated metrics
    const overallScore = calculateScoreFromSumAvg(
      {
        spend: c.spend,
        clicks: c.clicks,
        impressions: c.impressions,
        conversions: c.conversions,
        // roas not needed for new formula
      },
      { frequency: c.frequency }
    );

    // Track budget‑at‑risk campaigns (zero conversions & spend > 5000)
    if (c.conversions === 0 && c.spend > 5000) {
      budgetAtRisk += c.spend;
      riskCampaignIds.push(c.campaign_id);
    }

    // 2. Determine weekly trend (compare this week vs last week score)
    const thisWeekItem = thisWeekMetrics.find(m => m.campaignName === c.campaign_name);
    const lastWeekItem = lastWeekMetrics.find(m => m.campaignName === c.campaign_name);

    let score = overallScore;
    let trend = 'stable';

    if (thisWeekItem) {
      // If the campaign is actively running this week, we store its current week's score
      const thisWeekScore = calculateScoreFromSumAvg(thisWeekItem._sum, thisWeekItem._avg);
      score = thisWeekScore;

      if (lastWeekItem) {
        const lastWeekScore = calculateScoreFromSumAvg(lastWeekItem._sum, lastWeekItem._avg);
        if (thisWeekScore > lastWeekScore) {
          trend = 'up';
        } else if (thisWeekScore < lastWeekScore) {
          trend = 'down';
        }
      } else {
        // Active this week but not active last week means score trend goes up if score > 0
        if (thisWeekScore > 0) {
          trend = 'up';
        }
      }
    }

    // Upsert performance score in the database
    await prisma.campaignScore.upsert({
      where: {
        tenantId_campaignName: {
          tenantId: clientId,
          campaignName: c.campaign_name,
        },
      },
      update: {
        score,
        trend,
      },
      create: {
        tenantId: clientId,
        campaignName: c.campaign_name,
        score,
        trend,
      },
    });
  }

  // Log budget‑at‑risk summary
  console.log('Budget‑at‑risk total spend:', budgetAtRisk);
  console.log('Budget‑at‑risk campaign IDs:', riskCampaignIds);


  console.log('Campaign performance scores updated successfully!');
}

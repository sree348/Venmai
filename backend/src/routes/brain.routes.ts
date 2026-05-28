import { Router } from 'express';
import { prisma } from '../services/prisma.service.js';
import { runBrainAnalysis } from '../jobs/brain.job.js';
import { requireJwtAuth, type AuthenticatedRequest } from '../middleware/auth.middleware.js';
import Groq from 'groq-sdk';

export const brainRouter = Router();

// GET /api/v1/brain/insights?clientId=
brainRouter.get('/brain/insights', requireJwtAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const clientId = (req.query.clientId as string) || 'agency';
    
    const insights = await prisma.brainInsight.findMany({
      where: { tenantId: clientId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    
    return res.json(insights);
  } catch (error) {
    return next(error);
  }
});

// GET /api/v1/brain/scores?clientId=
brainRouter.get('/brain/scores', requireJwtAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const clientId = (req.query.clientId as string) || 'agency';
    
    const scores = await prisma.campaignScore.findMany({
      where: { tenantId: clientId },
      orderBy: { score: 'desc' },
    });
    
    return res.json(scores);
  } catch (error) {
    return next(error);
  }
});

// POST /api/v1/brain/sync
brainRouter.post('/brain/sync', requireJwtAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const clientId = req.body.clientId || 'agency';
    
    await runBrainAnalysis(clientId);
    
    return res.json({ success: true, message: 'AI Brain sync completed successfully.' });
  } catch (error) {
    return next(error);
  }
});

// POST /api/v1/agency/ai-summary
brainRouter.post('/agency/ai-summary', requireJwtAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { tenantId = 'agency', clientId, dateRange = 'last_30_days' } = req.body || {};

    // 1. Fetch aggregated campaign data for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const rawCampaigns = await prisma.campaignData.groupBy({
      by: ['campaignId', 'campaignName', 'platform', 'status'],
      where: {
        tenantId,
        ...(clientId && clientId !== 'agency' ? { clientId } : {}),
        date: { gte: thirtyDaysAgo },
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

    // 2. Perform calculations
    const totalSpend = rawCampaigns.reduce((sum, c) => sum + Number(c._sum.spend || 0), 0);
    const totalClicks = rawCampaigns.reduce((sum, c) => sum + Number(c._sum.clicks || 0), 0);
    const totalConversions = rawCampaigns.reduce((sum, c) => sum + Number(c._sum.conversions || 0), 0);
    const avgCPC = totalClicks > 0 ? totalSpend / totalClicks : 0;

    const sortedByCpc = rawCampaigns.map(c => {
      const spend = Number(c._sum.spend || 0);
      const clicks = Number(c._sum.clicks || 0);
      const conversions = Number(c._sum.conversions || 0);
      const frequency = Number(c._avg.frequency || 0);
      return {
        name: c.campaignName,
        platform: c.platform,
        spend,
        clicks,
        conversions,
        cpc: clicks > 0 ? spend / clicks : 0,
        frequency,
      };
    });

    const campaignsWithClicks = sortedByCpc.filter(c => c.clicks > 0);
    const topCampaign = campaignsWithClicks.length > 0
      ? [...campaignsWithClicks].sort((a, b) => a.cpc - b.cpc)[0]?.name || 'N/A'
      : 'N/A';
    const worstCampaign = sortedByCpc.length > 0
      ? [...sortedByCpc].sort((a, b) => b.cpc - a.cpc)[0]?.name || 'N/A'
      : 'N/A';

    const platformBreakdown = sortedByCpc.reduce((acc: any, c) => {
      const plat = c.platform || 'Meta';
      if (!acc[plat]) {
        acc[plat] = { spend: 0, clicks: 0, conversions: 0 };
      }
      acc[plat].spend += c.spend;
      acc[plat].clicks += c.clicks;
      acc[plat].conversions += c.conversions;
      return acc;
    }, {});

    const frequencyWarnings = sortedByCpc.filter(c => c.frequency > 3.0).map(c => `${c.name} (${c.frequency.toFixed(2)})`);
    const zeroConversionCampaigns = sortedByCpc.filter(c => c.conversions === 0 && c.spend > 1000).map(c => `${c.name} (spend: ₹${c.spend.toFixed(0)})`);

    const aggregatedMetrics = {
      totalSpend,
      avgCPC,
      totalConversions,
      topCampaign,
      worstCampaign,
      platformBreakdown,
      frequencyWarnings,
      zeroConversionCampaigns,
    };

    // 3. Query Groq
    const apiKey = process.env.GROQ_API_KEY;
    if (apiKey) {
      try {
        const groq = new Groq({ apiKey });
        const completion = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: `You are a senior marketing strategist. Write an executive summary for an agency overview. Data: ${JSON.stringify(aggregatedMetrics)}. Return JSON with these fields: { headline, overview, topWin, biggestRisk, recommendation, budgetHealth, keyMetrics: [{ label, value, status }] } Be specific. Use real numbers from the data. Max 3 sentences per field. Value status must be 'success' (positive/healthy), 'warning' (pacing alert), or 'danger' (budget waste or fatigue).`,
            },
          ],
        });

        const responseText = completion.choices[0]?.message?.content;
        if (responseText) {
          const parsed = JSON.parse(responseText.trim());
          return res.json(parsed);
        }
      } catch (groqErr) {
        console.error('Groq query failed in ai-summary endpoint, falling back to local generation:', groqErr);
      }
    }

    // 4. Fallback Generator (local high-precision fallback)
    const fallbackSummary = {
      headline: `Lead Generation Performance: ₹${(totalSpend / 1000).toFixed(1)}k Spend yielding ${totalConversions} Leads`,
      overview: `Venpep Agency campaigns spent a combined ₹${totalSpend.toLocaleString('en-IN')} over the last 30 days, generating ${totalConversions} conversions at an average Cost Per Click of ₹${avgCPC.toFixed(2)}. Meta remains the dominant channel driving lead volume.`,
      topWin: `The best-performing campaign by CPC is "${topCampaign}" with optimized click efficiency and strong acquisition costs.`,
      biggestRisk: worstCampaign !== 'N/A'
        ? `The campaign "${worstCampaign}" displays the highest CPC or zero conversion inefficiency, signaling potential creative fatigue or audience mismatch.`
        : `Frequency fatigue detected in ${frequencyWarnings.length} campaigns which could degrade average cost efficiency.`,
      recommendation: `Relocate 15-20% of budget from ${worstCampaign} into high-CTR broad core campaigns, and pause any creatives with frequency above 3.0.`,
      budgetHealth: zeroConversionCampaigns.length > 0
        ? `Budget health has warning signs: ${zeroConversionCampaigns.length} campaign(s) are spending without conversions.`
        : 'Budget health is excellent. Zero-conversion waste is minimal and spend pacing is aligned.',
      keyMetrics: [
        { label: 'Spend', value: `₹${(totalSpend / 1000).toFixed(1)}k`, status: 'success' },
        { label: 'Average CPC', value: `₹${avgCPC.toFixed(2)}`, status: avgCPC > 80 ? 'danger' : 'success' },
        { label: 'Conversions', value: totalConversions.toLocaleString(), status: 'success' },
        { label: 'Campaigns Count', value: rawCampaigns.length.toString(), status: 'success' },
      ],
    };

    return res.json(fallbackSummary);
  } catch (error) {
    return next(error);
  }
});

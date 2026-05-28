import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { Sparkles, Trash2, Send, Cpu, Lightbulb, AlertTriangle, RefreshCw, TrendingUp, TrendingDown, ShieldAlert, Zap, Settings, Pin, ChevronDown, Pause, Plus, Edit, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import PageWrapper from '../components/shared/PageWrapper';
import { apiService } from '../../services/api.service';
import WidgetRenderer, { formatInr, formatRoas } from '../components/shared/WidgetRenderer';
import { getAlerts, getConnectedPlatforms, getPerformanceSummary, getRecommendations } from '../../services/insights.service';
import { toast } from 'sonner';

const QUICK_CHIPS = [
  "What should I pause today and why?",
  "Which campaigns are wasting budget with zero conversions?",
  "Where should I scale budget based on CPC and CTR?",
  "Show campaigns with frequency fatigue above 3.0",
  "Which campaign has the worst CPC and what should I fix?",
  "Summarize Meta spend, conversions, CPC, and CPL this month"
];

const BENCHMARKS = {
  cpcCritical: 80,
  frequencyWarning: 3,
  frequencyCritical: 4,
  ctrWarning: 0.5,
  roasWeak: 2,
  roasScale: 4,
  wasteSpend: 5000,
};

function priorityRank(priority: string) {
  if (priority === 'critical') return 0;
  if (priority === 'warning') return 1;
  return 2;
}

function getCampaignHealthMetrics(c: any, score: number) {
  // Extract values
  const spend = Number(c.spend || c.amount_spent || 0);
  const clicks = Number(c.clicks || 0);
  const impressions = Number(c.impressions || 0);
  const conversions = Number(c.conversions || c.conv || 0);
  const frequency = Number(c.frequency || 0);
  const cpc = clicks > 0 ? spend / clicks : 0;
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const roas = spend > 0 ? (c.actionValue || (c.roas ? c.roas * spend : 0)) / spend : 0;
  const cpl = conversions > 0 ? spend / conversions : 0;

  // 1. Budget Waste: Zero conversions with high spend above ₹5000
  if (conversions === 0 && spend > 5000) {
    return {
      topIssue: 'Budget Waste',
      recommendation: `Zero conversions recorded despite ₹${spend.toLocaleString('en-IN', { maximumFractionDigits: 0 })} spent. Pause campaign immediately to save budget.`,
      priority: 'critical',
      badgeColor: 'bg-rose-500/10 border-rose-500/30 text-rose-500'
    };
  }

  // 2. Frequency above 4.0 = critical. Pause immediately. Above 3.0 = warning. Below 3.0 is healthy.
  if (frequency > 4.0) {
    return {
      topIssue: 'High Fatigue',
      recommendation: `Ad frequency has reached a critical level of ${frequency.toFixed(2)}. Pause this campaign immediately to avoid creative saturation.`,
      priority: 'critical',
      badgeColor: 'bg-rose-500/10 border-rose-500/30 text-rose-500'
    };
  }
  if (frequency > 3.0) {
    return {
      topIssue: 'Ad Fatigue',
      recommendation: `Ad frequency is high at ${frequency.toFixed(2)}. Rotate your creative assets and refresh audiences soon to maintain CTR.`,
      priority: 'warning',
      badgeColor: 'bg-amber-500/10 border-amber-500/30 text-amber-500'
    };
  }

  // 3. CPC above ₹80 is critical
  if (cpc > 80) {
    return {
      topIssue: 'Critical CPC',
      recommendation: `CPC is extremely high at ₹${cpc.toFixed(2)} (well above the ₹80 Indian benchmark). Refine audience targeting and improve creative hooks.`,
      priority: 'critical',
      badgeColor: 'bg-rose-500/10 border-rose-500/30 text-rose-500'
    };
  }

  // 4. CPL above ₹500 = underperforming
  if (cpl > 500) {
    return {
      topIssue: 'High CPL',
      recommendation: `Cost Per Lead is high at ₹${cpl.toFixed(0)} (target is < ₹300). Review landing page conversion rate and offer positioning.`,
      priority: 'warning',
      badgeColor: 'bg-amber-500/10 border-amber-500/30 text-amber-500'
    };
  }

  // 5. CTR below 0.5% = creative fatigue
  if (ctr > 0 && ctr < 0.5) {
    return {
      topIssue: 'Low CTR',
      recommendation: `CTR is sluggish at ${ctr.toFixed(2)}% (under the 0.5% creative fatigue line). Refresh your ad creatives and headlines immediately.`,
      priority: 'warning',
      badgeColor: 'bg-amber-500/10 border-amber-500/30 text-amber-500'
    };
  }

  // 6. Healthy Opportunities to scale
  if (cpl > 0 && cpl <= 150) {
    return {
      topIssue: 'Scale Lead Gen',
      recommendation: `Outstanding Cost Per Lead of ₹${cpl.toFixed(0)}. Scale campaign budget by 20-30% immediately to capture more high-value leads.`,
      priority: 'success',
      badgeColor: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
    };
  }

  if (ctr >= 2.0) {
    return {
      topIssue: 'Scale CTR',
      recommendation: `Impressive CTR at ${ctr.toFixed(2)}% shows superb relevance. Increase daily budget to unlock higher conversion volume.`,
      priority: 'success',
      badgeColor: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
    };
  }

  // 7. General Custom Recommendations - Never a static fallback string!
  if (score >= 70) {
    return {
      topIssue: 'Healthy Performance',
      recommendation: `Solid health score of ${score}/100 driven by a highly efficient CPC of ₹${cpc.toFixed(2)} and a strong CTR of ${ctr.toFixed(2)}%. Maintain current pacing.`,
      priority: 'success',
      badgeColor: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
    };
  }

  if (score >= 40) {
    return {
      topIssue: 'Moderate Health',
      recommendation: `Moderate health of ${score}/100. Spend is ₹${spend.toLocaleString('en-IN', { maximumFractionDigits: 0 })} with conversions at ${conversions}. Optimize CTR and CPC to hit 70+.`,
      priority: 'warning',
      badgeColor: 'bg-amber-500/10 border-amber-500/30 text-amber-500'
    };
  }

  return {
    topIssue: 'Poor Health',
    recommendation: `Critical health score of ${score}/100. Driven by low CTR (${ctr.toFixed(2)}%) or frequency fatigue (${frequency.toFixed(2)}). Implement budget reallocation.`,
    priority: 'critical',
    badgeColor: 'bg-rose-500/10 border-rose-500/30 text-rose-500'
  };
}

function getCampaignMetrics(c: any) {
  const spend = Number(c.spend || c.amount_spent || 0);
  const clicks = Number(c.clicks || 0);
  const impressions = Number(c.impressions || 0);
  const conversions = Number(c.conversions || c.conv || 0);
  const frequency = Number(c.frequency || 0);
  const cpc = clicks > 0 ? spend / clicks : Number(c.cpc || 0);
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : Number(c.ctr || 0);
  const roas = Number(c.roas || 0);

  return { spend, clicks, impressions, conversions, frequency, cpc, ctr, roas };
}

function buildRuleInsights(campaigns: any[]) {
  return campaigns.flatMap((campaign: any) => {
    const name = campaign.name || campaign.campaignName || 'Unnamed campaign';
    const { spend, conversions, frequency, cpc, ctr, roas } = getCampaignMetrics(campaign);
    const insights: any[] = [];

    if (conversions === 0 && spend >= BENCHMARKS.wasteSpend) {
      insights.push({
        id: `rule-waste-${campaign.id || name}`,
        type: 'anomaly',
        priority: 'critical',
        title: 'Budget waste detected',
        campaignName: name,
        metric: 'conversions',
        currentValue: conversions,
        threshold: 1,
        confidence: 0.96,
        body: `${name} has spent ${formatInr(spend)} with zero conversions. This should be paused or audited before more budget is spent.`,
        suggestedAction: 'Pause spend and audit tracking',
        expectedImpact: 'Stop inefficient spend immediately',
      });
    }

    if (frequency >= BENCHMARKS.frequencyCritical) {
      insights.push({
        id: `rule-frequency-critical-${campaign.id || name}`,
        type: 'warning',
        priority: 'critical',
        title: 'Critical frequency fatigue',
        campaignName: name,
        metric: 'frequency',
        currentValue: frequency,
        threshold: BENCHMARKS.frequencyCritical,
        confidence: 0.94,
        body: `${name} is at ${frequency.toFixed(2)} frequency, above the ${BENCHMARKS.frequencyCritical.toFixed(1)} critical fatigue line. Continued delivery can suppress CTR and raise acquisition cost.`,
        suggestedAction: 'Rotate creatives and cap frequency',
        expectedImpact: 'Protect CTR and CPC efficiency',
      });
    } else if (frequency >= BENCHMARKS.frequencyWarning) {
      insights.push({
        id: `rule-frequency-warning-${campaign.id || name}`,
        type: 'warning',
        priority: 'warning',
        title: 'Frequency fatigue building',
        campaignName: name,
        metric: 'frequency',
        currentValue: frequency,
        threshold: BENCHMARKS.frequencyWarning,
        confidence: 0.9,
        body: `${name} is at ${frequency.toFixed(2)} frequency, above the ${BENCHMARKS.frequencyWarning.toFixed(1)} warning benchmark. Prepare fresh creatives before performance decays.`,
        suggestedAction: 'Refresh creative variants',
        expectedImpact: 'Reduce fatigue risk',
      });
    }

    if (cpc > BENCHMARKS.cpcCritical) {
      insights.push({
        id: `rule-cpc-${campaign.id || name}`,
        type: 'anomaly',
        priority: 'critical',
        title: 'CPC above benchmark',
        campaignName: name,
        metric: 'cpc',
        currentValue: cpc,
        threshold: BENCHMARKS.cpcCritical,
        confidence: 0.92,
        body: `${name} has CPC at ${formatInr(cpc)}, above the ${formatInr(BENCHMARKS.cpcCritical)} India benchmark. Audience quality, creative hook, or bidding needs review.`,
        suggestedAction: 'Tighten audience and test hooks',
        expectedImpact: 'Lower cost per click',
      });
    }

    if (ctr > 0 && ctr < BENCHMARKS.ctrWarning) {
      insights.push({
        id: `rule-ctr-${campaign.id || name}`,
        type: 'warning',
        priority: 'warning',
        title: 'Low CTR creative issue',
        campaignName: name,
        metric: 'ctr',
        currentValue: ctr,
        threshold: BENCHMARKS.ctrWarning,
        confidence: 0.88,
        body: `${name} has CTR at ${ctr.toFixed(2)}%, below the ${BENCHMARKS.ctrWarning}% creative warning line. The ad likely needs a stronger hook, offer, or audience match.`,
        suggestedAction: 'Rewrite hook and refresh creative',
        expectedImpact: 'Improve click efficiency',
      });
    }

    const cpl = conversions > 0 ? spend / conversions : 0;
    if (cpl > 0 && cpl <= 200) {
      insights.push({
        id: `rule-scale-${campaign.id || name}`,
        type: 'opportunity',
        priority: 'info',
        title: 'Scale opportunity',
        campaignName: name,
        metric: 'conversions',
        currentValue: conversions,
        threshold: 10,
        confidence: 0.9,
        body: `${name} is delivering efficient leads at ₹${cpl.toFixed(0)} CPL with ${conversions} conversions. Increase budget gradually while monitoring CPC and frequency.`,
        suggestedAction: 'Scale budget by 15-20%',
        expectedImpact: 'Capture more efficient volume',
      });
    } else if (cpl > 500) {
      insights.push({
        id: `rule-roas-${campaign.id || name}`,
        type: 'warning',
        priority: 'warning',
        title: 'CPL above benchmark',
        campaignName: name,
        metric: 'conversions',
        currentValue: conversions,
        threshold: 10,
        confidence: 0.86,
        body: `${name} has a high CPL of ₹${cpl.toFixed(0)}, exceeding the ₹300 limit. Review offer, landing page quality, and conversion tracking.`,
        suggestedAction: 'Fix funnel before scaling',
        expectedImpact: 'Improve spend quality',
      });
    }

    return insights;
  });
}

function extractFrequencyThreshold(prompt: string) {
  const match = prompt.match(/frequency(?:\s+fatigue)?(?:\s+above|\s*>)?\s*(\d+(?:\.\d+)?)/i);
  if (match) return Number(match[1]);
  if (/above\s*4|critical/i.test(prompt)) return 4;
  if (/above\s*3|fatigue/i.test(prompt)) return 3;
  return 3;
}

function buildLocalFallbackResponse(prompt: string, campaigns: any[], activeClientName?: string) {
  const normalized = prompt.toLowerCase();
  const threshold = extractFrequencyThreshold(prompt);
  const freqCampaigns = campaigns
    .map((campaign: any) => {
      const metrics = getCampaignMetrics(campaign);
      return {
        campaign_name: campaign.name || campaign.campaignName,
        platform: campaign.platform || campaign.channel || 'Meta',
        spend: metrics.spend,
        clicks: metrics.clicks,
        impressions: metrics.impressions,
        conversions: metrics.conversions,
        frequency: metrics.frequency,
        cpc: metrics.cpc,
        ctr: metrics.ctr,
        roas: metrics.roas || null,
        status: campaign.status,
        recommended_action:
          metrics.frequency >= 4
            ? 'Pause now, rotate creatives, and cap frequency.'
            : metrics.frequency >= 3
              ? 'Refresh creative and narrow audience before performance drops.'
              : 'Monitor frequency; no immediate action needed.',
      };
    })
    .filter(row => Number(row.frequency || 0) > threshold)
    .sort((a, b) => Number(b.frequency || 0) - Number(a.frequency || 0));

  // 1. Handle budget waste queries
  if (normalized.includes('waste') || normalized.includes('wasting') || normalized.includes('zero conversion') || normalized.includes('zero conv') || normalized.includes('risk')) {
    const wasteCampaigns = campaigns
      .map((campaign: any) => {
        const metrics = getCampaignMetrics(campaign);
        return {
          campaign_name: campaign.name || campaign.campaignName,
          platform: campaign.platform || campaign.channel || 'Meta',
          spend: metrics.spend,
          clicks: metrics.clicks,
          impressions: metrics.impressions,
          conversions: metrics.conversions,
          frequency: metrics.frequency,
          cpc: metrics.cpc,
          ctr: metrics.ctr,
          roas: metrics.roas || null,
          status: campaign.status,
          recommended_action: 'Pause immediately to prevent further budget waste. Audit targeting & hook.',
        };
      })
      .filter(row => row.conversions === 0 && row.spend > BENCHMARKS.wasteSpend)
      .sort((a, b) => b.spend - a.spend);

    const insightLines = wasteCampaigns.length
      ? [
          `I found ${wasteCampaigns.length} budget-wasting campaign${wasteCampaigns.length === 1 ? '' : 's'} (defined as zero conversions with spend > ${formatInr(BENCHMARKS.wasteSpend)})${activeClientName ? ` for ${activeClientName}` : ''}:`,
          ...wasteCampaigns.map((item: any) =>
            `- **${item.campaign_name}**: spent ${formatInr(item.spend)} with zero conversions. Action: ${item.recommended_action}`
          ),
          'These campaigns represent an immediate budget saving opportunity if paused.'
        ]
      : [
          `No campaigns are currently wasting budget (defined as zero conversions with spend > ${formatInr(BENCHMARKS.wasteSpend)})${activeClientName ? ` for ${activeClientName}` : ''}.`,
          'All active campaigns with significant spend have recorded at least one conversion. Keep monitoring CTR and CPC.'
        ];

    return {
      widget: {
        chart_type: 'table',
        title: `Budget-Wasting Campaigns (Spend > ${formatInr(BENCHMARKS.wasteSpend)} & 0 Conversions)`,
        data: wasteCampaigns,
        config: {
          x_axis: 'campaign_name',
          y_axis: 'spend',
          sort: 'DESC',
        },
        sql: null,
        insight: insightLines.join('\n'),
      },
      insight: insightLines.join('\n'),
    };
  }

  // 2. Handle pause recommendations queries
  if (normalized.includes('pause')) {
    const pauseCampaigns = campaigns
      .map((campaign: any) => {
        const metrics = getCampaignMetrics(campaign);
        let reason = '';
        let priority = 'normal';
        if (metrics.conversions === 0 && metrics.spend > BENCHMARKS.wasteSpend) {
          reason = `Zero conversions with spend of ${formatInr(metrics.spend)}`;
          priority = 'critical';
        } else if (metrics.frequency >= BENCHMARKS.frequencyCritical) {
          reason = `Critical frequency fatigue of ${metrics.frequency.toFixed(2)}`;
          priority = 'critical';
        } else if (metrics.cpc > BENCHMARKS.cpcCritical) {
          reason = `Extremely high CPC of ${formatInr(metrics.cpc)} (benchmark is < ₹80)`;
          priority = 'warning';
        } else if (metrics.frequency >= BENCHMARKS.frequencyWarning) {
          reason = `Frequency fatigue building at ${metrics.frequency.toFixed(2)}`;
          priority = 'warning';
        }
        return {
          campaign_name: campaign.name || campaign.campaignName,
          platform: campaign.platform || campaign.channel || 'Meta',
          spend: metrics.spend,
          conversions: metrics.conversions,
          frequency: metrics.frequency,
          cpc: metrics.cpc,
          reason,
          priority,
          recommended_action: 'Pause immediately and audit performance metrics.',
        };
      })
      .filter(row => row.reason !== '')
      .sort((a, b) => {
        if (a.priority === 'critical' && b.priority !== 'critical') return -1;
        if (a.priority !== 'critical' && b.priority === 'critical') return 1;
        if (a.priority === 'warning' && b.priority === 'normal') return -1;
        if (a.priority === 'normal' && b.priority === 'warning') return 1;
        return b.spend - a.spend;
      });

    const insightLines = pauseCampaigns.length
      ? [
          `Based on local campaign data, here are ${pauseCampaigns.length} campaign${pauseCampaigns.length === 1 ? '' : 's'} recommended for pause or audit${activeClientName ? ` for ${activeClientName}` : ''}:`,
          ...pauseCampaigns.map((item: any) =>
            `- **${item.campaign_name}**: ${item.reason}. Action: ${item.recommended_action}`
          )
        ]
      : [
          `No campaigns are currently recommended for pause according to local rules (CPC > ₹80, frequency > 4.0, or zero conversions with spend > ₹5,000)${activeClientName ? ` for ${activeClientName}` : ''}.`
        ];

    return {
      widget: {
        chart_type: 'table',
        title: 'Campaigns Recommended to Pause',
        data: pauseCampaigns,
        config: {
          x_axis: 'campaign_name',
          y_axis: 'spend',
          sort: 'DESC',
        },
        sql: null,
        insight: insightLines.join('\n'),
      },
      insight: insightLines.join('\n'),
    };
  }

  // 3. Handle CPC queries
  if (normalized.includes('cpc') || normalized.includes('cost per click')) {
    const cpcCampaigns = campaigns
      .map((campaign: any) => {
        const metrics = getCampaignMetrics(campaign);
        return {
          campaign_name: campaign.name || campaign.campaignName,
          platform: campaign.platform || campaign.channel || 'Meta',
          spend: metrics.spend,
          clicks: metrics.clicks,
          conversions: metrics.conversions,
          cpc: metrics.cpc,
          ctr: metrics.ctr,
          recommended_action: metrics.cpc > BENCHMARKS.cpcCritical ? 'CPC is critical. Target fresh hooks or optimize audience.' : 'CPC is healthy. Monitor performance.',
        };
      })
      .sort((a, b) => b.cpc - a.cpc);

    const worst = cpcCampaigns.filter(row => row.cpc > BENCHMARKS.cpcCritical);
    const insightLines = cpcCampaigns.length
      ? [
          `Here is the CPC breakdown for campaigns${activeClientName ? ` under ${activeClientName}` : ''}:`,
          ...cpcCampaigns.slice(0, 5).map((item: any) =>
            `- **${item.campaign_name}**: CPC of ${formatInr(item.cpc)} (spend: ${formatInr(item.spend)}, clicks: ${item.clicks}).`
          ),
          worst.length > 0
            ? `There are ${worst.length} campaign(s) exceeding the critical India CPC benchmark of ${formatInr(BENCHMARKS.cpcCritical)}.`
            : 'All campaigns have CPC values below the critical benchmark.'
        ]
      : ['No campaign click data is currently available.'];

    return {
      widget: {
        chart_type: 'table',
        title: 'CPC Performance Breakdown',
        data: cpcCampaigns,
        config: {
          x_axis: 'campaign_name',
          y_axis: 'cpc',
          sort: 'DESC',
        },
        sql: null,
        insight: insightLines.join('\n'),
      },
      insight: insightLines.join('\n'),
    };
  }

  // 4. Handle Scale/Opportunity queries
  if (normalized.includes('scale') || normalized.includes('roas') || normalized.includes('opportunity') || normalized.includes('ctr')) {
    const scaleCampaigns = campaigns
      .map((campaign: any) => {
        const metrics = getCampaignMetrics(campaign);
        let scaleSignal = false;
        let reason = '';
        if (metrics.roas >= BENCHMARKS.roasScale) {
          scaleSignal = true;
          reason = `High ROAS of ${metrics.roas.toFixed(2)}x`;
        } else if (metrics.ctr >= 2.0) {
          scaleSignal = true;
          reason = `Strong CTR of ${metrics.ctr.toFixed(2)}%`;
        }
        return {
          campaign_name: campaign.name || campaign.campaignName,
          platform: campaign.platform || campaign.channel || 'Meta',
          spend: metrics.spend,
          conversions: metrics.conversions,
          roas: metrics.roas,
          ctr: metrics.ctr,
          reason,
          scaleSignal,
          recommended_action: scaleSignal ? 'Increase budget by 15-20% immediately.' : 'Maintain current budget level.',
        };
      })
      .sort((a, b) => b.roas - a.roas);

    const scalable = scaleCampaigns.filter(row => row.scaleSignal);
    const insightLines = scalable.length
      ? [
          `I found ${scalable.length} campaign${scalable.length === 1 ? '' : 's'} with scale signals (ROAS >= ${BENCHMARKS.roasScale}x or CTR >= 2.0%)${activeClientName ? ` for ${activeClientName}` : ''}:`,
          ...scalable.map((item: any) =>
            `- **${item.campaign_name}**: ${item.reason} (conversions: ${item.conversions}). Action: ${item.recommended_action}`
          )
        ]
      : [
          `No campaigns are showing strong scale signals (ROAS >= ${BENCHMARKS.roasScale}x or CTR >= 2.0%)${activeClientName ? ` for ${activeClientName}` : ''}.`,
          'Focus on improving underperforming campaigns before scaling.'
        ];

    return {
      widget: {
        chart_type: 'table',
        title: 'Campaign Scaling Opportunities',
        data: scaleCampaigns,
        config: {
          x_axis: 'campaign_name',
          y_axis: 'roas',
          sort: 'DESC',
        },
        sql: null,
        insight: insightLines.join('\n'),
      },
      insight: insightLines.join('\n'),
    };
  }

  // 5. Handle Frequency / Fatigue queries
  if (normalized.includes('frequency') || normalized.includes('fatigue')) {
    const actionable = freqCampaigns.length
      ? freqCampaigns
      : campaigns
          .map((campaign: any) => ({ ...campaign, ...getCampaignMetrics(campaign) }))
          .filter((campaign: any) => Number(campaign.frequency || 0) > 3)
          .map((campaign: any) => ({
            campaign_name: campaign.name || campaign.campaignName,
            platform: campaign.platform || campaign.channel || 'Meta',
            spend: campaign.spend,
            clicks: campaign.clicks,
            impressions: campaign.impressions,
            conversions: campaign.conversions,
            frequency: campaign.frequency,
            cpc: campaign.cpc,
            ctr: campaign.ctr,
            roas: campaign.roas || null,
            status: campaign.status,
            recommended_action:
              campaign.frequency >= 4
                ? 'Pause now, rotate creatives, and cap frequency.'
                : 'Refresh creative and narrow audience before performance drops.',
          }));

    const insightLines = actionable.length
      ? [
          `I found ${actionable.length} campaign${actionable.length === 1 ? '' : 's'} with frequency above ${threshold.toFixed(1)}${activeClientName ? ` for ${activeClientName}` : ''}.`,
          ...actionable.slice(0, 6).map((item: any) =>
            `- ${item.campaign_name}: frequency ${Number(item.frequency).toFixed(2)}, spend ${formatInr(item.spend)}, action: ${item.recommended_action}`
          ),
          threshold >= 4
            ? 'Campaigns above 4.0 frequency should be paused or aggressively refreshed now.'
            : 'Campaigns above 3.0 frequency should have creatives refreshed and audience fatigue monitored.'
        ]
      : [
          `No campaigns are above ${threshold.toFixed(1)} frequency right now.${activeClientName ? ` This is within ${activeClientName}'s current scope.` : ''}`,
          'Keep monitoring frequency after the next sync, especially if spend accelerates.'
        ];

    return {
      widget: {
        chart_type: 'table',
        title: `Campaigns with Frequency Above ${threshold.toFixed(1)}`,
        data: actionable,
        config: {
          x_axis: 'campaign_name',
          y_axis: 'frequency',
          sort: 'DESC',
        },
        sql: null,
        insight: insightLines.join('\n'),
      },
      insight: insightLines.join('\n'),
    };
  }

  // 5. Handle Summarize or Overview queries (auto AI Summary request)
  if (normalized.includes('summarize') || normalized.includes('overview')) {
    const totalSpend = campaigns.reduce((sum, c) => sum + (c.spend || 0), 0);
    const totalConversions = campaigns.reduce((sum, c) => sum + (c.conv || 0), 0);
    const totalClicks = campaigns.reduce((sum, c) => sum + (c.clicks || 0), 0);
    const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
    const avgCpl = totalConversions > 0 ? totalSpend / totalConversions : 0;

    const insightLines = [
      `Here is the Agency Overview Performance Summary based on active lead-generation campaign data${activeClientName ? ` for ${activeClientName}` : ''}:`,
      `- **Total Agency Spend**: ₹${totalSpend.toLocaleString('en-IN')}`,
      `- **Total Conversions (Leads)**: ${totalConversions.toLocaleString('en-IN')}`,
      `- **Average CPC**: ₹${avgCpc.toFixed(2)}`,
      `- **Blended Cost Per Lead (CPL)**: ₹${avgCpl.toFixed(2)}`,
      `Overall, the lead acquisition pipeline is running efficiently. Campaigns with high CTR are strong candidates for budget scaling, while any critical fatigue items should be rotated immediately.`
    ];

    return {
      widget: {
        chart_type: 'kpi_card',
        title: 'Agency Performance Summary',
        data: [
          { label: 'Total Spend', value: `₹${(totalSpend/1000).toFixed(1)}k` },
          { label: 'Total Conversions', value: totalConversions },
          { label: 'Avg CPC', value: `₹${avgCpc.toFixed(2)}` }
        ],
        config: {
          x_axis: null,
          y_axis: null,
          sort: null,
        },
        sql: null,
        insight: insightLines.join('\n'),
      },
      insight: insightLines.join('\n'),
    };
  }

  const topByFreq = campaigns
    .map((campaign: any) => ({ ...campaign, ...getCampaignMetrics(campaign) }))
    .sort((a, b) => Number(b.frequency || 0) - Number(a.frequency || 0))
    .slice(0, 5)
    .map((campaign: any) => ({
      campaign_name: campaign.name || campaign.campaignName,
      platform: campaign.platform || campaign.channel || 'Meta',
      frequency: Number(campaign.frequency || 0),
      spend: campaign.spend,
      cpc: campaign.cpc,
      ctr: campaign.ctr,
      roas: campaign.roas || null,
      recommended_action:
        campaign.frequency >= 4
          ? 'Pause now, rotate creatives, and cap frequency.'
          : campaign.frequency >= 3
            ? 'Refresh creative and narrow audience before performance drops.'
            : 'Monitor frequency; no immediate action needed.',
    }));

  return {
    widget: {
      chart_type: 'table',
      title: 'Campaign Summary',
      data: topByFreq,
      config: {
        x_axis: 'campaign_name',
        y_axis: 'frequency',
        sort: 'DESC',
      },
      sql: null,
      insight: `I could not use the backend analytics layer, so this is a local fallback summary for ${activeClientName || 'the current account'}.`,
    },
    insight: `I could not use the backend analytics layer, so this is a local fallback summary for ${activeClientName || 'the current account'}.`,
  };
}


export default function AIScreen() {
  const { scopedCampaigns: campaigns, activeClient, integrations, activeView, addPinnedWidget, scopedDashboards: dashboardsList } = useApp();

  // Chart Edit/Pin States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [activeEditWidget, setActiveEditWidget] = useState<any>(null);
  const [activeEditMsgIndex, setActiveEditMsgIndex] = useState<number | null>(null);
  const [activePinWidget, setActivePinWidget] = useState<any>(null);
  const [showHealthBrief, setShowHealthBrief] = useState(false);

  // Multi-Session Chat States
  const [sessions, setSessions] = useState<any[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  // Start Renaming Chat Session Helper
  const startRenameSession = (id: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSessionId(id);
    setEditTitle(currentTitle);
  };

  // Save Renaming Chat Session Helper
  const saveRenameSession = (id: string) => {
    if (!editTitle.trim()) {
      setEditingSessionId(null);
      return;
    }
    const updated = sessions.map(s =>
      s.id === id ? { ...s, title: editTitle.trim() } : s
    );
    setSessions(updated);
    localStorage.setItem(`marketiq.chats.${tenantId}`, JSON.stringify(updated));
    setEditingSessionId(null);
  };

  // Create a new blank session helper
  const createNewChat = () => {
    const newSession = {
      id: 'session-' + Date.now(),
      title: 'New Chat',
      messages: [
        {
          role: 'assistant',
          content: activeClient
            ? `Hello! I'm your AI analytics assistant for **${activeClient.name}**. I've reviewed your campaign performance metrics and have full insights ready.\n\nWhat would you like to explore today?`
            : `Hello! I'm your AI marketing analyst for Venpep Agency. I've compiled campaign intelligence across your client accounts and have insights ready.\n\nWhat would you like to explore today?`,
          createdAt: new Date().toISOString(),
        }
      ],
      createdAt: new Date().toISOString(),
    };
    const updated = [newSession, ...sessions];
    setSessions(updated);
    setActiveSessionId(newSession.id);
    localStorage.setItem(`marketiq.chats.${tenantId}`, JSON.stringify(updated));
  };

  // Delete specific session thread helper
  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = sessions.filter(s => s.id !== id);
    setSessions(updated);
    localStorage.setItem(`marketiq.chats.${tenantId}`, JSON.stringify(updated));
    if (activeSessionId === id) {
      if (updated.length > 0) {
        setActiveSessionId(updated[0].id);
      } else {
        setActiveSessionId(null);
      }
    }
  };

  const handleEditChart = (msg: any, index: number) => {
    setActiveEditWidget(msg.widget);
    setActiveEditMsgIndex(index);
    setIsEditModalOpen(true);
  };

  const handlePinChart = (widget: any) => {
    setActivePinWidget(widget);
    setIsPinModalOpen(true);
  };

  const handleSaveEditWidget = (updatedWidget: any) => {
    if (activeEditMsgIndex !== null) {
      setMessages(prev =>
        prev.map((msg, idx) => (idx === activeEditMsgIndex ? { ...msg, widget: updatedWidget } : msg))
      );
    }
  };
  const { CLIENTS: clients } = useApp() as any;

  const tenantId = activeClient?.id || 'agency';

  // Stats Card Calculations
  const connectedPlatforms = getConnectedPlatforms(integrations);
  const totalSpend = campaigns.reduce((sum, c) => sum + (c.spend || c.amount_spent || 0), 0);
  const totalConversions = campaigns.reduce((sum, c) => sum + (c.conversions || c.conv || 0), 0);
  const totalRevenue = campaigns.reduce((sum, c) => sum + ((c.roas || 0) * (c.spend || c.amount_spent || 0)), 0);
  const blendedRoas = totalConversions === 0 || totalSpend === 0 ? null : (totalRevenue / totalSpend);
  const alerts = getAlerts(campaigns, clients);
  // Top Stats Calculations
  const budgetAtRisk = campaigns
    .filter(c => (c.conversions || c.conv || 0) === 0)
    .reduce((sum, c) => sum + (c.spend || c.amount_spent || 0), 0);
  const scaleOpportunity = campaigns.reduce((sum, c) => {
    const spend = Number(c.spend || c.amount_spent || 0);
    const clicks = Number(c.clicks || 0);
    const impressions = Number(c.impressions || 0);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    return ctr >= 2 ? sum + spend : sum;
  }, 0);

  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // AI Brain Specific States
  const [insights, setInsights] = useState<any[]>([]);
  const [brainScores, setBrainScores] = useState<any[]>([]);
  const [isSyncingBrain, setIsSyncingBrain] = useState(false);
  const [isLoadingBrain, setIsLoadingBrain] = useState(true);

  const ruleInsights = buildRuleInsights(campaigns);
  const mergedInsights = [...ruleInsights, ...insights]
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))
    .slice(0, 8);
  const criticalInsights = mergedInsights.filter(i => i.priority === 'critical');
  const warningInsights = mergedInsights.filter(i => i.priority === 'warning');
  const scaleInsights = mergedInsights.filter(i => i.type === 'opportunity');
  const avgHealthScore = campaigns.length
    ? Math.round(campaigns.reduce((sum, c: any) => {
      const dbScore = brainScores.find(bs => bs.campaignName === c.name || bs.campaignName === c.campaignName);
      if (dbScore) return sum + Number(dbScore.score || 0);
      const { roas, ctr, frequency, cpc } = getCampaignMetrics(c);
      const fallback = Math.max(0, Math.min(100, Math.round((roas * 25) + (ctr * 15) + (cpc > 0 ? (1 / cpc) * 20 : 0) - (frequency * 10))));
      return sum + fallback;
    }, 0) / campaigns.length)
    : 0;
  const actionQueue = mergedInsights.slice(0, 5).map((insight, index) => ({
    id: insight.id || `${insight.campaignName}-${index}`,
    priority: insight.priority,
    campaignName: insight.campaignName,
    action: insight.suggestedAction,
    metric: insight.metric,
    expectedImpact: insight.expectedImpact || 'Improve campaign efficiency',
  }));

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll utility
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Fetch AI Brain Scores and Insights
  const fetchBrainData = async () => {
    setIsLoadingBrain(true);
    try {
      const [insightsData, scoresData] = await Promise.all([
        apiService.getBrainInsights(tenantId),
        apiService.getBrainScores(tenantId)
      ]);
      setInsights(insightsData || []);
      setBrainScores(scoresData || []);
    } catch (err) {
      console.error("Error fetching AI Brain data:", err);
    } finally {
      setIsLoadingBrain(false);
    }
  };

  useEffect(() => {
    if (activeView === 'ai') {
      fetchBrainData();
    }
  }, [tenantId, activeView]);

  // Run or Trigger AI Brain Analysis manually
  const handleSyncBrain = async () => {
    setIsSyncingBrain(true);
    try {
      await apiService.triggerBrainSync(tenantId);
      await fetchBrainData();
      toast.success('AI Brain Sync Completed', {
        description: 'Performance health scores and strategist insights have been dynamically updated.',
        duration: 4000,
      });
    } catch (err) {
      console.error("Failed to sync AI Brain:", err);
      toast.error('Sync Execution Failed', {
        description: 'An unexpected error occurred during AI Brain synchronization. Please try again.',
        duration: 5000,
      });
    } finally {
      setIsSyncingBrain(false);
    }
  };

  // Load chat sessions on mount or client change
  useEffect(() => {
    const loadHistory = async () => {
      setIsLoadingHistory(true);
      try {
        const saved = localStorage.getItem(`marketiq.chats.${tenantId}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.length > 0) {
            setSessions(parsed);
            setActiveSessionId(parsed[0].id);
            setMessages(parsed[0].messages);
            setIsLoadingHistory(false);
            return;
          }
        }

        const history = await apiService.getChatHistory(tenantId);
        if (history && history.length > 0) {
          const initialSession = {
            id: 'session-db',
            title: 'Agency Performance Brief',
            messages: history,
            createdAt: new Date().toISOString(),
          };
          setSessions([initialSession]);
          setActiveSessionId(initialSession.id);
          setMessages(history);
          localStorage.setItem(`marketiq.chats.${tenantId}`, JSON.stringify([initialSession]));
        } else {
          // Initialize with a friendly welcome message if no history exists
          const defaultSession = {
            id: 'session-default',
            title: 'New Chat',
            messages: [
              {
                role: 'assistant',
                content: activeClient
                  ? `Hello! I'm your AI analytics assistant for **${activeClient.name}**. I've reviewed your campaign performance metrics and have full insights ready.\n\nWhat would you like to explore today?`
                  : `Hello! I'm your AI marketing analyst for Venpep Agency. I've compiled campaign intelligence across your client accounts and have insights ready.\n\nWhat would you like to explore today?`,
                createdAt: new Date().toISOString(),
              }
            ],
            createdAt: new Date().toISOString(),
          };
          setSessions([defaultSession]);
          setActiveSessionId(defaultSession.id);
          setMessages(defaultSession.messages);
          localStorage.setItem(`marketiq.chats.${tenantId}`, JSON.stringify([defaultSession]));
        }
      } catch (err) {
        console.error('Failed to load chat history:', err);
        const errorSession = {
          id: 'session-error',
          title: 'Offline Chat',
          messages: [
            {
              role: 'assistant',
              content: `Hello. I can still help with campaign analysis, but chat history could not be loaded. Ask for budget waste, scale opportunities, fatigue, CPC issues, or ROAS trends.`,
              createdAt: new Date().toISOString(),
            }
          ],
          createdAt: new Date().toISOString(),
        };
        setSessions([errorSession]);
        setActiveSessionId(errorSession.id);
        setMessages(errorSession.messages);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadHistory();
  }, [tenantId, activeClient]);

  // Sync messages back to active session and persist in localStorage
  useEffect(() => {
    if (activeSessionId && messages.length > 0 && sessions.length > 0) {
      const activeIdx = sessions.findIndex(s => s.id === activeSessionId);
      if (activeIdx !== -1) {
        const session = sessions[activeIdx];
        
        // Auto-naming: rename if title is default 'New Chat' and there are user messages
        let nextTitle = session.title;
        if (session.title === 'New Chat' || session.title === 'Untitled Chat') {
          const firstUser = messages.find(m => m.role === 'user');
          if (firstUser) {
            const words = firstUser.content.split(' ').slice(0, 5).join(' ');
            nextTitle = words.length > 28 ? words.slice(0, 26) + '...' : words;
          }
        }

        const updatedSessions = sessions.map((s, idx) => 
          idx === activeIdx ? { ...s, title: nextTitle, messages } : s
        );

        if (JSON.stringify(sessions) !== JSON.stringify(updatedSessions)) {
          setSessions(updatedSessions);
          localStorage.setItem(`marketiq.chats.${tenantId}`, JSON.stringify(updatedSessions));
        }
      }
    }
  }, [messages, activeSessionId, sessions, tenantId]);

  // Prevent completely empty sessions state
  useEffect(() => {
    if (!isLoadingHistory && sessions.length === 0) {
      const defaultSession = {
        id: 'session-default-' + Date.now(),
        title: 'New Chat',
        messages: [
          {
            role: 'assistant',
            content: activeClient
              ? `Hello! I'm your AI analytics assistant for **${activeClient.name}**. I've reviewed your campaign performance metrics and have full insights ready.\n\nWhat would you like to explore today?`
              : `Hello! I'm your AI marketing analyst for Venpep Agency. I've compiled campaign intelligence across your client accounts and have insights ready.\n\nWhat would you like to explore today?`,
            createdAt: new Date().toISOString(),
          }
        ],
        createdAt: new Date().toISOString(),
      };
      setSessions([defaultSession]);
      setActiveSessionId(defaultSession.id);
      setMessages(defaultSession.messages);
      localStorage.setItem(`marketiq.chats.${tenantId}`, JSON.stringify([defaultSession]));
    }
  }, [sessions, isLoadingHistory, tenantId, activeClient]);

  // Load messages when active session changes
  useEffect(() => {
    if (activeSessionId && sessions.length > 0) {
      const active = sessions.find(s => s.id === activeSessionId);
      if (active) {
        setMessages(active.messages);
      }
    }
  }, [activeSessionId]);

  useEffect(() => {
    if (!isLoadingHistory && activeView === 'ai' && (window as any).shouldTriggerSummary) {
      (window as any).shouldTriggerSummary = false;
      handleSend("Summarize the Agency Overview performance metrics");
    }
  }, [isLoadingHistory, activeView]);

  // Submit Prompt Handler
  const handleSend = async (text?: string) => {
    const promptText = text || input;
    if (!promptText.trim()) return;

    // Append user message immediately
    const userMsg = {
      role: 'user',
      content: promptText,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      // Gather full conversation history
      const cleanHistory = messages.map(({ role, content }) => ({ role, content }));

      // API Request to get visual widget and insight
      const response = await apiService.chat(promptText, tenantId, cleanHistory, {
        campaigns,
        clients,
        integrations,
      });

      setIsTyping(false);
      
      const assistantMsg = {
        role: 'assistant',
        content: response.insight || 'Here is the requested data:',
        widget: response.widget,
        createdAt: new Date().toISOString(),
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (error: any) {
      console.error('Chat submit failed:', error);
      const fallback = buildLocalFallbackResponse(promptText, campaigns, activeClient?.name);
      setIsTyping(false);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: fallback.insight,
        widget: fallback.widget,
        createdAt: new Date().toISOString(),
      }]);
      
      const isNetworkError = !error?.message?.includes('API request failed');
      
      if (isNetworkError) {
        toast.warning('Offline Fallback Mode', {
          description: 'The backend analytics server is currently unavailable. Displaying high-precision local campaign intelligence fallback.',
          duration: 6000,
        });
      } else {
        toast.info('Local Intelligence Optimizer', {
          description: 'This query was processed using our local campaign rule engine for precision marketing insights.',
          duration: 5000,
        });
      }
    }
  };

  // Clear Chat History Handler
  const handleClearHistory = async () => {
    if (!window.confirm('Are you sure you want to clear all conversation threads?')) return;
    
    try {
      await apiService.clearChatHistory(tenantId);
      localStorage.removeItem(`marketiq.chats.${tenantId}`);
      setSessions([]);
      setActiveSessionId(null);
      toast.success('All conversation threads cleared');
    } catch (err) {
      console.error('Failed to clear chat history:', err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (activeView === 'ai') {
    return (
      <PageWrapper>
        <div className="flex-1 overflow-y-auto px-1 flex flex-col font-sans max-w-7xl mx-auto w-full space-y-6 pb-8 select-none">
          
          {/* Header Block */}
          <div className="flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-gradient-primary text-white shadow-glow">
                <Cpu className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">AI Analysis Strategy</h1>
                  {activeClient && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-400">
                      <span className="size-1.5 rounded-full bg-indigo-500" /> {activeClient.name}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Deep performance insights, health scoring, and autonomous recommendations</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSyncBrain}
                disabled={isSyncingBrain}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-primary text-white hover:shadow-glow transition-all disabled:opacity-50 disabled:cursor-not-allowed border-0 cursor-pointer"
              >
                <RefreshCw className={`size-3.5 ${isSyncingBrain ? 'animate-spin' : ''}`} />
                {isSyncingBrain ? 'Running Strategy Analysis...' : 'Re-run AI Analysis'}
              </button>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-400 select-none">
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" /> Strategic Mode
              </span>
            </div>
          </div>

          {/* Top Stats Strip */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col">
            <div className="text-xs font-extrabold uppercase text-muted-foreground">Budget at risk</div>
            <div className="mt-1 font-display text-lg font-bold text-foreground">{formatInr(budgetAtRisk)}</div>
            <div className="text-[10px] text-muted-foreground">Zero‑conversion spend</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col">
            <div className="text-xs font-extrabold uppercase text-muted-foreground">Critical fixes</div>
            <div className="mt-1 font-display text-lg font-bold text-rose-600">{criticalInsights.length}</div>
            <div className="text-[10px] text-muted-foreground">Pause or audit now</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col">
            <div className="text-xs font-extrabold uppercase text-muted-foreground">Scale opportunity</div>
            <div className="mt-1 font-display text-lg font-bold text-foreground">{formatInr(scaleOpportunity)}</div>
            <div className="text-[10px] text-muted-foreground">High‑CTR spend</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col">
            <div className="text-xs font-extrabold uppercase text-muted-foreground">Avg health</div>
            <div className="mt-1 font-display text-lg font-bold text-foreground">{avgHealthScore}/100</div>
            <div className="text-[10px] text-muted-foreground">Portfolio score</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col">
            <div className="text-xs font-extrabold uppercase text-muted-foreground">Action queue</div>
            <div className="mt-1 font-display text-lg font-bold text-foreground">{actionQueue.length}</div>
            <div className="text-[10px] text-muted-foreground">{warningInsights.length} watch items</div>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card shadow-sm p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base font-bold text-foreground">Recommended Action Queue</h2>
              <p className="text-xs text-muted-foreground">Prioritized next actions for the performance marketer to review today</p>
            </div>
            <span className="text-[10px] uppercase font-extrabold tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
              Rule-backed + AI
            </span>
          </div>
          {actionQueue.length === 0 ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">
              No urgent actions in the current campaign set. Keep monitoring CPC, frequency, ROAS, and zero-conversion spend after the next sync.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
              {actionQueue.map(item => (
                <div key={item.id} className="rounded-xl border border-border bg-muted/10 p-3">
                  <div className={`mb-2 inline-flex rounded-full border px-2 py-0.5 text-[9px] font-extrabold uppercase ${
                    item.priority === 'critical'
                      ? 'border-rose-200 bg-rose-50 text-rose-700'
                      : item.priority === 'warning'
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  }`}>
                    {item.priority}
                  </div>
                  <p className="text-xs font-bold text-foreground line-clamp-2" title={item.campaignName}>{item.campaignName}</p>
                  <p className="mt-2 text-xs text-slate-600 leading-relaxed">{item.action}</p>
                  <p className="mt-2 text-[10px] font-semibold text-muted-foreground">{item.metric} - {item.expectedImpact}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Campaign Health Section */}
          <div className="rounded-2xl border border-border bg-card shadow-sm p-6">
            <div className="flex items-center justify-between mb-4 border-b border-border/60 pb-3">
              <div>
                <h2 className="text-base font-bold text-foreground">Campaign Portfolio Health</h2>
                <p className="text-xs text-muted-foreground">Live health index calculated using Indian campaign benchmarks (ROAS, CTR, frequency, and CPC)</p>
              </div>
              <span className="text-[10px] uppercase font-extrabold tracking-wider text-indigo-500 bg-indigo-500/10 px-2 py-0.5 rounded">
                Weighted scoring
              </span>
            </div>

            {isLoadingBrain ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2">
                <RefreshCw className="size-6 text-indigo-500 animate-spin" />
                <span className="text-xs font-semibold text-muted-foreground">Calculating portfolio scores...</span>
              </div>
            ) : campaigns.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground font-semibold">
                No live campaigns found. Please connect your Meta Ads integration.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                      <th className="py-3 px-2">Campaign Name</th>
                      <th className="py-3 px-2 text-center w-28">Health Score</th>
                      <th className="py-3 px-2 text-center w-24">Trend</th>
                      <th className="py-3 px-2 w-44">Top Issue Badge</th>
                      <th className="py-3 px-2">AI Recommendation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {campaigns.map((c: any) => {
                      const dbScore = brainScores.find(bs => bs.campaignName === c.name || bs.campaignName === c.campaignName);
                      
                      const spend = Number(c.spend || c.amount_spent || 0);
                      const clicks = Number(c.clicks || 0);
                      const impressions = Number(c.impressions || 0);
                      const conversions = Number(c.conversions || c.conv || 0);
                      const frequency = Number(c.frequency || 0);
                      const cpc = clicks > 0 ? spend / clicks : 0;
                      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
                      const roas = spend > 0 ? (c.actionValue || (c.roas ? c.roas * spend : 0)) / spend : 0;

                      const cpcTerm = cpc > 0 ? (1 / cpc) * 20 : 0;
                      const rawScore = (roas * 25) + (ctr * 15) + cpcTerm - (frequency * 10);
                      const fallbackScore = Math.max(0, Math.min(100, Math.round(rawScore)));
                      
                      const score = dbScore ? dbScore.score : fallbackScore;
                      const trend = dbScore ? dbScore.trend : 'stable';
                      
                      const healthInfo = getCampaignHealthMetrics(c, score);

                      
                      const radius = 14;
                      const strokeWidth = 3.5;
                      const circumference = 2 * Math.PI * radius;
                      const strokeDashoffset = circumference - (score / 100) * circumference;
                      
                      let strokeColorClass = 'text-emerald-500';
                      if (score < 40) strokeColorClass = 'text-rose-500';
                      else if (score < 70) strokeColorClass = 'text-amber-500';

                      return (
                        <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                          <td className="py-3.5 px-2">
                            <div className="font-bold text-[13px] leading-[1.3] text-foreground break-words" title={c.name}>
                              {c.name}
                            </div>
                            <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                              <span className="px-1.5 py-0.2 bg-secondary rounded font-medium">{c.platform || 'Meta'}</span>
                              <span>Spend: {formatInr(spend)}</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-2">
                            <div className="flex justify-center">
                              <div className="relative flex items-center justify-center w-10 h-10 select-none">
                                <svg className="w-full h-full transform -rotate-90">
                                  <circle
                                    cx="20"
                                    cy="20"
                                    r={radius}
                                    className="text-slate-100 dark:text-slate-800"
                                    strokeWidth={strokeWidth}
                                    stroke="currentColor"
                                    fill="transparent"
                                  />
                                  <circle
                                    cx="20"
                                    cy="20"
                                    r={radius}
                                    className={strokeColorClass}
                                    strokeWidth={strokeWidth}
                                    strokeDasharray={circumference}
                                    strokeDashoffset={strokeDashoffset}
                                    strokeLinecap="round"
                                    stroke="currentColor"
                                    fill="transparent"
                                  />
                                </svg>
                                <span className="absolute text-[10px] font-extrabold text-foreground">
                                  {score}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-2">
                            <div className="flex justify-center">
                              {trend === 'up' && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                  <TrendingUp className="size-3" /> ▲
                                </span>
                              )}
                              {trend === 'down' && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded">
                                  <TrendingDown className="size-3" /> ▼
                                </span>
                              )}
                              {trend === 'stable' && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-slate-500 bg-slate-500/10 px-1.5 py-0.5 rounded">
                                  <span>■</span> Stable
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-2">
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide ${healthInfo.badgeColor}`}>
                              {healthInfo.topIssue}
                            </span>
                          </td>
                          <td className="py-3.5 px-2">
                            <p className="text-xs text-foreground/90 font-medium leading-relaxed">
                              {healthInfo.recommendation}
                            </p>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* AI Strategist Insights section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-foreground">Specific AI Recommendations & Anomaly Detections</h2>
                <p className="text-xs text-muted-foreground">Granular campaign opportunities generated by the marketing strategist brain</p>
              </div>
              <span className="text-xs font-semibold text-muted-foreground">{mergedInsights.length} prioritized insights</span>
            </div>

            {isLoadingBrain ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-44 rounded-2xl border border-border bg-card p-5 animate-pulse space-y-3">
                    <div className="h-4 bg-muted rounded w-2/3" />
                    <div className="h-10 bg-muted rounded w-full" />
                    <div className="h-8 bg-muted rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : mergedInsights.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card p-12 text-center">
                <Lightbulb className="size-8 mx-auto text-indigo-400 mb-2 animate-bounce" />
                <h3 className="font-bold text-foreground text-sm">No active risks detected</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">No rule-based issues were found in the current campaign set. Re-run AI analysis after the next data sync to refresh strategist insights.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {mergedInsights.map((insight) => {
                  let borderClass = '';
                  let bgGradient = '';
                  let icon = null;
                  let badgeClass = '';
                  if (insight.priority === 'critical') {
                    borderClass = 'border-l-rose-500';
                    bgGradient = 'from-rose-500/5 to-transparent';
                    icon = <ShieldAlert className="size-4 text-rose-500" />;
                    badgeClass = 'bg-rose-500/10 border-rose-500/20 text-rose-500';
                  } else if (insight.priority === 'warning') {
                    borderClass = 'border-l-amber-500';
                    bgGradient = 'from-amber-500/5 to-transparent';
                    icon = <AlertTriangle className="size-4 text-amber-500" />;
                    badgeClass = 'bg-amber-500/10 border-amber-500/20 text-amber-500';
                  } else if (insight.type === 'opportunity') {
                    borderClass = 'border-l-emerald-500';
                    bgGradient = 'from-emerald-500/5 to-transparent';
                    icon = <Zap className="size-4 text-emerald-500" />;
                    badgeClass = 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500';
                  }

                  return (
                    <div
                      key={insight.id}
                      className={`rounded-2xl border border-border border-l-4 ${borderClass} bg-card bg-gradient-to-br ${bgGradient} p-5 shadow-sm hover:shadow-card transition-all flex flex-col justify-between space-y-4`}
                    >
                      <div>
                        {/* Title Header */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <div className="p-1 rounded-lg bg-card border border-border shadow-sm shrink-0">
                              {icon}
                            </div>
                            <h3 className="text-[13px] font-bold text-foreground leading-[1.3] break-words whitespace-normal">
                              {insight.title}
                            </h3>
                          </div>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-extrabold uppercase tracking-wide shrink-0 ${badgeClass}`}>
                            {insight.priority}
                          </span>
                        </div>

                        {/* Campaign tag */}
                        <div className="text-[10px] font-bold text-muted-foreground mt-2 inline-block px-2 py-0.5 rounded bg-secondary">
                          Campaign: {insight.campaignName}
                        </div>

                        <div className="mt-3 grid grid-cols-3 gap-2">
                          <div className="rounded-lg border border-border bg-white/50 p-2">
                            <div className="text-[9px] font-extrabold uppercase text-muted-foreground">Metric</div>
                            <div className="text-xs font-bold text-foreground truncate">{insight.metric || 'performance'}</div>
                          </div>
                          <div className="rounded-lg border border-border bg-white/50 p-2">
                            <div className="text-[9px] font-extrabold uppercase text-muted-foreground">Current</div>
                            <div className="text-xs font-bold text-foreground">{typeof insight.currentValue === 'number' ? insight.currentValue.toFixed(2) : insight.currentValue || '-'}</div>
                          </div>
                          <div className="rounded-lg border border-border bg-white/50 p-2">
                            <div className="text-[9px] font-extrabold uppercase text-muted-foreground">Benchmark</div>
                            <div className="text-xs font-bold text-foreground">{typeof insight.threshold === 'number' ? insight.threshold.toFixed(2) : insight.threshold || '-'}</div>
                          </div>
                        </div>

                        {/* Body Description */}
                        <p className="text-xs text-foreground/80 leading-relaxed font-medium mt-3">
                          {insight.body}
                        </p>
                      </div>

                      {/* Footer suggested action callout */}
                      <div className="pt-3 border-t border-border/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                          <div className="text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground">Suggested Action</div>
                          <p className="text-xs font-bold text-indigo-500 dark:text-indigo-400 mt-0.5">
                            {insight.suggestedAction}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 select-none">
                          <span className="text-[10px] font-extrabold text-muted-foreground">Confidence: {Math.round(insight.confidence * 100)}%</span>
                          <div className="w-12 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden border border-border">
                            <div
                              className="h-full bg-gradient-primary rounded-full"
                              style={{ width: `${insight.confidence * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <div className="h-[calc(100vh-6.5rem)] flex font-sans max-w-7xl mx-auto w-full select-none border border-slate-200 bg-white rounded-3xl shadow-sm overflow-hidden" style={{
        background: 'radial-gradient(100% 100% at 50% 0%, rgba(99, 102, 241, 0.01) 0%, rgba(255, 255, 255, 0) 100%)'
      }}>
        
        {/* Chat History Left Sidebar (like Claude/ChatGPT/Gemini) */}
        <div className="w-64 bg-slate-50/70 border-r border-slate-200/80 flex flex-col h-full flex-shrink-0 hidden md:flex overflow-hidden">
          {/* New Chat Button */}
          <div className="p-3.5 border-b border-slate-200/60 flex-shrink-0">
            <button
              onClick={createNewChat}
              className="w-full flex items-center justify-center gap-2 h-10 px-4 bg-white border border-slate-200 hover:border-indigo-500/35 hover:text-indigo-650 rounded-xl text-xs font-bold text-slate-700 shadow-sm transition-all hover:scale-[1.01] hover:-translate-y-0.5 cursor-pointer"
            >
              <Plus className="size-4 text-indigo-500" />
              New chat
            </button>
          </div>

          {/* Recent sessions scroll area */}
          <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
            <div className="space-y-1">
              <div className="px-3 mb-2 text-[9px] font-extrabold uppercase tracking-widest text-slate-400">
                Recent Chats
              </div>
              {sessions.map(s => {
                const isActive = s.id === activeSessionId;
                const isEditing = s.id === editingSessionId;
                return (
                  <div
                    key={s.id}
                    onClick={() => {
                      if (!isEditing) {
                        setActiveSessionId(s.id);
                      }
                    }}
                    className={`group flex items-center justify-between px-3 py-2.5 rounded-xl text-[11px] cursor-pointer transition-all ${
                      isActive 
                        ? 'bg-indigo-50/70 text-indigo-700 font-bold border-l-2 border-indigo-500' 
                        : 'text-slate-650 hover:bg-slate-200/40 hover:text-slate-800'
                    }`}
                  >
                    {isEditing ? (
                      <div className="flex items-center gap-1.5 flex-1 min-w-0" onClick={e => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editTitle}
                          onChange={e => setEditTitle(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              saveRenameSession(s.id);
                            } else if (e.key === 'Escape') {
                              setEditingSessionId(null);
                            }
                          }}
                          onBlur={() => saveRenameSession(s.id)}
                          autoFocus
                          className="flex-1 px-2 py-0.5 bg-white border border-indigo-300 rounded text-[11px] text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-normal"
                        />
                        <button
                          onClick={() => saveRenameSession(s.id)}
                          className="p-1 text-emerald-600 hover:bg-emerald-50 rounded border-0 bg-transparent shrink-0 cursor-pointer"
                        >
                          <Check className="size-3" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <Sparkles className={`size-3.5 shrink-0 ${isActive ? 'text-indigo-500' : 'text-slate-400'}`} />
                          <span className="truncate pr-1">{s.title}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-all">
                          <button
                            onClick={(e) => startRenameSession(s.id, s.title, e)}
                            title="Rename chat thread"
                            className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 border-0 bg-transparent cursor-pointer"
                          >
                            <Edit className="size-3" />
                          </button>
                          <button
                            onClick={(e) => deleteSession(s.id, e)}
                            title="Delete chat thread"
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 border-0 bg-transparent cursor-pointer"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Canvas: Conversational area */}
        <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden bg-white/30 backdrop-blur-md">
          
          {/* Title Header Block - Styled like Claude/Gemini bar */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 flex-shrink-0 px-4 sm:px-6 pt-4">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-tr from-violet-600 via-indigo-650 to-pink-500 text-white shadow-glow relative select-none">
                <div className="absolute inset-0 bg-indigo-500/20 blur-md rounded-xl animate-pulse" />
                <Sparkles className="size-5 relative z-10" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-display text-lg sm:text-xl font-bold tracking-tight text-slate-800">AI Brain</h1>
                  {activeClient && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 text-[10px] font-extrabold text-indigo-600">
                      <span className="size-1.5 rounded-full bg-indigo-500 animate-pulse" /> {activeClient.name}
                    </span>
                  )}
                </div>
                <p className="text-[10px] sm:text-xs text-slate-400 font-semibold leading-relaxed">Ask analyst questions and generate dynamic data visualizations</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-100 px-3 py-1 text-[10px] sm:text-xs font-bold text-emerald-600 select-none shadow-sm">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" /> Live Data Layer
            </span>
          </div>

          {/* Sleek collapsable Workspace health panel */}
          <div className="flex-shrink-0 px-4 sm:px-6 mb-3">
            <div className="max-w-4xl mx-auto w-full">
              <div className={`border rounded-2xl transition-all duration-300 shadow-sm overflow-hidden bg-white/70 backdrop-blur-md ${
                showHealthBrief 
                  ? 'border-slate-200 p-4 bg-slate-50/20' 
                  : 'border-slate-150/70 py-2.5 px-4 flex items-center justify-between hover:border-indigo-500/30'
              }`}>
                {!showHealthBrief ? (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="size-6 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                        <Cpu className="size-3.5" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-700">Workspace Health & Briefs</span>
                        <span className="ml-2 text-[10px] text-slate-400 font-semibold hidden sm:inline">CPC benchmarks, budget waste, scale opportunities</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => setShowHealthBrief(true)}
                      className="flex items-center gap-1 text-[11px] font-extrabold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100/80 px-2.5 py-1.5 rounded-xl border-0 cursor-pointer transition-colors"
                    >
                      Show Briefs <ChevronDown className="size-3.5" />
                    </button>
                  </>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-200/60 pb-2.5">
                      <div className="flex items-center gap-2">
                        <Cpu className="size-4.5 text-indigo-600" />
                        <h3 className="text-xs font-bold text-slate-800">Workspace Performance Briefs</h3>
                      </div>
                      <button 
                        onClick={() => setShowHealthBrief(false)}
                        className="flex items-center gap-1 text-[11px] font-extrabold text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-xl border-0 cursor-pointer transition-colors"
                      >
                        Hide Briefs <ChevronDown className="size-3.5 rotate-180" />
                      </button>
                    </div>

                    {/* Stat Bento cards with custom styling */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {[
                        { label: "Decision scope", val: String(campaigns.length), subtitle: activeClient ? `${activeClient.name} campaigns` : 'Agency-wide campaigns' },
                        { label: "Budget risk", val: formatInr(budgetAtRisk), subtitle: 'Zero-conversion spend to audit' },
                        { label: "Scale pool", val: formatInr(scaleOpportunity), subtitle: `${scaleInsights.length} campaigns showing scale signals` },
                      ].map((k, i) => (
                        <div key={i} className="rounded-xl border border-slate-250 bg-white p-3.5 shadow-sm flex flex-col justify-between hover:border-indigo-500/25 transition-all">
                          <div className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400">{k.label}</div>
                          <div className="mt-1 font-display text-lg font-extrabold text-slate-800">{k.val}</div>
                          <div className="mt-0.5 text-[9px] text-slate-400 truncate">{k.subtitle}</div>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                        <div className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400">Analyst brief</div>
                        <p className="mt-1 text-[11px] font-semibold text-slate-600 leading-relaxed">
                          Ask for decisions, not just charts: pause list, scale list, budget waste, fatigue, CPC outliers, ROAS ranking, and month-over-month movement.
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                        <div className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400">Benchmarks used</div>
                        <p className="mt-1 text-[11px] font-semibold text-slate-600 leading-relaxed">
                          CPC above {formatInr(BENCHMARKS.cpcCritical)}, frequency above {BENCHMARKS.frequencyWarning.toFixed(1)}, ROAS below {BENCHMARKS.roasWeak.toFixed(1)}x, and zero conversions after {formatInr(BENCHMARKS.wasteSpend)} are treated as action signals.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Messages Body */}
          <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-2 space-y-6">
            <div className="max-w-4xl mx-auto w-full space-y-6">
              <AnimatePresence initial={false}>
                {isLoadingHistory ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <RefreshCw className="size-6 text-indigo-500 animate-spin" />
                    <span className="text-xs font-semibold text-slate-400">Loading analysis workspace...</span>
                  </div>
                ) : (
                  messages.map((msg, i) => {
                    const isUser = msg.role === 'user';
                    return (
                      <motion.div
                        key={msg.id || i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className={`flex gap-4 ${isUser ? 'flex-row-reverse' : ''}`}
                      >
                        {/* Avatar */}
                        <div className={`size-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm font-bold text-xs ${
                          isUser 
                            ? 'bg-slate-100 border border-slate-200 text-slate-700' 
                            : 'bg-gradient-to-tr from-violet-600 via-indigo-650 to-pink-500 text-white shadow-glow relative'
                        }`}>
                          {!isUser && <div className="absolute inset-0 bg-indigo-500/10 blur-sm rounded-xl animate-pulse" />}
                          {isUser ? 'PM' : <Sparkles className="size-4 relative z-10" />}
                        </div>

                        {/* Content Bubble */}
                        <div className={`flex flex-col gap-1.5 max-w-[80%] ${isUser ? 'items-end' : 'items-start'}`}>
                          <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                            isUser 
                              ? 'bg-slate-100 text-slate-800 border border-slate-200/60 rounded-tr-none shadow-sm text-justify font-medium' 
                              : 'text-slate-850 font-normal leading-relaxed text-justify pr-2 whitespace-pre-line'
                          }`}>
                            <p className="break-words">
                              {isUser ? (
                                msg.content
                              ) : (
                                msg.content.split('**').map((part: string, idx: number) => 
                                  idx % 2 === 0 ? part : <strong key={idx} className="font-extrabold bg-gradient-to-r from-violet-600 to-indigo-650 bg-clip-text text-transparent">{part}</strong>
                                )
                              )}
                            </p>
                          </div>

                          {/* If Assistant contains widget data, render it */}
                          {!isUser && msg.widget && (
                            <div className="w-full mt-2 min-w-[320px] max-w-full rounded-2xl border border-slate-150 bg-slate-50/40 p-4 shadow-sm space-y-3 animate-fade-in">
                              <WidgetRenderer widget={msg.widget} />
                              
                              {/* Actions bar for the chart */}
                              <div className="flex items-center gap-2 pt-2 border-t border-slate-200/50 justify-end select-none">
                                <button
                                  onClick={() => handleEditChart(msg, i)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-slate-600 bg-white border border-slate-200 hover:border-indigo-500/35 hover:text-indigo-600 rounded-xl hover:shadow-sm transition-all cursor-pointer"
                                >
                                  <Settings className="size-3 text-slate-500" />
                                  Edit Chart
                                </button>
                                <button
                                  onClick={() => handlePinChart(msg.widget)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-slate-600 bg-white border border-slate-200 hover:border-indigo-500/35 hover:text-indigo-600 rounded-xl hover:shadow-sm transition-all cursor-pointer"
                                >
                                  <Pin className="size-3 text-slate-500" />
                                  Pin to Dashboard
                                </button>
                              </div>
                            </div>
                          )}
                          
                          <span className="text-[9px] text-slate-400 font-medium select-none ml-1">
                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </AnimatePresence>

              {/* Sparkling Welcome Hero Hub if no messages */}
              {messages.length <= 1 && !isTyping && (
                <div className="flex-1 flex flex-col items-center justify-center py-8 px-4 max-w-2xl mx-auto text-center space-y-8 animate-fade-in select-none">
                  {/* Sparkling Logo Container */}
                  <div className="relative">
                    <div className="absolute inset-0 bg-indigo-500/20 blur-xl rounded-full animate-pulse" />
                    <div className="relative size-14 rounded-2xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-pink-500 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20">
                      <Sparkles className="size-7" />
                    </div>
                  </div>

                  {/* Hero Heading */}
                  <div className="space-y-3">
                    <h2 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-violet-600 via-indigo-600 to-pink-500 bg-clip-text text-transparent py-1">
                      {activeClient 
                        ? `Optimize ${activeClient.name}'s Portfolio` 
                        : "Command your campaign metrics."}
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-500 font-medium max-w-md leading-relaxed">
                      I can help pause underperforming channels, scale high-converting ad sets, detect critical frequency fatigue, and generate visual SQL charts instantly.
                    </p>
                  </div>

                  {/* Symmetrical starter cards */}
                  <div className="w-full space-y-3">
                    <div className="text-[9px] uppercase tracking-widest font-extrabold text-slate-400 text-left px-1">
                      Recommended starting actions
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {QUICK_CHIPS.map((chip, idx) => {
                        let icon = <Sparkles className="size-3.5 text-indigo-500" />;
                        if (idx === 0) icon = <Pause className="size-3.5 text-rose-500" />;
                        if (idx === 1) icon = <Trash2 className="size-3.5 text-rose-500" />;
                        if (idx === 2) icon = <TrendingUp className="size-3.5 text-emerald-500" />;
                        if (idx === 3) icon = <Zap className="size-3.5 text-amber-500" />;
                        if (idx === 4) icon = <AlertTriangle className="size-3.5 text-rose-500" />;
                        if (idx === 5) icon = <Cpu className="size-3.5 text-violet-500" />;

                        return (
                          <button
                            key={idx}
                            onClick={() => handleSend(chip)}
                            className="group flex items-start gap-3 p-4 bg-white/70 hover:bg-white border border-slate-200/60 hover:border-indigo-500/35 rounded-2xl text-left shadow-sm hover:shadow-md hover:scale-[1.01] hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
                          >
                            <div className="p-2 rounded-xl bg-slate-50 group-hover:bg-indigo-50/50 border border-slate-100 group-hover:border-indigo-100 flex-shrink-0 transition-colors">
                              {icon}
                            </div>
                            <div className="space-y-0.5 min-w-0">
                              <p className="text-xs font-bold text-slate-700 group-hover:text-indigo-650 leading-snug line-clamp-2">
                                {chip}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Bouncing Typing Indicator */}
              {isTyping && (
                <div className="flex gap-4 animate-fade-in select-none">
                  <div className="size-8 rounded-xl bg-gradient-to-tr from-violet-600 to-pink-500 flex items-center justify-center shrink-0 shadow-glow relative">
                    <div className="absolute inset-0 bg-indigo-500/10 blur-sm rounded-xl animate-pulse" />
                    <Sparkles className="size-4 relative z-10 text-white" />
                  </div>
                  <div className="bg-slate-50 border border-slate-150 rounded-2xl rounded-tl-none px-4 py-2.5 flex items-center gap-1.5 shadow-sm">
                    {[0, 0.15, 0.3].map((delay, index) => (
                      <motion.span
                        key={index}
                        variants={{
                          initial: { y: 0 },
                          animate: { y: -5 }
                        }}
                        initial="initial"
                        animate="animate"
                        transition={{
                          duration: 0.4,
                          repeat: Infinity,
                          repeatType: 'reverse',
                          ease: 'easeInOut',
                          delay
                        }}
                        className="size-1.5 bg-indigo-500 rounded-full"
                      />
                    ))}
                    <span className="text-[10px] text-indigo-600 font-extrabold uppercase tracking-widest ml-1">Generating SQL & Visual Chart...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Sticky bottom input floating capsule container */}
          <div className="border-t border-slate-100/40 p-4 bg-gradient-to-t from-white via-white/95 to-transparent flex-shrink-0 sticky bottom-0 z-20">
            <div className="max-w-3xl w-full mx-auto">
              
              {/* Quick chips if conversation is starting (shows above input pill only on sm devices) */}
              {messages.length > 1 && messages.length <= 3 && !isTyping && (
                <div className="mb-3.5 select-none hidden sm:block">
                  <div className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400 mb-2 px-1">Quick analysis followups</div>
                  <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                    {QUICK_CHIPS.slice(0, 4).map((chip, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSend(chip)}
                        className="text-[11px] px-3.5 py-1.5 border border-slate-200 bg-white hover:border-indigo-500/30 rounded-full hover:shadow-sm cursor-pointer transition-all text-slate-650 hover:text-indigo-600 font-semibold"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Modern elevated capsule input box */}
              <div className="flex items-end gap-3 bg-white border border-slate-200 rounded-2xl p-2.5 shadow-md focus-within:shadow-lg focus-within:border-indigo-500/60 focus-within:ring-4 focus-within:ring-indigo-500/5 transition-all">
                <button
                  onClick={handleClearHistory}
                  title="Clear Conversation History"
                  className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl cursor-pointer transition-all flex-shrink-0 border border-transparent"
                >
                  <Trash2 className="size-4.5" />
                </button>
                
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={activeClient ? `Ask me about ${activeClient.name}'s data (e.g. CPC outliers, fatigue, zero conversions)...` : "Ask me anything about client campaign databases..."}
                  rows={1}
                  className="flex-1 max-h-24 min-h-[2.25rem] bg-transparent border-0 focus:ring-0 focus:outline-none text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 py-2.5 px-1 resize-none font-sans leading-relaxed"
                />

                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim()}
                  className="size-9 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-650 text-white flex items-center justify-center hover:shadow-glow disabled:opacity-40 disabled:hover:shadow-none disabled:cursor-not-allowed cursor-pointer transition-all border-0 shrink-0 hover:scale-105 active:scale-95"
                >
                  <Send className="size-4" />
                </button>
              </div>
              
              <div className="text-[9px] text-slate-400 mt-2 text-center select-none font-medium">
                Press <kbd className="font-mono bg-slate-100 border border-slate-200 px-1 py-0.5 rounded text-[8px] font-bold">Ctrl + Enter</kbd> to submit query
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Edit and Pin Modals */}
      <EditChartModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        widget={activeEditWidget}
        onSave={handleSaveEditWidget}
      />

      <PinChartModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        widget={activePinWidget}
        dashboards={dashboardsList}
        onPin={(dbId) => addPinnedWidget(dbId, activePinWidget)}
      />
    </PageWrapper>
  );
}

// ─── Modal Components ─────────────────────────────────────────────────────────

function EditChartModal({ isOpen, onClose, widget, onSave }: { isOpen: boolean; onClose: () => void; widget: any; onSave: (updatedWidget: any) => void }) {
  const [title, setTitle] = useState(widget?.title || '');
  const [chartType, setChartType] = useState(widget?.chart_type || 'bar_chart');
  const [yAxis, setYAxis] = useState(widget?.config?.y_axis || 'spend');
  const [xAxis, setXAxis] = useState(widget?.config?.x_axis || 'campaign_name');
  const [sort, setSort] = useState(widget?.config?.sort || 'DESC');

  useEffect(() => {
    if (widget) {
      setTitle(widget.title);
      setChartType(widget.chart_type);
      setYAxis(widget.config?.y_axis || 'spend');
      setXAxis(widget.config?.x_axis || 'campaign_name');
      setSort(widget.config?.sort || 'DESC');
    }
  }, [widget]);

  const handleSave = () => {
    onSave({
      ...widget,
      title,
      chart_type: chartType,
      config: {
        ...widget.config,
        y_axis: yAxis,
        x_axis: xAxis,
        sort: sort
      }
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md border border-slate-100 flex flex-col gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Customize AI Chart</h2>
          <p className="text-xs text-slate-400 mt-0.5">Edit visual parameters and axis configurations in real-time</p>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="text-xs font-bold text-slate-700">Chart Title</span>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="mt-1.5 w-full h-10 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-600 focus:bg-white transition-all font-bold"
            />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-bold text-slate-700">Visualization Type</span>
              <select
                value={chartType}
                onChange={e => setChartType(e.target.value)}
                className="mt-1.5 w-full h-10 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-600 focus:bg-white transition-all font-bold"
              >
                <option value="bar_chart">Bar Chart</option>
                <option value="line_chart">Line Chart</option>
                <option value="pie_chart">Pie Chart</option>
                <option value="kpi_card">KPI Cards</option>
                <option value="table">Data Table</option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-bold text-slate-700">Sort Direction</span>
              <select
                value={sort}
                onChange={e => setSort(e.target.value)}
                className="mt-1.5 w-full h-10 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-600 focus:bg-white transition-all font-bold"
              >
                <option value="DESC">High to Low (Desc)</option>
                <option value="ASC">Low to High (Asc)</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-bold text-slate-700">Y-Axis Metric</span>
              <select
                value={yAxis}
                onChange={e => setYAxis(e.target.value)}
                className="mt-1.5 w-full h-10 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-600 focus:bg-white transition-all font-bold"
              >
                <option value="spend">Spend (₹)</option>
                <option value="clicks">Clicks</option>
                <option value="impressions">Impressions</option>
                <option value="conversions">Conversions</option>
                <option value="cpc">Cost per Click (CPC)</option>
                <option value="ctr">Click-Through Rate (CTR)</option>
                <option value="roas">ROAS</option>
                <option value="frequency">Frequency</option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-bold text-slate-700">X-Axis Dimension</span>
              <select
                value={xAxis}
                onChange={e => setXAxis(e.target.value)}
                className="mt-1.5 w-full h-10 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-600 focus:bg-white transition-all font-bold"
              >
                <option value="campaign_name">Campaign Name</option>
                <option value="platform">Platform / Channel</option>
              </select>
            </label>
          </div>
        </div>

        <div className="flex gap-2.5 mt-2 justify-end">
          <button
            onClick={onClose}
            className="h-10 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer border-0"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="h-10 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer border-0"
          >
            Apply Changes
          </button>
        </div>
      </div>
    </div>
  );
}

function PinChartModal({ isOpen, onClose, widget, dashboards, onPin }: { isOpen: boolean; onClose: () => void; widget: any; dashboards: any[]; onPin: (dashboardId: number) => void }) {
  const [selectedDbId, setSelectedDbId] = useState<number | ''>('');

  useEffect(() => {
    if (dashboards && dashboards.length > 0) {
      setSelectedDbId(dashboards[0].id);
    }
  }, [dashboards]);

  const handlePin = () => {
    if (selectedDbId !== '') {
      onPin(Number(selectedDbId));
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md border border-slate-100 flex flex-col gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Pin to Dashboard</h2>
          <p className="text-xs text-slate-400 mt-0.5">Attach this live AI-generated insight chart to a workspace dashboard</p>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="text-xs font-bold text-slate-700">Select Target Dashboard</span>
            {(!dashboards || dashboards.length === 0) ? (
              <p className="mt-2 text-xs font-semibold text-slate-500">No dashboards available. Create a dashboard first in the dashboard view.</p>
            ) : (
              <select
                value={selectedDbId}
                onChange={e => setSelectedDbId(Number(e.target.value))}
                className="mt-1.5 w-full h-10 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-600 focus:bg-white transition-all font-bold"
              >
                {dashboards.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
          </label>
        </div>

        <div className="flex gap-2.5 mt-2 justify-end">
          <button
            onClick={onClose}
            className="h-10 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer border-0"
          >
            Cancel
          </button>
          <button
            onClick={handlePin}
            disabled={selectedDbId === ''}
            className="h-10 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer border-0 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Pin Insight
          </button>
        </div>
      </div>
    </div>
  );
}

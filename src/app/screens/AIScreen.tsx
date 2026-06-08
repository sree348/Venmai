import React, { useState, useEffect, useRef } from 'react';
import { useAgentStore } from '../../stores/agentStore';
import { useApp } from '../context/AppContext';
import { Sparkles, Trash2, Send, Cpu, Lightbulb, AlertTriangle, RefreshCw, TrendingUp, TrendingDown, ShieldAlert, Zap, Settings, Pin, ChevronDown, Pause, Plus, Edit, Check, Copy, ClipboardPaste, Globe, Database, Search, Home, Compass, BookOpen, History as HistoryIcon, Paperclip, Mic, Image as ImageIcon, Minus, Square, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import PageWrapper from '../components/shared/PageWrapper';
import { apiService } from '../../services/api.service';
import WidgetRenderer, { formatInr, formatRoas } from '../components/shared/WidgetRenderer';
import { getAlerts, getConnectedPlatforms, getPerformanceSummary, getRecommendations } from '../../services/insights.service';
import { toast } from 'sonner';
import mipLogo from '../components/shared/mip_logo.png';
import { renderMetricText } from '../components/shared/AIResponseEnhancements';

const MetaIcon = () => (
  <svg className="size-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
    <path d="M16.924 5.25a6.496 6.496 0 0 0-4.924 2.278 6.496 6.496 0 0 0-4.924-2.278 6.643 6.643 0 0 0-6.638 6.643c0 3.754 3.036 6.643 6.638 6.643a6.496 6.496 0 0 0 4.924-2.278 6.496 6.496 0 0 0 4.924 2.278 6.643 6.643 0 0 0 6.638-6.643 6.643 6.643 0 0 0-6.638-6.643zm0 11.233a4.594 4.594 0 0 1-3.665-1.848 5.7 5.7 0 0 0 1.059-3.385c0-1.28-.426-2.457-1.127-3.398a4.594 4.594 0 0 1 3.733-1.602 4.643 4.643 0 0 1 4.638 4.643 4.643 4.643 0 0 1-4.638 4.59zm-9.848 0a4.643 4.643 0 0 1-4.638-4.59 4.643 4.643 0 0 1 4.638-4.643 4.594 4.594 0 0 1 3.733 1.602c-.701.941-1.127 2.118-1.127 3.398 0 1.28.36 2.44 1.059 3.385a4.594 4.594 0 0 1-3.665 1.848z" />
  </svg>
);

const GoogleAdsIcon = () => (
  <svg className="size-4 mr-2" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M15.3 2.3c-.5-.5-1.3-.5-1.8 0L3.8 12c-.5.5-.5 1.3 0 1.8l4.2 4.2c.5.5 1.3.5 1.8 0l9.7-9.7c.5-.5.5-1.3 0-1.8L15.3 2.3z" fill="#FBBC05" />
    <path d="M20.2 11.8L15.3 6.9l-4.7 4.7 4.9 4.9c.5.5 1.3.5 1.8 0l2.9-2.9c.5-.5.5-1.3 0-1.8z" fill="#4285F4" />
    <path d="M10.6 18.5l-4.7-4.7-2.1 2.1c-.5.5-.5 1.3 0 1.8l2.9 2.9c.5.5 1.3.5 1.8 0l2.1-2.1z" fill="#34A853" />
  </svg>
);

const QUICK_CHIPS = [
  "What should I pause today and why?",
  "Which campaigns are wasting budget with zero conversions?",
  "Where should I scale budget based on CPC and CTR?",
  "Detect any anomalies or unusual spikes in my campaigns",
  "New campaign funnel idea for launching XEV this quarter",
  "Generate a campaign performance report for my client",
  "What is CPL and how do I improve it? (explain simply)"
];

const GENERIC_CONVERSATION_PATTERNS = [
  /\bhi\b/i,
  /\bhello\b/i,
  /\bhey\b/i,
  /\bgood\s+(morning|afternoon|evening)\b/i,
  /\bthanks?\b/i,
  /\bthank\s+you\b/i,
  /\bwho\s+are\s+you\b/i,
  /\bwhat\s+can\s+you\s+do\b/i,
];

function getTimeBasedGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const META_ANALYTICS_TERMS = [
  'ad',
  'ads',
  'campaign',
  'campaigns',
  'meta',
  'facebook',
  'instagram',
  'spend',
  'budget',
  'cpc',
  'cpl',
  'ctr',
  'cpm',
  'roas',
  'lead',
  'leads',
  'conversion',
  'conversions',
  'click',
  'clicks',
  'impression',
  'impressions',
  'frequency',
  'fatigue',
  'pause',
  'scale',
  'performance',
  'waste',
  'report',
];

function isGenericConversation(prompt: string) {
  const normalized = prompt.trim().toLowerCase();
  const hasAnalyticsTerm = META_ANALYTICS_TERMS.some(term => normalized.includes(term));
  return !hasAnalyticsTerm && GENERIC_CONVERSATION_PATTERNS.some(pattern => pattern.test(prompt));
}

function buildGenericAgentReply(prompt: string) {
  const normalized = prompt.trim().toLowerCase();
  if (/\bthanks?\b|\bthank\s+you\b/.test(normalized)) {
    return 'You are welcome. I am here when you want a clean read on CAI Media campaign movement, waste, fatigue, or scaling opportunities.';
  }
  if (/\bwho\s+are\s+you\b|\bwhat\s+can\s+you\s+do\b/.test(normalized)) {
    return 'I am MIP AI Brain, your marketing intelligence assistant. I can explain MIP, read campaign data, diagnose spend, CPL, CTR, CPM, ROAS, frequency, budget waste, and recommend what to pause or scale.';
  }
  return 'Hi. I am MIP AI Brain. Ask me about MIP, dashboards, reports, integrations, or tell me which campaign you want me to inspect.';
}

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

function getCampaignLink(campaign?: any, targetType: 'adsets' | 'campaigns' = 'adsets') {
  if (!campaign) {
    if (targetType === 'campaigns') {
      return 'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=1072682920153744&nav_source=no_referrer#';
    }
    return 'https://adsmanager.facebook.com/adsmanager/manage/adsets?act=1072682920153744&business_id=2236586339959691&columns=name%2Cdelivery%2Crecommendations_guidance%2Cresults%2Ccost_per_result%2Cbudget%2Cspend%2Cimpressions%2Creach%2Cfrequency%2Ccpm%2Cactions%3Alink_click%2Cschedule%2Cend_time%2Cattribution_setting%2Cbid%2Clast_significant_edit%2Cquality_score_organic%2Cquality_score_ectr%2Cquality_score_ecvr%2Ccampaign_name&attribution_windows=default&nav_source=no_referrer';
  }
  const platform = String(campaign.platform || campaign.channel || '').toLowerCase();
  const id = campaign.id || campaign.campaignId || '';

  if (platform.includes('google') || platform.includes('youtube')) {
    return 'https://ads.google.com/';
  }

  if (targetType === 'campaigns') {
    if (id) {
      return `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=1072682920153744&selected_campaign_ids=${id}&nav_source=no_referrer#`;
    }
    return 'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=1072682920153744&nav_source=no_referrer#';
  }

  if (id) {
    return `https://adsmanager.facebook.com/adsmanager/manage/adsets?act=1072682920153744&business_id=2236586339959691&columns=name%2Cdelivery%2Crecommendations_guidance%2Cresults%2Ccost_per_result%2Cbudget%2Cspend%2Cimpressions%2Creach%2Cfrequency%2Ccpm%2Cactions%3Alink_click%2Cschedule%2Cend_time%2Cattribution_setting%2Cbid%2Clast_significant_edit%2Cquality_score_organic%2Cquality_score_ectr%2Cquality_score_ecvr%2Ccampaign_name&attribution_windows=default&selected_campaign_ids=${id}&nav_source=no_referrer`;
  }

  return 'https://adsmanager.facebook.com/adsmanager/manage/adsets?act=1072682920153744&business_id=2236586339959691&columns=name%2Cdelivery%2Crecommendations_guidance%2Cresults%2Ccost_per_result%2Cbudget%2Cspend%2Cimpressions%2Creach%2Cfrequency%2Ccpm%2Cactions%3Alink_click%2Cschedule%2Cend_time%2Cattribution_setting%2Cbid%2Clast_significant_edit%2Cquality_score_organic%2Cquality_score_ectr%2Cquality_score_ecvr%2Ccampaign_name&attribution_windows=default&nav_source=no_referrer';
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
    const reasonText = clicks > 0
      ? `This is driven by a landing page conversion issue: users are actively clicking the ad (${clicks} clicks, ${ctr.toFixed(2)}% CTR), but 0 have converted. Check the landing page layout, form validation, or conversion pixel tracking.`
      : `This is driven by zero ad engagement: the campaign is generating spend through impressions but has recorded 0 clicks. Check your targeting parameters and rotate ad creative elements immediately.`;

    return {
      topIssue: 'Burning Budget',
      recommendation: `Zero conversions recorded despite ₹${spend.toLocaleString('en-IN', { maximumFractionDigits: 0 })} spent. ${reasonText} Pause campaign immediately to prevent further waste.`,
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
    topIssue: 'Low Efficiency',
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
  const reach = Number(c.reach || 0);
  const cpm = impressions > 0 ? (spend / impressions) * 1000 : Number(c.cpm || 0);
  const cpl = conversions > 0 ? spend / conversions : 0;
  const clickToLeadCvr = clicks > 0 ? (conversions / clicks) * 100 : 0;

  return { spend, clicks, impressions, conversions, frequency, cpc, ctr, roas, reach, cpm, cpl, clickToLeadCvr };
}

function detectCampaignType(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes('commercial')) return 'COMMERCIAL';
  if (lower.includes('branding') || lower.includes('insta') || lower.includes('esuv')) return 'BRANDING';
  if (lower.includes('sales') || lower.includes('xev') || lower.includes('passenger') || lower.includes('leads')) return 'LEAD_GEN';
  return 'LEAD_GEN';
}

function formatMetricValue(metric: string, value: number | string | null | undefined) {
  if (value === null || value === undefined || value === 'N/A') return 'N/A';
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return String(value);
  if (metric.includes('CPL') || metric.includes('CPM')) return formatInr(numeric);
  if (metric.includes('CVR') || metric.includes('CTR') || metric.includes('Engagement')) return `${numeric.toFixed(2)}%`;
  if (metric.includes('Frequency')) return numeric.toFixed(2);
  if (metric.includes('ROAS')) return `${numeric.toFixed(2)}x`;
  return numeric.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function buildSeniorFallbackResponse(prompt: string, campaigns: any[], activeClientName?: string) {
  const normalized = prompt.toLowerCase();
  const enriched = campaigns.map((campaign: any) => {
    const name = campaign.name || campaign.campaignName || 'Unnamed campaign';
    return {
      ...campaign,
      name,
      campaign_name: name,
      campaignType: detectCampaignType(name),
      metrics: getCampaignMetrics(campaign),
    };
  });

  const requestedType = normalized.includes('commercial')
    ? 'COMMERCIAL'
    : normalized.includes('branding') || normalized.includes('insta') || normalized.includes('esuv')
      ? 'BRANDING'
      : normalized.includes('sales') || normalized.includes('xev') || normalized.includes('passenger') || normalized.includes('lead')
        ? 'LEAD_GEN'
        : null;

  const scoped = requestedType ? enriched.filter(c => c.campaignType === requestedType) : enriched;
  const rows = (scoped.length ? scoped : enriched).filter(c => c.metrics.spend > 0 || c.metrics.impressions > 0);
  const leadRows = rows.filter(c => c.campaignType === 'LEAD_GEN');
  const commercialRows = rows.filter(c => c.campaignType === 'COMMERCIAL');
  const brandingRows = rows.filter(c => c.campaignType === 'BRANDING');
  const focusType = requestedType || (leadRows.length >= commercialRows.length && leadRows.length >= brandingRows.length ? 'LEAD_GEN' : commercialRows.length >= brandingRows.length ? 'COMMERCIAL' : 'BRANDING');
  const categoryRows = rows.filter(c => c.campaignType === focusType);
  const peers = categoryRows.length ? categoryRows : rows;

  const sorters: Record<string, (a: any, b: any) => number> = {
    LEAD_GEN: (a, b) => (b.metrics.cpl || Infinity) - (a.metrics.cpl || Infinity),
    COMMERCIAL: (a, b) => b.metrics.cpm - a.metrics.cpm,
    BRANDING: (a, b) => b.metrics.cpm - a.metrics.cpm,
  };
  const bestSorters: Record<string, (a: any, b: any) => number> = {
    LEAD_GEN: (a, b) => (a.metrics.cpl || Infinity) - (b.metrics.cpl || Infinity),
    COMMERCIAL: (a, b) => b.metrics.ctr - a.metrics.ctr,
    BRANDING: (a, b) => a.metrics.cpm - b.metrics.cpm,
  };

  const focus = [...peers].sort(sorters[focusType])[0] || peers[0];
  const best = [...peers].sort(bestSorters[focusType])[0] || focus;
  const focusMetrics = focus?.metrics || {};
  const bestMetrics = best?.metrics || {};

  const metricRows = focusType === 'LEAD_GEN'
    ? [
      ['CPL', focusMetrics.cpl || 0, bestMetrics.cpl || 0, (focusMetrics.cpl || 0) - (bestMetrics.cpl || 0)],
      ['Total Leads', focusMetrics.conversions || 0, bestMetrics.conversions || 0, (focusMetrics.conversions || 0) - (bestMetrics.conversions || 0)],
      ['Click-to-Lead CVR', focusMetrics.clickToLeadCvr || 0, bestMetrics.clickToLeadCvr || 0, (focusMetrics.clickToLeadCvr || 0) - (bestMetrics.clickToLeadCvr || 0)],
      ['Form drop-off', 'Not tracked', 'Not tracked', 'N/A'],
    ]
    : focusType === 'COMMERCIAL'
      ? [
        ['CTR', focusMetrics.ctr || 0, bestMetrics.ctr || 0, (focusMetrics.ctr || 0) - (bestMetrics.ctr || 0)],
        ['ROAS', focusMetrics.roas || 0, bestMetrics.roas || 0, (focusMetrics.roas || 0) - (bestMetrics.roas || 0)],
        ['Reach', focusMetrics.reach || 0, bestMetrics.reach || 0, (focusMetrics.reach || 0) - (bestMetrics.reach || 0)],
        ['Frequency', focusMetrics.frequency || 0, bestMetrics.frequency || 0, (focusMetrics.frequency || 0) - (bestMetrics.frequency || 0)],
        ['CPM', focusMetrics.cpm || 0, bestMetrics.cpm || 0, (focusMetrics.cpm || 0) - (bestMetrics.cpm || 0)],
      ]
      : [
        ['CPM', focusMetrics.cpm || 0, bestMetrics.cpm || 0, (focusMetrics.cpm || 0) - (bestMetrics.cpm || 0)],
        ['Engagement Rate', 'Not tracked', 'Not tracked', 'N/A'],
        ['Frequency', focusMetrics.frequency || 0, bestMetrics.frequency || 0, (focusMetrics.frequency || 0) - (bestMetrics.frequency || 0)],
        ['Reach', focusMetrics.reach || 0, bestMetrics.reach || 0, (focusMetrics.reach || 0) - (bestMetrics.reach || 0)],
      ];

  const table = [
    '| Metric | This Campaign | Best in Category | Gap |',
    '|---|---:|---:|---:|',
    ...metricRows.map(([metric, current, bestValue, gap]) =>
      `| ${metric} | ${formatMetricValue(String(metric), current as any)} | ${formatMetricValue(String(metric), bestValue as any)} | ${formatMetricValue(String(metric), gap as any)} |`
    ),
  ].join('\n');

  const chartMetric = focusType === 'LEAD_GEN' ? 'cpl' : focusType === 'COMMERCIAL' ? 'ctr' : 'cpm';
  const chartLabel = focusType === 'LEAD_GEN' ? 'CPL' : focusType === 'COMMERCIAL' ? 'CTR' : 'CPM';
  const chartRows = [...peers]
    .sort((a, b) => Number(b.metrics[chartMetric] || 0) - Number(a.metrics[chartMetric] || 0))
    .slice(0, 6)
    .map(c => ({
      campaign_name: c.name,
      campaign_type: c.campaignType,
      [chartMetric]: Number(c.metrics[chartMetric] || 0),
      spend: c.metrics.spend,
      leads: c.metrics.conversions,
      ctr: c.metrics.ctr,
      cpm: c.metrics.cpm,
      frequency: c.metrics.frequency,
    }));

  const headline = focusType === 'LEAD_GEN'
    ? `${focus.name} is the lead-gen campaign I would inspect first: ${formatInr(focusMetrics.cpl || 0)} CPL against ${best.name} at ${formatInr(bestMetrics.cpl || 0)}.`
    : focusType === 'COMMERCIAL'
      ? `${focus.name} is carrying the commercial efficiency risk: ${formatInr(focusMetrics.cpm || 0)} CPM with ${Number(focusMetrics.ctr || 0).toFixed(2)}% CTR.`
      : `${focus.name} is the branding watchlist item: ${formatInr(focusMetrics.cpm || 0)} CPM and ${Number(focusMetrics.frequency || 0).toFixed(2)} frequency.`;

  const redFlags = focusType === 'LEAD_GEN'
    ? [
      `🔴 critical ${focus.name}: CPL is ${formatInr(focusMetrics.cpl || 0)}, while ${best.name} is at ${formatInr(bestMetrics.cpl || 0)} in the same LEAD_GEN category.`,
      `⚠️ warning ${focus.name}: click-to-lead CVR is ${Number(focusMetrics.clickToLeadCvr || 0).toFixed(2)}%, so clicks are not converting into lead volume efficiently.`,
      `✅ good ${best.name}: ${Number(bestMetrics.conversions || 0).toLocaleString('en-IN')} leads gives us a cleaner benchmark to copy.`,
    ]
    : [
      `🔴 critical ${focus.name}: CPM is ${formatInr(focusMetrics.cpm || 0)}, above the strongest same-type peer at ${formatInr(bestMetrics.cpm || 0)}.`,
      `⚠️ warning ${focus.name}: frequency is ${Number(focusMetrics.frequency || 0).toFixed(2)}, so creative fatigue may be inflating delivery cost.`,
      `✅ good ${best.name}: this is the same-category benchmark to study before moving budget.`,
    ];

  const rootCause = focusType === 'LEAD_GEN'
    ? `${focus.name} is not just expensive; it is leaking efficiency between click and lead. The spend is ${formatInr(focusMetrics.spend || 0)}, clicks are ${Number(focusMetrics.clicks || 0).toLocaleString('en-IN')}, and leads are ${Number(focusMetrics.conversions || 0).toLocaleString('en-IN')}, which points to offer, form friction, or audience intent mismatch rather than only media buying.`
    : `${focus.name} is paying more to reach the same market than its category peer set. With ${formatInr(focusMetrics.spend || 0)} spend, ${Number(focusMetrics.impressions || 0).toLocaleString('en-IN')} impressions, and ${Number(focusMetrics.frequency || 0).toFixed(2)} frequency, the likely issue is audience saturation or a creative that is no longer earning cheap delivery.`;

  const recommendationTable = [
    '| Action | Why | Priority |',
    '|---|---|---|',
    `| Audit ${focus.name} audience and placement split | The category gap is visible on ${chartLabel}; this is where waste is hiding. | High |`,
    `| Copy the strongest signal from ${best.name} | It is the best same-type benchmark, so learn from its targeting, creative hook, and offer. | High |`,
    `| Shift 10-15% test budget only after the weak metric improves | Scaling before fixing the gap will compound inefficient delivery. | Medium |`,
  ].join('\n');

  const chartData = {
    type: 'bar',
    title: `${focusType} ${chartLabel} comparison`,
    labels: chartRows.map(row => row.campaign_name),
    datasets: [{ label: chartLabel, data: chartRows.map(row => Number(row[chartMetric] || 0)) }],
  };

  const insight = [
    headline,
    '',
    table,
    '',
    redFlags.map(item => `- ${item}`).join('\n'),
    '',
    rootCause,
    '',
    recommendationTable,
    '',
    '```chartdata',
    JSON.stringify(chartData, null, 2),
    '```',
    '',
    '---',
    '🔍 **You should also look at:**',
    `${best.name} is the best same-category benchmark, but its winning metric may not be protected if budget shifts too aggressively.`,
    `${focus.name} has ${formatInr(focusMetrics.spend || 0)} already committed, so even a small efficiency fix can free budget quickly.`,
    '',
    '**Ask me:**',
    `- "Why is ${focus.name} ${chartLabel} worse than ${best.name} with ${formatInr(focusMetrics.spend || 0)} spend?"`,
    `- "Which same-category campaign should receive budget from ${focus.name} first?"`,
    `- "Build me a 3-step fix plan for ${focus.name} before the next Meta sync."`,
    '---',
  ].join('\n');

  return {
    widget: {
      chart_type: 'bar_chart',
      title: `${focusType} ${chartLabel} comparison`,
      data: chartRows,
      config: {
        x_axis: 'campaign_name',
        y_axis: chartMetric,
        sort: focusType === 'COMMERCIAL' ? 'DESC' : 'DESC',
      },
      sql: null,
      insight,
    },
    insight,
  };
}

export interface ParsedTable {
  headers: string[];
  rows: string[][];
}

export interface ParsedRedFlag {
  type: 'critical' | 'warning' | 'good';
  text: string;
}

export interface ParsedRecommendation {
  action: string;
  why: string;
  priority: 'High' | 'Medium' | 'Low' | string;
}

export interface ParsedOutput {
  headline: string;
  scene: string;
  conflict: string;
  turningPoint: string;
  metricsTable: ParsedTable | null;
  analystThinking: string;
  redFlags: ParsedRedFlag[];
  rootCause: string;
  recommendations: ParsedRecommendation[];
  alsoLookAt: string[];
  askMe: string[];
  remainingText: string;
}

export function parseMessageContent(content: string): ParsedOutput {
  const result: ParsedOutput = {
    headline: '',
    scene: '',
    conflict: '',
    turningPoint: '',
    metricsTable: null,
    analystThinking: '',
    redFlags: [],
    rootCause: '',
    recommendations: [],
    alsoLookAt: [],
    askMe: [],
    remainingText: ''
  };

  // Normalize literal \n escape sequences to real newlines (backend may return escaped strings)
  const normalized = content
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '  ');

  // Remove chartdata block
  const cleanText = normalized.replace(/```chartdata[\s\S]*?```/g, '').trim();
  const lines = cleanText.split('\n');

  let currentSection: 'none' | 'analyst_thinking' | 'root_cause' | 'also_look_at' | 'ask_me' | 'scene' | 'conflict' | 'turning_point' | 'act6_resolution' = 'none';
  let inTurningPointCodeBlock = false;
  let tempTableRows: string[][] = [];
  let tempTableHeaders: string[] = [];
  let isInTable = false;

  const processTable = () => {
    if (tempTableHeaders.length > 0) {
      const isMetrics = tempTableHeaders.some(h => h.toLowerCase().includes('metric'));
      const isRecs = tempTableHeaders.some(h => h.toLowerCase().includes('action') || h.toLowerCase().includes('priority'));

      if (isMetrics) {
        result.metricsTable = {
          headers: tempTableHeaders,
          rows: tempTableRows
        };
      } else if (isRecs) {
        result.recommendations = tempTableRows.map(row => {
          const action = row[0] || '';
          const why = row[1] || '';
          const priorityText = row[2] || '';
          let priority = 'Medium';
          if (priorityText.includes('High') || priorityText.includes('🔴') || priorityText.toLowerCase().includes('critical')) {
            priority = 'High';
          } else if (priorityText.includes('Low') || priorityText.includes('✅') || priorityText.toLowerCase().includes('low') || priorityText.toLowerCase().includes('good')) {
            priority = 'Low';
          }
          return { action, why, priority };
        });
      }
    }
    tempTableHeaders = [];
    tempTableRows = [];
    isInTable = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Detect Table
    if (trimmed.startsWith('|')) {
      isInTable = true;
      // Parse table row
      const cells = trimmed
        .split('|')
        .map(c => c.trim())
        .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1); // remove outer empty elements

      // Check if it's separator row
      const isSeparator = cells.every(c => c.match(/^:?-+:?$/));
      if (isSeparator) {
        continue;
      }

      if (tempTableHeaders.length === 0) {
        tempTableHeaders = cells;
      } else {
        tempTableRows.push(cells);
      }
      continue;
    } else if (isInTable) {
      // Table ended
      processTable();
    }

    // Detect turning point code block (``` fenced block under ACT 5)
    if (trimmed.startsWith('```') && !trimmed.startsWith('```chartdata')) {
      if (currentSection === 'turning_point') {
        inTurningPointCodeBlock = !inTurningPointCodeBlock;
        continue;
      }
      inTurningPointCodeBlock = false;
      continue;
    }
    if (inTurningPointCodeBlock && currentSection === 'turning_point') {
      if (trimmed !== '---' && trimmed !== '***') {
        result.turningPoint += (result.turningPoint ? '\n' : '') + line;
      }
      continue;
    }

    // Detect Section Headings
    const headingMatch = trimmed.match(/^(?:###|##|#)\s*(.*)$/);
    if (headingMatch) {
      const headingText = headingMatch[1].trim();
      const headingLower = headingText.toLowerCase();

      // Clean emoji from heading for matching
      const cleanHeading = headingLower.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').replace(/[^\w\s]/g, '').trim();

      // ACT-style headers (new storytelling format)
      const hasAct1 = /act\s*1|\u{1F3AC}/u.test(headingLower);
      const hasAct2 = /act\s*2|\u{1F4CD}/u.test(headingLower);
      const hasAct3 = /act\s*3|\u2694|\u{2694}|problem nobody/u.test(headingLower);
      const hasAct4 = /act\s*4|\u{1F50D}|why is this happening|real story/u.test(headingLower);
      const hasAct5 = /act\s*5|\u26A1|numbers that change/u.test(headingLower);
      const hasAct6 = /act\s*6|\u{1F3AF}|three moves|fix this/u.test(headingLower);
      const hasAct7 = /act\s*7|\u{1F3AD}|questions this report/u.test(headingLower);

      if (hasAct1) {
        currentSection = 'none'; // headline captured from next non-empty line
      } else if (hasAct2) {
        currentSection = 'scene';
      } else if (hasAct3) {
        currentSection = 'conflict';
      } else if (hasAct4 || cleanHeading.includes('root cause') || cleanHeading.includes('analyst thinking')) {
        currentSection = hasAct4 ? 'root_cause' : (cleanHeading.includes('analyst thinking') ? 'analyst_thinking' : 'root_cause');
      } else if (hasAct5) {
        currentSection = 'turning_point';
        inTurningPointCodeBlock = false;
      } else if (hasAct6) {
        currentSection = 'act6_resolution';
      } else if (hasAct7 || cleanHeading.includes('ask me') || cleanHeading.includes('the story continues') || cleanHeading.includes('questions this report')) {
        currentSection = 'ask_me';
      } else if (cleanHeading.includes('you should also look at') || cleanHeading.includes('look at')) {
        currentSection = 'also_look_at';
      } else {
        currentSection = 'none';
      }
      continue;
    }

    // Detect standalone look at / ask me transitions (non-header format or just bold text)
    if (trimmed.includes('You should also look at:') || trimmed.includes('also look at:')) {
      currentSection = 'also_look_at';
      continue;
    }
    if (trimmed.includes('Ask me:') || trimmed.toLowerCase().startsWith('ask me') || trimmed.includes('The story continues') || trimmed.includes('🧵')) {
      currentSection = 'ask_me';
      continue;
    }
    // ACT 7 note lines (📌 prefix) — treat as alsoLookAt
    if (trimmed.startsWith('📌') || trimmed.startsWith('→')) {
      const noteText = trimmed.replace(/^[📌→\s]+/, '').trim();
      if (noteText) result.alsoLookAt.push(noteText);
      continue;
    }

    // Detect Red Flags
    const isRedFlagCritical = trimmed.startsWith('🔴') || trimmed.startsWith('- 🔴') || trimmed.startsWith('* 🔴');
    const isRedFlagWarning = trimmed.startsWith('⚠️') || trimmed.startsWith('- ⚠️') || trimmed.startsWith('* ⚠️');
    const isRedFlagGood = trimmed.startsWith('✅') || trimmed.startsWith('- ✅') || trimmed.startsWith('* ✅');

    if (isRedFlagCritical || isRedFlagWarning || isRedFlagGood) {
      let type: 'critical' | 'warning' | 'good' = 'warning';
      if (isRedFlagCritical) type = 'critical';
      if (isRedFlagGood) type = 'good';

      // Clean the line from bullets and emojis
      let flagText = trimmed
        .replace(/^[-*\s]+/, '') // remove leading dash/asterisk
        .replace(/^[🔴⚠️✅\s]+/, '') // remove emoji
        .replace(/^(?:critical|warning|good)\s*/i, '') // remove prefix text
        .trim();

      result.redFlags.push({ type, text: flagText });
      continue;
    }

    // Process lists under current section
    if (trimmed.startsWith('-') || trimmed.startsWith('*') || trimmed.match(/^\d+\./)) {
      const itemText = trimmed
        .replace(/^[-*\d.\s]+/, '') // remove list bullet
        .replace(/^['"]|['"]$/g, '') // remove outer quotes
        .trim();

      if (currentSection === 'also_look_at') {
        result.alsoLookAt.push(itemText);
        continue;
      }
      if (currentSection === 'ask_me') {
        result.askMe.push(itemText);
        continue;
      }
      // ACT 6 resolution — numbered moves go into remainingText for now (rendered as part of conflict block)
      if (currentSection === 'act6_resolution') {
        result.conflict += (result.conflict ? '\n' : '') + trimmed;
        continue;
      }
    }

    // Set headline if empty and not in any section or table
    if (!result.headline && trimmed && currentSection === 'none') {
      if (trimmed === '---' || trimmed === '***') {
        continue;
      }
      result.headline = trimmed.replace(/^\*\*|\*\*$/g, ''); // strip bold formatting
      continue;
    }

    // Add content to current text section
    if (trimmed) {
      if (currentSection === 'analyst_thinking') {
        result.analystThinking += (result.analystThinking ? '\n' : '') + trimmed;
      } else if (currentSection === 'root_cause') {
        result.rootCause += (result.rootCause ? '\n' : '') + trimmed;
      } else if (currentSection === 'scene') {
        result.scene += (result.scene ? '\n' : '') + trimmed;
      } else if (currentSection === 'conflict') {
        result.conflict += (result.conflict ? '\n' : '') + trimmed;
      } else if (currentSection === 'turning_point') {
        result.turningPoint += (result.turningPoint ? '\n' : '') + trimmed;
      } else if (currentSection === 'act6_resolution') {
        result.conflict += (result.conflict ? '\n' : '') + trimmed;
      } else if (currentSection === 'none') {
        result.remainingText += (result.remainingText ? '\n' : '') + trimmed;
      }
    }
  }

  // Handle table if message ends with table open
  if (isInTable) {
    processTable();
  }

  if (result.turningPoint) {
    result.turningPoint = result.turningPoint
      .split('\n')
      .filter(line => !/^[-\s*]+$/.test(line))
      .join('\n')
      .trim();
  }

  return result;
}

interface StructuredMessageRendererProps {
  content: string;
  handleSend: (text: string) => void;
}

function extractModeEFunnel(content: string) {
  const normalized = content
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '  ')
    .replace(/```chartdata[\s\S]*?```/g, '')
    .trim();

  const fencedMatch = normalized.match(/```([\s\S]*?AWARENESS \(Top of Funnel\)[\s\S]*?RE-ENGAGEMENT[\s\S]*?)```/i);
  const plainMatch = fencedMatch || normalized.match(/((?:\d+\.\s*)?AWARENESS \(Top of Funnel\)[\s\S]*?(?:\d+\.\s*)?RE-ENGAGEMENT[\s\S]*?)(?=\n\s*(?:\| Stage \||---|🔍|\*\*Ask me|Ask me:|$))/i);
  if (!plainMatch) return null;

  const funnelText = plainMatch[1].trim();
  const stageMatches = Array.from(funnelText.matchAll(/(?:\d+\.\s*)?(AWARENESS \(Top of Funnel\)|CONSIDERATION \(Mid Funnel\)|CONVERSION \(Bottom Funnel\)|RE-ENGAGEMENT)([\s\S]*?)(?=(?:\d+\.\s*)?AWARENESS \(Top of Funnel\)|(?:\d+\.\s*)?CONSIDERATION \(Mid Funnel\)|(?:\d+\.\s*)?CONVERSION \(Bottom Funnel\)|(?:\d+\.\s*)?RE-ENGAGEMENT|$)/gi));
  if (stageMatches.length < 4) return null;

  const stages = stageMatches.map((match, idx) => ({
    title: match[1].trim(),
    body: match[2]
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean),
    tone: ['indigo', 'cyan', 'emerald', 'amber'][idx] || 'slate'
  }));

  return {
    before: normalized.slice(0, plainMatch.index).trim(),
    after: normalized.slice((plainMatch.index || 0) + plainMatch[0].length).trim(),
    stages,
  };
}

function getModeEStageDetails(stage: { body: string[] }) {
  const details = stage.body
    .map(line => {
      const [label, ...rest] = line.split(':');
      const value = rest.join(':').trim();
      return value ? `${label.trim()}: ${value}` : line;
    })
    .filter(Boolean);

  const budget = details.find(line => /^Budget:/i.test(line)) || details[0] || '';
  const kpi = details.find(line => /^KPI:/i.test(line)) || details.find(line => /^Format:/i.test(line)) || details[1] || '';
  const audience = details.find(line => /^Audience:/i.test(line)) || details[2] || '';
  return [budget, kpi, audience].filter(Boolean).slice(0, 3);
}

const StructuredMessageRenderer: React.FC<StructuredMessageRendererProps> = ({ content, handleSend }) => {
  const modeEFunnel = extractModeEFunnel(content);
  const parsed = parseMessageContent(content);
  const isStructured = !!(parsed.metricsTable || parsed.redFlags.length > 0 || parsed.recommendations.length > 0 || parsed.rootCause || parsed.analystThinking || parsed.conflict || parsed.turningPoint || parsed.askMe.length > 0);

  const formatInlineText = (text: string) => {
    if (!text) return null;
    return renderMetricText(text, 'font-extrabold bg-gradient-to-r from-violet-600 to-indigo-650 bg-clip-text text-transparent');
  };

  if (modeEFunnel) {
    const funnelSegments = [
      { fill: '#4F46E5', points: '110,24 790,24 735,108 165,108' },
      { fill: '#0891B2', points: '175,126 725,126 670,210 230,210' },
      { fill: '#059669', points: '240,228 660,228 605,312 295,312' },
      { fill: '#D97706', points: '305,330 595,330 540,414 360,414' },
    ];

    return (
      <div className="space-y-4">
        {modeEFunnel.before && (
          <div className="text-xs sm:text-[13px] text-slate-700 leading-relaxed whitespace-pre-line font-medium">
            {formatInlineText(modeEFunnel.before)}
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50/90 flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">Funnel Diagram</span>
            <span className="text-[10px] font-bold text-slate-400">Mode E</span>
          </div>
          <div className="p-3">
            <svg
              viewBox="0 0 900 438"
              role="img"
              aria-label="Projected campaign funnel diagram"
              className="w-full h-auto rounded-lg bg-slate-950"
            >
              <defs>
                <filter id="funnelShadow" x="-10%" y="-10%" width="120%" height="130%">
                  <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#020617" floodOpacity="0.35" />
                </filter>
              </defs>
              {modeEFunnel.stages.map((stage, idx) => {
                const segment = funnelSegments[idx] || funnelSegments[funnelSegments.length - 1];
                const details = getModeEStageDetails(stage);
                const centerY = 72 + idx * 102;
                return (
                  <g key={stage.title} filter="url(#funnelShadow)">
                    <polygon points={segment.points} fill={segment.fill} stroke="rgba(255,255,255,0.42)" strokeWidth="2" />
                    <text x="450" y={centerY - 18} textAnchor="middle" fill="#FFFFFF" fontSize="24" fontWeight="800">
                      {stage.title}
                    </text>
                    {details.map((line, detailIdx) => (
                      <text
                        key={line}
                        x="450"
                        y={centerY + 12 + detailIdx * 19}
                        textAnchor="middle"
                        fill="rgba(255,255,255,0.86)"
                        fontSize="15"
                        fontWeight={detailIdx === 0 ? '700' : '500'}
                      >
                        {line.length > 78 ? `${line.slice(0, 75)}...` : line}
                      </text>
                    ))}
                  </g>
                );
              })}
            </svg>

          </div>
        </div>

        {modeEFunnel.after && (
          <div className="text-xs sm:text-[13px] text-slate-700 leading-relaxed whitespace-pre-line font-medium">
            {formatInlineText(modeEFunnel.after)}
          </div>
        )}
      </div>
    );
  }

  if (!isStructured) {
    return (
      <div className="space-y-3">
      <p className="break-words whitespace-pre-line">
        {formatInlineText(content.replace(/```chartdata[\s\S]*?```/g, '').trim())}
      </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-5 py-1">
      {/* Headline — ACT 1 */}
      {parsed.headline && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-violet-500/10 via-indigo-500/5 to-transparent border border-indigo-100/50 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="text-xl leading-none select-none"></span>
            <h3 className="text-sm sm:text-[15px] font-extrabold text-slate-800 leading-snug">
              {formatInlineText(parsed.headline)}
            </h3>
          </div>
        </div>
      )}

      {/* Scene — ACT 2 */}
      {parsed.scene && (
        <div className="px-4 py-3 rounded-xl bg-slate-50/60 border border-slate-200/60 text-xs sm:text-[13px] text-slate-600 leading-relaxed font-medium">
          <span className="text-base mr-1.5 select-none">📍</span>
          {formatInlineText(parsed.scene)}
        </div>
      )}

      {/* Metrics Table */}
      {parsed.metricsTable && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white/70 shadow-sm backdrop-blur-sm">
          <div className="bg-slate-50/80 px-4 py-2 border-b border-slate-150 flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">Performance Snapshot</span>
            <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">Meta Ads</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[400px]">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-200">
                  {parsed.metricsTable.headers.map((h, idx) => (
                    <th key={idx} className={`px-4 py-2.5 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider ${idx > 0 ? 'text-right' : ''}`}>
                      {formatInlineText(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150">
                {parsed.metricsTable.rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-50/50 transition-colors">
                    {row.map((cell, cIdx) => {
                      const isGap = parsed.metricsTable!.headers[cIdx]?.toLowerCase().includes('gap');
                      let cellStyle = "px-4 py-2.5 text-xs text-slate-700 font-medium";
                      if (cIdx === 0) {
                        cellStyle = "px-4 py-2.5 text-xs text-slate-900 font-bold";
                      } else if (cIdx > 0) {
                        cellStyle += " text-right font-mono";
                      }

                      let cellContent: React.ReactNode = formatInlineText(cell);
                      if (isGap && cell && cell !== '-' && cell !== '0' && cell !== 'N/A') {
                        const cleanCell = cell.replace(/[🔴⚠️✅]/g, '').trim();
                        const isNegative = cleanCell.startsWith('-');
                        const isPositive = cleanCell.startsWith('+');

                        const metricName = row[0]?.toLowerCase() || '';
                        const isCostMetric = metricName.includes('cpl') || metricName.includes('cpc') || metricName.includes('cpm') || metricName.includes('spend');

                        const isGood = isCostMetric ? isNegative : isPositive;

                        if (cell.includes('🔴') || cell.includes('⚠️') || cell.includes('✅')) {
                          // normal render
                        } else {
                          if (isGood) {
                            cellContent = (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-600 border border-emerald-200">
                                {cell}
                              </span>
                            );
                          } else {
                            cellContent = (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-600 border border-rose-200">
                                {cell}
                              </span>
                            );
                          }
                        }
                      }

                      return (
                        <td key={cIdx} className={cellStyle}>
                          {cellContent}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Analyst Thinking */}
      {parsed.analystThinking && (
        <div className="p-4 rounded-xl border border-indigo-100/70 bg-indigo-50/15 shadow-sm">
          <div className="flex items-center gap-2 mb-2 select-none">
            <Lightbulb className="size-4 text-indigo-500" />
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-600">Analyst Thinking</span>
          </div>
          <p className="text-xs sm:text-[13px] text-slate-700 leading-relaxed text-justify font-medium">
            {formatInlineText(parsed.analystThinking)}
          </p>
        </div>
      )}

      {/* Red Flags */}
      {parsed.redFlags.length > 0 && (
        <div className="space-y-2">
          {parsed.redFlags.map((flag, idx) => {
            let icon = <AlertTriangle className="size-4 shrink-0" />;
            let bgClass = "bg-amber-50/40 text-amber-850 border-amber-200/60";
            let iconClass = "text-amber-500 bg-amber-50 border-amber-100";
            let label = "Warning";

            if (flag.type === 'critical') {
              icon = <ShieldAlert className="size-4 shrink-0" />;
              bgClass = "bg-rose-50/40 text-rose-855 border-rose-200/60";
              iconClass = "text-rose-500 bg-rose-50 border-rose-100";
              label = "Critical";
            } else if (flag.type === 'good') {
              icon = <Check className="size-4 shrink-0" />;
              bgClass = "bg-emerald-50/40 text-emerald-855 border-emerald-200/60";
              iconClass = "text-emerald-500 bg-emerald-50 border-emerald-100";
              label = "Growth Signal";
            }

            return (
              <div key={idx} className={`flex items-start gap-3 p-3.5 rounded-xl border text-xs sm:text-[13px] leading-relaxed font-medium shadow-sm ${bgClass}`}>
                <div className={`p-1.5 rounded-lg border shadow-sm shrink-0 flex items-center justify-center ${iconClass}`}>
                  {icon}
                </div>
                <div className="flex-1">
                  <span className="font-extrabold mr-1 uppercase tracking-wider text-[9px] block mb-0.5 opacity-80">{label}</span>
                  {formatInlineText(flag.text)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Conflict Box — ACT 3 */}
      {parsed.conflict && (
        <div className="rounded-xl border border-red-200 bg-red-50/30 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-red-500" />
          <div className="p-4">
            <div className="flex items-center gap-2 mb-2.5 select-none">
              <span className="text-base leading-none"></span>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-red-700">The Problem Nobody Is Talking About</span>
            </div>
            <div className="text-xs sm:text-[13px] text-slate-700 leading-relaxed font-medium whitespace-pre-line">
              {formatInlineText(parsed.conflict)}
            </div>
          </div>
        </div>
      )}

      {/* Root Cause — ACT 4 */}
      {parsed.rootCause && (
        <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/40 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-violet-500" />
          <div className="flex items-center gap-2 mb-2 select-none">
            <Cpu className="size-4 text-violet-500" />
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-violet-600">Root Cause Analysis</span>
          </div>
          <p className="text-xs sm:text-[13px] text-slate-700 leading-relaxed text-justify font-medium">
            {formatInlineText(parsed.rootCause)}
          </p>
        </div>
      )}

      {/* Turning Point Box — ACT 5 */}
      {parsed.turningPoint && (
        <div className="rounded-xl bg-slate-900 border border-slate-700 shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-700/60 select-none">
            <span className="text-base leading-none">⚡</span>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-300">The Numbers That Change Everything</span>
          </div>
          <pre className="px-4 py-3 text-[11px] sm:text-xs text-emerald-300 font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap break-words">{parsed.turningPoint}</pre>
        </div>
      )}

      {/* Recommendations Table */}
      {parsed.recommendations.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white/40 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3 select-none">
            <TrendingUp className="size-4 text-emerald-500 animate-pulse" />
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-600">Strategist Recommendations</span>
          </div>
          <div className="space-y-2.5">
            {parsed.recommendations.map((rec, idx) => {
              let badgeColor = "bg-amber-50 text-amber-700 border-amber-200";
              if (rec.priority === 'High') badgeColor = "bg-rose-50 text-rose-700 border-rose-200";
              else if (rec.priority === 'Low') badgeColor = "bg-emerald-50 text-emerald-700 border-emerald-200";

              return (
                <div key={idx} className="flex gap-3 items-start bg-white/80 hover:bg-white p-3.5 rounded-xl border border-slate-200 transition-all shadow-sm hover:shadow-md">
                  <div className="pt-0.5 shrink-0">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-indigo-650 focus:ring-indigo-500 size-3.5 cursor-pointer"
                      id={`rec-${idx}`}
                      defaultChecked={false}
                    />
                  </div>
                  <div className="flex-1 space-y-0.5 min-w-0">
                    <label htmlFor={`rec-${idx}`} className="text-xs sm:text-[13px] font-bold text-slate-800 cursor-pointer block leading-snug">
                      {formatInlineText(rec.action)}
                    </label>
                    <p className="text-[11px] sm:text-xs text-slate-500 leading-relaxed font-medium">
                      {formatInlineText(rec.why)}
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold border shrink-0 uppercase tracking-wider ${badgeColor}`}>
                    {rec.priority}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Also Look At */}
      {parsed.alsoLookAt.length > 0 && (
        <div className="p-4 rounded-xl border border-indigo-50/50 bg-indigo-50/5 shadow-sm">
          <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-2 select-none">🔍 Additional Checklist Items</div>
          <ul className="space-y-2">
            {parsed.alsoLookAt.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2.5 text-xs sm:text-[13px] text-slate-600 font-medium leading-relaxed">
                <span className="text-indigo-400 mt-1 select-none">•</span>
                <span>{formatInlineText(item)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Remaining Text */}
      {parsed.remainingText && (
        <div className="text-xs sm:text-[13px] text-slate-700 leading-relaxed text-justify font-medium">
          {formatInlineText(parsed.remainingText)}
        </div>
      )}

      {/* Ask Me / Clickable Starter Prompts */}
      {parsed.askMe.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-2.5 px-1 flex items-center gap-1.5 select-none">
            <Sparkles className="size-3 text-indigo-500 animate-pulse" />
            Follow-up questions
          </div>
          <div className="flex flex-col gap-2">
            {parsed.askMe.map((question, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(question)}
                className="text-left text-xs sm:text-[13px] px-3.5 py-2.5 bg-gradient-to-r from-indigo-50/20 to-white hover:from-indigo-50/40 hover:to-indigo-50/10 border border-slate-200 hover:border-indigo-500/35 rounded-xl hover:shadow-sm cursor-pointer transition-all text-slate-700 hover:text-indigo-650 font-semibold flex items-center justify-between group"
              >
                <span>{question}</span>
                <span className="text-indigo-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all text-sm font-bold select-none ml-2">→</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

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
          { label: 'Total Spend', value: `₹${(totalSpend / 1000).toFixed(1)}k` },
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

  // Sidebar expand/collapse state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Chart Edit/Pin States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [activeEditWidget, setActiveEditWidget] = useState<any>(null);
  const [activeEditMsgIndex, setActiveEditMsgIndex] = useState<number | null>(null);
  const [activePinWidget, setActivePinWidget] = useState<any>(null);
  const [showHealthBrief, setShowHealthBrief] = useState(false);
  const [timeGreeting, setTimeGreeting] = useState(getTimeBasedGreeting);

  // Multi-Session Chat States
  const [sessions, setSessions] = useState<any[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const loadedSessionIdRef = useRef<string | null>(null);

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
      messages: [],
      createdAt: new Date().toISOString(),
    };
    const updated = [newSession, ...sessions];
    setSessions(updated);
    setActiveSessionId(newSession.id);
    loadedSessionIdRef.current = newSession.id;
    setMessages(newSession.messages);
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
        loadedSessionIdRef.current = updated[0].id;
        setMessages(updated[0].messages);
      } else {
        setActiveSessionId(null);
        loadedSessionIdRef.current = null;
        setMessages([]);
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

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTimeGreeting(getTimeBasedGreeting());
    }, 60 * 1000);

    return () => window.clearInterval(interval);
  }, []);

  // Platform Segment state in AI Strategist Screen
  const [aiPlatformFilter, setAiPlatformFilter] = useState<'meta' | 'google'>('meta');

  // Filter campaigns based on the active platform segment tab
  const filteredCampaigns = campaigns.filter((c: any) => {
    const plat = String(c.platform || c.channel || '').toLowerCase();
    if (aiPlatformFilter === 'meta') {
      return plat.includes('meta') || plat.includes('facebook') || plat.includes('instagram');
    } else {
      return plat.includes('google') || plat.includes('youtube');
    }
  });

  // Stats Card Calculations
  const connectedPlatforms = getConnectedPlatforms(integrations);
  const totalSpend = filteredCampaigns.reduce((sum, c) => sum + (c.spend || c.amount_spent || 0), 0);
  const totalConversions = filteredCampaigns.reduce((sum, c) => sum + (c.conversions || c.conv || 0), 0);
  const totalRevenue = filteredCampaigns.reduce((sum, c) => sum + ((c.roas || 0) * (c.spend || c.amount_spent || 0)), 0);
  const blendedRoas = totalConversions === 0 || totalSpend === 0 ? null : (totalRevenue / totalSpend);
  const alerts = getAlerts(filteredCampaigns, clients);
  // Top Stats Calculations
  const budgetAtRisk = filteredCampaigns
    .filter(c => (c.conversions || c.conv || 0) === 0)
    .reduce((sum, c) => sum + (c.spend || c.amount_spent || 0), 0);
  const scaleOpportunity = filteredCampaigns.reduce((sum, c) => {
    const spend = Number(c.spend || c.amount_spent || 0);
    const clicks = Number(c.clicks || 0);
    const impressions = Number(c.impressions || 0);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    return ctr >= 2 ? sum + spend : sum;
  }, 0);

  const { setPageContext } = useAgentStore();
  const criticalCount = alerts.filter((a: any) => a.priority === 'critical').length;

  useEffect(() => {
    if (activeView === 'ai-analysis') {
      setPageContext({
        page: 'ai_brain',
        data: { criticalCount, budgetAtRisk, scaleOpportunity }
      });
    } else if (activeView === 'ai') {
      setPageContext({
        page: 'ai_analysis',
        data: {}
      });
    }
  }, [activeView, criticalCount, budgetAtRisk, scaleOpportunity, setPageContext]);

  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [copiedMessageKey, setCopiedMessageKey] = useState<string | null>(null);

  // AI Brain Specific States
  const [insights, setInsights] = useState<any[]>([]);
  const [brainScores, setBrainScores] = useState<any[]>([]);
  const [isSyncingBrain, setIsSyncingBrain] = useState(false);
  const [isLoadingBrain, setIsLoadingBrain] = useState(true);

  const ruleInsights = buildRuleInsights(filteredCampaigns);
  const filteredInsights = insights.filter(ins => {
    if (ins.campaignName) {
      return filteredCampaigns.some(c => c.name === ins.campaignName || c.campaignName === ins.campaignName);
    }
    const titleLower = String(ins.title || '').toLowerCase();
    const bodyLower = String(ins.body || '').toLowerCase();
    if (aiPlatformFilter === 'meta') {
      return !titleLower.includes('google') && !bodyLower.includes('google') && !titleLower.includes('youtube') && !bodyLower.includes('youtube');
    } else {
      return titleLower.includes('google') || bodyLower.includes('google') || titleLower.includes('youtube') || bodyLower.includes('youtube');
    }
  });

  const mergedInsights = [...ruleInsights, ...filteredInsights]
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))
    .slice(0, 8);
  const criticalInsights = mergedInsights.filter(i => i.priority === 'critical');
  const warningInsights = mergedInsights.filter(i => i.priority === 'warning');
  const scaleInsights = mergedInsights.filter(i => i.type === 'opportunity');
  const avgHealthScore = filteredCampaigns.length
    ? Math.round(filteredCampaigns.reduce((sum, c: any) => {
      const dbScore = brainScores.find(bs => bs.campaignName === c.name || bs.campaignName === c.campaignName);
      if (dbScore) return sum + Number(dbScore.score || 0);
      const { roas, ctr, frequency, cpc } = getCampaignMetrics(c);
      const fallback = Math.max(0, Math.min(100, Math.round((roas * 25) + (ctr * 15) + (cpc > 0 ? (1 / cpc) * 20 : 0) - (frequency * 10))));
      return sum + fallback;
    }, 0) / filteredCampaigns.length)
    : 0;
  const actionQueue = mergedInsights.slice(0, 5).map((insight, index) => {
    const campaignObj = campaigns.find((c: any) => c.name === insight.campaignName || c.campaignName === insight.campaignName);
    const platform = campaignObj?.platform || campaignObj?.channel || 'Meta';
    return {
      id: insight.id || `${insight.campaignName}-${index}`,
      priority: insight.priority,
      campaignName: insight.campaignName,
      action: insight.suggestedAction,
      metric: insight.metric,
      expectedImpact: insight.expectedImpact || 'Improve campaign efficiency',
      platform,
    };
  });

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
            const cleaned = parsed.map((session: any) => ({
              ...session,
              messages: session.messages.map((msg: any) => {
                if (msg.role === 'assistant' && msg.content) {
                  return {
                    ...msg,
                    content: msg.content.replace(/\n\nWhat would you like to explore today\??/gi, '')
                  };
                }
                return msg;
              })
            }));
            setSessions(cleaned);
            setActiveSessionId(cleaned[0].id);
            loadedSessionIdRef.current = cleaned[0].id;
            setMessages(cleaned[0].messages);
            setIsLoadingHistory(false);
            return;
          }
        }

        const history = await apiService.getChatHistory(tenantId);
        if (history && history.length > 0) {
          const cleanedHistory = history.map((msg: any) => {
            if (msg.role === 'assistant' && msg.content) {
              return {
                ...msg,
                content: msg.content.replace(/\n\nWhat would you like to explore today\??/gi, '')
              };
            }
            return msg;
          });
          const initialSession = {
            id: 'session-db',
            title: 'Agency Performance Brief',
            messages: cleanedHistory,
            createdAt: new Date().toISOString(),
          };
          setSessions([initialSession]);
          setActiveSessionId(initialSession.id);
          loadedSessionIdRef.current = initialSession.id;
          setMessages(cleanedHistory);
          localStorage.setItem(`marketiq.chats.${tenantId}`, JSON.stringify([initialSession]));
        } else {
          // Initialize with a friendly welcome message if no history exists
          const defaultSession = {
            id: 'session-default',
            title: 'New Chat',
            messages: [],
            createdAt: new Date().toISOString(),
          };
          setSessions([defaultSession]);
          setActiveSessionId(defaultSession.id);
          loadedSessionIdRef.current = defaultSession.id;
          setMessages(defaultSession.messages);
          localStorage.setItem(`marketiq.chats.${tenantId}`, JSON.stringify([defaultSession]));
        }
      } catch (err) {
        console.error('Failed to load chat history:', err);
        const errorSession = {
          id: 'session-error',
          title: 'Offline Chat',
          messages: [],
          createdAt: new Date().toISOString(),
        };
        setSessions([errorSession]);
        setActiveSessionId(errorSession.id);
        loadedSessionIdRef.current = errorSession.id;
        setMessages(errorSession.messages);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadHistory();
  }, [tenantId, activeClient]);

  // Sync messages back to active session and persist in localStorage
  useEffect(() => {
    if (activeSessionId && activeSessionId === loadedSessionIdRef.current && messages.length > 0 && sessions.length > 0) {
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
        messages: [],
        createdAt: new Date().toISOString(),
      };
      setSessions([defaultSession]);
      setActiveSessionId(defaultSession.id);
      loadedSessionIdRef.current = defaultSession.id;
      setMessages(defaultSession.messages);
      localStorage.setItem(`marketiq.chats.${tenantId}`, JSON.stringify([defaultSession]));
    }
  }, [sessions, isLoadingHistory, tenantId, activeClient]);

  // Load messages when active session changes
  useEffect(() => {
    if (activeSessionId && sessions.length > 0) {
      const active = sessions.find(s => s.id === activeSessionId);
      if (active && loadedSessionIdRef.current !== activeSessionId) {
        loadedSessionIdRef.current = activeSessionId;
        setMessages(active.messages);
      }
    }
  }, [activeSessionId, sessions]);

  useEffect(() => {
    if (!isLoadingHistory && activeView === 'ai' && (window as any).shouldTriggerSummary) {
      (window as any).shouldTriggerSummary = false;
      handleSend("Summarize the Agency Overview performance metrics");
    }
  }, [isLoadingHistory, activeView]);

  const copyMessageToClipboard = async (content: string, key: string) => {
    if (!content?.trim()) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = content;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }

      setCopiedMessageKey(key);
      toast.success('Copied to clipboard');
      window.setTimeout(() => setCopiedMessageKey(current => current === key ? null : current), 1800);
    } catch (error) {
      console.error('Failed to copy AI Brain message:', error);
      toast.error('Could not copy this message.');
    }
  };

  const pasteFromClipboard = async () => {
    try {
      if (!navigator.clipboard?.readText) {
        toast.error('Clipboard paste is not available in this browser.');
        return;
      }

      const clipboardText = await navigator.clipboard.readText();
      if (!clipboardText.trim()) {
        toast.info('Clipboard is empty.');
        return;
      }

      setInput(current => current.trim() ? `${current}\n${clipboardText}` : clipboardText);
      toast.success('Pasted from clipboard');
    } catch (error) {
      console.error('Failed to paste into AI Brain input:', error);
      toast.error('Allow clipboard access to paste here.');
    }
  };

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
      if (isGenericConversation(promptText)) {
        setIsTyping(false);
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: buildGenericAgentReply(promptText),
          widget: null,
          createdAt: new Date().toISOString(),
        }]);
        return;
      }

      const fallback = buildSeniorFallbackResponse(promptText, campaigns, activeClient?.name);
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
        toast.info('This query was processed using our local campaign rule engine for precision marketing insights.', {
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

          {/* Platform Segment Selector Tabs */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1.5 rounded-2xl w-fit shadow-sm">
            <button
              onClick={() => setAiPlatformFilter('meta')}
              className={`flex items-center justify-center px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border-0 ${aiPlatformFilter === 'meta'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-md font-extrabold'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 bg-transparent'
                }`}
            >
              <MetaIcon />
              Meta Ads Strategy
            </button>
            <button
              onClick={() => setAiPlatformFilter('google')}
              className={`flex items-center justify-center px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border-0 ${aiPlatformFilter === 'google'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-md font-extrabold'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 bg-transparent'
                }`}
            >
              <GoogleAdsIcon />
              Google Ads Strategy
            </button>
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
                    <div className={`mb-2 inline-flex rounded-full border px-2 py-0.5 text-[9px] font-extrabold uppercase ${item.priority === 'critical'
                      ? 'border-rose-200 bg-rose-50 text-rose-700'
                      : item.priority === 'warning'
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      }`}>
                      {item.priority}
                    </div>
                    <a
                      href={getCampaignLink(campaigns.find((c: any) => c.name === item.campaignName || c.campaignName === item.campaignName), 'adsets')}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        const campObj = campaigns.find((c: any) => c.name === item.campaignName || c.campaignName === item.campaignName);
                        window.open(getCampaignLink(campObj, 'campaigns'), '_blank');
                      }}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-bold text-foreground line-clamp-2 hover:text-indigo-650 hover:underline transition-colors cursor-pointer"
                      title={`Left-click: View Adsets on Meta | Right-click: View Campaigns on Meta`}
                    >
                      {item.campaignName}
                    </a>
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
            ) : filteredCampaigns.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground font-semibold">
                No live campaigns found for {aiPlatformFilter === 'meta' ? 'Meta' : 'Google'} Ads. Please connect your integration.
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
                    {filteredCampaigns.map((c: any) => {
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
                            <a
                              href={getCampaignLink(c, 'adsets')}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                window.open(getCampaignLink(c, 'campaigns'), '_blank');
                              }}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-bold text-[13px] leading-[1.3] text-foreground hover:text-indigo-650 hover:underline transition-colors break-words block cursor-pointer"
                              title={`Left-click: View Adsets on Meta | Right-click: View Campaigns on Meta`}
                            >
                              {c.name}
                            </a>
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
                        <a
                          href={getCampaignLink(campaigns.find((c: any) => c.name === insight.campaignName || c.campaignName === insight.campaignName), 'adsets')}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            const campObj = campaigns.find((c: any) => c.name === insight.campaignName || c.campaignName === insight.campaignName);
                            window.open(getCampaignLink(campObj, 'campaigns'), '_blank');
                          }}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] font-bold text-muted-foreground mt-2 inline-block px-2 py-0.5 rounded bg-secondary hover:text-indigo-650 hover:bg-secondary/80 transition-colors cursor-pointer"
                          title={`Left-click: View Adsets on Meta | Right-click: View Campaigns on Meta`}
                        >
                          Campaign: {insight.campaignName}
                        </a>

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
        {/* Left Sidebar */}
        <motion.div
          animate={{ width: isSidebarCollapsed ? 64 : 256 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className="bg-slate-50/80 border-r border-slate-200 flex flex-col h-full shrink-0 overflow-hidden relative"
        >
          {/* Logo & Brand */}
          <div className={`px-4 py-4 border-b border-slate-200 flex items-center justify-between gap-2.5 ${isSidebarCollapsed ? 'px-3' : ''}`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="size-8 rounded-xl bg-gradient-to-tr from-violet-600 via-indigo-650 to-pink-500 text-white flex items-center justify-center shadow-md shadow-indigo-500/10 shrink-0">
                <Sparkles className="size-4.5 text-white" />
              </div>
              {!isSidebarCollapsed && (
                <div>
                  <span className="font-display font-extrabold text-xs text-slate-800 tracking-tight block leading-none">AI Brain</span>
                  <span className="text-[9px] font-extrabold text-indigo-500 uppercase tracking-widest block mt-1"></span>
                </div>
              )}
            </div>
            <button
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-650 hover:bg-slate-200/50 border-0 bg-transparent cursor-pointer shrink-0 transition-colors"
            >
              {isSidebarCollapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
            </button>
          </div>

          {/* Search Box */}
          <div className="px-3 py-2 flex-shrink-0 flex justify-center">
            {isSidebarCollapsed ? (
              <button
                onClick={() => setIsSidebarCollapsed(false)}
                className="relative flex items-center justify-center size-9 bg-white border border-slate-200 hover:border-slate-300 rounded-xl shadow-sm transition-all cursor-pointer"
              >
                <Search className="size-3.5 text-slate-400" />
              </button>
            ) : (
              <div className="relative flex items-center w-full bg-white border border-slate-200 hover:border-slate-300 rounded-xl px-2.5 py-1.5 shadow-sm transition-all">
                <Search className="size-3.5 text-slate-400 mr-2 shrink-0" />
                <input
                  type="text"
                  placeholder="Search"
                  className="w-full bg-transparent border-0 p-0 text-[11px] font-semibold text-slate-700 placeholder:text-slate-400 focus:ring-0 focus:outline-none"
                />
                <kbd className="font-mono bg-slate-100 border border-slate-200 px-1 py-0.5 rounded text-[8px] font-extrabold text-slate-400 select-none cursor-default shrink-0">
                  ⌘K
                </kbd>
              </div>
            )}
          </div>

          {/* Navigation Items */}
          <div className="px-2 py-1 space-y-0.5 border-b border-slate-200/50 flex-shrink-0">
            <button className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center py-2.5' : 'gap-3 px-3 py-2'} rounded-xl text-[11px] font-bold text-slate-600 hover:bg-slate-200/40 hover:text-slate-800 transition-colors border-0 bg-transparent cursor-pointer`}>
              <Home className="size-3.5 text-slate-400" />
              {!isSidebarCollapsed && <span>Home</span>}
            </button>
            <button className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center py-2.5' : 'gap-3 px-3 py-2'} rounded-xl text-[11px] font-bold text-slate-650 hover:bg-slate-200/40 hover:text-slate-850 transition-colors border-0 bg-transparent cursor-pointer`}>
              <Compass className="size-3.5 text-slate-400" />
              {!isSidebarCollapsed && <span>Explore</span>}
            </button>
            <button className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center py-2.5' : 'gap-3 px-3 py-2'} rounded-xl text-[11px] font-bold text-slate-650 hover:bg-slate-200/40 hover:text-slate-850 transition-colors border-0 bg-transparent cursor-pointer`}>
              <BookOpen className="size-3.5 text-slate-400" />
              {!isSidebarCollapsed && <span>Library</span>}
            </button>
            <button className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center py-2.5' : 'gap-3 px-3 py-2'} rounded-xl text-[11px] font-bold text-slate-650 hover:bg-slate-200/40 hover:text-slate-850 transition-colors border-0 bg-transparent cursor-pointer`}>
              <HistoryIcon className="size-3.5 text-slate-400" />
              {!isSidebarCollapsed && <span>History</span>}
            </button>
          </div>

          {/* Recent sessions scroll area */}
          <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
            <div className="space-y-1">
              {!isSidebarCollapsed && (
                <div className="px-3 mb-2 text-[9px] font-extrabold uppercase tracking-widest text-slate-400">
                  Recent Chats
                </div>
              )}
              {sessions.map(s => {
                const isActive = s.id === activeSessionId;
                const isEditing = s.id === editingSessionId;
                return (
                  <div
                    key={s.id}
                    onClick={() => {
                      if (!isEditing) {
                        setActiveSessionId(s.id);
                        loadedSessionIdRef.current = s.id;
                        setMessages(s.messages);
                      }
                    }}
                    className={`group flex items-center justify-between ${isSidebarCollapsed ? 'justify-center py-2.5' : 'px-3 py-2.5'} rounded-xl text-[11px] cursor-pointer transition-all ${isActive
                      ? 'bg-indigo-50/70 text-indigo-700 font-bold border-l-2 border-indigo-500'
                      : 'text-slate-600 hover:bg-slate-200/40 hover:text-slate-800'
                      }`}
                  >
                    {isEditing && !isSidebarCollapsed ? (
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
                        <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-2.5 min-w-0 flex-1'}`}>
                          <Sparkles className={`size-3.5 shrink-0 ${isActive ? 'text-indigo-500' : 'text-slate-450'}`} />
                          {!isSidebarCollapsed && <span className="truncate pr-1">{s.title}</span>}
                        </div>
                        {!isSidebarCollapsed && (
                          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-all">
                            <button
                              onClick={(e) => startRenameSession(s.id, s.title, e)}
                              title="Rename chat thread"
                              className="p-1 rounded text-slate-400 hover:text-indigo-650 hover:bg-indigo-50 border-0 bg-transparent cursor-pointer"
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
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Profile Card Bottom Section */}
          <div className="p-3 border-t border-slate-200 bg-slate-50 flex-shrink-0">
            <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center p-1' : 'justify-between p-2'} rounded-xl bg-white border border-slate-200 shadow-sm`}>
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="size-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 border border-indigo-200 text-indigo-700 font-extrabold text-[11px] shadow-sm select-none">
                  MA
                </div>
                {!isSidebarCollapsed && (
                  <div className="min-w-0 leading-tight">
                    <span className="font-bold text-[11px] text-slate-800 block truncate">Mahindra Admin</span>
                    <span className="text-[9px] font-semibold text-slate-400 block truncate">mahindra@cai.media</span>
                  </div>
                )}
              </div>
              {!isSidebarCollapsed && <ChevronDown className="size-4 text-slate-400 ml-2 cursor-pointer hover:text-slate-650 shrink-0" />}
            </div>
          </div>
        </motion.div>

        {/* Right Canvas: Conversational area */}
        <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden bg-white">
          {/* Title Header Block - Styled like mockup */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 flex-shrink-0 px-4 sm:px-6 pt-4">
            {/* Model Selector styled exactly like the screenshot! */}
            <div className="flex items-center gap-2.5">
              <div className="relative">





              </div>

            </div>

            {/* Top Right Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={createNewChat}
                className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[11.5px] font-bold shadow-md cursor-pointer transition-all hover:scale-[1.01]"
              >
                <Plus className="size-3.5 text-white" />
                <span>New Chat</span>
              </button>

              <div className="size-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 border border-indigo-200 text-indigo-700 font-extrabold text-[11px] shadow-sm select-none">
                MA
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
                    <span className="text-xs font-semibold text-slate-400 font-sans">Loading analysis workspace...</span>
                  </div>
                ) : (
                  <>
                    {messages.map((msg, i) => {
                      const isUser = msg.role === 'user';
                      const messageKey = String(msg.id || i);
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
                          <div className={`size-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm font-bold text-xs ${isUser
                            ? 'bg-slate-100 border border-slate-205 text-slate-700'
                            : 'bg-gradient-to-tr from-violet-600 via-indigo-650 to-pink-500 text-white shadow-glow relative'
                            }`}>
                            {!isUser && <div className="absolute inset-0 bg-indigo-500/10 blur-sm rounded-xl animate-pulse" />}
                            {isUser ? 'PM' : <Sparkles className="size-4 relative z-10" />}
                          </div>

                          {/* Content Bubble */}
                          <div className={`flex flex-col gap-1.5 max-w-[85%] ${isUser ? 'items-end' : 'items-start'} w-full`}>
                            <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${isUser
                              ? 'bg-slate-900 text-white border border-slate-950 rounded-tr-none shadow-md text-justify font-medium'
                              : 'text-slate-800 font-normal leading-relaxed text-justify pr-2 w-full border-l-2 border-indigo-500/20 pl-4 select-text'
                              }`}>
                              {isUser ? (
                                <p className="break-words select-text">{msg.content}</p>
                              ) : (
                                <StructuredMessageRenderer content={msg.content} handleSend={handleSend} />
                              )}
                            </div>

                            {!isUser && msg.content && (
                              <button
                                type="button"
                                onClick={() => copyMessageToClipboard(msg.content, messageKey)}
                                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-slate-200 bg-white text-[10px] font-bold text-slate-500 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 transition-colors select-none"
                                aria-label="Copy AI Brain response"
                              >
                                {copiedMessageKey === messageKey ? (
                                  <>
                                    <Check className="size-3" />
                                    Copied
                                  </>
                                ) : (
                                  <>
                                    <Copy className="size-3" />
                                    Copy
                                  </>
                                )}
                              </button>
                            )}

                            {/* If Assistant contains widget data, render it */}
                            {!isUser && msg.widget && Array.isArray(msg.widget.data) && msg.widget.data.length > 0 && (
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
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-slate-650 bg-white border border-slate-200 hover:border-indigo-500/35 hover:text-indigo-600 rounded-xl hover:shadow-sm transition-all cursor-pointer"
                                  >
                                    <Pin className="size-3 text-slate-550" />
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
                    })}

                    {/* Sparkling Welcome Hero Hub if no messages */}
                    {messages.length <= 1 && !isTyping && (
                      <div className="flex-1 flex flex-col items-center justify-center py-8 px-4 max-w-2xl mx-auto text-center space-y-7 animate-fade-in select-none relative z-10 w-full">
                        {/* Floating Glowing Background Aura */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[380px] h-[380px] bg-gradient-to-tr from-violet-500/10 via-indigo-550/8 to-pink-500/10 blur-[80px] rounded-full pointer-events-none z-0 animate-pulse" />

                        {/* Redesigned Welcome Logo Container (w-40 h-40) */}
                        <div className="relative w-40 h-40 mx-auto select-none flex items-center justify-center z-10">
                          {/* Inject CSS keyframes for custom particle orbiting */}
                          <style dangerouslySetInnerHTML={{__html: `
                            @keyframes orbit {
                              from { transform: rotate(0deg); }
                              to { transform: rotate(360deg); }
                            }
                            .particle-orbit {
                              animation: orbit 6s linear infinite;
                            }
                          `}} />

                          {/* OUTER HALO: Large static soft circle */}
                          <div className="absolute w-48 h-48 rounded-full bg-indigo-500/[0.08] blur-2xl pointer-events-none z-0" />

                          {/* PULSE CORE: Pulsing radial glow (2s) */}
                          <div 
                            className="absolute w-24 h-24 rounded-full bg-gradient-to-tr from-indigo-500/30 to-cyan-400/30 blur-xl animate-pulse" 
                            style={{ animationDuration: '2s' }}
                          />

                          {/* ENERGY RINGS: 3D sphere illusion with tilted ellipses */}
                          {/* Ellipse Ring 1: 20deg tilt, spins clockwise (10s) */}
                          <div className="absolute w-[124px] h-[48px] origin-center pointer-events-none" style={{ transform: 'rotate(20deg)' }}>
                            <div 
                              className="w-full h-full rounded-full border border-indigo-400/30 animate-spin" 
                              style={{ animationDuration: '10s' }}
                            />
                          </div>

                          {/* Ellipse Ring 2: -20deg tilt, counter-spins (14s) */}
                          <div className="absolute w-[124px] h-[48px] origin-center pointer-events-none" style={{ transform: 'rotate(-20deg)' }}>
                            <div 
                              className="w-full h-full rounded-full border border-indigo-400/30 animate-spin" 
                              style={{ animationDuration: '14s', animationDirection: 'reverse' }}
                            />
                          </div>

                          {/* PARTICLE SYSTEM: 6 orbiting dots (6s) */}
                          <div className="absolute w-0 h-0 flex items-center justify-center particle-orbit pointer-events-none z-20">
                            <div className="absolute w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_6px_rgba(99,102,241,0.8)]" style={{ transform: 'rotate(0deg) translate(52px)' }} />
                            <div className="absolute w-1.5 h-1.5 rounded-full bg-violet-500 shadow-[0_0_6px_rgba(139,92,246,0.8)]" style={{ transform: 'rotate(60deg) translate(52px)' }} />
                            <div className="absolute w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_6px_rgba(99,102,241,0.8)]" style={{ transform: 'rotate(120deg) translate(52px)' }} />
                            <div className="absolute w-1.5 h-1.5 rounded-full bg-violet-500 shadow-[0_0_6px_rgba(139,92,246,0.8)]" style={{ transform: 'rotate(180deg) translate(52px)' }} />
                            <div className="absolute w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_6px_rgba(99,102,241,0.8)]" style={{ transform: 'rotate(240deg) translate(52px)' }} />
                            <div className="absolute w-1.5 h-1.5 rounded-full bg-violet-500 shadow-[0_0_6px_rgba(139,92,246,0.8)]" style={{ transform: 'rotate(300deg) translate(52px)' }} />
                          </div>

                          {/* CENTER: Custom Brain SVG with indigo-to-cyan gradient */}
                          <svg viewBox="0 0 100 100" className="w-16 h-16 relative z-10 select-none pointer-events-none filter drop-shadow-[0_4px_12px_rgba(99,102,241,0.15)]">
                            <defs>
                              <linearGradient id="brainGradCyan" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#6366f1" /> {/* indigo-500 */}
                                <stop offset="100%" stopColor="#06b6d4" /> {/* cyan-500 */}
                              </linearGradient>
                            </defs>
                            {/* Left Hemisphere */}
                            <path
                              d="M48 20 C36 20 28 28 28 38 C22 38 18 43 18 50 C18 57 23 62 29 62 C29 69 36 75 45 75 C47 75 48 74 48 74 Z"
                              fill="url(#brainGradCyan)"
                            />
                            {/* Right Hemisphere */}
                            <path
                              d="M52 20 C64 20 72 28 72 38 C78 38 82 43 82 50 C82 57 77 62 71 62 C71 69 64 75 55 75 C53 75 52 74 52 74 Z"
                              fill="url(#brainGradCyan)"
                            />
                            {/* Neural lines inside */}
                            <path d="M38 32 C42 35 45 32 46 28" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.75" />
                            <path d="M30 45 Q38 48 45 42" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.75" />
                            <path d="M32 55 Q40 54 44 48" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.75" />
                            <path d="M38 68 C42 65 44 60 45 55" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.75" />
                            <path d="M62 32 C58 35 55 32 54 28" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.75" />
                            <path d="M70 45 Q62 48 55 42" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.75" />
                            <path d="M68 55 Q60 54 56 48" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.75" />
                            <path d="M62 68 C58 65 56 60 55 55" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.75" />
                            
                            {/* Glossy highlight at top-left */}
                            <ellipse cx="38" cy="28" rx="7" ry="3.5" transform="rotate(-30 38 28)" fill="white" opacity="0.35" />
                          </svg>
                        </div>

                        {/* Greetings Header styled exactly like the screenshot */}
                        <div className="space-y-1.5 z-10">
                          <h2 className="text-3xl font-extrabold tracking-tight text-slate-800"
                            style={{ fontFamily: "'Poppins', sans-serif" }}>
                            {timeGreeting} Venpep
                          </h2>
                          <h3 className="text-xl font-bold tracking-tight text-slate-500 font-sans">
                            How Can I <span className="text-indigo-600 font-extrabold">Assist You Today?</span>
                          </h3>
                        </div>




                      </div>
                    )}
                  </>
                )}
              </AnimatePresence>

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
                    <span className="text-[10px] text-indigo-600 font-extrabold uppercase tracking-widest ml-1 font-sans">MIP AI Brain is thinking...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Sticky bottom input floating capsule container */}
          <div className="border-t border-slate-200/60 p-4 bg-gradient-to-t from-white via-white/95 to-transparent flex-shrink-0 sticky bottom-0 z-20">
            <div className="max-w-3xl w-full mx-auto">



              {/* Modern elevated capsule input box matching welcome screen style */}
              <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl p-2.5 shadow-md focus-within:shadow-[0_12px_40px_rgb(99,102,241,0.06)] focus-within:border-indigo-550/60 transition-all">
                <Sparkles className="size-4 text-indigo-550 shrink-0" />
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={activeClient ? `Ask me about ${activeClient.name}'s data (e.g. CPC outliers, fatigue, zero conversions)...` : "Ask me anything about client campaign databases..."}
                  rows={1}
                  className="flex-1 max-h-24 min-h-[2.25rem] bg-transparent border-0 focus:ring-0 focus:outline-none text-xs sm:text-sm text-slate-800 placeholder:text-slate-455 py-1.5 px-0 resize-none font-sans leading-relaxed"
                />
                <button
                  type="button"
                  onClick={pasteFromClipboard}
                  className="size-9 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 flex items-center justify-center hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-650 cursor-pointer transition-all shrink-0"
                  aria-label="Paste from clipboard"
                  title="Paste from clipboard"
                >
                  <ClipboardPaste className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleSend()}
                  disabled={!input.trim()}
                  className="size-9 rounded-xl bg-gradient-to-r from-violet-600 via-indigo-650 to-pink-500 text-white flex items-center justify-center hover:shadow-glow shadow-md disabled:opacity-40 disabled:hover:shadow-none disabled:cursor-not-allowed cursor-pointer transition-all border-0 shrink-0 hover:scale-[1.03] active:scale-95"
                >
                  <Send className="size-4" />
                </button>
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
                <option value="bubble_chart">Bubble Chart</option>
                <option value="scatter_chart">Scatter Plot</option>
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

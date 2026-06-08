import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ChatGroq } from '@langchain/groq';
import { SystemMessage } from '@langchain/core/messages';
// @ts-ignore
import * as docx from 'docx';
import { prisma } from '../services/prisma.service.js';
import { requireJwtAuth, type AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { query } from '../services/db.service.js';
import { ensureReportBreakdownTables } from '../services/report-breakdowns.service.js';

const {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableCell,
  TableRow,
  WidthType,
  AlignmentType,
  Packer,
  Footer,
} = docx as any;

export const reportRouter = Router();

// Helper to format currency in INR
function formatInr(val: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(val || 0);
}

// Helper to format CPC in INR
function formatCpc(val: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(val || 0);
}

// Helper to create styled TableCell
function createTableCell(text: string, options: {
  bold?: boolean;
  color?: string;
  size?: number;
  shading?: string;
  align?: any;
  width?: number;
  italic?: boolean;
  italics?: boolean;
} = {}) {
  return new TableCell({
    width: options.width ? { size: options.width, type: WidthType.PERCENTAGE } : undefined,
    shading: options.shading ? { fill: options.shading } : undefined,
    children: [
      new Paragraph({
        alignment: options.align || AlignmentType.LEFT,
        spacing: { before: 80, after: 80 },
        children: [
          new TextRun({
            text,
            bold: options.bold || false,
            italics: options.italic || options.italics || false,
            color: options.color || '333333',
            size: options.size || 20, // 20 dxa = 10 pt
            font: 'Arial',
          }),
        ],
      }),
    ],
  });
}

// GET /api/v1/agency/report-breakdowns?clientId=&dateFrom=&dateTo=
reportRouter.get('/agency/report-breakdowns', requireJwtAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const tenantId = String(req.auth!.tenantId || 'agency');
    const clientId = String(req.query.clientId || 'cai_mahindra');
    const dateFrom = String(req.query.dateFrom || '2026-05-01');
    const dateTo = String(req.query.dateTo || '2026-05-31');
    await ensureReportBreakdownTables();

    const locations = await query<{ name: string; leads: number; impressions: number; clicks: number; reach: number }>(
      `
        SELECT
          region AS name,
          SUM(conversions)::INTEGER AS leads,
          SUM(impressions)::INTEGER AS impressions,
          SUM(clicks)::INTEGER AS clicks,
          SUM(reach)::INTEGER AS reach
        FROM campaign_location_breakdowns
        WHERE tenant_id = $1
          AND ($2::TEXT = '' OR client_id = $2)
          AND date >= $3::TIMESTAMPTZ
          AND date <= $4::TIMESTAMPTZ
        GROUP BY region
        HAVING SUM(conversions) > 0 OR SUM(clicks) > 0 OR SUM(impressions) > 0
        ORDER BY leads DESC, clicks DESC, impressions DESC
        LIMIT 12
      `,
      [tenantId, clientId, dateFrom, dateTo],
    );

    const ageGroups = await query<{ name: string; leads: number; impressions: number; clicks: number; reach: number }>(
      `
        SELECT
          age AS name,
          SUM(conversions)::INTEGER AS leads,
          SUM(impressions)::INTEGER AS impressions,
          SUM(clicks)::INTEGER AS clicks,
          SUM(reach)::INTEGER AS reach
        FROM campaign_demographic_breakdowns
        WHERE tenant_id = $1
          AND ($2::TEXT = '' OR client_id = $2)
          AND date >= $3::TIMESTAMPTZ
          AND date <= $4::TIMESTAMPTZ
        GROUP BY age
        HAVING SUM(conversions) > 0 OR SUM(clicks) > 0 OR SUM(impressions) > 0
        ORDER BY
          CASE age
            WHEN '18-24' THEN 1
            WHEN '25-34' THEN 2
            WHEN '35-44' THEN 3
            WHEN '45-54' THEN 4
            WHEN '55-64' THEN 5
            WHEN '65+' THEN 6
            ELSE 7
          END
      `,
      [tenantId, clientId, dateFrom, dateTo],
    );

    const genders = await query<{ name: string; leads: number; impressions: number; clicks: number; reach: number }>(
      `
        SELECT
          gender AS name,
          SUM(conversions)::INTEGER AS leads,
          SUM(impressions)::INTEGER AS impressions,
          SUM(clicks)::INTEGER AS clicks,
          SUM(reach)::INTEGER AS reach
        FROM campaign_demographic_breakdowns
        WHERE tenant_id = $1
          AND ($2::TEXT = '' OR client_id = $2)
          AND date >= $3::TIMESTAMPTZ
          AND date <= $4::TIMESTAMPTZ
        GROUP BY gender
        HAVING SUM(conversions) > 0 OR SUM(clicks) > 0 OR SUM(impressions) > 0
        ORDER BY leads DESC, clicks DESC, impressions DESC
      `,
      [tenantId, clientId, dateFrom, dateTo],
    );

    return res.json({ locations, ageGroups, genders, leadStatus: null });
  } catch (error) {
    return next(error);
  }
});

// GET /api/v1/agency/reports
reportRouter.get('/agency/reports', requireJwtAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const tenantId = String(req.auth!.tenantId || 'agency');
    const reports = await prisma.agencyReport.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });

    const origin = `${req.protocol}://${req.get('host')}`;
    return res.json({
      reports: reports.map(report => {
        const createdAt = new Date(report.createdAt);
        return {
          id: report.id,
          name: `MarketIQ Agency Report - ${createdAt.toLocaleDateString('en-IN')}`,
          createdAt: report.createdAt,
          downloadUrl: `${origin}/api/v1/agency/report/${report.id}/download`,
          shareLink: `${origin}/api/v1/agency/report/share/${report.shareToken}`,
          expiresAt: new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        };
      }),
    });
  } catch (error) {
    return next(error);
  }
});

// POST /api/v1/agency/report
reportRouter.post('/agency/report', requireJwtAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const tenantId = String(req.auth!.tenantId || 'agency');

    // 1. Fetch campaigns for the last 60 days to compare trends
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const rawCampaigns = await prisma.campaignData.findMany({
      where: {
        tenantId,
        date: { gte: sixtyDaysAgo },
      },
    });

    const currentCampaigns = rawCampaigns.filter(c => new Date(c.date) >= thirtyDaysAgo);
    const previousCampaigns = rawCampaigns.filter(c => new Date(c.date) >= sixtyDaysAgo && new Date(c.date) < thirtyDaysAgo);

    // Current metrics
    const totalSpend = currentCampaigns.reduce((sum, c) => sum + Number(c.spend || 0), 0);
    const totalClicks = currentCampaigns.reduce((sum, c) => sum + Number(c.clicks || 0), 0);
    const totalConversions = currentCampaigns.reduce((sum, c) => sum + Number(c.conversions || 0), 0);
    const totalImpressions = currentCampaigns.reduce((sum, c) => sum + Number(c.impressions || 0), 0);
    const totalActionValue = currentCampaigns.reduce((sum, c) => sum + Number(c.actionValue || 0), 0);
    const avgCPC = totalClicks > 0 ? totalSpend / totalClicks : 0;
    const blendedROAS = totalSpend > 0 ? totalActionValue / totalSpend : 0;

    // Active campaigns count
    const uniqueCampaigns = Array.from(new Set(currentCampaigns.map(c => c.campaignId)));
    const activeCampaigns = uniqueCampaigns.filter(cid => {
      const campRows = currentCampaigns.filter(c => c.campaignId === cid);
      const latestRow = campRows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      return latestRow?.status?.toLowerCase() === 'active';
    }).length;

    // Previous metrics for trends
    const prevSpend = previousCampaigns.reduce((sum, c) => sum + Number(c.spend || 0), 0);
    const prevClicks = previousCampaigns.reduce((sum, c) => sum + Number(c.clicks || 0), 0);
    const prevConversions = previousCampaigns.reduce((sum, c) => sum + Number(c.conversions || 0), 0);
    const prevActionValue = previousCampaigns.reduce((sum, c) => sum + Number(c.actionValue || 0), 0);
    const prevCPC = prevClicks > 0 ? prevSpend / prevClicks : 0;
    const prevROAS = prevSpend > 0 ? prevActionValue / prevSpend : 0;

    // Trends (percentage differences)
    const formatTrend = (curr: number, prev: number) => {
      if (!prev) return '+0.0%';
      const pct = ((curr - prev) / prev) * 100;
      return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
    };

    const spendTrend = formatTrend(totalSpend, prevSpend);
    const cpcTrend = formatTrend(avgCPC, prevCPC);
    const convTrend = formatTrend(totalConversions, prevConversions);
    const roasTrend = formatTrend(blendedROAS, prevROAS);

    // Group campaigns in the last 30 days by name to aggregate properly
    const aggregatedCampaigns = currentCampaigns.reduce((acc: any, c) => {
      const name = c.campaignName;
      if (!acc[name]) {
        acc[name] = {
          name,
          platform: c.platform,
          status: c.status,
          spend: 0,
          clicks: 0,
          impressions: 0,
          conversions: 0,
          actionValue: 0,
          frequencyMax: 0,
          count: 0,
          frequencySum: 0,
        };
      }
      acc[name].spend += Number(c.spend || 0);
      acc[name].clicks += Number(c.clicks || 0);
      acc[name].impressions += Number(c.impressions || 0);
      acc[name].conversions += Number(c.conversions || 0);
      acc[name].actionValue += Number(c.actionValue || 0);
      acc[name].frequencySum += Number(c.frequency || 0);
      acc[name].count += 1;
      return acc;
    }, {});

    const campaignList = Object.values(aggregatedCampaigns).map((c: any) => {
      const spend = c.spend;
      const clicks = c.clicks;
      const conversions = c.conversions;
      const impressions = c.impressions;
      const frequency = c.count > 0 ? c.frequencySum / c.count : 0;
      return {
        name: c.name,
        platform: c.platform,
        status: c.status,
        spend,
        clicks,
        conversions,
        impressions,
        frequency,
        cpc: clicks > 0 ? spend / clicks : 0,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      };
    });

    // 2. Platform Breakdown
    const platformMap = campaignList.reduce((acc: any, c) => {
      const plat = c.platform || 'Meta';
      if (!acc[plat]) {
        acc[plat] = { platform: plat, spend: 0, clicks: 0, impressions: 0, conversions: 0 };
      }
      acc[plat].spend += c.spend;
      acc[plat].clicks += c.clicks;
      acc[plat].impressions += c.impressions;
      acc[plat].conversions += c.conversions;
      return acc;
    }, {});

    const platformBreakdown = Object.values(platformMap).map((p: any) => ({
      ...p,
      ctr: p.impressions > 0 ? (p.clicks / p.impressions) * 100 : 0,
      cpc: p.clicks > 0 ? p.spend / p.clicks : 0,
    }));

    // 3. Top 5 Campaigns by Spend
    const topCampaigns = [...campaignList]
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 5);

    // 4. Campaigns Needing Attention (conversions = 0, spend > 1000)
    const zeroConversionCampaigns = campaignList.filter(c => c.conversions === 0 && c.spend > 1000);

    // 5. Frequency Warnings (> 3.0)
    const frequencyWarnings = campaignList.filter(c => c.frequency > 3.0);

    // 6. AI Recommendations via Groq
    let recommendations: string[] = [
      'Scale budget allocation for high-performing Meta lead campaigns to capitalize on the lower blended CPC.',
      'Audit visual and copy fatigue for creative elements on campaigns exceeding a frequency of 3.0.',
      'Re-engage low converting channels with retargeting custom audiences or refresh landing page layouts.',
    ];

    const apiKey = process.env.GROQ_API_KEY;
    if (apiKey) {
      try {
        const summaryMetrics = {
          totalSpend,
          avgCPC,
          totalConversions,
          blendedROAS,
          platformBreakdown: platformBreakdown.map(p => ({
            name: p.platform,
            spend: p.spend,
            conversions: p.conversions,
            cpc: p.cpc,
          })),
          zeroConversionCount: zeroConversionCampaigns.length,
          frequencyWarningCount: frequencyWarnings.length,
        };

        const model = new ChatGroq({
          apiKey,
          model: 'llama-3.3-70b-versatile',
          temperature: 0.3,
          modelKwargs: {
            response_format: { type: 'json_object' },
          },
        } as any);

        const systemPrompt = `You are a senior marketing strategist. Write 3 actionable, high-impact marketing recommendations for a client performance report. Data: ${JSON.stringify(summaryMetrics)}. Return exactly a JSON object with a single field 'recommendations' containing an array of 3 plain text strings. Format: { "recommendations": ["string1", "string2", "string3"] }. Keep each recommendation under 2 sentences, clear, precise, and containing actual numbers from the data where relevant. Do not output markdown or headers.`;

        const response = await model.invoke([
          new SystemMessage(systemPrompt),
        ]);

        const responseText = String(response.content);
        if (responseText) {
          const parsed = JSON.parse(responseText.trim());
          if (Array.isArray(parsed.recommendations) && parsed.recommendations.length > 0) {
            recommendations = parsed.recommendations;
          }
        }
      } catch (groqErr) {
        console.error('Groq recommendations generation failed inside report route:', groqErr);
      }
    }

    // 7. Assemble DOCX using docx library
    const docChildren: any[] = [];

    // Title / Cover Page Section
    docChildren.push(
      new Paragraph({ text: '', spacing: { before: 1200 } }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: 'MarketIQ · Agency Performance Report',
            bold: true,
            size: 64, // 32pt
            color: '1F4E78', // Navy
            font: 'Arial',
          }),
        ],
      }),
      new Paragraph({ text: '', spacing: { before: 200 } }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: 'Performance Report — May 2026',
            bold: true,
            size: 36, // 18pt
            color: '333333',
            font: 'Arial',
          }),
        ],
      }),
      new Paragraph({ text: '', spacing: { before: 200 } }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: 'Generated by MarketIQ · Venpep',
            size: 24, // 12pt
            color: '666666',
            font: 'Arial',
          }),
        ],
      }),
      new Paragraph({ text: '', spacing: { before: 100 } }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: `Date Generated: ${new Date().toLocaleDateString('en-IN', { dateStyle: 'long' })}`,
            size: 20, // 10pt
            color: '888888',
            font: 'Arial',
          }),
        ],
      }),
      new Paragraph({ text: '', spacing: { before: 1200 } }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: 'Confidential Report for Authorized Recipients Only',
            size: 16, // 8pt
            color: '999999',
            font: 'Arial',
            italics: true,
          }),
        ],
      })
    );

    // Section 1 — Executive Summary Table
    docChildren.push(
      new Paragraph({
        text: 'Section 1 — Executive Summary',
        bold: true,
        size: 28, // 14pt
        color: '1F4E78',
        font: 'Arial',
        pageBreakBefore: true,
        spacing: { before: 200, after: 150 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: 'Below is a consolidated summary of key performance indicators (KPIs) over the last 30 days, evaluated alongside their vs last month trend metrics.',
            font: 'Arial',
            size: 22,
          }),
        ],
        spacing: { after: 200 },
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              createTableCell('Metric Name', { bold: true, shading: '1F4E78', color: 'FFFFFF', width: 40 }),
              createTableCell('Value', { bold: true, shading: '1F4E78', color: 'FFFFFF', width: 30 }),
              createTableCell('vs Last Month Trend', { bold: true, shading: '1F4E78', color: 'FFFFFF', width: 30 }),
            ],
          }),
          new TableRow({
            children: [
              createTableCell('Total Spend', { bold: true }),
              createTableCell(formatInr(totalSpend)),
              createTableCell(spendTrend, { color: spendTrend.startsWith('+') ? '2E7D32' : 'C62828', bold: true }),
            ],
          }),
          new TableRow({
            children: [
              createTableCell('Avg CPC', { bold: true }),
              createTableCell(formatCpc(avgCPC)),
              createTableCell(cpcTrend, { color: cpcTrend.startsWith('-') ? '2E7D32' : 'C62828', bold: true }), // negative CPC is healthy/green
            ],
          }),
          new TableRow({
            children: [
              createTableCell('Total Conversions', { bold: true }),
              createTableCell(totalConversions.toLocaleString('en-IN')),
              createTableCell(convTrend, { color: convTrend.startsWith('+') ? '2E7D32' : 'C62828', bold: true }),
            ],
          }),
          new TableRow({
            children: [
              createTableCell('Blended ROAS', { bold: true }),
              createTableCell(`${blendedROAS.toFixed(2)}x`),
              createTableCell(roasTrend, { color: roasTrend.startsWith('+') ? '2E7D32' : 'C62828', bold: true }),
            ],
          }),
        ],
      })
    );

    // Section 2 — Platform Breakdown
    const breakdownRows = platformBreakdown.map(p => new TableRow({
      children: [
        createTableCell(p.platform),
        createTableCell(formatInr(p.spend)),
        createTableCell(p.clicks.toLocaleString('en-IN')),
        createTableCell(p.impressions.toLocaleString('en-IN')),
        createTableCell(`${p.ctr.toFixed(2)}%`),
        createTableCell(formatCpc(p.cpc)),
        createTableCell(p.conversions.toLocaleString('en-IN')),
      ],
    }));

    docChildren.push(
      new Paragraph({
        text: 'Section 2 — Platform Breakdown',
        bold: true,
        size: 28, // 14pt
        color: '1F4E78',
        font: 'Arial',
        pageBreakBefore: true,
        spacing: { before: 200, after: 150 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: 'Aggregated analytics breakdown sorted dynamically by platform networks to compare click volume, spend pacing, and conversion yield efficiency.',
            font: 'Arial',
            size: 22,
          }),
        ],
        spacing: { after: 200 },
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              createTableCell('Platform', { bold: true, shading: '1F4E78', color: 'FFFFFF' }),
              createTableCell('Spend', { bold: true, shading: '1F4E78', color: 'FFFFFF' }),
              createTableCell('Clicks', { bold: true, shading: '1F4E78', color: 'FFFFFF' }),
              createTableCell('Impressions', { bold: true, shading: '1F4E78', color: 'FFFFFF' }),
              createTableCell('CTR', { bold: true, shading: '1F4E78', color: 'FFFFFF' }),
              createTableCell('CPC', { bold: true, shading: '1F4E78', color: 'FFFFFF' }),
              createTableCell('Conversions', { bold: true, shading: '1F4E78', color: 'FFFFFF' }),
            ],
          }),
          ...breakdownRows,
        ],
      })
    );

    // Section 3 — Top 5 Campaigns by Spend
    const topRows = topCampaigns.map(c => new TableRow({
      children: [
        createTableCell(c.name, { bold: true }),
        createTableCell(formatInr(c.spend)),
        createTableCell(formatCpc(c.cpc)),
        createTableCell(`${c.ctr.toFixed(2)}%`),
        createTableCell(c.conversions.toLocaleString('en-IN')),
        createTableCell(c.status, { color: c.status === 'active' ? '2E7D32' : '666666' }),
      ],
    }));

    docChildren.push(
      new Paragraph({
        text: 'Section 3 — Top 5 Campaigns by Spend',
        bold: true,
        size: 28, // 14pt
        color: '1F4E78',
        font: 'Arial',
        pageBreakBefore: true,
        spacing: { before: 200, after: 150 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: 'Detailed performance audit of the top five campaigns aggregated by total budget utilization in the current 30-day window.',
            font: 'Arial',
            size: 22,
          }),
        ],
        spacing: { after: 200 },
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              createTableCell('Campaign Name', { bold: true, shading: '1F4E78', color: 'FFFFFF', width: 35 }),
              createTableCell('Spend', { bold: true, shading: '1F4E78', color: 'FFFFFF', width: 15 }),
              createTableCell('CPC', { bold: true, shading: '1F4E78', color: 'FFFFFF', width: 13 }),
              createTableCell('CTR', { bold: true, shading: '1F4E78', color: 'FFFFFF', width: 12 }),
              createTableCell('Conversions', { bold: true, shading: '1F4E78', color: 'FFFFFF', width: 13 }),
              createTableCell('Status', { bold: true, shading: '1F4E78', color: 'FFFFFF', width: 12 }),
            ],
          }),
          ...topRows,
        ],
      })
    );

    // Section 4 — Campaigns Needing Attention
    const attentionRows = zeroConversionCampaigns.length > 0
      ? zeroConversionCampaigns.map(c => new TableRow({
        children: [
          createTableCell(c.name, { bold: true }),
          createTableCell(formatInr(c.spend)),
          createTableCell('Zero conversion campaign with spend > ₹1,000', { color: 'C62828' }),
          createTableCell('Pause campaign immediately to stop budget bleed, and refresh creative assets or landing page copy.', { italic: true }),
        ],
      }))
      : [
        new TableRow({
          children: [
            createTableCell('All active campaigns are performing within healthy boundaries.', { width: 100, bold: true, italic: true }),
          ],
        }),
      ];

    // If we only have a placeholder row, adjust columns span (done easily by providing a single full-width cell)
    docChildren.push(
      new Paragraph({
        text: 'Section 4 — Campaigns Needing Attention',
        bold: true,
        size: 28, // 14pt
        color: '1F4E78',
        font: 'Arial',
        pageBreakBefore: true,
        spacing: { before: 200, after: 150 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: 'This section isolates campaigns spending budget inefficiently without delivering active lead conversions (spend threshold exceeding ₹1,000 with 0 conversions).',
            font: 'Arial',
            size: 22,
          }),
        ],
        spacing: { after: 200 },
      }),
      zeroConversionCampaigns.length > 0
        ? new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                createTableCell('Campaign Name', { bold: true, shading: '1F4E78', color: 'FFFFFF', width: 30 }),
                createTableCell('Spend', { bold: true, shading: '1F4E78', color: 'FFFFFF', width: 15 }),
                createTableCell('Issue', { bold: true, shading: '1F4E78', color: 'FFFFFF', width: 25 }),
                createTableCell('Recommended Action', { bold: true, shading: '1F4E78', color: 'FFFFFF', width: 30 }),
              ],
            }),
            ...attentionRows,
          ],
        })
        : new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                createTableCell('Excellent News: No campaigns currently require urgent attention. All active spending campaigns are converting successfully.', {
                  width: 100,
                  bold: true,
                  color: '2E7D32',
                  shading: 'E8F5E9',
                }),
              ],
            }),
          ],
        })
    );

    // Section 5 — AI Recommendations
    const recoBullets = recommendations.map(rec => new Paragraph({
      bullet: { level: 0 },
      spacing: { after: 120, before: 60 },
      children: [
        new TextRun({
          text: rec,
          font: 'Arial',
          size: 22,
        }),
      ],
    }));

    docChildren.push(
      new Paragraph({
        text: 'Section 5 — AI Strategy Recommendations',
        bold: true,
        size: 28, // 14pt
        color: '1F4E78',
        font: 'Arial',
        pageBreakBefore: true,
        spacing: { before: 200, after: 150 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: 'Groq-powered analytical recommendations tailored precisely to scale budget performance, improve CPL returns, and avoid creative fatigue.',
            font: 'Arial',
            size: 22,
          }),
        ],
        spacing: { after: 200 },
      }),
      ...recoBullets
    );

    // Put it all in the document
    const doc = new Document({
      sections: [
        {
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: `MarketIQ by Venpep  |  Confidential  |  Tenant: ${tenantId.toUpperCase()}`,
                      size: 16, // 8pt
                      color: '999999',
                      font: 'Arial',
                    }),
                  ],
                }),
              ],
            }),
          },
          children: docChildren,
        },
      ],
    });

    // 8. Save file to temporary directory
    const tempDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const timestamp = Date.now();
    const fileName = `report-${tenantId}-${timestamp}.docx`;
    const filePath = path.join(tempDir, fileName);

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(filePath, buffer);

    // 9. Generate database record
    const shareToken = crypto.randomUUID();
    const report = await prisma.agencyReport.create({
      data: {
        tenantId,
        filePath,
        shareToken,
      },
    });

    // 10. Format URLs dynamically
    const origin = `${req.protocol}://${req.get('host')}`;
    const downloadUrl = `${origin}/api/v1/agency/report/${report.id}/download`;
    const shareLink = `https://app.marketiq.com/report/share/${shareToken}`;

    return res.status(201).json({
      downloadUrl,
      shareLink,
      reportId: report.id,
    });
  } catch (error) {
    return next(error);
  }
});

// GET /api/v1/agency/report/:reportId/download
reportRouter.get('/agency/report/:reportId/download', requireJwtAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const reportId = String(req.params.reportId);
    const tenantId = String(req.auth!.tenantId || 'agency');

    const report = await prisma.agencyReport.findFirst({
      where: {
        id: reportId,
        tenantId: tenantId as string,
      },
    });

    if (!report) {
      return res.status(404).json({ error: 'Report not found or access denied.' });
    }

    if (!fs.existsSync(report.filePath)) {
      return res.status(404).json({ error: 'Report physical file has been purged.' });
    }

    res.setHeader('Content-Disposition', 'attachment; filename="MarketIQ-Agency-Report-May2026.docx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

    const fileStream = fs.createReadStream(report.filePath);
    return fileStream.pipe(res);
  } catch (error) {
    return next(error);
  }
});

// GET /api/v1/agency/report/share/:shareToken
// PUBLIC ROUTE - NO AUTH REQUIRED
reportRouter.get('/agency/report/share/:shareToken', async (req, res, next) => {
  try {
    const shareToken = String(req.params.shareToken);

    const report = await prisma.agencyReport.findUnique({
      where: {
        shareToken,
      },
    });

    if (!report) {
      return res.status(404).json({ error: 'Report not found.' });
    }

    // Check expiration - 7 days
    const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
    const elapsed = Date.now() - new Date(report.createdAt).getTime();

    if (elapsed > sevenDaysInMs) {
      return res.status(410).json({ error: 'This share link has expired (validity was 7 days).' });
    }

    if (!fs.existsSync(report.filePath)) {
      return res.status(404).json({ error: 'Report physical file was cleaned up.' });
    }

    res.setHeader('Content-Disposition', 'attachment; filename="MarketIQ-Agency-Report-May2026.docx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

    const fileStream = fs.createReadStream(report.filePath);
    return fileStream.pipe(res);
  } catch (error) {
    return next(error);
  }
});

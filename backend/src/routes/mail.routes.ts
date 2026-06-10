import { Router } from 'express';
import { Prisma } from '@prisma/client';
import net from 'node:net';
import tls from 'node:tls';
// @ts-ignore
import pptxgen from 'pptxgenjs';
// @ts-ignore
import * as docx from 'docx';
import { requireJwtAuth, type AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { prisma } from '../services/prisma.service.js';

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
} = docx as any;

export const mailRouter = Router();

type MailFormat = 'pptx' | 'docx' | 'pdf';

type MailAttachment = {
  '@odata.type'?: string;
  name: string;
  contentType: string;
  contentBytes: string;
};

type CampaignSummaryRow = {
  campaignName: string;
  platform: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
};

function formatInr(value: number, decimals = 0) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: decimals,
  }).format(Number(value || 0));
}

function normalizeDocumentType(value: unknown) {
  const normalized = String(value || 'all').toLowerCase();
  if (['passenger', 'commercial', 'branding', 'all'].includes(normalized)) return normalized;
  return 'all';
}

function normalizeFormats(value: unknown): MailFormat[] {
  const raw = Array.isArray(value) ? value : [value || 'both'];
  const joined = raw.map(item => String(item).toLowerCase()).join(',');
  const formats = new Set<MailFormat>();
  if (joined.includes('ppt')) formats.add('pptx');
  if (joined.includes('doc') || joined.includes('word')) formats.add('docx');
  if (joined.includes('pdf')) formats.add('pdf');
  if (joined.includes('both') || formats.size === 0) {
    formats.add('pdf');
    formats.add('pptx');
    formats.add('docx');
  }
  return Array.from(formats);
}

function periodToRange(period: unknown) {
  const normalized = String(period || 'may').toLowerCase();
  const currentYear = new Date().getFullYear();
  const monthMap: Record<string, number> = {
    january: 0, jan: 0,
    february: 1, feb: 1,
    march: 2, mar: 2,
    april: 3, apr: 3,
    may: 4,
    june: 5, jun: 5,
    july: 6, jul: 6,
    august: 7, aug: 7,
    september: 8, sep: 8,
    october: 9, oct: 9,
    november: 10, nov: 10,
    december: 11, dec: 11,
  };

  let month = monthMap.may;
  let year = currentYear;

  if (normalized.includes('last month')) {
    const now = new Date();
    month = now.getMonth() - 1;
    year = now.getFullYear();
    if (month < 0) {
      month = 11;
      year -= 1;
    }
  } else {
    const matchedMonth = Object.entries(monthMap).find(([key]) => normalized.includes(key));
    if (matchedMonth) month = matchedMonth[1];
    const matchedYear = normalized.match(/\b20\d{2}\b/);
    if (matchedYear) year = Number(matchedYear[0]);
  }

  const from = new Date(Date.UTC(year, month, 1));
  const to = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
  const label = from.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return { from, to, label };
}

function documentTypeFilter(documentType: string) {
  if (documentType === 'commercial') {
    return Prisma.sql`AND LOWER(campaign_name) LIKE '%bolero%'`;
  }
  if (documentType === 'branding') {
    return Prisma.sql`AND (LOWER(campaign_name) LIKE '%branding%' OR LOWER(campaign_name) LIKE '%awareness%' OR LOWER(campaign_name) LIKE '%awaness%')`;
  }
  if (documentType === 'passenger') {
    return Prisma.sql`AND LOWER(campaign_name) NOT LIKE '%bolero%' AND LOWER(campaign_name) NOT LIKE '%branding%' AND LOWER(campaign_name) NOT LIKE '%awareness%' AND LOWER(campaign_name) NOT LIKE '%awaness%'`;
  }
  return Prisma.empty;
}

async function getCampaignReportData(tenantId: string, documentType: string, period: unknown) {
  const range = periodToRange(period);
  const rows = await prisma.$queryRaw<CampaignSummaryRow[]>`
    SELECT
      campaign_name AS "campaignName",
      platform,
      SUM(spend)::float AS spend,
      SUM(impressions)::int AS impressions,
      SUM(clicks)::int AS clicks,
      SUM(conversions)::int AS conversions
    FROM campaign_data
    WHERE tenant_id = ${tenantId}
      AND client_id = 'cai_mahindra'
      AND date >= ${range.from}
      AND date <= ${range.to}
      ${documentTypeFilter(documentType)}
    GROUP BY campaign_name, platform
    ORDER BY SUM(conversions) DESC, SUM(spend) DESC
  `;

  const totalSpend = rows.reduce((sum, row) => sum + Number(row.spend || 0), 0);
  const totalLeads = rows.reduce((sum, row) => sum + Number(row.conversions || 0), 0);
  const totalClicks = rows.reduce((sum, row) => sum + Number(row.clicks || 0), 0);
  const totalImpressions = rows.reduce((sum, row) => sum + Number(row.impressions || 0), 0);
  const blendedCpl = totalLeads > 0 ? totalSpend / totalLeads : 0;
  const bestCampaign = rows
    .filter(row => Number(row.conversions || 0) > 0)
    .map(row => ({ ...row, cpl: Number(row.spend || 0) / Number(row.conversions || 1) }))
    .sort((a, b) => a.cpl - b.cpl || Number(b.conversions || 0) - Number(a.conversions || 0))[0] || null;

  return {
    rows,
    range,
    totals: { totalSpend, totalLeads, totalClicks, totalImpressions, blendedCpl },
    bestCampaign,
  };
}

function tableCell(text: string, bold = false) {
  return new TableCell({
    width: { size: 25, type: WidthType.PERCENTAGE },
    children: [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [new TextRun({ text, bold, font: 'Arial', size: 20 })],
      }),
    ],
  });
}

function createTableCell(text: string, options: {
  bold?: boolean;
  color?: string;
  size?: number;
  shading?: string;
  align?: any;
} = {}) {
  return new TableCell({
    shading: options.shading ? { fill: options.shading } : undefined,
    children: [
      new Paragraph({
        alignment: options.align || AlignmentType.LEFT,
        spacing: { before: 90, after: 90 },
        children: [
          new TextRun({
            text,
            bold: options.bold || false,
            color: options.color || '333333',
            size: options.size || 18,
            font: 'Arial',
          }),
        ],
      }),
    ],
  });
}

async function generateDocxReport(data: Awaited<ReturnType<typeof getCampaignReportData>>, documentType: string) {
  const money = (value: number, decimals = 0) => formatInr(Number(value || 0), decimals);
  const pct = (part: number, total: number) => total > 0 ? `${((part / total) * 100).toFixed(2)}%` : '-';
  const platformRows = Object.values(data.rows.reduce((acc: Record<string, CampaignSummaryRow>, row) => {
    const key = row.platform || 'Unknown';
    if (!acc[key]) acc[key] = { campaignName: key, platform: key, spend: 0, impressions: 0, clicks: 0, conversions: 0 };
    acc[key].spend += Number(row.spend || 0);
    acc[key].impressions += Number(row.impressions || 0);
    acc[key].clicks += Number(row.clicks || 0);
    acc[key].conversions += Number(row.conversions || 0);
    return acc;
  }, {}));
  const topLeadCampaigns = [...data.rows].sort((a, b) => Number(b.conversions || 0) - Number(a.conversions || 0)).slice(0, 8);
  const topSpend = [...data.rows].sort((a, b) => Number(b.spend || 0) - Number(a.spend || 0))[0];
  const weakCampaign = data.rows
    .filter(row => Number(row.spend || 0) > 0 && Number(row.conversions || 0) === 0)
    .sort((a, b) => Number(b.spend || 0) - Number(a.spend || 0))[0];
  const heading = (text: string) => new Paragraph({
    spacing: { before: 260, after: 120 },
    children: [new TextRun({ text, bold: true, size: 26, color: 'D32F2F', font: 'Arial' })],
  });

  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({
          shading: { fill: 'D32F2F' },
          spacing: { before: 260, after: 260 },
          children: [new TextRun({ text: 'EXECUTIVE REPORT', bold: true, size: 24, color: 'FFFFFF', font: 'Arial' })],
        }),
        new Paragraph({
          children: [new TextRun({ text: 'CAI MAHINDRA + VENPEP GROUP', bold: true, size: 34, color: '111111', font: 'Arial' })],
        }),
        new Paragraph({
          children: [new TextRun({ text: `REPORT PERIOD: ${data.range.label} | SEGMENT: ${documentType.toUpperCase()}`, bold: true, size: 20, color: '64748B', font: 'Arial' })],
        }),
        new Paragraph({ text: '' }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: ['Total Leads', 'Impressions', 'Clicks', 'Campaigns'].map(label => createTableCell(label, { bold: true, shading: '111111', color: 'FFFFFF', align: AlignmentType.CENTER })) }),
            new TableRow({ children: [
              data.totals.totalLeads.toLocaleString('en-IN'),
              data.totals.totalImpressions.toLocaleString('en-IN'),
              data.totals.totalClicks.toLocaleString('en-IN'),
              String(data.rows.length),
            ].map(value => createTableCell(value, { bold: true, size: 24, align: AlignmentType.CENTER })) }),
          ],
        }),
        heading('OVERALL PERFORMANCE SUMMARY'),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: ['Platform', 'Spend', 'Impressions', 'Clicks', 'Leads', 'CVR'].map(label => createTableCell(label, { bold: true, shading: '111111', color: 'FFFFFF' })) }),
            ...platformRows.map(row => new TableRow({
              children: [
                row.platform,
                money(Number(row.spend || 0)),
                Number(row.impressions || 0).toLocaleString('en-IN'),
                Number(row.clicks || 0).toLocaleString('en-IN'),
                Number(row.conversions || 0).toLocaleString('en-IN'),
                pct(Number(row.conversions || 0), Number(row.clicks || 0)),
              ].map(value => createTableCell(String(value), { bold: false })),
            })),
            new TableRow({ children: [
              'TOTAL',
              money(data.totals.totalSpend),
              data.totals.totalImpressions.toLocaleString('en-IN'),
              data.totals.totalClicks.toLocaleString('en-IN'),
              data.totals.totalLeads.toLocaleString('en-IN'),
              pct(data.totals.totalLeads, data.totals.totalClicks),
            ].map(value => createTableCell(String(value), { bold: true, shading: 'FFF8E1' })) }),
          ],
        }),
        heading('PERFORMANCE FUNNEL METRICS'),
        new Paragraph({ children: [new TextRun({ text: `Impressions -> Clicks: ${data.totals.totalImpressions.toLocaleString('en-IN')} -> ${data.totals.totalClicks.toLocaleString('en-IN')} (${pct(data.totals.totalClicks, data.totals.totalImpressions)})`, bold: true, font: 'Arial' })] }),
        new Paragraph({ children: [new TextRun({ text: `Clicks -> Leads: ${data.totals.totalClicks.toLocaleString('en-IN')} -> ${data.totals.totalLeads.toLocaleString('en-IN')} (${pct(data.totals.totalLeads, data.totals.totalClicks)})`, bold: true, font: 'Arial' })] }),
        heading('PRODUCT LEADS COMPARISON'),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: ['Campaign', 'Platform', 'Spend', 'Clicks', 'Leads', 'CPL'].map(label => createTableCell(label, { bold: true, shading: '111111', color: 'FFFFFF' })) }),
            ...topLeadCampaigns.map(row => {
              const leads = Number(row.conversions || 0);
              const spend = Number(row.spend || 0);
              return new TableRow({ children: [
                row.campaignName,
                row.platform,
                money(spend),
          Number(row.clicks || 0).toLocaleString('en-IN'),
                leads.toLocaleString('en-IN'),
                leads > 0 ? money(spend / leads, 2) : '-',
              ].map(value => createTableCell(String(value))) });
            }),
          ],
        }),
        heading('STRATEGIC INFERENCES'),
        new Paragraph({ children: [new TextRun({ text: data.bestCampaign ? `1. ${data.bestCampaign.campaignName} is the efficiency benchmark at ${money(data.bestCampaign.cpl, 2)} CPL.` : '1. No lead campaign benchmark is available.', font: 'Arial' })] }),
        new Paragraph({ children: [new TextRun({ text: topSpend ? `2. Highest budget concentration: ${topSpend.campaignName} with ${money(Number(topSpend.spend || 0))} spend.` : '2. No spend concentration detected.', font: 'Arial' })] }),
        new Paragraph({ children: [new TextRun({ text: `3. Blended CPL is ${money(data.totals.blendedCpl, 2)} across ${data.totals.totalLeads.toLocaleString('en-IN')} leads.`, font: 'Arial' })] }),
        heading('RECOMMENDED ACTIONS'),
        new Paragraph({ children: [new TextRun({ text: data.bestCampaign ? `1. Use ${data.bestCampaign.campaignName} as the next-month benchmark at ${money(data.bestCampaign.cpl, 2)} CPL.` : '1. Rebuild benchmark after lead data is available.', font: 'Arial' })] }),
        new Paragraph({ children: [new TextRun({ text: weakCampaign ? `2. Review ${weakCampaign.campaignName}; it spent ${money(Number(weakCampaign.spend || 0))} with zero leads.` : `2. Maintain budget discipline around ${money(data.totals.blendedCpl, 2)} blended CPL.`, font: 'Arial' })] }),
        new Paragraph({ children: [new TextRun({ text: `3. Request lead status update from CAI team for ${data.totals.totalLeads.toLocaleString('en-IN')} reported leads.`, font: 'Arial' })] }),
        heading('JUNE 2026 ACTIVATION PLAN'),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: ['High Focus', 'XUV 3XO, XEV 9S, Thar Roxx, XEV 9e'].map((value, index) => createTableCell(value, { bold: true, shading: index === 0 ? 'FFF1F2' : undefined, color: index === 0 ? 'B71C1C' : '111111' })) }),
            new TableRow({ children: ['Stage 2', 'Thar 3-Door, Bolero, Bolero Neo, Scorpio-N'].map((value, index) => createTableCell(value, { bold: index === 0 })) }),
            new TableRow({ children: ['Platforms', 'Facebook Lead Ads, Instagram Reels, Google Search, Google Call Ads'].map((value, index) => createTableCell(value, { bold: index === 0 })) }),
            new TableRow({ children: ['Ad Formats', 'Carousel, Video, Call Ads, Retargeting'].map((value, index) => createTableCell(value, { bold: index === 0 })) }),
            new TableRow({ children: ['Goals', 'Max XEV 9S leads, Scale 3XO, Recover Thar Roxx, Launch XEV 9e'].map((value, index) => createTableCell(value, { bold: index === 0 })) }),
          ],
        }),
        new Paragraph({ text: '' }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Copyright Venpep & CAI - Executive Report', bold: true, color: '64748B', font: 'Arial' })] }),
      ],
    }],
  });

  return Packer.toBuffer(doc);
}

async function generatePptxReport(data: Awaited<ReturnType<typeof getCampaignReportData>>, documentType: string) {
  const money = (value: number, decimals = 0) => formatInr(Number(value || 0), decimals);
  const pct = (part: number, total: number) => total > 0 ? `${((part / total) * 100).toFixed(2)}%` : '-';
  const platformRows = Object.values(data.rows.reduce((acc: Record<string, CampaignSummaryRow>, row) => {
    const key = row.platform || 'Unknown';
    if (!acc[key]) acc[key] = { campaignName: key, platform: key, spend: 0, impressions: 0, clicks: 0, conversions: 0 };
    acc[key].spend += Number(row.spend || 0);
    acc[key].impressions += Number(row.impressions || 0);
    acc[key].clicks += Number(row.clicks || 0);
    acc[key].conversions += Number(row.conversions || 0);
    return acc;
  }, {}));
  const topLeadCampaigns = [...data.rows].sort((a, b) => Number(b.conversions || 0) - Number(a.conversions || 0)).slice(0, 8);
  const weakCampaign = data.rows
    .filter(row => Number(row.spend || 0) > 0 && Number(row.conversions || 0) === 0)
    .sort((a, b) => Number(b.spend || 0) - Number(a.spend || 0))[0];
  const PptxGen = (pptxgen as any).default || (pptxgen as any);
  const pptx = new PptxGen();
  pptx.layout = 'LAYOUT_16x9';
  pptx.author = 'MIP AI Brain';
  pptx.subject = `CAI Mahindra ${documentType} Report`;
  pptx.title = `CAI Mahindra ${documentType} Report - ${data.range.label}`;
  pptx.company = 'Venpep Reports';

  const addHeader = (slide: any, title: string) => {
    slide.background = { color: 'FFFFFF' };
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.55, fill: { color: 'D32F2F' }, line: { color: 'D32F2F' } });
    slide.addText(title, { x: 0.45, y: 0.15, w: 8, h: 0.24, fontSize: 14, bold: true, color: 'FFFFFF' });
    slide.addText(data.range.label, { x: 10.5, y: 0.16, w: 2.3, h: 0.22, fontSize: 9, bold: true, color: 'FFFFFF', align: 'right' });
  };

  const cover = pptx.addSlide();
  cover.background = { color: 'FFFFFF' };
  cover.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 2.05, fill: { color: 'D32F2F' }, line: { color: 'D32F2F' } });
  cover.addText('EXECUTIVE REPORT', { x: 0.55, y: 0.45, w: 2.8, h: 0.28, fontSize: 10, bold: true, color: 'D32F2F', fill: { color: 'FFFFFF' }, margin: 0.06 });
  cover.addText('CAI MAHINDRA + VENPEP GROUP', { x: 0.55, y: 0.95, w: 8, h: 0.42, fontSize: 24, bold: true, color: 'FFFFFF' });
  cover.addText('Passenger campaign performance review', { x: 0.55, y: 1.42, w: 5, h: 0.22, fontSize: 11, color: 'FFFFFF' });
  cover.addText('REPORT PERIOD', { x: 10.1, y: 0.75, w: 2.2, h: 0.2, fontSize: 8, bold: true, color: 'FFFFFF', align: 'right' });
  cover.addText(data.range.label, { x: 9.55, y: 1.02, w: 2.75, h: 0.32, fontSize: 16, bold: true, color: 'FFFFFF', align: 'right' });

  const kpis = [
    ['Total Leads', data.totals.totalLeads.toLocaleString('en-IN')],
    ['Impressions', data.totals.totalImpressions.toLocaleString('en-IN')],
    ['Clicks', data.totals.totalClicks.toLocaleString('en-IN')],
    ['Campaigns', String(data.rows.length)],
  ];
  kpis.forEach(([label, value], index) => {
    cover.addShape(pptx.ShapeType.roundRect, { x: 0.55 + index * 3.15, y: 2.55, w: 2.85, h: 0.85, fill: { color: 'F8FAFC' }, line: { color: 'E2E8F0' }, radius: 0.1 });
    cover.addText(label.toUpperCase(), { x: 0.75 + index * 3.15, y: 2.72, w: 2.4, h: 0.16, fontSize: 8, bold: true, color: '64748B' });
    cover.addText(value, { x: 0.75 + index * 3.15, y: 2.98, w: 2.4, h: 0.25, fontSize: 15, bold: true, color: '111827' });
  });
  cover.addText(`CAI MAHINDRA - ${documentType.toUpperCase()} REPORT - ${data.range.label.toUpperCase()}`, { x: 0.55, y: 3.72, w: 8, h: 0.24, fontSize: 13, bold: true, color: '111827' });
  cover.addText(data.bestCampaign ? `Best Campaign: ${data.bestCampaign.campaignName} at ${money(data.bestCampaign.cpl, 2)} CPL` : 'Best Campaign: No lead campaign available', { x: 0.55, y: 4.15, w: 11.8, h: 0.3, fontSize: 12, bold: true, color: 'D32F2F' });

  const summary = pptx.addSlide();
  addHeader(summary, 'OVERALL PERFORMANCE SUMMARY');
  const platformTable = [
    ['Platform', 'Spend', 'Impressions', 'Clicks', 'Leads', 'CVR'],
    ...platformRows.map(row => [
      row.platform,
      money(Number(row.spend || 0)),
      Number(row.impressions || 0).toLocaleString('en-IN'),
      Number(row.clicks || 0).toLocaleString('en-IN'),
      Number(row.conversions || 0).toLocaleString('en-IN'),
      pct(Number(row.conversions || 0), Number(row.clicks || 0)),
    ]),
    ['TOTAL', money(data.totals.totalSpend), data.totals.totalImpressions.toLocaleString('en-IN'), data.totals.totalClicks.toLocaleString('en-IN'), data.totals.totalLeads.toLocaleString('en-IN'), pct(data.totals.totalLeads, data.totals.totalClicks)],
  ];
  summary.addTable(platformTable, { x: 0.55, y: 0.95, w: 12.25, h: 1.65, border: { color: 'CBD5E1', pt: 0.5 }, fontFace: 'Arial', fontSize: 8, color: '111827', fill: { color: 'FFFFFF' } });
  summary.addText('PERFORMANCE FUNNEL METRICS', { x: 0.55, y: 3.0, w: 4, h: 0.25, fontSize: 13, bold: true, color: '111827' });
  const funnel = [
    ['Impressions', data.totals.totalImpressions, 1, '1877F2'],
    ['Clicks', data.totals.totalClicks, data.totals.totalClicks / Math.max(data.totals.totalImpressions, 1), '4D9EF7'],
    ['Leads', data.totals.totalLeads, data.totals.totalLeads / Math.max(data.totals.totalClicks, 1), 'D32F2F'],
  ];
  funnel.forEach(([label, value, ratio, color], index) => {
    const y = 3.55 + index * 0.55;
    const width = Math.max(1.3, Math.min(8.6, Number(ratio) * 8.6));
    summary.addText(`${label}: ${Number(value).toLocaleString('en-IN')}`, { x: 0.75, y, w: 2.5, h: 0.18, fontSize: 9, bold: true, color: '111827' });
    summary.addShape(pptx.ShapeType.rect, { x: 3.25, y: y - 0.02, w: width, h: 0.24, fill: { color: String(color) }, line: { color: String(color) } });
    summary.addText(index === 0 ? 'Base volume' : `${(Number(ratio) * 100).toFixed(2)}% conversion`, { x: 3.38, y: y + 0.03, w: 2.2, h: 0.12, fontSize: 7, bold: true, color: 'FFFFFF' });
  });

  const comparison = pptx.addSlide();
  addHeader(comparison, 'PRODUCT LEADS COMPARISON');
  const maxLeads = Math.max(...topLeadCampaigns.map(row => Number(row.conversions || 0)), 1);
  topLeadCampaigns.forEach((row, index) => {
    const y = 0.95 + index * 0.55;
    const leads = Number(row.conversions || 0);
    const width = Math.max(0.35, (leads / maxLeads) * 6.8);
    comparison.addText(row.campaignName.slice(0, 38), { x: 0.55, y, w: 3.8, h: 0.2, fontSize: 8, bold: true, color: '111827' });
    comparison.addShape(pptx.ShapeType.rect, { x: 4.55, y: y + 0.02, w: width, h: 0.18, fill: { color: index === 0 ? 'B71C1C' : 'D32F2F' }, line: { color: index === 0 ? 'B71C1C' : 'D32F2F' } });
    comparison.addText(leads.toLocaleString('en-IN'), { x: 4.65 + width, y, w: 1.0, h: 0.18, fontSize: 8, bold: true, color: '111827' });
  });

  const tableRows = [
    ['Campaign', 'Platform', 'Spend', 'Leads'],
    ...data.rows.slice(0, 8).map(row => [
      row.campaignName,
      row.platform,
      money(Number(row.spend || 0)),
      Number(row.conversions || 0).toLocaleString('en-IN'),
    ]),
  ];
  comparison.addTable(tableRows, {
    x: 0.55,
    y: 5.45,
    w: 12.2,
    h: 1.35,
    border: { color: 'CBD5E1', pt: 0.5 },
    fontFace: 'Arial',
    fontSize: 8,
    color: '111827',
    fill: { color: 'FFFFFF' },
  });

  const actions = pptx.addSlide();
  addHeader(actions, 'RECOMMENDED ACTIONS + ACTIVATION PLAN');
  actions.addText('RECOMMENDED ACTIONS', { x: 0.55, y: 0.9, w: 4, h: 0.25, fontSize: 13, bold: true, color: '111827' });
  const actionText = [
    data.bestCampaign ? `1. Use ${data.bestCampaign.campaignName} as the benchmark at ${money(data.bestCampaign.cpl, 2)} CPL.` : '1. Rebuild benchmark after lead data is available.',
    weakCampaign ? `2. Review ${weakCampaign.campaignName}; it spent ${money(Number(weakCampaign.spend || 0))} with zero leads.` : `2. Maintain budget discipline around ${money(data.totals.blendedCpl, 2)} blended CPL.`,
    `3. Request lead status update from CAI team for ${data.totals.totalLeads.toLocaleString('en-IN')} reported leads.`,
  ];
  actionText.forEach((text, index) => actions.addText(text, { x: 0.75, y: 1.35 + index * 0.35, w: 11.8, h: 0.22, fontSize: 10, color: '111827' }));
  actions.addText('JUNE 2026 ACTIVATION PLAN', { x: 0.55, y: 2.8, w: 4.5, h: 0.25, fontSize: 13, bold: true, color: '111827' });
  ['XUV 3XO', 'XEV 9S', 'Thar Roxx', 'XEV 9e'].forEach((model, index) => {
    actions.addShape(pptx.ShapeType.roundRect, { x: 0.7 + index * 3.05, y: 3.28, w: 2.5, h: 0.48, fill: { color: 'FFF1F2' }, line: { color: 'D32F2F' }, radius: 0.08 });
    actions.addText(model, { x: 0.9 + index * 3.05, y: 3.43, w: 2.1, h: 0.16, fontSize: 10, bold: true, color: 'B71C1C', align: 'center' });
  });
  ['Thar 3-Door', 'Bolero', 'Bolero Neo', 'Scorpio-N'].forEach((model, index) => {
    actions.addShape(pptx.ShapeType.roundRect, { x: 0.7 + index * 3.05, y: 3.98, w: 2.5, h: 0.48, fill: { color: 'F8FAFC' }, line: { color: 'CBD5E1' }, radius: 0.08 });
    actions.addText(model, { x: 0.9 + index * 3.05, y: 4.13, w: 2.1, h: 0.16, fontSize: 9, bold: true, color: '111827', align: 'center' });
  });
  actions.addTable([
    ['Platforms', 'Ad Formats', 'Goals'],
    ['Facebook Lead Ads, Instagram Reels, Google Search, Google Call Ads', 'Carousel, Video, Call Ads, Retargeting', 'Max XEV 9S leads, Scale 3XO, Recover Thar Roxx, Launch XEV 9e'],
  ], { x: 0.7, y: 5.0, w: 11.9, h: 1.0, border: { color: 'CBD5E1', pt: 0.5 }, fontFace: 'Arial', fontSize: 8, color: '111827' });

  const output = await pptx.write({ outputType: 'nodebuffer' });
  return Buffer.isBuffer(output) ? output : Buffer.from(output as any);
}

function escapePdfText(value: string) {
  return value
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function generatePdfReport(data: Awaited<ReturnType<typeof getCampaignReportData>>, documentType: string) {
  const money = (value: number, decimals = 0) => `Rs.${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
  const pct = (part: number, total: number) => total > 0 ? `${((part / total) * 100).toFixed(2)}%` : '-';
  const cvr = data.totals.totalClicks > 0 ? (data.totals.totalLeads / data.totals.totalClicks) * 100 : 0;
  const platformRows = Object.values(data.rows.reduce((acc: Record<string, CampaignSummaryRow>, row) => {
    const key = row.platform || 'Unknown';
    if (!acc[key]) acc[key] = { campaignName: key, platform: key, spend: 0, impressions: 0, clicks: 0, conversions: 0 };
    acc[key].spend += Number(row.spend || 0);
    acc[key].impressions += Number(row.impressions || 0);
    acc[key].clicks += Number(row.clicks || 0);
    acc[key].conversions += Number(row.conversions || 0);
    return acc;
  }, {}));
  const topSpend = [...data.rows].sort((a, b) => Number(b.spend || 0) - Number(a.spend || 0))[0];
  const topLeadCampaigns = [...data.rows].sort((a, b) => Number(b.conversions || 0) - Number(a.conversions || 0)).slice(0, 8);
  const weakCampaigns = data.rows
    .filter(row => Number(row.spend || 0) > 0 && Number(row.conversions || 0) === 0)
    .sort((a, b) => Number(b.spend || 0) - Number(a.spend || 0));

  const pages: string[] = [];
  const cmd = {
    text: (text: string, x: number, y: number, size = 10, bold = false, color = '111111') => {
      const [r, g, b] = color.match(/.{2}/g)!.map(hex => parseInt(hex, 16) / 255);
      return `BT ${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${escapePdfText(text)}) Tj ET\n`;
    },
    rect: (x: number, y: number, w: number, h: number, fill: string, stroke?: string) => {
      const [r, g, b] = fill.match(/.{2}/g)!.map(hex => parseInt(hex, 16) / 255);
      const fillCmd = `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`;
      if (!stroke) return `${fillCmd} ${x} ${y} ${w} ${h} re f\n`;
      const [sr, sg, sb] = stroke.match(/.{2}/g)!.map(hex => parseInt(hex, 16) / 255);
      return `${fillCmd} ${sr.toFixed(3)} ${sg.toFixed(3)} ${sb.toFixed(3)} RG ${x} ${y} ${w} ${h} re B\n`;
    },
    line: (x1: number, y1: number, x2: number, y2: number, color = 'E5E7EB') => {
      const [r, g, b] = color.match(/.{2}/g)!.map(hex => parseInt(hex, 16) / 255);
      return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG ${x1} ${y1} m ${x2} ${y2} l S\n`;
    },
  };

  const sectionTitle = (title: string, y: number) => (
    cmd.rect(40, y - 5, 5, 20, 'D32F2F') +
    cmd.text(title, 52, y, 13, true, '111111')
  );

  const kpiBox = (label: string, value: string, x: number, y: number) => (
    cmd.rect(x, y, 118, 54, 'FFFFFF', 'E5E7EB') +
    cmd.text(label.toUpperCase(), x + 10, y + 34, 7, true, '64748B') +
    cmd.text(value, x + 10, y + 14, 14, true, '111111')
  );

  let page = '';
  page += cmd.rect(0, 682, 595, 160, 'D32F2F');
  page += cmd.rect(40, 774, 112, 24, 'FFFFFF');
  page += cmd.text('EXECUTIVE REPORT', 50, 782, 9, true, 'D32F2F');
  page += cmd.text('CAI MAHINDRA + VENPEP GROUP', 40, 735, 24, true, 'FFFFFF');
  page += cmd.text('Passenger campaign performance review', 40, 714, 11, false, 'FFFFFF');
  page += cmd.text('REPORT PERIOD', 405, 765, 8, true, 'FFFFFF');
  page += cmd.text(data.range.label, 405, 744, 16, true, 'FFFFFF');
  page += kpiBox('Total Leads', data.totals.totalLeads.toLocaleString('en-IN'), 40, 610);
  page += kpiBox('Impressions', data.totals.totalImpressions.toLocaleString('en-IN'), 170, 610);
  page += kpiBox('Clicks', data.totals.totalClicks.toLocaleString('en-IN'), 300, 610);
  page += kpiBox('Campaigns', String(data.rows.length), 430, 610);
  page += cmd.text(`CAI MAHINDRA - ${documentType.toUpperCase()} REPORT - ${data.range.label.toUpperCase()}`, 40, 574, 12, true, '111111');
  page += sectionTitle('OVERALL PERFORMANCE SUMMARY', 535);
  page += cmd.rect(40, 416, 515, 100, 'FFFFFF', 'D1D5DB');
  const headerY = 492;
  page += cmd.rect(40, 488, 515, 28, '111111');
  ['Platform', 'Spend', 'Impressions', 'Clicks', 'Leads', 'CVR'].forEach((label, i) => {
    page += cmd.text(label.toUpperCase(), 52 + i * 82, headerY, 8, true, 'FFFFFF');
  });
  platformRows.slice(0, 3).forEach((row, index) => {
    const y = 462 - index * 25;
    page += cmd.line(40, y - 7, 555, y - 7);
    [row.platform, money(Number(row.spend || 0)), Number(row.impressions || 0).toLocaleString('en-IN'), Number(row.clicks || 0).toLocaleString('en-IN'), Number(row.conversions || 0).toLocaleString('en-IN'), pct(Number(row.conversions || 0), Number(row.clicks || 0))]
      .forEach((value, i) => { page += cmd.text(String(value).slice(0, 16), 52 + i * 82, y, 8, i === 0, '111111'); });
  });
  page += cmd.rect(40, 388, 515, 24, 'FFF8E1', 'FBBF24');
  page += cmd.text(`TOTAL: ${money(data.totals.totalSpend)} spend | ${data.totals.totalLeads.toLocaleString('en-IN')} leads | ${cvr.toFixed(2)}% CVR | ${money(data.totals.blendedCpl, 2)} blended CPL`, 52, 396, 9, true, '111111');
  page += sectionTitle('PERFORMANCE FUNNEL METRICS', 350);
  const funnel = [
    ['Impressions', data.totals.totalImpressions, 1, '1877F2'],
    ['Clicks', data.totals.totalClicks, data.totals.totalClicks / Math.max(data.totals.totalImpressions, 1), '4D9EF7'],
    ['Leads', data.totals.totalLeads, data.totals.totalLeads / Math.max(data.totals.totalClicks, 1), 'D32F2F'],
  ];
  funnel.forEach(([label, value, ratio, color], index) => {
    const y = 305 - index * 42;
    const width = Math.max(70, Math.min(430, Number(ratio) * 430));
    page += cmd.text(`${label}: ${Number(value).toLocaleString('en-IN')}`, 45, y + 12, 10, true, '111111');
    page += cmd.rect(150, y, width, 22, String(color));
    page += cmd.text(index === 0 ? 'Base volume' : `${(Number(ratio) * 100).toFixed(2)}% conversion`, 160, y + 7, 8, true, 'FFFFFF');
  });
  page += sectionTitle('STRATEGIC INFERENCES', 165);
  page += cmd.text(data.bestCampaign ? `1. ${data.bestCampaign.campaignName.slice(0, 72)} is the efficiency benchmark at ${money(data.bestCampaign.cpl, 2)} CPL.` : '1. No lead campaign benchmark is available.', 45, 137, 9);
  page += cmd.text(topSpend ? `2. Highest budget concentration: ${topSpend.campaignName.slice(0, 64)} with ${money(Number(topSpend.spend || 0))} spend.` : '2. No spend concentration detected.', 45, 115, 9);
  page += cmd.text(`3. Blended CPL for the selected period is ${money(data.totals.blendedCpl, 2)} across ${data.totals.totalLeads.toLocaleString('en-IN')} leads.`, 45, 93, 9);
  pages.push(page);

  page = '';
  page += cmd.rect(0, 804, 595, 38, 'D32F2F');
  page += cmd.text('CAI MAHINDRA EXECUTIVE REPORT', 40, 819, 12, true, 'FFFFFF');
  page += sectionTitle('PRODUCT LEADS COMPARISON', 770);
  const maxLeads = Math.max(...topLeadCampaigns.map(row => Number(row.conversions || 0)), 1);
  topLeadCampaigns.forEach((row, index) => {
    const y = 722 - index * 36;
    const leads = Number(row.conversions || 0);
    const barWidth = Math.max(18, (leads / maxLeads) * 330);
    page += cmd.text(row.campaignName.slice(0, 36), 45, y + 8, 8, true, '111111');
    page += cmd.rect(245, y, barWidth, 16, index === 0 ? 'B71C1C' : 'D32F2F');
    page += cmd.text(leads.toLocaleString('en-IN'), 250 + barWidth, y + 4, 8, true, '111111');
  });
  page += sectionTitle('CAMPAIGN PERFORMANCE TABLE', 420);
  page += cmd.rect(40, 390, 515, 24, '111111');
  ['Campaign', 'Platform', 'Spend', 'Clicks', 'Leads', 'CPL'].forEach((label, i) => {
    page += cmd.text(label, 48 + i * 84, 398, 8, true, 'FFFFFF');
  });
  data.rows.slice(0, 10).forEach((row, index) => {
    const y = 368 - index * 24;
    const leads = Number(row.conversions || 0);
    const spend = Number(row.spend || 0);
    const cplValue = leads > 0 ? spend / leads : 0;
    page += cmd.line(40, y - 7, 555, y - 7);
    [row.campaignName.slice(0, 24), row.platform, money(spend), Number(row.clicks || 0).toLocaleString('en-IN'), leads.toLocaleString('en-IN'), leads > 0 ? money(cplValue, 2) : '-']
      .forEach((value, i) => { page += cmd.text(String(value).slice(0, 18), 48 + i * 84, y, 7, i === 0, '111111'); });
  });
  page += sectionTitle('RECOMMENDED ACTIONS', 112);
  page += cmd.text(data.bestCampaign ? `1. Use ${data.bestCampaign.campaignName.slice(0, 70)} as the next-month benchmark at ${money(data.bestCampaign.cpl, 2)} CPL.` : '1. Rebuild benchmark after lead data is available.', 45, 84, 8);
  page += cmd.text(weakCampaigns[0] ? `2. Review ${weakCampaigns[0].campaignName.slice(0, 70)}; it spent ${money(Number(weakCampaigns[0].spend || 0))} with zero leads.` : `2. Maintain budget discipline around ${money(data.totals.blendedCpl, 2)} blended CPL.`, 45, 66, 8);
  page += cmd.text(`3. Request lead status update from CAI team for ${data.totals.totalLeads.toLocaleString('en-IN')} reported leads.`, 45, 48, 8);
  pages.push(page);

  page = '';
  page += cmd.rect(0, 804, 595, 38, 'D32F2F');
  page += cmd.text('JUNE 2026 ACTIVATION PLAN', 40, 819, 12, true, 'FFFFFF');
  page += sectionTitle('FOCUS MODELS', 760);
  ['XUV 3XO', 'XEV 9S', 'Thar Roxx', 'XEV 9e'].forEach((model, index) => {
    page += cmd.rect(45 + index * 126, 700, 110, 42, 'FFF1F2', 'D32F2F');
    page += cmd.text(model, 58 + index * 126, 716, 11, true, 'B71C1C');
  });
  ['Thar 3-Door', 'Bolero', 'Bolero Neo', 'Scorpio-N'].forEach((model, index) => {
    page += cmd.rect(45 + index * 126, 640, 110, 42, 'F8FAFC', 'CBD5E1');
    page += cmd.text(model, 58 + index * 126, 656, 10, true, '111111');
  });
  page += sectionTitle('STRATEGY TABLE', 585);
  page += cmd.rect(40, 450, 515, 100, 'FFFFFF', 'CBD5E1');
  page += cmd.rect(40, 526, 515, 24, '111111');
  ['Platforms', 'Ad Formats', 'Goals'].forEach((label, i) => {
    page += cmd.text(label.toUpperCase(), 60 + i * 170, 534, 9, true, 'FFFFFF');
  });
  page += cmd.text('Facebook Lead Ads', 60, 502, 9);
  page += cmd.text('Instagram Reels', 60, 482, 9);
  page += cmd.text('Google Search', 60, 462, 9);
  page += cmd.text('Carousel', 230, 502, 9);
  page += cmd.text('Video', 230, 482, 9);
  page += cmd.text('Call Ads + Retargeting', 230, 462, 9);
  page += cmd.text('Max XEV 9S leads', 400, 502, 9);
  page += cmd.text('Scale 3XO', 400, 482, 9);
  page += cmd.text('Recover Thar Roxx', 400, 462, 9);
  page += sectionTitle('BOTTOM LINE', 390);
  page += cmd.text(`The report period generated ${data.totals.totalLeads.toLocaleString('en-IN')} leads at ${money(data.totals.blendedCpl, 2)} blended CPL.`, 45, 360, 10, true);
  page += cmd.text(data.bestCampaign ? `Best benchmark for next planning cycle: ${data.bestCampaign.campaignName.slice(0, 76)}.` : 'No benchmark campaign is available.', 45, 336, 9);
  page += cmd.text('Copyright Venpep & CAI - Executive Report', 185, 45, 8, true, '64748B');
  pages.push(page);

  const objects: string[] = ['1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'];
  const pageObjectIds: number[] = [];
  const fontRegularObjectId = 3 + pages.length * 2;
  const fontBoldObjectId = fontRegularObjectId + 1;

  pages.forEach((content, index) => {
    const pageObjectId = 3 + index * 2;
    const contentObjectId = pageObjectId + 1;
    pageObjectIds.push(pageObjectId);
    objects.push(
      `${pageObjectId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontRegularObjectId} 0 R /F2 ${fontBoldObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>\nendobj\n`,
      `${contentObjectId} 0 obj\n<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream\nendobj\n`,
    );
  });
  objects.splice(1, 0, `2 0 obj\n<< /Type /Pages /Kids [${pageObjectIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>\nendobj\n`);
  objects.push(
    `${fontRegularObjectId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`,
    `${fontBoldObjectId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`,
  );

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += object;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  offsets.slice(1).forEach(offset => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, 'utf8');
}

async function getMicrosoftGraphToken() {
  const tenantId = process.env.MICROSOFT_TENANT_ID;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Microsoft Graph mail credentials are not configured.');
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const tokenResponse = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error(`Microsoft token request failed: ${tokenResponse.status}`);
  }

  const payload = await tokenResponse.json() as { access_token?: string };
  if (!payload.access_token) throw new Error('Microsoft token response did not include an access token.');
  return payload.access_token;
}

function base64Lines(value: string | Buffer) {
  const raw = Buffer.isBuffer(value) ? value.toString('base64') : Buffer.from(value).toString('base64');
  return raw.match(/.{1,76}/g)?.join('\r\n') || '';
}

function htmlToText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function buildMimeMessage({
  from,
  fromName,
  to,
  subject,
  htmlBody,
  attachments,
}: {
  from: string;
  fromName: string;
  to: string[];
  subject: string;
  htmlBody: string;
  attachments: MailAttachment[];
}) {
  const mixedBoundary = `mixed-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const alternativeBoundary = `alt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const textBody = htmlToText(htmlBody);
  const safeSubject = Buffer.from(subject).toString('base64');
  const escapedName = fromName.replace(/"/g, '\\"');

  const parts = [
    `From: "${escapedName}" <${from}>`,
    `To: ${to.join(', ')}`,
    `Subject: =?UTF-8?B?${safeSubject}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    '',
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
    '',
    `--${alternativeBoundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(textBody),
    `--${alternativeBoundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(htmlBody),
    `--${alternativeBoundary}--`,
  ];

  attachments.forEach(attachment => {
    parts.push(
      `--${mixedBoundary}`,
      `Content-Type: ${attachment.contentType}; name="${attachment.name}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${attachment.name}"`,
      '',
      attachment.contentBytes.match(/.{1,76}/g)?.join('\r\n') || '',
    );
  });

  parts.push(`--${mixedBoundary}--`, '');
  return parts.join('\r\n').replace(/^\./gm, '..');
}

async function sendSmtpMail({
  recipients,
  subject,
  htmlBody,
  attachments,
}: {
  recipients: string[];
  subject: string;
  htmlBody: string;
  attachments: MailAttachment[];
}) {
  const host = process.env.SMTP_HOST || 'smtp-relay.brevo.com';
  const port = Number(process.env.SMTP_PORT || 587);
  const login = process.env.SMTP_LOGIN || process.env.BREVO_SMTP_LOGIN;
  const password = process.env.SMTP_PASSWORD || process.env.BREVO_SMTP_PASSWORD;
  const from = process.env.MAIL_FROM || process.env.SMTP_FROM || login;
  const fromName = process.env.MAIL_FROM_NAME || 'Venpep Reports';

  if (!login || !password || !from) {
    throw new Error('SMTP mail credentials are not configured.');
  }

  let socket: net.Socket | tls.TLSSocket = net.createConnection({ host, port });
  socket.setEncoding('utf8');
  let buffer = '';

  const readResponse = () => new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('SMTP response timed out.')), 30000);
    const onData = (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || '';
      if (/^\d{3}\s/.test(last)) {
        clearTimeout(timeout);
        socket.off('data', onData);
        const response = buffer;
        buffer = '';
        resolve(response);
      }
    };
    socket.on('data', onData);
    socket.once('error', error => {
      clearTimeout(timeout);
      socket.off('data', onData);
      reject(error);
    });
  });

  const expect = async (codes: number[]) => {
    const response = await readResponse();
    const code = Number(response.slice(0, 3));
    if (!codes.includes(code)) throw new Error(`SMTP error ${code}: ${response.trim()}`);
    return response;
  };

  const command = async (line: string, codes: number[]) => {
    socket.write(`${line}\r\n`);
    return expect(codes);
  };

  await expect([220]);
  await command('EHLO mip.local', [250]);
  await command('STARTTLS', [220]);

  socket = tls.connect({ socket, host, servername: host });
  socket.setEncoding('utf8');
  buffer = '';

  await command('EHLO mip.local', [250]);
  await command('AUTH LOGIN', [334]);
  await command(Buffer.from(login).toString('base64'), [334]);
  await command(Buffer.from(password).toString('base64'), [235]);
  await command(`MAIL FROM:<${from}>`, [250]);
  for (const recipient of recipients) {
    await command(`RCPT TO:<${recipient}>`, [250, 251]);
  }
  await command('DATA', [354]);
  socket.write(`${buildMimeMessage({ from, fromName, to: recipients, subject, htmlBody, attachments })}\r\n.\r\n`);
  await expect([250]);
  await command('QUIT', [221]);
  socket.end();
}

async function sendBrevoApiMail({
  recipients,
  subject,
  htmlBody,
  attachments,
}: {
  recipients: string[];
  subject: string;
  htmlBody: string;
  attachments: MailAttachment[];
}) {
  const apiKey = process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY;
  const from = process.env.MAIL_FROM || process.env.SMTP_FROM;
  const fromName = process.env.MAIL_FROM_NAME || 'Venpep Reports';

  if (!apiKey || !from) {
    throw new Error('Brevo API mail credentials are not configured.');
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { email: from, name: fromName },
      to: recipients.map(address => ({ email: address })),
      subject,
      htmlContent: htmlBody,
      attachment: attachments.map(attachment => ({
        name: attachment.name,
        content: attachment.contentBytes,
      })),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[MailAgent] Brevo API send failed:', response.status, errorText);
    throw new Error(`Brevo API error ${response.status}: ${errorText}`);
  }
}

mailRouter.post('/mail/send', requireJwtAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const tenantId = req.auth!.tenantId || 'agency';
    const recipient = req.body?.recipient;
    const recipients = Array.isArray(recipient) ? recipient : [recipient].filter(Boolean);
    const subject = String(req.body?.subject || 'CAI Mahindra Report');
    const htmlBody = String(req.body?.body || '');
    const documentType = normalizeDocumentType(req.body?.documentType);
    const formats = normalizeFormats(req.body?.format);
    const period = req.body?.period || 'may';
    const mailFrom = process.env.MAIL_FROM || 'reports@venpep.com';
    const suppliedAttachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];

    if (recipients.length === 0) {
      return res.status(400).json({ error: "I don't recognize the recipient. What's their email address?" });
    }

    const data = await getCampaignReportData(tenantId, documentType, period);
    if (data.rows.length === 0) {
      return res.status(422).json({ error: 'Could not generate report. Please try downloading directly.' });
    }

    const attachments: MailAttachment[] = [];
    const safeName = 'document';
    for (const attachment of suppliedAttachments) {
      if (
        attachment?.name &&
        attachment?.contentType &&
        attachment?.contentBytes &&
        typeof attachment.contentBytes === 'string'
      ) {
        attachments.push({
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: String(attachment.name),
          contentType: String(attachment.contentType),
          contentBytes: attachment.contentBytes,
        });
      }
    }

    const hasSuppliedPdf = attachments.some(attachment => attachment.contentType === 'application/pdf');
    if (formats.includes('pdf') && !hasSuppliedPdf) {
      const pdfBuffer = generatePdfReport(data, documentType);
      attachments.push({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: `${safeName}.pdf`,
        contentType: 'application/pdf',
        contentBytes: pdfBuffer.toString('base64'),
      });
    }
    if (formats.includes('pptx')) {
      const pptxBuffer = await generatePptxReport(data, documentType);
      attachments.push({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: `${safeName}.pptx`,
        contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        contentBytes: pptxBuffer.toString('base64'),
      });
    }
    if (formats.includes('docx')) {
      const docxBuffer = await generateDocxReport(data, documentType);
      attachments.push({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: `${safeName}.docx`,
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        contentBytes: docxBuffer.toString('base64'),
      });
    }

    const provider = String(process.env.MAIL_PROVIDER || 'outlook').toLowerCase();
    if (provider === 'brevo') {
      await sendBrevoApiMail({ recipients, subject, htmlBody, attachments });
      return res.json({
        ok: true,
        provider,
        sentTo: recipients,
        attachmentCount: attachments.length,
        bestCampaign: data.bestCampaign ? {
          name: data.bestCampaign.campaignName,
          cpl: data.bestCampaign.cpl,
        } : null,
      });
    }

    if (provider === 'smtp') {
      await sendSmtpMail({ recipients, subject, htmlBody, attachments });
      return res.json({
        ok: true,
        provider,
        sentTo: recipients,
        attachmentCount: attachments.length,
        bestCampaign: data.bestCampaign ? {
          name: data.bestCampaign.campaignName,
          cpl: data.bestCampaign.cpl,
        } : null,
      });
    }

    const accessToken = await getMicrosoftGraphToken();
    const graphResponse = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailFrom)}/sendMail`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: 'HTML', content: htmlBody },
          toRecipients: recipients.map(address => ({ emailAddress: { address } })),
          attachments,
        },
        saveToSentItems: true,
      }),
    });

    if (!graphResponse.ok) {
      const graphError = await graphResponse.text();
      console.error('[MailAgent] Microsoft Graph send failed:', graphResponse.status, graphError);
      return res.status(502).json({ error: 'Mail send failed. Try again or download the report manually.' });
    }

    return res.json({
      ok: true,
      sentTo: recipients,
      attachmentCount: attachments.length,
      bestCampaign: data.bestCampaign ? {
        name: data.bestCampaign.campaignName,
        cpl: data.bestCampaign.cpl,
      } : null,
    });
  } catch (error) {
    return next(error);
  }
});

import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { formatInr, getAlerts, getConnectedPlatforms, getPerformanceSummary, getRecommendations } from './insights.service';

function cell(text: string, bold = false) {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold })],
      }),
    ],
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function downloadReportDocx({ report, client, campaigns, integrations }: any) {
  const summary = getPerformanceSummary(campaigns);
  const alerts = getAlerts(campaigns, client ? [client] : []);
  const recommendations = getRecommendations(campaigns, client ? [client] : [], integrations);
  const connectedPlatforms = getConnectedPlatforms(integrations);

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            heading: HeadingLevel.TITLE,
            children: [new TextRun(report.name || `${client?.name || 'Agency'} Performance Report`)],
          }),
          new Paragraph(`Client: ${client?.name || 'All Clients'}`),
          new Paragraph(`Generated: ${new Date().toLocaleString('en-IN')}`),
          new Paragraph(`Connected sources: ${connectedPlatforms.map((source: any) => source.name).join(', ') || 'None connected'}`),
          new Paragraph({ text: 'Executive Summary', heading: HeadingLevel.HEADING_1 }),
          new Paragraph(`Total spend: ${formatInr(summary.totalSpend)}`),
          new Paragraph(`Conversions: ${summary.totalConversions.toLocaleString('en-IN')}`),
          new Paragraph(`Average CPC: ${summary.avgCpc === null ? 'N/A' : `₹${summary.avgCpc.toFixed(2)}`}`),
          new Paragraph(`Active campaigns: ${summary.activeCampaigns}`),
          new Paragraph({ text: 'Campaign Performance', heading: HeadingLevel.HEADING_1 }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  cell('Campaign', true),
                  cell('Platform', true),
                  cell('Spend', true),
                  cell('CTR', true),
                  cell('CPC', true),
                  cell('Status', true),
                ],
              }),
              ...campaigns.map((campaign: any) => {
                const campaignCpc = campaign.clicks > 0 ? campaign.spend / campaign.clicks : campaign.cpc;
                return new TableRow({
                  children: [
                    cell(campaign.name),
                    cell(campaign.channel),
                    cell(formatInr(campaign.spend)),
                    cell(`${campaign.ctr}%`),
                    cell(campaignCpc === null || campaignCpc === undefined || campaignCpc === 0 ? 'N/A' : `₹${campaignCpc.toFixed(2)}`),
                    cell(campaign.status),
                  ],
                });
              }),
            ],
          }),
          new Paragraph({ text: 'Alerts', heading: HeadingLevel.HEADING_1 }),
          ...(alerts.length ? alerts : [{ title: 'No active alerts', message: 'Performance is within expected thresholds.' }]).map((alert: any) =>
            new Paragraph({
              bullet: { level: 0 },
              children: [new TextRun({ text: `${alert.title}: `, bold: true }), new TextRun(alert.message)],
            })
          ),
          new Paragraph({ text: 'Recommendations', heading: HeadingLevel.HEADING_1 }),
          ...recommendations.map((rec: any) =>
            new Paragraph({
              bullet: { level: 0 },
              children: [new TextRun({ text: `${rec.title}: `, bold: true }), new TextRun(rec.detail)],
            })
          ),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const filename = `${(report.name || 'mip-report').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.docx`;
  downloadBlob(blob, filename);
}

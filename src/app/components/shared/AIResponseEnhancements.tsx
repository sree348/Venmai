import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Copy, FileText, Gauge, Repeat } from 'lucide-react';
import { toast } from 'sonner';

const METRIC_DEFINITIONS: Record<string, string> = {
  CPL: 'Cost Per Lead: total spend divided by leads or conversions.',
  CPC: 'Cost Per Click: total spend divided by clicks.',
  CTR: 'Click-Through Rate: clicks divided by impressions.',
  CPM: 'Cost Per 1,000 Impressions: spend divided by impressions, multiplied by 1,000.',
  ROAS: 'Return On Ad Spend: revenue or action value divided by spend.',
  CVR: 'Conversion Rate: conversions divided by clicks or visits.',
  CPA: 'Cost Per Acquisition: total spend divided by acquired customers or conversions.',
};

const metricRegex = new RegExp(`\\b(${Object.keys(METRIC_DEFINITIONS).join('|')})\\b`, 'g');

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand('copy');
  document.body.removeChild(textArea);
}

export function renderMetricText(text: string, strongClassName = 'font-extrabold text-slate-900'): React.ReactNode {
  if (!text) return null;

  const nodes: React.ReactNode[] = [];
  text.split('**').forEach((part, boldIndex) => {
    const pieces = part.split(metricRegex);
    pieces.forEach((piece, pieceIndex) => {
      if (!piece) return;
      const key = `${boldIndex}-${pieceIndex}-${piece}`;
      const metric = METRIC_DEFINITIONS[piece];
      const node = metric ? (
        <span
          key={key}
          title={metric}
          className="inline-flex cursor-help items-center rounded border border-slate-200 bg-slate-50 px-1 text-[0.92em] font-extrabold text-slate-700 underline decoration-dotted underline-offset-2"
        >
          {piece}
        </span>
      ) : piece;

      nodes.push(boldIndex % 2 === 1 ? (
        <strong key={key} className={strongClassName}>
          {node}
        </strong>
      ) : node);
    });
  });

  return nodes;
}

function normalizeSectionTitle(title: string) {
  const lower = title.toLowerCase();
  if (lower.includes('metric') || lower.includes('snapshot') || lower.includes('platform')) return 'Metrics';
  if (lower.includes('flag') || lower.includes('risk') || lower.includes('warning')) return 'Flags';
  if (lower.includes('root') || lower.includes('why') || lower.includes('data is telling')) return 'Why';
  if (lower.includes('recommend') || lower.includes('action')) return 'Actions';
  if (lower.includes('ask') || lower.includes('look') || lower.includes('hidden')) return 'Suggested Questions';
  return title.replace(/^[#*\s:-]+|[#*\s:-]+$/g, '').slice(0, 36) || 'Analysis';
}

export function splitAnalysisSections(content: string) {
  const lines = content.split('\n');
  const sections: Array<{ title: string; body: string }> = [];
  let currentTitle = 'Headline';
  let buffer: string[] = [];

  const flush = () => {
    const body = buffer.join('\n').trim();
    if (body) sections.push({ title: normalizeSectionTitle(currentTitle), body });
    buffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const heading = trimmed.match(/^(?:#{1,3}\s*)?(?:\*\*)?([^:*#]{3,48})(?:\*\*)?\s*[:：-]?\s*$/);
    const isTableStart = trimmed.startsWith('|') && trimmed.toLowerCase().includes('metric');
    const isRecommendation = /recommendation|action table|what to do/i.test(trimmed);
    const isFlag = /critical|warning|opportunity|budget risk/i.test(trimmed) && trimmed.length < 90;

    if ((heading && !trimmed.startsWith('|') && buffer.length > 0) || isTableStart || isRecommendation || isFlag) {
      flush();
      currentTitle = isTableStart ? 'Metrics' : isRecommendation ? 'Actions' : isFlag ? 'Flags' : heading?.[1] || 'Analysis';
    }

    buffer.push(line);
  }

  flush();
  return sections.length ? sections : [{ title: 'Analysis', body: content }];
}

export function AIResponseActions({
  content,
  onAsk,
  compact = false,
}: {
  content: string;
  onAsk: (question: string) => void;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const reportSnippet = content
    .replace(/```chartdata[\s\S]*?```/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const handleCopyReport = async () => {
    try {
      await copyText(reportSnippet);
      setCopied(true);
      toast.success('Report snippet copied');
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error('Could not copy report snippet.');
    }
  };

  const buttonClass = compact
    ? 'h-7 px-2 text-[9px]'
    : 'h-8 px-3 text-[10px]';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onAsk(`Explain this like I am 5 in plain English:\n\n${content.slice(0, 3500)}`)}
        className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-colors ${buttonClass}`}
      >
        <Gauge className="size-3" />
        ELI5
      </button>
      <button
        type="button"
        onClick={() => onAsk('Compare this to the last period. Show what changed in spend, CPL, CTR, and the next action.')}
        className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-colors ${buttonClass}`}
      >
        <Repeat className="size-3" />
        Compare
      </button>
      <button
        type="button"
        onClick={handleCopyReport}
        className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-colors ${buttonClass}`}
      >
        {copied ? <Check className="size-3" /> : <FileText className="size-3" />}
        {copied ? 'Copied' : 'Report'}
      </button>
    </div>
  );
}

export function CollapsibleAnalysisResponse({
  content,
  compact = false,
}: {
  content: string;
  compact?: boolean;
}) {
  const sections = useMemo(() => splitAnalysisSections(content), [content]);
  const [openSections, setOpenSections] = useState<Record<number, boolean>>(() => ({ 0: true, 1: true }));

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {sections.map((section, index) => {
        const isOpen = openSections[index] ?? index < 2;
        return (
          <div key={`${section.title}-${index}`} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => setOpenSections(current => ({ ...current, [index]: !isOpen }))}
              className="flex w-full items-center justify-between gap-2 bg-slate-50 px-3 py-2 text-left text-[10px] font-extrabold uppercase tracking-wide text-slate-600 hover:bg-slate-100"
            >
              <span>{section.title}</span>
              {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            </button>
            {isOpen && (
              <div className={`whitespace-pre-wrap px-3 py-2 leading-relaxed text-slate-700 ${compact ? 'text-[11px]' : 'text-xs'}`}>
                {renderMetricText(section.body)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function copyPlainText(content: string) {
  return copyText(content);
}

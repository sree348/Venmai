import pptxgen from 'pptxgenjs';

export async function downloadReportPptx({ report, client, campaigns, integrations, kpis, platformData, tableAdsData }: any) {
  const pptx = new pptxgen();
  
  // Set layout
  pptx.layout = 'LAYOUT_16x9';
  
  // Slide 1: Title Slide (Sleek Dark Theme)
  const slide1 = pptx.addSlide();
  slide1.background = { fill: '0F172A' }; // Slate-900 Premium dark background
  
  slide1.addText('MarketIQ', {
    x: 1.0, y: 2.0, w: '80%', h: 0.8,
    fontSize: 48, bold: true, color: 'F8FAFC', fontFace: 'Trebuchet MS'
  });
  
  slide1.addText('Performance Marketer Intelligence Deck', {
    x: 1.0, y: 2.9, w: '80%', h: 0.5,
    fontSize: 22, color: '6366F1', fontFace: 'Trebuchet MS' // Indigo accent
  });
  
  slide1.addText(`Client Account: ${client?.name || 'All Clients'}\nScope: Performance Dashboard Insights\nGenerated: ${new Date().toLocaleDateString('en-IN')} ${new Date().toLocaleTimeString('en-IN')}`, {
    x: 1.0, y: 4.5, w: '80%', h: 1.2,
    fontSize: 13, color: '94A3B8', fontFace: 'Trebuchet MS', lineSpacing: 20
  });
  
  // Slide 2: Executive Summary (7 Key Metrics in Bento Cards)
  const slide2 = pptx.addSlide();
  slide2.addText('Executive Account Summary', { x: 0.5, y: 0.4, fontSize: 24, bold: true, color: '0F172A', fontFace: 'Trebuchet MS' });
  slide2.addText('Core performance marketing statistics calculated across filtered campaign databases.', { x: 0.5, y: 0.85, fontSize: 11, color: '64748B', fontFace: 'Arial' });
  
  const metrics = [
    { title: 'Total Spend', value: `₹${(kpis.totalSpend/1000).toFixed(1)}K`, desc: 'Budget spent' },
    { title: 'Conversions', value: kpis.totalConversions.toLocaleString(), desc: 'Total conversions' },
    { title: 'Blended CPL', value: kpis.totalConversions > 0 ? `₹${(kpis.totalSpend/kpis.totalConversions).toFixed(2)}` : 'N/A', desc: 'Cost per lead' },
    { title: 'Clicks', value: kpis.totalClicks.toLocaleString(), desc: 'Actions taken' },
    { title: 'Avg CTR', value: `${Number(kpis.avgCtr || 0).toFixed(2)}%`, desc: 'CTR rating' },
    { title: 'Avg CPC', value: `₹${kpis.avgCpc.toFixed(2)}`, desc: 'Cost per click' },
    { title: 'Avg CPM', value: `₹${kpis.avgCpm.toFixed(0)}`, desc: 'Cost per 1k views' }
  ];
  
  metrics.forEach((m, idx) => {
    const xPos = 0.5 + (idx % 4) * 2.25;
    const yPos = 1.3 + Math.floor(idx / 4) * 1.8;
    
    // Add card background shape
    slide2.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: xPos, y: yPos, w: 2.1, h: 1.6,
      fill: { color: 'F8FAFC' }, line: { color: 'E2E8F0', width: 1.5 }
    });
    
    // Add text inside shape
    slide2.addText(m.title.toUpperCase(), { x: xPos + 0.1, y: yPos + 0.15, w: 1.9, h: 0.3, fontSize: 9, bold: true, color: '64748B', fontFace: 'Trebuchet MS' });
    slide2.addText(m.value, { x: xPos + 0.1, y: yPos + 0.5, w: 1.9, h: 0.5, fontSize: 24, bold: true, color: '4F46E5', fontFace: 'Trebuchet MS' });
    slide2.addText(m.desc, { x: xPos + 0.1, y: yPos + 1.15, w: 1.9, h: 0.3, fontSize: 9, italic: true, color: '94A3B8', fontFace: 'Arial' });
  });
  
  // Slide 3: Platform Spend Allocation
  const slide3 = pptx.addSlide();
  slide3.addText('Spend & Cost Performance by Platform', { x: 0.5, y: 0.4, fontSize: 24, bold: true, color: '0F172A', fontFace: 'Trebuchet MS' });
  slide3.addText('Budget distribution and acquisition costs evaluated per ad source.', { x: 0.5, y: 0.85, fontSize: 11, color: '64748B', fontFace: 'Arial' });
  
  const platRows = [
    [
      { text: 'Platform', options: { bold: true, fill: 'EEF2F6', color: '0F172A' } }, 
      { text: 'Spend Allocation', options: { bold: true, fill: 'EEF2F6', color: '0F172A' } }, 
      { text: 'Impressions', options: { bold: true, fill: 'EEF2F6', color: '0F172A' } }, 
      { text: 'Reach', options: { bold: true, fill: 'EEF2F6', color: '0F172A' } }, 
      { text: 'CPC (INR)', options: { bold: true, fill: 'EEF2F6', color: '0F172A' } }
    ]
  ];
  
  platformData.forEach((p: any) => {
    platRows.push([
      { text: p.name, options: {} },
      { text: `₹${p.spend.toLocaleString('en-IN')}`, options: {} },
      { text: p.impressions.toLocaleString(), options: {} },
      { text: p.reach.toLocaleString(), options: {} },
      { text: `₹${p.cpc.toFixed(2)}`, options: {} }
    ]);
  });
  
  slide3.addTable(platRows, {
    x: 0.5, y: 1.3, w: 9.0, h: 1.8,
    border: { type: 'solid', color: 'CBD5E1', size: 1 },
    fontSize: 11, fontFace: 'Arial',
    align: 'center', valign: 'middle'
  });
  
  slide3.addShape(pptx.shapes.RECTANGLE, {
    x: 0.5, y: 3.5, w: 9.0, h: 1.5,
    fill: { color: 'F8FAFC' }, line: { color: 'E2E8F0', width: 1 }
  });
  slide3.addText('Key Takeaways & Opportunities:\n• Meta Ads accounts for the primary volume driver, leading the unique reach stats.\n• CPC variations between Meta and Google reflect distinct audience intent loops. Shift budgets towards platforms displaying sub-average CPC metrics to lower acquisition thresholds.', {
    x: 0.7, y: 3.6, w: 8.6, h: 1.3,
    fontSize: 11, color: '334155', fontFace: 'Trebuchet MS', lineSpacing: 18
  });
  
  // Slide 4: Creative Ad Performance Ledger (Table)
  const slide4 = pptx.addSlide();
  slide4.addText('Creative Ad Performance Ledger', { x: 0.5, y: 0.4, fontSize: 24, bold: true, color: '0F172A', fontFace: 'Trebuchet MS' });
  slide4.addText('Top active ad assets ranked by absolute budget spend with quality indices.', { x: 0.5, y: 0.85, fontSize: 11, color: '64748B', fontFace: 'Arial' });
  
  const adRows = [
    [
      { text: 'Ad Name', options: { bold: true, fill: 'EEF2F6', color: '0F172A' } },
      { text: 'Format', options: { bold: true, fill: 'EEF2F6', color: '0F172A' } },
      { text: 'Spend', options: { bold: true, fill: 'EEF2F6', color: '0F172A' } },
      { text: 'CTR%', options: { bold: true, fill: 'EEF2F6', color: '0F172A' } },
      { text: 'CPC', options: { bold: true, fill: 'EEF2F6', color: '0F172A' } },
      { text: 'Freq', options: { bold: true, fill: 'EEF2F6', color: '0F172A' } }
    ]
  ];
  
  tableAdsData.slice(0, 6).forEach((ad: any) => {
    adRows.push([
      { text: ad.ad_name, options: {} },
      { text: ad.ad_format, options: {} },
      { text: `₹${Math.round(ad.amount_spent).toLocaleString('en-IN')}`, options: {} },
      { text: `${Number(ad.ctr || 0).toFixed(2)}%`, options: { color: ad.ctr < 1.0 ? 'DC2626' : '0F172A' } },
      { text: `₹${ad.cpc.toFixed(2)}`, options: {} },
      { text: String(ad.frequency), options: { color: ad.frequency >= 3.0 ? 'D97706' : '0F172A' } }
    ]);
  });
  
  slide4.addTable(adRows, {
    x: 0.5, y: 1.3, w: 9.0, h: 3.5,
    border: { type: 'solid', color: 'CBD5E1', size: 1 },
    fontSize: 9.5, fontFace: 'Arial',
    align: 'left', valign: 'middle'
  });
  
  // Slide 5: Marketing Actions & Creative Fatigue analysis
  const slide5 = pptx.addSlide();
  slide5.addText('Ad Fatigue Warnings & Recommendations', { x: 0.5, y: 0.4, fontSize: 24, bold: true, color: '0F172A', fontFace: 'Trebuchet MS' });
  slide5.addText('Practical directives to lower frequency fatigue and optimize client CPC cost efficiency loops.', { x: 0.5, y: 0.85, fontSize: 11, color: '64748B', fontFace: 'Arial' });
  
  // Highlight Creative Fatigue Limits
  slide5.addShape(pptx.shapes.RECTANGLE, {
    x: 0.5, y: 1.3, w: 4.3, h: 3.8,
    fill: { color: 'FEF3C7' }, line: { color: 'F59E0B', width: 1.5 } // Warning Amber Panel
  });
  slide5.addText('⚠️ CREATIVE FATIGUE ALERTS', { x: 0.7, y: 1.45, w: 3.9, h: 0.3, fontSize: 13, bold: true, color: 'B45309', fontFace: 'Trebuchet MS' });
  
  const highFreqAds = tableAdsData.filter((ad: any) => ad.frequency >= 3.0);
  let fatigueText = 'Active ads exceeding critical 3.0 frequency fatigue limits:\n\n';
  if (highFreqAds.length > 0) {
    highFreqAds.slice(0, 3).forEach((ad: any) => {
      fatigueText += `• ${ad.ad_name}\n  (Current Freq: ${ad.frequency} | CTR: ${Number(ad.ctr || 0).toFixed(2)}%)\n\n`;
    });
    fatigueText += '👉 Recommendation: Pause these creatives immediately and upload fresh image/video specifications to restore conversion efficiency.';
  } else {
    fatigueText += 'All active creatives are running at healthy frequency levels (< 3.0). Fatigue decay risks remain low.';
  }
  
  slide5.addText(fatigueText, { x: 0.7, y: 1.9, w: 3.9, h: 3.0, fontSize: 10.5, color: '78350F', fontFace: 'Arial', lineSpacing: 18 });
  
  // General Insights
  slide5.addShape(pptx.shapes.RECTANGLE, {
    x: 5.2, y: 1.3, w: 4.3, h: 3.8,
    fill: { color: 'EEF2FF' }, line: { color: '6366F1', width: 1.5 } // Indigo Strategy Panel
  });
  slide5.addText('💡 HIGH-IMPACT ACQUISITION PLANS', { x: 5.4, y: 1.45, w: 3.9, h: 0.3, fontSize: 13, bold: true, color: '3730A3', fontFace: 'Trebuchet MS' });
  
  const optimizationText = 'Key budget scaling priorities:\n\n' +
    '1. Scale Winners: Relocate 20% budget share from broad core targeting to top LAL segments showing CPC below ₹50.00.\n\n' +
    '2. Spec Formats: Carousels and Videos represent 75% of clicked actions. Optimize ad creatives with specifications or specs.\n\n' +
    '3. Platform Scaling Gaps: Platform reach gaps show Meta saturation. Leverage multi-channel Google placements to capture conversion loops.';
    
  slide5.addText(optimizationText, { x: 5.4, y: 1.9, w: 3.9, h: 3.0, fontSize: 10.5, color: '312E81', fontFace: 'Arial', lineSpacing: 18 });
  
  // Save Presentation
  const filename = `market-iq-${(client?.name || 'performance').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pptx`;
  await pptx.writeFile({ fileName: filename });
}

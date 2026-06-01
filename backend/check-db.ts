import { mockCampaigns } from '../src/services/mock-data';

async function main() {
  console.log("=== SCANNING MOCK CAMPAIGNS VIA TSX ===");
  const clientCampaigns = mockCampaigns.filter(c => c.clientId === 'cai_mahindra');
  console.log(`Loaded ${clientCampaigns.length} mock campaigns.`);
  
  const n = clientCampaigns.length;
  let found = false;
  for (let i = 0; i < (1 << n); i++) {
    let spendSum = 0;
    let impressionsSum = 0;
    let clicksSum = 0;
    let reachSum = 0;
    const selected: string[] = [];
    
    for (let j = 0; j < n; j++) {
      if ((i & (1 << j)) !== 0) {
        spendSum += clientCampaigns[j].spend || 0;
        impressionsSum += clientCampaigns[j].impressions || 0;
        clicksSum += clientCampaigns[j].clicks || 0;
        reachSum += clientCampaigns[j].reach || 0;
        selected.push(clientCampaigns[j].name);
      }
    }
    
    if (Math.round(spendSum) === 53248 || clicksSum === 15219 || impressionsSum === 1475838) {
      console.log(`\nMATCH FOUND!`);
      console.log(`Selected campaigns:`, selected);
      console.log(`Spend: ${spendSum} (Target: 53248)`);
      console.log(`Impressions: ${impressionsSum} (Target: 1475838)`);
      console.log(`Clicks: ${clicksSum} (Target: 15219)`);
      console.log(`Reach: ${reachSum} (Target: 1068299)`);
      found = true;
    }
  }
  
  if (!found) {
    console.log("No subset of mock campaigns matches these exact metrics.");
  }
}

main().catch(console.error);

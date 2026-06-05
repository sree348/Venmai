const axios = require('axios');
require('dotenv').config();

const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;

async function main() {
  const url = `https://graph.facebook.com/v19.0/${AD_ACCOUNT_ID}/campaigns`;
  const response = await axios.get(url, {
    params: {
      fields: 'id,name,status,effective_status',
      access_token: ACCESS_TOKEN,
      limit: 500
    }
  });

  const campaigns = response.data.data;
  console.log(`Total campaigns fetched: ${campaigns.length}`);

  const mahindraCampaigns = campaigns.filter(c => {
    const name = c.name.toLowerCase();
    return name.includes('mahindra') || name.includes('cai') || name.includes('esuv') || name.includes('branding');
  });

  console.log("=== LIVE META CAMPAIGNS FOR CAI/MAHINDRA/ESUV ===");
  console.log(JSON.stringify(mahindraCampaigns, null, 2));
  console.log("Count:", mahindraCampaigns.length);
}

main().catch(console.error);

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: "postgresql://postgres:123@localhost:5432/MIP",
});

async function main() {
  console.log("=== FETCHING ALL CAI MAHINDRA CAMPAIGNS FROM DB ===");
  const res = await pool.query("SELECT * FROM campaign_data WHERE client_id = 'cai_mahindra'");
  console.log(`Found ${res.rows.length} total rows.`);

  if (res.rows.length === 0) {
    console.log("No campaigns found in db.");
    return;
  }

  // Let's group them or see unique campaigns
  const campaigns = {};
  res.rows.forEach(r => {
    if (!campaigns[r.campaign_name]) {
      campaigns[r.campaign_name] = {
        name: r.campaign_name,
        platform: r.platform,
        spend: 0,
        impressions: 0,
        clicks: 0,
        reach: 0,
        rows: []
      };
    }
    campaigns[r.campaign_name].spend += r.spend || 0;
    campaigns[r.campaign_name].impressions += r.impressions || 0;
    campaigns[r.campaign_name].clicks += r.clicks || 0;
    campaigns[r.campaign_name].reach += r.reach || 0; // note: reach doesn't simply sum, but let's see
    campaigns[r.campaign_name].rows.push(r);
  });

  const campaignList = Object.values(campaigns);
  console.log(`Aggregated into ${campaignList.length} unique campaigns:`);
  campaignList.forEach(c => {
    console.log(`- ${c.name} (${c.platform}): Spend=${c.spend}, Imp=${c.impressions}, Clicks=${c.clicks}, Reach=${c.reach}, Days=${c.rows.length}`);
  });

  // Let's test combinations of unique campaigns
  console.log("\n=== TESTING COMBINATIONS OF UNIQUE CAMPAIGNS ===");
  const n = campaignList.length;
  let found = false;
  for (let i = 0; i < (1 << n); i++) {
    let spendSum = 0;
    let impressionsSum = 0;
    let clicksSum = 0;
    const selected = [];

    for (let j = 0; j < n; j++) {
      if ((i & (1 << j)) !== 0) {
        spendSum += campaignList[j].spend;
        impressionsSum += campaignList[j].impressions;
        clicksSum += campaignList[j].clicks;
        selected.push(campaignList[j].name);
      }
    }

    if (Math.round(spendSum) === 53248 || clicksSum === 15219 || impressionsSum === 1475838) {
      console.log(`\nMATCH FOUND!`);
      console.log(`Selected unique campaigns:`, selected);
      console.log(`Spend: ${spendSum} (Target: 53248)`);
      console.log(`Impressions: ${impressionsSum} (Target: 1475838)`);
      console.log(`Clicks: ${clicksSum} (Target: 15219)`);
      found = true;
    }
  }

  // Let's also query date ranges
  console.log("\n=== TESTING DATE RANGES IN DB ===");
  // Let's get min and max dates
  const datesRes = await pool.query("SELECT MIN(date) as min_d, MAX(date) as max_d FROM campaign_data WHERE client_id = 'cai_mahindra'");
  console.log(`Campaign dates range from ${datesRes.rows[0].min_d} to ${datesRes.rows[0].max_d}`);

  // Let's query total aggregates for all of cai_mahindra
  const aggRes = await pool.query("SELECT SUM(spend) as spend, SUM(impressions) as imp, SUM(clicks) as clicks FROM campaign_data WHERE client_id = 'cai_mahindra'");
  console.log(`ALL TIME DB TOTALS: Spend=${aggRes.rows[0].spend}, Imp=${aggRes.rows[0].imp}, Clicks=${aggRes.rows[0].clicks}`);
}

main().catch(console.error).finally(() => pool.end());

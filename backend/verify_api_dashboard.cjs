const http = require('http');

const url = 'http://localhost:3000/api/v1/dashboard/campaigns?from=2026-03-01T00:00:00.000Z&to=2026-03-31T23:59:59.999Z&clientId=cai_mahindra&status=active';

http.get(url, {
  headers: {
    'x-tenant-id': 'agency',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0ZW5hbnRJZCI6ImFnZW5jeSIsInN1YiI6ImFnZW5jeSJ9.6vdIRDXCMAfrUwYhJ6lcXpr5IVdTaX2d2rA-UllVC0c'
  }
}, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const campaigns = JSON.parse(data);
      console.log(`Dashboard campaigns API returned ${campaigns.length} campaigns for March 2026:`);
      campaigns.slice(0, 10).forEach(c => {
        console.log(`- ${c.campaignName} (Platform: ${c.platform}, Spend: ${c.spend})`);
      });
      if (campaigns.length > 10) console.log(`... and ${campaigns.length - 10} more`);
    } catch (e) {
      console.error("Failed to parse JSON:", e);
      console.log("Raw Response was:", data);
    }
  });
}).on('error', (err) => {
  console.error("Dashboard campaigns API failed:", err.message);
});

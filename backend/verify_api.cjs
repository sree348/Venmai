const http = require('http');

http.get('http://localhost:3000/api/v1/campaigns?tenantId=agency', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const campaigns = JSON.parse(data);
      console.log(`API returned ${campaigns.length} campaigns:`);
      campaigns.forEach(c => {
        console.log(`- ${c.name} (Platform: ${c.channel}, Client: ${c.clientId}, Spend: ${c.spend})`);
      });
    } catch (e) {
      console.error("Failed to parse JSON response:", e);
      console.log("Raw Response was:", data);
    }
  });
}).on('error', (err) => {
  console.error("API request failed:", err.message);
});

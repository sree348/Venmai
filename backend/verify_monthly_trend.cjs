const http = require('http');

const url = 'http://localhost:3000/api/v1/dashboard/monthly-trend?clientId=cai_mahindra';

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
      const response = JSON.parse(data);
      console.log(`Monthly Trend API returned ${response.length} months:`);
      console.log(JSON.stringify(response, null, 2));
    } catch (e) {
      console.error("Failed to parse JSON:", e);
      console.log("Raw Response was:", data);
    }
  });
}).on('error', (err) => {
  console.error("Monthly Trend API failed:", err.message);
});

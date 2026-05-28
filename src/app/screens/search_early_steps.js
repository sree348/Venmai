import fs from 'fs';

const transcriptPath = "C:\\Users\\Venpep office\\.gemini\\antigravity-ide\\brain\\97b14cbd-e794-49b9-beb2-f396f629a66d\\.system_generated\\logs\\transcript.jsonl";

try {
  const content = fs.readFileSync(transcriptPath, 'utf8');
  const lines = content.split('\n');
  
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const data = JSON.parse(line);
      if (data.step_index < 500 && JSON.stringify(data).includes("DashboardViewerScreen.tsx")) {
        console.log(`Step ${data.step_index}: source=${data.source}, type=${data.type}`);
      }
    } catch (e) {}
  }
} catch (err) {
  console.error(err);
}

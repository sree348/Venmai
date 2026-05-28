import fs from 'fs';

const transcriptPath = "C:\\Users\\Venpep office\\.gemini\\antigravity-ide\\brain\\97b14cbd-e794-49b9-beb2-f396f629a66d\\.system_generated\\logs\\transcript.jsonl";

try {
  const content = fs.readFileSync(transcriptPath, 'utf8');
  const lines = content.split('\n');
  
  console.log("Total lines in log:", lines.length);
  
  let matchCount = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const data = JSON.parse(line);
      const dataStr = JSON.stringify(data);
      if (dataStr.includes("DashboardViewerScreen.tsx")) {
        console.log(`Step ${data.step_index}: source=${data.source}, type=${data.type}, content_len=${data.content ? data.content.length : 0}`);
        matchCount++;
      }
    } catch (e) {}
  }
  console.log("Total matches:", matchCount);
} catch (err) {
  console.error("Error reading transcript:", err);
}

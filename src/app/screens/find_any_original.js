import fs from 'fs';

const transcriptPath = "C:\\Users\\Venpep office\\.gemini\\antigravity-ide\\brain\\97b14cbd-e794-49b9-beb2-f396f629a66d\\.system_generated\\logs\\transcript.jsonl";

try {
  const content = fs.readFileSync(transcriptPath, 'utf8');
  const lines = content.split('\n');
  
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const data = JSON.parse(line);
      if (data.content && data.content.includes("export default function DashboardViewerScreen")) {
        const rawLines = data.content.split('\n');
        const cleanLines = [];
        let started = false;
        for (const rl of rawLines) {
          if (rl.includes("Total Lines:") || rl.includes("File Path:")) continue;
          const match = rl.match(/^\d+:\s?(.*)/);
          if (match) {
            cleanLines.push(match[1]);
            started = true;
          } else if (started) {
            cleanLines.push(rl);
          }
        }
        
        const cleanText = cleanLines.join('\n');
        console.log(`Step ${data.step_index}: type=${data.type}, source=${data.source}, clean_len=${cleanText.length}`);
      }
    } catch (e) {}
  }
} catch (err) {
  console.error(err);
}

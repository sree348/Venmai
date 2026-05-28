import fs from 'fs';

const transcriptPath = "C:\\Users\\Venpep office\\.gemini\\antigravity-ide\\brain\\97b14cbd-e794-49b9-beb2-f396f629a66d\\.system_generated\\logs\\transcript.jsonl";

try {
  const content = fs.readFileSync(transcriptPath, 'utf8');
  const lines = content.split('\n');
  
  let bestStep = -1;
  let bestLen = 0;
  let bestText = "";
  
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const data = JSON.parse(line);
      // Look for a VIEW_FILE or WRITE_FILE where content has the DashboardViewerScreen content
      if (data.content && data.content.includes("export default function DashboardViewerScreen")) {
        // Strip line numbers to measure actual clean content length
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
            if (rl.toLowerCase().includes("truncated") || rl.includes("The above content does NOT show")) {
              continue;
            }
            cleanLines.push(rl);
          }
        }
        
        const cleanText = cleanLines.join('\n');
        // Let's print out text lengths to see
        if (cleanText.includes("Tile 13") || cleanText.includes("Tile 14") || cleanText.includes("efficiency plot") || cleanText.includes("AI Quadrant Efficiency Plot")) {
          console.log(`Step ${data.step_index}: type=${data.type}, clean_len=${cleanText.length}`);
          if (cleanText.length > bestLen) {
            bestLen = cleanText.length;
            bestStep = data.step_index;
            bestText = cleanText;
          }
        }
      }
    } catch (e) {}
  }
  
  if (bestStep !== -1) {
    const outPath = "c:\\Users\\Venpep office\\Downloads\\Mip-main (2)\\Mip-main\\src\\app\\screens\\DashboardViewerScreen.tsx.recovered_full";
    fs.writeFileSync(outPath, bestText, 'utf8');
    console.log(`Success! Step ${bestStep} had the longest clean content (${bestLen} bytes). Wrote to ${outPath}`);
  } else {
    console.log("No full dashboard version found matching tiles 13/14.");
  }
} catch (err) {
  console.error(err);
}

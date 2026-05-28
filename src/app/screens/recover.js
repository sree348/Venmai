import fs from 'fs';
import path from 'path';

const transcriptPath = "C:\\Users\\Venpep office\\.gemini\\antigravity-ide\\brain\\97b14cbd-e794-49b9-beb2-f396f629a66d\\.system_generated\\logs\\transcript.jsonl";
const outputPath = "c:\\Users\\Venpep office\\Downloads\\Mip-main (2)\\Mip-main\\src\\app\\screens\\DashboardViewerScreen.tsx.recovered";

try {
  const content = fs.readFileSync(transcriptPath, 'utf8');
  const lines = content.split('\n');
  
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const data = JSON.parse(line);
      // We are looking for the original load of DashboardViewerScreen.tsx
      if (data.type === "VIEW_FILE" && data.content && data.content.includes("export default function DashboardViewerScreen")) {
        const fileContent = data.content;
        console.log("Found file content in step:", data.step_index);
        
        // Clean line numbers
        const fileLines = fileContent.split('\n');
        const cleanLines = [];
        let started = false;
        
        for (const fl of fileLines) {
          if (fl.includes("Total Lines:") || fl.includes("File Path:")) continue;
          
          const match = fl.match(/^\d+:\s?(.*)/);
          if (match) {
            cleanLines.push(match[1]);
            started = true;
          } else if (started) {
            if (fl.toLowerCase().includes("truncated") || fl.includes("The above content does NOT show")) {
              continue;
            }
            cleanLines.push(fl);
          }
        }
        
        fs.writeFileSync(outputPath, cleanLines.join('\n'), 'utf8');
        console.log("Successfully wrote recovered file to:", outputPath);
        break;
      }
    } catch (e) {
      // ignore parse errors
    }
  }
} catch (err) {
  console.error("Error reading transcript:", err);
}

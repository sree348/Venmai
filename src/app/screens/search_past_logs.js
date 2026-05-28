import fs from 'fs';

const pastTranscriptPath = "C:\\Users\\Venpep office\\.gemini\\antigravity-ide\\brain\\03551adf-099d-4e2a-8ae9-50eae3c2247d\\.system_generated\\logs\\transcript.jsonl";

try {
  if (fs.existsSync(pastTranscriptPath)) {
    const content = fs.readFileSync(pastTranscriptPath, 'utf8');
    const lines = content.split('\n');
    
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line);
        if (JSON.stringify(data).includes("DashboardViewerScreen.tsx")) {
          console.log(`Step ${data.step_index}: source=${data.source}, type=${data.type}, content_len=${data.content ? data.content.length : 0}`);
        }
      } catch (e) {}
    }
  } else {
    console.log("Past transcript path does not exist");
  }
} catch (err) {
  console.error(err);
}

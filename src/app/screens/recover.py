import json
import re

transcript_path = r"C:\Users\Venpep office\.gemini\antigravity-ide\brain\97b14cbd-e794-49b9-beb2-f396f629a66d\.system_generated\logs\transcript.jsonl"
output_path = r"c:\Users\Venpep office\Downloads\Mip-main (2)\Mip-main\src\app\screens\DashboardViewerScreen.tsx.recovered"

with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            # We want to find a VIEW_FILE action where the path is DashboardViewerScreen.tsx
            # Or where the content contains the full text of the file
            if data.get("type") == "VIEW_FILE" and "DashboardViewerScreen.tsx" in data.get("content", ""):
                content = data.get("content", "")
                if "export default function DashboardViewerScreen" in content:
                    print("Found file content in step_index:", data.get("step_index"))
                    
                    # Clean up the output by removing line numbers "1: ", "2: ", etc.
                    lines = content.split('\n')
                    clean_lines = []
                    started = False
                    for l in lines:
                        if "Total Lines:" in l or "File Path:" in l:
                            continue
                        m = re.match(r'^\d+:\s?(.*)', l)
                        if m:
                            clean_lines.append(m.group(1))
                            started = True
                        elif started:
                            # If it's a truncated or other line, we can just keep it or stop
                            if "truncated" in l.lower() or "The above content does NOT show" in l:
                                continue
                            clean_lines.append(l)
                    
                    recovered_code = '\n'.join(clean_lines)
                    with open(output_path, 'w', encoding='utf-8') as out:
                        out.write(recovered_code)
                    print("Successfully wrote recovered file to:", output_path)
                    break
        except Exception as e:
            pass

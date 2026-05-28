import fs from 'fs';
import path from 'path';

const srcDir = 'c:/Users/Venpep office/Downloads/Mip-main (2)/Mip-main/src';

function scanDir(dir: string) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanDir(fullPath);
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const lower = content.toLowerCase();
      if (lower.includes('recommendation') || lower.includes('insight') || lower.includes('brain')) {
        console.log(`\nFile: ${fullPath}`);
        
        // Print lines that match
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          if (line.toLowerCase().includes('recommendation') || line.toLowerCase().includes('insight') || line.toLowerCase().includes('brain')) {
            console.log(`  Line ${idx + 1}: ${line.trim().slice(0, 100)}`);
          }
        });
      }
    }
  }
}

scanDir(srcDir);

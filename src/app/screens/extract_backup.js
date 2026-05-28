import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';

const tarPath = "C:\\Users\\Venpep office\\Downloads\\Mip-main (2)\\project.tar.gz";
const extractPath = "Mip-main/src/app/screens/DashboardViewerScreen.tsx";
const workspaceDir = "C:\\Users\\Venpep office\\Downloads\\Mip-main (2)";

console.log("Tar path:", tarPath);
console.log("Target extract path inside archive:", extractPath);

exec(`tar -zxvf "${tarPath}" "${extractPath}"`, { cwd: workspaceDir }, (error, stdout, stderr) => {
  if (error) {
    console.error("Execution error:", error);
    return;
  }
  console.log("Stdout:", stdout);
  console.log("Stderr:", stderr);
  console.log("Extract finished.");
  
  // Let's check if the file was extracted
  const extractedFile = path.join(workspaceDir, extractPath);
  if (fs.existsSync(extractedFile)) {
    console.log("Success! Extracted file exists at:", extractedFile);
    // Copy it to our screens directory as .recovered_tar
    const dest = 'C:\\Users\\Venpep office\\Downloads\\Mip-main (2)\\Mip-main\\src\\app\\screens\\DashboardViewerScreen.tsx.recovered_tar';
    fs.copyFileSync(extractedFile, dest);
    console.log("Copied to local dir:", dest);
  } else {
    console.log("Extracted file not found at:", extractedFile);
  }
});

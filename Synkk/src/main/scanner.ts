import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

export interface DiscoveredPOS {
  name: string;
  executablePath: string;
  type: string;
}

const IGNORE_LIST = ['chrome', 'edge', 'windows', 'microsoft', 'adobe', 'intel', 'nvidia', 'node', 'npm', 'git', 'java', 'python', 'vscode', 'temp'];

export async function scanForPOS(): Promise<DiscoveredPOS[]> {
  const discovered: DiscoveredPOS[] = [];
  
  const searchPaths = [
    path.join(os.homedir(), 'AppData', 'Local', 'Programs'),
    path.join(os.homedir(), 'AppData', 'Roaming'),
    'C:\\Program Files',
    'C:\\Program Files (x86)',
  ];

  const allFolders: string[] = [];

  for (const baseDir of searchPaths) {
    if (!fs.existsSync(baseDir)) continue;
    
    try {
      const folders = fs.readdirSync(baseDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
        
      for (const folder of folders) {
        const lowerFolder = folder.toLowerCase();
        // Skip common non-POS junk to save AI tokens
        if (IGNORE_LIST.some(ignore => lowerFolder.includes(ignore))) continue;
        allFolders.push(folder);
      }
    } catch (e) {
      console.warn(`Could not read directory ${baseDir}:`, e);
    }
  }

  if (allFolders.length === 0) return [];

  try {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || '';
    if (!apiKey) throw new Error("Missing Gemini API Key");

    const geminiClient = new GoogleGenerativeAI(apiKey);
    const model = geminiClient.getGenerativeModel({ model: "gemini-3.1-flash-lite" });
    const prompt = `System Instruction: You are an expert IT system scanner. I am going to give you a list of installed program folders on a user's Windows computer. 
Your job is to identify which of these folders are highly likely to contain Point of Sale (POS), Pharmacy Management, or retail inventory software (for example: VirtualRx, Square, PioneerRx, Rx30, Liberty, etc. but could be ANY unknown POS).
Return ONLY a valid JSON array of strings containing the exact folder names you identified. No markdown wrapping. If none match, return [].

Folders:
${JSON.stringify(allFolders)}`;

    console.log("Asking AI to analyze", allFolders.length, "installed programs...");
    const result = await model.generateContent(prompt);
    let aiResponse = result.response.text().trim();
    
    // Clean up markdown just in case
    if (aiResponse.startsWith('```json')) aiResponse = aiResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    if (aiResponse.startsWith('```')) aiResponse = aiResponse.replace(/```/g, '').trim();

    const identifiedFolders: string[] = JSON.parse(aiResponse);
    console.log("AI discovered POS systems:", identifiedFolders);

    for (const folder of identifiedFolders) {
       for (const baseDir of searchPaths) {
         if (!fs.existsSync(baseDir)) continue;
         const fullPath = path.join(baseDir, folder);
         
         if (fs.existsSync(fullPath)) {
            let mainExePath = fullPath;
            try {
               const contents = fs.readdirSync(mainExePath);
               const exes = contents.filter(f => f.toLowerCase().endsWith('.exe') && !f.toLowerCase().includes('uninstall') && !f.toLowerCase().includes('uninst'));
               if (exes.length > 0) {
                   const matchingExe = exes.find(e => e.toLowerCase().includes(folder.toLowerCase()));
                   mainExePath = path.join(mainExePath, matchingExe || exes[0]);
               }
            } catch(e) {}

            const displayName = folder.charAt(0).toUpperCase() + folder.slice(1);
            if (!discovered.some(d => d.name === displayName)) {
              discovered.push({
                name: displayName,
                executablePath: mainExePath,
                type: 'Discovered POS'
              });
            }
            break; // Stop searching other baseDirs once found
         }
       }
    }
  } catch (error) {
     console.error("AI scanning failed:", error);
  }

  return discovered;
}

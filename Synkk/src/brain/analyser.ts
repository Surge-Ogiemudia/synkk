import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getKnowledgeBaseEntry, getAllKnowledge } from './knowledge';

let anthropicClient: Anthropic | null = null;
let geminiClient: GoogleGenerativeAI | null = null;

export async function analyzePOSSystem(pathOrUrl: string, sampleData: string) {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('WARNING: Gemini API key not found in environment');
    }
    geminiClient = new GoogleGenerativeAI(apiKey || '');
  }

  // 1. Check if we already know this POS exactly from Knowledge Base
  const existing = await getKnowledgeBaseEntry(pathOrUrl);
  if (existing) {
    return { status: 'known', schema: existing.schemaMapping };
  }

  console.log(`Analyzing new POS at ${pathOrUrl}`);
  
  // 2. Fetch global knowledge to give AI context on how other POS systems are mapped
  const globalContext = await getAllKnowledge();
  let contextStr = '';
  if (globalContext.length > 0) {
    contextStr = `\nFor context, here are examples of schemas you've successfully mapped across other installations:\n${JSON.stringify(globalContext, null, 2)}\nUse these patterns as hints if you see similar column names!\n`;
  }
  
  const prompt = `You are an expert database analyst and software engineer. I am providing you with a raw data extract or schema dump from a pharmacy POS system.
Your job is to identify the columns that correspond to the following information:
1. Medicine Name
2. Quantity in Stock
3. Unit Price
4. Expiry Date (if available)

Please return ONLY a valid JSON object with the following keys:
- "nameCol": (string)
- "qtyCol": (string)
- "priceCol": (string)
- "expiryCol": (string or null)
- "brandCol": (string or null)
- "imageCol": (string or null)
- "tableName": (string or "unknown")
${contextStr}
Here is the sample data/schema:
${sampleData}`;

  let schemaStr = '';

  try {
    const msg = await anthropicClient.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 1000,
      temperature: 0,
      system: "You are a technical data mapper that outputs strictly valid JSON without markdown wrapping or explanations.",
      messages: [
        {
          "role": "user",
          "content": [
            {
              "type": "text",
              "text": prompt
            }
          ]
        }
      ]
    });

    const textContent = msg.content.find(block => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error("No text content returned from Claude");
    }
    schemaStr = textContent.text.trim();
  } catch (error: any) {
    console.warn('Anthropic API failed or ran out of credits. Falling back to Gemini...');
    
    try {
      const model = geminiClient.getGenerativeModel({ 
        model: "gemini-3.1-flash-lite",
        systemInstruction: "You are a technical data mapper that outputs strictly valid JSON without markdown wrapping or explanations."
      });
      const result = await model.generateContent(prompt);
      schemaStr = result.response.text().trim();
      // Remove possible markdown json blocks from gemini
      if (schemaStr.startsWith('```json')) {
        schemaStr = schemaStr.replace(/```json/g, '').replace(/```/g, '').trim();
      } else if (schemaStr.startsWith('```')) {
        schemaStr = schemaStr.replace(/```/g, '').trim();
      }
    } catch (geminiError) {
      console.error('Both Anthropic and Gemini failed:', geminiError);
      throw geminiError;
    }
  }

  try {
    const schema = JSON.parse(schemaStr);
    
    let rawSample: any[] = [];
    const ext = pathOrUrl.toLowerCase();
    
    if (schema.tableName && schema.tableName !== 'unknown' && (ext.endsWith('.db') || ext.endsWith('.sqlite') || ext.endsWith('.sqlite3'))) {
      try {
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        const { execSync } = require('child_process');
        
        const tempPath = path.join(process.cwd(), `synkk-sqlite-fetch-${Date.now()}.js`);
        const script = `
          const Database = require('better-sqlite3');
          const db = new Database('${pathOrUrl.replace(/\\/g, '\\\\')}', { readonly: true });
          const rows = db.prepare('SELECT * FROM ${schema.tableName} LIMIT 5').all();
          console.log(JSON.stringify(rows));
        `;
        
        fs.writeFileSync(tempPath, script);
        const output = execSync(`node "${tempPath}"`, { encoding: 'utf-8', cwd: process.cwd() });
        fs.unlinkSync(tempPath);
        
        rawSample = JSON.parse(output.trim());
        console.log(`Successfully pulled ${rawSample.length} raw rows from ${schema.tableName} via Node child_process`);
      } catch (dbError: any) {
        console.error("Failed to fetch raw sample from SQLite database via child process:", dbError.stderr ? dbError.stderr.toString() : dbError);
      }
    }

    return {
      status: 'analyzed',
      schemaMapping: schema,
      rawSample
    };
  } catch (parseError) {
    console.error('Failed to parse AI output as JSON:', schemaStr);
    throw new Error('AI returned malformed JSON');
  }
}

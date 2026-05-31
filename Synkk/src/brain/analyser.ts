import { getKnowledgeBaseEntry, getAllKnowledge } from './knowledge';

export async function analyzePOSSystem(pathOrUrl: string, sampleData: string) {
  // 1. Check if we already know this POS exactly from Knowledge Base
  const existing = await getKnowledgeBaseEntry(pathOrUrl);
  if (existing) {
    return { status: 'known', schema: existing.schemaMapping };
  }

  console.log(`Analyzing new POS at ${pathOrUrl} via Vercel Backend`);
  
  // 2. Fetch global knowledge to give AI context on how other POS systems are mapped
  const globalContext = await getAllKnowledge();

  let schemaMapping;

  try {
    const response = await fetch('https://www.pharmastackx.com/api/synkk-ai/analyze-pos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pathOrUrl,
        sampleData,
        globalContext
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`Vercel Backend returned ${response.status}: ${err.error || response.statusText}`);
    }

    const data = await response.json();
    schemaMapping = data.schemaMapping;

  } catch (error: any) {
    console.error('Failed to analyze POS via Vercel Backend:', error.message);
    throw new Error(`AI Analysis Failed: ${error.message}`);
  }

  try {
    let rawSample: any[] = [];
    const ext = pathOrUrl.toLowerCase();
    
    if (schemaMapping.tableName && schemaMapping.tableName !== 'unknown' && (ext.endsWith('.db') || ext.endsWith('.sqlite') || ext.endsWith('.sqlite3'))) {
      try {
        const Database = require('better-sqlite3');
        const db = new Database(pathOrUrl, { readonly: true });
        rawSample = db.prepare(`SELECT * FROM ${schemaMapping.tableName} LIMIT 5`).all();
        console.log(`Successfully pulled ${rawSample.length} raw rows from ${schemaMapping.tableName} natively`);
      } catch (dbError: any) {
        console.error("Failed to fetch raw sample from SQLite database:", dbError.message);
      }
    } else if (ext.endsWith('.csv')) {
      const lines = sampleData.split('\n').filter(l => l.trim().length > 0);
      if (lines.length > 1) {
        const headers = lines[0].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        rawSample = lines.slice(1, 6).map(line => {
          const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
          const rowObj: any = {};
          headers.forEach((header, i) => {
            rowObj[header] = vals[i];
          });
          return rowObj;
        });
        console.log(`Successfully parsed ${rawSample.length} raw rows from CSV sample natively`);
      }
    }

    return {
      status: 'analyzed',
      schemaMapping: schemaMapping,
      rawSample
    };
  } catch (parseError) {
    console.error('Failed to parse AI output:', parseError);
    throw new Error('Local data fetch failed after AI mapping');
  }
}


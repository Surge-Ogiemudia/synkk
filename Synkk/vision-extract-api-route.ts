/**
 * POST /api/synkk-ai/vision-extract
 *
 * Tier 4b endpoint — receives a base64-encoded PNG screenshot of a pharmacy
 * POS inventory screen and uses Google Gemini Vision (or GPT-4o) to extract
 * structured inventory items from the visible table.
 *
 * Request body:
 *   imageBase64  string   Base64-encoded PNG data (no prefix)
 *   mimeType     string   "image/png"
 *   tier         string   "4b" (for logging)
 *   page         number   Current page number (for logging)
 *
 * Response:
 *   items        Array<{ name: string; qty: number; price: number }>
 *   total        number | undefined   If the screen shows "X of Y", return Y
 *   totalItems   number | undefined   Alias for total
 *   page         number               Echo of input page
 */

import { NextRequest, NextResponse } from 'next/server';

// ── Constants ─────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert pharmacy inventory data extractor.
You are given a screenshot of a pharmacy POS system's stock/inventory screen.

Your job:
1. Extract ALL visible inventory rows from any table, list or grid on screen.
2. For each row, extract:
   - name: the medicine or product name (string)
   - qty: the stock quantity as a plain integer (0 if unknown)
   - price: the selling/retail price as a plain number in the local currency (0 if unknown)
3. If you can see text like "Showing X–Y of Z" or "Total: Z" or "Z items", extract Z as the "total".
4. DO NOT include column headers, totals rows, or blank rows.
5. Return ONLY a valid JSON object — no markdown, no explanation.

Output format (strict):
{
  "items": [
    { "name": "...", "qty": 0, "price": 0 }
  ],
  "total": 847
}

If total is not visible, omit the "total" field entirely.
If the screen shows no inventory table (e.g. login page, dashboard), return { "items": [] }.`;

// ── Handler ───────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageBase64, mimeType = 'image/png', page = 1 } = body;

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return NextResponse.json({ error: 'imageBase64 is required' }, { status: 400 });
    }

    // ── Gemini Vision (primary) ──────────────────────────────────────
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY not configured on server' }, { status: 500 });
    }

    const geminiPayload = {
      contents: [
        {
          parts: [
            { text: SYSTEM_PROMPT },
            {
              inline_data: {
                mime_type: mimeType,
                data: imageBase64,
              },
            },
            {
              text: `This is page ${page} of the inventory screen. Extract all visible rows.`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    };

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiPayload),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('[vision-extract] Gemini error:', errText);
      return NextResponse.json(
        { error: `Gemini Vision failed: ${geminiRes.status}` },
        { status: 502 }
      );
    }

    const geminiData = await geminiRes.json();
    const rawText: string =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    // Parse the JSON the model returned
    let parsed: { items?: any[]; total?: number; totalItems?: number };
    try {
      // Strip any accidental markdown fences the model may emit
      const cleaned = rawText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('[vision-extract] Failed to parse model JSON:', rawText);
      return NextResponse.json({ items: [], page, error: 'Model returned non-JSON' }, { status: 200 });
    }

    const items: any[] = Array.isArray(parsed.items) ? parsed.items : [];

    // Sanitize items — ensure qty and price are numbers
    const sanitized = items
      .filter((item) => item && typeof item.name === 'string' && item.name.trim().length > 1)
      .map((item) => ({
        name: String(item.name).replace(/<[^>]*>/g, '').trim(),
        qty: Number(item.qty) || 0,
        price: Number(item.price) || 0,
      }));

    const response: Record<string, any> = { items: sanitized, page };

    // Propagate total hint if the model found it
    const total = parsed.total ?? parsed.totalItems;
    if (typeof total === 'number' && total > 0) {
      response.total = total;
      response.totalItems = total;
    }

    console.log(
      `[vision-extract] Page ${page}: extracted ${sanitized.length} items${total ? `, total=${total}` : ''}`
    );

    return NextResponse.json(response, { status: 200 });
  } catch (err: any) {
    console.error('[vision-extract] Unexpected error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

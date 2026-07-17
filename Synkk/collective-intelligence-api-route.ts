/**
 * /api/synkk-ai/collective-intelligence/route.ts
 *
 * Collective Intelligence endpoints for the Synkk fleet.
 *
 * GET  ?pattern=<url-pattern>&slug=<pharmacy-slug>
 *   Returns the best known extraction method for this URL pattern,
 *   if one exists with ≥1 confirmation from another pharmacy.
 *
 * POST { method: ExtractionMethod, slug: string }
 *   Records (or increments) a confirmed working extraction method.
 *   Upserts by urlPattern — increments `confirmations` if already exists.
 *
 * MongoDB collection: synkk_extraction_methods
 */

import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb'; // adjust import path to your project

// ── Types ─────────────────────────────────────────────────────────────
interface ExtractionMethod {
  urlPattern: string;
  tier: number;
  tierName: string;
  apiEndpoint?: string;
  paginationStyle?: string;
  paginationParams?: Record<string, string>;
  posName?: string;
  confirmations: number;
  lastSuccess: string;
  /** Slugs that have confirmed this method (dedup) */
  confirmedBy?: string[];
}

const COLLECTION = 'synkk_extraction_methods';

// ── GET ───────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const pattern = searchParams.get('pattern');
  const slug = searchParams.get('slug') || 'anonymous';

  if (!pattern) {
    return NextResponse.json({ error: 'pattern is required' }, { status: 400 });
  }

  try {
    const client = await clientPromise;
    const db = client.db();
    const col = db.collection<ExtractionMethod>(COLLECTION);

    // Find the best method: highest confirmations, exact pattern match
    const method = await col.findOne(
      { urlPattern: pattern },
      { sort: { confirmations: -1 } }
    );

    if (!method) {
      return NextResponse.json({ found: false }, { status: 200 });
    }

    // Don't return the confirmedBy array to the client — it's internal
    const { confirmedBy: _, ...publicMethod } = method as any;

    console.log(
      `[CI] GET pattern="${pattern}" slug="${slug}" → found tier=${method.tier} confirmations=${method.confirmations}`
    );

    return NextResponse.json({
      found: true,
      method: publicMethod,
      confirmations: method.confirmations,
    });
  } catch (err: any) {
    console.error('[CI] GET error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── POST ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { method, slug = 'anonymous' } = body as { method: Omit<ExtractionMethod, 'confirmations' | 'lastSuccess'>; slug: string };

    if (!method?.urlPattern || typeof method.tier !== 'number') {
      return NextResponse.json({ error: 'method.urlPattern and method.tier are required' }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db();
    const col = db.collection<ExtractionMethod>(COLLECTION);

    const now = new Date().toISOString();

    // Upsert: if the pattern exists and this slug hasn't confirmed it yet,
    // increment confirmations. Otherwise insert fresh.
    const existing = await col.findOne({ urlPattern: method.urlPattern });

    if (existing) {
      const alreadyConfirmed = existing.confirmedBy?.includes(slug);
      const updateDoc: any = {
        $set: {
          tier: method.tier,
          tierName: method.tierName,
          lastSuccess: now,
          ...(method.apiEndpoint && { apiEndpoint: method.apiEndpoint }),
          ...(method.paginationStyle && { paginationStyle: method.paginationStyle }),
          ...(method.paginationParams && { paginationParams: method.paginationParams }),
          ...(method.posName && { posName: method.posName }),
        },
        ...(alreadyConfirmed ? {} : {
          $inc: { confirmations: 1 },
          $addToSet: { confirmedBy: slug },
        }),
      };

      await col.updateOne({ urlPattern: method.urlPattern }, updateDoc);

      const updated = await col.findOne({ urlPattern: method.urlPattern });
      console.log(`[CI] POST updated pattern="${method.urlPattern}" confirmations=${updated?.confirmations}`);
      return NextResponse.json({ success: true, confirmations: updated?.confirmations ?? existing.confirmations });
    } else {
      // First time this pattern has been seen
      const doc: ExtractionMethod = {
        ...method,
        confirmations: 1,
        lastSuccess: now,
        confirmedBy: [slug],
      };
      await col.insertOne(doc);
      console.log(`[CI] POST inserted new pattern="${method.urlPattern}" tier=${method.tier}`);
      return NextResponse.json({ success: true, confirmations: 1 });
    }
  } catch (err: any) {
    console.error('[CI] POST error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

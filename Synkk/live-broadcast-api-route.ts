/**
 * /api/synkk-ai/live-broadcast/route.ts
 *
 * Receives the heavily compressed live frames from the Synkk client
 * during a background Web POS extraction, and broadcasts them via
 * Pusher to the PharmastackX admin dashboard for remote oversight.
 */

import { NextRequest, NextResponse } from 'next/server';
// Assuming Pusher is initialized elsewhere in PSX or initialized here
// import Pusher from 'pusher';
// 
// const pusher = new Pusher({
//   appId: process.env.PUSHER_APP_ID!,
//   key: process.env.NEXT_PUBLIC_PUSHER_KEY!,
//   secret: process.env.PUSHER_SECRET!,
//   cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
//   useTLS: true,
// });

export async function POST(req: NextRequest) {
  try {
    const { slug, frameBase64, timestamp } = await req.json();

    if (!slug || !frameBase64) {
      return NextResponse.json({ error: 'Missing slug or frame' }, { status: 400 });
    }

    // Protect against excessively large frames hitting Pusher limits
    const payloadSize = Buffer.byteLength(frameBase64, 'utf8');
    if (payloadSize > 250000) { // arbitrary safe limit
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    // In a real Vercel/Pusher setup, trigger the broadcast:
    // await pusher.trigger(`private-admin-${slug}`, 'live-frame', {
    //   frame: frameBase64,
    //   timestamp
    // });
    
    // Using console.log to simulate success for now
    console.log(`[LiveBroadcast API] Broadcasted frame (${Math.round(payloadSize/1024)}KB) for ${slug}`);

    return NextResponse.json({ success: true, size: payloadSize });
  } catch (err: any) {
    console.error('[LiveBroadcast API] error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

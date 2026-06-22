/**
 * collective-intelligence.ts
 *
 * Agent Mode / Collective Intelligence for Synkk.
 *
 * When Synkk successfully extracts inventory from an unknown POS, it stores
 * the "extraction method" — which tier worked, which API endpoint was found,
 * what pagination style was used — back to the PharmastackX cloud.
 *
 * The next time ANY Synkk instance connects to a POS with the same URL pattern,
 * it fetches the known working method first and skips straight to it,
 * avoiding the costly tier-waterfall entirely.
 *
 * Read-only. No filesystem writes. No OS commands. No process spawning.
 */

import { getStore } from '../store/local';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExtractionMethod {
  /** URL pattern (origin + path prefix, e.g. https://api.smapp.ng/v1) */
  urlPattern: string;
  /** Which tier succeeded (2 = API hijack, 3 = network intercept, 4 = DOM, 5 = vision) */
  tier: number;
  /** Human-readable tier name */
  tierName: string;
  /** For Tier 2/3: the exact API endpoint URL that returned inventory */
  apiEndpoint?: string;
  /** Pagination style discovered */
  paginationStyle?: 'page' | 'offset' | 'cursor' | 'none';
  /** For Tier 2: query param names for page/limit */
  paginationParams?: { pageParam?: string; limitParam?: string; offsetParam?: string };
  /** Identified POS name if known */
  posName?: string;
  /** How many Synkk instances have confirmed this method works */
  confirmations: number;
  /** ISO timestamp of last successful use */
  lastSuccess: string;
}

export interface LookupResult {
  found: boolean;
  method?: ExtractionMethod;
  confirmations?: number;
}

const PSX_BASE = 'https://www.pharmastackx.com';
const TIER_NAMES: Record<number, string> = {
  1: 'Zero-Scrape',
  2: 'API Hijack',
  3: 'Network Intercept',
  4: 'DOM Semantic',
  5: 'Vision AI (Tier 4b)',
};

// ── URL Pattern Extraction ────────────────────────────────────────────────────

/**
 * Derives a stable "URL pattern" from a full URL so that different pharmacies
 * using the same POS software (e.g. Smapp) map to the same pattern even if
 * their specific subpaths differ.
 *
 * Strategy:
 *  1. Take the origin (scheme + host)
 *  2. Append the first two path segments (API version + resource prefix)
 *  3. Strip numeric IDs and UUIDs
 */
export function deriveUrlPattern(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const segments = u.pathname
      .split('/')
      .filter(Boolean)
      .slice(0, 2) // take at most 2 path levels
      .map(seg => seg.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':uuid'))
      .map(seg => seg.replace(/^\d+$/, ':id'));
    return `${u.origin}${segments.length ? '/' + segments.join('/') : ''}`;
  } catch {
    return rawUrl;
  }
}

// ── Lookup ────────────────────────────────────────────────────────────────────

/**
 * Query PSX for a known working extraction method for the given POS URL.
 * Returns null if nothing is found or the network call fails.
 *
 * This runs BEFORE the tier waterfall — if a method is found, sync.ts can
 * jump straight to the proven tier instead of starting from Tier 2.
 */
export async function lookupKnownMethod(posUrl: string): Promise<ExtractionMethod | null> {
  const pattern = deriveUrlPattern(posUrl);
  const storefrontData = getStore('storefront') as any;
  const slug = storefrontData?.slug || 'anonymous';

  try {
    const res = await fetch(
      `${PSX_BASE}/api/synkk-ai/collective-intelligence?pattern=${encodeURIComponent(pattern)}&slug=${encodeURIComponent(slug)}`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8000), // don't hang the sync startup
      }
    );

    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.found || !data.method) return null;

    return data.method as ExtractionMethod;
  } catch (err: any) {
    // Network failure is silently ignored — fall through to normal tier waterfall
    console.warn('[CI] lookupKnownMethod failed (will use normal tier waterfall):', err.message);
    return null;
  }
}

// ── Report ────────────────────────────────────────────────────────────────────

/**
 * After a successful sync, report the working extraction method back to PSX.
 * Other Synkk instances on the same POS will benefit from this immediately.
 *
 * Tier metadata is optional — we always report at minimum: url pattern + tier.
 */
export async function reportSuccessfulMethod(
  posUrl: string,
  tier: number,
  meta?: Partial<Pick<ExtractionMethod, 'apiEndpoint' | 'paginationStyle' | 'paginationParams' | 'posName'>>
): Promise<void> {
  const pattern = deriveUrlPattern(posUrl);
  const storefrontData = getStore('storefront') as any;
  const slug = storefrontData?.slug || 'anonymous';

  const payload: Omit<ExtractionMethod, 'confirmations' | 'lastSuccess'> = {
    urlPattern: pattern,
    tier,
    tierName: TIER_NAMES[tier] || `Tier ${tier}`,
    ...meta,
  };

  try {
    const res = await fetch(`${PSX_BASE}/api/synkk-ai/collective-intelligence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: payload, slug }),
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const data = await res.json();
      console.log(`[CI] Method reported. Total confirmations for this pattern: ${data.confirmations ?? 1}`);
    } else {
      console.warn('[CI] reportSuccessfulMethod: PSX returned', res.status);
    }
  } catch (err: any) {
    // Fire-and-forget — never block a successful sync for reporting failure
    console.warn('[CI] reportSuccessfulMethod failed silently:', err.message);
  }
}

// ── Fast-Path Jump ────────────────────────────────────────────────────────────

/**
 * Given a known method, returns the tier number to jump to and logs a banner.
 * sync.ts calls this to skip the tier waterfall when CI provides a known path.
 */
export function applyKnownMethod(
  method: ExtractionMethod,
  broadcast: (msg: string) => void
): { jumpToTier: number; apiEndpoint?: string; paginationStyle?: string; paginationParams?: any } {
  const plural = method.confirmations === 1 ? '1 other pharmacy' : `${method.confirmations} other pharmacies`;
  broadcast(
    `\n🤖 [COLLECTIVE INTELLIGENCE] Known working method found!\n` +
    `   POS Pattern : ${method.urlPattern}\n` +
    `   Method      : ${method.tierName}${method.apiEndpoint ? ` → ${method.apiEndpoint}` : ''}\n` +
    `   Confirmed by: ${plural}\n` +
    `   Jumping straight to Tier ${method.tier} — skipping waterfall.\n`
  );

  return {
    jumpToTier: method.tier,
    apiEndpoint: method.apiEndpoint,
    paginationStyle: method.paginationStyle,
    paginationParams: method.paginationParams,
  };
}

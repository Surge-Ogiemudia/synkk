// Session handling for the web terminal.
//
// The desktop app set an httpOnly `.psx.ng` cookie from the Electron main process
// (see Synkk/src/main/ipc.ts `set-session-cookie`) so every webview under *.psx.ng
// picked up the session automatically. In the browser we can't set httpOnly cookies
// from JS, so the real fix is for POST /api/auth/login to respond with
// `Set-Cookie: session_token=...; Domain=.psx.ng; Secure; HttpOnly; SameSite=Lax`
// directly — at that point this file's cookie handling becomes unnecessary (the
// browser does it for us on the fetch response) and `persistSession` only needs to
// store the non-sensitive profile fields below.
//
// Until that API change ships, we fall back to a non-httpOnly cookie set via
// document.cookie. This only works because the web terminal is deployed on a
// *.psx.ng subdomain (same-site as pos.psx.ng / emr.psx.ng / www.psx.ng).

const PROFILE_KEY = 'psx-profile';

export interface PsxProfile {
  slug: string;
  businessName: string;
  staffName: string;
  role?: string;
  phone?: string;
}

export interface AuthResult {
  ok: boolean;
  error?: string;
}

async function checkIdentifier(identifier: string): Promise<{ exists: boolean }> {
  const isEmail = identifier.includes('@');
  const res = await fetch('https://www.psx.ng/api/auth/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: isEmail ? identifier : undefined,
      phoneNumber: isEmail ? undefined : identifier,
    }),
  });
  return res.json();
}

async function login(identifier: string, password: string): Promise<AuthResult> {
  const isEmail = identifier.includes('@');
  try {
    const res = await fetch('https://www.psx.ng/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: isEmail ? identifier : undefined,
        phoneNumber: isEmail ? undefined : identifier,
        password,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.token) {
      return { ok: false, error: data.error || 'Login failed.' };
    }

    setSessionCookieFallback(data.token);
    persistProfile({
      slug: data.user.slug || '',
      businessName: data.user.businessName || 'My Pharmacy',
      staffName: data.user.name || data.user.email,
      role: data.user.role,
      phone: data.user.phoneNumber || '',
    });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: `Network error: ${err.message || 'please try again'}` };
  }
}

async function register(email: string, password: string, businessName: string, phoneNumber: string): Promise<AuthResult> {
  try {
    const res = await fetch('https://www.psx.ng/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        businessName,
        businessAddress: 'Not provided', // Required by backend
        phoneNumber,
        role: 'pharmacy',
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data.error || 'Registration failed.' };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: `Network error: ${err.message || 'please try again'}` };
  }
}

// Fallback only — see file header. Not httpOnly, so this is readable by any script
// on *.psx.ng. Drop this the moment /api/auth/login sets the cookie itself.
function setSessionCookieFallback(token: string) {
  const maxAgeSeconds = 60 * 60 * 24 * 7;
  // `secure` can only be set from an HTTPS page — omit it on plain-http local dev
  // (e.g. http://dev.psx.ng:5174) or the browser silently drops the whole cookie.
  const secure = location.protocol === 'https:' ? '; secure' : '';
  document.cookie = `session_token=${token}; domain=.psx.ng; path=/; max-age=${maxAgeSeconds}; samesite=lax${secure}`;
}

function persistProfile(profile: PsxProfile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

function getProfile(): PsxProfile | null {
  const raw = localStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function hasSession(): boolean {
  return getProfile() !== null;
}

function clearSession() {
  localStorage.removeItem(PROFILE_KEY);
  document.cookie = 'session_token=; domain=.psx.ng; path=/; max-age=0';
}

export const auth = {
  checkIdentifier,
  login,
  register,
  getProfile,
  hasSession,
  clearSession,
};

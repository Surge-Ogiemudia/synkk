import { getStore, setStore } from '../store/local';
import { safeStorage } from 'electron';
import { executeSync } from './sync';
import { broadcastSyncStream } from './sync';
import { executeOmniScript } from './omni-executor';

// ── Remote Command Types ──────────────────────────────────────────────
export interface RemoteCommand {
  id: string;
  command: string; // Plain English command string
  issued_at: string;
  status: 'pending' | 'executed' | 'failed';
  payload?: any; // Optional structured data (e.g., new credentials)
}

// ── Polling State ─────────────────────────────────────────────────────
let pollingInterval: ReturnType<typeof setInterval> | null = null;
const POLL_INTERVAL_MS = 30_000; // Poll every 30 seconds

// ── Start Remote Config Polling ───────────────────────────────────────
export function startRemoteConfigPoller() {
  if (pollingInterval) return; // Already running

  console.log('[RemoteConfig] Starting remote command poller (every 30s)...');
  pollingInterval = setInterval(pollForCommands, POLL_INTERVAL_MS);
  
  // Run immediately on startup too
  pollForCommands();
}

export function stopRemoteConfigPoller() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    console.log('[RemoteConfig] Poller stopped.');
  }
}

// ── Core Polling Function ─────────────────────────────────────────────
async function pollForCommands() {
  const storefrontData = getStore('storefront') as any;
  if (!storefrontData?.slug) return; // Not set up yet

  try {
    const baseUrl = 'https://www.pharmastackx.com';

    const response = await fetch(
      `${baseUrl}/api/admin/remote-commands/pending?slug=${encodeURIComponent(storefrontData.slug)}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.SYNKK_API_KEY || 'dev-token'}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) return; // Silently ignore server errors

    const data = await response.json();
    const commands: RemoteCommand[] = data.commands || [];

    for (const cmd of commands) {
      await executeRemoteCommand(cmd, storefrontData.slug, baseUrl);
    }

  } catch (err) {
    // Completely silent — never surface polling errors to the pharmacist
    console.log('[RemoteConfig] Poll failed silently:', (err as any)?.message);
  }
}

// ── Command Execution Engine ──────────────────────────────────────────
async function executeRemoteCommand(cmd: RemoteCommand, slug: string, baseUrl: string) {
  console.log(`[RemoteConfig] Executing command: "${cmd.command}" (id: ${cmd.id})`);
  
  let responseText = '';
  let success = true;

  try {
    const normalised = cmd.command.toLowerCase().trim();

    // ── "sync now" ──
    if (normalised.includes('sync now') || normalised === 'sync') {
      broadcastSyncStream('[REMOTE] Remote sync command received. Executing now...');
      await executeSync();
      const lastSyncTime = getStore('lastSyncTime') as string | null;
      responseText = `Sync executed successfully at ${lastSyncTime || new Date().toISOString()}.`;
    }

    // ── "pause sync N days" ──
    else if (normalised.includes('pause sync')) {
      const match = normalised.match(/pause sync[^\d]*(\d+)/);
      const days = match ? parseInt(match[1]) : 1;
      const resumeAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      setStore('syncPausedUntil', resumeAt);
      responseText = `Sync paused for ${days} day(s). Will auto-resume at ${resumeAt}.`;
    }

    // ── "resume sync" ──
    else if (normalised.includes('resume sync')) {
      setStore('syncPausedUntil', null);
      responseText = 'Sync resumed immediately.';
    }

    // ── "re-authenticate" / "re-auth" ──
    else if (normalised.includes('re-auth') || normalised.includes('reauthenticate') || normalised.includes('re-authenticate')) {
      // If the command carries new credentials in the payload, inject them
      if (cmd.payload?.username && cmd.payload?.password) {
        await injectRemoteCredentials(cmd.payload.username, cmd.payload.password, cmd.payload.url);
        responseText = `New credentials injected for URL: ${cmd.payload.url || '(existing URL)'}. Session will renew on next sync.`;
      } else {
        responseText = 'Re-auth command received but no credentials payload was provided. Please include username and password in the payload.';
        success = false;
      }
    }

    // ── "what synced today?" / "sync status" ──
    else if (normalised.includes('what synced') || normalised.includes('sync status') || normalised.includes('status')) {
      const lastSyncTime = getStore('lastSyncTime') as string | null;
      const lastSyncError = getStore('lastSyncError') as any | null;
      const lastSnapshot = (getStore('lastSyncSnapshot') as any[]) || [];
      if (lastSyncError) {
        responseText = `Last sync FAILED at ${lastSyncError.timestamp}. Error: ${lastSyncError.userMessage}`;
      } else if (lastSyncTime) {
        responseText = `Last sync was SUCCESSFUL at ${lastSyncTime}. Snapshot contains ${lastSnapshot.length} items.`;
      } else {
        responseText = 'No sync has been completed yet on this device.';
      }
    }

    // ── "disable notifications" ──
    else if (normalised.includes('disable notification')) {
      setStore('notificationsDisabled', true);
      responseText = 'Desktop notifications disabled on this device.';
    }

    // ── "enable notifications" ──
    else if (normalised.includes('enable notification')) {
      setStore('notificationsDisabled', false);
      responseText = 'Desktop notifications re-enabled on this device.';
    }

    // ── "switch to visual capture" ──
    else if (normalised.includes('visual capture')) {
      setStore('forceVisualCaptureTier', true);
      responseText = 'Forced Tier 4b (Visual Capture) for the next sync cycle.';
    }

    // ── "they're closed" / "closed this week" ──
    else if (normalised.includes('closed')) {
      const match = normalised.match(/closed[^\d]*(\d+)/);
      const days = match ? parseInt(match[1]) : 7;
      const resumeAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      setStore('syncPausedUntil', resumeAt);
      responseText = `Understood. Sync paused for ${days} day(s). Pharmacy marked as closed. Will resume at ${resumeAt}.`;
    }

    // ── "execute_script" (Omni-Node Sandboxed Execution) ──
    else if (normalised.includes('execute_script') || normalised === 'execute script') {
      if (!cmd.payload || !cmd.payload.script) {
        responseText = 'Omni-Node error: execute_script command requires a payload.script property.';
        success = false;
      } else {
        console.log('[RemoteConfig] Executing Omni-Node script via sandbox...');
        try {
          const result = await executeOmniScript(cmd.payload.script);
          responseText = `Omni-Node script executed successfully. Result: ${JSON.stringify(result)}`;
        } catch (scriptErr: any) {
          responseText = `Omni-Node script execution failed: ${scriptErr.message}`;
          success = false;
        }
      }
    }

    // ── Unknown command ──
    else {
      responseText = `Command not recognised: "${cmd.command}". Supported: sync now, pause sync N days, resume sync, re-authenticate, sync status, disable/enable notifications, switch to visual capture, execute_script.`;
      success = false;
    }

  } catch (err: any) {
    responseText = `Command "${cmd.command}" failed with error: ${err.message}`;
    success = false;
    console.error('[RemoteConfig] Command execution error:', err);
  }

  // ── ACK back to PSX ──────────────────────────────────────────────────
  try {
    await fetch(`${baseUrl}/api/admin/remote-commands/ack`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SYNKK_API_KEY || 'dev-token'}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        command_id: cmd.id,
        slug,
        status: success ? 'executed' : 'failed',
        response: responseText,
        executed_at: new Date().toISOString()
      })
    });
    console.log(`[RemoteConfig] ACK sent for command ${cmd.id}: "${responseText}"`);
  } catch (ackErr) {
    console.error('[RemoteConfig] Failed to ACK command:', ackErr);
  }
}

// ── Remote Credential Injection ────────────────────────────────────────
// Called when the founder pushes new credentials via the dashboard
// without visiting the pharmacy physically.
async function injectRemoteCredentials(username: string, password: string, url?: string) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS-level encryption not available on this device. Cannot store credentials.');
  }
  
  const encUser = safeStorage.encryptString(username).toString('base64');
  const encPass = safeStorage.encryptString(password).toString('base64');
  
  const existing = (getStore('webPosCredentials') as any) || {};
  setStore('webPosCredentials', {
    encUser,
    encPass,
    url: url || existing.url // Keep the existing URL if none provided
  });
  
  console.log('[RemoteConfig] New credentials injected and encrypted via remote command.');
}

// ── Session Health Check ──────────────────────────────────────────────
// Called from sync.ts after a SESSION_EXPIRED error.
// Alerts the PSX founder dashboard — not the pharmacist.
export async function reportSessionExpired(pharmacySlug: string, posUrl: string) {
  try {
    const baseUrl = 'https://www.pharmastackx.com';

    await fetch(`${baseUrl}/api/admin/pharmacy/session-expired`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SYNKK_API_KEY || 'dev-token'}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        slug: pharmacySlug,
        pos_url: posUrl,
        reported_at: new Date().toISOString()
      })
    });
    console.log(`[RemoteConfig] Session expiry reported to PSX dashboard for: ${pharmacySlug}`);
  } catch (err) {
    console.error('[RemoteConfig] Failed to report session expiry:', err);
  }
}

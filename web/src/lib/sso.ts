type SsoService = 'pos' | 'emr';
type ProgressCallback = (service: SsoService, status: 'connecting' | 'success' | 'failed') => void;

interface SsoState {
  iframe: HTMLIFrameElement | null;
  ready: boolean;
  done: boolean;
}

const SSO_URLS: Record<SsoService, string> = {
  pos: 'https://pos.psx.ng/sso',
  emr: 'https://emr.psx.ng/sso',
};

const SSO_TIMEOUT_MS = 8000;

export async function bridgeLogin(
  token: string,
  servicesToConnect: SsoService[],
  onProgress: ProgressCallback
): Promise<void> {
  return executeBridge('sso-login', token, servicesToConnect, onProgress);
}

export async function bridgeLogout(
  servicesToConnect: SsoService[],
  onProgress: ProgressCallback
): Promise<void> {
  return executeBridge('sso-logout', null, servicesToConnect, onProgress);
}

async function executeBridge(
  action: 'sso-login' | 'sso-logout',
  token: string | null,
  servicesToConnect: SsoService[],
  onProgress: ProgressCallback
): Promise<void> {
  if (servicesToConnect.length === 0) return Promise.resolve();

  return new Promise((resolve) => {
    const state: Record<SsoService, SsoState> = {} as any;
    
    // Initialize state
    for (const service of servicesToConnect) {
      state[service] = { iframe: null, ready: false, done: false };
      onProgress(service, 'connecting');
    }

    let timeoutId: any;

    const cleanup = () => {
      clearTimeout(timeoutId);
      window.removeEventListener('message', handleMessage);
      for (const service of servicesToConnect) {
        const iframe = state[service].iframe;
        if (iframe && iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }
    };

    const checkComplete = () => {
      if (servicesToConnect.every((s) => state[s].done)) {
        cleanup();
        resolve();
      }
    };

    const handleMessage = (event: MessageEvent) => {
      // Validate origin
      if (event.origin !== 'https://pos.psx.ng' && event.origin !== 'https://emr.psx.ng' && event.origin !== 'http://localhost:3000' && event.origin !== 'http://localhost:3001') {
        return;
      }

      const { type, service, success } = event.data || {};
      
      if (!service || !servicesToConnect.includes(service as SsoService)) return;

      if (type === 'sso-ready') {
        state[service as SsoService].ready = true;
        // Send the action command
        state[service as SsoService].iframe?.contentWindow?.postMessage(
          { type: action, token },
          '*' // Send to any origin (the iframe URL is already controlled above)
        );
      } else if (type === 'sso-result') {
        state[service as SsoService].done = true;
        onProgress(service as SsoService, success ? 'success' : 'failed');
        checkComplete();
      }
    };

    window.addEventListener('message', handleMessage);

    // Create iframes
    for (const service of servicesToConnect) {
      const iframe = document.createElement('iframe');
      iframe.src = SSO_URLS[service];
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
      state[service].iframe = iframe;
    }

    // Set timeout to fail any pending services
    timeoutId = setTimeout(() => {
      for (const service of servicesToConnect) {
        if (!state[service].done) {
          state[service].done = true;
          onProgress(service, 'failed');
        }
      }
      checkComplete();
    }, SSO_TIMEOUT_MS);
  });
}

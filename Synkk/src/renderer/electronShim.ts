// Provides window.require('electron') → { ipcRenderer, shell } on top of the
// preload bridge (src/main/preload.ts), so screens written for nodeIntegration
// keep working with contextIsolation on and Node off. Must be imported before
// anything that calls window.require.

type Listener = (event: unknown, ...args: unknown[]) => void;

interface SynkkBridge {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  send(channel: string, ...args: unknown[]): void;
  subscribe(channel: string, callback: (...args: unknown[]) => void): number;
  unsubscribe(id: number): void;
  unsubscribeAll(channel: string): void;
  openExternal(url: string): Promise<void>;
}

const w = window as unknown as { synkkBridge?: SynkkBridge; require?: (name: string) => unknown };
const bridge = w.synkkBridge;

if (bridge && typeof w.require !== 'function') {
  // channel -> listener -> subscription ids (a listener may be added more than once)
  const registry = new Map<string, Map<Listener, number[]>>();

  const track = (channel: string, listener: Listener, id: number) => {
    if (!registry.has(channel)) registry.set(channel, new Map());
    const byListener = registry.get(channel)!;
    byListener.set(listener, [...(byListener.get(listener) || []), id]);
  };

  const ipcRenderer = {
    invoke: (channel: string, ...args: unknown[]) => bridge.invoke(channel, ...args),
    send: (channel: string, ...args: unknown[]) => bridge.send(channel, ...args),

    on(channel: string, listener: Listener) {
      const id = bridge.subscribe(channel, (...args) => listener({}, ...args));
      track(channel, listener, id);
      return ipcRenderer;
    },

    once(channel: string, listener: Listener) {
      let id = 0;
      id = bridge.subscribe(channel, (...args) => {
        bridge.unsubscribe(id);
        listener({}, ...args);
      });
      return ipcRenderer;
    },

    removeListener(channel: string, listener: Listener) {
      const ids = registry.get(channel)?.get(listener);
      const id = ids?.pop();
      if (id !== undefined) bridge.unsubscribe(id);
      if (ids && ids.length === 0) registry.get(channel)!.delete(listener);
      return ipcRenderer;
    },

    removeAllListeners(channel: string) {
      bridge.unsubscribeAll(channel);
      registry.delete(channel);
      return ipcRenderer;
    },
  };

  const shell = {
    openExternal: (url: string) => bridge.openExternal(url),
  };

  w.require = (name: string) => {
    if (name === 'electron') return { ipcRenderer, shell };
    throw new Error(`Module "${name}" is not available in the app window`);
  };
}

export {};

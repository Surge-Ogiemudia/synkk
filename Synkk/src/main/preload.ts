import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

// The app's windows run with contextIsolation and without Node. This bridge is
// the only access the screens have to the main process: IPC messaging and
// opening external links. src/renderer/electronShim.ts adapts it to the
// window.require('electron') API the screens use.

type Subscription = { channel: string; handler: (event: IpcRendererEvent, ...args: unknown[]) => void };

const subscriptions = new Map<number, Subscription>();
let nextId = 0;

contextBridge.exposeInMainWorld('synkkBridge', {
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),

  send: (channel: string, ...args: unknown[]) => ipcRenderer.send(channel, ...args),

  /** Listens on a channel; returns an id for unsubscribe(). */
  subscribe: (channel: string, callback: (...args: unknown[]) => void): number => {
    const id = ++nextId;
    const handler = (_event: IpcRendererEvent, ...args: unknown[]) => callback(...args);
    subscriptions.set(id, { channel, handler });
    ipcRenderer.on(channel, handler);
    return id;
  },

  unsubscribe: (id: number) => {
    const sub = subscriptions.get(id);
    if (!sub) return;
    ipcRenderer.removeListener(sub.channel, sub.handler);
    subscriptions.delete(id);
  },

  unsubscribeAll: (channel: string) => {
    for (const [id, sub] of subscriptions) {
      if (sub.channel === channel) {
        ipcRenderer.removeListener(channel, sub.handler);
        subscriptions.delete(id);
      }
    }
  },

  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
});

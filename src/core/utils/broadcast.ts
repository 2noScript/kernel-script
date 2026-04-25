import { hasActiveUI } from './port-tracker';

export type SetupOptions = {
  debug?: boolean;
  storageKey?: string;
};

export const broadcast = (message: any) => {
  if (!hasActiveUI()) {
    return;
  }
  chrome.runtime.sendMessage(message).catch(() => {
    // Ignore errors when no UI is open
  });
};

export const createBroadcast = () => broadcast;

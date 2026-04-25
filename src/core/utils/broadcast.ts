import { hasActivePort } from './port-tracker';

export type SetupOptions = {
  debug?: boolean;
  storageKey?: string;
};

export const broadcast = (message: any) => {
  if (!hasActivePort()) {
    return;
  }
  chrome.runtime.sendMessage(message).catch(() => {
    // Ignore errors when no UI is open
  });
};

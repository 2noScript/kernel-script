export type SetupOptions = {
  debug?: boolean;
  storageKey?: string;
};

const broadcast = (message: any) => {
  chrome.runtime.sendMessage(message).catch(() => {
    // Ignore errors when no UI (Popup/Sidepanel) is open
  });
};

export const createBroadcast = () => broadcast;

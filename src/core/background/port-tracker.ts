const activeUIPorts = new Set<chrome.runtime.Port>();

export const addActivePort = (port: chrome.runtime.Port) => {
  if (activeUIPorts.has(port)) return;

  const cleanup = () => {
    activeUIPorts.delete(port);
  };
  port.onDisconnect.addListener(cleanup);
  activeUIPorts.add(port);
};

export const removeActivePort = (port: chrome.runtime.Port) => {
  port.onDisconnect.removeListener(() => activeUIPorts.delete(port));
  activeUIPorts.delete(port);
};

export const hasActiveUI = () => activeUIPorts.size > 0;

export const getActiveUICount = () => activeUIPorts.size;

export const onUIPortConnect = (callback: (port: chrome.runtime.Port) => void) => {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'ui-port') {
      addActivePort(port);
      callback(port);
    }
  });
};

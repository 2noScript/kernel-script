const activeUIPorts = new Set<chrome.runtime.Port>();

export const addPort = (port: chrome.runtime.Port) => {
  if (activeUIPorts.has(port)) return;

  const cleanup = () => {
    activeUIPorts.delete(port);
  };
  port.onDisconnect.addListener(cleanup);
  activeUIPorts.add(port);
};

export const removePort = (port: chrome.runtime.Port) => {
  port.onDisconnect.removeListener(() => activeUIPorts.delete(port));
  activeUIPorts.delete(port);
};

export const hasActivePort = () => activeUIPorts.size > 0;

export const getActiveUICount = () => activeUIPorts.size;

export const onPortConnect = (callback: (port: chrome.runtime.Port) => void) => {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'ui-port') {
      addPort(port);
      callback(port);
    }
  });
};

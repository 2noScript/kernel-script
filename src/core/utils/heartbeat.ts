const handleHeartbeat = (count: number) => {
  if (typeof chrome === 'undefined' || !chrome.alarms) return;

  if (count > 0) {
    chrome.alarms.create('heartbeat', { periodInMinutes: 0.5 });
  } else {
    chrome.alarms.clear('heartbeat');
  }
};

export const createHeartbeatHandler = () => handleHeartbeat;

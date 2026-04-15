const handleHeartbeat = (count: number) => {
  if (count > 0) {
    chrome.alarms.create('heartbeat', { periodInMinutes: 0.5 });
  } else {
    chrome.alarms.clear('heartbeat');
  }
};

export const createHeartbeatHandler = () => handleHeartbeat;

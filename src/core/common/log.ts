let debug = false;

export const enableDebug = () => {
  debug = true;
};

export const debugLog = (...args: unknown[]) => {
  if (debug) console.log(...args);
};

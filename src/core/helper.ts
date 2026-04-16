export const sleep = (ms: number, signal?: AbortSignal): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new Error("CANCELLED"));
    }

    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", abortHandler);
      resolve();
    }, ms);

    const abortHandler = () => {
      clearTimeout(timeout);
      reject(new Error("CANCELLED"));
    };

    signal?.addEventListener("abort", abortHandler, { once: true });
  });
};
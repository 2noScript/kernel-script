export const sleep = (seconds: number, signal?: AbortSignal): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new Error("CANCELLED"));
    }

    const timeout = setTimeout(resolve, seconds);

    signal?.addEventListener("abort", () => {
      clearTimeout(timeout);
      reject(new Error("CANCELLED"));
    }, { once: true });
  });
};
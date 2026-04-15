export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    signal.throwIfAborted();
  }

  await new Promise((resolve, reject) => {
    const abortHandler = () => {
      reject(new DOMException('Sleep aborted', 'AbortError'));
    };

    if (signal) {
      signal.addEventListener('abort', abortHandler, { once: true });
    }

    const timeoutId = setTimeout(() => {
      if (signal) {
        signal.removeEventListener('abort', abortHandler);
      }
      resolve(undefined);
    }, ms);

    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timeoutId);
          reject(new DOMException('Sleep aborted', 'AbortError'));
        },
        { once: true }
      );
    }
  });
}

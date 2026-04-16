/**
 * Constructs a fully qualified extension URL with dynamic query parameters and hash routing.
 * * @param page - The target HTML file (e.g., 'index.html', 'popup.html'). Defaults to 'index.html'.
 * @param route - An optional hash-based route (e.g., 'tiktok', 'settings').
 * @param params - An object containing key-value pairs to be converted into URL query strings.
 * @returns A complete extension URL string generated via chrome.runtime.getURL.
 */
export function buildPageUrl(
  route: string = "",
  params: Record<string, string | number | boolean | undefined> = {}
): string {
 
  const  page: string = "index.html"
  const urlParams = new URLSearchParams();

  // Iterates through the params object and appends valid values to the query string
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      urlParams.append(key, String(value));
    }
  });

  const queryString = urlParams.toString();
  const hashPart = route ? `#${route}` : "";
  const queryPart = queryString ? `?${queryString}` : "";

  return chrome.runtime.getURL(`${page}${queryPart}${hashPart}`);
}
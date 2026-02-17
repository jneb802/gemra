/**
 * Format token counts for display
 * @param tokens - Number of tokens to format
 * @returns Formatted string (e.g., "50.0K" or "999")
 */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`
  }
  return tokens.toString()
}

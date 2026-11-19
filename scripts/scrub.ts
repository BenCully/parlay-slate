/** Strip an Odds API key from an error before it is printed. */
export function scrubError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  return message.replace(/apiKey=[^&\s]+/gi, 'apiKey=***');
}

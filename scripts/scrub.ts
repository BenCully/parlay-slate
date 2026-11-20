/** Names whose values must not appear in a printed error or a saved board note. */
const SECRET_VARS = ['TYPESAFE_API_KEY', 'AUTOJEV_API_KEY', 'AUTOJEV_URL', 'ODDS_API_KEY'] as const;

/** Replace keys, a bearer token, and a tailnet address before the text is printed or saved. */
export function scrubText(text: string) {
  let next = text.replace(/apiKey=[^&\s]+/gi, 'apiKey=***');
  for (const name of SECRET_VARS) {
    const value = process.env[name];
    if (!value || value.length < 8) continue;
    next = next.split(value).join(name);
  }
  return next.replace(/Bearer \S+/g, 'Bearer ***');
}

/** Strip secrets from an error before it is printed. */
export function scrubError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  return scrubText(message);
}

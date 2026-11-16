// Eastern slate windows. A sport picks the scoreboard and how far past the last kickoff to look.

export type OddsWindow = { from: string; to: string; label: string };

export function oddsStamp(iso: string) {
  return new Date(iso).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function addDays(day: string, days: number) {
  const [year, month, date] = day.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, date + days));
  return next.toISOString().slice(0, 10);
}

/** America/New_York calendar day for a timestamp, as YYYY-MM-DD. */
export function easternDay(when: Date | string | number = new Date()) {
  const date = when instanceof Date ? when : new Date(when);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

export function todayEastern() {
  return easternDay();
}

function startOfEasternDay(day: string) {
  const utcMidnight = Date.parse(`${day}T00:00:00Z`);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const wallTime = (ms: number) => {
    const parts = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
    return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  };
  let guess = utcMidnight;
  for (let i = 0; i < 3; i++) guess -= wallTime(guess) - utcMidnight;
  return new Date(guess);
}

/** One or more America/New_York calendar days, starting at day. */
export function easternRange(day: string, days = 1) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Date must be YYYY-MM-DD.');
  const from = startOfEasternDay(day);
  const to = startOfEasternDay(addDays(day, days));
  return { from: oddsStamp(from.toISOString()), to: oddsStamp(to.toISOString()) };
}

/** Games still on the scoreboard, from one hour before the first to six hours after the last. A board with nothing ahead uses one Eastern day. */
export async function upcomingWindow(url: string, label: string, day: string | undefined, failure: (status: number) => string): Promise<OddsWindow> {
  if (day) {
    const range = easternRange(day);
    return { ...range, label: `${label} ${day} (Eastern)` };
  }
  const { stamps } = await scoreboardEvents(url, failure);
  const upcoming = stamps.filter((stamp) => stamp > Date.now() - 60 * 60 * 1000);
  if (!upcoming.length) {
    const range = easternRange(todayEastern());
    return { ...range, label };
  }
  return {
    from: oddsStamp(new Date(Math.min(...upcoming) - 60 * 60 * 1000).toISOString()),
    to: oddsStamp(new Date(Math.max(...upcoming) + 6 * 60 * 60 * 1000).toISOString()),
    label,
  };
}

export async function scoreboardEvents(url: string, failure: (status: number) => string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(failure(res.status));
  const board = await res.json() as { events?: { date?: string }[]; week?: { number?: number } };
  const stamps = (board.events ?? []).map((event) => Date.parse(event.date ?? '')).filter(Number.isFinite);
  return { board, stamps };
}

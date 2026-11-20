// Lists Eastern days that have saved odds. Does not call the network.
// A day saved by a different source than the active one prints ODDS_SOURCE= on the replay command.
// run: npm run odds
import { listSavedOdds, oddsReplayCommand, oddsSourceLabel } from '../odds/cache.js';

const days = await listSavedOdds();
if (!days.length) {
  console.log('No saved odds. npm start stores responses in odds-cache/.');
  process.exit(0);
}

for (const day of days) {
  const label = day.source === 'the-odds-api' ? '' : oddsSourceLabel(day.source);
  console.log(label ? `${day.day}  ${label}` : day.day);
  for (const slate of day.slates) {
    const games = `${slate.games} game${slate.games === 1 ? '' : 's'}`;
    const window = slate.from && slate.to ? `  ${slate.from} to ${slate.to}` : '';
    console.log(`  ${slate.sport}  ${games}${window}`);
  }
  if (day.props) console.log(`  props  ${day.props} event file${day.props === 1 ? '' : 's'}`);
  console.log(`  ${oddsReplayCommand(day.day, day.source, 'jev')}`);
  console.log(`  ${oddsReplayCommand(day.day, day.source, 'tail-jev')}`);
}

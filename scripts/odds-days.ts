// Lists Eastern days that have saved odds. Does not call the network.
// A FanDuel day prints ODDS_SOURCE=fanduel on the replay command.
// run: npm run odds
import { listSavedOdds } from '../odds/cache.js';

const days = await listSavedOdds();
if (!days.length) {
  console.log('No saved odds. npm start stores responses in odds-cache/.');
  process.exit(0);
}

for (const day of days) {
  const fanduel = day.source === 'fanduel';
  console.log(fanduel ? `${day.day}  FanDuel` : day.day);
  for (const slate of day.slates) {
    const games = `${slate.games} game${slate.games === 1 ? '' : 's'}`;
    const window = slate.from && slate.to ? `  ${slate.from} to ${slate.to}` : '';
    console.log(`  ${slate.sport}  ${games}${window}`);
  }
  if (day.props) console.log(`  props  ${day.props} event file${day.props === 1 ? '' : 's'}`);
  const source = fanduel ? 'ODDS_SOURCE=fanduel ' : '';
  console.log(`  ${source}npm start -- odds=${day.day} model=jev`);
  console.log(`  ${source}npm start -- odds=${day.day} model=tail-jev`);
}

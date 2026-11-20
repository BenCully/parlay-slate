import { scrubError } from '../../scripts/scrub.js';
import { applyPrefill, formFromSettings, loadContext, persistsForm, settingsFromForm, settleForm } from './commands.js';
import { createUi, type UiState } from './options.js';
import { showOptions } from './session.js';
import { loadTuiSettings, saveTuiSettings } from './settings.js';
import { playSplash } from './splash.js';
import { todayEastern } from '../../slate/window.js';

async function perform(state: UiState): Promise<{ ok: boolean; interrupt: boolean; message: string }> {
  try {
    if (state.action === 'start' || state.action === 'replay') {
      const { runSlate } = await import('../../scripts/parlays.js');
      const result = await runSlate({
        model: state.model,
        fresh: state.action === 'start' && state.fresh,
        source: state.oddsSource,
        ...(state.action === 'replay' ? { odds: state.oddsDay } : state.dateMode === 'day' ? { day: state.day } : {}),
      });
      if (result.close === 'interrupt') return { ok: false, interrupt: true, message: '' };
      if (!result.built) return { ok: false, interrupt: false, message: result.message };
      return { ok: true, interrupt: false, message: 'Saved the slate.' };
    }
    if (state.action === 'view-last' || state.action === 'view-snapshot') {
      const { viewSavedSlate } = await import('../../scripts/view.js');
      const close = await viewSavedSlate(state.action === 'view-last' ? undefined : state.snapshot);
      if (close === 'interrupt') return { ok: false, interrupt: true, message: '' };
      return { ok: true, interrupt: false, message: '' };
    }
    if (state.action === 'compare') {
      const { compareSnapshots } = await import('../../scripts/compare.js');
      const close = await compareSnapshots(state.compareDay);
      if (close === 'interrupt') return { ok: false, interrupt: true, message: '' };
      return { ok: true, interrupt: false, message: '' };
    }
    return { ok: false, interrupt: false, message: '' };
  } catch (error) {
    return { ok: false, interrupt: false, message: scrubError(error, 'That action failed.') };
  }
}

export async function launchTui(input: { splash: boolean; prefill: string[] }) {
  if (input.splash) await playSplash();
  const loaded = await loadTuiSettings();
  const ctx = await loadContext();
  let form = settleForm(formFromSettings(loaded.settings, ctx.today || todayEastern()), ctx);
  let message = loaded.warning ?? '';
  if (input.prefill.length) {
    const prefill = applyPrefill(form, input.prefill);
    if (prefill.error) message = prefill.error;
    else form = settleForm(prefill.form, ctx);
  }
  let state = createUi(form, message);
  for (;;) {
    const latest = await loadContext();
    const outcome = await showOptions(state, latest);
    if (outcome.effect === 'quit') return;
    if (outcome.effect === 'interrupt') process.exit(130);
    const result = await perform(outcome.state);
    process.exitCode = undefined;
    if (result.interrupt) process.exit(130);
    state = { ...outcome.state, message: result.message, picker: false, confirm: false, list: false, scroll: 0 };
    if (result.ok && persistsForm(state)) await saveTuiSettings(settingsFromForm(state));
  }
}

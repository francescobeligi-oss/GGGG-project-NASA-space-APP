/**
 * Lunar Site Scout: receives anonymous usage events and optional feedback, and writes them to this Google Sheet.
 * Setup (once): in the Sheet, Extensions > Apps Script, paste this file, Save, then
 * Deploy > New deployment > type "Web app" > Execute as: Me > Who has access: Anyone > Deploy.
 * Copy the web app URL (ends with /exec) into web/config.js (STATS_URL).
 * Keep the Sheet itself private (Share > Restricted): the data must not be public.
 */
function doPost(e) {
  var d = {};
  try { d = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return ContentService.createTextOutput('bad json'); }
  var feedback = d.kind === 'feedback';
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var name = feedback ? 'feedback' : 'events';
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) sh.appendRow(feedback ? ['time (UTC)', 'visit', 'mission', 'what they need', 'email (only with consent)', 'consent'] : ['time (UTC)', 'visit', 'event', 'role', 'mission', 'details']);
  // short text only, and never a formula: a value starting with = + - @ is stored as plain text
  var clip = function (v) { var s = String(v === undefined || v === null ? '' : v).slice(0, 2000); return /^[=+\-@]/.test(s) ? "'" + s : s; };
  if (feedback) sh.appendRow([new Date(), clip(d.visit), clip(d.mission), clip(d.message), d.consent ? clip(d.email) : '', d.consent ? 'yes' : 'no']);
  else sh.appendRow([new Date(), clip(d.visit), clip(d.event), clip(d.role), clip(d.mission), clip(JSON.stringify(d.details || {}))]);
  return ContentService.createTextOutput('ok');
}

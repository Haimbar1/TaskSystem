// Inside Monday everyone shares one login (server/src/embed.js), so each person picks "who am I"
// once on their device. api.js sends it with every request (X-Acting-User) for the action log
// (server/src/services/auditLog.js), and a new task's creator defaults to it.
const KEY = 'tasks.embedCreatorId';

export function getActingUserId() {
  try {
    return localStorage.getItem(KEY) || '';
  } catch {
    return '';
  }
}

export function setActingUserId(id) {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable (e.g. blocked in the iframe) — they'll just pick again next time.
  }
  window.dispatchEvent(new Event('acting-user-changed'));
}

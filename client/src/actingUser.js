import { useEffect, useState } from 'react';

// Inside Monday everyone shares one login (server/src/embed.js), so each person says "who am I"
// on their device. api.js sends it with every request (X-Acting-User) for the action log
// (server/src/services/auditLog.js), and a new task's creator defaults to it.
//
// It's asked only when it's needed — the first change made on this device (ensureActingUser,
// components/ActingUserPrompt.jsx) — and then remembered, so nobody is asked again: in the
// browser's storage, and in a year-long cookie on the server (PUT /api/auth/acting-user), for an
// iframe whose storage is blocked or cleared. /api/auth/me hands the remembered one back.
const KEY = 'tasks.embedCreatorId';
const API_URL = import.meta.env.VITE_API_URL || '';

let embedMode = false;
let current = '';
try {
  current = localStorage.getItem(KEY) || '';
} catch {
  // Storage unavailable (e.g. blocked in the iframe) — the server's cookie remembers instead.
}

export function getActingUserId() {
  return current;
}

// Called once the login is known (App.jsx): only the shared Monday login asks "who am I".
export function initActingUser(user) {
  embedMode = Boolean(user?.is_embed);
  if (embedMode && !current && user.acting_user_id) setActingUserId(user.acting_user_id, { remember: false });
}

export const needsActingUser = () => embedMode && !current;

export function setActingUserId(id, { remember = true } = {}) {
  current = id || '';
  try {
    if (current) localStorage.setItem(KEY, current);
    else localStorage.removeItem(KEY);
  } catch {}
  if (remember && embedMode) {
    fetch(`${API_URL}/api/auth/acting-user`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: current }),
    }).catch(() => {});
  }
  window.dispatchEvent(new Event('acting-user-changed'));
}

// Resolves once "who am I" is known — right away if it already is; otherwise asks (the
// ActingUserPrompt window) and waits. Rejects if they close it without picking.
let waiting = null;
export function ensureActingUser() {
  if (!needsActingUser()) return Promise.resolve(current);
  if (!waiting) {
    waiting = new Promise((resolve, reject) => {
      const done = (e) => {
        window.removeEventListener('acting-user-answered', done);
        waiting = null;
        if (e.detail?.id) resolve(e.detail.id);
        else reject(new Error('יש לבחור "מי את/ה?" כדי שיהיה ידוע מי ביצע את הפעולה'));
      };
      window.addEventListener('acting-user-answered', done);
      window.dispatchEvent(new Event('acting-user-needed'));
    });
  }
  return waiting;
}

// The current "who am I", kept up to date.
export function useActingUserId() {
  const [id, setId] = useState(current);
  useEffect(() => {
    const sync = () => setId(current);
    window.addEventListener('acting-user-changed', sync);
    return () => window.removeEventListener('acting-user-changed', sync);
  }, []);
  return id;
}

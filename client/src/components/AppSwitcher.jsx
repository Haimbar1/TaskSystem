import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const ICONS = { CRM: '📇', WHATSAPP: '💬', TASKS: '✅', BOTAPP: '🤖' };

export default function AppSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const [modules, setModules] = useState(null);
  const [launchingKey, setLaunchingKey] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isOpen || modules !== null) return;
    api
      .getSwitcherModules()
      .then((res) => setModules(res.modules))
      .catch(() => setModules([]));
  }, [isOpen, modules]);

  useEffect(() => {
    if (!isOpen) return;
    const onClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [isOpen]);

  async function handleLaunch(moduleKey) {
    setLaunchingKey(moduleKey);
    // Open the tab synchronously in direct response to the click (opening it after the
    // await gets popup-blocked). No 'noreferrer' flag: it makes window.open return null.
    const newTab = window.open('', '_blank');
    if (newTab) newTab.opener = null;
    try {
      const { redirectUrl } = await api.getSwitcherToken(moduleKey);
      if (newTab) newTab.location.href = redirectUrl;
      else window.location.href = redirectUrl;
      setIsOpen(false);
    } catch {
      newTab?.close();
    } finally {
      setLaunchingKey(null);
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        title="מעבר בין מערכות"
        className="p-2 rounded-lg text-teal-50 hover:bg-white/10 transition-colors"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
          {[4, 12, 20].flatMap((y) =>
            [4, 12, 20].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2" />)
          )}
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white text-gray-800 rounded-xl shadow-lg border border-gray-200 p-3 z-40">
          {modules === null ? (
            <p className="text-xs text-gray-400 text-center py-4">טוען...</p>
          ) : modules.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">אין מערכות נוספות זמינות</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {modules.map((m) => (
                <button
                  key={m.key}
                  onClick={() => handleLaunch(m.key)}
                  disabled={launchingKey === m.key}
                  title={m.name}
                  className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  <span className="text-2xl">{ICONS[m.key.toUpperCase()] || m.icon || '🔗'}</span>
                  <span className="text-[10px] text-gray-600 truncate w-full text-center">{m.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

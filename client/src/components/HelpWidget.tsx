import React, { useCallback, useEffect, useRef, useState } from 'react';

// "העוזר" — the SmartEsek help assistant, the same in every system (WhastAppSystem, TaskSystem,
// BotApp, the portal; the CRM has its own copy with the screenshot-library editor). A floating "?"
// opens a chat that explains how to use the systems; the answer streams in, may show screenshots,
// and may offer "👆 הראה לי על המסך", which dims the page around the real button to click (found by
// its text, step after step). The brain is the CRM's /api/help (server/helpBot.ts there): each
// system's server forwards apiBase/ask, /suggestions and /images/:id to it with a signed
// x-insights-token, saying which system it is. Self-contained (no icon library) so the one file can
// be copied as is — keep the copies in sync.

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

interface HelpImage {
  id: number;
  title: string;
}
interface Turn {
  role: 'user' | 'assistant';
  text: string;
  image?: string;
  images?: HelpImage[];
  show?: string[];
  followUps?: string[];
  error?: boolean;
  writing?: boolean;
}

interface Props {
  apiBase: string; // e.g. "/api/help" — this system's own server, which forwards to the CRM
  fetcher?: Fetcher; // adds this system's login headers (default: window.fetch)
  title?: string; // a system with its own assistant (e.g. the tasks system) names it
  subtitle?: string;
  welcome?: string; // the first message
  buttonClassName?: string; // position of the floating button (fixed ...)
  panelBottomClassName?: string; // how high the open panel sits (just above the button)
  accent?: 'blue' | 'green';
}

const THEMES = {
  blue: { bg: 'bg-blue-600', hover: 'hover:bg-blue-700', soft: 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100', ring: 'focus:ring-blue-500' },
  green: { bg: 'bg-[#075E54]', hover: 'hover:bg-[#054D44]', soft: 'bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100', ring: 'focus:ring-[#075E54]' },
};

// ---------- tiny icons (no icon library in every system) ----------
const Svg = ({ children, className = 'w-4 h-4' }: { children: React.ReactNode; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
    {children}
  </svg>
);
const IconX = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
);
const IconHelp = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="10" />
    <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" />
  </Svg>
);
const IconSend = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <path d="m22 2-7 20-4-9-9-4Z" />
    <path d="M22 2 11 13" />
  </Svg>
);
const IconClip = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <path d="m21.4 11-8.6 8.6a6 6 0 0 1-8.5-8.5l8.6-8.6a4 4 0 0 1 5.7 5.7l-8.6 8.6a2 2 0 0 1-2.8-2.8l7.9-7.9" />
  </Svg>
);
const IconList = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <path d="M10 6h11M10 12h11M10 18h11M3 6l1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2" />
  </Svg>
);
const Spinner = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <Svg className={`${className} animate-spin`}>
    <path d="M21 12a9 9 0 1 1-6.2-8.6" />
  </Svg>
);

// ---------- "show me": find the real button by its text and point at it ----------
const TOUR_EVENT = 'smartesek-help-tour';
const clean = (s: string | null | undefined) =>
  String(s || '')
    .replace(/[‎‏"'״׳“”…]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
const bare = (s: string) => s.replace(/^[^\p{L}\p{N}]+/u, '').trim();
const norm = (s: string | null | undefined) => bare(clean(s));

function matchScore(want: string, got: string): number {
  const one = (w: string, g: string) =>
    !w || !g ? 0 : g === w ? 3 : g.startsWith(w) && w.length >= 3 ? 2 : w.startsWith(g) && g.length >= 3 ? 1.5 : w.length >= 4 && g.includes(w) ? 1 : 0;
  const raw = one(want, got);
  return raw ? raw + 0.5 : one(bare(want), bare(got));
}

const visible = (el: Element) => {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const st = getComputedStyle(el);
  return st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.05;
};

// The thing a person clicks around this text: the nearest button / link / label / input, or else the
// outermost element of the pointer-cursor area (the cursor is inherited by the text inside).
function clickableOf(el: Element): Element {
  let cur: Element | null = el;
  for (let i = 0; cur && i < 6; i++, cur = cur.parentElement) {
    if (cur.matches('button, a, label, select, input, textarea, [role=button], [role=tab], [id^="sidebar-"], [id^="nav-tab-"]')) return cur;
  }
  let top = el;
  cur = el;
  for (let i = 0; cur && i < 6 && getComputedStyle(cur).cursor === 'pointer'; i++, cur = cur.parentElement) top = cur;
  return top;
}

// Exact text first, then starts-with, then contains; then what's already in the window; then the
// closest in length; then the smallest. Ignores the assistant itself.
function findByText(text: string): Element | null {
  const want = clean(text);
  if (!want) return null;
  let best: { el: Element; score: number; extra: number; area: number } | null = null;
  const consider = (el: Element, label: string) => {
    const got = clean(label);
    const score = matchScore(want, got);
    if (!score || el.closest('[data-help-ui]') || !visible(el)) return;
    const r = el.getBoundingClientRect();
    const onScreen = r.right > 0 && r.left < window.innerWidth && r.bottom > 0 && r.top < window.innerHeight ? 1 : 0;
    const cand = { el, score: score + onScreen * 0.25, extra: Math.abs(got.length - want.length), area: r.width * r.height };
    const b = best as typeof cand | null;
    if (!b || cand.score > b.score || (cand.score === b.score && (cand.extra < b.extra || (cand.extra === b.extra && cand.area < b.area)))) best = cand;
  };
  // (a button that is only an icon, like "⚙️", is looked for by the icon itself)
  const probe = norm(want).slice(0, 3) || want.slice(0, 2);
  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    if (el instanceof HTMLElement || el instanceof SVGElement) {
      const t = el.textContent || '';
      if (t.length <= 80 && t.length >= 2 && clean(t).includes(probe)) consider(el, t);
      for (const attr of ['title', 'aria-label', 'placeholder']) {
        const v = el.getAttribute(attr);
        if (v) consider(el, v);
      }
    }
  }
  return best ? clickableOf((best as { el: Element }).el) : null;
}

function Spotlight() {
  const [tour, setTour] = useState<{ steps: string[]; index: number } | null>(null);
  const [target, setTarget] = useState<Element | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [missing, setMissing] = useState(false);
  const timer = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    setTour(null);
    setTarget(null);
    setRect(null);
    setMissing(false);
  }, []);

  // Look for step `index` (or a later step already showing); after a few seconds say it isn't there
  // yet, but keep looking — some buttons appear only after the person does something
  const seek = useCallback((steps: string[], index: number) => {
    if (timer.current) window.clearTimeout(timer.current);
    setTarget(null);
    setMissing(false);
    const started = Date.now();
    const look = () => {
      for (let j = steps.length - 1; j >= index; j--) {
        const el = findByText(steps[j]);
        if (el) {
          el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
          setMissing(false);
          setTour({ steps, index: j });
          setTarget(el);
          return;
        }
      }
      if (Date.now() - started > 4000) {
        setTour({ steps, index });
        setMissing(true);
      }
      if (Date.now() - started > 3 * 60 * 1000) return;
      timer.current = window.setTimeout(look, Date.now() - started > 4000 ? 700 : 250);
    };
    look();
  }, []);

  useEffect(() => {
    const onStart = (e: Event) => {
      const steps = (((e as CustomEvent).detail as string[]) || []).filter(Boolean);
      if (steps.length) seek(steps, 0);
    };
    window.addEventListener(TOUR_EVENT, onStart);
    return () => window.removeEventListener(TOUR_EVENT, onStart);
  }, [seek]);

  useEffect(() => {
    if (!target) return;
    let raf = 0;
    const tick = () => {
      if (!target.isConnected) {
        setRect(null);
        return;
      }
      setRect(target.getBoundingClientRect());
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [target]);

  useEffect(() => {
    if (!tour || !target) return;
    const onClick = (e: MouseEvent) => {
      if (!(e.target instanceof Node) || !target.contains(e.target)) return;
      if (tour.index + 1 >= tour.steps.length) window.setTimeout(stop, 150);
      else {
        const next = tour.index + 1;
        window.setTimeout(() => seek(tour.steps, next), 350);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stop();
    };
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [tour, target, seek, stop]);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    []
  );

  if (!tour) return null;
  const pad = 6;
  if (missing || !rect) {
    if (!missing) return null;
    return (
      <div data-help-ui dir="rtl" className="fixed z-[9998] top-4 left-1/2 -translate-x-1/2 bg-white text-gray-800 border border-amber-300 shadow-xl rounded-xl px-4 py-3 text-sm max-w-[90vw] flex items-start gap-3">
        <div>
          {tour.steps.length > 1 && <span className="text-gray-500">שלב {tour.index + 1} מתוך {tour.steps.length}: </span>}
          עדיין לא רואה במסך את "<b>{tour.steps[tour.index]}</b>"
          <div className="text-xs text-gray-500 mt-0.5">הוא יסומן ברגע שיופיע — אולי צריך קודם לעשות משהו במסך, או שהוא זמין רק במחשב / רק למנהלים.</div>
        </div>
        <button type="button" onClick={stop} className="p-1 text-gray-400 hover:text-gray-700 cursor-pointer" title="סגור">
          <IconX />
        </button>
      </div>
    );
  }
  const below = rect.bottom + 90 < window.innerHeight;
  const tipTop = below ? rect.bottom + pad + 10 : Math.max(8, rect.top - pad - 10 - 64);
  const tipLeft = Math.min(Math.max(8, rect.left + rect.width / 2 - 140), window.innerWidth - 288);
  const box = { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 };
  return (
    <>
      <div data-help-ui className="fixed z-[9996] pointer-events-none rounded-lg" style={{ ...box, boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.55)' }} />
      <div data-help-ui className="fixed z-[9997] pointer-events-none rounded-lg border-[3px] border-amber-400 animate-pulse" style={box} />
      <div data-help-ui dir="rtl" className="fixed z-[9998] w-[280px] bg-white text-gray-800 rounded-xl shadow-2xl border border-gray-200 px-3 py-2.5 text-sm" style={{ top: tipTop, left: tipLeft }}>
        <div className="flex items-start gap-2">
          <div className="flex-1">
            {tour.steps.length > 1 && <span className="text-gray-500">שלב {tour.index + 1} מתוך {tour.steps.length}: </span>}
            לחצו כאן — "<b>{tour.steps[tour.index]}</b>"
          </div>
          <button type="button" onClick={stop} className="p-0.5 text-gray-400 hover:text-gray-700 cursor-pointer" title="סיום (Esc)">
            <IconX />
          </button>
        </div>
      </div>
    </>
  );
}

// ---------- the chat ----------

// A screenshot shrunk to at most 1600px, as JPEG
async function shrinkImage(file: Blob): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('לא הצלחתי לקרוא את התמונה'));
      i.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const imageFromClipboard = (e: React.ClipboardEvent) =>
  (Array.from(e.clipboardData.items) as DataTransferItem[]).find((it) => it.type.startsWith('image/'))?.getAsFile() || null;

// The text written so far, without the markers that only make sense at the end
function preview(raw: string): string {
  let t = raw.replace(/\*\*/g, '');
  const cut = t.search(/\n?\s*המשך\s*:/);
  if (cut >= 0) t = t.slice(0, cut);
  return t
    .replace(/\[\s*(?:תמונה|הראה)[^\]]*\]?/g, '')
    .replace(/\n?\s*המש?$/, '')
    .trim();
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const j = await res.json();
    return j?.error || fallback;
  } catch {
    return fallback;
  }
}

const imageUrls = new Map<string, Promise<string>>();
function LibraryImage({ image, url, fetcher, onOpen }: { image: HelpImage; url: string; fetcher: Fetcher; onOpen: (src: string) => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    let p = imageUrls.get(url);
    if (!p) {
      p = fetcher(url).then(async (r) => {
        if (!r.ok) throw new Error('image');
        return URL.createObjectURL(await r.blob());
      });
      p.catch(() => imageUrls.delete(url));
      imageUrls.set(url, p);
    }
    p.then((u) => alive && setSrc(u)).catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [url, fetcher]);
  if (failed) return <div className="text-[11px] text-gray-400">התמונה "{image.title}" לא נטענה</div>;
  if (!src) return <div className="bg-gray-100 animate-pulse rounded-lg h-32" />;
  return (
    <button type="button" onClick={() => onOpen(src)} className="block w-full cursor-zoom-in" title="לחץ להגדלה">
      <img src={src} alt={image.title} className="w-full max-h-56 rounded-lg border border-gray-200 object-contain bg-white" />
    </button>
  );
}

const defaultFetcher: Fetcher = (url, init) => fetch(url, init);

export function HelpWidget({
  apiBase,
  fetcher = defaultFetcher,
  title = 'העוזר',
  subtitle = 'איך עושים את זה? — כל המערכות של עסק חכם',
  welcome = 'שלום! אני כאן כדי להסביר איך עושים כל דבר במערכות של עסק חכם — ה-CRM, הוואטסאפ וההודעות, הבוט, המשימות והפורטל. כתבו שאלה במילים שלכם, צרפו צילום מסך של מה שאתם רואים (📎), או בחרו שאלה:',
  buttonClassName = 'fixed bottom-4 right-4',
  panelBottomClassName = 'bottom-20',
  accent = 'blue',
}: Props) {
  const t = THEMES[accent];
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<{ group: string; questions: string[] }[] | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [attached, setAttached] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showMenu, setShowMenu] = useState(true);
  const [zoom, setZoom] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || groups) return;
    fetcher(`${apiBase}/suggestions`)
      .then(async (r) => (r.ok ? ((await r.json()).groups as { group: string; questions: string[] }[]) || [] : []))
      .then(setGroups)
      .catch(() => setGroups([]));
  }, [open, groups, apiBase, fetcher]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, busy, showMenu]);

  const attach = async (file: Blob | null | undefined) => {
    if (!file) return;
    try {
      setAttached(await shrinkImage(file));
    } catch {
      /* not an image we can read */
    }
  };

  const ask = async (question: string, history: { role: string; text: string }[], image: string | undefined, onText: (soFar: string) => void) => {
    const res = await fetcher(`${apiBase}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, history, image, device: window.innerWidth < 768 ? 'mobile' : 'desktop', stream: true }),
    });
    if (!res.ok) throw new Error(await readError(res, 'העוזר לא הצליח לענות'));
    if (!res.body || !(res.headers.get('content-type') || '').includes('ndjson')) return res.json();
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let soFar = '';
    for (;;) {
      const { done, value } = await reader.read();
      buf += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = done ? '' : lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const msg = JSON.parse(line);
        if (msg.error) throw new Error(msg.error);
        if (msg.done) return msg.done;
        if (msg.t) {
          soFar += msg.t;
          onText(soFar);
        }
      }
      if (done) break;
    }
    throw new Error('החיבור נקטע באמצע התשובה — נסה שוב');
  };

  const send = async (question: string) => {
    const q = question.trim() || (attached ? 'מה רואים בצילום המסך ומה עושים כאן?' : '');
    if (!q || busy) return;
    const image = attached || undefined;
    const history = turns.filter((x) => !x.error).map(({ role, text }) => ({ role, text }));
    setTurns((prev) => [...prev, { role: 'user', text: q, image }]);
    setInput('');
    setAttached(null);
    setShowMenu(false);
    setBusy(true);
    const withAnswer = (prev: Turn[], turn: Turn) => (prev[prev.length - 1]?.writing ? [...prev.slice(0, -1), turn] : [...prev, turn]);
    try {
      const r = await ask(q, history, image, (soFar) => {
        const text = preview(soFar);
        if (text) setTurns((prev) => withAnswer(prev, { role: 'assistant', text, writing: true }));
      });
      setTurns((prev) => withAnswer(prev, { role: 'assistant', text: r.answer, images: r.images, show: r.show, followUps: r.followUps }));
    } catch (e: any) {
      setTurns((prev) => withAnswer(prev, { role: 'assistant', text: e?.message || 'משהו השתבש — נסה שוב', error: true }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {open && (
        <div
          dir="rtl"
          data-help-ui
          className={`fixed z-[9990] ${panelBottomClassName} right-4 left-4 sm:left-auto sm:w-[420px] max-h-[80vh] bg-white text-gray-800 rounded-2xl border border-gray-200 shadow-2xl flex flex-col overflow-hidden text-sm text-right`}
        >
          <div className={`${t.bg} text-white px-4 py-3 flex items-center justify-between shrink-0`}>
            <div className="flex items-center gap-2">
              <IconHelp />
              <div>
                <div className="font-bold leading-tight">{title}</div>
                <div className="text-[10px] text-white/75 leading-tight">{subtitle}</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {turns.length > 0 && (
                <button type="button" title="שאלות נפוצות" onClick={() => setShowMenu((v) => !v)} className="p-1.5 rounded hover:bg-white/15 cursor-pointer">
                  <IconList />
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)} className="p-1.5 rounded hover:bg-white/15 cursor-pointer" title="סגור">
                <IconX />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50">
            {turns.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-start' : 'flex justify-end'}>
                <div
                  className={
                    m.role === 'user'
                      ? `${t.bg} text-white rounded-2xl rounded-tr-sm px-3 py-2 max-w-[85%] whitespace-pre-wrap`
                      : `rounded-2xl rounded-tl-sm px-3 py-2 max-w-[92%] whitespace-pre-wrap leading-relaxed border ${m.error ? 'bg-red-50 border-red-200 text-red-800' : 'bg-white border-gray-200 text-gray-800'}`
                  }
                >
                  {m.image && (
                    <button type="button" onClick={() => setZoom(m.image!)} className="block mb-1.5 cursor-zoom-in">
                      <img src={m.image} alt="צילום מסך" className="max-h-28 rounded-lg border border-white/40" />
                    </button>
                  )}
                  {m.text}
                  {!!m.images?.length && (
                    <div className="mt-2.5 space-y-2">
                      {m.images.map((im) => (
                        <div key={im.id}>
                          <LibraryImage image={im} url={`${apiBase}/images/${im.id}`} fetcher={fetcher} onOpen={setZoom} />
                          <div className="text-[10px] text-gray-500 mt-0.5">{im.title}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {!!m.show?.length && !m.writing && (
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        window.dispatchEvent(new CustomEvent(TOUR_EVENT, { detail: m.show }));
                      }}
                      className="mt-2.5 w-full flex items-center justify-center gap-1.5 bg-amber-400 hover:bg-amber-500 text-amber-950 font-bold text-xs rounded-lg py-2 cursor-pointer"
                    >
                      👆 הראה לי על המסך
                    </button>
                  )}
                  {m.role === 'assistant' && !!m.followUps?.length && i === turns.length - 1 && !busy && (
                    <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2 border-t border-gray-100">
                      {m.followUps.map((f) => (
                        <button key={f} type="button" onClick={() => send(f)} className={`text-xs px-2 py-1 rounded-full border cursor-pointer ${t.soft}`}>
                          {f}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && !turns[turns.length - 1]?.writing && (
              <div className="flex justify-end">
                <div className="bg-white border border-gray-200 rounded-2xl px-3 py-2 text-gray-500 flex items-center gap-2">
                  <Spinner /> כותב תשובה...
                </div>
              </div>
            )}

            {(showMenu || turns.length === 0) && (
              <div className="space-y-3">
                {turns.length === 0 && (
                  <div className="text-xs text-gray-600 leading-relaxed">{welcome}</div>
                )}
                {groups === null ? (
                  <div className="text-xs text-gray-400 flex items-center gap-2">
                    <Spinner className="w-3.5 h-3.5" /> טוען...
                  </div>
                ) : (
                  groups.map((g) => (
                    <div key={g.group}>
                      <div className="text-[11px] font-bold text-gray-500 mb-1.5">{g.group}</div>
                      <div className="flex flex-col gap-1.5">
                        {g.questions.map((q) => (
                          <button key={q} type="button" disabled={busy} onClick={() => send(q)} className={`text-right text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer disabled:opacity-50 ${t.soft}`}>
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="border-t border-gray-200 p-2.5 bg-white shrink-0">
            {attached && (
              <div className="flex items-center gap-2 mb-2">
                <img src={attached} alt="צילום מסך" className="h-12 rounded border border-gray-200" />
                <span className="text-[11px] text-gray-500 flex-1">צילום המסך יישלח עם השאלה</span>
                <button type="button" onClick={() => setAttached(null)} className="p-1 text-gray-400 hover:text-red-600 cursor-pointer" title="הסר">
                  <IconX className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 cursor-pointer" title="צרף צילום מסך">
                <IconClip />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  attach(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPaste={(e) => {
                  const file = imageFromClipboard(e);
                  if (file) {
                    e.preventDefault();
                    attach(file);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') send(input);
                }}
                placeholder="איך עושים...?"
                className={`flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-1 ${t.ring}`}
              />
              <button type="button" onClick={() => send(input)} disabled={busy || (!input.trim() && !attached)} className={`p-2 rounded-lg text-white ${t.bg} ${t.hover} disabled:opacity-40 cursor-pointer`} title="שלח">
                <IconSend className="w-4 h-4 -scale-x-100" />
              </button>
            </div>
          </div>
        </div>
      )}

      {zoom && (
        <div data-help-ui className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4 cursor-zoom-out" onClick={() => setZoom(null)}>
          <img src={zoom} alt="" className="max-w-full max-h-full rounded-lg shadow-2xl" />
        </div>
      )}

      <Spotlight />

      <button
        type="button"
        data-help-ui
        onClick={() => setOpen((v) => !v)}
        title={`${title} — איך עושים את זה?`}
        className={`${buttonClassName} z-[9990] w-12 h-12 rounded-full ${t.bg} ${t.hover} text-white shadow-xl flex items-center justify-center transition-transform hover:scale-105 cursor-pointer`}
      >
        {open ? <IconX className="w-5 h-5" /> : <IconHelp className="w-6 h-6" />}
      </button>
    </>
  );
}

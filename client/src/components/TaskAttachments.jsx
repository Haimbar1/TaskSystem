import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

// "קבצים מצורפים" in the task form (server/src/services/taskAttachments.js): pick files, drop them
// here, or paste (Ctrl+V) a screenshot or copied file anywhere in the task window. Images show as
// thumbnails; clicking one opens it large. In a new task (no taskId yet) the files wait here and
// TaskFormModal uploads them with uploadAttachment once the task is created.

const MAX_BYTES = 4 * 1024 * 1024; // same as the server's MAX_BYTES
const THUMB_SIZE = 240; // px, the longer side of the table's thumbnail (shown at 40–48px, sharp on retina)
export const isImage = (a) => /^image\/(png|jpe?g|gif|webp|bmp|avif)$/i.test(a.mime_type ?? a.type ?? '');

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(value) {
  return new Date(value).toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// A pasted screenshot is always called "image.png"; give it a name worth keeping.
function nameForPasted(file) {
  if (file.name && file.name !== 'image.png') return file;
  const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
  const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
  return new File([file], `צילום-מסך_${stamp}.${ext}`, { type: file.type });
}

// A small JPEG of an image (the server has no image library), or null if the browser can't read it.
async function makeThumb(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, THUMB_SIZE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // transparent PNGs on white, not black
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
  } catch {
    return null;
  }
}

// Uploads one file, and for an image its thumbnail too (a failed thumbnail only means the table
// loads the full image instead).
export async function uploadAttachment(taskId, file) {
  const saved = await api.addTaskAttachment(taskId, file);
  if (isImage(saved)) {
    const thumb = await makeThumb(file);
    if (thumb) await api.setTaskAttachmentThumb(taskId, saved.id, thumb).catch(console.error);
  }
  return saved;
}

// An image open large on a dark background; Esc or a click outside closes it.
export function ImageLightbox({ url, name, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && (e.stopPropagation(), onClose());
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex flex-col items-center justify-center p-4" onClick={onClose}>
      {url ? (
        <img
          src={url}
          alt={name}
          className="max-w-full max-h-[85vh] object-contain rounded shadow-lg"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="text-white text-sm">טוען…</span>
      )}
      <div className="mt-3 flex items-center gap-3 text-white text-sm" onClick={(e) => e.stopPropagation()}>
        <span className="truncate max-w-[60vw]">{name}</span>
        {url && (
          <a href={url} download={name} className="underline">
            הורד
          </a>
        )}
        <button type="button" onClick={onClose} className="underline">
          סגור
        </button>
      </div>
    </div>
  );
}

// taskId: an existing task (uploads at once). Without it: pending/onPendingChange hold the files
// for the new task. onChange: the task's files changed (the table's thumbnail may be different).
export default function TaskAttachments({ taskId, pending, onPendingChange, onChange }) {
  const isNew = !taskId;
  const [saved, setSaved] = useState(isNew ? [] : null);
  const [urls, setUrls] = useState({}); // attachment id -> object URL, for images
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null); // the image open large
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);
  const rootRef = useRef(null);
  const urlsRef = useRef({});

  // A waiting file looks like a saved one, with the File itself in `file`.
  const items = isNew
    ? (pending || []).map((p) => ({
        id: p.key,
        file_name: p.file.name,
        mime_type: p.file.type || 'application/octet-stream',
        size_bytes: p.file.size,
        created_at: p.addedAt,
        file: p.file,
      }))
    : saved;

  useEffect(() => {
    if (isNew) return;
    api
      .getTaskAttachments(taskId)
      .then(setSaved)
      .catch((err) => {
        console.error(err);
        setError('לא ניתן לטעון את הקבצים');
      });
  }, [taskId]);

  function keepUrl(id, url) {
    urlsRef.current[id] = url;
    setUrls({ ...urlsRef.current });
  }

  // Thumbnails: each image is read once, kept as an object URL until the form closes.
  useEffect(() => {
    for (const a of items || []) {
      if (!isImage(a) || urlsRef.current[a.id]) continue;
      if (a.file) {
        keepUrl(a.id, URL.createObjectURL(a.file));
        continue;
      }
      urlsRef.current[a.id] = 'loading';
      api
        .getTaskAttachmentBlob(taskId, a.id)
        .then((blob) => keepUrl(a.id, URL.createObjectURL(blob)))
        .catch(() => delete urlsRef.current[a.id]);
    }
  }, [items, taskId]);
  useEffect(
    () => () => Object.values(urlsRef.current).forEach((u) => u !== 'loading' && URL.revokeObjectURL(u)),
    []
  );

  async function add(files) {
    setError('');
    const ok = [];
    for (const file of files) {
      if (file.size > MAX_BYTES) {
        setError(`"${file.name}" גדול מדי (${formatSize(file.size)}) — עד ${formatSize(MAX_BYTES)} לקובץ`);
      } else {
        ok.push(file);
      }
    }
    if (isNew) {
      const now = new Date().toISOString();
      onPendingChange?.((prev) => [...(prev || []), ...ok.map((file) => ({ key: crypto.randomUUID(), file, addedAt: now }))]);
      return;
    }
    for (const file of ok) {
      setUploading((n) => n + 1);
      try {
        const a = await uploadAttachment(taskId, file);
        if (isImage(a)) keepUrl(a.id, URL.createObjectURL(file));
        setSaved((prev) => [...(prev || []), a]);
        onChange?.();
      } catch (err) {
        setError(`"${file.name}" לא צורף: ${err.message}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  // Paste or drop files anywhere in the task window — but text pasted into a field stays text.
  // A file dropped anywhere else on the page is ignored, instead of the browser opening it in place
  // of the system.
  const addRef = useRef(add);
  addRef.current = add;
  useEffect(() => {
    const form = rootRef.current?.closest('[data-task-form]') || document;
    const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
    let depth = 0; // dragenter/leave fire for every child the drag passes over
    function onPaste(e) {
      const files = [...(e.clipboardData?.files || [])];
      if (!files.length) return;
      e.preventDefault();
      addRef.current(files.map(nameForPasted));
    }
    function onEnter(e) {
      if (!hasFiles(e)) return;
      depth += 1;
      setDragging(true);
    }
    function onLeave(e) {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    }
    function onOver(e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
    function onDrop(e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      if (e.dataTransfer.files.length) addRef.current([...e.dataTransfer.files]);
    }
    function blockOutside(e) {
      if (hasFiles(e) && !form.contains?.(e.target)) {
        e.preventDefault();
        if (e.type === 'dragover') e.dataTransfer.dropEffect = 'none';
      }
    }
    form.addEventListener('paste', onPaste);
    form.addEventListener('dragenter', onEnter);
    form.addEventListener('dragleave', onLeave);
    form.addEventListener('dragover', onOver);
    form.addEventListener('drop', onDrop);
    window.addEventListener('dragover', blockOutside);
    window.addEventListener('drop', blockOutside);
    return () => {
      form.removeEventListener('paste', onPaste);
      form.removeEventListener('dragenter', onEnter);
      form.removeEventListener('dragleave', onLeave);
      form.removeEventListener('dragover', onOver);
      form.removeEventListener('drop', onDrop);
      window.removeEventListener('dragover', blockOutside);
      window.removeEventListener('drop', blockOutside);
    };
  }, []);

  async function open(a) {
    if (isImage(a) && urls[a.id] && urls[a.id] !== 'loading') return setPreview(a);
    // Opened before the fetch so the browser doesn't treat it as a popup.
    const win = window.open('', '_blank');
    try {
      const blob = a.file || (await api.getTaskAttachmentBlob(taskId, a.id));
      const url = URL.createObjectURL(blob);
      const viewable = isImage(a) || a.mime_type === 'application/pdf';
      if (viewable && win) {
        win.location.href = url;
      } else {
        win?.close();
        const link = document.createElement('a');
        link.href = url;
        link.download = a.file_name;
        link.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      win?.close();
      setError(`לא ניתן לפתוח את "${a.file_name}"`);
    }
  }

  async function remove(a) {
    if (isNew) {
      onPendingChange?.((prev) => prev.filter((p) => p.key !== a.id));
      if (preview?.id === a.id) setPreview(null);
      return;
    }
    if (!window.confirm(`למחוק את "${a.file_name}"?`)) return;
    try {
      await api.deleteTaskAttachment(taskId, a.id);
      setSaved((prev) => prev.filter((x) => x.id !== a.id));
      if (preview?.id === a.id) setPreview(null);
      onChange?.();
    } catch (err) {
      setError(err.message || 'שגיאה במחיקת הקובץ');
    }
  }

  const images = (items || []).filter(isImage);
  const others = (items || []).filter((a) => !isImage(a));

  return (
    <div ref={rootRef}>
      {/* While files are dragged over the task window: it all is the drop zone. pointer-events-none
          so the drag events keep reaching the form underneath. */}
      {dragging && (
        <div className="fixed inset-0 z-[90] pointer-events-none flex items-center justify-center bg-emerald-900/30">
          <div className="rounded-2xl border-4 border-dashed border-emerald-400 bg-white/95 px-8 py-6 text-center shadow-xl">
            <div className="text-3xl mb-1">📎</div>
            <div className="font-bold text-emerald-800">שחררו כאן כדי לצרף למשימה</div>
            <div className="text-xs text-gray-500 mt-1">תמונות, PDF או כל קובץ — עד 4MB לקובץ</div>
          </div>
        </div>
      )}
      <label className="block text-sm mb-1">קבצים מצורפים</label>

      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {images.map((a) => (
            <div key={a.id} className="relative group">
              <button
                type="button"
                onClick={() => open(a)}
                title={a.file ? a.file_name : `${a.file_name} · ${a.author_name || '—'} · ${formatTime(a.created_at)}`}
                className="block w-24 h-24 border rounded overflow-hidden bg-gray-100"
              >
                {urls[a.id] && urls[a.id] !== 'loading' ? (
                  <img src={urls[a.id]} alt={a.file_name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs text-gray-400">טוען…</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => remove(a)}
                title="מחק"
                className="absolute top-1 left-1 w-6 h-6 rounded-full bg-white/90 border text-red-600 text-xs leading-none opacity-0 group-hover:opacity-100 focus:opacity-100"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {others.length > 0 && (
        <div className="border rounded divide-y mb-2">
          {others.map((a) => (
            <div key={a.id} className="flex items-center gap-2 p-2 text-sm">
              <span aria-hidden>{a.mime_type === 'application/pdf' ? '📄' : '📎'}</span>
              <button type="button" onClick={() => open(a)} className="text-emerald-700 hover:underline truncate text-start">
                {a.file_name}
              </button>
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {formatSize(a.size_bytes)}
                {!a.file && ` · ${a.author_name || '—'} · ${formatTime(a.created_at)}`}
              </span>
              <button type="button" onClick={() => remove(a)} title="מחק" className="ms-auto text-red-600 text-xs">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-gray-400">
          אפשר גם לגרור קבצים לכל מקום בחלון המשימה, או להדביק (Ctrl+V) צילום מסך. עד 4MB לקובץ.
          {isNew && items.length > 0 && ' הקבצים יעלו עם יצירת המשימה.'}
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading > 0}
          className="px-3 py-1.5 rounded-lg border border-emerald-600 text-emerald-700 text-sm whitespace-nowrap disabled:opacity-40"
        >
          {uploading > 0 ? 'מעלה…' : 'צרף קובץ'}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            add([...e.target.files]);
            e.target.value = '';
          }}
        />
      </div>
      {error && <p className="text-red-600 text-sm mt-1">{error}</p>}

      {preview && urls[preview.id] && (
        <ImageLightbox url={urls[preview.id]} name={preview.file_name} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}

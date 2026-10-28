import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ImageLightbox } from './TaskAttachments.jsx';

// The table's "תמונה": the task's first image (thumb_id from GET /api/tasks) as a small square;
// a click opens the full image. Each thumbnail is fetched once per page load (they're fetched with
// the login cookie, so a plain <img src> to the API isn't enough inside Monday).
const cache = new Map(); // attachment id -> Promise<object URL>

function thumbUrl(taskId, attachmentId) {
  if (!cache.has(attachmentId)) {
    const p = api.getTaskAttachmentBlob(taskId, attachmentId, { thumb: true }).then((b) => URL.createObjectURL(b));
    p.catch(() => cache.delete(attachmentId));
    cache.set(attachmentId, p);
  }
  return cache.get(attachmentId);
}

export default function TaskThumb({ task, size = 'w-12 h-12' }) {
  const [url, setUrl] = useState(null);
  const [full, setFull] = useState(undefined); // undefined: closed; null: loading; string: open

  useEffect(() => {
    setUrl(null);
    if (!task.thumb_id) return;
    let live = true;
    thumbUrl(task.id, task.thumb_id).then((u) => live && setUrl(u), () => {});
    return () => {
      live = false;
    };
  }, [task.id, task.thumb_id]);

  if (!task.thumb_id) return null;

  async function openFull(e) {
    e.stopPropagation();
    setFull(null);
    try {
      const blob = await api.getTaskAttachmentBlob(task.id, task.thumb_id);
      setFull(URL.createObjectURL(blob));
    } catch {
      setFull(undefined);
    }
  }

  function close() {
    if (full) URL.revokeObjectURL(full);
    setFull(undefined);
  }

  return (
    <>
      <button
        type="button"
        onClick={openFull}
        title="הצג תמונה"
        className={`block ${size} shrink-0 rounded border bg-gray-100 overflow-hidden`}
      >
        {url && <img src={url} alt="" className="w-full h-full object-cover" />}
      </button>
      {full !== undefined && <ImageLightbox url={full} name={task.title} onClose={close} />}
    </>
  );
}

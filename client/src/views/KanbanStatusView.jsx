import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { STATUS_LABELS } from '../constants.js';
import { useAppContext } from '../context/AppContext.jsx';
import { showWhatsAppPreview } from '../whatsappPreview.js';

const STATUSES = Object.keys(STATUS_LABELS);

export default function KanbanStatusView() {
  const { refreshKey } = useAppContext();
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    api.getTasks().then(setTasks).catch(console.error);
  }, [refreshKey]);

  async function moveTask(taskId, newStatus) {
    const updated = await api.updateTask(taskId, { status: newStatus });
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
    showWhatsAppPreview(updated.whatsappPreviews);
  }

  return (
    <div className="grid grid-cols-5 gap-3">
      {STATUSES.map((status) => (
        <div
          key={status}
          className="bg-white border rounded p-2 min-h-[300px]"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => moveTask(e.dataTransfer.getData('taskId'), status)}
        >
          <h3 className="font-semibold mb-2">{STATUS_LABELS[status]}</h3>
          {tasks
            .filter((t) => t.status === status)
            .map((t) => (
              <div
                key={t.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('taskId', t.id)}
                className="bg-gray-50 border rounded p-2 mb-2 cursor-move"
              >
                {t.title}
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}

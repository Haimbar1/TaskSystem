import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { STATUS_LABELS, STATUS_COLORS } from '../constants.js';
import { useAppContext } from '../context/AppContext.jsx';
import { showWhatsAppPreview } from '../whatsappPreview.js';
import KanbanCard from '../components/KanbanCard.jsx';

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
    <div className="grid grid-cols-5 gap-3 items-start">
      {STATUSES.map((status) => {
        const colTasks = tasks.filter((t) => t.status === status);
        const colors = STATUS_COLORS[status] || STATUS_COLORS.new;
        return (
          <div
            key={status}
            className="bg-white border rounded-xl shadow-sm overflow-hidden min-h-[300px]"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => moveTask(e.dataTransfer.getData('taskId'), status)}
          >
            <div className={`h-1 ${colors.bar}`} />
            <div className="p-2">
              <div className="flex items-center justify-between mb-2 px-1">
                <h3 className="font-semibold text-sm text-gray-700">{STATUS_LABELS[status]}</h3>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors.badge}`}>
                  {colTasks.length}
                </span>
              </div>
              {colTasks.map((t) => (
                <KanbanCard
                  key={t.id}
                  task={t}
                  showAssignees
                  onDragStart={(e) => e.dataTransfer.setData('taskId', t.id)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { STATUS_LABELS, STATUS_COLORS } from '../constants.js';
import { useAppContext } from '../context/AppContext.jsx';
import KanbanCard from '../components/KanbanCard.jsx';
import PageFrame from '../components/PageFrame.jsx';

const STATUSES = Object.keys(STATUS_LABELS);

export default function KanbanStatusView() {
  const { refreshKey } = useAppContext();
  const [tasks, setTasks] = useState([]);
  const [savingIds, setSavingIds] = useState([]);

  useEffect(() => {
    api.getTasks().then(setTasks).catch(console.error);
  }, [refreshKey]);

  // The card moves at once (the save also sends WhatsApp, which takes a moment) and shows that
  // it's saving; if the save fails it goes back to its old column.
  async function moveTask(taskId, newStatus) {
    const before = tasks.find((t) => String(t.id) === String(taskId));
    if (!before || before.status === newStatus) return;
    setTasks((prev) => prev.map((t) => (t.id === before.id ? { ...t, status: newStatus } : t)));
    setSavingIds((ids) => [...ids, before.id]);
    try {
      await api.updateTask(before.id, { status: newStatus });
    } catch (err) {
      console.error(err);
      setTasks((prev) => prev.map((t) => (t.id === before.id ? { ...t, status: before.status } : t)));
      alert('העברת המשימה נכשלה — היא הוחזרה למקומה');
    } finally {
      setSavingIds((ids) => ids.filter((id) => id !== before.id));
    }
  }

  return (
    <PageFrame title="קנבן לפי סטטוס" subtitle="גררי משימה בין עמודות כדי לעדכן את הסטטוס שלה">
      <div className="grid grid-cols-5 gap-3 items-start">
        {STATUSES.map((status) => {
          const colTasks = tasks.filter((t) => t.status === status);
          const colors = STATUS_COLORS[status] || STATUS_COLORS.new;
          return (
            <div
              key={status}
              className="bg-gray-50 border rounded-lg overflow-hidden min-h-[300px]"
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
                    saving={savingIds.includes(t.id)}
                    onDragStart={(e) => e.dataTransfer.setData('taskId', t.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </PageFrame>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAppContext } from '../context/AppContext.jsx';
import { showWhatsAppPreview } from '../whatsappPreview.js';
import KanbanCard from '../components/KanbanCard.jsx';
import PageFrame from '../components/PageFrame.jsx';

const UNASSIGNED = '__unassigned__';

export default function KanbanAssigneeView() {
  const { refreshKey } = useAppContext();
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    api.getTasks().then(setTasks).catch(console.error);
    api.getUsers().then(setUsers).catch(console.error);
  }, [refreshKey]);

  async function moveTask(taskId, userId) {
    const assignee_ids = userId === UNASSIGNED ? [] : [userId];
    const updated = await api.updateTask(taskId, { assignee_ids });
    setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
    showWhatsAppPreview(updated.whatsappPreviews);
  }

  const columns = [{ id: UNASSIGNED, name: 'לא משויך' }, ...users];

  return (
    <PageFrame title="קנבן לפי אחראי" subtitle="גררי משימה בין אנשים כדי לשנות מי אחראי עליה">
      <div className="grid gap-3 items-start" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
        {columns.map((col) => {
          const colTasks = tasks.filter((t) =>
            col.id === UNASSIGNED
              ? !(t.assignees || []).length
              : (t.assignees || []).some((a) => a.id === col.id)
          );
          return (
            <div
              key={col.id}
              className="bg-gray-50 border rounded-lg overflow-hidden min-h-[300px]"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => moveTask(e.dataTransfer.getData('taskId'), col.id)}
            >
              <div className={`h-1 ${col.id === UNASSIGNED ? 'bg-gray-400' : 'bg-teal-500'}`} />
              <div className="p-2">
                <div className="flex items-center justify-between mb-2 px-1">
                  <h3 className="font-semibold text-sm text-gray-700 truncate">
                    {col.name || col.email}
                  </h3>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    {colTasks.length}
                  </span>
                </div>
                {colTasks.map((t) => (
                  <KanbanCard
                    key={t.id}
                    task={t}
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

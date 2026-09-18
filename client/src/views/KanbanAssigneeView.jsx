import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAppContext } from '../context/AppContext.jsx';
import { showWhatsAppPreview } from '../whatsappPreview.js';

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
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
      {columns.map((col) => (
        <div
          key={col.id}
          className="bg-white border rounded-xl shadow-sm p-2 min-h-[300px]"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => moveTask(e.dataTransfer.getData('taskId'), col.id)}
        >
          <h3 className="font-semibold mb-2">{col.name || col.email}</h3>
          {tasks
            .filter((t) =>
              col.id === UNASSIGNED
                ? !(t.assignees || []).length
                : (t.assignees || []).some((a) => a.id === col.id)
            )
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

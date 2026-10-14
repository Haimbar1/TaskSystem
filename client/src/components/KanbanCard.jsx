import { PRIORITY_COLORS, PRIORITY_LABELS } from '../constants.js';

// `saving`: the card was just moved and the server (which also sends the WhatsApp updates)
// hasn't answered yet — it already sits in its new column, dimmed, and can't be dragged again.
export default function KanbanCard({ task, onDragStart, showAssignees = false, saving = false }) {
  return (
    <div
      draggable={!saving}
      onDragStart={onDragStart}
      className={`bg-white border rounded-lg p-3 mb-2 shadow-sm transition-shadow space-y-2 ${
        saving ? 'opacity-60 cursor-wait border-emerald-300' : 'cursor-move hover:shadow-md'
      }`}
    >
      <div className="text-sm font-medium text-gray-800">{task.title}</div>
      {saving && <div className="text-xs text-emerald-700">שומר ושולח עדכון…</div>}
      <div className="flex items-center flex-wrap gap-1">
        {task.priority && (
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.normal
            }`}
          >
            {PRIORITY_LABELS[task.priority] || task.priority}
          </span>
        )}
        {task.due_date && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-50 text-gray-500">
            {new Date(task.due_date).toLocaleDateString('he-IL')}
          </span>
        )}
      </div>
      {showAssignees && (task.assignees || []).length > 0 && (
        <div className="flex items-center flex-wrap gap-1">
          {task.assignees.map((a) => (
            <span
              key={a.id}
              className="text-xs px-2 py-0.5 rounded-full bg-teal-50 text-teal-700"
            >
              {a.name || a.email}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

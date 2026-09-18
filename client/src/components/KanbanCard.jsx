import { PRIORITY_COLORS, PRIORITY_LABELS } from '../constants.js';

export default function KanbanCard({ task, onDragStart, showAssignees = false }) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="bg-white border rounded-lg p-3 mb-2 cursor-move shadow-sm hover:shadow-md transition-shadow space-y-2"
    >
      <div className="text-sm font-medium text-gray-800">{task.title}</div>
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

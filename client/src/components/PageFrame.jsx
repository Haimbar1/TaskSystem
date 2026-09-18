// Wraps a view's content in a titled panel, matching the app's card style
// (white rounded panel, colored top accent, header row) so every screen
// (table/kanban) reads as one consistent frame instead of bare content.
export default function PageFrame({ title, subtitle, actions, children }) {
  return (
    <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
      <div className="h-1 bg-gradient-to-l from-teal-600 to-emerald-500" />
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50/60">
        <div>
          <h2 className="font-semibold text-gray-800">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {actions}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

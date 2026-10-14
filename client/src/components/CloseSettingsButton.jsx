import { useNavigate } from 'react-router-dom';

// "סגור" on the settings screens (opened from the gear menu): back to the tasks.
export default function CloseSettingsButton() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate('/')}
      title="סגור"
      className="px-3 py-1.5 rounded-lg border text-sm text-gray-600 hover:bg-gray-100"
    >
      ✕ סגור
    </button>
  );
}

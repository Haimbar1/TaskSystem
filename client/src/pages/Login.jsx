export default function Login() {
  return (
    <div
      dir="rtl"
      className="flex items-center justify-center h-screen bg-gradient-to-br from-teal-950 via-teal-900 to-emerald-900"
    >
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm text-center space-y-5">
        <div className="mx-auto w-14 h-14 rounded-xl bg-emerald-600 text-white flex items-center justify-center text-2xl font-bold">
          מ
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">מערכת ניהול משימות</h1>
          <p className="text-sm text-gray-500 mt-1">התחברות מאובטחת דרך חשבון Google</p>
        </div>
        <a
          href="/api/auth/google"
          className="flex items-center justify-center gap-2 border rounded-lg px-4 py-2.5 font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.8 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l6-6C34.3 5.1 29.4 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.4-.1-2.7-.4-4.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l6-6C34.3 5.1 29.4 3 24 3c-7.7 0-14.3 4.3-17.7 10.7z"/>
            <path fill="#4CAF50" d="M24 45c5.2 0 9.9-1.9 13.5-5.1l-6.2-5.3C29.3 36.6 26.8 37.5 24 37.5c-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9.6 40.6 16.2 45 24 45z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.9 2.6-2.7 4.8-5 6.4l6.2 5.3C39.8 37 43 31.8 43 24c0-1.4-.1-2.7-.4-3.5z"/>
          </svg>
          התחברות עם Google
        </a>
      </div>
    </div>
  );
}

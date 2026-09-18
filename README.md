# TaskSystem

שלד ראשוני למערכת ניהול המשימות. המפרט המלא (ארכיטקטורה, סכימת DB, לוגיקת התראות)
נמצא במסמך שהוכן בצ'אט — זה הבסיס להמשך העבודה כאן, מומלץ עם Claude Code.

## מבנה
- `server/` — Express + Postgres, API בלבד
- `client/` — React + Vite + Tailwind
- `server/migrations/001_init.sql` — הסכימה הראשונית של מסד הנתונים

## הרצה ראשונה
1. `cp .env.example .env` ומלא את הפרטים (DB, Google OAuth, WhatsApp)
2. `cd server && npm install && npm run migrate && npm run dev`
3. בטרמינל נפרד: `cd client && npm install && npm run dev`

## מה עוד חסר (להמשך העבודה)
- אכיפת auth בפועל בצד ה-client (מסך ההתחברות `Login.jsx` עדיין לא מחובר ל-routing)
- זרימת "הזמנת משתמש חדש" מלאה בצד ה-client (ה-API `/api/users/invite` כבר קיים)
- סינון עמודות בטבלה (המיון כבר עובד, הסינון עדיין TODO)
- קנבן לפי אחראי — עדיין placeholder, צריך להרחיב את `/api/tasks` כך שיחזיר גם assignees
- מיפוי משתני התבנית האמיתיים של WhatsApp (components/parameters) לכל סוג אירוע ב-`whatsapp.js`
- Deploy ל-Vercel + חיבור ה-cron ב-n8n ל-endpoint `POST /api/cron/check-overdue`

# Section Planning Gantt

A Vite + React application for section repair planning, cost allocation, Google Sheets synchronization, and Gantt reporting.

## Run locally

Prerequisites: Node.js 20 or newer.

```bash
npm install
npm run dev
```

No Gemini API key is required by the current source code.

## Deploy to Vercel

1. Upload this project to a GitHub repository.
2. In Vercel, select **Add New → Project** and import the repository.
3. Vercel should detect **Vite** automatically.
4. Use these settings if Vercel asks:
   - Build command: `npm run build`
   - Output directory: `dist`
   - Install command: `npm install`
5. Deploy.

The included `vercel.json` provides SPA fallback routing.

## Google sign-in and Sheets synchronization

The application uses the Firebase project defined in `firebase-applet-config.json`. After Vercel gives you a production domain, complete these Google settings:

1. Firebase Console → Authentication → Settings → Authorized domains.
2. Add your Vercel production domain, such as `your-project.vercel.app`.
3. Google Cloud Console → APIs & Services → Library.
4. Confirm that **Google Sheets API** and **Google Drive API** are enabled for the Firebase/Google Cloud project.
5. Google Cloud Console → APIs & Services → OAuth consent screen.
6. If the app is in Testing status, add intended users as test users.

Without the authorized domain and API permissions, the app UI will load but Google sign-in or Sheets synchronization may fail.

## Important

- Do not commit private service-account keys.
- The Firebase web configuration in `firebase-applet-config.json` is client-side configuration, not a server secret.
- The application currently requests Google Sheets and Drive OAuth scopes through Firebase Google sign-in.

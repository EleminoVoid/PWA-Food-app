# PWA Food App

This repository contains a React + Vite progressive web app with a small Express API and a Capacitor Android wrapper. You can run it as a normal web app, install it as a PWA, or open the Android project in Android Studio.

## What’s In The Repo

- `src/` contains the React app.
- `server/src/index.ts` contains the local API server.
- `android/` contains the Capacitor Android project.
- `vite.config.ts` proxies `/api` calls to the backend on port `3001`.

## Requirements

- Node.js 18 or newer.
- npm.
- Android Studio if you want to build or run the Android app.
- JDK 17 for Android builds.

## 1. Install Dependencies

From the project root:

```bash
npm install
```

## 2. Start The App Locally

This project starts both the front end and the API server together:

```bash
npm run dev
```

What this does:

- Starts the Vite dev server for the PWA.
- Starts the Express server with hot reload.
- Keeps `/api` requests working through the Vite proxy.

Open the Vite URL shown in the terminal, usually `http://localhost:5173`.

If you want to run the pieces separately:

```bash
npm run dev:client
npm run dev:server
```

## 3. Build The App For Production

Before syncing to Android, build the web app first:

```bash
npm run build
```

This produces the static web output in `dist/`, which is what Capacitor uses.

## Install And Use Offline (No deployment to cloud)

The installable PWA only works correctly from the production build:

```bash
npm run build
npm run preview
```

Open the preview URL, usually `http://localhost:4173`, then install NutriScan from the browser install button or browser menu.

Do not install from `npm run dev` / `http://localhost:5173` when testing offline cold starts. Install from `npm run preview` after `npm run build`, because that is the version that contains the production service worker and complete offline cache.

Important offline rule: install from the production preview, then open the installed app once while you are online so the service worker can cache the latest app shell. After that, you can close Chrome, close the installed app, stop the local server, turn off Wi-Fi, reopen the installed app, navigate Home/Scan/History, scan or upload photos, and save history locally on the device.

LAN phone testing note: your phone and PC must be connected to the same network. For example, if your PC is connected to `WiFi1`, your phone must also be connected to `WiFi1`. Then open the Vite LAN URL on the phone, such as `http://192.168.x.x:4173`.

Camera note: live camera access requires a secure origin. `localhost` works on the same computer. If you test from a phone using a LAN URL like `http://192.168.x.x:4173`, Chrome may block live camera access because it is not HTTPS. For local testing only, open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, enable **Insecure origins treated as secure**, add your LAN URL such as `http://192.168.x.x:4173`, then relaunch Chrome. In production, use HTTPS instead. If camera access is still blocked, use the **Take photo** or **Upload photo** fallback.

When the installed app comes back online, it checks for a newer service worker and refreshes automatically. If it still shows old content after reconnecting, uninstall the app, clear the site data for the preview URL, run `npm run build`, and install it again.

## 4. Sync The Web Build To Android

After building, copy the latest web assets into the Android project:

```bash
npx cap sync android
```

Use this again any time you change the web app and want Android Studio to see the latest build.

## 5. Open In Android Studio

You have two easy options:

### Option A: Open From The Command Line

```bash
npx cap open android
```

This launches Android Studio with the correct project already selected.

### Option B: Open The Folder Manually

In Android Studio, choose **Open** and select the `android/` folder in this repo.

## 6. Run The Android App

Once the project is open in Android Studio:

1. Wait for Gradle sync to finish.
2. Select an emulator or connect a physical Android device.
3. Click **Run**.

## Typical Development Loop

1. Change the web app in `src/`.
2. Run `npm run dev` while working on the UI.
3. When you want to test Android, run `npm run build`.
4. Run `npx cap sync android`.
5. Re-open or refresh the Android Studio project.

## Troubleshooting

- If the Android app shows old content, run `npm run build` and then `npx cap sync android` again.
- If API calls fail in the browser, make sure `npm run dev:server` is running and listening on port `3001`.
- If Android Studio cannot build, verify that JDK 17 is installed and selected.
- If the app will not open on a device, check the emulator/device connection and Gradle sync errors first.

## Useful Commands

```bash
npm run dev
npm run dev:client
npm run dev:server
npm run build
npm run lint
npx cap sync android
npx cap open android
```

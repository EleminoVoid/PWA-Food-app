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

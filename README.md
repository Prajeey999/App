# Analytics Pro — Android App

A locked WebView Android app that loads `juicychat.ai/my-wallet` and auto-injects your extension script.

## How it works

1. User opens the app → sees branded login screen
2. Logs in with email + license key (or Patreon OAuth)
3. JWT token is stored securely using EncryptedSharedPreferences
4. WebView loads `juicychat.ai/my-wallet` — navigation to any other site is blocked
5. Your extension JS is automatically injected after page load
6. A heartbeat runs every 5 minutes to validate the session server-side

---

## Project Structure

```
AnalyticsPro/
├── app/
│   └── src/main/
│       ├── assets/
│       │   └── extension.js          ← PUT YOUR EXTENSION JS HERE
│       ├── java/com/analyticspro/app/
│       │   ├── SplashActivity.kt     ← Branded splash screen
│       │   ├── MainActivity.kt       ← Login + WebView + injection logic
│       │   └── TokenManager.kt       ← Encrypted JWT storage
│       └── res/
│           ├── layout/               ← XML layouts
│           ├── values/               ← Colors, strings, themes
│           └── drawable/             ← Logo, input backgrounds
└── .github/workflows/build.yml       ← Auto-build APK on GitHub
```

---

## Setup (Android Studio)

### Step 1 — Add your extension script

Copy your full extension JS into:
```
app/src/main/assets/extension.js
```
Create the `assets` folder if it doesn't exist. This is the **entire content** of your extension's content script (the JS you provided).

### Step 2 — Create the assets folder

In Android Studio:
- Right-click `app/src/main` → New → Folder → Assets Folder
- Place `extension.js` inside it

### Step 3 — Add font cert (required for Bricolage font)

In `res/values/`, add `font_certs.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <array name="com_google_android_gms_fonts_certs">
        <item>@array/com_google_android_gms_fonts_certs_dev</item>
        <item>@array/com_google_android_gms_fonts_certs_prod</item>
    </array>
    <!-- Copy full cert arrays from Android downloadable fonts documentation -->
</resources>
```
Or simply replace `@font/bricolage` in layouts with `android:fontFamily="sans-serif"` to skip custom fonts.

### Step 4 — Build

```bash
./gradlew assembleDebug
```

APK will be at: `app/build/outputs/apk/debug/app-debug.apk`

---

## Build via GitHub (No Android Studio needed)

1. Push this project to a GitHub repo
2. Go to **Actions** tab → **Build APK** → **Run workflow**
3. Download the APK from the workflow artifacts

---

## Customisation

| What | Where |
|------|-------|
| Change app name | `res/values/strings.xml` |
| Change colours | `res/values/colors.xml` |
| Change locked URL | `MainActivity.kt` → `WALLET_URL` constant |
| Change API endpoint | `MainActivity.kt` → `API_BASE` constant |
| Replace logo | `res/drawable/ic_logo_bg.xml` or add a PNG |

---

## Notes

- The app blocks all navigation away from `juicychat.ai` — users can't accidentally browse elsewhere
- Tokens are stored with AES-256 encryption via Android Keystore
- The heartbeat auto-logs out revoked users after max 5 minutes
- Back button shows an exit confirmation dialog instead of navigating away

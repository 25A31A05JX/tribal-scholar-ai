# TribalScholar AI

**SIH26239 — AI-Enabled Scholarship and Fellowship Management System**

## Live Demo

**[Open the TribalScholar AI prototype](https://fascinating-bublanina-fb8da3.netlify.app/)**

The demo is a static prototype. Without Firebase configuration, sample data is saved in the current browser only and is not shared between devices.

## Overview

Students often have to search multiple sources to find scholarships, understand eligibility conditions, submit documents, and follow up on application status. Officers need a consistent way to review applications, request corrections, and record decisions.

TribalScholar AI brings these steps into one responsive web application. Students can discover schemes, compare their profile with published eligibility rules, apply, manage documents, and track progress. Officers can review applications, verify documents, raise deficiencies, make decisions, manage schemes, and view application analytics.

## Features

### Student portal

- Browse, search, and filter scholarship and fellowship opportunities.
- Check eligibility with a transparent, per-condition result.
- Submit applications with profile information prefilled.
- Upload, replace, and track required documents.
- Track application status and respond to deficiencies.
- Receive application and review notifications.
- Manage personal, education, financial, and category profile details.

### Admin / officer portal

- View application and scheme analytics.
- Search, filter, and review applications.
- Verify documents and inspect eligibility results.
- Request corrections or replacement documents with a reason and deadline.
- Approve applications after eligibility and required-document checks pass, or reject them.
- Add, edit, activate, and deactivate scholarship schemes.
- Receive officer notifications.

## Technology stack

- React 18
- TypeScript
- Vite
- Firebase Authentication (optional configuration)
- Cloud Firestore (optional configuration)
- Firebase Storage (optional configuration)
- Recharts
- Lucide icons

## System architecture

The React and TypeScript single-page application runs in the browser and is built and served by Vite. When the Firebase web-app configuration is present, Firebase Authentication provides account sign-in; officer accounts are identified using a trusted Firebase Authentication custom claim (`admin: true`). Firestore stores user, student, scholarship, application, document metadata, and notification records, while Firebase Storage holds uploaded document bytes. The included Firestore and Storage rules enforce access at the service boundary.

Without Firebase configuration, the built-in demonstration uses sample data in browser `localStorage` and demo identity in `sessionStorage`. This mode does not provide cross-device synchronization or cloud document uploads. Demo Student and Demo Admin are for demonstration only, not production credentials or a production authorization mechanism.

Firebase web-app configuration values with the `VITE_` prefix are public client configuration and become visible in the browser bundle. They are not server secrets; secure access with Firebase Authentication and correctly deployed Security Rules. **Never add a Firebase Admin SDK service-account JSON, private key, password, or deployment token to this repository or to a `VITE_` variable.**

## Eligibility engine

Eligibility is calculated by a transparent rule-based engine using each scheme's configured criteria, including:

- Minimum CGPA
- Maximum annual family income
- Required category
- Required education level
- Required documents

The application displays each condition and whether it passes. **This eligibility calculation is rule-based; the prototype does not use AI to decide eligibility.**

## Demo workflow

**Demo Student Login → Scholarship Discovery → Eligibility Check → Application → Document Upload → Admin Review → Deficiency → Student Resubmission → Document Verification → Approval**

To exercise the seeded deficiency workflow:

1. Choose **Demo Student** on the landing page.
2. Open **My applications** and select `TS-2026-000123`.
3. Open **My documents** and upload the requested Bonafide Certificate.
4. Sign out and choose **Demo Admin**.
5. Open the application, verify the uploaded document, and approve it.
6. Return to Demo Student and confirm the approved status and notification.

Other sample applications demonstrate approved, under-review, and rejected states. Demo changes persist in the current browser; to restart from the seed data, clear the site's local storage.

## Running locally

Requirements: Node.js 20 or newer and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. No Firebase project is needed to run the demo.

## Production build

```bash
npm run build
```

The production-ready static site is written to `dist/`. To preview it locally:

```bash
npm run preview
```

Netlify is configured in [`netlify.toml`](./netlify.toml) with build command `npm run build`, publish directory `dist`, and a single-page-application fallback so direct navigation and refreshes resolve to the app.

## Firebase setup (optional)

1. Create a Firebase project and register a web app.
2. Enable Email/Password in Firebase Authentication, create Firestore, and configure a Cloud Storage bucket.
3. Copy `.env.example` to `.env.local` and set the values from your Firebase web-app configuration:

   ```dotenv
   VITE_FIREBASE_API_KEY=
   VITE_FIREBASE_AUTH_DOMAIN=
   VITE_FIREBASE_PROJECT_ID=
   VITE_FIREBASE_STORAGE_BUCKET=
   VITE_FIREBASE_MESSAGING_SENDER_ID=
   VITE_FIREBASE_APP_ID=
   ```

4. Add the deployed site's domain to Firebase Authentication's authorized domains.
5. Deploy [`firestore.rules`](./firestore.rules) and [`storage.rules`](./storage.rules).
6. Grant officer custom claims only from a trusted server using the Firebase Admin SDK. Never place Admin SDK credentials in this frontend project.

The demo fallback remains available when Firebase is not configured. Firebase client configuration alone does not create or grant administrator access.

## Repository safety

The `.gitignore` excludes local environment files, Firebase service-account/admin credential files, private key files, dependency/build output, deployment state, and common OS/editor temporary files. `.env.example` is an empty template and is safe to commit. Check `git status` before committing and never stage secrets.

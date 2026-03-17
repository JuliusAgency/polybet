# Dalia-FE

Enterprise-grade React application built with **Vite**, **TypeScript**, **Tailwind CSS v4**, **Supabase**, and **react-i18next**.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file
cp .env.example .env
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

# 3. Start the dev server
npm run dev
```

---

## Scripts

| Command           | Description                    |
| ----------------- | ------------------------------ |
| `npm run dev`     | Start Vite dev server          |
| `npm run build`   | Type-check & build for prod    |
| `npm run preview` | Preview the production build   |
| `npm run lint`    | Run ESLint                     |

---

## Tech Stack

| Layer         | Technology                               |
| ------------- | ---------------------------------------- |
| Framework     | React 19 + TypeScript                    |
| Build Tool    | Vite 7                                   |
| Styling       | Tailwind CSS v4 (`@tailwindcss/vite`)    |
| Backend/BaaS  | Supabase (Auth, DB, Storage)             |
| Localization  | react-i18next + i18next-browser-languagedetector |
| Linting       | ESLint + Prettier                        |

---

## Folder Structure

```text
src/
├── api/                    # API clients & helpers
│   └── supabase/           # Supabase singleton client
├── components/             # Shared, reusable UI components
│   └── Button/             # Example component
├── contexts/               # React context providers
│   └── AuthContext/         # Supabase auth state management
├── hooks/                  # Custom React hooks
│   └── useAuth/            # Auth convenience hook
├── i18n/                   # Internationalization config
│   ├── config.ts           # i18next initialization
│   └── locales/            # Translation JSON files (en, he)
├── pages/                  # Route-level page components
│   └── Home/               # Home page
├── types/                  # Shared TypeScript types
├── utils/                  # Utility functions
├── App.tsx                 # Root component
├── main.tsx                # Entry point
└── index.css               # Tailwind CSS import
```

---

## Folder-per-File Rule

Every component, page, or complex logic block **must** live in its own folder:

```text
/ComponentName
  ├── index.ts              # Re-export for clean imports
  ├── ComponentName.tsx      # Main component (PascalCase)
  ├── const.ts               # Component-specific constants
  └── /components            # Private sub-components (if any)
```

**Import convention** — always import via the folder name:

```ts
import { Button } from '@/components/Button';
```

---

## Path Aliases

The `@/` alias maps to `src/`. Configured in both `tsconfig.app.json` and `vite.config.ts`.

```ts
import { supabase } from '@/api/supabase';
import { useAuth } from '@/hooks/useAuth';
```

---

## Environment Variables

Create a `.env` file from `.env.example`:

| Variable               | Description              |
| ---------------------- | ------------------------ |
| `VITE_SUPABASE_URL`    | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon key   |

---

## Localization (i18n)

- Translations live in `src/i18n/locales/{lang}/translation.json`.
- Supported languages: **English (`en`)**, **Hebrew (`he`)**.
- Language is auto-detected from the browser and persisted in `localStorage`.
- Use the `useTranslation` hook from `react-i18next`:

```tsx
const { t } = useTranslation();
return <h1>{t('app.title')}</h1>;
```

---

## Authentication

The `AuthProvider` context wraps the entire app and provides:

- `user` — current Supabase user (or `null`)
- `session` — current session
- `loading` — initial auth state loading flag
- `signIn(email, password)` / `signUp(email, password)` / `signOut()`

```tsx
const { user, signIn, signOut } = useAuth();
```

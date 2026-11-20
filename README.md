# Ковель Воксель Ферма (3D Ізометрична Гра)

3D ізометрична воксельна багатокористувацька ферма на **Three.js + React + Vite + Firebase Auth / Realtime Database**.

## Готові ZIP-архіви
- **`kovel-farm-github-pages.zip`** — готова статична збірка (`index.html` + `assets/*`). Достатньо розпакувати в корінь репозиторію GitHub і увімкнути **Settings → Pages → Deploy from a branch (`main` / `root`)**!
- **`kovel-farm-source.zip`** — повний вихідний код проєкту з готовим workflow `.github/workflows/deploy.yml` (автоматична збірка і публікація на GitHub Pages при `git push`) та конфігурацією Firebase (`firebase.json`, `database.rules.json`).

## Налаштування Firebase (`kovel-game`)
1. У Firebase Console → **Authentication → Sign-in method** увімкніть **Email/Password**.
2. У **Realtime Database → Rules** застосуйте правила з файлу `database.rules.json` (або запустіть `firebase deploy --only database,hosting`).

## Локальний запуск
```bash
npm install
npm run dev
```

## Збірка
```bash
npm run build
```
Готові статичні файли з'являться в папці `dist/`.

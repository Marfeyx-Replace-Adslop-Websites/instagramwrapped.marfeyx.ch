# Instagram Wrapped

Private Instagram chat statistics for the last 365 days.

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Run the app:

```bash
npm run dev
```

## Privacy and GitHub Safety

- Instagram ZIP files are parsed in the browser with a web worker.
- Chat contents and computed stats are kept in memory only.
- ZIP exports, logs, `dist`, and `node_modules` are ignored by Git.

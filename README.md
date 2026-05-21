# PSA Queue System

## Quick start (Windows)

1. Install [Node.js 18+](https://nodejs.org/)
2. Copy `.env.example` to `.env` and set `MONGODB_URI`
3. Double-click **`start_app.bat`** (runs `npm install` if needed, then starts the server)

Or in a terminal:

```bash
npm install
npm start
```

## If you see `Cannot find module 'dotenv'`

Dependencies are missing. From this folder run:

```bash
npm install
```

Then start again with `npm start` or `start_app.bat`.

## Main URL

- Login: `http://localhost:3000/login.html`
- Kiosk: `http://localhost:3000/getTicketNumberV2.html`
- Public display: `http://localhost:3000/queue_Status.html`

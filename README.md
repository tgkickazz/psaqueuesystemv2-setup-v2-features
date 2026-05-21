# PSA Queue System

## Quick start (Windows)

1. Install [Node.js 18+](https://nodejs.org/)
2. Copy `.env.example` to `.env` and set `MONGODB_URI` (MongoDB Atlas connection string)
3. Install and verify:

```powershell
cd psaqueuesystemv2-setup-v2-features
npm install
npm run verify
npm start
```

Or double-click **`start_app.bat`** (runs `npm install` if needed, then starts the server).

## URLs

| Page | URL |
|------|-----|
| Login | http://localhost:3000/login.html |
| Kiosk | http://localhost:3000/getTicketNumberV2.html |
| Public display | http://localhost:3000/queue_Status.html |

## Login (Firebase)

Accounts are stored in **Firebase Authentication** (project: `queue-project-login`).

1. Use **System Registration** to create a new account, **or**
2. Use an email already registered in Firebase.

After login, roles come from MongoDB `roles` collection and **`roles.json`** (fallback).

Test admin mapping: `admin.test@gmail.com` → **admin** in `roles.json` (must still exist in Firebase).

Password rules: 8+ characters, uppercase, lowercase, number, special character.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Cannot find module 'dotenv'` | Run `npm install` |
| `Missing MONGODB_URI` | Create `.env` from `.env.example` |
| `EADDRINUSE` port 3000 | Stop other `node server.js` or change `PORT` in `.env` |
| Login: no account / wrong password | Register via **System Registration** or reset password in Firebase Console |
| Server APIs fail on verify | Run `npm start` in another terminal, then `npm run verify` |

## Security features

- One active session per account (new login signs out other devices)
- PSA / multi-part email domains supported (`name@psa.gov.ph`)

## GitHub

Repository: https://github.com/tgkickazz/psaqueuesystemv2-setup-v2-features

After clone:

```powershell
git clone https://github.com/tgkickazz/psaqueuesystemv2-setup-v2-features.git
cd psaqueuesystemv2-setup-v2-features
npm install
copy .env.example .env
# edit .env with MONGODB_URI
npm start
```

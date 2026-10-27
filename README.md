# Keepwise

Keepwise is a personal household management app for tracking items, warranties, upcoming service dates, and repair history. It can be run in the browser or inside an Electron desktop window on macOS.

---

## Architecture & Technology Stack

- **Frontend (`Client/`)**:
  - React 19 & Vite
  - Icons by `lucide-react`
  - Desktop shell by Electron
  - Clean authentication interface with session token management in `localStorage`
- **Backend (`Server/`)**:
  - Node.js & Express 5
  - Official native MongoDB Node.js driver (`mongodb` v6) — no conflicting ORMs
  - Password hashing with `bcryptjs` (salt rounds: 10)
  - JWT authentication with `jsonwebtoken`
  - Multi-tenant data isolation ensuring each user only accesses their own inventory and service timeline
- **Database**: MongoDB (`users`, `assets`, `serviceLogs` collections)

---

## Environment Configuration

In `Server/`, copy `.env.example` to create your local `.env` file:

```sh
cd Server
cp .env.example .env
```

### Environment Variables (`Server/.env`):

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `MONGODB_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017` |
| `MONGODB_DB` | MongoDB database name | `keepwise` |
| `PORT` | API server port | `5000` |
| `JWT_SECRET` | Secret key used to sign and verify JWT tokens | `<strong_random_secret_key>` |
| `JWT_EXPIRES_IN` | Token expiration duration | `7d` |

> **Security Note**: Never commit your real `.env` file or secrets to version control. The `.gitignore` file automatically excludes `**/.env`.

---

## Quick Start (Two Terminals)

### 1. Start MongoDB
Ensure MongoDB is running locally on port 27017:
```sh
# Via Homebrew (if installed):
brew services start mongodb-community

# Or via Docker:
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

### 2. Start the Backend API (Terminal 1)
```sh
cd Server
npm install
npm run seed     # Sets up initial demo user (demo@keepwise.local / demo123456)
npm run dev      # Starts server on http://127.0.0.1:5000
```

### 3. Start the Frontend (Terminal 2)
```sh
cd Client
npm install

# For web browser view:
npm run dev      # Opens on http://127.0.0.1:5173

# Or for macOS desktop app (Electron):
npm run desktop
```

To build a macOS distributable `.dmg` disk image:
```sh
cd Client
npm run dist:mac
```

---

## Authentication & API Endpoints

### Public Endpoints:
- `GET /api/health` — API and MongoDB connection status.
- `POST /api/auth/register` — Register a new account (`name`, `email`, `password`).
- `POST /api/auth/login` — Sign in and receive a JWT token (`email`, `password`).

### Protected Endpoints (Requires `Authorization: Bearer <token>`):
- `GET /api/auth/me` — Retrieve the authenticated user profile.
- `POST /api/demo/seed` — Seed demo inventory into the authenticated user's private space.
- `GET /api/assets` — List user's inventory items (supports category, status, and text search).
- `POST /api/assets` — Add a new item to user's collection.
- `GET /api/assets/:id` — View details of a specific item (scoped to owner).
- `PATCH /api/assets/:id` — Update details of a specific item (scoped to owner).
- `DELETE /api/assets/:id` — Delete an item and its associated service records (scoped to owner).
- `GET /api/service-logs` — List user's maintenance and repair records.
- `POST /api/service-logs` — Record a maintenance visit for an item owned by the user.
- `PATCH /api/service-logs/:id` — Update a maintenance record (scoped to owner).
- `DELETE /api/service-logs/:id` — Delete a maintenance record (scoped to owner).

---

## Testing

### Automated Backend Tests
Run the automated test suite verifying password hashing, JWT validation, protected routes, and cross-account data isolation:

```sh
cd Server
npm test
```

### Frontend Build & Lint Verification
Verify that the React frontend builds for production and adheres to code styling without warnings or errors:

```sh
cd Client
npm run lint
npm run build
```

### Manual Testing Checklist
1. **Registration**: Open the app, switch to **Create account**, enter your details, and register. You will automatically receive a token and land on the dashboard.
2. **Login & Error Handling**: Sign out, enter an incorrect password, and verify the error alert. Sign in with correct credentials to enter your household space.
3. **Demo Account**: Sign in using `demo@keepwise.local` and password `demo123456` to inspect pre-loaded demo items.
4. **Data Isolation**: Register a second account in another browser window/tab; notice that inventory is completely blank and independent. Items created by User A cannot be seen, edited, or deleted by User B.
5. **Token Expiration / Protected Routes**: Make an unauthorized request to `/api/assets` without a Bearer token; verify that the server returns `401 Unauthorized`.

---

## GitHub Submission Instructions

To push this project to your GitHub repository:

```sh
# 1. Initialize git if not already initialized
git init

# 2. Check status to verify that node_modules, dist, and .env are ignored
git status

# 3. Add all files
git add .

# 4. Commit your changes
git commit -m "Implement JWT authentication, MongoDB integration, and user-data isolation for Keepwise"

# 5. Rename default branch to main (if needed)
git branch -M main

# 6. Add your GitHub remote repository URL
git remote add origin https://github.com/<your-username>/<your-repo-name>.git

# 7. Push to GitHub
git push -u origin main
```

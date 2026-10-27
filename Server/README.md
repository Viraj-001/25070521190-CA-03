# Keepwise Server

Express API using the MongoDB Node.js driver with JWT authentication and bcrypt password hashing.

## Setup

1. Copy `.env.example` to `.env`:
   ```sh
   cp .env.example .env
   ```
2. Configure `JWT_SECRET` in `.env`.
3. Make sure MongoDB is running on `mongodb://127.0.0.1:27017`.
4. Install dependencies and start the server:
   ```sh
   npm install
   npm run seed
   npm run dev
   ```

## Automated Testing

Run the automated test suite verifying auth endpoints, protected routes, and user data isolation:

```sh
npm test
```

## Collections

- `users`: User profiles with `email`, `name`, and `passwordHash`.
- `assets`: Household items scoped by `userId`.
- `serviceLogs`: Repair and maintenance records scoped by `userId`.

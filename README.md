# Keepwise

Keepwise is a Mac desktop app for household item details, warranties, service reminders, and repair history.

## Folders

- `Client/` — React app and Electron desktop shell
- `Server/` — Node.js API and MongoDB connection

## Start the project

For this Mac, double-click `Start Keepwise.command`. It starts the local MongoDB database, loads the demo records, starts the API, and opens Keepwise in a desktop window. Leave the Terminal window it opens running while you use the app.

The project uses a local MongoDB Community Server. MongoDB Compass can connect to `mongodb://127.0.0.1:27017` to inspect the `keepwise` database.

## Run it manually

Install Node.js 20.19+ or 22.12+ and MongoDB Community Server, then use two Terminal windows. In the first:

```sh
cd Server
cp .env.example .env
npm install
npm run seed
npm run dev
```

In the second:

```sh
cd Client
npm install
npm run desktop
```

Build a Mac disk image from `Client/` with `npm run dist:mac`.

## GitHub

Upload the `Client/` and `Server/` folders plus this `README.md` and `.gitignore`. The ignore file excludes generated dependencies, build output, local database files, `.env`, archives, and the earlier duplicate project folders.

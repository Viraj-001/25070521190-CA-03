# Keepwise server

Express API using the MongoDB Node.js driver. Copy `.env.example` to `.env`, make sure MongoDB is running, then run:

```sh
npm install
npm run seed
npm run dev
```

The server creates and uses the `keepwise` database with `assets` and `serviceLogs` collections. The desktop client connects to this local API at `http://127.0.0.1:5000`.

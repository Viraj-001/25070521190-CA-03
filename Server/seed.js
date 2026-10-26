require('dotenv').config();

const { MongoClient } = require('mongodb');
const { seedDatabase } = require('./seedData');

const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017');
const dbName = process.env.MONGODB_DB || 'keepwise';

async function run() {
  try {
    await client.connect();
    const result = await seedDatabase(client.db(dbName));
    console.log(result.message);
  } finally { await client.close(); }
}
run().catch(error => { console.error(`Could not seed Keepwise: ${error.message}`); process.exitCode = 1; });

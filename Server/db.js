const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const databaseName = process.env.MONGODB_DB || 'keepwise';
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
let database = null;
let connectionState = 'disconnected';

async function connectDatabase() {
  try {
    await client.connect();
    database = client.db(databaseName);
    await database.command({ ping: 1 });
    connectionState = 'connected';
    console.log(`MongoDB connected: ${databaseName}`);
  } catch (error) {
    database = null;
    connectionState = 'disconnected';
    console.error(`MongoDB is not available: ${error.message}`);
    console.error('Check that MongoDB is running and MONGODB_URI in server/.env is correct. Retrying in 5 seconds.');
    setTimeout(connectDatabase, 5000).unref();
  }
}

function getDatabase() {
  if (!database) {
    const error = new Error('MongoDB is not connected. Start MongoDB and check server/.env.');
    error.status = 503;
    throw error;
  }
  return database;
}

function getConnectionState() { return connectionState; }
async function closeDatabase() { await client.close().catch(() => {}); }

module.exports = { connectDatabase, getDatabase, getConnectionState, closeDatabase, databaseName };

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { ObjectId } = require('mongodb');
const { connectDatabase, getDatabase, getConnectionState, closeDatabase, databaseName } = require('./db');
const { seedDatabase } = require('./seedData');

const app = express();
const port = Number(process.env.PORT || 5000);
// The app is local-only. Allow the Vite preview origin and Electron's file origin.
app.use(cors({ origin: ['http://127.0.0.1:5173', 'http://localhost:5173', 'null'] }));
app.use(express.json({ limit: '1mb' }));

function cleanAsset(doc) { return { ...doc, _id: doc._id.toString() }; }
function cleanLog(doc) { return { ...doc, _id: doc._id.toString() }; }
function validId(id) { return ObjectId.isValid(id) && String(new ObjectId(id)) === id; }
function validDate(value, optional = false) {
  if (optional && (value === '' || value == null)) return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function assetFields(body, partial = false) {
  const fields = ['name', 'category', 'brand', 'model', 'purchaseDate', 'warrantyEnd', 'purchasePrice', 'nextServiceDate', 'notes', 'status', 'photo'];
  const result = {};
  for (const field of fields) if (Object.hasOwn(body, field)) result[field] = body[field];
  if (!partial && (!String(result.name || '').trim() || !String(result.category || '').trim())) {
    const error = new Error('Item name and category are required.'); error.status = 400; throw error;
  }
  for (const key of ['purchaseDate', 'warrantyEnd', 'nextServiceDate']) {
    if (Object.hasOwn(result, key) && !validDate(result[key], true)) { const error = new Error(`${key} must be a valid date.`); error.status = 400; throw error; }
  }
  if (Object.hasOwn(result, 'purchasePrice')) {
    result.purchasePrice = Number(result.purchasePrice || 0);
    if (!Number.isFinite(result.purchasePrice) || result.purchasePrice < 0) { const error = new Error('Purchase price must be zero or more.'); error.status = 400; throw error; }
  }
  if (Object.hasOwn(result, 'name')) result.name = String(result.name).trim();
  return result;
}

app.get('/api/health', async (_req, res) => {
  let state = getConnectionState();
  if (state === 'connected') {
    try { await getDatabase().command({ ping: 1 }); }
    catch { state = 'disconnected'; }
  }
  res.json({ ok: true, api: 'connected', database: state, databaseName, message: state === 'connected' ? 'Keepwise is connected to MongoDB.' : 'API is running. Start MongoDB to load Keepwise data.' });
});

app.post('/api/demo/seed', async (_req, res, next) => {
  try { res.json(await seedDatabase(getDatabase())); }
  catch (error) { next(error); }
});

app.get('/api/assets', async (req, res, next) => {
  try {
    const db = getDatabase();
    const filter = {};
    if (req.query.category && req.query.category !== 'All categories') filter.category = req.query.category;
    if (req.query.status && req.query.status !== 'All items') filter.status = req.query.status;
    if (req.query.q) {
      const query = String(req.query.q).slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = ['name', 'brand', 'model', 'category'].map(key => ({ [key]: { $regex: query, $options: 'i' } }));
    }
    const docs = await db.collection('assets').find(filter).sort({ updatedAt: -1, name: 1 }).toArray();
    res.json(docs.map(cleanAsset));
  } catch (error) { next(error); }
});

app.get('/api/assets/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid item id.' });
    const item = await getDatabase().collection('assets').findOne({ _id: new ObjectId(req.params.id) });
    if (!item) return res.status(404).json({ error: 'Item not found.' });
    res.json(cleanAsset(item));
  } catch (error) { next(error); }
});

app.post('/api/assets', async (req, res, next) => {
  try {
    const values = assetFields(req.body);
    const now = new Date().toISOString();
    const asset = { ...values, status: values.status || 'Active', createdAt: now, updatedAt: now };
    const result = await getDatabase().collection('assets').insertOne(asset);
    res.status(201).json(cleanAsset({ _id: result.insertedId, ...asset }));
  } catch (error) { next(error); }
});

app.patch('/api/assets/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid item id.' });
    const values = assetFields(req.body, true);
    if (!Object.keys(values).length) return res.status(400).json({ error: 'No item details were provided.' });
    values.updatedAt = new Date().toISOString();
    const result = await getDatabase().collection('assets').findOneAndUpdate({ _id: new ObjectId(req.params.id) }, { $set: values }, { returnDocument: 'after' });
    const item = result && result._id ? result : result?.value;
    if (!item) return res.status(404).json({ error: 'Item not found.' });
    res.json(cleanAsset(item));
  } catch (error) { next(error); }
});

app.delete('/api/assets/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid item id.' });
    const db = getDatabase(); const id = new ObjectId(req.params.id);
    const result = await db.collection('assets').deleteOne({ _id: id });
    if (!result.deletedCount) return res.status(404).json({ error: 'Item not found.' });
    await db.collection('serviceLogs').deleteMany({ assetId: req.params.id });
    res.json({ deleted: true });
  } catch (error) { next(error); }
});

app.get('/api/service-logs', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.assetId) filter.assetId = String(req.query.assetId);
    const docs = await getDatabase().collection('serviceLogs').find(filter).sort({ serviceDate: -1, createdAt: -1 }).limit(250).toArray();
    res.json(docs.map(cleanLog));
  } catch (error) { next(error); }
});

app.post('/api/service-logs', async (req, res, next) => {
  try {
    const body = req.body || {};
    if (!validId(body.assetId)) return res.status(400).json({ error: 'Choose a valid item.' });
    if (!String(body.title || '').trim()) return res.status(400).json({ error: 'Add a short repair or service title.' });
    if (!validDate(body.serviceDate)) return res.status(400).json({ error: 'Enter a valid service date.' });
    if (!validDate(body.nextServiceDate, true)) return res.status(400).json({ error: 'Next service date must be valid.' });
    const db = getDatabase(); const assetId = String(body.assetId);
    const asset = await db.collection('assets').findOne({ _id: new ObjectId(assetId) });
    if (!asset) return res.status(404).json({ error: 'Item not found.' });
    const cost = Number(body.cost || 0);
    if (!Number.isFinite(cost) || cost < 0) return res.status(400).json({ error: 'Cost must be zero or more.' });
    const now = new Date().toISOString();
    const log = { assetId, assetName: asset.name, title: String(body.title).trim(), serviceDate: body.serviceDate, cost, provider: String(body.provider || '').trim(), notes: String(body.notes || '').trim(), nextServiceDate: body.nextServiceDate || '', createdAt: now, updatedAt: now };
    const result = await db.collection('serviceLogs').insertOne(log);
    if (log.nextServiceDate) await db.collection('assets').updateOne({ _id: new ObjectId(assetId) }, { $set: { nextServiceDate: log.nextServiceDate, updatedAt: now } });
    res.status(201).json(cleanLog({ _id: result.insertedId, ...log }));
  } catch (error) { next(error); }
});

app.patch('/api/service-logs/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid service record id.' });
    const allowed = ['title', 'serviceDate', 'cost', 'provider', 'notes', 'nextServiceDate']; const values = {};
    for (const key of allowed) if (Object.hasOwn(req.body, key)) values[key] = req.body[key];
    if (!Object.keys(values).length) return res.status(400).json({ error: 'No service details were provided.' });
    if (Object.hasOwn(values, 'serviceDate') && !validDate(values.serviceDate)) return res.status(400).json({ error: 'Enter a valid service date.' });
    if (Object.hasOwn(values, 'nextServiceDate') && !validDate(values.nextServiceDate, true)) return res.status(400).json({ error: 'Next service date must be valid.' });
    if (Object.hasOwn(values, 'cost')) { values.cost = Number(values.cost); if (!Number.isFinite(values.cost) || values.cost < 0) return res.status(400).json({ error: 'Cost must be zero or more.' }); }
    if (Object.hasOwn(values, 'title')) values.title = String(values.title).trim();
    values.updatedAt = new Date().toISOString();
    const result = await getDatabase().collection('serviceLogs').findOneAndUpdate({ _id: new ObjectId(req.params.id) }, { $set: values }, { returnDocument: 'after' });
    const log = result && result._id ? result : result?.value;
    if (!log) return res.status(404).json({ error: 'Service record not found.' });
    if (Object.hasOwn(values, 'nextServiceDate')) await getDatabase().collection('assets').updateOne({ _id: new ObjectId(log.assetId) }, { $set: { nextServiceDate: log.nextServiceDate || '', updatedAt: values.updatedAt } });
    res.json(cleanLog(log));
  } catch (error) { next(error); }
});

app.delete('/api/service-logs/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid service record id.' });
    const result = await getDatabase().collection('serviceLogs').deleteOne({ _id: new ObjectId(req.params.id) });
    if (!result.deletedCount) return res.status(404).json({ error: 'Service record not found.' });
    res.json({ deleted: true });
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.status || 500).json({ error: error.status ? error.message : 'Something went wrong. Please try again.' });
});

app.listen(port, '127.0.0.1', () => {
  console.log(`Keepwise API ready at http://127.0.0.1:${port}`);
  connectDatabase();
});

async function shutdown() { await closeDatabase(); process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

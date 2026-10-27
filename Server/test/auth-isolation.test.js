const assert = require('node:assert/strict');
const test = require('node:test');
const { ObjectId } = require('mongodb');
const { hashPassword, comparePassword, generateToken, verifyToken, JWT_SECRET } = require('../auth');
const { setDatabaseForTesting } = require('../db');
const app = require('../server');

// In-memory MongoDB collection mock for isolated deterministic tests
function createMockCollection() {
  const docs = [];

  function matches(doc, filter) {
    if (!filter || Object.keys(filter).length === 0) return true;
    for (const [key, val] of Object.entries(filter)) {
      if (key === '$or' && Array.isArray(val)) {
        if (!val.some(sub => matches(doc, sub))) return false;
      } else if (key === '$and' && Array.isArray(val)) {
        if (!val.every(sub => matches(doc, sub))) return false;
      } else if (key === '_id') {
        const docId = doc._id instanceof ObjectId ? doc._id.toString() : String(doc._id);
        const filterId = val instanceof ObjectId ? val.toString() : String(val);
        if (docId !== filterId) return false;
      } else if (val && typeof val === 'object' && val.$regex) {
        const regex = new RegExp(val.$regex, val.$options || '');
        if (!regex.test(String(doc[key] || ''))) return false;
      } else {
        if (doc[key] !== val) return false;
      }
    }
    return true;
  }

  return {
    docs,
    async insertOne(item) {
      const inserted = { ...item, _id: item._id || new ObjectId() };
      docs.push(inserted);
      return { insertedId: inserted._id };
    },
    async insertMany(items) {
      const insertedIds = {};
      items.forEach((item, idx) => {
        const inserted = { ...item, _id: item._id || new ObjectId() };
        docs.push(inserted);
        insertedIds[idx] = inserted._id;
      });
      return { insertedIds };
    },
    async findOne(filter) {
      const found = docs.find(d => matches(d, filter));
      return found ? JSON.parse(JSON.stringify(found)) : null;
    },
    find(filter = {}) {
      let filtered = docs.filter(d => matches(d, filter));
      const cursor = {
        sort() { return cursor; },
        limit(n) { filtered = filtered.slice(0, n); return cursor; },
        async toArray() { return JSON.parse(JSON.stringify(filtered)); }
      };
      return cursor;
    },
    async findOneAndUpdate(filter, update, _opts) {
      const idx = docs.findIndex(d => matches(d, filter));
      if (idx === -1) return null;
      if (update.$set) {
        docs[idx] = { ...docs[idx], ...update.$set };
      }
      return JSON.parse(JSON.stringify(docs[idx]));
    },
    async updateOne(filter, update) {
      const idx = docs.findIndex(d => matches(d, filter));
      if (idx !== -1 && update.$set) {
        docs[idx] = { ...docs[idx], ...update.$set };
        return { modifiedCount: 1 };
      }
      return { modifiedCount: 0 };
    },
    async deleteOne(filter) {
      const idx = docs.findIndex(d => matches(d, filter));
      if (idx !== -1) {
        docs.splice(idx, 1);
        return { deletedCount: 1 };
      }
      return { deletedCount: 0 };
    },
    async deleteMany(filter) {
      const initial = docs.length;
      for (let i = docs.length - 1; i >= 0; i--) {
        if (matches(docs[i], filter)) docs.splice(i, 1);
      }
      return { deletedCount: initial - docs.length };
    },
    async countDocuments(filter = {}) {
      return docs.filter(d => matches(d, filter)).length;
    },
    async createIndex() {
      return 'index_created';
    }
  };
}

function createMockDatabase() {
  const collections = {
    users: createMockCollection(),
    assets: createMockCollection(),
    serviceLogs: createMockCollection()
  };
  return {
    collection(name) {
      if (!collections[name]) collections[name] = createMockCollection();
      return collections[name];
    },
    async command(cmd) {
      if (cmd.ping) return { ok: 1 };
      return { ok: 1 };
    }
  };
}

let server;
let baseUrl;

test.before(async () => {
  const mockDb = createMockDatabase();
  setDatabaseForTesting(mockDb);

  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

// Helper request wrapper
async function req(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

test('Auth utilities: hashing, verification, token generation', async () => {
  const password = 'mySuperSecretPassword123';
  const hash = await hashPassword(password);
  assert.notEqual(hash, password, 'Hash should not equal plain password');

  const matches = await comparePassword(password, hash);
  assert.equal(matches, true, 'Correct password must verify');

  const invalid = await comparePassword('wrongpassword', hash);
  assert.equal(invalid, false, 'Wrong password must be rejected');

  const token = generateToken({ userId: 'u123', email: 'test@example.com', name: 'Tester' });
  assert.ok(typeof token === 'string' && token.length > 20, 'Token generated');

  const decoded = verifyToken(token);
  assert.equal(decoded.userId, 'u123');
  assert.equal(decoded.email, 'test@example.com');
  assert.equal(decoded.name, 'Tester');
});

test('Health check endpoint is open and healthy', async () => {
  const res = await req('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.data.ok, true);
  assert.equal(res.data.database, 'connected');
});

test('User registration validation and creation', async () => {
  // Missing name
  const res1 = await req('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: 'user1@test.com', password: 'password123' })
  });
  assert.equal(res1.status, 400);

  // Invalid email
  const res2 = await req('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'User One', email: 'not-an-email', password: 'password123' })
  });
  assert.equal(res2.status, 400);

  // Short password (< 6 chars)
  const res3 = await req('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'User One', email: 'user1@test.com', password: '123' })
  });
  assert.equal(res3.status, 400);

  // Successful registration
  const res4 = await req('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'User One', email: 'user1@test.com', password: 'password123' })
  });
  assert.equal(res4.status, 201);
  assert.ok(res4.data.token, 'Should return JWT token');
  assert.equal(res4.data.user.email, 'user1@test.com');
  assert.equal(res4.data.user.name, 'User One');

  // Duplicate registration with same email (case-insensitive)
  const res5 = await req('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Another One', email: 'USER1@test.com', password: 'password123' })
  });
  assert.equal(res5.status, 409, 'Should return 409 Conflict for existing email');
});

test('User login and invalid credential handling', async () => {
  // Non-existent user
  const res1 = await req('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'ghost@test.com', password: 'password123' })
  });
  assert.equal(res1.status, 401);
  assert.equal(res1.data.error, 'Invalid email or password.');

  // Wrong password
  const res2 = await req('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'user1@test.com', password: 'wrongpassword' })
  });
  assert.equal(res2.status, 401);
  assert.equal(res2.data.error, 'Invalid email or password.');

  // Correct credentials
  const res3 = await req('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'user1@test.com', password: 'password123' })
  });
  assert.equal(res3.status, 200);
  assert.ok(res3.data.token, 'Should return token');
  assert.equal(res3.data.user.email, 'user1@test.com');
});

test('Protected routes reject missing, invalid, or expired tokens', async () => {
  // No token
  const res1 = await req('/api/auth/me');
  assert.equal(res1.status, 401);

  const res2 = await req('/api/assets');
  assert.equal(res2.status, 401);

  const res3 = await req('/api/service-logs');
  assert.equal(res3.status, 401);

  // Invalid token format
  const res4 = await req('/api/assets', {
    headers: { Authorization: 'Bearer this-is-not-a-valid-jwt' }
  });
  assert.equal(res4.status, 401);

  // Malformed header
  const res5 = await req('/api/assets', {
    headers: { Authorization: 'Basic dXNlcjpwYXNz' }
  });
  assert.equal(res5.status, 401);
});

test('Complete User Data Isolation between two accounts', async () => {
  // 1. Register User A
  const regA = await req('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Alice', email: 'alice@test.com', password: 'password123' })
  });
  assert.equal(regA.status, 201);
  const tokenA = regA.data.token;

  // 2. Register User B
  const regB = await req('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Bob', email: 'bob@test.com', password: 'password123' })
  });
  assert.equal(regB.status, 201);
  const tokenB = regB.data.token;

  // 3. User A creates an asset
  const createAssetA = await req('/api/assets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({
      name: 'Alice MacBook',
      category: 'Technology',
      brand: 'Apple',
      model: 'M3 Max',
      purchasePrice: 200000
    })
  });
  assert.equal(createAssetA.status, 201);
  const assetAId = createAssetA.data._id;
  assert.ok(assetAId);

  // 4. User B creates an asset
  const createAssetB = await req('/api/assets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({
      name: 'Bob Coffee Maker',
      category: 'Appliances',
      brand: 'Breville',
      model: 'Barista Touch',
      purchasePrice: 65000
    })
  });
  assert.equal(createAssetB.status, 201);
  const assetBId = createAssetB.data._id;
  assert.ok(assetBId);

  // 5. User A lists assets -> must ONLY see Alice MacBook
  const listA = await req('/api/assets', {
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  assert.equal(listA.status, 200);
  assert.equal(listA.data.length, 1);
  assert.equal(listA.data[0].name, 'Alice MacBook');

  // 6. User B lists assets -> must ONLY see Bob Coffee Maker
  const listB = await req('/api/assets', {
    headers: { Authorization: `Bearer ${tokenB}` }
  });
  assert.equal(listB.status, 200);
  assert.equal(listB.data.length, 1);
  assert.equal(listB.data[0].name, 'Bob Coffee Maker');

  // 7. User B tries to view User A's asset -> 404
  const getOther = await req(`/api/assets/${assetAId}`, {
    headers: { Authorization: `Bearer ${tokenB}` }
  });
  assert.equal(getOther.status, 404);

  // 8. User B tries to update User A's asset -> 404
  const patchOther = await req(`/api/assets/${assetAId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({ name: 'Hacked Name' })
  });
  assert.equal(patchOther.status, 404);

  // 9. User B tries to delete User A's asset -> 404
  const deleteOther = await req(`/api/assets/${assetAId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${tokenB}` }
  });
  assert.equal(deleteOther.status, 404);

  // 10. Verify User A's asset is unchanged
  const verifyA = await req(`/api/assets/${assetAId}`, {
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  assert.equal(verifyA.status, 200);
  assert.equal(verifyA.data.name, 'Alice MacBook');

  // 11. User A adds a service log
  const createLogA = await req('/api/service-logs', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({
      assetId: assetAId,
      title: 'Screen cleaning',
      serviceDate: '2026-05-10',
      cost: 500
    })
  });
  assert.equal(createLogA.status, 201);
  const logAId = createLogA.data._id;

  // 12. User B tries to attach service log to User A's asset -> 404
  const createLogUnauthorized = await req('/api/service-logs', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({
      assetId: assetAId,
      title: 'Malicious repair',
      serviceDate: '2026-05-11',
      cost: 9999
    })
  });
  assert.equal(createLogUnauthorized.status, 404);

  // 13. User B lists service logs -> empty
  const listLogsB = await req('/api/service-logs', {
    headers: { Authorization: `Bearer ${tokenB}` }
  });
  assert.equal(listLogsB.status, 200);
  assert.equal(listLogsB.data.length, 0);

  // 14. User B tries to edit or delete User A's service log -> 404
  const patchLogOther = await req(`/api/service-logs/${logAId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({ cost: 9999 })
  });
  assert.equal(patchLogOther.status, 404);

  const deleteLogOther = await req(`/api/service-logs/${logAId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${tokenB}` }
  });
  assert.equal(deleteLogOther.status, 404);

  // 15. User A deletes asset -> cascades to delete service log
  const deleteAssetA = await req(`/api/assets/${assetAId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  assert.equal(deleteAssetA.status, 200);

  const listLogsA = await req('/api/service-logs', {
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  assert.equal(listLogsA.data.length, 0, 'Service log should be cascade deleted');
});

test('User-scoped sample data seeding', async () => {
  const regC = await req('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Charlie', email: 'charlie@test.com', password: 'password123' })
  });
  assert.equal(regC.status, 201);
  const tokenC = regC.data.token;

  // Initially Charlie has 0 items
  const initialItems = await req('/api/assets', {
    headers: { Authorization: `Bearer ${tokenC}` }
  });
  assert.equal(initialItems.data.length, 0);

  // Call seed
  const seedRes = await req('/api/demo/seed', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenC}` }
  });
  assert.equal(seedRes.status, 200);
  assert.equal(seedRes.data.seeded, true);

  // Now Charlie has 6 items
  const seededItems = await req('/api/assets', {
    headers: { Authorization: `Bearer ${tokenC}` }
  });
  assert.equal(seededItems.data.length, 6);

  // Calling seed again leaves items unchanged
  const seedAgain = await req('/api/demo/seed', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenC}` }
  });
  assert.equal(seedAgain.data.seeded, false);
});

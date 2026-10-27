const { hashPassword } = require('./auth');

function dayOffset(days) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

async function seedDatabase(db, userId = null) {
  const assets = db.collection('assets');
  const serviceLogsCol = db.collection('serviceLogs');
  const users = db.collection('users');

  let targetUserId = userId;

  // If no userId provided (CLI seeding), ensure a default demo user exists
  if (!targetUserId) {
    let demoUser = await users.findOne({ email: 'demo@keepwise.local' });
    if (!demoUser) {
      const passwordHash = await hashPassword('demo123456');
      const now = new Date().toISOString();
      const insertResult = await users.insertOne({
        name: 'Demo Household',
        email: 'demo@keepwise.local',
        passwordHash,
        createdAt: now,
        updatedAt: now
      });
      targetUserId = insertResult.insertedId.toString();
    } else {
      targetUserId = demoUser._id.toString();
    }
  }

  const query = { userId: targetUserId };
  const existingCount = await assets.countDocuments(query);
  if (existingCount > 0) {
    return {
      seeded: false,
      message: 'Your inventory already has items; existing data was left unchanged.'
    };
  }

  const now = new Date().toISOString();
  const records = [
    { userId: targetUserId, name: 'MacBook Air 13”', category: 'Technology', brand: 'Apple', model: 'MacBook Air M3', purchaseDate: dayOffset(-349), warrantyEnd: dayOffset(16), purchasePrice: 129900, nextServiceDate: dayOffset(84), status: 'Active', notes: 'Keep the purchase invoice with the laptop box.', createdAt: now, updatedAt: now },
    { userId: targetUserId, name: 'iPhone 15', category: 'Technology', brand: 'Apple', model: 'iPhone 15 · 128 GB', purchaseDate: dayOffset(-211), warrantyEnd: dayOffset(154), purchasePrice: 69900, nextServiceDate: '', status: 'Active', notes: 'Battery health checked during last service.', createdAt: now, updatedAt: now },
    { userId: targetUserId, name: 'Front-load washer', category: 'Appliances', brand: 'Bosch', model: 'Series 6 · 8 kg', purchaseDate: dayOffset(-531), warrantyEnd: dayOffset(199), purchasePrice: 38990, nextServiceDate: dayOffset(9), status: 'Active', notes: 'Annual filter and drum check.', createdAt: now, updatedAt: now },
    { userId: targetUserId, name: 'City bicycle', category: 'Transport', brand: 'Trek', model: 'FX 2 Disc', purchaseDate: dayOffset(-731), warrantyEnd: dayOffset(-96), purchasePrice: 62500, nextServiceDate: dayOffset(-4), status: 'Active', notes: 'Frame warranty details saved in the original booklet.', createdAt: now, updatedAt: now },
    { userId: targetUserId, name: 'Cordless vacuum', category: 'Home', brand: 'Dyson', model: 'V8 Absolute', purchaseDate: dayOffset(-444), warrantyEnd: dayOffset(286), purchasePrice: 45900, nextServiceDate: dayOffset(48), status: 'Active', notes: 'Replace filter if suction drops.', createdAt: now, updatedAt: now },
    { userId: targetUserId, name: 'Espresso machine', category: 'Appliances', brand: 'De’Longhi', model: 'Dedica Style', purchaseDate: dayOffset(-88), warrantyEnd: dayOffset(277), purchasePrice: 21990, nextServiceDate: dayOffset(95), status: 'Active', notes: 'Descale every three months.', createdAt: now, updatedAt: now }
  ];

  const inserted = await assets.insertMany(records);
  const ids = Object.values(inserted.insertedIds).map(String);

  const logs = [
    { userId: targetUserId, assetId: ids[0], assetName: records[0].name, title: 'Keyboard inspection', serviceDate: dayOffset(-53), cost: 0, provider: 'Apple service desk', notes: 'Keys checked and cleaned. No parts needed.', nextServiceDate: '', createdAt: now, updatedAt: now },
    { userId: targetUserId, assetId: ids[2], assetName: records[2].name, title: 'Inlet filter cleaned', serviceDate: dayOffset(-170), cost: 1200, provider: 'HomeCare Services', notes: 'Routine filter cleaning and hose inspection.', nextServiceDate: dayOffset(9), createdAt: now, updatedAt: now },
    { userId: targetUserId, assetId: ids[3], assetName: records[3].name, title: 'Brake pads replaced', serviceDate: dayOffset(-93), cost: 1800, provider: 'Pedal Works', notes: 'Front and rear pads replaced; next check after 500 km.', nextServiceDate: dayOffset(-4), createdAt: now, updatedAt: now },
    { userId: targetUserId, assetId: ids[5], assetName: records[5].name, title: 'First descale', serviceDate: dayOffset(-21), cost: 450, provider: 'Home maintenance', notes: 'Descaling solution used; machine working normally.', nextServiceDate: dayOffset(95), createdAt: now, updatedAt: now }
  ];

  await serviceLogsCol.insertMany(logs);
  return {
    seeded: true,
    assets: records.length,
    serviceLogs: logs.length,
    message: 'Sample items and service records added.'
  };
}

module.exports = { seedDatabase };

const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const dbDir = path.join(__dirname, "data");
const dbPath = process.env.DB_PATH || path.join(dbDir, "tenderopro.db");

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function ensureColumn(tableName, columnSql) {
  const nameMatch = columnSql.match(/\b([A-Za-z_][A-Za-z0-9_]*)\s/);
  if (!nameMatch) return;
  const columnName = nameMatch[1];
  const info = await all(`PRAGMA table_info(${tableName})`);
  const exists = info.some((column) => column.name === columnName);
  if (!exists) {
    await run(`ALTER TABLE ${tableName} ADD COLUMN ${columnSql}`);
  }
}

async function initializeDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      active INTEGER DEFAULT 1,
      must_change_password INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      permission TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(role, permission)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      sku TEXT UNIQUE NOT NULL,
      barcode TEXT,
      name TEXT NOT NULL,
      brand TEXT,
      category TEXT,
      supplier TEXT,
      purchase_price REAL DEFAULT 0,
      sale_price REAL DEFAULT 0,
      stock INTEGER DEFAULT 0,
      min_stock INTEGER DEFAULT 0,
      max_stock INTEGER DEFAULT 0,
      unit TEXT DEFAULT 'und',
      description TEXT,
      margin REAL DEFAULT 0,
      vat REAL DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      whatsapp TEXT,
      nit TEXT,
      email TEXT,
      address TEXT,
      contact TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS purchases (
      id TEXT PRIMARY KEY,
      supplier_id TEXT,
      invoice_number TEXT,
      date TEXT NOT NULL,
      subtotal REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      tax REAL DEFAULT 0,
      total REAL DEFAULT 0,
      payment_method TEXT,
      status TEXT DEFAULT 'completed',
      created_by TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS purchase_items (
      id TEXT PRIMARY KEY,
      purchase_id TEXT NOT NULL,
      product_id TEXT,
      product_name TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      cost_price REAL DEFAULT 0,
      total REAL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (purchase_id) REFERENCES purchases(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      type TEXT NOT NULL,
      quantity INTEGER DEFAULT 0,
      reason TEXT,
      reference TEXT,
      user_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      whatsapp TEXT,
      address TEXT,
      family_contact TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      subtotal REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      total REAL DEFAULT 0,
      received REAL DEFAULT 0,
      change_amount REAL DEFAULT 0,
      payment_json TEXT,
      status TEXT DEFAULT 'completed',
      user_id TEXT,
      created_by TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS sale_items (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL,
      product_id TEXT,
      name TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      price REAL DEFAULT 0,
      FOREIGN KEY (sale_id) REFERENCES sales(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS returns (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL,
      product_id TEXT,
      product_name TEXT NOT NULL,
      quantity INTEGER DEFAULT 0,
      reason TEXT,
      amount REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      approved_by TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (sale_id) REFERENCES sales(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS debts (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      amount REAL DEFAULT 0,
      balance REAL DEFAULT 0,
      concept TEXT,
      status TEXT DEFAULT 'pendiente',
      created_at TEXT NOT NULL,
      FOREIGN KEY (client_id) REFERENCES clients(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS debt_payments (
      id TEXT PRIMARY KEY,
      debt_id TEXT NOT NULL,
      amount REAL DEFAULT 0,
      method TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (debt_id) REFERENCES debts(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS apartados (
      id TEXT PRIMARY KEY,
      client_id TEXT,
      product_name TEXT NOT NULL,
      total_amount REAL DEFAULT 0,
      total_paid REAL DEFAULT 0,
      status TEXT DEFAULT 'activo',
      due_date TEXT,
      created_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS apartado_payments (
      id TEXT PRIMARY KEY,
      apartado_id TEXT NOT NULL,
      amount REAL DEFAULT 0,
      type TEXT DEFAULT 'abono',
      created_by TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (apartado_id) REFERENCES apartados(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      amount REAL DEFAULT 0,
      concept TEXT NOT NULL,
      date TEXT,
      method TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS cash_sessions (
      id TEXT PRIMARY KEY,
      open INTEGER DEFAULT 0,
      opened_by TEXT,
      opened_at TEXT,
      base REAL DEFAULT 0,
      total_sales REAL DEFAULT 0,
      total_expenses REAL DEFAULT 0,
      last_closed_at TEXT,
      closed_by TEXT,
      cash_counted REAL DEFAULT 0,
      difference REAL DEFAULT 0,
      status TEXT DEFAULT 'closed'
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS cash_movements (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      type TEXT NOT NULL,
      category TEXT,
      amount REAL DEFAULT 0,
      concept TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES cash_sessions(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      username TEXT,
      action TEXT NOT NULL,
      entity TEXT,
      entity_id TEXT,
      details TEXT,
      created_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      store_name TEXT,
      store_phone TEXT,
      store_address TEXT,
      currency TEXT,
      interest_rate REAL,
      due_days INTEGER,
      tax_rate REAL,
      payment_methods TEXT,
      updated_at TEXT
    )
  `);

  await ensureColumn("products", "description TEXT");
  await ensureColumn("products", "margin REAL DEFAULT 0");
  await ensureColumn("products", "vat REAL DEFAULT 0");
  await ensureColumn("products", "active INTEGER DEFAULT 1");
  await ensureColumn("users", "must_change_password INTEGER DEFAULT 1");
  await ensureColumn("users", "last_login TEXT");
  await ensureColumn("sales", "user_id TEXT");
  await ensureColumn("sales", "created_by TEXT");
  await ensureColumn("expenses", "created_by TEXT");
  await ensureColumn("cash_sessions", "status TEXT DEFAULT 'closed'");
  await ensureColumn("debt_payments", "method TEXT");
  await ensureColumn("debt_payments", "created_by TEXT");
  await ensureColumn("apartado_payments", "created_by TEXT");

  await run(`
    CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku)
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at)
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_clients_active ON clients(active)
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_debts_status ON debts(status)
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_apartados_status ON apartados(status)
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(supplier_id)
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_inventory_movements_product ON inventory_movements(product_id)
  `);
}

module.exports = {
  db,
  run,
  get,
  all,
  initializeDb,
  ensureColumn,
  dbPath
};

// Ensure DB is initialized on module load to support tests and scripts that import DB directly
initializeDb().catch((err) => {
  console.error('initializeDb failed:', err);
});

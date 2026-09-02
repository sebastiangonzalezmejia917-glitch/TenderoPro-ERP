require("dotenv").config();
const express = require("express");
const cors = require("cors");
const os = require("os");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
const helmet = require("helmet");
const { db, run, get, all, initializeDb } = require("./db");

const app = express();
const PORT = Number(process.env.PORT || 3001);
const JWT_SECRET = process.env.JWT_SECRET || "tenderopro-dev-secret";

app.use(express.json({ limit: "16mb" }));

// Restrict CORS to localhost and local network addresses
const nets = os.networkInterfaces();
const allowedOrigins = [
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`
];
for (const name of Object.keys(nets)) {
  for (const net of nets[name]) {
    if (net.family === "IPv4" && !net.internal) {
      allowedOrigins.push(`http://${net.address}:${PORT}`);
    }
  }
}

app.use(cors({
  origin: (origin, callback) => {
    // allow non-browser requests (no origin) and allowed origins
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('CORS origin denied'));
  }
}));

app.use(helmet({ contentSecurityPolicy: false }));

// simple request logger for debugging route handling
app.use((req, res, next) => {
  console.log(new Date().toISOString(), req.method, req.originalUrl);
  next();
});

const staticRoot = __dirname;
const startupPromise = (async () => {
  try {
    console.log("[INFO] Iniciando base de datos...");
    await initializeDb();
    console.log("[INFO] Base de datos inicializada");
    await ensureSettingsTable();
    console.log("[INFO] Tabla de configuración lista");
    await seedDefaultPermissions();
    console.log("[INFO] Permisos por defecto configurados");
    await seedAdminUser();
    console.log("[INFO] Usuario admin creado/verificado");
  } catch (error) {
    console.error("[ERROR] Fallo en inicialización:", error.message, error.stack);
    throw error;
  }
})();

app.use(async (req, res, next) => {
  try {
    await startupPromise;
    next();
  } catch (error) {
    next(error);
  }
});

app.use(express.static(staticRoot));

function createId(prefix = "id") {
  return `${prefix}-${Math.random().toString(16).slice(2)}-${Date.now().toString(36)}`;
}

function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: "8h" });
}

function authenticateToken(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Token requerido." });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Token inválido o expirado." });
  }
}

function authorizeRole(...allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "No tienes permisos para esta acción." });
    }
    next();
  };
}

const ROLE_PERMISSIONS = {
  ADMINISTRADOR: [
    "users:view","users:write","users:password","products:view","products:write","products:edit","customers:view","customers:write","suppliers:view","suppliers:write","purchases:view","purchases:write","sales:view","sales:write","cash:view","cash:open","cash:close","expenses:view","expenses:write","returns:view","returns:write","debts:view","debts:write","apartados:view","apartados:write","reports:view","audit:view","settings:view","settings:write","backup:write"
  ],
  CAJERO: [
    "products:view","customers:view","customers:write","sales:view","sales:write","cash:view","cash:open","cash:close","expenses:view","expenses:write","debts:view","debts:write","apartados:view","apartados:write","returns:view","returns:write","reports:view"
  ],
  EMPLEADO: [
    "products:view","customers:view","sales:view","reports:view"
  ]
};

function requirePermission(permission) {
  return (req, res, next) => {
    const userRole = req.user?.role;
    if (userRole === "ADMINISTRADOR") return next();
    const allowed = ROLE_PERMISSIONS[userRole] || [];
    if (allowed.includes(permission)) return next();
    return res.status(403).json({ message: "No tienes permisos para esta acción." });
  };
}

async function createAuditLog(user, action, entity, entityId, details) {
  const row = {
    id: createId("audit"),
    user_id: user?.id || null,
    username: user?.username || "system",
    action,
    entity,
    entity_id: entityId || null,
    details: details ? JSON.stringify(details) : null,
    created_at: new Date().toISOString()
  };

  await run(
    `INSERT INTO audit_logs (id, user_id, username, action, entity, entity_id, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.user_id, row.username, row.action, row.entity, row.entity_id, row.details, row.created_at]
  );
}

async function seedDefaultPermissions() {
  const existing = await all("SELECT role, permission FROM role_permissions");
  const set = new Set(existing.map((row) => `${row.role}:${row.permission}`));

  for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    for (const permission of permissions) {
      const key = `${role}:${permission}`;
      if (!set.has(key)) {
        await run(
          `INSERT INTO role_permissions (id, role, permission, created_at) VALUES (?, ?, ?, ?)`,
          [createId("perm"), role, permission, new Date().toISOString()]
        );
      }
    }
  }
}

async function seedAdminUser() {
  const existing = await get("SELECT * FROM users WHERE username = ?", ["admin"]);
  if (existing) return existing;

  const passwordHash = await bcrypt.hash("admin123", 10);
  const admin = {
    id: createId("user"),
    username: "admin",
    password_hash: passwordHash,
    role: "ADMINISTRADOR",
    active: 1,
    created_at: new Date().toISOString()
  };

  await run(
    `INSERT INTO users (id, username, password_hash, role, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [admin.id, admin.username, admin.password_hash, admin.role, admin.active, admin.created_at]
  );

  await createAuditLog({ id: admin.id, username: admin.username }, "login", "users", admin.id, { detail: "Usuario administrador inicial creado." });
  return admin;
}

async function getStatePayload() {
  const [products, clients, sales, debts, apartados, expenses, suppliers, purchases, cashSession, settings] = await Promise.all([
    all(`SELECT * FROM products ORDER BY created_at DESC`),
    all(`SELECT * FROM clients ORDER BY created_at DESC`),
    all(`SELECT * FROM sales ORDER BY created_at DESC`),
    all(`SELECT * FROM debts ORDER BY created_at DESC`),
    all(`SELECT * FROM apartados ORDER BY created_at DESC`),
    all(`SELECT * FROM expenses ORDER BY created_at DESC`),
    all(`SELECT * FROM suppliers ORDER BY created_at DESC`),
    all(`SELECT * FROM purchases ORDER BY created_at DESC`),
    get(`SELECT * FROM cash_sessions ORDER BY opened_at DESC LIMIT 1`),
    get(`SELECT * FROM settings LIMIT 1`)
  ]);

  const saleMap = new Map();
  for (const sale of sales) {
    const items = await all(`SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id DESC`, [sale.id]);
    sale.items = items;
    sale.payment = sale.payment_json ? JSON.parse(sale.payment_json) : {};
    saleMap.set(sale.id, sale);
  }

  const debtMap = new Map();
  for (const debt of debts) {
    const payments = await all(`SELECT * FROM debt_payments WHERE debt_id = ? ORDER BY created_at DESC`, [debt.id]);
    debt.payments = payments;
    debtMap.set(debt.id, debt);
  }

  const apartadoMap = new Map();
  for (const apartado of apartados) {
    const payments = await all(`SELECT * FROM apartado_payments WHERE apartado_id = ? ORDER BY created_at DESC`, [apartado.id]);
    apartado.payments = payments;
    apartadoMap.set(apartado.id, apartado);
  }

  const state = {
    products,
    clients,
    sales,
    debts,
    apartados,
    expenses,
    suppliers,
    purchases,
    cash: cashSession || {
      open: false,
      openedAt: null,
      openedBy: null,
      base: 0,
      totalSales: 0,
      totalExpenses: 0,
      lastClosedAt: null
    },
    settings: settings || {
      storeName: "Tienda La Bendición",
      storePhone: "",
      currency: "COP",
      interestRate: 0,
      dueDays: 7
    }
  };

  return state;
}

async function syncState({ products, clients, sales, debts, apartados, expenses, suppliers, purchases, cash, settings }) {
  await run(`DELETE FROM products`);
  await run(`DELETE FROM clients`);
  await run(`DELETE FROM sales`);
  await run(`DELETE FROM sale_items`);
  await run(`DELETE FROM debts`);
  await run(`DELETE FROM debt_payments`);
  await run(`DELETE FROM apartados`);
  await run(`DELETE FROM apartado_payments`);
  await run(`DELETE FROM expenses`);
  await run(`DELETE FROM suppliers`);
  await run(`DELETE FROM purchases`);
  await run(`DELETE FROM purchase_items`);
  await run(`DELETE FROM cash_sessions`);
  await run(`DELETE FROM settings`);

  for (const product of products || []) {
    const purchasePrice = Number(product.purchasePrice ?? product.purchase_price ?? 0);
    const salePrice = Number(product.salePrice ?? product.sale_price ?? 0);
    const stock = Number(product.stock ?? product.stock ?? 0);
    const minStock = Number(product.minStock ?? product.min_stock ?? 0);
    const maxStock = Number(product.maxStock ?? product.max_stock ?? 0);
    const createdAt = product.createdAt ?? product.created_at ?? new Date().toISOString();
    const updatedAt = product.updatedAt ?? product.updated_at ?? new Date().toISOString();

    await run(`INSERT INTO products (id, sku, barcode, name, brand, category, supplier, purchase_price, sale_price, stock, min_stock, max_stock, unit, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [product.id, product.sku || "", product.barcode || "", product.name || "", product.brand || "", product.category || "", product.supplier || "", purchasePrice, salePrice, stock, minStock, maxStock, product.unit || "und", createdAt, updatedAt]);
  }

  for (const client of clients || []) {
    const createdAt = client.createdAt ?? client.created_at ?? new Date().toISOString();
    const familyContact = (client.familyContact ?? client.family_contact) || "";
    const activeFlag = client.active === undefined ? 1 : (client.active ? 1 : 0);
    await run(`INSERT INTO clients (id, name, phone, whatsapp, address, family_contact, active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [client.id, client.name, client.phone || "", client.whatsapp || "", client.address || "", familyContact, activeFlag, createdAt]);
  }

  for (const sale of sales || []) {
    const saleCreatedAt = sale.createdAt ?? sale.created_at ?? new Date().toISOString();
    await run(`INSERT INTO sales (id, created_at, subtotal, discount, total, received, change_amount, payment_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [sale.id, saleCreatedAt, Number(sale.subtotal || 0), Number(sale.discount || 0), Number(sale.total || 0), Number(sale.received || 0), Number(sale.change || sale.change_amount || 0), JSON.stringify(sale.payment || {}), sale.status || "completed"]);
    for (const item of sale.items || []) {
      await run(`INSERT INTO sale_items (id, sale_id, product_id, name, quantity, price)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [createId("saleItem"), sale.id, item.id || item.product_id || null, item.name, Number(item.quantity || 1), Number(item.price || item.price || 0)]);
    }
  }

  for (const debt of debts || []) {
    console.log('restore: inserting debt', JSON.stringify(debt));
    console.log('restore: clients available', (clients || []).length);
    const debtClientId = debt.clientId ?? debt.client_id ?? (clients && clients.length ? clients[0].id : null);
    const debtCreatedAt = debt.createdAt ?? debt.created_at ?? new Date().toISOString();
    await run(`INSERT INTO debts (id, client_id, amount, balance, concept, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [debt.id, debtClientId, Number(debt.amount || 0), Number(debt.balance || 0), debt.concept || "Fiado", debt.status || "pendiente", debtCreatedAt]);
    for (const payment of debt.payments || []) {
      const payCreated = payment.createdAt ?? payment.created_at ?? new Date().toISOString();
      await run(`INSERT INTO debt_payments (id, debt_id, amount, method, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [createId("debtPay"), debt.id, Number(payment.amount || payment.amount || 0), payment.method || payment.type || null, payment.created_by ?? payment.createdBy ?? null, payCreated]);
    }
  }

  for (const apartado of apartados || []) {
    const apartadoClient = apartado.clientId ?? apartado.client_id ?? null;
    const apartadoCreatedAt = apartado.createdAt ?? apartado.created_at ?? new Date().toISOString();
    const apartadoProductName = apartado.productName ?? apartado.product_name ?? "";
    const apartadoTotalAmount = Number(apartado.totalAmount ?? apartado.total_amount ?? 0);
    const apartadoTotalPaid = Number(apartado.totalPaid ?? apartado.total_paid ?? 0);
    const apartadoDueDate = apartado.dueDate ?? apartado.due_date ?? null;

    await run(`INSERT INTO apartados (id, client_id, product_name, total_amount, total_paid, status, due_date, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [apartado.id, apartadoClient, apartadoProductName, apartadoTotalAmount, apartadoTotalPaid, apartado.status || "activo", apartadoDueDate, apartadoCreatedAt]);
    for (const payment of apartado.payments || []) {
      const payCreated = payment.createdAt ?? payment.created_at ?? new Date().toISOString();
      await run(`INSERT INTO apartado_payments (id, apartado_id, amount, type, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [createId("apartadoPay"), apartado.id, Number(payment.amount || payment.amount || 0), payment.type || payment.method || "abono", payment.created_by ?? payment.createdBy ?? null, payCreated]);
    }
  }

  for (const expense of expenses || []) {
    const expenseDate = expense.date ?? new Date().toISOString().slice(0, 10);
    const expenseCreated = expense.createdAt ?? expense.created_at ?? new Date().toISOString();
    await run(`INSERT INTO expenses (id, category, amount, concept, date, method, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [expense.id, expense.category || "Otros", Number(expense.amount || 0), expense.concept || "", expenseDate, expense.method || expense.paymentMethod || "Efectivo", expense.created_by ?? expense.createdBy ?? null, expenseCreated]);
  }

  for (const supplier of suppliers || []) {
    const supCreated = supplier.createdAt ?? supplier.created_at ?? new Date().toISOString();
    const supUpdated = supplier.updatedAt ?? supplier.updated_at ?? new Date().toISOString();
    await run(`INSERT INTO suppliers (id, name, phone, whatsapp, nit, email, address, contact, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [supplier.id, supplier.name || "", supplier.phone || "", supplier.whatsapp || "", supplier.nit || "", supplier.email || "", supplier.address || "", supplier.contact || "", supplier.active !== false ? 1 : 0, supCreated, supUpdated]);
  }

  for (const purchase of purchases || []) {
    const pDate = purchase.date ?? purchase.date ?? new Date().toISOString().slice(0, 10);
    const pCreated = purchase.createdAt ?? purchase.created_at ?? new Date().toISOString();
    const pSupplierId = purchase.supplierId ?? purchase.supplier_id ?? null;
    const pInvoice = purchase.invoiceNumber ?? purchase.invoice_number ?? "";
    const pCreatedBy = purchase.createdBy ?? purchase.created_by ?? null;
    const pPaymentMethod = purchase.paymentMethod ?? purchase.payment_method ?? "Efectivo";

    await run(`INSERT INTO purchases (id, supplier_id, invoice_number, date, subtotal, discount, tax, total, payment_method, status, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [purchase.id, pSupplierId, pInvoice, pDate, Number(purchase.subtotal || 0), Number(purchase.discount || 0), Number(purchase.tax || 0), Number(purchase.total || 0), pPaymentMethod, purchase.status || "completed", pCreatedBy, pCreated]);

    for (const item of purchase.items || []) {
      const itCreated = item.createdAt ?? item.created_at ?? new Date().toISOString();
      const itProductId = item.productId ?? item.product_id ?? null;
      const itProductName = item.productName ?? item.name ?? "";
      const itQuantity = Number(item.quantity ?? 0);
      const itCostPrice = Number(item.costPrice ?? item.cost_price ?? 0);
      const itTotal = Number(item.total ?? 0);
      await run(`INSERT INTO purchase_items (id, purchase_id, product_id, product_name, quantity, cost_price, total, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [createId("purItem"), purchase.id, itProductId, itProductName, itQuantity, itCostPrice, itTotal, itCreated]);
    }
  }

  if (cash) {
    await run(`INSERT INTO cash_sessions (id, open, opened_by, opened_at, base, total_sales, total_expenses, last_closed_at, closed_by, cash_counted, difference)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [cash.id || createId("cash"), cash.open ? 1 : 0, cash.openedBy || null, cash.openedAt || new Date().toISOString(), Number(cash.base || 0), Number(cash.totalSales || 0), Number(cash.totalExpenses || 0), cash.lastClosedAt || null, cash.closedBy || null, Number(cash.cashCounted || 0), Number(cash.difference || 0)]);
  }

  if (settings) {
    await run(`INSERT INTO settings (id, store_name, store_phone, currency, interest_rate, due_days)
      VALUES (?, ?, ?, ?, ?, ?)`,
      ["settings", settings.storeName || "Tienda La Bendición", settings.storePhone || "", settings.currency || "COP", Number(settings.interestRate || 0), Number(settings.dueDays || 7)]);
  }
}

async function ensureSettingsTable() {
  await run(`
    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      store_name TEXT,
      store_phone TEXT,
      currency TEXT,
      interest_rate REAL,
      due_days INTEGER
    )
  `);

  const existing = await get(`SELECT * FROM settings LIMIT 1`);
  if (!existing) {
    await run(`INSERT INTO settings (id, store_name, store_phone, currency, interest_rate, due_days) VALUES (?, ?, ?, ?, ?, ?)`,
      ["settings", "Tienda La Bendición", "", "COP", 0, 7]);
  }
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "TenderoPro API funcionando" });
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ message: "Usuario y contraseña son requeridos." });
  }

  const user = await get(`SELECT * FROM users WHERE username = ? AND active = 1`, [username]);
  if (!user) {
    return res.status(401).json({ message: "Credenciales inválidas." });
  }

  const passwordOk = await bcrypt.compare(password, user.password_hash);
  if (!passwordOk) {
    return res.status(401).json({ message: "Credenciales inválidas." });
  }

  // update last login
  try {
    await run(`UPDATE users SET last_login = ? WHERE id = ?`, [new Date().toISOString(), user.id]);
  } catch (e) {
    console.warn('Failed to update last_login (likely older DB schema).');
  }

  await createAuditLog(user, "login", "users", user.id, { ip: req.ip });

  return res.json({
    token: signToken(user),
    user: { id: user.id, username: user.username, role: user.role, mustChangePassword: Boolean(user.must_change_password) },
    mustChangePassword: Boolean(user.must_change_password)
  });
});

// global error handler - do not leak internal errors
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err && err.stack ? err.stack : err);
  if (res.headersSent) return next(err);
  res.status(500).json({ message: 'Error interno del servidor.' });
});

app.post("/api/auth/change-password", authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ message: "La nueva contraseña debe tener al menos 6 caracteres." });
  }

  const user = await get(`SELECT * FROM users WHERE id = ? AND active = 1`, [req.user.id]);
  if (!user) return res.status(404).json({ message: "Usuario no encontrado." });

  if (currentPassword) {
    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) return res.status(400).json({ message: "La contraseña actual no coincide." });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await run(`UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?`, [passwordHash, user.id]);
  await createAuditLog(user, "change_password", "users", user.id, { changedBy: req.user.username });
  return res.json({ ok: true, message: "Contraseña actualizada correctamente." });
});

app.get("/api/auth/me", authenticateToken, async (req, res) => {
  const user = await get(`SELECT id, username, role, must_change_password, active FROM users WHERE id = ?`, [req.user.id]);
  res.json({ user });
});

app.post("/api/auth/register", authenticateToken, requirePermission("users:write"), async (req, res) => {
  const { username, password, role = "EMPLEADO" } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ message: "Usuario y contraseña requeridos." });
  }

  const exists = await get(`SELECT * FROM users WHERE username = ?`, [username]);
  if (exists) {
    return res.status(409).json({ message: "El usuario ya existe." });
  }

  const userId = createId("user");
  const passwordHash = await bcrypt.hash(password, 10);
  await run(`INSERT INTO users (id, username, password_hash, role, active, must_change_password, created_at) VALUES (?, ?, ?, ?, 1, 1, ?)`, [userId, username, passwordHash, role.toUpperCase(), new Date().toISOString()]);
  await createAuditLog(req.user, "create_user", "users", userId, { username, role });

  res.status(201).json({ message: "Usuario creado." });
});

app.get("/api/users", authenticateToken, requirePermission("users:view"), async (req, res) => {
  const users = await all(`SELECT id, username, role, active, must_change_password, created_at FROM users ORDER BY created_at DESC`);
  res.json(users);
});

app.put("/api/users/:id", authenticateToken, requirePermission("users:write"), async (req, res) => {
  const { role, active } = req.body || {};
  const user = await get(`SELECT * FROM users WHERE id = ?`, [req.params.id]);
  if (!user) return res.status(404).json({ message: "Usuario no encontrado." });

  await run(`UPDATE users SET role = ?, active = ? WHERE id = ?`, [String(role || user.role).toUpperCase(), active === undefined ? user.active : Number(active), req.params.id]);
  await createAuditLog(req.user, "update_user", "users", req.params.id, { role: String(role || user.role).toUpperCase(), active: active === undefined ? user.active : Number(active) });
  return res.json({ ok: true, message: "Usuario actualizado." });
});

app.put("/api/users/:id/password", authenticateToken, requirePermission("users:password"), async (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ message: "La contraseña debe tener mínimo 6 caracteres." });
  }
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await run(`UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?`, [passwordHash, req.params.id]);
  await createAuditLog(req.user, "reset_password", "users", req.params.id, { action: "password_reset" });
  return res.json({ ok: true, message: "Contraseña actualizada." });
});

app.get("/api/permissions", authenticateToken, requirePermission("users:view"), async (req, res) => {
  return res.json(ROLE_PERMISSIONS);
});

app.get("/api/state", authenticateToken, async (req, res) => {
  const state = await getStatePayload();
  res.json(state);
});

app.put("/api/state", authenticateToken, async (req, res) => {
  const nextState = req.body || {};
  await syncState(nextState);
  await createAuditLog(req.user, "sync_state", "state", null, { payload: Object.keys(nextState) });
  res.json({ ok: true, message: "Datos sincronizados." });
});

app.get("/api/products", authenticateToken, async (req, res) => {
  const rows = await all(`SELECT * FROM products ORDER BY created_at DESC`);
  res.json(rows);
});

app.post("/api/products", authenticateToken, async (req, res) => {
  const payload = req.body || {};
  const product = {
    id: payload.id || createId("prod"),
    sku: payload.sku,
    barcode: payload.barcode || "",
    name: payload.name,
    brand: payload.brand || "",
    category: payload.category || "",
    supplier: payload.supplier || "",
    purchasePrice: Number(payload.purchasePrice || 0),
    salePrice: Number(payload.salePrice || 0),
    stock: Number(payload.stock || 0),
    minStock: Number(payload.minStock || 0),
    maxStock: Number(payload.maxStock || 0),
    unit: payload.unit || "und",
    createdAt: payload.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await run(`INSERT INTO products (id, sku, barcode, name, brand, category, supplier, purchase_price, sale_price, stock, min_stock, max_stock, unit, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [product.id, product.sku, product.barcode, product.name, product.brand, product.category, product.supplier, product.purchasePrice, product.salePrice, product.stock, product.minStock, product.maxStock, product.unit, product.createdAt, product.updatedAt]);

  await createAuditLog(req.user, "create_product", "products", product.id, { name: product.name, sku: product.sku });
  res.status(201).json(product);
});

app.get("/api/suppliers", authenticateToken, async (req, res) => {
  const rows = await all(`SELECT * FROM suppliers ORDER BY created_at DESC`);
  res.json(rows);
});

app.post("/api/suppliers", authenticateToken, async (req, res) => {
  const payload = req.body || {};
  const supplier = {
    id: payload.id || createId("sup"),
    name: String(payload.name || "").trim(),
    phone: String(payload.phone || "").trim(),
    whatsapp: String(payload.whatsapp || "").trim(),
    nit: String(payload.nit || "").trim(),
    email: String(payload.email || "").trim(),
    address: String(payload.address || "").trim(),
    contact: String(payload.contact || "").trim(),
    active: payload.active !== false,
    createdAt: payload.createdAt || new Date().toISOString(),
    updatedAt: payload.updatedAt || new Date().toISOString()
  };

  if (!supplier.name) {
    return res.status(400).json({ message: "El nombre del proveedor es requerido." });
  }

  await run(`INSERT INTO suppliers (id, name, phone, whatsapp, nit, email, address, contact, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [supplier.id, supplier.name, supplier.phone, supplier.whatsapp, supplier.nit, supplier.email, supplier.address, supplier.contact, supplier.active ? 1 : 0, supplier.createdAt, supplier.updatedAt]);

  await createAuditLog(req.user, "create_supplier", "suppliers", supplier.id, { name: supplier.name });
  return res.status(201).json(supplier);
});

app.get("/api/purchases", authenticateToken, async (req, res) => {
  const rows = await all(`SELECT * FROM purchases ORDER BY created_at DESC`);
  for (const purchase of rows) {
    purchase.items = await all(`SELECT * FROM purchase_items WHERE purchase_id = ? ORDER BY created_at DESC`, [purchase.id]);
  }
  res.json(rows);
});

app.post("/api/purchases", authenticateToken, async (req, res) => {
  const payload = req.body || {};
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!payload.supplierId || !items.length) {
    return res.status(400).json({ message: "Proveedor e ítems de compra son requeridos." });
  }

  const subtotal = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.costPrice || 0), 0);
  const discount = Number(payload.discount || 0);
  const tax = Number(payload.tax || 0);
  const total = subtotal - discount + tax;
  const purchaseId = payload.id || createId("purchase");
  const purchase = {
    id: purchaseId,
    supplierId: payload.supplierId,
    invoiceNumber: String(payload.invoiceNumber || "").trim(),
    date: payload.date || new Date().toISOString().slice(0, 10),
    subtotal,
    discount,
    tax,
    total,
    paymentMethod: payload.paymentMethod || "Efectivo",
    status: payload.status || "completed",
    createdBy: req.user.username,
    createdAt: payload.createdAt || new Date().toISOString(),
    items
  };

  await run(`INSERT INTO purchases (id, supplier_id, invoice_number, date, subtotal, discount, tax, total, payment_method, status, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [purchase.id, purchase.supplierId, purchase.invoiceNumber, purchase.date, purchase.subtotal, purchase.discount, purchase.tax, purchase.total, purchase.paymentMethod, purchase.status, purchase.createdBy, purchase.createdAt]);

  for (const item of purchase.items) {
    const product = await get(`SELECT * FROM products WHERE id = ?`, [item.productId]);
    if (!product) {
      return res.status(404).json({ message: `Producto no encontrado para el ítem ${item.productName || item.name || "sin nombre"}.` });
    }

    const quantity = Number(item.quantity || 0);
    const costPrice = Number(item.costPrice || product.purchase_price || 0);
    const totalItem = quantity * costPrice;
    await run(`INSERT INTO purchase_items (id, purchase_id, product_id, product_name, quantity, cost_price, total, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [createId("purItem"), purchase.id, product.id, product.name, quantity, costPrice, totalItem, new Date().toISOString()]);

    await run(`UPDATE products SET stock = stock + ?, purchase_price = ?, updated_at = ? WHERE id = ?`,
      [quantity, costPrice, new Date().toISOString(), product.id]);
  }

  await createAuditLog(req.user, "create_purchase", "purchases", purchase.id, { supplierId: purchase.supplierId, total: purchase.total, items: items.length });
  return res.status(201).json(purchase);
});

app.get("/api/clients", authenticateToken, async (req, res) => {
  const rows = await all(`SELECT * FROM clients ORDER BY created_at DESC`);
  res.json(rows);
});

app.post("/api/clients", authenticateToken, async (req, res) => {
  const payload = req.body || {};
  const client = {
    id: payload.id || createId("client"),
    name: payload.name,
    phone: payload.phone || "",
    whatsapp: payload.whatsapp || "",
    address: payload.address || "",
    familyContact: payload.familyContact || "",
    active: payload.active !== false,
    createdAt: payload.createdAt || new Date().toISOString()
  };

  await run(`INSERT INTO clients (id, name, phone, whatsapp, address, family_contact, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [client.id, client.name, client.phone, client.whatsapp, client.address, client.familyContact, client.active ? 1 : 0, client.createdAt]);

  await createAuditLog(req.user, "create_client", "clients", client.id, { name: client.name });
  res.status(201).json(client);
});

app.get("/api/sales", authenticateToken, async (req, res) => {
  const sales = await all(`SELECT * FROM sales ORDER BY created_at DESC`);
  const payload = [];
  for (const sale of sales) {
    const items = await all(`SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id DESC`, [sale.id]);
    sale.items = items;
    sale.payment = sale.payment_json ? JSON.parse(sale.payment_json) : {};
    payload.push(sale);
  }
  res.json(payload);
});

app.post("/api/sales", authenticateToken, async (req, res) => {
  const payload = req.body || {};
  const saleId = payload.id || createId("sale");
  const createdAt = payload.createdAt || new Date().toISOString();
  const payment = payload.payment || {};

  await run(`INSERT INTO sales (id, created_at, subtotal, discount, total, received, change_amount, payment_json, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [saleId, createdAt, Number(payload.subtotal || 0), Number(payload.discount || 0), Number(payload.total || 0), Number(payload.received || 0), Number(payload.change || 0), JSON.stringify(payment), payload.status || "completed"]);

  for (const item of payload.items || []) {
    const itemId = createId("saleItem");
    await run(`INSERT INTO sale_items (id, sale_id, product_id, name, quantity, price)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [itemId, saleId, item.id || null, item.name, Number(item.quantity || 1), Number(item.price || 0)]);

    const product = await get(`SELECT * FROM products WHERE id = ?`, [item.id]);
    if (product) {
      await run(`UPDATE products SET stock = ?, updated_at = ? WHERE id = ?`, [Math.max(0, Number(product.stock || 0) - Number(item.quantity || 0)), new Date().toISOString(), item.id]);
    }
  }

  await createAuditLog(req.user, "create_sale", "sales", saleId, { total: payload.total, items: payload.items?.length || 0 });
  res.status(201).json({ id: saleId, createdAt });
});

app.get("/api/debts", authenticateToken, async (req, res) => {
  const rows = await all(`SELECT * FROM debts ORDER BY created_at DESC`);
  for (const debt of rows) {
    debt.payments = await all(`SELECT * FROM debt_payments WHERE debt_id = ? ORDER BY created_at DESC`, [debt.id]);
  }
  res.json(rows);
});

app.post("/api/debts", authenticateToken, async (req, res) => {
  const payload = req.body || {};
  const debt = {
    id: payload.id || createId("debt"),
    clientId: payload.clientId,
    amount: Number(payload.amount || 0),
    balance: Number(payload.balance || payload.amount || 0),
    concept: payload.concept || "Fiado",
    status: payload.status || "pendiente",
    createdAt: payload.createdAt || new Date().toISOString(),
    payments: payload.payments || []
  };

  await run(`INSERT INTO debts (id, client_id, amount, balance, concept, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [debt.id, debt.clientId, debt.amount, debt.balance, debt.concept, debt.status, debt.createdAt]);

  await createAuditLog(req.user, "create_debt", "debts", debt.id, { clientId: debt.clientId, amount: debt.amount });
  res.status(201).json(debt);
});

app.post("/api/debts/:id/payments", authenticateToken, requirePermission("debts:write"), async (req, res) => {
  const { id } = req.params;
  const amount = Number(req.body.amount || 0);
  if (!amount || amount <= 0) {
    return res.status(400).json({ message: "Monto del abono inválido." });
  }

  const debt = await get(`SELECT * FROM debts WHERE id = ?`, [id]);
  if (!debt) return res.status(404).json({ message: "Fiado no encontrado." });

  if (amount > Number(debt.balance || 0)) {
    return res.status(400).json({ message: "El abono no puede superar el saldo actual." });
  }

  const nextBalance = Math.max(0, Number(debt.balance || 0) - amount);
  const paymentId = createId("debtPay");
  await run(`INSERT INTO debt_payments (id, debt_id, amount, method, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [paymentId, id, amount, req.body.method || "Efectivo", req.user.username, new Date().toISOString()]);
  await run(`UPDATE debts SET balance = ?, status = ? WHERE id = ?`, [nextBalance, nextBalance <= 0 ? "pagado" : "pendiente", id]);

  const session = await get(`SELECT * FROM cash_sessions WHERE open = 1 ORDER BY opened_at DESC LIMIT 1`);
  if (session) {
    await run(`INSERT INTO cash_movements (id, session_id, type, category, amount, concept, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [createId("cashMove"), session.id, "abono", "fiados", amount, `Abono fiado ${id}`, req.user.username, new Date().toISOString()]);
  }

  await createAuditLog(req.user, "payment_debt", "debts", id, { amount, newBalance: nextBalance });
  res.json({ ok: true, balance: nextBalance });
});

app.get("/api/apartados", authenticateToken, requirePermission("apartados:view"), async (req, res) => {
  const rows = await all(`SELECT * FROM apartados ORDER BY created_at DESC`);
  for (const apartado of rows) {
    apartado.payments = await all(`SELECT * FROM apartado_payments WHERE apartado_id = ? ORDER BY created_at DESC`, [apartado.id]);
  }
  res.json(rows);
});

app.post("/api/apartados", authenticateToken, async (req, res) => {
  const payload = req.body || {};
  const apartado = {
    id: payload.id || createId("apartado"),
    clientId: payload.clientId,
    productName: payload.productName,
    totalAmount: Number(payload.totalAmount || 0),
    totalPaid: Number(payload.totalPaid || 0),
    status: payload.status || "activo",
    dueDate: payload.dueDate || null,
    createdAt: payload.createdAt || new Date().toISOString(),
    payments: payload.payments || []
  };

  await run(`INSERT INTO apartados (id, client_id, product_name, total_amount, total_paid, status, due_date, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [apartado.id, apartado.clientId, apartado.productName, apartado.totalAmount, apartado.totalPaid, apartado.status, apartado.dueDate, apartado.createdAt]);

  for (const payment of apartado.payments) {
    await run(`INSERT INTO apartado_payments (id, apartado_id, amount, type, created_at)
      VALUES (?, ?, ?, ?, ?)`,
      [createId("apartadoPay"), apartado.id, Number(payment.amount || 0), payment.type || "abono", payment.createdAt || new Date().toISOString()]);
  }

  await createAuditLog(req.user, "create_apartado", "apartados", apartado.id, { productName: apartado.productName, total: apartado.totalAmount });
  res.status(201).json(apartado);
});

app.post("/api/apartados/:id/payments", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const amount = Number(req.body.amount || 0);
  if (!amount || amount <= 0) return res.status(400).json({ message: "Monto inválido." });

  const apartado = await get(`SELECT * FROM apartados WHERE id = ?`, [id]);
  if (!apartado) return res.status(404).json({ message: "Apartado no encontrado." });

  const newPaid = Number(apartado.total_paid || 0) + amount;
  const status = newPaid >= Number(apartado.total_amount || 0) ? "pagado" : "activo";
  await run(`INSERT INTO apartado_payments (id, apartado_id, amount, type, created_at) VALUES (?, ?, ?, ?, ?)`,
    [createId("apartadoPay"), id, amount, "abono", new Date().toISOString()]);
  await run(`UPDATE apartados SET total_paid = ?, status = ? WHERE id = ?`, [newPaid, status, id]);

  await createAuditLog(req.user, "payment_apartado", "apartados", id, { amount, totalPaid: newPaid });
  res.json({ ok: true, totalPaid: newPaid, status });
});

app.get("/api/expenses", authenticateToken, async (req, res) => {
  const rows = await all(`SELECT * FROM expenses ORDER BY created_at DESC`);
  res.json(rows);
});

app.post("/api/expenses", authenticateToken, async (req, res) => {
  const payload = req.body || {};
  const expense = {
    id: payload.id || createId("exp"),
    category: payload.category || "Otros",
    amount: Number(payload.amount || 0),
    concept: payload.concept,
    date: payload.date || new Date().toISOString().slice(0, 10),
    method: payload.method || "Efectivo",
    createdAt: payload.createdAt || new Date().toISOString()
  };

  await run(`INSERT INTO expenses (id, category, amount, concept, date, method, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [expense.id, expense.category, expense.amount, expense.concept, expense.date, expense.method, expense.createdAt]);

  await createAuditLog(req.user, "create_expense", "expenses", expense.id, { amount: expense.amount, category: expense.category });
  res.status(201).json(expense);
});

app.get("/api/cash", authenticateToken, async (req, res) => {
  const row = await get(`SELECT * FROM cash_sessions ORDER BY opened_at DESC LIMIT 1`);
  res.json(row || { open: false, base: 0, totalSales: 0, totalExpenses: 0 });
});

app.post("/api/cash/open", authenticateToken, async (req, res) => {
  const body = req.body || {};
  const openSession = {
    id: createId("cash"),
    open: 1,
    openedBy: req.user.username,
    openedAt: new Date().toISOString(),
    base: Number(body.base || 0),
    totalSales: 0,
    totalExpenses: 0,
    lastClosedAt: null,
    closedBy: null,
    cashCounted: 0,
    difference: 0
  };

  await run(`INSERT INTO cash_sessions (id, open, opened_by, opened_at, base, total_sales, total_expenses, last_closed_at, closed_by, cash_counted, difference)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [openSession.id, 1, openSession.openedBy, openSession.openedAt, openSession.base, 0, 0, null, null, 0, 0]);

  await createAuditLog(req.user, "open_cash", "cash_sessions", openSession.id, { base: openSession.base });
  res.status(201).json(openSession);
});

app.post("/api/cash/close", authenticateToken, async (req, res) => {
  const body = req.body || {};
  const openRow = await get(`SELECT * FROM cash_sessions WHERE open = 1 ORDER BY opened_at DESC LIMIT 1`);
  if (!openRow) return res.status(400).json({ message: "No hay caja abierta." });

  const expectedCash = Number(openRow.base || 0) + Number(openRow.total_sales || 0) - Number(openRow.total_expenses || 0);
  const counted = Number(body.cashCounted || 0);
  const difference = counted - expectedCash;

  await run(`UPDATE cash_sessions SET open = 0, last_closed_at = ?, closed_by = ?, cash_counted = ?, difference = ? WHERE id = ?`, [new Date().toISOString(), req.user.username, counted, difference, openRow.id]);
  await createAuditLog(req.user, "close_cash", "cash_sessions", openRow.id, { expectedCash, counted, difference });

  res.json({ ok: true, expectedCash, counted, difference });
});

app.get("/api/reports", authenticateToken, requirePermission("reports:view"), async (req, res) => {
  const [sales, expenses, products, debts, purchases, apartados] = await Promise.all([
    all(`SELECT * FROM sales`),
    all(`SELECT * FROM expenses`),
    all(`SELECT * FROM products`),
    all(`SELECT * FROM debts`),
    all(`SELECT * FROM purchases`),
    all(`SELECT * FROM apartados`)
  ]);

  const totalSales = sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const totalExpenses = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const debtTotal = debts.reduce((sum, debt) => sum + Number(debt.balance || 0), 0);
  const totalPurchases = purchases.reduce((sum, purchase) => sum + Number(purchase.total || 0), 0);
  const inventoryValue = products.reduce((sum, product) => sum + Number(product.stock || 0) * Number(product.purchase_price || 0), 0);
  const totalApartados = apartados.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);

  res.json({
    totalSales,
    totalExpenses,
    debtTotal,
    inventoryValue,
    totalPurchases,
    totalApartados,
    productsCount: products.length,
    salesCount: sales.length,
    stockLow: products.filter((product) => Number(product.stock) <= Number(product.min_stock || 0)).length,
    salesByPeriod: { today: totalSales, week: totalSales, month: totalSales, year: totalSales }
  });
});

app.get("/api/audit", authenticateToken, requirePermission("audit:view"), async (req, res) => {
  const rows = await all(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200`);
  res.json(rows);
});

app.get("/api/settings", authenticateToken, requirePermission("settings:view"), async (req, res) => {
  const row = await get(`SELECT * FROM settings LIMIT 1`);
  return res.json(row || { storeName: "Tienda La Bendición" });
});

app.put("/api/settings", authenticateToken, requirePermission("settings:write"), async (req, res) => {
  const payload = req.body || {};
  await run(`UPDATE settings SET store_name = ?, store_phone = ?, store_address = ?, currency = ?, interest_rate = ?, due_days = ?, tax_rate = ?, payment_methods = ?, updated_at = ? WHERE id = 'settings'`,
    [payload.storeName || "Tienda La Bendición", payload.storePhone || "", payload.storeAddress || "", payload.currency || "COP", Number(payload.interestRate || 0), Number(payload.dueDays || 7), Number(payload.taxRate || 0), JSON.stringify(payload.paymentMethods || ["Efectivo", "Nequi", "Daviplata", "Transferencia", "Tarjeta"]), new Date().toISOString()]);
  await createAuditLog(req.user, "update_settings", "settings", "settings", { storeName: payload.storeName || "Tienda La Bendición" });
  return res.json({ ok: true, message: "Configuración actualizada." });
});

app.get("/api/backup", authenticateToken, requirePermission("backup:write"), async (req, res) => {
  return res.json({ exportedAt: new Date().toISOString(), data: await getStatePayload() });
});

app.post("/api/backup/restore", authenticateToken, requirePermission("backup:write"), async (req, res) => {
  console.log('/api/backup/restore called by', req.user?.username);
  const payload = req.body || {};
  const data = payload.data || payload;
  // basic validation
  const required = ["products", "clients", "sales", "debts", "apartados", "expenses", "suppliers", "purchases", "cash", "settings"];
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) {
      return res.status(400).json({ message: `Backup inválido: falta ${key}` });
    }
  }

  const fs = require("fs");
  const path = require("path");
  const backupDir = path.join(__dirname, "data", "backups");
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(backupDir, `tenderopro-db-backup-${timestamp}.db`);

  // copy current DB file as safety
  try {
    const { dbPath } = require("./db");
    fs.copyFileSync(dbPath, backupFile);
  } catch (err) {
    console.error("No pudo crear backup de seguridad:", err);
    return res.status(500).json({ message: "No se pudo crear backup de seguridad antes de restaurar." });
  }

  // perform restore inside transaction
  try {
    await run("BEGIN TRANSACTION");
    await syncState(data);
    await run("COMMIT");
    await createAuditLog(req.user, "restore_backup", "backup", null, { restoredAt: new Date().toISOString() });
    return res.json({ ok: true, message: "Restore completado." });
  } catch (err) {
    console.error("Error durante restore:", err);
    try { await run("ROLLBACK"); } catch (e) { console.error('rollback failed', e); }
    return res.status(500).json({ message: "Error al restaurar backup.", error: String(err && err.message ? err.message : err) });
  }
});

app.use((req, res) => {
  res.sendFile(path.join(staticRoot, "index.html"));
});

async function startServer() {
  await startupPromise;

  app.listen(PORT, () => {
    console.log(`TenderoPro API running on http://localhost:${PORT}`);
  });
}

(async () => {
  try {
    await startupPromise;
  } catch (error) {
    console.error("No se pudo iniciar la base de datos del servidor:", error);
  }
})();

module.exports = { app, startServer };

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Error arrancando servidor:", error);
    process.exit(1);
  });
}

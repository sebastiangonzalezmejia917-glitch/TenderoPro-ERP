const STORAGE_KEY = "tenderopro-storage-v1";
const AUTH_STORAGE_KEY = "tenderopro-auth-v1";
const API_BASE = "/api";
const NOTICE_TIMEOUT = 2500;

const appState = {
  auth: {
    token: null,
    user: null
  },
  products: [],
  clients: [],
  suppliers: [],
  purchases: [],
  sales: [],
  debts: [],
  apartados: [],
  expenses: [],
  cash: {
    open: false,
    openedAt: null,
    openedBy: null,
    base: 0,
    totalSales: 0,
    totalCashIn: 0,
    totalExpenses: 0,
    lastClosedAt: null
  },
  settings: {
    storeName: "Tienda La Bendición",
    storePhone: "",
    currency: "COP",
    interestRate: 0,
    dueDays: 7
  },
  cart: []
};

const elements = {
  appShell: document.getElementById("appShell"),
  authOverlay: document.getElementById("authOverlay"),
  loginForm: document.getElementById("loginForm"),
  notice: document.getElementById("notice"),
  authUser: document.getElementById("authUser"),
  logoutBtn: document.getElementById("logoutBtn"),
  tabButtons: document.querySelectorAll(".tab-btn"),
  dashboardStats: document.getElementById("dashboardStats"),
  dashboardSummary: document.getElementById("dashboardSummary"),
  alertList: document.getElementById("alertList"),
  posSearch: document.getElementById("posSearch"),
  productPicker: document.getElementById("productPicker"),
  cartItems: document.getElementById("cartItems"),
  subtotalLabel: document.getElementById("subtotalLabel"),
  discountLabel: document.getElementById("discountLabel"),
  totalLabel: document.getElementById("totalLabel"),
  receivedLabel: document.getElementById("receivedLabel"),
  changeLabel: document.getElementById("changeLabel"),
  inventoryList: document.getElementById("inventoryList"),
  movementProductSelect: document.getElementById("movementProductSelect"),
  purchaseSupplierSelect: document.getElementById("purchaseSupplierSelect"),
  purchaseProductSelect: document.getElementById("purchaseProductSelect"),
  purchaseQty: document.getElementById("purchaseQty"),
  purchaseCostPrice: document.getElementById("purchaseCostPrice"),
  suppliersList: document.getElementById("suppliersList"),
  purchasesList: document.getElementById("purchasesList"),
  salesList: document.getElementById("salesList"),
  clientsList: document.getElementById("clientsList"),
  creditsList: document.getElementById("creditsList"),
  apartadosList: document.getElementById("apartadosList"),
  expensesList: document.getElementById("expensesList"),
  cashSummary: document.getElementById("cashSummary"),
  storeNameHeader: document.getElementById("storeNameHeader"),
  connectionStatus: document.getElementById("connectionStatus"),
  exportBackupBtn: document.getElementById("exportBackupBtn"),
  importBackupInput: document.getElementById("importBackupInput"),
  reportsSales: document.getElementById("reportsSales"),
  reportsInventory: document.getElementById("reportsInventory"),
  reportsFinance: document.getElementById("reportsFinance"),
  inventoryMovementForm: document.getElementById("inventoryMovementForm"),
  posPaymentForm: document.getElementById("posPaymentForm"),
  productForm: document.getElementById("productForm"),
  clientForm: document.getElementById("clientForm"),
  supplierForm: document.getElementById("supplierForm"),
  purchaseForm: document.getElementById("purchaseForm"),
  creditForm: document.getElementById("creditForm"),
  apartadoForm: document.getElementById("apartadoForm"),
  expenseForm: document.getElementById("expenseForm"),
  userForm: document.getElementById("userForm"),
  usersList: document.getElementById("usersList"),
  cashOpenForm: document.getElementById("cashOpenForm"),
  closeCashBtn: document.getElementById("closeCashBtn"),
  creditClientSelect: document.getElementById("creditClientSelect"),
  apartadoClientSelect: document.getElementById("apartadoClientSelect"),
  movementType: document.getElementById("movementType"),
  movementQty: document.getElementById("movementQty"),
  discountInput: document.getElementById("discountInput"),
  clearCartBtn: document.getElementById("clearCartBtn"),
  cancelSaleBtn: document.getElementById("cancelSaleBtn"),
  cashBaseInput: document.getElementById("cashBaseInput"),
  cashUserInput: document.getElementById("cashUserInput")
};

initialize();

async function initialize() {
  restoreAuthSession();
  hydrateState();
  bindEvents();
  renderAuthState();
  updateConnectionStatus();
  renderAll();

  if (!appState.auth.token) {
    await tryAutoLogin();
  } else {
    await loadStateFromServer();
  }

  registerServiceWorker();
}

async function tryAutoLogin() {
  try {
    const response = await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: "admin", password: "admin123" })
    });

    setAuthSession(response);
    await loadStateFromServer();
    showNotice("Sesión activa en modo rápido.");
  } catch (error) {
    console.warn("Auto-login fallido:", error.message);
    const manualUser = localStorage.getItem("tenderopro-last-user");
    if (manualUser) {
      elements.authUser.textContent = `Usuario: ${manualUser}`;
    }
  }
}

function hydrateState() {
  const saved = loadData();
  appState.products = saved.products || [];
  appState.clients = saved.clients || [];
  appState.suppliers = saved.suppliers || [];
  appState.purchases = saved.purchases || [];
  appState.sales = saved.sales || [];
  appState.debts = saved.debts || [];
  appState.apartados = saved.apartados || [];
  appState.expenses = saved.expenses || [];
  appState.cash = { ...appState.cash, ...(saved.cash || {}) };
  appState.settings = { ...appState.settings, ...(saved.settings || {}) };
  appState.cart = [];
  if (!appState.settings.storeName) appState.settings.storeName = "Tienda La Bendición";
  elements.storeNameHeader.textContent = appState.settings.storeName;
}

function restoreAuthSession() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    appState.auth = {
      token: parsed.token || null,
      user: parsed.user || null
    };
  } catch (error) {
    console.error("No se pudo restaurar la sesión:", error);
    appState.auth = { token: null, user: null };
  }
}

function persistAuthSession() {
  if (!appState.auth?.token) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }

  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
    token: appState.auth.token,
    user: appState.auth.user
  }));

  if (appState.auth.user?.username) {
    localStorage.setItem("tenderopro-last-user", appState.auth.user.username);
  }
}

function setAuthSession(data) {
  appState.auth = {
    token: data.token,
    user: data.user || null
  };
  persistAuthSession();
  renderAuthState();
}

function clearAuthSession() {
  appState.auth = { token: null, user: null };
  persistAuthSession();
  renderAuthState();
}

function renderAuthState() {
  const loggedIn = Boolean(appState.auth.token);
  elements.appShell.style.display = loggedIn ? "block" : "none";
  elements.authOverlay.style.display = loggedIn ? "none" : "flex";
  const currentUser = appState.auth.user?.username || (appState.auth.token ? "admin" : "Invitado");
  elements.authUser.textContent = loggedIn ? `Usuario: ${currentUser}` : "Invitado";
  elements.logoutBtn.style.display = loggedIn ? "inline-flex" : "none";
}

function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (appState.auth?.token) {
    headers.set("Authorization", `Bearer ${appState.auth.token}`);
  }

  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  }).then(async (response) => {
    const isJson = response.headers.get("content-type")?.includes("application/json");
    const payload = isJson ? await response.json() : null;

    if (!response.ok) {
      throw new Error(payload?.message || "Error en la API");
    }

    return payload;
  });
}

async function loadStateFromServer() {
  if (!appState.auth?.token) return;

  try {
    const data = await apiRequest("/state");
    appState.products = data.products || [];
    appState.clients = data.clients || [];
    appState.suppliers = data.suppliers || [];
    appState.purchases = data.purchases || [];
    appState.sales = data.sales || [];
    appState.debts = data.debts || [];
    appState.apartados = data.apartados || [];
    appState.expenses = data.expenses || [];
    appState.cash = { ...appState.cash, ...(data.cash || {}) };
    appState.settings = { ...appState.settings, ...(data.settings || {}) };
    saveData();
    renderAll();
  } catch (error) {
    console.error("Sincronización remota fallida:", error);
    showNotice("No se pudo sincronizar con el servidor.");
  }
}

async function syncStateToServer() {
  if (!appState.auth?.token || !navigator.onLine) return;

  try {
    await apiRequest("/state", {
      method: "PUT",
      body: JSON.stringify({
        products: appState.products,
        clients: appState.clients,
        suppliers: appState.suppliers,
        purchases: appState.purchases,
        sales: appState.sales,
        debts: appState.debts,
        apartados: appState.apartados,
        expenses: appState.expenses,
        cash: appState.cash,
        settings: appState.settings
      })
    });
  } catch (error) {
    console.warn("No se pudo guardar en el servidor:", error);
  }
}

function bindEvents() {
  elements.tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.tab;
      elements.tabButtons.forEach((item) => item.classList.toggle("active", item === button));
      document.querySelectorAll(".view").forEach((section) => section.classList.toggle("active", section.id === `${tab}View`));
    });
  });

  elements.posSearch.addEventListener("input", renderProductPicker);
  elements.discountInput.addEventListener("input", updateTotalsAndPaymentState);
  elements.posPaymentForm.addEventListener("submit", handleSaleSubmit);
  elements.clearCartBtn.addEventListener("click", () => {
    appState.cart = [];
    renderCart();
    showNotice("Carrito vaciado.");
  });
  elements.cancelSaleBtn.addEventListener("click", () => {
    appState.cart = [];
    renderCart();
    showNotice("Venta cancelada.");
  });

  elements.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const username = String(formData.get("username") || "").trim();
    const password = String(formData.get("password") || "");

    try {
      const response = await apiRequest("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password })
      });

      setAuthSession(response);
      localStorage.setItem("tenderopro-last-user", username);
      // force change password if required
      if (response.mustChangePassword) {
        let ok = false;
        while (!ok) {
          const np = prompt('Tu contraseña debe cambiarse. Ingresa la nueva contraseña (mínimo 6 caracteres):');
          if (!np || np.length < 6) { alert('La contraseña debe tener al menos 6 caracteres.'); continue; }
          try {
            await apiRequest('/auth/change-password', { method: 'POST', body: JSON.stringify({ newPassword: np }) });
            ok = true;
            showNotice('Contraseña actualizada.');
          } catch (e) {
            alert('No se pudo cambiar la contraseña: ' + e.message);
          }
        }
      }

      await loadStateFromServer();
      showNotice("Sesión iniciada correctamente.");
    } catch (error) {
      showNotice(error.message || "No se pudo iniciar sesión.");
    }
  });

  elements.logoutBtn.addEventListener("click", () => {
    clearAuthSession();
    showNotice("Sesión cerrada.");
  });

  elements.inventoryMovementForm.addEventListener("submit", handleMovementSubmit);
  elements.productForm.addEventListener("submit", handleProductSubmit);
  elements.supplierForm.addEventListener("submit", handleSupplierSubmit);
  elements.purchaseForm.addEventListener("submit", handlePurchaseSubmit);
  elements.clientForm.addEventListener("submit", handleClientSubmit);
  elements.creditForm.addEventListener("submit", handleCreditSubmit);
  elements.apartadoForm.addEventListener("submit", handleApartadoSubmit);
  elements.expenseForm.addEventListener("submit", handleExpenseSubmit);
  elements.userForm.addEventListener("submit", handleUserSubmit);
  elements.cashOpenForm.addEventListener("submit", handleCashOpen);
  elements.closeCashBtn.addEventListener("click", handleCashClose);
  elements.exportBackupBtn.addEventListener("click", exportBackup);
  elements.importBackupInput.addEventListener("change", importBackup);

  elements.posPaymentForm.querySelectorAll('input[type="number"]').forEach((input) => {
    input.addEventListener("input", updateTotalsAndPaymentState);
  });

  window.addEventListener("online", () => {
    updateConnectionStatus();
    showNotice("Conexión restablecida.");
  });
  window.addEventListener("offline", () => {
    updateConnectionStatus();
    showNotice("Sin conexión. La app sigue funcionando localmente.");
  });
}

function renderAll() {
  renderDashboard();
  renderProductPicker();
  renderCart();
  renderInventory();
  renderSuppliers();
  renderClients();
  renderCredits();
  renderApartados();
  renderExpenses();
  renderCash();
  renderSales();
  renderReports();
  renderUsers();
  renderPurchases();
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { products: [], clients: [], sales: [], debts: [], apartados: [], expenses: [], cash: {}, settings: {} };
  } catch (error) {
    console.error(error);
    return { products: [], clients: [], sales: [], debts: [], apartados: [], expenses: [], cash: {}, settings: {} };
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products: appState.products,
    clients: appState.clients,
    suppliers: appState.suppliers,
    purchases: appState.purchases,
    sales: appState.sales,
    debts: appState.debts,
    apartados: appState.apartados,
    expenses: appState.expenses,
    cash: appState.cash,
    settings: appState.settings
  }));

  if (appState.auth?.token && navigator.onLine) {
    window.setTimeout(() => syncStateToServer(), 200);
  }
}

function showNotice(message, duration = NOTICE_TIMEOUT) {
  elements.notice.textContent = message;
  clearTimeout(showNotice.timer);
  showNotice.timer = setTimeout(() => {
    elements.notice.textContent = "";
  }, duration);
}

function currency(value) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatDate(dateValue) {
  const date = dateValue ? new Date(dateValue) : new Date();
  return Number.isNaN(date.getTime()) ? "Sin fecha" : new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" }).format(date);
}

function formatDateTime(dateValue) {
  const date = dateValue ? new Date(dateValue) : new Date();
  return Number.isNaN(date.getTime()) ? "Sin fecha" : new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function createId(prefix = "id") {
  return `${prefix}-${Math.random().toString(16).slice(2)}-${Date.now().toString(36)}`;
}

function updateConnectionStatus() {
  const isOnline = navigator.onLine;
  elements.connectionStatus.textContent = isOnline ? "Online" : "Offline";
  elements.connectionStatus.classList.toggle("online", isOnline);
  elements.connectionStatus.classList.toggle("offline", !isOnline);
}

function addProductToCart(productId) {
  const product = appState.products.find((item) => item.id === productId);
  if (!product) return;

  const existing = appState.cart.find((item) => item.id === productId);
  if (existing) {
    existing.quantity += 1;
  } else {
    appState.cart.push({ id: product.id, name: product.name, price: Number(product.salePrice || 0), quantity: 1, sku: product.sku });
  }

  renderCart();
}

function changeCartQuantity(productId, delta) {
  const item = appState.cart.find((entry) => entry.id === productId);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) {
    appState.cart = appState.cart.filter((entry) => entry.id !== productId);
  }
  renderCart();
}

function renderProductPicker() {
  const query = (elements.posSearch.value || "").toLowerCase().trim();
  const filtered = appState.products.filter((product) => {
    const haystack = `${product.name} ${product.sku} ${product.barcode || ""}`.toLowerCase();
    return haystack.includes(query);
  }).slice(0, 12);

  if (!filtered.length) {
    elements.productPicker.innerHTML = '<div class="empty-state">No hay productos para mostrar.</div>';
    return;
  }

  elements.productPicker.innerHTML = filtered.map((product) => `
    <div class="product-item">
      <div>
        <strong>${product.name}</strong>
        <div class="meta">SKU: ${product.sku} · Stock: ${product.stock}</div>
      </div>
      <div>
        <div class="meta">${currency(product.salePrice)}</div>
        <button class="btn" type="button" data-product-id="${product.id}">Agregar</button>
      </div>
    </div>
  `).join("");

  elements.productPicker.querySelectorAll("[data-product-id]").forEach((button) => {
    button.addEventListener("click", () => addProductToCart(button.dataset.productId));
  });
}

function getCartSubtotal() {
  return appState.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function updateTotalsAndPaymentState() {
  const subtotal = getCartSubtotal();
  const discount = Number(elements.discountInput.value || 0);
  const total = Math.max(subtotal - discount, 0);
  const paymentInputs = Array.from(elements.posPaymentForm.querySelectorAll('input[type="number"]'));
  const received = paymentInputs.reduce((sum, input) => sum + Number(input.value || 0), 0);
  const change = Math.max(received - total, 0);

  elements.subtotalLabel.textContent = currency(subtotal);
  elements.discountLabel.textContent = currency(discount);
  elements.totalLabel.textContent = currency(total);
  elements.receivedLabel.textContent = currency(received);
  elements.changeLabel.textContent = currency(change);
}

function renderCart() {
  if (!appState.cart.length) {
    elements.cartItems.innerHTML = '<div class="empty-state">El carrito está vacío.</div>';
    updateTotalsAndPaymentState();
    return;
  }

  elements.cartItems.innerHTML = appState.cart.map((item) => `
    <div class="cart-row">
      <div>
        <strong>${item.name}</strong>
        <div class="meta">${currency(item.price)} c/u</div>
      </div>
      <div class="qty">
        <button type="button" data-op="minus" data-product-id="${item.id}">-</button>
        <span>${item.quantity}</span>
        <button type="button" data-op="plus" data-product-id="${item.id}">+</button>
      </div>
    </div>
  `).join("");

  elements.cartItems.querySelectorAll("[data-product-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const productId = button.dataset.productId;
      if (button.dataset.op === "plus") changeCartQuantity(productId, 1);
      if (button.dataset.op === "minus") changeCartQuantity(productId, -1);
    });
  });

  updateTotalsAndPaymentState();
}

function handleSaleSubmit(event) {
  event.preventDefault();

  if (!appState.cart.length) {
    showNotice("Agrega productos al carrito antes de vender.");
    return;
  }

  const subtotal = getCartSubtotal();
  const discount = Number(elements.discountInput.value || 0);
  const total = Math.max(subtotal - discount, 0);
  const paymentValues = {
    efectivo: Number(elements.posPaymentForm.elements.efectivo.value || 0),
    nequi: Number(elements.posPaymentForm.elements.nequi.value || 0),
    daviplata: Number(elements.posPaymentForm.elements.daviplata.value || 0),
    transferencia: Number(elements.posPaymentForm.elements.transferencia.value || 0),
    tarjeta: Number(elements.posPaymentForm.elements.tarjeta.value || 0),
    otro: Number(elements.posPaymentForm.elements.otro.value || 0)
  };

  const received = Object.values(paymentValues).reduce((sum, value) => sum + value, 0);
  if (received < total) {
    showNotice("El valor recibido es menor al total de la venta.");
    return;
  }

  const sale = {
    id: createId("sale"),
    createdAt: new Date().toISOString(),
    items: appState.cart.map((item) => ({ ...item })),
    subtotal,
    discount,
    total,
    payment: paymentValues,
    received,
    change: received - total,
    status: "completed"
  };

  appState.sales.unshift(sale);

  appState.cart.forEach((item) => {
    const product = appState.products.find((entry) => entry.id === item.id);
    if (product) {
      product.stock = Math.max(0, Number(product.stock || 0) - Number(item.quantity || 0));
      product.updatedAt = new Date().toISOString();
    }
  });

  if (appState.cash.open) {
    appState.cash.totalSales += total;
    appState.cash.totalCashIn += received;
  }

  appState.cart = [];
  elements.posPaymentForm.reset();
  elements.discountInput.value = 0;
  saveData();
  renderAll();
  showNotice("Venta registrada correctamente.");
}

function renderSales() {
  if (!appState.sales.length) {
    elements.salesList.innerHTML = '<div class="empty-state">No hay ventas registradas.</div>';
    return;
  }

  elements.salesList.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Productos</th>
          <th>Total</th>
          <th>Pago</th>
        </tr>
      </thead>
      <tbody>
        ${appState.sales.slice(0, 10).map((sale) => `
          <tr>
            <td>${formatDateTime(sale.createdAt)}</td>
            <td>${sale.items.map((item) => `${item.name} x${item.quantity}`).join(", ")}</td>
            <td>${currency(sale.total)}</td>
            <td>${Object.entries(sale.payment).filter(([, value]) => value > 0).map(([method, value]) => `${method}: ${currency(value)}`).join(" / ") || "Efectivo"}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function handleProductSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const product = {
    id: createId("prod"),
    sku: String(formData.get("sku") || "").trim(),
    barcode: String(formData.get("barcode") || "").trim(),
    name: String(formData.get("name") || "").trim(),
    brand: String(formData.get("brand") || "").trim(),
    category: String(formData.get("category") || "").trim(),
    supplier: String(formData.get("supplier") || "").trim(),
    purchasePrice: Number(formData.get("purchasePrice") || 0),
    salePrice: Number(formData.get("salePrice") || 0),
    stock: Number(formData.get("stock") || 0),
    minStock: Number(formData.get("minStock") || 0),
    maxStock: Number(formData.get("maxStock") || 0),
    unit: String(formData.get("unit") || "und").trim(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (!product.name || !product.sku || !product.salePrice) {
    showNotice("Completa nombre, SKU y precio de venta.");
    return;
  }

  appState.products.unshift(product);
  event.currentTarget.reset();
  saveData();
  renderAll();
  showNotice("Producto guardado correctamente.");
}

async function handleSupplierSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const payload = {
    name: String(formData.get("name") || "").trim(),
    phone: String(formData.get("phone") || "").trim(),
    whatsapp: String(formData.get("whatsapp") || "").trim(),
    nit: String(formData.get("nit") || "").trim(),
    email: String(formData.get("email") || "").trim(),
    address: String(formData.get("address") || "").trim(),
    contact: String(formData.get("contact") || "").trim()
  };

  if (!payload.name) {
    showNotice("El nombre del proveedor es obligatorio.");
    return;
  }

  try {
    const supplier = await apiRequest("/suppliers", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    appState.suppliers.unshift(supplier);
    event.currentTarget.reset();
    saveData();
    renderSuppliers();
    showNotice("Proveedor guardado.");
  } catch (error) {
    showNotice(error.message || "No se pudo guardar el proveedor.");
  }
}

async function handlePurchaseSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const supplierId = elements.purchaseSupplierSelect.value;
  const productId = elements.purchaseProductSelect.value;
  const quantity = Number(elements.purchaseQty.value || 0);
  const costPrice = Number(elements.purchaseCostPrice.value || 0);

  if (!supplierId || !productId || quantity <= 0) {
    showNotice("Selecciona proveedor, producto y cantidad válidas.");
    return;
  }

  try {
    const purchase = await apiRequest("/purchases", {
      method: "POST",
      body: JSON.stringify({
        supplierId,
        invoiceNumber: String(formData.get("invoiceNumber") || "").trim(),
        date: String(formData.get("date") || new Date().toISOString().slice(0, 10)),
        paymentMethod: String(formData.get("paymentMethod") || "Efectivo"),
        items: [{ productId, productName: appState.products.find((item) => item.id === productId)?.name || "", quantity, costPrice }]
      })
    });

    appState.purchases.unshift(purchase);
    const product = appState.products.find((item) => item.id === productId);
    if (product) {
      product.purchasePrice = costPrice || Number(product.purchasePrice || 0);
      product.stock = Number(product.stock || 0) + quantity;
      product.updatedAt = new Date().toISOString();
    }

    event.currentTarget.reset();
    elements.purchaseQty.value = 1;
    elements.purchaseCostPrice.value = 0;
    saveData();
    renderAll();
    showNotice("Compra registrada.");
  } catch (error) {
    showNotice(error.message || "No se pudo registrar la compra.");
  }
}

function renderInventory() {
  const select = elements.movementProductSelect;
  const purchaseProductSelect = elements.purchaseProductSelect;
  select.innerHTML = appState.products.map((product) => `<option value="${product.id}">${product.name} (${product.stock})</option>`).join("");
  purchaseProductSelect.innerHTML = appState.products.map((product) => `<option value="${product.id}">${product.name}</option>`).join("");

  if (!appState.products.length) {
    elements.inventoryList.innerHTML = '<div class="empty-state">No hay productos en inventario.</div>';
    return;
  }

  elements.inventoryList.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Producto</th>
          <th>SKU</th>
          <th>Compra</th>
          <th>Venta</th>
          <th>Stock</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        ${appState.products.map((product) => {
          const state = Number(product.stock) <= Number(product.minStock || 0) ? "Stock bajo" : "Activo";
          return `
            <tr>
              <td>${product.name}</td>
              <td>${product.sku}</td>
              <td>${currency(product.purchasePrice)}</td>
              <td>${currency(product.salePrice)}</td>
              <td>${product.stock}</td>
              <td>${state}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

function renderSuppliers() {
  const select = elements.purchaseSupplierSelect;
  select.innerHTML = appState.suppliers.map((supplier) => `<option value="${supplier.id}">${supplier.name}</option>`).join("");

  if (!appState.suppliers.length) {
    elements.suppliersList.innerHTML = '<div class="empty-state">No hay proveedores registrados.</div>';
    return;
  }

  elements.suppliersList.innerHTML = appState.suppliers.map((supplier) => `
    <div class="card-item">
      <div>
        <strong>${supplier.name}</strong>
        <div class="meta">${supplier.phone || "Sin teléfono"} · ${supplier.email || "Sin email"}</div>
      </div>
      <span class="chip">${supplier.active === false ? "Inactivo" : "Activo"}</span>
    </div>
  `).join("");
}

function renderPurchases() {
  if (!appState.purchases.length) {
    elements.purchasesList.innerHTML = '<div class="empty-state">No hay compras registradas.</div>';
    return;
  }

  elements.purchasesList.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Proveedor</th>
          <th>Factura</th>
          <th>Fecha</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${appState.purchases.map((purchase) => {
          const supplier = appState.suppliers.find((item) => item.id === purchase.supplierId);
          return `
            <tr>
              <td>${supplier ? supplier.name : "Proveedor"}</td>
              <td>${purchase.invoiceNumber || "-"}</td>
              <td>${formatDate(purchase.date)}</td>
              <td>${currency(purchase.total || 0)}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

async function renderUsers() {
  if (!appState.auth?.token) {
    elements.usersList.innerHTML = '<div class="empty-state">Inicia sesión para ver usuarios.</div>';
    return;
  }

  try {
    const users = await apiRequest("/users");
    if (!users.length) {
      elements.usersList.innerHTML = '<div class="empty-state">No hay usuarios registrados.</div>';
      return;
    }

    elements.usersList.innerHTML = users.map((user) => `
      <div class="card-item">
        <div>
          <strong>${user.username}</strong>
          <div class="meta">${user.role} · ${user.active ? "Activo" : "Inactivo"}</div>
        </div>
      </div>
    `).join("");
  } catch (error) {
    elements.usersList.innerHTML = '<div class="empty-state">No se pudieron cargar los usuarios.</div>';
  }
}

async function handleUserSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");
  const role = String(formData.get("role") || "EMPLEADO");

  if (!username || !password || password.length < 6) {
    showNotice("Usa usuario y contraseña válida (mínimo 6 caracteres).");
    return;
  }

  try {
    await apiRequest("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password, role })
    });

    event.currentTarget.reset();
    await renderUsers();
    showNotice("Usuario creado correctamente.");
  } catch (error) {
    showNotice(error.message || "No se pudo crear el usuario.");
  }
}

function handleMovementSubmit(event) {
  event.preventDefault();
  const productId = elements.movementProductSelect.value;
  const type = elements.movementType.value;
  const quantity = Number(elements.movementQty.value || 0);

  if (!productId || quantity <= 0) {
    showNotice("Selecciona un producto y cantidad válida.");
    return;
  }

  const product = appState.products.find((item) => item.id === productId);
  if (!product) return;

  const currentStock = Number(product.stock || 0);
  const nextStock = type === "entrada" ? currentStock + quantity : type === "salida" ? currentStock - quantity : currentStock;

  if (type !== "entrada" && nextStock < 0) {
    showNotice("No se puede registrar una salida mayor al stock disponible.");
    return;
  }

  product.stock = Math.max(0, nextStock);
  product.updatedAt = new Date().toISOString();
  saveData();
  renderAll();
  showNotice(`Movimiento ${type} registrado.`);
}

function handleClientSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const client = {
    id: createId("client"),
    name: String(formData.get("name") || "").trim(),
    phone: String(formData.get("phone") || "").trim(),
    whatsapp: String(formData.get("whatsapp") || "").trim(),
    address: String(formData.get("address") || "").trim(),
    familyContact: String(formData.get("familyContact") || "").trim(),
    createdAt: new Date().toISOString(),
    active: true
  };

  if (!client.name) {
    showNotice("El nombre del cliente es obligatorio.");
    return;
  }

  appState.clients.unshift(client);
  event.currentTarget.reset();
  saveData();
  renderAll();
  showNotice("Cliente guardado.");
}

function renderClients() {
  const creditSelect = elements.creditClientSelect;
  const apartSelect = elements.apartadoClientSelect;
  const options = appState.clients.map((client) => `<option value="${client.id}">${client.name}</option>`).join("");
  creditSelect.innerHTML = options;
  apartSelect.innerHTML = options;

  if (!appState.clients.length) {
    elements.clientsList.innerHTML = '<div class="empty-state">No hay clientes registrados.</div>';
    return;
  }

  elements.clientsList.innerHTML = appState.clients.map((client) => `
    <div class="card-item">
      <div>
        <strong>${client.name}</strong>
        <div class="meta">${client.phone || "Sin teléfono"} · ${client.whatsapp || "Sin WhatsApp"}</div>
      </div>
      <button type="button" class="btn btn-secondary">Ver</button>
    </div>
  `).join("");
}

function handleCreditSubmit(event) {
  event.preventDefault();
  const clientId = elements.creditClientSelect.value;
  const amount = Number(event.currentTarget.amount.value || 0);
  const concept = String(event.currentTarget.concept.value || "").trim();

  if (!clientId || !amount) {
    showNotice("Selecciona cliente y monto válido.");
    return;
  }

  const debt = {
    id: createId("debt"),
    clientId,
    amount,
    balance: amount,
    concept: concept || "Fiado",
    status: "pendiente",
    createdAt: new Date().toISOString(),
    payments: []
  };

  appState.debts.unshift(debt);
  event.currentTarget.reset();
  saveData();
  renderCredits();
  showNotice("Fiado registrado.");
}

function renderCredits() {
  if (!appState.debts.length) {
    elements.creditsList.innerHTML = '<div class="empty-state">No hay fiados registrados.</div>';
    return;
  }

  elements.creditsList.innerHTML = appState.debts.map((debt) => {
    const client = appState.clients.find((entry) => entry.id === debt.clientId);
    return `
      <div class="card-item">
        <div>
          <strong>${client ? client.name : "Cliente"}</strong>
          <div class="meta">${debt.concept} · Saldo ${currency(debt.balance)}</div>
        </div>
        <button type="button" class="btn btn-secondary" data-debt-id="${debt.id}">Abonar</button>
      </div>
    `;
  }).join("");

  elements.creditsList.querySelectorAll("[data-debt-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const debt = appState.debts.find((entry) => entry.id === button.dataset.debtId);
      if (!debt) return;
      const amount = Number(prompt("Ingrese el valor del abono:", "0") || 0);
      if (!amount || amount <= 0) return;
      debt.balance = Math.max(0, debt.balance - amount);
      debt.payments.push({ amount, createdAt: new Date().toISOString() });
      if (debt.balance <= 0) debt.status = "pagado";
      saveData();
      renderCredits();
      showNotice("Abono registrado.");
    });
  });
}

function handleApartadoSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const clientId = elements.apartadoClientSelect.value;
  const total = Number(formData.get("total") || 0);
  const initialPayment = Number(formData.get("initialPayment") || 0);
  const dueDate = String(formData.get("dueDate") || "").trim();

  if (!clientId || !total || total <= 0) {
    showNotice("Selecciona cliente y un valor válido para el apartado.");
    return;
  }

  const apartado = {
    id: createId("apartado"),
    clientId,
    productName: String(formData.get("productName") || "").trim(),
    totalAmount: total,
    totalPaid: initialPayment,
    status: "activo",
    dueDate,
    createdAt: new Date().toISOString(),
    payments: [{ amount: initialPayment, createdAt: new Date().toISOString(), type: "abono inicial" }]
  };

  appState.apartados.unshift(apartado);
  event.currentTarget.reset();
  saveData();
  renderApartados();
  showNotice("Apartado guardado.");
}

function renderApartados() {
  if (!appState.apartados.length) {
    elements.apartadosList.innerHTML = '<div class="empty-state">No hay apartados registrados.</div>';
    return;
  }

  elements.apartadosList.innerHTML = appState.apartados.map((apartado) => {
    const client = appState.clients.find((entry) => entry.id === apartado.clientId);
    const remaining = Math.max(apartado.totalAmount - apartado.totalPaid, 0);
    return `
      <div class="card-item">
        <div>
          <strong>${apartado.productName}</strong>
          <div class="meta">${client ? client.name : "Cliente"} · saldo ${currency(remaining)} · vence ${apartado.dueDate || "sin fecha"}</div>
        </div>
        <button type="button" class="btn btn-secondary" data-apartado-id="${apartado.id}">Abonar</button>
      </div>
    `;
  }).join("");

  elements.apartadosList.querySelectorAll("[data-apartado-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const apartado = appState.apartados.find((entry) => entry.id === button.dataset.apartadoId);
      if (!apartado) return;
      const amount = Number(prompt("Ingrese el abono del apartado:", "0") || 0);
      if (!amount || amount <= 0) return;
      apartado.totalPaid += amount;
      apartado.payments.push({ amount, createdAt: new Date().toISOString(), type: "abono" });
      apartado.status = apartado.totalPaid >= apartado.totalAmount ? "pagado" : "activo";
      saveData();
      renderApartados();
      showNotice("Abono de apartado registrado.");
    });
  });
}

function handleExpenseSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const expense = {
    id: createId("exp"),
    category: String(formData.get("category") || "").trim(),
    amount: Number(formData.get("amount") || 0),
    concept: String(formData.get("concept") || "").trim(),
    date: String(formData.get("date") || new Date().toISOString().slice(0, 10)),
    method: String(formData.get("method") || "Efectivo").trim(),
    createdAt: new Date().toISOString()
  };

  if (!expense.concept || !expense.amount) {
    showNotice("Concepto y valor del gasto son obligatorios.");
    return;
  }

  appState.expenses.unshift(expense);
  if (appState.cash.open) {
    appState.cash.totalExpenses += expense.amount;
  }
  event.currentTarget.reset();
  saveData();
  renderExpenses();
  renderDashboard();
  showNotice("Gasto registrado.");
}

function renderExpenses() {
  if (!appState.expenses.length) {
    elements.expensesList.innerHTML = '<div class="empty-state">No hay gastos registrados.</div>';
    return;
  }

  elements.expensesList.innerHTML = appState.expenses.map((expense) => `
    <div class="expense-item">
      <div>
        <strong>${expense.concept}</strong>
        <div class="meta">${expense.category} · ${formatDate(expense.date)} · ${expense.method}</div>
      </div>
      <strong>${currency(expense.amount)}</strong>
    </div>
  `).join("");
}

function handleCashOpen(event) {
  event.preventDefault();
  const base = Number(elements.cashBaseInput.value || 0);
  const user = String(elements.cashUserInput.value || "Admin").trim();

  appState.cash = {
    open: true,
    openedAt: new Date().toISOString(),
    openedBy: user,
    base,
    totalSales: 0,
    totalCashIn: 0,
    totalExpenses: 0,
    lastClosedAt: null
  };

  saveData();
  renderCash();
  showNotice("Caja abierta.");
}

function handleCashClose() {
  if (!appState.cash.open) {
    showNotice("La caja no está abierta.");
    return;
  }

  const expectedCash = Number(appState.cash.base || 0) + Number(appState.cash.totalSales || 0) - Number(appState.cash.totalExpenses || 0);
  const cashCounted = Number(prompt("Ingrese el efectivo contado al cerrar caja:", String(expectedCash)) || 0);

  appState.cash.open = false;
  appState.cash.lastClosedAt = new Date().toISOString();
  appState.cash.closedBy = appState.cash.openedBy;
  appState.cash.cashCounted = cashCounted;
  appState.cash.difference = cashCounted - expectedCash;

  saveData();
  renderCash();
  showNotice("Cierre de caja registrado.");
}

function renderCash() {
  const cash = appState.cash;
  const expectedCash = Number(cash.base || 0) + Number(cash.totalSales || 0) - Number(cash.totalExpenses || 0);
  elements.cashSummary.innerHTML = `
    <div class="item"><span>Estado</span><strong>${cash.open ? "Abierta" : "Cerrada"}</strong></div>
    <div class="item"><span>Base inicial</span><strong>${currency(cash.base || 0)}</strong></div>
    <div class="item"><span>Ventas</span><strong>${currency(cash.totalSales || 0)}</strong></div>
    <div class="item"><span>Gastos</span><strong>${currency(cash.totalExpenses || 0)}</strong></div>
    <div class="item"><span>Esperado</span><strong>${currency(expectedCash)}</strong></div>
    <div class="item"><span>Último cierre</span><strong>${cash.lastClosedAt ? formatDateTime(cash.lastClosedAt) : "Sin cierre"}</strong></div>
  `;
}

function renderDashboard() {
  const todaySales = appState.sales.filter((sale) => sale.createdAt && new Date(sale.createdAt).toDateString() === new Date().toDateString()).reduce((sum, sale) => sum + sale.total, 0);
  const totalExpenses = appState.expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const inventoryLow = appState.products.filter((product) => Number(product.stock) <= Number(product.minStock || 0)).length;
  const totalCustomersDebt = appState.debts.reduce((sum, debt) => sum + Number(debt.balance || 0), 0);
  const totalProductsStock = appState.products.reduce((sum, product) => sum + Number(product.stock || 0), 0);

  elements.dashboardStats.innerHTML = `
    <div class="stat-card">
      <span class="label">Ventas hoy</span>
      <span class="value">${currency(todaySales)}</span>
    </div>
    <div class="stat-card">
      <span class="label">Gastos hoy</span>
      <span class="value">${currency(totalExpenses)}</span>
    </div>
    <div class="stat-card">
      <span class="label">Caja</span>
      <span class="value">${currency(appState.cash.base || 0)}</span>
    </div>
    <div class="stat-card">
      <span class="label">Deuda por cobrar</span>
      <span class="value">${currency(totalCustomersDebt)}</span>
    </div>
  `;

  elements.dashboardSummary.innerHTML = `
    <div class="item"><span>Productos activos</span><strong>${appState.products.length}</strong></div>
    <div class="item"><span>Stock total</span><strong>${totalProductsStock}</strong></div>
    <div class="item"><span>Fiados</span><strong>${appState.debts.length}</strong></div>
    <div class="item"><span>Apartados</span><strong>${appState.apartados.length}</strong></div>
  `;

  const alerts = appState.products.filter((product) => Number(product.stock) <= Number(product.minStock || 0));
  elements.alertList.innerHTML = alerts.length
    ? alerts.slice(0, 6).map((product) => `<div class="alert-item"><strong>${product.name}</strong><div class="meta">Stock bajo: ${product.stock}</div></div>`).join("")
    : '<div class="empty-state">Sin alertas por inventario.</div>';
}

function renderReports() {
  const totalSales = appState.sales.reduce((sum, sale) => sum + sale.total, 0);
  const totalInventoryValue = appState.products.reduce((sum, product) => sum + Number(product.stock || 0) * Number(product.purchasePrice || 0), 0);
  const totalDebt = appState.debts.reduce((sum, debt) => sum + Number(debt.balance || 0), 0);
  const totalExpenses = appState.expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

  elements.reportsSales.innerHTML = `
    <div class="item"><span>Ventas registradas</span><strong>${appState.sales.length}</strong></div>
    <div class="item"><span>Total recaudado</span><strong>${currency(totalSales)}</strong></div>
    <div class="item"><span>Gastos</span><strong>${currency(totalExpenses)}</strong></div>
  `;

  elements.reportsInventory.innerHTML = `
    <div class="item"><span>Valor inventario</span><strong>${currency(totalInventoryValue)}</strong></div>
    <div class="item"><span>Productos</span><strong>${appState.products.length}</strong></div>
    <div class="item"><span>Stock bajo</span><strong>${appState.products.filter((product) => Number(product.stock) <= Number(product.minStock || 0)).length}</strong></div>
  `;

  elements.reportsFinance.innerHTML = `
    <div class="item"><span>Total deuda</span><strong>${currency(totalDebt)}</strong></div>
    <div class="item"><span>Utilidad estimada</span><strong>${currency(Math.max(totalSales - totalExpenses, 0))}</strong></div>
    <div class="item"><span>Caja base</span><strong>${currency(appState.cash.base || 0)}</strong></div>
  `;
}

function exportBackup() {
  if (navigator.onLine && appState.auth?.token) {
    apiRequest('/backup').then((resp) => {
      const payload = JSON.stringify(resp, null, 2);
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `tenderopro-backup-${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      showNotice('Backup exportado (servidor).');
    }).catch(() => {
      const payload = JSON.stringify({ exportedAt: new Date().toISOString(), data: loadData() }, null, 2);
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `tenderopro-backup-${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      showNotice('Backup exportado (local).');
    });
    return;
  }

  const payload = JSON.stringify({ exportedAt: new Date().toISOString(), data: loadData() }, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `tenderopro-backup-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showNotice("Backup exportado (local).");
}

function importBackup(event) {
  const [file] = event.target.files || [];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      const payload = parsed.data ? parsed : parsed;
      if (navigator.onLine && appState.auth?.token) {
        if (!confirm('Restaurar backup en servidor. Esto creará un backup de seguridad y sobrescribirá los datos en el servidor. Continúa?')) {
          event.target.value = '';
          return;
        }
        apiRequest('/backup/restore', { method: 'POST', body: JSON.stringify(payload) }).then((resp) => {
          showNotice('Restore ejecutado en servidor. Actualizando estado local...');
          loadStateFromServer();
        }).catch((err) => {
          showNotice('Error restaurando en servidor: ' + (err.message || err));
        });
      } else {
        const nextData = parsed.data || parsed;
        appState.products = nextData.products || [];
        appState.clients = nextData.clients || [];
        appState.sales = nextData.sales || [];
        appState.debts = nextData.debts || [];
        appState.apartados = nextData.apartados || [];
        appState.expenses = nextData.expenses || [];
        appState.cash = nextData.cash || appState.cash;
        appState.settings = nextData.settings || appState.settings;
        saveData();
        renderAll();
        showNotice("Backup importado localmente.");
      }
    } catch (error) {
      console.error(error);
      showNotice("El archivo de respaldo no es válido.");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => console.error("Service worker error", error));
  });
}

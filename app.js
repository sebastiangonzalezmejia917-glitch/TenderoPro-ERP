const STORAGE_KEY_PREFIX = "apartados-store-v2";
const INSTANCE_STORAGE_KEY = "apartados-instance-id";
const noticeEl = document.getElementById("notice");
const listEl = document.getElementById("apartadosList");
const counterEl = document.getElementById("counter");
const formEl = document.getElementById("apartadoForm");
const resetBtn = document.getElementById("resetBtn");
const profileEl = document.getElementById("currentProfile");
const fiadoFormEl = document.getElementById("fiadoForm");
const fiadosListEl = document.getElementById("fiadosList");
const fabToggleEl = document.getElementById("fabToggle");

let apartados = loadApartados();
let fiados = loadFiados();
let isOnline = navigator.onLine;

init();

function init() {
  formEl.addEventListener("submit", handleCreateApartado);
  fiadoFormEl.addEventListener("submit", handleCreateFiado);
  resetBtn.addEventListener("click", resetAllData);
  listEl.addEventListener("submit", handlePaymentSubmit);
  listEl.addEventListener("click", handleShareClick);
  fiadosListEl.addEventListener("submit", handleFiadoPaymentSubmit);
  fiadosListEl.addEventListener("click", handleFiadoActionClick);
  fabToggleEl.addEventListener("click", () => {
    document.getElementById("fiadoName").focus();
  });
  window.addEventListener("online", handleNetworkChange);
  window.addEventListener("offline", handleNetworkChange);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  handleNetworkChange();
  render();
  registerServiceWorker();
}

function getProfileName() {
  const params = new URLSearchParams(window.location.search);
  const profile = params.get("perfil") || params.get("app");
  if (profile && profile.trim()) {
    return profile.trim();
  }

  let instanceId = sessionStorage.getItem(INSTANCE_STORAGE_KEY);
  if (!instanceId) {
    instanceId = `instancia-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    sessionStorage.setItem(INSTANCE_STORAGE_KEY, instanceId);
  }

  return instanceId;
}

function getStorageKey() {
  return `${STORAGE_KEY_PREFIX}-${getProfileName()}`;
}

function loadApartados() {
  try {
    const raw = localStorage.getItem(getStorageKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("No se pudieron leer los apartados", error);
    return [];
  }
}

function saveApartados() {
  localStorage.setItem(getStorageKey(), JSON.stringify(apartados));
  render();
}

function loadFiados() {
  try {
    const raw = localStorage.getItem(`${getStorageKey()}-fiados`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("No se pudieron leer los fiados", error);
    return [];
  }
}

function saveFiados() {
  localStorage.setItem(`${getStorageKey()}-fiados`, JSON.stringify(fiados));
  renderFiados();
}

function handleNetworkChange() {
  isOnline = navigator.onLine;
  const message = isOnline
    ? "Conexión activa. La app sigue disponible."
    : "Sin conexión. Tus datos se guardan localmente y la app sigue lista.";
  showNotice(message, isOnline ? 1800 : 3500);
}

function handleVisibilityChange() {
  if (document.visibilityState === "visible") {
    handleNetworkChange();
  }
}

function handleCreateApartado(event) {
  event.preventDefault();
  const productName = document.getElementById("productName").value.trim();
  const totalAmount = Number(document.getElementById("totalAmount").value);

  if (!productName || !Number.isFinite(totalAmount) || totalAmount <= 0) {
    showNotice("Completa el nombre y un monto válido.");
    return;
  }

  apartados.unshift({
    id: createId(),
    productName,
    totalAmount,
    totalPaid: 0,
    status: "pendiente",
    createdAt: new Date().toISOString(),
    completedAt: null,
    payments: []
  });

  formEl.reset();
  saveApartados();
  showNotice(`Apartado de ${productName} guardado.`);
}

function handleCreateFiado(event) {
  event.preventDefault();
  const fiadoName = document.getElementById("fiadoName").value.trim();
  const fiadoConcept = document.getElementById("fiadoConcept").value.trim();
  const fiadoTotal = Number(document.getElementById("fiadoTotal").value);
  const fiadoAbono = Number(document.getElementById("fiadoAbono").value);

  if (!fiadoName || !fiadoConcept || !Number.isFinite(fiadoTotal) || fiadoTotal <= 0 || !Number.isFinite(fiadoAbono) || fiadoAbono < 0) {
    showNotice("Completa todos los datos del fiado.");
    return;
  }

  const restante = Number(Math.max(fiadoTotal - fiadoAbono, 0).toFixed(2));

  fiados.unshift({
    id: createId(),
    fiadoName,
    fiadoConcept,
    fiadoTotal,
    fiadoAbono,
    restante,
    status: restante > 0 ? "pendiente" : "pagado",
    createdAt: new Date().toISOString()
  });

  fiadoFormEl.reset();
  saveFiados();
  showNotice(`Fiado de ${fiadoName} guardado.`);
}

function handleFiadoPaymentSubmit(event) {
  if (!event.target.classList.contains("payment-form")) return;

  event.preventDefault();
  const id = event.target.dataset.id;
  const amount = Number(event.target.amount.value);
  const note = event.target.note.value.trim();
  const fiado = fiados.find((item) => item.id === id);

  if (!fiado || !Number.isFinite(amount) || amount <= 0) {
    showNotice("Ingresa un abono válido para el fiado.");
    return;
  }

  fiado.fiadoAbono = Number((fiado.fiadoAbono + amount).toFixed(2));
  fiado.restante = Number(Math.max(fiado.fiadoTotal - fiado.fiadoAbono, 0).toFixed(2));
  fiado.status = fiado.restante > 0 ? "pendiente" : "pagado";

  saveFiados();
  showNotice(`Abono agregado a ${fiado.fiadoName}.`);
}

function handleFiadoActionClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const id = button.dataset.id;
  const fiado = fiados.find((item) => item.id === id);
  if (!fiado) return;

  if (button.dataset.action === "mark-paid") {
    fiado.status = "pagado";
    fiado.restante = 0;
    fiado.fiadoAbono = fiado.fiadoTotal;
  } else if (button.dataset.action === "mark-pending") {
    fiado.status = "pendiente";
    fiado.restante = Math.max(fiado.fiadoTotal - fiado.fiadoAbono, 0);
  }

  saveFiados();
  showNotice(`Fiado actualizado para ${fiado.fiadoName}.`);
}

function handlePaymentSubmit(event) {
  if (!event.target.classList.contains("payment-form")) return;

  event.preventDefault();
  const id = event.target.dataset.id;
  const amount = Number(event.target.amount.value);
  const note = event.target.note.value.trim();
  const apartado = apartados.find((item) => item.id === id);

  if (!apartado || !Number.isFinite(amount) || amount <= 0) {
    showNotice("Ingresa un abono válido.");
    return;
  }

  const timestamp = new Date();
  const payment = {
    id: createId(),
    amount,
    note: note || "Sin nota",
    createdAt: timestamp.toISOString(),
    dateLabel: formatDateTime(timestamp)
  };

  apartado.payments.unshift(payment);
  apartado.totalPaid = Number((apartado.totalPaid + amount).toFixed(2));
  apartado.status = apartado.totalPaid >= apartado.totalAmount ? "completado" : apartado.totalPaid > 0 ? "en-progreso" : "pendiente";
  apartado.completedAt = apartado.status === "completado" ? timestamp.toISOString() : null;

  saveApartados();
  showNotice(`Abono registrado. ${apartado.productName} ahora tiene ${formatCurrency(apartado.totalPaid)} pagados.`);
}

function handleShareClick(event) {
  const btn = event.target.closest(".share-btn");
  if (!btn) return;

  const apartado = apartados.find((item) => item.id === btn.dataset.id);
  if (!apartado) return;

  const statusText = apartado.status === "completado" ? "completado" : apartado.totalPaid > 0 ? "en progreso" : "pendiente";
  const message = `Apartado de ${apartado.productName}\nFecha y hora del último movimiento: ${formatDateTime(new Date())}\nEstado: ${statusText}\nTotal: ${formatCurrency(apartado.totalAmount)}\nPagado: ${formatCurrency(apartado.totalPaid)}\nRestante: ${formatCurrency(Math.max(apartado.totalAmount - apartado.totalPaid, 0))}`;

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;

  if (navigator.share) {
    navigator.share({
      title: `Apartado ${apartado.productName}`,
      text: message
    }).catch(() => window.open(whatsappUrl, "_blank", "noopener,noreferrer"));
  } else {
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  }
}

function render() {
  const profileName = getProfileName();
  if (profileEl) {
    profileEl.textContent = `Perfil: ${profileName}`;
  }
  counterEl.textContent = `${apartados.length} ${apartados.length === 1 ? "registro" : "registros"}`;
  renderFiados();

  if (!apartados.length) {
    listEl.innerHTML = `
      <div class="empty-state">
        <h3>Aún no hay apartados</h3>
        <p>Agrega el nombre del producto y el precio total para empezar.</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = apartados
    .map((apartado) => {
      const progress = Math.min((apartado.totalPaid / apartado.totalAmount) * 100, 100);
      const remaining = Math.max(apartado.totalAmount - apartado.totalPaid, 0);
      const statusClass = apartado.status === "completado" ? "status-complete" : apartado.status === "en-progreso" ? "status-progress" : "status-pending";
      const statusLabel = apartado.status === "completado" ? "Completado" : apartado.status === "en-progreso" ? "En progreso" : "Pendiente";

      return `
        <article class="apartado-card">
          <div class="card-head">
            <div>
              <h3>${escapeHtml(apartado.productName)}</h3>
              <p>Creado ${formatDateTime(new Date(apartado.createdAt))}</p>
            </div>
            <span class="status-chip ${statusClass}">${statusLabel}</span>
          </div>

          <div class="metric-row">
            <div class="metric">
              <small>Total</small>
              <strong>${formatCurrency(apartado.totalAmount)}</strong>
            </div>
            <div class="metric">
              <small>Pagado</small>
              <strong>${formatCurrency(apartado.totalPaid)}</strong>
            </div>
            <div class="metric">
              <small>Restante</small>
              <strong>${formatCurrency(remaining)}</strong>
            </div>
          </div>

          <div class="progress-bar" aria-label="Progreso del apartado">
            <span style="width: ${progress}%"></span>
          </div>

          <form class="payment-form" data-id="${apartado.id}">
            <input type="number" step="0.01" min="0.01" name="amount" placeholder="Monto del abono" required />
            <input type="text" name="note" placeholder="Nota opcional" />
            <button class="payment-btn" type="submit">Registrar</button>
          </form>

          <div class="action-row">
            <span class="pill">${apartado.payments.length} ${apartado.payments.length === 1 ? "abono" : "abonos"}</span>
            <button class="share-btn" type="button" data-id="${apartado.id}">Enviar mensaje</button>
          </div>

          <ul class="history">
            ${apartado.payments.length
              ? apartado.payments
                  .map(
                    (payment) => `
                      <li>
                        <strong>${formatCurrency(payment.amount)}</strong> · ${payment.note} · ${payment.dateLabel}
                      </li>
                    `
                  )
                  .join("")
              : '<li>No hay abonos registrados aún.</li>'}
          </ul>
        </article>
      `;
    })
    .join("");
}

function renderFiados() {
  if (!fiadosListEl) return;

  if (!fiados.length) {
    fiadosListEl.innerHTML = `
      <div class="empty-state">
        <h3>No hay fiados registrados</h3>
        <p>Agrega a quien le fiaron y se calculará su saldo automáticamente.</p>
      </div>
    `;
    return;
  }

  fiadosListEl.innerHTML = fiados
    .map((fiado) => {
      const statusClass = fiado.status === "pagado" ? "status-complete" : "status-pending";
      const statusLabel = fiado.status === "pagado" ? "Pagado" : "Pendiente";
      return `
        <article class="apartado-card">
          <div class="card-head">
            <div>
              <h3>${escapeHtml(fiado.fiadoName)}</h3>
              <p>${escapeHtml(fiado.fiadoConcept)}</p>
            </div>
            <span class="status-chip ${statusClass}">${statusLabel}</span>
          </div>
          <div class="metric-row">
            <div class="metric">
              <small>Total</small>
              <strong>${formatCurrency(fiado.fiadoTotal)}</strong>
            </div>
            <div class="metric">
              <small>Abono</small>
              <strong>${formatCurrency(fiado.fiadoAbono)}</strong>
            </div>
            <div class="metric">
              <small>Restante</small>
              <strong>${formatCurrency(fiado.restante)}</strong>
            </div>
          </div>

          <form class="payment-form" data-id="${fiado.id}">
            <input type="number" step="0.01" min="0.01" name="amount" placeholder="Agregar abono" required />
            <input type="text" name="note" placeholder="Nota opcional" />
            <button class="payment-btn" type="submit">Agregar</button>
          </form>

          <div class="action-row">
            <button class="share-btn" type="button" data-action="mark-paid" data-id="${fiado.id}">Marcar pagado</button>
            <button class="secondary-btn" type="button" data-action="mark-pending" data-id="${fiado.id}">Marcar pendiente</button>
            <button class="share-btn" type="button" onclick="window.print()">Imprimir comprobante</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function resetAllData() {
  const confirmed = confirm("¿Deseas borrar todos los apartados guardados para este perfil?");
  if (!confirmed) return;
  apartados = [];
  fiados = [];
  localStorage.removeItem(getStorageKey());
  localStorage.removeItem(`${getStorageKey()}-fiados`);
  render();
  showNotice("Se borraron todos los datos de este perfil.");
}

function showNotice(message, duration = 2800) {
  noticeEl.textContent = message;
  window.clearTimeout(showNotice.timeout);
  showNotice.timeout = window.setTimeout(() => {
    noticeEl.textContent = "";
  }, duration);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(date);
}

function createId() {
  return (window.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  const isSecureContext = window.location.protocol === "https:" || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  if (!isSecureContext) return;

  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("./sw.js", { scope: "./" });
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "refresh" });
      }
    } catch (error) {
      console.error("No se pudo registrar el service worker", error);
    }
  });
}

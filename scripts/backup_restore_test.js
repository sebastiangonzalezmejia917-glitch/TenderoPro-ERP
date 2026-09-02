const fetch = globalThis.fetch;
if (!fetch) throw new Error('global fetch is not available in this Node runtime');
const { run, get, all } = require('../db');

const BASE = process.env.BASE || 'http://localhost:3001';

async function login() {
  const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ username: 'admin', password: 'admin123' }) });
  const j = await r.json(); if (!r.ok) throw new Error('Login failed: '+JSON.stringify(j));
  return j.token;
}

function authHeaders(token){ return { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }; }

async function createTestData(token) {
  const marker = `TEST_BR_${Date.now()}`;
  const headers = authHeaders(token);
  const created = {};
  // create product
  let r = await fetch(`${BASE}/api/products`, { method: 'POST', headers, body: JSON.stringify({ sku: marker+'-PROD', name: 'Producto Test BR', salePrice: 10000, purchasePrice: 7000, stock: 3 }) });
  created.product = await r.json();
  // create client
  r = await fetch(`${BASE}/api/clients`, { method: 'POST', headers, body: JSON.stringify({ name: marker+' Cliente' }) }); created.client = await r.json();
  // create debt
  r = await fetch(`${BASE}/api/debts`, { method: 'POST', headers, body: JSON.stringify({ clientId: created.client.id, amount: 15000 }) }); created.debt = await r.json();
  // create apartado
  r = await fetch(`${BASE}/api/apartados`, { method: 'POST', headers, body: JSON.stringify({ clientId: created.client.id, productName: marker+' Apartado', totalAmount: 40000, totalPaid: 0 }) }); created.apartado = await r.json();
  // create expense
  r = await fetch(`${BASE}/api/expenses`, { method: 'POST', headers, body: JSON.stringify({ category: 'Test', amount: 5000, concept: marker+' gasto' }) }); created.expense = await r.json();
  // create sale
  const productList = await (await fetch(`${BASE}/api/products`, { headers })).json();
  const prod = productList.find(p=>p.id===created.product.id) || productList[0];
  r = await fetch(`${BASE}/api/sales`, { method: 'POST', headers, body: JSON.stringify({ items: [{ id: prod.id, name: prod.name, quantity: 1, price: prod.sale_price || prod.salePrice || 10000 }], subtotal: 10000, total: 10000, received: 10000, change: 0, payment: {} }) }); created.sale = await r.json();

  return { marker, created };
}

async function backup(token) {
  const headers = authHeaders(token);
  const r = await fetch(`${BASE}/api/backup`, { headers });
  const j = await r.json(); if (!r.ok) throw new Error('Backup failed');
  return j;
}

async function deleteTestData(marker) {
  // delete by marker patterns directly via DB
  await run(`DELETE FROM sale_items WHERE name LIKE ?`, [`%${marker}%`]);
  await run(`DELETE FROM sales WHERE id IN (SELECT sale_id FROM sale_items WHERE name LIKE ?)`, [`%${marker}%`]);
  await run(`DELETE FROM debts WHERE client_id IN (SELECT id FROM clients WHERE name LIKE ?)` , [`%${marker}%`]);
  await run(`DELETE FROM apartados WHERE product_name LIKE ?`, [`%${marker}%`]);
  await run(`DELETE FROM expenses WHERE concept LIKE ?`, [`%${marker}%`]);
  await run(`DELETE FROM clients WHERE name LIKE ?`, [`%${marker}%`]);
  await run(`DELETE FROM products WHERE sku LIKE ?`, [`${marker}-%`]);
}

async function restore(token, payload) {
  const headers = authHeaders(token);
  const r = await fetch(`${BASE}/api/backup/restore`, { method: 'POST', headers, body: JSON.stringify(payload) });
  let text = await r.text();
  try {
    const j = JSON.parse(text);
    if (!r.ok) throw new Error('Restore failed: '+JSON.stringify(j));
    return j;
  } catch (e) {
    console.error('Non-JSON response from restore:', r.status, text.slice(0,400));
    throw new Error('Restore failed with non-JSON response');
  }
}

async function verify(marker) {
  const prods = await all(`SELECT * FROM products WHERE sku LIKE ?`, [`${marker}-%`]);
  const clients = await all(`SELECT * FROM clients WHERE name LIKE ?`, [`%${marker}%`]);
  const debts = await all(`SELECT * FROM debts WHERE client_id IN (SELECT id FROM clients WHERE name LIKE ?)`, [`%${marker}%`]);
  const ap = await all(`SELECT * FROM apartados WHERE product_name LIKE ?`, [`%${marker}%`]);
  const exp = await all(`SELECT * FROM expenses WHERE concept LIKE ?`, [`%${marker}%`]);
  return { prods, clients, debts, ap, exp };
}

(async ()=>{
  try{
    console.log('LOGIN');
    const token = await login();
    console.log('CREATE TEST DATA');
    const { marker } = await createTestData(token);
    console.log('BACKUP');
    const b = await backup(token);
    console.log('Deleting test data directly');
    await deleteTestData(marker);
    const afterDelete = await verify(marker);
    console.log('After delete verification:', Object.fromEntries(Object.entries(afterDelete).map(([k,v])=>[k, v.length])));
    console.log('RESTORE');
    await restore(token, b);
    const afterRestore = await verify(marker);
    console.log('After restore verification:', Object.fromEntries(Object.entries(afterRestore).map(([k,v])=>[k, v.length])));
    // decide success
    const ok = afterRestore.prods.length>0 && afterRestore.clients.length>0;
    console.log('RESTORE SUCCESS?', ok);
    process.exit(ok?0:2);
  }catch(err){
    console.error('ERROR', err);
    process.exit(3);
  }
})();

(async () => {
  const fetch = global.fetch;
  const base = 'http://localhost:3001';
  function logOk(name, data) { console.log('OK:', name, JSON.stringify(data || {}).slice(0,200)); }
  function logErr(name, err) { console.error('ERR:', name, err && err.message ? err.message : err); }

  // wait for server
  const wait = (ms)=> new Promise(r=>setTimeout(r,ms));
  let ready = false;
  for (let i=0;i<10;i++){
    try{
      const r = await fetch(base + '/api/health');
      if (r.ok) { ready = true; break; }
    }catch(e){}
    await wait(500);
  }
  if (!ready) { console.error('Server not responding at', base); process.exit(2); }

  // health
  try{
    const r = await fetch(base + '/api/health');
    const j = await r.json(); logOk('health', j);
  }catch(e){ logErr('health', e); }

  // login admin
  let token = null;
  try{
    const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({username:'admin', password:'admin123'}) });
    const j = await r.json();
    if (!r.ok) { throw new Error(JSON.stringify(j)); }
    token = j.token; logOk('login', { user: j.user });
  }catch(e){ logErr('login', e); process.exit(3); }

  const auth = { 'Authorization': 'Bearer ' + token, 'content-type':'application/json' };

  // permissions
  try{ const r = await fetch(base + '/api/permissions', { headers: auth }); const j = await r.json(); logOk('permissions', Object.keys(j)); }catch(e){ logErr('permissions', e); }

  // create product
  let product = null;
  try{
    const newP = { sku: 'CHK-' + Date.now(), name: 'Producto de prueba', salePrice: 10000, purchasePrice: 7000, stock: 5 };
    const r = await fetch(base + '/api/products', { method: 'POST', headers: auth, body: JSON.stringify(newP)});
    const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j)); product = j; logOk('create_product', product);
  }catch(e){ logErr('create_product', e); }

  // create supplier
  let supplier = null;
  try{
    const s = { name: 'Proveedor Test', phone: '3000000000' };
    const r = await fetch(base + '/api/suppliers', { method: 'POST', headers: auth, body: JSON.stringify(s)});
    const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j)); supplier = j; logOk('create_supplier', supplier);
  }catch(e){ logErr('create_supplier', e); }

  // create purchase for product
  try{
    if (!product || !supplier) throw new Error('Missing product/supplier');
    const pur = { supplierId: supplier.id, items: [{ productId: product.id, productName: product.name, quantity: 10, costPrice: 6000 }] };
    const r = await fetch(base + '/api/purchases', { method: 'POST', headers: auth, body: JSON.stringify(pur)});
    const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j)); logOk('create_purchase', j);
    // verify product stock
    const pr = await fetch(base + '/api/products', { headers: auth }); const arr = await pr.json(); const found = arr.find(p=>p.id===product.id); logOk('product_after_purchase', found);
  }catch(e){ logErr('create_purchase', e); }

  // open cash
  try{
    const r = await fetch(base + '/api/cash/open', { method: 'POST', headers: auth, body: JSON.stringify({ base: 100000 }) }); const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j)); logOk('cash_open', j);
  }catch(e){ logErr('cash_open', e); }

  // create client
  let client = null;
  try{ const r = await fetch(base + '/api/clients', { method: 'POST', headers: auth, body: JSON.stringify({ name: 'Cliente Test' }) }); const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j)); client = j; logOk('create_client', client);}catch(e){ logErr('create_client', e); }

  // create debt (fiado)
  let debt = null;
  try{ const r = await fetch(base + '/api/debts', { method: 'POST', headers: auth, body: JSON.stringify({ clientId: client.id, amount: 25000 }) }); const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j)); debt = j; logOk('create_debt', debt);}catch(e){ logErr('create_debt', e); }

  // pay debt
  try{ const r = await fetch(base + `/api/debts/${debt.id}/payments`, { method: 'POST', headers: auth, body: JSON.stringify({ amount: 5000 }) }); const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j)); logOk('pay_debt', j);}catch(e){ logErr('pay_debt', e); }

  // create apartado and pay
  let apartado = null;
  try{ const r = await fetch(base + '/api/apartados', { method: 'POST', headers: auth, body: JSON.stringify({ clientId: client.id, productName: 'Apartado Test', totalAmount: 50000, totalPaid: 0 }) }); const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j)); apartado = j; logOk('create_apartado', apartado);}catch(e){ logErr('create_apartado', e); }
  try{ const r = await fetch(base + `/api/apartados/${apartado.id}/payments`, { method: 'POST', headers: auth, body: JSON.stringify({ amount: 20000 }) }); const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j)); logOk('pay_apartado', j);}catch(e){ logErr('pay_apartado', e); }

  // create expense
  try{ const r = await fetch(base + '/api/expenses', { method: 'POST', headers: auth, body: JSON.stringify({ category: 'Operacion', amount: 15000, concept: 'Compra insumos' }) }); const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j)); logOk('create_expense', j);}catch(e){ logErr('create_expense', e); }

  // create sale
  try{
    const prodList = await (await fetch(base + '/api/products', { headers: auth })).json(); const p = prodList.find(x=>x.id===product.id) || prodList[0];
    const sale = { items: [{ id: p.id, name: p.name, quantity: 2, price: Number(p.sale_price || p.salePrice || 10000) }], subtotal: 20000, discount: 0, total: 20000, received: 20000, change: 0, payment: { method: 'Efectivo' } };
    const r = await fetch(base + '/api/sales', { method: 'POST', headers: auth, body: JSON.stringify(sale) }); const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j)); logOk('create_sale', j);
    const pr = await fetch(base + '/api/products', { headers: auth }); const arr = await pr.json(); const found = arr.find(pp=>pp.id===product.id); logOk('product_after_sale', found);
  }catch(e){ logErr('create_sale', e); }

  // close cash
  try{ const r = await fetch(base + '/api/cash', { headers: auth }); const cur = await r.json(); const r2 = await fetch(base + '/api/cash/close', { method: 'POST', headers: auth, body: JSON.stringify({ cashCounted: Number(cur.base||0) + 20000 }) }); const j = await r2.json(); if (!r2.ok) throw new Error(JSON.stringify(j)); logOk('cash_close', j);}catch(e){ logErr('cash_close', e); }

  // reports
  try{ const r = await fetch(base + '/api/reports', { headers: auth }); const j = await r.json(); logOk('reports', j); }catch(e){ logErr('reports', e); }

  // backup
  try{ const r = await fetch(base + '/api/backup', { headers: auth }); const j = await r.json(); logOk('backup', { exportedAt: j.exportedAt, items: Object.keys(j.data) }); }catch(e){ logErr('backup', e); }

  // sqlite quick check via API state
  try{ const r = await fetch(base + '/api/state', { headers: auth }); const j = await r.json(); logOk('state_summary', { products: j.products?.length, suppliers: j.suppliers?.length, purchases: j.purchases?.length }); }catch(e){ logErr('state_summary', e); }

  console.log('SYSTEM_CHECK_DONE');
})();

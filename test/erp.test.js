const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server.js');

test('supplier and purchase flow works', async () => {
  const server = app.listen(0);
  const addr = server.address();
  const port = addr.port;
  const base = `http://127.0.0.1:${port}`;

  try {
    const loginRes = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    assert.equal(loginRes.status, 200, 'login should succeed');
    const loginData = await loginRes.json();
    const token = loginData.token;

    const supplierResponse = await fetch(`${base}/api/suppliers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ name: 'Proveedor Test', phone: '3000000000', email: 'proveedor@test.com' })
    });

    assert.equal(supplierResponse.status, 201, 'supplier should be created');
    const supplier = await supplierResponse.json();
    assert.equal(supplier.name, 'Proveedor Test');

    const uniqueSku = `TEST-${Math.random().toString(36).slice(2,8)}-${Date.now()}`;
    const productResponse = await fetch(`${base}/api/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        sku: uniqueSku,
        name: 'Producto de prueba',
        purchasePrice: 1200,
        salePrice: 2500,
        stock: 0,
        minStock: 2,
        maxStock: 10,
        unit: 'und'
      })
    });

    assert.equal(productResponse.status, 201, 'product should be created');
    const product = await productResponse.json();

    const purchaseResponse = await fetch(`${base}/api/purchases`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        supplierId: supplier.id,
        invoiceNumber: 'FAC-1001',
        date: '2025-01-10',
        paymentMethod: 'Efectivo',
        items: [{ productId: product.id, productName: product.name, quantity: 5, costPrice: 1200 }]
      })
    });

    assert.equal(purchaseResponse.status, 201, 'purchase should be created');
    const purchaseData = await purchaseResponse.json();
    assert.equal(purchaseData.total, 6000);

    const productsAfter = await fetch(`${base}/api/products`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const productsList = await productsAfter.json();
    const updated = productsList.find((item) => item.id === product.id);
    assert.equal(Number(updated.stock), 5, 'purchase should increase stock');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

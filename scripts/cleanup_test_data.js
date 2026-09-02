const { all, run } = require('../db');

async function info() {
  const prodsTestBR = await all("SELECT id, sku, name FROM products WHERE sku LIKE 'TEST_BR-%'");
  const prodsCHK = await all("SELECT id, sku, name FROM products WHERE sku LIKE 'CHK-%'");
  const clientsMod = await all("SELECT id, name FROM clients WHERE name LIKE 'MOD_TEST_CLIENT_%'");
  const clientsCT = await all("SELECT id, name FROM clients WHERE name = 'Cliente Test'");
  console.log('Found products TEST_BR:', prodsTestBR.length);
  console.table(prodsTestBR);
  console.log('Found products CHK-:', prodsCHK.length);
  console.table(prodsCHK);
  console.log('Found clients MOD_TEST_CLIENT_:', clientsMod.length);
  console.table(clientsMod);
  console.log('Found clients "Cliente Test":', clientsCT.length);
  console.table(clientsCT);
  return { prodsTestBR, prodsCHK, clientsMod, clientsCT };
}

async function remove() {
  const { prodsTestBR, prodsCHK, clientsMod, clientsCT } = await info();

  for (const p of prodsTestBR) {
    await run('DELETE FROM products WHERE id = ?', [p.id]);
  }
  for (const p of prodsCHK) {
    await run('DELETE FROM products WHERE id = ?', [p.id]);
  }

  for (const c of clientsMod) {
    await run('DELETE FROM debt_payments WHERE debt_id IN (SELECT id FROM debts WHERE client_id = ?)', [c.id]);
    await run('DELETE FROM debts WHERE client_id = ?', [c.id]);
    await run('DELETE FROM apartado_payments WHERE apartado_id IN (SELECT id FROM apartados WHERE client_id = ?)', [c.id]);
    await run('DELETE FROM apartados WHERE client_id = ?', [c.id]);
    await run('DELETE FROM clients WHERE id = ?', [c.id]);
  }

  for (const c of clientsCT) {
    await run('DELETE FROM debt_payments WHERE debt_id IN (SELECT id FROM debts WHERE client_id = ?)', [c.id]);
    await run('DELETE FROM debts WHERE client_id = ?', [c.id]);
    await run('DELETE FROM apartado_payments WHERE apartado_id IN (SELECT id FROM apartados WHERE client_id = ?)', [c.id]);
    await run('DELETE FROM apartados WHERE client_id = ?', [c.id]);
    await run('DELETE FROM clients WHERE id = ?', [c.id]);
  }

  console.log('Cleanup complete. Current state:');
  await info();
}

(async ()=>{
  try {
    await remove();
    process.exit(0);
  } catch (e) {
    console.error('Cleanup failed', e);
    process.exit(2);
  }
})();

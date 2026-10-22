/*
 * Prueba los niveles (qué categorías se abren con las estrellas) y las sumas de la ayuda.
 * Uso: node tests/progreso.js
 */
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const ctx = {}; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['phrases.js', 'progress.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'www', 'js', f), 'utf8'), ctx);
const P0 = ctx.Progress, ORDER = [...ctx.UNLOCK_ORDER], N = ctx.STARS_TO_UNLOCK;
// Las listas vienen de otro contexto de vm: las copiamos para poder compararlas.
const P = { unlocked: s => [...P0.unlocked(s)], makeSum: P0.makeSum };

// El orden de los niveles tiene todas las categorías, una sola vez.
assert.deepStrictEqual([...ORDER].sort(), Object.keys(ctx.CATEGORIES).sort());
assert.strictEqual(ORDER[0], 'animal');

assert.deepStrictEqual(P.unlocked({}), ['animal']);
assert.deepStrictEqual(P.unlocked({ animal: N - 1 }), ['animal']);
assert.deepStrictEqual(P.unlocked({ animal: N }), ['animal', 'fruta']);
// Las estrellas de una categoría que todavía no estaba abierta no saltan niveles.
assert.deepStrictEqual(P.unlocked({ animal: N, comida: 9 }), ['animal', 'fruta']);
const all = {}; ORDER.forEach(k => { all[k] = N; });
assert.deepStrictEqual(P.unlocked(all), ORDER);

for (let i = 0; i < 20000; i++) {
  const e = P.makeSum('sum10');
  assert(e.a >= 1 && e.b >= 1 && e.a + e.b <= 10, JSON.stringify(e));
  const h = P.makeSum('sum99');
  assert(h.a >= 10 && h.a <= 99 && h.b >= 1 && h.a + h.b <= 99, JSON.stringify(h));
  assert((h.a % 10) + (h.b % 10) <= 9, 'sin llevar: ' + JSON.stringify(h));
}
console.log('OK: niveles y sumas');

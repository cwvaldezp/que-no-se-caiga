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

// Resuelve la suma siguiendo los pasos y devuelve el resultado escrito en las casillas.
function solve(a, b) {
  const sp = P0.sumSteps(a, b), r = [];
  sp.steps.forEach(st => { if (st.cell[0] === 'r') r[+st.cell.slice(1)] = st.expect; });
  assert.strictEqual(r.length, sp.cols);
  return +r.slice().reverse().join('');
}
let overflow = 0;
for (let i = 0; i < 20000; i++) {
  const e = P.makeSum('sum10');
  assert(e.a >= 1 && e.a <= 9 && e.b >= 1 && e.a + e.b <= 10, JSON.stringify(e));
  assert.strictEqual(solve(e.a, e.b), e.a + e.b);
  const h = P.makeSum('sum99');
  assert(h.a >= 10 && h.b >= 10 && h.a + h.b <= 99, JSON.stringify(h));
  assert((h.a % 10) + (h.b % 10) <= 9, 'sin llevar: ' + JSON.stringify(h));
  assert(!P0.sumSteps(h.a, h.b).steps.some(st => st.cell[0] === 'c'), 'sin llevar no pide cajita: ' + JSON.stringify(h));
  assert.strictEqual(solve(h.a, h.b), h.a + h.b);
  const c = P.makeSum('sum99c');
  assert(c.a >= 10 && c.a <= 99 && c.b >= 10 && c.b <= 99, JSON.stringify(c));
  assert((c.a % 10) + (c.b % 10) >= 10, 'llevando: ' + JSON.stringify(c));
  assert.strictEqual(solve(c.a, c.b), c.a + c.b);
  if (c.a + c.b > 99) overflow++;
}
assert(overflow > 1000, 'a veces la suma llevando pasa de 99');

// 45 + 37: unidades, se lleva 1 arriba de las decenas, decenas.
assert.deepStrictEqual(P0.sumSteps(45, 37).steps.map(s => s.cell + '=' + s.expect).join(' '), 'r0=2 c1=1 r1=8');
// 78 + 45 = 123: se lleva a las decenas y el 1 de las centenas baja directo.
assert.deepStrictEqual(P0.sumSteps(78, 45).steps.map(s => s.cell + '=' + s.expect).join(' '), 'r0=3 c1=1 r1=2 r2=1');
// 4 + 6 = 10: una cifra que pasa a las decenas.
assert.deepStrictEqual(P0.sumSteps(4, 6).steps.map(s => s.cell + '=' + s.expect).join(' '), 'r0=0 r1=1');
console.log('OK: niveles y sumas');

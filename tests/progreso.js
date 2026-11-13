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

// Resuelve la suma siguiendo los pasos (como lo acomoda el juego) y devuelve el resultado.
function solve(a, b) {
  const sp = P0.sumSteps(a, b), r = [];
  let carry = 0;
  sp.steps.forEach(st => {
    const parts = [carry, sp.a[st.col] || 0, sp.b[st.col] || 0];
    assert.strictEqual(st.sum, parts.reduce((x, y) => x + y), 'suma de la columna ' + st.col);
    r[st.col] = st.sum % 10;
    if (st.carryTo === null && st.sum >= 10) r[st.col + 1] = 1;
    carry = st.sum >= 10 ? 1 : 0;
  });
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
  assert(P0.sumSteps(h.a, h.b).steps.every(st => st.carryTo === null), 'sin llevar no lleva: ' + JSON.stringify(h));
  assert.strictEqual(solve(h.a, h.b), h.a + h.b);
  const c = P.makeSum('sum99c');
  assert(c.a >= 10 && c.a <= 99 && c.b >= 10 && c.b <= 99, JSON.stringify(c));
  assert((c.a % 10) + (c.b % 10) >= 10, 'llevando: ' + JSON.stringify(c));
  assert.strictEqual(solve(c.a, c.b), c.a + c.b);
  if (c.a + c.b > 99) overflow++;
}
assert(overflow > 1000, 'a veces la suma llevando pasa de 99');

const show = (a, b) => P0.sumSteps(a, b).steps.map(s => s.sum + (s.carryTo ? '→' + s.carryTo : '') + ' «' + s.say + '»').join(' | ');
// 33 + 37: el niño escribe 10, el juego pone el 0 y lleva 1; después 7.
assert.strictEqual(show(33, 37), '10→1 «Correcto, escribo el 0 y llevo 1» | 7 «Correcto, escribo el 7»');
// 78 + 45 = 123: 13 (llevo 1) y luego 12, que se escribe entero en la última columna.
assert.strictEqual(show(78, 45), '13→1 «Correcto, escribo el 3 y llevo 1» | 12 «Correcto, escribo el 12»');
// 4 + 6 = 10: una sola columna, se escribe el 10 entero.
assert.strictEqual(show(4, 6), '10 «Correcto, escribo el 10»');
console.log('OK: niveles y sumas');

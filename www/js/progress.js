/*
 * Niveles y sumas de la ayuda.
 *
 * Al principio sólo se juega con la primera categoría de UNLOCK_ORDER. Cada palabra que se
 * completa da una estrella ⭐ a su categoría; con STARS_TO_UNLOCK estrellas en la última
 * categoría abierta se abre la siguiente. Para cambiar el orden basta con mover las claves
 * (son las de CATEGORIES en js/phrases.js).
 */
window.UNLOCK_ORDER = ['animal', 'fruta', 'comida', 'juguete', 'cuerpo', 'casa', 'transporte', 'naturaleza', 'ropa', 'verdura', 'instrumento'];
window.STARS_TO_UNLOCK = 3;

window.Progress = {
  // Categorías abiertas según las estrellas ganadas ({ animal: 3, fruta: 1, … }).
  unlocked: function (stars) {
    var order = window.UNLOCK_ORDER, n = 1;
    while (n < order.length && (stars[order[n - 1]] || 0) >= window.STARS_TO_UNLOCK) n++;
    return order.slice(0, n);
  },

  // Suma para pedir la ayuda. 'sum10': números chicos, resultado hasta 10.
  // 'sum99': números de hasta dos cifras, resultado hasta 99 y sin llevar (las unidades no pasan de 9).
  makeSum: function (level, rnd) {
    rnd = rnd || Math.random;
    var pick = function (lo, hi) { return lo + Math.floor(rnd() * (hi - lo + 1)); };
    if (level === 'sum10') {
      var a = pick(1, 9);
      return { a: a, b: pick(1, 10 - a) };
    }
    var ta = pick(1, 8), ua = pick(0, 8);
    var tb = pick(0, 9 - ta), ub = pick(tb ? 0 : 1, 9 - ua);
    return { a: ta * 10 + ua, b: tb * 10 + ub };
  }
};

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

(function () {
  var COLS = ['unidades', 'decenas', 'centenas'];

  window.Progress = {
    // Categorías abiertas según las estrellas ganadas ({ animal: 3, fruta: 1, … }).
    unlocked: function (stars) {
      var order = window.UNLOCK_ORDER, n = 1;
      while (n < order.length && (stars[order[n - 1]] || 0) >= window.STARS_TO_UNLOCK) n++;
      return order.slice(0, n);
    },

    // Suma para pedir la ayuda.
    // 'sum10': números de una cifra, resultado hasta 10.
    // 'sum99': dos números de dos cifras, resultado hasta 99 y sin llevar.
    // 'sum99c': dos números de dos cifras llevando (las unidades pasan de 9); el total puede pasar de 99.
    makeSum: function (level, rnd) {
      rnd = rnd || Math.random;
      var pick = function (lo, hi) { return lo + Math.floor(rnd() * (hi - lo + 1)); };
      if (level === 'sum10') {
        var a = pick(1, 9);
        return { a: a, b: pick(1, 10 - a) };
      }
      var ta, ua, tb, ub;
      if (level === 'sum99c') {
        ta = pick(1, 9); tb = pick(1, 9);
        ua = pick(1, 9); ub = pick(10 - ua, 9);
      } else {
        ta = pick(1, 8); tb = pick(1, 9 - ta);
        ua = pick(0, 9); ub = pick(0, 9 - ua);
      }
      return { a: ta * 10 + ua, b: tb * 10 + ub };
    },

    /*
     * Pasos para resolver a + b en columnas, de derecha a izquierda. Cada paso es una casilla
     * que el niño llena con un dígito: 'r0' es el resultado de las unidades, 'c1' la cajita
     * de arriba de las decenas donde se pone lo que se lleva, etc.
     * Devuelve { cols: cantidad de columnas, a: [dígitos], b: [dígitos], steps: [{ cell, expect, msg }] }
     * (los dígitos van de las unidades hacia la izquierda; null si el número no tiene esa cifra).
     */
    sumSteps: function (a, b) {
      var total = a + b, cols = String(total).length;
      var digits = function (n) {
        var s = String(n), out = [];
        for (var i = 0; i < cols; i++) out.push(i < s.length ? +s[s.length - 1 - i] : null);
        return out;
      };
      var da = digits(a), db = digits(b), steps = [], carry = 0;
      for (var i = 0; i < cols; i++) {
        var parts = [];
        if (carry) parts.push(carry);
        if (da[i] !== null) parts.push(da[i]);
        if (db[i] !== null) parts.push(db[i]);
        var s = parts.reduce(function (x, y) { return x + y; }, 0);
        var hasNumbers = da[i] !== null || db[i] !== null;
        steps.push({
          cell: 'r' + i,
          expect: s % 10,
          msg: !hasNumbers
            ? '¡Llevas ' + carry + '! Escríbelo abajo, en las ' + COLS[i] + ' 👇'
            : (i ? 'Ahora suma las ' : 'Suma las ') + COLS[i] + ': ' + parts.join(' + ')
        });
        carry = s >= 10 ? 1 : 0;
        // Lo que se lleva se escribe arriba de la columna siguiente, si esa columna tiene números.
        if (carry && i + 1 < cols && (da[i + 1] !== null || db[i + 1] !== null)) {
          steps.push({
            cell: 'c' + (i + 1),
            expect: carry,
            msg: '¡Bien! ' + parts.join(' + ') + ' = ' + s + '. Abajo va el ' + (s % 10) +
              ' y llevas ' + carry + ': escríbelo arriba, en las ' + COLS[i + 1] + ' ☝️'
          });
        }
      }
      return { cols: cols, a: da, b: db, steps: steps };
    }
  };
})();

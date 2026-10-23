# Migrar "¡Que no se caiga!" a app móvil (Android e iOS)

> Documento de traspaso para continuar el trabajo en otro chat.
> Repositorio: https://github.com/cwvaldezp/que-no-se-caiga (rama principal: `main`)
> Juego publicado: https://cwvaldezp.github.io/que-no-se-caiga/

## 1. Qué es el proyecto

"¡Que no se caiga!" es un **ahorcado para niños que están aprendiendo a escribir**. En vez de un ahorcado,
un niño (o niña) está en un trampolín y con cada error aparece una parte más del cuerpo; con 6 errores se cae
a la piscina. **Toda letra que se dice se escribe a mano** sobre la pantalla, esté o no en la palabra.

Lo usa un niño pequeño con su familia. La prioridad es que sea **simple, cariñoso, sin anuncios, sin cuentas
y sin enviar datos a ningún lado**.

### Funciones actuales (no se deben perder)

- **Dos modos:** *Yo elijo la imagen* (el niño esconde la palabra y responde si la letra está) y
  *Yo adivino* (el juego elige una palabra al azar y el niño adivina).
- **Escribir cada letra** en una pizarra (canvas): *con caminito* (punto verde, flecha y dedito que guían
  cada trazo) o *libre* (escribe solo y toca **Listo**; si no sale, se muestra el caminito). Detecta
  garabatos y letras parecidas.
- **Tres tipos de letra:** MAYÚSCULAS, minúsculas y cursiva (ligada), cada una con sus trazos y renglones.
- **Dibujar la propia imagen secreta** con colores y escribir qué es.
- **109 imágenes (emojis) en 11 categorías**, con una **pista** de categoría que se escucha.
- **Niveles:** al principio sólo 🐾 Animales; cada palabra completada da ⭐ y con 3 ⭐ en la última categoría
  abierta se abre la siguiente. Opción "Todas" y botón para reiniciar.
- **Ayuda 💡:** en *Yo adivino*, resolviendo una suma (hasta 10, o de dos cifras sin llevar con resultado
  ≤ 99) se ve la imagen con su palabra letra por letra. Configurable.
- **Selfie:** se toma una foto, se encuadra la cara y aparece en el niño del trampolín.
- **Voz en español** que dice las letras, las frases y las palabras; **efectos de sonido**; ambos se
  pueden apagar.
- **Funciona sin internet** y todo se guarda sólo en el aparato.

## 2. Tecnología actual

Web pura, **sin frameworks y sin paso de compilación**: los archivos de `www/` se publican tal cual.

| Parte | Tecnología | Archivo |
|---|---|---|
| Pantallas | HTML + CSS | `www/index.html`, `www/css/styles.css` |
| Lógica del juego | JavaScript (estilo ES5, IIFE, `window.*` globales) | `www/js/app.js` |
| Trazos de cada letra (caja 0..100) | Datos + generadores de arcos | `www/js/letters.js` |
| Pizarra y revisión de letras | Canvas + algoritmo propio (`Tracer`, `LetterGrader`) | `www/js/tracer.js` |
| Niño del trampolín | SVG generado | `www/js/figure.js` |
| Palabras y categorías | Datos | `www/js/words.js`, `www/js/phrases.js` |
| Niveles y sumas | Funciones puras (`Progress`) | `www/js/progress.js` |
| Voz | Web Speech API; si no hay voz en español, audios grabados con Piper (base64, ~0,9 MB) | `www/js/voice-clips.js`, `tools/generar-voz.py` |
| Sonidos | Web Audio API (tonos generados) | `www/js/app.js` |
| Guardado | `localStorage` (ajustes, `photo`, `stars`) | `www/js/app.js` |
| Sin internet | PWA: manifest + service worker | `www/manifest.webmanifest`, `www/sw.js` |
| APK Android | **Capacitor 7** (`appId: com.familia.ahorcado`) + GitHub Actions | `capacitor.config.json`, `package.json`, `.github/workflows/android.yml` |
| Íconos y splash | `@capacitor/assets` | `assets/` |
| Pruebas | Node.js | `tests/revision-letras.js`, `tests/progreso.js` |

Ya existe una acción que **arma un APK de Android con Capacitor** y lo deja en la release `android` del repo
(`releases/download/android/que-no-se-caiga.apk`). iOS todavía no está armado.

## 3. Recomendación: seguir con Capacitor (no reescribir)

**Usar Capacitor para Android e iOS, reutilizando el mismo código web.**

Por qué:

1. **El 100 % del juego ya funciona** en el navegador del teléfono y Capacitor ya arma el APK. Pasar a iOS
   es agregar la plataforma, no reescribir.
2. **Un solo código** para web, Android e iOS. Cada mejora llega a las tres a la vez.
3. Lo más delicado del juego (la revisión de trazos en `tracer.js`, los trazos de `letters.js` y el dibujo
   SVG) **se reescribiría desde cero** en otra tecnología, con riesgo de perder afinaciones que costaron
   trabajo (detección de garabatos, letras parecidas, cursiva).
4. Para un juego de toques y dibujo 2D, el rendimiento de un WebView moderno es de sobra.

### Alternativas (sólo si más adelante hace falta)

- **Flutter:** la mejor opción si se quisiera una app 100 % nativa con animaciones más ricas
  (`CustomPainter` sirve para la pizarra). Implica reescribir todo en Dart.
- **React Native / Expo:** también implica reescribir; el dibujo necesitaría `react-native-skia`. No aporta
  mucho frente a Capacitor para este juego.

## 4. Plan de trabajo con Capacitor

### 4.1 Ajustes al código web para que se comporte como app

- [ ] **No registrar el service worker dentro de la app nativa** (en iOS no funciona y en Android puede dejar
      archivos viejos en caché): registrar sólo si `!window.Capacitor?.isNativePlatform?.()`.
- [ ] **Voz nativa:** el WebView de Android no trae `speechSynthesis`. Usar
      `@capacitor-community/text-to-speech` (lang `es-ES`/`es-MX`, rate ~0.9) cuando sea app nativa, y dejar
      los audios de Piper como respaldo. Mantener la función `say()` como único punto de entrada.
- [ ] **Guardado más seguro:** iOS puede borrar el `localStorage` del WebView. Pasar `stars`, ajustes y
      `photo` a `@capacitor/preferences` (con migración desde `localStorage` la primera vez).
- [ ] **Cámara:** el `<input type="file" capture="user">` funciona, pero se ve mejor con `@capacitor/camera`
      (cámara frontal, sin pasar por el selector de archivos). Opcional.
- [ ] **Pantalla:** bloquear en vertical, `@capacitor/status-bar` con el color `#4fc3f7`,
      `@capacitor/splash-screen` (fondo `#fff8e7`). Revisar zonas seguras (notch) en iPhone; el CSS ya usa
      `env(safe-area-inset-*)`.
- [ ] **Botón atrás de Android** (`@capacitor/app`, evento `backButton`): cerrar la ventana abierta o volver
      al inicio en vez de salir de la app.
- [ ] Opcional: `@capacitor/haptics` para vibrar suave al acertar o equivocarse.
- [ ] Los emojis se ven distinto en Android e iOS (son de cada sistema). Aceptable; si se quiere que se vean
      igual, cambiar a imágenes propias (por ejemplo, Twemoji o Noto Emoji con su licencia).

### 4.2 Android

- [ ] Mantener el flujo actual (`.github/workflows/android.yml`).
- [ ] ⚠️ **La clave de firma actual (`tools/android/que-no-se-caiga.keystore`) y su contraseña están en el
      repositorio, que es público.** Sirve para instalar el APK en la familia, pero **para Google Play hay
      que crear una clave nueva**, guardarla en *GitHub Secrets* y quitarla del repo.
- [ ] Para Google Play: generar **AAB** (`./gradlew bundleRelease`), cuenta de desarrollador (pago único
      de US$25), ficha de la tienda y **política de privacidad**.
- [ ] Cambiar `appId` a algo propio y definitivo antes de publicar (no se puede cambiar después), por
      ejemplo `com.cwvaldezp.quenosecaiga`.

### 4.3 iOS

- [ ] `npx cap add ios`. Hace falta **Xcode (Mac)**, o compilar en la nube con GitHub Actions
      (`runs-on: macos-latest`), Codemagic o Ionic Appflow.
- [ ] **Cuenta de Apple Developer** (US$99 al año) para instalar en iPhones fuera del modo desarrollo y
      para publicar. Para pruebas: TestFlight.
- [ ] En `Info.plist`: `NSCameraUsageDescription` y `NSPhotoLibraryUsageDescription` (en español: "Para
      poner tu cara en el niño del trampolín").
- [ ] Probar que la voz y los sonidos suenen con el interruptor de silencio del iPhone. Puede hacer falta
      configurar la sesión de audio o usar el plugin de voz nativa.

### 4.4 Tiendas: requisitos por ser una app para niños

- Google Play: programa **Designed for Families** / público infantil. Apple: categoría **Niños** (Kids).
- **Sin anuncios, sin analíticas, sin enlaces externos ni compras** sin control parental.
- **Política de privacidad** publicada (puede ser una página en GitHub Pages): la foto, las estrellas y los
  ajustes se guardan sólo en el aparato y no se envía nada.

## 5. Criterios de "listo"

- [ ] El APK y la app de iOS abren sin internet y se juegan completos en los dos modos.
- [ ] La voz en español suena en Android e iOS (también con la voz del sistema desactivada → audios Piper).
- [ ] La escritura de letras (con caminito, libre y cursiva) funciona igual que en la web.
- [ ] Estrellas, ajustes y selfie se mantienen al cerrar y reabrir la app.
- [ ] El botón atrás de Android no cierra la app en medio de una partida.
- [ ] La web en GitHub Pages sigue funcionando igual.
- [ ] `node tests/revision-letras.js` y `node tests/progreso.js` pasan.

## 6. Cosas a cuidar

- No cambiar el comportamiento del juego ni los textos sin preguntar: los ajustó la familia con el niño.
- Al agregar o cambiar palabras o frases hay que **regrabar la voz**: `pip install piper-tts` y
  `python3 tools/generar-voz.py`.
- Al cambiar archivos de `www/`, subir la versión del caché en `www/sw.js` (`ahorcado-vN`) para que la web
  instalada se actualice.
- Mantener el estilo del código: JavaScript sencillo, sin compilación, comentarios en español.

## 7. Cómo probar hoy

```bash
cd www && python3 -m http.server 8080   # abrir http://localhost:8080
node tests/revision-letras.js && node tests/progreso.js
npm install && npx cap add android && npx cap sync android && npx cap open android   # Android Studio
```

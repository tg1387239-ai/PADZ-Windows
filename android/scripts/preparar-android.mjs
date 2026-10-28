// Deja el proyecto de Android listo después de "npx cap add android": permisos, padz://, ícono, versión y nombre.
import fs from "node:fs"; import path from "node:path"; import { execSync } from "node:child_process";
const V = process.env.PADZ_VERSION || "0.0.0", root = path.resolve("android");
const man = path.join(root, "app/src/main/AndroidManifest.xml"); let m = fs.readFileSync(man, "utf8");
// micrófono (afinador, Aura por voz, analizador) y salida de audio
for (const perm of ["android.permission.RECORD_AUDIO", "android.permission.MODIFY_AUDIO_SETTINGS", "android.permission.WAKE_LOCK"])
  if (!m.includes(perm)) m = m.replace("</manifest>", `    <uses-permission android:name="${perm}" />\n</manifest>`);
// la sesión de Google vuelve a la app por padz://auth
if (!m.includes('android:scheme="padz"')) m = m.replace(/(<activity[\s\S]*?android:name="\.MainActivity"[\s\S]*?>)/, `$1
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="padz" android:host="auth" />
            </intent-filter>`);
// la pantalla queda prendida mientras se toca
m = m.replace('android:launchMode="singleTask"', 'android:launchMode="singleTask" android:keepScreenOn="true"');
fs.writeFileSync(man, m);
// versión: la de PADZ web (2.11.0 → versionCode 21100)
const g = path.join(root, "app/build.gradle"); let b = fs.readFileSync(g, "utf8");
const [a, bb, c] = V.split(".").map((x) => parseInt(x, 10) || 0), code = a * 10000 + bb * 100 + c;
b = b.replace(/versionCode \d+/, "versionCode " + code).replace(/versionName "[^"]*"/, `versionName "${V}"`);
fs.writeFileSync(g, b);
// ícono: el de PADZ, en todos los tamaños (sin el ícono adaptable por defecto de Capacitor)
const RES = path.join(root, "app/src/main/res"), src = path.resolve("icon.png");
fs.rmSync(path.join(RES, "mipmap-anydpi-v26"), { recursive: true, force: true });
for (const [d, s] of [["mdpi", 48], ["hdpi", 72], ["xhdpi", 96], ["xxhdpi", 144], ["xxxhdpi", 192]]) {
  const dir = path.join(RES, "mipmap-" + d); fs.mkdirSync(dir, { recursive: true });
  for (const n of ["ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png"]) execSync(`convert "${src}" -resize ${s}x${s} "${path.join(dir, n)}"`);
}
// color de la barra de arriba
const st = path.join(RES, "values/styles.xml"); if (fs.existsSync(st)) { let x = fs.readFileSync(st, "utf8"); if (!x.includes("statusBarColor")) x = x.replace(/(<style name="AppTheme.NoActionBar"[^>]*>)/, '$1\n        <item name="android:statusBarColor">#0B0D10</item>\n        <item name="android:navigationBarColor">#0B0D10</item>'); fs.writeFileSync(st, x); }
console.log("Android listo: PADZ " + V + " (versionCode " + code + ")");

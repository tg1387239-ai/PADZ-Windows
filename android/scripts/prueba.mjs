// Prueba REAL del APK en un emulador de Android (en GitHub): abre la app, entra al WebView con Playwright y revisa
// que PADZ cargue, que el audio y las secuencias funcionen (motor de pistas, reproducción, faders) y saca capturas.
import fs from "node:fs"; import { execSync } from "node:child_process";
const { _android } = await import("playwright");
const out = []; let fallas = 0; const ok = (c, m) => { out.push((c ? "ok  " : "MAL ") + m); console.log((c ? "ok  " : "MAL ") + m); if (!c) fallas++; };
const sh = (c) => { try { return execSync(c, { stdio: ["ignore", "pipe", "pipe"] }).toString(); } catch (e) { return String(e.stdout || "") + String(e.stderr || ""); } };
fs.mkdirSync("capturas", { recursive: true });
const shot = (n) => sh(`adb exec-out screencap -p > capturas/${n}.png`);
const [dev] = await _android.devices(); ok(!!dev, "emulador conectado: " + (dev ? dev.model() : "no"));
sh("adb shell pm grant app.padz.android android.permission.RECORD_AUDIO");
sh("adb shell am start -W -n app.padz.android/.MainActivity");
const wv = await dev.webView({ pkg: "app.padz.android" }, { timeout: 120000 }); const p = await wv.page();
p.on("pageerror", (e) => out.push("PAGEERR " + e.message));
await p.waitForFunction(() => typeof showTab === "function", null, { timeout: 120000 });
// primera vez: sin el recorrido de bienvenida y en español (como lo usa el dueño)
await p.evaluate(() => { localStorage.setItem("padz-tour", "1"); localStorage.setItem("padz-lang", "es"); }); await p.reload(); await p.waitForFunction(() => typeof showTab === "function", null, { timeout: 120000 });
await p.waitForTimeout(3000); shot("1-inicio");
const info = await p.evaluate(() => ({ url: location.href, ver: (document.querySelector('meta[name="padz-version"]') || {}).content || "", ua: navigator.userAgent, mem: navigator.deviceMemory || null,
  coi: window.crossOriginIsolated, aw: typeof AudioWorkletNode, dec: typeof AudioDecoder, enc: typeof AudioEncoder, cap: !!(window.Capacitor && Capacitor.isNativePlatform()), native: !!(window.padzNative && window.padzNative.android), inicio: !document.getElementById("v-inicio").hidden }));
out.push("WebView: " + JSON.stringify(info));
ok(info.cap && info.native, "PADZ abre adentro de la app y reconoce que es Android (ingreso con Google por el navegador)");
ok(info.inicio, "arranca en Inicio");
ok(info.aw === "function", "el WebView tiene AudioWorklet (motor de pistas)");
// secuencia sintética: guardar, abrir en la mezcladora y reproducir
const r = await p.evaluate(async () => {
  const st = await import("/secuencias/store.js"); const sr = 44100, D = 20, n = sr * D, stems = {}, f = { vocals: 660, drums: 110, bass: 82, other: 220, resid: 0 };
  for (const k in f) { const l = new Float32Array(n); for (let i = 0; i < n; i++) l[i] = k === "resid" ? 0 : 0.2 * Math.sin(2 * Math.PI * f[k] * i / sr); stems[k] = { l, r: l }; }
  const saved = await st.saveAudio("and1", stems, sr); st.upsertSeq({ id: "and1", name: "Prueba Android", key: 2, bpm: 100, beatsPerBar: 4, beats: Array.from({ length: 32 }, (_, i) => i * 0.6), downIdx: 0, dur: D, parts: [{ t: 0, n: "Intro" }, { t: 9.6, n: "Coro" }] });
  showTab("secuencias"); await seqMountPanel(); await sqUi.open("and1");
  const pl = sqUi.player; document.querySelector('#sqPanel [data-q="countMode"]').value = "off"; document.querySelector('#sqPanel [data-q="countMode"]').dispatchEvent(new Event("change"));
  return { codec: saved.codec, tracks: pl.tracks.length };
});
ok(r.tracks === 4, "secuencia guardada (" + r.codec + ") y abierta en la mezcladora con " + r.tracks + " pistas");
await p.evaluate(() => document.querySelectorAll(".tour").forEach((t) => t.remove()));
await p.evaluate(() => document.querySelector('#sqPanel [data-q="play"]').scrollIntoView({ block: "center" })); await p.waitForTimeout(400);
await p.tap('#sqPanel [data-q="play"]', { timeout: 10000 }).catch(() => p.evaluate(() => document.querySelector('#sqPanel [data-q="play"]').click())); await p.waitForTimeout(3500);
const s2 = await p.evaluate(() => ({ playing: sqUi.player.playing, pos: sqUi.player.position, m: sqUi.player.meter("master").peak }));
ok(s2.playing && s2.pos > 1, "suena en el teléfono: posición " + s2.pos.toFixed(1) + " s, pico de salida " + s2.m.toFixed(2));
// fader de Voces con el dedo
await p.evaluate(() => document.querySelector('#sqPanel .strip[data-k="vocals"] .fdr-track').scrollIntoView({ block: "center" })); await p.waitForTimeout(500); shot("2-mezcladora");
const bb = await (await p.$('#sqPanel .strip[data-k="vocals"] .fdr-cap')).boundingBox();
const dpr = await p.evaluate(() => devicePixelRatio), bar = 0;   // la página ocupa la pantalla debajo de la barra del sistema
const x = Math.round((bb.x + bb.width / 2) * dpr), y = Math.round((bb.y + bb.height / 2) * dpr), top = parseInt(sh("adb shell dumpsys window | grep -m1 mStableInsets || true").match(/\[\d+,(\d+)\]/)?.[1] || "0", 10);
sh(`adb shell input swipe ${x} ${y + top} ${x} ${y + top + Math.round(60 * dpr)} 600`); await p.waitForTimeout(600);
let v = await p.evaluate(() => sqUi.player.state.vol.vocals), how = "pantalla táctil del emulador (adb)";
if (!(v < 0.9)) { // si la cuenta de la barra del sistema no coincide, se manda el toque directo al WebView
  const cdp = await p.context().newCDPSession(p); const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: cx, y: cy }] });
  for (let i = 1; i <= 10; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: cx, y: cy + 6 * i }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await p.waitForTimeout(400);
  v = await p.evaluate(() => sqUi.player.state.vol.vocals); how = "toque enviado al WebView"; }
ok(v < 0.9, "fader de Voces movido con el dedo (" + how + "): ganancia " + v.toFixed(3));
shot("3-fader"); await p.evaluate(() => { sqUi.player.pause(); showTab("consola"); }); await p.waitForTimeout(1500); shot("4-consola");
const mem = sh("adb shell dumpsys meminfo app.padz.android | grep -m1 'TOTAL PSS' || adb shell dumpsys meminfo app.padz.android | grep -m1 TOTAL"); out.push("memoria: " + mem.trim());
fs.writeFileSync("capturas/resultado.txt", out.join("\n") + "\n" + (fallas ? fallas + " fallas" : "Todo bien") + "\n");
console.log(fallas ? fallas + " fallas" : "Todo bien"); await dev.close(); process.exit(fallas ? 1 : 0);

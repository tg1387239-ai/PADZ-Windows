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
const save = () => fs.writeFileSync("capturas/resultado.txt", out.join("\n") + "\n");
save();
// 1) el fader de Voces con el dedo (no hace falta que suene: cambia la ganancia del canal)
await p.evaluate(() => document.querySelector('#sqPanel .strip[data-k="vocals"] .fdr-track').scrollIntoView({ block: "center" })); await p.waitForTimeout(600); shot("2-mezcladora");
const bb = await (await p.$('#sqPanel .strip[data-k="vocals"] .fdr-cap')).boundingBox();
const cdp = await p.context().newCDPSession(p); const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: cx, y: cy }] });
for (let i = 1; i <= 10; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: cx, y: cy + 6 * i }] });
await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await p.waitForTimeout(400);
const v = await p.evaluate(() => ({ v: sqUi.player.state.vol.vocals, g: sqUi.player.state.gains.vocals.gain.value, t: document.querySelector('#sqPanel .strip[data-k="vocals"] .fdr-val').textContent }));
ok(v.v < 0.9 && Math.abs(v.g - v.v) < 0.02, "fader de Voces arrastrado con el dedo en el WebView de Android: " + v.t + " dB (ganancia " + v.v.toFixed(3) + ")"); shot("3-fader"); save();
// 2) audio del WebView (sólo un oscilador) y 3) la secuencia sonando
const a = await p.evaluate(async () => { const c = new AudioContext(); await c.resume().catch(() => {}); const o = c.createOscillator(); const g = c.createGain(); g.gain.value = 0.01; o.connect(g).connect(c.destination); o.start(); const t0 = c.currentTime; await new Promise((r) => setTimeout(r, 1500)); const t1 = c.currentTime; o.stop(); c.close(); return { st: c.state, t0, t1, sr: c.sampleRate }; });
out.push("audio del WebView: " + JSON.stringify(a)); save();
ok(a.t1 > a.t0 + 0.5, "el reloj de audio corre en el WebView (" + (a.t1 - a.t0).toFixed(2) + " s en 1,5 s)");
await p.evaluate(() => { const pl = sqUi.player; return pl.play(0); }); await p.waitForTimeout(3000);
const s2 = await p.evaluate(() => ({ playing: sqUi.player.playing, pos: sqUi.player.position, m: sqUi.player.meter("master").peak }));
ok(s2.playing && s2.pos > 1, "la secuencia suena en el WebView: posición " + s2.pos.toFixed(1) + " s, pico de salida " + s2.m.toFixed(2)); save();
 await p.evaluate(() => { sqUi.player.pause(); showTab("consola"); }); await p.waitForTimeout(1500); shot("4-consola");
// 4) 2.12.1 · audio de PADZ en modo Android (búfer grande, 48 kHz) y metrónomo medido a la salida del click (reloj de audio)
try {
  const m = await p.evaluate(async () => { unlockAudio(); init(); await ctx.resume().catch(() => {});
    const REC = `class R extends AudioWorkletProcessor{constructor(){super();this.on=false;this.last=-1e9;}process(i){const x=i[0]&&i[0][0];if(x){for(let k=0;k<x.length;k++){const a=Math.abs(x[k]);const f=currentFrame+k;if(!this.on&&a>0.02&&f-this.last>sampleRate*0.08){this.on=true;this.last=f;this.port.postMessage(f/sampleRate);}else if(this.on&&a<0.002)this.on=false;}}return true;}}registerProcessor("rec-onsets",R);`;
    await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([REC], { type: "text/javascript" })));
    const n = new AudioWorkletNode(ctx, "rec-onsets"), z = ctx.createGain(); z.gain.value = 0; const on = []; n.port.onmessage = (e) => on.push(e.data); clickBus.connect(n); n.connect(z).connect(ctx.destination);
    setBpm(120); metStart(); await new Promise((r) => setTimeout(r, 4500)); metStop(); await new Promise((r) => setTimeout(r, 300));
    return { sr: ctx.sampleRate, bl: ctx.baseLatency, log: /modo Android/.test(padzLogText()), on }; });
  const iv = m.on.slice(1).map((t, i) => t - m.on[i]);
  ok(m.sr === 48000 && m.log, "PADZ crea el audio en modo Android (" + m.sr + " Hz, latencia base " + Math.round((m.bl || 0) * 1000) + " ms)");
  ok(iv.length >= 6 && iv.every((d) => Math.abs(d - 0.5) < 0.005), "metrónomo a 120 en el WebView: " + m.on.length + " golpes, intervalos " + (iv.length ? Math.min(...iv).toFixed(3) + "–" + Math.max(...iv).toFixed(3) : "—") + " s");
} catch (e) { ok(false, "audio en modo Android: " + e.message); }
save();
// 5) 2.12.1 · si Android cierra la página (memoria), la app no se cierra: se vuelve a abrir y avisa (MainActivity)
try {
  try { await p.goto("chrome://crash", { timeout: 5000 }); } catch (e) {}
  await new Promise((r) => setTimeout(r, 12000));
  const vivo = sh("adb shell pidof app.padz.android").trim();
  const wvs = dev.webViews().filter((w) => w.pkg() === "app.padz.android"); let p2 = null;
  for (const w of wvs.reverse()) { try { const pg = await w.page(); await pg.waitForFunction(() => typeof showTab === "function", null, { timeout: 60000 }); p2 = pg; break; } catch (e) {} }
  const corte = p2 ? await p2.evaluate(() => !!window.padzCorteAnterior) : false;
  ok(!!vivo && !!p2, "se rompió la página adrede: la app sigue abierta y PADZ volvió a cargar (proceso " + (vivo || "cerrado") + ")");
  ok(corte, "PADZ avisa que la sesión anterior se cortó de golpe (registro de audio)"); shot("5-recuperada");
} catch (e) { ok(false, "recuperación tras cerrar la página: " + e.message); }
save();
const mem = sh("adb shell dumpsys meminfo app.padz.android | grep -m1 'TOTAL PSS' || adb shell dumpsys meminfo app.padz.android | grep -m1 TOTAL"); out.push("memoria: " + mem.trim());
fs.writeFileSync("capturas/resultado.txt", out.join("\n") + "\n" + (fallas ? fallas + " fallas" : "Todo bien") + "\n");
console.log(fallas ? fallas + " fallas" : "Todo bien"); await dev.close(); process.exit(fallas ? 1 : 0);

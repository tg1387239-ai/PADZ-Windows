// Baja la última versión de PADZ publicada en la web y deja todo listo para armar el instalador de Windows.
import fs from "node:fs";
import path from "node:path";
const BASE = process.env.PADZ_BASE || "https://padz.tg1387239.workers.dev/desktop/";
const get = async (f) => { for (let i = 0; i < 4; i++) { try { const r = await fetch(BASE + f + "?t=" + Date.now(), { cache: "no-store" }); if (r.ok) return Buffer.from(await r.arrayBuffer()); } catch (e) {} await new Promise((r) => setTimeout(r, 3000)); } throw new Error("No se pudo bajar " + f); };
const info = JSON.parse((await get("files.json")).toString("utf8"));
const out = path.resolve("app"); fs.rmSync(out, { recursive: true, force: true });
for (const f of info.files) { const p = path.join(out, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, await get(f)); }
const pkg = JSON.parse(fs.readFileSync(path.join(out, "package.json"), "utf8"));
if (pkg.version !== info.version) throw new Error(`Versiones distintas: ${pkg.version} / ${info.version}`);
fs.writeFileSync(path.join(out, "electron-builder.json"), JSON.stringify({
  appId: "app.padz.desktop",
  productName: "PADZ",
  copyright: "PADZ",
  electronVersion: info.electron,
  directories: { output: "dist" },
  files: ["**/*", "!electron-builder.json"],
  electronLanguages: ["es", "es-419", "en-US", "pt-BR"],
  protocols: [{ name: "PADZ", schemes: ["padz"] }],
  win: { target: [{ target: "nsis", arch: ["x64"] }], icon: "icon.ico", artifactName: "PADZ-Setup.${ext}" },
  nsis: { oneClick: true, perMachine: false, runAfterFinish: true, createDesktopShortcut: "always", createStartMenuShortcut: true, shortcutName: "PADZ", deleteAppDataOnUninstall: false, installerIcon: "icon.ico", uninstallerIcon: "icon.ico", artifactName: "PADZ-Setup.${ext}" },
  publish: null
}, null, 2));
console.log(`PADZ ${info.version}: ${info.files.length} archivos`);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${info.version}\n`);

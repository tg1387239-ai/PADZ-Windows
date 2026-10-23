# Genera las palabras de la voz guía con Piper (https://github.com/rhasspy/piper) para varias voces en español.
import json, os, subprocess, unicodedata, urllib.request

HF = "https://huggingface.co/rhasspy/piper-voices/resolve/main/"
# id, carpeta en piper-voices, nombre que ve el usuario, género, acento, hablante (para voces con varios)
VOCES = [
    ("daniela", "es/es_AR/daniela/high/es_AR-daniela-high", "Daniela", "mujer", "Argentina", None),
    ("claude", "es/es_MX/claude/high/es_MX-claude-high", "Clara", "mujer", "México", None),
    ("sharvard-f", "es/es_ES/sharvard/medium/es_ES-sharvard-medium", "Sara", "mujer", "España", 1),
    ("davefx", "es/es_ES/davefx/medium/es_ES-davefx-medium", "David", "hombre", "España", None),
    ("sharvard-m", "es/es_ES/sharvard/medium/es_ES-sharvard-medium", "Samuel", "hombre", "España", 0),
    ("carlfm", "es/es_ES/carlfm/x_low/es_ES-carlfm-x_low", "Carlos", "hombre", "España", None),
]
PALABRAS = ["intro", "verso", "pre coro", "coro", "puente", "interludio", "instrumental", "final", "repetimos", "una vez más",
            "todos", "bajamos", "subimos", "uno", "dos", "tres", "cuatro", "cinco", "seis", "parte", "canción", "solo",
            "outro", "vamp", "break", "sin batería", "entra la batería", "último coro"]
# cómo se dice cada palabra (con signos, suena con más energía)
DECIR = {"uno": "¡Uno!", "dos": "¡Dos!", "tres": "¡Tres!", "cuatro": "¡Cuatro!", "cinco": "¡Cinco!", "seis": "¡Seis!",
         "pre coro": "Precoro.", "vamp": "Vamp.", "break": "Break."}

def slug(w):
    w = unicodedata.normalize("NFD", w); w = "".join(c for c in w if unicodedata.category(c) != "Mn")
    return w.lower().replace(" ", "-")

os.makedirs("voices", exist_ok=True)
info = {"words": {w: slug(w) for w in PALABRAS}, "voices": []}
for vid, ruta, nombre, genero, acento, spk in VOCES:
    base = os.path.join("voices", os.path.basename(ruta))
    try:
        for ext in [".onnx", ".onnx.json"]:
            if not os.path.exists(base + ext): urllib.request.urlretrieve(HF + ruta + ext, base + ext)
        card = urllib.request.urlopen(HF + os.path.dirname(ruta) + "/MODEL_CARD").read().decode("utf-8", "replace")
    except Exception as e:
        print("NO ESTÁ", vid, e); continue
    out = os.path.join("out", "voces", vid); os.makedirs(out, exist_ok=True)
    open(os.path.join(out, "MODEL_CARD.txt"), "w").write(card)
    print("=====", vid, "=====\n" + card[:900])
    ok = 0
    for w in PALABRAS:
        txt = DECIR.get(w, w[0].upper() + w[1:] + ".")
        wav = "/tmp/w.wav"; cmd = ["piper", "--model", base + ".onnx", "--output_file", wav, "--sentence_silence", "0"]
        if spk is not None: cmd += ["--speaker", str(spk)]
        r = subprocess.run(cmd, input=txt.encode("utf-8"), capture_output=True)
        if r.returncode or not os.path.exists(wav): print("falló", vid, w, r.stderr[-300:]); continue
        # recorta el silencio del principio y del final, mono 24 kHz, mp3 liviano
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-af",
                        "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-16:TP=-1.5",
                        "-ac", "1", "-ar", "24000", "-b:a", "64k", os.path.join(out, slug(w) + ".mp3")], check=True)
        os.remove(wav); ok += 1
    info["voices"].append({"id": vid, "name": nombre, "gender": genero, "accent": acento, "words": ok, "model": ruta})
    print(vid, ok, "palabras")
json.dump(info, open("out/voces/info.json", "w"), ensure_ascii=False, indent=1)
print(json.dumps(info, ensure_ascii=False, indent=1))

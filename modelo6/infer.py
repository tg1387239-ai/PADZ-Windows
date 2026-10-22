"""Pure numpy + onnxruntime inference for htdemucs_6s (single 6-stem ONNX model).

This is the only ONNX export of the 6-stem htdemucs variant — adds
``guitar`` and ``piano`` stems on top of the standard 4.

Usage:
    python infer.py your-song.mp3 ./out/
    python infer.py your-song.mp3 ./out/ --providers coreml
    python infer.py your-song.mp3 ./out/ --stems guitar piano
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
import soundfile as sf

HERE = Path(__file__).resolve().parent
DEFAULT_MODEL = HERE / "htdemucs_6s.onnx"
FP16_MODEL = HERE / "htdemucs_6s_fp16weights.onnx"

SOURCES = ("drums", "bass", "other", "vocals", "guitar", "piano")
SAMPLE_RATE = 44100
SEGMENT_S = 7.8
N_SAMPLES = int(SEGMENT_S * SAMPLE_RATE)  # 343,980
N_CHANNELS = 2


def _make_window(n: int, overlap: int) -> np.ndarray:
    w = np.ones(n, dtype=np.float32)
    fade = np.linspace(0, 1, overlap, dtype=np.float32)
    w[:overlap] = fade
    w[-overlap:] = fade[::-1]
    return w


def separate(mix: np.ndarray, sr: int, *,
             model_path: Path = DEFAULT_MODEL,
             providers: list[str] | None = None,
             verbose: bool = False) -> dict[str, np.ndarray]:
    """Run htdemucs_6s on ``mix`` (shape ``(channels, samples)``).

    Returns ``{stem: (channels, samples) float32}`` for all 6 stems.
    """
    if mix.ndim != 2 or mix.shape[0] not in (1, 2):
        raise ValueError(f"expected (1|2, samples), got {mix.shape}")
    if mix.shape[0] == 1:
        mix = np.repeat(mix, 2, axis=0)
    if sr != SAMPLE_RATE:
        raise ValueError(
            f"input sample rate {sr} != model rate {SAMPLE_RATE}; "
            "resample first.",
        )

    providers = providers or ["CPUExecutionProvider"]
    sess_opts = ort.SessionOptions()
    sess_opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    sess = ort.InferenceSession(str(model_path), sess_options=sess_opts,
                                providers=providers)
    if verbose:
        print(f"  loaded {model_path.name} on {sess.get_providers()[0]}")

    total = mix.shape[1]
    overlap = N_SAMPLES // 4
    stride = N_SAMPLES - overlap
    n_chunks = max(1, (total + stride - 1) // stride)
    window = _make_window(N_SAMPLES, overlap)
    out = np.zeros((len(SOURCES), N_CHANNELS, total), dtype=np.float32)
    weight = np.zeros(total, dtype=np.float32)

    for i in range(n_chunks):
        start = i * stride
        end = min(start + N_SAMPLES, total)
        chunk = mix[:, start:end]
        if chunk.shape[1] < N_SAMPLES:
            chunk = np.pad(chunk, ((0, 0), (0, N_SAMPLES - chunk.shape[1])),
                           mode="constant")
        x = chunk[np.newaxis, ...].astype(np.float32, copy=False)
        stems = sess.run(["stems"], {"mix": x})[0][0]  # (6, 2, N)
        clen = end - start
        w = window[:clen]
        out[:, :, start:end] += stems[:, :, :clen] * w
        weight[start:end] += w
        if verbose:
            print(f"  chunk {i + 1}/{n_chunks}")

    out /= np.maximum(weight, 1e-8)
    return {src: out[i] for i, src in enumerate(SOURCES)}


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("input", type=Path)
    p.add_argument("output_dir", type=Path)
    p.add_argument("--providers", default="cpu",
                   choices=["cpu", "coreml", "cuda", "dml"])
    p.add_argument("--small", action="store_true",
                   help=f"Use {FP16_MODEL.name} (half the disk size, same runtime).")
    p.add_argument("--stems", nargs="+", default=list(SOURCES),
                   choices=list(SOURCES),
                   help="Subset of stems to write. Default: all 6.")
    args = p.parse_args()

    provider_map = {
        "cpu": ["CPUExecutionProvider"],
        "coreml": ["CoreMLExecutionProvider", "CPUExecutionProvider"],
        "cuda": ["CUDAExecutionProvider", "CPUExecutionProvider"],
        "dml": ["DmlExecutionProvider", "CPUExecutionProvider"],
    }
    providers = provider_map[args.providers]

    audio, sr = sf.read(str(args.input), dtype="float32", always_2d=True)
    audio = audio.T
    if sr != SAMPLE_RATE:
        print(f"ERROR: input sample rate is {sr} Hz; resample to {SAMPLE_RATE} first.",
              file=sys.stderr)
        return 2

    model_path = FP16_MODEL if args.small else DEFAULT_MODEL
    if not model_path.exists():
        print(f"ERROR: model file missing: {model_path}", file=sys.stderr)
        return 2
    stems = separate(audio, sr, model_path=model_path, providers=providers, verbose=True)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for s in args.stems:
        path = args.output_dir / f"{s}.wav"
        sf.write(str(path), stems[s].T, sr, subtype="PCM_16")
        print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

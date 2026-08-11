"""Dev-only aggregator for build-llm dojo.

Given the kata slugs produced by all subagents (slug-only, no numeric
prefix), this script:

  1. Renames each kata directory to add a 3-digit numeric prefix
     according to the chapter ordering.
  2. Collects every kata's `_ref.py` into one consolidated `_validate.py`
     (so we can re-run validation any time).
  3. Deletes individual `_ref.py` files.
  4. Generates `dojo.json` with the canonical ordered kata list.

Run once after all subagents finish:

    uv run --no-project --python 3.12 python dojos/build-llm/_aggregate.py
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
KATAS_DIR = HERE / "katas"

# Canonical order: chapter → list of slugs (from subagent reports).
# Numbering is computed by linearizing this list.
ORDER: list[tuple[str, list[str]]] = [
    # build-llm chapters
    ("build-llm ch1 — Understanding LLMs", [
        "001-bigram-language-model",          # already numbered (template)
        "002-autoregressive-generation",
        "003-encoder-vs-decoder",
        "004-training-pairs-from-text",
    ]),
    ("build-llm ch2 — Working with text data", [
        "simple-regex-tokenizer",
        "tokenizer-with-special-tokens",
        "bpe-via-tiktoken",
        "gpt-dataset",
        "embeddings-and-lookup",
        "positional-embeddings",
    ]),
    ("build-llm ch3 — Coding attention mechanisms", [
        "simplified-self-attention",
        "qkv-projections",
        "scaled-dot-product-attention",
        "causal-attention-mask",
        "multihead-attention-naive",
        "multihead-attention-efficient",
        "attention-mingpt-vs-raschka",
    ]),
    ("build-llm ch4 — Implementing a GPT model", [
        "layer-norm",
        "gelu",
        "feed-forward",
        "residual-connections",
        "transformer-block",
        "full-gpt-model",
        "weight-tying",
    ]),
    ("build-llm ch5 — Pretraining on unlabeled data", [
        "cross-entropy-from-logits",
        "perplexity",
        "training-loop",
        "train-val-split-with-divergence-detect",
        "decoding-strategies",
        "checkpoint-save-resume",
    ]),
    ("build-llm ch6 — Fine-tuning for classification", [
        "classification-head-swap",
        "last-token-vs-pooling",
        "freeze-unfreeze-verify",
        "classification-train-step",
        "gradual-unfreezing",
    ]),
    ("build-llm ch7 — Fine-tuning to follow instructions", [
        "alpaca-prompt-template",
        "prompt-template-strategies",
        "instruction-dataset",
        "masked-loss",
        "instruction-train-step",
    ]),
    ("build-llm appendix A — Intro to PyTorch", [
        "tensor-basics",
        "broadcasting",
        "autograd-hand-vs-machine",
        "nn-module-subclass",
        "train-xor-mlp",
        "dataset-dataloader-device",
    ]),
    ("build-llm appendix D — Bells & whistles", [
        "lr-warmup",
        "cosine-decay",
        "warmup-then-cosine",
        "gradient-clip-global-norm",
    ]),
    ("build-llm appendix E — LoRA", [
        "lora-linear-layer",
        "lora-parameter-count",
        "loraify-model",
        "lora-merge",
        "lora-train-vs-full",
    ]),
    # build-reasoning chapters
    ("build-reasoning ch1 — Understanding reasoning", [
        "pattern-match-vs-reasoning",
        "chain-of-thought-scorer",
        "inference-vs-training-tradeoff",
        "self-consistency-vote",
    ]),
    ("build-reasoning ch2 — Generating with pretrained", [
        "greedy-on-tiny-gpt",
        "qwen-vs-vanilla-attention",
        "streaming-generation",
        "kv-cache-attention",
        "chat-template-qwen",
    ]),
    ("build-reasoning ch3 — Evaluating reasoning models", [
        "extract-boxed-answer",
        "normalize-numeric-answer",
        "match-answers-layered",
        "accuracy-on-mini-math",
        "length-statistics",
    ]),
    ("build-reasoning ch4 — Inference-time scaling", [
        "majority-vote-aggregator",
        "weighted-majority",
        "best-of-n-with-verifier",
        "self-consistency-end-to-end",
        "accuracy-vs-samples-sweep",
    ]),
    ("build-reasoning ch5 — Self-refinement", [
        "refinement-loop",
        "heuristic-scorer",
        "stopping-criteria",
        "best-of-refined",
    ]),
    ("build-reasoning ch6 — Training with RL", [
        "bandit-reward",
        "policy-gradient-reinforce",
        "advantage-normalization",
        "group-relative-advantage",
        "grpo-loss",
        "grpo-bandit-training",
    ]),
    ("build-reasoning ch7 — Improving GRPO", [
        "kl-divergence-categorical",
        "kl-penalized-grpo",
        "adaptive-kl-coefficient",
        "reward-hacking-detector",
    ]),
    ("build-reasoning ch8 — Distillation", [
        "kl-distillation-loss",
        "combined-distillation-loss",
        "train-student-distill",
        "response-distillation-dataset",
    ]),
    ("build-reasoning appendix C — Qwen3 source", [
        "rms-norm",
        "rotary-positional-embeddings",
        "grouped-query-attention",
        "swiglu-ffn",
        "tiny-qwen-block",
    ]),
    ("build-reasoning appendix D — Larger LLMs", [
        "model-memory-footprint",
        "int8-quantization-roundtrip",
        "group-quantization",
        "model-parallel-2device",
    ]),
    ("build-reasoning appendix E — Batching & throughput", [
        "padding-waste",
        "dynamic-batch-pack",
        "continuous-batching-sim",
        "paged-kv-cache",
    ]),
    ("build-reasoning appendix F — Model evaluation", [
        "exact-match-and-f1",
        "bradley-terry-rating",
        "elo-rating",
        "llm-judge-mock",
        "win-rate-with-ci",
    ]),
    ("build-reasoning appendix G — Chat interface", [
        "chat-session-class",
        "truncation-strategies",
        "streaming-chat",
        "cli-chat-loop",
    ]),
]


def linearize() -> list[tuple[int, str, str]]:
    """Return list of (number, current_slug, new_slug)."""
    out: list[tuple[int, str, str]] = []
    n = 0
    for _section, slugs in ORDER:
        for slug in slugs:
            n += 1
            new_slug = f"{n:03d}-{_strip_existing_number(slug)}"
            out.append((n, slug, new_slug))
    return out


def _strip_existing_number(slug: str) -> str:
    """Remove a leading '001-' style prefix if present."""
    if len(slug) > 4 and slug[:3].isdigit() and slug[3] == "-":
        return slug[4:]
    return slug


def rename_kata_dirs() -> None:
    """Add NNN- prefix to each kata directory."""
    plan = linearize()
    for n, current, new in plan:
        cur_path = KATAS_DIR / current
        new_path = KATAS_DIR / new
        if cur_path == new_path:
            continue
        if not cur_path.exists():
            print(f"  ⚠  {n:03d}: source not found — {current!r}")
            continue
        if new_path.exists():
            print(f"  ⚠  {n:03d}: target exists — {new}")
            continue
        cur_path.rename(new_path)
        print(f"  → {n:03d}: {current} → {new}")


def collect_references_into_validate() -> None:
    """Read each kata's _ref.py, build a consolidated _validate.py.

    Tries the kata's _ref.py (saved by subagents) first; falls back to a
    pre-existing REFERENCES entry (for ch1 templates that don't have
    _ref.py because they predated the convention).
    """
    plan = linearize()
    seen: dict[str, str] = {}

    # Try _ref.py per kata
    for _, _, new_slug in plan:
        ref_path = KATAS_DIR / new_slug / "_ref.py"
        if ref_path.exists():
            seen[new_slug] = ref_path.read_text(encoding="utf-8")

    out: list[str] = []
    out.append('"""Auto-generated by _aggregate.py — DO NOT EDIT BY HAND.\n')
    out.append("Re-run `python _aggregate.py` to regenerate.\n")
    out.append('"""')
    out.append("")
    out.append("from __future__ import annotations")
    out.append("")
    out.append("REFERENCES: dict[str, str] = {")
    for slug, code in seen.items():
        out.append(f'    "{slug}": r"""\n{code.strip()}\n""",')
    out.append("}")
    out.append("")

    (HERE / "_validate_references.py").write_text("\n".join(out), encoding="utf-8")
    print(f"  wrote _validate_references.py with {len(seen)} entries")


def delete_individual_refs() -> None:
    """Remove each kata's _ref.py — they live in _validate_references.py now."""
    removed = 0
    for ref in KATAS_DIR.rglob("_ref.py"):
        ref.unlink()
        removed += 1
    print(f"  removed {removed} _ref.py files")


def generate_dojo_json() -> None:
    """Write dojo.json with the canonical ordered kata list."""
    plan = linearize()
    katas = [{"template": f"katas/{new_slug}/solution.py"} for _, _, new_slug in plan]

    dojo = {
        "$schema": "https://dojo.foo/schema/v1/dojo.json",
        "name": "@dojofoo/build-llm",
        "version": "0.0.1",
        "description": (
            "Build a Large Language Model — and a Reasoning Model — from scratch. "
            "23 chapters / appendices, ~114 katas. Companion to Raschka's two books."
        ),
        "runner": {"adapter": "exit-code"},
        "test": "uv run pytest {template} -v",
        "katas": katas,
    }

    out_path = HERE / "dojo.json"
    out_path.write_text(json.dumps(dojo, indent=2) + "\n", encoding="utf-8")
    print(f"  wrote dojo.json with {len(katas)} katas")


def main() -> None:
    if not KATAS_DIR.exists():
        raise SystemExit(f"No katas directory at {KATAS_DIR}")

    print("=== rename kata dirs ===")
    rename_kata_dirs()
    print()

    print("=== collect references ===")
    collect_references_into_validate()
    print()

    print("=== delete individual _ref.py ===")
    delete_individual_refs()
    print()

    print("=== generate dojo.json ===")
    generate_dojo_json()
    print()

    print("Done.")


if __name__ == "__main__":
    main()

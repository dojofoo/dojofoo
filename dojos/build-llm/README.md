# @dojocho/build-llm

> Build a Large Language Model — and a Reasoning Model — from scratch.

Hands-on katas based on Sebastian Raschka's two books, *Build a Large
Language Model (From Scratch)* and *Build a Reasoning Model (From
Scratch)*. Each chapter's load-bearing ideas become 4-7 katas; each
kata has a Socratic-first SENSEI brief, a stub `solution.py`, and a
graded `test_solution.py`.

## Install

```sh
npx dojos add build-llm
```

That clones Raschka's source repos (used as code-reading anchors in
some katas) and installs the Python deps (`torch`, `tiktoken`, `numpy`).

## Curriculum

23 chapters, ~115 katas, taken in order. The kata numbering is flat —
the chapter you're in is encoded in the slug:

- **001-019** — build-llm chapter 1 + 2 (Understanding LLMs, Text data)
- **020-040** — build-llm chapter 3 (Attention) — the conceptual heart
- **041-060** — build-llm chapter 4 (Implementing GPT)
- **061-075** — build-llm chapter 5 (Pretraining)
- **076-090** — build-llm chapter 6 + 7 (Fine-tuning)
- **091-105** — build-llm appendices A, D, E (PyTorch, training extras, LoRA)
- **106-115** — build-reasoning chapter 1 + 2 (Understanding, Generation)
- **116-130** — build-reasoning chapter 3-5 (Evaluation, Inference scaling, Self-refinement)
- **131-145** — build-reasoning chapter 6-8 (RL, GRPO, Distillation)
- **146-160** — build-reasoning appendices C, D, E, F, G (Qwen3 source, ops, eval, chat)

(Exact ranges adjust as the curriculum lands; see `dojo.json` for the
canonical kata list.)

## Belt levels

- **White belt** — chapters 1-2 of build-llm done. You can build a
  tokenizer + dataloader from a blank file.
- **Yellow belt** — chapters 3-4 done. You can implement causal
  multi-head attention and assemble a working tiny GPT.
- **Green belt** — chapters 5-7 done. You can train, fine-tune for
  classification, and instruction-tune.
- **Blue belt** — appendices A, D, E done. You can teach PyTorch,
  add training extras, and apply LoRA.
- **Brown belt** — build-reasoning chapters 1-5 done. You can
  evaluate, scale inference, and refine outputs.
- **Black belt** — chapters 6-8 + appendices C-G done. You can train
  with GRPO, distill, and build a complete production-style chat
  interface around any of it.

## Prerequisites

- Python 3.11+
- `uv` (Python package manager) — declared in `pyproject.toml`
- Knows what a neural net is and has written some PyTorch (or willing
  to learn alongside; appendix A katas are the on-ramp)
- A CPU is enough. No GPU required for any kata in the dojo. Tests
  target <5s on a laptop.

## Author your own variation

Each kata's `solution.py` is a stub. Tests are the contract. If you
want to rotate any kata through a constraint (no `dict`, no `torch.nn.Linear`,
no broadcasting, etc.), do it — the tests don't care how you pass
them, only that you do.

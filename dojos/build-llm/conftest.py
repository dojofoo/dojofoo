"""Shared pytest fixtures for build-llm dojo.

The `solution` fixture dynamically imports the student's workspace file,
avoiding sys.path issues with hyphenated kata directory names.

Matches the pattern used by other dojocho Python dojos (see
dojos/pydantic-agents/conftest.py).
"""

import importlib.util
from pathlib import Path

import pytest


def _find_workspace_file(kata_dir_name: str, filename: str = "solution.py") -> Path:
    """Locate the student's workspace file for a given kata.

    Looked up in two places, in order:
      1. <project>/katas/<kata-name>/solution.py  — consumer (npx dojos add layout)
      2. <dojo-dir>/katas/<kata-name>/solution.py — dev (running tests in-place)
    """
    dojo_dir = Path(__file__).resolve().parent

    # 1) consumer layout: dojo at <project>/.dojos/<dojo-name>/
    project_root = dojo_dir.parent.parent
    consumer = project_root / "katas" / kata_dir_name / filename
    if consumer.exists():
        return consumer

    # 2) in-place dev: dojo at dojos/<dojo-name>/, katas as siblings of conftest
    devpath = dojo_dir / "katas" / kata_dir_name / filename
    if devpath.exists():
        return devpath

    raise FileNotFoundError(
        f"Workspace file not found for kata {kata_dir_name!r}.\n"
        f"Looked at:\n  {consumer}\n  {devpath}\n"
        f"Run `npx dojos kata --start` to scaffold the kata first, or fill in "
        f"the dev-mode solution.py."
    )


def _load_module_from_path(path: Path, module_name: str = "solution"):
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load module from {path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture
def solution(request):
    """Fixture that loads the student's solution module for the current kata."""
    test_file = Path(request.fspath)
    kata_dir_name = test_file.parent.name
    workspace_file = _find_workspace_file(kata_dir_name)
    return _load_module_from_path(workspace_file)

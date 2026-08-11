"""Shared pytest fixtures for pydantic-agents dojo.

The `solution` fixture dynamically imports the student's workspace file,
avoiding sys.path issues with hyphenated kata directory names.
"""

import importlib.util
import os
from pathlib import Path

import pytest


def _find_workspace_file(kata_dir_name: str, filename: str = "solution.py") -> Path:
    """Locate the student's workspace file for a given kata."""
    # dojocho scaffolds workspace files into <project>/.dojos/katas/<kata-name>/
    # Walk up from the dojo directory to find the project root (.dojos parent)
    dojo_dir = Path(__file__).resolve().parent
    # The dojo lives at <project>/.dojos/<dojo-name>/
    project_root = dojo_dir.parent.parent
    workspace = project_root / "katas" / kata_dir_name / filename
    if workspace.exists():
        return workspace
    raise FileNotFoundError(
        f"Workspace file not found: {workspace}\n"
        f"Run `npx dojos kata --start` to scaffold the kata first."
    )


def _load_module_from_path(path: Path, module_name: str = "solution"):
    """Import a Python file as a module by its filesystem path."""
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load module from {path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture
def solution(request):
    """Fixture that loads the student's solution module for the current kata.

    Usage in tests:
        def test_something(solution):
            assert hasattr(solution, "MyModel")
    """
    # Determine kata directory from the test file's parent directory name
    test_file = Path(request.fspath)
    kata_dir_name = test_file.parent.name
    workspace_file = _find_workspace_file(kata_dir_name)
    return _load_module_from_path(workspace_file)

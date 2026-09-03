"""Constrained development runner for DSA function submissions.

Candidate code never executes inside the FastAPI process. The API validates a
small Python subset, then launches an isolated interpreter process with a hard
wall-clock timeout and a minimal builtin set. This is appropriate for local
practice, but it is not a production security boundary; production must move
the worker into an ephemeral container with CPU, memory, filesystem and network
limits (ADR-003).
"""

from __future__ import annotations

import ast
import json
from pathlib import Path
import subprocess
import sys
from typing import Any


WORKER_PATH = Path(__file__).with_name("runner_worker.py")
MAX_SOURCE_BYTES = 100_000
RUN_TIMEOUT_SECONDS = 3

FORBIDDEN_NODES = (
    ast.Import,
    ast.ImportFrom,
    ast.ClassDef,
    ast.AsyncFunctionDef,
    ast.Await,
    ast.Global,
    ast.Nonlocal,
)
FORBIDDEN_NAMES = {
    "__import__", "breakpoint", "compile", "dir", "eval", "exec", "globals",
    "help", "input", "locals", "open", "vars",
}


class UnsafeCodeError(ValueError):
    pass


def validate_source(source: str, function_name: str, parameter_names: list[str]) -> None:
    if len(source.encode("utf-8")) > MAX_SOURCE_BYTES:
        raise UnsafeCodeError("The solution is too large to run.")
    try:
        tree = ast.parse(source)
    except SyntaxError as exc:
        raise UnsafeCodeError(f"Syntax error on line {exc.lineno}: {exc.msg}") from exc

    function = next(
        (node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == function_name),
        None,
    )
    if function is None:
        raise UnsafeCodeError(f"Define a function named {function_name}({', '.join(parameter_names)}).")
    if len(function.args.args) != len(parameter_names):
        raise UnsafeCodeError(
            f"{function_name} must accept exactly {len(parameter_names)} parameter(s): "
            f"{', '.join(parameter_names)}."
        )

    for node in ast.walk(tree):
        if isinstance(node, FORBIDDEN_NODES):
            raise UnsafeCodeError(f"{type(node).__name__} is not allowed in the practice runner.")
        if isinstance(node, ast.Name) and node.id in FORBIDDEN_NAMES:
            raise UnsafeCodeError(f"{node.id} is not allowed in the practice runner.")
        if isinstance(node, ast.Attribute) and node.attr.startswith("__"):
            raise UnsafeCodeError("Dunder attribute access is not allowed in the practice runner.")


def run_candidate_code(
    source: str,
    test_cases: list[dict[str, Any]],
    function_name: str,
    parameter_names: list[str],
    validator_key: str = "exact",
) -> dict[str, Any]:
    validate_source(source, function_name, parameter_names)
    payload = json.dumps({
        "source": source,
        "test_cases": test_cases,
        "function_name": function_name,
        "validator_key": validator_key,
    })
    creation_flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
    try:
        completed = subprocess.run(
            [sys.executable, "-I", "-S", str(WORKER_PATH)],
            input=payload,
            text=True,
            capture_output=True,
            timeout=RUN_TIMEOUT_SECONDS,
            creationflags=creation_flags,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return {
            "passed": 0,
            "total": len(test_cases),
            "runtime_error": f"Execution exceeded {RUN_TIMEOUT_SECONDS} seconds.",
            "results": [],
        }

    if completed.returncode != 0:
        message = completed.stderr.strip() or "The runner stopped unexpectedly."
        return {
            "passed": 0,
            "total": len(test_cases),
            "runtime_error": message[-800:],
            "results": [],
        }

    try:
        return json.loads(completed.stdout)
    except json.JSONDecodeError:
        return {
            "passed": 0,
            "total": len(test_cases),
            "runtime_error": "The runner returned an invalid response.",
            "results": [],
        }

"""Fixed worker process used by code_runner.py. Do not import from the API."""

import json
import sys


SAFE_BUILTINS = {
    "abs": abs,
    "all": all,
    "any": any,
    "bool": bool,
    "dict": dict,
    "enumerate": enumerate,
    "filter": filter,
    "float": float,
    "int": int,
    "len": len,
    "list": list,
    "map": map,
    "max": max,
    "min": min,
    "range": range,
    "reversed": reversed,
    "set": set,
    "sorted": sorted,
    "str": str,
    "sum": sum,
    "tuple": tuple,
    "zip": zip,
}


def valid_pair_indices_sum(value, args):
    nums, target = args
    if not isinstance(value, (list, tuple)) or len(value) != 2:
        return False
    left, right = value
    if not isinstance(left, int) or not isinstance(right, int) or left == right:
        return False
    if not (0 <= left < len(nums) and 0 <= right < len(nums)):
        return False
    return nums[left] + nums[right] == target


def is_valid(actual, expected, validator_key, args):
    if validator_key == "pair_indices_sum":
        return valid_pair_indices_sum(actual, args)
    if validator_key == "unordered_list":
        return isinstance(actual, (list, tuple)) and sorted(actual) == sorted(expected)
    return actual == expected


def main():
    payload = json.loads(sys.stdin.read())
    namespace = {"__builtins__": SAFE_BUILTINS}
    exec(compile(payload["source"], "solution.py", "exec"), namespace, namespace)
    function_name = payload["function_name"]
    solution = namespace.get(function_name)
    if not callable(solution):
        raise TypeError(f"{function_name} was not defined.")

    results = []
    for case in payload["test_cases"]:
        args = case["input"]["args"]
        try:
            actual = solution(*args)
            passed = is_valid(actual, case["expected"], payload["validator_key"], args)
            error = None
        except Exception as exc:
            actual = None
            passed = False
            error = f"{type(exc).__name__}: {exc}"
        results.append({
            "id": str(case.get("id", case.get("case_key", "case"))),
            "label": case["label"],
            "input": case.get("input_display", repr(args)),
            "expected": case.get("expected_display", repr(case["expected"])),
            "actual": repr(actual) if error is None else None,
            "passed": passed,
            "error": error,
        })

    print(json.dumps({
        "passed": sum(1 for result in results if result["passed"]),
        "total": len(results),
        "runtime_error": None,
        "results": results,
    }))


if __name__ == "__main__":
    main()

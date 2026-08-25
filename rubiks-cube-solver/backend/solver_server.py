"""
Rubik's Cube Solver API
------------------------
Wraps Herbert Kociemba's two-phase algorithm (the same class of engine used by
real speedcubing/robot-solver software). It is not a trained neural network —
a neural solver good enough to reliably crack arbitrary scrambles (e.g.
DeepCubeA) needs a large trained model and heavy search at inference time.
This engine is tiny (a few MB of pruning tables), solves in well under a
second, and returns near-optimal solutions (usually <= 20 moves).

This uses the algorithm's bundled pure-Python implementation (vendored in
./pykociemba) rather than the `kociemba` PyPI package's C extension. That
package requires a C compiler to install on Windows (no prebuilt wheel is
published), which is a common source of setup pain. The pure-Python version
needs no compiler at all — it's a few hundred ms slower per solve, which is
irrelevant here.

Endpoints:
  GET  /health              -> {"status": "ok"}
  POST /solve  {"state": "<54-char facelet string>"} -> {"solution": ["R","U'","F2", ...], "length": N}

The facelet string must be 54 characters using letters U R F D L B, in the
standard Kociemba face order U,R,F,D,L,B, each face's 9 stickers listed
row-major (top-left to bottom-right) using this net:

            U1 U2 U3
            U4 U5 U6
            U7 U8 U9
 L1 L2 L3   F1 F2 F3   R1 R2 R3   B1 B2 B3
 L4 L5 L6   F4 F5 F6   R4 R5 R6   B4 B5 B6
 L7 L8 L9   F7 F8 F9   R7 R8 R9   B7 B8 B9
            D1 D2 D3
            D4 D5 D6
            D7 D8 D9

Each letter in the string is the color's *home face* letter (i.e. whichever
face that color belongs to on a solved cube: U=white, D=yellow, F=blue,
B=green, R=red, L=orange in this project's color scheme).
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from pykociemba import search

app = Flask(__name__)
CORS(app)  # allow the HTML page (opened via file:// or any local port) to call this API

VALID_LETTERS = set("URFDLB")

_SOLVER_ERRORS = {
    "Error 1": "There is not exactly one facelet of each colour",
    "Error 2": "Not all 12 edges exist exactly once",
    "Error 3": "Flip error: One edge has to be flipped",
    "Error 4": "Not all corners exist exactly once",
    "Error 5": "Twist error: One corner has to be twisted",
    "Error 6": "Parity error: Two corners or two edges have to be exchanged",
    "Error 7": "No solution exists for the given maxDepth",
    "Error 8": "Timeout, no solution within given time",
}


def solve_facelets(cubestring: str, max_depth: int = 24) -> str:
    """Pure-Python two-phase solve. Raises ValueError on an invalid/unsolvable state."""
    result = search.Search().solution(cubestring, max_depth, 1000, False).strip()
    if result in _SOLVER_ERRORS:
        raise ValueError(_SOLVER_ERRORS[result])
    return result


def validate_facelet_string(state: str):
    if not isinstance(state, str) or len(state) != 54:
        return "State must be a 54-character string."
    if set(state) - VALID_LETTERS:
        return "State may only contain the letters U R F D L B."
    counts = {c: state.count(c) for c in VALID_LETTERS}
    bad = {c: n for c, n in counts.items() if n != 9}
    if bad:
        return f"Each face letter must appear exactly 9 times, got: {bad}"
    return None


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/solve", methods=["POST"])
def solve():
    payload = request.get_json(silent=True) or {}
    state = payload.get("state", "")

    err = validate_facelet_string(state)
    if err:
        return jsonify({"error": err}), 400

    solved_reference = "".join(c * 9 for c in "URFDLB")
    if state == solved_reference:
        return jsonify({"solution": [], "length": 0})

    try:
        raw = solve_facelets(state)
    except ValueError as e:
        # Raised for facelet strings that don't correspond to a physically
        # valid, solvable cube (e.g. bad sticker read from the 3D scene, or
        # an impossible permutation/parity).
        return jsonify({"error": f"Cube state is not solvable / invalid: {e}"}), 422

    moves = raw.split() if raw else []
    return jsonify({"solution": moves, "length": len(moves)})


if __name__ == "__main__":
    print("Rubik's Cube solver API starting on http://localhost:5001")
    app.run(host="0.0.0.0", port=5001, debug=False)

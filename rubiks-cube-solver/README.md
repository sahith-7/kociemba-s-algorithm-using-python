# Rubik's Cube Solver

Your 3D cube (Three.js) + a local Python solver API that reads the cube's
current state and returns a move sequence, which is then animated on the
real cube.

## A quick note on "ML model"

A neural network good enough to reliably solve *any* scrambled cube from
scratch (e.g. DeepCubeA-style deep reinforcement learning) needs a large
trained model plus search at solve-time — it ends up bigger and slower than
the alternative, not smaller. The actual industry-standard "small and
efficient" solver — used in real cube-solving robots and speedcubing
software — is **Herbert Kociemba's two-phase algorithm**. That's what's
wired up here:

- **Size:** a few MB of pruning tables (bundled)
- **Speed:** solves in well under half a second
- **Quality:** near-optimal, almost always ≤ 20 moves (God's number)

This project uses the algorithm's **pure-Python implementation** (vendored
in `backend/pykociemba/`) rather than the `kociemba` PyPI package's C
extension. The C version is slightly faster, but has no prebuilt wheel for
Windows — installing it requires the Microsoft C++ Build Tools, which is a
common source of setup pain. The pure-Python version needs zero compilation
on any OS and is still comfortably fast enough (solves in <0.5s even on a
maximally-scrambled cube).

If you specifically want a from-scratch trained neural solver as a learning
project (rather than for a solver that actually works well), that's a much
bigger undertaking — say the word and we can scope that separately.

## Folder structure

```
rubiks-cube-solver/
├── backend/
│   ├── solver_server.py     Flask API wrapping the Kociemba solver
│   ├── pykociemba/          vendored pure-Python solver engine (no compiler needed)
│   └── requirements.txt
├── frontend/
│   ├── rubikscube.html      your original file + a "Solve Cube" button
│   ├── cube.css             + styling for the new button/status line
│   └── cube.js              your original file + solver integration
└── README.md
```

## How it works

1. **Reading the cube state** — `getCubeStateString()` in `cube.js` reuses
   the exact same face-normal/up/right vectors your HUD panel already uses
   to read each of the 54 stickers straight out of the live Three.js scene,
   and encodes them as a standard Kociemba facelet string.
2. **Solving** — that string is POSTed to `http://localhost:5001/solve`,
   which runs `kociemba.solve()` and returns a move list like
   `["R", "U'", "F2", ...]`.
3. **Animating the solution** — `playMoveSequence()` plays those moves back
   on the real cube using your existing `rotateLayer()` animation engine
   (via a new `applyAbsoluteMove()` — the same rotation logic as your
   camera-relative moves, just against fixed world axes instead of the
   camera).

No cube state is tracked separately in JS — every solve reads live directly
from the 3D scene, so it can't drift out of sync.

## Setup

### 1. Run the solver API

```bash
cd backend
pip install -r requirements.txt
python3 solver_server.py
```

You should see:
```
Rubik's Cube solver API starting on http://localhost:5001
```

Leave this running in a terminal.

### 2. Open the cube

Just open `frontend/rubikscube.html` in a browser (double-click it, or serve
the folder with e.g. `python3 -m http.server` from inside `frontend/`).

Scramble the cube, then click **Solve Cube**. Status text under the buttons
will show progress ("Solving…", "Solved in N moves.").

## Calibration note (read if Solve doesn't actually solve it)

Move directions (`R` = clockwise vs counter-clockwise) were derived directly
from your own `makeCameraRelativeMove()` logic and verified with an
independent Python cube simulator (`SIDE_CYCLES` round-trip test — scramble
→ solve → back to solved, confirmed working). If, after visually testing in
a real browser, the "solved" result actually looks scrambled in a
consistent, cube-still-valid way, it means the *direction* convention (not
the axis) is flipped for one or more faces. That's fixed in one place: in
`applyAbsoluteMove()` inside `cube.js`, flip the sign on the affected
face's entry in `vecMap`.

## API reference

`POST /solve`
```json
{ "state": "<54-char string, letters U R F D L B, 9 of each>" }
```
Response:
```json
{ "solution": ["R", "U'", "F2", "..."], "length": 12 }
```
Errors return `400` (malformed input) or `422` (well-formed but physically
impossible/unsolvable cube state — e.g. a misread sticker).

`GET /health` → `{ "status": "ok" }`

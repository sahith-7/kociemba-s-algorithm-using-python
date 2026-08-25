// Scene Setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(7, 8, 11);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.getElementById('canvas-container').appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Realistic Studio Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight1.position.set(10, 20, 15);
scene.add(dirLight1);

const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
dirLight2.position.set(-10, -20, -15);
scene.add(dirLight2);

// Rubik's Cube Colors [Right, Left, Top, Bottom, Front, Back]
const colorHexMap = {
    'R': '#b71234', // Red
    'L': '#ff5800', // Orange
    'U': '#ffffff', // White
    'D': '#ffd500', // Yellow
    'F': '#0046ad', // Blue
    'B': '#009b48', // Green
    'X': '#111111'  // Inner core
};

const colors = [
    0xb71234, 
    0xff5800, 
    0xffffff, 
    0xffd500, 
    0x0046ad, 
    0x009b48  
];

const cubeGroup = new THREE.Group();
scene.add(cubeGroup);

const size = 1;
const spacing = 0.03;
let isAnimating = false;

// Build 3x3x3 Cubies with Smooth Rounded Edges
function createRubiksCube() {
    const geometry = new THREE.RoundedBoxGeometry(size, size, size, 4, 0.08);
    
    for (let x = -1; x <= 1; x++) {
        for (let y = -1; y <= 1; y++) {
            for (let z = -1; z <= 1; z++) {
                const materials = [];
                for (let i = 0; i < 6; i++) {
                    let isOuter = false;
                    if (i === 0 && x === 1) isOuter = true;
                    if (i === 1 && x === -1) isOuter = true;
                    if (i === 2 && y === 1) isOuter = true;
                    if (i === 3 && y === -1) isOuter = true;
                    if (i === 4 && z === 1) isOuter = true;
                    if (i === 5 && z === -1) isOuter = true;

                    materials.push(new THREE.MeshStandardMaterial({
                        color: isOuter ? colors[i] : 0x111111,
                        roughness: 0.12,
                        metalness: 0.05
                    }));
                }

                const cubie = new THREE.Mesh(geometry, materials);
                cubie.position.set(
                    x * (size + spacing),
                    y * (size + spacing),
                    z * (size + spacing)
                );
                cubeGroup.add(cubie);
            }
        }
    }
}

createRubiksCube();

// Smooth Layer Rotation Engine
function rotateLayer(axis, layerValue, angle, duration = 180, callback = null) {
    if (isAnimating) return;
    isAnimating = true;

    const tolerance = 0.1;
    const targetLayerPieces = cubeGroup.children.filter(c => {
        return Math.abs(c.position[axis] - layerValue * (size + spacing)) < tolerance;
    });

    const pivot = new THREE.Group();
    scene.add(pivot);
    targetLayerPieces.forEach(p => pivot.attach(p));

    const startTime = performance.now();

    function animateFrame(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        const ease = 1 - Math.pow(1 - progress, 3);
        pivot.rotation[axis] = angle * ease;

        if (progress < 1) {
            requestAnimationFrame(animateFrame);
        } else {
            pivot.rotation[axis] = angle;
            pivot.updateMatrixWorld();
            targetLayerPieces.forEach(p => cubeGroup.attach(p));
            scene.remove(pivot);
            isAnimating = false;
            if (callback) callback();
        }
    }

    requestAnimationFrame(animateFrame);
}

// Camera-Relative Move Mapping
function makeCameraRelativeMove(faceType, isPrime = false) {
    if (isAnimating) return;

    const cameraDir = new THREE.Vector3();
    camera.getWorldDirection(cameraDir);

    const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);

    const xAxis = new THREE.Vector3(1, 0, 0);
    const yAxis = new THREE.Vector3(0, 1, 0);
    const zAxis = new THREE.Vector3(0, 0, 1);

    function getDominantAxis(vec) {
        const xDot = Math.abs(vec.dot(xAxis));
        const yDot = Math.abs(vec.dot(yAxis));
        const zDot = Math.abs(vec.dot(zAxis));
        if (xDot > yDot && xDot > zDot) return 'x';
        if (yDot > xDot && yDot > zDot) return 'y';
        return 'z';
    }

    let targetVector = new THREE.Vector3();
    const faceName = faceType.toUpperCase();

    if (faceName === 'R') targetVector.copy(cameraRight);
    else if (faceName === 'L') targetVector.copy(cameraRight).negate();
    else if (faceName === 'U') targetVector.copy(cameraUp);
    else if (faceName === 'D') targetVector.copy(cameraUp).negate();
    else if (faceName === 'F') targetVector.copy(cameraDir).negate();
    else if (faceName === 'B') targetVector.copy(cameraDir);

    const domAxisName = getDominantAxis(targetVector);
    const domAxisVec = domAxisName === 'x' ? xAxis : (domAxisName === 'y' ? yAxis : zAxis);
    
    const dot = targetVector.dot(domAxisVec);
    const layerVal = dot > 0 ? 1 : -1;

    let direction = isPrime ? -1 : 1;
    if (domAxisName === 'x' && layerVal < 0) direction *= -1;
    if (domAxisName === 'y' && layerVal < 0) direction *= -1;
    if (domAxisName === 'z' && layerVal < 0) direction *= -1;

    rotateLayer(domAxisName, layerVal, direction * (Math.PI / 2));
}

// ============================================================
// SOLVER INTEGRATION
// Reads the live cube state straight out of the 3D scene (reusing the exact
// same face/up/right vectors as the HUD renderer above, since those already
// match the standard Kociemba facelet net), sends it to the local solver
// API, and animates the returned move list on the real cube.
// ============================================================

const SOLVER_API_URL = 'http://localhost:5001/solve';

// Map material hex color -> home-face letter (based on colorHexMap: which
// face that color belongs to on a solved cube).
const hexToFaceLetter = {};
for (const letter in colorHexMap) {
    if (letter === 'X') continue;
    hexToFaceLetter[colorHexMap[letter].replace('#', '').toLowerCase()] = letter;
}

// Read the 9 sticker letters for one face, in standard row-major
// (row0=top, col0=left) order, using the same normal/up/right convention
// already used by renderFaceHUD.
function readFaceLetters(faceNormal, upVector, rightVector) {
    const step = size + spacing;
    const tolerance = 0.1;
    const letters = [];

    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
            const rOffset = 1 - row;
            const cOffset = col - 1;

            const targetPos = new THREE.Vector3()
                .copy(faceNormal)
                .multiplyScalar(1.0 * step)
                .addScaledVector(rightVector, cOffset * step)
                .addScaledVector(upVector, rOffset * step);

            let letter = '?';
            for (const c of cubeGroup.children) {
                if (c.position.distanceTo(targetPos) < tolerance) {
                    const invMatrix = c.matrixWorld.clone().invert();
                    const localNormal = faceNormal.clone().transformDirection(invMatrix).round();

                    let matIdx = -1;
                    if (Math.abs(localNormal.x - 1) < 0.1) matIdx = 0;
                    else if (Math.abs(localNormal.x + 1) < 0.1) matIdx = 1;
                    else if (Math.abs(localNormal.y - 1) < 0.1) matIdx = 2;
                    else if (Math.abs(localNormal.y + 1) < 0.1) matIdx = 3;
                    else if (Math.abs(localNormal.z - 1) < 0.1) matIdx = 4;
                    else if (Math.abs(localNormal.z + 1) < 0.1) matIdx = 5;

                    if (matIdx !== -1 && c.material[matIdx]) {
                        const hex = c.material[matIdx].color.getHexString().toLowerCase();
                        letter = hexToFaceLetter[hex] || '?';
                    }
                    break;
                }
            }
            letters.push(letter);
        }
    }
    return letters;
}

// Build the full 54-char Kociemba facelet string in face order U R F D L B.
function getCubeStateString() {
    const faces = [
        // [normal, up, right] — identical vectors to the HUD renderer
        [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0)],   // U
        [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1)],   // R
        [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)],    // F
        [new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)],   // D
        [new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)],   // L
        [new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0)],  // B
    ];

    let result = '';
    for (const [normal, up, right] of faces) {
        result += readFaceLetters(normal, up, right).join('');
    }
    return result;
}

// Absolute (non-camera-relative) move used to physically execute a solver
// move like "R", "R'", "R2" on the real cube.
function applyAbsoluteMove(notation, duration = 150) {
    return new Promise((resolve) => {
        const face = notation[0];
        const isPrime = notation.includes("'");
        const isDouble = notation.includes('2');

        const vecMap = {
            R: [1, 0, 0], L: [-1, 0, 0],
            U: [0, 1, 0], D: [0, -1, 0],
            F: [0, 0, 1], B: [0, 0, -1],
        };
        const [vx, vy, vz] = vecMap[face];
        let axis, layerVal;
        if (vx !== 0) { axis = 'x'; layerVal = vx; }
        else if (vy !== 0) { axis = 'y'; layerVal = vy; }
        else { axis = 'z'; layerVal = vz; }

        let direction = isPrime ? 1 : -1;
        if (layerVal < 0) direction *= -1;

        const angle = direction * (Math.PI / 2) * (isDouble ? 2 : 1);

        rotateLayer(axis, layerVal, angle, duration, resolve);
    });
}

// Run a list of moves ("R", "U'", "F2", ...) one at a time in sequence.
async function playMoveSequence(moves, duration = 150) {
    for (const mv of moves) {
        await applyAbsoluteMove(mv, duration);
    }
}

function setSolveStatus(text) {
    const el = document.getElementById('solve-status');
    if (el) el.textContent = text;
}

async function solveCube() {
    if (isAnimating) return;
    const btn = document.getElementById('solve-btn');
    if (btn) btn.disabled = true;
    setSolveStatus('Reading cube state…');

    try {
        const state = getCubeStateString();

        if (state.includes('?')) {
            setSolveStatus('Could not read cube state — try again.');
            return;
        }

        setSolveStatus('Solving…');
        const response = await fetch(SOLVER_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            setSolveStatus('Solver error: ' + (err.error || response.statusText));
            return;
        }

        const data = await response.json();
        if (data.length === 0) {
            setSolveStatus('Already solved!');
            return;
        }

        setSolveStatus(`Solving in ${data.length} moves…`);
        await playMoveSequence(data.solution);
        setSolveStatus(`Solved in ${data.length} moves.`);
    } catch (e) {
        setSolveStatus('Could not reach solver server (is it running on :5001?).');
        console.error(e);
    } finally {
        if (btn) btn.disabled = false;
    }
}

// Keyboard Support
window.addEventListener('keydown', (e) => {
    if (isAnimating) return;
    const key = e.key.toUpperCase();
    const isShift = e.shiftKey;

    switch(key) {
        case 'R': makeCameraRelativeMove('R', isShift); break;
        case 'L': makeCameraRelativeMove('L', isShift); break;
        case 'U': makeCameraRelativeMove('U', isShift); break;
        case 'D': makeCameraRelativeMove('D', isShift); break;
        case 'F': makeCameraRelativeMove('F', isShift); break;
        case 'B': makeCameraRelativeMove('B', isShift); break;
    }
});

// Scramble Functionality
document.getElementById('scramble-btn').addEventListener('click', () => {
    if (isAnimating) return;
    
    const faces = ['R', 'L', 'U', 'D', 'F', 'B'];
    let movesLeft = 15;

    function executeRandomMove() {
        if (movesLeft <= 0) return;
        const randomFace = faces[Math.floor(Math.random() * faces.length)];
        const isPrime = Math.random() < 0.5;
        
        makeCameraRelativeMove(randomFace, isPrime);
        movesLeft--;
        setTimeout(executeRandomMove, 95);
    }

    executeRandomMove();
});

// Live 2D HUD Face Rendering Generator using Absolute Spatial Raycasting/Normal Checking
function renderFaceHUD(canvasId, faceNormal, upVector, rightVector) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = 60;
    canvas.height = 60;
    ctx.clearRect(0, 0, 60, 60);

    const tileSize = 18;
    const gap = 2;
    const startX = 2;
    const startY = 2;

    const step = size + spacing;
    const tolerance = 0.1;

    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
            // Map 2D grid coordinates (row, col) to 3D world offsets from face center
            // col 0 -> -1 (left), col 2 -> +1 (right)
            // row 0 -> +1 (top), row 2 -> -1 (bottom)
            const rOffset = 1 - row;
            const cOffset = col - 1;

            const targetPos = new THREE.Vector3()
                .copy(faceNormal)
                .multiplyScalar(1.0 * step)
                .addScaledVector(rightVector, cOffset * step)
                .addScaledVector(upVector, rOffset * step);

            // Find the cubie closest to this absolute position slot
            let matchedColor = '#111111';

            for (let c of cubeGroup.children) {
                if (c.position.distanceTo(targetPos) < tolerance) {
                    // Test ray/normal against this cubie's faces in world space
                    const invMatrix = c.matrixWorld.clone().invert();
                    const localNormal = faceNormal.clone().transformDirection(invMatrix).round();

                    // Find matching face material index based on local normal vector
                    let matIdx = -1;
                    if (Math.abs(localNormal.x - 1) < 0.1) matIdx = 0;
                    else if (Math.abs(localNormal.x + 1) < 0.1) matIdx = 1;
                    else if (Math.abs(localNormal.y - 1) < 0.1) matIdx = 2;
                    else if (Math.abs(localNormal.y + 1) < 0.1) matIdx = 3;
                    else if (Math.abs(localNormal.z - 1) < 0.1) matIdx = 4;
                    else if (Math.abs(localNormal.z + 1) < 0.1) matIdx = 5;

                    if (matIdx !== -1 && c.material[matIdx]) {
                        matchedColor = '#' + c.material[matIdx].color.getHexString();
                    }
                    break;
                }
            }

            ctx.fillStyle = matchedColor;
            ctx.fillRect(
                startX + col * (tileSize + gap),
                startY + row * (tileSize + gap),
                tileSize,
                tileSize
            );
        }
    }
}

// Update HUD mapping absolute directions: Front(Z=1), Back(Z=-1), Right(X=1), Left(X=-1), Up(Y=1), Down(Y=-1)
function updateHUD() {
    // Front Face (Normal pointing towards +Z)
    renderFaceHUD('face-front', new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
    // Back Face (Normal pointing towards -Z)
    renderFaceHUD('face-back', new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0));
    // Right Face (Normal pointing towards +X)
    renderFaceHUD('face-right', new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1));
    // Left Face (Normal pointing towards -X)
    renderFaceHUD('face-left', new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
    // Up Face (Normal pointing towards +Y)
    renderFaceHUD('face-up', new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0));
    // Down Face (Normal pointing towards -Y)
    renderFaceHUD('face-down', new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0));
}

// Dynamic Color-Changing Background based on Camera Angle
function updateDynamicBackground() {
    const camPos = camera.position.clone().normalize();
    const hue = Math.floor(180 + camPos.x * 90 + camPos.y * 60);
    const lightness = 90 + Math.floor(camPos.z * 4);
    document.body.style.background = `hsl(${hue}, 45%, ${lightness}%)`;
}

// Window Responsiveness
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    updateDynamicBackground();
    updateHUD();
    renderer.render(scene, camera);
}

animate();
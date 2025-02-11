const canvas = document.getElementById('treeCanvas');
const ctx = canvas.getContext('2d');
const form = document.getElementById('inputForm');
const stepsInput = document.getElementById('steps');

let lines = []; // Store all lines to check for overlaps

// Resize canvas based on the window size
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas(); // Set canvas size on page load

// Generate a random angle in radians
function getRandomAngle() {
    return Math.random() * 2 * Math.PI;
}

// Convert units to pixels for drawing
function unitToPixels(unit) {
    return unit * 50; // Adjust this value to make the lines longer or shorter
}

// Function to check if two line segments intersect
function linesIntersect(line1, line2) {
    const [x1, y1, x2, y2] = [line1.start.x, line1.start.y, line1.end.x, line1.end.y];
    const [x3, y3, x4, y4] = [line2.start.x, line2.start.y, line2.end.x, line2.end.y];

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (denom === 0) return null; // Parallel lines

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = ((x1 - x3) (y1 - y2) - (y1 - y3) * (x1 - x2)) / denom;
    if (t > 0 && t < 1 && u > 0 && u < 1) {
        return {x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1)}; // Return the intersection point
    }
    return null;
}

// Function to attempt to draw a branch, adjusting angle on intersection
function attemptDrawBranch(x, y, angle, length, stepsLeft) {
    let adjustment = 0;
    const maxAdjustment = Math.PI; // Total adjustment can be up to 180 degrees

    while (adjustment < maxAdjustment) {
        const newX = x + length * Math.cos(angle + adjustment);
        const newY = y + length * Math.sin(angle + adjustment);
        const newLine = { start: { x, y }, end: { x: newX, y: newY } };

        let intersects = false;
        lines.forEach(existingLine => {
            if (linesIntersect(newLine, existingLine)) {
                intersects = true;
            }
        });

        if (!intersects) {
            // Draw the line successfully without intersection
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(newX, newY);
            ctx.strokeStyle = 'black';
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(newX, newY, 3, 0, 2 * Math.PI);
            ctx.fillStyle = 'black';
            ctx.fill();

            lines.push(newLine);
            drawBranch(newX, newY, stepsLeft - 1);
            return; // Exit after successful drawing
        }

        // Adjust angle slightly and retry
        adjustment += Math.PI / 180; // Adjust by 1 degree
    }
}

// Recursive function to generate tree branches
function drawBranch(x, y, stepsLeft, isRoot = false) {
    if (stepsLeft === 0) return;

    const branchCount = isRoot ? 1 : Math.floor(Math.random() * 4) + 1; // 1 branch from root, 1-4 from others
    for (let i = 0; i < branchCount; i++) {
        const angle = getRandomAngle();
        const length = unitToPixels(1);
        attemptDrawBranch(x, y, angle, length, stepsLeft);
    }
}

// Handle form submission to generate the tree
form.addEventListener('submit', (e) => {
    e.preventDefault();
    const steps = parseInt(stepsInput.value);
    lines = []; // Clear previous lines
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear the canvas

    const startX = canvas.width / 2;
    const startY = canvas.height / 2;

    // Draw the central origin dot
    ctx.beginPath();
    ctx.arc(startX, startY, 5, 0, 2 * Math.PI);
    ctx.fillStyle = 'black';
    ctx.fill();

    // Start the recursive drawing from the origin
    drawBranch(startX, startY, steps, true); // Root starts with 1 branch
});

const canvas = document.getElementById('treeCanvas');
const ctx = canvas.getContext('2d');
const form = document.getElementById('inputForm');
const stepsInput = document.getElementById('steps');

let lines = []; // Store all lines drawn to check for overlaps

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

// Generate a random number between 1 and 4 for branching
function getRandomBranchCount() {
    return Math.floor(Math.random() * 4) + 1;
}

// Convert units to pixels for drawing
function unitToPixels(unit) {
    return unit * 50; // Adjust this value to make the lines longer or shorter
}

// Function to check if two line segments intersect, excluding their endpoints
function linesIntersect(line1, line2) {
    const [x1, y1, x2, y2] = [line1.start.x, line1.start.y, line1.end.x, line1.end.y];
    const [x3, y3, x4, y4] = [line2.start.x, line2.start.y, line2.end.x, line2.end.y];

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (denom === 0) return null; // Parallel or coincident lines

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / denom;

    // Check that the intersection is not at the endpoints of either line
    if (t > 0 && t < 1 && u > 0 && u < 1) {
        return {x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1)}; // Return the intersection point
    }
    return null;
}

// Recursive function to generate tree branches and mark intersections
function drawBranch(x, y, stepsLeft, isRoot = false) {
    if (stepsLeft === 0) return;

    const branchCount = isRoot ? 1 : getRandomBranchCount(); // 1 branch from root, 1-4 from others
    for (let i = 0; i < branchCount; i++) {
        const angle = getRandomAngle();
        const length = unitToPixels(1); // Adjust the length of each branch
        const newX = x + length * Math.cos(angle);
        const newY = y + length * Math.sin(angle);

        const newLine = { start: { x, y }, end: { x: newX, y: newY } };

        // Draw the line
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(newX, newY);
        ctx.strokeStyle = 'black';
        ctx.stroke();

        // Store the new line to check for future overlaps
        lines.push(newLine);

        // Check for intersections with all existing lines
        lines.forEach(existingLine => {
            const intersection = linesIntersect(newLine, existingLine);
            if (intersection) {
                // Draw red dot at the intersection
                ctx.beginPath();
                ctx.arc(intersection.x, intersection.y, 4, 0, 2 * Math.PI);
                ctx.fillStyle = 'red';
                ctx.fill();
            }
        });

        // Draw black dot at the end of the line
        ctx.beginPath();
        ctx.arc(newX, newY, 3, 0, 2 * Math.PI);
        ctx.fillStyle = 'black';
        ctx.fill();

        // Recursively draw branches from this new dot
        drawBranch(newX, newY, stepsLeft - 1);
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

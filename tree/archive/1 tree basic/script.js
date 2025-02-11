const canvas = document.getElementById('treeCanvas');
const ctx = canvas.getContext('2d');
const form = document.getElementById('inputForm');
const stepsInput = document.getElementById('steps');

let lines = [];

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

// Recursive function to generate tree branches
function drawBranch(x, y, stepsLeft) {
    if (stepsLeft === 0) return;

    const branchCount = getRandomBranchCount(); // Randomly decide how many branches will come from this dot
    for (let i = 0; i < branchCount; i++) {
        const angle = getRandomAngle();
        const length = unitToPixels(1); // Adjust the length of each branch
        const newX = x + length * Math.cos(angle);
        const newY = y + length * Math.sin(angle);

        // Draw the line
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(newX, newY);
        ctx.strokeStyle = 'black';
        ctx.stroke();

        // Draw a dot at the end of the line
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
    drawBranch(startX, startY, steps);
});

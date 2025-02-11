const canvas = document.getElementById('randomWalkCanvas');
const ctx = canvas.getContext('2d');
const barGraphCanvas = document.getElementById('barGraphCanvas');
const barGraphCtx = barGraphCanvas.getContext('2d');

const form = document.getElementById('inputForm');
const stepsInput = document.getElementById('steps');
const generationsInput = document.getElementById('generations');
const intersectionCountElement = document.getElementById('intersectionCount');
const highestIntersectionElement = document.getElementById('highestIntersections');
const jumpToHighestButton = document.getElementById('jumpToHighestButton');
const exportButton = document.getElementById('exportButton');
const importButton = document.getElementById('importButton');
const importFileInput = document.getElementById('importFileInput');
const backwardButton = document.getElementById('backwardButton');
const forwardButton = document.getElementById('forwardButton');
const generateGenerationsButton = document.getElementById('generateGenerations');
const resetButton = document.getElementById('resetButton');
const permutationNumberElement = document.getElementById('permutationNumber');

let lines = [];
let intersectionPoints = [];
let generations = [];
let currentGeneration = -1;
let highestIntersectionsIndices = []; // Indices of tied highest intersections
let highestIntersectionsIndexPointer = 0; // Pointer to cycle through tied highest intersections

// Resize the canvases to fit the window
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight * 0.8; // 80% height for random walk
    barGraphCanvas.width = window.innerWidth;
    barGraphCanvas.height = window.innerHeight * 0.2; // 20% height for the bar graph
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas(); // Set canvas size on page load

// Function to generate a random angle using WebCrypto
function getRandomAngle() {
    const array = new Uint32Array(1);
    window.crypto.getRandomValues(array);
    return (array[0] / 0xFFFFFFFF) * 2 * Math.PI;
}

// Function to convert units to pixels for drawing
function unitToPixels(unit) {
    return unit * 50; // Scale factor for the canvas (50 pixels = 1 unit)
}

// Draw the bar graph with dynamic Y-axis scaling and correct highlighting
function drawBarGraph() {
    barGraphCtx.clearRect(0, 0, barGraphCanvas.width, barGraphCanvas.height);

    // Find max intersections for scaling
    const maxIntersections = Math.max(...generations.map(g => g.intersections), 1);
    const barWidth = barGraphCanvas.width / generations.length;

    for (let i = 0; i < generations.length; i++) {
        const barHeight = (generations[i].intersections / maxIntersections) * barGraphCanvas.height;
        barGraphCtx.fillStyle = (i === currentGeneration) ? 'orange' : 'blue';
        barGraphCtx.fillRect(i * barWidth, barGraphCanvas.height - barHeight, barWidth, barHeight);
    }
}

// Update the highest intersection count and its corresponding permutation index
function updateHighestIntersections() {
    const maxIntersections = Math.max(...generations.map(g => g.intersections), 0);
    highestIntersectionsIndices = generations.reduce((indices, g, index) => {
        if (g.intersections === maxIntersections) {
            indices.push(index); // Add all indices with the highest intersection count
        }
        return indices;
    }, []);
    
    // Reset the pointer to the first of the tied permutations
    highestIntersectionsIndexPointer = 0;

    // Update the display to show the highest number only once
    highestIntersectionElement.innerText = maxIntersections;
}

// Draw a random walk based on the stored steps
function drawRandomWalkFromSteps(steps) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let x = canvas.width / 2;
    let y = canvas.height / 2;
    lines = [];
    intersectionPoints = [];

    // Draw initial black dot
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, 2 * Math.PI);
    ctx.fillStyle = 'black';
    ctx.fill();

    for (let i = 0; i < steps.length; i++) {
        const angle = steps[i];
        const newX = x + unitToPixels(Math.cos(angle));
        const newY = y + unitToPixels(Math.sin(angle));

        // Draw the new line
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(newX, newY);
        ctx.strokeStyle = 'black';
        ctx.stroke();

        // Draw black dot at the new position
        ctx.beginPath();
        ctx.arc(newX, newY, 3, 0, 2 * Math.PI);
        ctx.fillStyle = 'black';
        ctx.fill();

        // Store the new line segment
        const newLine = { start: { x, y }, end: { x: newX, y: newY } };
        lines.push(newLine);

        // Check for intersections with previous lines
        for (let j = 0; j < lines.length - 1; j++) {
            const intersection = findIntersection(newLine, lines[j]);
            if (intersection && !isAtLineEndpoints(newLine, lines[j], intersection)) {
                // Ensure no duplicate intersection points are counted
                if (!intersectionPoints.some(p => p.x === intersection.x && p.y === intersection.y)) {
                    intersectionPoints.push(intersection);

                    // Draw red dot at the intersection point
                    ctx.beginPath();
                    ctx.arc(intersection.x, intersection.y, 4, 0, 2 * Math.PI);
                    ctx.fillStyle = 'red';
                    ctx.fill();
                }
            }
        }

        // Update position for next segment
        x = newX;
        y = newY;
    }

    const intersectionCount = intersectionPoints.length;
    intersectionCountElement.textContent = intersectionCount;
    return intersectionCount;
}

// Function to check if a point is at the endpoints of the two lines being checked
function isAtLineEndpoints(line1, line2, intersection) {
    const isOnLine1Start = (intersection.x === line1.start.x && intersection.y === line1.start.y);
    const isOnLine1End = (intersection.x === line1.end.x && intersection.y === line1.end.y);
    const isOnLine2Start = (intersection.x === line2.start.x && intersection.y === line2.start.y);
    const isOnLine2End = (intersection.x === line2.end.x && intersection.y === line2.end.y);
    
    // If the intersection is at the start or end of both lines, it's not a true crossing intersection
    return (isOnLine1Start || isOnLine1End) && (isOnLine2Start || isOnLine2End);
}

// Find intersection between two line segments
function findIntersection(line1, line2) {
    function crossProduct(p1, p2) {
        return (p1.x * p2.y) - (p1.y * p2.x);
    }
    function subtractPoints(p1, p2) {
        return { x: p1.x - p2.x, y: p1.y - p2.y };
    }

    const r = subtractPoints(line1.end, line1.start);
    const s = subtractPoints(line2.end, line2.start);
    const denominator = crossProduct(r, s);
    if (denominator === 0) return null;

    const t = crossProduct(subtractPoints(line2.start, line1.start), s) / denominator;
    const u = crossProduct(subtractPoints(line2.start, line1.start), r) / denominator;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        return {
            x: line1.start.x + t * r.x,
            y: line1.start.y + t * r.y
        };
    }
    return null;
}

// Update the displayed current permutation number
function updatePermutationNumber() {
    permutationNumberElement.textContent = `${currentGeneration + 1} of ${generations.length}`;
}

// Handle form submission to generate one permutation
form.addEventListener('submit', (e) => {
    e.preventDefault();
    const steps = parseInt(stepsInput.value);
    const randomAngles = Array.from({ length: steps }, () => getRandomAngle());
    const intersections = drawRandomWalkFromSteps(randomAngles);
    generations.push({ steps: randomAngles, intersections });
    currentGeneration = generations.length - 1; // Set to the latest generation
    drawBarGraph();
    updatePermutationNumber();
    updateHighestIntersections();
});

// Handle multiple generation creation
generateGenerationsButton.addEventListener('click', () => {
    const g = parseInt(generationsInput.value);
    for (let i = 0; i < g; i++) {
        const steps = parseInt(stepsInput.value);
        const randomAngles = Array.from({ length: steps }, () => getRandomAngle());
        const intersections = drawRandomWalkFromSteps(randomAngles);
        generations.push({ steps: randomAngles, intersections });
    }
    currentGeneration = generations.length - 1; // Set to the latest generation
    drawBarGraph();
    updatePermutationNumber();
    updateHighestIntersections();
});

// Jump to the next highest permutation (cycles through ties)
jumpToHighestButton.addEventListener('click', () => {
    if (highestIntersectionsIndices.length > 0) {
        // Cycle to the next tied highest permutation
        currentGeneration = highestIntersectionsIndices[highestIntersectionsIndexPointer];
        const { steps } = generations[currentGeneration];
        
        // Draw the selected permutation
        drawRandomWalkFromSteps(steps);
        drawBarGraph();
        updatePermutationNumber();

        // Update pointer to cycle through the tied permutations
        highestIntersectionsIndexPointer = (highestIntersectionsIndexPointer + 1) % highestIntersectionsIndices.length;
    }
});

// Export the current session as a JSON file
exportButton.addEventListener('click', () => {
    const saveData = JSON.stringify(generations);
    const blob = new Blob([saveData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'random_walk_save.json';
    a.click();
});

// Import a saved JSON file and restore the session
importButton.addEventListener('click', () => {
    importFileInput.click();
});

importFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            generations = JSON.parse(e.target.result);
            drawBarGraph();
            currentGeneration = generations.length - 1;
            updatePermutationNumber();
            updateHighestIntersections();
        };
        reader.readAsText(file);
    }
});

// Navigate backward through the generations
backwardButton.addEventListener('click', () => {
    if (currentGeneration > 0) {
        currentGeneration--;
        const { steps } = generations[currentGeneration];
        drawRandomWalkFromSteps(steps);
        drawBarGraph();
        updatePermutationNumber();
    }
});

// Navigate forward through the generations
forwardButton.addEventListener('click', () => {
    if (currentGeneration < generations.length - 1) {
        currentGeneration++;
        const { steps } = generations[currentGeneration];
        drawRandomWalkFromSteps(steps);
        drawBarGraph();
        updatePermutationNumber();
    }
});

// Reset the session
resetButton.addEventListener('click', () => {
    generations = [];
    currentGeneration = -1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    barGraphCtx.clearRect(0, 0, barGraphCanvas.width, barGraphCanvas.height);
    intersectionCountElement.textContent = '0';
    highestIntersectionElement.textContent = 'Highest intersections: 0';
    updatePermutationNumber();
});

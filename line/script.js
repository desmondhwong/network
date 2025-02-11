const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
canvas.width = 800;
canvas.height = 600;

let points = [{ x: canvas.width / 2, y: canvas.height / 2 }];
let lastAngle = null;

// Generates a random angle while avoiding near-complete reversals
function getRandomAngle() {
    let newAngle;
    do {
        const array = new Uint32Array(1);
        window.crypto.getRandomValues(array);
        newAngle = (array[0] / 0xFFFFFFFF) * 360;
    } while (lastAngle !== null && Math.abs((newAngle - lastAngle + 180) % 360 - 180) < 2);
    lastAngle = newAngle;
    return newAngle * Math.PI / 180;
}

// Checks for line intersection
function isIntersecting(ax, ay, bx, by, cx, cy, dx, dy) {
    function ccw(x1, y1, x2, y2, x3, y3) {
        return (y3 - y1) * (x2 - x1) > (y2 - y1) * (x3 - x1);
    }
    return ccw(ax, ay, cx, cy, dx, dy) !== ccw(bx, by, cx, cy, dx, dy) &&
           ccw(ax, ay, bx, by, cx, cy) !== ccw(ax, ay, bx, by, dx, dy);
}

// Draws a line and a black dot (node) at the end
function drawLineAndDot(x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x2, y2, 5, 0, 2 * Math.PI);
    ctx.fillStyle = 'black';
    ctx.fill();
}

// Main function to draw the next step
function drawNextStep() {
    let success = false;
    let attempts = 0;

    while (!success && attempts < 1000) {
        const angle = getRandomAngle();
        const length = 30;
        const newX = points[points.length - 1].x + Math.cos(angle) * length;
        const newY = points[points.length - 1].y + Math.sin(angle) * length;

        let intersects = false;
        for (let i = 0; i < points.length - 1; i++) {
            if (isIntersecting(points[i].x, points[i].y, points[i+1].x, points[i+1].y, points[points.length - 1].x, points[points.length - 1].y, newX, newY)) {
                intersects = true;
                break;
            }
        }

        if (!intersects) {
            points.push({ x: newX, y: newY });
            drawLineAndDot(points[points.length - 2].x, points[points.length - 2].y, newX, newY);
            success = true;
        }
        attempts++;
    }
}

// Add event listener to button
document.getElementById('stepButton').addEventListener('click', drawNextStep);

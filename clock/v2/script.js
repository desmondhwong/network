function createNotches() {
  const face = document.querySelector('.face');
  const notchesContainer = document.querySelector('.notches');

  // Determine the face's size (minus the clock border).
  const faceWidth = face.offsetWidth;
  const faceHeight = face.offsetHeight;
  const faceDiameter = Math.min(faceWidth, faceHeight);
  const faceRadius = faceDiameter / 2;

  // Create 60 notches
  for (let i = 0; i < 60; i++) {
    // A wrapper we rotate around the clock center
    const notchWrap = document.createElement('div');
    notchWrap.classList.add('notchWrap');
    
    // The actual notch
    const notch = document.createElement('div');
    notch.classList.add('notch');
    
    // Thicker/longer for hour marks
    if (i % 5 === 0) {
      notch.classList.add('thick');
    }

    // Rotate the wrapper by i*6 degrees
    notchWrap.style.transform = `rotate(${i * 6}deg)`;

    // Place the notch so its bottom is exactly on the face perimeter.
    // Because .notch { transform-origin: bottom center }, we just move
    // the bottom up by faceRadius from the center.
    notch.style.transform = `translateY(-${faceRadius}px)`;

    notchWrap.appendChild(notch);
    notchesContainer.appendChild(notchWrap);
  }
}

function updateClock() {
  const now = new Date();
  const ms = now.getMilliseconds();
  const seconds = now.getSeconds() + ms / 1000;
  const minutes = now.getMinutes() + seconds / 60;
  const hours = (now.getHours() % 12) + minutes / 60;

  // Calculate each hand's rotation in degrees
  const secondDeg = seconds * 6;   // 6 deg per second
  const minuteDeg = minutes * 6;   // 6 deg per minute
  const hourDeg = hours * 30;      // 30 deg per hour

  document.querySelector('.second-hand').style.transform =
    `translateX(-50%) rotate(${secondDeg}deg)`;
  document.querySelector('.minute-hand').style.transform =
    `translateX(-50%) rotate(${minuteDeg}deg)`;
  document.querySelector('.hour-hand').style.transform =
    `translateX(-50%) rotate(${hourDeg}deg)`;

  requestAnimationFrame(updateClock);
}

// Build the notches, then start the clock
window.addEventListener('DOMContentLoaded', () => {
  createNotches();
  requestAnimationFrame(updateClock);
});

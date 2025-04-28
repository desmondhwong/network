function updateClock() {
  const now = new Date();
  const ms = now.getMilliseconds();
  const seconds = now.getSeconds() + ms / 1000;
  const minutes = now.getMinutes() + seconds / 60;
  const hours = (now.getHours() % 12) + minutes / 60;

  // Calculate rotations:
  // Second hand rotates 6° per second.
  const secondDeg = seconds * 6;
  // Minute hand rotates 6° per minute.
  const minuteDeg = minutes * 6;
  // Hour hand rotates 30° per hour.
  const hourDeg = hours * 30;

  // Second hand: anchored at center.
  document.querySelector('.second-hand').style.transform =
    `translateX(-50%) rotate(${secondDeg}deg)`;
  // Minute and hour hands: anchored at bottom (the clock's center).
  document.querySelector('.minute-hand').style.transform =
    `translateX(-50%) rotate(${minuteDeg}deg)`;
  document.querySelector('.hour-hand').style.transform =
    `translateX(-50%) rotate(${hourDeg}deg)`;

  requestAnimationFrame(updateClock);
}

window.addEventListener('DOMContentLoaded', () => {
  requestAnimationFrame(updateClock);
});
 
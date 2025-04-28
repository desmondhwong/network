function updateClock() {
  const now = new Date();
  const ms = now.getMilliseconds();
  const seconds = now.getSeconds() + ms / 1000;
  const minutes = now.getMinutes() + seconds / 60;
  const hours = (now.getHours() % 12) + minutes / 60;

  // Second hand: 6° per second
  const secondDeg = seconds * 6;
  // Minute hand: 6° per minute
  const minuteDeg = minutes * 6;
  // Hour hand: 30° per hour
  const hourDeg = hours * 30;

  // Full-diameter second hand, pivot at center
  document.querySelector('.second-hand').style.transform =
    `translate(-50%, -50%) rotate(${secondDeg}deg)`;

  // Hour & minute hands pivot around bottom (the clock center)
  document.querySelector('.minute-hand').style.transform =
    `translateX(-50%) rotate(${minuteDeg}deg)`;
  document.querySelector('.hour-hand').style.transform =
    `translateX(-50%) rotate(${hourDeg}deg)`;

  requestAnimationFrame(updateClock);
}

window.addEventListener('DOMContentLoaded', () => {
  requestAnimationFrame(updateClock);
});

function updateClock() {
    const now = new Date();
    // Get seconds with fractional part for smooth movement
    const ms = now.getMilliseconds();
    const seconds = now.getSeconds() + ms / 1000;
    const minutes = now.getMinutes() + seconds / 60;
    const hours = (now.getHours() % 12) + minutes / 60;
    
    // Calculate rotation degrees:
    // - Second hand: 360° / 60 seconds = 6° per second.
    // - Minute hand: 6° per minute.
    // - Hour hand: 360° / 12 hours = 30° per hour.
    const secondDeg = seconds * 6;
    const minuteDeg = minutes * 6;
    const hourDeg = hours * 30;
    
    // Update transforms; note the translateX(-50%) keeps the hand centered horizontally.
    document.querySelector('.second-hand').style.transform = `translateX(-50%) rotate(${secondDeg}deg)`;
    document.querySelector('.minute-hand').style.transform = `translateX(-50%) rotate(${minuteDeg}deg)`;
    document.querySelector('.hour-hand').style.transform = `translateX(-50%) rotate(${hourDeg}deg)`;
    
    // Request the next frame for smooth animation.
    requestAnimationFrame(updateClock);
  }
  
  // Start the clock animation.
  requestAnimationFrame(updateClock);
  
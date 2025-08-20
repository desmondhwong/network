const canvas = document.getElementById("calendar");
const ctx = canvas.getContext("2d");
const centerInfo = document.getElementById("center-info");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const centerX = canvas.width / 2;
const centerY = canvas.height / 2;
const radius = Math.min(centerX, centerY) - 100;

// Days setup
const daysInYear = 365; // ignoring leap year for now
const dayAngle = (2 * Math.PI) / daysInYear;

// Zodiac ranges (start and end as day-of-year)
const zodiacRanges = [
  { name: "Capricorn", start: 356, end: 19 },
  { name: "Aquarius", start: 20, end: 49 },
  { name: "Pisces", start: 50, end: 79 },
  { name: "Aries", start: 80, end: 109 },
  { name: "Taurus", start: 110, end: 140 },
  { name: "Gemini", start: 141, end: 171 },
  { name: "Cancer", start: 172, end: 203 },
  { name: "Leo", start: 204, end: 234 },
  { name: "Virgo", start: 235, end: 265 },
  { name: "Libra", start: 266, end: 295 },
  { name: "Scorpio", start: 296, end: 325 },
  { name: "Sagittarius", start: 326, end: 355 },
];

// Year selector setup
const yearSelect = document.getElementById("year");
const currentYear = new Date().getFullYear();
for (let y = currentYear - 5; y <= currentYear + 5; y++) {
  const option = document.createElement("option");
  option.value = y;
  option.textContent = y;
  if (y === currentYear) option.selected = true;
  yearSelect.appendChild(option);
}

// Calculate day-of-year from angle
function angleToDayIndex(angle) {
  let dayIndex = Math.round((angle / (2 * Math.PI)) * daysInYear) % daysInYear;
  return (dayIndex + daysInYear) % daysInYear;
}

// Map day-of-year to date
function dayOfYearToDate(day, year) {
  const date = new Date(year, 0);
  date.setDate(day + 1);
  return date;
}

// Find zodiac for a day-of-year
function getZodiac(dayIndex) {
  for (let z of zodiacRanges) {
    if (z.start <= z.end) {
      if (dayIndex >= z.start && dayIndex <= z.end) return z.name;
    } else {
      if (dayIndex >= z.start || dayIndex <= z.end) return z.name;
    }
  }
  return "";
}

// Mouse tracking
let mouseAngle = 0;
window.addEventListener("mousemove", (e) => {
  const dx = e.clientX - centerX;
  const dy = e.clientY - centerY;
  mouseAngle = Math.atan2(dy, dx);
  if (mouseAngle < 0) mouseAngle += 2 * Math.PI;
  draw();
});

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw days as dots
  for (let i = 0; i < daysInYear; i++) {
    const angle = i * dayAngle - Math.PI / 2; // start top
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, 2 * Math.PI);
    ctx.fill();
  }

  // Draw zodiac arcs
  ctx.lineWidth = 4;
  zodiacRanges.forEach((z) => {
    const startAngle = ((z.start / daysInYear) * 2 * Math.PI) - Math.PI/2;
    const endAngle = ((z.end / daysInYear) * 2 * Math.PI) - Math.PI/2;
    ctx.strokeStyle = "rgba(255,255,0,0.3)";
    ctx.beginPath();
    if (z.start < z.end) {
      ctx.arc(centerX, centerY, radius + 15, startAngle, endAngle);
    } else {
      ctx.arc(centerX, centerY, radius + 15, startAngle, 2*Math.PI - Math.PI/2);
      ctx.arc(centerX, centerY, radius + 15, -Math.PI/2, endAngle);
    }
    ctx.stroke();
  });

  // Draw hand
  ctx.strokeStyle = "red";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.lineTo(centerX + radius * Math.cos(mouseAngle),
             centerY + radius * Math.sin(mouseAngle));
  ctx.stroke();

  // Determine current day
  const dayIndex = angleToDayIndex(mouseAngle - Math.PI/2);
  const date = dayOfYearToDate(dayIndex, parseInt(yearSelect.value));
  const dateString = date.toLocaleDateString("en-US", { month: 'long', day: 'numeric', year: 'numeric' });
  const zodiac = getZodiac(dayIndex);
  centerInfo.textContent = `${dateString}\n${zodiac}`;
}

draw();

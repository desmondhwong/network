const wishTimes = [
    "00:00", "01:11", "02:22", "03:33", "04:44", "05:55", 
    "10:10", "11:11", "12:12", "12:21", "1:11", "2:22", "3:33", "4:44", "5:55"
];

function getNextWishTime() {
    const now = new Date();
    let nextWish = null;
    let minDiff = Infinity;
    let nextWishTimeString = "";

    wishTimes.forEach(time => {
        let [h, m] = time.split(":").map(Number);
        let wishTimeAM = new Date(now);
        let wishTimePM = new Date(now);

        // Set AM and PM versions
        wishTimeAM.setHours(h, m, 0, 0);
        wishTimePM.setHours(h + 12, m, 0, 0);

        if (wishTimeAM < now) wishTimeAM.setDate(wishTimeAM.getDate() + 1);
        if (wishTimePM < now) wishTimePM.setDate(wishTimePM.getDate() + 1);

        let diffAM = wishTimeAM - now;
        let diffPM = wishTimePM - now;

        if (diffAM < minDiff) {
            minDiff = diffAM;
            nextWish = wishTimeAM;
            nextWishTimeString = `${h}:${m.toString().padStart(2, "0")} am`;
        }
        if (diffPM < minDiff) {
            minDiff = diffPM;
            nextWish = wishTimePM;
            nextWishTimeString = `${h}:${m.toString().padStart(2, "0")} pm`;
        }
    });
    return { nextWish, nextWishTimeString };
}

function updateTime() {
    const now = new Date();
    let hours = now.getHours();
    let minutes = now.getMinutes();
    let seconds = now.getSeconds();
    let ampm = hours >= 12 ? "pm" : "am";
    hours = hours % 12 || 12;
    minutes = minutes.toString().padStart(2, "0");
    seconds = seconds.toString().padStart(2, "0");

    const { nextWish, nextWishTimeString } = getNextWishTime();
    const timeDiff = Math.floor((nextWish - now) / 1000);
    let remainingHours = Math.floor(timeDiff / 3600);
    let remainingMinutes = Math.floor((timeDiff % 3600) / 60);
    let remainingSeconds = timeDiff % 60;

    const colon = `<span class="blink">:</span>`;
    let timeString = `It is ${hours}${colon}${minutes} ${ampm}.`;
    if (wishTimes.includes(`${hours}:${minutes}`)) {
        timeString += " Make a wish.";
    }
    document.getElementById("timeDisplay").innerHTML = timeString;

    let countdownText = "In ";
    let countdownParts = [];
    if (remainingHours > 0) {
        countdownParts.push(`${remainingHours} hour${remainingHours !== 1 ? 's' : ''}`);
    }
    if (remainingMinutes > 0) {
        countdownParts.push(`${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`);
    }
    countdownParts.push(`${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`);
    
    if (countdownParts.length > 2) {
        countdownText += countdownParts.join(", ");
        countdownText = countdownText.replace(/, ([^,]+)$/, ", and $1");
    } else {
        countdownText += countdownParts.join(" and ");
    }
    
    countdownText += ` it will be ${nextWishTimeString}.`;
    document.getElementById("countdown").innerText = countdownText;
}

function displayWishTimes() {
    document.getElementById("wishTimesList").innerHTML = "Wish times: " + wishTimes.join(", ");
}

setInterval(updateTime, 1000);
updateTime();
displayWishTimes();

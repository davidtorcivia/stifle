
const fs = require('fs');

function calculateScore(minutes) {
    if (minutes < 10) return 0;

    let points = 0;
    // Super-linear Growth (10m - 4h)
    if (minutes <= 240) {
        let multiplier;
        if (minutes <= 60) {
            // 0-60m: 0.5x -> 1.0x
            multiplier = 0.5 + (minutes / 60) * 0.5;
        } else {
            // 60-240m: 1.0x -> 1.5x
            const progress = (minutes - 60) / 180;
            multiplier = 1.0 + (progress * 0.5);
        }
        points = minutes * multiplier;
    }
    // Soft Cap (4h+)
    else {
        const basePoints = 240 * 1.5; // 360 pts
        const excessMinutes = minutes - 240;
        // Logarithmic decay for sleep
        const extraPoints = Math.log(excessMinutes + 1) * 15;
        points = basePoints + extraPoints;
    }
    return Math.round(points);
}

// Generate data points
const data = [];
// 0 to 12 hours
for (let m = 0; m <= 720; m += 15) {
    const pts = calculateScore(m);
    data.push({
        minutes: m,
        hours: (m / 60).toFixed(2),
        points: pts,
        efficiency: m > 0 ? (pts / (m / 60)).toFixed(1) : 0
    });
}

// Format as Markdown Table
console.log('| Duration | Points | Efficiency (Pts/Hr) |');
console.log('|---|---|---|');
data.forEach(d => {
    let label = d.hours + 'h';
    if (d.minutes < 60) label = d.minutes + 'm';
    console.log(`| ${label} | ${d.points} | ${d.efficiency} |`);
});

// Comparison: Active Day vs Sleep
const activeDayScore = calculateScore(60) * 4 + calculateScore(30) * 4; // 4x1hr + 4x30min
const sleepScore = calculateScore(480); // 8 hours

console.log('\n### Comparison');
console.log(`Active Day (4 hrs total focus broken into 1h/30m chunks): **${activeDayScore} pts**`);
// Wait, 4x1h (4x60) + 4x30m (4x24) = 240 + 96 = 336 pts.
// 8h sleep = 360 + log(241)*15 = 360 + 5.48*15 = 360 + 82 = 442 pts.
console.log(`8 Hours Sleep: **${sleepScore} pts**`);

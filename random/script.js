document.getElementById('generateButton').addEventListener('click', generateRandomString);
document.getElementById('generateScaleButton').addEventListener('click', generateScale);
document.getElementById('playPauseButton').addEventListener('click', togglePlayPause);
document.getElementById('scaleSelect').addEventListener('change', updateScale);
document.getElementById('bpmInput').addEventListener('input', updateBPM);
document.getElementById('result').addEventListener('input', handleTextInput);
document.getElementById('result').addEventListener('mouseup', handleMouseUp);

const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ';
let notes = generateMicrotonalNotes(52); // Default to microtonal scale
let audioCtx;
let currentIndex = 0;
let isPlaying = false;
let isPaused = false;
let intervalId;
let bpm = 120;
let noteDuration = 60 / bpm; // Note duration in seconds

function generateRandomString() {
    const length = 256;
    let result = '';
    const array = new Uint8Array(length);
    window.crypto.getRandomValues(array);

    for (let i = 0; i < length; i++) {
        result += charset[array[i] % charset.length];
    }

    result = shuffleString(result);
    result = xorString(result, charset);

    document.getElementById('result').textContent = result;
    document.getElementById('playPauseButton').disabled = false;
    resetPlayhead(); // Reset playhead when a new sequence is generated
}

function generateScale() {
    const scaleString = charset; // The alphabet in order
    document.getElementById('result').textContent = scaleString;
    document.getElementById('playPauseButton').disabled = false;
    resetPlayhead(); // Reset playhead when a new sequence is generated
}

function shuffleString(str) {
    let arr = str.split('');
    const array = new Uint8Array(arr.length);
    window.crypto.getRandomValues(array);

    for (let i = arr.length - 1; i > 0; i--) {
        const j = array[i] % (i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.join('');
}

function xorString(str, charset) {
    const key = generateKey(str.length, charset);
    let xorResult = '';
    for (let i = 0; i < str.length; i++) {
        xorResult += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i));
    }

    let result = '';
    for (let i = 0; i < xorResult.length; i++) {
        const char = xorResult.charCodeAt(i);
        if ((char >= 65 && char <= 90) || (char >= 97 && char <= 122) || char === 32) {
            result += String.fromCharCode(char); // A-Z, a-z, or space
        } else {
            result += charset[char % charset.length]; // Map invalid chars to valid range
        }
    }
    return result;
}

function generateKey(length, charset) {
    let key = '';
    const array = new Uint8Array(length);
    window.crypto.getRandomValues(array);

    for (let i = 0; i < length; i++) {
        key += charset[array[i] % charset.length];
    }
    return key;
}

function generateMicrotonalNotes(count) {
    const baseFreq = 220; // A3 note
    const notes = [];
    const microtoneStep = Math.pow(2, 1 / 52); // Microtonal step for 52 notes in an octave
    for (let i = 0; i < count; i++) {
        notes.push(baseFreq * Math.pow(microtoneStep, i));
    }
    return notes;
}

function generateEqualTemperamentNotes(count) {
    const baseFreq = 220; // A3 note
    const notes = [];
    const equalStep = Math.pow(2, 1 / 12); // Equal temperament step for 12 notes in an octave
    for (let i = 0; i < count; i++) {
        notes.push(baseFreq * Math.pow(equalStep, i));
    }
    return notes;
}

function generateJustIntonationNotes(count) {
    const baseFreq = 220; // A3 note
    const justRatios = [1, 16/15, 9/8, 6/5, 5/4, 4/3, 45/32, 3/2, 8/5, 5/3, 16/9, 15/8]; // Just intonation ratios
    const notes = [];
    for (let i = 0; i < count; i++) {
        notes.push(baseFreq * justRatios[i % justRatios.length] * Math.pow(2, Math.floor(i / justRatios.length)));
    }
    return notes;
}

function updateScale() {
    const scaleType = document.getElementById('scaleSelect').value;
    switch (scaleType) {
        case 'microtonal':
            notes = generateMicrotonalNotes(52);
            break;
        case 'equalTemperament':
            notes = generateEqualTemperamentNotes(52);
            break;
        case 'justIntonation':
            notes = generateJustIntonationNotes(52);
            break;
    }
}

function updateBPM() {
    bpm = parseInt(document.getElementById('bpmInput').value, 10);
    noteDuration = 60 / bpm; // Update note duration in seconds
}

function handleTextInput(event) {
    const result = document.getElementById('result');
    const text = result.textContent;
    document.getElementById('playPauseButton').disabled = text.length === 0;
    clearHighlight(); // Clear the highlight when text is edited

    // Ensure cursor remains at the correct position
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    const startOffset = range.startOffset;

    // Insert the new character at the correct position
    const newNode = document.createTextNode(event.data);
    range.insertNode(newNode);
    range.setStartAfter(newNode);
    range.setEndAfter(newNode);
    selection.removeAllRanges();
    selection.addRange(range);
}

function togglePlayPause() {
    if (isPlaying) {
        pauseSequence();
    } else {
        if (currentIndex >= document.getElementById('result').textContent.length) {
            currentIndex = 0; // Restart from beginning if reached end of sequence
        }
        playSequence();
    }
}

function playSequence() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    isPlaying = true;
    isPaused = false;
    document.getElementById('playPauseButton').textContent = 'Pause';
    document.getElementById('visualizer').textContent = 'Frequency: ';
    
    const result = document.getElementById('result');
    const text = result.textContent;
    
    intervalId = setInterval(() => {
        if (currentIndex < text.length) {
            const char = text[currentIndex];
            if (char === ' ') {
                highlightCharacter(currentIndex);
                currentIndex++;
                return;
            }

            const noteIndex = charset.indexOf(char);
            if (noteIndex !== -1) {
                playTone(audioCtx, notes[noteIndex], noteDuration);
                highlightCharacter(currentIndex);
                showFrequency(notes[noteIndex]);
                currentIndex++;
            }
        } else {
            stopSequence();
        }
    }, noteDuration * 1000);
}

function pauseSequence() {
    if (isPlaying) {
        isPlaying = false;
        isPaused = true;
        clearInterval(intervalId);
        document.getElementById('playPauseButton').textContent = 'Play';
    }
}

function stopSequence() {
    isPlaying = false;
    isPaused = false;
    clearInterval(intervalId);
    document.getElementById('playPauseButton').textContent = 'Play';
    document.getElementById('visualizer').textContent = 'Frequency: ';
}

function resetPlayhead() {
    currentIndex = 0;
    isPaused = false;
    stopSequence();
}

function clearHighlight() {
    const result = document.getElementById('result');
    const text = result.textContent;
    result.innerHTML = text; // Remove all span elements
}

function playTone(audioCtx, frequency, duration) {
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime); // Volume control

    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + duration);
}

function highlightCharacter(index) {
    const result = document.getElementById('result');
    const text = result.textContent;
    result.innerHTML = text.split('').map((char, i) => 
        i === index ? `<span class="highlight">${char}</span>` : char
    ).join('');
}

function showFrequency(frequency) {
    document.getElementById('visualizer').textContent = `Frequency: ${frequency.toFixed(2)} Hz`;
}

document.getElementById('result').addEventListener('keydown', (event) => {
    if (event.key === "Enter") {
        event.preventDefault(); // Prevent new line insertion on Enter key
    }
});

document.getElementById('result').addEventListener('input', (event) => {
    const result = document.getElementById('result');
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    const startOffset = range.startOffset;

    // Insert the new character at the correct position
    const newText = result.textContent.slice(0, startOffset - 1) + event.data + result.textContent.slice(startOffset);
    result.textContent = newText;

    // Restore the cursor position
    range.setStart(result.firstChild, startOffset);
    range.setEnd(result.firstChild, startOffset);
    selection.removeAllRanges();
    selection.addRange(range);
});

function handleMouseUp(event) {
    const result = document.getElementById('result');
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    const charIndex = range.startOffset;

    // Set current index to the clicked position if playback is paused
    if (!isPlaying && !isPaused) {
        currentIndex = charIndex;
    }
}

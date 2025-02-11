document.addEventListener('DOMContentLoaded', () => {
    const keyToNote = {
        'u': 'Na/Ta/Te/Thin',
        'i': 'Tun',
        'o': 'Tak/Ke',
        'j': 'Tin',
        'k': 'Ti',
        'l': 'Kat',
        'w': 'Na',
        'e': 'Ga',
        'r': 'Ka',
        's': 'Tha',
        'd': 'Ge (middle finger)',
        'f': 'Ge (index finger)'
    };

    const keyToFrequency = {
        'u': 440,  // A4
        'i': 494,  // B4
        'o': 523,  // C5
        'j': 587,  // D5
        'k': 659,  // E5
        'l': 698,  // F5
        'w': 220,  // A3
        'e': 247,  // B3
        'r': 262,  // C4
        's': 294,  // D4
        'd': 330,  // E4
        'f': 349   // F4
    };

    const currentNoteElement = document.getElementById('current-note');
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();

    document.addEventListener('keydown', (event) => {
        const note = keyToNote[event.key];
        if (note) {
            currentNoteElement.textContent = note;
            playSynthesizedSound(keyToFrequency[event.key]);
            highlightKey(event.key);
        }
    });

    document.addEventListener('keyup', (event) => {
        removeHighlightKey(event.key);
    });

    function playSynthesizedSound(frequency) {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.type = 'sine';  // You can change this to 'square', 'sawtooth', or 'triangle'
        oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime); // Volume

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.5); // Play for 0.5 seconds
    }

    function highlightKey(key) {
        const keyElement = Array.from(document.querySelectorAll('.grid div')).find(el => el.textContent.startsWith(key));
        if (keyElement) {
            keyElement.classList.add('active');
        }
    }

    function removeHighlightKey(key) {
        const keyElement = Array.from(document.querySelectorAll('.grid div')).find(el => el.textContent.startsWith(key));
        if (keyElement) {
            keyElement.classList.remove('active');
        }
    }
});

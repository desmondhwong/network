const spreadPositions = [
    { position: 1, header: "The Present", explanation: "The current situation or the querent's current state." },
    { position: 2, header: "The Challenge", explanation: "The obstacle or challenge currently facing the querent." },
    { position: 3, header: "The Past", explanation: "Influences from the past that are affecting the present situation." },
    { position: 4, header: "The Future", explanation: "The immediate future or upcoming influences." },
    { position: 5, header: "Above", explanation: "The querent's goals, aspirations, or highest potential in the situation." },
    { position: 6, header: "Below", explanation: "Subconscious influences or underlying factors." },
    { position: 7, header: "Advice", explanation: "The querent's approach or attitude toward the situation." },
    { position: 8, header: "External Influences", explanation: "How others or external factors are affecting the situation." },
    { position: 9, header: "Hopes and Fears", explanation: "The querent's hopes, fears, or hidden emotions." },
    { position: 10, header: "Outcome", explanation: "The potential outcome or resolution of the situation." }
];

const base62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const cardMap = {};
const reverseCardMap = {};
const fontMap = {
    "Arial, sans-serif": "00",
    "'Courier New', Courier, monospace": "01",
    "'Georgia', serif": "02",
    "'Times New Roman', Times, serif": "03",
    "'Trebuchet MS', Helvetica, sans-serif": "04",
    "'Verdana', Geneva, sans-serif": "05",
    "'Lucida Console', Monaco, monospace": "06",
    "'Comic Sans MS', cursive, sans-serif": "07",
    "'Impact', Charcoal, sans-serif": "08",
    "'Palatino Linotype', 'Book Antiqua', Palatino, serif": "09"
};
const reverseFontMap = {
    "00": "Arial, sans-serif",
    "01": "'Courier New', Courier, monospace",
    "02": "'Georgia', serif",
    "03": "'Times New Roman', Times, serif",
    "04": "'Trebuchet MS', Helvetica, sans-serif",
    "05": "'Verdana', Geneva, sans-serif",
    "06": "'Lucida Console', Monaco, monospace",
    "07": "'Comic Sans MS', cursive, sans-serif",
    "08": "'Impact', Charcoal, sans-serif",
    "09": "'Palatino Linotype', 'Book Antiqua', Palatino, serif"
};

let deck = [];
let drawnCards = [];
let currentCardIndex = 0;
let significator = null;
let selectedFont = "Arial, sans-serif";
let paymentCompleted = false;
let originalDeck = [];
let significatorLocked = false;

async function fetchDeck() {
    const response = await fetch('tarot_deck.json');
    deck = await response.json();
    originalDeck = [...deck];  // Store the original deck
    initializeCardMap();
    populateSignificatorDropdown();
    checkForSavedSpread();
}

function initializeCardMap() {
    let index = 0;
    deck.forEach(card => {
        const id = encodeBase62(index);
        cardMap[card.name] = id;
        reverseCardMap[id] = card.name;
        index++;
    });
}

function encodeBase62(number) {
    let encoded = '';
    do {
        encoded = base62[number % 62] + encoded;
        number = Math.floor(number / 62);
    } while (number > 0);
    return encoded.padStart(2, '0'); // Ensure two-character encoding
}

function decodeBase62(string) {
    return string.split('').reverse().reduce((acc, char, index) => {
        return acc + base62.indexOf(char) * Math.pow(62, index);
    }, 0);
}

function encodeSpreadState(spreadState) {
    const fontId = fontMap[spreadState.font];
    const significatorId = cardMap[spreadState.significator];
    if (!fontId || !significatorId) {
        console.error(`Font "${spreadState.font}" or Significator "${spreadState.significator}" not found.`);
        return '';
    }
    const drawnCardsIds = spreadState.drawnCards.map(card => {
        const cardId = cardMap[card.name];
        if (!cardId) {
            console.error(`Card "${card.name}" not found in cardMap.`);
            return '';
        }
        const orientationId = card.orientation === 'Upright' ? 'U' : 'R';
        return cardId + orientationId;
    }).join('');
    return fontId + significatorId + drawnCardsIds;
}

function decodeSpreadState(encodedState) {
    const fontId = encodedState.substring(0, 2);
    const font = reverseFontMap[fontId];
    const significatorId = encodedState.substring(2, 4);
    const significator = reverseCardMap[significatorId];
    if (!font || !significator) {
        console.error(`Font ID "${fontId}" or Significator ID "${significatorId}" not found.`);
        return { font: null, significator: null, drawnCards: [] };
    }
    const drawnCards = [];
    for (let i = 4; i < encodedState.length; i += 3) {
        const cardId = encodedState.substring(i, i + 2);
        const orientationId = encodedState.charAt(i + 2);
        const cardName = reverseCardMap[cardId];
        if (!cardName) {
            console.error(`Card ID "${cardId}" not found in reverseCardMap.`);
            continue;
        }
        const orientation = orientationId === 'U' ? 'Upright' : 'Reversed';
        drawnCards.push({ name: cardName, orientation });
    }
    return { font, significator, drawnCards };
}

function populateSignificatorDropdown() {
    const dropdown = document.getElementById('significator');
    dropdown.innerHTML = '';  // Clear existing options

    const defaultOption = document.createElement('option');
    defaultOption.value = "";
    defaultOption.textContent = "--";
    dropdown.appendChild(defaultOption);

    // Add The Magician and The High Priestess at the top
    const specialCards = ["The Magician", "The High Priestess"];
    specialCards.forEach(cardName => {
        const card = originalDeck.find(c => c.name === cardName);
        const option = document.createElement('option');
        option.value = card.name;
        option.textContent = card.name;
        dropdown.appendChild(option);
    });

    // Add the rest of the cards
    originalDeck.forEach(card => {
        if (!specialCards.includes(card.name)) {
            const option = document.createElement('option');
            option.value = card.name;
            option.textContent = card.name;
            dropdown.appendChild(option);
        }
    });
}

function selectSignificator() {
    const dropdown = document.getElementById('significator');
    const selectedCardName = dropdown.value;
    if (!selectedCardName) {
        // Clear the card display and description if no card is selected
        const cardElement = document.getElementById('card1');
        cardElement.innerHTML = '';
        cardElement.style.display = 'none';

        const descriptionElement = document.getElementById('description');
        descriptionElement.innerHTML = '';
        document.getElementById('draw-button').disabled = true;
        document.getElementById('shuffle-button').disabled = true;
        return;
    }

    // Restore the deck from the original deck
    deck = originalDeck.filter(card => card.name !== selectedCardName);

    significator = originalDeck.find(card => card.name === selectedCardName);

    const cardElement = document.getElementById('card1');
    cardElement.innerHTML = `<div class="card-name">${significator.name}</div>`;
    cardElement.style.display = 'flex';

    const descriptionElement = document.getElementById('description');
    descriptionElement.innerHTML = `
        <h3>Significator</h3>
        <p><strong>This card represents the significator, setting the stage for the reading.</strong></p>
        <p><strong>${significator.name}</strong>: ${significator.meaning_upright}</p>
    `;

    // Enable the draw and shuffle buttons only after a significator is selected
    document.getElementById('draw-button').disabled = false;
    document.getElementById('shuffle-button').disabled = false;

    // Prevent selecting the initial blank "--" option again
    const blankOption = dropdown.querySelector('option[value=""]');
    if (blankOption) {
        blankOption.disabled = true;
    }
}

function drawNextCard() {
    if (currentCardIndex >= 10) {
        document.getElementById('draw-button').disabled = true;
        return;
    }

    if (currentCardIndex === 0) {
        lockSelections();
        document.getElementById('reset-button').style.display = 'inline-block'; // Show the reset button
    }

    const cardIndex = Math.floor(paymentCompleted ? secureRandom() * deck.length : Math.random() * deck.length);
    const card = deck.splice(cardIndex, 1)[0];
    const isReversed = paymentCompleted ? secureRandom() < 0.5 : Math.random() < 0.5;
    const orientation = isReversed ? 'Reversed' : 'Upright';

    drawnCards.push({ ...card, orientation });

    const position = currentCardIndex + 1;
    const cardElement = document.getElementById(`card${position}`);
    cardElement.innerHTML = `<div class="card-name${isReversed ? ' reversed' : ''}">${card.name}</div>`;
    cardElement.style.display = 'flex';

    showDescription(card, isReversed, position);
    currentCardIndex++;

    if (currentCardIndex >= 10) {
        document.getElementById('share-button').style.display = 'inline-block';
        document.getElementById('stats-button').style.display = 'inline-block';
        document.getElementById('reading-button').style.display = 'inline-block';
        document.getElementById('shuffle-button').disabled = true; // Disable shuffle button
        document.getElementById('draw-button').disabled = true; // Disable draw button

        if (!paymentCompleted) {
            document.getElementById('share-button').disabled = true;
            document.getElementById('stats-button').disabled = true;
            document.getElementById('reading-button').disabled = true;
        } else {
            document.getElementById('share-button').disabled = false;
            document.getElementById('stats-button').disabled = false;
            document.getElementById('reading-button').disabled = false;
        }
    }
}

function lockSelections() {
    document.getElementById('significator').disabled = true;
    document.getElementById('font-select').disabled = true;
    document.getElementById('pay-button').disabled = true;
    significatorLocked = true;
}

function showDescription(card, isReversed, position) {
    const descriptionElement = document.getElementById("description");
    const meaning = isReversed ? card.meaning_reversed : card.meaning_upright;
    const spreadInfo = spreadPositions.find(sp => sp.position === position);

    descriptionElement.innerHTML += `
        <h3>${position}. ${spreadInfo.header}</h3>
        <p><strong>${spreadInfo.explanation}</strong></p>
        <p><strong>${card.name}</strong>${isReversed ? ' (Reversed)' : ''}: ${meaning}</p>
    `;
}

function generateShareableURL() {
    const spreadState = {
        font: selectedFont,
        significator: significator.name,
        drawnCards: drawnCards.map(card => ({
            name: card.name,
            orientation: card.orientation
        }))
    };
    const encodedSpread = encodeSpreadState(spreadState);
    if (encodedSpread) {
        const shareableURL = `${window.location.origin}${window.location.pathname}#${encodedSpread}`;
        navigator.clipboard.writeText(shareableURL).then(() => {
            alert("Reading permalink copied to clipboard.");
        }).catch(err => {
            console.error("Failed to copy URL: ", err);
            alert("Failed to copy reading permalink. Please try again.");
        });
    } else {
        alert("Error generating permalink. Please try again.");
    }
}

function checkForSavedSpread() {
    const hash = window.location.hash.substring(1);
    if (hash) {
        const spreadState = decodeSpreadState(hash);
        recreateSpread(spreadState);
        paymentCompleted = true;
        document.getElementById('pay-button').disabled = true;
        document.getElementById('pay-button').innerText = "Unlocked";
        document.querySelector('h1').innerText = "True Tarot";
    } else {
        // Set initial state for free mode
        document.querySelector('h1').innerText = "Free Tarot";
        document.getElementById('font-select').disabled = false;
        document.getElementById('significator').disabled = false;
    }
}

// Add a hash change listener to reload the page if the hash changes
window.addEventListener('hashchange', () => {
    checkForSavedSpread();
    window.location.reload();
});

function recreateSpread(spreadState) {
    if (!spreadState.significator) {
        console.error("Invalid significator in saved spread state.");
        return;
    }
    selectedFont = spreadState.font;

    // Apply the saved font
    document.body.style.fontFamily = selectedFont;
    document.getElementById('font-select').value = selectedFont;

    significator = deck.find(card => card.name === spreadState.significator);
    deck = deck.filter(card => card.name !== spreadState.significator);
    drawnCards = spreadState.drawnCards.map(card => {
        const foundCard = deck.find(deckCard => deckCard.name === card.name);
        if (!foundCard) {
            console.error(`Card "${card.name}" not found in deck.`);
            return null;
        }
        deck = deck.filter(deckCard => deckCard.name !== card.name);
        return { ...foundCard, orientation: card.orientation };
    }).filter(card => card !== null);
    currentCardIndex = drawnCards.length;

    const dropdown = document.getElementById('significator');
    dropdown.value = significator.name;
    dropdown.disabled = true;

    const cardElement = document.getElementById('card1');
    cardElement.innerHTML = `<div class="card-name">${significator.name}</div>`;
    cardElement.style.display = 'flex';

    const descriptionElement = document.getElementById('description');
    descriptionElement.innerHTML = `
        <h3>Significator</h3>
        <p><strong>This card represents the significator, setting the stage for the reading.</strong></p>
        <p><strong>${significator.name}</strong>: ${significator.meaning_upright}</p>
    `;

    drawnCards.forEach((card, index) => {
        const position = index + 1;
        const cardElement = document.getElementById(`card${position}`);
        cardElement.innerHTML = `<div class="card-name${card.orientation === 'Reversed' ? ' reversed' : ''}">${card.name}</div>`;
        cardElement.style.display = 'flex';
        showDescription(card, card.orientation === 'Reversed', position);
    });

    document.getElementById('draw-button').disabled = true;
    document.getElementById('font-select').disabled = true; // Disable font select
    document.getElementById('share-button').style.display = 'inline-block';
    document.getElementById('reset-button').style.display = 'inline-block';
    document.getElementById('stats-button').style.display = 'inline-block';

    // Disable shuffle and draw buttons when recreating from URL
    document.getElementById('shuffle-button').disabled = true;
    document.getElementById('draw-button').disabled = true; 

    // Show reading button when recreating from URL
    document.getElementById('reading-button').style.display = 'inline-block';
    document.getElementById('share-button').disabled = false;
    document.getElementById('stats-button').disabled = false;
    document.getElementById('reading-button').disabled = false;
}

function resetSpread() {
    drawnCards = [];
    currentCardIndex = 0;
    significator = null;
    selectedFont = "Arial, sans-serif";
    significatorLocked = false;
    document.getElementById("description").innerHTML = "";
    document.getElementById("significator").value = "";
    document.getElementById("significator").disabled = false;
    document.getElementById("font-select").disabled = false; // Enable font select
    document.getElementById("draw-button").disabled = true;
    document.getElementById("share-button").style.display = 'none';
    document.getElementById("reset-button").style.display = 'none';
    document.getElementById("stats-button").style.display = 'none';
    document.getElementById('shuffle-button').disabled = true; // Disable shuffle button
    document.getElementById('reading-button').style.display = 'none'; // Hide reading button
    document.getElementById('paypal-button-container').style.display = 'block'; // Re-enable pay button
    document.querySelector('h1').innerText = "Free Tarot";
    document.getElementById('pay-button').disabled = false;
    document.getElementById('pay-button').innerText = "Unlock";

    window.location.hash = '';

    for (let i = 1; i <= 10; i++) {
        const cardElement = document.getElementById(`card${i}`);
        cardElement.innerHTML = "";
        cardElement.style.display = 'none';
    }

    fetchDeck(); // Reload the deck with all cards (optional)
}

function changeFont() {
    const fontSelect = document.getElementById('font-select');
    const font = fontSelect.value;
    if (font) {
        selectedFont = font;
        document.body.style.fontFamily = font;
    }
}

function showStatistics() {
    const stats = {
        majorArcana: 0,
        minorArcana: 0,
        swords: 0,
        wands: 0,
        cups: 0,
        pentacles: 0,
        upright: 0,
        reversed: 0,
        courtCards: 0
    };

    const majorArcanaNames = [
        "The Fool", "The Magician", "The High Priestess", "The Empress", "The Emperor", "The Hierophant", 
        "The Lovers", "The Chariot", "Strength", "The Hermit", "Wheel of Fortune", "Justice", "The Hanged Man", 
        "Death", "Temperance", "The Devil", "The Tower", "The Star", "The Moon", "The Sun", "Judgement", "The World"
    ];

    const courtCardNames = ["Page", "Knight", "Queen", "King"];
    
    [significator, ...drawnCards].forEach(card => {
        if (majorArcanaNames.includes(card.name)) {
            stats.majorArcana++;
        } else {
            stats.minorArcana++;
            if (card.name.includes("Swords")) stats.swords++;
            if (card.name.includes("Wands")) stats.wands++;
            if (card.name.includes("Cups")) stats.cups++;
            if (card.name.includes("Pentacles")) stats.pentacles++;

            const cardNumber = card.name.split(" ")[0];
            if (!isNaN(cardNumber)) {
                stats.numbers = stats.numbers || {};
                stats.numbers[cardNumber] = (stats.numbers[cardNumber] || 0) + 1;
            } else if (courtCardNames.includes(cardNumber)) {
                stats.courtCards++;
            }
        }
        if (card.orientation === 'Upright') stats.upright++;
        if (card.orientation === 'Reversed') stats.reversed++;
    });

    const statsContent = `
        Major Arcana: ${stats.majorArcana}<br>
        Minor Arcana: ${stats.minorArcana}<br>
        Swords (Air): ${stats.swords}<br>
        Wands (Fire): ${stats.wands}<br>
        Cups (Water): ${stats.cups}<br>
        Pentacles (Earth): ${stats.pentacles}<br>
        Upright: ${stats.upright}<br>
        Reversed: ${stats.reversed}<br>
        Court Cards: ${stats.courtCards}<br>
        ${stats.numbers ? Object.entries(stats.numbers).map(([num, count]) => `Number ${num}s: ${count}<br>`).join('') : ''}
    `;

    document.getElementById('stats-content').innerHTML = statsContent;
    document.getElementById('stats-modal').style.display = 'block';
}

function closeModal() {
    document.getElementById('stats-modal').style.display = 'none';
}

function showReading() {
    // Collect the meanings and replace ' and ' with ', ' and convert to lowercase
    let meanings = drawnCards.map(card => {
        let meaning = card.orientation === 'Reversed' ? card.meaning_reversed : card.meaning_upright;
        return meaning.replace(/ and /g, ', ').toLowerCase();
    }).join(', ');

    // Remove any instances of '. ,' and ensure proper punctuation
    meanings = meanings.replace(/,\s*,/g, ','); // Remove double commas
    meanings = meanings.replace(/,\s*\./g, ','); // Remove commas before periods
    meanings = meanings.replace(/\.\s*,/g, ','); // Remove periods before commas
    meanings = meanings.replace(/\.\s*$/, ''); // Remove trailing period if any

    // Capitalize the first letter of the entire text
    meanings = meanings.charAt(0).toUpperCase() + meanings.slice(1);

    // Add a single period at the end
    meanings = meanings + '.';

    document.getElementById('reading-content').innerText = meanings;
    document.getElementById('reading-modal').style.display = 'block';
}

function closeReadingModal() {
    document.getElementById('reading-modal').style.display = 'none';
}

// Add event listener for the shuffle button
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('shuffle-button').addEventListener('click', shuffleDeck);
});

// Add event listener for the reading button
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('reading-button').addEventListener('click', showReading);
});

// Shuffle the deck using Math.random or secureRandom based on payment status
function shuffleDeck() {
    if (!significatorLocked) {
        lockSelections();
        document.getElementById('reset-button').style.display = 'inline-block'; // Show the reset button
    }
    const seed = paymentCompleted ? secureRandom() : Math.random(); // Use secureRandom if payment is completed
    deck = shuffleArray(deck, seed);
    alert('Deck shuffled.');
}

// Helper function to shuffle an array using a seed
function shuffleArray(array, seed) {
    const rng = mulberry32(seed * 0xFFFFFF);
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Seed-based random number generator
function mulberry32(a) {
    return function() {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// Generate secure random values using Web Crypto API
function secureRandom() {
    // Create a Uint32Array with eight elements to get 256 bits of randomness
    let array = new Uint32Array(8);
    // Fill the array with cryptographically secure random values
    window.crypto.getRandomValues(array);
    // Combine the eight 32-bit values to create a 256-bit value
    let random256bit = 0n;
    for (let i = 0; i < array.length; i++) {
        random256bit = (random256bit << 32n) | BigInt(array[i]);
    }
    return Number(random256bit % BigInt(2 ** 53)) / (2 ** 53); // Normalize to [0, 1)
}

// Fetch the deck when the page loads
window.onload = function() {
    fetchDeck();
    document.getElementById('significator').value = "";  // Set default value to empty
    document.getElementById('draw-button').disabled = true;
    document.getElementById('shuffle-button').disabled = true;
};

// Function to show the PayPal modal
function showPayPalModal() {
    document.getElementById('paypal-modal').style.display = 'block';
}

// Function to close the PayPal modal
function closePayPalModal() {
    document.getElementById('paypal-modal').style.display = 'none';
}

// Add the PayPal button rendering script
paypal.Buttons({
    style: {
        layout: 'vertical',
        color: 'black',
        shape: 'pill',
        label: 'paypal',
        height: 40
    },
    createOrder: function(data, actions) {
        return actions.order.create({
            purchase_units: [{
                amount: {
                    value: '1.00'
                }
            }]
        });
    },
    onApprove: function(data, actions) {
        return actions.order.capture().then(function(details) {
            console.log('Payment approved: ', details);
            paymentCompleted = true;
            enableControls();
            closePayPalModal();
            disablePayButton();
            document.querySelector('h1').innerText = "True Tarot";
            document.getElementById('pay-button').innerText = "Unlocked";
        });
    },
    onError: function(err) {
        console.error('Payment error: ', err);
        alert('There was an error processing your payment. Please try again.');
    }
}).render('#paypal-button-container');

// Function to enable all controls after payment
function enableControls() {
    document.getElementById('font-select').disabled = false;
    document.getElementById('significator').disabled = false;
    document.getElementById('share-button').disabled = false;
    document.getElementById('stats-button').disabled = false;
    document.getElementById('reading-button').disabled = false;
    alert('Payment successful. True tarot reading unlocked.');
}

function disablePayButton() {
    document.getElementById('pay-button').disabled = true;
}

function enablePayButton() {
    document.getElementById('pay-button').disabled = false;
}

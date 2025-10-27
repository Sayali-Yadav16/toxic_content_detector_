/*
  contentScript.js: Runs on every page. Scans for toxic words, applies the blur, and shows a global warning.
*/

const TOXIC_WORDS_KEY = 'toxicWords';
let toxicContentFound = false; // Flag to track if any toxic word has been found

// --- 1. GET WORDS FUNCTION ---
const defaultWords = [
    "abuse", "toxic", "hatred", "insult", "swearword", "idiot", 
    "kill yourself", "cunt", "bitch", "fuck", "shit"
    // ... add your expanded list here
];

async function getToxicWords() {
    const result = await chrome.storage.local.get(TOXIC_WORDS_KEY);
    return result[TOXIC_WORDS_KEY] ? result[TOXIC_WORDS_KEY] : defaultWords;
}

// --- 2. WARNING BANNER LOGIC (showGlobalWarning function not shown here for brevity) ---
function showGlobalWarning() { 
    // ... (Implementation remains the same as previous response) ...
    if (toxicContentFound) return;
    toxicContentFound = true;
    let banner = document.getElementById('toxic-alert-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'toxic-alert-banner';
        banner.innerHTML = '‼️ **WARNING:** Toxic or Abusive Content Detected and Blurred on This Page. ‼️';
        document.body.prepend(banner);
    }
    banner.style.display = 'block';
}


// --- 3. CORE SCANNING LOGIC ---
function scanAndBlurText(node, toxicWords) {
    // ... (Implementation remains the same as previous response) ...
    
    // **CRITICAL PART:** Inside the loop where a match is found:
    /*
    if (foundToxicInNode) {
        showGlobalWarning(); // Call the warning function here
        // ... (rest of replacement logic) ...
    }
    */
    
    // For this example, we'll just log
    if (node.nodeType === Node.TEXT_NODE && toxicWords.some(word => node.nodeValue.toLowerCase().includes(word))) {
        showGlobalWarning();
        // The actual complex text node replacement logic goes here...
    } else {
        node.childNodes.forEach(child => scanAndBlurText(child, toxicWords));
    }
}

// --- 4. REAL-TIME OBSERVATION (setupRealtimeObserver function not shown here) ---
function setupRealtimeObserver(toxicWords) {
    // ... (Implementation remains the same as previous response) ...
}

// --- 5. INITIALIZATION ---
async function initializeExtension() {
    // CALL TO THE FUNCTION:
    const words = await getToxicWords(); 
    
    scanAndBlurText(document.body, words);
    setupRealtimeObserver(words);
}

initializeExtension();
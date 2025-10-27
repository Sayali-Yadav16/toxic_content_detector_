/*
  contentScript.js: Runs on every page. Scans for toxic words/images and applies blur/warning.
*/

const TOXIC_WORDS_KEY = 'toxicWords';
const SETTINGS_KEY = 'settings_v1';
let toxicContentFound = false; 
let activityCount = 0;
let currentSettings = {
  enabled: true,
  blurIntensity: 5,
  categories: { profanity: true, hate: true, adult: true },
  whitelist: []
};

// --- 1. GET WORDS FUNCTION ---
const defaultWords = [
    "abuse", "toxic", "hatred", "insult", "swearword", "idiot", 
    "kill yourself", "cunt", "bitch", "fuck", "shit", 
    "porn", "nude", "naked", "gory", "blood", "violence", "sexual", "explicit"
    // Add your expanded list here
];

// Category-specific word sets (small examples; expand as needed)
const categoryWordSets = {
  profanity: ["fuck","shit","bitch","cunt","idiot"],
  hate: ["hatred","kill yourself","insult","abuse"],
  adult: ["porn","nude","naked","sexual","explicit"]
};

// Build the effective toxic words list based on current settings and stored list
async function getEffectiveToxicWords() {
  // Start with any stored custom list
  const stored = await chrome.storage.local.get(TOXIC_WORDS_KEY);
  let words = stored[TOXIC_WORDS_KEY] ? Array.from(stored[TOXIC_WORDS_KEY]) : Array.from(defaultWords);

  // Add category words based on enabled categories
  if (currentSettings && currentSettings.categories) {
    Object.keys(currentSettings.categories).forEach(cat => {
      if (currentSettings.categories[cat] && categoryWordSets[cat]) {
        words = words.concat(categoryWordSets[cat]);
      }
    });
  }

  // Deduplicate and return
  return Array.from(new Set(words.map(w => w.toLowerCase())));
}

async function getToxicWords() {
    const result = await chrome.storage.local.get(TOXIC_WORDS_KEY);
    return result[TOXIC_WORDS_KEY] ? result[TOXIC_WORDS_KEY] : defaultWords;
}

async function loadSettings() {
  const data = await chrome.storage.local.get();
  // Backwards compatible: if keys exist individually, prefer them
  if (data.enabled !== undefined || data.blurIntensity !== undefined) {
    currentSettings.enabled = data.enabled !== undefined ? data.enabled : currentSettings.enabled;
    currentSettings.blurIntensity = data.blurIntensity !== undefined ? data.blurIntensity : currentSettings.blurIntensity;
    currentSettings.categories = data.categories || currentSettings.categories;
    currentSettings.whitelist = data.whitelist || currentSettings.whitelist;
  } else if (data[SETTINGS_KEY]) {
    currentSettings = Object.assign(currentSettings, data[SETTINGS_KEY]);
  }
}

// Cleanup function: restores blurred spans back to normal text and clears image blur styles
function cleanupBlurred() {
  // Replace blurred spans with their original text
  document.querySelectorAll('.toxic-word-blur').forEach(sp => {
    try {
      const txt = document.createTextNode(sp.textContent);
      sp.parentNode.replaceChild(txt, sp);
    } catch (e) {
      // ignore if DOM changed
    }
  });

  // Remove image blur inline styles and class
  document.querySelectorAll('img.toxic-image-blur').forEach(img => {
    try {
      img.classList.remove('toxic-image-blur');
      img.style.filter = '';
      img.style.webkitFilter = '';
    } catch (e) {}
  });

  activityCount = 0;
  toxicContentFound = false;
}

// Record activity events (bounded). Stored as array of {ts: <ms>, type: 'text'|'image'}
async function addActivityEvent(kind) {
  try {
    const key = 'activityEvents';
    const res = await chrome.storage.local.get(key);
    const arr = Array.isArray(res[key]) ? res[key] : [];
    arr.push({ ts: Date.now(), type: kind });
    const MAX = 500;
    const trimmed = arr.length > MAX ? arr.slice(arr.length - MAX) : arr;
    await chrome.storage.local.set({ [key]: trimmed });
  } catch (e) {
    // ignore storage errors
  }
}


// --- 2. WARNING BANNER LOGIC ---

function showGlobalWarning() {
    if (toxicContentFound) return;
    
    toxicContentFound = true;

    let banner = document.getElementById('toxic-alert-banner');
    if (banner) {
        banner.style.display = 'block';
        return;
    }

    banner = document.createElement('div');
    banner.id = 'toxic-alert-banner';
    banner.innerHTML = '‼️ **WARNING:** Toxic or Inappropriate Content Detected and Blurred on This Page. ‼️';
    
    document.body.prepend(banner);
    banner.style.display = 'block';
}


// --- 3. CORE TEXT SCANNING AND BLURRING LOGIC ---

function scanAndBlurText(node, toxicWords) {
  if (node.nodeType === Node.TEXT_NODE) {
    if (node.parentNode && 
        (node.parentNode.nodeName.toLowerCase() === 'script' || 
         node.parentNode.nodeName.toLowerCase() === 'style' ||
         node.parentNode.classList.contains('toxic-word-blur'))) {
        return;
    }

    let content = node.nodeValue;
    let segments = [];
    let lastProcessedIndex = 0;
    let foundToxicInNode = false;

    // Use a unified process to split text node into safe and toxic segments
    // Note: The logic handles multiple toxic words by processing based on index
    
    // Create an array to hold all match locations across all toxic words
    let matches = [];
    toxicWords.forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        let match;
        while ((match = regex.exec(content)) !== null) {
            matches.push({
                start: match.index,
                end: match.index + match[0].length,
                value: match[0]
            });
        }
    });

    // Sort matches by their starting index to process them in order
    matches.sort((a, b) => a.start - b.start);

    // Merge overlapping/adjacent matches to prevent double blurring/splitting issues
    let mergedMatches = [];
    if (matches.length > 0) {
        let currentMatch = matches[0];
        for (let i = 1; i < matches.length; i++) {
            let nextMatch = matches[i];
            // If the next match overlaps or is adjacent, merge them
            if (nextMatch.start <= currentMatch.end) {
                currentMatch.end = Math.max(currentMatch.end, nextMatch.end);
                currentMatch.value = content.substring(currentMatch.start, currentMatch.end);
            } else {
                mergedMatches.push(currentMatch);
                currentMatch = nextMatch;
            }
        }
        mergedMatches.push(currentMatch);
    }

    if (mergedMatches.length > 0) {
        foundToxicInNode = true;
        
        lastProcessedIndex = 0;
        mergedMatches.forEach(match => {
            // Add the safe text before the toxic segment
            if (match.start > lastProcessedIndex) {
                segments.push({ type: 'text', value: content.substring(lastProcessedIndex, match.start) });
            }
            // Add the toxic segment
            segments.push({ type: 'toxic', value: match.value });
            lastProcessedIndex = match.end;
        });
        
        // Add the remaining safe text
        if (lastProcessedIndex < content.length) {
          segments.push({ type: 'text', value: content.substring(lastProcessedIndex) });
        }
    }


  if (foundToxicInNode) {
    // If disabled or site is whitelisted, skip showing/adding blur
    if (!currentSettings.enabled) return;
    const hostname = window.location.hostname || '';
    if ((currentSettings.whitelist || []).some(w => hostname.includes(w))) return;

    // Apply blur intensity from settings
    const intensity = Number(currentSettings.blurIntensity) || 5;

    showGlobalWarning(); 
        
        // Rebuild the new DOM structure from segments
        if (node.parentNode) {
            segments.forEach(segment => {
                if (segment.type === 'toxic') {
                    const blurredSpan = document.createElement('span');
                    blurredSpan.textContent = segment.value;
                    blurredSpan.className = 'toxic-word-blur';
                    blurredSpan.style.filter = `blur(${intensity}px) grayscale(100%)`;
                    blurredSpan.style.webkitFilter = `blur(${intensity}px) grayscale(100%)`;
                    activityCount += 1;
                    addActivityEvent('text');
                    node.parentNode.insertBefore(blurredSpan, node);
                } else {
                    node.parentNode.insertBefore(document.createTextNode(segment.value), node);
                }
            });
            node.parentNode.removeChild(node); // Remove the original text node
        }
    }
    return;
  }

  // Recursively scan child nodes for text nodes
  node.childNodes.forEach(child => scanAndBlurText(child, toxicWords));
}


// --- 4. IMAGE SCANNING AND BLURRING LOGIC ---

function scanAndBlurImages(rootNode, toxicWords) {
    // We target newly added nodes and their descendants for images
    const images = rootNode.nodeType === 1 && rootNode.tagName === 'IMG' ? [rootNode] : rootNode.querySelectorAll('img');

    images.forEach(img => {
        if (img.classList.contains('toxic-image-blur')) {
            return;
        }

        let contextText = '';

        // 1. Check image attributes and URL
        if (img.alt) contextText += img.alt + ' ';
        if (img.title) contextText += img.title + ' ';
        if (img.src) contextText += img.src.split('/').pop().split('.')[0] + ' '; // Filename from URL

        // 2. Check parent/surrounding text (up to 3 levels)
        let parent = img.parentElement;
        for (let i = 0; i < 3 && parent; i++) {
            // Check text of parent elements (useful for captions)
            if (parent.textContent) {
                contextText += parent.textContent + ' ';
            }
            parent = parent.parentElement;
        }

        contextText = contextText.toLowerCase();

        // Check if any toxic word is present in the extracted context
        const isToxicImage = toxicWords.some(word => contextText.includes(word.toLowerCase()));

    if (isToxicImage) {
      if (!img.classList.contains('toxic-image-blur')) img.classList.add('toxic-image-blur');
      // apply inline intensity if available
      if (currentSettings && currentSettings.enabled) {
        const intensity = Number(currentSettings.blurIntensity) || 15;
        img.style.filter = `blur(${intensity}px) grayscale(80%)`;
        img.style.webkitFilter = `blur(${intensity}px) grayscale(80%)`;
      }
      addActivityEvent('image');
      showGlobalWarning();
    }
    });
}


// --- 5. REAL-TIME OBSERVATION ---

function setupRealtimeObserver(toxicWords) {
  const observer = new MutationObserver(mutationsList => {
    mutationsList.forEach(mutation => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1 && node.id !== 'toxic-alert-banner') { // Element node
            (async ()=>{
              const words = await getEffectiveToxicWords();
              scanAndBlurText(node, words);
              scanAndBlurImages(node, words);
            })();
          } else if (node.nodeType === 3) { // Text node
            (async ()=>{
              const words = await getEffectiveToxicWords();
              scanAndBlurText(node, words);
            })();
          }
        });
      } 
    });
  });

  observer.observe(document.body, { 
    childList: true, 
    subtree: true,   
    characterData: false 
  });
}

// --- 6. INITIALIZATION ---

async function initializeExtension() {
  // Load stored settings first so blur intensity / enabled / whitelist are respected
  await loadSettings();
  const words = await getEffectiveToxicWords();

  // 1. Initial scan for text
  scanAndBlurText(document.body, words);

  // 2. Initial scan for images
  scanAndBlurImages(document.body, words);
  
  // 3. Set up the observer
  setupRealtimeObserver(words);
}

initializeExtension();

// Listen for messages from popup or background
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;
  if (msg.type === 'settings-updated' && msg.payload) {
    currentSettings = Object.assign(currentSettings, msg.payload);

    // If disabled or current hostname is whitelisted, remove existing blurred spans
    const hostname = window.location.hostname || '';
    const isWhitelisted = (currentSettings.whitelist || []).some(w => hostname.includes(w));

    const intensity = Number(currentSettings.blurIntensity) || 5;


    if (!currentSettings.enabled || isWhitelisted) {
      cleanupBlurred();
      return;
    }

    // Otherwise update existing blurred spans to new intensity
    document.querySelectorAll('.toxic-word-blur').forEach(sp => {
      sp.style.filter = `blur(${intensity}px) grayscale(100%)`;
      sp.style.webkitFilter = `blur(${intensity}px) grayscale(100%)`;
    });
    // Update image intensities
    document.querySelectorAll('img.toxic-image-blur').forEach(img => {
      img.style.filter = `blur(${intensity}px) grayscale(80%)`;
      img.style.webkitFilter = `blur(${intensity}px) grayscale(80%)`;
    });

    // Then re-scan to find anything newly added since previous scans
    activityCount = 0;
    toxicContentFound = false;
    (async ()=>{
      const words = await getToxicWords();
      scanAndBlurText(document.body, words);
      scanAndBlurImages(document.body, words);
    })();
  }

  if (msg.type === 'get-activity-count') {
    sendResponse({ count: activityCount });
  }
});

// Watch storage changes so other contexts can update settings
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  let changed = false;
  if (changes.enabled) { currentSettings.enabled = changes.enabled.newValue; changed = true; }
  if (changes.blurIntensity) { currentSettings.blurIntensity = changes.blurIntensity.newValue; changed = true; }
  if (changes.categories) { currentSettings.categories = changes.categories.newValue; changed = true; }
  if (changes.whitelist) { currentSettings.whitelist = changes.whitelist.newValue; changed = true; }
  if (changed) {
    const hostname = window.location.hostname || '';
    const isWhitelisted = (currentSettings.whitelist || []).some(w => hostname.includes(w));
    const intensity = Number(currentSettings.blurIntensity) || 5;

    if (!currentSettings.enabled || isWhitelisted) {
      cleanupBlurred();
      return;
    }

    // Update intensity on existing spans and images
    document.querySelectorAll('.toxic-word-blur').forEach(sp => {
      sp.style.filter = `blur(${intensity}px) grayscale(100%)`;
      sp.style.webkitFilter = `blur(${intensity}px) grayscale(100%)`;
    });
    document.querySelectorAll('img.toxic-image-blur').forEach(img => {
      img.style.filter = `blur(${intensity}px) grayscale(80%)`;
      img.style.webkitFilter = `blur(${intensity}px) grayscale(80%)`;
    });

    // Re-scan for new items using category-aware list
    activityCount = 0;
    toxicContentFound = false;
    (async ()=>{
      const words = await getEffectiveToxicWords();
      scanAndBlurText(document.body, words);
      scanAndBlurImages(document.body, words);
    })();
  }
});
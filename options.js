/*
  options.js: Handles the logic for the options.html page.
*/

// --- WORD LIST RETRIEVAL ---
const TOXIC_WORDS_KEY = 'toxicWords';

// Define the expanded default list of words
const defaultWords = [
    "abuse", "toxic", "hatred", "insult", "swearword", "idiot", 
    "kill yourself", "cunt", "bitch", "fuck", "shit", 
    "porn", "nude", "naked", "gory", "blood", "violence", "sexual", "explicit"
    // Add your expanded list of thousands of words here
];

async function getToxicWords() {
    const result = await chrome.storage.local.get(TOXIC_WORDS_KEY);
    return result[TOXIC_WORDS_KEY] ? result[TOXIC_WORDS_KEY] : defaultWords;
}
// --- END OF WORD LIST RETRIEVAL ---


// Loads the word list from storage and populates the textarea
async function loadWords() {
  const words = await getToxicWords();
  document.getElementById('toxicWordsInput').value = words.join('\n');
}

// Saves the words from the textarea to storage
function saveWords() {
  const input = document.getElementById('toxicWordsInput').value;
  // Convert the newline-separated string back to an array, trim, and filter out empty lines
  const wordsArray = input.split('\n')
                           .map(word => word.trim().toLowerCase())
                           .filter(word => word.length > 0);

  chrome.storage.local.set({ [TOXIC_WORDS_KEY]: wordsArray }, () => {
    const status = document.getElementById('status');
    status.textContent = 'List Saved! Reload pages to apply changes.';
    setTimeout(() => {
      status.textContent = '';
    }, 3000);
  });
}

// Attach event listeners when the page loads
document.addEventListener('DOMContentLoaded', loadWords);
document.getElementById('saveButton').addEventListener('click', saveWords);

// --- OpenAI key storage ---
const OPENAI_KEY = 'openai_api_key';
const OPENAI_PROXY = 'openai_proxy_url';

async function loadSavedKey() {
  const r = await chrome.storage.local.get(OPENAI_KEY);
  const k = r[OPENAI_KEY] || '';
  document.getElementById('openaiKeyInput').value = k;
  const p = (await chrome.storage.local.get(OPENAI_PROXY))[OPENAI_PROXY] || '';
  document.getElementById('proxyUrlInput').value = p;
}

document.getElementById('saveKeyButton').addEventListener('click', async () => {
  const v = document.getElementById('openaiKeyInput').value.trim();
  await chrome.storage.local.set({ [OPENAI_KEY]: v });
  const s = document.getElementById('keyStatus');
  s.textContent = v ? 'API Key saved.' : 'API Key cleared.';
  setTimeout(() => { s.textContent = ''; }, 3000);
});

document.getElementById('saveProxyButton').addEventListener('click', async () => {
  const v = document.getElementById('proxyUrlInput').value.trim();
  await chrome.storage.local.set({ [OPENAI_PROXY]: v });
  const s = document.getElementById('proxyStatus');
  s.textContent = v ? 'Proxy URL saved.' : 'Proxy URL cleared.';
  setTimeout(() => { s.textContent = ''; }, 3000);
});

document.addEventListener('DOMContentLoaded', loadSavedKey);
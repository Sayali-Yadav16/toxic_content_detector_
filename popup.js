const DEFAULT_SETTINGS = {
  enabled: true,
  blurIntensity: 5,
  categories: { profanity: true, hate: true, adult: true },
  whitelist: []
};

const KEYS = {
  enabled: 'enabled',
  blurIntensity: 'blurIntensity',
  categories: 'categories',
  whitelist: 'whitelist'
};

function $(id){ return document.getElementById(id); }

async function loadSettings(){
  const all = await chrome.storage.local.get(Object.values(KEYS));
  return {
    enabled: (all[KEYS.enabled] !== undefined) ? all[KEYS.enabled] : DEFAULT_SETTINGS.enabled,
    blurIntensity: (all[KEYS.blurIntensity] !== undefined) ? all[KEYS.blurIntensity] : DEFAULT_SETTINGS.blurIntensity,
    categories: (all[KEYS.categories] !== undefined) ? all[KEYS.categories] : DEFAULT_SETTINGS.categories,
    whitelist: (all[KEYS.whitelist] !== undefined) ? all[KEYS.whitelist] : DEFAULT_SETTINGS.whitelist
  };
}

async function saveSettings(settings){
  await chrome.storage.local.set({
    [KEYS.enabled]: settings.enabled,
    [KEYS.blurIntensity]: settings.blurIntensity,
    [KEYS.categories]: settings.categories,
    [KEYS.whitelist]: settings.whitelist
  });
}

function populateUI(s){
  $('enableToggle').checked = s.enabled;
  $('intensity').value = s.blurIntensity;
  $('intensityValue').textContent = s.blurIntensity;
  $('catProfanity').checked = !!s.categories.profanity;
  $('catHate').checked = !!s.categories.hate;
  $('catAdult').checked = !!s.categories.adult;
  $('whitelist').value = (s.whitelist || []).join('\n');
}

function readUI(){
  return {
    enabled: $('enableToggle').checked,
    blurIntensity: Number($('intensity').value),
    categories: {
      profanity: $('catProfanity').checked,
      hate: $('catHate').checked,
      adult: $('catAdult').checked
    },
    whitelist: $('whitelist').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  };
}

async function init(){
  const s = await loadSettings();
  populateUI(s);

  // Bind events
  $('enableToggle').addEventListener('change', async ()=>{
    const newS = readUI();
    await saveSettings(newS);
    notifyTabs('settings-updated', newS);
  });

  $('intensity').addEventListener('input', ()=>{
    $('intensityValue').textContent = $('intensity').value;
  });

  $('intensity').addEventListener('change', async ()=>{
    const newS = readUI();
    await saveSettings(newS);
    notifyTabs('settings-updated', newS);
  });

  ['catProfanity','catHate','catAdult','whitelist'].forEach(id=>{
    $(id).addEventListener('change', async ()=>{
      const newS = readUI();
      await saveSettings(newS);
      notifyTabs('settings-updated', newS);
    });
  });

  $('openOptions').addEventListener('click', ()=>{
    chrome.runtime.openOptionsPage();
  });

  // Request current activity count for the active tab
  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  if (tab) {
    chrome.tabs.sendMessage(tab.id, { type: 'get-activity-count' }, (resp) => {
      if (resp && typeof resp.count === 'number') {
        $('activityCount').textContent = resp.count;
      }
    });
  }

  // Load activity events from storage and draw chart (if Chart.js available)
  const stored = await chrome.storage.local.get('activityEvents');
  const events = Array.isArray(stored.activityEvents) ? stored.activityEvents : [];
  if (events.length > 0) setupChart(events);
  // Update the simple activity counter to reflect stored events (real-time source)
  try { $('activityCount').textContent = String(events.length); } catch (e) {}
}

function notifyTabs(type, payload){
  chrome.tabs.query({}, (tabs)=>{
    tabs.forEach(t=>{
      chrome.tabs.sendMessage(t.id, { type, payload }, ()=>{});
    });
  });
}

// Set up activity chart
function setupChart(events) {
  const ctx = document.getElementById('trendChart');
  if (!ctx) return;
  if (typeof window.Chart === 'undefined') return; // Chart.js not loaded

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const days = [];
  
  for (let i = 6; i >= 0; i--) {
    const ts = now - i * dayMs;
    const d = new Date(ts);
    days.push({ 
      label: d.toLocaleDateString(), 
      tsStart: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(), 
      count: 0 
    });
  }

  events.forEach(e => {
    for (const day of days) {
      if (e.ts >= day.tsStart && e.ts < day.tsStart + dayMs) {
        day.count++;
        break;
      }
    }
  });

  new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: { 
      labels: days.map(d => d.label), 
      datasets: [{ 
        label: 'Toxic items/day', 
        data: days.map(d => d.count), 
        fill: false, 
        borderColor: '#ff4d4f' 
      }] 
    },
    options: { 
      responsive: false, 
      maintainAspectRatio: false 
    }
  });
}

// Try to ensure Chart.js is available. Prefer local vendor file, fall back to CDN.
function ensureChartLoaded(timeoutMs = 4000) {
  return new Promise((resolve) => {
    if (typeof window.Chart !== 'undefined') return resolve(true);

    // Try local vendor first
    const localUrl = chrome.runtime.getURL('vendor/chart.min.js');
    let loaded = false;

    function tryLoad(src, onDone) {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => onDone(true);
      s.onerror = () => onDone(false);
      document.head.appendChild(s);
    }

    tryLoad(localUrl, ok => {
      if (ok && typeof window.Chart !== 'undefined') return resolve(true);
      // In extension contexts the CSP typically blocks remote scripts. Avoid CDN fallback to prevent console CSP errors.
      return resolve(false);
    });

    // Resolve false after timeout if nothing loaded
    setTimeout(()=>{ if (!loaded && typeof window.Chart === 'undefined') resolve(false); }, timeoutMs);
  });
}

// Live update: whenever activityEvents change in storage, refresh the chart
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.activityEvents) {
    const newEvents = Array.isArray(changes.activityEvents.newValue) ? changes.activityEvents.newValue : [];
    // Update chart
    ensureChartLoaded().then(ok => { if (ok) setupChart(newEvents); });
    // Update counter in real-time from storage events
    try { $('activityCount').textContent = String(newEvents.length); } catch (e) {}
  }
});

// Ensure chart lib then init
ensureChartLoaded().then(()=>init());

// --- AI Rephrasing/UI wiring ---
async function getApiKey() {
  const r = await chrome.storage.local.get('openai_api_key');
  return r.openai_api_key || null;
}

async function getProxyUrl() {
  const r = await chrome.storage.local.get('openai_proxy_url');
  return r.openai_proxy_url || null;
}

function simpleLocalRephrase(text, count=3) {
  // Very small heuristic paraphraser: swaps order, softens words, and returns variants
  const lowers = text.toLowerCase();
  const soft = lowers.replace(/\b(kill yourself|idiot|hate|stupid|bitch|fuck|shit|cunt)\b/g, 'someone');
  const variants = [];
  for (let i=0;i<count;i++) {
    if (i%3===0) variants.push(capitalizeFirst(soft));
    else if (i%3===1) variants.push(soft.replace(/\b(you)\b/g,'one'));
    else variants.push(soft.split(' ').reverse().join(' '));
  }
  return variants.map(s => s.trim()).filter(Boolean);
}

function capitalizeFirst(s){ return s.charAt(0).toUpperCase()+s.slice(1); }

async function callOpenAIRephrase(text, count=3, apiKey) {
  // Use OpenAI chat completions if key available. Keep network call minimal and optional.
  const prompt = `Provide ${count} polite, non-toxic rephrasings of the following text. Output each suggestion on its own line:\n\n"${text.replace(/"/g,'\"')}"`;
  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role:'system', content:'You are a helpful assistant that rewrites text to be polite and non-toxic.' }, { role:'user', content: prompt }],
        max_tokens: 400,
        temperature: 0.8,
        n: 1
      })
    });
    if (!resp.ok) {
      const t = await resp.text();
      throw new Error(`OpenAI error: ${resp.status} ${t}`);
    }
    const data = await resp.json();
    const txt = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ? data.choices[0].message.content : '';
    return txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0,count);
  } catch (e) {
    console.error('OpenAI call failed', e);
    return null;
  }
}

async function callProxyRephrase(text, count=3, proxyUrl) {
  try {
    const resp = await fetch(proxyUrl.replace(/\/+$/, '') + '/rephrase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: `Provide ${count} polite, non-toxic rephrasings of: "${text.replace(/"/g,'\\"')}"`, max_tokens: 400 })
    });
    if (!resp.ok) throw new Error('proxy returned ' + resp.status);
    const data = await resp.json();
    // Try to parse choices -> message content, or fallback to raw text
    if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
      return data.choices[0].message.content.split(/\r?\n/).map(l=>l.trim()).filter(Boolean).slice(0,count);
    }
    if (typeof data === 'string') return data.split(/\r?\n/).map(l=>l.trim()).filter(Boolean).slice(0,count);
    return null;
  } catch (e) {
    console.error('Proxy call failed', e);
    return null;
  }
}

// Wire UI after DOM ready
document.addEventListener('DOMContentLoaded', ()=>{
  const rephraseBtn = document.getElementById('rephraseBtn');
  const rephraseInput = document.getElementById('rephraseInput');
  const rephraseResults = document.getElementById('rephraseResults');
  const suggestionsCount = document.getElementById('suggestionsCount');
  const suggestionsCountVal = document.getElementById('suggestionsCountVal');
  const openOptionsLink = document.getElementById('openOptionsLink');

  suggestionsCount.addEventListener('input', ()=>{ suggestionsCountVal.textContent = suggestionsCount.value; });

  openOptionsLink.addEventListener('click', (e)=>{ e.preventDefault(); chrome.runtime.openOptionsPage(); });

  rephraseBtn.addEventListener('click', async ()=>{
    const text = rephraseInput.value.trim();
    if (!text) return;
    rephraseResults.innerHTML = '<li class="muted">Working...</li>';
    const count = Number(suggestionsCount.value || 3);
    const proxyUrl = await getProxyUrl();
    let suggestions = null;
    if (proxyUrl) {
      suggestions = await callProxyRephrase(text, count, proxyUrl);
    }
    if (!suggestions) {
      const apiKey = await getApiKey();
      if (apiKey) suggestions = await callOpenAIRephrase(text, count, apiKey);
    }
    if (!suggestions) {
      // fallback
      suggestions = simpleLocalRephrase(text, count);
    }
    rephraseResults.innerHTML = '';
    suggestions.forEach(s => {
      const li = document.createElement('li');
      li.textContent = s;
      rephraseResults.appendChild(li);
    });
  });
});

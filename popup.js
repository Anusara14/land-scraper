/**
 * popup.js - Popup UI Controller for Land Scraper Extension
 * Handles user interactions and communicates with content script and background worker
 */

// Default locations (can be customized by user)
const DEFAULT_LOCATIONS = [
  // Kaduwela MC
  'Battaramulla', 'Pelawatta', 'Thalawathugoda', 'Malabe', 'Athurugiriya',
  'Kaduwela', 'Ranala', 'Hewagama', 'Hokandara',
  // Kotte MC
  'Rajagiriya', 'Ethul Kotte', 'Pita Kotte', 'Nawala', 'Nugegoda',
  'Pagoda', 'Gangodawila', 'Welikada',
  // Colombo MC
  'Mattakkuliya', 'Modara', 'Borella', 'Cinnamon Gardens', 'Havelock Town',
  'Wellawatta', 'Pamankada', 'Kirulapona'
];

// DOM Elements
const elements = {
  currentSite: document.getElementById('currentSite'),
  status: document.getElementById('status'),
  statusIndicator: document.getElementById('statusIndicator'),
  listingsCount: document.getElementById('listingsCount'),
  pagesCount: document.getElementById('pagesCount'),
  filterLocations: document.getElementById('filterLocations'),
  scrapeDetails: document.getElementById('scrapeDetails'),
  delaySlider: document.getElementById('delaySlider'),
  delayValue: document.getElementById('delayValue'),
  storagePercent: document.getElementById('storagePercent'),
  storageProgress: document.getElementById('storageProgress'),
  storageWarning: document.getElementById('storageWarning'),
  settingsToggle: document.getElementById('settingsToggle'),
  settingsContent: document.getElementById('settingsContent'),
  locationsList: document.getElementById('locationsList'),
  addLocationBtn: document.getElementById('addLocationBtn'),
  addLocationForm: document.getElementById('addLocationForm'),
  newLocationInput: document.getElementById('newLocationInput'),
  confirmAddLocation: document.getElementById('confirmAddLocation'),
  cancelAddLocation: document.getElementById('cancelAddLocation'),
  resetLocationsBtn: document.getElementById('resetLocationsBtn'),
  startBtn: document.getElementById('startBtn'),
  stopBtn: document.getElementById('stopBtn'),
  downloadBtn: document.getElementById('downloadBtn'),
  exportIncrementalBtn: document.getElementById('exportIncrementalBtn'),
  clearBtn: document.getElementById('clearBtn'),
  clearLogBtn: document.getElementById('clearLogBtn'),
  logContainer: document.getElementById('logContainer')
};

// State
let currentTabId = null;
let customLocations = [...DEFAULT_LOCATIONS];

// Storage limit (10MB for chrome.storage.local)
const STORAGE_LIMIT = 10 * 1024 * 1024;
const STORAGE_WARNING_THRESHOLD = 0.8;

/**
 * Add entry to activity log
 */
function addLog(message, type = '') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  elements.logContainer.insertBefore(entry, elements.logContainer.firstChild);
  
  while (elements.logContainer.children.length > 50) {
    elements.logContainer.removeChild(elements.logContainer.lastChild);
  }
}

/**
 * Update status display
 */
function setStatus(status) {
  elements.status.textContent = status.toUpperCase();
  
  if (elements.statusIndicator) {
    elements.statusIndicator.className = `status-dot ${status}`;
  }
}

/**
 * Update button states
 */
function updateButtons(isScraping) {
  elements.startBtn.disabled = isScraping;
  elements.stopBtn.disabled = !isScraping;
}

/**
 * Update storage usage indicator
 */
async function updateStorageUsage() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'GET_STORAGE_USAGE' });
    
    if (response && response.success) {
      const percent = response.percent;
      const usedMB = (response.usedBytes / 1024 / 1024).toFixed(2);
      
      elements.storagePercent.textContent = `${percent.toFixed(1)}% ${usedMB}MB`;
      elements.storageProgress.style.width = `${Math.min(percent, 100)}%`;
      
      elements.storageProgress.classList.remove('warning', 'critical');
      if (percent >= 90) {
        elements.storageProgress.classList.add('critical');
        elements.storageWarning.classList.remove('hidden');
        elements.storageWarning.textContent = 'Storage critical! Export data immediately.';
      } else if (percent >= STORAGE_WARNING_THRESHOLD * 100) {
        elements.storageProgress.classList.add('warning');
        elements.storageWarning.classList.remove('hidden');
        elements.storageWarning.textContent = 'Storage nearly full. Consider exporting data.';
      } else {
        elements.storageWarning.classList.add('hidden');
      }
    }
  } catch (error) {
    console.error('Error getting storage usage:', error);
  }
}

/**
 * Update delay slider display and track fill
 */
function updateDelayDisplay() {
  const value = parseFloat(elements.delaySlider.value);
  const min = parseFloat(elements.delaySlider.min);
  const max = parseFloat(elements.delaySlider.max);
  const percent = ((value - min) / (max - min)) * 100;
  
  elements.delayValue.textContent = `${value}s`;
  elements.delaySlider.style.background = `linear-gradient(to right, #00d4ff 0%, #00d4ff ${percent}%, #333 ${percent}%, #333 100%)`;
}

/**
 * Render locations list
 */
function renderLocations() {
  elements.locationsList.innerHTML = '';
  
  customLocations.forEach((location, index) => {
    const tag = document.createElement('div');
    tag.className = 'location-tag';
    tag.innerHTML = `
      <span>${location}</span>
      <button class="remove-btn" data-index="${index}" title="Remove">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `;
    elements.locationsList.appendChild(tag);
  });
  
  // Add event listeners to remove buttons
  elements.locationsList.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.currentTarget.dataset.index);
      removeLocation(index);
    });
  });
}

/**
 * Add a new location
 */
async function addLocation(location) {
  const trimmed = location.trim();
  if (!trimmed) return;
  
  // Check for duplicates (case-insensitive)
  if (customLocations.some(l => l.toLowerCase() === trimmed.toLowerCase())) {
    addLog(`Location "${trimmed}" already exists`, 'error');
    return;
  }
  
  customLocations.push(trimmed);
  await saveLocations();
  renderLocations();
  addLog(`Added location: ${trimmed}`, 'success');
}

/**
 * Remove a location by index
 */
async function removeLocation(index) {
  const removed = customLocations.splice(index, 1)[0];
  await saveLocations();
  renderLocations();
  addLog(`Removed location: ${removed}`, 'info');
}

/**
 * Save locations to storage
 */
async function saveLocations() {
  await chrome.storage.local.set({ customLocations });
  // Also notify content script about updated locations
  if (currentTabId) {
    try {
      await chrome.tabs.sendMessage(currentTabId, {
        action: 'UPDATE_LOCATIONS',
        locations: customLocations
      });
    } catch (e) {
      // Content script may not be loaded
    }
  }
}

/**
 * Load locations from storage
 */
async function loadLocations() {
  const data = await chrome.storage.local.get(['customLocations']);
  if (data.customLocations && Array.isArray(data.customLocations)) {
    customLocations = data.customLocations;
  } else {
    customLocations = [...DEFAULT_LOCATIONS];
    await saveLocations();
  }
  renderLocations();
}

/**
 * Reset locations to defaults
 */
async function resetLocations() {
  if (!confirm('Reset to default locations? This will remove any custom locations you added.')) {
    return;
  }
  customLocations = [...DEFAULT_LOCATIONS];
  await saveLocations();
  renderLocations();
  addLog('Locations reset to defaults', 'info');
}

/**
 * Show add location form
 */
function showAddLocationForm() {
  elements.addLocationForm.classList.remove('hidden');
  elements.newLocationInput.focus();
}

/**
 * Hide add location form
 */
function hideAddLocationForm() {
  elements.addLocationForm.classList.add('hidden');
  elements.newLocationInput.value = '';
}

/**
 * Detect which site the current tab is on
 */
async function detectCurrentSite() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabId = tab.id;
    const url = tab.url || '';
    
    if (url.includes('ikman.lk')) {
      elements.currentSite.textContent = 'IKMAN.LK';
      elements.currentSite.className = 'site-badge ikman';
      return 'ikman';
    } else if (url.includes('lankapropertyweb.com')) {
      elements.currentSite.textContent = 'LANKAPROPERTYWEB.COM';
      elements.currentSite.className = 'site-badge lpw';
      return 'lpw';
    } else {
      elements.currentSite.textContent = 'UNSUPPORTED';
      elements.currentSite.className = 'site-badge unsupported';
      elements.startBtn.disabled = true;
      addLog('Navigate to ikman.lk or lankapropertyweb.com', 'error');
      return null;
    }
  } catch (error) {
    console.error('Error detecting site:', error);
    elements.currentSite.textContent = 'ERROR';
    elements.currentSite.className = 'site-badge unsupported';
    return null;
  }
}

/**
 * Load saved state from storage
 */
async function loadState() {
  try {
    const data = await chrome.storage.local.get([
      'listings', 'pagesScraped', 'isScraping', 
      'filterLocations', 'scrapeDetails', 'pageDelay'
    ]);
    
    const listings = data.listings || [];
    const pages = data.pagesScraped || 0;
    
    elements.listingsCount.textContent = listings.length;
    elements.pagesCount.textContent = pages;
    elements.filterLocations.checked = data.filterLocations !== false;
    elements.scrapeDetails.checked = data.scrapeDetails === true;
    
    const delay = data.pageDelay || 2.5;
    elements.delaySlider.value = delay;
    updateDelayDisplay();
    
    if (data.isScraping) {
      setStatus('scraping');
      updateButtons(true);
    } else {
      setStatus('idle');
      updateButtons(false);
    }
    
    if (listings.length > 0) {
      addLog(`Loaded ${listings.length} existing listings`, 'info');
    }
    
    await updateStorageUsage();
    await loadLocations();
  } catch (error) {
    console.error('Error loading state:', error);
  }
}

/**
 * Start scraping
 */
async function startScraping() {
  const site = await detectCurrentSite();
  if (!site) {
    addLog('Cannot scrape on this website', 'error');
    return;
  }
  
  const filterEnabled = elements.filterLocations.checked;
  const scrapeDetails = elements.scrapeDetails.checked;
  const pageDelay = parseFloat(elements.delaySlider.value) * 1000;
  
  await chrome.storage.local.set({ 
    filterLocations: filterEnabled,
    scrapeDetails: scrapeDetails,
    pageDelay: parseFloat(elements.delaySlider.value)
  });
  
  setStatus('scraping');
  updateButtons(true);
  addLog('Starting scraper...', 'info');
  if (scrapeDetails) {
    addLog('Detail page scraping enabled', 'info');
  }
  addLog(`Page delay: ${elements.delaySlider.value}s`, 'info');
  addLog(`Filtering ${customLocations.length} locations`, 'info');
  
  try {
    await chrome.tabs.sendMessage(currentTabId, {
      action: 'START_SCRAPING',
      filterLocations: filterEnabled,
      scrapeDetails: scrapeDetails,
      pageDelay: pageDelay,
      locations: customLocations
    });
    
    await chrome.storage.local.set({ isScraping: true });
    addLog('Scraper started successfully', 'success');
  } catch (error) {
    console.error('Error starting scraper:', error);
    addLog('Failed to start. Refresh the page and try again.', 'error');
    setStatus('idle');
    updateButtons(false);
  }
}

/**
 * Stop scraping
 */
async function stopScraping() {
  addLog('Stopping scraper...', 'info');
  
  try {
    await chrome.tabs.sendMessage(currentTabId, { action: 'STOP_SCRAPING' });
    await chrome.storage.local.set({ isScraping: false });
    
    setStatus('stopped');
    updateButtons(false);
    addLog('Scraper stopped', 'success');
  } catch (error) {
    console.error('Error stopping scraper:', error);
    addLog('Error stopping scraper', 'error');
  }
}

/**
 * Download CSV
 */
async function downloadCSV() {
  addLog('Generating CSV...', 'info');
  
  try {
    const response = await chrome.runtime.sendMessage({ action: 'GENERATE_CSV' });
    
    if (response.success) {
      addLog(`Downloaded ${response.count} listings`, 'success');
    } else {
      addLog(response.error || 'Failed to generate CSV', 'error');
    }
  } catch (error) {
    console.error('Error downloading CSV:', error);
    addLog('Error generating CSV', 'error');
  }
}

/**
 * Export and clear data
 */
async function exportAndClear() {
  addLog('Exporting and clearing data...', 'info');
  
  try {
    const response = await chrome.runtime.sendMessage({ action: 'GENERATE_CSV' });
    
    if (response.success) {
      addLog(`Downloaded ${response.count} listings`, 'success');
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await chrome.storage.local.set({
        listings: [],
        pagesScraped: 0
      });
      
      elements.listingsCount.textContent = '0';
      elements.pagesCount.textContent = '0';
      await updateStorageUsage();
      
      addLog('Data cleared. Ready for more scraping!', 'success');
    } else {
      addLog(response.error || 'Failed to export', 'error');
    }
  } catch (error) {
    console.error('Error in export and clear:', error);
    addLog('Error exporting data', 'error');
  }
}

/**
 * Clear activity log
 */
function clearLog() {
  elements.logContainer.innerHTML = '<div class="log-entry success">Log cleared</div>';
}

/**
 * Clear all scraped data (without exporting)
 */
async function clearData() {
  if (!confirm('Are you sure you want to clear all scraped data? This cannot be undone.')) {
    return;
  }
  
  try {
    await chrome.storage.local.set({
      listings: [],
      pagesScraped: 0,
      isScraping: false
    });
    
    elements.listingsCount.textContent = '0';
    elements.pagesCount.textContent = '0';
    setStatus('idle');
    updateButtons(false);
    await updateStorageUsage();
    
    addLog('All data cleared', 'success');
  } catch (error) {
    console.error('Error clearing data:', error);
    addLog('Error clearing data', 'error');
  }
}

/**
 * Listen for messages from content script
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'UPDATE_COUNT':
      elements.listingsCount.textContent = message.count;
      if (message.newListings > 0) {
        addLog(`Scraped ${message.newListings} new listings`, 'success');
      }
      break;
      
    case 'UPDATE_PAGES':
      elements.pagesCount.textContent = message.pages;
      addLog(`Processing page ${message.pages}...`, 'info');
      break;
      
    case 'SCRAPING_COMPLETE':
      setStatus('done');
      updateButtons(false);
      addLog(`Scraping complete! Total: ${message.total} listings`, 'success');
      break;
      
    case 'SCRAPING_ERROR':
      setStatus('stopped');
      updateButtons(false);
      addLog(`Error: ${message.error}`, 'error');
      break;
      
    case 'LOG':
      addLog(message.text, message.type || '');
      break;
  }
});

/**
 * Listen for storage changes
 */
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    if (changes.listings) {
      elements.listingsCount.textContent = changes.listings.newValue?.length || 0;
      updateStorageUsage();
    }
    if (changes.pagesScraped) {
      elements.pagesCount.textContent = changes.pagesScraped.newValue || 0;
    }
  }
});

// ============================================
// EVENT LISTENERS
// ============================================

// Main action buttons
elements.startBtn.addEventListener('click', startScraping);
elements.stopBtn.addEventListener('click', stopScraping);
elements.downloadBtn.addEventListener('click', downloadCSV);
elements.exportIncrementalBtn.addEventListener('click', exportAndClear);
elements.clearBtn.addEventListener('click', clearData);
elements.clearLogBtn.addEventListener('click', clearLog);

// Delay slider
elements.delaySlider.addEventListener('input', updateDelayDisplay);
elements.delaySlider.addEventListener('change', async () => {
  const delay = parseFloat(elements.delaySlider.value);
  await chrome.storage.local.set({ pageDelay: delay });
  addLog(`Page delay set to ${delay}s`, 'info');
});

// Settings toggles
elements.scrapeDetails.addEventListener('change', async () => {
  await chrome.storage.local.set({ scrapeDetails: elements.scrapeDetails.checked });
});

elements.filterLocations.addEventListener('change', async () => {
  await chrome.storage.local.set({ filterLocations: elements.filterLocations.checked });
});

// Settings accordion
if (elements.settingsToggle && elements.settingsContent) {
  elements.settingsToggle.addEventListener('click', () => {
    elements.settingsToggle.classList.toggle('open');
    elements.settingsContent.classList.toggle('open');
  });
}

// Location management
elements.addLocationBtn.addEventListener('click', showAddLocationForm);
elements.cancelAddLocation.addEventListener('click', hideAddLocationForm);

elements.confirmAddLocation.addEventListener('click', async () => {
  const value = elements.newLocationInput.value;
  await addLocation(value);
  hideAddLocationForm();
});

elements.newLocationInput.addEventListener('keypress', async (e) => {
  if (e.key === 'Enter') {
    const value = elements.newLocationInput.value;
    await addLocation(value);
    hideAddLocationForm();
  }
});

elements.resetLocationsBtn.addEventListener('click', resetLocations);

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await detectCurrentSite();
  await loadState();
});

/**
 * popup.js - Brutalist Terminal UI Controller for Land Scraper Extension
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
  statusBadge: document.getElementById('statusBadge'),
  listingsCount: document.getElementById('listingsCount'),
  pagesCount: document.getElementById('pagesCount'),
  storagePercent: document.getElementById('storagePercent'),
  storageProgress: document.getElementById('storageProgress'),
  storageWarning: document.getElementById('storageWarning'),
  scrapeDetailsToggle: document.getElementById('scrapeDetailsToggle'),
  delaySelector: document.getElementById('delaySelector'),
  filterLocationsToggle: document.getElementById('filterLocationsToggle'),
  configLocationsBtn: document.getElementById('configLocationsBtn'),
  locationsList: document.getElementById('locationsList'),
  newLocationInput: document.getElementById('newLocationInput'),
  addLocationBtn: document.getElementById('addLocationBtn'),
  resetLocationsBtn: document.getElementById('resetLocationsBtn'),
  startBtn: document.getElementById('startBtn'),
  stopBtn: document.getElementById('stopBtn'),
  downloadBtn: document.getElementById('downloadBtn'),
  exportIncrementalBtn: document.getElementById('exportIncrementalBtn'),
  clearBtn: document.getElementById('clearBtn'),
  logContainer: document.getElementById('logContainer'),
  settingsBtn: document.getElementById('settingsBtn'),
  settingsModal: document.getElementById('settingsModal'),
  closeModalBtn: document.getElementById('closeModalBtn')
};

// State
let currentTabId = null;
let customLocations = [...DEFAULT_LOCATIONS];
let scrapeDetailsEnabled = false;
let filterLocationsEnabled = true;
let currentDelay = 2;

// Storage limit (5MB for chrome.storage.local)
const STORAGE_LIMIT = 5 * 1024 * 1024;
const STORAGE_WARNING_THRESHOLD = 0.8;

/**
 * Format timestamp for log entries
 */
function getTimestamp() {
  const now = new Date();
  return now.toLocaleTimeString('en-US', { hour12: false });
}

/**
 * Add entry to activity log
 */
function addLog(message, type = '') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${getTimestamp()}] ${message.toUpperCase().replace(/ /g, '_')}`;
  elements.logContainer.insertBefore(entry, elements.logContainer.firstChild);
  
  while (elements.logContainer.children.length > 50) {
    elements.logContainer.removeChild(elements.logContainer.lastChild);
  }
}

/**
 * Update status badge
 */
function setStatus(status) {
  elements.statusBadge.className = `status-badge ${status}`;
  
  switch (status) {
    case 'idle':
      elements.statusBadge.textContent = 'SYS_STATUS: IDLE';
      break;
    case 'scraping':
      elements.statusBadge.textContent = 'SYS_STATUS: ACTIVE';
      break;
    case 'stopped':
      elements.statusBadge.textContent = 'SYS_STATUS: HALTED';
      break;
    case 'done':
      elements.statusBadge.textContent = 'SYS_STATUS: COMPLETE';
      break;
    default:
      elements.statusBadge.textContent = 'SYS_STATUS: IDLE';
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
 * Update storage usage indicator with segmented progress
 */
async function updateStorageUsage() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'GET_STORAGE_USAGE' });
    
    if (response && response.success) {
      const percent = response.percent;
      const usedMB = (response.usedBytes / 1024 / 1024).toFixed(2);
      const totalMB = (STORAGE_LIMIT / 1024 / 1024).toFixed(2);
      
      elements.storagePercent.textContent = `${usedMB}MB / ${totalMB}MB`;
      
      // Update segmented progress bar
      const segments = elements.storageProgress.querySelectorAll('.segment');
      const activeCount = Math.ceil((percent / 100) * segments.length);
      
      segments.forEach((segment, index) => {
        segment.className = 'segment';
        if (index < activeCount) {
          if (percent >= 90) {
            segment.classList.add('critical');
          } else if (percent >= 80) {
            segment.classList.add('warning');
          } else {
            segment.classList.add('active');
          }
        }
      });
      
      if (percent >= 90) {
        elements.storageWarning.classList.remove('hidden');
        elements.storageWarning.textContent = 'CRITICAL: STORAGE_FULL // EXPORT_IMMEDIATELY';
      } else if (percent >= STORAGE_WARNING_THRESHOLD * 100) {
        elements.storageWarning.classList.remove('hidden');
        elements.storageWarning.textContent = 'WARNING: STORAGE_APPROACHING_LIMIT';
      } else {
        elements.storageWarning.classList.add('hidden');
      }
    }
  } catch (error) {
    console.error('Error getting storage usage:', error);
  }
}

/**
 * Update delay selector UI
 */
function updateDelaySelector(delay) {
  const options = elements.delaySelector.querySelectorAll('.delay-option');
  options.forEach(opt => {
    if (parseFloat(opt.dataset.delay) === delay) {
      opt.classList.add('active');
    } else {
      opt.classList.remove('active');
    }
  });
}

/**
 * Toggle checkbox state
 */
function toggleCheckbox(element) {
  element.classList.toggle('checked');
  return element.classList.contains('checked');
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
      <span>${location.toUpperCase()}</span>
      <button class="remove-btn" data-index="${index}" title="Remove">×</button>
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
  addLog(`LOCATION_ADDED: ${trimmed}`, 'success');
}

/**
 * Remove a location by index
 */
async function removeLocation(index) {
  const removed = customLocations.splice(index, 1)[0];
  await saveLocations();
  renderLocations();
  addLog(`LOCATION_REMOVED: ${removed}`, 'info');
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
  if (!confirm('RESET_TO_DEFAULT_LOCATIONS? THIS_WILL_REMOVE_CUSTOM_ENTRIES.')) {
    return;
  }
  customLocations = [...DEFAULT_LOCATIONS];
  await saveLocations();
  renderLocations();
  addLog('LOCATIONS_RESET_TO_DEFAULTS', 'info');
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
      addLog('TARGET_DETECTED: IKMAN.LK', 'success');
      return 'ikman';
    } else if (url.includes('lankapropertyweb.com')) {
      addLog('TARGET_DETECTED: LANKAPROPERTYWEB.COM', 'success');
      return 'lpw';
    } else {
      elements.startBtn.disabled = true;
      addLog('ERROR: UNSUPPORTED_DOMAIN', 'error');
      addLog('NAVIGATE_TO: IKMAN.LK | LANKAPROPERTYWEB.COM', 'info');
      return null;
    }
  } catch (error) {
    console.error('Error detecting site:', error);
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
    
    elements.listingsCount.textContent = listings.length.toLocaleString();
    elements.pagesCount.textContent = pages;
    
    // Filter locations toggle
    filterLocationsEnabled = data.filterLocations !== false;
    if (filterLocationsEnabled) {
      elements.filterLocationsToggle.classList.add('checked');
    } else {
      elements.filterLocationsToggle.classList.remove('checked');
    }
    
    // Scrape details toggle
    scrapeDetailsEnabled = data.scrapeDetails === true;
    if (scrapeDetailsEnabled) {
      elements.scrapeDetailsToggle.classList.add('checked');
    } else {
      elements.scrapeDetailsToggle.classList.remove('checked');
    }
    
    // Delay
    currentDelay = data.pageDelay || 2.5;
    updateDelaySelector(currentDelay);
    
    if (data.isScraping) {
      setStatus('scraping');
      updateButtons(true);
    } else {
      setStatus('idle');
      updateButtons(false);
    }
    
    if (listings.length > 0) {
      addLog(`LOADED_${listings.length}_EXISTING_LISTINGS`, 'info');
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
    addLog('ABORT: INVALID_TARGET_DOMAIN', 'error');
    return;
  }
  
  const pageDelay = currentDelay * 1000;
  
  await chrome.storage.local.set({ 
    filterLocations: filterLocationsEnabled,
    scrapeDetails: scrapeDetailsEnabled,
    pageDelay: currentDelay
  });
  
  setStatus('scraping');
  updateButtons(true);
  addLog('INITIALIZING_ENGINE...', 'success');
  if (scrapeDetailsEnabled) {
    addLog('FETCH_COORDS: ENABLED', 'info');
  }
  addLog(`PAGE_DELAY: ${currentDelay}S`, 'info');
  addLog(`TARGET_LOCATIONS: ${customLocations.length}`, 'info');
  
  try {
    await chrome.tabs.sendMessage(currentTabId, {
      action: 'START_SCRAPING',
      filterLocations: filterLocationsEnabled,
      scrapeDetails: scrapeDetailsEnabled,
      pageDelay: pageDelay,
      locations: customLocations
    });
    
    await chrome.storage.local.set({ isScraping: true });
    addLog('SCRAPER_ONLINE', 'success');
  } catch (error) {
    console.error('Error starting scraper:', error);
    addLog('ERROR: FAILED_TO_START // REFRESH_PAGE', 'error');
    setStatus('idle');
    updateButtons(false);
  }
}

/**
 * Stop scraping
 */
async function stopScraping() {
  addLog('HALT_SIGNAL_SENT...', 'info');
  
  try {
    await chrome.tabs.sendMessage(currentTabId, { action: 'STOP_SCRAPING' });
    await chrome.storage.local.set({ isScraping: false });
    
    setStatus('stopped');
    updateButtons(false);
    addLog('SCRAPER_HALTED', 'success');
  } catch (error) {
    console.error('Error stopping scraper:', error);
    addLog('ERROR: HALT_FAILED', 'error');
  }
}

/**
 * Download CSV
 */
async function downloadCSV() {
  addLog('GENERATING_CSV_EXPORT...', 'info');
  
  try {
    const response = await chrome.runtime.sendMessage({ action: 'GENERATE_CSV' });
    
    if (response.success) {
      addLog(`EXPORT_COMPLETE: ${response.count}_LISTINGS`, 'success');
    } else {
      addLog(response.error || 'EXPORT_FAILED', 'error');
    }
  } catch (error) {
    console.error('Error downloading CSV:', error);
    addLog('ERROR: CSV_GENERATION_FAILED', 'error');
  }
}

/**
 * Export and clear data
 */
async function exportAndClear() {
  addLog('EXPORT_+_PURGE_INITIATED...', 'info');
  
  try {
    const response = await chrome.runtime.sendMessage({ action: 'GENERATE_CSV' });
    
    if (response.success) {
      addLog(`EXPORT_COMPLETE: ${response.count}_LISTINGS`, 'success');
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await chrome.storage.local.set({
        listings: [],
        pagesScraped: 0
      });
      
      elements.listingsCount.textContent = '0';
      elements.pagesCount.textContent = '0';
      await updateStorageUsage();
      
      addLog('DATA_PURGED // READY_FOR_NEW_SCRAPE', 'success');
    } else {
      addLog(response.error || 'EXPORT_FAILED', 'error');
    }
  } catch (error) {
    console.error('Error in export and clear:', error);
    addLog('ERROR: EXPORT_PURGE_FAILED', 'error');
  }
}

/**
 * Clear all scraped data (without exporting)
 */
async function clearData() {
  if (!confirm('CONFIRM: PURGE_ALL_DATA? THIS_CANNOT_BE_UNDONE.')) {
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
    
    addLog('ALL_DATA_PURGED', 'success');
  } catch (error) {
    console.error('Error clearing data:', error);
    addLog('ERROR: PURGE_FAILED', 'error');
  }
}

/**
 * Open settings modal
 */
function openSettingsModal() {
  elements.settingsModal.classList.remove('hidden');
}

/**
 * Close settings modal
 */
function closeSettingsModal() {
  elements.settingsModal.classList.add('hidden');
}

/**
 * Listen for messages from content script
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'UPDATE_COUNT':
      elements.listingsCount.textContent = message.count.toLocaleString();
      if (message.newListings > 0) {
        addLog(`CAPTURED_${message.newListings}_NEW_LISTINGS`, 'success');
      }
      break;
      
    case 'UPDATE_PAGES':
      elements.pagesCount.textContent = message.pages;
      addLog(`PAGE_${message.pages}_LOADED`, 'info');
      break;
      
    case 'SCRAPING_COMPLETE':
      setStatus('done');
      updateButtons(false);
      addLog(`SCRAPE_COMPLETE: TOTAL_${message.total}_LISTINGS`, 'success');
      break;
      
    case 'SCRAPING_ERROR':
      setStatus('stopped');
      updateButtons(false);
      addLog(`ERROR: ${message.error}`, 'error');
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
      elements.listingsCount.textContent = (changes.listings.newValue?.length || 0).toLocaleString();
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

// Scrape details toggle
elements.scrapeDetailsToggle.addEventListener('click', async () => {
  scrapeDetailsEnabled = toggleCheckbox(elements.scrapeDetailsToggle);
  await chrome.storage.local.set({ scrapeDetails: scrapeDetailsEnabled });
  addLog(`FETCH_COORDS: ${scrapeDetailsEnabled ? 'ENABLED' : 'DISABLED'}`, 'info');
});

// Delay selector
elements.delaySelector.querySelectorAll('.delay-option').forEach(opt => {
  opt.addEventListener('click', async () => {
    currentDelay = parseFloat(opt.dataset.delay);
    updateDelaySelector(currentDelay);
    await chrome.storage.local.set({ pageDelay: currentDelay });
    addLog(`PAGE_DELAY_SET: ${currentDelay}S`, 'info');
  });
});

// Settings modal
elements.settingsBtn.addEventListener('click', (e) => {
  e.preventDefault();
  openSettingsModal();
});

elements.configLocationsBtn.addEventListener('click', openSettingsModal);

elements.closeModalBtn.addEventListener('click', closeSettingsModal);

elements.settingsModal.addEventListener('click', (e) => {
  if (e.target === elements.settingsModal) {
    closeSettingsModal();
  }
});

// Filter locations toggle
elements.filterLocationsToggle.addEventListener('click', async () => {
  filterLocationsEnabled = toggleCheckbox(elements.filterLocationsToggle);
  await chrome.storage.local.set({ filterLocations: filterLocationsEnabled });
  addLog(`LOCATION_FILTER: ${filterLocationsEnabled ? 'ENABLED' : 'DISABLED'}`, 'info');
});

// Add location
elements.addLocationBtn.addEventListener('click', async () => {
  const value = elements.newLocationInput.value;
  if (value.trim()) {
    await addLocation(value);
    elements.newLocationInput.value = '';
  }
});

elements.newLocationInput.addEventListener('keypress', async (e) => {
  if (e.key === 'Enter') {
    const value = elements.newLocationInput.value;
    if (value.trim()) {
      await addLocation(value);
      elements.newLocationInput.value = '';
    }
  }
});

// Reset locations
elements.resetLocationsBtn.addEventListener('click', resetLocations);

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  addLog('INITIALIZING_SYSTEM...', 'success');
  await detectCurrentSite();
  await loadState();
  addLog('SYSTEM_READY', 'success');
});

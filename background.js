/**
 * background.js - Service Worker for Land Scraper Extension
 * Handles data aggregation, state management, and CSV generation
 */

// ============================================
// STORAGE MANAGEMENT
// ============================================

const STORAGE_LIMIT = 10 * 1024 * 1024; // 10MB limit for chrome.storage.local

/**
 * Calculate current storage usage
 */
async function getStorageUsage() {
  try {
    const data = await chrome.storage.local.get(null);
    const jsonString = JSON.stringify(data);
    // Calculate byte size without using Blob (not available in service workers)
    const usedBytes = new TextEncoder().encode(jsonString).length;
    const percent = (usedBytes / STORAGE_LIMIT) * 100;
    
    return {
      usedBytes,
      totalBytes: STORAGE_LIMIT,
      percent,
      remainingBytes: STORAGE_LIMIT - usedBytes
    };
  } catch (error) {
    console.error('Error calculating storage usage:', error);
    return {
      usedBytes: 0,
      totalBytes: STORAGE_LIMIT,
      percent: 0,
      remainingBytes: STORAGE_LIMIT
    };
  }
}

// ============================================
// CSV GENERATION
// ============================================

/**
 * Escape a value for CSV
 * Handles quotes, commas, and newlines
 */
function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  
  const str = String(value);
  
  // If contains comma, quote, or newline, wrap in quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  
  return str;
}

/**
 * Generate CSV content from listings
 * Format optimized for QGIS import
 */
function generateCSV(listings) {
  // CSV Headers - QGIS friendly column names
  const headers = [
    'id',
    'title',
    'address',
    'municipal_council',
    'price_total',
    'price_per_perch',
    'price_raw',
    'size_perches',
    'latitude',
    'longitude',
    'source',
    'url',
    'posted_date',
    'scraped_date'
  ];

  // Build rows
  const rows = listings.map((listing, index) => {
    return [
      index + 1,
      escapeCSV(listing.title),
      escapeCSV(listing.address),
      escapeCSV(listing.municipalCouncil || ''),
      listing.priceTotal || '',
      listing.pricePerPerch || '',
      escapeCSV(listing.priceRaw),
      listing.sizePerches || '',
      listing.latitude || '',
      listing.longitude || '',
      escapeCSV(listing.source),
      escapeCSV(listing.url),
      listing.postedDate || '',
      listing.scrapedAt ? listing.scrapedAt.split('T')[0] : new Date().toISOString().split('T')[0]
    ].join(',');
  });

  // Combine with BOM for UTF-8 (helps Excel with special characters)
  const BOM = '\uFEFF';
  return BOM + [headers.join(','), ...rows].join('\n');
}

/**
 * Trigger file download
 * Note: Service workers don't have URL.createObjectURL, so we use data URLs
 */
async function downloadCSV(csvContent, filename) {
  try {
    // Convert to base64 data URL (service workers don't support Blob URLs)
    const base64Content = btoa(unescape(encodeURIComponent(csvContent)));
    const dataUrl = `data:text/csv;charset=utf-8;base64,${base64Content}`;
    
    // Use chrome.downloads API with data URL
    await chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: true
    });
    
    return true;
  } catch (error) {
    console.error('Download error:', error);
    throw error;
  }
}

// ============================================
// MESSAGE HANDLING
// ============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle async operations
  (async () => {
    try {
      switch (message.action) {
        case 'GENERATE_CSV': {
          // Get listings from storage
          const data = await chrome.storage.local.get(['listings']);
          const listings = data.listings || [];
          
          if (listings.length === 0) {
            sendResponse({ 
              success: false, 
              error: 'No listings to export. Start scraping first.' 
            });
            return;
          }
          
          // Generate CSV
          const csvContent = generateCSV(listings);
          
          // Create filename with timestamp
          const date = new Date().toISOString().split('T')[0];
          const filename = `sri_lanka_land_data_${date}.csv`;
          
          // Download
          await downloadCSV(csvContent, filename);
          
          sendResponse({ 
            success: true, 
            count: listings.length 
          });
          break;
        }
        
        case 'GET_LISTINGS': {
          const data = await chrome.storage.local.get(['listings', 'pagesScraped']);
          sendResponse({
            listings: data.listings || [],
            pagesScraped: data.pagesScraped || 0
          });
          break;
        }
        
        case 'GET_STORAGE_USAGE': {
          const usage = await getStorageUsage();
          sendResponse({
            success: true,
            usedBytes: usage.usedBytes,
            totalBytes: usage.totalBytes,
            percent: usage.percent,
            remainingBytes: usage.remainingBytes
          });
          break;
        }
        
        case 'CLEAR_DATA': {
          await chrome.storage.local.set({
            listings: [],
            pagesScraped: 0,
            isScraping: false
          });
          sendResponse({ success: true });
          break;
        }
        
        // Forward messages from content script to popup
        case 'UPDATE_COUNT':
        case 'UPDATE_PAGES':
        case 'SCRAPING_COMPLETE':
        case 'SCRAPING_ERROR':
        case 'LOG':
          // Broadcast to all extension pages (popup)
          try {
            const views = chrome.extension?.getViews?.({ type: 'popup' }) || [];
            for (const view of views) {
              view.postMessage(message, '*');
            }
          } catch (e) {
            // Popup might be closed, that's OK
          }
          
          // Also try runtime message (popup listens)
          chrome.runtime.sendMessage(message).catch(() => {});
          break;
      }
    } catch (error) {
      console.error('Background script error:', error);
      sendResponse({ 
        success: false, 
        error: error.message 
      });
    }
  })();
  
  // Return true to indicate async response
  return true;
});

// ============================================
// INSTALLATION & UPDATES
// ============================================

chrome.runtime.onInstalled.addListener((details) => {
  console.log('Land Scraper installed:', details.reason);
  
  // Initialize storage with defaults
  chrome.storage.local.get(['listings', 'pagesScraped'], (data) => {
    if (!data.listings) {
      chrome.storage.local.set({
        listings: [],
        pagesScraped: 0,
        isScraping: false,
        filterLocations: true
      });
    }
  });
  
  // Show welcome message on first install
  if (details.reason === 'install') {
    console.log('🏠 Sri Lanka Land Scraper Extension installed successfully!');
    console.log('Navigate to ikman.lk or lankapropertyweb.com to start scraping.');
  }
});

// ============================================
// CONTEXT MENU (OPTIONAL)
// ============================================

// Create context menu for quick actions
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'scrape-page',
    title: 'Scrape this page for land listings',
    contexts: ['page'],
    documentUrlPatterns: [
      '*://ikman.lk/*',
      '*://www.ikman.lk/*',
      '*://lankapropertyweb.com/*',
      '*://www.lankapropertyweb.com/*'
    ]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'scrape-page') {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        action: 'START_SCRAPING',
        filterLocations: true
      });
    } catch (error) {
      console.error('Could not start scraping:', error);
    }
  }
});

// ============================================
// KEEP-ALIVE FOR MV3 SERVICE WORKER
// ============================================

// Service workers can be terminated after 30 seconds of inactivity
// This alarm keeps critical state operations alive during scraping

chrome.alarms.create('keepAlive', { periodInMinutes: 0.5 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'keepAlive') {
    // Check if scraping is in progress
    const data = await chrome.storage.local.get(['isScraping']);
    if (data.isScraping) {
      console.log('Scraping in progress, keeping service worker alive');
    }
  }
});

console.log('🏠 Land Scraper background service worker initialized');

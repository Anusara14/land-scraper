/**
 * content.js - Land Scraper Content Script
 * Runs on ikman.lk and lankapropertyweb.com to extract land listing data
 */

(function() {
  'use strict';

  // ============================================
  // CONFIGURATION
  // ============================================

  // Default target locations (can be customized by user)
  const DEFAULT_LOCATIONS = [
    // Kaduwela MC
    'battaramulla', 'pelawatta', 'thalawathugoda', 'malabe', 
    'athurugiriya', 'kaduwela', 'ranala', 'hewagama', 'hokandara',
    // Kotte MC
    'rajagiriya', 'ethul kotte', 'etul kotte', 'pita kotte', 
    'nawala', 'nugegoda', 'pagoda', 'gangodawila', 'welikada',
    // Colombo MC
    'mattakkuliya', 'modara', 'borella', 'cinnamon gardens',
    'havelock town', 'wellawatta', 'wellawatte', 'pamankada', 'kirulapona',
    'colombo 01', 'colombo 02', 'colombo 03', 'colombo 04', 'colombo 05',
    'colombo 06', 'colombo 07', 'colombo 08', 'colombo 09', 'colombo 10',
    'colombo 1', 'colombo 2', 'colombo 3', 'colombo 4', 'colombo 5',
    'colombo 6', 'colombo 7', 'colombo 8', 'colombo 9'
  ];

  // Custom locations array (updated dynamically from popup)
  let customLocations = [...DEFAULT_LOCATIONS];

  // Default scraping delay between pages (ms) - can be overridden by user
  const DEFAULT_PAGE_DELAY = 2500;

  // ============================================
  // STATE
  // ============================================

  let isRunning = false;
  let filterLocations = true;
  let scrapeDetails = false;  // Whether to visit detail pages for coordinates
  let pageDelay = DEFAULT_PAGE_DELAY;  // Configurable delay
  let visitedPages = new Set();  // Track visited page URLs to prevent loops

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================

  /**
   * Detect which website we're on
   */
  function detectSite() {
    const hostname = window.location.hostname;
    if (hostname.includes('ikman.lk')) return 'ikman';
    if (hostname.includes('lankapropertyweb.com')) return 'lpw';
    return null;
  }

  /**
   * Check if a location string matches target areas
   */
  function matchesTargetLocation(locationText) {
    if (!locationText) return false;
    const lowerText = locationText.toLowerCase();
    return customLocations.some(loc => lowerText.includes(loc.toLowerCase()));
  }

  /**
   * Identify which Municipal Council an area belongs to using the GND mapping
   */
  function getMunicipalCouncil(locationText) {
    if (!locationText) return 'Unknown';
    const lowerText = locationText.toLowerCase().trim();
    
    // Split by comma, hyphen, or other separators and try each part
    const parts = lowerText.split(/[,\-\/\|>→]/).map(p => p.trim()).filter(p => p.length > 0);
    
    // Check if GND_MC_MAPPING is available (loaded from gnd_mapping.js)
    if (typeof GND_MC_MAPPING !== 'undefined') {
      // Try each part from most specific (first) to least specific
      for (const part of parts) {
        // Try exact match first
        if (GND_MC_MAPPING[part]) {
          return GND_MC_MAPPING[part];
        }
      }
      
      // Try to find a matching GND within any part
      for (const part of parts) {
        for (const [gnd, mc] of Object.entries(GND_MC_MAPPING)) {
          if (part.includes(gnd) || gnd.includes(part)) {
            return mc;
          }
        }
      }
      
      // Try the full text as fallback
      for (const [gnd, mc] of Object.entries(GND_MC_MAPPING)) {
        if (lowerText.includes(gnd)) {
          return mc;
        }
      }
    }
    
    // Fallback to basic pattern matching if no mapping match found
    const kaduwelaAreas = ['battaramulla', 'pelawatta', 'thalawathugoda', 'malabe', 
      'athurugiriya', 'kaduwela', 'ranala', 'hewagama', 'hokandara'];
    if (kaduwelaAreas.some(loc => lowerText.includes(loc))) {
      return 'Kaduwela MC';
    }
    
    const kotteAreas = ['rajagiriya', 'ethul kotte', 'etul kotte', 'pita kotte', 
      'nawala', 'nugegoda', 'pagoda', 'gangodawila', 'welikada'];
    if (kotteAreas.some(loc => lowerText.includes(loc))) {
      return 'Sri Jayawardenepura Kotte MC';
    }
    
    const colomboAreas = ['mattakkuliya', 'modara', 'borella', 'cinnamon gardens',
      'havelock town', 'wellawatta', 'wellawatte', 'pamankada', 'kirulapona', 'colombo'];
    if (colomboAreas.some(loc => lowerText.includes(loc))) {
      return 'Colombo MC';
    }
    
    return 'Other';
  }

  /**
   * Parse price string to number
   * Handles formats like: "Rs 2,500,000", "Rs. 38M", "Rs 25 Lakhs"
   */
  function parsePrice(priceText) {
    if (!priceText) return null;
    
    // Remove currency symbols and extra spaces
    let cleaned = priceText.replace(/Rs\.?|LKR|,|\s/gi, '').trim();
    
    // Handle millions (M)
    if (/(\d+\.?\d*)M/i.test(cleaned)) {
      const match = cleaned.match(/(\d+\.?\d*)M/i);
      return Math.round(parseFloat(match[1]) * 1000000);
    }
    
    // Handle lakhs
    if (/(\d+\.?\d*)\s*lakhs?/i.test(priceText)) {
      const match = priceText.match(/(\d+\.?\d*)\s*lakhs?/i);
      return Math.round(parseFloat(match[1]) * 100000);
    }
    
    // Handle crores
    if (/(\d+\.?\d*)\s*crore/i.test(priceText)) {
      const match = priceText.match(/(\d+\.?\d*)\s*crore/i);
      return Math.round(parseFloat(match[1]) * 10000000);
    }
    
    // Parse regular number
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : Math.round(num);
  }

  /**
   * Parse land size to perches
   * Handles formats like: "10 perches", "0.5 acres", "20 P"
   */
  function parseSize(sizeText) {
    if (!sizeText) return null;
    
    const lowerText = sizeText.toLowerCase();
    
    // Match perches (various formats)
    const perchMatch = lowerText.match(/(\d+\.?\d*)\s*(?:perch|perches|p\b)/i);
    if (perchMatch) {
      return parseFloat(perchMatch[1]);
    }
    
    // Match acres and convert (1 acre = 160 perches)
    const acreMatch = lowerText.match(/(\d+\.?\d*)\s*(?:acre|acres|ac)/i);
    if (acreMatch) {
      return parseFloat(acreMatch[1]) * 160;
    }
    
    // Match roods (1 rood = 40 perches)
    const roodMatch = lowerText.match(/(\d+\.?\d*)\s*(?:rood|roods|r\b)/i);
    if (roodMatch) {
      return parseFloat(roodMatch[1]) * 40;
    }
    
    return null;
  }

  /**
   * Calculate price per perch
   * Logic: If price > 5,000,000 and size < 50 perches, assume total price
   */
  function calculatePricePerPerch(price, size, isPricePerPerch = false) {
    if (!price || !size || size <= 0) return null;
    
    // If explicitly marked as per perch, return as is
    if (isPricePerPerch) return price;
    
    // Heuristic: If price > 5M and size < 50 perches, it's likely total price
    if (price > 5000000 && size < 50) {
      return Math.round(price / size);
    }
    
    // If price seems too low for total (< 500k for any size), assume it's per perch
    if (price < 500000) {
      return price;
    }
    
    // Default: assume it's total price if reasonably large
    if (price > 1000000) {
      return Math.round(price / size);
    }
    
    return price;
  }

  /**
   * Extract coordinates from Google Maps URL
   */
  function extractCoordsFromGoogleMaps(url) {
    if (!url) return { lat: null, lng: null };
    
    // Pattern: /place/LAT,LNG or @LAT,LNG
    const patterns = [
      /place\/(-?\d+\.?\d*),(-?\d+\.?\d*)/,
      /@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
      /q=(-?\d+\.?\d*),(-?\d+\.?\d*)/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return {
          lat: parseFloat(match[1]),
          lng: parseFloat(match[2])
        };
      }
    }
    
    return { lat: null, lng: null };
  }

  /**
   * Search page for embedded coordinates in scripts
   */
  function findEmbeddedCoordinates() {
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      const text = script.textContent || '';
      
      // Look for lat/lng patterns
      const latMatch = text.match(/["']?lat(?:itude)?["']?\s*[:=]\s*["']?(-?\d+\.?\d*)/i);
      const lngMatch = text.match(/["']?(?:lng|lon|longitude)["']?\s*[:=]\s*["']?(-?\d+\.?\d*)/i);
      
      if (latMatch && lngMatch) {
        const lat = parseFloat(latMatch[1]);
        const lng = parseFloat(lngMatch[1]);
        
        // Validate Sri Lanka bounds
        if (lat >= 5.9 && lat <= 9.9 && lng >= 79.5 && lng <= 81.9) {
          return { lat, lng };
        }
      }
    }
    return { lat: null, lng: null };
  }

  /**
   * Fetch detail page and extract coordinates
   * Uses fetch to get the page HTML without navigating
   */
  /**
   * Fetch detailed info from listing page (coordinates, posted date, full address)
   */
  async function fetchDetailPageInfo(url, site = 'ikman') {
    try {
      const response = await fetch(url, {
        credentials: 'same-origin',
        headers: {
          'Accept': 'text/html'
        }
      });
      
      if (!response.ok) {
        console.warn(`Failed to fetch detail page: ${response.status}`);
        return { lat: null, lng: null, postedDate: null, address: null };
      }
      
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      let result = { lat: null, lng: null, postedDate: null, address: null };
      
      // ---- EXTRACT POSTED DATE (ikman.lk specific) ----
      if (site === 'ikman') {
        // ikman.lk shows posted date in various formats
        // Try to find the element with posted/date info
        const allText = doc.body?.textContent || '';
        
        // Look for "Posted on" or date patterns in the page
        // ikman format: "Posted on 15 Feb 2026" or "2 days ago"
        const postedPatterns = [
          /posted\s*(?:on)?\s*[:.]?\s*(\d{1,2}\s+\w{3,}\s+\d{4})/i,
          /posted\s*(?:on)?\s*[:.]?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
          /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4})/i
        ];
        
        for (const pattern of postedPatterns) {
          const match = allText.match(pattern);
          if (match) {
            result.postedDate = parsePostedDate(match[1]);
            if (result.postedDate) {
              console.log('[LandScraper] Found posted date:', result.postedDate);
              break;
            }
          }
        }
        
        // Look for relative dates like "3 days ago", "1 week ago"
        if (!result.postedDate) {
          const relativeMatch = allText.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago/i);
          if (relativeMatch) {
            result.postedDate = calculateRelativeDate(parseInt(relativeMatch[1]), relativeMatch[2].toLowerCase());
            console.log('[LandScraper] Found relative date:', result.postedDate);
          }
        }
        
        // Try "yesterday" or "today"
        if (!result.postedDate) {
          if (/\byesterday\b/i.test(allText)) {
            result.postedDate = calculateRelativeDate(1, 'day');
          } else if (/\btoday\b/i.test(allText)) {
            result.postedDate = new Date().toISOString().split('T')[0];
          }
        }
        
        // ---- EXTRACT ADDRESS/LOCATION (ikman.lk) ----
        // ikman.lk shows location in breadcrumb or dedicated location section
        // Usually: Colombo > Athurugiriya or "Location: Athurugiriya, Colombo"
        
        // Try breadcrumb first - most reliable
        const breadcrumbLinks = doc.querySelectorAll('[class*="breadcrumb"] a, nav[class*="breadcrumb"] a, ol[class*="breadcrumb"] a');
        const locationParts = [];
        for (const link of breadcrumbLinks) {
          const text = link.textContent.trim();
          // Skip generic breadcrumb items
          if (text && 
              !['home', 'ikman', 'all ads', 'land', 'property', 'properties', 'for sale'].some(skip => text.toLowerCase() === skip) &&
              text.length > 1 && text.length < 50) {
            locationParts.push(text);
          }
        }
        
        if (locationParts.length > 0) {
          // Reverse to get most specific first (area, then district)
          result.address = locationParts.reverse().join(', ');
          console.log('[LandScraper] Found address from breadcrumb:', result.address);
        }
        
        // Try dedicated location element
        if (!result.address) {
          const locSelectors = [
            '[class*="location"]:not([class*="icon"])',
            '[data-testid*="location"]',
            'span:contains("Location")',
            'div:contains("Location")'
          ];
          
          for (const selector of locSelectors) {
            try {
              const els = doc.querySelectorAll(selector);
              for (const el of els) {
                const text = el.textContent.trim();
                // Look for Sri Lankan place names
                if (text && text.length > 3 && text.length < 100 &&
                    !text.toLowerCase().includes('chat') &&
                    !text.toLowerCase().includes('login') &&
                    !text.toLowerCase().includes('post your')) {
                  // Extract just the location part if prefixed
                  const locMatch = text.match(/(?:location|area|district)\s*[:.]?\s*(.+)/i);
                  result.address = locMatch ? locMatch[1].trim() : text;
                  console.log('[LandScraper] Found address from element:', result.address);
                  break;
                }
              }
              if (result.address) break;
            } catch (e) {}
          }
        }
      }
      
      // ---- EXTRACT COORDINATES ----
      // Try to find Google Maps link
      const mapLink = doc.querySelector('a[href*="google.com/maps"], a[href*="maps.google"]');
      if (mapLink) {
        const coords = extractCoordsFromGoogleMaps(mapLink.href);
        if (coords.lat && coords.lng) {
          result.lat = coords.lat;
          result.lng = coords.lng;
        }
      }
      
      // Try to find coordinates in iframe src
      if (!result.lat) {
        const mapIframe = doc.querySelector('iframe[src*="google.com/maps"], iframe[src*="maps.google"]');
        if (mapIframe) {
          const coords = extractCoordsFromGoogleMaps(mapIframe.src);
          if (coords.lat && coords.lng) {
            result.lat = coords.lat;
            result.lng = coords.lng;
          }
        }
      }
      
      // Try to find in script tags
      if (!result.lat) {
        const scripts = doc.querySelectorAll('script');
        for (const script of scripts) {
          const text = script.textContent || '';
          
          // Look for various coordinate patterns
          const patterns = [
            /["']?lat(?:itude)?["']?\s*[:=]\s*["']?(-?\d+\.?\d*).*?["']?(?:lng|lon|longitude)["']?\s*[:=]\s*["']?(-?\d+\.?\d*)/is,
            /LatLng\s*\(\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*\)/i,
            /position:\s*{\s*lat:\s*(-?\d+\.?\d*)\s*,\s*lng:\s*(-?\d+\.?\d*)/i,
            /center:\s*{\s*lat:\s*(-?\d+\.?\d*)\s*,\s*lng:\s*(-?\d+\.?\d*)/i
          ];
          
          for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
              const lat = parseFloat(match[1]);
              const lng = parseFloat(match[2]);
              
              // Validate Sri Lanka bounds
              if (lat >= 5.9 && lat <= 9.9 && lng >= 79.5 && lng <= 81.9) {
                result.lat = lat;
                result.lng = lng;
                break;
              }
            }
          }
          if (result.lat) break;
        }
      }
      
      // Try data attributes
      if (!result.lat) {
        const mapContainer = doc.querySelector('[data-lat][data-lng], [data-latitude][data-longitude]');
        if (mapContainer) {
          const lat = parseFloat(mapContainer.dataset.lat || mapContainer.dataset.latitude);
          const lng = parseFloat(mapContainer.dataset.lng || mapContainer.dataset.longitude);
          if (lat && lng && lat >= 5.9 && lat <= 9.9 && lng >= 79.5 && lng <= 81.9) {
            result.lat = lat;
            result.lng = lng;
          }
        }
      }
      
      return result;
    } catch (error) {
      console.error('Error fetching detail page:', error);
      return { lat: null, lng: null, postedDate: null, address: null };
    }
  }

  /**
   * Parse posted date string to ISO format
   */
  function parsePostedDate(dateText) {
    if (!dateText) return null;
    
    // Try various date formats
    const formats = [
      // DD/MM/YYYY or DD-MM-YYYY
      /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
      // YYYY/MM/DD or YYYY-MM-DD  
      /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/,
      // DD Mon YYYY (e.g., "15 Jan 2024")
      /(\d{1,2})\s+(\w{3,})\s+(\d{4})/
    ];
    
    for (const format of formats) {
      const match = dateText.match(format);
      if (match) {
        try {
          // Try to create a date object
          const dateStr = match[0];
          const parsed = new Date(dateStr);
          if (!isNaN(parsed.getTime())) {
            return parsed.toISOString().split('T')[0];
          }
          
          // Handle DD/MM/YYYY format explicitly
          if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(match[0])) {
            const parts = match[0].split(/[\/\-]/);
            const day = parseInt(parts[0]);
            const month = parseInt(parts[1]) - 1;
            const year = parseInt(parts[2]);
            const date = new Date(year, month, day);
            if (!isNaN(date.getTime())) {
              return date.toISOString().split('T')[0];
            }
          }
        } catch (e) {}
      }
    }
    
    return null;
  }
  
  /**
   * Calculate date from relative time (e.g., "3 days ago")
   */
  function calculateRelativeDate(num, unit) {
    const now = new Date();
    const msPerUnit = {
      second: 1000,
      minute: 60 * 1000,
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
      year: 365 * 24 * 60 * 60 * 1000
    };
    
    if (msPerUnit[unit]) {
      const pastDate = new Date(now.getTime() - (num * msPerUnit[unit]));
      return pastDate.toISOString().split('T')[0];
    }
    return null;
  }

  /**
   * Legacy function for backward compatibility
   */
  async function fetchDetailPageCoords(url) {
    const info = await fetchDetailPageInfo(url);
    return { lat: info.lat, lng: info.lng };
  }

  /**
   * Send log message to popup
   */
  function log(text, type = '') {
    chrome.runtime.sendMessage({
      action: 'LOG',
      text,
      type
    }).catch(() => {});
  }

  /**
   * Sleep utility
   */
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================
  // IKMAN.LK SCRAPER
  // ============================================

  const IkmanScraper = {
    /**
     * Check if we're on a land listings page
     */
    isListingsPage() {
      return window.location.pathname.includes('/ads/') && 
             (window.location.pathname.includes('land') || 
              window.location.search.includes('land'));
    },

    /**
     * Get all listing cards on the current page
     */
    getListingCards() {
      // Simple approach: find all ad links and deduplicate
      // The saveListings function already handles URL deduplication across pages
      
      const selectors = [
        'li:has(a[href*="/ad/"])',
        'a[href*="/ad/"]'
      ];
      
      let cards = [];
      
      for (const selector of selectors) {
        try {
          const found = document.querySelectorAll(selector);
          if (found.length > 0) {
            // Deduplicate by URL within the page
            const seenUrls = new Set();
            const uniqueCards = [];
            
            for (const el of found) {
              const link = el.tagName === 'A' ? el : el.querySelector('a[href*="/ad/"]');
              const url = link?.href;
              if (url && !seenUrls.has(url)) {
                seenUrls.add(url);
                uniqueCards.push(el);
              }
            }
            
            if (uniqueCards.length > 0) {
              cards = uniqueCards;
              console.log(`[LandScraper] Found ${cards.length} unique listings using: ${selector}`);
              break;
            }
          }
        } catch (e) {
          console.log(`[LandScraper] Selector failed: ${selector}`, e);
        }
      }
      
      console.log(`[LandScraper] Total cards found: ${cards.length}`);
      return cards;
    },

    /**
     * Extract data from a single listing card
     */
    extractFromCard(card) {
      try {
        // Find the link to the listing
        const link = card.querySelector('a[href*="/ad/"]') || card;
        const url = link.href || link.getAttribute('href');
        if (!url || !url.includes('/ad/')) {
          console.log('[LandScraper] Card skipped - no ad URL found');
          return null;
        }

        // Title - try multiple selectors
        const titleEl = card.querySelector('h2, h3, [class*="title"], [class*="heading"]');
        const title = titleEl?.textContent?.trim() || '';
        
        console.log(`[LandScraper] Extracting: ${title.substring(0, 50)} | URL: ${url}`);

        // Location/Address - ikman.lk specific selectors
        // Look for the location which usually contains area names like "Athurugiriya, Colombo"
        let location = '';
        
        // Try specific ikman.lk location selectors
        const locationSelectors = [
          '[class*="location"] span:not([class*="icon"])',
          '[class*="location"]:not(:has(svg)):not(:has(button))',
          '[data-testid*="location"]',
          'span[class*="subtitle"]:not(:has(button))',
          // Look for text with Sri Lankan location patterns
        ];
        
        for (const selector of locationSelectors) {
          try {
            const el = card.querySelector(selector);
            if (el) {
              const text = el.textContent.trim();
              // Filter out navigation/UI text
              if (text && 
                  !text.toLowerCase().includes('chat') && 
                  !text.toLowerCase().includes('login') && 
                  !text.toLowerCase().includes('post') &&
                  !text.toLowerCase().includes('search') &&
                  text.length > 2 && text.length < 100) {
                location = text;
                break;
              }
            }
          } catch (e) {}
        }
        
        // Fallback: Extract location from URL or title
        if (!location) {
          // URL often contains location like: /ad/athurugiriya-land
          const urlMatch = url.match(/\/ad\/([a-z\-]+)/i);
          if (urlMatch) {
            const urlLocation = urlMatch[1].replace(/-/g, ' ').replace(/land|sale|for|property/gi, '').trim();
            if (urlLocation.length > 2) {
              location = urlLocation;
            }
          }
        }
        
        // Try to extract location from title (often contains area names)
        if (!location && title) {
          const titleMatch = title.match(/(?:in|at)\s+([A-Za-z\s]+?)(?:\s*[-,]|\s+for|\s+land|$)/i);
          if (titleMatch) {
            location = titleMatch[1].trim();
          }
        }

        // Price
        const priceEl = card.querySelector('[class*="price"], [class*="amount"]');
        const priceText = priceEl?.textContent?.trim() || '';
        const price = parsePrice(priceText);
        
        // Check if price is per perch
        const isPricePerPerch = /per\s*perch/i.test(priceText);

        // Size - often in title or description
        const fullText = card.textContent || '';
        const size = parseSize(fullText);

        // Calculate price per perch
        const pricePerPerch = calculatePricePerPerch(price, size, isPricePerPerch);

        return {
          title,
          address: location,
          priceRaw: priceText,
          priceTotal: isPricePerPerch && size ? price * size : price,
          pricePerPerch,
          sizePerches: size,
          url: url.startsWith('http') ? url : `https://ikman.lk${url}`,
          latitude: null,
          longitude: null,
          postedDate: null,
          source: 'ikman.lk',
          municipalCouncil: getMunicipalCouncil(location || title),
          scrapedAt: new Date().toISOString()
        };
      } catch (error) {
        console.error('Error extracting from card:', error);
        return null;
      }
    },

    /**
     * Find and click the next page button
     */
    getNextPageUrl() {
      // Get current page number from URL
      const currentUrl = new URL(window.location.href);
      let currentPage = 1;
      
      // ikman.lk uses ?page=N format
      if (currentUrl.searchParams.has('page')) {
        currentPage = parseInt(currentUrl.searchParams.get('page')) || 1;
      }
      
      console.log('[LandScraper] Current page detected:', currentPage, 'URL:', window.location.href);
      
      // Method 1: Look for explicit "next" links in pagination
      const paginationSelectors = [
        'a[data-testid="pagination-next"]',
        'a[aria-label="Next"]',
        'a[rel="next"]',
        '.pagination a.next',
        '[class*="pagination"] a[href*="page="]:last-of-type'
      ];

      for (const selector of paginationSelectors) {
        try {
          const nextBtn = document.querySelector(selector);
          if (nextBtn && nextBtn.href) {
            const nextUrl = new URL(nextBtn.href, window.location.origin);
            const nextPage = parseInt(nextUrl.searchParams.get('page') || '0');
            
            // Only use if it's actually the next page
            if (nextPage === currentPage + 1) {
              console.log('[LandScraper] Found next via selector:', selector, '-> page', nextPage);
              return nextBtn.href;
            }
          }
        } catch (e) {
          // Selector might be invalid
        }
      }

      // Method 2: Find all page links and pick the one for currentPage + 1
      const allPageLinks = document.querySelectorAll('a[href*="page="]');
      for (const link of allPageLinks) {
        try {
          const linkUrl = new URL(link.href, window.location.origin);
          const linkPage = parseInt(linkUrl.searchParams.get('page') || '0');
          if (linkPage === currentPage + 1) {
            console.log('[LandScraper] Found next page link:', link.href, '-> page', linkPage);
            return link.href;
          }
        } catch (e) {
          // Invalid URL
        }
      }

      // Method 3: Construct URL manually (only if page links exist on the page)
      // Check if there's any pagination at all
      const hasPagination = allPageLinks.length > 0 || document.querySelector('[class*="pagination"]');
      
      if (hasPagination) {
        const nextPage = currentPage + 1;
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set('page', nextPage.toString());
        
        // Make sure we're not creating an infinite loop
        const nextUrlStr = nextUrl.toString();
        if (nextUrlStr !== window.location.href) {
          console.log('[LandScraper] Constructed next page URL:', nextUrlStr);
          return nextUrlStr;
        }
      }
      
      console.log('[LandScraper] No next page found');
      return null;
    },

    /**
     * Check if there are more pages
     */
    hasNextPage() {
      // Check for disabled/hidden next button
      const nextBtn = document.querySelector('a[aria-label="Next"], [class*="next"], a[data-testid="pagination-next"]');
      if (nextBtn) {
        // Check if button is disabled
        if (nextBtn.classList.contains('disabled') || nextBtn.hasAttribute('disabled')) {
          return false;
        }
        return true;
      }
      
      // Check if there are listings on the page
      const cards = this.getListingCards();
      return cards.length > 0;
    }
  };

  // ============================================
  // LANKAPROPERTYWEB.COM SCRAPER
  // ============================================

  const LPWScraper = {
    /**
     * Check if we're on a land listings page
     */
    isListingsPage() {
      return window.location.pathname.includes('land') || 
             window.location.pathname.includes('property');
    },

    /**
     * Get all listing cards on the current page
     */
    getListingCards() {
      // LankaPropertyWeb listing selectors
      const selectors = [
        '.property-item',
        '.listing-item',
        '[class*="property-card"]',
        '.search-results li',
        'div[class*="listing"]'
      ];

      for (const selector of selectors) {
        const cards = document.querySelectorAll(selector);
        if (cards.length > 0) {
          return Array.from(cards);
        }
      }

      // Fallback: find rows with property links
      const rows = document.querySelectorAll('tr, .row, article');
      return Array.from(rows).filter(row => 
        row.querySelector('a[href*="property_details"]') ||
        row.querySelector('a[href*="land/"]')
      );
    },

    /**
     * Extract data from a single listing card
     */
    extractFromCard(card) {
      try {
        // Find the link to the listing
        const link = card.querySelector('a[href*="property_details"], a[href*="/land/"]');
        if (!link) return null;
        
        const url = link.href;

        // Title
        const titleEl = card.querySelector('h2, h3, h4, .title, [class*="title"]') || link;
        const title = titleEl?.textContent?.trim() || '';

        // Location/Address
        const locationEl = card.querySelector('[class*="location"], [class*="address"], .area');
        const location = locationEl?.textContent?.trim() || '';

        // Price
        const priceEl = card.querySelector('[class*="price"], .amount');
        const priceText = priceEl?.textContent?.trim() || '';
        const price = parsePrice(priceText);
        
        // Check if price is per perch
        const isPricePerPerch = /per\s*perch/i.test(priceText);

        // Size
        const sizeEl = card.querySelector('[class*="size"], [class*="area"], [class*="perch"]');
        const sizeText = sizeEl?.textContent || card.textContent || '';
        const size = parseSize(sizeText);

        // Try to find coordinates from Google Maps link
        const mapLink = card.querySelector('a[href*="google.com/maps"]');
        let coords = { lat: null, lng: null };
        if (mapLink) {
          coords = extractCoordsFromGoogleMaps(mapLink.href);
        }

        // Calculate price per perch
        const pricePerPerch = calculatePricePerPerch(price, size, isPricePerPerch);

        return {
          title,
          address: location,
          priceRaw: priceText,
          priceTotal: isPricePerPerch && size ? price * size : price,
          pricePerPerch,
          sizePerches: size,
          url: url.startsWith('http') ? url : `https://www.lankapropertyweb.com${url}`,
          latitude: coords.lat,
          longitude: coords.lng,
          postedDate: null,
          source: 'lankapropertyweb.com',
          municipalCouncil: getMunicipalCouncil(location),
          scrapedAt: new Date().toISOString()
        };
      } catch (error) {
        console.error('Error extracting from card:', error);
        return null;
      }
    },

    /**
     * Get next page URL
     */
    getNextPageUrl() {
      // Look for pagination - try multiple selectors
      const selectors = [
        'a.next',
        'a[rel="next"]',
        '.pagination li:last-child a',
        '[class*="pagination"] a[href*="page="]'
      ];
      
      let nextLink = null;
      for (const selector of selectors) {
        try {
          nextLink = document.querySelector(selector);
          if (nextLink && nextLink.href) break;
        } catch (e) {
          // Ignore invalid selectors
        }
      }
      
      // Also check for links containing "Next" text
      if (!nextLink) {
        const allLinks = document.querySelectorAll('.pagination a, nav a, [class*="pager"] a');
        for (const link of allLinks) {
          if (link.textContent.toLowerCase().includes('next') || link.textContent.includes('»')) {
            nextLink = link;
            break;
          }
        }
      }
      
      if (nextLink && nextLink.href) {
        return nextLink.href;
      }

      // URL manipulation fallback
      const urlParams = new URLSearchParams(window.location.search);
      const currentPage = parseInt(urlParams.get('page') || '1');
      
      // Check if more listings exist
      const cards = this.getListingCards();
      if (cards.length === 0) return null;
      
      urlParams.set('page', currentPage + 1);
      return `${window.location.pathname}?${urlParams.toString()}`;
    },

    /**
     * Check if there are more pages
     */
    hasNextPage() {
      const cards = this.getListingCards();
      return cards.length > 0;
    }
  };

  // ============================================
  // MAIN SCRAPING LOGIC
  // ============================================

  /**
   * Get the appropriate scraper for current site
   */
  function getScraper() {
    const site = detectSite();
    if (site === 'ikman') return IkmanScraper;
    if (site === 'lpw') return LPWScraper;
    return null;
  }

  /**
   * Scrape current page and return listings
   */
  async function scrapeCurrentPage() {
    const scraper = getScraper();
    if (!scraper) {
      log('Unknown website', 'error');
      return [];
    }

    const cards = scraper.getListingCards();
    log(`Found ${cards.length} listing cards on page`, 'info');
    console.log(`[LandScraper] Page URL: ${window.location.href}`);
    console.log(`[LandScraper] Found ${cards.length} cards`);
    
    // Determine site type for detail page fetching
    const site = window.location.hostname.includes('ikman') ? 'ikman' : 'lpw';

    const listings = [];
    let skippedLocation = 0;
    let skippedNull = 0;
    
    for (const card of cards) {
      const data = scraper.extractFromCard(card);
      if (data) {
        // Apply location filter if enabled
        let shouldInclude = false;
        if (filterLocations) {
          if (matchesTargetLocation(data.address) || matchesTargetLocation(data.title)) {
            shouldInclude = true;
          } else {
            skippedLocation++;
          }
        } else {
          shouldInclude = true;
        }
        
        if (shouldInclude) {
          // Log the URL being added
          console.log(`[LandScraper] Adding: ${data.url}`);
          
          // If detail page scraping is enabled, fetch additional info
          if (scrapeDetails && data.url) {
            log(`Fetching details for: ${data.title.substring(0, 30)}...`, 'info');
            const info = await fetchDetailPageInfo(data.url, site);
            
            // Update coordinates if found
            if (info.lat && info.lng) {
              data.latitude = info.lat;
              data.longitude = info.lng;
              log(`Found coordinates: ${info.lat}, ${info.lng}`, 'success');
            }
            
            // Update posted date if found
            if (info.postedDate) {
              data.postedDate = info.postedDate;
              log(`Posted date: ${info.postedDate}`, 'info');
            }
            
            // Update address from detail page if we got better info
            if (info.address && info.address.length > 3) {
              data.address = info.address;
              // Re-determine municipal council with better address
              const newMC = getMunicipalCouncil(info.address);
              if (newMC !== 'Other' && newMC !== 'Unknown') {
                data.municipalCouncil = newMC;
                log(`Municipal Council: ${newMC}`, 'info');
              }
            }
            
            // Add small delay between detail page fetches to avoid rate limiting
            await sleep(500);
          }
          listings.push(data);
        }
      } else {
        skippedNull++;
      }
    }

    console.log(`[LandScraper] Summary: ${listings.length} added, ${skippedLocation} filtered by location, ${skippedNull} null/invalid`);
    log(`Extracted ${listings.length} matching listings`, 'success');
    if (skippedLocation > 0) {
      log(`Filtered ${skippedLocation} by location`, 'info');
    }
    return listings;
  }

  /**
   * Save listings to storage
   */
  async function saveListings(newListings) {
    try {
      const data = await chrome.storage.local.get(['listings']);
      const existing = data.listings || [];
      
      console.log(`[LandScraper] Saving: ${newListings.length} new, ${existing.length} existing`);
      
      // Deduplicate by URL
      const existingUrls = new Set(existing.map(l => l.url));
      const uniqueNew = newListings.filter(l => {
        const isDupe = existingUrls.has(l.url);
        if (isDupe) {
          console.log(`[LandScraper] Duplicate skipped: ${l.url}`);
        }
        return !isDupe;
      });
      
      console.log(`[LandScraper] Unique new listings: ${uniqueNew.length}`);
      
      const updated = [...existing, ...uniqueNew];
      await chrome.storage.local.set({ listings: updated });
      
      // Notify popup
      chrome.runtime.sendMessage({
        action: 'UPDATE_COUNT',
        count: updated.length,
        newListings: uniqueNew.length
      }).catch(() => {});
      
      return uniqueNew.length;
    } catch (error) {
      console.error('Error saving listings:', error);
      return 0;
    }
  }

  /**
   * Update pages count
   */
  async function updatePagesCount() {
    try {
      const data = await chrome.storage.local.get(['pagesScraped']);
      const pages = (data.pagesScraped || 0) + 1;
      await chrome.storage.local.set({ pagesScraped: pages });
      
      chrome.runtime.sendMessage({
        action: 'UPDATE_PAGES',
        pages
      }).catch(() => {});
      
      return pages;
    } catch (error) {
      console.error('Error updating pages count:', error);
      return 0;
    }
  }

  /**
   * Navigate to next page
   */
  async function goToNextPage() {
    const scraper = getScraper();
    if (!scraper) return false;
    
    // Mark current page as visited
    const currentNormalized = new URL(window.location.href).toString();
    visitedPages.add(currentNormalized);
    console.log('[LandScraper] Visited pages count:', visitedPages.size);

    const nextUrl = scraper.getNextPageUrl();
    console.log('[LandScraper] Next URL:', nextUrl, 'Current:', window.location.href);
    
    if (nextUrl) {
      // Normalize URLs for comparison
      const nextNormalized = new URL(nextUrl, window.location.origin).toString();
      
      // Check if we've already visited this page (prevent loop)
      if (visitedPages.has(nextNormalized)) {
        console.log('[LandScraper] Already visited this page, stopping');
        return false;
      }
      
      if (nextNormalized !== currentNormalized) {
        log(`Navigating to next page...`, 'info');
        
        // Save state before navigation (including all settings)
        await chrome.storage.local.set({ 
          isScraping: true,
          filterLocations,
          scrapeDetails,
          pageDelay: pageDelay / 1000, // Store in seconds
          visitedPages: Array.from(visitedPages)  // Save visited pages to prevent loops
        });
        
        // Navigate
        window.location.href = nextUrl;
        return true;
      } else {
        console.log('[LandScraper] Next URL same as current, no more pages');
      }
    }
    
    return false;
  }

  /**
   * Main scraping loop
   */
  async function runScraper() {
    if (!isRunning) return;

    const scraper = getScraper();
    if (!scraper) {
      log('Not on a supported website', 'error');
      isRunning = false;
      return;
    }

    try {
      // Scrape current page
      const listings = await scrapeCurrentPage();
      
      if (listings.length > 0) {
        await saveListings(listings);
      }
      
      await updatePagesCount();
      
      // Check if we should continue
      if (!isRunning) {
        log('Scraping stopped by user', 'info');
        return;
      }

      // Wait before next page
      await sleep(pageDelay);
      
      if (!isRunning) return;

      // Go to next page
      const hasNext = await goToNextPage();
      
      if (!hasNext) {
        log('No more pages to scrape', 'info');
        isRunning = false;
        await chrome.storage.local.set({ isScraping: false });
        
        const data = await chrome.storage.local.get(['listings']);
        chrome.runtime.sendMessage({
          action: 'SCRAPING_COMPLETE',
          total: data.listings?.length || 0
        }).catch(() => {});
      }
    } catch (error) {
      console.error('Scraping error:', error);
      const errorMsg = error instanceof DOMException 
        ? `DOM Error: ${error.message}` 
        : (error.message || String(error));
      log(`Error: ${errorMsg}`, 'error');
      
      chrome.runtime.sendMessage({
        action: 'SCRAPING_ERROR',
        error: errorMsg
      }).catch(() => {});
    }
  }

  /**
   * Start scraping
   */
  async function startScraping(options = {}) {
    isRunning = true;
    filterLocations = options.filterLocations !== false;
    scrapeDetails = options.scrapeDetails === true;
    pageDelay = options.pageDelay || DEFAULT_PAGE_DELAY;
    
    // Clear visited pages when starting fresh
    visitedPages = new Set();
    await chrome.storage.local.set({ visitedPages: [] });
    
    log('Scraper started', 'success');
    if (scrapeDetails) {
      log('Detail page mode: Will fetch coordinates from each listing', 'info');
    }
    await runScraper();
  }

  /**
   * Stop scraping
   */
  function stopScraping() {
    isRunning = false;
    log('Scraper stopped', 'info');
  }

  // ============================================
  // MESSAGE HANDLING
  // ============================================

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
      case 'START_SCRAPING':
        // Update custom locations if provided
        if (message.locations && Array.isArray(message.locations)) {
          customLocations = message.locations.map(l => l.toLowerCase());
          log(`Using ${customLocations.length} target locations`, 'info');
        }
        startScraping({
          filterLocations: message.filterLocations,
          scrapeDetails: message.scrapeDetails,
          pageDelay: message.pageDelay
        });
        sendResponse({ success: true });
        break;
        
      case 'STOP_SCRAPING':
        stopScraping();
        sendResponse({ success: true });
        break;
        
      case 'UPDATE_LOCATIONS':
        // Update custom locations without restarting scraper
        if (message.locations && Array.isArray(message.locations)) {
          customLocations = message.locations.map(l => l.toLowerCase());
          log(`Updated to ${customLocations.length} target locations`, 'info');
        }
        sendResponse({ success: true });
        break;
        
      case 'GET_STATUS':
        sendResponse({ 
          isRunning, 
          site: detectSite() 
        });
        break;
    }
    return true;
  });

  // ============================================
  // AUTO-RESUME ON PAGE LOAD
  // ============================================

  async function checkAndResume() {
    try {
      const data = await chrome.storage.local.get([
        'isScraping', 'filterLocations', 'scrapeDetails', 'pageDelay', 'customLocations', 'visitedPages'
      ]);
      
      // Load custom locations if available
      if (data.customLocations && Array.isArray(data.customLocations)) {
        customLocations = data.customLocations.map(l => l.toLowerCase());
      }
      
      // Load visited pages to prevent loops
      if (data.visitedPages && Array.isArray(data.visitedPages)) {
        visitedPages = new Set(data.visitedPages);
        console.log('[LandScraper] Loaded', visitedPages.size, 'visited pages from storage');
      }
      
      if (data.isScraping) {
        log('Resuming scraping...', 'info');
        filterLocations = data.filterLocations !== false;
        scrapeDetails = data.scrapeDetails === true;
        pageDelay = (data.pageDelay || 2.5) * 1000; // Convert to ms
        
        // Small delay to let page fully load
        await sleep(1500);
        
        isRunning = true;
        await runScraper();
      }
    } catch (error) {
      console.error('Error checking resume state:', error);
    }
  }

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAndResume);
  } else {
    checkAndResume();
  }

  // Log that content script is loaded
  console.log('🏠 Land Scraper content script loaded on', detectSite());

})();

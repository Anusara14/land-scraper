# Sri Lanka Land Scraper

A Chrome Extension (Manifest V3) for scraping land valuation data from Sri Lankan property websites. Built for Urban Informatics research and QGIS dataset creation.

## Features

- **Dual Site Support** - Works on ikman.lk and lankapropertyweb.com
- **Auto-Pagination** - Automatically navigates through multiple pages
- **Smart Data Extraction** - Extracts title, price, size, location, and coordinates
- **Price Per Perch Calculation** - Intelligently calculates per-perch pricing
- **Custom Location Filtering** - Add, remove, and manage target areas dynamically
- **GND to Municipal Council Mapping** - 1,253 GND entries mapped to 28 Municipal Councils
- **QGIS-Ready Export** - Exports to CSV with lat/lng columns for direct import
- **Live Progress** - Real-time counter showing scraped listings and pages
- **Storage Monitoring** - Visual progress bar with warning thresholds
- **Modern Dark UI** - Clean interface with Inter font and cyan accent theme

## Supported Municipal Councils

The extension includes official GND (Grama Niladhari Division) mappings for 28 Municipal Councils:

Akurana, Ambatenna, Delthota, Doluwa, Gampola, Gangawata Korale, Harispattuwa, Hatharaliyadda, Kaduwela, Kandy Four Gravets, Kundasale, Medadumbara, Menikhinna, Minipe, Panvila, Pasbage Korale, Pathadumbara, Pathahewaheta, Poojapitiya, Sri Jayawardenepura Kotte, Talatuoya, Thumpane, Udadumbara, Udapalatha, Udunuwara, Ududumbara, Yatinuwara, and more.

## Installation

### Step 1: Open Chrome Extensions Page
1. Open Google Chrome
2. Type `chrome://extensions` in the address bar and press Enter

### Step 2: Enable Developer Mode
1. Find the **Developer mode** toggle in the top-right corner
2. Turn it **ON**

### Step 3: Load the Extension
1. Click **Load unpacked**
2. Navigate to this folder and select it
3. Click **Select Folder**

### Step 4: Verify Installation
- You should see **Sri Lanka Land Scraper** in your extensions list
- A house icon should appear in your Chrome toolbar
- If hidden, click the puzzle icon and pin the extension

## Usage

### 1. Navigate to a Property Listing Page

**ikman.lk**
```
https://ikman.lk/en/ads/sri-lanka/land
```

**lankapropertyweb.com**
```
https://www.lankapropertyweb.com/land/
```

### 2. Open the Extension
Click the extension icon in your Chrome toolbar

### 3. Configure Settings
Expand the **Settings** panel to configure:

| Setting | Description |
|---------|-------------|
| Filter by target locations | Only scrape listings in your target areas |
| Fetch coordinates from detail pages | Visit each listing to get lat/lng (slower) |
| Page delay | Adjust delay between pages (2-5 seconds) |
| Target Locations | Add/remove custom locations to filter |

### 4. Manage Target Locations
- Click **+** to add a new location
- Click **x** on a tag to remove it
- Click **Reset to defaults** to restore original list
- Location matching is case-insensitive

### 5. Monitor Progress
- **LISTINGS** - Total scraped count
- **PAGES** - Pages processed
- **Status dot** - Idle (cyan), Scraping (yellow), Stopped (red), Done (green)
- **Storage bar** - Green (<80%), Yellow (80-90%), Red (>90%)

### 6. Control Scraping
| Button | Action |
|--------|--------|
| Start | Begin scraping from current page |
| Stop | Pause scraping |
| Download CSV | Export all data to CSV file |
| Export + Clear | Export data and clear storage |
| Clear All Data | Delete all scraped data |

## CSV Output Format

The exported CSV is QGIS-compatible with these columns:

| Column | Description |
|--------|-------------|
| id | Unique row identifier |
| title | Property listing title |
| price | Price in LKR |
| pricePerPerch | Calculated price per perch |
| size | Land size in perches |
| location | Full location string |
| municipalCouncil | Mapped MC from GND data |
| latitude | GPS latitude (if available) |
| longitude | GPS longitude (if available) |
| url | Direct link to listing |
| source | Website source (ikman/lpw) |
| scrapedAt | Timestamp of scrape |

## Project Structure

```
land-scraper/
├── manifest.json        # Extension configuration (MV3)
├── background.js        # Service worker for downloads & storage
├── content.js           # Scraping logic for both sites
├── gnd_mapping.js       # GND to Municipal Council mapping (1,253 entries)
├── popup.html           # Extension popup UI
├── popup.css            # Dark theme styles
├── popup.js             # Popup logic and event handlers
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## Technical Details

- **Manifest Version**: 3 (Chrome MV3 compliant)
- **Content Scripts**: Injected on ikman.lk and lankapropertyweb.com
- **Storage**: Uses chrome.storage.local (5MB limit)
- **Downloads**: Base64 data URLs (MV3 compatible, no Blob API)
- **Location Matching**: Case-insensitive substring matching
- **GND Mapping**: Official Sri Lanka GND to MC mapping from CSV dataset

## License

MIT License - [Anusara14](https://github.com/Anusara14)

*Built for Urban Informatics Research - February 2026*

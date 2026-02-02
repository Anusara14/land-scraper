# 🏠 Sri Lanka Land Scraper - Chrome Extension

A Chrome Extension (Manifest V3) for scraping land valuation data from Sri Lankan property websites. Built for Urban Informatics research and QGIS dataset creation.

## Features

- ✅ **Dual Site Support**: Works on ikman.lk and lankapropertyweb.com
- ✅ **Auto-Pagination**: Automatically navigates through multiple pages
- ✅ **Smart Data Extraction**: Extracts title, price, size, location, and coordinates
- ✅ **Price Per Perch Calculation**: Intelligently calculates per-perch pricing
- ✅ **Location Filtering**: Filter listings by target Municipal Council areas
- ✅ **QGIS-Ready Export**: Exports to CSV with lat/lng columns for direct import
- ✅ **Live Progress**: Real-time counter showing scraped listings and pages

## Target Municipal Council Areas

The extension can filter listings to these specific areas:

### Kaduwela Municipal Council
Battaramulla, Pelawatta, Thalawathugoda, Malabe, Athurugiriya, Kaduwela, Ranala, Hewagama, Hokandara

### Sri Jayawardenepura Kotte Municipal Council
Rajagiriya, Ethul Kotte, Pita Kotte, Nawala, Nugegoda, Pagoda, Gangodawila, Welikada

### Colombo Municipal Council
Mattakkuliya, Modara, Borella, Cinnamon Gardens, Havelock Town, Wellawatta, Pamankada, Kirulapona

---

## How to Load This Extension in Chrome

### Step 1: Open Chrome Extensions Page
1. Open Google Chrome
2. Type `chrome://extensions` in the address bar and press Enter
3. Or go to **Menu (⋮)** → **More Tools** → **Extensions**

### Step 2: Enable Developer Mode
1. Look for the **"Developer mode"** toggle in the top-right corner
2. Click it to turn it **ON** (toggle should be blue)

### Step 3: Load the Extension
1. Click the **"Load unpacked"** button that appears
2. Navigate to this folder: `E:\Projects\land-scraper`
3. Select the folder and click **"Select Folder"**

### Step 4: Verify Installation
- You should see **"Sri Lanka Land Scraper"** in your extensions list
- A house icon (🏠) should appear in your Chrome toolbar
- If you don't see the icon, click the puzzle piece icon (🧩) and pin the extension

---

## How to Use

### 1. Navigate to a Property Listing Page
Go to one of these URLs:
- **ikman.lk**: https://ikman.lk/en/ads/sri-lanka/land
- **lankapropertyweb.com**: https://www.lankapropertyweb.com/land/

### 2. Open the Extension Popup
Click the extension icon in your Chrome toolbar

### 3. Configure Settings
Expand the **⚙️ Scraping Settings** section to configure:

- **Only scrape target locations**: Filter listings by Municipal Council areas (enabled by default)
- **Visit detail pages for coordinates**: Enable to fetch lat/lng from each listing's detail page (slower but more complete data)
- **Page delay slider**: Adjust delay between pages (2-5 seconds) to avoid rate limiting

### 4. Monitor Storage
The popup shows storage usage with a progress bar:
- **Green**: Normal usage
- **Yellow**: Approaching limit (>80%)
- **Red**: Critical (>90%) - export data soon!

### 5. Start Scraping
1. Click **"▶️ Start Scraping"**
2. Watch the live counter update as listings are scraped
3. The extension will automatically navigate to the next page

### 6. Stop Scraping (Optional)
Click **"⏹️ Stop"** at any time to pause scraping

### 7. Download Your Data
- **📥 Download CSV**: Export all scraped data
- **📤 Export & Clear**: Export and then clear data to free storage (for large datasets)
- The file will be named `sri_lanka_land_data_YYYY-MM-DD.csv`

### 8. Clear Data
Click **"🗑️ Clear Data"** to reset and start fresh

---

## CSV Output Format

The exported CSV contains these columns (QGIS-compatible):

| Column | Description |
|--------|-------------|
| `id` | Unique row identifier |
| `title` | Listing title/description |
| `address` | Location/address text |
| `municipal_council` | Detected Municipal Council area |
| `price_total` | Total price in LKR |
| `price_per_perch` | Calculated price per perch |
| `price_raw` | Original price text from website |
| `size_perches` | Land size in perches |
| `latitude` | GPS latitude (if available) |
| `longitude` | GPS longitude (if available) |
| `source` | Source website |
| `url` | Link to original listing |
| `scraped_date` | Date of scraping |

---

## Importing to QGIS

### Step 1: Open QGIS
Launch QGIS Desktop

### Step 2: Add Delimited Text Layer
1. Go to **Layer** → **Add Layer** → **Add Delimited Text Layer**
2. Or press `Ctrl+Shift+T`

### Step 3: Configure Import
1. **File name**: Browse to your downloaded CSV file
2. **File format**: CSV
3. **Geometry Definition**: 
   - Select **Point coordinates**
   - X field: `longitude`
   - Y field: `latitude`
4. **Geometry CRS**: Select `EPSG:4326 - WGS 84`

### Step 4: Add Layer
Click **Add** to import the data as a point layer

---

## Price Per Perch Calculation Logic

The extension uses smart heuristics to calculate price per perch:

1. **If marked "per perch"**: Uses the stated price directly
2. **If price > 5,000,000 AND size < 50 perches**: Assumes total price, divides by size
3. **If price < 500,000**: Assumes it's already per perch
4. **Otherwise**: Assumes total price and calculates per perch

---

## File Structure

```
land-scraper/
├── manifest.json      # Extension manifest (MV3)
├── popup.html         # Popup UI
├── popup.css          # Popup styling
├── popup.js           # Popup logic
├── content.js         # Page scraping script
├── background.js      # Service worker
├── icons/
│   ├── icon16.png     # 16x16 icon
│   ├── icon48.png     # 48x48 icon
│   └── icon128.png    # 128x128 icon
├── create-icons.js    # Icon generator (optional)
└── README.md          # This file
```

---

## Troubleshooting

### "Cannot scrape on this website"
- Make sure you're on ikman.lk or lankapropertyweb.com
- Refresh the page and try again

### Extension not responding after page navigation
- The scraper should auto-resume after page load
- If not, click Start Scraping again

### No listings found
- Website structure may have changed
- Check browser console (F12) for errors
- Try refreshing the page

### Empty coordinates
- **Enable "Visit detail pages for coordinates"** in settings for better coordinate extraction
- ikman.lk may not always expose coordinates even on detail pages
- lankapropertyweb.com has better coordinate availability
- Consider manually geocoding addresses in QGIS

### Storage full warning
- Use **"📤 Export & Clear"** to export data and free up storage
- You can do multiple export sessions and combine CSVs in QGIS

---

## Notes

- **Rate Limiting**: Adjustable delay (2-5 seconds) between pages - use higher values if experiencing blocks
- **Storage Limit**: Chrome storage limit is ~10MB (~50,000+ listings). Use incremental export for large datasets.
- **Detail Page Scraping**: Slower but fetches coordinates from each listing's detail page
- **Website Changes**: If websites update their structure, selectors may need updating

---

## License

This extension is for educational and research purposes only. Please respect the terms of service of the websites being scraped.

---

*Built for Urban Informatics Research - February 2026*

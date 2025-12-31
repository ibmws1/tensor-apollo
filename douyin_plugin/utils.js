export const sleep = ms => new Promise(r => setTimeout(r, ms));

export function patchAllLimits(obj, newSize) {
    if (!obj || typeof obj !== 'object') return;
    for (let key in obj) {
        if (typeof obj[key] === 'number' && obj[key] <= 50 && (key.includes('size') || key.includes('limit') || key === 'page_size')) {
            obj[key] = newSize;
        }
        if (typeof obj[key] === 'object') patchAllLimits(obj[key], newSize);
    }
}

export function waitForPageChange(timeout = 2000) {
    return new Promise((resolve) => {
        const startTime = Date.now();

        function getPageFingerprint() {
            const rows = document.querySelectorAll('.ecom-table-row');
            const titles = Array.from(rows).slice(0, 3).map(row => {
                const titleDiv = row.querySelector('div[class*="name"], div[title]');
                return titleDiv ? titleDiv.textContent.trim().substring(0, 20) : '';
            }).join('|');
            return titles;
        }

        const initialFingerprint = getPageFingerprint();

        const checkInterval = setInterval(() => {
            const currentFingerprint = getPageFingerprint();

            if (currentFingerprint !== initialFingerprint && currentFingerprint.length > 0) {
                clearInterval(checkInterval);
                resolve(true);
            }

            if (Date.now() - startTime > timeout) {
                clearInterval(checkInterval);
                resolve(false);
            }
        }, 100);
    });
}

export function cloneCurrentPageRows() {
    const rows = document.querySelectorAll('.ecom-table-row');
    const cloned = [];

    rows.forEach(row => {
        const clone = row.cloneNode(true);
        clone.dataset.bdListenerAttached = '';
        cloned.push(clone);
    });

    console.log(`[Clone] Cloned ${cloned.length} rows`);
    return cloned;
}

// ==========================================
// Persistence State Machine (Auto Update Across Reloads)
// ==========================================

const STATE_KEY = 'DOUYIN_AUTO_UPDATE_STATE';

export function saveState(state) {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

export function loadState() {
    const s = localStorage.getItem(STATE_KEY);
    try {
        return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
}

export function clearState() {
    localStorage.removeItem(STATE_KEY);
}

// IndexedDB Helper for Directory Handle (Handles DO NOT survive LocalStorage)
export function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('DouyinPluginDB', 1);
        request.onupgradeneeded = (e) => {
            if (!e.target.result.objectStoreNames.contains('handles')) {
                e.target.result.createObjectStore('handles');
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e);
    });
}

export async function saveDirectoryHandle(handle) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').put(handle, 'root');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject();
    });
}

export async function getStoredDirectoryHandle() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('handles', 'readonly');
        const req = tx.objectStore('handles').get('root');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject();
    });
}

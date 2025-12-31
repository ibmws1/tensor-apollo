import { globalState } from './globals.js';
import { sleep } from './utils.js';
import { getCurrentCategory } from './navigation.js';
import { updateCheckboxes } from './ui.js';

// Note: updateCheckboxes is circular dependency if ui.js imports download.js.
// download.js needs updateCheckboxes to clear selection.
// We can pass updateCheckboxes as a callback or have a separate state manager.
// Or just export it from ui.js and hope the cyclic dependency is handled (ES modules handle it well usually).
// However, ui.js imports download.js to bind button clicks.
// Let's refactor: updateCheckboxes depends on UI elements.
// Ideally, `toggleSelectAll` and `updateCheckboxes` should be in `ui_selection.js`.
// But for now, I will import `updateCheckboxes` from `./ui.js`.
// If `ui.js` imports `download.js` for `batchDownloadSelected`, we have a cycle.
// Cycle: ui.js -> download.js -> ui.js
// ES Modules allow this if we are careful with execution order. Functions are hoisted.

export function formatCategoryForFilename(category) {
    if (!category) return '';
    // 替换 / 为 _，并移除其他非法字符
    return category.replace(/\//g, '_').replace(/[^\w\u4e00-\u9fa5_-]/g, '');
}

export function getProductVideos(productData) {
    const videos = [];
    const seenIds = new Set();
    const searchLists = [productData.video_list, productData.videos, productData.media_list, [productData]];
    searchLists.forEach(list => {
        if (Array.isArray(list)) list.forEach(item => {
            if (!item) return;
            const url = item.video_play_url || item.play_url || item.url || item.video_url || (item.video?.play_addr?.url_list?.[0]);
            const id = item.video_id || item.uri || item.id || (url ? url.split('/').pop().split('?')[0] : Math.random().toString(36).substring(7));

            // 提取发布时间 - 尝试多个可能的字段名
            let publishTime = null;
            const timeFields = ['publish_ts', 'create_time', 'publish_time', 'created_at', 'published_at', 'upload_time', 'uploaded_at', 'time', 'createTime', 'publishTime'];
            for (const field of timeFields) {
                if (item[field]) {
                    publishTime = item[field];
                    break;
                }
            }

            if (url && !seenIds.has(id)) {
                seenIds.add(id);
                videos.push({ url, id, publishTime });
            }
        });
    });
    return videos;
}

// 计算商品上架天数
export function calculateProductDaysOnline(productData) {
    // 直接从 video_list 提取所有时间戳（不依赖URL）
    const videoLists = [productData.video_list, productData.videos, productData.media_list];
    const allTimes = [];

    for (const list of videoLists) {
        if (Array.isArray(list)) {
            list.forEach(item => {
                if (item && item.publish_ts) {
                    allTimes.push(item.publish_ts);
                }
            });
        }
    }

    if (allTimes.length === 0) return null;

    // 找到最早的发布时间（最小的时间戳）
    const earliestTimestamp = Math.min(...allTimes);

    // 计算天数差
    const now = Date.now();
    const earliestMs = earliestTimestamp * 1000; // 转换为毫秒
    const timeDiff = now - earliestMs;
    const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

    return days >= 0 ? days : null;
}


export async function scanForExistingVideoIds(dirHandle) {
    const existingIds = new Set();
    const entries = [];

    // Scan root files and collect directories
    for await (const entry of dirHandle.values()) {
        if (entry.kind === 'directory') entries.push(entry);
        if (entry.kind === 'file') {
            const match = entry.name.match(/_\[(\w+)\]\.mp4$/);
            if (match) existingIds.add(match[1]);
        }
    }

    // Scan subdirectories
    for (const folder of entries) {
        try {
            for await (const file of folder.values()) {
                if (file.kind === 'file') {
                    const match = file.name.match(/_\[(\w+)\]\.mp4$/);
                    if (match) existingIds.add(match[1]);
                }
            }
        } catch (err) { console.warn('Cannot read folder', folder.name); }
    }
    return existingIds;
}

export async function batchDownloadVideos(productData, productTitle, button) {
    const videoList = getProductVideos(productData);
    if (videoList.length === 0) return alert('No videos found.');
    const cleanTitle = (productTitle || 'product').replace(/[^\w\u4e00-\u9fa5]/g, '_').substring(0, 50);

    // 获取当前类目并格式化
    const category = getCurrentCategory();
    const categoryForFilename = formatCategoryForFilename(category);

    button.style.cursor = 'wait';
    const originalText = button.innerText;

    try {
        const dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });

        button.innerText = 'Scan...';
        const existingIds = await scanForExistingVideoIds(dirHandle);
        console.log(`[SingleBatch] Found ${existingIds.size} existing videos.`);

        let skippedCount = 0;

        for (let i = 0; i < videoList.length; i++) {
            const { url, id } = videoList[i];

            if (existingIds.has(String(id))) {
                console.log(`[SingleBatch] Skipping ${id} - Already exists.`);
                skippedCount++;
                continue;
            }

            button.innerText = `⬇ ${i + 1}/${videoList.length}`;

            // Generate filename first to have it ready, though we used ID for check
            const filename = categoryForFilename
                ? `${cleanTitle}LM${categoryForFilename}ID_${i + 1}_[${id}].mp4`
                : `${cleanTitle}_${i + 1}_[${id}].mp4`;

            const response = await fetch(url);
            const blob = await response.blob();

            const fh = await dirHandle.getFileHandle(filename, { create: true });
            const wr = await fh.createWritable();
            await wr.write(blob); await wr.close();

            // Add to "existing" in case we encounter duplicates in the same list (rare but possible) or for consistency
            existingIds.add(String(id));

            if (i < videoList.length - 1) await sleep(500);
        }

        if (skippedCount > 0 && skippedCount === videoList.length) {
            button.innerText = '✓ All Skip';
        } else {
            button.innerText = '✓';
        }
    } catch (e) {
        console.error(e);
        if (e.name === 'AbortError') return button.innerText = originalText;

        // Fallback for non-FS-Access-API browsers or failures? 
        // Note: The fallback below doesn't support deduplication easily without FS Access API.
        // Keeping it as is but it might not work well with deduplication logic if we fell here.
        // Assuming modern browser usage where showDirectoryPicker works.
        alert('Download error: ' + e.message);
        button.innerText = 'Err';
    }
    setTimeout(() => { if (button.parentElement) button.remove(); }, 2000);
}

// 批量下载选中的商品 (Smart Mode)
export async function batchDownloadSelected() {
    if (globalState.selectedProducts.size === 0) {
        alert('请先选择要下载的商品');
        return;
    }

    const btn = document.getElementById('batch-download-selected-btn');
    if (!btn) return;

    const originalText = btn.innerText;

    try {
        const dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });

        // 1. Scan History for Existing Video IDs
        btn.innerText = 'Scan history...';
        const existingIds = await scanForExistingVideoIds(dirHandle);
        console.log(`[SmartBatch] Found ${existingIds.size} existing videos in history.`);

        // 2. Prepare Today's Folder
        const todayStr = new Date().toISOString().split('T')[0];
        const todayFolder = await dirHandle.getDirectoryHandle(todayStr, { create: true });

        // 3. Download Process
        const totalCount = globalState.selectedProducts.size;
        let completedCount = 0;

        for (const idx of globalState.selectedProducts) {
            const allRows = Array.from(document.querySelectorAll('.ecom-table-row'));
            const row = allRows[idx];
            if (!row) continue;

            const titleDiv = row.querySelector('div[class*="name"], div[title]');
            const title = titleDiv ? titleDiv.textContent.trim() : 'video';
            const data = (globalState.collectedItems.length > 0 ? globalState.collectedItems[idx] : globalState.currentViewItems[idx]) || {};
            const videoList = getProductVideos(data); // Returns objects {url, id}

            if (videoList.length === 0) {
                completedCount++;
                continue;
            }

            const cleanTitle = (title || 'product').replace(/[^\w\u4e00-\u9fa5]/g, '_').substring(0, 50);
            const category = getCurrentCategory();
            const categoryForFilename = formatCategoryForFilename(category);

            for (let i = 0; i < videoList.length; i++) {
                const { url, id } = videoList[i];

                if (existingIds.has(String(id))) {
                    console.log(`[SmartBatch] Skipping ${id} - Already exists.`);
                    continue;
                }

                btn.innerText = `⬇ ${completedCount + 1}/${totalCount} (${i + 1}/${videoList.length})`;
                try {
                    const response = await fetch(url);
                    const blob = await response.blob();
                    const filename = categoryForFilename
                        ? `${cleanTitle}LM${categoryForFilename}ID_${i + 1}_[${id}].mp4`
                        : `${cleanTitle}_${i + 1}_[${id}].mp4`;

                    const fh = await todayFolder.getFileHandle(filename, { create: true });
                    const wr = await fh.createWritable();
                    await wr.write(blob);
                    await wr.close();

                    existingIds.add(String(id));
                } catch (err) {
                    console.error('Download failed', filename, err);
                }

                if (i < videoList.length - 1) await sleep(500);
            }

            completedCount++;
        }

        btn.innerText = '✓ 下载成功';
        btn.style.backgroundColor = '#28a745';

        // 清空选择并只更新复选框（不更新按钮文字）
        globalState.selectedProducts.clear();

        // 手动取消所有复选框的勾选
        const allRows = Array.from(document.querySelectorAll('.ecom-table-row'));
        allRows.forEach(row => {
            const checkbox = row.querySelector('.product-checkbox');
            if (checkbox) {
                checkbox.checked = false;
            }
        });

        // 更新全选按钮
        const selectAllBtn = document.getElementById('select-all-btn');
        if (selectAllBtn) {
            selectAllBtn.innerText = '☐ 全选';
        }

        // 更新复制按钮文字
        const copyBtn = document.getElementById('copy-info-btn');
        if (copyBtn && !copyBtn.innerText.includes('✓')) {
            copyBtn.innerText = '📋 复制信息';
        }
    } catch (e) {
        if (e.name === 'AbortError') {
            btn.innerText = originalText;
            return;
        }
        console.error('批量下载失败:', e);
        alert('批量下载失败: ' + e.message);
        btn.innerText = originalText;
    }
}

import { globalState } from './globals.js';
import { sleep, loadState, saveState, clearState, initDB, saveDirectoryHandle, getStoredDirectoryHandle } from './utils.js';
import { createFilterPanel, applyFilters } from './ui_filter.js';
import { navigateToCategory, getCurrentCategory } from './navigation.js';
import { getProductVideos, formatCategoryForFilename, calculateProductDaysOnline } from './download.js';
import { showProductSelectionModal } from './ui.js';

// Re-export specific UI updates if necessary, or pass them as callbacks
// Ideally we keep UI logic out, but startLoader modifies Button Text and Style.
// We accept the button element as argument.

export async function jumpToCategory() {
    const btn = document.getElementById('jump-category-btn');
    const originalText = btn ? btn.innerText : '';

    try {
        // 读取剪贴板内容
        const clipText = await navigator.clipboard.readText();
        if (!clipText || !clipText.trim()) {
            alert('请先复制类目名称到剪贴板！\n例如：智能家居/收纳整理/家庭收纳用具/全部');
            return;
        }

        if (btn) btn.innerText = '跳转中...';

        // 直接调用已封装的导航函数 (支持单页无刷新)
        const success = await navigateToCategory(clipText);

        if (success) {
            if (btn) {
                btn.innerText = '✓ 成功';
                btn.style.backgroundColor = '#28a745';
            }
            console.log('[JumpCategory] Jump successful.');
        } else {
            if (btn) {
                btn.innerText = '✗ 失败';
                btn.style.backgroundColor = '#f5222d';
            }
            alert('跳转失败，请检查类目路径是否正确或可见。');
        }

        setTimeout(() => {
            if (btn) {
                btn.innerText = originalText;
                btn.style.backgroundColor = '#722ed1';
            }
        }, 3000);

    } catch (e) {
        console.error('[JumpCategory] Error:', e);
        alert('跳转失败: ' + e.message);
        if (btn) btn.innerText = originalText;
    }
}

export async function startLoader(btn) {
    try {
        globalState.collectedItems = [];
        globalState.shouldInject = false;
        for (let i = 0; i < 25; i++) {
            const next = document.querySelector('.ecom-pagination-next');
            if (!next || next.classList.contains('ecom-pagination-disabled') || next.getAttribute('aria-disabled') === 'true') break;
            btn.innerText = `Collecting ${i + 1}/20 (${globalState.collectedItems.length})`;
            const prev = globalState.collectedItems.length;
            next.click();
            for (let k = 0; k < 30; k++) {
                if (globalState.collectedItems.length > prev) break;
                await sleep(200);
            }
        }
        btn.innerText = "Injecting...";
        globalState.shouldInject = true;
        const p1 = Array.from(document.querySelectorAll('.ecom-pagination-item')).find(e => e.innerText.trim() === '1');
        if (p1) { p1.click(); await sleep(3000); }

        // 计算每个商品的上架天数
        btn.innerText = "Calculating days...";
        globalState.collectedItems.forEach(item => {
            const days = calculateProductDaysOnline(item);
            if (days !== null) {
                item.days_online = days;
            }
        });

        btn.innerText = `Done! ${globalState.collectedItems.length}`;
        btn.style.backgroundColor = "#28a745";
        document.querySelector('.ecom-pagination')?.style && (document.querySelector('.ecom-pagination').style.display = 'none'); // 隐藏原生分页
        createFilterPanel();
        applyFilters();
    } catch (e) { console.error(e); }
    finally { globalState.isCollecting = false; }
}

export async function copySelectedInfo() {
    if (globalState.selectedProducts.size === 0) {
        alert('请先选择要复制的商品');
        return;
    }

    const btn = document.getElementById('copy-info-btn');
    const originalText = btn ? btn.innerText : '';
    if (btn) btn.innerText = 'Processing...';

    let htmlTable = '<table>';
    let successCount = 0;

    const allRows = Array.from(document.querySelectorAll('.ecom-table-row'));

    for (const idx of globalState.selectedProducts) {
        const row = allRows[idx];
        if (!row) {
            console.warn(`[CopyInfo] Row ${idx} not found`);
            continue;
        }

        // 1. Extract Title from DOM first (Reliable Source of what user sees)
        const titleDiv = row.querySelector('div[class*="name"], div[title], a[class*="name"]');
        let domTitle = titleDiv ? titleDiv.textContent.trim() : '';
        console.log(`[CopyInfo] Row ${idx} Visible Title:`, domTitle);

        // 2. Find Data Object using Waterfall Strategy
        let data = {};

        // Strategy A: Exact/Partial Title Match
        if (globalState.collectedItems.length > 0 && domTitle) {
            const normTitle = domTitle.replace(/\s+/g, '').toLowerCase();
            data = globalState.collectedItems.find(item => {
                const itemTitle = (item.product_name || item.title || item.name || '').replace(/\s+/g, '').toLowerCase();
                return itemTitle === normTitle || itemTitle.includes(normTitle) || normTitle.includes(itemTitle);
            }) || {};
        }

        // Strategy B: Token-based Fuzzy Match (if A failed)
        if (!data.title && !data.product_name && globalState.collectedItems.length > 0 && domTitle) {
            const domTokens = domTitle.toLowerCase().split(/\s+/).filter(t => t.length > 1);
            if (domTokens.length > 0) {
                data = globalState.collectedItems.find(item => {
                    const itemTitle = (item.product_name || item.title || item.name || '').toLowerCase();
                    const matchCount = domTokens.reduce((acc, token) => acc + (itemTitle.includes(token) ? 1 : 0), 0);
                    return (matchCount / domTokens.length) > 0.7; // 70% match
                }) || {};
            }
        }

        // Strategy C: Row Dataset ID Match (Most Reliable if available)
        if (!data.title && !data.product_name) {
            let rowId = row.dataset.productId || row.dataset.id || row.dataset.itemId || row.dataset.rowKey;
            // Extract ID from rowKey format: "3683242605367394782_1" -> "3683242605367394782"
            if (rowId && rowId.includes('_')) {
                rowId = rowId.split('_')[0];
            }
            if (rowId) {
                const allItems = [...globalState.collectedItems, ...globalState.currentViewItems];
                data = allItems.find(item => String(item.product_id || item.id) === String(rowId)) || {};
            }
        }

        // Strategy D: View Items (Fallback for non-collected)
        if ((!data.title && !data.product_name) && globalState.currentViewItems.length > 0) {
            const normTitle = domTitle.replace(/\s+/g, '').toLowerCase();
            data = globalState.currentViewItems.find(item => {
                const itemTitle = (item.product_name || item.title || item.name || '').replace(/\s+/g, '').toLowerCase();
                return itemTitle === normTitle;
            }) || {};
        }

        console.log(`[CopyInfo] Resolved Data for "${domTitle}":`, data);

        // 1. Title (Use DOM title if Data title is missing)
        let title = data.product_name || data.title || data.name || domTitle || 'Unknown Product';

        // 1.5 商品缩略图
        let thumbnail = '';
        const thumbImg = row.querySelector('.ecom-sp-img-default img, div[class*="img-default"] img');
        if (thumbImg && thumbImg.src) {
            thumbnail = thumbImg.src;
        }

        // 1.6 成交金额
        let payAmount = '';
        const payAmtEl = row.querySelector('div[class*="numText-"], div[class*="wrapper-"][class*="numText"]');
        if (payAmtEl) {
            payAmount = payAmtEl.textContent.trim();
        }

        // 1.8 价格带
        let priceRange = '-';
        const priceEls = Array.from(row.querySelectorAll('*')).filter(el =>
            el.children.length < 5 &&
            el.textContent.includes('价格带')
        );

        if (priceEls.length > 0) {
            const specificEl = priceEls.sort((a, b) => a.textContent.length - b.textContent.length)[0];
            let text = specificEl.textContent.trim();
            text = text.replace('价格带', '').replace(/¥/g, '').trim();
            const match = text.match(/[\d\.]+\s*-\s*[\d\.]+/);
            if (match) {
                priceRange = match[0].replace(/\s+/g, '');
            } else {
                const singleMatch = text.match(/[\d\.]+/);
                if (singleMatch) priceRange = singleMatch[0];
            }
        }

        // 2. Link Construction

        // Priority 1: Data Object Link
        let link = data.detail_url || data.share_url || data.promotion_link || data.product_url || data.url;

        // Priority 2: Data Object ID Construction
        if (!link) {
            const pid = data.product_id || data.id || data.item_id || data.goods_id ||
                (data.product_info ? data.product_info.product_id : null) ||
                (data.product_info ? data.product_info.id : null);
            if (pid) {
                link = `https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=${pid}&origin_type=pc_compass_manage`;
            }
        }

        // Priority 3: DOM Dataset ID Construction
        if (!link && row.dataset) {
            let rowId = row.dataset.productId || row.dataset.id || row.dataset.itemId || row.dataset.rowKey;
            // Extract ID from rowKey format: "3683242605367394782_1" -> "3683242605367394782"
            if (rowId && rowId.includes('_')) {
                rowId = rowId.split('_')[0];
            }
            if (rowId) {
                link = `https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=${rowId}&origin_type=pc_compass_manage`;
                console.log(`[CopyInfo] 🔗 Built link from rowKey:`, rowId);
            }
        }

        // Priority 4: DOM Link Scraping (Any <a> that looks like a product link)
        if (!link) {
            const links = row.querySelectorAll('a[href]');
            for (let a of links) {
                const h = a.href;
                if (h && (
                    h.includes('/product/') || h.includes('/item') || h.includes('id=') ||
                    h.includes('haohuo.jinritemai.com') || h.includes('douyin.com')
                )) {
                    link = h;
                    break;
                }
            }
        }

        // Final Fix for Link Protocol
        if (link && !link.startsWith('http')) {
            if (link.startsWith('//')) link = 'https:' + link;
            else if (link.startsWith('/')) link = 'https://haohuo.jinritemai.com' + link;
        }

        // 3. Shop Name
        let shopName = data.shop_name || data.author_name;
        if (!shopName) {
            const shopEl = row.querySelector('div[class*="name-A_"], div[class*="shopName"], .ecom-shop-name, div[data-kdt-popup="shop"]');
            if (shopEl) {
                shopName = shopEl.textContent.trim();
            }
        }

        // 4. 商品二维码
        let productQrCodeUrl = "";
        const rectElement = row.querySelector('rect[width="16"][height="16"][rx="2"][fill="#F0F1F5"]');

        if (rectElement) {
            const triggerElement = rectElement.closest('svg') || rectElement.parentElement;
            const events = ['mouseenter', 'mouseover', 'mousedown'];
            for (let eventType of events) {
                const event = new MouseEvent(eventType, {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    clientX: 0,
                    clientY: 0
                });
                rectElement.dispatchEvent(event);
                if (triggerElement !== rectElement) {
                    triggerElement.dispatchEvent(event);
                }
            }

            await new Promise(resolve => setTimeout(resolve, 800));

            const qrImgs = document.querySelectorAll('img[width="107"][height="107"][alt="二维码"]');
            if (qrImgs.length > 0) {
                productQrCodeUrl = qrImgs[qrImgs.length - 1].src;
            }

            const leaveEvent = new MouseEvent('mouseleave', {
                bubbles: true,
                cancelable: true,
                view: window
            });
            rectElement.dispatchEvent(leaveEvent);
            if (triggerElement !== rectElement) {
                triggerElement.dispatchEvent(leaveEvent);
            }
        }

        if (!productQrCodeUrl) {
            const imgs = row.querySelectorAll('img');
            for (let img of imgs) {
                const src = (img.src || '').toLowerCase();
                const alt = (img.alt || '').toLowerCase();

                if (alt.includes('二维码') || src.includes('qrcode') || src.includes('aweme-qrcode')) {
                    productQrCodeUrl = img.src;
                    break;
                } else if (img.width > 50 && img.width < 150 && img.height > 50 && img.height < 150) {
                    if (!img.className.includes('product') && !img.closest('.product-img')) {
                        productQrCodeUrl = img.src;
                        break;
                    }
                }
            }
        }

        if (productQrCodeUrl && !productQrCodeUrl.startsWith('http')) {
            if (productQrCodeUrl.startsWith('//')) productQrCodeUrl = 'https:' + productQrCodeUrl;
        }

        // FINAL ABSOLUTE FALLBACK: Ensure link is NEVER empty
        if (!link) {
            console.warn(`[CopyInfo] ⚠️ No link found for "${domTitle}" after all strategies!`);
            console.warn(`[CopyInfo] Data object:`, data);
            console.warn(`[CopyInfo] Row dataset:`, row.dataset);

            // Last resort: try to extract ANY id-like value from the row
            const rowHtml = row.innerHTML;
            const idMatch = rowHtml.match(/id[\"']=[\"\'](\d+)[\"']/i) ||
                rowHtml.match(/product[_-]?id[\"':]\s*[\"\']?(\d+)/i);
            if (idMatch && idMatch[1]) {
                link = `https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=${idMatch[1]}&origin_type=pc_compass_manage`;
                console.log(`[CopyInfo] 🔧 Constructed emergency link from HTML:`, link);
            }
        }

        console.log(`[CopyInfo] Final link for "${domTitle}": ${link || 'MISSING'}`);

        const c1 = thumbnail || "-";
        const c2 = link ? `<a href="${link}" target="_blank">${title || "未知商品"}</a>` : (title || "未知商品");
        const c3_price = priceRange || "-";
        const c3 = payAmount || "-";
        const c4 = productQrCodeUrl ? `<a href="${productQrCodeUrl}" target="_blank">${shopName || "未知店铺"}</a>` : (shopName || "未知店铺");

        let categoryText = "-";
        let categoryLink = window.location.href;
        const categoryEls = document.querySelectorAll('.ecom-cascader-picker-label');
        if (categoryEls.length > 0) {
            categoryText = categoryEls[0].textContent.trim();
        }
        const c5 = categoryText !== "-" ? `<a href="${categoryLink}" target="_blank">${categoryText}</a>` : "-";

        htmlTable += `<tr><td>${c1}</td><td>${c2}</td><td>${c3_price}</td><td>${c3}</td><td>${c4}</td><td>${c5}</td></tr>`;
        successCount++;
    }

    htmlTable += '</table>';

    try {
        const blob = new Blob([htmlTable], { type: 'text/html' });
        const textBlob = new Blob([`Copied ${successCount} items`], { type: 'text/plain' });

        await navigator.clipboard.write([
            new ClipboardItem({
                'text/html': blob,
                'text/plain': textBlob
            })
        ]);
        console.log(`[CopyInfo] ✓ Successfully copied ${successCount} items`);
        if (btn) {
            btn.innerText = '✓ 复制成功';
        }

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

        // 更新批量下载按钮文字
        const batchBtn = document.getElementById('batch-download-selected-btn');
        if (batchBtn && !batchBtn.innerText.includes('✓')) {
            batchBtn.innerText = '⬇ 批量下载';
        }
    } catch (err) {
        console.error('[CopyInfo] Copy failed:', err);
        alert('Copy failed: ' + err.message);
        if (btn) btn.innerText = originalText;
    }
}

// Single-Page Loop Implementation
async function runAutoUpdateStateMachine() {
    let state = loadState();
    if (!state || state.status === 'idle') return;

    // Load global existing IDs
    const globalExistingIds = new Set(state.globalExistingIds || []);

    if (!document.getElementById('update-overlay')) {
        const overlay = document.createElement('div');
        overlay.id = 'update-overlay';
        overlay.style.cssText = 'position:fixed;top:10px;right:10px;background:rgba(0,0,0,0.8);color:white;padding:15px;z-index:999999;border-radius:8px;font-size:14px;max-width:300px;font-family:sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.5);';
        overlay.innerHTML = `
            <div style="margin-bottom:10px;font-weight:bold;font-size:16px;border-bottom:1px solid #555;padding-bottom:5px;">🔄 自动更新中...</div>
            <div id="update-status" style="line-height:1.5;">正在初始化...</div>
            <div style="margin-top:10px;text-align:right;">
                <button id="stop-update-btn" style="background:#ff4d4f;color:white;border:none;padding:5px 12px;cursor:pointer;border-radius:4px;">⏹ 停止</button>
                <button id="skip-update-btn" style="background:#666;color:white;border:none;padding:5px 12px;cursor:pointer;border-radius:4px;margin-right:5px;">⏭ 跳过</button>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('stop-update-btn').onclick = () => {
            if (confirm('确定停止自动更新吗？')) {
                state.status = 'idle';
                saveState(state);
                clearState();
                location.reload();
            }
        };

        document.getElementById('skip-update-btn').onclick = () => {
            window._skipCurrent = true;
        };
    }

    const updateStatus = (msg) => {
        const el = document.getElementById('update-status');
        if (el) el.innerText = msg;
        console.log(`[AutoUpdate] ${msg}`);
    };

    while (state.currentIndex < state.queue.length) {
        if (state.status === 'idle') break;

        window._skipCurrent = false;
        const product = state.queue[state.currentIndex];

        // Use Global + Product Specific (just in case)
        const productExistingIds = new Set(product.existingIds || []);

        updateStatus(`正在处理(${state.currentIndex + 1} / ${state.queue.length}): \n${product.title}`);

        try {
            // 1. Check Category
            const currentCat = getCurrentCategory();
            const normCurrent = currentCat.replace(/\s+/g, '');
            const normTarget = product.category.replace(/\s+/g, '');

            if (!normCurrent || normCurrent !== normTarget) {
                updateStatus(`切换类目: ${product.category}`);
                const navResult = await navigateToCategory(product.category);
                if (!navResult) {
                    throw new Error(`无法切换到类目: ${product.category}`);
                }
                await sleep(3000);
            }

            // 2. Search
            updateStatus(`🔍 搜索: ${product.title}`);
            let searchKeyword = product.title;
            // Remove brackets and non-Chinese/Alphanumeric
            searchKeyword = searchKeyword.replace(/[\[\(\{【].*?[\]\)\}】]/g, ' ').replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
            if (searchKeyword.length > 2) {
                const len = searchKeyword.length;
                searchKeyword = searchKeyword.substring(Math.floor(len * 0.25), Math.floor(len * 0.75));
            }
            if (searchKeyword.length < 2) searchKeyword = product.title.substring(0, 5);

            const searchInput = document.querySelector('input.ecom-input[placeholder*="可搜索"]');
            if (searchInput) {
                updateStatus(`输入关键词: ${searchKeyword}`);
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                nativeInputValueSetter.call(searchInput, searchKeyword);
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                await sleep(500);

                searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
                searchInput.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
                searchInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));

                const searchBtn = document.querySelector('.ecom-input-suffix i, button[class*="search"]');
                if (searchBtn) searchBtn.click();

                updateStatus('等待搜索结果...');
                let waitTime = 0;
                while (waitTime < 5000) {
                    if (window._skipCurrent) break;
                    await sleep(500); waitTime += 500;
                }
            } else {
                throw new Error("找不到搜索框");
            }

            if (window._skipCurrent) {
                updateStatus('⏭ 已跳过');
                state.errorCount++;
                state.currentIndex++;
                saveState(state);
                continue;
            }

            // 3. Selection Dialog (MODIFIED)
            updateStatus('等待用户选择商品...');

            // Wait a bit for DOM to stabilize
            await sleep(1000);

            const tableRows = Array.from(document.querySelectorAll('.ecom-table-row'));

            let selectedRows = [];
            if (tableRows.length > 0) {
                selectedRows = await showProductSelectionModal(tableRows);
            } else {
                console.warn("Search returned no rows.");
            }

            if (selectedRows.length === 0) {
                if (tableRows.length > 0) updateStatus('用户跳过');
                else updateStatus('未找到商品数据');
            } else {
                // Process Selected Rows
                updateStatus(`用户选中 ${selectedRows.length} 个商品，准备下载...`);

                const dirHandle = await getStoredDirectoryHandle();
                if (!dirHandle) throw new Error("无法恢复目录句柄");

                const todayStr = new Date().toISOString().split('T')[0];
                const dateFolder = await dirHandle.getDirectoryHandle(todayStr, { create: true });
                const catForFile = formatCategoryForFilename(product.category);

                for (const row of selectedRows) {
                    const idx = Array.from(document.querySelectorAll('.ecom-table-row')).indexOf(row);
                    const rowData = (globalState.currentViewItems && globalState.currentViewItems[idx]) || {};
                    const videoList = getProductVideos(rowData);

                    // Filter using Global Existing IDs + Product IDs
                    const newVideos = videoList.filter(v => !globalExistingIds.has(v.id) && !productExistingIds.has(v.id));

                    if (newVideos.length > 0) {
                        let dlCount = 0;
                        for (let k = 0; k < newVideos.length; k++) {
                            if (window._skipCurrent) break;
                            const v = newVideos[k];
                            // Use Row Title
                            const rowTitleDiv = row.querySelector('div[class*="name"], div[title]');
                            const rowTitle = rowTitleDiv ? rowTitleDiv.textContent.trim() : product.title;

                            const fname = `${rowTitle}LM${catForFile}ID_${Math.floor(Math.random() * 10000)}_[${v.id}].mp4`;

                            updateStatus(`下载: ${k + 1}/${newVideos.length}`);
                            try {
                                const response = await fetch(v.url);
                                const blob = await response.blob();
                                const fh = await dateFolder.getFileHandle(fname, { create: true });
                                const wr = await fh.createWritable();
                                await wr.write(blob); await wr.close();
                                dlCount++;

                                // Update Global Set immediately
                                globalExistingIds.add(v.id);
                                state.globalExistingIds = Array.from(globalExistingIds);
                                saveState(state); // Persist update
                            } catch (e) { console.error('DL fail', e); }
                            await sleep(300);
                        }
                        if (dlCount > 0) state.successCount++;
                    } else {
                        updateStatus('全部视频已存在 (Skipped)');
                        await sleep(1000);
                    }
                }
            }

            // Clear search box
            const searchInputClear = document.querySelector('input.ecom-input[placeholder*="可搜索"]');
            if (searchInputClear) {
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                nativeInputValueSetter.call(searchInputClear, '');
                searchInputClear.dispatchEvent(new Event('input', { bubbles: true }));
                await sleep(200);
                searchInputClear.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
                searchInputClear.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
                searchInputClear.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
                await sleep(500);
            }

        } catch (err) {
            console.error(err);
            updateStatus(`❌ 错误: ${err.message}`);
            state.errorCount++;
            await sleep(2000);
        }

        state.currentIndex++;
        saveState(state);
        await sleep(1000);
    }

    // 移除进度覆盖层
    document.getElementById('update-overlay')?.remove();

    // 恢复按钮状态
    const btn = document.getElementById('auto-update-btn');
    if (btn) {
        btn.innerText = '🔄 自动更新';
        btn.style.backgroundColor = '';
    }

    // 显示成功弹窗
    const successOverlay = document.createElement('div');
    successOverlay.style.cssText = 'position:fixed;top:10px;right:10px;background:rgba(40,167,69,0.95);color:white;padding:20px;z-index:999999;border-radius:8px;font-size:14px;max-width:300px;font-family:sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.5);';
    successOverlay.innerHTML = `
        <div style="margin-bottom:10px;font-weight:bold;font-size:16px;border-bottom:1px solid rgba(255,255,255,0.3);padding-bottom:8px;">✅ 更新完成</div>
        <div style="line-height:1.8;margin-bottom:15px;">
            <div>✓ 成功: ${state.successCount}</div>
            <div>⊘ 跳过/失败: ${state.errorCount}</div>
        </div>
        <div style="text-align:right;">
            <button id="close-success-btn" style="background:white;color:#28a745;border:none;padding:6px 16px;cursor:pointer;border-radius:4px;font-weight:bold;">关闭</button>
        </div>
    `;
    document.body.appendChild(successOverlay);

    document.getElementById('close-success-btn').onclick = () => {
        successOverlay.remove();
    };

    clearState();
}

export async function autoUpdateProducts() {
    if (loadState()) {
        runAutoUpdateStateMachine();
        return;
    }

    try { await initDB(); } catch (e) { console.error(e); }

    const btn = document.getElementById('auto-update-btn');
    const originalText = btn ? btn.innerText : '🔄 自动更新';

    try {
        const rootDirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
        await saveDirectoryHandle(rootDirHandle);

        if (btn) btn.innerText = 'Scanning...';
        const localProducts = [];
        const globalIds = new Set();

        async function scanFolder(dirHandle, path = []) {
            for await (const entry of dirHandle.values()) {
                if (entry.kind === 'directory') {
                    await scanFolder(entry, [...path, entry.name]);
                } else if (entry.kind === 'file' && entry.name.endsWith('.mp4')) {
                    // 1. Simple ID Capture (Global Deduplication)
                    const simpleMatch = entry.name.match(/_\[(\w+)\]\.mp4$/);
                    if (simpleMatch) {
                        globalIds.add(simpleMatch[1]);
                    }

                    // 2. Strict Product Parsing (Task Queue)
                    const match = entry.name.match(/(.+)LM(.+)ID_(\d+)_\[(\w+)\]\.mp4$/);
                    if (match) {
                        const title = match[1];
                        const categoryRaw = match[2];
                        const videoId = match[4];
                        const categoryPath = categoryRaw.split('_').join('/');

                        let product = localProducts.find(p => p.title === title && p.category === categoryPath);
                        if (!product) {
                            product = { title, category: categoryPath, existingIds: [], path: path };
                            localProducts.push(product);
                        }
                        if (!product.existingIds.includes(videoId)) {
                            product.existingIds.push(videoId);
                        }
                    }
                }
            }
        }

        await scanFolder(rootDirHandle);
        console.log(`[AutoUpdate] Found ${localProducts.length} products to update.`);
        console.log(`[AutoUpdate] Found ${globalIds.size} total unique videos.`);

        if (localProducts.length === 0) {
            alert('未找到本地视频！格式: 标题LM类目ID_序号_[ID].mp4');
            if (btn) btn.innerText = originalText;
            return;
        }

        const state = {
            status: 'running',
            queue: localProducts,
            currentIndex: 0,
            successCount: 0,
            errorCount: 0,
            globalExistingIds: Array.from(globalIds) // Save global IDs to state
        };
        saveState(state);

        runAutoUpdateStateMachine();

    } catch (e) {
        console.error(e);
        alert('Error: ' + e.message);
        if (btn) btn.innerText = originalText;
    }
}

// Resume check export?
// We need to run `runAutoUpdateStateMachine` on load if state exists.
export function checkAutoResume() {
    setTimeout(runAutoUpdateStateMachine, 2000);
}

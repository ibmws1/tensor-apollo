import { globalState } from './globals.js';
import { batchDownloadVideos, batchDownloadSelected } from './download.js';
import { startLoader, jumpToCategory, autoUpdateProducts, copySelectedInfo } from './actions.js';

export function updateCheckboxes() {
    const allRows = Array.from(document.querySelectorAll('.ecom-table-row'));
    allRows.forEach((row, idx) => {
        const checkbox = row.querySelector('.product-checkbox');
        if (checkbox) {
            checkbox.checked = globalState.selectedProducts.has(idx);
        }
    });

    // 更新全选按钮状态
    const selectAllBtn = document.getElementById('select-all-btn');
    if (selectAllBtn) {
        const visibleRows = allRows.filter(row => row.style.display !== 'none');
        const visibleIndices = visibleRows.map(row => allRows.indexOf(row));
        const allSelected = visibleIndices.length > 0 && visibleIndices.every(idx => globalState.selectedProducts.has(idx));
        selectAllBtn.innerText = allSelected ? '✓ 取消全选' : '☐ 全选';
    }

    // 更新批量下载按钮文本
    const batchBtn = document.getElementById('batch-download-selected-btn');
    if (batchBtn) {
        batchBtn.innerText = globalState.selectedProducts.size > 0 ? `⬇ 批量下载 (${globalState.selectedProducts.size})` : '⬇ 批量下载';
    }

    // Update Copy Button text if exists
    const copyBtn = document.getElementById('copy-info-btn');
    if (copyBtn) {
        copyBtn.innerText = globalState.selectedProducts.size > 0 ? `📋 复制信息 (${globalState.selectedProducts.size})` : '📋 复制信息';
    }
}

export function toggleSelectAll() {
    const allRows = Array.from(document.querySelectorAll('.ecom-table-row'));
    const visibleRows = allRows.filter(row => row.style.display !== 'none');
    const visibleIndices = visibleRows.map(row => allRows.indexOf(row));

    const allSelected = visibleIndices.every(idx => globalState.selectedProducts.has(idx));

    if (allSelected) {
        // 取消全选
        visibleIndices.forEach(idx => globalState.selectedProducts.delete(idx));
    } else {
        // 全选
        visibleIndices.forEach(idx => globalState.selectedProducts.add(idx));
    }

    updateCheckboxes();
}

function setupRowHoverListeners() {
    document.querySelectorAll('.ecom-table-row').forEach(row => {
        if (row.dataset.bdListenerAttached) return;
        row.dataset.bdListenerAttached = 'true';

        // 添加复选框(如果还没有)
        if (!row.querySelector('.product-checkbox')) {
            const allRows = Array.from(document.querySelectorAll('.ecom-table-row'));
            const idx = allRows.indexOf(row);

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'product-checkbox';
            checkbox.checked = globalState.selectedProducts.has(idx);
            Object.assign(checkbox.style, {
                position: 'absolute',
                left: '5px', // Relative to cell
                top: '50%',
                transform: 'translateY(-50%)',
                width: '14px',
                height: '14px',
                margin: '0',
                cursor: 'pointer',
                zIndex: '1000',
                accentColor: '#fe2c55'
            });

            checkbox.onclick = (e) => {
                e.stopPropagation();
                const allRows = Array.from(document.querySelectorAll('.ecom-table-row'));
                const idx = allRows.indexOf(row);
                if (checkbox.checked) {
                    globalState.selectedProducts.add(idx);
                } else {
                    globalState.selectedProducts.delete(idx);
                }
                updateCheckboxes();
            };

            // Find first cell
            const firstCell = row.cells[0];
            if (firstCell) {
                if (window.getComputedStyle(firstCell).position === 'static') firstCell.style.position = 'relative';
                firstCell.appendChild(checkbox);
            } else {
                // Fallback to row if no cell
                if (window.getComputedStyle(row).position === 'static') row.style.position = 'relative';
                row.insertBefore(checkbox, row.firstChild);
            }
        }

        row.addEventListener('mouseenter', () => {
            const titleDiv = row.querySelector('div[class*="name"], div[title]');
            const title = titleDiv ? titleDiv.textContent.trim() : 'video';
            const allRows = Array.from(document.querySelectorAll('.ecom-table-row'));
            const idx = allRows.indexOf(row);
            // 自动选择数据源：优先已收集的API数据，其次当前视图的API数据
            const data = (globalState.collectedItems.length > 0 ? globalState.collectedItems[idx] : globalState.currentViewItems[idx]) || {};

            if (row.querySelector('.batch-download-btn')) return;
            const btn = document.createElement('button');
            btn.className = 'batch-download-btn'; btn.innerText = 'DL';
            Object.assign(btn.style, {
                position: 'absolute', right: '5px', top: '50%', transform: 'translateY(-50%)',
                width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#fe2c55',
                color: 'white', border: '2px solid white', cursor: 'pointer', zIndex: '1000',
                fontWeight: 'bold', boxShadow: '0 2px 5px rgba(0,0,0,0.2)', animation: 'fadeIn 0.2s forwards'
            });
            btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); batchDownloadVideos(data, title, btn); };
            if (window.getComputedStyle(row).position === 'static') row.style.position = 'relative';
            row.appendChild(btn);
        });
        row.addEventListener('mouseleave', () => {
            const b = row.querySelector('.batch-download-btn');
            if (b) b.remove();
        });
    });
}

function createLoaderButton() {
    // Remove existing elements first
    ['dy-toolbar', 'dy-btn-container', 'dy-btn', 'select-all-btn', 'batch-download-selected-btn'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
    });

    // Try to find the container to inject into
    const targetContainer = document.querySelector('div[class*="rankContent-"]');

    // Create the toolbar container
    const toolbar = document.createElement('div');
    toolbar.id = 'dy-toolbar';
    Object.assign(toolbar.style, {
        width: '100%',
        display: 'flex',
        justifyContent: 'flex-start',
        alignItems: 'center',
        gap: '15px',
        padding: '10px 20px',
        marginBottom: '10px',
        backgroundColor: '#fff',
        borderBottom: '1px solid #eee',
        zIndex: 999,
        // Sticky positioning
        position: 'sticky',
        top: '60px', // Adjust based on navbar height
        boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
        borderRadius: '4px'
    });

    // 1. SELECT ALL Button
    const selectAllBtn = document.createElement('button');
    selectAllBtn.id = 'select-all-btn';
    selectAllBtn.innerText = '☐ 全选';
    Object.assign(selectAllBtn.style, {
        padding: '6px 12px', backgroundColor: '#1890ff', color: 'white', fontSize: '13px',
        border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', minWidth: '80px'
    });
    selectAllBtn.onclick = toggleSelectAll;
    toolbar.appendChild(selectAllBtn);

    // 2. START LOADING Button
    const btn = document.createElement('button');
    btn.id = 'dy-btn';
    btn.innerText = 'Start Loading 200+';
    Object.assign(btn.style, {
        padding: '6px 15px', backgroundColor: '#fe2c55', color: 'white',
        border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px'
    });
    btn.onclick = () => {
        if (globalState.isCollecting) return;
        globalState.isCollecting = true;
        btn.style.backgroundColor = '#ff9800';
        startLoader(btn);
    };
    toolbar.appendChild(btn);

    // 3. BATCH DOWNLOAD Button
    const batchBtn = document.createElement('button');
    batchBtn.id = 'batch-download-selected-btn';
    batchBtn.innerText = '⬇ 批量下载';
    Object.assign(batchBtn.style, {
        padding: '6px 15px', backgroundColor: '#fe2c55', color: 'white',
        border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px'
    });
    batchBtn.onclick = batchDownloadSelected;
    toolbar.appendChild(batchBtn);

    // 4. COPY INFO Button
    const copyBtn = document.createElement('button');
    copyBtn.id = 'copy-info-btn';
    copyBtn.innerText = '📋 复制信息';
    Object.assign(copyBtn.style, {
        padding: '6px 15px', backgroundColor: '#52c41a', color: 'white',
        border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px'
    });
    copyBtn.onclick = copySelectedInfo;
    toolbar.appendChild(copyBtn);

    // 5. JUMP TO CATEGORY Button
    const jumpCatBtn = document.createElement('button');
    jumpCatBtn.id = 'jump-category-btn';
    jumpCatBtn.innerText = '🔍 跳转类目';
    Object.assign(jumpCatBtn.style, {
        padding: '6px 15px', backgroundColor: '#722ed1', color: 'white',
        border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px'
    });
    jumpCatBtn.onclick = jumpToCategory;
    toolbar.appendChild(jumpCatBtn);

    // 6. AUTO UPDATE Button (New)
    const updateBtn = document.createElement('button');
    updateBtn.id = 'auto-update-btn';
    updateBtn.innerText = '🔄 自动更新';
    Object.assign(updateBtn.style, {
        padding: '6px 15px', backgroundColor: '#13c2c2', color: 'white',
        border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px'
    });
    updateBtn.onclick = autoUpdateProducts;
    toolbar.appendChild(updateBtn);

    // Injection Logic
    if (targetContainer) {
        console.log('[UI] Injecting toolbar into', targetContainer);
        if (targetContainer.firstChild) {
            targetContainer.insertBefore(toolbar, targetContainer.firstChild);
        } else {
            targetContainer.appendChild(toolbar);
        }
    } else {
        console.warn('[UI] Target container not found! Fallback to fixed positioning.');
        // Fallback: Fixed positioning at the top
        Object.assign(toolbar.style, {
            position: 'fixed',
            top: '80px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'auto',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
        });
        document.body.appendChild(toolbar);
    }
}

import { createFilterPanel } from './ui_filter.js';

export function setupUI() {
    // Inject Styles within UI setup
    const style = document.createElement('style');
    style.textContent = `
        .ant-modal-mask { display: none !important; }
        .batch-download-btn:hover { transform: translateY(-50%) scale(1.1) !important; background: #ff1e42 !important; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-50%) scale(0.8); } to { opacity: 1; transform: translateY(-50%) scale(1); } }
    `;
    document.head.appendChild(style);

    setInterval(setupRowHoverListeners, 1500);

    const checkUrl = () => {
        const isTargetPage = window.location.href.includes('compass') || window.location.href.includes('rank');
        const toolbarExists = document.getElementById('dy-toolbar');
        if (isTargetPage) {
            if (!toolbarExists) {
                createLoaderButton();
            }
            createFilterPanel();
        }
    };
    setInterval(checkUrl, 1000); checkUrl();
}

export function showProductSelectionModal(rows) {
    return new Promise((resolve) => {
        // Create Modal Overlay
        const overlay = document.createElement('div');
        overlay.id = 'selection-overlay';
        Object.assign(overlay.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.5)', zIndex: '1000000', display: 'flex',
            justifyContent: 'center', alignItems: 'center'
        });

        const modal = document.createElement('div');
        Object.assign(modal.style, {
            width: '95vw', height: '90vh', backgroundColor: '#f4f5f9', borderRadius: '8px', padding: '20px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column',
            overflow: 'hidden'
        });

        // Header
        const header = document.createElement('h3');
        header.innerText = '请选择要下载的商品 (Select Products)';
        header.style.marginBottom = '15px';
        header.style.flexShrink = '0';
        modal.appendChild(header);

        // List Container (mimic table structure)
        const list = document.createElement('div');
        Object.assign(list.style, {
            flex: '1', overflowY: 'auto', border: '1px solid #eee', marginBottom: '15px', padding: '10px',
            backgroundColor: '#fff'
        });

        const checkboxMap = new Map(); // Map clone checkbox to original row

        // Populate List
        rows.forEach((row, idx) => {
            // Clone the row
            const clone = row.cloneNode(true);

            // Fix styles for the clone to ensure it displays correctly in the modal
            // The original rows are likely <tr> or <div> with specific layout classes.
            // If they are <tr> we need a table wrapper, or we can just force them to display block/flex.
            // Assuming they are div.ecom-table-row based on previous code.
            // We want to ensure they look "exact", so we copy inline styles. 
            // cloneNode(true) copies inline styles.

            // We might need to ensure the clone has a relative position for our custom checkbox if it wasn't there
            if (window.getComputedStyle(row).display === 'table-row') {
                // If it's a table row, we might need a table container.
                // But the previous code suggested `ecom-table-row` might be a div or we treated it as such.
            }

            // Clean up the clone: remove existing batch buttons or overlays that might be weird
            const existingBtn = clone.querySelector('.batch-download-btn');
            if (existingBtn) existingBtn.remove();

            // Find or Create Checkbox in Clone
            let cb = clone.querySelector('.product-checkbox');
            if (!cb) {
                // Should have been there if setupRowHoverListeners ran, but if not:
                cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.className = 'product-checkbox-clone'; // Diff class
                clone.insertBefore(cb, clone.firstChild);
            } else {
                // It exists, but we need to make sure it works for THIS modal, not the global state directly (or maybe both?)
                // The implementation plan said: "track selection for the modal's promise resolution"
                // So we shouldn't rely on the global state checkbox logic attached to the element.
                // cloneNode copies attributes but NOT event listeners. So the clone's checkbox is "dead".
                // Perfect.
            }

            // Default Check Logic (Default Check First Item)
            cb.checked = (idx === 0);

            // Re-style Checkbox for visibility if needed
            Object.assign(cb.style, {
                display: 'inline-block',
                width: '18px', height: '18px',
                marginRight: '10px', cursor: 'pointer',
                position: 'static', transform: 'none',
                accentColor: '#fe2c55'
            });

            // Make the whole row clickable to toggle checkbox
            clone.style.cursor = 'pointer';
            clone.onclick = (e) => {
                // Prevent double toggle if clicking the checkbox itself
                if (e.target !== cb) {
                    cb.checked = !cb.checked;
                }
            };

            // Store reference
            checkboxMap.set(cb, row);

            list.appendChild(clone);
        });

        if (rows.length === 0) {
            list.innerHTML = '<div style="padding:20px;text-align:center;color:#999;">未找到商品 (No items found)</div>';
        }

        modal.appendChild(list);

        // Buttons
        const btnContainer = document.createElement('div');
        btnContainer.style.textAlign = 'right';
        btnContainer.style.flexShrink = '0';

        const cancelBtn = document.createElement('button');
        cancelBtn.innerText = '跳过 (Skip)';
        Object.assign(cancelBtn.style, {
            padding: '10px 20px', marginRight: '10px', border: '1px solid #ddd', backgroundColor: '#f5f5f5', cursor: 'pointer', borderRadius: '4px', fontSize: '14px'
        });
        cancelBtn.onclick = () => {
            overlay.remove();
            resolve([]);
        };

        const confirmBtn = document.createElement('button');
        confirmBtn.innerText = '确认下载 (Confirm)';
        Object.assign(confirmBtn.style, {
            padding: '10px 20px', border: 'none', backgroundColor: '#1890ff', color: 'white', cursor: 'pointer', borderRadius: '4px', fontSize: '14px', fontWeight: 'bold'
        });
        confirmBtn.onclick = () => {
            // Collect selected original rows
            const selected = [];
            checkboxMap.forEach((originalRow, cbClone) => {
                if (cbClone.checked) {
                    selected.push(originalRow);
                }
            });
            overlay.remove();
            resolve(selected);
        };

        btnContainer.appendChild(cancelBtn);
        btnContainer.appendChild(confirmBtn);
        modal.appendChild(btnContainer);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    });
}

import { globalState } from './globals.js';

export function renderAllRows() {
    console.log(`[Render] Rendering ${globalState.collectedRows.length} rows...`);

    // 尝试多种可能的选择器
    let tableBody = document.querySelector('.ecom-table-body tbody');

    if (!tableBody) {
        tableBody = document.querySelector('tbody');
        console.log('[Render] Using fallback selector: tbody');
    }

    if (!tableBody) {
        // 尝试找到包含行的父容器
        const firstRow = document.querySelector('.ecom-table-row');
        if (firstRow) {
            tableBody = firstRow.parentElement;
            console.log('[Render] Using row parent as container');
        }
    }

    if (!tableBody) {
        console.error('[Render] Table body not found! Available selectors:');
        console.log('- .ecom-table-body:', document.querySelector('.ecom-table-body'));
        console.log('- tbody:', document.querySelector('tbody'));
        console.log('- .ecom-table-row parent:', document.querySelector('.ecom-table-row')?.parentElement);
        return false;
    }

    console.log(`[Render] Found container:`, tableBody.className || tableBody.tagName);

    // 清空现有内容
    tableBody.innerHTML = '';

    // 插入所有收集的行
    globalState.collectedRows.forEach(row => {
        tableBody.appendChild(row);
    });

    console.log(`[Render✓] Successfully rendered ${globalState.collectedRows.length} rows`);

    return true;
}

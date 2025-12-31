export function applyFilters() {
    const titleKw = (document.getElementById('f-title')?.value || '').toLowerCase().trim();
    const shopKw = (document.getElementById('f-shop')?.value || '').toLowerCase().trim();
    const targetPrice = parseFloat(document.getElementById('f-price')?.value);
    const firstOnly = document.getElementById('f-first')?.checked || false;
    const daysInput = (document.getElementById('f-days')?.value || '').trim();

    const rows = document.querySelectorAll('.ecom-table-row');
    let count = 0;

    rows.forEach(row => {
        const allText = row.innerText.toLowerCase();
        const titleMatch = !titleKw || allText.includes(titleKw);
        const shopMatch = !shopKw || allText.includes(shopKw);
        const isFirst = allText.includes('首次') || allText.includes('新上榜');
        const firstMatch = !firstOnly || isFirst;

        let priceMatch = true;
        if (!isNaN(targetPrice)) {
            const match = allText.match(/价格带\s*¥?([\d\.]+)(?:\s*-\s*¥?([\d\.]+))?/);
            if (match) {
                const minP = parseFloat(match[1]);
                const maxP = match[2] ? parseFloat(match[2]) : minP;
                if (targetPrice < minP || targetPrice > maxP) priceMatch = false;
            } else {
                priceMatch = false;
            }
        }

        // 上架天数筛选
        let daysMatch = true;
        if (daysInput) {
            // 从DOM中提取商品标题
            const titleDiv = row.querySelector('div[class*="name"], div[title], a[class*="name"]');
            const rowTitle = titleDiv ? titleDiv.textContent.trim() : '';

            // 通过标题在collectedItems中查找匹配的商品数据
            let matchedData = null;
            if (rowTitle && window.globalState?.collectedItems) {
                matchedData = window.globalState.collectedItems.find(item => {
                    const itemTitle = item.product_info?.name || '';
                    return itemTitle === rowTitle;
                });
            }

            // 如果找不到，尝试用索引（兼容旧逻辑）
            if (!matchedData) {
                const rowIdx = Array.from(document.querySelectorAll('.ecom-table-row')).indexOf(row);
                matchedData = window.globalState?.collectedItems?.[rowIdx];
            }

            if (matchedData && typeof matchedData.days_online === 'number') {
                const itemDays = matchedData.days_online;

                // 解析输入格式: "30" 或 "7-30"
                if (daysInput.includes('-')) {
                    const [minDays, maxDays] = daysInput.split('-').map(s => parseInt(s.trim()));
                    if (!isNaN(minDays) && !isNaN(maxDays)) {
                        daysMatch = itemDays >= minDays && itemDays <= maxDays;
                    }
                } else {
                    const maxDays = parseInt(daysInput);
                    if (!isNaN(maxDays)) {
                        daysMatch = itemDays <= maxDays;
                    }
                }
            } else {
                // 如果没有天数数据，则不显示
                daysMatch = false;
            }
        }

        const show = titleMatch && shopMatch && firstMatch && priceMatch && daysMatch;
        row.style.display = show ? '' : 'none';
        if (show) count++;
    });
    const res = document.getElementById('f-result');
    if (res) res.innerText = `${count}/${rows.length}`;
}

export function createFilterPanel() {
    if (document.getElementById('filter-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'filter-panel';
    panel.innerHTML = `
        <div id="f-header" style="cursor:pointer; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding-bottom:8px; margin-bottom:8px;">
            <span style="font-weight:bold;">🔍 数据筛选</span>
            <span id="f-toggle-icon">▼</span>
        </div>
        <div id="f-content">
            <div style="margin-bottom:8px;"><label style="font-size:12px;">商品标题:</label>
                <input id="f-title" type="text" placeholder="关键字" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:4px;margin-top:2px;"></div>
            <div style="margin-bottom:8px;"><label style="font-size:12px;">店铺名称:</label>
                <input id="f-shop" type="text" placeholder="关键字" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:4px;margin-top:2px;"></div>
            <div style="margin-bottom:8px;"><label style="font-size:12px;">包含价格(元):</label>
                <input id="f-price" type="number" placeholder="例如: 10" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:4px;margin-top:2px;"></div>
            <div style="margin-bottom:8px;"><label style="font-size:12px;">上架天数:</label>
                <input id="f-days" type="text" placeholder="30 或 7-30" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:4px;margin-top:2px;"></div>
            <div style="margin-bottom:10px;"><label style="cursor:pointer;"><input type="checkbox" id="f-first"> 仅看新上榜</label></div>
            <button id="f-apply" style="width:100%;padding:7px;background:#1890ff;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">筛选</button>
            <button id="f-reset" style="width:100%;padding:7px;margin-top:5px;background:#888;color:white;border:none;border-radius:4px;cursor:pointer;">重置</button>
            <div style="margin-top:8px;text-align:center;color:#999;font-size:12px;">显示: <span id="f-result">-</span></div>
        </div>
    `;
    Object.assign(panel.style, {
        position: 'fixed', top: '130px', left: '0px', width: '135px',
        padding: '12px', backgroundColor: '#fff', borderRadius: '8px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.15)', zIndex: 999998, fontSize: '13px',
        transition: 'width 0.3s'
    });
    document.body.appendChild(panel);

    // Folding Logic
    let isExpanded = true;
    document.getElementById('f-header').onclick = () => {
        isExpanded = !isExpanded;
        const content = document.getElementById('f-content');
        const icon = document.getElementById('f-toggle-icon');
        if (isExpanded) {
            content.style.display = 'block';
            icon.innerText = '▼';
            panel.style.width = '135px';
        } else {
            content.style.display = 'none';
            icon.innerText = '◀';
            panel.style.width = '40px'; // Minimized width
        }
    };

    document.getElementById('f-apply').onclick = applyFilters;
    document.getElementById('f-reset').onclick = () => {
        document.getElementById('f-title').value = ''; document.getElementById('f-shop').value = '';
        document.getElementById('f-price').value = ''; document.getElementById('f-days').value = '';
        document.getElementById('f-first').checked = false;
        document.querySelectorAll('.ecom-table-row').forEach(r => r.style.display = '');
        applyFilters();
    };
}

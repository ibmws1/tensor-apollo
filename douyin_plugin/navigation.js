import { sleep } from './utils.js';

export function getCurrentCategory() {
    const categoryEls = Array.from(document.querySelectorAll('.ecom-cascader-picker-label'));
    // Find first visible element
    const visibleEl = categoryEls.find(el => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null && el.getBoundingClientRect().width > 0;
    });

    if (visibleEl) {
        // Get text from the visible label
        let categoryText = visibleEl.textContent.trim();
        // 类目格式通常是 "一级/二级/三级" 或 "一级 / 二级 / 三级"
        // 统一处理：去除空格，保留斜杠
        categoryText = categoryText.replace(/\s*\/\s*/g, '/');
        // 移除末尾的 "/全部" 如果存在
        categoryText = categoryText.replace(/\/全部$/, '');
        console.log('[Category] Current category:', categoryText);
        return categoryText;
    }
    console.log('[Category] Category not found');
    return '';
}

// Helper: Navigate to Category (Enhanced with Human Sim)
export async function navigateToCategory(categoryPathStr) {
    const categoryPath = categoryPathStr.split('/').filter(s => s && s !== '全部');
    console.log(`[Nav] Navigating to ${categoryPath.join(' > ')}`);

    async function simulateClick(el) {
        if (!el) return;
        // Complete mouse event sequence
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        await sleep(50);
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        el.click();
        await sleep(200);
    }

    // 1. Open Picker
    // Logic: Find the *visible* picker label.
    // Reason: Different tabs (Product Rank vs Video Rank) have different DOM structures or hidden tabs.
    // We must click the one that the user can actually see.
    let trigger = null;

    // Strategy A: Find all Span Labels and check visibility
    const candidates = Array.from(document.querySelectorAll('span.ecom-cascader-picker-label'));

    // Find first visible candidate
    trigger = candidates.find(el => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null && el.getBoundingClientRect().width > 0;
    });

    // Strategy B: Fallback to generic if no specific visible span found
    if (!trigger) {
        const genericCandidates = Array.from(document.querySelectorAll('.ecom-cascader-picker-label, .ecom-cascader-picker'));
        trigger = genericCandidates.find(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null && el.getBoundingClientRect().width > 0;
        });
    }

    if (trigger) {
        console.log(`[Nav] Found visible trigger: ${trigger.className}`);
        // Scroll to it to be safe
        trigger.scrollIntoView({ block: 'center', inline: 'center' });
        await sleep(200);
        trigger.click();
        await sleep(1000); // Wait for menu to appear
    } else {
        console.warn('[Nav] No visible category picker found.');
        return false;
    }

    // 2. Click through levels
    for (let i = 0; i < categoryPath.length; i++) {
        const targetText = categoryPath[i];
        const isLastLevel = (i === categoryPath.length - 1);

        // Wait for elements
        let attempts = 0;
        let options = [];
        while (attempts < 5) {
            options = Array.from(document.querySelectorAll('.ecom-cascader-menu-item, [class*="cascader-menu-item"], li[role="menuitem"], .cascader-node'));
            if (options.length > 0) break;
            await sleep(500);
            attempts++;
        }

        let targetElement = null;
        // Clean matching
        const normTarget = targetText.replace(/\s/g, '');
        for (const opt of options) {
            // Visibility Check: Skip hidden elements (e.g. from other tabs)
            const style = window.getComputedStyle(opt);
            if (style.display === 'none' || style.visibility === 'hidden' || opt.offsetParent === null) continue;

            const optText = opt.textContent.replace(/\s/g, '');
            if (optText === normTarget) {
                targetElement = opt;
                break;
            }
        }

        if (targetElement) {
            await simulateClick(targetElement);
            if (isLastLevel) {
                // Sometimes request confirm
                await sleep(200);
            }
            await sleep(1000); // Wait for next column or selection
        } else {
            console.warn(`[Nav] Category node not found: ${targetText}`);
        }
    }

    // 2.5 Extra Level Check (User Fix)
    // sometimes a 4th level appears (e.g. Attributes) even if we only have 3 levels in path.
    // If an extra column is visible and has "All"/"全部", we must click it to close/confirm.
    await sleep(500);
    const menus = document.querySelectorAll('.ecom-cascader-menu, [class*="cascader-menu"]');
    // Simple check: if more menus than levels we clicked
    if (menus.length > categoryPath.length) {
        console.log('[Nav] Extra menu level detected. Checking for "All"...');
        const lastMenu = menus[menus.length - 1];
        const allOption = Array.from(lastMenu.querySelectorAll('li, .cascader-menu-item'))
            .find(li => li.textContent.trim() === '全部' || li.textContent.trim() === 'All');

        if (allOption) {
            console.log('[Nav] Clicking "All" to close extra level.');
            await simulateClick(allOption);
            await sleep(500);
        }
    }

    // 3. Confirm (if button exists)
    await sleep(500);
    const confirmBtn = document.querySelector('.ecom-cascader-footer button, [class*="confirm"], .ok-btn');
    if (confirmBtn) {
        await simulateClick(confirmBtn);
        await sleep(500);
    } else {
        // Click outside to close if it didn't close
        document.body.click();
    }

    await sleep(2000); // Wait for UI update

    // 4. Verification Check
    // Why code click needs refresh? Synthetic events vs Native.
    // We simulate native above. Now check if it worked.
    const currentCat = getCurrentCategory().replace(/\s/g, '');
    const wantedCat = categoryPathStr.replace(/\s/g, '').replace(/\/全部$/, '');

    // Check if wanted category is part of current (e.g. "A/B/C" in "A/B/C")
    // Douyin often shows only last level or full path.
    if (currentCat && currentCat.includes(wantedCat.split('/').pop())) {
        console.log('[Nav] Navigation successful.');
        return true;
    } else {
        console.warn(`[Nav] Navigation check failed. Wanted "${wantedCat}", got "${currentCat}".`);
        // Single-Page Mode: DO NOT RELOAD. Just return false and let the loop handle error/skip.
        return false;
    }
}

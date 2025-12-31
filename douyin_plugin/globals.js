// Shared Constants & State
export const TARGETS = ["market_hot_sale", "video_bring_good"];
export const LIST_FIELD = "data_result";

// Global Shared State
export const globalState = {
    isCollecting: false,
    shouldInject: false,
    collectedItems: [],
    currentViewItems: [], // Used for immediate download when 200 items not collected
    collectedRows: [],
    selectedProducts: new Set() // Stores indices of selected products
};

// 暴露到window对象以便筛选功能访问
window.globalState = globalState;

// Douyin Compass Pro - Injector (Synchronous Injection)
(function () {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('loader.js');
    script.type = 'module'; // Added for ES Module support

    // 关键改进: 同步插入,不等待onload
    const target = document.head || document.documentElement;

    // 使用insertBefore而不是appendChild,确保最高优先级
    if (target.firstChild) {
        target.insertBefore(script, target.firstChild);
    } else {
        target.appendChild(script);
    }

    console.log('[Injector] loader.js injected at:', Date.now());
})();
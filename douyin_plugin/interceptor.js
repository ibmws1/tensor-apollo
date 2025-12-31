import { globalState, TARGETS, LIST_FIELD } from './globals.js';
import { patchAllLimits } from './utils.js';

function isTargetUrl(url) {
    return url && TARGETS.some(t => url.includes(t));
}

export function setupInterceptors() {
    const XHR = XMLHttpRequest.prototype;
    const originalOpen = XHR.open;
    const originalSend = XHR.send;

    XHR.open = function (method, url) {
        this._url = url;
        this._isTarget = isTargetUrl(url);
        if (this._isTarget) {
            var xhr = this;
            var oldOnload = this.onload;
            this.onload = function () {
                if (xhr.status === 200) {
                    try {
                        var json = JSON.parse(xhr.responseText);
                        if (json.data && json.data[LIST_FIELD]) {
                            globalState.currentViewItems = json.data[LIST_FIELD];
                            if (globalState.isCollecting && !globalState.shouldInject) {
                                globalState.collectedItems.push.apply(globalState.collectedItems, json.data[LIST_FIELD]);
                            }
                        }
                    } catch (e) { }
                }
                if (oldOnload) oldOnload.apply(this, arguments);
            };
        }
        return originalOpen.apply(this, arguments);
    };

    XHR.send = function () {
        return originalSend.apply(this, arguments);
    };

    const origRT = Object.getOwnPropertyDescriptor(XHR, 'responseText');
    Object.defineProperty(XHR, 'responseText', {
        get: function () {
            let text = origRT.get.call(this);
            if (this._isTarget && globalState.shouldInject && globalState.isCollecting) {
                try {
                    let json = JSON.parse(text);
                    if (json.data && json.data[LIST_FIELD]) {
                        globalState.collectedItems.unshift(...json.data[LIST_FIELD]);
                        const seen = new Set();
                        const unique = [];
                        globalState.collectedItems.forEach(item => {
                            const id = item.id || item.product_id || JSON.stringify(item);
                            if (!seen.has(id)) { seen.add(id); unique.push(item); }
                        });
                        console.log(`[Injector] Injecting ${unique.length} items`);
                        json.data[LIST_FIELD] = unique;
                        patchAllLimits(json, unique.length);
                        return JSON.stringify(json);
                    }
                } catch (e) { }
            }
            return text;
        }
    });

    console.log('[Interceptors] XHR Interceptors set up.');
}

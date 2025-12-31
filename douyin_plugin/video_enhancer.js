let currentProductTitle = "";

document.addEventListener('click', (e) => {
    const thumbnail = e.target.closest('div[class*="img"], div[class*="thumbnail"], div[class*="video"]');
    if (thumbnail) {
        const row = thumbnail.closest('tr, .ecom-table-row');
        if (row) {
            const titleDiv = row.querySelector('div[class*="name"], div[title]');
            if (titleDiv) currentProductTitle = titleDiv.textContent.trim();
        }
    }
}, true);

function processVideoWindow(videoWindow) {
    if (videoWindow.dataset.pro_processed) return;
    videoWindow.dataset.pro_processed = "true";
    videoWindow.style.cssText += `
        position: fixed !important; top: 130px !important; bottom: 20px !important;
        right: 350px !important; left: auto !important; transform: none !important;
        width: 450px !important; height: auto !important; z-index: 9999999 !important;
        border-radius: 12px; box-shadow: -5px 0 30px rgba(0,0,0,0.3); background: #000;
    `;
    setTimeout(() => {
        const unmuteInterval = setInterval(() => {
            videoWindow.querySelectorAll('video').forEach(v => { v.muted = false; v.volume = 1.0; });
        }, 500);
        const closeObserver = new MutationObserver(() => {
            if (!document.body.contains(videoWindow)) { clearInterval(unmuteInterval); closeObserver.disconnect(); }
        });
        closeObserver.observe(document.body, { childList: true });

        const dlBtn = document.createElement('button');
        dlBtn.innerText = "⬇ Download Current";
        Object.assign(dlBtn.style, {
            position: 'absolute', bottom: '40px', left: '50%', transform: 'translateX(-50%)',
            zIndex: 2147483647, padding: '8px 24px', background: '#fe2c55', color: 'white',
            borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold'
        });
        dlBtn.onclick = async () => {
            const v = videoWindow.querySelector('video');
            if (v && v.src) {
                const blob = await fetch(v.src).then(r => r.blob());
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url;
                a.download = (currentProductTitle || "video") + ".mp4";
                a.click(); URL.revokeObjectURL(url);
            }
        };
        videoWindow.appendChild(dlBtn);
    }, 500);
}

export function checkForVideoWindows() {
    document.querySelectorAll('.ecom-dorami-video-container, .ecom-dorami-video-container-single, .react-draggable').forEach(node => {
        if (node.offsetParent !== null && node.querySelector('video, .xgplayer')) processVideoWindow(node);
    });
}

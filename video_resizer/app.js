// 全局变量
const { FFmpeg } = FFmpegWASM;
let ffmpeg = null;
let videoFiles = [];
let isProcessing = false;

// DOM元素
const loadingOverlay = document.getElementById('loadingOverlay');
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const videoListContainer = document.getElementById('videoListContainer');
const videoList = document.getElementById('videoList');
const emptyState = document.getElementById('emptyState');
const processAllBtn = document.getElementById('processAllBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const overallProgress = document.getElementById('overallProgress');
const overallProgressFill = document.getElementById('overallProgressFill');
const overallProgressText = document.getElementById('overallProgressText');

// 初始化FFmpeg
async function initFFmpeg() {
    try {
        ffmpeg = new FFmpeg();
        ffmpeg.on('log', ({ message }) => {
            console.log(message);
        });
        
        await ffmpeg.load({
            coreURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js',
            wasmURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm'
        });
        
        loadingOverlay.classList.add('hidden');
        console.log('FFmpeg加载成功');
    } catch (error) {
        console.error('FFmpeg加载失败:', error);
        loadingOverlay.querySelector('.loading-text').textContent = 'FFmpeg加载失败，请刷新页面重试';
    }
}

// 页面加载时初始化
window.addEventListener('DOMContentLoaded', initFFmpeg);

// 上传区域点击事件
uploadArea.addEventListener('click', () => fileInput.click());

// 文件选择事件
fileInput.addEventListener('change', handleFileSelect);

// 拖放事件
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('video/'));
    if (files.length > 0) {
        addVideos(files);
    }
});

// 处理文件选择
function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
        addVideos(files);
    }
    fileInput.value = '';
}

// 添加视频到列表
async function addVideos(files) {
    for (const file of files) {
        const id = Date.now() + Math.random();
        const dimensions = await getVideoDimensions(file);
        
        const videoData = {
            id,
            file,
            name: file.name,
            originalWidth: dimensions.width,
            originalHeight: dimensions.height,
            targetWidth: 720,
            targetHeight: Math.round((720 / dimensions.width) * dimensions.height / 2) * 2,
            status: 'pending',
            progress: 0
        };
        
        videoFiles.push(videoData);
        renderVideoItem(videoData);
    }
    
    updateUI();
}

// 获取视频尺寸
function getVideoDimensions(file) {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        
        video.onloadedmetadata = () => {
            window.URL.revokeObjectURL(video.src);
            resolve({
                width: video.videoWidth,
                height: video.videoHeight
            });
        };
        
        video.src = URL.createObjectURL(file);
    });
}

// 渲染视频项
function renderVideoItem(videoData) {
    const item = document.createElement('div');
    item.className = 'video-item';
    item.id = `video-${videoData.id}`;
    
    item.innerHTML = `
        <div class="video-info">
            <div class="video-name">${videoData.name}</div>
            <div class="video-details">
                <span class="dimension-badge original">${videoData.originalWidth}x${videoData.originalHeight}</span>
                <span class="arrow-icon"></span>
                <span class="dimension-badge target">${videoData.targetWidth}x${videoData.targetHeight}</span>
            </div>
            <div class="progress-container" style="display: none;">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: 0%"></div>
                </div>
                <div class="progress-text">等待处理...</div>
            </div>
        </div>
        <div class="status-badge pending">等待中</div>
        <button class="btn btn-sm btn-success" onclick="downloadVideo('${videoData.id}')" style="display: none;">下载</button>
    `;
    
    videoList.appendChild(item);
}

// 更新UI
function updateUI() {
    if (videoFiles.length > 0) {
        videoListContainer.style.display = 'block';
        emptyState.style.display = 'none';
    } else {
        videoListContainer.style.display = 'none';
        emptyState.style.display = 'block';
    }
    
    processAllBtn.disabled = isProcessing || videoFiles.length === 0;
}

// 批量处理
processAllBtn.addEventListener('click', async () => {
    if (isProcessing) return;
    
    isProcessing = true;
    processAllBtn.disabled = true;
    overallProgress.style.display = 'block';
    
    let completed = 0;
    const total = videoFiles.length;
    
    for (const videoData of videoFiles) {
        if (videoData.status === 'completed') {
            completed++;
            continue;
        }
        
        await processVideo(videoData);
        completed++;
        
        overallProgressFill.style.width = `${(completed / total) * 100}%`;
        overallProgressText.textContent = `处理中... ${completed}/${total}`;
    }
    
    isProcessing = false;
    processAllBtn.disabled = false;
    overallProgressText.textContent = `完成！ ${completed}/${total}`;
});

// 处理单个视频
async function processVideo(videoData) {
    const itemEl = document.getElementById(`video-${videoData.id}`);
    const statusBadge = itemEl.querySelector('.status-badge');
    const progressContainer = itemEl.querySelector('.progress-container');
    const progressFill = itemEl.querySelector('.progress-fill');
    const progressText = itemEl.querySelector('.progress-text');
    const downloadBtn = itemEl.querySelector('.btn');
    
    try {
        // 更新状态
        videoData.status = 'processing';
        statusBadge.className = 'status-badge processing';
        statusBadge.textContent = '处理中';
        progressContainer.style.display = 'block';
        
        // 读取文件
        const inputData = await videoData.file.arrayBuffer();
        const inputFileName = 'input' + videoData.file.name.substring(videoData.file.name.lastIndexOf('.'));
        const outputFileName = 'output.mp4';
        
        // 写入FFmpeg虚拟文件系统
        await ffmpeg.writeFile(inputFileName, new Uint8Array(inputData));
        
        // 执行FFmpeg命令
        progressText.textContent = '正在调整尺寸...';
        await ffmpeg.exec([
            '-i', inputFileName,
            '-vf', `scale=720:-2`,
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '23',
            '-c:a', 'copy',
            outputFileName
        ]);
        
        // 读取输出文件
        const data = await ffmpeg.readFile(outputFileName);
        videoData.outputBlob = new Blob([data.buffer], { type: 'video/mp4' });
        
        // 清理FFmpeg文件系统
        await ffmpeg.deleteFile(inputFileName);
        await ffmpeg.deleteFile(outputFileName);
        
        // 更新状态
        videoData.status = 'completed';
        statusBadge.className = 'status-badge completed';
        statusBadge.textContent = '完成';
        progressFill.style.width = '100%';
        progressText.textContent = '处理完成';
        downloadBtn.style.display = 'block';
        
    } catch (error) {
        console.error('处理视频失败:', error);
        videoData.status = 'error';
        statusBadge.className = 'status-badge error';
        statusBadge.textContent = '失败';
        progressText.textContent = '处理失败: ' + error.message;
    }
}

// 下载视频
window.downloadVideo = function(id) {
    const videoData = videoFiles.find(v => v.id == id);
    if (!videoData || !videoData.outputBlob) return;
    
    const url = URL.createObjectURL(videoData.outputBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = videoData.name.replace(/\.[^/.]+$/, '') + '_720p.mp4';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

// 清空列表
clearAllBtn.addEventListener('click', () => {
    if (isProcessing) {
        alert('正在处理中，无法清空列表');
        return;
    }
    
    if (confirm('确定要清空所有视频吗？')) {
        videoFiles = [];
        videoList.innerHTML = '';
        overallProgress.style.display = 'none';
        updateUI();
    }
});

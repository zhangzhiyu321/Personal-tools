// 全局变量
let selectedFiles = [];
let currentTolerance = 6;
let conversionStartTime = null;
let progressInterval = null;
let previewScene = null;
let previewRenderer = null;
let previewCamera = null;
let conversionResults = [];

// DOM 元素
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const convertBtn = document.getElementById('convertBtn');
const downloadBtn = document.getElementById('downloadBtn');
const downloadAllBtn = document.getElementById('downloadAllBtn');
const resetBtn = document.getElementById('resetBtn');
const toleranceSlider = document.getElementById('tolerance');
const toleranceValue = document.getElementById('toleranceValue');
const toleranceLabel = document.getElementById('toleranceLabel');
const infoSection = document.getElementById('infoSection');
const progressSection = document.getElementById('progressSection');
const fileList = document.getElementById('fileList');
const previewModal = document.getElementById('previewModal');
const closePreview = document.getElementById('closePreview');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    updateToleranceDisplay();
});

// 设置事件监听器
function setupEventListeners() {
    // 文件选择
    fileInput.addEventListener('change', handleFileSelect);

    // 选择文件按钮
    const selectFileBtn = document.getElementById('selectFileBtn');
    if (selectFileBtn) {
        selectFileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            fileInput.click();
        });
    }

    // 拖拽上传
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);

    // 点击上传区域触发文件选择
    uploadArea.addEventListener('click', (e) => {
        if (e.target.closest('.btn-select, .file-item, .btn-remove, .file-info')) {
            return;
        }
        fileInput.click();
    });

    // 精度滑块
    toleranceSlider.addEventListener('input', updateToleranceDisplay);

    // 精度预设按钮
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const value = parseInt(btn.dataset.value);
            toleranceSlider.value = value;
            currentTolerance = value;
            updateToleranceDisplay();
            updatePresetButtons();
        });
    });

    // 转换按钮
    convertBtn.addEventListener('click', startConversion);

    // 下载按钮
    if (downloadBtn) {
        downloadBtn.addEventListener('click', downloadFile);
    }

    // 重置按钮
    resetBtn.addEventListener('click', resetAll);

    // 下载全部按钮
    if (downloadAllBtn) {
        downloadAllBtn.addEventListener('click', downloadAllFiles);
    }

    // 预览模态框关闭
    if (closePreview) {
        closePreview.addEventListener('click', closePreviewModal);
    }

    // 点击模态框外部关闭
    previewModal.addEventListener('click', (e) => {
        if (e.target === previewModal) {
            closePreviewModal();
        }
    });
}

// 关闭预览模态框
function closePreviewModal() {
    previewModal.style.display = 'none';

    // 清理事件监听器
    const container = document.getElementById('previewContainer');
    if (container?._previewHandlers) {
        const handlers = container._previewHandlers;
        container.removeEventListener('mousedown', handlers.mousedown);
        document.removeEventListener('mouseup', handlers.mouseup);
        document.removeEventListener('mousemove', handlers.mousemove);
        container.removeEventListener('wheel', handlers.wheel);
        delete container._previewHandlers;
    }

    // 清理Three.js资源
    if (previewScene) {
        while (previewScene.children.length > 0) {
            const obj = previewScene.children[0];
            obj.geometry?.dispose();
            if (obj.material) {
                Array.isArray(obj.material)
                    ? obj.material.forEach(m => m.dispose())
                    : obj.material.dispose();
            }
            previewScene.remove(obj);
        }
    }

    previewRenderer?.dispose();
    previewRenderer = null;
    previewScene = null;
    previewCamera = null;
}

// 处理文件选择
function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
        addFiles(files);
        e.target.value = '';
    }
}

// 添加文件
function addFiles(files) {
    files.forEach(file => {
        if (file.name.toLowerCase().endsWith('.stl')) {
            // 检查是否已存在
            if (!selectedFiles.find(f => f.name === file.name && f.size === file.size)) {
                selectedFiles.push(file);
            }
        }
    });
    updateFileList();
    updateConvertButton();
}

// 删除文件
function removeFile(index) {
    selectedFiles.splice(index, 1);
    updateFileList();
    updateConvertButton();
}

// 清空所有文件
function clearAllFiles() {
    if (selectedFiles.length === 0) {
        return;
    }

    if (confirm(`确定要清空所有已上传的文件吗？(共 ${selectedFiles.length} 个文件)`)) {
        selectedFiles = [];
        fileInput.value = '';
        updateFileList();
        updateConvertButton();
    }
}

// 更新文件列表显示
function updateFileList() {
    if (selectedFiles.length === 0) {
        fileList.style.display = 'none';
        return;
    }

    fileList.style.display = 'flex';
    fileList.innerHTML = '';

    // 添加文件列表标题栏
    const listHeader = document.createElement('div');
    listHeader.className = 'file-list-header';
    listHeader.innerHTML = `
        <div class="file-list-header-info">
            <span>已上传 ${selectedFiles.length} 个文件</span>
        </div>
        <button class="btn-clear-all" title="清空所有已上传的文件">清空所有</button>
    `;
    listHeader.querySelector('.btn-clear-all').addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        clearAllFiles();
    });
    fileList.appendChild(listHeader);

    // 添加文件项容器
    const fileItemsContainer = document.createElement('div');
    fileItemsContainer.className = 'file-items-container';

    selectedFiles.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';

        const fileInfo = document.createElement('div');
        fileInfo.className = 'file-info';
        fileInfo.innerHTML = `
            <span class="file-name">${file.name}</span>
            <span class="file-size">${formatFileSize(file.size)}</span>
        `;
        fileInfo.addEventListener('click', (e) => {
            e.stopPropagation();
            previewFile(index);
        });
        fileInfo.title = '点击预览';

        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn-remove';
        removeBtn.textContent = '×';
        removeBtn.title = '删除';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            removeFile(index);
        });

        fileItem.appendChild(fileInfo);
        fileItem.appendChild(removeBtn);
        fileItemsContainer.appendChild(fileItem);
    });

    fileList.appendChild(fileItemsContainer);
}

// 更新转换按钮状态
function updateConvertButton() {
    convertBtn.disabled = selectedFiles.length === 0;
}

// STL解析器 - 支持二进制和ASCII格式
function parseSTL(buffer) {
    const uint8Array = new Uint8Array(buffer);

    // 检查是否为ASCII格式（前5个字符是"solid"）
    const header = String.fromCharCode.apply(null, uint8Array.slice(0, 5));
    const isASCII = header.toLowerCase() === 'solid';

    if (isASCII) {
        return parseASCIISTL(buffer);
    } else {
        return parseBinarySTL(buffer);
    }
}

// 解析二进制STL
function parseBinarySTL(buffer) {
    const view = new DataView(buffer);
    let offset = 80; // 跳过80字节头部

    const numTriangles = view.getUint32(offset, true);
    offset += 4;

    if (numTriangles === 0 || numTriangles > 10000000) {
        throw new Error('无效的STL文件：三角形数量异常');
    }

    const vertices = [];

    for (let i = 0; i < numTriangles; i++) {
        // 法向量（跳过12字节）
        offset += 12;

        // 三个顶点（每个12字节）
        for (let j = 0; j < 3; j++) {
            const x = view.getFloat32(offset, true);
            offset += 4;
            const y = view.getFloat32(offset, true);
            offset += 4;
            const z = view.getFloat32(offset, true);
            offset += 4;
            vertices.push(x, y, z);
        }

        // 属性字节计数（跳过2字节）
        offset += 2;
    }

    return { vertices };
}

// 解析ASCII STL
function parseASCIISTL(buffer) {
    const text = new TextDecoder().decode(buffer);
    const lines = text.split('\n');
    const vertices = [];

    let i = 0;
    while (i < lines.length) {
        const line = lines[i].trim();

        if (line.startsWith('vertex')) {
            const parts = line.split(/\s+/);
            if (parts.length >= 4) {
                const x = parseFloat(parts[1]);
                const y = parseFloat(parts[2]);
                const z = parseFloat(parts[3]);
                if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
                    vertices.push(x, y, z);
                }
            }
        }
        i++;
    }

    return { vertices };
}

// 动态加载 Three.js（延迟加载，只在需要预览时才加载）
let threeJsLoading = false;
let threeJsLoaded = false;

function loadThreeJS() {
    return new Promise((resolve, reject) => {
        // 如果已经加载，直接返回
        if (typeof THREE !== 'undefined' && THREE.Scene) {
            threeJsLoaded = true;
            resolve();
            return;
        }

        // 如果正在加载，等待加载完成
        if (threeJsLoading) {
            const checkInterval = setInterval(() => {
                if (typeof THREE !== 'undefined' && THREE.Scene) {
                    clearInterval(checkInterval);
                    threeJsLoaded = true;
                    resolve();
                }
            }, 100);
            return;
        }

        // 开始加载
        threeJsLoading = true;
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
        script.async = true;

        script.onload = () => {
            threeJsLoaded = true;
            threeJsLoading = false;
            resolve();
        };

        script.onerror = () => {
            threeJsLoading = false;
            reject(new Error('Three.js 加载失败，请检查网络连接'));
        };

        document.head.appendChild(script);
    });
}

// 实际的预览逻辑（提取为独立函数）
function doPreview(file) {
    // 先关闭之前的预览
    closePreviewModal();

    previewModal.style.display = 'block';
    document.getElementById('previewTitle').textContent = `预览: ${file.name}`;

    const container = document.getElementById('previewContainer');
    container.innerHTML = '<p style="padding: 20px; text-align: center; color: #7f8c8d;">正在加载STL文件...</p>';

    // 初始化Three.js场景
    const width = container.clientWidth;
    const height = container.clientHeight;

    previewScene = new THREE.Scene();
    previewScene.background = new THREE.Color(0xf0f0f0);

    previewCamera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    previewCamera.position.set(0, 0, 100);

    previewRenderer = new THREE.WebGLRenderer({ antialias: true });
    previewRenderer.setSize(width, height);
    container.innerHTML = '';
    container.appendChild(previewRenderer.domElement);

    // 添加光源
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    previewScene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 50, 50);
    previewScene.add(directionalLight);

    // 加载STL文件
    const reader = new FileReader();

    reader.onload = function (e) {
        try {
            const buffer = e.target.result;

            if (buffer.byteLength < 84) {
                throw new Error('文件太小，不是有效的STL文件');
            }

            const data = parseSTL(buffer);

            if (!data.vertices || data.vertices.length === 0) {
                throw new Error('STL文件中没有找到顶点数据');
            }

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.vertices, 3));

            // 计算法向量
            geometry.computeVertexNormals();

            if (!geometry.attributes.normal) {
                geometry.computeFaceNormals();
            }

            const material = new THREE.MeshPhongMaterial({
                color: 0x3498db,
                specular: 0x555555,
                shininess: 100,
                side: THREE.DoubleSide,
                flatShading: false
            });

            const mesh = new THREE.Mesh(geometry, material);

            // 计算边界框
            geometry.computeBoundingBox();

            if (!geometry.boundingBox) {
                throw new Error('无法计算模型边界');
            }

            const center = geometry.boundingBox.getCenter(new THREE.Vector3());
            const size = geometry.boundingBox.getSize(new THREE.Vector3());

            // 居中显示
            geometry.translate(-center.x, -center.y, -center.z);

            // 缩放以适应视图
            const maxDim = Math.max(size.x, size.y, size.z);
            if (maxDim > 0) {
                const scale = 80 / maxDim;
                mesh.scale.set(scale, scale, scale);
            }

            previewScene.add(mesh);

            // 调整相机位置
            const newSize = size.clone().multiplyScalar(mesh.scale.x);
            const maxSize = Math.max(newSize.x, newSize.y, newSize.z);
            previewCamera.position.set(maxSize * 1.5, maxSize * 1.5, maxSize * 1.5);
            previewCamera.lookAt(0, 0, 0);

            // 添加网格辅助线
            const gridHelper = new THREE.GridHelper(maxSize * 2, 10, 0xcccccc, 0xcccccc);
            previewScene.add(gridHelper);

            // 添加坐标轴
            const axesHelper = new THREE.AxesHelper(maxSize);
            previewScene.add(axesHelper);

            // 鼠标旋转控制
            let mouseDown = false;
            let mouseX = 0;
            let mouseY = 0;
            let rotationX = 0;
            let rotationY = 0;

            const handleMouseDown = (e) => {
                mouseDown = true;
                mouseX = e.clientX;
                mouseY = e.clientY;
            };

            const handleMouseUp = () => {
                mouseDown = false;
            };

            const handleMouseMove = (e) => {
                if (mouseDown) {
                    const deltaX = e.clientX - mouseX;
                    const deltaY = e.clientY - mouseY;
                    rotationY += deltaX * 0.01;
                    rotationX += deltaY * 0.01;
                    mesh.rotation.y = rotationY;
                    mesh.rotation.x = rotationX;
                    mouseX = e.clientX;
                    mouseY = e.clientY;
                }
            };

            // 鼠标滚轮缩放
            const handleWheel = (e) => {
                e.preventDefault();
                const scale = e.deltaY > 0 ? 0.9 : 1.1;
                previewCamera.position.multiplyScalar(scale);
            };

            container.addEventListener('mousedown', handleMouseDown);
            document.addEventListener('mouseup', handleMouseUp);
            document.addEventListener('mousemove', handleMouseMove);
            container.addEventListener('wheel', handleWheel);

            // 保存事件处理器以便清理
            container._previewHandlers = {
                mousedown: handleMouseDown,
                mouseup: handleMouseUp,
                mousemove: handleMouseMove,
                wheel: handleWheel
            };

            // 渲染循环
            function animate() {
                requestAnimationFrame(animate);
                previewRenderer.render(previewScene, previewCamera);
            }
            animate();
        } catch (error) {
            container.innerHTML = `
                <div style="padding: 40px; text-align: center;">
                    <p style="color: #e74c3c; font-size: 1.1em; margin-bottom: 10px;">无法预览此文件</p>
                    <p style="color: #7f8c8d; font-size: 0.9em;">错误: ${error.message}</p>
                    <p style="color: #7f8c8d; font-size: 0.85em; margin-top: 10px;">请检查文件是否为有效的STL格式</p>
                </div>
            `;
        }
    };

    reader.readAsArrayBuffer(file);
}

// 预览文件（入口函数，负责加载 Three.js）
function previewFile(index) {
    const file = selectedFiles[index];
    if (!file) return;

    const container = document.getElementById('previewContainer');
    
    // 如果 Three.js 未加载，先加载它
    if (typeof THREE === 'undefined' || !THREE.Scene) {
        // 显示加载提示
        closePreviewModal();
        previewModal.style.display = 'block';
        document.getElementById('previewTitle').textContent = `预览: ${file.name}`;
        if (container) {
            container.innerHTML = '<p style="padding: 20px; text-align: center; color: #7f8c8d;">正在加载预览组件...</p>';
        }

        loadThreeJS()
            .then(() => {
                // Three.js 加载完成，执行预览
                doPreview(file);
            })
            .catch((error) => {
                // 加载失败，显示错误
                if (container) {
                    container.innerHTML = `
                        <div style="padding: 40px; text-align: center;">
                            <p style="color: #e74c3c; font-size: 1.1em; margin-bottom: 10px;">无法加载预览组件</p>
                            <p style="color: #7f8c8d; font-size: 0.9em;">错误: ${error.message}</p>
                            <p style="color: #7f8c8d; font-size: 0.85em; margin-top: 10px;">请检查网络连接后重试</p>
                        </div>
                    `;
                }
            });
        return;
    }

    // Three.js 已加载，直接预览
    doPreview(file);
}

// 处理拖拽
function handleDragOver(e) {
    e.preventDefault();
    uploadArea.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    uploadArea.classList.remove('dragover');

    const files = Array.from(e.dataTransfer.files).filter(file =>
        file.name.toLowerCase().endsWith('.stl')
    );

    if (files.length > 0) {
        addFiles(files);
    } else {
        alert('请选择 STL 文件！');
    }
}

// 更新精度显示
function updateToleranceDisplay() {
    currentTolerance = parseInt(toleranceSlider.value);
    toleranceValue.textContent = `1e-${currentTolerance}`;

    const labels = { 5: '标准精度', 6: '高精度', 7: '超高精度' };
    toleranceLabel.textContent = labels[currentTolerance] || '极高精度';
    updatePresetButtons();
}

// 更新预设按钮状态
function updatePresetButtons() {
    document.querySelectorAll('.preset-btn').forEach(btn => {
        if (parseInt(btn.dataset.value) === currentTolerance) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

// 更新状态
function updateStatus(status, text) {
    const statusElement = document.getElementById('status');
    if (statusElement) {
        statusElement.textContent = text;
        statusElement.className = `info-value status ${status}`;
    }
}

// 开始转换
async function startConversion() {
    if (selectedFiles.length === 0) {
        alert('请先选择文件！');
        return;
    }

    // 清理之前的转换结果和下载列表
    conversionResults = [];
    const oldDownloadList = document.querySelector('.download-list');
    if (oldDownloadList) {
        oldDownloadList.remove();
    }
    downloadBtn.style.display = 'none';
    downloadAllBtn.style.display = 'none';

    convertBtn.disabled = true;
    updateStatus('processing', '转换中...');

    progressSection.style.display = 'block';
    conversionStartTime = Date.now();

    const totalFiles = selectedFiles.length;
    const totalFileSize = selectedFiles.reduce((sum, file) => sum + file.size, 0);

    // 初始化转换信息显示
    document.getElementById('fileCount').textContent = `${totalFiles} 个`;
    document.getElementById('fileSize').textContent = formatFileSize(totalFileSize);
    document.getElementById('triangleCount').textContent = '-';
    document.getElementById('edgeCount').textContent = '-';

    startProgressSimulation();

    try {
        const results = [];
        let totalTriangles = 0;
        let totalEdges = 0;

        for (let i = 0; i < selectedFiles.length; i++) {
            const file = selectedFiles[i];
            const formData = new FormData();
            formData.append('file', file);
            formData.append('tolerance', currentTolerance);

            const response = await fetch('/api/stl_to_step/convert', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`文件 ${file.name} 转换失败`);
            }

            const result = await response.json();
            if (result.success) {
                results.push({
                    filename: result.filename,
                    download_url: result.download_url,
                    original_name: file.name,
                    triangles: result.triangles,
                    edges: result.edges
                });

                // 累计三角形数量和合并边数
                if (result.triangles != null) totalTriangles += result.triangles;
                if (result.edges != null) totalEdges += result.edges;

                // 实时更新显示
                const triangleEl = document.getElementById('triangleCount');
                const edgeEl = document.getElementById('edgeCount');
                if (triangleEl) triangleEl.textContent = totalTriangles > 0 ? totalTriangles.toLocaleString() : '-';
                if (edgeEl) edgeEl.textContent = totalEdges > 0 ? totalEdges.toLocaleString() : '-';
            }

            // 更新进度
            const progress = ((i + 1) / totalFiles) * 100;
            updateProgress(progress);
        }

        stopProgressSimulation();
        updateProgress(100);

        // 更新进度文本为"已完成"
        const timeElement = document.getElementById('progressTime');
        if (timeElement) {
            timeElement.textContent = '已完成';
        }

        if (results.length > 0) {
            // 保存转换结果
            conversionResults = results;

            updateStatus('success', `成功转换 ${results.length}/${totalFiles} 个文件`);

            // 显示下载选项
            if (results.length === 1) {
                downloadBtn.dataset.downloadUrl = results[0].download_url;
                downloadBtn.dataset.filename = results[0].filename;
                downloadBtn.style.display = 'inline-block';
                downloadAllBtn.style.display = 'none';
            } else {
                showDownloadList(results);
                downloadAllBtn.style.display = 'inline-block';
                downloadBtn.style.display = 'none';
            }

            resetBtn.style.display = 'inline-block';

            // 转换完成后，重新启用转换按钮，允许调整精度后再次转换
            convertBtn.disabled = false;
        } else {
            throw new Error('所有文件转换失败');
        }
    } catch (error) {
        stopProgressSimulation();
        updateStatus('error', '转换失败: ' + error.message);
        alert('转换失败: ' + error.message);
        convertBtn.disabled = false;
    }
}

// 显示下载列表
function showDownloadList(results) {
    // 先删除旧的下载列表（如果存在）
    const oldDownloadList = document.querySelector('.download-list');
    if (oldDownloadList) {
        oldDownloadList.remove();
    }

    // 创建新的下载列表
    const downloadList = document.createElement('div');
    downloadList.className = 'download-list';
    downloadList.innerHTML = '<h4>转换完成，点击下载：</h4>';

    results.forEach(result => {
        const item = document.createElement('div');
        item.className = 'download-item';
        item.innerHTML = `
            <span>${result.original_name} → ${result.filename}</span>
            <button class="btn-download-item" onclick="downloadSingleFile('${result.download_url}', '${result.filename}')">下载</button>
        `;
        downloadList.appendChild(item);
    });

    // 插入到操作按钮区域之前
    const actionSection = document.querySelector('.action-section');
    actionSection.insertBefore(downloadList, actionSection.firstChild);
}

// 通用下载文件函数
function triggerDownload(url, filename, isBlobUrl = false) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
        document.body.removeChild(link);
        if (isBlobUrl) {
            window.URL.revokeObjectURL(url);
        }
    }, 100);
}

// 下载单个文件
function downloadSingleFile(url, filename) {
    triggerDownload(url, filename);
}

// 下载全部文件
async function downloadAllFiles() {
    if (conversionResults.length === 0) {
        alert('没有可下载的文件');
        return;
    }

    downloadAllBtn.disabled = true;
    downloadAllBtn.textContent = '正在下载...';

    try {
        for (let i = 0; i < conversionResults.length; i++) {
            const result = conversionResults[i];
            const response = await fetch(result.download_url);

            if (!response.ok) continue;

            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            triggerDownload(blobUrl, result.filename, true);

            if (i < conversionResults.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }

        alert(`已开始下载 ${conversionResults.length} 个文件`);
    } catch (error) {
        alert('下载失败: ' + error.message);
    } finally {
        downloadAllBtn.disabled = false;
        downloadAllBtn.textContent = '下载全部文件';
    }
}

// 进度模拟
function startProgressSimulation() {
    let progress = 0;
    const duration = 3000;
    const startTime = Date.now();

    progressInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        progress = Math.min(90, (elapsed / duration) * 90);
        updateProgress(progress);
        updateTimeRemaining(progress, duration);
    }, 100);
}

function stopProgressSimulation() {
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
}

// 更新进度条
function updateProgress(percent) {
    const progressFill = document.getElementById('progressFill');
    const progressPercent = document.getElementById('progressPercent');

    if (progressFill) progressFill.style.width = percent + '%';
    if (progressPercent) progressPercent.textContent = Math.round(percent) + '%';
}

// 更新剩余时间
function updateTimeRemaining(progress, totalDuration) {
    const timeElement = document.getElementById('progressTime');
    if (!timeElement) return;

    // 如果进度达到100%，显示"已完成"
    if (progress >= 100) {
        timeElement.textContent = '已完成';
        return;
    }

    const elapsed = Date.now() - conversionStartTime;
    const remaining = Math.max(0, totalDuration - elapsed);

    if (remaining > 0 && progress < 90) {
        timeElement.textContent = `预计剩余时间: ${Math.ceil(remaining / 1000)} 秒`;
    } else {
        timeElement.textContent = '即将完成...';
    }
}

// 下载文件
function downloadFile(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }

    const downloadUrl = downloadBtn.dataset.downloadUrl;
    const filename = downloadBtn.dataset.filename || 'output.stp';

    if (!downloadUrl) {
        alert('下载链接不可用，请重新转换文件');
        return false;
    }

    triggerDownload(downloadUrl, filename);
    return false;
}

// 重置所有
function resetAll() {
    selectedFiles = [];
    conversionResults = [];
    fileInput.value = '';
    convertBtn.disabled = true;
    downloadBtn.style.display = 'none';
    downloadAllBtn.style.display = 'none';
    resetBtn.style.display = 'none';
    fileList.style.display = 'none';
    progressSection.style.display = 'none';

    // 重置信息显示
    const infoIds = ['fileCount', 'fileSize', 'triangleCount', 'edgeCount'];
    infoIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '-';
    });
    updateStatus('waiting', '等待中');

    // 清除下载列表
    const downloadList = document.querySelector('.download-list');
    if (downloadList) downloadList.remove();

    updateProgress(0);
    updateFileList();
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// 全局函数，供HTML调用
window.removeFile = removeFile;
window.previewFile = previewFile;
window.downloadSingleFile = downloadSingleFile;
window.downloadAllFiles = downloadAllFiles;


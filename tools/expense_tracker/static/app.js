// 记账工具前端逻辑
// 设计：配置与常量集中、工具函数复用、初始化统一入口，便于扩展与维护。

const API_BASE = '/api/expense_tracker';
const AUTH_API = '/api/auth';

// ========== 工具函数 ==========
const getLocalDateString = (date = null) => {
    const d = date ? new Date(date) : new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** 金额格式化为 ¥x.xx，统一展示与动画重绘 */
const formatMoney = (num) => {
    const n = typeof num === 'number' ? num : parseFloat(num);
    return '¥' + (isNaN(n) ? '0.00' : n.toFixed(2));
};

// ========== 认证功能 ==========
const getToken = () => localStorage.getItem('auth_token');
const setToken = (token) => token ? localStorage.setItem('auth_token', token) : localStorage.removeItem('auth_token');
const clearAuth = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('username');
};

// 带认证的fetch函数（自动添加token）
async function authFetch(url, options = {}) {
    const token = getToken();
    
    // 设置默认headers
    // 如果body是FormData，不要设置Content-Type，让浏览器自动设置multipart/form-data
    const isFormData = options.body instanceof FormData;
    const headers = {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...options.headers
    };
    
    // 如果有token，添加到headers
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    // 发起请求
    const response = await fetch(url, {
        ...options,
        headers
    });
    
    // 如果返回401未授权，清除token并显示登录弹窗
    if (response.status === 401) {
        clearAuth();
        showLoginModal();
        throw new Error('需要登录');
    }
    
    return response;
}

// 登录功能
let loginModal = null;
let isLoggingIn = false;

function showLoginModal() {
    if (!loginModal) {
        createLoginModal();
    }
    if (loginModal) {
        loginModal.style.display = 'flex';
        document.getElementById('login-username')?.focus();
    }
}

function hideLoginModal() {
    if (loginModal) {
        loginModal.style.display = 'none';
        // 清空表单
        const usernameInput = document.getElementById('login-username');
        const passwordInput = document.getElementById('login-password');
        if (usernameInput) usernameInput.value = '';
        if (passwordInput) passwordInput.value = '';
    }
}

// 暴露到全局作用域，供HTML中的onclick使用
window.showLoginModal = showLoginModal;
window.hideLoginModal = hideLoginModal;
window.handleLogin = handleLogin;

function createLoginModal() {
    // 检查是否已存在
    if (document.getElementById('login-modal')) {
        loginModal = document.getElementById('login-modal');
        return;
    }
    
    const modal = document.createElement('div');
    modal.id = 'login-modal';
    modal.className = 'login-modal';
    modal.innerHTML = `
        <div class="login-modal-content">
            <div class="login-modal-header">
                <h2>🔐 登录</h2>
                <button class="login-close-btn" onclick="hideLoginModal()">×</button>
            </div>
            <div class="login-modal-body">
                <div class="login-form-group">
                    <label for="login-username">用户名</label>
                    <input type="text" id="login-username" placeholder="请输入用户名" autocomplete="username">
                </div>
                <div class="login-form-group">
                    <label for="login-password">密码</label>
                    <input type="password" id="login-password" placeholder="请输入密码" autocomplete="current-password">
                </div>
                <div id="login-error" class="login-error" style="display: none;"></div>
                <button id="login-submit-btn" class="login-submit-btn" onclick="handleLogin()">登录</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    loginModal = modal;
    
    // 回车键登录
    document.getElementById('login-username')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('login-password')?.focus();
        }
    });
    document.getElementById('login-password')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !isLoggingIn) {
            handleLogin();
        }
    });
    
    // 点击背景关闭
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            hideLoginModal();
        }
    });
}

async function handleLogin() {
    if (isLoggingIn) return;
    
    const username = document.getElementById('login-username')?.value.trim();
    const password = document.getElementById('login-password')?.value;
    const errorDiv = document.getElementById('login-error');
    const submitBtn = document.getElementById('login-submit-btn');
    
    if (!username || !password) {
        if (errorDiv) {
            errorDiv.textContent = '请输入用户名和密码';
            errorDiv.style.display = 'block';
        }
        return;
    }
    
    isLoggingIn = true;
    if (submitBtn) {
        submitBtn.textContent = '登录中...';
        submitBtn.disabled = true;
    }
    if (errorDiv) errorDiv.style.display = 'none';
    
    try {
        const response = await fetch(`${AUTH_API}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            // 保存token和用户名
            setToken(data.token);
            localStorage.setItem('username', data.username || username);
            
            // 隐藏登录弹窗
            hideLoginModal();
            
            // 重新加载数据
            location.reload();
        } else {
            if (errorDiv) {
                errorDiv.textContent = data.error || '登录失败，请检查用户名和密码';
                errorDiv.style.display = 'block';
            }
        }
    } catch (error) {
        if (errorDiv) {
            errorDiv.textContent = '登录失败：' + error.message;
            errorDiv.style.display = 'block';
        }
    } finally {
        isLoggingIn = false;
        if (submitBtn) {
            submitBtn.textContent = '登录';
            submitBtn.disabled = false;
        }
    }
}

// 检查登录状态
async function checkAuthStatus() {
    const token = getToken();
    if (!token) {
        showLoginModal();
        return false;
    }
    
    try {
        const response = await authFetch(`${AUTH_API}/verify`);
        if (response.ok) {
            const data = await response.json();
            // 验证返回的数据
            if (data.valid) {
                return true;
            } else {
                clearAuth();
                showLoginModal();
                return false;
            }
        } else {
            // 如果不是401，记录错误信息
            if (response.status !== 401) {
                const errorData = await response.json().catch(() => ({}));
                console.error('验证令牌失败:', response.status, errorData);
            }
            clearAuth();
            showLoginModal();
            return false;
        }
    } catch (error) {
        console.error('验证令牌异常:', error);
        clearAuth();
        showLoginModal();
        return false;
    }
}

// 全局变量
let categories = { expense: [], income: [] };
let currentPage = 1;
let echartsLine = null;
let echartsPie = null;
let echartsBar = null;
let echartsCategoryDetail = null; // 分类明细弹窗内趋势图
let currentCategoryDetailData = null; // 当前分类明细的完整数据
let categoryDetailCurrentPage = 1; // 分类明细记录列表当前页码
let categoryDetailPageSize = 20; // 每页显示的记录数
let currentTimeDimension = 'day'; // day, week, month
let currentDailyStats = null; // 保存当前的每日统计数据，用于图表点击
// 图表展示：缓存原始分类数据，用于切换「展示方式」时重绘
let lastCategoryStatsForCharts = null;
// 图表中最多单独显示的分类数，超出部分合并为「其他」；设为很大则显示全部
let chartDisplayMaxVisible = 6;

// 图表占位提示（暂无数据 / 加载失败）
function setChartPlaceholder(domId, message, isError) {
    const dom = document.getElementById(domId);
    if (!dom) return;
    dom.innerHTML = '<div class="chart-placeholder' + (isError ? ' chart-placeholder-error' : '') + '">' + (message || '暂无数据') + '</div>';
}

// 等待图表容器准备好（支持重试机制）
function waitForChartContainer(domId, maxRetries = 10, retryDelay = 50) {
    return new Promise((resolve, reject) => {
        const dom = document.getElementById(domId);
        if (!dom) {
            reject(new Error(`图表容器 ${domId} 不存在`));
            return;
        }
        
        let retries = 0;
        const checkContainer = () => {
            const rect = dom.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                resolve(dom);
                return;
            }
            
            retries++;
            if (retries >= maxRetries) {
                reject(new Error(`图表容器 ${domId} 未准备好`));
                return;
            }
            
            setTimeout(checkContainer, retryDelay);
        };
        
        // 使用 requestAnimationFrame 确保DOM已渲染
        requestAnimationFrame(() => {
            requestAnimationFrame(checkContainer);
        });
    });
}

/** 将分类统计聚合为「前 N 项 + 其他」，便于分类多时图表更清晰 */
function aggregateCategoryStats(categoryStats, options) {
    const maxVisible = options && options.maxVisible != null ? options.maxVisible : chartDisplayMaxVisible;
    if (!categoryStats || categoryStats.length === 0) {
        return { chartData: [], others: [], total: 0 };
    }
    const sorted = [...categoryStats].sort((a, b) => b.amount - a.amount);
    const total = sorted.reduce((s, c) => s + c.amount, 0);
    if (total <= 0) return { chartData: [], others: [], total: 0 };
    if (sorted.length <= maxVisible) {
        return { chartData: sorted, others: [], total };
    }
    const main = sorted.slice(0, maxVisible);
    const rest = sorted.slice(maxVisible);
    const otherAmount = rest.reduce((s, c) => s + c.amount, 0);
    const otherItem = {
        category: '__OTHER__',
        name: '其他',
        icon: '📋',
        color: '#9E9E9E',
        amount: otherAmount,
        _isOther: true,
        _others: rest
    };
    return { chartData: [...main, otherItem], others: rest, total };
}

// 日期选择器状态
let datePickerState = {
    day: { year: new Date().getFullYear(), month: new Date().getMonth() + 1 },
    week: { count: 1 }, // 近N周，最多50周
    month: { count: 1 } // 近N月，最多24个月
};

// ECharts 初始化选项：SVG 渲染 + 高 DPI，移动端清晰
function getEChartsInitOpts() {
    const dpr = typeof window !== 'undefined' ? Math.max(2, window.devicePixelRatio || 1) : 2;
    return { renderer: 'svg', devicePixelRatio: dpr };
}
// ========== 统一初始化入口 ==========
document.addEventListener('DOMContentLoaded', async () => {
    const isAuthenticated = await checkAuthStatus();
    init(isAuthenticated);
});

/**
 * 统一初始化：未登录仅搭好 UI 与事件，已登录再拉取数据。
 * 便于扩展与维护，避免 initUI/initApp 重复逻辑。
 */
function init(authenticated) {
    const typeInput = document.getElementById('record-type');
    if (typeInput) typeInput.value = 'expense';
    const expenseBtn = document.querySelector('.type-btn-compact[data-type="expense"]');
    if (expenseBtn) expenseBtn.classList.add('active');
    const incomeBtn = document.querySelector('.type-btn-compact[data-type="income"]');
    if (incomeBtn) incomeBtn.classList.remove('active');

    bindEvents();
    initMainTabs();
    initTimeDimensionSelector();
    initRecordsDateFilter();

    if (authenticated) {
        loadCategories().then(() => loadTodayRecords());
        Promise.all([loadStatistics(), loadRecords()]).catch(err => console.error('数据加载错误:', err));
    }
}

// 初始化记录列表日期筛选
function initRecordsDateFilter() {
    const startDateInput = document.getElementById('records-start-date');
    const endDateInput = document.getElementById('records-end-date');
    
    // 保存原始值，用于取消时恢复
    let originalStartDate = '';
    let originalEndDate = '';
    
    // 输入框获得焦点时保存原始值
    if (startDateInput) {
        startDateInput.addEventListener('focus', function() {
            originalStartDate = this.value || '';
        });
    }
    
    if (endDateInput) {
        endDateInput.addEventListener('focus', function() {
            originalEndDate = this.value || '';
        });
    }
    
    // 应用按钮
    const applyBtn = document.getElementById('apply-records-filter');
    if (applyBtn) {
        applyBtn.addEventListener('click', function() {
            const startDate = startDateInput ? startDateInput.value : '';
            const endDate = endDateInput ? endDateInput.value : '';
            
            // 如果两个日期都选择了，验证日期范围
            if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
                customAlert('开始日期不能晚于结束日期', '提示', 'warning');
                return;
            }
            
            // 应用筛选，重新加载记录
            loadRecords(1);
        });
    }
    
    // 清除按钮（带回弹效果）
    const clearBtn = document.getElementById('clear-records-filter');
    if (clearBtn) {
        clearBtn.addEventListener('click', function() {
            // 添加回弹动画
            this.classList.add('bounce');
            setTimeout(() => {
                this.classList.remove('bounce');
            }, 600);
            
            if (startDateInput) startDateInput.value = '';
            if (endDateInput) endDateInput.value = '';
            // 清除后也要查询（显示所有数据）
            loadRecords(1);
        });
    }
    
    // 标记是否点击了应用按钮
    let applyClicked = false;
    let clearClicked = false;
    
    if (applyBtn) {
        applyBtn.addEventListener('mousedown', function() {
            applyClicked = true;
        });
    }
    
    if (clearBtn) {
        clearBtn.addEventListener('mousedown', function() {
            clearClicked = true;
        });
    }
    
    // 检查是否应该清空输入框
    const checkAndReset = () => {
        setTimeout(() => {
            // 如果点击了应用或清除按钮，不执行清空操作
            if (applyClicked || clearClicked) {
                applyClicked = false;
                clearClicked = false;
                return;
            }
            
            // 如果两个输入框都失去焦点，且没有点击应用按钮，则清空
            const startFocused = document.activeElement === startDateInput;
            const endFocused = document.activeElement === endDateInput;
            
            if (!startFocused && !endFocused) {
                if (startDateInput && startDateInput.value !== originalStartDate) {
                    startDateInput.value = '';
                }
                if (endDateInput && endDateInput.value !== originalEndDate) {
                    endDateInput.value = '';
                }
            }
            
            applyClicked = false;
            clearClicked = false;
        }, 200);
    };
    
    if (startDateInput) {
        startDateInput.addEventListener('blur', checkAndReset);
    }
    
    if (endDateInput) {
        endDateInput.addEventListener('blur', checkAndReset);
    }
}

// 初始化主标签页
function initMainTabs() {
    document.querySelectorAll('.main-tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            switchMainTab(tabName);
        });
    });
}

// 切换主标签页
async function switchMainTab(tabName) {
    // 更新按钮状态
    document.querySelectorAll('.main-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`.main-tab-btn[data-tab="${tabName}"]`).classList.add('active');
    
    // 更新内容显示
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`tab-${tabName}`).classList.add('active');
    
    // 滚动到页面顶部
    window.scrollTo({ top: 0, behavior: 'instant' });
    
    // 根据标签页加载相应数据
    if (tabName === 'analysis') {
        // 等待DOM渲染完成后再加载数据，确保图表容器已准备好
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                updateDatePickerDisplay(); // 更新日期选择器显示
                loadAnalysisData();
            });
        });
    } else if (tabName === 'records') {
        loadRecords();
    } else if (tabName === 'home') {
        // 确保回到真正的首页：关闭记账流程浮层和数字键盘，避免“记账一半”时切走再回来还停在浮层
        closeRecordFlow();
        loadStatistics();
        loadTodayRecords(); // 切换到首页时加载今日记录
    }
}

// 初始化时间维度选择器
function initTimeDimensionSelector() {
    document.querySelectorAll('.dimension-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const dimension = this.dataset.dimension;
            switchTimeDimension(dimension);
        });
    });
    // 图表展示方式：前N项+其他 / 全部（value 即 N：6 表示前6项+其他，999 表示全部）
    const displayModeSelect = document.getElementById('chart-display-mode');
    if (displayModeSelect) {
        const syncFromSelect = () => {
            const val = parseInt(displayModeSelect.value, 10);
            if (!isNaN(val)) chartDisplayMaxVisible = val;
        };
        syncFromSelect(); // 初始化时与下拉框默认值一致（前6项 = 6）
        displayModeSelect.addEventListener('change', function() {
            syncFromSelect();
            if (lastCategoryStatsForCharts && lastCategoryStatsForCharts.length > 0) {
                updatePieChart(lastCategoryStatsForCharts).catch(() => {});
                updateBarChart(lastCategoryStatsForCharts).catch(() => {});
            }
        });
    }
    // 初始化日期选择器
    initDatePicker();
}

// 初始化日期选择器
function initDatePicker() {
    // 初始化显示
    updateDatePickerDisplay();
    
    // 为每个日期选择器添加滑动事件
    initDatePickerSwipe('day-date-picker', 'day');
    initDatePickerSwipe('week-date-picker', 'week');
    initDatePickerSwipe('month-date-picker', 'month');
}

// 初始化日期选择器的滑动功能
function initDatePickerSwipe(pickerId, dimension) {
    const picker = document.getElementById(pickerId);
    if (!picker) return;
    
    let startX = 0;
    let currentX = 0;
    let isDragging = false;
    let translateX = 0;
    
    // 触摸事件
    picker.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        isDragging = true;
        picker.classList.add('swiping');
        picker.style.transition = 'none';
    });
    
    picker.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        currentX = e.touches[0].clientX;
        translateX = currentX - startX;
        picker.style.transform = `translateX(${translateX}px)`;
    });
    
    picker.addEventListener('touchend', () => {
        if (!isDragging) return;
        isDragging = false;
        picker.classList.remove('swiping');
        picker.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        
        const threshold = 50; // 滑动阈值
        if (Math.abs(translateX) > threshold) {
            if (translateX > 0) {
                // 向右滑动，切换到上一个
                navigateDatePicker(dimension, -1);
            } else {
                // 向左滑动，切换到下一个
                navigateDatePicker(dimension, 1);
            }
        }
        
        // 重置位置
        translateX = 0;
        picker.style.transform = 'translateX(0)';
    });
    
    // 鼠标事件（用于桌面端）
    picker.addEventListener('mousedown', (e) => {
        startX = e.clientX;
        isDragging = true;
        picker.classList.add('swiping');
        picker.style.transition = 'none';
        e.preventDefault();
    });
    
    picker.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        currentX = e.clientX;
        translateX = currentX - startX;
        picker.style.transform = `translateX(${translateX}px)`;
    });
    
    picker.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        picker.classList.remove('swiping');
        picker.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        
        const threshold = 50;
        if (Math.abs(translateX) > threshold) {
            if (translateX > 0) {
                navigateDatePicker(dimension, -1);
            } else {
                navigateDatePicker(dimension, 1);
            }
        }
        
        translateX = 0;
        picker.style.transform = 'translateX(0)';
    });
    
    picker.addEventListener('mouseleave', () => {
        if (isDragging) {
            isDragging = false;
            picker.classList.remove('swiping');
            picker.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
            translateX = 0;
            picker.style.transform = 'translateX(0)';
        }
    });
}

// 导航日期选择器（direction: -1 减少, 1 增加）
function navigateDatePicker(dimension, direction) {
    const state = datePickerState[dimension];
    
    if (dimension === 'day') {
        state.month += direction;
        if (state.month > 12) {
            state.month = 1;
            state.year += 1;
        } else if (state.month < 1) {
            state.month = 12;
            state.year -= 1;
        }
    } else if (dimension === 'week') {
        // 近N周：1-50周
        state.count += direction;
        if (state.count > 50) {
            state.count = 50;
        } else if (state.count < 1) {
            state.count = 1;
        }
    } else if (dimension === 'month') {
        // 近N月：1-24个月
        state.count += direction;
        if (state.count > 24) {
            state.count = 24;
        } else if (state.count < 1) {
            state.count = 1;
        }
    }
    
    updateDatePickerDisplay();
    loadAnalysisData();
}

// 更新日期选择器显示
function updateDatePickerDisplay() {
    // 隐藏所有日期选择器
    document.querySelectorAll('.date-picker-container').forEach(container => {
        container.style.display = 'none';
    });
    
    // 显示当前维度的日期选择器
    const currentPicker = document.getElementById(`${currentTimeDimension}-date-picker`);
    if (currentPicker) {
        currentPicker.style.display = 'block';
    }
    
    // 更新显示值
    const state = datePickerState[currentTimeDimension];
    if (currentTimeDimension === 'day') {
        document.getElementById('day-year-display').textContent = state.year;
        document.getElementById('day-month-display').textContent = `${state.month}月`;
    } else if (currentTimeDimension === 'week') {
        document.getElementById('week-count-display').textContent = `${state.count}周`;
    } else if (currentTimeDimension === 'month') {
        document.getElementById('month-count-display').textContent = `${state.count}月`;
    }
}

// 切换时间维度
function switchTimeDimension(dimension) {
    // 更新按钮状态
    document.querySelectorAll('.dimension-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const btn = document.querySelector(`.dimension-btn[data-dimension="${dimension}"]`);
    if (btn) {
        btn.classList.add('active');
    }
    
    // 更新当前维度
    currentTimeDimension = dimension;
    
    // 如果切换到新维度，初始化日期为当前日期
    const now = new Date();
    if (dimension === 'day' && !datePickerState.day.year) {
        datePickerState.day = { year: now.getFullYear(), month: now.getMonth() + 1 };
    } else if (dimension === 'week' && !datePickerState.week.count) {
        datePickerState.week = { count: 1 };
    } else if (dimension === 'month' && !datePickerState.month.count) {
        datePickerState.month = { count: 1 };
    }
    
    // 更新日期选择器显示
    updateDatePickerDisplay();
    
    // 加载数据
    loadAnalysisData();
}


// 加载数据分析
async function loadAnalysisData() {
    try {
        const { startDate, endDate } = getCurrentAnalysisDateRange();
        
        let url = `${API_BASE}/statistics?`;
        if (startDate) url += `start_date=${startDate}&`;
        if (endDate) url += `end_date=${endDate}&`;
        
        const response = await authFetch(url);
        const data = await response.json();
        
        // 更新分析统计卡片
        const incomeEl = document.getElementById('analysis-total-income');
        const expenseEl = document.getElementById('analysis-total-expense');
        const balanceEl = document.getElementById('analysis-total-balance');
        
        if (incomeEl) incomeEl.textContent = formatMoney(data.total_income);
        if (expenseEl) expenseEl.textContent = formatMoney(data.total_expense);
        if (balanceEl) balanceEl.textContent = formatMoney(data.balance);
        
        // 强制浏览器重新渲染统计卡片，防止模糊
        if (incomeEl) incomeEl.offsetHeight; // 触发重排
        if (expenseEl) expenseEl.offsetHeight;
        if (balanceEl) balanceEl.offsetHeight;
        
        lastCategoryStatsForCharts = data.category_stats || null;
        await Promise.all([
            updateLineChart(data.daily_stats),
            updatePieChart(data.category_stats),
            updateBarChart(data.category_stats)
        ]);
        
        // 图表更新完成后，在下一帧按正确尺寸重绘（解决移动端首次进入时容器未布局导致模糊）
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (echartsLine) echartsLine.resize();
                if (echartsPie) echartsPie.resize();
                if (echartsBar) echartsBar.resize();
            });
            const chartContainers = document.querySelectorAll('.chart-container');
            chartContainers.forEach(container => {
                container.style.transform = 'translateZ(0)';
            });
        });
    } catch (error) {
        console.error('加载分析数据失败:', error);
        setChartPlaceholder('line-chart', '数据加载失败，请刷新重试', true);
        setChartPlaceholder('pie-chart', '数据加载失败，请刷新重试', true);
        setChartPlaceholder('bar-chart', '数据加载失败，请刷新重试', true);
    }
}

// 获取当前数据分析使用的时间范围（与上方“日/周/月/年/自定义”保持一致）
function getCurrentAnalysisDateRange() {
    let startDate = '';
    let endDate = '';
    
    const state = datePickerState[currentTimeDimension];
    
    if (currentTimeDimension === 'day') {
        // 选中年月的所有天
        const year = state.year;
        const month = state.month;
        startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    } else if (currentTimeDimension === 'week') {
        // 近N周：从N周前的周一开始到今天
        const count = state.count || 1;
        const endDateObj = new Date();
        endDateObj.setHours(23, 59, 59, 999);
        // 找到本周的周一
        const dayOfWeek = endDateObj.getDay() || 7; // 0=周日，转换为7
        const daysToMonday = dayOfWeek - 1;
        const thisWeekMonday = new Date(endDateObj);
        thisWeekMonday.setDate(endDateObj.getDate() - daysToMonday);
        thisWeekMonday.setHours(0, 0, 0, 0);
        
        // 计算N周前的周一
        const startDateObj = new Date(thisWeekMonday);
        startDateObj.setDate(thisWeekMonday.getDate() - (count - 1) * 7);
        
        startDate = getLocalDateString(startDateObj);
        endDate = getLocalDateString(endDateObj);
    } else if (currentTimeDimension === 'month') {
        // 近N月：从N个月前的第一天到今天
        const count = state.count || 1;
        const endDateObj = new Date();
        endDateObj.setHours(23, 59, 59, 999);
        const startDateObj = new Date(endDateObj);
        startDateObj.setMonth(endDateObj.getMonth() - (count - 1));
        startDateObj.setDate(1); // 设置为该月第一天
        startDateObj.setHours(0, 0, 0, 0);
        
        startDate = getLocalDateString(startDateObj);
        endDate = getLocalDateString(endDateObj);
    }
    
    return { startDate, endDate };
}

// 更新柱状图（对比分析）- ECharts SVG 渲染，移动端清晰
async function updateBarChart(categoryStats) {
    if (typeof echarts === 'undefined') {
        setChartPlaceholder('bar-chart', '图表加载失败，请刷新页面', true);
        return;
    }
    if (!categoryStats || categoryStats.length === 0) {
        if (echartsBar) { echartsBar.dispose(); echartsBar = null; }
        setChartPlaceholder('bar-chart', '暂无数据');
        return;
    }
    const aggregated = aggregateCategoryStats(categoryStats, {});
    const sortedStats = aggregated.chartData;
    const total = aggregated.total;
    if (echartsBar) echartsBar.dispose();
    
    // 等待容器准备好后再初始化
    try {
        const dom = await waitForChartContainer('bar-chart', 20, 50);
        dom.innerHTML = '';
        echartsBar = echarts.init(dom, null, getEChartsInitOpts());
        echartsBar.setOption({
            animation: true,
            animationDuration: 400,
            animationEasing: 'cubicOut',
            grid: { left: '8%', right: '4%', top: '8%', bottom: '15%', containLabel: true },
            xAxis: { type: 'category', data: sortedStats.map(c => `${c.icon} ${c.name}`), axisLabel: { fontSize: 10, color: '#666', rotate: 25 }, axisTick: { show: false }, axisLine: { lineStyle: { color: '#e5e7eb' } } },
            yAxis: { type: 'value', min: 0, axisLabel: { fontSize: 10, formatter: v => '¥' + v }, splitLine: { lineStyle: { color: 'rgba(0,0,0,0.05)' } }, axisLine: { show: false }, axisTick: { show: false } },
            series: [{
                type: 'bar',
                data: sortedStats.map((c, i) => ({ value: c.amount, itemStyle: { color: c.color } })),
                barMaxWidth: 44,
                barBorderRadius: [10, 10, 0, 0],
                emphasis: { focus: 'self', itemStyle: { borderColor: '#fff', borderWidth: 2 } }
            }],
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'rgba(0,0,0,0.85)',
                borderColor: 'rgba(255,255,255,0.1)',
                textStyle: { fontSize: 12 },
                formatter: function(params) {
                    if (!params || !params[0]) return '';
                    const idx = params[0].dataIndex;
                    const cat = sortedStats[idx];
                    const val = cat.amount;
                    const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                    return `金额: ¥${val.toFixed(2)} (${pct}%)`;
                }
            }
        });
        echartsBar.on('click', function(params) {
            const idx = params.dataIndex;
            const cat = sortedStats[idx];
            if (!cat) return;
            if (cat._isOther && cat._others && cat._others.length > 0) openOthersDetailModal(cat._others, total);
            else openCategoryDetailFromBarChart(cat);
        });
    } catch (error) {
        console.error('初始化柱状图失败:', error);
        setChartPlaceholder('bar-chart', '图表加载失败，请刷新页面', true);
    }
}

// 从柱状图打开某个分类的明细（趋势 + 记录列表）
async function openCategoryDetailFromBarChart(categoryStat) {
    if (!categoryStat || !categoryStat.category) return;

    const { startDate, endDate } = getCurrentAnalysisDateRange();

    let url = `${API_BASE}/statistics/category_detail?category=${encodeURIComponent(categoryStat.category)}`;
    if (startDate) url += `&start_date=${startDate}`;
    if (endDate) url += `&end_date=${endDate}`;

    try {
        const response = await authFetch(url);
        const data = await response.json();

        if (!response.ok || data.error) {
            console.error('加载分类明细失败:', data.error || response.statusText);
            customAlert(data.error || '加载分类明细失败', '错误', 'error');
            return;
        }

        renderCategoryDetailModal(data);
    } catch (error) {
        console.error('加载分类明细失败:', error);
        customAlert('加载分类明细失败', '错误', 'error');
    }
}

/** 打开「其他」分类明细：请求后端获取小分类汇总 + 具体记录，再展示弹窗 */
async function openOthersDetailModal(others, total) {
    const { startDate, endDate } = getCurrentAnalysisDateRange();
    const categoriesParam = others.map(c => c.category).filter(Boolean).join(',');
    if (!categoriesParam) {
        showOthersDetailModal(others, total, [], null, null);
        return;
    }
    let url = `${API_BASE}/statistics/others_detail?categories=${encodeURIComponent(categoriesParam)}`;
    if (startDate) url += `&start_date=${startDate}`;
    if (endDate) url += `&end_date=${endDate}`;
    try {
        const response = await authFetch(url);
        const data = await response.json().catch(() => ({}));
        if (response.ok && data) {
            const breakdown = data.category_breakdown || others;
            const records = Array.isArray(data.records) ? data.records : [];
            showOthersDetailModal(breakdown, total, records, data.total_amount, null);
            return;
        }
        // 404 等错误：仍展示分类汇总，仅提示详细记录需更新服务端
        const recordsLoadHint = response.status === 404
            ? '详细记录需要更新服务端后查看'
            : (data.error || '详细记录加载失败');
        showOthersDetailModal(others, total, [], null, recordsLoadHint);
        return;
    } catch (error) {
        console.error('加载「其他」明细失败:', error);
        showOthersDetailModal(others, total, [], null, '详细记录加载失败，请稍后重试');
    }
}

/** 显示「其他」分类明细弹窗（小分类汇总 + 具体记录列表，风格与分类明细一致） */
function showOthersDetailModal(others, total, records, totalAmount, recordsLoadHint) {
    const modal = document.getElementById('others-detail-modal');
    const totalEl = document.getElementById('others-detail-total');
    const listEl = document.getElementById('others-detail-list');
    const recordsWrap = document.getElementById('others-detail-records-wrap');
    const recordsEl = document.getElementById('others-detail-records');
    if (!modal || !listEl) return;

    const recordList = Array.isArray(records) ? records : [];
    const otherAmount = totalAmount != null ? Number(totalAmount) : (others && others.reduce) ? others.reduce((s, c) => s + c.amount, 0) : 0;
    if (totalEl) totalEl.textContent = `合计: ¥${otherAmount.toFixed(2)}（占总支出的 ${total > 0 ? ((otherAmount / total) * 100).toFixed(1) : 0}%）`;
    listEl.innerHTML = others.map(c => {
        const pct = total > 0 ? ((c.amount / total) * 100).toFixed(1) : 0;
        return `<li class="others-detail-item"><span class="others-detail-icon">${c.icon || '📦'}</span><span class="others-detail-name">${escapeHtml(c.name)}</span><span class="others-detail-amount">¥${Number(c.amount).toFixed(2)}</span><span class="others-detail-pct">${pct}%</span></li>`;
    }).join('');

    if (recordsWrap && recordsEl) {
        if (recordList.length === 0) {
            if (recordsLoadHint) {
                recordsWrap.style.display = 'block';
                recordsEl.innerHTML = `<div class="others-detail-records-hint">${escapeHtml(recordsLoadHint)}</div>`;
            } else {
                recordsWrap.style.display = 'none';
                recordsEl.innerHTML = '';
            }
        } else {
            recordsWrap.style.display = 'block';
            recordsEl.innerHTML = recordList.map(r => {
                const date = r.date || '';
                const note = r.note || '';
                const displayText = note || (r.category_name || '');
                const amount = Number(r.amount || 0).toFixed(2);
                const icon = r.category_icon || '📦';
                return `
                    <div class="category-detail-record">
                        <div class="category-detail-record-left">
                            <div class="category-detail-record-header">
                                <span class="category-detail-record-icon">${icon}</span>
                                <span class="category-detail-record-date">${date}</span>
                            </div>
                            <div class="category-detail-record-text">${escapeHtml(displayText)}</div>
                        </div>
                        <div class="category-detail-record-amount">¥${amount}</div>
                    </div>
                `;
            }).join('');
        }
    }
    modal.classList.add('show');
}

// 渲染并展示分类明细模态框
async function renderCategoryDetailModal(detailData) {
    const modal = document.getElementById('category-detail-modal');
    if (!modal) return;

    const titleEl = document.getElementById('category-detail-title');
    const totalEl = document.getElementById('category-detail-total-amount');
    const recordsEl = document.getElementById('category-detail-records');

    const category = detailData.category || {};
    const icon = category.icon || '📦';
    const name = category.name || category.key || '分类明细';

    if (titleEl) {
        titleEl.textContent = `${icon} ${name} - 分类明细`;
    }

    if (totalEl) totalEl.textContent = formatMoney(detailData.total_amount ?? 0);

    // 保存完整数据供分页和交互使用
    currentCategoryDetailData = detailData;
    categoryDetailCurrentPage = 1;

    if (recordsEl) {
        renderCategoryDetailRecords();
    }

    // 先显示模态框，等布局完成后再画图表（避免弹窗未显示时容器宽高为 0，图表挤成一团）
    modal.classList.add('show');

    const chartDom = document.getElementById('category-detail-chart');
    if (chartDom && typeof echarts !== 'undefined') {
        const trend = Array.isArray(detailData.daily_trend) ? detailData.daily_trend : [];
        const labels = trend.map(item => item.date);
        const values = trend.map(item => Number(item.amount || 0));
        const recordsByDate = {};
        const records = Array.isArray(detailData.records) ? detailData.records : [];
        records.forEach(r => {
            const date = r.date || '';
            if (!recordsByDate[date]) recordsByDate[date] = [];
            recordsByDate[date].push(r);
        });
        function drawCategoryDetailChart() {
            if (echartsCategoryDetail) echartsCategoryDetail.dispose();
            echartsCategoryDetail = echarts.init(chartDom, null, getEChartsInitOpts());
            // 横轴短日期（与收支趋势一致），避免重叠
            const shortLabels = labels.map(l => {
                const parts = String(l).split('-');
                if (parts.length >= 3) return `${parseInt(parts[1], 10)}/${parseInt(parts[2], 10)}`;
                return l;
            });
            const maxVal = values.length ? Math.max(...values) : 0;
            const yMax = maxVal > 0 ? Math.ceil(maxVal * 1.05) : 100;
            echartsCategoryDetail.setOption({
                animation: true,
                animationDuration: 400,
                animationEasing: 'cubicOut',
                grid: { left: '3%', right: '4%', top: '8%', bottom: '12%', containLabel: true },
                xAxis: { type: 'category', boundaryGap: false, data: shortLabels, axisLabel: { fontSize: 10, color: '#666', interval: 'auto' }, axisLine: { lineStyle: { color: '#e5e7eb' } }, axisTick: { show: false } },
                yAxis: { type: 'value', min: 0, max: yMax, axisLabel: { fontSize: 10, formatter: v => '¥' + v }, splitLine: { lineStyle: { color: 'rgba(0,0,0,0.05)' } }, axisLine: { show: false }, axisTick: { show: false } },
                series: [{
                    type: 'line',
                    data: values,
                    smooth: 0.35,
                    symbol: 'circle',
                    symbolSize: 8,
                    lineStyle: { width: 2.5, color: '#ef4444', cap: 'round', join: 'round' },
                    itemStyle: { color: '#ef4444', borderColor: '#fff', borderWidth: 1 },
                    areaStyle: { color: 'rgba(239,68,68,0.15)' },
                    emphasis: { focus: 'self', scale: true, scaleSize: 8, itemStyle: { borderColor: '#fff', borderWidth: 2 } }
                }],
                tooltip: {
                    trigger: 'axis',
                    backgroundColor: 'rgba(15,23,42,0.9)',
                    textStyle: { fontSize: 11 },
                    formatter: function(params) {
                        if (!params || !params[0]) return '';
                        const idx = params[0].dataIndex;
                        const date = labels[idx];
                        const dayRecords = date && recordsByDate[date] ? recordsByDate[date] : [];
                        return date + (dayRecords.length ? `<br/>共 ${dayRecords.length} 条记录` : '');
                    }
                }
            });
            echartsCategoryDetail.off('click');
            echartsCategoryDetail.on('click', function(params) {
                const idx = params.dataIndex;
                const date = labels[idx];
                if (date && recordsByDate[date]) showDateRecordsInChart(date, recordsByDate[date], category, params.event && params.event.event ? params.event.event : null);
            });
        }
        requestAnimationFrame(function() {
            requestAnimationFrame(drawCategoryDetailChart);
        });
    }
}

// 渲染分类明细记录列表（支持分页）
function renderCategoryDetailRecords() {
    const recordsEl = document.getElementById('category-detail-records');
    if (!recordsEl || !currentCategoryDetailData) return;

    const records = Array.isArray(currentCategoryDetailData.records) ? currentCategoryDetailData.records : [];
    const category = currentCategoryDetailData.category || {};
    const icon = category.icon || '📦';
    const name = category.name || category.key || '分类';

    if (records.length === 0) {
        recordsEl.innerHTML = '<div class="analysis-empty-tip">当前时间范围内没有该分类的记录。</div>';
        return;
    }

    // 分页计算
    const totalPages = Math.ceil(records.length / categoryDetailPageSize);
    const startIndex = (categoryDetailCurrentPage - 1) * categoryDetailPageSize;
    const endIndex = startIndex + categoryDetailPageSize;
    const pageRecords = records.slice(startIndex, endIndex);

    // 渲染记录列表
    const recordsHtml = pageRecords.map(r => {
        const date = r.date || '';
        const note = r.note || '';
        const displayText = note || name; // 没有备注就显示分类名称
        const amount = Number(r.amount || 0).toFixed(2);
        
        return `
            <div class="category-detail-record">
                <div class="category-detail-record-left">
                    <div class="category-detail-record-header">
                        <span class="category-detail-record-icon">${icon}</span>
                        <span class="category-detail-record-date">${date}</span>
                    </div>
                    <div class="category-detail-record-text">${displayText}</div>
                </div>
                <div class="category-detail-record-amount">¥${amount}</div>
            </div>
        `;
    }).join('');

    // 分页控件
    let paginationHtml = '';
    if (totalPages > 1) {
        const prevDisabled = categoryDetailCurrentPage === 1 ? 'disabled' : '';
        const nextDisabled = categoryDetailCurrentPage === totalPages ? 'disabled' : '';
        
        paginationHtml = `
            <div class="category-detail-pagination">
                <button class="category-detail-pagination-btn" ${prevDisabled} onclick="categoryDetailChangePage(${categoryDetailCurrentPage - 1})">
                    <span>上一页</span>
                </button>
                <span class="category-detail-pagination-info">第 ${categoryDetailCurrentPage} / ${totalPages} 页</span>
                <button class="category-detail-pagination-btn" ${nextDisabled} onclick="categoryDetailChangePage(${categoryDetailCurrentPage + 1})">
                    <span>下一页</span>
                </button>
            </div>
        `;
    }

    recordsEl.innerHTML = `
        <div class="category-detail-records-list">
            ${recordsHtml}
        </div>
        ${paginationHtml}
    `;
    
    // 防止滚动穿透：当在表格内滚动时，阻止事件传播到背景页面
    let touchStartY = 0;
    let lastScrollTop = recordsEl.scrollTop;
    
    recordsEl.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
        lastScrollTop = recordsEl.scrollTop;
    }, { passive: true });
    
    recordsEl.addEventListener('touchmove', (e) => {
        const currentY = e.touches[0].clientY;
        const deltaY = currentY - touchStartY;
        const { scrollTop, scrollHeight, clientHeight } = recordsEl;
        const isAtTop = scrollTop === 0;
        const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1;
        
        // 如果表格可以滚动，且不在边界处，或者虽然在边界但滚动方向是向内的，都阻止传播
        if (scrollHeight > clientHeight) {
            if (!isAtTop && !isAtBottom) {
                // 在中间位置，完全阻止传播
                e.stopPropagation();
            } else if (isAtTop && deltaY > 0) {
                // 在顶部且向下滑动，阻止传播（防止继续向下滚动背景）
                e.stopPropagation();
            } else if (isAtBottom && deltaY < 0) {
                // 在底部且向上滑动，阻止传播（防止继续向上滚动背景）
                e.stopPropagation();
            }
        } else {
            // 表格内容不足以滚动，完全阻止传播
            e.stopPropagation();
        }
    }, { passive: false });
    
    // 鼠标滚轮事件处理（桌面端）
    recordsEl.addEventListener('wheel', (e) => {
        const { scrollTop, scrollHeight, clientHeight } = recordsEl;
        const isAtTop = scrollTop === 0;
        const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1;
        
        // 如果表格可以滚动，且不在边界处，或者虽然在边界但滚动方向是向内的，都阻止传播
        if (scrollHeight > clientHeight) {
            if (!isAtTop && !isAtBottom) {
                // 在中间位置，完全阻止传播
                e.stopPropagation();
            } else if (isAtTop && e.deltaY < 0) {
                // 在顶部且向上滚动，阻止传播
                e.stopPropagation();
            } else if (isAtBottom && e.deltaY > 0) {
                // 在底部且向下滚动，阻止传播
                e.stopPropagation();
            }
        } else {
            // 表格内容不足以滚动，完全阻止传播
            e.stopPropagation();
        }
    }, { passive: false });
}

// 分类明细分页切换
function categoryDetailChangePage(page) {
    if (!currentCategoryDetailData) return;
    const records = Array.isArray(currentCategoryDetailData.records) ? currentCategoryDetailData.records : [];
    const totalPages = Math.ceil(records.length / categoryDetailPageSize);
    
    if (page < 1 || page > totalPages) return;
    
    categoryDetailCurrentPage = page;
    renderCategoryDetailRecords();
    
    // 滚动到列表顶部
    const recordsEl = document.getElementById('category-detail-records');
    if (recordsEl) {
        recordsEl.scrollTop = 0;
    }
}

// 在折线图上显示某日的记录（点击或悬停时）
function showDateRecordsInChart(date, dayRecords, category, event) {
    if (!dayRecords || dayRecords.length === 0) return;
    
    const icon = category.icon || '📦';
    const name = category.name || category.key || '分类';
    
    // 创建或更新悬浮提示框
    let tooltipEl = document.getElementById('chart-date-tooltip');
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.id = 'chart-date-tooltip';
        tooltipEl.className = 'chart-date-tooltip';
        document.body.appendChild(tooltipEl);
    }
    
    const recordsHtml = dayRecords.map(r => {
        const note = r.note || name;
        const amount = Number(r.amount || 0).toFixed(2);
        return `
            <div class="chart-date-tooltip-record">
                <span class="chart-date-tooltip-icon">${icon}</span>
                <span class="chart-date-tooltip-text">${note}</span>
                <span class="chart-date-tooltip-amount">¥${amount}</span>
            </div>
        `;
    }).join('');
    
    const totalAmount = dayRecords.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    
    tooltipEl.innerHTML = `
        <div class="chart-date-tooltip-header">
            <span class="chart-date-tooltip-date">${date}</span>
            <span class="chart-date-tooltip-total">合计: ¥${totalAmount.toFixed(2)}</span>
        </div>
        <div class="chart-date-tooltip-records">
            ${recordsHtml}
        </div>
    `;
    
    tooltipEl.style.display = 'block';
    
    // 定位提示框（跟随鼠标/触摸位置）
    if (event) {
        const x = event.clientX || (event.touches && event.touches[0]?.clientX) || 0;
        const y = event.clientY || (event.touches && event.touches[0]?.clientY) || 0;
        const tooltipWidth = tooltipEl.offsetWidth || 280;
        const tooltipHeight = tooltipEl.offsetHeight || 200;
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        
        let left = x + 10;
        let top = y + 10;
        
        // 防止超出右边界
        if (left + tooltipWidth > windowWidth) {
            left = x - tooltipWidth - 10;
        }
        // 防止超出下边界
        if (top + tooltipHeight > windowHeight) {
            top = y - tooltipHeight - 10;
        }
        // 防止超出左边界
        if (left < 0) {
            left = 10;
        }
        // 防止超出上边界
        if (top < 0) {
            top = 10;
        }
        
        tooltipEl.style.left = `${left}px`;
        tooltipEl.style.top = `${top}px`;
    }
    
    // 清除之前的自动隐藏定时器
    clearTimeout(window.chartTooltipTimeout);
    // 触摸时延长显示时间
    const timeout = event && (event.type === 'touchstart' || event.type === 'touchmove') ? 5000 : 3000;
    window.chartTooltipTimeout = setTimeout(() => {
        if (tooltipEl) {
            tooltipEl.style.display = 'none';
        }
    }, timeout);
}

// 自定义键盘相关变量
let numberKeyboardValue = '0.00';
let numberKeyboardExpression = '';
let selectedRecordDate = null; // 记账时选择的日期，null表示使用今天

// 绑定事件
function bindEvents() {
    // 记账按钮点击事件 - 先打开记账流程（选分类），选完再进金额
    const btnOpenKeyboard = document.getElementById('btn-open-keyboard');
    if (btnOpenKeyboard) {
        btnOpenKeyboard.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            openRecordFlow();
        });
    }
    bindRecordFlowEvents();
    
    // 编辑模态框中的金额输入框
    const editAmountInput = document.getElementById('edit-amount');
    if (editAmountInput) {
        editAmountInput.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            openNumberKeyboard('edit-amount');
        });
        editAmountInput.addEventListener('focus', function(e) {
            e.preventDefault();
            this.blur();
            openNumberKeyboard('edit-amount');
        });
    }
    
    // 编辑模态框中的备注输入框 - 打开键盘并聚焦到备注输入框
    const editNoteInput = document.getElementById('edit-note');
    if (editNoteInput) {
        editNoteInput.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            openNumberKeyboard('edit-amount');
            // 打开键盘后，聚焦到键盘中的备注输入框
            setTimeout(() => {
                const keyboardNoteInput = document.getElementById('keyboard-note-input');
                if (keyboardNoteInput) {
                    keyboardNoteInput.focus();
                }
            }, 300);
        });
        editNoteInput.addEventListener('focus', function(e) {
            e.preventDefault();
            this.blur();
            openNumberKeyboard('edit-amount');
            setTimeout(() => {
                const keyboardNoteInput = document.getElementById('keyboard-note-input');
                if (keyboardNoteInput) {
                    keyboardNoteInput.focus();
                }
            }, 300);
        });
    }
    
    // 确保键盘中的备注输入框可以正常使用系统键盘
    const keyboardNoteInput = document.getElementById('keyboard-note-input');
    if (keyboardNoteInput) {
        // 允许正常聚焦，使用系统键盘
        keyboardNoteInput.addEventListener('focus', function() {
            // 不做任何阻止，让系统键盘正常弹出
        });
    }
    
    // 初始化键盘事件
    initKeyboardEvents();
    
    // 类型切换按钮（首页与记账流程内共用，流程内需同步更新流程分类列表）
    document.querySelectorAll('.type-btn-compact').forEach(btn => {
        btn.addEventListener('click', function() {
            // 移除同组 active：首页一组，流程内一组
            const isFlow = this.dataset.context === 'record-flow';
            document.querySelectorAll(isFlow ? '.type-btn-compact[data-context="record-flow"]' : '.type-btn-compact:not([data-context])').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            const type = this.dataset.type;
            document.getElementById('record-type').value = type;
            if (isFlow) {
                updateRecordFlowCategorySelector();
                document.querySelectorAll('.type-btn-compact:not([data-context])').forEach(b => b.classList.toggle('active', b.dataset.type === type));
            } else {
                document.querySelectorAll('.type-btn-compact[data-context="record-flow"]').forEach(b => b.classList.toggle('active', b.dataset.type === type));
            }
        });
    });
    
    
    
    // 记录列表：点击图标 → 改分类；点击名字 → 改备注；点击金额 → 改金额；点击空白 → 改日期；点击删除 → 删除
    const recordsListEl = document.getElementById('records-list');
    if (recordsListEl) {
        recordsListEl.addEventListener('click', (e) => {
            const recordItem = e.target.closest('.record-item');
            if (!recordItem) return;
            if (e.target.closest('.record-actions')) return;
            if (e.target.closest('.editable')) return;
            e.preventDefault();
            e.stopPropagation();
            editRecordDate(recordItem);
        });
    }
    
    // 导出导入
    document.getElementById('btn-export').addEventListener('click', handleExport);
    document.getElementById('file-import').addEventListener('change', handleImport);
    
    // 分类管理模态框
    document.getElementById('category-modal').addEventListener('click', (e) => {
        if (e.target.id === 'category-modal') {
            closeCategoryModal();
        }
    });
    
    // 分类标签切换
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tab = this.dataset.tab;
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            document.querySelectorAll('.category-list').forEach(list => list.classList.remove('active'));
            document.getElementById(`category-list-${tab}`).classList.add('active');
            document.getElementById('new-category-type').value = tab;
            loadCategoryList(tab);
        });
    });
    
    // 添加分类表单
    document.getElementById('add-category-form').addEventListener('submit', handleAddCategory);
    
    // 编辑分类表单
    document.getElementById('edit-category-form').addEventListener('submit', handleEditCategory);
    
    // 图标选择器
    document.getElementById('icon-selector-btn').addEventListener('click', openIconPicker);
    document.getElementById('edit-icon-selector-btn').addEventListener('click', function() {
        openIconPicker('edit');
    });
    
    // 图标选择器模态框
    document.getElementById('icon-picker-modal').addEventListener('click', (e) => {
        if (e.target.id === 'icon-picker-modal') {
            closeIconPicker();
        }
    });
    
    document.querySelectorAll('#icon-picker-modal .modal-close').forEach(btn => {
        btn.addEventListener('click', closeIconPicker);
    });
    
    // 初始化图标选择器
    initIconPicker();
    
    // 模态框
    document.querySelectorAll('.modal-close, .modal-close-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            if (this.closest('#category-modal')) {
                closeCategoryModal();
            } else if (this.closest('#edit-category-modal')) {
                document.getElementById('edit-category-modal').classList.remove('show');
            } else {
                closeModal();
            }
        });
    });
    
    // 编辑分类模态框点击外部关闭
    document.getElementById('edit-category-modal').addEventListener('click', (e) => {
        if (e.target.id === 'edit-category-modal') {
            document.getElementById('edit-category-modal').classList.remove('show');
        }
    });
    
    // 点击模态框外部关闭
    document.getElementById('edit-modal').addEventListener('click', (e) => {
        if (e.target.id === 'edit-modal') {
            closeModal();
        }
    });

    // 分类明细模态框：点击遮罩关闭
    const categoryDetailModal = document.getElementById('category-detail-modal');
    if (categoryDetailModal) {
        categoryDetailModal.addEventListener('click', (e) => {
            if (e.target.id === 'category-detail-modal') closeModal();
        });
    }
    // 「其他」明细弹窗：点击遮罩关闭
    const othersDetailModal = document.getElementById('others-detail-modal');
    if (othersDetailModal) {
        othersDetailModal.addEventListener('click', (e) => {
            if (e.target.id === 'others-detail-modal') closeModal();
        });
    }
    
    // 编辑表单
    document.getElementById('edit-form').addEventListener('submit', handleUpdateRecord);
    // 编辑模态框内「选择日期」使用与记账相同的日期选择弹窗
    const editDateBtn = document.getElementById('edit-date-btn');
    if (editDateBtn) {
        editDateBtn.addEventListener('click', () => {
            const editDateInput = document.getElementById('edit-date');
            const editDateDisplay = document.getElementById('edit-date-display');
            const currentVal = (editDateInput && editDateInput.value) || getLocalDateString();
            openSharedDatePicker({
                initialValue: currentVal,
                title: '选择日期',
                onConfirm: (newDate) => {
                    if (editDateInput) editDateInput.value = newDate;
                    if (editDateDisplay) editDateDisplay.textContent = formatDateDisplayString(newDate);
                }
            });
        });
    }
}

// 加载分类
async function loadCategories() {
    try {
        const response = await authFetch(`${API_BASE}/categories`);
        categories = await response.json();
        updateEditCategorySelect();
    } catch (error) {
        console.error('加载分类失败:', error);
    }
}

// ========== 记账流程（先选分类 → 再输入金额）==========
function openRecordFlow() {
    const overlay = document.getElementById('record-flow-overlay');
    const sheet = document.getElementById('record-flow-sheet');
    if (!overlay || !sheet) return;
    document.getElementById('category-selected-value').value = '';
    sheet.classList.remove('record-flow-step-2-active');
    updateRecordFlowCategorySelector();
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
}

function closeRecordFlow() {
    const overlay = document.getElementById('record-flow-overlay');
    const sheet = document.getElementById('record-flow-sheet');
    if (!overlay || !sheet) return;
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
    sheet.classList.remove('record-flow-step-2-active');
    closeNumberKeyboard();
}

function goToRecordFlowStep2() {
    const sheet = document.getElementById('record-flow-sheet');
    const categoryValue = document.getElementById('category-selected-value').value;
    if (!categoryValue || !sheet) return;
    const typeInput = document.getElementById('record-type');
    const type = typeInput ? typeInput.value : 'expense';
    const categoryList = categories[type] || [];
    const cat = categoryList.find(c => (c.id && c.id.toString() === categoryValue) || c.name === categoryValue);
    const name = cat ? (cat.name || cat.id) : categoryValue;
    const icon = cat ? (cat.icon || '') : '';
    const el = document.getElementById('record-flow-selected-category');
    if (el) el.innerHTML = `<span class="category-btn-icon">${icon}</span><span>${name}</span>`;
    sheet.classList.add('record-flow-step-2-active');
    const amountVal = document.getElementById('record-amount').value;
    const displayVal = (amountVal && amountVal !== '0') ? parseFloat(amountVal.replace(/[¥\s]/g, '')).toFixed(2) : '0.00';
    const amountValueEl = document.getElementById('record-flow-amount-value');
    if (amountValueEl) amountValueEl.textContent = displayVal;
    setTimeout(function() {
        openNumberKeyboard('record-amount');
    }, 320);
}

function goToRecordFlowStep1() {
    const sheet = document.getElementById('record-flow-sheet');
    if (!sheet) return;
    closeNumberKeyboard();
    sheet.classList.remove('record-flow-step-2-active');
}

function updateRecordFlowCategorySelector() {
    const typeInput = document.getElementById('record-type');
    const type = typeInput ? typeInput.value : 'expense';
    const categoryList = categories[type] || [];
    const container = document.getElementById('record-flow-category-selector');
    if (!container) return;
    const sortedList = [...categoryList].sort((a, b) => {
        const orderA = a.sort_order || 0, orderB = b.sort_order || 0;
        if (orderA !== orderB) return orderB - orderA;
        return (a.id || 0) - (b.id || 0);
    });
    container.innerHTML = sortedList.map(cat => {
        const isOther = cat.name === '其他';
        return `<button type="button" class="category-btn ${isOther ? 'category-other' : ''}" data-category="${cat.id || cat.name}" data-color="${cat.color}" data-is-other="${isOther}">
            <span class="category-btn-icon">${cat.icon}</span>
            <span class="category-btn-text">${cat.name}</span>
        </button>`;
    }).join('');
    container.querySelectorAll('.category-btn').forEach(btn => {
        const isOther = btn.dataset.isOther === 'true';
        btn.addEventListener('click', function(e) {
            if (isOther && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                openCategoryModal();
                return;
            }
            container.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            document.getElementById('category-selected-value').value = this.dataset.category;
            // 选完分类自动进入输入金额页
            goToRecordFlowStep2();
        });
        if (isOther) {
            btn.addEventListener('contextmenu', function(e) { e.preventDefault(); openCategoryModal(); });
            let longPressTimer = null;
            btn.addEventListener('mousedown', function() {
                longPressTimer = setTimeout(function() { longPressTimer = null; openCategoryModal(); }, 800);
            });
            btn.addEventListener('mouseup', function() { if (longPressTimer) clearTimeout(longPressTimer); longPressTimer = null; });
            btn.addEventListener('mouseleave', function() { if (longPressTimer) clearTimeout(longPressTimer); longPressTimer = null; });
            btn.addEventListener('touchstart', function(e) {
                longPressTimer = setTimeout(function() { e.preventDefault(); longPressTimer = null; openCategoryModal(); }, 800);
            });
            btn.addEventListener('touchend', function() { if (longPressTimer) clearTimeout(longPressTimer); longPressTimer = null; });
        }
    });
    // 切换类型后清空选择，需重新选分类
    document.getElementById('category-selected-value').value = '';
}

function bindRecordFlowEvents() {
    const btnClose = document.getElementById('record-flow-close');
    const btnBack = document.getElementById('record-flow-back');
    const amountTap = document.getElementById('record-flow-amount-tap');
    const sheet = document.getElementById('record-flow-sheet');
    if (btnClose) btnClose.addEventListener('click', closeRecordFlow);
    if (btnBack) btnBack.addEventListener('click', goToRecordFlowStep1);
    // 右滑返回上一级：Step2 回到选择分类，Step1 关闭流程
    var swipeStartX = 0, swipeStartY = 0;
    var SWIPE_THRESHOLD = 60;
    var SWIPE_MAX_VERTICAL_RATIO = 0.5; // 垂直位移不超过水平的此比例，避免和列表滚动冲突
    if (sheet) {
        sheet.addEventListener('touchstart', function(e) {
            if (e.touches.length !== 1) return;
            swipeStartX = e.touches[0].clientX;
            swipeStartY = e.touches[0].clientY;
        }, { passive: true });
        sheet.addEventListener('touchend', function(e) {
            if (e.changedTouches.length !== 1) return;
            var endX = e.changedTouches[0].clientX;
            var endY = e.changedTouches[0].clientY;
            var deltaX = endX - swipeStartX;
            var deltaY = endY - swipeStartY;
            // 右滑：从左往右划，且水平距离足够、以水平为主
            if (deltaX >= SWIPE_THRESHOLD && Math.abs(deltaY) <= Math.abs(deltaX) * SWIPE_MAX_VERTICAL_RATIO) {
                var isStep2 = sheet.classList.contains('record-flow-step-2-active');
                if (isStep2) {
                    goToRecordFlowStep1();
                } else {
                    closeRecordFlow();
                }
            }
        }, { passive: true });
    }
    // 点击/触摸金额区域打开数字键盘（移动端用 touchend 更可靠）
    function openKeyboardFromAmountTap(e) {
        e.preventDefault();
        e.stopPropagation();
        const keyboard = document.getElementById('number-keyboard');
        if (keyboard && keyboard.classList.contains('show')) return;
        openNumberKeyboard('record-amount');
    }
    if (amountTap) {
        amountTap.addEventListener('click', openKeyboardFromAmountTap);
        amountTap.addEventListener('touchend', openKeyboardFromAmountTap, { passive: false });
        amountTap.style.cursor = 'pointer';
    }
}

// 更新编辑表单的分类选择
function updateEditCategorySelect() {
    const select = document.getElementById('edit-category');
    select.innerHTML = '';
    
    // 添加支出分类
    categories.expense.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.id;
        option.textContent = `${cat.icon} ${cat.name}`;
        select.appendChild(option);
    });
    
    // 添加收入分类
    categories.income.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.id;
        option.textContent = `${cat.icon} ${cat.name}`;
        select.appendChild(option);
    });
}

// 添加记录
async function handleAddRecord(e) {
    if (e) {
        e.preventDefault();
    }
    
    const typeInput = document.getElementById('record-type');
    const categoryValue = document.getElementById('category-selected-value').value;
    if (!categoryValue) {
        customAlert('请选择分类', '提示', 'warning');
        return;
    }
    
    // 查找分类名称
    const type = typeInput ? typeInput.value : 'expense';
    const categoryList = categories[type] || [];
    const cat = categoryList.find(c => (c.id && c.id.toString() === categoryValue) || c.name === categoryValue);
    const categoryName = cat ? (cat.name || cat.id) : categoryValue;
    
    // 获取金额值，处理可能的加减运算
    let amountValue = document.getElementById('record-amount').value;
    amountValue = amountValue.replace(/[¥\s]/g, '');
    if (amountValue && ['+', '-'].some(op => amountValue.includes(op))) {
        try {
            amountValue = eval(amountValue.replace(/\s+/g, ' ').trim()).toString();
        } catch (e) {
            console.error('金额计算错误:', e);
            customAlert('金额格式错误，请重新输入', '输入错误', 'warning');
            return;
        }
    }
    
    const amount = parseFloat(amountValue);
    if (isNaN(amount) || amount <= 0) {
        customAlert('请输入有效的金额', '输入错误', 'warning');
        return;
    }
    
    // 使用选择的日期，如果没有选择则使用今天
    const recordDate = selectedRecordDate || getLocalDateString();
    
    const formData = {
        date: recordDate,
        type: typeInput ? typeInput.value : 'expense',
        amount: amount,
        category: categoryName,
        note: document.getElementById('record-note').value.trim()
    };
    
    try {
        const response = await authFetch(`${API_BASE}/records`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            // 关闭键盘（如果打开）
            closeNumberKeyboard();
            
            // 重置表单
            document.getElementById('quick-add-form').reset();
            document.getElementById('record-amount').value = '';
            document.getElementById('record-note').value = '';
            // 重置键盘状态
            numberKeyboardValue = '0.00';
            numberKeyboardExpression = '';
            selectedRecordDate = getLocalDateString(); // 重置日期选择为今天
            // 重置键盘中的备注输入框
            const keyboardNoteInput = document.getElementById('keyboard-note-input');
            if (keyboardNoteInput) {
                keyboardNoteInput.value = '';
            }
            // 重置日期选择按钮状态为今天
            document.querySelectorAll('.keyboard-date-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            const todayBtn = document.querySelector('.keyboard-date-btn[data-date-offset="0"]');
            if (todayBtn) {
                todayBtn.classList.add('active');
            }
            // 重置类型选择为支出
            document.querySelectorAll('.type-btn-compact').forEach(btn => {
                btn.classList.remove('active');
                if (btn.dataset.type === 'expense') {
                    btn.classList.add('active');
                }
            });
            document.getElementById('record-type').value = 'expense';
            
            // 重新加载数据
            loadStatistics();
            loadTodayRecords(); // 刷新今日记录
            // 如果当前在记录列表标签页，也重新加载记录
            if (document.getElementById('tab-records').classList.contains('active')) {
                loadRecords();
            }
            // 如果当前在数据分析标签页，也重新加载分析数据
            if (document.getElementById('tab-analysis').classList.contains('active')) {
                loadAnalysisData();
            }
            
            // 提示
            showMessage('添加成功！', 'success');
        } else {
            customAlert(result.error || '添加失败', '添加失败', 'error');
        }
    } catch (error) {
        console.error('添加记录失败:', error);
        customAlert('添加失败，请重试', '错误', 'error');
    }
}

// 加载今日记录
async function loadTodayRecords() {
    try {
        const today = getLocalDateString();
        const url = `${API_BASE}/records?start_date=${today}&end_date=${today}&per_page=100`;
        
        const response = await authFetch(url);
        const data = await response.json();
        
        renderTodayRecords(data.records || []);
    } catch (error) {
        console.error('加载今日记录失败:', error);
        const container = document.getElementById('today-records-list');
        if (container) {
            container.innerHTML = '<div class="loading">加载失败</div>';
        }
    }
}

// 渲染今日记录
function renderTodayRecords(records) {
    const container = document.getElementById('today-records-list');
    if (!container) return;
    
    if (records.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 20px; text-align: center; color: #999; font-size: 12px;">
                <div>今天还没有记账记录</div>
            </div>
        `;
        return;
    }
    
    let html = '';
    records.forEach(record => {
        // 查找分类
        const category = [...categories.expense, ...categories.income].find(
            c => (c.id && c.id.toString() === record.category) || c.name === record.category
        );
        const icon = category?.icon || '📦';
        const name = category?.name || record.category;
        const typeClass = record.type === 'income' ? 'income' : 'expense';
        
        // 如果有备注，显示备注；否则显示类别
        const displayName = record.note ? escapeHtml(record.note) : name;
        
        html += `
            <div class="today-record-item">
                <div class="today-record-icon">${icon}</div>
                <div class="today-record-info">
                    <div class="today-record-category">${displayName}</div>
                </div>
                <div class="today-record-amount ${typeClass}">
                    ${record.type === 'income' ? '+' : '-'}¥${parseFloat(record.amount).toFixed(2)}
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// 加载统计数据（首页统计）
async function loadStatistics() {
    try {
        // 首页统计按当月统计
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth(); // 0-11

        // 当月第一天
        const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        // 当月最后一天：下个月的第 0 天
        const lastDay = new Date(year, month + 1, 0).getDate();
        const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        let url = `${API_BASE}/statistics?start_date=${startDate}&end_date=${endDate}`;
        
        const response = await authFetch(url);
        const data = await response.json();
        
        // 更新统计卡片
        document.getElementById('total-income').textContent = formatMoney(data.total_income);
        document.getElementById('total-expense').textContent = formatMoney(data.total_expense);
        document.getElementById('total-balance').textContent = formatMoney(data.balance);
        
        // 更新当日支出（如果存在）
        const todayExpenseEl = document.getElementById('today-expense');
        if (todayExpenseEl && data.today_expense !== undefined) {
            todayExpenseEl.textContent = formatMoney(data.today_expense);
        }
        
        lastCategoryStatsForCharts = data.category_stats || null;
        setTimeout(() => {
            updateLineChart(data.daily_stats).catch(err => console.error('更新折线图失败:', err));
            updatePieChart(data.category_stats).catch(err => console.error('更新饼图失败:', err));
            updateBarChart(data.category_stats).catch(err => console.error('更新柱状图失败:', err));
        }, 100);
    } catch (error) {
        console.error('加载统计数据失败:', error);
    }
}


// 更新折线图（收支趋势）- ECharts SVG 渲染，移动端清晰
// 获取某日的记录并按分类分组
let dailyRecordsCache = {}; // 缓存每日记录数据
let preloadPromise = null; // 预加载Promise，避免重复预加载

// 预加载所有日期的分类数据
async function preloadDailyCategoryData(dailyStats) {
    if (!dailyStats || dailyStats.length === 0) return;
    
    // 如果正在预加载，等待完成
    if (preloadPromise) {
        await preloadPromise;
        return;
    }
    
    // 开始预加载
    preloadPromise = (async () => {
        const dates = dailyStats.map(d => d.date);
        const uncachedDates = dates.filter(date => !dailyRecordsCache[date]);
        
        if (uncachedDates.length === 0) {
            preloadPromise = null;
            return; // 所有数据都已缓存
        }
        
        // 批量查询（每次查询一个日期，但并发执行）
        const promises = uncachedDates.map(date => getDailyRecordsByCategory(date, false));
        
        try {
            await Promise.all(promises);
        } catch (error) {
            console.error('预加载分类数据失败:', error);
        }
        
        preloadPromise = null;
    })();
    
    // 不等待预加载完成，让它在后台执行
    preloadPromise.catch(() => {
        preloadPromise = null;
    });
}

async function getDailyRecordsByCategory(date, useCache = true) {
    // 检查缓存
    if (useCache && dailyRecordsCache[date]) {
        return dailyRecordsCache[date];
    }
    
    try {
        const response = await authFetch(`${API_BASE}/records?start_date=${date}&end_date=${date}&per_page=1000`);
        const data = await response.json();
        const records = data.records || [];
        
        // 按分类分组
        const categoryGroups = {};
        records.forEach(record => {
            const categoryName = record.category || '未分类';
            if (!categoryGroups[categoryName]) {
                categoryGroups[categoryName] = {
                    name: categoryName,
                    icon: '📦',
                    color: '#C7CEEA',
                    amount: 0,
                    count: 0,
                    type: record.type
                };
                
                // 查找分类信息
                const allCategories = [...categories.expense, ...categories.income];
                const categoryInfo = allCategories.find(c => c.name === categoryName || c.id === categoryName);
                if (categoryInfo) {
                    categoryGroups[categoryName].icon = categoryInfo.icon || '📦';
                    categoryGroups[categoryName].color = categoryInfo.color || '#C7CEEA';
                }
            }
            categoryGroups[categoryName].amount += Number(record.amount || 0);
            categoryGroups[categoryName].count += 1;
        });
        
        // 转换为数组并排序
        const result = Object.values(categoryGroups).sort((a, b) => b.amount - a.amount);
        
        // 缓存结果（5分钟过期）
        dailyRecordsCache[date] = result;
        setTimeout(() => {
            delete dailyRecordsCache[date];
        }, 5 * 60 * 1000);
        
        return result;
    } catch (error) {
        console.error('获取每日记录失败:', error);
        return [];
    }
}

// 显示日期详情 tooltip
let currentTooltipData = null;
let hideOnOutsideClickHandler = null;
let tooltipAnimationFrame = null;
let isTouchMoving = false; // 标记是否正在触摸移动
function showDateDetailTooltip(date, categoryGroups, event) {
    if (!categoryGroups || categoryGroups.length === 0) {
        hideDateDetailTooltip();
        return;
    }
    
    // 取消之前的动画
    if (tooltipAnimationFrame) {
        cancelAnimationFrame(tooltipAnimationFrame);
    }
    
    // 创建或获取 tooltip 元素
    let tooltipEl = document.getElementById('date-detail-tooltip');
    const isNewTooltip = !tooltipEl;
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.id = 'date-detail-tooltip';
        tooltipEl.className = 'date-detail-tooltip';
        document.body.appendChild(tooltipEl);
    }
    
    // 保存数据
    currentTooltipData = {
        date: date,
        categoryGroups: categoryGroups
    };
    // 计算总收入和总支出
    let totalIncome = 0;
    let totalExpense = 0;
    categoryGroups.forEach(group => {
        if (group.type === 'income') {
            totalIncome += group.amount;
        } else {
            totalExpense += group.amount;
        }
    });
    
    // 格式化日期显示
    const dateObj = new Date(date);
    const month = dateObj.getMonth() + 1;
    const day = dateObj.getDate();
    const dateStr = `${month}月${day}日`;
    
    // 先移除旧的事件监听器（通过克隆节点）
    const oldTooltipEl = tooltipEl;
    const newTooltipEl = tooltipEl.cloneNode(false); // 只克隆节点本身，不克隆内容
    oldTooltipEl.parentNode.replaceChild(newTooltipEl, oldTooltipEl);
    tooltipEl = newTooltipEl;
    
    // 渲染 tooltip 内容
    renderTooltipContent(tooltipEl, dateStr, totalIncome, totalExpense, categoryGroups);
    
    // 定位 tooltip（触摸移动时不使用平滑动画，直接跟随）
    if (event) {
        const x = event.clientX || (event.touches && event.touches[0]?.clientX) || 0;
        const y = event.clientY || (event.touches && event.touches[0]?.clientY) || 0;
        if (x > 0 && y > 0) {
            // 如果是触摸移动，不使用平滑动画，直接定位
            if (isTouchMoving) {
                positionTooltipInstant(tooltipEl, x, y, isNewTooltip);
            } else {
                positionTooltipSmooth(tooltipEl, x, y, isNewTooltip);
            }
        } else {
            // 如果坐标无效，使用默认位置
            showTooltipSmooth(tooltipEl, '50%', '50%', 'translate(-50%, -50%)', isNewTooltip);
        }
    } else {
        showTooltipSmooth(tooltipEl, '50%', '50%', 'translate(-50%, -50%)', isNewTooltip);
    }
    
    // 绑定点击事件
    tooltipEl.addEventListener('click', handleTooltipClick);
    
    // 点击外部区域隐藏 tooltip
    if (hideOnOutsideClickHandler) {
        document.removeEventListener('click', hideOnOutsideClickHandler);
        document.removeEventListener('touchstart', hideOnOutsideClickHandler);
    }
    
    hideOnOutsideClickHandler = (e) => {
        if (tooltipEl && !tooltipEl.contains(e.target)) {
            // 检查是否点击的是图表区域
            const chartDom = document.getElementById('line-chart');
            if (chartDom && chartDom.contains(e.target)) {
                return; // 点击图表区域不隐藏
            }
            hideDateDetailTooltip();
        }
    };
    
    // 延迟绑定，避免立即触发
    setTimeout(() => {
        document.addEventListener('click', hideOnOutsideClickHandler);
        document.addEventListener('touchstart', hideOnOutsideClickHandler);
    }, 100);
    
    // 清除之前的自动隐藏定时器
    clearTimeout(window.dateDetailTooltipTimeout);
    window.dateDetailTooltipTimeout = setTimeout(() => {
        hideDateDetailTooltip();
    }, 8000);
}

// 渲染 tooltip 内容 - 显示所有分类（带平滑动画）
function renderTooltipContent(tooltipEl, dateStr, totalIncome, totalExpense, categoryGroups) {
    // 检查是否是内容更新（tooltip已存在且有内容）
    const isUpdate = tooltipEl.innerHTML.trim().length > 0;
    
    // 生成所有分类的HTML
    const categoriesHtml = categoryGroups.map((category, index) => {
        const typeLabel = category.type === 'income' ? '收入' : '支出';
        const delay = isUpdate ? 0 : index * 0.02; // 更新时不延迟，新显示时错开
        return `
            <div class="date-detail-tooltip-category-item" style="border-left-color: ${category.color}; animation-delay: ${delay}s;">
                <span class="date-detail-tooltip-category-icon">${category.icon}</span>
                <span class="date-detail-tooltip-category-name">${category.name}</span>
                <span class="date-detail-tooltip-category-type">${typeLabel}</span>
                <span class="date-detail-tooltip-category-amount">${formatMoney(category.amount)}</span>
                <span class="date-detail-tooltip-category-count">(${category.count}条)</span>
            </div>
        `;
    }).join('');
    
    // 如果是在更新内容，先淡出再淡入
    if (isUpdate) {
        tooltipEl.style.transition = 'opacity 0.1s ease';
        tooltipEl.style.opacity = '0.7';
        
        requestAnimationFrame(() => {
            tooltipEl.innerHTML = `
                <div class="date-detail-tooltip-header">
                    <span class="date-detail-tooltip-date">${dateStr}</span>
                    <div class="date-detail-tooltip-totals">
                        ${totalIncome > 0 ? `<span class="date-detail-tooltip-total income">收入: ${formatMoney(totalIncome)}</span>` : ''}
                        ${totalExpense > 0 ? `<span class="date-detail-tooltip-total expense">支出: ${formatMoney(totalExpense)}</span>` : ''}
                    </div>
                </div>
                <div class="date-detail-tooltip-categories">
                    ${categoriesHtml}
                </div>
                <div class="date-detail-tooltip-footer">
                    <span class="date-detail-tooltip-click-hint">点击查看详细记录</span>
                </div>
            `;
            
            requestAnimationFrame(() => {
                tooltipEl.style.opacity = '1';
            });
        });
    } else {
        // 新内容直接设置
        tooltipEl.innerHTML = `
            <div class="date-detail-tooltip-header">
                <span class="date-detail-tooltip-date">${dateStr}</span>
                <div class="date-detail-tooltip-totals">
                    ${totalIncome > 0 ? `<span class="date-detail-tooltip-total income">收入: ${formatMoney(totalIncome)}</span>` : ''}
                    ${totalExpense > 0 ? `<span class="date-detail-tooltip-total expense">支出: ${formatMoney(totalExpense)}</span>` : ''}
                </div>
            </div>
            <div class="date-detail-tooltip-categories">
                ${categoriesHtml}
            </div>
            <div class="date-detail-tooltip-footer">
                <span class="date-detail-tooltip-click-hint">点击查看详细记录</span>
            </div>
        `;
    }
}

// 平滑显示 tooltip
function showTooltipSmooth(tooltipEl, left, top, transform, isNew) {
    // 先设置位置但不显示
    tooltipEl.style.left = left;
    tooltipEl.style.top = top;
    tooltipEl.style.transform = transform || 'none';
    tooltipEl.style.display = 'block';
    tooltipEl.style.opacity = '0';
    tooltipEl.style.visibility = 'visible';
    
    // 如果是新 tooltip，添加缩放效果
    if (isNew) {
        tooltipEl.style.transform = `${transform || 'none'} scale(0.9)`;
    }
    
    // 使用 requestAnimationFrame 确保样式已应用
    tooltipAnimationFrame = requestAnimationFrame(() => {
        // 触发重排
        tooltipEl.offsetHeight;
        
        // 平滑显示
        tooltipEl.style.transition = 'opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
        tooltipEl.style.opacity = '1';
        if (isNew) {
            tooltipEl.style.transform = transform || 'none';
        }
    });
}

// 立即定位 tooltip（无动画，用于触摸移动时跟随手指）
function positionTooltipInstant(tooltipEl, x, y, isNew) {
    // 先显示以便计算尺寸
    tooltipEl.style.visibility = 'hidden';
    tooltipEl.style.display = 'block';
    tooltipEl.style.opacity = '1';
    tooltipEl.style.left = `${x + 15}px`;
    tooltipEl.style.top = `${y + 15}px`;
    tooltipEl.style.transition = 'none'; // 禁用过渡动画
    
    tooltipAnimationFrame = requestAnimationFrame(() => {
        const tooltipWidth = tooltipEl.offsetWidth || 240;
        const tooltipHeight = tooltipEl.offsetHeight || 200;
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        
        let left = x + 15;
        let top = y + 15;
        
        // 防止超出右边界
        if (left + tooltipWidth > windowWidth - 10) {
            left = x - tooltipWidth - 15;
        }
        // 防止超出下边界
        if (top + tooltipHeight > windowHeight - 10) {
            top = y - tooltipHeight - 15;
        }
        // 防止超出左边界
        if (left < 10) {
            left = 10;
        }
        // 防止超出上边界
        if (top < 10) {
            top = 10;
        }
        
        // 立即设置新位置，无动画
        tooltipEl.style.left = `${left}px`;
        tooltipEl.style.top = `${top}px`;
        tooltipEl.style.transform = 'none';
        tooltipEl.style.visibility = 'visible';
        tooltipEl.style.opacity = '1';
    });
}

// 平滑定位 tooltip
function positionTooltipSmooth(tooltipEl, x, y, isNew) {
    // 先显示以便计算尺寸
    tooltipEl.style.visibility = 'hidden';
    tooltipEl.style.display = 'block';
    tooltipEl.style.opacity = '0';
    tooltipEl.style.left = `${x + 15}px`;
    tooltipEl.style.top = `${y + 15}px`;
    
    // 如果是新 tooltip，添加缩放效果
    if (isNew) {
        tooltipEl.style.transform = 'scale(0.9)';
    }
    
    tooltipAnimationFrame = requestAnimationFrame(() => {
        const tooltipWidth = tooltipEl.offsetWidth || 240;
        const tooltipHeight = tooltipEl.offsetHeight || 200;
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        
        let left = x + 15;
        let top = y + 15;
        
        // 防止超出右边界
        if (left + tooltipWidth > windowWidth - 10) {
            left = x - tooltipWidth - 15;
        }
        // 防止超出下边界
        if (top + tooltipHeight > windowHeight - 10) {
            top = y - tooltipHeight - 15;
        }
        // 防止超出左边界
        if (left < 10) {
            left = 10;
        }
        // 防止超出上边界
        if (top < 10) {
            top = 10;
        }
        
        // 获取当前位置（如果已存在）
        const currentLeft = tooltipEl.style.left ? parseFloat(tooltipEl.style.left) : left;
        const currentTop = tooltipEl.style.top ? parseFloat(tooltipEl.style.top) : top;
        
        // 计算位置变化
        const deltaX = Math.abs(left - currentLeft);
        const deltaY = Math.abs(top - currentTop);
        
        // 设置新位置
        tooltipEl.style.left = `${left}px`;
        tooltipEl.style.top = `${top}px`;
        tooltipEl.style.transform = 'none';
        tooltipEl.style.visibility = 'visible';
        
        // 根据移动距离调整过渡时间
        const maxDelta = Math.max(deltaX, deltaY);
        let transitionDuration = '0.15s';
        if (maxDelta > 50) {
            transitionDuration = '0.2s';
        } else if (maxDelta > 20) {
            transitionDuration = '0.18s';
        } else if (maxDelta > 5) {
            transitionDuration = '0.15s';
        } else {
            transitionDuration = '0.12s';
        }
        
        // 添加平滑过渡
        tooltipEl.style.transition = `opacity ${transitionDuration} cubic-bezier(0.4, 0, 0.2, 1), transform ${transitionDuration} cubic-bezier(0.4, 0, 0.2, 1), left ${transitionDuration} cubic-bezier(0.4, 0, 0.2, 1), top ${transitionDuration} cubic-bezier(0.4, 0, 0.2, 1)`;
        
        // 触发重排后显示
        requestAnimationFrame(() => {
            tooltipEl.style.opacity = '1';
            if (isNew) {
                tooltipEl.style.transform = 'scale(1)';
            }
        });
    });
}

// 处理 tooltip 点击事件
function handleTooltipClick(e) {
    if (!currentTooltipData) return;
    
    // 跳转到记录列表并筛选日期
    const startDateInput = document.getElementById('records-start-date');
    const endDateInput = document.getElementById('records-end-date');
    if (startDateInput && endDateInput) {
        startDateInput.value = currentTooltipData.date;
        endDateInput.value = currentTooltipData.date;
    }
    
    // 切换到记录列表标签页
    switchMainTab('records');
    
    // 加载该日期的记录
    loadRecords(1);
    
    // 格式化日期显示
    const dateObj = new Date(currentTooltipData.date);
    const month = dateObj.getMonth() + 1;
    const day = dateObj.getDate();
    showMessage(`已筛选 ${month}月${day}日 的记录`, 'info');
    
    // 隐藏 tooltip
    hideDateDetailTooltip();
}

// 隐藏日期详情 tooltip（平滑隐藏）
function hideDateDetailTooltip() {
    const tooltipEl = document.getElementById('date-detail-tooltip');
    if (tooltipEl) {
        // 取消之前的动画
        if (tooltipAnimationFrame) {
            cancelAnimationFrame(tooltipAnimationFrame);
        }
        
        // 平滑隐藏
        tooltipEl.style.transition = 'opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1), transform 0.15s cubic-bezier(0.4, 0, 0.2, 1)';
        tooltipEl.style.opacity = '0';
        tooltipEl.style.transform = 'scale(0.95)';
        
        // 动画完成后隐藏
        setTimeout(() => {
            if (tooltipEl && tooltipEl.style.opacity === '0') {
                tooltipEl.style.display = 'none';
                tooltipEl.style.transition = '';
            }
        }, 150);
    }
    currentTooltipData = null;
    clearTimeout(window.dateDetailTooltipTimeout);
    
    // 移除外部点击监听器
    if (hideOnOutsideClickHandler) {
        document.removeEventListener('click', hideOnOutsideClickHandler);
        document.removeEventListener('touchstart', hideOnOutsideClickHandler);
        hideOnOutsideClickHandler = null;
    }
}

async function updateLineChart(dailyStats) {
    if (typeof echarts === 'undefined') {
        setChartPlaceholder('line-chart', '图表加载失败，请刷新页面', true);
        return;
    }
    currentDailyStats = dailyStats || [];
    dailyRecordsCache = {};
    
    if (!dailyStats || dailyStats.length === 0) {
        if (echartsLine) { echartsLine.dispose(); echartsLine = null; }
        setChartPlaceholder('line-chart', '暂无数据');
        return;
    }
    
    // 提前预加载所有日期的分类数据
    preloadDailyCategoryData(dailyStats);
    
    if (echartsLine) echartsLine.dispose();
    
    // 检测是否为移动端（在函数内部定义，确保作用域正确）
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (window.innerWidth <= 768);
    
    // 移动端禁用emphasis的scale效果，避免显示放大的数据点（绿色X标记）
    const emphasisConfig = isMobile 
        ? { focus: 'series', scale: false, itemStyle: { borderColor: '#fff', borderWidth: 1 } }  // 移动端禁用scale，避免显示放大点
        : { focus: 'series', scale: true, scaleSize: 8, itemStyle: { borderColor: '#fff', borderWidth: 2 } };  // 桌面端保持原样
    
    // 等待容器准备好后再初始化
    try {
        const dom = await waitForChartContainer('line-chart', 20, 50);
        dom.innerHTML = '';
        echartsLine = echarts.init(dom, null, getEChartsInitOpts());
        continueLineChartSetup(emphasisConfig);
    } catch (error) {
        console.error('初始化折线图失败:', error);
        setChartPlaceholder('line-chart', '图表加载失败，请刷新页面', true);
    }
}

// 继续折线图设置（分离出来以便延迟初始化时调用）
function continueLineChartSetup(emphasisConfig) {
    if (!echartsLine || !currentDailyStats || currentDailyStats.length === 0) {
        if (echartsLine) {
            echartsLine.dispose();
            echartsLine = null;
        }
        setChartPlaceholder('line-chart', '暂无数据');
        return;
    }
    
    const dom = document.getElementById('line-chart');
    if (!dom) {
        setChartPlaceholder('line-chart', '图表容器不存在', true);
        return;
    }
    
    try {
        const labels = (currentDailyStats || []).map(d => {
            const date = new Date(d.date);
            return `${date.getMonth() + 1}/${date.getDate()}`;
        });
        // 确保数据都是数字，将 null/undefined 转为 0，避免线段断裂
        const incomeData = (currentDailyStats || []).map(d => {
            const value = Number(d.income) || 0;
            return isNaN(value) ? 0 : value;
        });
        const expenseData = (currentDailyStats || []).map(d => {
            const value = Number(d.expense) || 0;
            return isNaN(value) ? 0 : value;
        });
        
        // 如果没有传入emphasisConfig，则重新计算（兜底处理）
        if (!emphasisConfig) {
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (window.innerWidth <= 768);
            emphasisConfig = isMobile 
                ? { focus: 'series', scale: false, itemStyle: { borderColor: '#fff', borderWidth: 1 } }
                : { focus: 'series', scale: true, scaleSize: 8, itemStyle: { borderColor: '#fff', borderWidth: 2 } };
        }
        
        echartsLine.setOption({
            animation: true,
            animationDuration: 400,
            animationEasing: 'cubicOut',
            legend: { top: 0, left: 'center', data: ['收入', '支出'], textStyle: { fontSize: 11 }, itemWidth: 10, itemHeight: 10 },
            grid: { left: '8%', right: '8%', top: '15%', bottom: '15%', containLabel: true },
            xAxis: { type: 'category', boundaryGap: false, data: labels, axisLabel: { fontSize: 10, color: '#666' }, axisLine: { lineStyle: { color: '#e5e7eb' } }, axisTick: { show: false } },
            yAxis: { type: 'value', min: 0, axisLabel: { fontSize: 10, formatter: v => '¥' + v }, splitLine: { lineStyle: { color: 'rgba(0,0,0,0.05)' } }, axisLine: { show: false }, axisTick: { show: false } },
            series: [
                { name: '收入', type: 'line', smooth: 0.35, data: incomeData, connectNulls: true, symbol: 'circle', symbolSize: 8, lineStyle: { width: 2.5, color: '#16a34a', cap: 'round', join: 'round' }, itemStyle: { color: '#16a34a', borderColor: '#fff', borderWidth: 1 }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(22,163,74,0.2)' }, { offset: 1, color: 'rgba(22,163,74,0.03)' }] } }, emphasis: emphasisConfig },
                { name: '支出', type: 'line', smooth: 0.35, data: expenseData, connectNulls: true, symbol: 'circle', symbolSize: 8, lineStyle: { width: 2.5, color: '#dc2626', cap: 'round', join: 'round' }, itemStyle: { color: '#dc2626', borderColor: '#fff', borderWidth: 1 }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(220,38,38,0.2)' }, { offset: 1, color: 'rgba(220,38,38,0.03)' }] } }, emphasis: emphasisConfig }
            ],
            tooltip: {
                show: false // 禁用默认 tooltip
            }
        });
        
        // 确保图表正确渲染：立即resize，然后延迟多次resize以确保容器尺寸已计算
        // 先立即resize一次
        if (echartsLine) {
            echartsLine.resize();
        }
        
        // 延迟resize，确保容器尺寸已计算（移动端特别需要）
        requestAnimationFrame(() => {
            if (echartsLine) {
                echartsLine.resize();
                // 再次延迟resize，确保在移动端容器完全布局后
                requestAnimationFrame(() => {
                    if (echartsLine) {
                        echartsLine.resize();
                        // 最后一次延迟resize，确保所有布局完成
                        setTimeout(() => {
                            if (echartsLine) echartsLine.resize();
                        }, 200);
                    }
                });
            }
        });
    } catch (error) {
        console.error('设置折线图选项失败:', error);
        if (echartsLine) {
            echartsLine.dispose();
            echartsLine = null;
        }
        setChartPlaceholder('line-chart', '图表加载失败，请刷新页面', true);
        return;
    }
    
    // 添加鼠标移动事件（桌面端）- 精确计算每一天
    let lastMouseIndex = -1;
    let mouseMoveTimer = null;
    
    // 根据鼠标X坐标精确计算日期索引
    function getDataIndexFromMouseX(x, chartDom) {
        if (!chartDom || !currentDailyStats || currentDailyStats.length === 0) return -1;
        
        try {
            // 使用 ECharts 的 convertFromPixel 方法
            const point = echartsLine.convertFromPixel({ seriesIndex: 0 }, [x, 0]);
            if (point && point[0] !== undefined) {
                const idx = Math.round(point[0]);
                if (idx >= 0 && idx < currentDailyStats.length) {
                    return idx;
                }
            }
        } catch (e) {
            // 如果转换失败，根据图表宽度和X坐标计算
            const rect = chartDom.getBoundingClientRect();
            const relativeX = x - rect.left;
            const chartWidth = rect.width;
            const dataLength = currentDailyStats.length;
            
            if (dataLength > 0 && chartWidth > 0) {
                // 考虑图表的 padding，grid 配置是 left: '8%', right: '8%'
                const effectiveWidth = chartWidth * 0.84; // 减去左右边距
                const effectiveX = relativeX - chartWidth * 0.08; // 减去左边距
                const ratio = Math.max(0, Math.min(1, effectiveX / effectiveWidth));
                const idx = Math.round(ratio * (dataLength - 1));
                if (idx >= 0 && idx < dataLength) {
                    return idx;
                }
            }
        }
        return -1;
    }
    
    echartsLine.off('mousemove');
    echartsLine.on('mousemove', async function(params) {
        if (!params || !params.event) {
            hideDateDetailTooltip();
            return;
        }
        
        // 获取鼠标的实际X坐标
        let mouseX = 0;
        if (params.event.event) {
            mouseX = params.event.event.clientX;
        } else if (params.event.originalEvent) {
            mouseX = params.event.originalEvent.clientX;
        } else if (params.event.clientX !== undefined) {
            mouseX = params.event.clientX;
        }
        
        // 如果无法获取X坐标，尝试使用 dataIndex
        let idx = -1;
        if (mouseX > 0) {
            idx = getDataIndexFromMouseX(mouseX, dom);
        }
        
        // 如果还是无法获取，使用 params.dataIndex（可能为 undefined）
        if (idx < 0 && params.dataIndex !== undefined) {
            idx = params.dataIndex;
        }
        
        if (idx < 0 || idx >= currentDailyStats.length) {
            hideDateDetailTooltip();
            return;
        }
        
        // 如果索引没变化，不重复加载
        if (lastMouseIndex === idx) return;
        lastMouseIndex = idx;
        
        // 防抖，避免频繁更新
        if (mouseMoveTimer) {
            clearTimeout(mouseMoveTimer);
        }
        
        mouseMoveTimer = setTimeout(() => {
            const date = currentDailyStats[idx].date;
            // 直接从缓存获取，不需要等待
            const categoryGroups = dailyRecordsCache[date] || [];
            // 获取鼠标事件对象
            let ev = null;
            if (params.event) {
                if (params.event.event) {
                    ev = params.event.event;
                } else if (params.event.originalEvent) {
                    ev = params.event.originalEvent;
                } else {
                    ev = params.event;
                }
            }
            showDateDetailTooltip(date, categoryGroups, ev);
        }, 16); // 减少防抖时间到16ms（约60fps），让响应更灵敏
    });
    
    // 鼠标离开图表时隐藏 tooltip
    echartsLine.off('mouseout');
    echartsLine.on('mouseout', function() {
        hideDateDetailTooltip();
        lastMouseIndex = -1;
    });
    
    // 添加触摸移动事件（移动端）
    let touchMoveTimer = null;
    let lastTouchIndex = -1;
    
    // 获取触摸点对应的数据索引（精确计算每一天）
    function getTouchDataIndex(touch) {
        const rect = dom.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        
        // 使用 ECharts 的 convertFromPixel 方法
        try {
            const point = echartsLine.convertFromPixel({ seriesIndex: 0 }, [x, y]);
            if (point && point[0] !== undefined) {
                const idx = Math.round(point[0]);
                if (idx >= 0 && idx < currentDailyStats.length) {
                    return idx;
                }
            }
        } catch (e) {
            // 如果转换失败，根据图表宽度和X坐标精确计算
            const chartWidth = rect.width;
            const dataLength = currentDailyStats.length;
            if (dataLength > 0 && chartWidth > 0) {
                // 考虑图表的 padding，grid 配置是 left: '8%', right: '8%'
                const effectiveWidth = chartWidth * 0.84; // 减去左右边距
                const effectiveX = x - chartWidth * 0.08; // 减去左边距
                const ratio = Math.max(0, Math.min(1, effectiveX / effectiveWidth));
                const idx = Math.round(ratio * (dataLength - 1));
                if (idx >= 0 && idx < dataLength) {
                    return idx;
                }
            }
        }
        return -1;
    }
    
    let touchStartX = 0;
    let touchStartY = 0;
    let isHorizontalSwipe = false;
    
    dom.addEventListener('touchstart', function(e) {
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        isHorizontalSwipe = false;
        isTouchMoving = false; // 触摸开始时重置标记
        
        const idx = getTouchDataIndex(touch);
        if (idx >= 0) {
            lastTouchIndex = idx;
            // 立即显示，因为数据已经在缓存中
            const date = currentDailyStats[idx].date;
            const categoryGroups = dailyRecordsCache[date] || [];
            if (categoryGroups.length > 0) {
                showDateDetailTooltip(date, categoryGroups, e);
            }
        }
    }, { passive: true });
    
    dom.addEventListener('touchmove', function(e) {
        const touch = e.touches[0];
        const deltaX = Math.abs(touch.clientX - touchStartX);
        const deltaY = Math.abs(touch.clientY - touchStartY);
        
        // 判断是否为水平滑动（水平距离大于垂直距离的1.5倍）
        if (deltaX > deltaY * 1.5 && deltaX > 10) {
            isHorizontalSwipe = true;
            isTouchMoving = true; // 标记正在触摸移动
            e.preventDefault(); // 只阻止水平滑动的默认行为
            
            const idx = getTouchDataIndex(touch);
            if (idx >= 0 && idx !== lastTouchIndex) {
                lastTouchIndex = idx;
                
                // 立即更新，因为数据已经在缓存中，使用即时定位
                const date = currentDailyStats[idx].date;
                const categoryGroups = dailyRecordsCache[date] || [];
                if (categoryGroups.length > 0) {
                    showDateDetailTooltip(date, categoryGroups, e);
                }
            } else if (idx >= 0) {
                // 即使索引没变化，也要更新位置，让tooltip跟随手指
                const tooltipEl = document.getElementById('date-detail-tooltip');
                if (tooltipEl) {
                    const x = touch.clientX;
                    const y = touch.clientY;
                    positionTooltipInstant(tooltipEl, x, y, false);
                }
            }
        }
        // 如果是垂直滑动，不阻止默认行为，允许页面滚动
    }, { passive: false });
    
    dom.addEventListener('touchend', function() {
        isTouchMoving = false; // 触摸结束，重置标记
        if (touchMoveTimer) {
            clearTimeout(touchMoveTimer);
            touchMoveTimer = null;
        }
        lastTouchIndex = -1;
        // 延迟隐藏，给用户时间查看
        setTimeout(() => {
            hideDateDetailTooltip();
        }, 3000);
    }, { passive: true });
    
    // 添加点击事件（跳转到详细记录）
    echartsLine.off('click');
    echartsLine.on('click', async function(params) {
        const idx = params.dataIndex;
        if (!currentDailyStats || idx < 0 || idx >= currentDailyStats.length) return;
        const date = currentDailyStats[idx].date;
        
        // 跳转到记录列表并筛选日期
        const startDateInput = document.getElementById('records-start-date');
        const endDateInput = document.getElementById('records-end-date');
        if (startDateInput && endDateInput) {
            startDateInput.value = date;
            endDateInput.value = date;
        }
        
        // 切换到记录列表标签页
        switchMainTab('records');
        
        // 加载该日期的记录
        loadRecords(1);
        
        // 格式化日期显示
        const dateObj = new Date(date);
        const month = dateObj.getMonth() + 1;
        const day = dateObj.getDate();
        showMessage(`已筛选 ${month}月${day}日 的记录`, 'info');
        
        // 隐藏 tooltip
        hideDateDetailTooltip();
    });
}

// 更新饼图（支出分类）- ECharts SVG 渲染，移动端清晰
async function updatePieChart(categoryStats) {
    if (typeof echarts === 'undefined') {
        setChartPlaceholder('pie-chart', '图表加载失败，请刷新页面', true);
        return;
    }
    if (!categoryStats || categoryStats.length === 0) {
        if (echartsPie) { echartsPie.dispose(); echartsPie = null; }
        setChartPlaceholder('pie-chart', '暂无数据');
        return;
    }
    const aggregated = aggregateCategoryStats(categoryStats, {});
    const chartData = aggregated.chartData;
    const total = aggregated.total;
    if (echartsPie) echartsPie.dispose();
    
    // 等待容器准备好后再初始化
    try {
        const dom = await waitForChartContainer('pie-chart', 20, 50);
        dom.innerHTML = '';
        echartsPie = echarts.init(dom, null, getEChartsInitOpts());
    const pieData = chartData.map((c, i) => ({
        name: `${c.icon} ${c.name} ${total > 0 ? ((c.amount / total) * 100).toFixed(1) : 0}%`,
        value: c.amount,
        itemStyle: { color: c.color },
        _isOther: c._isOther,
        _others: c._others
    }));
    echartsPie.setOption({
        animation: true,
        animationDuration: 400,
        animationEasing: 'cubicOut',
        legend: { orient: 'vertical', right: '8%', top: 'center', textStyle: { fontSize: 11 }, itemWidth: 10, itemHeight: 10, itemGap: 10 },
        series: [{
            type: 'pie',
            radius: ['40%', '68%'],
            center: ['38%', '50%'],
            data: pieData,
            label: { show: false },
            labelLine: { show: false },
            itemStyle: { borderColor: '#fff', borderWidth: 2 },
            emphasis: { scale: true, scaleSize: 6, itemStyle: { borderColor: '#fff', borderWidth: 2, shadowBlur: 10, shadowOffsetY: 3 } }
        }],
        tooltip: {
            trigger: 'item',
            backgroundColor: 'rgba(0,0,0,0.85)',
            borderColor: 'rgba(255,255,255,0.1)',
            textStyle: { fontSize: 12 },
            formatter: function(params) {
                const val = params.value;
                const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                return `${params.name}<br/>金额: ¥${val.toFixed(2)} (${pct}%)<br/>总计: ¥${total.toFixed(2)}`;
            }
        }
    });
        echartsPie.off('click');
        echartsPie.on('click', function(params) {
            const item = params.data;
            if (item && item._isOther && item._others && item._others.length > 0) openOthersDetailModal(item._others, total);
        });
    } catch (error) {
        console.error('初始化饼图失败:', error);
        setChartPlaceholder('pie-chart', '图表加载失败，请刷新页面', true);
    }
}

// 加载记录列表
async function loadRecords(page = 1) {
    try {
        // 获取日期筛选的值
        const startDateInput = document.getElementById('records-start-date');
        const endDateInput = document.getElementById('records-end-date');
        const startDate = startDateInput ? startDateInput.value : '';
        const endDate = endDateInput ? endDateInput.value : '';
        
        let url = `${API_BASE}/records?page=${page}&per_page=100`;
        // 只选择起始日期：显示起始日期之后的数据
        // 只选择结束日期：显示结束日期之前的数据
        // 两个都选：显示范围内的数据
        // 都不选：显示所有数据
        if (startDate) url += `&start_date=${startDate}`;
        if (endDate) url += `&end_date=${endDate}`;
        
        const response = await authFetch(url);
        const data = await response.json();

        currentPage = page;
        renderRecords(data.records);
        renderPagination(data.page, data.pages);
    } catch (error) {
        console.error('加载记录失败:', error);
        document.getElementById('records-list').innerHTML = '<div class="loading">加载失败，请刷新重试</div>';
    }
}

// 渲染记录列表
function renderRecords(records) {
    const container = document.getElementById('records-list');
    
    if (records.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📝</div>
                <div>暂无记录，开始记账吧！</div>
            </div>
        `;
        return;
    }
    
    // 按日期分组
    const groupedByDate = {};
    records.forEach(record => {
        const dateKey = record.date; // 使用 YYYY-MM-DD 格式作为key
        
        if (!groupedByDate[dateKey]) {
            groupedByDate[dateKey] = [];
        }
        groupedByDate[dateKey].push(record);
    });
    
    // 获取所有日期并排序（从近到远）
    const sortedDates = Object.keys(groupedByDate).sort((a, b) => {
        return new Date(b) - new Date(a); // 降序，最新的在前
    });
    
    // 生成HTML
    let html = '';
    sortedDates.forEach(dateKey => {
        const dateRecords = groupedByDate[dateKey];
        const date = new Date(dateKey);
        
        // 格式化日期：几月几号 星期几
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
        const weekday = weekdays[date.getDay()];
        const dateHeader = `${month}月${day}日 星期${weekday}`;
        
        // 判断是否是今天
        const today = new Date();
        const isToday = date.toDateString() === today.toDateString();
        const isYesterday = (() => {
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            return date.toDateString() === yesterday.toDateString();
        })();
        
        let dateLabel = dateHeader;
        if (isToday) {
            dateLabel = `今天 ${dateHeader}`;
        } else if (isYesterday) {
            dateLabel = `昨天 ${dateHeader}`;
        }
        
        // 计算当日支出总额（只计算支出类型）
        const dailyExpense = dateRecords
            .filter(r => r.type === 'expense')
            .reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);
        
        // 添加日期标题
        html += `
            <div class="date-section" data-date="${dateKey}">
                <div class="date-header">
                    <span class="date-label">${dateLabel}</span>
                    <div class="date-right-info">
                        ${dailyExpense > 0 ? `<span class="date-expense">${formatMoney(dailyExpense)}</span>` : ''}
                        <span class="date-total">${dateRecords.length} 条</span>
                    </div>
                </div>
                <div class="date-records">
        `;
        
        // 添加该日期的所有记录
        dateRecords.forEach(record => {
            // 查找分类（支持ID和名称匹配）
            const category = [...categories.expense, ...categories.income].find(
                c => (c.id && c.id.toString() === record.category) || c.name === record.category
            );
            const icon = category?.icon || '📦';
            const name = category?.name || record.category;
            const typeClass = record.type === 'income' ? 'income' : 'expense';
            
            // 如果有备注，显示备注；否则显示类别
            const displayName = record.note ? escapeHtml(record.note) : name;
            
            html += `
                <div class="record-item" data-id="${record.id}">
                    <div class="record-icon editable" data-field="category" data-record-id="${record.id}" data-value="${record.category}">${icon}</div>
                    <div class="record-info">
                        <div class="record-header">
                            <span class="record-category editable" data-field="note" data-record-id="${record.id}" data-value="${record.note || ''}">${displayName}</span>
                        </div>
                    </div>
                    <div class="record-amount ${typeClass} editable" data-field="amount" data-record-id="${record.id}" data-value="${record.amount}">
                        ${record.type === 'income' ? '+' : '-'}¥${parseFloat(record.amount).toFixed(2)}
                    </div>
                    <div class="record-actions">
                        <button class="btn-danger" onclick="handleDeleteRecord(event, ${record.id})">删除</button>
                    </div>
                    <input type="hidden" class="record-date-hidden" data-record-id="${record.id}" data-value="${record.date}">
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
    
    // 绑定内联编辑事件
    bindInlineEditEvents();
}

// 绑定内联编辑事件（可编辑字段；改日期由 #records-list 事件委托处理）
function bindInlineEditEvents() {
    document.querySelectorAll('.editable').forEach(element => {
        element.addEventListener('click', function(e) {
            e.stopPropagation();
            startInlineEdit(this);
        });
    });
}

// 编辑单条记录的日期（使用与记账相同的日期选择弹窗）
function editRecordDate(recordItem) {
    if (!recordItem || !recordItem.dataset) return;
    const recordId = parseInt(recordItem.dataset.id, 10);
    if (isNaN(recordId)) return;
    const dateHiddenInput = recordItem.querySelector('.record-date-hidden');
    if (!dateHiddenInput || !dateHiddenInput.dataset) return;
    const oldDate = (dateHiddenInput.dataset.value || '').trim();
    
    openSharedDatePicker({
        initialValue: oldDate,
        title: '选择日期',
        onConfirm: async (newDate) => {
            if (newDate === oldDate) return;
            try {
                const response = await authFetch(`${API_BASE}/records/${recordId}`);
                const data = await response.json();
                const record = data.record;
                if (!record) {
                    customAlert('记录不存在', '错误', 'error');
                    return;
                }
                const updateResponse = await authFetch(`${API_BASE}/records/${recordId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        date: newDate,
                        type: record.type,
                        amount: parseFloat(record.amount),
                        category: record.category,
                        note: record.note || ''
                    })
                });
                const result = await updateResponse.json();
                if (updateResponse.ok) {
                    loadStatistics();
                    loadRecords(currentPage);
                    loadTodayRecords();
                    showMessage('日期更新成功！', 'success');
                } else {
                    customAlert(result.error || '更新失败', '更新失败', 'error');
                }
            } catch (error) {
                console.error('更新日期失败:', error);
                customAlert('更新日期失败，请重试', '错误', 'error');
            }
        }
    });
}

// 开始内联编辑
function startInlineEdit(element) {
    const field = element.dataset.field;
    const recordId = element.dataset.recordId;
    const currentValue = element.dataset.value;
    const originalText = element.textContent.trim();
    
    // 如果已经在编辑状态，忽略
    if (element.querySelector('input, select')) {
        return;
    }
    
    let input;
    
    if (field === 'category') {
        // 分类：使用下拉选择
        const record = getRecordFromDOM(recordId);
        const type = record?.type || 'expense';
        const categoryList = categories[type] || [];
        
        input = document.createElement('select');
        input.className = 'inline-edit-input';
        categoryList.forEach(cat => {
            const option = document.createElement('option');
            // 使用分类名称作为值（因为数据库存储的是名称）
            option.value = cat.name || cat.id;
            option.textContent = `${cat.icon} ${cat.name}`;
            // 匹配当前值（可能是ID或名称）
            if (cat.id === currentValue || cat.name === currentValue || (cat.id && cat.id.toString() === currentValue)) {
                option.selected = true;
            }
            input.appendChild(option);
        });
    } else if (field === 'date') {
        // 日期：使用日期选择器
        input = document.createElement('input');
        input.type = 'date';
        input.className = 'inline-edit-input';
        input.value = currentValue;
    } else if (field === 'amount') {
        // 金额：使用数字输入
        input = document.createElement('input');
        input.type = 'number';
        input.step = '0.01';
        input.min = '0.01';
        input.className = 'inline-edit-input';
        // 移除符号和¥，只保留数字
        const amountValue = originalText.replace(/[+\-¥]/g, '').trim();
        input.value = amountValue;
    } else if (field === 'note') {
        // 备注：使用文本输入
        input = document.createElement('input');
        input.type = 'text';
        input.className = 'inline-edit-input';
        input.value = currentValue || '';
        input.placeholder = '输入备注...';
    }
    
    // 保存原始内容
    const originalHTML = element.innerHTML;
    element.innerHTML = '';
    element.appendChild(input);
    input.focus();
    
    // 处理保存
    const saveEdit = async () => {
        const newValue = input.value.trim();
        if (newValue === currentValue || newValue === '') {
            // 没有变化，恢复原样
            element.innerHTML = originalHTML;
            element.dataset.value = currentValue;
            return;
        }
        
        // 更新记录
        await updateRecordField(recordId, field, newValue, element);
    };
    
    // 处理取消
    const cancelEdit = () => {
        element.innerHTML = originalHTML;
        element.dataset.value = currentValue;
    };
    
    // 绑定事件
    input.addEventListener('blur', saveEdit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            input.blur();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelEdit();
        }
    });
}

// 更新记录字段
async function updateRecordField(recordId, field, newValue, element) {
    try {
        // 先获取当前记录
        const response = await authFetch(`${API_BASE}/records/${recordId}`);
        const data = await response.json();
        const record = data.record;
        
        if (!record) {
            customAlert('记录不存在', '错误', 'error');
            element.innerHTML = element.dataset.value;
            return;
        }
        
        // 构建更新数据
        const updateData = {
            date: record.date,
            type: record.type,
            amount: parseFloat(record.amount),
            category: record.category,
            note: record.note || ''
        };
        
        // 更新对应字段
        if (field === 'category') {
            // 检查新分类是否属于当前类型
            // newValue 可能是分类名称或ID（因为选择器使用 cat.name || cat.id）
            const categoryList = [...categories.expense, ...categories.income];
            const newCategory = categoryList.find(c => 
                c.id === newValue || 
                c.name === newValue || 
                (c.id && c.id.toString() === newValue)
            );
            if (!newCategory) {
                customAlert('无效的分类', '输入错误', 'warning');
                element.innerHTML = element.dataset.value;
                return;
            }
            // 如果分类类型与记录类型不匹配，需要同时更新类型
            const isIncomeCategory = categories.income.some(c => 
                c.id === newValue || 
                c.name === newValue || 
                (c.id && c.id.toString() === newValue)
            );
            const isExpenseCategory = categories.expense.some(c => 
                c.id === newValue || 
                c.name === newValue || 
                (c.id && c.id.toString() === newValue)
            );
            
            if (isIncomeCategory && record.type !== 'income') {
                updateData.type = 'income';
            } else if (isExpenseCategory && record.type !== 'expense') {
                updateData.type = 'expense';
            }
            // 使用分类名称作为值（因为数据库存储的是名称）
            updateData.category = newCategory.name || newCategory.id;
        } else if (field === 'date') {
            updateData.date = newValue;
        } else if (field === 'amount') {
            const amount = parseFloat(newValue);
            if (isNaN(amount) || amount <= 0) {
                customAlert('金额必须大于0', '输入错误', 'warning');
                element.innerHTML = element.dataset.value;
                return;
            }
            updateData.amount = amount;
        } else if (field === 'note') {
            // 备注：直接更新
            updateData.note = newValue || '';
        }
        
        // 发送更新请求
        const updateResponse = await authFetch(`${API_BASE}/records/${recordId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
        });
        
        const result = await updateResponse.json();
        
        if (updateResponse.ok) {
            // 更新成功，重新加载数据
            loadStatistics();
            loadRecords(currentPage);
            loadTodayRecords(); // 刷新今日记录
            showMessage('更新成功！', 'success');
        } else {
            customAlert(result.error || '更新失败', '更新失败', 'error');
            // 恢复原值
            element.innerHTML = element.dataset.value;
        }
    } catch (error) {
        console.error('更新记录失败:', error);
        customAlert('更新失败，请重试', '错误', 'error');
        // 恢复原值
        element.innerHTML = element.dataset.value;
    }
}

// 从DOM获取记录信息（辅助函数）
function getRecordFromDOM(recordId) {
    const recordItem = document.querySelector(`.record-item[data-id="${recordId}"]`);
    if (!recordItem) return null;
    
    // 从DOM元素中提取信息
    const amountElement = recordItem.querySelector('.record-amount');
    const amountText = amountElement?.textContent || '';
    const isIncome = amountText.startsWith('+') || amountElement.classList.contains('income');
    const amount = parseFloat(amountText.replace(/[+\-¥]/g, '').trim());
    
    // 优先从 record-icon 获取分类（因为现在分类编辑在 icon 上）
    const categoryElement = recordItem.querySelector('.record-icon.editable[data-field="category"]') || 
                           recordItem.querySelector('.record-category.editable[data-field="category"]');
    const category = categoryElement?.dataset.value || '';
    
    const dateElement = recordItem.querySelector('.record-date.editable');
    const date = dateElement?.dataset.value || '';
    
    return {
        id: recordId,
        type: isIncome ? 'income' : 'expense',
        amount: amount,
        category: category,
        date: date
    };
}

// 渲染分页
function renderPagination(currentPage, totalPages) {
    const container = document.getElementById('pagination');
    
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    let html = '';
    
    // 上一页
    html += `<button onclick="loadRecords(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>上一页</button>`;
    
    // 页码
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);
    
    if (startPage > 1) {
        html += `<button onclick="loadRecords(1)">1</button>`;
        if (startPage > 2) html += `<button disabled>...</button>`;
    }
    
    for (let i = startPage; i <= endPage; i++) {
        html += `<button onclick="loadRecords(${i})" class="${i === currentPage ? 'active' : ''}">${i}</button>`;
    }
    
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += `<button disabled>...</button>`;
        html += `<button onclick="loadRecords(${totalPages})">${totalPages}</button>`;
    }
    
    // 下一页
    html += `<button onclick="loadRecords(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>下一页</button>`;
    
    container.innerHTML = html;
}

// 打开编辑模态框
async function openEditModal(recordId) {
    try {
        // 关闭所有键盘
        closeNumberKeyboard();
        
        const response = await authFetch(`${API_BASE}/records/${recordId}`);
        const data = await response.json();
        const record = data.record;
        
        if (!record) {
            customAlert('记录不存在', '错误', 'error');
            return;
        }
        
        document.getElementById('edit-id').value = record.id;
        document.getElementById('edit-type').value = record.type;
        const editDateVal = (record.date || getLocalDateString()).trim();
        document.getElementById('edit-date').value = editDateVal;
        const editDateDisplay = document.getElementById('edit-date-display');
        if (editDateDisplay) editDateDisplay.textContent = formatDateDisplayString(editDateVal);
        document.getElementById('edit-amount').value = parseFloat(record.amount).toFixed(2);
        document.getElementById('edit-category').value = record.category;
        document.getElementById('edit-note').value = record.note || '';
        
        // 类型改变时更新分类选择
        document.getElementById('edit-type').addEventListener('change', function() {
            updateEditCategorySelect();
            // 尝试保持当前分类，如果不存在则选择第一个
            const currentCategory = record.category;
            const select = document.getElementById('edit-category');
            if (!Array.from(select.options).some(opt => opt.value === currentCategory)) {
                select.selectedIndex = 0;
            } else {
                select.value = currentCategory;
            }
        }, { once: true });
        
        // 更新分类选择（根据类型）
        updateEditCategorySelect();
        document.getElementById('edit-category').value = record.category;
        
        document.getElementById('edit-modal').classList.add('show');
    } catch (error) {
        console.error('加载记录失败:', error);
        customAlert('加载记录失败', '错误', 'error');
    }
}

// 关闭模态框
function closeModal() {
    closeNumberKeyboard();
    document.getElementById('edit-modal').classList.remove('show');
    const categoryDetailModal = document.getElementById('category-detail-modal');
    if (categoryDetailModal) categoryDetailModal.classList.remove('show');
    const othersDetailModal = document.getElementById('others-detail-modal');
    if (othersDetailModal) othersDetailModal.classList.remove('show');
}

// 更新记录
async function handleUpdateRecord(e) {
    e.preventDefault();
    
    // 关闭键盘
    closeNumberKeyboard();
    
    const recordId = document.getElementById('edit-id').value;
    
    // 获取金额值，处理可能的加减运算
    let amountValue = document.getElementById('edit-amount').value;
    amountValue = amountValue.replace(/[¥\s]/g, '');
    if (amountValue && ['+', '-'].some(op => amountValue.includes(op))) {
        try {
            amountValue = eval(amountValue.replace(/\s+/g, ' ').trim()).toString();
        } catch (e) {
            console.error('金额计算错误:', e);
            customAlert('金额格式错误，请重新输入', '输入错误', 'warning');
            return;
        }
    }
    
    const amount = parseFloat(amountValue);
    if (isNaN(amount) || amount <= 0) {
        customAlert('请输入有效的金额', '输入错误', 'warning');
        return;
    }
    
    const formData = {
        date: document.getElementById('edit-date').value,
        type: document.getElementById('edit-type').value,
        amount: amount,
        category: document.getElementById('edit-category').value,
        note: document.getElementById('edit-note').value.trim()
    };
    
    try {
        const response = await authFetch(`${API_BASE}/records/${recordId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            closeModal();
            loadStatistics();
            loadRecords(currentPage);
            showMessage('更新成功！', 'success');
        } else {
            customAlert(result.error || '更新失败', '更新失败', 'error');
        }
    } catch (error) {
        console.error('更新记录失败:', error);
        customAlert('更新失败，请重试', '错误', 'error');
    }
}

// 删除记录
async function handleDeleteRecord(event, recordId) {
    // 阻止事件冒泡，避免触发记录项的点击事件
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    
    const confirmed = await customConfirm('确定要删除这条记录吗？', '确认删除');
    if (!confirmed) {
        return;
    }
    
    try {
        const response = await authFetch(`${API_BASE}/records/${recordId}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (response.ok) {
            loadStatistics();
            loadRecords(currentPage);
            loadTodayRecords(); // 刷新今日记录
            showMessage('删除成功！', 'success');
        } else {
            customAlert(result.error || '删除失败', '删除失败', 'error');
        }
    } catch (error) {
        console.error('删除记录失败:', error);
        customAlert('删除失败，请重试', '错误', 'error');
    }
}

// 导出数据
async function handleExport() {
    // 使用记录列表的日期筛选
    const startDateInput = document.getElementById('records-start-date');
    const endDateInput = document.getElementById('records-end-date');
    const startDate = startDateInput ? startDateInput.value : '';
    const endDate = endDateInput ? endDateInput.value : '';
    
    let url = `${API_BASE}/export?`;
    if (startDate) url += `start_date=${startDate}&`;
    if (endDate) url += `end_date=${endDate}&`;
    
    try {
        const response = await authFetch(url);
        if (!response.ok) {
            throw new Error('导出失败');
        }
        
        // 获取文件名
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = 'expense_records.csv';
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
            if (filenameMatch) {
                filename = filenameMatch[1];
            }
        }
        
        // 下载文件
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(downloadUrl);
        
        customAlert('导出成功', '提示', 'success');
    } catch (error) {
        console.error('导出失败:', error);
        customAlert('导出失败：' + error.message, '错误', 'error');
    }
}

// 导入数据
let isImporting = false; // 防止重复提交
async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    // 防止重复提交
    if (isImporting) {
        customAlert('正在导入中，请稍候...', '提示', 'info');
        e.target.value = '';
        return;
    }
    
    const confirmed = await customConfirm('导入数据将添加到现有记录中，确定继续吗？', '确认导入');
    if (!confirmed) {
        e.target.value = '';
        return;
    }
    
    isImporting = true;
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await authFetch(`${API_BASE}/import`, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (response.ok) {
            const message = `导入成功！共导入 ${result.imported} 条记录${result.errors.length > 0 ? `，${result.errors.length} 条失败` : ''}`;
            customAlert(message, '导入成功', result.errors.length > 0 ? 'warning' : 'success');
            if (result.errors.length > 0) {
                console.error('导入错误:', result.errors);
            }
            loadStatistics();
            loadRecords();
        } else {
            customAlert(result.error || '导入失败', '导入失败', 'error');
        }
    } catch (error) {
        console.error('导入失败:', error);
        customAlert('导入失败，请重试', '错误', 'error');
    } finally {
        isImporting = false;
        e.target.value = '';
    }
}

// 工具函数
const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

const showMessage = (message, type = 'info') => {
    const msgDiv = Object.assign(document.createElement('div'), {
        textContent: message,
        style: `position:fixed;top:80px;right:20px;padding:12px 24px;background:${type === 'success' ? '#51CF66' : '#FF6B6B'};color:white;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:3000;animation:slideIn 0.3s ease;`
    });
    document.body.appendChild(msgDiv);
    setTimeout(() => {
        msgDiv.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => msgDiv.remove(), 300);
    }, 2000);
};

// 自定义对话框
function showDialog(options) {
    return new Promise((resolve) => {
        const {
            title = '提示',
            message = '',
            type = 'info', // info, success, warning, error
            confirmText = '确定',
            cancelText = '取消',
            showCancel = false
        } = options;

        // 创建对话框元素
        const dialog = document.createElement('div');
        dialog.className = `custom-dialog ${type}`;
        
        const icons = {
            info: 'ℹ️',
            success: '✓',
            warning: '⚠️',
            error: '✕'
        };
        
        dialog.innerHTML = `
            <div class="custom-dialog-content">
                <div class="custom-dialog-icon">${icons[type] || icons.info}</div>
                <div class="custom-dialog-title">${escapeHtml(title)}</div>
                <div class="custom-dialog-message">${escapeHtml(message)}</div>
                <div class="custom-dialog-actions">
                    ${showCancel ? `<button class="custom-dialog-btn-secondary">${escapeHtml(cancelText)}</button>` : ''}
                    <button class="custom-dialog-btn-${type === 'error' ? 'danger' : 'primary'}">${escapeHtml(confirmText)}</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
        
        // 显示动画
        setTimeout(() => dialog.classList.add('show'), 10);
        
        // 绑定事件
        const confirmBtn = dialog.querySelector('.custom-dialog-btn-primary, .custom-dialog-btn-danger');
        const cancelBtn = dialog.querySelector('.custom-dialog-btn-secondary');
        
        const closeDialog = (result) => {
            dialog.classList.remove('show');
            setTimeout(() => {
                dialog.remove();
                resolve(result);
            }, 300);
        };
        
        confirmBtn.addEventListener('click', () => closeDialog(true));
        
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => closeDialog(false));
        }
        
        // 点击背景关闭（仅当有取消按钮时）
        if (showCancel) {
            dialog.addEventListener('click', (e) => {
                if (e.target === dialog) {
                    closeDialog(false);
                }
            });
        }
    });
}

// 替换 alert 和 confirm
const customAlert = (message, title = '提示', type = 'info') => 
    showDialog({ title, message, type, showCancel: false });

const customConfirm = (message, title = '确认') => 
    showDialog({ title, message, type: 'warning', confirmText: '确定', cancelText: '取消', showCancel: true });

// 分类管理功能
const openCategoryModal = () => {
    document.getElementById('category-modal').classList.add('show');
    loadCategoryList('expense');
};

const closeCategoryModal = () => {
    document.getElementById('category-modal').classList.remove('show');
};

async function loadCategoryList(type) {
    const container = document.getElementById(`category-list-${type}`);
    try {
        const response = await authFetch(`${API_BASE}/categories`);
        const data = await response.json();
        const categoryList = data[type] || [];
        
        // 按 sort_order 降序排序（置顶的显示在前面）
        const sortedList = [...categoryList].sort((a, b) => {
            const orderA = a.sort_order || 0;
            const orderB = b.sort_order || 0;
            if (orderA !== orderB) {
                return orderB - orderA; // 降序
            }
            return (a.id || 0) - (b.id || 0); // 如果 sort_order 相同，按 id 升序
        });
        
        container.innerHTML = sortedList.map(cat => `
            <div class="category-item" data-id="${cat.id}">
                <div class="category-item-icon" style="background: ${cat.color}20; color: ${cat.color}">
                    ${cat.icon}
                </div>
                <div class="category-item-info">
                    <div class="category-item-name">${escapeHtml(cat.name)}</div>
                </div>
                <div class="category-item-actions">
                    <button class="btn-top-small" onclick="pinCategoryToTop(${cat.id}, '${type}')" title="置顶">置顶</button>
                    <button class="btn-edit-small" onclick="editCategory(${cat.id}, '${type}')">编辑</button>
                    <button class="btn-danger-small" onclick="deleteCategory(${cat.id})">删除</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('加载分类列表失败:', error);
        container.innerHTML = '<div class="loading">加载失败</div>';
    }
}

async function handleAddCategory(e) {
    e.preventDefault();
    
    const formData = {
        type: document.getElementById('new-category-type').value,
        name: document.getElementById('new-category-name').value.trim(),
        icon: document.getElementById('new-category-icon').value.trim() || '📦',
        color: document.getElementById('new-category-color').value
    };
    
    if (!formData.name) {
        customAlert('请输入分类名称', '提示', 'warning');
        return;
    }
    
    try {
        const response = await authFetch(`${API_BASE}/categories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            // 重置表单
            document.getElementById('add-category-form').reset();
            document.getElementById('new-category-type').value = document.querySelector('.tab-btn.active').dataset.tab;
            document.getElementById('new-category-icon').value = '📦';
            document.getElementById('selected-icon-preview').textContent = '📦';
            document.getElementById('new-category-color').value = '#C7CEEA';
            
            // 重新加载分类列表和分类选择器
            const currentTab = document.querySelector('.tab-btn.active').dataset.tab;
            loadCategoryList(currentTab);
            loadCategories();
            showMessage('添加成功！', 'success');
        } else {
            customAlert(result.error || '添加失败', '添加失败', 'error');
        }
    } catch (error) {
        console.error('添加分类失败:', error);
        customAlert('添加失败，请重试', '错误', 'error');
    }
}

async function editCategory(categoryId, type) {
    try {
        // 获取分类详情
        const response = await authFetch(`${API_BASE}/categories`);
        const data = await response.json();
        const categoryList = data[type] || [];
        const category = categoryList.find(cat => cat.id === categoryId);
        
        if (!category) {
            customAlert('分类不存在', '错误', 'error');
            return;
        }
        
        // 填充编辑表单
        document.getElementById('edit-category-id').value = category.id;
        document.getElementById('edit-category-type').value = type;
        document.getElementById('edit-category-name').value = category.name;
        document.getElementById('edit-category-icon').value = category.icon;
        document.getElementById('edit-selected-icon-preview').textContent = category.icon;
        document.getElementById('edit-category-color').value = category.color;
        
        // 打开编辑模态框
        document.getElementById('edit-category-modal').classList.add('show');
    } catch (error) {
        console.error('加载分类详情失败:', error);
        customAlert('加载失败，请重试', '错误', 'error');
    }
}

async function handleEditCategory(e) {
    e.preventDefault();
    
    const categoryId = document.getElementById('edit-category-id').value;
    const formData = {
        name: document.getElementById('edit-category-name').value.trim(),
        icon: document.getElementById('edit-category-icon').value.trim() || '📦',
        color: document.getElementById('edit-category-color').value
    };
    
    if (!formData.name) {
        customAlert('请输入分类名称', '提示', 'warning');
        return;
    }
    
    try {
        const response = await authFetch(`${API_BASE}/categories/${categoryId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            // 关闭编辑模态框
            document.getElementById('edit-category-modal').classList.remove('show');
            
            // 重新加载分类列表和分类选择器
            const type = document.getElementById('edit-category-type').value;
            loadCategoryList(type);
            loadCategories();
            showMessage('编辑成功！', 'success');
        } else {
            customAlert(result.error || '编辑失败', '编辑失败', 'error');
        }
    } catch (error) {
        console.error('编辑分类失败:', error);
        customAlert('编辑失败，请重试', '错误', 'error');
    }
}

async function deleteCategory(categoryId) {
    const confirmed = await customConfirm('确定要删除这个分类吗？', '确认删除');
    if (!confirmed) {
        return;
    }
    
    try {
        const response = await authFetch(`${API_BASE}/categories/${categoryId}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (response.ok) {
            const currentTab = document.querySelector('.tab-btn.active').dataset.tab;
            loadCategoryList(currentTab);
            loadCategories();
            showMessage('删除成功！', 'success');
        } else {
            customAlert(result.error || '删除失败', '删除失败', 'error');
        }
    } catch (error) {
        console.error('删除分类失败:', error);
        customAlert('删除失败，请重试', '错误', 'error');
    }
}

// 置顶分类
async function pinCategoryToTop(categoryId, type) {
    try {
        // 先获取当前类型下所有分类，找到最大的 sort_order
        const response = await authFetch(`${API_BASE}/categories`);
        const data = await response.json();
        const categoryList = data[type] || [];
        
        // 找到当前最大的 sort_order
        const maxSortOrder = categoryList.length > 0 
            ? Math.max(...categoryList.map(cat => cat.sort_order || 0))
            : 0;
        
        // 将目标分类的 sort_order 设置为最大值 + 1
        const newSortOrder = maxSortOrder + 1;
        
        // 更新分类的 sort_order
        const updateResponse = await authFetch(`${API_BASE}/categories/${categoryId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sort_order: newSortOrder })
        });
        
        const result = await updateResponse.json();
        
        if (updateResponse.ok) {
            // 重新加载分类列表和分类选择器
            const currentTab = document.querySelector('.tab-btn.active')?.dataset.tab || type;
            loadCategoryList(currentTab);
            loadCategories();
            showMessage('置顶成功！', 'success');
        } else {
            customAlert(result.error || '置顶失败', '置顶失败', 'error');
        }
    } catch (error) {
        console.error('置顶分类失败:', error);
        customAlert('置顶失败，请重试', '错误', 'error');
    }
}


// 图标库（重新整理，去除无用图标，增加记账常用场景）
const ICON_LIBRARY = {
    // 餐饮美食
    food: ['🍔', '🍕', '🍜', '🍱', '🍝', '🍲', '🥘', '🍳', '🥗', '🍞', '🥐', '🥖', '🥨', '🥯', '🥞', '🧇', '🍗', '🍖', '🥩', '🥓', '🍟', '🍿', '🌮', '🌯', '🥙', '🥪', '🌭', '🍰', '🎂', '🧁', '🍮', '🍭', '🍬', '🍫', '🍪', '🍩', '🥤', '☕', '🍵', '🧃', '🥛', '🍼', '🍺', '🍻', '🍷', '🍸', '🍹', '🥢', '🍴', '🥄'],
    
    // 交通出行
    transport: ['🚗', '🚕', '🚙', '🚌', '🚎', '🚓', '🚐', '🚚', '🚛', '🛴', '🚲', '🛵', '🏍️', '🛺', '✈️', '🛫', '🛬', '💺', '🚁', '🚂', '🚃', '🚄', '🚅', '🚆', '🚇', '🚈', '🚉', '🚊', '🚝', '🚞', '🚋', '⛴️', '🚤', '🛥️', '🛳️', '🚢', '⛽', '🅿️'],
    
    // 购物消费
    shopping: ['🛍️', '🛒', '🛏️', '🛋️', '🪑', '🚪', '🪟', '🪞', '🖼️', '🛠️', '⚙️', '🔧', '🔨', '🔩', '🧰', '🧹', '🪠', '🧺', '🧻', '🚽', '🚿', '🛁', '🛀', '🧼', '🪥', '🪒', '🧽', '🪣', '🧴', '🔑', '🗝️', '🛌', '🛎️', '💳', '🧾'],
    
    // 娱乐休闲
    entertainment: ['🎬', '🎭', '🎨', '🎪', '🎤', '🎧', '🎼', '🎹', '🥁', '🎷', '🎺', '🎸', '🪗', '🎻', '🎲', '🎯', '🎳', '🎮', '🎰', '🃏', '🀄', '🎴', '🧩', '♟️', '🎡', '🎢', '🎠', '🎟️', '🎫'],
    
    // 医疗健康
    medical: ['🏥', '⚕️', '🩺', '💊', '💉', '🩸', '🩹', '🧬', '🧪', '🌡️', '🦷', '👁️', '👂', '👃', '🫀', '🫁', '🧠', '💪', '🦵', '🦶'],
    
    // 教育学习
    education: ['📚', '📖', '📕', '📗', '📘', '📙', '📓', '📔', '📒', '📃', '📜', '📄', '📰', '🗞️', '📑', '🔖', '🏷️', '✏️', '✒️', '🖊️', '🖋️', '🖌️', '🖍️', '📝', '💼', '📁', '📂', '🗂️', '📅', '📆', '🗒️', '🗓️', '📇', '📈', '📉', '📊', '📋', '📌', '📍', '📎', '🖇️', '📏', '📐', '✂️', '🗃️', '🗄️', '🗑️', '🎓'],
    
    // 住房物业
    housing: ['🏠', '🏡', '🏘️', '🏚️', '🏗️', '🏭', '🏢', '🏬', '🏣', '🏤', '🏦', '🏨', '🏪', '🏫', '🏩', '💒', '🏛️', '⛪', '🕌', '🕍', '🛕'],
    
    // 水电通讯
    utilities: ['💡', '🔦', '🕯️', '🪔', '🧯', '⚡', '🔥', '💧', '🌊', '💨', '❄️', '☀️', '🌤️', '⛅', '🌥️', '☁️', '🌦️', '🌧️', '⛈️', '🌩️', '☔', '📱', '☎️', '📞', '📟', '📠', '💻', '🖥️', '🖨️', '⌨️', '🖱️', '🖲️', '🕹️', '🗜️', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥', '📺', '📻', '🔊', '🔉', '🔈', '🔇', '📢', '📣', '📯', '🔔', '🔕', '📡', '🌐'],
    
    // 生活服务
    life: ['💇', '💇‍♀️', '💇‍♂️', '💆', '💆‍♀️', '💆‍♂️', '🧖', '🧖‍♀️', '🧖‍♂️', '👕', '👔', '👖', '🧥', '🧦', '👗', '👘', '👙', '👚', '👛', '👜', '👝', '🎒', '👞', '👟', '🥾', '🥿', '👠', '👡', '🩴', '👢', '👑', '👒', '🎩', '🎓', '🧢', '⛑️', '🪖', '💄', '💍', '💎'],
    
    // 宠物动物
    pets: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐽', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟', '🦗', '🕷️', '🦂', '🐢', '🐍', '🦎', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🦬', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩', '🦮', '🐕‍🦺', '🐈', '🐈‍⬛', '🪶', '🐓', '🦃', '🦤', '🦚', '🦜', '🦢', '🦩', '🕊️', '🐇', '🦝', '🦨', '🦡', '🦫', '🦦', '🦥', '🐁', '🐀', '🐿️', '🦔'],
    
    // 运动健身
    sports: ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🥅', '⛳', '🏹', '🎣', '🥊', '🥋', '🎽', '🛹', '🛷', '⛸️', '🥌', '🎿', '⛷️', '🏂', '🪂', '🏋️', '🤼', '🤸', '🤺', '⛹️', '🤾', '🏌️', '🏇', '🧘', '🏄', '🏊', '🤽', '🚣', '🧗', '🚵', '🚴', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '🏵️', '🎗️'],
    
    // 旅行度假
    travel: ['🧳', '✈️', '🛫', '🛬', '🛩️', '💺', '🚁', '🌍', '🌎', '🌏', '🌐', '🗺️', '🧭', '🏔️', '⛰️', '🌋', '🗻', '🏕️', '🏖️', '🏜️', '🏝️', '🏞️', '🏟️', '🏛️', '🏗️', '🧱', '🏘️', '🏚️', '🏠', '🏡', '🏢', '🏣', '🏤', '🏥', '🏦', '🏨', '🏩', '🏪', '🏫', '🏬', '🏭', '🏯', '🏰', '💒', '🗼', '🗽', '⛪', '🕌', '🛕', '🕍', '⛩️', '🕋', '⛲', '⛺', '🌁', '🌃', '🏙️', '🌄', '🌅', '🌆', '🌇', '🌉', '🌊'],
    
    // 礼物人情
    gifts: ['🎁', '🎉', '🎊', '🎈', '🎀', '💐', '🌸', '💮', '🏵️', '🌹', '🥀', '🌺', '🌻', '🌼', '🌷', '🌱', '🌲', '🌳', '🌴', '🌵', '🌶️', '🌾', '🌿', '☘️', '🍀', '🍁', '🍂', '🍃'],
    
    // 快递物流
    delivery: ['📦', '📮', '📯', '📪', '📫', '📬', '📭', '📤', '📥', '✉️', '📧', '📨', '📩', '🚚', '🚛', '🚜', '🛻', '🚐'],
    
    // 收入相关
    income: ['💰', '💴', '💵', '💶', '💷', '💸', '💳', '🧾', '💹', '📈', '📊', '📉', '💼', '🎁', '🎉', '🎊', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '🎗️', '🎫', '🎟️', '💎', '💍', '👑'],
    
    // 其他常用
    other: ['📦', '📮', '📯', '📪', '📫', '📬', '📭', '📤', '📥', '🗳️', '✉️', '📧', '📨', '📩', '📰', '🗞️', '📑', '🔖', '🏷️', '🔒', '🔓', '🔐', '🔑', '🗝️', '🪧', '🪪', '📱', '☎️', '📞', '📟', '📠', '💻', '🖥️', '🖨️', '⌨️', '🖱️', '🖲️', '🕹️', '🗜️', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥', '📺', '📻', '🔊', '🔉', '🔈', '🔇', '📢', '📣', '📯', '🔔', '🔕', '📡', '🌐', '💬', '💭']
};

// 初始化图标选择器
function initIconPicker() {
    const container = document.getElementById('icon-picker-container');
    if (!container) return;
    
    // 按类别组织图标
    const categories = [
        { name: '餐饮美食', icons: ICON_LIBRARY.food },
        { name: '交通出行', icons: ICON_LIBRARY.transport },
        { name: '购物消费', icons: ICON_LIBRARY.shopping },
        { name: '娱乐休闲', icons: ICON_LIBRARY.entertainment },
        { name: '医疗健康', icons: ICON_LIBRARY.medical },
        { name: '教育学习', icons: ICON_LIBRARY.education },
        { name: '住房物业', icons: ICON_LIBRARY.housing },
        { name: '水电通讯', icons: ICON_LIBRARY.utilities },
        { name: '生活服务', icons: ICON_LIBRARY.life },
        { name: '宠物动物', icons: ICON_LIBRARY.pets },
        { name: '运动健身', icons: ICON_LIBRARY.sports },
        { name: '旅行度假', icons: ICON_LIBRARY.travel },
        { name: '礼物人情', icons: ICON_LIBRARY.gifts },
        { name: '快递物流', icons: ICON_LIBRARY.delivery },
        { name: '收入相关', icons: ICON_LIBRARY.income },
        { name: '其他常用', icons: ICON_LIBRARY.other }
    ];
    
    container.innerHTML = categories.map(cat => `
        <div class="icon-category-section">
            <div class="icon-category-title">${cat.name}</div>
            <div class="icon-grid">
                ${cat.icons.map(icon => `
                    <button type="button" class="icon-option" data-icon="${icon}">
                        ${icon}
                    </button>
                `).join('')}
            </div>
        </div>
    `).join('');
    
    // 绑定图标选择事件
    container.querySelectorAll('.icon-option').forEach(btn => {
        btn.addEventListener('click', function() {
            const icon = this.dataset.icon;
            selectIcon(icon);
        });
    });
}

// 打开图标选择器
function openIconPicker(mode = 'add') {
    // 保存当前模式
    document.getElementById('icon-picker-modal').dataset.mode = mode;
    document.getElementById('icon-picker-modal').classList.add('show');
}

// 关闭图标选择器
function closeIconPicker() {
    document.getElementById('icon-picker-modal').classList.remove('show');
}

// 选择图标
function selectIcon(icon) {
    const mode = document.getElementById('icon-picker-modal').dataset.mode || 'add';
    if (mode === 'edit') {
        document.getElementById('edit-category-icon').value = icon;
        document.getElementById('edit-selected-icon-preview').textContent = icon;
    } else {
        document.getElementById('new-category-icon').value = icon;
        document.getElementById('selected-icon-preview').textContent = icon;
    }
    closeIconPicker();
}

// 打开数字键盘
function openNumberKeyboard(inputId = 'record-amount') {
    const keyboard = document.getElementById('number-keyboard');
    const amountInput = document.getElementById(inputId);
    if (!amountInput) return;
    
    // 保存当前输入框ID，用于关闭时更新
    keyboard.dataset.targetInput = inputId;
    
    // 获取当前值
    let currentValue = amountInput.value || '0.00';
    // 移除可能的¥符号和空格
    currentValue = currentValue.replace(/[¥\s]/g, '');
    // 如果为空或无效，设为0.00
    if (!currentValue || currentValue === '0' || isNaN(parseFloat(currentValue))) {
        currentValue = '0.00';
    } else {
        // 确保格式正确
        const num = parseFloat(currentValue);
        currentValue = num.toFixed(2);
    }
    
    // 如果是首页的记账按钮打开的，重置键盘状态
    const dateSection = document.querySelector('.keyboard-date-section');
    if (inputId === 'record-amount') {
        numberKeyboardValue = '0.00';
        numberKeyboardExpression = '';
        // 重置日期选择为今天（默认）
        selectedRecordDate = getLocalDateString();
        // 重置键盘中的备注输入框
        const keyboardNoteInput = document.getElementById('keyboard-note-input');
        if (keyboardNoteInput) {
            keyboardNoteInput.value = '';
        }
        // 初始化日期选择按钮状态（默认选择今天，offset=0）
        updateKeyboardDateSelection(0);
        // 显示日期选择区域
        if (dateSection) {
            dateSection.style.display = 'block';
        }
    } else {
        numberKeyboardValue = currentValue;
        numberKeyboardExpression = '';
        // 编辑模态框不显示日期选择
        selectedRecordDate = null;
        // 隐藏日期选择区域
        if (dateSection) {
            dateSection.style.display = 'none';
        }
        // 同步备注输入框的值（编辑模态框）
        const editNoteInput = document.getElementById('edit-note');
        const keyboardNoteInput = document.getElementById('keyboard-note-input');
        if (keyboardNoteInput && editNoteInput) {
            keyboardNoteInput.value = editNoteInput.value || '';
        }
    }
    
    // 更新显示
    updateNumberKeyboardDisplay();
    
    // 显示键盘和背景遮罩
    keyboard.classList.add('show');
    const backdrop = document.getElementById('number-keyboard-backdrop');
    if (backdrop) {
        backdrop.classList.add('show');
    }
    document.body.classList.add('keyboard-open');
}

// 关闭数字键盘
function closeNumberKeyboard() {
    const keyboard = document.getElementById('number-keyboard');
    const inputId = keyboard.dataset.targetInput || 'record-amount';
    const amountInput = document.getElementById(inputId);
    
    if (!amountInput) return;
    
    // 如果有未完成的表达式，先计算结果
    if (numberKeyboardExpression) {
        try {
            // 构建完整表达式：仅支持 + - 运算
            let expr = (numberKeyboardExpression + numberKeyboardValue).replace(/\s+/g, ' ').trim();
            const result = eval(expr);
            numberKeyboardValue = parseFloat(result).toFixed(2);
            numberKeyboardExpression = '';
        } catch (e) {
            // 忽略错误，使用当前值
        }
    }
    
    // 确保格式正确
    let finalValue = numberKeyboardValue;
    if (finalValue && finalValue !== '0.00') {
        const num = parseFloat(finalValue);
        if (!isNaN(num)) {
            finalValue = num.toFixed(2);
        }
    } else {
        finalValue = '';
    }
    
    // 更新输入框值
    amountInput.value = finalValue;
    
    // 同步备注输入框的值（支持首页和编辑模态框）
    const keyboardNoteInput = document.getElementById('keyboard-note-input');
    const noteInput = document.getElementById('record-note');
    const editNoteInput = document.getElementById('edit-note');
    if (keyboardNoteInput) {
        // 优先更新编辑模态框的备注，如果编辑模态框打开的话
        if (editNoteInput && document.getElementById('edit-modal').classList.contains('show')) {
            editNoteInput.value = keyboardNoteInput.value || '';
        } else if (noteInput) {
            noteInput.value = keyboardNoteInput.value || '';
        }
    }
    
    // 隐藏键盘和背景遮罩
    keyboard.classList.remove('show');
    const backdrop = document.getElementById('number-keyboard-backdrop');
    if (backdrop) {
        backdrop.classList.remove('show');
    }
    document.body.classList.remove('keyboard-open');
}

// 从键盘提交记账
async function submitRecordFromKeyboard() {
    // 先同步数据到隐藏输入框
    const keyboard = document.getElementById('number-keyboard');
    const inputId = keyboard.dataset.targetInput || 'record-amount';
    const amountInput = document.getElementById(inputId);
    
    if (!amountInput) return;
    
    // 如果有未完成的表达式，先计算结果（仅 + -）
    if (numberKeyboardExpression) {
        try {
            let expr = (numberKeyboardExpression + numberKeyboardValue).replace(/\s+/g, ' ').trim();
            const result = eval(expr);
            numberKeyboardValue = parseFloat(result).toFixed(2);
            numberKeyboardExpression = '';
        } catch (e) {
            // 忽略错误，使用当前值
        }
    }
    
    // 确保格式正确
    let finalValue = numberKeyboardValue;
    if (finalValue && finalValue !== '0.00') {
        const num = parseFloat(finalValue);
        if (!isNaN(num)) {
            finalValue = num.toFixed(2);
        }
    } else {
        finalValue = '';
    }
    
    // 更新金额输入框值
    amountInput.value = finalValue;
    
    // 同步备注输入框的值
    const keyboardNoteInput = document.getElementById('keyboard-note-input');
    const noteInput = document.getElementById('record-note');
    if (keyboardNoteInput && noteInput) {
        noteInput.value = keyboardNoteInput.value || '';
    }
    
    // 验证金额
    const amount = parseFloat(finalValue);
    if (isNaN(amount) || amount <= 0) {
        customAlert('请输入有效的金额', '输入错误', 'warning');
        return;
    }
    
    // 如果是编辑模态框，只关闭键盘，不提交
    if (inputId === 'edit-amount') {
        // 关闭键盘
        keyboard.classList.remove('show');
        document.body.classList.remove('keyboard-open');
        return;
    }
    
    // 验证分类（仅首页记账需要）
    const categoryValue = document.getElementById('category-selected-value').value;
    if (!categoryValue) {
        customAlert('请选择分类', '提示', 'warning');
        return;
    }
    
    // 关闭键盘和背景遮罩
    keyboard.classList.remove('show');
    const backdrop = document.getElementById('number-keyboard-backdrop');
    if (backdrop) {
        backdrop.classList.remove('show');
    }
    document.body.classList.remove('keyboard-open');
    
    // 提交表单
    await handleAddRecord(null);
    // 关闭记账流程浮层
    closeRecordFlow();
}

// 更新数字键盘显示
function updateNumberKeyboardDisplay() {
    const display = document.getElementById('number-keyboard-display');
    if (display) {
        // 如果有表达式，显示表达式；否则显示当前值
        if (numberKeyboardExpression) {
            display.textContent = numberKeyboardExpression + numberKeyboardValue;
        } else {
            display.textContent = numberKeyboardValue;
        }
    }
    // 同步记账流程 Step2 的金额展示（与键盘联动）
    const flowAmountEl = document.getElementById('record-flow-amount-value');
    if (flowAmountEl) {
        if (numberKeyboardExpression) {
            flowAmountEl.textContent = numberKeyboardExpression + numberKeyboardValue;
        } else {
            flowAmountEl.textContent = numberKeyboardValue;
        }
    }
}

// 初始化键盘事件
function initKeyboardEvents() {
    // 数字键盘事件
    const numberKeyboard = document.getElementById('number-keyboard');
    if (numberKeyboard) {
        // 键盘按钮事件
        numberKeyboard.querySelectorAll('.keyboard-key').forEach(key => {
            key.addEventListener('click', function() {
                const keyValue = this.dataset.key;
                handleNumberKeyPress(keyValue);
            });
        });
        
        // 日期选择按钮事件（只支持前天、昨天、今天、明天）
        numberKeyboard.querySelectorAll('.keyboard-date-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const offset = this.dataset.dateOffset;
                if (offset !== undefined) {
                    const offsetNum = parseInt(offset, 10);
                    updateKeyboardDateSelection(offsetNum);
                }
            });
        });
    }
    
    // 点击背景遮罩关闭键盘
    const backdrop = document.getElementById('number-keyboard-backdrop');
    if (backdrop) {
        backdrop.addEventListener('click', function() {
            closeNumberKeyboard();
        });
    }
    
    // 点击键盘外部关闭
    document.addEventListener('click', function(e) {
        const numberKeyboard = document.getElementById('number-keyboard');
        const keyboardNoteInput = document.getElementById('keyboard-note-input');
        if (numberKeyboard && numberKeyboard.classList.contains('show')) {
            const inputId = numberKeyboard.dataset.targetInput || 'record-amount';
            const targetInput = document.getElementById(inputId);
            if (!numberKeyboard.contains(e.target) && 
                (!targetInput || !targetInput.contains(e.target)) &&
                (!keyboardNoteInput || !keyboardNoteInput.contains(e.target))) {
                closeNumberKeyboard();
            }
        }
    });
}

// 处理数字键盘按键
function handleNumberKeyPress(key) {
    if (key === 'confirm') {
        // 确定按钮 - 提交表单并关闭键盘
        submitRecordFromKeyboard();
    } else if (key === 'clear') {
        // 清除
        numberKeyboardValue = '0.00';
        numberKeyboardExpression = '';
        updateNumberKeyboardDisplay();
    } else if (key === '=') {
        // 计算结果
        if (numberKeyboardExpression) {
            try {
                let expr = (numberKeyboardExpression + numberKeyboardValue).replace(/\s+/g, ' ').trim();
                const result = eval(expr);
                numberKeyboardValue = parseFloat(result).toFixed(2);
                numberKeyboardExpression = '';
                updateNumberKeyboardDisplay();
            } catch (e) {
                console.error('计算错误:', e);
                numberKeyboardValue = '0.00';
                numberKeyboardExpression = '';
                updateNumberKeyboardDisplay();
            }
        } else {
            // 如果没有表达式，只是显示当前值（已经是结果）
            // 不做任何操作，保持当前值
        }
    } else if (['+', '-'].includes(key)) {
        // 运算符（仅加减）
        if (numberKeyboardExpression) {
            try {
                let expr = (numberKeyboardExpression + numberKeyboardValue).replace(/\s+/g, ' ').trim();
                const result = eval(expr);
                numberKeyboardValue = parseFloat(result).toFixed(2);
            } catch (e) {
                // 忽略错误，使用当前值
            }
        }
        numberKeyboardExpression = numberKeyboardValue + ' ' + key + ' ';
        numberKeyboardValue = '0.00';
        updateNumberKeyboardDisplay();
    } else {
        // 数字或小数点
        // 如果有表达式，重置为输入新数字
        if (numberKeyboardExpression && numberKeyboardValue === '0.00') {
            numberKeyboardValue = '';
        }
        
        if (numberKeyboardValue === '0.00' || numberKeyboardValue === '0' || numberKeyboardValue === '') {
            if (key === '.') {
                numberKeyboardValue = '0.';
            } else {
                numberKeyboardValue = key;
            }
        } else {
            // 检查是否已经有小数点
            if (key === '.' && numberKeyboardValue.includes('.')) {
                return; // 不允许多个小数点
            }
            // 限制小数位数
            if (numberKeyboardValue.includes('.')) {
                const parts = numberKeyboardValue.split('.');
                if (parts[1] && parts[1].length >= 2) {
                    return; // 最多两位小数
                }
            }
            numberKeyboardValue += key;
        }
        updateNumberKeyboardDisplay();
    }
}

// ========== 键盘日期选择功能 ==========
// 更新日期选择按钮状态
function updateKeyboardDateSelection(offset) {
    // 移除所有按钮的active状态
    document.querySelectorAll('.keyboard-date-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // 计算选择的日期
    const today = new Date();
    today.setDate(today.getDate() + offset);
    selectedRecordDate = getLocalDateString(today);
    
    // 激活对应的按钮
    const targetBtn = document.querySelector(`.keyboard-date-btn[data-date-offset="${offset}"]`);
    if (targetBtn) {
        targetBtn.classList.add('active');
    }
    
}

// ========== 日期选择功能（记录列表改日期 / 编辑模态框共用同一弹窗）==========
let pendingDatePickerOnConfirm = null;

// 关闭日期选择弹窗
function closeDatePickerModal() {
    const modal = document.getElementById('date-picker-modal');
    if (modal) modal.classList.remove('show');
}

// 确保日期选择器模态框存在
function ensureDatePickerModal() {
    const modal = document.getElementById('date-picker-modal');
    if (!modal) return null;
    
    // 只绑定一次事件
    if (!modal.dataset.initialized) {
        const confirmBtn = document.getElementById('date-picker-confirm');
        const cancelBtn = document.getElementById('date-picker-cancel');
        const closeBtn = document.getElementById('date-picker-close');
        const input = document.getElementById('date-picker-input');
        
        if (confirmBtn && input) {
            confirmBtn.addEventListener('click', () => {
                const selectedDate = (input.value || '').trim();
                if (!selectedDate) return;
                if (typeof pendingDatePickerOnConfirm === 'function') {
                    pendingDatePickerOnConfirm(selectedDate);
                    pendingDatePickerOnConfirm = null;
                }
                closeDatePickerModal();
            });
        }
        
        [cancelBtn, closeBtn].forEach(btn => {
            if (btn) btn.addEventListener('click', () => {
                if (typeof pendingDatePickerOnConfirm === 'function') pendingDatePickerOnConfirm = null;
                closeDatePickerModal();
            });
        });
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                if (typeof pendingDatePickerOnConfirm === 'function') pendingDatePickerOnConfirm = null;
                closeDatePickerModal();
            }
        });
        
        modal.dataset.initialized = 'true';
    }
    
    return modal;
}

// 统一日期选择弹窗入口：记账不传 onConfirm；记录列表/编辑模态框传 initialValue + onConfirm
function openSharedDatePicker(options) {
    const { initialValue, title = '选择日期', onConfirm = null } = options || {};
    const modal = ensureDatePickerModal();
    const input = document.getElementById('date-picker-input');
    const titleEl = document.getElementById('date-picker-title');
    if (!modal || !input) return;
    
    pendingDatePickerOnConfirm = onConfirm || null;
    if (titleEl) titleEl.textContent = title;
    
    let val = '';
    if (initialValue && /^\d{4}-\d{2}-\d{2}$/.test(String(initialValue).trim())) {
        val = String(initialValue).trim();
    } else if (initialValue) {
        const d = new Date(initialValue);
        val = getLocalDateString(d);
    } else {
        val = getLocalDateString();
    }
    input.value = val;
    
    modal.classList.add('show');
    setTimeout(() => {
        input.focus();
        if (typeof input.showPicker === 'function') {
            try { input.showPicker(); } catch (e) { /* 部分浏览器不支持 */ }
        }
    }, 150);
}

// 格式化为「YYYY年M月D日 星期X」，入参可为 Date 或 'YYYY-MM-DD' 字符串
function formatDateDisplayString(dateOrStr) {
    const d = dateOrStr instanceof Date ? dateOrStr : new Date(String(dateOrStr).trim() + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${weekdays[d.getDay()]}`;
}

// 添加动画样式（如果不存在）
if (!document.getElementById('expense-tracker-animations')) {
    const style = Object.assign(document.createElement('style'), {
        id: 'expense-tracker-animations',
        textContent: `@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes slideOut{from{transform:translateX(0);opacity:1}to{transform:translateX(100%);opacity:0}}`
    });
    document.head.appendChild(style);
}

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
// 记录列表无限滚动
const RECORDS_PER_PAGE = 12;
let totalPagesRecords = 0;
let isLoadingRecords = false;
let recordsScrollObserver = null;
let echartsLine = null;
let echartsPie = null;
let echartsBar = null;
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

    if (authenticated) {
        loadCategories().then(() => loadTodayRecords());
        Promise.all([loadStatistics(), loadRecords()]).catch(err => console.error('数据加载错误:', err));
    }
}

// 初始化主标签页
function initMainTabs() {
    document.querySelectorAll('.main-tab-btn').forEach(btn => {
        btn.addEventListener('click', function () {
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
        btn.addEventListener('click', function () {
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
        displayModeSelect.addEventListener('change', function () {
            syncFromSelect();
            if (lastCategoryStatsForCharts && lastCategoryStatsForCharts.length > 0) {
                updatePieChart(lastCategoryStatsForCharts).catch(() => { });
                updateBarChart(lastCategoryStatsForCharts).catch(() => { });
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
            tooltip: { show: false }
        });
    } catch (error) {
        console.error('初始化柱状图失败:', error);
        setChartPlaceholder('bar-chart', '图表加载失败，请刷新页面', true);
    }
}

// 自定义键盘相关变量
let numberKeyboardValue = '0.00';
let numberKeyboardExpression = '';
let selectedRecordDate = null; // 记账时选择的日期，null表示使用今天
let currentEditingRecord = null; // 当前正在编辑的记录（用于记录列表中的编辑）
// 记录列表的内部日期筛选（不再使用可见的日期输入框）
let recordsFilterStartDate = null;
let recordsFilterEndDate = null;

// 绑定事件
function bindEvents() {
    // 记账按钮点击事件 - 先打开记账流程（选分类），选完再进金额
    const btnOpenKeyboard = document.getElementById('btn-open-keyboard');
    if (btnOpenKeyboard) {
        btnOpenKeyboard.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            openRecordFlow();
        });
    }
    bindRecordFlowEvents();

    // 编辑模态框中的金额输入框
    const editAmountInput = document.getElementById('edit-amount');
    if (editAmountInput) {
        editAmountInput.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            openNumberKeyboard('edit-amount');
        });
        editAmountInput.addEventListener('focus', function (e) {
            e.preventDefault();
            this.blur();
            openNumberKeyboard('edit-amount');
        });
    }

    // 编辑模态框中的备注输入框 - 打开键盘并聚焦到备注输入框
    const editNoteInput = document.getElementById('edit-note');
    if (editNoteInput) {
        editNoteInput.addEventListener('click', function (e) {
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
        editNoteInput.addEventListener('focus', function (e) {
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
        keyboardNoteInput.addEventListener('focus', function () {
            // 不做任何阻止，让系统键盘正常弹出
        });
    }

    // 初始化键盘事件
    initKeyboardEvents();

    // 类型切换按钮（首页与记账流程内共用，流程内需同步更新流程分类列表）
    document.querySelectorAll('.type-btn-compact').forEach(btn => {
        btn.addEventListener('click', function () {
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
    // 记录列表搜索
    const recordsSearchInput = document.getElementById('records-search-input');
    const recordsSearchClear = document.getElementById('records-search-clear');
    if (recordsSearchInput) {
        // 回车触发搜索
        recordsSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                // 搜索时清除日期筛选，按关键字搜索全部
                recordsFilterStartDate = null;
                recordsFilterEndDate = null;
                loadRecords(1);
            }
        });
        // 输入变化时，空字符串自动恢复全部
        recordsSearchInput.addEventListener('input', () => {
            const val = recordsSearchInput.value.trim();
            if (!val) {
                recordsFilterStartDate = null;
                recordsFilterEndDate = null;
                loadRecords(1);
            }
        });
    }
    if (recordsSearchClear) {
        recordsSearchClear.addEventListener('click', () => {
            if (recordsSearchInput) {
                recordsSearchInput.value = '';
            }
            // 清空搜索时也清空日期筛选
            recordsFilterStartDate = null;
            recordsFilterEndDate = null;
            loadRecords(1);
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
        btn.addEventListener('click', function () {
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
    document.getElementById('edit-icon-selector-btn').addEventListener('click', function () {
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
        btn.addEventListener('click', function () {
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
    setTimeout(function () {
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
        btn.addEventListener('click', function (e) {
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
            btn.addEventListener('contextmenu', function (e) { e.preventDefault(); openCategoryModal(); });
            let longPressTimer = null;
            btn.addEventListener('mousedown', function () {
                longPressTimer = setTimeout(function () { longPressTimer = null; openCategoryModal(); }, 800);
            });
            btn.addEventListener('mouseup', function () { if (longPressTimer) clearTimeout(longPressTimer); longPressTimer = null; });
            btn.addEventListener('mouseleave', function () { if (longPressTimer) clearTimeout(longPressTimer); longPressTimer = null; });
            btn.addEventListener('touchstart', function (e) {
                longPressTimer = setTimeout(function () { e.preventDefault(); longPressTimer = null; openCategoryModal(); }, 800);
            });
            btn.addEventListener('touchend', function () { if (longPressTimer) clearTimeout(longPressTimer); longPressTimer = null; });
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
        sheet.addEventListener('touchstart', function (e) {
            if (e.touches.length !== 1) return;
            swipeStartX = e.touches[0].clientX;
            swipeStartY = e.touches[0].clientY;
        }, { passive: true });
        sheet.addEventListener('touchend', function (e) {
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


async function updateLineChart(dailyStats) {
    if (typeof echarts === 'undefined') {
        setChartPlaceholder('line-chart', '图表加载失败，请刷新页面', true);
        return;
    }
    currentDailyStats = dailyStats || [];

    if (!dailyStats || dailyStats.length === 0) {
        if (echartsLine) { echartsLine.dispose(); echartsLine = null; }
        setChartPlaceholder('line-chart', '暂无数据');
        return;
    }

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
            tooltip: { show: false }
        });
    } catch (error) {
        console.error('初始化饼图失败:', error);
        setChartPlaceholder('pie-chart', '图表加载失败，请刷新页面', true);
    }
}

// 加载记录列表（支持无限滚动：第1页替换，后续页追加）
async function loadRecords(page = 1) {
    const listEl = document.getElementById('records-list');
    const paginationEl = document.getElementById('pagination');
    if (!listEl) return;

    const isFirstPage = page === 1;
    if (isFirstPage) {
        currentPage = 0;
        totalPagesRecords = 0;
        listEl.innerHTML = '<div class="records-loading-inline">加载中...</div>';
        if (paginationEl) paginationEl.innerHTML = '';
        destroyRecordsScrollObserver();
    } else {
        if (isLoadingRecords) return;
        if (page > totalPagesRecords && totalPagesRecords > 0) return;
        updateRecordsFooter(true, false);
    }

    isLoadingRecords = true;
    try {
        let url = `${API_BASE}/records?page=${page}&per_page=${RECORDS_PER_PAGE}`;
        if (recordsFilterStartDate) url += `&start_date=${encodeURIComponent(recordsFilterStartDate)}`;
        if (recordsFilterEndDate) url += `&end_date=${encodeURIComponent(recordsFilterEndDate)}`;
        const recordsSearchInput = document.getElementById('records-search-input');
        const keyword = recordsSearchInput ? recordsSearchInput.value.trim() : '';
        if (keyword) url += `&q=${encodeURIComponent(keyword)}`;

        const response = await authFetch(url);
        const data = await response.json();

        currentPage = data.page;
        totalPagesRecords = data.pages || 0;
        const hasMore = currentPage < totalPagesRecords;

        if (isFirstPage) {
            renderRecords(data.records);
            const isEmpty = !data.records || data.records.length === 0;
            appendRecordsFooterAndSentinel(hasMore, isEmpty);
            setupRecordsScrollObserver(hasMore);
        } else {
            appendRecords(data.records);
            updateRecordsFooter(false, hasMore);
        }
    } catch (error) {
        console.error('加载记录失败:', error);
        if (isFirstPage) {
            listEl.innerHTML = '<div class="loading">加载失败，请刷新重试</div>';
        }
        updateRecordsFooter(false, true);
    } finally {
        isLoadingRecords = false;
    }
}

// 底部占位：加载中 / 没有更多 / 哨兵（用于提前触发下一页）
function appendRecordsFooterAndSentinel(hasMore, isEmptyList) {
    const listEl = document.getElementById('records-list');
    if (!listEl) return;
    let footer = listEl.querySelector('.records-list-footer');
    if (!footer) {
        footer = document.createElement('div');
        footer.className = 'records-list-footer';
        listEl.appendChild(footer);
    }
    if (isEmptyList) {
        footer.innerHTML = '';
    } else {
        footer.innerHTML = hasMore ? '' : '<div class="records-list-end">— 没有更多了 —</div>';
    }
    let sentinel = listEl.querySelector('.records-list-sentinel');
    if (!sentinel) {
        sentinel = document.createElement('div');
        sentinel.className = 'records-list-sentinel';
        sentinel.setAttribute('aria-hidden', 'true');
        listEl.appendChild(sentinel);
    }
}

function updateRecordsFooter(loading, hasMore) {
    const listEl = document.getElementById('records-list');
    if (!listEl) return;
    let footer = listEl.querySelector('.records-list-footer');
    if (!footer) return;
    if (loading) {
        footer.innerHTML = '<div class="records-loading-inline">加载中...</div>';
    } else {
        footer.innerHTML = hasMore ? '' : '<div class="records-list-end">— 没有更多了 —</div>';
        if (!hasMore) destroyRecordsScrollObserver();
    }
}

function setupRecordsScrollObserver(hasMore) {
    destroyRecordsScrollObserver();
    if (!hasMore) return;
    const listEl = document.getElementById('records-list');
    const sentinel = listEl && listEl.querySelector('.records-list-sentinel');
    if (!sentinel) return;
    // 提前约 400px 触发加载，实现无感提前加载
    recordsScrollObserver = new IntersectionObserver(
        (entries) => {
            const entry = entries[0];
            if (!entry || !entry.isIntersecting || isLoadingRecords) return;
            if (currentPage >= totalPagesRecords) return;
            loadRecords(currentPage + 1);
        },
        { root: null, rootMargin: '400px 0px 0px 0px', threshold: 0 }
    );
    recordsScrollObserver.observe(sentinel);
}

function destroyRecordsScrollObserver() {
    if (recordsScrollObserver) {
        recordsScrollObserver.disconnect();
        recordsScrollObserver = null;
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
            html += buildRecordItemHtml(record);
        });

        html += `
                </div>
            </div>
        `;
    });

    container.innerHTML = html;

    bindRecordAmountClick(container);
}

// 单条记录 HTML（供 renderRecords / appendRecords 复用）
function buildRecordItemHtml(record) {
    const category = [...categories.expense, ...categories.income].find(
        c => (c.id && c.id.toString() === record.category) || c.name === record.category
    );
    const icon = category?.icon || '📦';
    const name = category?.name || record.category;
    const typeClass = record.type === 'income' ? 'income' : 'expense';
    const displayName = record.note ? escapeHtml(record.note) : name;
    return `
        <div class="record-item" data-id="${record.id}">
            <div class="record-icon">${icon}</div>
            <div class="record-info">
                <div class="record-header">
                    <span class="record-category">${displayName}</span>
                </div>
            </div>
            <div class="record-amount ${typeClass}" data-record-id="${record.id}" data-record-type="${record.type}" data-record-category="${record.category}" data-record-date="${record.date}" data-record-note="${escapeHtml(record.note || '')}" style="cursor: pointer;">
                ${record.type === 'income' ? '+' : '-'}¥${parseFloat(record.amount).toFixed(2)}
            </div>
            <div class="record-actions">
                <button class="btn-danger" onclick="handleDeleteRecord(event, ${record.id})">删除</button>
            </div>
        </div>
    `;
}

// 为容器内 .record-amount 绑定点击
function bindRecordAmountClick(container) {
    if (!container) return;
    container.querySelectorAll('.record-amount').forEach(amountEl => {
        amountEl.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            const recordId = this.dataset.recordId;
            const recordType = this.dataset.recordType;
            const recordCategory = this.dataset.recordCategory;
            const recordDate = this.dataset.recordDate;
            const recordNote = this.dataset.recordNote || '';
            const recordAmount = this.textContent.replace(/[^0-9.]/g, '');

            if (recordId) {
                openRecordEditKeyboard({
                    id: recordId,
                    type: recordType,
                    category: recordCategory,
                    date: recordDate,
                    note: recordNote,
                    amount: recordAmount
                });
            }
        });
    });
}

// 追加一页记录（按日期合并到已有分组或新建分组）
function appendRecords(records) {
    if (!records || records.length === 0) return;
    const container = document.getElementById('records-list');
    if (!container) return;

    const groupedByDate = {};
    records.forEach(record => {
        const dateKey = record.date;
        if (!groupedByDate[dateKey]) groupedByDate[dateKey] = [];
        groupedByDate[dateKey].push(record);
    });
    const sortedDates = Object.keys(groupedByDate).sort((a, b) => new Date(b) - new Date(a));

    const footer = container.querySelector('.records-list-footer');
    const sentinel = container.querySelector('.records-list-sentinel');

    sortedDates.forEach(dateKey => {
        const dateRecords = groupedByDate[dateKey];
        let section = container.querySelector(`.date-section[data-date="${dateKey}"]`);
        if (section) {
            const dateRecordsEl = section.querySelector('.date-records');
            const dateHeader = section.querySelector('.date-header');
            dateRecords.forEach(record => {
                const div = document.createElement('div');
                div.innerHTML = buildRecordItemHtml(record).trim();
                dateRecordsEl.appendChild(div.firstElementChild);
            });
            bindRecordAmountClick(dateRecordsEl);
            // 更新该日期标题的统计
            const allInSection = section.querySelectorAll('.record-item');
            const total = allInSection.length;
            const dailyExpense = [...allInSection].reduce((sum, el) => {
                const amountEl = el.querySelector('.record-amount.expense');
                if (!amountEl) return sum;
                const m = amountEl.textContent.replace(/[^0-9.]/g, '');
                return sum + (parseFloat(m) || 0);
            }, 0);
            const totalSpan = dateHeader.querySelector('.date-total');
            const expenseSpan = dateHeader.querySelector('.date-expense');
            if (totalSpan) totalSpan.textContent = total + ' 条';
            if (expenseSpan) {
                expenseSpan.textContent = formatMoney(dailyExpense);
                expenseSpan.style.display = dailyExpense > 0 ? '' : 'none';
            }
        } else {
            const date = new Date(dateKey);
            const month = date.getMonth() + 1;
            const day = date.getDate();
            const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
            const weekday = weekdays[date.getDay()];
            const dateHeader = `${month}月${day}日 星期${weekday}`;
            const today = new Date();
            const isToday = date.toDateString() === today.toDateString();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            const isYesterday = date.toDateString() === yesterday.toDateString();
            let dateLabel = dateHeader;
            if (isToday) dateLabel = '今天 ' + dateHeader;
            else if (isYesterday) dateLabel = '昨天 ' + dateHeader;
            const dailyExpense = dateRecords.filter(r => r.type === 'expense').reduce((s, r) => s + parseFloat(r.amount || 0), 0);
            let sectionHtml = `
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
            dateRecords.forEach(record => {
                sectionHtml += buildRecordItemHtml(record);
            });
            sectionHtml += '</div></div>';
            const wrap = document.createElement('div');
            wrap.innerHTML = sectionHtml.trim();
            const newSection = wrap.firstElementChild;
            const insertBefore = footer || sentinel;
            if (insertBefore) {
                container.insertBefore(newSection, insertBefore);
            } else {
                container.appendChild(newSection);
            }
            bindRecordAmountClick(newSection);
        }
    });
}

// 渲染分页（已改为无限滚动，此函数保留为空避免其它处调用报错）
function renderPagination() {
    const container = document.getElementById('pagination');
    if (container) container.innerHTML = '';
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
        document.getElementById('edit-type').addEventListener('change', function () {
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
            loadRecords(1);
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
            loadRecords(1);
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
    const url = `${API_BASE}/export`;

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
        btn.addEventListener('click', function () {
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

// 打开记录编辑键盘（用于记录列表中的编辑）
function openRecordEditKeyboard(record) {
    // 保存当前编辑的记录信息
    currentEditingRecord = record;

    const keyboard = document.getElementById('number-keyboard');
    if (!keyboard) return;

    // 使用特殊的inputId标识这是记录编辑模式
    keyboard.dataset.targetInput = `record-edit-${record.id}`;

    // 设置金额值
    numberKeyboardValue = parseFloat(record.amount || 0).toFixed(2);
    numberKeyboardExpression = '';

    // 设置日期
    selectedRecordDate = record.date || getLocalDateString();

    // 设置备注
    const keyboardNoteInput = document.getElementById('keyboard-note-input');
    if (keyboardNoteInput) {
        keyboardNoteInput.value = record.note || '';
    }

    // 显示日期选择区域，并切换为编辑模式（显示"选择日期"按钮）
    const dateSection = document.querySelector('.keyboard-date-section');
    const quickButtons = document.getElementById('keyboard-date-quick-buttons');
    const selectWrapper = document.getElementById('keyboard-date-select-wrapper');
    const selectText = document.getElementById('keyboard-date-select-text');

    if (dateSection) {
        dateSection.style.display = 'block';
        // 隐藏快捷日期按钮，显示"选择日期"按钮
        if (quickButtons) quickButtons.style.display = 'none';
        if (selectWrapper) {
            selectWrapper.style.display = 'block';
            // 更新日期显示文本（使用简洁格式）
            if (selectText) {
                selectText.textContent = formatKeyboardDateDisplay(selectedRecordDate);
            }
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
        // 显示日期选择区域，并切换为记账模式（显示快捷日期按钮）
        if (dateSection) {
            dateSection.style.display = 'block';
            const quickButtons = document.getElementById('keyboard-date-quick-buttons');
            const selectWrapper = document.getElementById('keyboard-date-select-wrapper');
            // 显示快捷日期按钮，隐藏"选择日期"按钮
            if (quickButtons) quickButtons.style.display = 'flex';
            if (selectWrapper) selectWrapper.style.display = 'none';
        }
    } else {
        numberKeyboardValue = currentValue;
        numberKeyboardExpression = '';
        // 编辑模态框不显示日期选择
        selectedRecordDate = null;
        // 隐藏日期选择区域
        if (dateSection) {
            dateSection.style.display = 'none';
            const quickButtons = document.getElementById('keyboard-date-quick-buttons');
            const selectWrapper = document.getElementById('keyboard-date-select-wrapper');
            if (quickButtons) quickButtons.style.display = 'none';
            if (selectWrapper) selectWrapper.style.display = 'none';
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

    // 如果是记录编辑模式，清除编辑状态
    if (inputId && inputId.startsWith('record-edit-')) {
        currentEditingRecord = null;
    }

    const amountInput = document.getElementById(inputId);

    // 如果inputId不是标准的input元素（如record-edit-xxx），直接关闭键盘
    if (!amountInput && inputId.startsWith('record-edit-')) {
        keyboard.classList.remove('show');
        const backdrop = document.getElementById('number-keyboard-backdrop');
        if (backdrop) {
            backdrop.classList.remove('show');
        }
        document.body.classList.remove('keyboard-open');
        return;
    }

    // 如果inputId不是标准的input元素且不是记录编辑模式，直接返回
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

    // 获取amountInput（记录编辑模式可能不存在）
    let amountInput = null;
    if (!inputId || !inputId.startsWith('record-edit-')) {
        amountInput = document.getElementById(inputId);
        if (!amountInput) return;
    }

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

    // 更新金额输入框值（如果存在）
    if (amountInput) {
        amountInput.value = finalValue;
    }

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

    // 如果是记录列表中的编辑模式
    if (inputId && inputId.startsWith('record-edit-')) {
        if (!currentEditingRecord) {
            customAlert('编辑信息丢失，请重新操作', '错误', 'error');
            closeNumberKeyboard();
            return;
        }

        // 获取备注
        const keyboardNoteInput = document.getElementById('keyboard-note-input');
        const note = keyboardNoteInput ? keyboardNoteInput.value.trim() : '';

        // 获取日期（使用选择的日期或原日期）
        const date = selectedRecordDate || currentEditingRecord.date || getLocalDateString();

        // 验证金额
        const amount = parseFloat(finalValue);
        if (isNaN(amount) || amount <= 0) {
            customAlert('请输入有效的金额', '输入错误', 'warning');
            return;
        }

        // 关闭键盘和背景遮罩
        keyboard.classList.remove('show');
        const backdrop = document.getElementById('number-keyboard-backdrop');
        if (backdrop) {
            backdrop.classList.remove('show');
        }
        document.body.classList.remove('keyboard-open');

        // 更新记录
        try {
            const response = await authFetch(`${API_BASE}/records/${currentEditingRecord.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: currentEditingRecord.type,
                    category: currentEditingRecord.category,
                    amount: amount.toFixed(2),
                    date: date,
                    note: note
                })
            });

            const result = await response.json();

            if (response.ok) {
                showMessage('更新成功！', 'success');
                // 刷新数据
                loadStatistics();
                loadRecords(1);
                loadTodayRecords();
                // 清除编辑状态
                currentEditingRecord = null;
            } else {
                customAlert(result.error || '更新失败', '更新失败', 'error');
            }
        } catch (error) {
            console.error('更新记录失败:', error);
            customAlert('更新失败，请重试', '错误', 'error');
        }

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
            key.addEventListener('click', function () {
                const keyValue = this.dataset.key;
                handleNumberKeyPress(keyValue);
            });
        });

        // 日期选择按钮事件（只支持前天、昨天、今天、明天）
        numberKeyboard.querySelectorAll('.keyboard-date-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                const offset = this.dataset.dateOffset;
                if (offset !== undefined) {
                    const offsetNum = parseInt(offset, 10);
                    updateKeyboardDateSelection(offsetNum);
                }
            });
        });

        // 编辑模式下的日期选择按钮事件
        const dateSelectBtn = document.getElementById('keyboard-date-select-btn');
        if (dateSelectBtn) {
            dateSelectBtn.addEventListener('click', function (e) {
                e.stopPropagation(); // 阻止事件冒泡，避免触发数字键盘的关闭事件
                const keyboard = document.getElementById('number-keyboard');
                const inputId = keyboard.dataset.targetInput || '';

                // 只有在编辑记录模式下才打开日期选择器
                if (inputId && inputId.startsWith('record-edit-')) {
                    const currentDate = selectedRecordDate || getLocalDateString();
                    openSharedDatePicker({
                        initialValue: currentDate,
                        title: '选择日期',
                        onConfirm: (newDate) => {
                            selectedRecordDate = newDate;
                            const selectText = document.getElementById('keyboard-date-select-text');
                            if (selectText) {
                                selectText.textContent = formatKeyboardDateDisplay(newDate);
                            }
                            // 确保数字键盘仍然显示
                            const keyboard = document.getElementById('number-keyboard');
                            if (keyboard && !keyboard.classList.contains('show')) {
                                keyboard.classList.add('show');
                                const backdrop = document.getElementById('number-keyboard-backdrop');
                                if (backdrop) {
                                    backdrop.classList.add('show');
                                }
                                document.body.classList.add('keyboard-open');
                            }
                        }
                    });
                }
            });
        }
    }

    // 点击背景遮罩关闭键盘
    const backdrop = document.getElementById('number-keyboard-backdrop');
    if (backdrop) {
        backdrop.addEventListener('click', function (e) {
            // 如果日期选择器正在显示，不关闭数字键盘
            const datePickerModal = document.getElementById('date-picker-modal');
            if (datePickerModal && datePickerModal.classList.contains('show')) {
                // 如果点击的是日期选择器模态框，阻止事件
                if (datePickerModal.contains(e.target)) {
                    return;
                }
            }
            closeNumberKeyboard();
        });
    }

    // 点击键盘外部关闭
    document.addEventListener('click', function (e) {
        const numberKeyboard = document.getElementById('number-keyboard');
        const keyboardNoteInput = document.getElementById('keyboard-note-input');
        const datePickerModal = document.getElementById('date-picker-modal');

        // 如果日期选择器正在显示，不关闭数字键盘
        if (datePickerModal && datePickerModal.classList.contains('show')) {
            return;
        }

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
let calendarCurrentDate = null; // 当前显示的月份日期
let calendarSelectedDate = null; // 选中的日期

// 关闭日期选择弹窗
function closeDatePickerModal() {
    const modal = document.getElementById('date-picker-modal');
    if (modal) {
        modal.classList.remove('show');
        // 阻止事件冒泡，避免触发数字键盘的关闭事件
        const modalContent = modal.querySelector('.date-picker-modal-content');
        if (modalContent) {
            // 确保事件不会冒泡
        }
    }
    // 不清空 calendarSelectedDate，因为可能在确认时还需要使用
    // calendarCurrentDate = null;
    // calendarSelectedDate = null;
}

// 渲染日历
function renderCalendar(year, month, selectedDate) {
    const daysContainer = document.getElementById('calendar-days');
    const monthYearEl = document.getElementById('calendar-month-year');
    if (!daysContainer || !monthYearEl) return;

    // 更新月份年份显示
    monthYearEl.textContent = `${year}年${month}月`;

    // 清空日期容器
    daysContainer.innerHTML = '';

    // 获取当月第一天和最后一天
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const firstDayOfWeek = firstDay.getDay(); // 0=周日, 6=周六
    const daysInMonth = lastDay.getDate();

    // 获取上个月的最后几天（用于填充第一周）
    const prevMonthLastDay = new Date(year, month - 1, 0).getDate();

    // 获取今天的日期
    const today = new Date();
    const todayStr = getLocalDateString(today);

    // 渲染日期
    // 上个月的日期（灰色）
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
        const day = prevMonthLastDay - i;
        const dateStr = getLocalDateString(new Date(year, month - 2, day));
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day calendar-day-other';
        if (selectedDate && dateStr === selectedDate) {
            dayEl.classList.add('calendar-day-selected');
        }
        dayEl.textContent = day;
        dayEl.dataset.date = dateStr;
        daysContainer.appendChild(dayEl);
    }

    // 当月的日期
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = getLocalDateString(new Date(year, month - 1, day));
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day';

        // 判断是否是今天
        if (dateStr === todayStr) {
            dayEl.classList.add('calendar-day-today');
        }

        // 判断是否被选中
        if (selectedDate && dateStr === selectedDate) {
            dayEl.classList.add('calendar-day-selected');
        }

        dayEl.textContent = day;
        dayEl.dataset.date = dateStr;
        daysContainer.appendChild(dayEl);
    }

    // 下个月的日期（填充到6行）
    const totalCells = daysContainer.children.length;
    const remainingCells = 42 - totalCells; // 6行 x 7列 = 42
    for (let day = 1; day <= remainingCells; day++) {
        const dateStr = getLocalDateString(new Date(year, month, day));
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day calendar-day-other';
        if (selectedDate && dateStr === selectedDate) {
            dayEl.classList.add('calendar-day-selected');
        }
        dayEl.textContent = day;
        dayEl.dataset.date = dateStr;
        daysContainer.appendChild(dayEl);
    }

    // 绑定日期点击事件
    daysContainer.querySelectorAll('.calendar-day').forEach(dayEl => {
        dayEl.addEventListener('click', function (e) {
            e.stopPropagation(); // 阻止事件冒泡，避免触发数字键盘的关闭事件
            const date = this.dataset.date;
            if (!date) return;

            calendarSelectedDate = date;
            const dateObj = new Date(date + 'T00:00:00');

            // 如果点击的是其他月份的日期，切换到那个月份
            if (dateObj.getMonth() + 1 !== month || dateObj.getFullYear() !== year) {
                calendarCurrentDate = dateObj;
                renderCalendar(dateObj.getFullYear(), dateObj.getMonth() + 1, date);
            } else {
                // 移除之前的选中状态
                daysContainer.querySelectorAll('.calendar-day-selected').forEach(el => {
                    el.classList.remove('calendar-day-selected');
                });

                // 添加选中状态
                this.classList.add('calendar-day-selected');
            }
        });
    });
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
        const prevMonthBtn = document.getElementById('calendar-prev-month');
        const nextMonthBtn = document.getElementById('calendar-next-month');

        // 确认按钮
        if (confirmBtn) {
            confirmBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // 阻止事件冒泡
                if (!calendarSelectedDate) return;
                if (typeof pendingDatePickerOnConfirm === 'function') {
                    pendingDatePickerOnConfirm(calendarSelectedDate);
                    pendingDatePickerOnConfirm = null;
                }
                closeDatePickerModal();
                // 确保数字键盘仍然显示（如果在编辑模式下）
                setTimeout(() => {
                    const keyboard = document.getElementById('number-keyboard');
                    const inputId = keyboard ? keyboard.dataset.targetInput || '' : '';
                    if (inputId && inputId.startsWith('record-edit-')) {
                        if (keyboard && !keyboard.classList.contains('show')) {
                            keyboard.classList.add('show');
                            const backdrop = document.getElementById('number-keyboard-backdrop');
                            if (backdrop) {
                                backdrop.classList.add('show');
                            }
                            document.body.classList.add('keyboard-open');
                        }
                    }
                }, 10);
            });
        }

        // 取消和关闭按钮
        [cancelBtn, closeBtn].forEach(btn => {
            if (btn) btn.addEventListener('click', (e) => {
                e.stopPropagation(); // 阻止事件冒泡
                if (typeof pendingDatePickerOnConfirm === 'function') pendingDatePickerOnConfirm = null;
                closeDatePickerModal();
                // 确保数字键盘仍然显示（如果在编辑模式下）
                setTimeout(() => {
                    const keyboard = document.getElementById('number-keyboard');
                    const inputId = keyboard ? keyboard.dataset.targetInput || '' : '';
                    if (inputId && inputId.startsWith('record-edit-')) {
                        if (keyboard && !keyboard.classList.contains('show')) {
                            keyboard.classList.add('show');
                            const backdrop = document.getElementById('number-keyboard-backdrop');
                            if (backdrop) {
                                backdrop.classList.add('show');
                            }
                            document.body.classList.add('keyboard-open');
                        }
                    }
                }, 10);
            });
        });

        // 月份导航
        if (prevMonthBtn) {
            prevMonthBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // 阻止事件冒泡
                if (!calendarCurrentDate) return;
                const newDate = new Date(calendarCurrentDate);
                newDate.setMonth(newDate.getMonth() - 1);
                calendarCurrentDate = newDate;
                renderCalendar(newDate.getFullYear(), newDate.getMonth() + 1, calendarSelectedDate);
            });
        }

        if (nextMonthBtn) {
            nextMonthBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // 阻止事件冒泡
                if (!calendarCurrentDate) return;
                const newDate = new Date(calendarCurrentDate);
                newDate.setMonth(newDate.getMonth() + 1);
                calendarCurrentDate = newDate;
                renderCalendar(newDate.getFullYear(), newDate.getMonth() + 1, calendarSelectedDate);
            });
        }

        // 快捷操作按钮
        const quickBtns = document.querySelectorAll('.calendar-quick-btn');
        quickBtns.forEach(btn => {
            btn.addEventListener('click', function (e) {
                e.stopPropagation(); // 阻止事件冒泡
                const action = this.dataset.action;
                let targetDate = null;
                const today = new Date();

                if (action === 'today') {
                    targetDate = getLocalDateString(today);
                } else if (action === 'yesterday') {
                    const yesterday = new Date(today);
                    yesterday.setDate(yesterday.getDate() - 1);
                    targetDate = getLocalDateString(yesterday);
                } else if (action === 'tomorrow') {
                    const tomorrow = new Date(today);
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    targetDate = getLocalDateString(tomorrow);
                }

                if (targetDate) {
                    calendarSelectedDate = targetDate;
                    const dateObj = new Date(targetDate + 'T00:00:00');
                    calendarCurrentDate = dateObj;
                    renderCalendar(dateObj.getFullYear(), dateObj.getMonth() + 1, targetDate);
                }
            });
        });

        // 点击背景关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                e.stopPropagation(); // 阻止事件冒泡到数字键盘的背景遮罩
                if (typeof pendingDatePickerOnConfirm === 'function') pendingDatePickerOnConfirm = null;
                closeDatePickerModal();
            }
        });

        // 阻止日期选择器内容区域的点击事件冒泡
        const modalContent = modal.querySelector('.date-picker-modal-content');
        if (modalContent) {
            modalContent.addEventListener('click', (e) => {
                e.stopPropagation(); // 阻止事件冒泡
            });
        }

        modal.dataset.initialized = 'true';
    }

    return modal;
}

// 统一日期选择弹窗入口：记账不传 onConfirm；记录列表/编辑模态框传 initialValue + onConfirm
function openSharedDatePicker(options) {
    const { initialValue, title = '选择日期', onConfirm = null } = options || {};
    const modal = ensureDatePickerModal();
    const titleEl = document.getElementById('date-picker-title');
    if (!modal) return;

    pendingDatePickerOnConfirm = onConfirm || null;
    if (titleEl) titleEl.textContent = title;

    // 解析初始日期
    let initialDate = null;
    if (initialValue && /^\d{4}-\d{2}-\d{2}$/.test(String(initialValue).trim())) {
        initialDate = String(initialValue).trim();
    } else if (initialValue) {
        const d = new Date(initialValue);
        initialDate = getLocalDateString(d);
    } else {
        initialDate = getLocalDateString();
    }

    // 设置当前显示的月份和选中的日期
    const dateObj = new Date(initialDate + 'T00:00:00');
    calendarCurrentDate = dateObj;
    calendarSelectedDate = initialDate;

    // 渲染日历
    renderCalendar(dateObj.getFullYear(), dateObj.getMonth() + 1, initialDate);

    // 显示模态框
    modal.classList.add('show');

    // 确保数字键盘仍然显示（如果在编辑模式下）
    const keyboard = document.getElementById('number-keyboard');
    const inputId = keyboard ? keyboard.dataset.targetInput || '' : '';
    if (inputId && inputId.startsWith('record-edit-')) {
        // 确保数字键盘保持显示状态
        if (keyboard && !keyboard.classList.contains('show')) {
            keyboard.classList.add('show');
            const backdrop = document.getElementById('number-keyboard-backdrop');
            if (backdrop) {
                backdrop.classList.add('show');
            }
            document.body.classList.add('keyboard-open');
        }
    }
}

// 格式化为「YYYY年M月D日 星期X」，入参可为 Date 或 'YYYY-MM-DD' 字符串
function formatDateDisplayString(dateOrStr) {
    const d = dateOrStr instanceof Date ? dateOrStr : new Date(String(dateOrStr).trim() + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${weekdays[d.getDay()]}`;
}

// 格式化为键盘日期显示格式「M月D日 星期X」（更简洁，适合手机端）
function formatKeyboardDateDisplay(dateOrStr) {
    const d = dateOrStr instanceof Date ? dateOrStr : new Date(String(dateOrStr).trim() + 'T00:00:00');
    if (isNaN(d.getTime())) return '选择日期';
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    const isYesterday = (() => {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return d.toDateString() === yesterday.toDateString();
    })();
    const isTomorrow = (() => {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return d.toDateString() === tomorrow.toDateString();
    })();

    // 如果是今天、昨天、明天，显示相对日期
    if (isToday) {
        return `今天 ${d.getMonth() + 1}月${d.getDate()}日`;
    } else if (isYesterday) {
        return `昨天 ${d.getMonth() + 1}月${d.getDate()}日`;
    } else if (isTomorrow) {
        return `明天 ${d.getMonth() + 1}月${d.getDate()}日`;
    } else {
        return `${d.getMonth() + 1}月${d.getDate()}日 星期${weekdays[d.getDay()]}`;
    }
}

// 添加动画样式（如果不存在）
if (!document.getElementById('expense-tracker-animations')) {
    const style = Object.assign(document.createElement('style'), {
        id: 'expense-tracker-animations',
        textContent: `@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes slideOut{from{transform:translateX(0);opacity:1}to{transform:translateX(100%);opacity:0}}`
    });
    document.head.appendChild(style);
}

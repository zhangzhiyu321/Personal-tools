// 记账工具前端逻辑

const API_BASE = '/api/expense_tracker';

// 全局变量
let categories = { expense: [], income: [] };
let currentPage = 1;
let lineChart = null;
let pieChart = null;
let barChart = null;
let currentTimeDimension = 'month'; // day, week, month, year, custom
let customDateRange = { start: '', end: '' };
let chartJsLoaded = false; // Chart.js是否已加载

// 动态加载Chart.js（延迟加载，提升初始加载速度）
async function loadChartJs() {
    if (chartJsLoaded || typeof Chart !== 'undefined') {
        chartJsLoaded = true;
        return Promise.resolve();
    }
    
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/tools/expense_tracker/static/chart.umd.min.js';
        script.async = true;
        script.onload = () => {
            chartJsLoaded = true;
            resolve();
        };
        script.onerror = () => {
            console.error('Chart.js加载失败');
            reject(new Error('Chart.js加载失败'));
        };
        document.head.appendChild(script);
    });
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    // 设置默认日期为今天（隐藏字段）
    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('record-date');
    if (dateInput) {
        dateInput.value = today;
    }
    
    // 确保类型默认为支出
    const typeInput = document.getElementById('record-type');
    if (typeInput) {
        typeInput.value = 'expense';
    }
    // 确保支出按钮是激活状态（支持新旧两种样式）
    const expenseBtn = document.querySelector('.type-btn[data-type="expense"], .type-btn-compact[data-type="expense"]');
    if (expenseBtn) {
        expenseBtn.classList.add('active');
    }
    const incomeBtn = document.querySelector('.type-btn[data-type="income"], .type-btn-compact[data-type="income"]');
    if (incomeBtn) {
        incomeBtn.classList.remove('active');
    }
    
    // 优化加载顺序：先加载关键数据，图表延迟加载
    // 1. 先加载分类（记账表单需要）
    loadCategories().then(() => {
        // 2. 然后加载今日记录（首页显示）
        loadTodayRecords();
    });
    
    // 3. 并行加载统计和记录列表（非阻塞）
    Promise.all([
        loadStatistics(),
        loadRecords()
    ]).catch(error => {
        console.error('数据加载错误:', error);
    });
    
    // 绑定事件
    bindEvents();
    
    // 初始化年月选择器显示（默认显示当前年月）
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
    document.getElementById('filter-month-display').textContent = `${currentYear}年${monthNames[currentMonth - 1]}`;
    document.getElementById('filter-year-month').value = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    
    // 初始化标签页
    initMainTabs();
    
    // 初始化时间维度选择器
    initTimeDimensionSelector();
    
    // 初始化记录列表时间维度选择器
    initRecordsTimeDimension();
});

// 初始化记录列表时间维度选择器
function initRecordsTimeDimension() {
    const select = document.getElementById('records-time-dimension');
    if (select) {
        select.addEventListener('change', function() {
            // 根据选择的时间维度重新加载记录
            loadRecords(1);
        });
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
    
    // 如果切换到数据分析页面，确保Chart.js已加载
    if (tabName === 'analysis' && !chartJsLoaded) {
        try {
            await loadChartJs();
        } catch (error) {
            console.error('加载Chart.js失败:', error);
        }
    }
    
    // 根据标签页加载相应数据
    if (tabName === 'analysis') {
        loadAnalysisData();
    } else if (tabName === 'records') {
        loadRecords();
    } else if (tabName === 'home') {
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
    
    // 自定义时间范围应用按钮
    document.getElementById('apply-custom-range').addEventListener('click', function() {
        const startDate = document.getElementById('custom-start-date').value;
        const endDate = document.getElementById('custom-end-date').value;
        
        if (!startDate || !endDate) {
            customAlert('请选择开始和结束日期', '提示', 'warning');
            return;
        }
        
        if (new Date(startDate) > new Date(endDate)) {
            customAlert('开始日期不能晚于结束日期', '提示', 'warning');
            return;
        }
        
        customDateRange.start = startDate;
        customDateRange.end = endDate;
        currentTimeDimension = 'custom';
        loadAnalysisData();
    });
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
    
    // 显示/隐藏自定义时间范围选择器
    const customRangeDiv = document.getElementById('custom-date-range');
    if (dimension === 'custom') {
        if (customRangeDiv) {
            customRangeDiv.style.display = 'block';
        }
    } else {
        if (customRangeDiv) {
            customRangeDiv.style.display = 'none';
        }
        currentTimeDimension = dimension;
        loadAnalysisData();
    }
}


// 加载数据分析
async function loadAnalysisData() {
    try {
        let startDate = '';
        let endDate = '';
        
        const now = new Date();
        
        if (currentTimeDimension === 'custom') {
            startDate = customDateRange.start;
            endDate = customDateRange.end;
        } else if (currentTimeDimension === 'day') {
            // 今天
            startDate = endDate = now.toISOString().split('T')[0];
        } else if (currentTimeDimension === 'week') {
            // 本周（周一到周日）
            const dayOfWeek = now.getDay();
            const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // 如果是周日，往前推6天到周一
            const monday = new Date(now);
            monday.setDate(now.getDate() + diff);
            startDate = monday.toISOString().split('T')[0];
            endDate = now.toISOString().split('T')[0];
        } else if (currentTimeDimension === 'month') {
            // 本月
            const year = now.getFullYear();
            const month = now.getMonth() + 1;
            startDate = `${year}-${String(month).padStart(2, '0')}-01`;
            const lastDay = new Date(year, month, 0).getDate();
            endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        } else if (currentTimeDimension === 'year') {
            // 本年
            const year = now.getFullYear();
            startDate = `${year}-01-01`;
            endDate = `${year}-12-31`;
        }
        
        let url = `${API_BASE}/statistics?`;
        if (startDate) url += `start_date=${startDate}&`;
        if (endDate) url += `end_date=${endDate}&`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        // 更新分析统计卡片
        document.getElementById('analysis-total-income').textContent = `¥${data.total_income.toFixed(2)}`;
        document.getElementById('analysis-total-expense').textContent = `¥${data.total_expense.toFixed(2)}`;
        document.getElementById('analysis-total-balance').textContent = `¥${data.balance.toFixed(2)}`;
        
        // 更新所有图表
        updateLineChart(data.daily_stats);
        updatePieChart(data.category_stats);
        updateBarChart(data.category_stats);
    } catch (error) {
        console.error('加载分析数据失败:', error);
    }
}

// 更新柱状图（对比分析）
async function updateBarChart(categoryStats) {
    const canvas = document.getElementById('bar-chart');
    if (!canvas) return;
    
    // 确保Chart.js已加载
    if (!chartJsLoaded) {
        try {
            await loadChartJs();
        } catch (error) {
            console.error('Chart.js加载失败，无法显示图表:', error);
            return;
        }
    }
    
    const chartCtx = canvas.getContext('2d');
    
    if (barChart) {
        barChart.destroy();
    }
    
    if (categoryStats.length === 0) {
        return;
    }
    
    // 按金额排序，取前10个
    const sortedStats = [...categoryStats].sort((a, b) => b.amount - a.amount).slice(0, 10);
    
    // 创建渐变背景
    const barGradients = sortedStats.map(cat => {
        const gradient = chartCtx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, cat.color);
        gradient.addColorStop(1, cat.color + '80'); // 添加透明度
        return gradient;
    });
    
    barChart = new Chart(chartCtx, {
        type: 'bar',
        data: {
            labels: sortedStats.map(c => `${c.icon} ${c.name}`),
            datasets: [{
                label: '支出金额',
                data: sortedStats.map(c => c.amount),
                backgroundColor: barGradients,
                borderColor: sortedStats.map(c => c.color),
                borderWidth: 2,
                borderRadius: 8, // 圆角柱状图
                borderSkipped: false,
                barThickness: 'flex',
                maxBarThickness: 50
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 1500,
                easing: 'easeOutQuart',
                y: {
                    type: 'number',
                    easing: 'easeOutQuart',
                    duration: 1500,
                    from: 0
                }
            },
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    titleFont: { size: 12, weight: '600' },
                    bodyFont: { size: 13, weight: '500' },
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            const value = context.parsed.y;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `金额: ¥${value.toFixed(2)} (${percentage}%)`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { 
                        font: { size: 10 },
                        callback: function(value) {
                            return '¥' + value.toFixed(0);
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)',
                        lineWidth: 1
                    }
                },
                x: {
                    ticks: { 
                        font: { size: 10 },
                        color: '#666'
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

// 绑定事件
function bindEvents() {
    // 快速记账表单
    document.getElementById('quick-add-form').addEventListener('submit', handleAddRecord);
    
    // 类型切换按钮（支持新旧两种样式）
    document.querySelectorAll('.type-btn, .type-btn-compact').forEach(btn => {
        btn.addEventListener('click', function() {
            // 移除所有active类（包括新旧两种）
            document.querySelectorAll('.type-btn, .type-btn-compact').forEach(b => b.classList.remove('active'));
            // 添加active类到当前按钮
            this.classList.add('active');
            // 更新隐藏输入框的值
            const type = this.dataset.type;
            document.getElementById('record-type').value = type;
            // 更新分类选择器
            updateCategorySelector();
        });
    });
    
    // 类型切换时更新分类（兼容旧代码）
    const typeInput = document.getElementById('record-type');
    if (typeInput && typeInput.tagName === 'SELECT') {
        typeInput.addEventListener('change', updateCategorySelector);
    }
    
    
    // 年月选择器（使用通用日期选择器）
    document.getElementById('filter-month-btn').addEventListener('click', openMonthPicker);
    
    // 通用日期选择器事件
    document.getElementById('date-picker-modal').addEventListener('click', (e) => {
        if (e.target.id === 'date-picker-modal') {
            closeDatePicker();
        }
    });
    
    document.querySelectorAll('#date-picker-modal .modal-close, #date-picker-cancel').forEach(btn => {
        btn.addEventListener('click', closeDatePicker);
    });
    
    document.getElementById('date-picker-confirm').addEventListener('click', confirmDateSelection);
    
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
    
    // 图标选择器
    document.getElementById('icon-selector-btn').addEventListener('click', openIconPicker);
    
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
            } else {
                closeModal();
            }
        });
    });
    
    // 点击模态框外部关闭
    document.getElementById('edit-modal').addEventListener('click', (e) => {
        if (e.target.id === 'edit-modal') {
            closeModal();
        }
    });
    
    // 编辑表单
    document.getElementById('edit-form').addEventListener('submit', handleUpdateRecord);
}

// 加载分类
async function loadCategories() {
    try {
        const response = await fetch(`${API_BASE}/categories`);
        categories = await response.json();
        updateCategorySelector();
        updateEditCategorySelect();
    } catch (error) {
        console.error('加载分类失败:', error);
    }
}

// 更新分类选择器
function updateCategorySelector() {
    const typeInput = document.getElementById('record-type');
    const type = typeInput ? typeInput.value : 'expense';
    const categoryList = categories[type] || [];
    const container = document.getElementById('category-selector');
    
    if (!container) return;
    
    // 生成分类按钮
    container.innerHTML = categoryList.map(cat => {
        const isOther = cat.name === '其他';
        return `
            <button type="button" class="category-btn ${isOther ? 'category-other' : ''}" 
                    data-category="${cat.id || cat.name}" 
                    data-color="${cat.color}"
                    data-is-other="${isOther}">
                <span class="category-btn-icon">${cat.icon}</span>
                <span class="category-btn-text">${cat.name}</span>
            </button>
        `;
    }).join('');
    
    // 默认选中第一个
    if (categoryList.length > 0) {
        const firstBtn = container.querySelector('.category-btn');
        if (firstBtn) {
            firstBtn.classList.add('active');
            const categoryId = firstBtn.dataset.category;
            document.getElementById('category-selected-value').value = categoryId;
        }
    }
    
    // 绑定点击事件
    container.querySelectorAll('.category-btn').forEach(btn => {
        const isOther = btn.dataset.isOther === 'true';
        
        // 普通点击：选择分类
        btn.addEventListener('click', function(e) {
            // 如果是"其他"分类，检查是否是按住Ctrl/Cmd键点击
            if (isOther && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                e.stopPropagation();
                openCategoryModal();
                return;
            }
            
            // 选择分类
            container.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            const categoryId = this.dataset.category;
            document.getElementById('category-selected-value').value = categoryId;
        });
        
        // 长按"其他"按钮打开分类管理（移动端和桌面端）
        let longPressTimer = null;
        
        if (isOther) {
            btn.addEventListener('mousedown', function(e) {
                longPressTimer = setTimeout(() => {
                    e.preventDefault();
                    openCategoryModal();
                    longPressTimer = null;
                }, 800); // 800ms长按
            });
            
            btn.addEventListener('mouseup', function() {
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
            });
            
            btn.addEventListener('mouseleave', function() {
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
            });
            
            // 触摸事件（移动端）
            btn.addEventListener('touchstart', function(e) {
                longPressTimer = setTimeout(() => {
                    e.preventDefault();
                    openCategoryModal();
                    longPressTimer = null;
                }, 800);
            });
            
            btn.addEventListener('touchend', function() {
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
            });
            
            // 右键点击"其他"按钮打开分类管理（桌面端）
            btn.addEventListener('contextmenu', function(e) {
                e.preventDefault();
                openCategoryModal();
            });
        }
    });
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
    e.preventDefault();
    
    const typeInput = document.getElementById('record-type');
    // 确保日期是今天（如果没有设置）
    const dateInput = document.getElementById('record-date');
    if (!dateInput.value) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }
    
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
    
    const formData = {
        date: dateInput.value,
        type: typeInput ? typeInput.value : 'expense',
        amount: parseFloat(document.getElementById('record-amount').value),
        category: categoryName,
        note: document.getElementById('record-note').value.trim()
    };
    
    try {
        const response = await fetch(`${API_BASE}/records`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            // 重置表单
            document.getElementById('quick-add-form').reset();
            // 重置日期为今天
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('record-date').value = today;
            document.getElementById('record-amount').value = '';
            document.getElementById('record-note').value = '';
            // 重置类型选择为支出（支持新旧两种样式）
            document.querySelectorAll('.type-btn, .type-btn-compact').forEach(btn => {
                btn.classList.remove('active');
                if (btn.dataset.type === 'expense') {
                    btn.classList.add('active');
                }
            });
            document.getElementById('record-type').value = 'expense';
            updateCategorySelector();
            
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
        const today = new Date().toISOString().split('T')[0];
        const url = `${API_BASE}/records?start_date=${today}&end_date=${today}&per_page=100`;
        
        const response = await fetch(url);
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

// 加载统计数据
async function loadStatistics() {
    try {
        const yearMonth = document.getElementById('filter-year-month').value;
        let startDate = '';
        let endDate = '';
        
        if (yearMonth) {
            // 年月格式：YYYY-MM，转换为日期范围
            startDate = `${yearMonth}-01`;
            // 计算该月的最后一天
            const [year, month] = yearMonth.split('-').map(Number);
            const lastDay = new Date(year, month, 0).getDate();
            endDate = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
        }
        
        let url = `${API_BASE}/statistics?`;
        if (startDate) url += `start_date=${startDate}&`;
        if (endDate) url += `end_date=${endDate}&`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        // 更新统计卡片
        document.getElementById('total-income').textContent = `¥${data.total_income.toFixed(2)}`;
        document.getElementById('total-expense').textContent = `¥${data.total_expense.toFixed(2)}`;
        document.getElementById('total-balance').textContent = `¥${data.balance.toFixed(2)}`;
        
        // 延迟更新图表（非阻塞，提升初始加载速度）
        // 图表只在数据分析页面显示，首页不需要立即加载
        setTimeout(() => {
            updateLineChart(data.daily_stats).catch(err => console.error('更新折线图失败:', err));
            updatePieChart(data.category_stats).catch(err => console.error('更新饼图失败:', err));
        }, 100);
    } catch (error) {
        console.error('加载统计数据失败:', error);
    }
}

// 更新折线图
async function updateLineChart(dailyStats) {
    const canvas = document.getElementById('line-chart');
    if (!canvas) return;
    
    // 确保Chart.js已加载
    if (!chartJsLoaded) {
        try {
            await loadChartJs();
        } catch (error) {
            console.error('Chart.js加载失败，无法显示图表:', error);
            return;
        }
    }
    
    const ctx = canvas.getContext('2d');
    
    if (lineChart) {
        lineChart.destroy();
    }
    
    const labels = dailyStats.map(d => {
        const date = new Date(d.date);
        return `${date.getMonth() + 1}/${date.getDate()}`;
    });
    
    // 创建渐变填充 - 使用更柔和的颜色
    const incomeGradient = ctx.createLinearGradient(0, 0, 0, 400);
    incomeGradient.addColorStop(0, 'rgba(22, 163, 74, 0.2)'); /* 柔和的绿色 */
    incomeGradient.addColorStop(1, 'rgba(22, 163, 74, 0.03)');
    
    const expenseGradient = ctx.createLinearGradient(0, 0, 0, 400);
    expenseGradient.addColorStop(0, 'rgba(220, 38, 38, 0.2)'); /* 柔和的红色 */
    expenseGradient.addColorStop(1, 'rgba(220, 38, 38, 0.03)');
    
    lineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '收入',
                    data: dailyStats.map(d => d.income),
                    borderColor: '#16a34a', /* 柔和的绿色 */
                    backgroundColor: incomeGradient,
                    tension: 0.5, // 更平滑的曲线
                    fill: true,
                    borderWidth: 3,
                    pointRadius: 0, // 默认隐藏点
                    pointHoverRadius: 8, // 悬停时显示大点
                    pointHoverBorderWidth: 3,
                    pointHoverBackgroundColor: '#16a34a',
                    pointHoverBorderColor: '#fff',
                    pointBackgroundColor: '#16a34a',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    shadowOffsetX: 0,
                    shadowOffsetY: 4,
                    shadowBlur: 10,
                    shadowColor: 'rgba(22, 163, 74, 0.2)' /* 更淡的阴影 */
                },
                {
                    label: '支出',
                    data: dailyStats.map(d => d.expense),
                    borderColor: '#dc2626', /* 柔和的红色 */
                    backgroundColor: expenseGradient,
                    tension: 0.5,
                    fill: true,
                    borderWidth: 3,
                    pointRadius: 0,
                    pointHoverRadius: 8,
                    pointHoverBorderWidth: 3,
                    pointHoverBackgroundColor: '#dc2626',
                    pointHoverBorderColor: '#fff',
                    pointBackgroundColor: '#dc2626',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    shadowOffsetX: 0,
                    shadowOffsetY: 4,
                    shadowBlur: 10,
                    shadowColor: 'rgba(220, 38, 38, 0.2)' /* 更淡的阴影 */
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 1500, // 动画时长
                easing: 'easeOutQuart', // 弹性动画
                y: {
                    type: 'number',
                    easing: 'easeOutQuart',
                    duration: 1500,
                    from: 0 // 从0开始动画
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        font: { size: 11, weight: '500' },
                        padding: 12,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    titleFont: { size: 12, weight: '600' },
                    bodyFont: { size: 13, weight: '500' },
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    cornerRadius: 8,
                    displayColors: true,
                    callbacks: {
                        label: function(context) {
                            const value = context.parsed.y;
                            const label = context.dataset.label;
                            return `${label}: ¥${value.toFixed(2)}`;
                        },
                        afterLabel: function(context) {
                            // 计算变化趋势
                            const index = context.dataIndex;
                            if (index > 0) {
                                const current = context.parsed.y;
                                const previous = context.dataset.data[index - 1];
                                if (previous > 0) {
                                    const change = ((current - previous) / previous * 100).toFixed(1);
                                    const arrow = change > 0 ? '↑' : change < 0 ? '↓' : '→';
                                    const color = change > 0 ? '#52c41a' : change < 0 ? '#ff4d4f' : '#999';
                                    return `${arrow} ${Math.abs(change)}%`;
                                }
                            }
                            return '';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { 
                        font: { size: 10 },
                        callback: function(value) {
                            return '¥' + value;
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)',
                        lineWidth: 1
                    }
                },
                x: {
                    ticks: { 
                        font: { size: 10 },
                        color: '#666'
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

// 更新饼图
async function updatePieChart(categoryStats) {
    const canvas = document.getElementById('pie-chart');
    if (!canvas) return;
    
    // 确保Chart.js已加载
    if (!chartJsLoaded) {
        try {
            await loadChartJs();
        } catch (error) {
            console.error('Chart.js加载失败，无法显示图表:', error);
            return;
        }
    }
    
    const ctx = canvas.getContext('2d');
    
    if (pieChart) {
        pieChart.destroy();
    }
    
    if (categoryStats.length === 0) {
        return;
    }
    
    const total = categoryStats.reduce((sum, c) => sum + c.amount, 0);
    
    pieChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: categoryStats.map(c => `${c.icon} ${c.name}`),
            datasets: [{
                data: categoryStats.map(c => c.amount),
                backgroundColor: categoryStats.map(c => c.color),
                borderWidth: 3,
                borderColor: '#fff',
                hoverOffset: 8, // 悬停时偏移
                hoverBorderWidth: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                animateRotate: true,
                animateScale: true,
                duration: 1500,
                easing: 'easeOutQuart'
            },
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        font: { size: 11, weight: '500' },
                        padding: 12,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        boxWidth: 12,
                        boxHeight: 12,
                        generateLabels: function(chart) {
                            const data = chart.data;
                            if (data.labels.length && data.datasets.length) {
                                return data.labels.map((label, i) => {
                                    const value = data.datasets[0].data[i];
                                    const percentage = ((value / total) * 100).toFixed(1);
                                    return {
                                        text: `${label} ${percentage}%`,
                                        fillStyle: data.datasets[0].backgroundColor[i],
                                        hidden: false,
                                        index: i
                                    };
                                });
                            }
                            return [];
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    titleFont: { size: 12, weight: '600' },
                    bodyFont: { size: 13, weight: '500' },
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${label}: ¥${value.toFixed(2)} (${percentage}%)`;
                        },
                        footer: function(tooltipItems) {
                            return `总计: ¥${total.toFixed(2)}`;
                        }
                    }
                },
            }
        }
    });
}

// 加载记录列表
async function loadRecords(page = 1) {
    try {
        let startDate = '';
        let endDate = '';
        
        // 获取记录列表的时间维度选择
        const timeDimensionSelect = document.getElementById('records-time-dimension');
        const timeDimension = timeDimensionSelect ? timeDimensionSelect.value : 'month';
        
        const now = new Date();
        
        if (timeDimension === 'day') {
            // 今天
            startDate = endDate = now.toISOString().split('T')[0];
        } else if (timeDimension === 'week') {
            // 本周
            const dayOfWeek = now.getDay();
            const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            const monday = new Date(now);
            monday.setDate(now.getDate() + diff);
            startDate = monday.toISOString().split('T')[0];
            endDate = now.toISOString().split('T')[0];
        } else if (timeDimension === 'month') {
            // 使用月份选择器的值
            const yearMonth = document.getElementById('filter-year-month').value;
            if (yearMonth) {
                startDate = `${yearMonth}-01`;
                const [year, month] = yearMonth.split('-').map(Number);
                const lastDay = new Date(year, month, 0).getDate();
                endDate = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
            } else {
                // 默认当前月
                const year = now.getFullYear();
                const month = now.getMonth() + 1;
                startDate = `${year}-${String(month).padStart(2, '0')}-01`;
                const lastDay = new Date(year, month, 0).getDate();
                endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
            }
        } else if (timeDimension === 'year') {
            // 本年
            const year = now.getFullYear();
            startDate = `${year}-01-01`;
            endDate = `${year}-12-31`;
        }
        
        let url = `${API_BASE}/records?page=${page}&per_page=100`;
        if (startDate) url += `&start_date=${startDate}`;
        if (endDate) url += `&end_date=${endDate}`;
        
        const response = await fetch(url);
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
        
        // 添加日期标题
        html += `
            <div class="date-section" data-date="${dateKey}">
                <div class="date-header">
                    <span class="date-label">${dateLabel}</span>
                    <span class="date-total">${dateRecords.length} 条</span>
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
                    <div class="record-icon">${icon}</div>
                    <div class="record-info">
                        <div class="record-header">
                            <span class="record-category editable" data-field="category" data-record-id="${record.id}" data-value="${record.category}">${displayName}</span>
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

// 绑定内联编辑事件
function bindInlineEditEvents() {
    // 绑定可编辑字段的点击事件
    document.querySelectorAll('.editable').forEach(element => {
        element.addEventListener('click', function(e) {
            e.stopPropagation();
            startInlineEdit(this);
        });
    });
    
    // 绑定记录项空白区域的点击事件（用于编辑日期）
    document.querySelectorAll('.record-item').forEach(item => {
        item.addEventListener('click', function(e) {
            // 如果点击的是可编辑元素、按钮、图标或输入框，不处理
            if (e.target.closest('.editable') || 
                e.target.closest('.record-actions') || 
                e.target.closest('button') ||
                e.target.closest('.record-icon') ||
                e.target.closest('input') ||
                e.target.closest('select')) {
                return;
            }
            
            // 点击空白区域，编辑日期
            e.stopPropagation();
            e.preventDefault();
            editRecordDate(this);
        });
    });
}

// 编辑单条记录的日期
function editRecordDate(recordItem) {
    const recordId = parseInt(recordItem.dataset.id);
    const dateHiddenInput = recordItem.querySelector('.record-date-hidden');
    if (!dateHiddenInput) return;
    
    const oldDate = dateHiddenInput.dataset.value;
    
    // 使用统一的日期选择器
    openDatePicker({
        initialDate: oldDate,
        includeDay: true, // 包含日期选择
        onConfirm: async (newDate) => {
            if (newDate === oldDate) {
                return;
            }
            
            try {
                // 先获取当前记录
                const response = await fetch(`${API_BASE}/records/${recordId}`);
                const data = await response.json();
                const record = data.record;
                
                if (!record) {
                    customAlert('记录不存在', '错误', 'error');
                    return;
                }
                
                // 更新记录日期
                const updateResponse = await fetch(`${API_BASE}/records/${recordId}`, {
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
                    // 更新成功，重新加载数据
                    loadStatistics();
                    loadRecords(currentPage);
                    loadTodayRecords(); // 刷新今日记录
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
        const response = await fetch(`${API_BASE}/records/${recordId}`);
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
            const categoryList = [...categories.expense, ...categories.income];
            const newCategory = categoryList.find(c => c.id === newValue);
            if (!newCategory) {
                customAlert('无效的分类', '输入错误', 'warning');
                element.innerHTML = element.dataset.value;
                return;
            }
            // 如果分类类型与记录类型不匹配，需要同时更新类型
            const isIncomeCategory = categories.income.some(c => c.id === newValue);
            const isExpenseCategory = categories.expense.some(c => c.id === newValue);
            
            if (isIncomeCategory && record.type !== 'income') {
                updateData.type = 'income';
            } else if (isExpenseCategory && record.type !== 'expense') {
                updateData.type = 'expense';
            }
            updateData.category = newValue;
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
        }
        
        // 发送更新请求
        const updateResponse = await fetch(`${API_BASE}/records/${recordId}`, {
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
    
    const categoryElement = recordItem.querySelector('.record-category.editable');
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
        const response = await fetch(`${API_BASE}/records/${recordId}`);
        const data = await response.json();
        const record = data.record;
        
        if (!record) {
            customAlert('记录不存在', '错误', 'error');
            return;
        }
        
        document.getElementById('edit-id').value = record.id;
        document.getElementById('edit-type').value = record.type;
        document.getElementById('edit-date').value = record.date;
        document.getElementById('edit-amount').value = record.amount;
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
    document.getElementById('edit-modal').classList.remove('show');
}

// 更新记录
async function handleUpdateRecord(e) {
    e.preventDefault();
    
    const recordId = document.getElementById('edit-id').value;
    const formData = {
        date: document.getElementById('edit-date').value,
        type: document.getElementById('edit-type').value,
        amount: parseFloat(document.getElementById('edit-amount').value),
        category: document.getElementById('edit-category').value,
        note: document.getElementById('edit-note').value.trim()
    };
    
    try {
        const response = await fetch(`${API_BASE}/records/${recordId}`, {
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
        const response = await fetch(`${API_BASE}/records/${recordId}`, {
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

// 日期筛选（已改为年月筛选）
function handleDateFilter() {
    loadStatistics();
    loadRecords(1);
}

// 通用日期时间选择器
let datePickerConfig = {
    selectedYear: null,
    selectedMonth: null,
    selectedDay: null,
    includeDay: false,
    onConfirm: null,
    onCancel: null
};

// 播放机械转动声音
let audioContext = null;
let lastSoundTime = 0;

function playPickerSound() {
    try {
        // 节流：避免声音过于频繁
        const now = Date.now();
        if (now - lastSoundTime < 50) {
            return; // 50ms内只播放一次
        }
        lastSoundTime = now;
        
        // 创建或复用音频上下文
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        // 如果上下文被暂停，恢复它
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // 设置音调（模拟机械转动的声音 - 低频率）
        oscillator.frequency.value = 150; // 更低的频率，更像机械声
        oscillator.type = 'sawtooth'; // 锯齿波，更像机械声
        
        // 设置音量包络（快速衰减，音量很小）
        gainNode.gain.setValueAtTime(0.03, audioContext.currentTime); // 非常小的音量
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.08);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.08);
    } catch (error) {
        // 如果音频API不支持，静默失败
        // console.log('音频播放失败:', error);
    }
}

// 打开通用日期选择器
function openDatePicker(config) {
    const {
        initialDate = null,
        includeDay = false,
        title = '选择日期',
        onConfirm = null,
        onCancel = null
    } = config || {};
    
    // 保存配置
    datePickerConfig.includeDay = includeDay;
    datePickerConfig.onConfirm = onConfirm;
    datePickerConfig.onCancel = onCancel;
    
    // 解析初始日期
    let year, month, day;
    if (initialDate) {
        const date = new Date(initialDate);
        year = date.getFullYear();
        month = date.getMonth() + 1;
        day = date.getDate();
    } else {
        const now = new Date();
        year = now.getFullYear();
        month = now.getMonth() + 1;
        day = now.getDate();
    }
    
    datePickerConfig.selectedYear = year;
    datePickerConfig.selectedMonth = month;
    datePickerConfig.selectedDay = day;
    
    // 设置标题
    document.getElementById('date-picker-title').textContent = title;
    
    // 显示/隐藏日期滚轮
    const dayWrapper = document.getElementById('picker-day-wrapper');
    if (includeDay) {
        dayWrapper.style.display = 'block';
    } else {
        dayWrapper.style.display = 'none';
    }
    
    // 初始化滚轮
    initDatePickerWheels(year, month, day, includeDay);
    
    // 显示模态框
    document.getElementById('date-picker-modal').classList.add('show');
    
    // 延迟滚动到选中位置
    setTimeout(() => {
        scrollToPickerOption('picker-year-wheel', year);
        scrollToPickerOption('picker-month-wheel', month);
        if (includeDay) {
            scrollToPickerOption('picker-day-wheel', day);
        }
        
        // 再次更新选中状态
        setTimeout(() => {
            updatePickerSelectedOption('picker-year-wheel', (value) => {
                datePickerConfig.selectedYear = parseInt(value);
            });
            updatePickerSelectedOption('picker-month-wheel', (value) => {
                datePickerConfig.selectedMonth = parseInt(value);
                // 月份改变时，更新日期选项
                if (includeDay) {
                    updateDayWheel(datePickerConfig.selectedYear, datePickerConfig.selectedMonth);
                }
            });
            if (includeDay) {
                updatePickerSelectedOption('picker-day-wheel', (value) => {
                    datePickerConfig.selectedDay = parseInt(value);
                });
            }
        }, 100);
    }, 100);
}

// 初始化日期选择器滚轮
function initDatePickerWheels(year, month, day, includeDay) {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    
    // 生成年份选项（当前年份前后各10年，共21年）
    const yearWheel = document.getElementById('picker-year-wheel');
    const years = [];
    for (let i = currentYear + 10; i >= currentYear - 10; i--) {
        years.push(i);
    }
    yearWheel.innerHTML = years.map(y => `
        <div class="picker-option" data-value="${y}">${y}年</div>
    `).join('');
    
    // 生成月份选项
    const monthWheel = document.getElementById('picker-month-wheel');
    monthWheel.innerHTML = Array.from({ length: 12 }, (_, i) => i + 1).map(m => `
        <div class="picker-option" data-value="${m}">${String(m).padStart(2, '0')}月</div>
    `).join('');
    
    // 生成日期选项（如果需要）
    if (includeDay) {
        updateDayWheel(year, month);
    }
    
    // 清除之前的事件监听器（通过克隆节点）
    const yearWheelClone = yearWheel.cloneNode(true);
    yearWheel.parentNode.replaceChild(yearWheelClone, yearWheel);
    
    const monthWheelClone = monthWheel.cloneNode(true);
    monthWheel.parentNode.replaceChild(monthWheelClone, monthWheel);
    
    if (includeDay) {
        const dayWheel = document.getElementById('picker-day-wheel');
        if (dayWheel) {
            const dayWheelClone = dayWheel.cloneNode(true);
            dayWheel.parentNode.replaceChild(dayWheelClone, dayWheel);
        }
    }
    
    // 重新绑定滚动事件（使用新的节点）
    setupPickerWheelWithSound('picker-year-wheel', (value) => {
        datePickerConfig.selectedYear = parseInt(value);
        if (includeDay) {
            updateDayWheel(datePickerConfig.selectedYear, datePickerConfig.selectedMonth);
        }
    });
    
    setupPickerWheelWithSound('picker-month-wheel', (value) => {
        datePickerConfig.selectedMonth = parseInt(value);
        if (includeDay) {
            updateDayWheel(datePickerConfig.selectedYear, datePickerConfig.selectedMonth);
        }
    });
    
    if (includeDay) {
        setupPickerWheelWithSound('picker-day-wheel', (value) => {
            datePickerConfig.selectedDay = parseInt(value);
        });
    }
}

// 更新日期滚轮（根据年月计算该月的天数）
function updateDayWheel(year, month) {
    const dayWheel = document.getElementById('picker-day-wheel');
    const daysInMonth = new Date(year, month, 0).getDate();
    const currentDay = datePickerConfig.selectedDay || 1;
    const validDay = Math.min(currentDay, daysInMonth);
    
    dayWheel.innerHTML = Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => `
        <div class="picker-option" data-value="${d}">${String(d).padStart(2, '0')}日</div>
    `).join('');
    
    // 滚动到当前选中的日期
    setTimeout(() => {
        scrollToPickerOption('picker-day-wheel', validDay);
        datePickerConfig.selectedDay = validDay;
    }, 50);
}

// 带声音的滚轮设置
function setupPickerWheelWithSound(wheelId, onSelect) {
    const wheel = document.getElementById(wheelId);
    if (!wheel) return;
    
    let isScrolling = false;
    let scrollTimeout = null;
    let lastScrollTop = wheel.scrollTop;
    let lastSoundScrollTop = lastScrollTop;
    
    // 滚动事件
    wheel.addEventListener('scroll', () => {
        // 检测滚动方向和距离，播放声音
        const currentScrollTop = wheel.scrollTop;
        const scrollDelta = Math.abs(currentScrollTop - lastSoundScrollTop);
        
        // 每滚动约20px播放一次声音
        if (scrollDelta > 20) {
            playPickerSound();
            lastSoundScrollTop = currentScrollTop;
        }
        
        lastScrollTop = currentScrollTop;
        
        // 清除之前的定时器
        if (scrollTimeout) {
            clearTimeout(scrollTimeout);
        }
        
        // 更新选中状态（实时）
        updatePickerSelectedOption(wheelId, onSelect);
        
        // 滚动停止后再次更新
        scrollTimeout = setTimeout(() => {
            updatePickerSelectedOption(wheelId, onSelect);
            isScrolling = false;
        }, 150);
        
        isScrolling = true;
    });
    
    // 触摸事件支持（移动端滑动）
    let touchStartY = 0;
    let touchStartScrollTop = 0;
    let isTouching = false;
    let lastTouchY = 0;
    let lastSoundTouchY = 0;
    
    wheel.addEventListener('touchstart', (e) => {
        isTouching = true;
        touchStartY = e.touches[0].clientY;
        touchStartScrollTop = wheel.scrollTop;
        lastTouchY = touchStartY;
        lastSoundTouchY = touchStartY;
    }, { passive: true });
    
    wheel.addEventListener('touchmove', (e) => {
        if (!isTouching) return;
        const currentY = e.touches[0].clientY;
        const deltaY = Math.abs(currentY - lastSoundTouchY);
        
        // 每移动约15px播放一次声音
        if (deltaY > 15) {
            playPickerSound();
            lastSoundTouchY = currentY;
        }
        
        const totalDeltaY = currentY - touchStartY;
        wheel.scrollTop = touchStartScrollTop - totalDeltaY;
    }, { passive: true });
    
    wheel.addEventListener('touchend', () => {
        isTouching = false;
        // 触摸结束后，自动对齐到最近的选项
        setTimeout(() => {
            updatePickerSelectedOption(wheelId, onSelect);
        }, 100);
    });
}

// 滚动到指定选项
function scrollToPickerOption(wheelId, value) {
    const wheel = document.getElementById(wheelId);
    if (!wheel) return;
    
    const option = wheel.querySelector(`[data-value="${value}"]`);
    if (option) {
        const optionTop = option.offsetTop;
        const wheelHeight = wheel.clientHeight;
        const optionHeight = option.clientHeight;
        const targetScroll = optionTop - (wheelHeight / 2) + (optionHeight / 2);
        
        wheel.scrollTop = targetScroll;
        
        // 标记为选中
        wheel.querySelectorAll('.picker-option').forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');
    }
}

// 更新选中选项
function updatePickerSelectedOption(wheelId, onSelect) {
    const wheel = document.getElementById(wheelId);
    if (!wheel) return;
    
    const wheelHeight = wheel.clientHeight;
    const wheelCenter = wheel.scrollTop + (wheelHeight / 2);
    
    const options = Array.from(wheel.querySelectorAll('.picker-option'));
    let closestOption = null;
    let minDistance = Infinity;
    
    options.forEach(option => {
        const optionTop = option.offsetTop;
        const optionHeight = option.clientHeight;
        const optionCenter = optionTop + (optionHeight / 2);
        const distance = Math.abs(optionCenter - wheelCenter);
        
        if (distance < minDistance) {
            minDistance = distance;
            closestOption = option;
        }
    });
    
    if (closestOption) {
        // 移除所有选中状态
        options.forEach(opt => opt.classList.remove('selected'));
        // 添加选中状态
        closestOption.classList.add('selected');
        
        // 如果距离中心较远，自动对齐
        const optionTop = closestOption.offsetTop;
        const optionHeight = closestOption.clientHeight;
        const targetScroll = optionTop - (wheelHeight / 2) + (optionHeight / 2);
        const currentScroll = wheel.scrollTop;
        
        // 如果距离超过阈值，自动对齐
        if (Math.abs(targetScroll - currentScroll) > 5) {
            wheel.scrollTo({
                top: targetScroll,
                behavior: 'smooth'
            });
        }
        
        if (onSelect) {
            onSelect(closestOption.dataset.value);
        }
    }
}

// 关闭日期选择器
function closeDatePicker() {
    document.getElementById('date-picker-modal').classList.remove('show');
    if (datePickerConfig.onCancel) {
        datePickerConfig.onCancel();
    }
}

// 确认日期选择
function confirmDateSelection() {
    const { selectedYear, selectedMonth, selectedDay, includeDay, onConfirm } = datePickerConfig;
    
    if (!selectedYear || !selectedMonth) {
        return;
    }
    
    if (includeDay && !selectedDay) {
        return;
    }
    
    let dateStr;
    if (includeDay) {
        dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
    } else {
        dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
    }
    
    closeDatePicker();
    
    if (onConfirm) {
        onConfirm(dateStr);
    }
}

// 年月选择器功能（兼容旧代码，使用新的通用选择器）
let selectedYear = null;
let selectedMonth = null;

// 初始化年月选择器（已废弃，保留兼容）
function initMonthPicker() {
    // 不再需要，使用通用日期选择器
}

function openMonthPicker() {
    // 使用通用日期选择器，不包含日期
    const yearMonth = document.getElementById('filter-year-month').value;
    let initialDate = null;
    if (yearMonth) {
        initialDate = `${yearMonth}-01`; // 使用该月第一天作为初始日期
    }
    
    openDatePicker({
        initialDate: initialDate,
        includeDay: false,
        title: '选择年月',
        onConfirm: (dateStr) => {
            // dateStr 格式：YYYY-MM
            const yearMonth = dateStr.substring(0, 7);
            document.getElementById('filter-year-month').value = yearMonth;
            
            // 更新显示
            const [year, month] = yearMonth.split('-').map(Number);
            const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
            document.getElementById('filter-month-display').textContent = `${year}年${monthNames[month - 1]}`;
            
            // 重新加载数据
            loadStatistics();
            loadRecords(1);
        }
    });
}

function closeMonthPicker() {
    closeDatePicker();
}

function confirmMonthSelection() {
    confirmDateSelection();
}

// 导出数据
function handleExport() {
    const yearMonth = document.getElementById('filter-year-month').value;
    let startDate = '';
    let endDate = '';
    
    if (yearMonth) {
        // 年月格式：YYYY-MM，转换为日期范围
        startDate = `${yearMonth}-01`;
        // 计算该月的最后一天
        const [year, month] = yearMonth.split('-').map(Number);
        const lastDay = new Date(year, month, 0).getDate();
        endDate = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
    }
    
    let url = `${API_BASE}/export?`;
    if (startDate) url += `start_date=${startDate}&`;
    if (endDate) url += `end_date=${endDate}&`;
    
    window.location.href = url;
}

// 导入数据
async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const confirmed = await customConfirm('导入数据将添加到现有记录中，确定继续吗？', '确认导入');
    if (!confirmed) {
        e.target.value = '';
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch(`${API_BASE}/import`, {
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
        e.target.value = '';
    }
}

// 工具函数
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showMessage(message, type = 'info') {
    // 简单的消息提示（可以后续改进为更美观的提示）
    const msgDiv = document.createElement('div');
    msgDiv.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        padding: 12px 24px;
        background: ${type === 'success' ? '#51CF66' : '#FF6B6B'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 3000;
        animation: slideIn 0.3s ease;
    `;
    msgDiv.textContent = message;
    document.body.appendChild(msgDiv);
    
    setTimeout(() => {
        msgDiv.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => msgDiv.remove(), 300);
    }, 2000);
}

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

// 替换 alert
function customAlert(message, title = '提示', type = 'info') {
    return showDialog({
        title,
        message,
        type,
        showCancel: false
    });
}

// 替换 confirm
function customConfirm(message, title = '确认') {
    return showDialog({
        title,
        message,
        type: 'warning',
        confirmText: '确定',
        cancelText: '取消',
        showCancel: true
    });
}

// 分类管理功能
function openCategoryModal() {
    document.getElementById('category-modal').classList.add('show');
    loadCategoryList('expense');
}

function closeCategoryModal() {
    document.getElementById('category-modal').classList.remove('show');
}

async function loadCategoryList(type) {
    const container = document.getElementById(`category-list-${type}`);
    try {
        const response = await fetch(`${API_BASE}/categories`);
        const data = await response.json();
        const categoryList = data[type] || [];
        
        container.innerHTML = categoryList.map(cat => `
            <div class="category-item" data-id="${cat.id}">
                <div class="category-item-icon" style="background: ${cat.color}20; color: ${cat.color}">
                    ${cat.icon}
                </div>
                <div class="category-item-info">
                    <div class="category-item-name">${escapeHtml(cat.name)}</div>
                    ${cat.is_default ? '<span class="category-item-badge">默认</span>' : ''}
                </div>
                <div class="category-item-actions">
                    ${!cat.is_default ? `
                        <button class="btn-edit-small" onclick="editCategory(${cat.id})">编辑</button>
                        <button class="btn-danger-small" onclick="deleteCategory(${cat.id})">删除</button>
                    ` : ''}
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
        const response = await fetch(`${API_BASE}/categories`, {
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

async function deleteCategory(categoryId) {
    const confirmed = await customConfirm('确定要删除这个分类吗？', '确认删除');
    if (!confirmed) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/categories/${categoryId}`, {
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

function editCategory(categoryId) {
    // 简单的编辑功能（可以后续扩展为更完整的编辑界面）
    customAlert('编辑功能开发中，请先删除后重新添加', '提示', 'info');
}

// 图标库
const ICON_LIBRARY = {
    food: ['🍔', '🍕', '🍜', '🍱', '🍝', '🍲', '🥘', '🍳', '🥗', '🍞', '🥐', '🥖', '🥨', '🥯', '🥞', '🧇', '🍗', '🍖', '🥩', '🥓', '🍟', '🍿', '🌮', '🌯', '🥙', '🥪', '🌭', '🍔', '🍕', '🍰', '🎂', '🧁', '🍮', '🍭', '🍬', '🍫', '🍪', '🍩', '🥤', '☕', '🍵', '🧃', '🥛', '🍼', '🍺', '🍻', '🍷', '🍸', '🍹'],
    transport: ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🛴', '🚲', '🛵', '🏍️', '🛺', '🚨', '🚔', '🚍', '🚘', '🚖', '✈️', '🛫', '🛬', '🛩️', '💺', '🚀', '🚁', '🚟', '🚠', '🚡', '🛰️', '🚂', '🚃', '🚄', '🚅', '🚆', '🚇', '🚈', '🚉', '🚊', '🚝', '🚞', '🚋', '🚌', '🚍', '🚎', '🚐', '🚑', '🚒', '🚓', '🚔', '🚕', '🚖', '🚗', '🚘', '🚙', '🚚', '🚛', '🚜', '🏎️', '🏍️', '🛵', '🛴', '🚲', '🛺', '🚨', '🚔', '🚍', '🚘', '🚖', '✈️', '🛫', '🛬', '🛩️', '💺', '🚀', '🚁', '🚟', '🚠', '🚡', '🛰️'],
    shopping: ['🛍️', '🛒', '🛎️', '🛏️', '🛋️', '🪑', '🚪', '🪟', '🪞', '🖼️', '🛢️', '🛠️', '🛠️', '⚙️', '🔧', '🔨', '⚒️', '🛠️', '⛏️', '🔩', '⚙️', '🧰', '🧲', '🪚', '🔫', '💣', '🧨', '🪓', '🔪', '🗡️', '⚔️', '🛡️', '🚬', '⚰️', '🪦', '⚱️', '🏺', '🔮', '📿', '🧿', '💈', '⚗️', '🔭', '🔬', '🕳️', '🩹', '🩺', '💊', '💉', '🩸', '🧬', '🦠', '🧫', '🧪', '🌡️', '🧹', '🪠', '🧺', '🧻', '🚽', '🚿', '🛁', '🛀', '🧼', '🪥', '🪒', '🧽', '🪣', '🧴', '🛎️', '🔑', '🗝️', '🚪', '🪑', '🛋️', '🛏️', '🛌', '🖼️', '🪞', '🪟', '🛍️', '🛒'],
    entertainment: ['🎬', '🎭', '🎨', '🎪', '🎤', '🎧', '🎼', '🎹', '🥁', '🎷', '🎺', '🎸', '🪗', '🎻', '🎲', '🎯', '🎳', '🎮', '🎰', '🃏', '🀄', '🎴', '🎭', '🖼️', '🎨', '🧩', '♟️', '🎯', '🎳', '🎮', '🎰', '🃏', '🀄', '🎴', '🎭', '🖼️', '🎨', '🧩', '♟️', '🎯', '🎳', '🎮', '🎰', '🃏', '🀄', '🎴', '🎭', '🖼️', '🎨', '🧩', '♟️', '🎯', '🎳', '🎮', '🎰', '🃏', '🀄', '🎴', '🎭', '🖼️', '🎨', '🧩', '♟️', '🎯', '🎳', '🎮', '🎰', '🃏', '🀄', '🎴', '🎭', '🖼️', '🎨', '🧩', '♟️'],
    medical: ['🏥', '⚕️', '🩺', '💊', '💉', '🩸', '🧬', '🦠', '🧫', '🧪', '🌡️', '🩹', '🩺', '💊', '💉', '🩸', '🧬', '🦠', '🧫', '🧪', '🌡️', '🩹', '🏥', '⚕️', '🩺', '💊', '💉', '🩸', '🧬', '🦠', '🧫', '🧪', '🌡️', '🩹'],
    education: ['📚', '📖', '📕', '📗', '📘', '📙', '📓', '📔', '📒', '📃', '📜', '📄', '📰', '🗞️', '📑', '🔖', '🏷️', '💰', '💴', '💵', '💶', '💷', '💸', '💳', '🧾', '💹', '✏️', '✒️', '🖊️', '🖋️', '🖌️', '🖍️', '📝', '💼', '📁', '📂', '🗂️', '📅', '📆', '🗒️', '🗓️', '📇', '📈', '📉', '📊', '📋', '📌', '📍', '📎', '🖇️', '📏', '📐', '✂️', '🗃️', '🗄️', '🗑️', '📚', '📖', '📕', '📗', '📘', '📙', '📓', '📔', '📒', '📃', '📜', '📄', '📰', '🗞️', '📑', '🔖', '🏷️'],
    housing: ['🏠', '🏡', '🏘️', '🏚️', '🏗️', '🏭', '🏢', '🏬', '🏣', '🏤', '🏥', '🏦', '🏨', '🏪', '🏫', '🏩', '💒', '🏛️', '⛪', '🕌', '🕍', '🛕', '🕋', '⛩️', '🛤️', '🛣️', '🗾', '🎑', '🏞️', '🌅', '🌄', '🌠', '🎇', '🎆', '🌇', '🌆', '🏙️', '🌃', '🌌', '🌉', '🌁', '🏠', '🏡', '🏘️', '🏚️', '🏗️', '🏭', '🏢', '🏬', '🏣', '🏤', '🏥', '🏦', '🏨', '🏪', '🏫', '🏩', '💒', '🏛️', '⛪', '🕌', '🕍', '🛕', '🕋', '⛩️'],
    utilities: ['💡', '🔦', '🕯️', '🪔', '🧯', '🛢️', '💸', '💵', '💴', '💶', '💷', '💰', '💳', '🧾', '💹', '⚡', '🔥', '💧', '🌊', '💨', '❄️', '☀️', '🌤️', '⛅', '🌥️', '☁️', '🌦️', '🌧️', '⛈️', '🌩️', '⚡', '☔', '💧', '❄️', '☀️', '🌤️', '⛅', '🌥️', '☁️', '🌦️', '🌧️', '⛈️', '🌩️', '⚡', '☔', '💧', '❄️'],
    other: ['📦', '📮', '📯', '📪', '📫', '📬', '📭', '📤', '📥', '🗳️', '✉️', '📧', '📨', '📩', '📰', '🗞️', '📑', '🔖', '🏷️', '💰', '💴', '💵', '💶', '💷', '💸', '💳', '🧾', '💹', '✏️', '✒️', '🖊️', '🖋️', '🖌️', '🖍️', '📝', '💼', '📁', '📂', '🗂️', '📅', '📆', '🗒️', '🗓️', '📇', '📈', '📉', '📊', '📋', '📌', '📍', '📎', '🖇️', '📏', '📐', '✂️', '🗃️', '🗄️', '🗑️', '🔒', '🔓', '🔐', '🔑', '🗝️', '🔨', '🪓', '⛏️', '🪚', '🔧', '🪛', '🔩', '⚙️', '🧰', '🧲', '🪜', '⚗️', '🧪', '🧫', '🧬', '🔬', '🔭', '📡', '💉', '🩸', '💊', '🩹', '🩺', '🩻', '🧿', '⚱️', '🪦', '⚰️', '🪧', '🪪', '🏷️', '📦', '📮', '📯', '📪', '📫', '📬', '📭', '📤', '📥', '🗳️', '✉️', '📧', '📨', '📩', '📰', '🗞️', '📑', '🔖', '🏷️'],
    income: ['💰', '💴', '💵', '💶', '💷', '💸', '💳', '🧾', '💹', '📈', '📊', '📉', '💼', '🎁', '🎉', '🎊', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '🎗️', '🎫', '🎟️', '🎪', '🎭', '🎨', '🎬', '🎤', '🎧', '🎼', '🎹', '🥁', '🎷', '🎺', '🎸', '🪗', '🎻', '🎲', '🎯', '🎳', '🎮', '🎰', '🃏', '🀄', '🎴', '🎭', '🖼️', '🎨', '🧩', '♟️', '🎯', '🎳', '🎮', '🎰', '🃏', '🀄', '🎴', '🎭', '🖼️', '🎨', '🧩', '♟️']
};

// 初始化图标选择器
function initIconPicker() {
    const container = document.getElementById('icon-picker-container');
    if (!container) return;
    
    // 按类别组织图标
    const categories = [
        { name: '食物', icons: ICON_LIBRARY.food },
        { name: '交通', icons: ICON_LIBRARY.transport },
        { name: '购物', icons: ICON_LIBRARY.shopping },
        { name: '娱乐', icons: ICON_LIBRARY.entertainment },
        { name: '医疗', icons: ICON_LIBRARY.medical },
        { name: '教育', icons: ICON_LIBRARY.education },
        { name: '住房', icons: ICON_LIBRARY.housing },
        { name: '水电', icons: ICON_LIBRARY.utilities },
        { name: '收入', icons: ICON_LIBRARY.income },
        { name: '其他', icons: ICON_LIBRARY.other }
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
function openIconPicker() {
    document.getElementById('icon-picker-modal').classList.add('show');
}

// 关闭图标选择器
function closeIconPicker() {
    document.getElementById('icon-picker-modal').classList.remove('show');
}

// 选择图标
function selectIcon(icon) {
    document.getElementById('new-category-icon').value = icon;
    document.getElementById('selected-icon-preview').textContent = icon;
    closeIconPicker();
}

// 添加动画样式
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

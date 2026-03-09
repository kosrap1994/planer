import { supabase } from './supabase.js';

// Constants for gamification
const EXP_PER_TASK = 10;
const EXP_PER_HABIT = 5;

// Initial state
const initialState = {
    level: 1,
    currentExp: 0,
    maxExp: 100,
    weekStartDate: new Date().toISOString().split('T')[0],
    activeDayId: 'd1',
    mainFocus: '',
    stats: {
        tasksDone: 0,
        habitsDone: 0,
        daysStats: { 'd1': 0, 'd2': 0, 'd3': 0, 'd4': 0, 'd5': 0, 'd6': 0, 'd7': 0 }
    },
    history: [],
    habitChecks: {}, // Dictionary: 'YYYY-MM-DD' -> { 'h1': true, ... }
    monthlyGoals: {}, // Dictionary: 'YYYY-MM' -> [...]
    yearlyGoals: {}, // Dictionary: 'YYYY' -> [...]
    habits: [
        { id: 'h1', text: 'Пить воду (2л)' },
        { id: 'h2', text: 'Чтение (20 мин)' },
        { id: 'h3', text: 'Спорт / Разминка' }
    ],
    days: [
        { id: 'd1', name: 'Понедельник', tasks: [{ id: 't1_1', text: 'Рабочая задача 1', done: false }], habits: {} },
        { id: 'd2', name: 'Вторник', tasks: [{ id: 't2_1', text: '', done: false }], habits: {} },
        { id: 'd3', name: 'Среда', tasks: [{ id: 't3_1', text: '', done: false }], habits: {} },
        { id: 'd4', name: 'Четверг', tasks: [{ id: 't4_1', text: '', done: false }], habits: {} },
        { id: 'd5', name: 'Пятница', tasks: [{ id: 't5_1', text: '', done: false }], habits: {} },
        { id: 'd6', name: 'Суббота', tasks: [{ id: 't6_1', text: '', done: false }], habits: {} },
        { id: 'd7', name: 'Воскресенье', tasks: [{ id: 't7_1', text: '', done: false }], habits: {} }
    ]
};

let appState = null;
let saveTimeout = null;

// DOM Elements
const EL = {
    // Auth
    authOverlay: document.getElementById('auth-overlay'),
    appContent: document.getElementById('app-content'),
    authEmail: document.getElementById('auth-email'),
    authPassword: document.getElementById('auth-password'),
    authError: document.getElementById('auth-error'),
    authStatus: document.getElementById('auth-status'),
    btnLogin: document.getElementById('btn-login'),
    btnSignup: document.getElementById('btn-signup'),
    btnLogout: document.getElementById('btn-logout'),

    // App
    level: document.getElementById('user-level'),
    currentExp: document.getElementById('current-exp'),
    maxExp: document.getElementById('max-exp'),
    expFill: document.getElementById('exp-fill'),
    weekStart: document.getElementById('week-start-date'),
    mainFocus: document.getElementById('main-focus'),
    habitPanelTitle: document.getElementById('habit-panel-title'),
    habitList: document.getElementById('habit-list'),
    newHabitInput: document.getElementById('new-habit-input'),
    addHabitBtn: document.getElementById('add-habit-btn'),
    daysGrid: document.getElementById('days-grid'),
    btnClear: document.getElementById('btn-clear'),
    levelUpOverlay: document.getElementById('level-up-overlay'),
    modalLevel: document.getElementById('modal-level'),
    closeModalBtn: document.getElementById('close-modal-btn'),
    floatingContainer: document.getElementById('floating-exp-container'),
    
    // Multi-tab DOM
    navBtns: document.querySelectorAll('.nav-btn'),
    views: document.querySelectorAll('.view'),
    monthTitle: document.getElementById('month-view-title'),
    yearTitle: document.getElementById('year-view-title'),
    monthContainer: document.getElementById('monthly-goals-container'),
    yearContainer: document.getElementById('yearly-goals-container'),
    addGoalBtns: document.querySelectorAll('.add-goal-btn'),
    statTasks: document.getElementById('stat-tasks-done'),
    statHabits: document.getElementById('stat-habits-done'),
    statBestDay: document.getElementById('stat-best-day'),
    historyContainer: document.getElementById('history-container')
};

// Generate Unique ID
const generateId = () => Math.random().toString(36).substr(2, 9);

// Helper: Get Monday of a given date (0 = Sunday, 1 = Monday)
function getMonday(dateInput) {
    const d = new Date(dateInput);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const m = new Date(d.setDate(diff));
    return m.toISOString().split('T')[0];
}

// Ensure state structure is valid (Migrations)
function validateState() {
    if (!appState) appState = JSON.parse(JSON.stringify(initialState));
    if (!appState.monthlyGoals || Array.isArray(appState.monthlyGoals)) appState.monthlyGoals = {}; 
    if (!appState.yearlyGoals || Array.isArray(appState.yearlyGoals)) appState.yearlyGoals = {};
    if (!appState.days) appState.days = JSON.parse(JSON.stringify(initialState.days));
    
    appState.days.forEach(d => {
        if (!d.habits) d.habits = {};
    });
    
    if (!appState.activeDayId) appState.activeDayId = 'd1';
    
    if (!appState.habitChecks) {
        appState.habitChecks = {};
        const baseD = new Date(appState.weekStartDate);
        appState.days.forEach((dayObj, i) => {
            const currentD = new Date(baseD);
            currentD.setDate(currentD.getDate() + i);
            const y = currentD.getFullYear();
            const m = String(currentD.getMonth()+1).padStart(2,'0');
            const dayStr = String(currentD.getDate()).padStart(2,'0');
            const dateKey = `${y}-${m}-${dayStr}`;
            if (dayObj.habits && Object.keys(dayObj.habits).length > 0) {
                appState.habitChecks[dateKey] = { ...dayObj.habits };
            }
        });
    }
}

// Saving state to Supabase
async function saveState() {
    if (!appState) return;
    
    // Simple Debounce
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { error } = await supabase
                .from('profiles')
                .update({ state: appState, updated_at: new Date() })
                .eq('id', user.id);
            
            if (error) {
                console.error('Ошибка сохранения в облако:', error);
            } else {
                console.log('Данные синхронизированы с облаком.');
            }
        }
    }, 1500);
}

// Gamification Logic
function calculateMaxExp(level) {
    return Math.floor(100 * Math.pow(1.2, level - 1));
}

function showFloatingExp(amount, event) {
    const el = document.createElement('div');
    el.className = 'floating-exp';
    el.innerText = `+${amount} EXP`;
    if (event && event.clientX) {
        el.style.left = `${event.clientX}px`;
        el.style.top = `${event.clientY - 20}px`;
    } else {
        el.style.left = '50%';
        el.style.top = '20%';
        el.style.transform = 'translate(-50%, 0)';
    }
    EL.floatingContainer.appendChild(el);
    setTimeout(() => el.remove(), 1500);
}

function updateLevelAndExpStore(addedExp, event) {
    if (!appState) return;
    appState.currentExp += addedExp;
    showFloatingExp(addedExp, event);

    while (appState.currentExp >= appState.maxExp) {
        appState.currentExp -= appState.maxExp;
        appState.level += 1;
        appState.maxExp = calculateMaxExp(appState.level);
        EL.modalLevel.innerText = appState.level;
        EL.levelUpOverlay.classList.remove('hidden');
    }
    
    saveState();
    renderStats();
}

// Rendering Functions
function renderStats() {
    if (!appState) return;
    EL.level.innerText = appState.level;
    EL.currentExp.innerText = appState.currentExp;
    EL.maxExp.innerText = appState.maxExp;
    const percentage = Math.min(100, Math.max(0, (appState.currentExp / appState.maxExp) * 100));
    EL.expFill.style.width = `${percentage}%`;
}

function renderHabits() {
    if (!appState) return;
    EL.habitList.innerHTML = '';
    const activeDay = appState.days.find(d => d.id === appState.activeDayId);
    if (!activeDay) return;
    
    EL.habitPanelTitle.innerText = `Привычки (${activeDay.name})`;

    const d = getCurrentViewDate();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const dayStr = String(d.getDate()).padStart(2,'0');
    const dateKey = `${y}-${m}-${dayStr}`;

    if (!appState.habitChecks) appState.habitChecks = {};
    if (!appState.habitChecks[dateKey]) appState.habitChecks[dateKey] = {};

    appState.habits.forEach(habit => {
        const isDone = !!appState.habitChecks[dateKey][habit.id];
        const li = document.createElement('li');
        li.className = `habit-item panel ${isDone ? 'completed' : ''}`;
        
        const label = document.createElement('label');
        label.style.display = 'flex';
        label.style.alignItems = 'flex-start';
        label.style.gap = '12px';
        label.style.flex = '1';
        label.style.cursor = 'pointer';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'custom-checkbox';
        checkbox.checked = isDone;
        
        const span = document.createElement('span');
        span.className = 'task-text';
        span.innerText = habit.text;

        label.appendChild(checkbox);
        label.appendChild(span);
        
        const delBtn = document.createElement('button');
        delBtn.className = 'delete-btn';
        delBtn.innerText = '×';
        delBtn.title = 'Удалить из всех дней';

        li.appendChild(label);
        li.appendChild(delBtn);
        
        checkbox.addEventListener('change', (e) => {
            const checked = e.target.checked;
            if (checked && !isDone) {
                updateLevelAndExpStore(EXP_PER_HABIT, e);
                if (!appState.stats) appState.stats = { tasksDone: 0, habitsDone: 0, daysStats: {} };
                appState.stats.habitsDone = (appState.stats.habitsDone || 0) + 1;
            } else if (!checked && isDone) {
                if (appState.stats && appState.stats.habitsDone > 0) appState.stats.habitsDone--;
            }
            appState.habitChecks[dateKey][habit.id] = checked;
            renderHabits();
            saveState();
        });

        delBtn.addEventListener('click', () => {
            appState.habits = appState.habits.filter(h => h.id !== habit.id);
            if (appState.habitChecks) {
                Object.values(appState.habitChecks).forEach(checks => {
                    delete checks[habit.id];
                });
            }
            renderHabits();
            saveState();
        });

        EL.habitList.appendChild(li);
    });
}

function renderDays() {
    if (!appState) return;
    EL.daysGrid.innerHTML = '';
    appState.days.forEach(day => {
        const dayPanel = document.createElement('div');
        dayPanel.className = `panel day-panel ${day.id === appState.activeDayId ? 'active-day' : ''}`;
        if (day.id === appState.activeDayId) {
            dayPanel.style.borderColor = 'var(--accent-color)';
            dayPanel.style.boxShadow = '0 0 15px rgba(88, 166, 255, 0.2)';
        } else {
            dayPanel.style.borderColor = 'var(--panel-border)';
            dayPanel.style.boxShadow = 'none';
        }
        
        dayPanel.addEventListener('click', (e) => {
            if (e.target.tagName.toLowerCase() !== 'input' && e.target.tagName.toLowerCase() !== 'button') {
                appState.activeDayId = day.id;
                saveState();
                renderDays();
                renderHabits();
                renderGoals('month');
                renderGoals('year');
            }
        });

        const header = document.createElement('div');
        header.className = 'day-header';
        header.innerHTML = `
            <span class="day-name">${day.name}</span>
            <span class="exp-reward">+${EXP_PER_TASK} EXP</span>
        `;
        dayPanel.appendChild(header);

        const ul = document.createElement('ul');
        ul.className = 'task-list';
        
        day.tasks.forEach(task => {
            const li = document.createElement('li');
            li.className = `task-item ${task.done ? 'completed' : ''}`;
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'custom-checkbox';
            checkbox.checked = task.done;

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'glass-input task-text';
            input.value = task.text;
            input.placeholder = 'Напишите задачу...';
            if(task.done) input.style.pointerEvents = 'none';

            const delBtn = document.createElement('button');
            delBtn.className = 'delete-btn';
            delBtn.innerText = '×';

            li.appendChild(checkbox);
            li.appendChild(input);
            li.appendChild(delBtn);
            ul.appendChild(li);

            checkbox.addEventListener('change', (e) => {
                const checked = e.target.checked;
                if (checked && !task.done && task.text.trim() !== '') {
                    updateLevelAndExpStore(EXP_PER_TASK, e);
                    if (!appState.stats) appState.stats = { tasksDone: 0, habitsDone: 0, daysStats: {} };
                    appState.stats.tasksDone = (appState.stats.tasksDone || 0) + 1;
                    appState.stats.daysStats[day.id] = (appState.stats.daysStats[day.id] || 0) + 1;
                } else if (!checked && task.done && task.text.trim() !== '') {
                    if (appState.stats && appState.stats.tasksDone > 0) appState.stats.tasksDone--;
                    if (appState.stats && appState.stats.daysStats[day.id] > 0) appState.stats.daysStats[day.id]--;
                }
                task.done = checked;
                renderDays();
                saveState();
            });

            input.addEventListener('input', (e) => {
                task.text = e.target.value;
                saveState();
            });

            delBtn.addEventListener('click', () => {
                day.tasks = day.tasks.filter(t => t.id !== task.id);
                renderDays();
                saveState();
            });
        });

        dayPanel.appendChild(ul);

        const addBtn = document.createElement('button');
        addBtn.className = 'btn btn-add-task';
        addBtn.innerText = '+ Добавить задачу';
        addBtn.style.marginTop = '10px';
        addBtn.style.width = '100%';
        addBtn.style.borderStyle = 'dashed';

        addBtn.addEventListener('click', () => {
             if (day.tasks.filter(t => t.text.trim() === '').length > 2) return;
             day.tasks.push({ id: generateId(), text: '', done: false });
             renderDays();
             saveState();
        });

        dayPanel.appendChild(addBtn);
        EL.daysGrid.appendChild(dayPanel);
    });
}

function getCurrentViewDate() {
    if (!appState) return new Date();
    const d = new Date(appState.weekStartDate);
    const dayOffset = parseInt(appState.activeDayId.replace('d', '')) - 1;
    d.setDate(d.getDate() + dayOffset);
    return d;
}

function renderGoals(type) {
    if (!appState) return;
    const container = type === 'month' ? EL.monthContainer : EL.yearContainer;
    container.innerHTML = '';
    
    const d = getCurrentViewDate();
    let key = '';
    let goalsObj = {};
    
    if (type === 'month') {
        const year = d.getFullYear();
        const monthNumStr = String(d.getMonth() + 1).padStart(2, '0');
        key = `${year}-${monthNumStr}`;
        goalsObj = appState.monthlyGoals;
        
        if (EL.monthTitle) {
            const monthsRU = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
            EL.monthTitle.innerText = `Цели - ${monthsRU[d.getMonth()]} ${year}`;
        }
    } else {
        key = String(d.getFullYear());
        goalsObj = appState.yearlyGoals;
        
        if(EL.yearTitle) {
            EL.yearTitle.innerText = `Цели - ${key} год`;
        }
    }
    
    if (!key) return;
    if (!goalsObj[key]) goalsObj[key] = [];
    const goalsList = goalsObj[key];
    
    goalsList.forEach(goal => {
        const div = document.createElement('div');
        div.className = `goal-item ${goal.done ? 'completed' : ''}`;
        
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'custom-checkbox';
        cb.checked = goal.done;
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'glass-input task-text';
        input.value = goal.text;
        input.placeholder = 'Ваша цель...';
        if(goal.done) input.style.pointerEvents = 'none';
        
        const delBtn = document.createElement('button');
        delBtn.className = 'delete-btn';
        delBtn.innerText = '×';
        
        div.appendChild(cb);
        div.appendChild(input);
        div.appendChild(delBtn);
        
        cb.addEventListener('change', (e) => {
            const checked = e.target.checked;
            if (checked && !goal.done && goal.text.trim() !== '') {
                updateLevelAndExpStore(50, e);
                if (!appState.stats) appState.stats = { tasksDone: 0, habitsDone: 0, daysStats: {} };
                appState.stats.tasksDone = (appState.stats.tasksDone || 0) + 1;
            } else if (!checked && goal.done && goal.text.trim() !== '') {
                 if (appState.stats && appState.stats.tasksDone > 0) appState.stats.tasksDone--;
            }
            goal.done = checked;
            renderGoals(type);
            saveState();
        });
        
        input.addEventListener('input', (e) => {
            goal.text = e.target.value;
            saveState();
        });
        
        delBtn.addEventListener('click', () => {
             goalsObj[key] = goalsObj[key].filter(g => g.id !== goal.id);
             renderGoals(type);
             saveState();
        });
        
        container.appendChild(div);
    });
}

function renderProfile() {
    if (!appState) return;
    if (!appState.stats) appState.stats = { tasksDone: 0, habitsDone: 0, daysStats: {} };
    if (!appState.history) appState.history = [];
    
    EL.statTasks.innerText = appState.stats.tasksDone || 0;
    EL.statHabits.innerText = appState.stats.habitsDone || 0;
    
    let bestDayName = '-';
    if (appState.history.length > 0) {
        const lastWeek = appState.history[appState.history.length - 1];
        if (lastWeek.daysStats) {
            let bestDayId = null;
            let maxTasks = -1;
            for (const [dayId, count] of Object.entries(lastWeek.daysStats)) {
                if (count > maxTasks && count > 0) {
                    maxTasks = count;
                    bestDayId = dayId;
                }
            }
            if (bestDayId) {
                const dayObj = appState.days.find(d => d.id === bestDayId);
                if (dayObj) bestDayName = dayObj.name;
            }
        }
    }
    EL.statBestDay.innerText = bestDayName;

    EL.historyContainer.innerHTML = '';
    if (appState.history.length === 0) {
        EL.historyContainer.innerHTML = '<p class="text-secondary" style="text-align:center; padding: 20px;">Нет завершенных недель.</p>';
        return;
    }
    
    [...appState.history].reverse().forEach(record => {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = `
            <div class="history-dates">Неделя: ${record.date}</div>
            <div class="history-stats text-accent">Выполнено: ${record.tasks} задач, ${record.habits} привычек</div>
        `;
        EL.historyContainer.appendChild(item);
    });
}

function renderAll() {
    if (!appState) return;
    renderStats();
    EL.weekStart.value = appState.weekStartDate;
    EL.mainFocus.value = appState.mainFocus;
    renderHabits();
    renderDays();
    renderGoals('month');
    renderGoals('year');
    renderProfile();
}

// Nav Switching
EL.navBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        EL.navBtns.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        
        const targetViewId = e.target.dataset.target;
        EL.views.forEach(v => {
            if (v.id === targetViewId) {
                v.classList.add('active');
            } else {
                v.classList.remove('active');
            }
        });
    });
});

// App Event Listeners
EL.weekStart.addEventListener('change', (e) => {
    if (!appState) return;
    const pickedDate = e.target.value;
    if (!pickedDate) return;
    
    appState.weekStartDate = getMonday(pickedDate);
    
    const d = new Date(pickedDate);
    let dayNum = d.getDay();
    if (dayNum === 0) dayNum = 7;
    appState.activeDayId = 'd' + dayNum;
    
    saveState();
    renderAll();
});

EL.mainFocus.addEventListener('input', (e) => {
    if (!appState) return;
    appState.mainFocus = e.target.value;
    saveState();
});

EL.addHabitBtn.addEventListener('click', () => {
    if (!appState) return;
    const text = EL.newHabitInput.value.trim();
    if (text) {
        appState.habits.push({ id: generateId(), text: text });
        EL.newHabitInput.value = '';
        renderHabits();
        saveState();
    }
});

EL.newHabitInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') EL.addHabitBtn.click();
});

EL.addGoalBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        if (!appState) return;
        const type = e.target.dataset.type;
        const d = getCurrentViewDate();
        let key = '';
        let goalsObj = {};
        
        if (type === 'month') {
            const year = d.getFullYear();
            const monthNumStr = String(d.getMonth() + 1).padStart(2, '0');
            key = `${year}-${monthNumStr}`;
            goalsObj = appState.monthlyGoals;
        } else {
            key = String(d.getFullYear());
            goalsObj = appState.yearlyGoals;
        }
        
        if (!key) return;
        if (!goalsObj[key]) goalsObj[key] = [];
        
        goalsObj[key].push({ id: generateId(), text: '', done: false });
        renderGoals(type);
        saveState();
    });
});

EL.btnClear.addEventListener('click', () => {
    if (!appState) return;
    if(confirm('Вы уверены, что хотите начать новую неделю? Прогресс будет сохранен в Историю.')) {
        let weeklyTasks = 0;
        appState.days.forEach(d => {
            weeklyTasks += d.tasks.filter(t => t.done).length;
        });
        
        let weeklyHabits = 0;
        for (let i = 0; i < 7; i++) {
            const dView = new Date(appState.weekStartDate);
            dView.setDate(dView.getDate() + i);
            const y = dView.getFullYear();
            const m = String(dView.getMonth()+1).padStart(2,'0');
            const dayStr = String(dView.getDate()).padStart(2,'0');
            const dateKey = `${y}-${m}-${dayStr}`;
            
            if (appState.habitChecks && appState.habitChecks[dateKey]) {
                weeklyHabits += Object.values(appState.habitChecks[dateKey]).filter(v => v).length;
            }
        }
        
        const currentDaysStats = appState.stats?.daysStats || {};
        
        if (!appState.history) appState.history = [];
        appState.history.push({
            date: appState.weekStartDate,
            tasks: weeklyTasks,
            habits: weeklyHabits,
            daysStats: { ...currentDaysStats }
        });
        
        appState.days.forEach(d => {
            d.tasks = [{ id: generateId(), text: '', done: false }];
        });
        
        if (appState.stats) {
            appState.stats.daysStats = { 'd1': 0, 'd2': 0, 'd3': 0, 'd4': 0, 'd5': 0, 'd6': 0, 'd7': 0 };
        }
        
        appState.mainFocus = '';
        
        const d = new Date(appState.weekStartDate);
        d.setDate(d.getDate() + 7);
        appState.weekStartDate = d.toISOString().split('T')[0];
        appState.activeDayId = 'd1';
        
        saveState();
        renderAll();
        
        EL.btnClear.innerText = 'Сохранено!';
        setTimeout(() => EL.btnClear.innerHTML = '<span class="btn-icon">⚡</span> Очистить неделю', 2000);
    }
});

EL.closeModalBtn.addEventListener('click', () => {
    EL.levelUpOverlay.classList.add('hidden');
});

// =======================
// SUPABASE AUTH FLOW
// =======================

async function loadUserData(userId) {
    EL.authStatus.innerText = 'Загрузка профиля...';
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('state')
            .eq('id', userId)
            .single();

        if (error) throw error;
        
        if (data && data.state && Object.keys(data.state).length > 0) {
            appState = data.state;
            validateState();
        } else {
            // First time login - populate via backend trigger or local state
            appState = JSON.parse(JSON.stringify(initialState));
            await saveState(); // Save to init
        }
        
        // Success
        EL.authOverlay.style.display = 'none';
        EL.appContent.style.display = 'block';
        renderAll();
        
    } catch (err) {
        console.error('Ошибка при загрузке данных: ', err);
        EL.authError.style.display = 'block';
        EL.authError.innerText = 'Ошибка загрузки данных из облака.';
        EL.authStatus.innerText = '';
    }
}

async function checkSession() {
    EL.authStatus.innerText = 'Проверка сессии...';
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (session) {
        loadUserData(session.user.id);
    } else {
        EL.authStatus.innerText = '';
        EL.authOverlay.style.display = 'flex';
        EL.appContent.style.display = 'none';
        
        // If there was a localStorage payload from before, we could theoretically transfer it,
        // but explicit login is safer for now.
    }
}

// Event Listeners for Auth
EL.btnLogin.addEventListener('click', async () => {
    EL.authError.style.display = 'none';
    EL.authStatus.innerText = 'Вход...';
    
    const email = EL.authEmail.value;
    const password = EL.authPassword.value;
    
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        EL.authError.style.display = 'block';
        EL.authError.innerText = error.message;
        EL.authStatus.innerText = '';
    } else {
        loadUserData(data.user.id);
    }
});

EL.btnSignup.addEventListener('click', async () => {
    EL.authError.style.display = 'none';
    EL.authStatus.innerText = 'Регистрация...';
    
    const email = EL.authEmail.value;
    const password = EL.authPassword.value;
    
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
    });

    if (error) {
        EL.authError.style.display = 'block';
        EL.authError.innerText = error.message;
        EL.authStatus.innerText = '';
    } else {
        if (data.session) {
            EL.authStatus.innerText = 'Вход успешен...';
            loadUserData(data.user.id);
        } else {
            EL.authStatus.innerText = 'Аккаунт создан! Теперь нажмите кнопку "Войти".';
        }
    }
});

EL.btnLogout.addEventListener('click', async () => {
    await supabase.auth.signOut();
    appState = null;
    EL.authOverlay.style.display = 'flex';
    EL.appContent.style.display = 'none';
    EL.authEmail.value = '';
    EL.authPassword.value = '';
    EL.authStatus.innerText = '';
});

// Run Init
checkSession();

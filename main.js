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
        habitsDone: 0
    },
    habitChecks: {}, // Dictionary: 'YYYY-MM-DD' -> { 'h1': true, ... }
    taskChecks: {}, // Dictionary: 'YYYY-MM-DD' -> [{id: '...', text: '...', done: false}, ...]
    templates: [], // Array: [{id: '...', text: '...', days: [1, 2, 4]}] (0=Sun, 1=Mon...6=Sat)
    monthlyGoals: {}, // Dictionary: 'YYYY-MM' -> [...]
    yearlyGoals: {}, // Dictionary: 'YYYY' -> [...]
    habits: [
        { id: 'h1', text: 'Пить воду (2л)' },
        { id: 'h2', text: 'Чтение (20 мин)' },
        { id: 'h3', text: 'Спорт / Разминка' }
    ],
    days: [
        { id: 'd1', name: 'Понедельник' },
        { id: 'd2', name: 'Вторник' },
        { id: 'd3', name: 'Среда' },
        { id: 'd4', name: 'Четверг' },
        { id: 'd5', name: 'Пятница' },
        { id: 'd6', name: 'Суббота' },
        { id: 'd7', name: 'Воскресенье' }
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
    historyContainer: document.getElementById('history-container'),
    // Templates
    btnOpenTemplates: document.getElementById('btn-open-templates'),
    templatesOverlay: document.getElementById('templates-overlay'),
    closeTemplatesBtn: document.getElementById('close-templates-btn'),
    templatesList: document.getElementById('templates-list'),
    newTemplateInput: document.getElementById('new-template-input'),
    addTemplateBtn: document.getElementById('add-template-btn'),
    dayToggles: document.querySelectorAll('.day-toggle input[type="checkbox"]')
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
    
    if (!appState.taskChecks) appState.taskChecks = {};
    if (!appState.habitChecks) appState.habitChecks = {};
    if (!appState.templates) appState.templates = [];
    if (!appState.stats.habitStreaks) appState.stats.habitStreaks = {}; // id -> current streak
    
    const baseD = new Date(appState.weekStartDate);
    appState.days.forEach((dayObj, i) => {
        const currentD = new Date(baseD);
        currentD.setDate(currentD.getDate() + i);
        const y = currentD.getFullYear();
        const m = String(currentD.getMonth()+1).padStart(2,'0');
        const dayStr = String(currentD.getDate()).padStart(2,'0');
        const dateKey = `${y}-${m}-${dayStr}`;
        
        if (dayObj.tasks) {
            appState.taskChecks[dateKey] = [ ...dayObj.tasks ];
            delete dayObj.tasks;
        }
        if (dayObj.habits && Object.keys(dayObj.habits).length > 0) {
            appState.habitChecks[dateKey] = { ...dayObj.habits };
            delete dayObj.habits;
        }
    });
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

// Habit Streak Logic
function calculateHabitStreak(habitId) {
    if (!appState || !appState.habitChecks) return;
    
    let currentStreak = 0;
    const today = new Date();
    today.setHours(0,0,0,0);
    
    // We check backwards from today up to a reasonable limit (e.g. 100 days)
    for (let i = 0; i < 100; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dayStr = String(d.getDate()).padStart(2, '0');
        const dateKey = `${y}-${m}-${dayStr}`;
        
        // If it's today and not checked, we skip counting but don't break streak
        // If it's a past day and not checked, streak breaks
        if (appState.habitChecks[dateKey] && appState.habitChecks[dateKey][habitId]) {
            currentStreak++;
            
            // Give medial notification if we hit exactly 7 days milestone
            if (currentStreak === 7) {
                 const habit = appState.habits.find(h => h.id === habitId);
                 const habitName = habit ? habit.text : 'Привычка';
                 
                 // Show modal overlay for medal
                 showMedalModal(habitName);
                 
                 // Update level store with 100 exp bonus for a medal
                 appState.currentExp += 100;
                 while (appState.currentExp >= appState.maxExp) {
                     appState.currentExp -= appState.maxExp;
                     appState.level += 1;
                     appState.maxExp = calculateMaxExp(appState.level);
                 }
            }
        } else {
            // Break if we didn't check it, except allowable gap for today
            if (i !== 0) {
                break;
            }
        }
    }
    
    if (!appState.stats.habitStreaks) appState.stats.habitStreaks = {};
    appState.stats.habitStreaks[habitId] = currentStreak;
}

function showMedalModal(habitName) {
    // Create an ephemeral modal
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '9999';
    
    const content = document.createElement('div');
    content.className = 'level-up-modal';
    content.innerHTML = `
        <div class="sparkles">🏅</div>
        <h2>Супер Серия!</h2>
        <div class="new-level-badge" style="background: linear-gradient(135deg, #ffd700, #ff8c00);">7 Дней Подряд</div>
        <p>Вы выполняете "${habitName}" целую неделю! Получено +100 EXP.</p>
        <button class="btn btn-continue" style="margin-top:20px;">Забрать награду</button>
    `;
    
    overlay.appendChild(content);
    document.body.appendChild(overlay);
    
    content.querySelector('.btn-continue').addEventListener('click', () => {
        overlay.remove();
        renderStats();
    });
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
                if (!appState.stats) appState.stats = { tasksDone: 0, habitsDone: 0 };
                appState.stats.habitsDone = (appState.stats.habitsDone || 0) + 1;
            } else if (!checked && isDone) {
                if (appState.stats && appState.stats.habitsDone > 0) appState.stats.habitsDone--;
            }
            appState.habitChecks[dateKey][habit.id] = checked;
            
            // Recalculate streak for this habit
            calculateHabitStreak(habit.id);
            
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
    
    const baseD = new Date(appState.weekStartDate);
    if (!appState.taskChecks) appState.taskChecks = {};

    appState.days.forEach((day, index) => {
        const currentD = new Date(baseD);
        currentD.setDate(currentD.getDate() + index);
        const y = currentD.getFullYear();
        const m = String(currentD.getMonth()+1).padStart(2,'0');
        const dayStr = String(currentD.getDate()).padStart(2,'0');
        const dateKey = `${y}-${m}-${dayStr}`;
        const displayDate = `${dayStr}.${m}`;

        if (!appState.taskChecks[dateKey]) {
            appState.taskChecks[dateKey] = [{ id: generateId(), text: '', done: false }];
            
            // Auto-inject templates for this day of the week
            if (appState.templates && appState.templates.length > 0) {
                const dayOfWeek = currentD.getDay(); // 0-6
                const injectedTasks = appState.templates
                    .filter(t => t.days.includes(dayOfWeek))
                    .map(t => ({ id: generateId(), text: t.text, done: false }));
                
                if (injectedTasks.length > 0) {
                    appState.taskChecks[dateKey] = [ ...injectedTasks, ...appState.taskChecks[dateKey] ];
                }
            }
        }
        const dayTasks = appState.taskChecks[dateKey];
        
        // Smart Time Sorting Logic
        if (dayTasks && dayTasks.length > 0) {
            dayTasks.sort((a, b) => {
                const timeMatchA = a.text.match(/^(\d{1,2}):(\d{2})/);
                const timeMatchB = b.text.match(/^(\d{1,2}):(\d{2})/);
                
                const hasTimeA = timeMatchA !== null;
                const hasTimeB = timeMatchB !== null;
                
                if (hasTimeA && hasTimeB) {
                    const minutesA = parseInt(timeMatchA[1]) * 60 + parseInt(timeMatchA[2]);
                    const minutesB = parseInt(timeMatchB[1]) * 60 + parseInt(timeMatchB[2]);
                    return minutesA - minutesB;
                } else if (hasTimeA && !hasTimeB) {
                    return -1; // Time comes first
                } else if (!hasTimeA && hasTimeB) {
                    return 1; // Time comes first
                } else {
                    return 0; // Both no time, keep original order
                }
            });
        }

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
            <span class="day-name">${day.name} <span style="font-size:0.7em; color:var(--text-secondary); font-weight:normal;">${displayDate}</span></span>
            <span class="exp-reward">+${EXP_PER_TASK} EXP</span>
        `;
        dayPanel.appendChild(header);

        const ul = document.createElement('ul');
        ul.className = 'task-list';
        
        dayTasks.forEach((task, taskIndex) => {
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
                    if (!appState.stats) appState.stats = { tasksDone: 0, habitsDone: 0 };
                    appState.stats.tasksDone = (appState.stats.tasksDone || 0) + 1;
                } else if (!checked && task.done && task.text.trim() !== '') {
                    if (appState.stats && appState.stats.tasksDone > 0) appState.stats.tasksDone--;
                }
                task.done = checked;
                renderDays();
                saveState();
            });

            input.addEventListener('input', (e) => {
                task.text = e.target.value;
                saveState();
            });

            // Re-render and sort when input loses focus
            input.addEventListener('blur', () => {
                renderDays();
            });

            delBtn.addEventListener('click', () => {
                appState.taskChecks[dateKey] = dayTasks.filter((t, i) => i !== taskIndex);
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
             if (dayTasks.filter(t => t.text.trim() === '').length > 2) return;
             dayTasks.push({ id: generateId(), text: '', done: false });
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
    if (!appState.stats) appState.stats = { tasksDone: 0, habitsDone: 0 };
    
    EL.statTasks.innerText = appState.stats.tasksDone || 0;
    EL.statHabits.innerText = appState.stats.habitsDone || 0;
    
    let bestDayName = '-';
    if (appState.taskChecks) {
        const today = new Date();
        const dayCounts = [0, 0, 0, 0, 0, 0, 0];
        
        for (let i = 0; i < 7; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const y = d.getFullYear();
            const m = String(d.getMonth()+1).padStart(2,'0');
            const dayStr = String(d.getDate()).padStart(2,'0');
            const dateKey = `${y}-${m}-${dayStr}`;
            
            if (appState.taskChecks[dateKey]) {
                const doneCount = appState.taskChecks[dateKey].filter(t => t.done).length;
                dayCounts[d.getDay()] += doneCount;
            }
        }
        
        let maxTasks = -1;
        let bestDayIndex = -1;
        for (let j = 0; j < 7; j++) {
            if (dayCounts[j] > maxTasks && dayCounts[j] > 0) {
                maxTasks = dayCounts[j];
                bestDayIndex = j;
            }
        }
        
        if (bestDayIndex !== -1) {
            const dayNames = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
            bestDayName = dayNames[bestDayIndex];
        }
    }
    EL.statBestDay.innerText = bestDayName;

    // Render Habit Streaks & Medals in history container
    EL.historyContainer.innerHTML = '<h3 style="margin-top:0; color:var(--text-secondary);">Ваши Серии Привычек</h3>';
    
    let hasStreaks = false;
    if (appState.habits && appState.stats.habitStreaks) {
        appState.habits.forEach(habit => {
            const streak = appState.stats.habitStreaks[habit.id] || 0;
            if (streak > 0) {
                hasStreaks = true;
                const streakItem = document.createElement('div');
                streakItem.className = 'history-item';
                
                const medalsCount = Math.floor(streak / 7);
                const medalsIcons = '🏅'.repeat(medalsCount);
                
                streakItem.innerHTML = `
                    <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
                        <span style="font-weight:600;">${habit.text}</span>
                        <span><span style="color:var(--text-exp); font-weight:bold;">${streak} дней</span> ${medalsIcons}</span>
                    </div>
                `;
                EL.historyContainer.appendChild(streakItem);
            }
        });
    }
    
    if (!hasStreaks) {
        EL.historyContainer.innerHTML += '<p class="text-secondary" style="font-size:0.9em;">Выполните привычку 2 дня подряд, чтобы начать серию!</p>';
    }
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
    renderTemplates();
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

// Templates Logic
function renderTemplates() {
    if (!appState || !appState.templates) return;
    EL.templatesList.innerHTML = '';
    
    if (appState.templates.length === 0) {
        EL.templatesList.innerHTML = '<p class="text-secondary" style="font-size:0.9em;">Нет активных шаблонов.</p>';
        return;
    }
    
    const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    
    appState.templates.forEach(t => {
        const div = document.createElement('div');
        div.className = 'goal-item panel';
        div.style.marginBottom = '10px';
        div.style.padding = '10px';
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        
        const textSpan = document.createElement('span');
        textSpan.style.flex = '1';
        textSpan.style.fontWeight = 'bold';
        textSpan.innerText = t.text;
        
        const daysSpan = document.createElement('span');
        daysSpan.style.color = 'var(--accent-color)';
        daysSpan.style.marginRight = '15px';
        daysSpan.style.fontSize = '0.85em';
        
        const activeDaysStr = t.days.map(dNum => dayNames[dNum]).join(', ');
        daysSpan.innerText = activeDaysStr;
        
        const delBtn = document.createElement('button');
        delBtn.className = 'delete-btn';
        delBtn.innerText = '×';
        delBtn.style.opacity = '1'; /* Override default CSS opacity 0 */
        delBtn.addEventListener('click', () => {
            appState.templates = appState.templates.filter(temp => temp.id !== t.id);
            saveState();
            renderTemplates();
        });
        
        div.appendChild(textSpan);
        div.appendChild(daysSpan);
        div.appendChild(delBtn);
        EL.templatesList.appendChild(div);
    });
}

EL.btnOpenTemplates.addEventListener('click', () => {
    EL.templatesOverlay.classList.remove('hidden');
    EL.templatesOverlay.style.display = 'flex';
    renderTemplates();
});

EL.closeTemplatesBtn.addEventListener('click', () => {
    EL.templatesOverlay.classList.add('hidden');
    EL.templatesOverlay.style.display = 'none';
});

EL.addTemplateBtn.addEventListener('click', () => {
    if (!appState) return;
    const text = EL.newTemplateInput.value.trim();
    if (!text) return;
    
    const selectedDays = [];
    EL.dayToggles.forEach(cb => {
        if (cb.checked) selectedDays.push(parseInt(cb.value));
    });
    
    if (selectedDays.length === 0) {
        alert('Выберите хотя бы один день недели!');
        return;
    }
    
    if (!appState.templates) appState.templates = [];
    appState.templates.push({
        id: generateId(),
        text: text,
        days: selectedDays
    });
    
    EL.newTemplateInput.value = '';
    EL.dayToggles.forEach(cb => cb.checked = false);
    
    saveState();
    renderTemplates();
    
    // Suggest refreshing the current week to apply
    if (confirm('Шаблон успешно добавлен. Обновить текущую неделю, чтобы применить шаблон к еще не открытым дням?')) {
        renderDays();
    }
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
        EL.authOverlay.classList.add('hidden');
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
        EL.authOverlay.classList.remove('hidden');
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
    EL.authOverlay.classList.remove('hidden');
    EL.appContent.style.display = 'none';
    EL.authEmail.value = '';
    EL.authPassword.value = '';
    EL.authStatus.innerText = '';
});

// Run Init
supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        if (session) {
            loadUserData(session.user.id);
        }
    } else if (event === 'SIGNED_OUT') {
        appState = null;
        EL.authOverlay.classList.remove('hidden');
        EL.appContent.style.display = 'none';
        EL.authEmail.value = '';
        EL.authPassword.value = '';
        EL.authStatus.innerText = '';
    }
});

// Initial load check
checkSession();

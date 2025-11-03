/**
 * Frontend JavaScript for Speaking Practice Roadmap Tool
 */

// Helper function to escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

let roadmap = null;
let progress = null;
let currentWeek = null;
let weeklySummary = null;

// Load initial data
async function loadData() {
    try {
        // Load roadmap
        const roadmapResponse = await fetch('/api/roadmap');
        roadmap = await roadmapResponse.json();
        
        // Load progress
        const progressResponse = await fetch('/api/progress');
        const progressData = await progressResponse.json();
        progress = progressData.progress;
        currentWeek = progressData.current_week;
        weeklySummary = progressData.weekly_summary;
        
        // Render the page
        renderPage();
    } catch (error) {
        console.error('Error loading data:', error);
        showError('Failed to load data. Please refresh the page.');
    }
}

// Render the entire page
function renderPage() {
    if (!roadmap) return;
    
    // Update header with current week and date
    updateTodayDate();
    updateWeekTitle();
    
    // Update progress summary
    updateProgressSummary();
    
    // Update week list in sidebar
    updateWeekList();
    
    // Render activities
    renderActivities();
}

// Update today's date display
function updateTodayDate() {
    const today = new Date();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const dayName = dayNames[today.getDay()];
    const month = monthNames[today.getMonth()];
    const day = today.getDate();
    
    const todayDateElement = document.getElementById('todayDate');
    if (todayDateElement) {
        todayDateElement.textContent = `Today is ${dayName}, ${month} ${day}`;
    }
}

// Update week title with current week and date range (Sunday-Saturday format)
function updateWeekTitle() {
    if (!currentWeek) return;
    
    const [year, week] = currentWeek.split('-W');
    const weekNum = parseInt(week);
    
    // Use the same getWeekDateRange function to ensure consistency
    const dateRange = getWeekDateRange(currentWeek);
    
    const titleElement = document.getElementById('weekTitle');
    if (titleElement) {
        titleElement.textContent = `Week ${weekNum}, ${year} (${dateRange})`;
    }
}

// Update progress summary (if elements exist)
function updateProgressSummary() {
    if (!weeklySummary) return;
    
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    
    // Only update if elements exist (progress bar may have been removed)
    if (progressFill && progressText) {
        const completed = weeklySummary.completed_activities;
        const total = weeklySummary.total_activities;
        const percentage = (completed / total) * 100;
        
        progressFill.style.width = `${percentage}%`;
        progressText.textContent = `${completed}/${total} completed`;
    }
}

// Render activities
function renderActivities() {
    const activitiesContainer = document.getElementById('activities');
    activitiesContainer.innerHTML = '';
    
    if (!roadmap || !roadmap.activities) return;
    
    roadmap.activities.forEach(activity => {
        const activityElement = createActivityElement(activity);
        activitiesContainer.appendChild(activityElement);
    });
}

// Create activity element
function createActivityElement(activity) {
    const div = document.createElement('div');
    div.className = 'activity';
    div.dataset.activityId = activity.id;
    
    // Get current progress for this activity
    const activityProgress = getActivityProgress(activity.id);
    
    let checkboxHtml = '';
    if (activity.id === 'voice_journaling' || activity.id === 'shadowing_practice' || activity.id === 'weekly_speaking_prompt') {
        // Special handling for daily activities (voice journaling, shadowing practice, and weekly speaking prompt)
        const daysCompleted = activityProgress?.completed_days || [];
        const daysOfWeek = getDaysOfWeek();
        let toggleFunction = 'toggleActivity';
        if (activity.id === 'shadowing_practice') {
            toggleFunction = 'toggleShadowingDay';
        } else if (activity.id === 'weekly_speaking_prompt') {
            toggleFunction = 'togglePromptDay';
        } else if (activity.id === 'voice_journaling') {
            toggleFunction = 'toggleVoiceJournalingDay';
        }
        checkboxHtml = `
            <div class="shadowing-days">
                ${daysOfWeek.map((day, index) => {
                    const dateStr = day.date;
                    const isChecked = daysCompleted.includes(dateStr);
                    return `
                        <div class="day-box ${isChecked ? 'completed' : ''}" 
                             data-day="${dateStr}"
                             onclick="${toggleFunction}('${dateStr}', this)">
                            <span class="day-label">${day.label}</span>
                            ${isChecked ? '<span class="completed-mark">✓</span>' : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }
    
    // Build activity-specific content
    let activityContent = '';
    
    if (activity.id === 'voice_journaling') {
        // Voice Journaling: Show words
        const words = activityProgress?.words || [];
        const wordsList = Array.isArray(words) && words.length > 0
            ? words.map(w => {
                if (typeof w === 'string') return `<li>${escapeHtml(w)}</li>`;
                return `<li><strong>${escapeHtml(w.word || '')}</strong> <span class="word-pos">(${escapeHtml(w.part_of_speech || '')})</span></li>`;
            }).join('')
            : '<li class="no-content">No words generated yet</li>';
        
        activityContent = `
            <div class="activity-target-length">
                <strong>Target length:</strong> ${activity.target_length || '2-3 mins'}
            </div>
            <div class="words-section">
                <strong>Words to include:</strong>
                <ul class="words-list">${wordsList}</ul>
            </div>
        `;
    } else if (activity.id === 'shadowing_practice') {
        // Shadowing Practice: Show audio player, audio name, and script
        const audioName = activityProgress?.video_name || '';  // Using video_name field for audio name
        const audioUrl = activityProgress?.audio_url || '';
        const script = activityProgress?.script || '';
        const voiceName = activityProgress?.voice_name || '';
        const audioSpeed = activityProgress?.audio_speed || '';
        const scriptId = `script-${activity.id}-${currentWeek}`;
        const hasScript = script && script.trim() !== '';
        const hasAudio = audioUrl && audioUrl.trim() !== '';
        
        activityContent = `
            <div class="shadowing-audio-info">
                <div class="audio-name-section">
                    <strong>This week's audio:</strong>
                    ${hasAudio && (voiceName || audioSpeed) ? `
                        <div class="audio-metadata">
                            ${voiceName ? `Voice: ${escapeHtml(voiceName)}` : ''}${voiceName && audioSpeed ? ' • ' : ''}${audioSpeed ? `Speed: ${audioSpeed}x` : ''}
                        </div>
                    ` : ''}
                    ${hasAudio ? `
                        <audio controls style="width: 100%; margin-top: 0.5rem; margin-bottom: 0.5rem;">
                            <source src="/static/${audioUrl}?v=${Date.now()}" type="audio/wav">
                            Your browser does not support the audio element.
                        </audio>
                    ` : ''}
                    ${audioName ? `<div class="audio-name-text">${escapeHtml(audioName)}</div>` : ''}
                </div>
                <div class="audio-controls">
                    ${hasScript ? `
                        <div class="audio-generation-options">
                            <select id="voice-select-${currentWeek}" class="voice-select">
                                <option value="">Loading voices...</option>
                            </select>
                            <select id="speed-select-${currentWeek}" class="speed-select">
                                <option value="0.8">0.8x</option>
                                <option value="0.9">0.9x</option>
                                <option value="1.0" selected>1.0x</option>
                                <option value="1.1">1.1x</option>
                                <option value="1.2">1.2x</option>
                                <option value="1.3">1.3x</option>
                                <option value="1.4">1.4x</option>
                                <option value="1.5">1.5x</option>
                                <option value="1.6">1.6x</option>
                                <option value="1.7">1.7x</option>
                                <option value="1.8">1.8x</option>
                                <option value="1.9">1.9x</option>
                                <option value="2.0">2.0x</option>
                            </select>
                            <button class="generate-audio-btn ${hasAudio ? 'regenerate-audio-btn' : ''}" onclick="generateAudio('${currentWeek}', this)">
                                ${hasAudio ? 'Re-generate audio' : 'Generate audio'}
                            </button>
                        </div>
                    ` : ''}
                </div>
                <div class="script-section">
                    <div class="script-header" onclick="toggleScript('${scriptId}')">
                        <strong>Script:</strong>
                        <span class="script-toggle" id="toggle-${scriptId}">▼</span>
                    </div>
                    <div class="script-text ${hasScript ? 'script-collapsible' : ''}" id="${scriptId}" style="${hasScript ? 'display: none;' : ''}">${escapeHtml(script) || 'No script generated yet'}</div>
                </div>
            </div>
        `;
    } else if (activity.id === 'weekly_speaking_prompt') {
        // Weekly Speaking Prompt: Show prompt, words, and target length
        const prompt = activityProgress?.prompt || '';
        const words = activityProgress?.words || [];
        const wordsList = Array.isArray(words) && words.length > 0
            ? words.map(w => {
                if (typeof w === 'string') return `<li>${escapeHtml(w)}</li>`;
                return `<li><strong>${escapeHtml(w.word || '')}</strong> <span class="word-pos">(${escapeHtml(w.part_of_speech || '')})</span></li>`;
            }).join('')
            : '<li class="no-content">No words generated yet</li>';
        
        // Parse prompt to separate main question from hints
        let mainPrompt = prompt || 'No prompt generated yet';
        let hints = '';
        
        if (prompt && prompt.includes('Consider the following')) {
            const parts = prompt.split('Consider the following');
            mainPrompt = parts[0].trim();
            if (parts.length > 1) {
                hints = 'Consider the following' + parts[1];
            }
        }
        
        const hintsId = `hints-${activity.id}`;
        
        const notes = activityProgress?.notes || '';
        const notesId = `notes-${activity.id}-${currentWeek}`;
        
        activityContent = `
            <div class="prompt-section">
                <strong>Prompt:</strong>
                <div class="prompt-text">${escapeHtml(mainPrompt)}</div>
                ${hints ? `
                    <div class="hints-section">
                        <div class="hints-header" onclick="toggleScript('${hintsId}')">
                            <span class="hints-label">Hints</span>
                            <span class="script-toggle" id="toggle-${hintsId}">▶</span>
                        </div>
                        <div class="hints-content" id="${hintsId}" style="display: none;">
                            <pre class="hints-text">${escapeHtml(hints)}</pre>
                        </div>
                    </div>
                ` : ''}
                <div class="notes-section">
                    <label for="${notesId}"><strong>Your notes / brainstorming:</strong></label>
                    <textarea 
                        id="${notesId}" 
                        class="prompt-notes" 
                        placeholder="Write your thoughts, brainstorm ideas, or draft your response here..."
                        onblur="savePromptNotes('${currentWeek}', this.value)"
                    >${escapeHtml(notes)}</textarea>
                </div>
            </div>
            <div class="words-section">
                <strong>Words to include (5):</strong>
                <ul class="words-list">${wordsList}</ul>
            </div>
            <div class="activity-target-length">
                <strong>Target length:</strong> ${activity.target_length || '3-5 mins'}
            </div>
        `;
    }
    
    div.innerHTML = `
        <div class="activity-header">
            <h3>${activity.title}</h3>
        </div>
        ${activityContent}
        <div class="activity-actions">
            ${checkboxHtml}
        </div>
    `;
    
    return div;
}

// Get current progress for an activity
function getActivityProgress(activityId) {
    if (!progress || !progress.weeks || !progress.weeks[currentWeek]) {
        return null;
    }
    
    const weekData = progress.weeks[currentWeek];
    const activityData = weekData[activityId];
    
    // Handle migration: if voice_journaling is a boolean, return null (will be handled by ensure_week_exists)
    if (activityId === 'voice_journaling' && typeof activityData === 'boolean') {
        return null;
    }
    
    return activityData;
}

// Get days of current week (Sunday-Saturday) based on week key
function getDaysOfWeek() {
    if (!currentWeek) {
        // Fallback to current week if week key not available
        const today = new Date();
        const dayOfWeek = today.getDay();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - dayOfWeek);
        
        const days = [];
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        
        for (let i = 0; i < 7; i++) {
            const date = new Date(startOfWeek);
            date.setDate(startOfWeek.getDate() + i);
            const dateStr = date.toISOString().split('T')[0];
            const label = `${dayNames[i]} ${date.getDate()}`;
            days.push({ date: dateStr, label: label });
        }
        
        return days;
    }
    
    // Calculate Sunday of the week based on ISO week (which starts on Monday)
    // Parse week key (format: YYYY-WW)
    const [year, week] = currentWeek.split('-W');
    const weekNum = parseInt(week);
    
    // Get Monday of the ISO week
    const jan4 = new Date(year, 0, 4);
    const jan4Day = jan4.getDay() || 7; // Convert Sunday (0) to 7
    const mondayOfWeek1 = new Date(jan4);
    mondayOfWeek1.setDate(jan4.getDate() - jan4Day + 1);
    
    // Calculate Monday of the target ISO week
    const mondayOfTargetWeek = new Date(mondayOfWeek1);
    mondayOfTargetWeek.setDate(mondayOfWeek1.getDate() + (weekNum - 1) * 7);
    
    // Calculate Sunday (day before Monday) - this is the start of our week
    const sundayOfTargetWeek = new Date(mondayOfTargetWeek);
    sundayOfTargetWeek.setDate(mondayOfTargetWeek.getDate() - 1);
    
    const days = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    for (let i = 0; i < 7; i++) {
        const date = new Date(sundayOfTargetWeek);
        date.setDate(sundayOfTargetWeek.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        const label = `${dayNames[i]} ${date.getDate()}`;
        days.push({ date: dateStr, label: label });
    }
    
    return days;
}

// Toggle voice journaling day
async function toggleVoiceJournalingDay(dateStr, dayBox) {
    const isCurrentlyCompleted = dayBox.classList.contains('completed');
    const newCompletedState = !isCurrentlyCompleted;
    
    try {
        const response = await fetch('/api/progress', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                activity_id: 'voice_journaling',
                day: dateStr,
                completed: newCompletedState
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `HTTP error ${response.status}`;
            try {
                const errorData = JSON.parse(errorText);
                errorMessage = errorData.error || errorMessage;
            } catch (e) {
                errorMessage = errorText || errorMessage;
            }
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        if (data.success) {
            progress = data.progress;
            weeklySummary = data.weekly_summary;
            updateProgressSummary();
            
            // Update visual state
            const dayLabel = dayBox.querySelector('.day-label');
            if (newCompletedState) {
                dayBox.classList.add('completed');
                if (!dayBox.querySelector('.completed-mark')) {
                    const mark = document.createElement('span');
                    mark.className = 'completed-mark';
                    mark.textContent = '✓';
                    dayBox.appendChild(mark);
                }
            } else {
                dayBox.classList.remove('completed');
                const mark = dayBox.querySelector('.completed-mark');
                if (mark) mark.remove();
            }
        } else {
            throw new Error(data.error || 'Failed to update progress');
        }
    } catch (error) {
        console.error('Error updating progress:', error);
        showError(`Failed to save progress: ${error.message}`);
    }
}

// Toggle activity completion (legacy function, kept for backwards compatibility)
async function toggleActivity(activityId, checkbox) {
    const completed = checkbox.checked;
    
    try {
        const response = await fetch('/api/progress', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                activity_id: activityId,
                completed: completed
            })
        });
        
        const data = await response.json();
        if (data.success) {
            progress = data.progress;
            weeklySummary = data.weekly_summary;
            updateProgressSummary();
        } else {
            throw new Error('Failed to update progress');
        }
    } catch (error) {
        console.error('Error updating progress:', error);
        checkbox.checked = !completed; // Revert checkbox
        showError('Failed to save progress. Please try again.');
    }
}

// Toggle shadowing practice day
async function toggleShadowingDay(dateStr, dayBox) {
    const isCurrentlyCompleted = dayBox.classList.contains('completed');
    const newCompletedState = !isCurrentlyCompleted;
    
    try {
        const response = await fetch('/api/progress', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                activity_id: 'shadowing_practice',
                day: dateStr,
                completed: newCompletedState
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `HTTP error ${response.status}`;
            try {
                const errorData = JSON.parse(errorText);
                errorMessage = errorData.error || errorMessage;
            } catch (e) {
                errorMessage = errorText || errorMessage;
            }
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        if (data.success) {
            progress = data.progress;
            weeklySummary = data.weekly_summary;
            updateProgressSummary();
            
            // Update visual state
            const dayLabel = dayBox.querySelector('.day-label');
            if (newCompletedState) {
                dayBox.classList.add('completed');
                if (!dayBox.querySelector('.completed-mark')) {
                    const mark = document.createElement('span');
                    mark.className = 'completed-mark';
                    mark.textContent = '✓';
                    dayBox.appendChild(mark);
                }
            } else {
                dayBox.classList.remove('completed');
                const mark = dayBox.querySelector('.completed-mark');
                if (mark) mark.remove();
            }
        } else {
            throw new Error(data.error || 'Failed to update progress');
        }
    } catch (error) {
        console.error('Error updating progress:', error);
        showError(`Failed to save progress: ${error.message}`);
    }
}

// Toggle weekly speaking prompt day
async function togglePromptDay(dateStr, dayBox) {
    const isCurrentlyCompleted = dayBox.classList.contains('completed');
    const newCompletedState = !isCurrentlyCompleted;
    
    try {
        const response = await fetch('/api/progress', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                activity_id: 'weekly_speaking_prompt',
                day: dateStr,
                completed: newCompletedState
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `HTTP error ${response.status}`;
            try {
                const errorData = JSON.parse(errorText);
                errorMessage = errorData.error || errorMessage;
            } catch (e) {
                errorMessage = errorText || errorMessage;
            }
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        if (data.success) {
            progress = data.progress;
            weeklySummary = data.weekly_summary;
            updateProgressSummary();
            
            // Update visual state
            const dayLabel = dayBox.querySelector('.day-label');
            if (newCompletedState) {
                dayBox.classList.add('completed');
                if (!dayBox.querySelector('.completed-mark')) {
                    const mark = document.createElement('span');
                    mark.className = 'completed-mark';
                    mark.textContent = '✓';
                    dayBox.appendChild(mark);
                }
            } else {
                dayBox.classList.remove('completed');
                const mark = dayBox.querySelector('.completed-mark');
                if (mark) mark.remove();
            }
        } else {
            throw new Error(data.error || 'Failed to update progress');
        }
    } catch (error) {
        console.error('Error updating progress:', error);
        showError(`Failed to save progress: ${error.message}`);
    }
}

// Update video info (video name or summary)
async function updateVideoInfo(activityId, fieldName, value) {
    try {
        const response = await fetch('/api/activity-info', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                activity_id: activityId,
                field_name: fieldName,
                field_value: value
            })
        });
        
        const data = await response.json();
        if (data.success) {
            progress = data.progress;
        } else {
            throw new Error('Failed to update video info');
        }
    } catch (error) {
        console.error('Error updating video info:', error);
        showError('Failed to save video info. Please try again.');
    }
}

// Update prompt
async function updatePrompt(activityId, value) {
    try {
        const response = await fetch('/api/activity-info', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                activity_id: activityId,
                field_name: 'prompt',
                field_value: value
            })
        });
        
        const data = await response.json();
        if (data.success) {
            progress = data.progress;
        } else {
            throw new Error('Failed to update prompt');
        }
    } catch (error) {
        console.error('Error updating prompt:', error);
        showError('Failed to save prompt. Please try again.');
    }
}

// Save prompt notes
async function savePromptNotes(weekKey, notes) {
    try {
        const response = await fetch('/api/activity-info', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                activity_id: 'weekly_speaking_prompt',
                week_key: weekKey,
                field_name: 'notes',
                field_value: notes
            })
        });
        
        const data = await response.json();
        if (data.success) {
            progress = data.progress;
        } else {
            throw new Error('Failed to save notes');
        }
    } catch (error) {
        console.error('Error saving notes:', error);
        showError('Failed to save notes. Please try again.');
    }
}

// Show error message
function showError(message) {
    // Simple error display - could be enhanced with a toast notification
    alert(message);
}

// Toggle script visibility
function toggleScript(scriptId) {
    const scriptDiv = document.getElementById(scriptId);
    const toggleIcon = document.getElementById('toggle-' + scriptId);
    
    if (scriptDiv) {
        if (scriptDiv.style.display === 'none') {
            scriptDiv.style.display = 'block';
            if (toggleIcon) toggleIcon.textContent = '▼';
        } else {
            scriptDiv.style.display = 'none';
            if (toggleIcon) toggleIcon.textContent = '▶';
        }
    }
}

// Toggle sidebar visibility
function toggleSidebar() {
    const sidebar = document.getElementById('weekSidebar');
    
    if (sidebar) {
        if (sidebar.classList.contains('hidden')) {
            // Show sidebar
            sidebar.classList.remove('hidden');
        } else {
            // Collapse sidebar to narrow bar
            sidebar.classList.add('hidden');
        }
    }
}

// Generate audio from script using Typecast.ai
async function generateAudio(weekKey, buttonElement) {
    if (!weekKey) weekKey = currentWeek;
    
    const button = buttonElement || document.querySelector(`.generate-audio-btn`);
    const wasRegenerating = button && button.textContent.includes('Re-generate');
    
    // Get selected voice and speed
    const voiceSelect = document.getElementById(`voice-select-${weekKey}`);
    const speedSelect = document.getElementById(`speed-select-${weekKey}`);
    const voiceId = voiceSelect ? voiceSelect.value : null;
    const speed = speedSelect ? parseFloat(speedSelect.value) : 1.0;
    
    if (button) {
        button.disabled = true;
        button.textContent = wasRegenerating ? '⏳ Re-generating audio...' : '⏳ Generating audio...';
    }
    
    try {
        const response = await fetch('/api/generate-audio', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                week_key: weekKey,
                voice_id: voiceId,
                speed: speed
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            progress = data.progress;
            
            // Reload the current week to show new audio player
            await loadWeek(weekKey);
            
            // Force reload the audio player with cache-busting after a brief delay
            setTimeout(() => {
                const audioElement = document.querySelector('audio');
                if (audioElement) {
                    const sourceElement = audioElement.querySelector('source');
                    if (sourceElement) {
                        const currentSrc = sourceElement.src;
                        const baseSrc = currentSrc.split('?')[0];
                        sourceElement.src = baseSrc + '?v=' + Date.now();
                        audioElement.load(); // Force reload the audio
                    }
                }
            }, 100);
            
            if (button) {
                button.disabled = false;
                button.textContent = 'Re-generate audio';
            }
            
            showError('Audio generated successfully!');
        } else {
            throw new Error(data.error || 'Failed to generate audio');
        }
    } catch (error) {
        console.error('Error generating audio:', error);
        showError(`Failed to generate audio: ${error.message}`);
        if (button) {
            button.disabled = false;
            // Restore original button text based on whether audio existed before
            const hadAudio = progress?.weeks?.[weekKey]?.shadowing_practice?.audio_url;
            button.textContent = hadAudio ? 'Re-generate audio' : 'Generate audio';
        }
    }
}

// Generate all weekly content using ChatGPT
async function generateAllContent() {
    const button = document.getElementById('generateAllBtn');
    if (!button) {
        console.error('Generate button not found');
        return;
    }
    
    const originalText = button.textContent;
    
    // Show loading state
    button.disabled = true;
    button.textContent = '⏳ Generating...';
    
    try {
        if (!currentWeek) {
            throw new Error('No current week selected');
        }
        
        const response = await fetch('/api/generate-all', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                week_key: currentWeek
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            progress = data.progress;
            
            // Force reload the current week to show new content
            // Add timestamp to force refresh
            await loadWeek(currentWeek + '?t=' + Date.now());
            
            // Small delay to ensure DOM updates
            setTimeout(() => {
                // Restore button state
                button.disabled = false;
                button.textContent = originalText;
                
                // Show success message
                showError('Week content regenerated successfully!');
            }, 100);
        } else {
            throw new Error(data.error || 'Failed to generate content');
        }
    } catch (error) {
        console.error('Error generating content:', error);
        showError(`Failed to generate content: ${error.message}`);
        button.disabled = false;
        button.textContent = originalText;
    }
}

// Load a specific week
async function loadWeek(weekKey) {
    try {
        // Remove cache-busting parameter if present
        const cleanWeekKey = weekKey.split('?')[0];
        
        // Reload full progress structure first to get all weeks (with cache busting)
        const progressResponse = await fetch('/api/progress?t=' + Date.now());
        const progressData = await progressResponse.json();
        progress = progressData.progress;
        
        // Load the specific week (with cache busting)
        const response = await fetch(`/api/week/${cleanWeekKey}?t=` + Date.now());
        const weekData = await response.json();
        
        currentWeek = weekData.week_key;
        progress.weeks = progress.weeks || {};
        progress.weeks[cleanWeekKey] = weekData.progress;
        weeklySummary = weekData.summary;
        
        // Force re-render
        renderPage();
        updateWeekList();
        
        // Update voice dropdowns after rendering
        updateVoiceDropdowns();
    } catch (error) {
        console.error('Error loading week:', error);
        showError('Failed to load week. Please try again.');
    }
}

// Get all available weeks from progress (only current week and future weeks)
function getAllWeeks() {
    if (!progress || !progress.weeks) return [];
    
    // Get current week using Sunday-Saturday format
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentWeekNum = getSundayWeek(today);
    const currentWeekKey = `${currentYear}-W${currentWeekNum.toString().padStart(2, '0')}`;
    
    // Parse current week for comparison
    const [currentY, currentW] = currentWeekKey.split('-W');
    const currentYearNum = parseInt(currentY);
    const currentWeekNumParsed = parseInt(currentW);
    
    // Filter to show only current week and future weeks
    const allWeeks = Object.keys(progress.weeks);
    const validWeeks = allWeeks.filter(weekKey => {
        const [year, week] = weekKey.split('-W');
        const yearNum = parseInt(year);
        const weekNum = parseInt(week);
        
        // If same year, check if week is current or future
        if (yearNum === currentYearNum) {
            return weekNum >= currentWeekNumParsed; // Only current week and future
        }
        // If different year, include only future years
        return yearNum > currentYearNum;
    });
    
    return validWeeks.sort(); // Oldest to newest
}

// Format week key for display
function formatWeekKeyForDisplay(weekKey) {
    const [year, week] = weekKey.split('-W');
    return `Week ${parseInt(week)}, ${year}`;
}

// Get week date range for display (Sunday-Saturday format)
function getWeekDateRange(weekKey) {
    const [year, week] = weekKey.split('-W');
    const weekNum = parseInt(week);
    
    // Find the first Sunday of the year (Sunday-Saturday week format)
    const jan1 = new Date(year, 0, 1);
    // Convert JS getDay() to Python weekday() format, then calculate days to first Sunday
    const pythonWeekday = jan1.getDay() === 0 ? 6 : jan1.getDay() - 1;
    const daysToSunday = (6 - pythonWeekday) % 7;
    const firstSunday = new Date(jan1);
    firstSunday.setDate(jan1.getDate() + daysToSunday);
    
    // Calculate Sunday of the target week (weeks are 1-indexed)
    const sundayOfTargetWeek = new Date(firstSunday);
    sundayOfTargetWeek.setDate(firstSunday.getDate() + (weekNum - 1) * 7);
    
    // Calculate Saturday (6 days after Sunday)
    const saturdayOfTargetWeek = new Date(sundayOfTargetWeek);
    saturdayOfTargetWeek.setDate(sundayOfTargetWeek.getDate() + 6);
    
    // Format dates in PST
    const sundayStr = sundayOfTargetWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' });
    const saturdayStr = saturdayOfTargetWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' });
    
    return `${sundayStr} - ${saturdayStr}`;
}

// Update week list in sidebar
function updateWeekList() {
    const weekList = document.getElementById('weekList');
    if (!weekList) return;
    
    const weeks = getAllWeeks();
    weekList.innerHTML = '';
    
    if (weeks.length === 0) {
        weekList.innerHTML = '<p style="color: #7f8c8d; font-size: 0.85rem; text-align: center; padding: 1rem;">No weeks available</p>';
        return;
    }
    
    // Get current week from backend using Sunday-Saturday format
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentWeekNum = getSundayWeek(today);
    const actualCurrentWeek = `${currentYear}-W${currentWeekNum.toString().padStart(2, '0')}`;
    
    weeks.forEach(weekKey => {
        const weekItem = document.createElement('div');
        weekItem.className = 'week-item';
        weekItem.id = `week-item-${weekKey}`;
        
        if (weekKey === currentWeek) {
            weekItem.classList.add('active');
        }
        
        if (weekKey === actualCurrentWeek) {
            weekItem.classList.add('current-week');
        }
        
        const weekLabel = document.createElement('div');
        weekLabel.className = 'week-label';
        weekLabel.textContent = formatWeekKeyForDisplay(weekKey);
        
        const weekRange = document.createElement('div');
        weekRange.className = 'week-range';
        weekRange.textContent = getWeekDateRange(weekKey);
        
        weekItem.appendChild(weekLabel);
        weekItem.appendChild(weekRange);
        
        weekItem.onclick = () => selectWeek(weekKey);
        
        weekList.appendChild(weekItem);
    });
}

// Scroll to current week in the week list
function scrollToCurrentWeek() {
    // Reload progress to get actual current week
    fetch('/api/progress')
        .then(response => response.json())
        .then(data => {
            const actualCurrentWeek = data.current_week;
            const weekItem = document.getElementById(`week-item-${actualCurrentWeek}`);
            const weekList = document.getElementById('weekList');
            
            if (weekItem && weekList) {
                // Scroll the week item into view with some offset
                weekItem.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                    inline: 'nearest'
                });
            }
        })
        .catch(error => {
            console.error('Error fetching current week:', error);
        });
}

// Helper function to get Sunday-Saturday week number
function getSundayWeek(date) {
    // Convert to PST
    const pstDate = new Date(date.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
    
    // Find the first Sunday of the year
    const jan1 = new Date(pstDate.getFullYear(), 0, 1);
    const daysToSunday = (7 - jan1.getDay()) % 7;
    const firstSunday = new Date(jan1);
    firstSunday.setDate(jan1.getDate() + daysToSunday);
    
    // If date is before first Sunday, it belongs to last week of previous year
    if (pstDate < firstSunday) {
        const dec31 = new Date(pstDate.getFullYear() - 1, 11, 31);
        return getSundayWeek(dec31);
    }
    
    // Calculate weeks since first Sunday
    const daysSince = Math.floor((pstDate - firstSunday) / (24 * 60 * 60 * 1000));
    const weekNum = Math.floor(daysSince / 7) + 1;
    
    return weekNum;
}

// Get week key from string (e.g., "2024-W45")
function parseWeekKey(weekString) {
    const parts = weekString.split('-W');
    if (parts.length === 2) {
        return { year: parseInt(parts[0]), week: parseInt(parts[1]) };
    }
    return null;
}

// Generate week key from year and week
function formatWeekKey(year, week) {
    return `${year}-W${week.toString().padStart(2, '0')}`;
}

// Get next or previous week key
function getAdjacentWeek(weekKey, direction) {
    const parsed = parseWeekKey(weekKey);
    if (!parsed) return null;
    
    let { year, week: weekNum } = parsed;
    
    if (direction === 'next') {
        weekNum += 1;
        // Handle week overflow
        if (weekNum > 53) {
            weekNum = 1;
            year += 1;
        }
    } else { // prev
        weekNum -= 1;
        // Handle week underflow
        if (weekNum < 1) {
            weekNum = 53;
            year -= 1;
        }
    }
    
    return formatWeekKey(year, weekNum);
}

// Navigate to previous/next week
async function navigateWeek(direction) {
    const weeks = getAllWeeks();
    
    // Calculate adjacent week
    const adjacentWeek = getAdjacentWeek(currentWeek, direction);
    if (!adjacentWeek) return;
    
    // Load the adjacent week (will be created if it doesn't exist)
    await loadWeek(adjacentWeek);
}

// Select week from dropdown
async function selectWeek(weekKey) {
    if (!weekKey) return;
    await loadWeek(weekKey);
}

// Go to current week
async function goToCurrentWeek() {
    try {
        // Reload full progress structure first to get all weeks and actual current week
        const progressResponse = await fetch('/api/progress');
        const progressData = await progressResponse.json();
        progress = progressData.progress;
        
        // Get the actual current week key from the backend
        const actualCurrentWeek = progressData.current_week;
        
        // Load that specific week to ensure we're showing the correct week
        await loadWeek(actualCurrentWeek);
        
        // Scroll to current week in the sidebar
        setTimeout(() => {
            scrollToCurrentWeek();
        }, 100); // Small delay to ensure DOM is updated
    } catch (error) {
        console.error('Error loading current week:', error);
        showError('Failed to load current week. Please try again.');
    }
}

// Load available voices from Typecast.ai
let availableVoices = [];

async function loadVoices() {
    // Check if voices are already cached in localStorage
    const cachedVoices = localStorage.getItem('typecast_voices');
    const cacheTimestamp = localStorage.getItem('typecast_voices_timestamp');
    const cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours
    
    // Use cached voices if they exist and are less than 24 hours old
    if (cachedVoices && cacheTimestamp) {
        const age = Date.now() - parseInt(cacheTimestamp);
        if (age < cacheExpiry) {
            try {
                availableVoices = JSON.parse(cachedVoices);
                console.log(`Loaded ${availableVoices.length} voices from cache`);
                updateVoiceDropdowns();
                return;
            } catch (e) {
                console.warn('Failed to parse cached voices, fetching fresh data');
            }
        }
    }
    
    // Fetch voices from API
    try {
        const response = await fetch('/api/voices');
        const data = await response.json();
        
        if (data.success && data.voices && data.voices.length > 0) {
            availableVoices = data.voices;
            
            // Cache the voices in localStorage
            localStorage.setItem('typecast_voices', JSON.stringify(availableVoices));
            localStorage.setItem('typecast_voices_timestamp', Date.now().toString());
            
            console.log(`Loaded ${availableVoices.length} voices from API (cached for 24h)`);
            updateVoiceDropdowns();
        } else {
            console.warn('No voices returned from API');
            updateVoiceDropdowns();
        }
    } catch (error) {
        console.error('Error loading voices:', error);
        updateVoiceDropdowns();
    }
}

function updateVoiceDropdowns() {
    const voiceSelects = document.querySelectorAll('.voice-select');
    
    voiceSelects.forEach(select => {
        const currentValue = select.value;
        
        // Clear existing options
        select.innerHTML = '';
        
        if (availableVoices.length === 0) {
            select.innerHTML = '<option value="">No voices available</option>';
            return;
        }
        
        // Add voice options
        availableVoices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.voice_id;
            option.textContent = voice.name || voice.voice_id;
            select.appendChild(option);
        });
        
        // Restore previous selection if it exists
        if (currentValue && Array.from(select.options).some(opt => opt.value === currentValue)) {
            select.value = currentValue;
        } else {
            // Default to Dylan if available
            const dylanOption = Array.from(select.options).find(opt => 
                opt.textContent === 'Dylan'
            );
            if (dylanOption) {
                select.value = dylanOption.value;
            } else {
                // Fallback to first voice if Dylan not found
                select.selectedIndex = 0;
            }
        }
    });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    updateWeekList();
    await loadVoices();  // Load voices after initial data
});


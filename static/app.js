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

// Helper function to normalize script text (remove leading whitespace from each line)
function normalizeScriptText(text) {
    if (!text) return '';
    // Split by lines, remove leading whitespace from each line, then rejoin
    return text.split('\n').map(line => line.trimStart()).join('\n').trim();
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
    
    // Load recordings for all activities
    loadAllRecordings();
    
    // Populate OpenAI voice dropdowns after rendering
    setTimeout(() => {
        document.querySelectorAll('select[id*="voice-select-openai-"]').forEach(select => {
            if (select.options.length <= 1 || select.options[0].textContent === 'Loading voices...') {
                populateOpenAIVoiceDropdown(select.id);
            }
        });
    }, 100);
    
    // Set up audio controls for weekly expressions
    setTimeout(() => {
        setupAllWeeklyExpressionsAudioControls();
    }, 200);
    
    // Set up audio controls for shadowing practice
    setTimeout(() => {
        setupAllShadowingAudioControls();
    }, 200);
    
    // Update podcast voice info after voices are loaded
    setTimeout(() => {
        updatePodcastVoiceInfo();
    }, 500);
}

// Update today's date display
function updateTodayDate() {
    const todayDateElement = document.getElementById('todayDate');
    if (!todayDateElement) return;
    
    // Get the days of the current week
    const daysOfWeek = getDaysOfWeek();
    const today = new Date();
    
    // Format today's date in local timezone (what the user sees)
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayDateStr = `${year}-${month}-${day}`;
    
    // Find today's index in the week - compare with local date only
    let todayIndex = -1;
    daysOfWeek.forEach((day, index) => {
        if (day.date === todayDateStr) {
            todayIndex = index;
        }
    });
    
    // Create visual progress bar
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const progressBarHtml = `
        <div class="week-progress-bar">
            ${daysOfWeek.map((day, index) => {
                const isToday = day.date === todayDateStr;
                const dayName = dayNames[index];
                // Parse date string (YYYY-MM-DD) directly to avoid timezone issues
                const [yearStr, monthStr, dayStr] = day.date.split('-');
                const dayNum = parseInt(dayStr, 10);
                const monthIndex = parseInt(monthStr, 10) - 1;
                const monthName = monthNames[monthIndex];
                const dateLabel = `${monthName} ${dayNum}`;
                
                return `
                    <div class="week-progress-day ${isToday ? 'today' : ''}" 
                         style="flex: 1; position: relative;">
                        <div class="week-progress-segment" 
                             style="background: ${isToday ? '#4a90e2' : index < todayIndex ? '#2ecc71' : '#e0e0e0'}; 
                                    height: ${isToday ? '8px' : '4px'}; 
                                    border-radius: 2px;
                                    margin-bottom: 4px;
                                    transition: all 0.3s;">
                        </div>
                        <div class="week-progress-label" 
                             style="font-size: 0.75rem; 
                                    color: ${isToday ? '#4a90e2' : '#666'}; 
                                    font-weight: ${isToday ? 'bold' : 'normal'};
                                    text-align: center;">
                            <div>${dayName}</div>
                            <div style="font-size: 0.7rem; margin-top: 2px;">${dateLabel}</div>
                        </div>
                        ${isToday ? '<div class="today-indicator" style="position: absolute; top: -8px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 6px solid #4a90e2;"></div>' : ''}
                    </div>
                `;
            }).join('')}
        </div>
    `;
    
    todayDateElement.innerHTML = progressBarHtml;
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
    if (activity.id === 'weekly_expressions' || activity.id === 'voice_journaling' || activity.id === 'shadowing_practice' || activity.id === 'weekly_speaking_prompt' || activity.id === 'podcast_shadowing') {
        // Special handling for daily activities (weekly expressions, voice journaling, shadowing practice, and weekly speaking prompt)
        const daysCompleted = activityProgress?.completed_days || [];
        const daysOfWeek = getDaysOfWeek();
        let toggleFunction = 'toggleActivity';
        if (activity.id === 'weekly_expressions') {
            toggleFunction = 'toggleWeeklyExpressionsDay';
        } else if (activity.id === 'podcast_shadowing') {
            toggleFunction = 'togglePodcastShadowingDay';
        } else if (activity.id === 'shadowing_practice') {
            toggleFunction = 'toggleShadowingDay';
        } else if (activity.id === 'weekly_speaking_prompt') {
            toggleFunction = 'togglePromptDay';
        } else if (activity.id === 'voice_journaling') {
            toggleFunction = 'toggleVoiceJournalingDay';
        }
        
        // Helper function to check if a day is completed and get MP3 file (for weekly_expressions)
        const getCompletedDayInfo = (dateStr) => {
            for (const entry of daysCompleted) {
                if (typeof entry === 'string' && entry === dateStr) {
                    return { completed: true, mp3_file: null };
                } else if (typeof entry === 'object' && entry.day === dateStr) {
                    return { completed: true, mp3_file: entry.mp3_file || null };
                }
            }
            return { completed: false, mp3_file: null };
        };
        
        checkboxHtml = `
            <div class="shadowing-days">
                ${daysOfWeek.map((day, index) => {
                    const dateStr = day.date;
                    const dayId = dateStr.replace(/-/g, '_');
                    const dayInfo = activity.id === 'weekly_expressions' 
                        ? getCompletedDayInfo(dateStr)
                        : { completed: daysCompleted.includes(dateStr), mp3_file: null };
                    const isChecked = dayInfo.completed;
                    const mp3File = dayInfo.mp3_file;
                    return `
                        <div class="day-container">
                            <div class="day-box ${isChecked ? 'completed' : ''}" 
                                 data-day="${dateStr}"
                                 onclick="toggleRecordingUI('${activity.id}', '${dateStr}', event)">
                                <span class="day-label">${day.label}</span>
                                <div class="day-actions">
                                    ${isChecked ? `<span class="completed-mark">✓</span>` : ''}
                                </div>
                            </div>
                            <div id="${activity.id}_recording_ui_${dayId}" class="recording-ui" style="display: none;" data-activity="${activity.id}" data-day="${dateStr}" data-day-index="${index}">
                                ${activity.id === 'voice_journaling' ? `<div class="daily-topic" id="${activity.id}_topic_${dayId}"></div>` : ''}
                                ${activity.id !== 'weekly_expressions' ? `
                                <div class="recording-controls">
                                    <button id="${activity.id}_record_${dayId}" class="record-btn" onclick="startRecording('${activity.id}', '${dateStr}'); event.stopPropagation();">🎤 Record</button>
                                    <button id="${activity.id}_stop_${dayId}" class="stop-btn" onclick="stopRecording(); event.stopPropagation();" style="display: none;">⏹ Stop</button>
                                    <span id="${activity.id}_timer_${dayId}" class="recording-timer" style="display: none;">00:00</span>
                                </div>
                                <div id="${activity.id}_visualizer_${dayId}" class="recording-visualizer" style="display: none;">
                                    <canvas id="${activity.id}_canvas_${dayId}" width="400" height="60"></canvas>
                                </div>
                                <div id="${activity.id}_recordings_${dayId}" class="recordings-list"></div>
                                ` : ''}
                                ${activity.id === 'weekly_expressions' ? `
                                <div class="notes-section" style="margin-top: 15px;">
                                    <label for="${activity.id}_notes_${dayId}"><strong>Dictation/notes</strong></label>
                                    <textarea 
                                        id="${activity.id}_notes_${dayId}" 
                                        class="prompt-notes" 
                                        placeholder="Add your notes here..."
                                        style="min-height: 100px;"
                                    ></textarea>
                                </div>
                                ${isChecked && mp3File ? `
                                <div class="completed-mp3-info" style="margin-top: 10px; padding: 8px; background-color: #f0f0f0; border-radius: 4px; font-size: 0.85rem; color: #666;">
                                    <strong>Completed with:</strong> ${escapeHtml(mp3File)}
                                </div>
                                ` : ''}
                                ` : ''}
                                <div class="recording-controls-secondary">
                                    <button id="${activity.id}_complete_${dayId}" 
                                            class="complete-btn ${isChecked ? 'completed' : ''}"
                                            onclick="${toggleFunction}('${dateStr}', this); event.stopPropagation();">
                                        ${isChecked ? '✓ Completed' : 'Mark as completed'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }
    
    // Build activity-specific content
    let activityContent = '';
    
    if (activity.id === 'weekly_expressions') {
        // Weekly Expressions: Show audio player (MP3 is automatically assigned based on week)
        const selectedMp3 = (activityProgress && activityProgress.mp3_file) ? activityProgress.mp3_file : '';
        
        activityContent = `
            <div class="weekly-expressions-content">
                <div class="audio-player-section" id="weekly-expressions-audio-section-${currentWeek}">
                    ${selectedMp3 ? `
                        <div class="audio-player-label" style="margin-bottom: 8px; font-weight: bold;">${escapeHtml(selectedMp3)}</div>
                        <div class="audio-player-container">
                            <div class="audio-player-with-options">
                                <div class="audio-player-wrapper-custom">
                                    <audio id="audio-player-weekly-expressions-${currentWeek}" data-week="${currentWeek}">
                                        <source src="/api/weekly-expressions/mp3/${encodeURIComponent(selectedMp3)}" type="audio/mpeg">
                                        Your browser does not support the audio element.
                                    </audio>
                                    <div class="custom-audio-controls" id="controls-weekly-expressions-${currentWeek}">
                                        <button class="play-pause-btn" onclick="toggleWeeklyExpressionsPlayPause('${currentWeek}')">▶</button>
                                        <button class="skip-btn" onclick="skipWeeklyExpressionsAudio('${currentWeek}', -5)" title="Rewind 5 seconds">
                                            <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
                                                <path d="M11 3L5 8l6 5V3z"/>
                                                <path d="M3 3h2v10H3V3z"/>
                                            </svg>
                                        </button>
                                        <button class="skip-btn" onclick="skipWeeklyExpressionsAudio('${currentWeek}', 5)" title="Forward 5 seconds">
                                            <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
                                                <path d="M5 3l6 5-6 5V3z"/>
                                                <path d="M11 3h2v10h-2V3z"/>
                                            </svg>
                                        </button>
                                        <div class="progress-bar-container" onclick="seekWeeklyExpressionsAudio('${currentWeek}', event)">
                                            <div class="progress-bar" id="progress-weekly-expressions-${currentWeek}"></div>
                                            <div class="progress-playhead" id="playhead-weekly-expressions-${currentWeek}"></div>
                                        </div>
                                        <span class="time-display" id="time-weekly-expressions-${currentWeek}">0:00 / 0:00</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div style="display: flex; gap: 8px; justify-content: flex-start; flex-wrap: wrap; margin-top: 10px;">
                            <button class="speed-btn" onclick="setWeeklyExpressionsSpeed('${currentWeek}', '1.0')" data-speed="1.0" style="padding: 6px 16px; border: 1px solid #4a90e2; border-radius: 4px; background: #4a90e2; color: #fff; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; min-width: 65px; width: 65px; text-align: center; box-sizing: border-box;">1.0x</button>
                            <button class="speed-btn" onclick="setWeeklyExpressionsSpeed('${currentWeek}', '1.2')" data-speed="1.2" style="padding: 6px 16px; border: 1px solid #ddd; border-radius: 4px; background: #fff; color: #333; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; min-width: 65px; width: 65px; text-align: center; box-sizing: border-box;">1.2x</button>
                            <button class="speed-btn" onclick="setWeeklyExpressionsSpeed('${currentWeek}', '1.4')" data-speed="1.4" style="padding: 6px 16px; border: 1px solid #ddd; border-radius: 4px; background: #fff; color: #333; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; min-width: 65px; width: 65px; text-align: center; box-sizing: border-box;">1.4x</button>
                            <button class="speed-btn" onclick="setWeeklyExpressionsSpeed('${currentWeek}', '1.6')" data-speed="1.6" style="padding: 6px 16px; border: 1px solid #ddd; border-radius: 4px; background: #fff; color: #333; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; min-width: 65px; width: 65px; text-align: center; box-sizing: border-box;">1.6x</button>
                        </div>
                    ` : '<div class="no-mp3-selected" style="padding: 10px; background: #f0f0f0; border-radius: 4px; color: #666;">MP3 file will be automatically assigned for this week.</div>'}
                </div>
            </div>
        `;
    } else if (activity.id === 'voice_journaling') {
        // Voice Journaling: Just show target length, topics shown per-day
        activityContent = `
            <div class="activity-target-length">
                <strong>Target length</strong> ${activity.target_length || '2-3 mins'}
            </div>
        `;
    } else if (activity.id === 'shadowing_practice') {
        // Shadowing Practice: Show tabs for two scripts, audio players for each
        const audioName = activityProgress?.video_name || '';  // Using video_name field for audio name
        const script1 = activityProgress?.script1 || activityProgress?.script || '';
        const script2 = activityProgress?.script2 || '';
        
        // Audio URLs and timestamps for Script 1
        const script1TypecastUrl = activityProgress?.script1_typecast_url || activityProgress?.audio_typecast_url || activityProgress?.audio_url || '';
        const script1OpenaiUrl = activityProgress?.script1_openai_url || activityProgress?.audio_openai_url || '';
        const script1TypecastTimestamps = activityProgress?.script1_typecast_timestamps || activityProgress?.typecast_timestamps || [];
        const script1OpenaiTimestamps = activityProgress?.script1_openai_timestamps || activityProgress?.openai_timestamps || [];
        
        // Audio URLs and timestamps for Script 2
        const script2TypecastUrl = activityProgress?.script2_typecast_url || '';
        const script2OpenaiUrl = activityProgress?.script2_openai_url || '';
        const script2TypecastTimestamps = activityProgress?.script2_typecast_timestamps || [];
        const script2OpenaiTimestamps = activityProgress?.script2_openai_timestamps || [];
        
        const voiceName = activityProgress?.voice_name || '';
        const audioSpeed = activityProgress?.audio_speed || '';
        
        // Get settings for each audio source
        const script1TypecastVoice = activityProgress?.script1_typecast_voice || '';
        const script1TypecastModel = activityProgress?.script1_typecast_model || '';
        const script1TypecastSpeed = activityProgress?.script1_typecast_speed || '';
        const script1OpenaiVoice = activityProgress?.script1_openai_voice || '';
        const script1OpenaiSpeed = activityProgress?.script1_openai_speed || '';
        
        const script2TypecastVoice = activityProgress?.script2_typecast_voice || '';
        const script2TypecastModel = activityProgress?.script2_typecast_model || '';
        const script2TypecastSpeed = activityProgress?.script2_typecast_speed || '';
        const script2OpenaiVoice = activityProgress?.script2_openai_voice || '';
        const script2OpenaiSpeed = activityProgress?.script2_openai_speed || '';
        
        // Helper function to get voice name from voice ID
        const getVoiceNameFromId = (voiceId) => {
            if (!voiceId) return '';
            // Check if it's already a name (doesn't start with 'tc_')
            if (!voiceId.startsWith('tc_')) {
                return voiceId;
            }
            // Try to find voice name from availableVoices
            if (availableVoices && availableVoices.length > 0) {
                const voice = availableVoices.find(v => v.voice_id === voiceId || v.id === voiceId);
                if (voice) {
                    return voice.name || voice.voice_name || voiceId;
                }
            }
            // Fallback: return ID if name not found
            return voiceId;
        };
        
        // Helper function to format voice and model label (for display below player)
        const formatVoiceModelLabel = (voice, model) => {
            if (!voice && !model) return '';
            const parts = [];
            if (voice) {
                // Convert voice ID to name if needed
                const voiceName = getVoiceNameFromId(voice);
                parts.push(voiceName);
            }
            if (model) {
                const modelDisplay = model === 'ssfm-v21' ? 'SSFM v21' : (model === 'ssfm-v30' ? 'SSFM v30' : model);
                parts.push(modelDisplay);
            }
            return parts.join(', ');
        };
        
        const hasScript1 = script1 && script1.trim() !== '';
        const hasScript2 = script2 && script2.trim() !== '';
        const hasTypecastAudio1 = script1TypecastUrl && script1TypecastUrl.trim() !== '';
        const hasAudio1 = hasTypecastAudio1;
        const hasTypecastAudio2 = script2TypecastUrl && script2TypecastUrl.trim() !== '';
        const hasAudio2 = hasTypecastAudio2;
        
        // Get saved script tab selection, default to 1
        const savedScriptNum = parseInt(localStorage.getItem(`shadowing_script_${currentWeek}`)) || 1;
        const activeScriptNum = (savedScriptNum === 2 && hasScript2) ? 2 : 1;
        const script1Active = activeScriptNum === 1 ? 'active' : '';
        const script2Active = activeScriptNum === 2 ? 'active' : '';
        const tab1Active = activeScriptNum === 1 ? 'active' : '';
        const tab2Active = activeScriptNum === 2 ? 'active' : '';
        
        activityContent = `
            <div class="shadowing-audio-info">
                <!-- Tabs for switching between scripts -->
                <div class="script-tabs">
                    <button class="script-tab ${tab1Active}" onclick="switchScript('${currentWeek}', 1); event.stopPropagation();" id="tab-${currentWeek}-1">Script 1</button>
                    ${hasScript2 ? `<button class="script-tab ${tab2Active}" onclick="switchScript('${currentWeek}', 2); event.stopPropagation();" id="tab-${currentWeek}-2">Script 2</button>` : ''}
                </div>
                
                <!-- Script 1 Content -->
                <div class="script-content ${script1Active}" id="script-${currentWeek}-1">
                    <div class="script-display">${escapeHtml(script1) || 'No script generated yet'}</div>
                    ${hasAudio1 ? `
                    <div class="audio-player-section">
                            ${script1TypecastUrl ? `
                                <div class="audio-player-container">
                        <div class="audio-player-with-options">
                                        <div class="audio-player-wrapper-custom">
                                            <audio id="audio-player-typecast-${currentWeek}-1" data-week="${currentWeek}" data-script="1" data-source="typecast">
                                                <source src="/static/${script1TypecastUrl}?v=${Date.now()}" type="audio/wav">
                                Your browser does not support the audio element.
                            </audio>
                                            <div class="custom-audio-controls" id="controls-typecast-${currentWeek}-1">
                                                <button class="play-pause-btn" onclick="togglePlayPause('typecast', '${currentWeek}', 1)">▶</button>
                                                <button class="skip-btn" onclick="skipShadowingAudio('typecast', '${currentWeek}', 1, -5)" title="Rewind 5 seconds">
                                                    <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
                                                        <path d="M11 3L5 8l6 5V3z"/>
                                                        <path d="M3 3h2v10H3V3z"/>
                                                    </svg>
                                                </button>
                                                <button class="skip-btn" onclick="skipShadowingAudio('typecast', '${currentWeek}', 1, 5)" title="Forward 5 seconds">
                                                    <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
                                                        <path d="M5 3l6 5-6 5V3z"/>
                                                        <path d="M11 3h2v10h-2V3z"/>
                                                    </svg>
                                                </button>
                                                <div class="progress-bar-container" onclick="seekAudio('typecast', '${currentWeek}', 1, event)">
                                                    <div class="progress-bar" id="progress-typecast-${currentWeek}-1"></div>
                                                    <div class="progress-playhead" id="playhead-typecast-${currentWeek}-1"></div>
                        </div>
                                                <span class="time-display" id="time-typecast-${currentWeek}-1">0:00 / 0:00</span>
                                            </div>
                                        </div>
                                        <button class="audio-more-options-btn" onclick="toggleAudioRegenOptions('${currentWeek}', 1, 'typecast', event); event.stopPropagation();" title="Audio options">⋮</button>
                                        <div class="audio-regen-dropdown" id="audio-regen-${currentWeek}-1" style="display: none;">
                                            <div class="audio-regen-controls">
                                                ${formatVoiceModelLabel(script1TypecastVoice, script1TypecastModel) ? `
                                                    <div class="audio-info-item" id="shadowing-voice-info-dropdown-${currentWeek}-1">
                                                        <strong>Voice:</strong> ${escapeHtml(formatVoiceModelLabel(script1TypecastVoice, script1TypecastModel))}
                                                    </div>
                                                ` : ''}
                                                <div class="audio-option-section">
                                                    <a href="/static/${script1TypecastUrl}" class="download-audio-link" download onclick="event.stopPropagation();" title="Download audio">
                                                        <span>⬇</span> Download
                                                    </a>
                                                </div>
                                                <div class="audio-option-divider"></div>
                                                <label><strong>Re-generate Typecast audio</strong></label>
                                                <select id="voice-select-regen-${currentWeek}-1" class="voice-select-compact">
                                                    <option value="">Loading voices...</option>
                                                </select>
                                                <select id="model-select-regen-${currentWeek}-1" class="model-select-compact" style="display: none;">
                                                    <option value="ssfm-v21" selected>SSFM v21</option>
                                                </select>
                                                <select id="speed-select-regen-${currentWeek}-1" class="speed-select-compact">
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
                                                <button class="regen-btn-compact" onclick="generateAudioForScript('${currentWeek}', 1, this, 'typecast'); event.stopPropagation();">
                                                    Re-generate
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ` : ''}
                            ${false && script1OpenaiUrl ? `
                                <div class="audio-player-container">
                                    <div class="audio-player-label">OpenAI${script1OpenaiVoice ? ` (Voice: ${script1OpenaiVoice.charAt(0).toUpperCase() + script1OpenaiVoice.slice(1)})` : ''}</div>
                                    <div class="audio-player-with-options">
                                        <div class="audio-player-wrapper-custom">
                                            <audio id="audio-player-openai-${currentWeek}-1" data-week="${currentWeek}" data-script="1" data-source="openai">
                                                <source src="/static/${script1OpenaiUrl}?v=${Date.now()}" type="audio/mpeg">
                                                Your browser does not support the audio element.
                                            </audio>
                                            <div class="custom-audio-controls" id="controls-openai-${currentWeek}-1">
                                                <button class="play-pause-btn" onclick="togglePlayPause('openai', '${currentWeek}', 1)">▶</button>
                                                <button class="skip-btn" onclick="skipShadowingAudio('openai', '${currentWeek}', 1, -5)" title="Rewind 5 seconds">
                                                    <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
                                                        <path d="M11 3L5 8l6 5V3z"/>
                                                        <path d="M3 3h2v10H3V3z"/>
                                                    </svg>
                                                </button>
                                                <button class="skip-btn" onclick="skipShadowingAudio('openai', '${currentWeek}', 1, 5)" title="Forward 5 seconds">
                                                    <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
                                                        <path d="M5 3l6 5-6 5V3z"/>
                                                        <path d="M11 3h2v10h-2V3z"/>
                                                    </svg>
                                                </button>
                                                <div class="progress-bar-container" onclick="seekAudio('openai', '${currentWeek}', 1, event)">
                                                    <div class="progress-bar" id="progress-openai-${currentWeek}-1"></div>
                                                    <div class="progress-playhead" id="playhead-openai-${currentWeek}-1"></div>
                                                </div>
                                                <span class="time-display" id="time-openai-${currentWeek}-1">0:00 / 0:00</span>
                                            </div>
                                        </div>
                                        <button class="audio-more-options-btn" onclick="toggleAudioRegenOptions('${currentWeek}', 1, 'openai', event); event.stopPropagation();" title="Audio options">⋮</button>
                                        <div class="audio-regen-dropdown" id="audio-regen-openai-${currentWeek}-1" style="display: none;">
                            <div class="audio-regen-controls">
                                                <div class="audio-option-section">
                                                    <a href="/static/${script1OpenaiUrl}" class="download-audio-link" download onclick="event.stopPropagation();" title="Download audio">
                                                        <span>⬇</span> Download
                                                    </a>
                                                </div>
                                                <div class="audio-option-divider"></div>
                                                <label><strong>Re-generate OpenAI audio</strong></label>
                                                <select id="voice-select-regen-openai-${currentWeek}-1" class="voice-select-compact">
                                    <option value="">Loading voices...</option>
                                </select>
                                                <select id="speed-select-regen-openai-${currentWeek}-1" class="speed-select-compact">
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
                                                <button class="regen-btn-compact" onclick="generateAudioForScript('${currentWeek}', 1, this, 'openai'); event.stopPropagation();">
                                    Re-generate
                                </button>
                            </div>
                        </div>
                                    </div>
                                </div>
                            ` : ''}
                            <div style="display: flex; gap: 8px; justify-content: flex-start; flex-wrap: wrap; margin-top: 10px;">
                                <button class="speed-btn" onclick="setShadowingTypecastSpeed('${currentWeek}', 1, '0.9')" data-speed="0.9" style="padding: 6px 16px; border: 1px solid #ddd; border-radius: 4px; background: #fff; color: #333; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; min-width: 65px; width: 65px; text-align: center; box-sizing: border-box;">0.9x</button>
                                <button class="speed-btn" onclick="setShadowingTypecastSpeed('${currentWeek}', 1, '1.0')" data-speed="1.0" style="padding: 6px 16px; border: 1px solid #4a90e2; border-radius: 4px; background: #4a90e2; color: #fff; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; min-width: 65px; width: 65px; text-align: center; box-sizing: border-box;">1.0x</button>
                                <button class="speed-btn" onclick="setShadowingTypecastSpeed('${currentWeek}', 1, '1.1')" data-speed="1.1" style="padding: 6px 16px; border: 1px solid #ddd; border-radius: 4px; background: #fff; color: #333; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; min-width: 65px; width: 65px; text-align: center; box-sizing: border-box;">1.1x</button>
                                <button class="speed-btn" onclick="setShadowingTypecastSpeed('${currentWeek}', 1, '1.2')" data-speed="1.2" style="padding: 6px 16px; border: 1px solid #ddd; border-radius: 4px; background: #fff; color: #333; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; min-width: 65px; width: 65px; text-align: center; box-sizing: border-box;">1.2x</button>
                            </div>
                        </div>
                    ` : ''}
                    
                    <!-- Audio generation for Script 1 (shown when audio is missing) -->
                    ${!hasTypecastAudio1 ? `
                    <div class="audio-generation-section">
                        <div class="audio-generation-header">
                            <strong>Generate Audio</strong>
                        </div>
                            
                            ${!hasTypecastAudio1 ? `
                            <!-- Typecast Settings -->
                            <div class="audio-source-settings">
                                <label class="source-label"><strong>Typecast</strong></label>
                        <div class="audio-generation-options">
                                    <select id="voice-select-typecast-${currentWeek}-1" class="voice-select" ${!hasScript1 ? 'disabled' : ''}>
                                <option value="">Loading voices...</option>
                            </select>
                                    <select id="model-select-typecast-${currentWeek}-1" class="model-select" ${!hasScript1 ? 'disabled' : ''} style="display: none;">
                                        <option value="ssfm-v21" selected>SSFM v21</option>
                                    </select>
                                    <select id="speed-select-typecast-${currentWeek}-1" class="speed-select" ${!hasScript1 ? 'disabled' : ''}>
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
                                </div>
                            </div>
                            ` : ''}
                            
                            
                            <div class="audio-generation-actions">
                                <button class="generate-audio-btn" onclick="generateAudioForScript('${currentWeek}', 1, this)" ${!hasScript1 ? 'disabled' : ''} style="min-width: 120px;">
                                    Generate ${!hasTypecastAudio1 ? 'Typecast' : ''}
                            </button>
                        </div>
                    </div>
                    ` : ''}
                </div>
                
                <!-- Script 2 Content -->
                ${hasScript2 ? `
                    <div class="script-content ${script2Active}" id="script-${currentWeek}-2">
                        <div class="script-display">${escapeHtml(script2)}</div>
                        ${hasAudio2 ? `
                            <div class="audio-player-section">
                                ${script2TypecastUrl ? `
                                    <div class="audio-player-container">
                                        <div class="audio-player-with-options">
                                            <div class="audio-player-wrapper-custom">
                                                <audio id="audio-player-typecast-${currentWeek}-2" data-week="${currentWeek}" data-script="2" data-source="typecast">
                                                    <source src="/static/${script2TypecastUrl}?v=${Date.now()}" type="audio/wav">
                                                    Your browser does not support the audio element.
                                                </audio>
                                                <div class="custom-audio-controls" id="controls-typecast-${currentWeek}-2">
                                                    <button class="play-pause-btn" onclick="togglePlayPause('typecast', '${currentWeek}', 2)">▶</button>
                                                    <button class="skip-btn" onclick="skipShadowingAudio('typecast', '${currentWeek}', 2, -5)" title="Rewind 5 seconds">
                                                        <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
                                                            <path d="M11 3L5 8l6 5V3z"/>
                                                            <path d="M3 3h2v10H3V3z"/>
                                                        </svg>
                                                    </button>
                                                    <button class="skip-btn" onclick="skipShadowingAudio('typecast', '${currentWeek}', 2, 5)" title="Forward 5 seconds">
                                                        <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
                                                            <path d="M5 3l6 5-6 5V3z"/>
                                                            <path d="M11 3h2v10h-2V3z"/>
                                                        </svg>
                                                    </button>
                                                    <div class="progress-bar-container" onclick="seekAudio('typecast', '${currentWeek}', 2, event)">
                                                        <div class="progress-bar" id="progress-typecast-${currentWeek}-2"></div>
                                                        <div class="progress-playhead" id="playhead-typecast-${currentWeek}-2"></div>
                                                    </div>
                                                    <span class="time-display" id="time-typecast-${currentWeek}-2">0:00 / 0:00</span>
                                                </div>
                                            </div>
                                            <button class="audio-more-options-btn" onclick="toggleAudioRegenOptions('${currentWeek}', 2, 'typecast', event); event.stopPropagation();" title="Audio options">⋮</button>
                                            <div class="audio-regen-dropdown" id="audio-regen-${currentWeek}-2" style="display: none;">
                                                <div class="audio-regen-controls">
                                                    ${formatVoiceModelLabel(script2TypecastVoice, script2TypecastModel) ? `
                                                        <div class="audio-info-item" id="shadowing-voice-info-dropdown-${currentWeek}-2">
                                                            <strong>Voice:</strong> ${escapeHtml(formatVoiceModelLabel(script2TypecastVoice, script2TypecastModel))}
                                                        </div>
                                                    ` : ''}
                                                    <div class="audio-option-section">
                                                        <a href="/static/${script2TypecastUrl}" class="download-audio-link" download onclick="event.stopPropagation();" title="Download audio">
                                                            <span>⬇</span> Download
                                                        </a>
                                                    </div>
                                                    <div class="audio-option-divider"></div>
                                                    <label><strong>Re-generate Typecast audio</strong></label>
                                                    <select id="voice-select-regen-${currentWeek}-2" class="voice-select-compact">
                                                        <option value="">Loading voices...</option>
                                                    </select>
                                                    <select id="model-select-regen-${currentWeek}-2" class="model-select-compact" style="display: none;">
                                                        <option value="ssfm-v21" selected>SSFM v21</option>
                                                    </select>
                                                    <select id="speed-select-regen-${currentWeek}-2" class="speed-select-compact">
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
                                                    <button class="regen-btn-compact" onclick="generateAudioForScript('${currentWeek}', 2, this, 'typecast'); event.stopPropagation();">
                                                        Re-generate
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                ` : ''}
                                ${false && script2OpenaiUrl ? `
                                    <div class="audio-player-container">
                                        <div class="audio-player-label">OpenAI${script2OpenaiVoice ? ` (Voice: ${script2OpenaiVoice.charAt(0).toUpperCase() + script2OpenaiVoice.slice(1)})` : ''}</div>
                                        <div class="audio-player-with-options">
                                            <div class="audio-player-wrapper-custom">
                                                <audio id="audio-player-openai-${currentWeek}-2" data-week="${currentWeek}" data-script="2" data-source="openai">
                                                    <source src="/static/${script2OpenaiUrl}?v=${Date.now()}" type="audio/mpeg">
                                                    Your browser does not support the audio element.
                                                </audio>
                                                <div class="custom-audio-controls" id="controls-openai-${currentWeek}-2">
                                                    <button class="play-pause-btn" onclick="togglePlayPause('openai', '${currentWeek}', 2)">▶</button>
                                                    <button class="skip-btn" onclick="skipShadowingAudio('openai', '${currentWeek}', 2, -5)" title="Rewind 5 seconds">
                                                        <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
                                                            <path d="M11 3L5 8l6 5V3z"/>
                                                            <path d="M3 3h2v10H3V3z"/>
                                                        </svg>
                                                    </button>
                                                    <button class="skip-btn" onclick="skipShadowingAudio('openai', '${currentWeek}', 2, 5)" title="Forward 5 seconds">
                                                        <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
                                                            <path d="M5 3l6 5-6 5V3z"/>
                                                            <path d="M11 3h2v10h-2V3z"/>
                                                        </svg>
                                                    </button>
                                                    <div class="progress-bar-container" onclick="seekAudio('openai', '${currentWeek}', 2, event)">
                                                        <div class="progress-bar" id="progress-openai-${currentWeek}-2"></div>
                                                        <div class="progress-playhead" id="playhead-openai-${currentWeek}-2"></div>
                                                    </div>
                                                    <span class="time-display" id="time-openai-${currentWeek}-2">0:00 / 0:00</span>
                                                </div>
                                            </div>
                                            <button class="audio-more-options-btn" onclick="toggleAudioRegenOptions('${currentWeek}', 2, 'openai', event); event.stopPropagation();" title="Audio options">⋮</button>
                                            <div class="audio-regen-dropdown" id="audio-regen-openai-${currentWeek}-2" style="display: none;">
                                                <div class="audio-regen-controls">
                                                    <div class="audio-option-section">
                                                        <a href="/static/${script2OpenaiUrl}" class="download-audio-link" download onclick="event.stopPropagation();" title="Download audio">
                                                            <span>⬇</span> Download
                                                        </a>
                                                    </div>
                                                    <div class="audio-option-divider"></div>
                                                    <label><strong>Re-generate OpenAI audio</strong></label>
                                                    <select id="voice-select-regen-openai-${currentWeek}-2" class="voice-select-compact">
                                                        <option value="">Loading voices...</option>
                                                    </select>
                                                    <select id="speed-select-regen-openai-${currentWeek}-2" class="speed-select-compact">
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
                                                    <button class="regen-btn-compact" onclick="generateAudioForScript('${currentWeek}', 2, this, 'openai'); event.stopPropagation();">
                                                        Re-generate
                                                    </button>
                                                </div>
                                            </div>
                                    </div>
                                </div>
                                ` : ''}
                            <div style="display: flex; gap: 8px; justify-content: flex-start; flex-wrap: wrap; margin-top: 10px;">
                                <button class="speed-btn" onclick="setShadowingTypecastSpeed('${currentWeek}', 2, '0.9')" data-speed="0.9" style="padding: 6px 16px; border: 1px solid #ddd; border-radius: 4px; background: #fff; color: #333; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; min-width: 65px; width: 65px; text-align: center; box-sizing: border-box;">0.9x</button>
                                <button class="speed-btn" onclick="setShadowingTypecastSpeed('${currentWeek}', 2, '1.0')" data-speed="1.0" style="padding: 6px 16px; border: 1px solid #4a90e2; border-radius: 4px; background: #4a90e2; color: #fff; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; min-width: 65px; width: 65px; text-align: center; box-sizing: border-box;">1.0x</button>
                                <button class="speed-btn" onclick="setShadowingTypecastSpeed('${currentWeek}', 2, '1.1')" data-speed="1.1" style="padding: 6px 16px; border: 1px solid #ddd; border-radius: 4px; background: #fff; color: #333; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; min-width: 65px; width: 65px; text-align: center; box-sizing: border-box;">1.1x</button>
                                <button class="speed-btn" onclick="setShadowingTypecastSpeed('${currentWeek}', 2, '1.2')" data-speed="1.2" style="padding: 6px 16px; border: 1px solid #ddd; border-radius: 4px; background: #fff; color: #333; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; min-width: 65px; width: 65px; text-align: center; box-sizing: border-box;">1.2x</button>
                            </div>
                        </div>
                        ` : ''}
                        
                        <!-- Audio generation for Script 2 (shown when audio is missing) -->
                        ${!hasTypecastAudio2 ? `
                            <div class="audio-generation-section">
                                <div class="audio-generation-header">
                                    <strong>Generate Audio</strong>
                                </div>
                                
                                ${!hasTypecastAudio2 ? `
                                <!-- Typecast Settings -->
                                <div class="audio-source-settings">
                                    <label class="source-label"><strong>Typecast</strong></label>
                                    <div class="audio-generation-options">
                                        <select id="voice-select-typecast-${currentWeek}-2" class="voice-select" ${!hasScript2 ? 'disabled' : ''}>
                                            <option value="">Loading voices...</option>
                                        </select>
                                        <select id="model-select-typecast-${currentWeek}-2" class="model-select" ${!hasScript2 ? 'disabled' : ''} style="display: none;">
                                            <option value="ssfm-v21" selected>SSFM v21</option>
                                        </select>
                                        <select id="speed-select-typecast-${currentWeek}-2" class="speed-select" ${!hasScript2 ? 'disabled' : ''}>
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
                                    </div>
                                </div>
                                ` : ''}
                                
                                
                                <div class="audio-generation-actions">
                                    <button class="generate-audio-btn" onclick="generateAudioForScript('${currentWeek}', 2, this)" ${!hasScript2 ? 'disabled' : ''} style="min-width: 120px;">
                                        Generate ${!hasTypecastAudio2 ? 'Typecast' : ''}
                                    </button>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        `;
    } else if (activity.id === 'podcast_shadowing') {
        // Podcast Shadowing: Show transcript script and audio player
        const selectedMp3 = (activityProgress && activityProgress.mp3_file) ? activityProgress.mp3_file : '';
        const episodeName = (activityProgress && activityProgress.episode_name) ? activityProgress.episode_name : '';
        const chapterName = (activityProgress && activityProgress.chapter_name) ? activityProgress.chapter_name : '';
        const transcriptPath = (activityProgress && activityProgress.transcript_path) ? activityProgress.transcript_path : '';
        const typecastAudioUrl = (activityProgress && activityProgress.typecast_audio_url) ? activityProgress.typecast_audio_url : '';
        const typecastVoice = (activityProgress && activityProgress.typecast_voice) ? activityProgress.typecast_voice : '';
        const typecastSpeed = (activityProgress && activityProgress.typecast_speed) ? activityProgress.typecast_speed : 1.0;
        const typecastModel = (activityProgress && activityProgress.typecast_model) ? activityProgress.typecast_model : 'ssfm-v30';
        const hasTypecastAudio = typecastAudioUrl && typecastAudioUrl.trim() !== '';
        
        // Helper function to get voice name from voice ID (for podcast)
        const getPodcastVoiceNameFromId = (voiceId) => {
            if (!voiceId) return '';
            // Check if it's already a name (doesn't start with 'tc_')
            if (!voiceId.startsWith('tc_')) {
                return voiceId;
            }
            // Try to find voice name from availableVoices
            if (availableVoices && availableVoices.length > 0) {
                const voice = availableVoices.find(v => v.voice_id === voiceId || v.id === voiceId);
                if (voice) {
                    return voice.name || voice.voice_name || voiceId;
                }
            }
            // Fallback: return ID if name not found
            return voiceId;
        };
        
        // Format voice and model label for podcast
        const formatPodcastVoiceModelLabel = (voice, model) => {
            if (!voice && !model) return '';
            const parts = [];
            if (voice) {
                const voiceName = getPodcastVoiceNameFromId(voice);
                parts.push(voiceName);
            }
            if (model) {
                const modelDisplay = model === 'ssfm-v21' ? 'SSFM v21' : (model === 'ssfm-v30' ? 'SSFM v30' : model);
                parts.push(modelDisplay);
            }
            return parts.join(', ');
        };
        
        // Display format: "[Episode name] - [Chapter name]" or fallback to filename
        const displayLabel = (episodeName && chapterName) 
            ? `${escapeHtml(episodeName)} - ${escapeHtml(chapterName)}`
            : (selectedMp3 ? escapeHtml(selectedMp3) : '');
        
        activityContent = `
            <div class="shadowing-audio-info">
                ${selectedMp3 && displayLabel ? `
                    <!-- Title Section -->
                    <div class="audio-player-label" style="margin-bottom: 12px; font-weight: bold; font-size: 1.05em;">${displayLabel}</div>
                ` : ''}
                <!-- Script/Transcript Section -->
                <div class="script-content active">
                    <div class="script-display" id="podcast-shadowing-transcript-${currentWeek}">
                        ${transcriptPath ? '<div style="color: #999; font-style: italic;">Loading transcript...</div>' : 'No transcript available'}
                    </div>
                </div>
                <!-- Audio Player Section with Dropdown -->
                <div style="margin-top: 2rem;">
                    <!-- Audio Source Dropdown -->
                    <div style="margin-bottom: 1rem;">
                        <select id="podcast-audio-source-${currentWeek}" onchange="switchPodcastAudioSource('${currentWeek}', this.value)" style="padding: 0.5rem 1rem; font-size: 0.95rem; border: 1px solid #ddd; border-radius: 4px; background-color: white; cursor: pointer;">
                            <option value="1">Podcast</option>
                            <option value="2">Typecast</option>
                        </select>
                    </div>
                    <!-- Podcast Audio Player Content -->
                    <div class="script-content active podcast-audio-content" id="podcast-script-${currentWeek}-1">
                        ${selectedMp3 ? `
                        <div class="audio-player-section" id="podcast-shadowing-audio-section-${currentWeek}">
                            <div class="audio-player-container">
                                <!-- Spacer to match Typecast label height -->
                                <div class="audio-player-label" style="visibility: hidden;">Placeholder</div>
                                <div class="audio-player-with-options">
                                    <div class="audio-player-wrapper-custom">
                                        <audio id="audio-player-podcast-shadowing-${currentWeek}" data-week="${currentWeek}">
                                            <source src="/api/podcast-shadowing/mp3/${encodeURIComponent(selectedMp3)}" type="audio/mpeg">
                                            Your browser does not support the audio element.
                                        </audio>
                                        <div class="custom-audio-controls" id="controls-podcast-shadowing-${currentWeek}">
                                            <button class="play-pause-btn" onclick="togglePodcastShadowingPlayPause('${currentWeek}')">▶</button>
                                            <button class="skip-btn" onclick="skipPodcastShadowingAudio('${currentWeek}', -5)" title="Rewind 5 seconds">
                                                <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
                                                    <path d="M11 3L5 8l6 5V3z"/>
                                                    <path d="M3 3h2v10H3V3z"/>
                                                </svg>
                                            </button>
                                            <button class="skip-btn" onclick="skipPodcastShadowingAudio('${currentWeek}', 5)" title="Forward 5 seconds">
                                                <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
                                                    <path d="M5 3l6 5-6 5V3z"/>
                                                    <path d="M11 3h2v10h-2V3z"/>
                                                </svg>
                                            </button>
                                            <div class="progress-bar-container" onclick="seekPodcastShadowingAudio('${currentWeek}', event)">
                                                <div class="progress-bar" id="progress-podcast-shadowing-${currentWeek}"></div>
                                                <div class="progress-playhead" id="playhead-podcast-shadowing-${currentWeek}"></div>
                                            </div>
                                            <span class="time-display" id="time-podcast-shadowing-${currentWeek}">0:00 / 0:00</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div style="display: flex; gap: 8px; justify-content: flex-start; flex-wrap: wrap; margin-top: 10px;">
                                <button class="speed-btn" onclick="setPodcastShadowingSpeed('${currentWeek}', '0.85')" data-speed="0.85" style="padding: 6px 16px; border: 1px solid #ddd; border-radius: 4px; background: #fff; color: #333; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; min-width: 65px; width: 65px; text-align: center; box-sizing: border-box;">0.85x</button>
                                <button class="speed-btn" onclick="setPodcastShadowingSpeed('${currentWeek}', '0.9')" data-speed="0.9" style="padding: 6px 16px; border: 1px solid #ddd; border-radius: 4px; background: #fff; color: #333; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; min-width: 65px; width: 65px; text-align: center; box-sizing: border-box;">0.9x</button>
                                <button class="speed-btn" onclick="setPodcastShadowingSpeed('${currentWeek}', '0.95')" data-speed="0.95" style="padding: 6px 16px; border: 1px solid #ddd; border-radius: 4px; background: #fff; color: #333; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; min-width: 65px; width: 65px; text-align: center; box-sizing: border-box;">0.95x</button>
                                <button class="speed-btn" onclick="setPodcastShadowingSpeed('${currentWeek}', '1.0')" data-speed="1.0" style="padding: 6px 16px; border: 1px solid #4a90e2; border-radius: 4px; background: #4a90e2; color: #fff; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; min-width: 65px; width: 65px; text-align: center; box-sizing: border-box;">1.0x</button>
                            </div>
                        </div>
                        ` : '<div class="no-mp3-selected" style="padding: 10px; background: #f0f0f0; border-radius: 4px; color: #666;">MP3 file will be automatically assigned for this week.</div>'}
                    </div>
                    <!-- Typecast Audio Player Content -->
                    <div class="script-content podcast-audio-content" id="podcast-script-${currentWeek}-2">
                        ${hasTypecastAudio ? `
                        <div class="audio-player-section">
                            <div class="audio-player-container">
                                <div class="audio-player-with-options">
                                    <div class="audio-player-wrapper-custom">
                                        <audio id="audio-player-typecast-podcast-${currentWeek}" data-week="${currentWeek}" data-source="typecast">
                                            <source src="/static/${typecastAudioUrl}?v=${Date.now()}" type="audio/wav">
                                            Your browser does not support the audio element.
                                        </audio>
                                        <div class="custom-audio-controls" id="controls-typecast-podcast-${currentWeek}">
                                            <button class="play-pause-btn" onclick="togglePodcastTypecastPlayPause('${currentWeek}')">▶</button>
                                            <button class="skip-btn" onclick="skipPodcastTypecastAudio('${currentWeek}', -5)" title="Rewind 5 seconds">
                                                <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
                                                    <path d="M11 3L5 8l6 5V3z"/>
                                                    <path d="M3 3h2v10H3V3z"/>
                                                </svg>
                                            </button>
                                            <button class="skip-btn" onclick="skipPodcastTypecastAudio('${currentWeek}', 5)" title="Forward 5 seconds">
                                                <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
                                                    <path d="M5 3l6 5-6 5V3z"/>
                                                    <path d="M11 3h2v10h-2V3z"/>
                                                </svg>
                                            </button>
                                            <div class="progress-bar-container" onclick="seekPodcastTypecastAudio('${currentWeek}', event)">
                                                <div class="progress-bar" id="progress-typecast-podcast-${currentWeek}"></div>
                                                <div class="progress-playhead" id="playhead-typecast-podcast-${currentWeek}"></div>
                                            </div>
                                            <span class="time-display" id="time-typecast-podcast-${currentWeek}">0:00 / 0:00</span>
                                        </div>
                                    </div>
                                    <button class="audio-more-options-btn" onclick="togglePodcastTypecastRegenOptions('${currentWeek}', event); event.stopPropagation();" title="Audio options">⋮</button>
                                    <div class="audio-regen-dropdown" id="audio-regen-podcast-typecast-${currentWeek}" style="display: none;">
                                        <div class="audio-regen-controls">
                                            ${formatPodcastVoiceModelLabel(typecastVoice, typecastModel) ? `
                                                <div class="audio-info-item" id="podcast-voice-info-dropdown-${currentWeek}">
                                                    <strong>Voice:</strong> ${escapeHtml(formatPodcastVoiceModelLabel(typecastVoice, typecastModel))}
                                                </div>
                                            ` : ''}
                                            <div class="audio-option-section">
                                                <a href="/static/${typecastAudioUrl}" class="download-audio-link" download onclick="event.stopPropagation();" title="Download audio">
                                                    <span>⬇</span> Download
                                                </a>
                                            </div>
                                            <div class="audio-option-divider"></div>
                                            <label><strong>Re-generate Typecast audio</strong></label>
                                            <select id="voice-select-regen-podcast-${currentWeek}" class="voice-select-compact">
                                                <option value="">Loading voices...</option>
                                            </select>
                                            <select id="model-select-regen-podcast-${currentWeek}" class="model-select-compact">
                                                <option value="ssfm-v21" ${typecastModel === 'ssfm-v21' ? 'selected' : ''}>SSFM v21</option>
                                                <option value="ssfm-v30" ${typecastModel === 'ssfm-v30' ? 'selected' : ''}>SSFM v30</option>
                                            </select>
                                            <select id="speed-select-regen-podcast-${currentWeek}" class="speed-select-compact">
                                                <option value="0.8" ${typecastSpeed === 0.8 ? 'selected' : ''}>0.8x</option>
                                                <option value="0.9" ${typecastSpeed === 0.9 ? 'selected' : ''}>0.9x</option>
                                                <option value="1.0" ${typecastSpeed === 1.0 ? 'selected' : ''}>1.0x</option>
                                                <option value="1.1" ${typecastSpeed === 1.1 ? 'selected' : ''}>1.1x</option>
                                                <option value="1.2" ${typecastSpeed === 1.2 ? 'selected' : ''}>1.2x</option>
                                                <option value="1.3" ${typecastSpeed === 1.3 ? 'selected' : ''}>1.3x</option>
                                                <option value="1.4" ${typecastSpeed === 1.4 ? 'selected' : ''}>1.4x</option>
                                                <option value="1.5" ${typecastSpeed === 1.5 ? 'selected' : ''}>1.5x</option>
                                                <option value="1.6" ${typecastSpeed === 1.6 ? 'selected' : ''}>1.6x</option>
                                                <option value="1.7" ${typecastSpeed === 1.7 ? 'selected' : ''}>1.7x</option>
                                                <option value="1.8" ${typecastSpeed === 1.8 ? 'selected' : ''}>1.8x</option>
                                                <option value="1.9" ${typecastSpeed === 1.9 ? 'selected' : ''}>1.9x</option>
                                                <option value="2.0" ${typecastSpeed === 2.0 ? 'selected' : ''}>2.0x</option>
                                            </select>
                                            <button class="regen-btn-compact" onclick="generatePodcastTypecastAudio('${currentWeek}', this); event.stopPropagation();">
                                                Re-generate
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div style="display: flex; gap: 8px; justify-content: flex-start; flex-wrap: wrap; margin-top: 10px;">
                                <button class="speed-btn" onclick="setPodcastTypecastSpeed('${currentWeek}', '0.85')" data-speed="0.85" style="padding: 6px 16px; border: 1px solid #ddd; border-radius: 4px; background: #fff; color: #333; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; min-width: 65px; width: 65px; text-align: center; box-sizing: border-box;">0.85x</button>
                                <button class="speed-btn" onclick="setPodcastTypecastSpeed('${currentWeek}', '0.9')" data-speed="0.9" style="padding: 6px 16px; border: 1px solid #ddd; border-radius: 4px; background: #fff; color: #333; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; min-width: 65px; width: 65px; text-align: center; box-sizing: border-box;">0.9x</button>
                                <button class="speed-btn" onclick="setPodcastTypecastSpeed('${currentWeek}', '0.95')" data-speed="0.95" style="padding: 6px 16px; border: 1px solid #ddd; border-radius: 4px; background: #fff; color: #333; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; min-width: 65px; width: 65px; text-align: center; box-sizing: border-box;">0.95x</button>
                                <button class="speed-btn" onclick="setPodcastTypecastSpeed('${currentWeek}', '1.0')" data-speed="1.0" style="padding: 6px 16px; border: 1px solid #4a90e2; border-radius: 4px; background: #4a90e2; color: #fff; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; min-width: 65px; width: 65px; text-align: center; box-sizing: border-box;">1.0x</button>
                            </div>
                        </div>
                        ` : `
                        <div class="audio-player-section">
                            <div class="audio-generation-options">
                                <label><strong>Generate Typecast Audio</strong></label>
                                <select id="voice-select-podcast-${currentWeek}" class="voice-select">
                                    <option value="">Loading voices...</option>
                                </select>
                                <select id="model-select-podcast-${currentWeek}" class="model-select">
                                    <option value="ssfm-v21">SSFM v21</option>
                                    <option value="ssfm-v30" selected>SSFM v30</option>
                                </select>
                                <select id="speed-select-podcast-${currentWeek}" class="speed-select">
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
                                <button class="generate-audio-btn" onclick="generatePodcastTypecastAudio('${currentWeek}', this)" ${!transcriptPath ? 'disabled' : ''} style="min-width: 120px;">
                                    Generate
                                </button>
                            </div>
                        </div>
                        `}
                    </div>
                </div>
            </div>
        `;
        if (transcriptPath && selectedMp3) {
            setTimeout(() => loadPodcastShadowingTranscript(currentWeek), 100);
        }
        if (hasTypecastAudio) {
            setTimeout(() => {
                setupPodcastTypecastAudioControls(currentWeek);
                loadVoicesForPodcastTypecast(currentWeek);
            }, 200);
        } else if (transcriptPath) {
            setTimeout(() => loadVoicesForPodcastTypecast(currentWeek), 200);
        }
        setTimeout(() => {
            const savedSource = localStorage.getItem(`podcast_audio_source_${currentWeek}`);
            if (savedSource) {
                const dropdown = document.getElementById(`podcast-audio-source-${currentWeek}`);
                if (dropdown) {
                    dropdown.value = savedSource;
                    switchPodcastAudioSource(currentWeek, savedSource);
                }
            }
        }, 100);
        setTimeout(() => {
            const audioElement = document.getElementById(`audio-player-podcast-shadowing-${currentWeek}`);
            if (audioElement) {
                const currentSpeed = parseFloat(localStorage.getItem(`podcast_shadowing_speed_${currentWeek}`)) || 1.0;
                setupPodcastShadowingAudioControls(currentWeek, currentSpeed);
                updatePodcastShadowingSpeedButtonStyles(currentWeek, currentSpeed);
            }
        }, 200);
    } else if (activity.id === 'weekly_speaking_prompt') {
        // Weekly Speaking Prompt: Show prompt with hints and notes
        const prompt = activityProgress?.prompt || '';
        
        // Parse prompt to separate main question from hints
        let mainPrompt = prompt || 'No prompt generated yet';
        let hints = '';
        
        // Check for various hint indicators
        const hintIndicators = [
            'Consider the following hints',
            'Consider the following',
            'Hints for structuring',
            'The following hints'
        ];
        
        let hintSplitIndex = -1;
        let hintIndicator = '';
        
        for (const indicator of hintIndicators) {
            const index = prompt.indexOf(indicator);
            if (index !== -1) {
                hintSplitIndex = index;
                hintIndicator = indicator;
                break;
            }
        }
        
        if (hintSplitIndex !== -1) {
            mainPrompt = prompt.substring(0, hintSplitIndex).trim();
            hints = prompt.substring(hintSplitIndex).trim();
        }
        
        const hintsId = `hints-${activity.id}`;
        
        const notes = activityProgress?.notes || '';
        const notesId = `notes-${activity.id}-${currentWeek}`;
        
        activityContent = `
            <div class="prompt-section">
                <div class="prompt-text"><span class="prompt-indicator">"</span>${escapeHtml(mainPrompt)}</div>
                ${hints ? `
                    <div class="hints-section">
                        <div class="hints-header" onclick="toggleScript('${hintsId}')">
                            <span class="hints-label">Hints</span>
                            <span class="script-toggle" id="toggle-${hintsId}">▶</span>
                        </div>
                        <div class="hints-content" id="${hintsId}" style="display: none;">
                            <div class="hints-text">${escapeHtml(hints)}</div>
                        </div>
                    </div>
                ` : ''}
                <div class="notes-section">
                    <label for="${notesId}"><strong>Your notes / brainstorming</strong></label>
                    <textarea 
                        id="${notesId}" 
                        class="prompt-notes" 
                        placeholder="Write your thoughts, brainstorm ideas, or draft your response here... (Auto-saved)"
                        onblur="savePromptNotes('${currentWeek}')"
                    >${escapeHtml(notes)}</textarea>
                </div>
            </div>
        `;
    }
    
    // Add kebab menu button for re-generate
    const hasContent = (activity.id === 'voice_journaling' && activityProgress?.topics?.length > 0) ||
                       (activity.id === 'shadowing_practice' && (activityProgress?.script1 || activityProgress?.script)) ||
                       (activity.id === 'weekly_speaking_prompt' && activityProgress?.prompt) ||
                       (activity.id === 'weekly_expressions' && activityProgress?.mp3_file) ||
                       (activity.id === 'podcast_shadowing' && activityProgress?.mp3_file);
    
    // Always show kebab menu for activities that can be generated individually (except voice_journaling)
    // Voice journaling is typically generated with all activities, so only show button when content exists
    const showKebabMenu = activity.id === 'voice_journaling' ? hasContent : true;
    
    div.innerHTML = `
        <div class="activity-header">
            <h3>${activity.title}</h3>
            ${showKebabMenu ? `
                <button class="activity-kebab-btn" onclick="toggleActivityOptions('${activity.id}', '${currentWeek}', event); event.stopPropagation();" title="Options">⋮</button>
                <div class="activity-options-dropdown" id="activity-options-${activity.id}-${currentWeek}" style="display: none;">
                    ${activity.id === 'weekly_expressions' ? `
                        <button class="activity-option-btn" onclick="changeWeeklyExpressionsMP3('${currentWeek}', this); event.stopPropagation();">
                            ${hasContent ? 'Change MP3' : 'Generate MP3'}
                        </button>
                    ` : activity.id === 'podcast_shadowing' ? `
                        <button class="activity-option-btn" onclick="changePodcastShadowingMP3('${currentWeek}', this); event.stopPropagation();">
                            ${hasContent ? 'Change MP3' : 'Generate MP3'}
                        </button>
                    ` : `
                        <button class="activity-option-btn" onclick="regenerateActivity('${activity.id}', '${currentWeek}', this); event.stopPropagation();">
                            ${hasContent ? `Re-generate ${activity.title}` : `Generate ${activity.title}`}
                        </button>
                    `}
                </div>
            ` : ''}
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
            // Format date as YYYY-MM-DD in local timezone
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;
            const label = `${dayNames[i]} ${date.getDate()}`;
            days.push({ date: dateStr, label: label });
        }
        
        return days;
    }
    
    // Calculate Sunday of the week (Sunday-Saturday format, matching backend)
    // Parse week key (format: YYYY-WW)
    const [year, week] = currentWeek.split('-W');
    const weekNum = parseInt(week);
    
    // Find the first Sunday of the year (same logic as backend)
    // Use UTC to avoid timezone issues
    const jan1 = new Date(Date.UTC(year, 0, 1));
    const jan1Day = jan1.getUTCDay(); // 0=Sunday, 1=Monday, etc.
    const daysToSunday = (7 - jan1Day) % 7;
    const firstSunday = new Date(jan1);
    firstSunday.setUTCDate(jan1.getUTCDate() + daysToSunday);
    
    // Calculate Sunday of the target week (weeks are 1-indexed)
    const sundayOfTargetWeek = new Date(firstSunday);
    sundayOfTargetWeek.setUTCDate(firstSunday.getUTCDate() + (weekNum - 1) * 7);
    
    const days = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    for (let i = 0; i < 7; i++) {
        const date = new Date(sundayOfTargetWeek);
        date.setUTCDate(sundayOfTargetWeek.getUTCDate() + i);
        // Convert UTC date to local date for display and comparison
        // The UTC date represents midnight UTC, convert to local midnight
        const localMidnight = new Date(date.getTime() + (date.getTimezoneOffset() * 60000));
        const year = localMidnight.getFullYear();
        const month = String(localMidnight.getMonth() + 1).padStart(2, '0');
        const day = String(localMidnight.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        const label = `${dayNames[i]} ${localMidnight.getDate()}`;
        days.push({ date: dateStr, label: label });
    }
    
    return days;
}

// Toggle voice journaling day
async function toggleVoiceJournalingDay(dateStr, element) {
    const newCompletedState = !element.classList.contains('completed');
    
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
            
            // Update visual state - scope to voice_journaling activity
            const activityContainer = document.querySelector('[data-activity-id="voice_journaling"]');
            const dayBox = activityContainer ? activityContainer.querySelector(`[data-day="${dateStr}"]`) : null;
            if (dayBox) {
                if (newCompletedState) {
                    dayBox.classList.add('completed');
                    const dayActions = dayBox.querySelector('.day-actions');
                    if (dayActions && !dayActions.querySelector('.completed-mark')) {
                        const mark = document.createElement('span');
                        mark.className = 'completed-mark';
                        mark.textContent = '✓';
                        dayActions.insertBefore(mark, dayActions.firstChild);
                    }
                    element.textContent = '✓ Completed';
                    element.classList.add('completed');
                    
                    // Close the recording UI if it's open
                    const dayId = dateStr.replace(/-/g, '_');
                    const recordingUI = document.getElementById(`voice_journaling_recording_ui_${dayId}`);
                    if (recordingUI && recordingUI.style.display !== 'none') {
                        recordingUI.style.display = 'none';
                        dayBox.classList.remove('active');
                    }
                } else {
                    dayBox.classList.remove('completed');
                    const dayActions = dayBox.querySelector('.day-actions');
                    if (dayActions) {
                        const mark = dayActions.querySelector('.completed-mark');
                        if (mark) mark.remove();
                    }
                    element.textContent = 'Mark as completed';
                    element.classList.remove('completed');
                }
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
async function toggleShadowingDay(dateStr, element) {
    const newCompletedState = !element.classList.contains('completed');
    
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
            
            // Update visual state - scope to shadowing_practice activity
            const activityContainer = document.querySelector('[data-activity-id="shadowing_practice"]');
            const dayBox = activityContainer ? activityContainer.querySelector(`[data-day="${dateStr}"]`) : null;
            if (dayBox) {
                if (newCompletedState) {
                    dayBox.classList.add('completed');
                    const dayActions = dayBox.querySelector('.day-actions');
                    if (dayActions && !dayActions.querySelector('.completed-mark')) {
                        const mark = document.createElement('span');
                        mark.className = 'completed-mark';
                        mark.textContent = '✓';
                        dayActions.insertBefore(mark, dayActions.firstChild);
                    }
                    element.textContent = '✓ Completed';
                    element.classList.add('completed');
                    
                    // Close the recording UI if it's open
                    const dayId = dateStr.replace(/-/g, '_');
                    const recordingUI = document.getElementById(`shadowing_practice_recording_ui_${dayId}`);
                    if (recordingUI && recordingUI.style.display !== 'none') {
                        recordingUI.style.display = 'none';
                        dayBox.classList.remove('active');
                    }
                } else {
                    dayBox.classList.remove('completed');
                    const dayActions = dayBox.querySelector('.day-actions');
                    if (dayActions) {
                        const mark = dayActions.querySelector('.completed-mark');
                        if (mark) mark.remove();
                    }
                    element.textContent = 'Mark as completed';
                    element.classList.remove('completed');
                }
            }
        } else {
            throw new Error(data.error || 'Failed to update progress');
        }
    } catch (error) {
        console.error('Error updating progress:', error);
        showError(`Failed to save progress: ${error.message}`);
    }
}

// Toggle weekly expressions day
async function toggleWeeklyExpressionsDay(dateStr, element) {
    const newCompletedState = !element.classList.contains('completed');
    
    // Get current MP3 file from UI when marking as completed
    let currentMp3File = null;
    if (newCompletedState) {
        const activityProgress = getActivityProgress('weekly_expressions');
        currentMp3File = activityProgress?.mp3_file || null;
    }
    
    try {
        const response = await fetch('/api/progress', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                activity_id: 'weekly_expressions',
                day: dateStr,
                completed: newCompletedState,
                mp3_file: currentMp3File  // Include current MP3 file when marking as completed
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
            
            // Update UI - scope to weekly_expressions activity
            const activityContainer = document.querySelector('[data-activity-id="weekly_expressions"]');
            const dayBox = activityContainer ? activityContainer.querySelector(`[data-day="${dateStr}"]`) : null;
            if (dayBox) {
                const dayId = dateStr.replace(/-/g, '_');
                const recordingUI = document.getElementById(`weekly_expressions_recording_ui_${dayId}`);
                
                if (newCompletedState) {
                    dayBox.classList.add('completed');
                    const dayActions = dayBox.querySelector('.day-actions');
                    if (dayActions && !dayActions.querySelector('.completed-mark')) {
                        const mark = document.createElement('span');
                        mark.className = 'completed-mark';
                        mark.textContent = '✓';
                        dayActions.insertBefore(mark, dayActions.firstChild);
                    }
                    
                    // Add MP3 file info inside the recording UI (date toggle)
                    if (recordingUI && currentMp3File) {
                        // Remove existing MP3 info if any
                        const existingMp3Info = recordingUI.querySelector('.completed-mp3-info');
                        if (existingMp3Info) existingMp3Info.remove();
                        
                        // Add new MP3 info
                        const mp3Info = document.createElement('div');
                        mp3Info.className = 'completed-mp3-info';
                        mp3Info.style.cssText = 'margin-top: 10px; padding: 8px; background-color: #f0f0f0; border-radius: 4px; font-size: 0.85rem; color: #666;';
                        mp3Info.innerHTML = `<strong>Completed with:</strong> ${escapeHtml(currentMp3File)}`;
                        
                        // Insert before the recording-controls-secondary
                        const controlsSecondary = recordingUI.querySelector('.recording-controls-secondary');
                        if (controlsSecondary) {
                            controlsSecondary.insertAdjacentElement('beforebegin', mp3Info);
                        } else {
                            recordingUI.appendChild(mp3Info);
                        }
                    }
                    
                    element.textContent = '✓ Completed';
                    element.classList.add('completed');
                } else {
                    dayBox.classList.remove('completed');
                    const dayActions = dayBox.querySelector('.day-actions');
                    if (dayActions) {
                        const mark = dayActions.querySelector('.completed-mark');
                        if (mark) mark.remove();
                    }
                    
                    // Remove MP3 info from recording UI
                    if (recordingUI) {
                        const mp3Info = recordingUI.querySelector('.completed-mp3-info');
                        if (mp3Info) mp3Info.remove();
                    }
                    
                    element.textContent = 'Mark as completed';
                    element.classList.remove('completed');
                }
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
async function togglePromptDay(dateStr, element) {
    const newCompletedState = !element.classList.contains('completed');
    
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
            
            // Update visual state - scope to weekly_speaking_prompt activity
            const activityContainer = document.querySelector('[data-activity-id="weekly_speaking_prompt"]');
            const dayBox = activityContainer ? activityContainer.querySelector(`[data-day="${dateStr}"]`) : null;
            if (dayBox) {
                if (newCompletedState) {
                    dayBox.classList.add('completed');
                    const dayActions = dayBox.querySelector('.day-actions');
                    if (dayActions && !dayActions.querySelector('.completed-mark')) {
                        const mark = document.createElement('span');
                        mark.className = 'completed-mark';
                        mark.textContent = '✓';
                        dayActions.insertBefore(mark, dayActions.firstChild);
                    }
                    element.textContent = '✓ Completed';
                    element.classList.add('completed');
                    
                    // Close the recording UI if it's open
                    const dayId = dateStr.replace(/-/g, '_');
                    const recordingUI = document.getElementById(`weekly_speaking_prompt_recording_ui_${dayId}`);
                    if (recordingUI && recordingUI.style.display !== 'none') {
                        recordingUI.style.display = 'none';
                        dayBox.classList.remove('active');
                    }
                } else {
                    dayBox.classList.remove('completed');
                    const dayActions = dayBox.querySelector('.day-actions');
                    if (dayActions) {
                        const mark = dayActions.querySelector('.completed-mark');
                        if (mark) mark.remove();
                    }
                    element.textContent = 'Mark as completed';
                    element.classList.remove('completed');
                }
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

// Save prompt notes (auto-saves silently on blur)
async function savePromptNotes(weekKey) {
    const notesId = `notes-weekly_speaking_prompt-${weekKey}`;
    const notesTextarea = document.getElementById(notesId);
    if (!notesTextarea) {
        return; // Silently fail if textarea not found
    }
    
    const notes = notesTextarea.value || '';
    
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
            // Silent save - no popup notification
        } else {
            console.error('Failed to save notes:', data.error);
        }
    } catch (error) {
        console.error('Error saving notes:', error);
        // Silent fail - don't show error popup for auto-save
    }
}

// Save weekly expressions notes for a specific day
async function saveWeeklyExpressionsNotes(day, notes) {
    try {
        const response = await fetch('/api/activity-info', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                activity_id: 'weekly_expressions',
                week_key: currentWeek,
                field_name: 'notes',
                field_value: notes,
                day: day
            })
        });
        
        const data = await response.json();
        if (data.success) {
            progress = data.progress;
        } else {
            throw new Error('Failed to save notes');
        }
    } catch (error) {
        console.error('Error saving weekly expressions notes:', error);
        showError('Failed to save notes. Please try again.');
    }
}

// Show error message
function showError(message) {
    // Simple error display - could be enhanced with a toast notification
    alert(message);
}

function showSuccess(message) {
    // Create a temporary success notification
    const notification = document.createElement('div');
    notification.style.cssText = 'position: fixed; top: 20px; right: 20px; background-color: #4caf50; color: white; padding: 12px 20px; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); z-index: 10000; font-size: 0.9rem;';
    notification.textContent = '✓ ' + message;
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.3s';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Toggle script visibility
function toggleScript(scriptId) {
    const scriptDiv = document.getElementById(scriptId);
    const toggleIcon = document.getElementById('toggle-' + scriptId);
    
    if (scriptDiv) {
        // Check if it's a script-content (uses active class) or hints-content (uses display style)
        if (scriptDiv.classList.contains('script-content')) {
            // Toggle active class for script-content
            if (scriptDiv.classList.contains('active')) {
                scriptDiv.classList.remove('active');
                if (toggleIcon) toggleIcon.textContent = '▶';
            } else {
                scriptDiv.classList.add('active');
                if (toggleIcon) toggleIcon.textContent = '▼';
            }
        } else if (scriptDiv.classList.contains('hints-content')) {
            // Use display style for hints-content
            if (scriptDiv.style.display === 'none' || !scriptDiv.style.display) {
                scriptDiv.style.display = 'block';
                if (toggleIcon) toggleIcon.textContent = '▼';
            } else {
                scriptDiv.style.display = 'none';
                if (toggleIcon) toggleIcon.textContent = '▶';
            }
        }
    }
}

// Toggle podcast shadowing day completion
async function togglePodcastShadowingDay(dateStr, element) {
    const newCompletedState = !element.classList.contains('completed');
    
    // Get current MP3 file from UI when marking as completed
    let currentMp3File = null;
    if (newCompletedState) {
        const activityProgress = getActivityProgress('podcast_shadowing');
        currentMp3File = activityProgress?.mp3_file || null;
    }
    
    try {
        const response = await fetch('/api/progress', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                activity_id: 'podcast_shadowing',
                day: dateStr,
                completed: newCompletedState,
                mp3_file: currentMp3File  // Include current MP3 file when marking as completed
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
            alert(`Failed to update progress: ${errorMessage}`);
            return;
        }
        
        const data = await response.json();
        if (data.success) {
            progress = data.progress;
            weeklySummary = data.weekly_summary;
            updateProgressSummary();
            
            // Update visual state - scope to podcast_shadowing activity
            const activityContainer = document.querySelector('[data-activity-id="podcast_shadowing"]');
            const dayBox = activityContainer ? activityContainer.querySelector(`[data-day="${dateStr}"]`) : null;
            if (dayBox) {
                if (newCompletedState) {
                    dayBox.classList.add('completed');
                    const dayActions = dayBox.querySelector('.day-actions');
                    if (dayActions && !dayActions.querySelector('.completed-mark')) {
                        const mark = document.createElement('span');
                        mark.className = 'completed-mark';
                        mark.textContent = '✓';
                        dayActions.insertBefore(mark, dayActions.firstChild);
                    }
                    element.textContent = '✓ Completed';
                    element.classList.add('completed');
                    
                    // Close the recording UI if it's open
                    const dayId = dateStr.replace(/-/g, '_');
                    const recordingUI = document.getElementById(`podcast_shadowing_recording_ui_${dayId}`);
                    if (recordingUI && recordingUI.style.display !== 'none') {
                        recordingUI.style.display = 'none';
                        dayBox.classList.remove('active');
                    }
                } else {
                    dayBox.classList.remove('completed');
                    const dayActions = dayBox.querySelector('.day-actions');
                    if (dayActions) {
                        const mark = dayActions.querySelector('.completed-mark');
                        if (mark) mark.remove();
                    }
                    element.textContent = 'Mark as completed';
                    element.classList.remove('completed');
                }
            }
        } else {
            alert(`Failed to update progress: ${data.error || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error updating progress:', error);
        alert(`Error updating progress: ${error.message}`);
    }
}

// Switch audio source for podcast shadowing
function switchPodcastAudioSource(weekKey, sourceNum) {
    // Switch audio source for podcast shadowing using dropdown
    const script1 = document.getElementById(`podcast-script-${weekKey}-1`);
    const script2 = document.getElementById(`podcast-script-${weekKey}-2`);
    
    if (sourceNum === '1') {
        if (script1) script1.classList.add('active');
        if (script2) script2.classList.remove('active');
    } else {
        if (script1) script1.classList.remove('active');
        if (script2) script2.classList.add('active');
    }
    
    // Save selection to localStorage
    localStorage.setItem(`podcast_audio_source_${weekKey}`, sourceNum);
}

// Switch between script tabs
function switchScript(weekKey, scriptNum) {
    // Update tab buttons
    const tab1 = document.getElementById(`tab-${weekKey}-1`);
    const tab2 = document.getElementById(`tab-${weekKey}-2`);
    const script1 = document.getElementById(`script-${weekKey}-1`);
    const script2 = document.getElementById(`script-${weekKey}-2`);
    
    if (scriptNum === 1) {
        if (tab1) tab1.classList.add('active');
        if (tab2) tab2.classList.remove('active');
        if (script1) script1.classList.add('active');
        if (script2) script2.classList.remove('active');
    } else {
        if (tab1) tab1.classList.remove('active');
        if (tab2) tab2.classList.add('active');
        if (script1) script1.classList.remove('active');
        if (script2) script2.classList.add('active');
    }
    
    // Save selection to localStorage
    localStorage.setItem(`shadowing_script_${weekKey}`, scriptNum.toString());
}

// Toggle audio regenerate options menu (kebab menu)
function toggleAudioRegenOptions(weekKey, scriptNum, sourceType, event) {
    if (event) event.stopPropagation();
    
    // Handle both typecast and openai dropdowns
    const menuId = sourceType === 'openai' ? `audio-regen-openai-${weekKey}-${scriptNum}` : `audio-regen-${weekKey}-${scriptNum}`;
    const menu = document.getElementById(menuId);
    
    if (menu) {
        // Close all other audio regen menus
        document.querySelectorAll('.audio-regen-dropdown').forEach(m => {
            if (m.id !== menuId) m.style.display = 'none';
        });
        
        if (menu.style.display === 'none') {
            menu.style.display = 'block';
            // Populate voice dropdown if not already populated
            const voiceSelectId = sourceType === 'openai' ? `voice-select-regen-openai-${weekKey}-${scriptNum}` : `voice-select-regen-${weekKey}-${scriptNum}`;
            const voiceSelect = document.getElementById(voiceSelectId);
            if (voiceSelect && voiceSelect.options.length <= 1) {
                if (sourceType === 'openai') {
                    populateOpenAIVoiceDropdown(voiceSelectId);
                } else {
                    updateVoiceDropdowns();
                }
            }
            
            // Also populate generation dropdowns if they exist
            if (sourceType === 'openai') {
                const genVoiceSelectId = `voice-select-openai-${weekKey}-${scriptNum}`;
                const genVoiceSelect = document.getElementById(genVoiceSelectId);
                if (genVoiceSelect && genVoiceSelect.options.length <= 1) {
                    populateOpenAIVoiceDropdown(genVoiceSelectId);
                }
            } else {
                const genVoiceSelectId = `voice-select-typecast-${weekKey}-${scriptNum}`;
                const genVoiceSelect = document.getElementById(genVoiceSelectId);
                if (genVoiceSelect && genVoiceSelect.options.length <= 1) {
                    updateVoiceDropdowns();
                }
            }
        } else {
            menu.style.display = 'none';
        }
    }
}

// Toggle activity options menu (kebab menu)
function toggleActivityOptions(activityId, weekKey, event) {
    if (event) event.stopPropagation();
    
    const menu = document.getElementById(`activity-options-${activityId}-${weekKey}`);
    if (menu) {
        // Close all other activity option menus
        document.querySelectorAll('.activity-options-dropdown').forEach(m => {
            if (m.id !== menu.id) m.style.display = 'none';
        });
        
        if (menu.style.display === 'none') {
            menu.style.display = 'block';
        } else {
            menu.style.display = 'none';
        }
    }
}

// Regenerate activity content
async function regenerateActivity(activityId, weekKey, buttonElement) {
    // Find the button if not provided
    const button = buttonElement || document.querySelector(`#activity-options-${activityId}-${weekKey} .activity-option-btn`);
    const originalText = button ? button.textContent : '';
    
    // Update button to show loading state
    if (button) {
        button.disabled = true;
        button.textContent = '⏳ Re-generating...';
    }
    
    try {
        const response = await fetch(`/api/generate/${activityId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                week_key: weekKey
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
            await loadWeek(weekKey);
            showSuccess(`${activityId.replace(/_/g, ' ')} regenerated successfully!`);
        } else {
            throw new Error(data.error || 'Failed to regenerate');
        }
    } catch (error) {
        console.error('Error regenerating activity:', error);
        showError(`Failed to regenerate ${activityId.replace(/_/g, ' ')}: ${error.message}`);
    } finally {
        // Restore button state
        if (button) {
            button.disabled = false;
            button.textContent = originalText;
        }
    }
}

// Change podcast shadowing MP3 file
async function changePodcastShadowingMP3(weekKey, buttonElement) {
    const button = buttonElement || document.querySelector(`#activity-options-podcast_shadowing-${weekKey} .activity-option-btn`);
    const originalText = button ? button.textContent : '';
    
    // Update button to show loading state
    if (button) {
        button.disabled = true;
        button.textContent = '⏳ Changing...';
    }
    
    try {
        const response = await fetch('/api/podcast-shadowing/regenerate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                week_key: weekKey
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
            // Reload the current week to show new MP3 file
            await loadWeek(weekKey);
            showSuccess('MP3 file changed successfully!');
        } else {
            throw new Error(data.error || 'Failed to change MP3');
        }
    } catch (error) {
        console.error('Error changing podcast shadowing MP3:', error);
        showError(`Failed to change MP3: ${error.message}`);
    } finally {
        // Restore button state
        if (button) {
            button.disabled = false;
            button.textContent = originalText;
        }
    }
}

// Change weekly expressions MP3 file
async function changeWeeklyExpressionsMP3(weekKey, buttonElement) {
    const button = buttonElement || document.querySelector(`#activity-options-weekly_expressions-${weekKey} .activity-option-btn`);
    const originalText = button ? button.textContent : '';
    
    // Update button to show loading state
    if (button) {
        button.disabled = true;
        button.textContent = '⏳ Changing...';
    }
    
    try {
        const response = await fetch('/api/weekly-expressions/regenerate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                week_key: weekKey
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
            // Reload the current week to show new MP3 file
            await loadWeek(weekKey);
            showSuccess('MP3 file changed successfully!');
        } else {
            throw new Error(data.error || 'Failed to change MP3');
        }
    } catch (error) {
        console.error('Error changing weekly expressions MP3:', error);
        showError(`Failed to change MP3: ${error.message}`);
    } finally {
        // Restore button state
        if (button) {
            button.disabled = false;
            button.textContent = originalText;
        }
    }
}

// Download audio file
function downloadAudio(audioUrl, sourceType, weekKey, scriptNum) {
    if (!audioUrl) {
        showError('No audio file available to download');
        return;
    }
    
    try {
        // Construct the full URL
        const fullUrl = `/static/${audioUrl}`;
        
        // Extract filename from URL or create a default one
        const urlParts = audioUrl.split('/');
        let filename = urlParts[urlParts.length - 1];
        
        // If no filename, create one based on parameters
        if (!filename || filename === audioUrl) {
            const extension = sourceType === 'openai' ? 'mp3' : 'wav';
            filename = `script${scriptNum}_${sourceType}_${weekKey}.${extension}`;
        }
        
        // Create a temporary anchor element to trigger download
        const link = document.createElement('a');
        link.href = fullUrl;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (error) {
        console.error('Error downloading audio:', error);
        showError(`Failed to download audio: ${error.message}`);
    }
}

// Close dropdowns when clicking outside
document.addEventListener('click', function(event) {
    // Close audio regen dropdowns
    document.querySelectorAll('.audio-regen-dropdown').forEach(menu => {
        if (menu.style.display !== 'none') {
            // Find the kebab button (it's the previous sibling button)
            const container = menu.parentElement;
            const button = container ? container.querySelector('.audio-more-options-btn') : null;
            if (button && !button.contains(event.target) && !menu.contains(event.target)) {
                menu.style.display = 'none';
            }
        }
    });
    
    // Close activity option dropdowns
    document.querySelectorAll('.activity-options-dropdown').forEach(menu => {
        if (menu.style.display !== 'none') {
            const button = menu.previousElementSibling;
            if (button && !button.contains(event.target) && !menu.contains(event.target)) {
                menu.style.display = 'none';
            }
        }
    });
});


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

// Generate audio for a specific script
async function generateAudioForScript(weekKey, scriptNum, buttonElement, sourceType = null) {
    if (!weekKey) weekKey = currentWeek;
    
    const button = buttonElement;
    
    // Determine source type from button context if not provided
    if (!sourceType && button) {
        // Check if button is in an OpenAI dropdown
        const openaiDropdown = button.closest('[id*="openai"]');
        if (openaiDropdown) {
            sourceType = 'openai';
        } else {
            // Check if button is in a Typecast dropdown
            const typecastDropdown = button.closest('[id*="regen"]');
            if (typecastDropdown && !typecastDropdown.id.includes('openai')) {
                sourceType = 'typecast';
            }
        }
    }
    
    // Try to get voice/speed from regen dropdown based on source type
    let typecastVoiceSelect = null;
    let typecastModelSelect = null;
    let openaiVoiceSelect = null;
    let speedSelect = null;
    
    if (sourceType === 'openai') {
        // OpenAI regeneration
        openaiVoiceSelect = document.getElementById(`voice-select-regen-openai-${weekKey}-${scriptNum}`);
        speedSelect = document.getElementById(`speed-select-regen-openai-${weekKey}-${scriptNum}`);
    } else if (sourceType === 'typecast') {
        // Typecast regeneration
        typecastVoiceSelect = document.getElementById(`voice-select-regen-${weekKey}-${scriptNum}`);
        typecastModelSelect = document.getElementById(`model-select-regen-${weekKey}-${scriptNum}`);
        speedSelect = document.getElementById(`speed-select-regen-${weekKey}-${scriptNum}`);
    } else {
        // Fallback: try both regen dropdowns, then generation dropdowns
        typecastVoiceSelect = document.getElementById(`voice-select-regen-${weekKey}-${scriptNum}`);
        typecastModelSelect = document.getElementById(`model-select-regen-${weekKey}-${scriptNum}`);
        openaiVoiceSelect = document.getElementById(`voice-select-regen-openai-${weekKey}-${scriptNum}`);
        speedSelect = document.getElementById(`speed-select-regen-${weekKey}-${scriptNum}`) || 
                     document.getElementById(`speed-select-regen-openai-${weekKey}-${scriptNum}`);
        
        // Fallback to generation dropdowns if regen dropdowns don't exist
        if (!typecastVoiceSelect) {
            typecastVoiceSelect = document.getElementById(`voice-select-typecast-${weekKey}-${scriptNum}`);
        }
        if (!typecastModelSelect) {
            typecastModelSelect = document.getElementById(`model-select-typecast-${weekKey}-${scriptNum}`);
        }
        if (!openaiVoiceSelect) {
            openaiVoiceSelect = document.getElementById(`voice-select-openai-${weekKey}-${scriptNum}`);
        }
        if (!speedSelect) {
            // Try typecast speed first, then openai speed
            speedSelect = document.getElementById(`speed-select-typecast-${weekKey}-${scriptNum}`) ||
                         document.getElementById(`speed-select-openai-${weekKey}-${scriptNum}`);
        }
    }
    
    const typecastVoiceId = typecastVoiceSelect ? typecastVoiceSelect.value : null;
    const typecastModel = typecastModelSelect ? typecastModelSelect.value : 'ssfm-v30';
    const openaiVoice = openaiVoiceSelect ? openaiVoiceSelect.value : null;
    
    // Always use 1.0x speed for audio generation
    let typecastSpeed = 1.0;
    let openaiSpeed = 1.0;
    let speed = 1.0;
    
    if (button) {
        button.disabled = true;
        if (sourceType === 'openai') {
            button.textContent = '⏳ Generating OpenAI...';
        } else if (sourceType === 'typecast') {
            button.textContent = '⏳ Generating Typecast...';
        } else {
            button.textContent = '⏳ Generating both...';
        }
    }
    
    // Disable dropdowns during generation
    const disableDropdowns = (disabled) => {
        if (sourceType === 'typecast' || sourceType === null) {
            // Disable Typecast dropdowns
            const typecastVoiceSelect = document.getElementById(`voice-select-typecast-${weekKey}-${scriptNum}`) || 
                                       document.getElementById(`voice-select-regen-${weekKey}-${scriptNum}`);
            const typecastModelSelect = document.getElementById(`model-select-typecast-${weekKey}-${scriptNum}`) || 
                                       document.getElementById(`model-select-regen-${weekKey}-${scriptNum}`);
            const typecastSpeedSelect = document.getElementById(`speed-select-typecast-${weekKey}-${scriptNum}`) || 
                                       document.getElementById(`speed-select-regen-${weekKey}-${scriptNum}`);
            if (typecastVoiceSelect) typecastVoiceSelect.disabled = disabled;
            if (typecastModelSelect) typecastModelSelect.disabled = disabled;
            if (typecastSpeedSelect) typecastSpeedSelect.disabled = disabled;
        }
        if (sourceType === 'openai' || sourceType === null) {
            // Disable OpenAI dropdowns
            const openaiVoiceSelect = document.getElementById(`voice-select-openai-${weekKey}-${scriptNum}`) || 
                                     document.getElementById(`voice-select-regen-openai-${weekKey}-${scriptNum}`);
            const openaiSpeedSelect = document.getElementById(`speed-select-openai-${weekKey}-${scriptNum}`) || 
                                     document.getElementById(`speed-select-regen-openai-${weekKey}-${scriptNum}`);
            if (openaiVoiceSelect) openaiVoiceSelect.disabled = disabled;
            if (openaiSpeedSelect) openaiSpeedSelect.disabled = disabled;
        }
    };
    
    disableDropdowns(true);
    
    try {
        const response = await fetch('/api/generate-audio-single', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                week_key: weekKey,
                script_num: scriptNum,
                voice_id: typecastVoiceId,
                typecast_model: typecastModel,
                openai_voice: openaiVoice,
                speed: speed,  // Fallback/default speed
                typecast_speed: sourceType === null ? typecastSpeed : (sourceType === 'typecast' ? typecastSpeed : null),
                openai_speed: sourceType === null ? openaiSpeed : (sourceType === 'openai' ? openaiSpeed : null),
                source_type: sourceType  // 'typecast', 'openai', or null (both)
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status}` }));
            throw new Error(errorData.error || `Server error: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            progress = data.progress;
            
            // Verify audio URLs were generated based on what was requested
            const weekData = progress?.weeks?.[weekKey]?.shadowing_practice;
            const typecastUrl = weekData?.[`script${scriptNum}_typecast_url`];
            const openaiUrl = weekData?.[`script${scriptNum}_openai_url`];
            
            
            // Show success message based on what was generated
            if (sourceType === 'openai') {
                showError('OpenAI audio generated successfully!');
            } else if (sourceType === 'typecast') {
                showError('Typecast audio generated successfully!');
            } else {
                // Show warnings if any
                if (data.warnings && data.warnings.length > 0) {
                    showError(`Audio generated with warnings: ${data.warnings.join(', ')}`);
                } else {
                    showError('Both Typecast and OpenAI audio generated successfully!');
                }
            }
            
            // Reload the current week to show new audio players
            await loadWeek(weekKey);
            
            // Restore the script tab that was being used (stay on the same script tab)
            setTimeout(() => {
                switchScript(weekKey, scriptNum);
            }, 100);
            
        } else {
            throw new Error(data.error || 'Failed to generate audio');
        }
    } catch (error) {
        console.error('Error generating audio:', error);
        showError(`Failed to generate audio: ${error.message}`);
        if (button) {
            button.disabled = false;
            button.textContent = button.classList.contains('regen-btn-compact') ? 'Re-generate' : 'Generate';
        }
    } finally {
        // Re-enable dropdowns after generation completes (success or error)
        const disableDropdowns = (disabled) => {
            if (sourceType === 'typecast' || sourceType === null) {
                // Re-enable Typecast dropdowns
                const typecastVoiceSelect = document.getElementById(`voice-select-typecast-${weekKey}-${scriptNum}`) || 
                                           document.getElementById(`voice-select-regen-${weekKey}-${scriptNum}`);
                const typecastModelSelect = document.getElementById(`model-select-typecast-${weekKey}-${scriptNum}`) || 
                                           document.getElementById(`model-select-regen-${weekKey}-${scriptNum}`);
                const typecastSpeedSelect = document.getElementById(`speed-select-typecast-${weekKey}-${scriptNum}`) || 
                                           document.getElementById(`speed-select-regen-${weekKey}-${scriptNum}`);
                if (typecastVoiceSelect) typecastVoiceSelect.disabled = disabled;
                if (typecastModelSelect) typecastModelSelect.disabled = disabled;
                if (typecastSpeedSelect) typecastSpeedSelect.disabled = disabled;
            }
            if (sourceType === 'openai' || sourceType === null) {
                // Re-enable OpenAI dropdowns
                const openaiVoiceSelect = document.getElementById(`voice-select-openai-${weekKey}-${scriptNum}`) || 
                                         document.getElementById(`voice-select-regen-openai-${weekKey}-${scriptNum}`);
                const openaiSpeedSelect = document.getElementById(`speed-select-openai-${weekKey}-${scriptNum}`) || 
                                         document.getElementById(`speed-select-regen-openai-${weekKey}-${scriptNum}`);
                if (openaiVoiceSelect) openaiVoiceSelect.disabled = disabled;
                if (openaiSpeedSelect) openaiSpeedSelect.disabled = disabled;
            }
        };
        disableDropdowns(false);
    }
}

// Generate audio from script using Typecast (LEGACY - NOT USED, kept for backwards compatibility)
// All audio generation now uses generateAudioForScript() instead
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
        
        // Populate OpenAI voice dropdowns after rendering
        setTimeout(() => {
            document.querySelectorAll('select[id*="voice-select-openai-"]').forEach(select => {
                if (select.options.length <= 1 || (select.options.length > 0 && select.options[0].textContent === 'Loading voices...')) {
                    populateOpenAIVoiceDropdown(select.id);
                }
            });
        }, 150);
    } catch (error) {
        console.error('Error loading week:', error);
        showError('Failed to load week. Please try again.');
    }
}

// Get all available weeks from progress
function getAllWeeks() {
    if (!progress || !progress.weeks) return [];
    
    // Return all weeks (including past, current, and future)
    const allWeeks = Object.keys(progress.weeks);
    
    return allWeeks.sort(); // Oldest to newest
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

// Check if shadowing mode is active for weekly_speaking_prompt
function isShadowingMode(weekKey) {
    if (!weekKey) return false;
    try {
        const [yearStr, weekStr] = weekKey.split('-W');
        const year = parseInt(yearStr);
        const week = parseInt(weekStr);
        
        // Shadowing mode is active for weeks <= 2025-W52
        if (year < 2025) {
            return true;
        } else if (year === 2025) {
            return week <= 52;
        } else {
            return false;
        }
    } catch (e) {
        return false;
    }
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
    // Skip cache if it's older than 1 hour to ensure fresh voice list
    if (cachedVoices && cacheTimestamp) {
        const age = Date.now() - parseInt(cacheTimestamp);
        if (age < Math.min(cacheExpiry, 60 * 60 * 1000)) { // Use cache if less than 1 hour old
            try {
                availableVoices = JSON.parse(cachedVoices);
                updateVoiceDropdowns();
                // Still fetch fresh data in background to update cache
            } catch (e) {
                // Failed to parse cache, will fetch fresh data
            }
        }
    }
    
    // Fetch voices from API
    try {
        const response = await fetch('/api/voices?t=' + Date.now()); // Add cache busting
        const data = await response.json();
        
        if (data.success && data.voices && data.voices.length > 0) {
            availableVoices = data.voices;
            
            // Cache the voices in localStorage
            localStorage.setItem('typecast_voices', JSON.stringify(availableVoices));
            localStorage.setItem('typecast_voices_timestamp', Date.now().toString());
            
            updateVoiceDropdowns();
            updatePodcastVoiceInfo();
            
            // Also populate OpenAI voice dropdowns
            setTimeout(() => {
                document.querySelectorAll('select[id*="voice-select-openai-"]').forEach(select => {
                    if (select.options.length <= 1 || (select.options.length > 0 && select.options[0].textContent === 'Loading voices...')) {
                        populateOpenAIVoiceDropdown(select.id);
                    }
                });
            }, 100);
        } else {
            updateVoiceDropdowns();
            updatePodcastVoiceInfo();
        }
    } catch (error) {
        console.error('Error loading voices:', error);
        updateVoiceDropdowns();
    }
}

function updateVoiceDropdowns() {
    // Only update Typecast voice dropdowns (exclude OpenAI ones)
    const voiceSelects = document.querySelectorAll('.voice-select, .voice-select-compact, select[id^="voice-select-regen-"]');
    
    voiceSelects.forEach(select => {
        // Skip OpenAI voice dropdowns
        if (select.id && select.id.includes('openai')) {
            return;
        }
        
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

// Update podcast voice info display with voice names
function updatePodcastVoiceInfo() {
    if (!availableVoices || availableVoices.length === 0) return;
    if (!progress || !progress.weeks) return;
    
    // Helper function to get voice name from voice ID
    const getPodcastVoiceNameFromId = (voiceId) => {
        if (!voiceId) return '';
        // Check if it's already a name (doesn't start with 'tc_')
        if (!voiceId.startsWith('tc_')) {
            return voiceId;
        }
        // Try to find voice name from availableVoices
        const voice = availableVoices.find(v => v.voice_id === voiceId || v.id === voiceId);
        if (voice) {
            return voice.name || voice.voice_name || voiceId;
        }
        // Fallback: return ID if name not found
        return voiceId;
    };
    
    // Format voice and model label
    const formatPodcastVoiceModelLabel = (voice, model) => {
        if (!voice && !model) return '';
        const parts = [];
        if (voice) {
            const voiceName = getPodcastVoiceNameFromId(voice);
            parts.push(voiceName);
        }
        if (model) {
            const modelDisplay = model === 'ssfm-v21' ? 'SSFM v21' : (model === 'ssfm-v30' ? 'SSFM v30' : model);
            parts.push(modelDisplay);
        }
        return parts.join(', ');
    };
    
    // Update podcast voice info in dropdown
    document.querySelectorAll('[id^="podcast-voice-info-dropdown-"]').forEach(element => {
        const weekKey = element.id.replace('podcast-voice-info-dropdown-', '');
        
        // Get activity progress for this specific week
        const weekData = progress.weeks[weekKey];
        if (!weekData) return;
        
        const activityProgress = weekData['podcast_shadowing'];
        if (!activityProgress) return;
        
        const typecastVoice = activityProgress.typecast_voice || '';
        const typecastModel = activityProgress.typecast_model || '';
        
        if (!typecastVoice && !typecastModel) {
            element.style.display = 'none';
            return;
        }
        
        const label = formatPodcastVoiceModelLabel(typecastVoice, typecastModel);
        if (label) {
            element.innerHTML = `<strong>Voice:</strong> ${escapeHtml(label)}`;
            element.style.display = '';
        } else {
            element.style.display = 'none';
        }
    });
    
    // Update shadowing voice info in dropdowns
    document.querySelectorAll('[id^="shadowing-voice-info-dropdown-"]').forEach(element => {
        const fullId = element.id.replace('shadowing-voice-info-dropdown-', '');
        // ID format: "2024-1-1" or "2024-52-2" (weekKey-scriptNum)
        // Find the last dash to separate weekKey and scriptNum
        const lastDashIndex = fullId.lastIndexOf('-');
        if (lastDashIndex === -1) return;
        
        const weekKey = fullId.substring(0, lastDashIndex);
        const scriptNum = fullId.substring(lastDashIndex + 1);
        
        // Get activity progress for this specific week
        const weekData = progress.weeks[weekKey];
        if (!weekData) return;
        
        const activityProgress = weekData['shadowing_practice'];
        if (!activityProgress) return;
        
        const typecastVoice = scriptNum === '1' 
            ? (activityProgress.script1_typecast_voice || '')
            : (activityProgress.script2_typecast_voice || '');
        const typecastModel = scriptNum === '1'
            ? (activityProgress.script1_typecast_model || '')
            : (activityProgress.script2_typecast_model || '');
        
        if (!typecastVoice && !typecastModel) {
            element.style.display = 'none';
            return;
        }
        
        // Helper function to get voice name from voice ID
        const getVoiceNameFromId = (voiceId) => {
            if (!voiceId) return '';
            if (!voiceId.startsWith('tc_')) {
                return voiceId;
            }
            const voice = availableVoices.find(v => v.voice_id === voiceId || v.id === voiceId);
            if (voice) {
                return voice.name || voice.voice_name || voiceId;
            }
            return voiceId;
        };
        
        // Format voice and model label
        const formatVoiceModelLabel = (voice, model) => {
            if (!voice && !model) return '';
            const parts = [];
            if (voice) {
                const voiceName = getVoiceNameFromId(voice);
                parts.push(voiceName);
            }
            if (model) {
                const modelDisplay = model === 'ssfm-v21' ? 'SSFM v21' : (model === 'ssfm-v30' ? 'SSFM v30' : model);
                parts.push(modelDisplay);
            }
            return parts.join(', ');
        };
        
        const label = formatVoiceModelLabel(typecastVoice, typecastModel);
        if (label) {
            element.innerHTML = `<strong>Voice:</strong> ${escapeHtml(label)}`;
            element.style.display = '';
        } else {
            element.style.display = 'none';
        }
    });
}

// Populate OpenAI voice dropdown with OpenAI voices
function populateOpenAIVoiceDropdown(selectId) {
    const select = document.getElementById(selectId);
    if (!select) {
        console.warn('OpenAI voice dropdown not found:', selectId);
        return;
    }
    
    const currentValue = select.value;
    
    // OpenAI TTS voice options: alloy, echo, fable, onyx, nova, shimmer
    const openAIVoices = [
        { value: 'alloy', name: 'Alloy' },
        { value: 'echo', name: 'Echo' },
        { value: 'fable', name: 'Fable' },
        { value: 'onyx', name: 'Onyx' },
        { value: 'nova', name: 'Nova' },
        { value: 'shimmer', name: 'Shimmer' }
    ];
    
    // Clear existing options
    select.innerHTML = '';
    
    // Add OpenAI voice options
    openAIVoices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.value;
        option.textContent = voice.name;
        select.appendChild(option);
    });
    
    // Restore previous selection if it exists, otherwise default to 'onyx'
    if (currentValue && Array.from(select.options).some(opt => opt.value === currentValue)) {
        select.value = currentValue;
    } else {
        // Default to 'onyx' (current default)
        const onyxOption = Array.from(select.options).find(opt => opt.value === 'onyx');
        if (onyxOption) {
            select.value = 'onyx';
        } else if (select.options.length > 0) {
            select.selectedIndex = 0;
        }
    }
}

// ==================== RECORDING FUNCTIONALITY ====================

let mediaRecorder = null;
let audioChunks = [];
let currentRecordingActivity = null;
let currentRecordingDay = null;
let recordingTimer = null;
let recordingStartTime = null;
let audioContext = null;
let analyser = null;
let animationId = null;

// Toggle recording UI for a specific day
function toggleRecordingUI(activityId, day, event) {
    // Prevent event bubbling
    if (event) event.stopPropagation();
    
    const dayId = day.replace(/-/g, '_');
    const recordingUI = document.getElementById(`${activityId}_recording_ui_${dayId}`);
    
    // Find the day box within the current activity's container
    const activityContainer = document.querySelector(`[data-activity-id="${activityId}"]`);
    const dayBox = activityContainer ? activityContainer.querySelector(`[data-day="${day}"]`) : null;
    
    if (!recordingUI) return;
    
    // Close all other recording UIs for this activity and remove active state
    const allRecordingUIs = document.querySelectorAll(`[id^="${activityId}_recording_ui_"]`);
    // Only select day boxes within this activity's container
    const allDayBoxes = activityContainer ? activityContainer.querySelectorAll(`[data-day]`) : [];
    allRecordingUIs.forEach(ui => {
        if (ui.id !== recordingUI.id && ui.style.display !== 'none') {
            ui.style.display = 'none';
        }
    });
    allDayBoxes.forEach(box => {
        if (box.getAttribute('data-day') !== day) {
            box.classList.remove('active');
        }
    });
    
    // Toggle current UI
    if (recordingUI.style.display === 'none') {
        recordingUI.style.display = 'block';
        if (dayBox) dayBox.classList.add('active');
        
        // For voice journaling, show the daily topic
        if (activityId === 'voice_journaling') {
            const dayIndex = parseInt(recordingUI.getAttribute('data-day-index') || '0');
            const topics = progress?.weeks?.[currentWeek]?.voice_journaling?.topics || [];
            const topic = topics[dayIndex] || "No topic generated yet. Click 'Generate content' to create topics.";
            
            const topicElement = document.getElementById(`${activityId}_topic_${dayId}`);
            if (topicElement) {
                topicElement.innerHTML = `<strong>Today's Topic</strong> ${escapeHtml(topic)}`;
            }
        }
        
        // For weekly expressions, load notes
        if (activityId === 'weekly_expressions') {
            // Load notes for this day
            const notesTextarea = document.getElementById(`${activityId}_notes_${dayId}`);
            if (notesTextarea) {
                const notes = progress?.weeks?.[currentWeek]?.weekly_expressions?.notes?.[day] || '';
                notesTextarea.value = notes;
            }
        }
        
        // Load recordings when opening (skip for weekly_expressions)
        if (activityId !== 'weekly_expressions') {
        loadRecordings(activityId, day);
        }
    } else {
        recordingUI.style.display = 'none';
        if (dayBox) dayBox.classList.remove('active');
    }
}

// Delete a recording
async function deleteRecording(activityId, day, filename) {
    if (!confirm('Are you sure you want to delete this recording?')) {
        return;
    }
    
    try {
        const response = await fetch('/api/delete-recording', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                activity_id: activityId,
                week_key: currentWeek,
                day: day,
                filename: filename
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                showSuccess('Recording deleted successfully');
                // Reload recordings for this day
                await loadRecordings(activityId, day);
                
                // If no recordings left, unmark as completed
                const recordingsResponse = await fetch('/api/get-recordings', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        activity_id: activityId,
                        week_key: currentWeek,
                        day: day
                    })
                });
                
                if (recordingsResponse.ok) {
                    const recordingsData = await recordingsResponse.json();
                    if (recordingsData.success && (!recordingsData.recordings || recordingsData.recordings.length === 0)) {
                        // No recordings left, unmark as completed
                        const completeBtn = document.querySelector(`#${activityId}_complete_${day.replace(/-/g, '_')}`);
                        if (completeBtn && completeBtn.classList.contains('completed')) {
                            // Trigger the toggle function to unmark as completed
                            if (activityId === 'voice_journaling') {
                                await toggleVoiceJournalingDay(day, completeBtn);
                            } else if (activityId === 'shadowing_practice') {
                                await toggleShadowingDay(day, completeBtn);
                            } else if (activityId === 'weekly_speaking_prompt') {
                                await togglePromptDay(day, completeBtn);
                            }
                        }
                    }
                }
            } else {
                showError('Failed to delete recording: ' + (data.error || 'Unknown error'));
            }
        } else {
            showError('Failed to delete recording');
        }
    } catch (error) {
        console.error('Error deleting recording:', error);
        showError('Failed to delete recording');
    }
}

// Start recording
async function startRecording(activityId, day) {
    try {
        // Request microphone access
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Create MediaRecorder
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        currentRecordingActivity = activityId;
        currentRecordingDay = day;
        
        // Setup audio visualization
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        analyser.fftSize = 2048;
        
        // Start timer
        recordingStartTime = Date.now();
        startRecordingTimer(activityId, day);
        
        // Start visualization
        startVisualization(activityId, day);
        
        // Collect audio data
        mediaRecorder.addEventListener('dataavailable', event => {
            audioChunks.push(event.data);
        });
        
        // Handle recording stop
        mediaRecorder.addEventListener('stop', async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            
            // Stop timer and visualization
            if (recordingTimer) {
                clearInterval(recordingTimer);
                recordingTimer = null;
            }
            if (animationId) {
                cancelAnimationFrame(animationId);
                animationId = null;
            }
            if (audioContext) {
                audioContext.close();
                audioContext = null;
            }
            
            await saveRecording(audioBlob, currentRecordingActivity, currentRecordingDay);
            
            // Stop all tracks
            stream.getTracks().forEach(track => track.stop());
        });
        
        // Start recording
        mediaRecorder.start();
        updateRecordingUI(activityId, day, 'recording');
        
    } catch (error) {
        console.error('Error starting recording:', error);
        showError('Failed to access microphone. Please check permissions.');
    }
}

// Start recording timer
function startRecordingTimer(activityId, day) {
    const dayId = day.replace(/-/g, '_');
    const timerElement = document.getElementById(`${activityId}_timer_${dayId}`);
    
    if (!timerElement) return;
    
    timerElement.style.display = 'inline-block';
    
    recordingTimer = setInterval(() => {
        const elapsed = Date.now() - recordingStartTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }, 100);
}

// Start waveform visualization
function startVisualization(activityId, day) {
    const dayId = day.replace(/-/g, '_');
    const visualizerDiv = document.getElementById(`${activityId}_visualizer_${dayId}`);
    const canvas = document.getElementById(`${activityId}_canvas_${dayId}`);
    
    if (!canvas || !analyser) return;
    
    visualizerDiv.style.display = 'block';
    const canvasContext = canvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    function draw() {
        animationId = requestAnimationFrame(draw);
        
        analyser.getByteTimeDomainData(dataArray);
        
        canvasContext.fillStyle = '#f8f9fa';
        canvasContext.fillRect(0, 0, canvas.width, canvas.height);
        
        canvasContext.lineWidth = 2;
        canvasContext.strokeStyle = '#dc3545';
        canvasContext.beginPath();
        
        const sliceWidth = canvas.width / bufferLength;
        let x = 0;
        
        for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0;
            const y = v * canvas.height / 2;
            
            if (i === 0) {
                canvasContext.moveTo(x, y);
            } else {
                canvasContext.lineTo(x, y);
            }
            
            x += sliceWidth;
        }
        
        canvasContext.lineTo(canvas.width, canvas.height / 2);
        canvasContext.stroke();
    }
    
    draw();
}

// Stop recording
function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        updateRecordingUI(currentRecordingActivity, currentRecordingDay, 'stopped');
    }
}

// Save recording to server
async function saveRecording(audioBlob, activityId, day) {
    try {
        
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');
        formData.append('activity_id', activityId);
        formData.append('week_key', currentWeek);
        formData.append('day', day);
        
        const response = await fetch('/api/save-recording', {
            method: 'POST',
            body: formData
        });
        
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server error: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            showSuccess('Recording saved successfully!');
            
            // Reload recordings for this day
            await loadRecordings(activityId, day);
        } else {
            showError('Failed to save recording: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error saving recording:', error);
        showError('Failed to save recording: ' + error.message);
    }
}

// Auto-mark day as completed when recording is saved
async function autoMarkDayCompleted(activityId, day) {
    try {
        const response = await fetch('/api/progress', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                activity_id: activityId,
                day: day,
                completed: true,
                week_key: currentWeek
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                progress = data.progress;
                weeklySummary = data.weekly_summary;
                updateProgressSummary();
                
                // Update visual state of the day box
                const dayId = day.replace(/-/g, '_');
                const dayBox = document.querySelector(`[data-day="${day}"]`);
                if (dayBox && !dayBox.classList.contains('completed')) {
                    dayBox.classList.add('completed');
                    const dayActions = dayBox.querySelector('.day-actions');
                    if (dayActions && !dayActions.querySelector('.completed-mark')) {
                        const mark = document.createElement('span');
                        mark.className = 'completed-mark';
                        mark.textContent = '✓';
                        dayActions.insertBefore(mark, dayActions.firstChild);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error auto-marking day as completed:', error);
        // Don't show error to user - completion is secondary to recording save
    }
}

// Load all recordings for current week
async function loadAllRecordings() {
    if (!currentWeek) return;
    
    const activities = ['voice_journaling', 'shadowing_practice', 'weekly_speaking_prompt'];
    const daysOfWeek = getDaysOfWeek();
    
    for (const activityId of activities) {
        for (const day of daysOfWeek) {
            await loadRecordings(activityId, day.date);
        }
    }
}

// Load recordings for a specific activity and day
async function loadRecordings(activityId, day) {
    try {
        const response = await fetch('/api/get-recordings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                activity_id: activityId,
                week_key: currentWeek,
                day: day
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            displayRecordings(activityId, day, data.recordings);
        }
    } catch (error) {
        console.error('Error loading recordings:', error);
    }
}

// Display recordings in the UI
async function displayRecordings(activityId, day, recordings) {
    const dayId = day.replace(/-/g, '_');
    const recordingsList = document.querySelector(`#${activityId}_recordings_${dayId}`);
    const recordBtn = document.querySelector(`#${activityId}_record_${dayId}`);
    const completeBtn = document.querySelector(`#${activityId}_complete_${dayId}`);
    const dayBox = document.querySelector(`[data-day="${day}"]`);
    
    if (!recordingsList) return;
    
    const hasRecordings = recordings && recordings.length > 0;
    
    // Update record button text
    if (recordBtn) {
        if (hasRecordings) {
            recordBtn.innerHTML = '🔄 Re-record';
        } else {
            recordBtn.innerHTML = '🎤 Record';
        }
    }
    
    // Enable/disable complete button based on recordings
    if (completeBtn) {
        if (hasRecordings) {
            completeBtn.disabled = false;
            completeBtn.title = '';
        } else {
            completeBtn.disabled = true;
            completeBtn.title = 'Record audio first to mark as completed';
            // If user somehow marked it complete before, uncheck it and sync with backend
            if (completeBtn.classList.contains('completed')) {
                completeBtn.classList.remove('completed');
                completeBtn.textContent = 'Mark as completed';
                
                // Also update the day box visual state
                if (dayBox) {
                    dayBox.classList.remove('completed');
                    const dayActions = dayBox.querySelector('.day-actions');
                    if (dayActions) {
                        const mark = dayActions.querySelector('.completed-mark');
                        if (mark) mark.remove();
                    }
                }
                
                // Sync with backend - unmark as completed
                try {
                    let toggleFunction;
                    if (activityId === 'voice_journaling') {
                        toggleFunction = 'toggleVoiceJournalingDay';
                    } else if (activityId === 'shadowing_practice') {
                        toggleFunction = 'toggleShadowingDay';
                    } else if (activityId === 'weekly_speaking_prompt') {
                        toggleFunction = 'togglePromptDay';
                    }
                    
                    if (toggleFunction) {
                        const response = await fetch('/api/progress', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                activity_id: activityId,
                                day: day,
                                completed: false,
                                week_key: currentWeek
                            })
                        });
                        
                        if (response.ok) {
                            const data = await response.json();
                            if (data.success) {
                                progress = data.progress;
                                weeklySummary = data.weekly_summary;
                                updateProgressSummary();
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error syncing completion state:', error);
                    // Don't show error to user - this is a background sync
                }
            }
        }
    }
    
    if (!hasRecordings) {
        recordingsList.innerHTML = '<p class="no-recordings">No recording yet</p>';
        return;
    }
    
    // Show only the most recent recording
    const recording = recordings[recordings.length - 1];
    recordingsList.innerHTML = '';
    
    const recordingDiv = document.createElement('div');
    recordingDiv.className = 'recording-item';
    
    const timestamp = formatTimestamp(recording.timestamp);
    
    // Build transcription HTML if available (only for voice_journaling)
    let transcriptionHtml = '';
    if (activityId === 'voice_journaling' && recording.transcription) {
        transcriptionHtml = `
            <div class="recording-transcription">
                <div class="transcription-label">Transcription:</div>
                <div class="transcription-text">${escapeHtml(recording.transcription)}</div>
            </div>
        `;
    }
    
    recordingDiv.innerHTML = `
        <div class="recording-info">
            <span class="recording-time">Recorded: ${timestamp}</span>
            <button class="delete-recording-btn" onclick="deleteRecording('${activityId}', '${day}', '${recording.filename}'); event.stopPropagation();">🗑️ Delete</button>
        </div>
        <audio controls class="recording-player">
            <source src="${recording.url}" type="audio/webm">
            Your browser does not support audio playback.
        </audio>
        ${transcriptionHtml}
    `;
    
    recordingsList.appendChild(recordingDiv);
}

// Format timestamp for display
function formatTimestamp(timestamp) {
    // timestamp format: YYYYMMDD_HHMMSS
    const year = timestamp.substring(0, 4);
    const month = timestamp.substring(4, 6);
    const day = timestamp.substring(6, 8);
    const hour = timestamp.substring(9, 11);
    const minute = timestamp.substring(11, 13);
    const second = timestamp.substring(13, 15);
    
    return `${month}/${day} ${hour}:${minute}:${second}`;
}

// Update recording UI state
function updateRecordingUI(activityId, day, state) {
    const dayId = day.replace(/-/g, '_');
    const recordBtn = document.querySelector(`#${activityId}_record_${dayId}`);
    const stopBtn = document.querySelector(`#${activityId}_stop_${dayId}`);
    const timerElement = document.querySelector(`#${activityId}_timer_${dayId}`);
    const visualizerDiv = document.querySelector(`#${activityId}_visualizer_${dayId}`);
    
    if (!recordBtn || !stopBtn) return;
    
    if (state === 'recording') {
        recordBtn.style.display = 'none';
        stopBtn.style.display = 'inline-block';
    } else {
        recordBtn.style.display = 'inline-block';
        stopBtn.style.display = 'none';
        if (timerElement) {
            timerElement.style.display = 'none';
            timerElement.textContent = '00:00';
        }
        if (visualizerDiv) {
            visualizerDiv.style.display = 'none';
        }
    }
}

// Ensure weekly expressions audio player is updated (MP3 is automatically assigned)
function ensureWeeklyExpressionsAudioPlayer() {
    const selectedMp3 = progress?.weeks?.[currentWeek]?.weekly_expressions?.mp3_file || '';
    if (selectedMp3) {
        updateWeeklyExpressionsAudioPlayer(selectedMp3);
    }
}

// Update the weekly expressions audio player
function updateWeeklyExpressionsAudioPlayer(mp3File) {
    if (!mp3File) return;
    
    const audioSection = document.getElementById(`weekly-expressions-audio-section-${currentWeek}`);
    if (audioSection) {
        // Get current speed if audio element exists
        const existingAudio = document.getElementById(`audio-player-weekly-expressions-${currentWeek}`);
        const currentSpeed = existingAudio ? existingAudio.playbackRate : 1.0;
        
        audioSection.innerHTML = `
            <div class="audio-player-label" style="margin-bottom: 8px; font-weight: bold;">${escapeHtml(mp3File)}</div>
            <div class="audio-player-container">
                <div class="audio-player-with-options">
                    <div class="audio-player-wrapper-custom">
                        <audio id="audio-player-weekly-expressions-${currentWeek}" data-week="${currentWeek}">
                            <source src="/api/weekly-expressions/mp3/${encodeURIComponent(mp3File)}" type="audio/mpeg">
                            Your browser does not support the audio element.
                        </audio>
                        <div class="custom-audio-controls" id="controls-weekly-expressions-${currentWeek}">
                            <button class="play-pause-btn" onclick="toggleWeeklyExpressionsPlayPause('${currentWeek}')">▶</button>
                        <div class="progress-bar-container" onclick="seekWeeklyExpressionsAudio('${currentWeek}', event)">
                            <div class="progress-bar" id="progress-weekly-expressions-${currentWeek}"></div>
                            <div class="progress-playhead" id="playhead-weekly-expressions-${currentWeek}"></div>
                        </div>
                            <span class="time-display" id="time-weekly-expressions-${currentWeek}">0:00 / 0:00</span>
                        </div>
                    </div>
                </div>
            </div>
            <div style="display: flex; gap: 8px; justify-content: flex-start; flex-wrap: wrap; margin-top: 10px;">
                <button class="speed-btn" onclick="setWeeklyExpressionsSpeed('${currentWeek}', '1.0')" data-speed="1.0" style="padding: 6px 16px; border: 1px solid #ddd; border-radius: 4px; background: ${currentSpeed === 1.0 ? '#4a90e2' : '#fff'}; color: ${currentSpeed === 1.0 ? '#fff' : '#333'}; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; min-width: 65px; width: 65px; text-align: center; box-sizing: border-box;">1.0x</button>
                <button class="speed-btn" onclick="setWeeklyExpressionsSpeed('${currentWeek}', '1.2')" data-speed="1.2" style="padding: 6px 16px; border: 1px solid #ddd; border-radius: 4px; background: ${currentSpeed === 1.2 ? '#4a90e2' : '#fff'}; color: ${currentSpeed === 1.2 ? '#fff' : '#333'}; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; min-width: 65px; width: 65px; text-align: center; box-sizing: border-box;">1.2x</button>
                <button class="speed-btn" onclick="setWeeklyExpressionsSpeed('${currentWeek}', '1.4')" data-speed="1.4" style="padding: 6px 16px; border: 1px solid #ddd; border-radius: 4px; background: ${currentSpeed === 1.4 ? '#4a90e2' : '#fff'}; color: ${currentSpeed === 1.4 ? '#fff' : '#333'}; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; min-width: 65px; width: 65px; text-align: center; box-sizing: border-box;">1.4x</button>
                <button class="speed-btn" onclick="setWeeklyExpressionsSpeed('${currentWeek}', '1.6')" data-speed="1.6" style="padding: 6px 16px; border: 1px solid #ddd; border-radius: 4px; background: ${currentSpeed === 1.6 ? '#4a90e2' : '#fff'}; color: ${currentSpeed === 1.6 ? '#fff' : '#333'}; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; min-width: 65px; width: 65px; text-align: center; box-sizing: border-box;">1.6x</button>
            </div>
        `;
        
        // Set up audio event listeners after creating the audio element
        setTimeout(() => {
            setupWeeklyExpressionsAudioControls(currentWeek, currentSpeed);
        }, 100);
    }
}

// Set playback speed for weekly expressions audio
function setWeeklyExpressionsSpeed(weekKey, speed) {
    const audioElement = document.getElementById(`audio-player-weekly-expressions-${weekKey}`);
    if (audioElement) {
        const speedValue = parseFloat(speed) || 1.0;
        audioElement.playbackRate = speedValue;
        // Update button styles
        updateSpeedButtonStyles(weekKey, speedValue);
    }
}

// Toggle play/pause for weekly expressions audio
function toggleWeeklyExpressionsPlayPause(weekKey) {
    const audioElement = document.getElementById(`audio-player-weekly-expressions-${weekKey}`);
    if (!audioElement) return;
    
    if (audioElement.paused) {
        audioElement.play();
    } else {
        audioElement.pause();
    }
    
    // Update play/pause button
    updateWeeklyExpressionsPlayPauseButton(weekKey);
}

// Update play/pause button for weekly expressions
function updateWeeklyExpressionsPlayPauseButton(weekKey) {
    const audioElement = document.getElementById(`audio-player-weekly-expressions-${weekKey}`);
    if (!audioElement) return;
    
    const controls = document.getElementById(`controls-weekly-expressions-${weekKey}`);
    if (controls) {
        const playPauseBtn = controls.querySelector('.play-pause-btn');
        if (playPauseBtn) {
            playPauseBtn.textContent = audioElement.paused ? '▶' : '⏸';
        }
    }
}

// Seek audio for weekly expressions
function seekWeeklyExpressionsAudio(weekKey, event) {
    const audioElement = document.getElementById(`audio-player-weekly-expressions-${weekKey}`);
    const container = event.currentTarget || event.target.closest('.progress-bar-container');
    if (!audioElement || !container || !audioElement.duration) return;
    
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    audioElement.currentTime = percent * audioElement.duration;
    
    // Update progress bar and playhead immediately
    updateWeeklyExpressionsProgressBar(weekKey, percent);
}

// Skip audio for weekly expressions (seconds can be positive or negative)
function skipWeeklyExpressionsAudio(weekKey, seconds) {
    const audioElement = document.getElementById(`audio-player-weekly-expressions-${weekKey}`);
    if (!audioElement || !audioElement.duration) return;
    
    const newTime = Math.max(0, Math.min(audioElement.duration, audioElement.currentTime + seconds));
    audioElement.currentTime = newTime;
    
    // Update progress bar and playhead immediately
    const percent = newTime / audioElement.duration;
    updateWeeklyExpressionsProgressBar(weekKey, percent);
    
    // Update time display
    const timeDisplay = document.getElementById(`time-weekly-expressions-${weekKey}`);
    if (timeDisplay) {
        updateTimeDisplay(audioElement, timeDisplay);
    }
}

// Update progress bar and playhead for weekly expressions
function updateWeeklyExpressionsProgressBar(weekKey, percent) {
    const progressBar = document.getElementById(`progress-weekly-expressions-${weekKey}`);
    const playhead = document.getElementById(`playhead-weekly-expressions-${weekKey}`);
    
    if (progressBar) {
        progressBar.style.width = (percent * 100) + '%';
    }
    if (playhead) {
        playhead.style.left = (percent * 100) + '%';
    }
}

// Handle dragging for weekly expressions audio
function setupWeeklyExpressionsAudioDrag(weekKey) {
    const container = document.querySelector(`#controls-weekly-expressions-${weekKey} .progress-bar-container`);
    const playhead = document.getElementById(`playhead-weekly-expressions-${weekKey}`);
    const audioElement = document.getElementById(`audio-player-weekly-expressions-${weekKey}`);
    
    if (!container || !audioElement) return;
    
    let isDragging = false;
    
    const handleMove = (clientX) => {
        if (!audioElement.duration) return;
        const rect = container.getBoundingClientRect();
        const x = clientX - rect.left;
        const percent = Math.max(0, Math.min(1, x / rect.width));
        audioElement.currentTime = percent * audioElement.duration;
        updateWeeklyExpressionsProgressBar(weekKey, percent);
    };
    
    const startDrag = (e) => {
        isDragging = true;
        if (playhead) {
            playhead.style.transition = 'none';
        }
        handleMove(e.clientX);
        e.preventDefault();
        e.stopPropagation();
    };
    
    // Make playhead draggable
    if (playhead) {
        playhead.addEventListener('mousedown', (e) => {
            startDrag(e);
        });
    }
    
    // Make container draggable
    container.addEventListener('mousedown', (e) => {
        startDrag(e);
    });
    
    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            handleMove(e.clientX);
        }
    });
    
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            if (playhead) {
                playhead.style.transition = 'left 0.1s linear';
            }
        }
    });
}

// Set up audio controls event listeners for weekly expressions
function setupWeeklyExpressionsAudioControls(weekKey, initialSpeed) {
    const audioElement = document.getElementById(`audio-player-weekly-expressions-${weekKey}`);
    const playPauseBtn = document.querySelector(`#controls-weekly-expressions-${weekKey} .play-pause-btn`);
    const progressBar = document.getElementById(`progress-weekly-expressions-${weekKey}`);
    const timeDisplay = document.getElementById(`time-weekly-expressions-${weekKey}`);
    
    if (!audioElement) return;
    
    // Set up drag functionality
    setupWeeklyExpressionsAudioDrag(weekKey);
    
    // Set initial playback speed
    if (initialSpeed) {
        audioElement.playbackRate = initialSpeed;
    }
    
    // Update play/pause button
    function updatePlayPauseButton() {
        if (playPauseBtn) {
            playPauseBtn.textContent = audioElement.paused ? '▶' : '⏸';
        }
    }
    
    // Update progress bar
    function updateProgressBar() {
        if (progressBar && audioElement.duration) {
            const percent = (audioElement.currentTime / audioElement.duration) * 100;
            progressBar.style.width = percent + '%';
            
            // Update playhead position
            const playheadId = progressBar.id.replace('progress-', 'playhead-');
            const playhead = document.getElementById(playheadId);
            if (playhead) {
                playhead.style.left = percent + '%';
            }
        }
    }
    
    // Update time display
    function updateTimeDisplayFunc() {
        if (timeDisplay && audioElement.duration) {
            updateTimeDisplay(audioElement, timeDisplay);
        }
    }
    
    // Event listeners
    audioElement.addEventListener('play', updatePlayPauseButton);
    audioElement.addEventListener('pause', updatePlayPauseButton);
    audioElement.addEventListener('timeupdate', () => {
        updateProgressBar();
        updateTimeDisplayFunc();
    });
    audioElement.addEventListener('loadedmetadata', () => {
        updateTimeDisplayFunc();
    });
    
    // Initial update
    updatePlayPauseButton();
    updateProgressBar();
    updateTimeDisplayFunc();
}

// Set up all weekly expressions audio controls on page load
function setupAllWeeklyExpressionsAudioControls() {
    if (!currentWeek) return;
    const audioElement = document.getElementById(`audio-player-weekly-expressions-${currentWeek}`);
    if (audioElement) {
        const currentSpeed = audioElement.playbackRate || 1.0;
        setupWeeklyExpressionsAudioControls(currentWeek, currentSpeed);
    }
}

// Update speed button styles to show which one is active
function updateSpeedButtonStyles(weekKey, activeSpeed) {
    const buttons = document.querySelectorAll(`[onclick*="setWeeklyExpressionsSpeed('${weekKey}'"]`);
    buttons.forEach(btn => {
        const btnSpeed = parseFloat(btn.getAttribute('data-speed') || btn.textContent.replace('x', ''));
        if (Math.abs(btnSpeed - activeSpeed) < 0.01) {
            btn.style.background = '#4a90e2';
            btn.style.color = '#fff';
            btn.style.borderColor = '#4a90e2';
        } else {
            btn.style.background = '#fff';
            btn.style.color = '#333';
            btn.style.borderColor = '#ddd';
        }
    });
}

// Set playback speed for weekly expressions audio in day view
function setWeeklyExpressionsDaySpeed(dayId, speed) {
    const audioElement = document.getElementById(`weekly-expressions-audio-day-${dayId}`);
    if (audioElement) {
        const speedValue = parseFloat(speed) || 1.0;
        audioElement.playbackRate = speedValue;
        // Update button styles
        updateSpeedButtonStylesDay(dayId, speedValue);
    }
}

// Update speed button styles for day view
function updateSpeedButtonStylesDay(dayId, activeSpeed) {
    const buttons = document.querySelectorAll(`[onclick*="setWeeklyExpressionsDaySpeed('${dayId}'"]`);
    buttons.forEach(btn => {
        const btnSpeed = parseFloat(btn.getAttribute('data-speed') || btn.textContent.replace('x', ''));
        if (Math.abs(btnSpeed - activeSpeed) < 0.01) {
            btn.style.background = '#4a90e2';
            btn.style.color = '#fff';
            btn.style.borderColor = '#4a90e2';
        } else {
            btn.style.background = '#fff';
            btn.style.color = '#333';
            btn.style.borderColor = '#ddd';
        }
    });
}

// Select MP3 file for weekly expressions
async function selectMp3File(weekKey, mp3File) {
    if (!mp3File) return;
    
    try {
        const response = await fetch('/api/weekly-expressions/select-mp3', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                week_key: weekKey,
                mp3_file: mp3File
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
            // Update progress with the full response
            progress = data.progress;
            
            // Update the selected MP3 file
            const selectedMp3 = mp3File;
            
            // Re-render the activity to show the audio player
            renderActivities();
            
            // Wait a bit for DOM to update, then update audio player
            setTimeout(() => {
                updateWeeklyExpressionsAudioPlayer(selectedMp3);
            }, 100);
        } else {
            throw new Error(data.error || 'Failed to select MP3 file');
        }
    } catch (error) {
        console.error('Error selecting MP3 file:', error);
        showError(`Failed to select MP3 file: ${error.message}`);
    }
}

function togglePlayPause(sourceType, weekKey, scriptNum) {
    const audioElement = document.getElementById(`audio-player-${sourceType}-${weekKey}-${scriptNum}`);
    if (!audioElement) return;
    
    if (audioElement.paused) {
        audioElement.play();
    } else {
        audioElement.pause();
    }
    
    // Update play/pause button immediately
    updateShadowingPlayPauseButton(sourceType, weekKey, scriptNum);
}

function seekAudio(sourceType, weekKey, scriptNum, event) {
    const audioElement = document.getElementById(`audio-player-${sourceType}-${weekKey}-${scriptNum}`);
    const container = event.currentTarget;
    if (!audioElement || !container || !audioElement.duration) return;
    
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    audioElement.currentTime = percent * audioElement.duration;
    
    // Update progress bar and playhead immediately
    updateShadowingProgressBar(sourceType, weekKey, scriptNum, percent);
}

// Skip audio for shadowing practice (seconds can be positive or negative)
function skipShadowingAudio(sourceType, weekKey, scriptNum, seconds) {
    const audioElement = document.getElementById(`audio-player-${sourceType}-${weekKey}-${scriptNum}`);
    if (!audioElement || !audioElement.duration) return;
    
    const newTime = Math.max(0, Math.min(audioElement.duration, audioElement.currentTime + seconds));
    audioElement.currentTime = newTime;
    
    // Update progress bar and playhead immediately
    const percent = newTime / audioElement.duration;
    updateShadowingProgressBar(sourceType, weekKey, scriptNum, percent);
    
    // Update time display
    const timeDisplay = document.getElementById(`time-${sourceType}-${weekKey}-${scriptNum}`);
    if (timeDisplay) {
        updateTimeDisplay(audioElement, timeDisplay);
    }
}

// Update progress bar and playhead for shadowing practice
function updateShadowingProgressBar(sourceType, weekKey, scriptNum, percent) {
    const progressBar = document.getElementById(`progress-${sourceType}-${weekKey}-${scriptNum}`);
    const playhead = document.getElementById(`playhead-${sourceType}-${weekKey}-${scriptNum}`);
    
    if (progressBar) {
        progressBar.style.width = (percent * 100) + '%';
    }
    if (playhead) {
        playhead.style.left = (percent * 100) + '%';
    }
}

// Handle dragging for shadowing practice audio
function setupShadowingAudioDrag(sourceType, weekKey, scriptNum) {
    const container = document.querySelector(`#controls-${sourceType}-${weekKey}-${scriptNum} .progress-bar-container`);
    const playhead = document.getElementById(`playhead-${sourceType}-${weekKey}-${scriptNum}`);
    const audioElement = document.getElementById(`audio-player-${sourceType}-${weekKey}-${scriptNum}`);
    
    if (!container || !audioElement) return;
    
    let isDragging = false;
    
    const handleMove = (clientX) => {
        if (!audioElement.duration) return;
        const rect = container.getBoundingClientRect();
        const x = clientX - rect.left;
        const percent = Math.max(0, Math.min(1, x / rect.width));
        audioElement.currentTime = percent * audioElement.duration;
        updateShadowingProgressBar(sourceType, weekKey, scriptNum, percent);
    };
    
    const startDrag = (e) => {
        isDragging = true;
        if (playhead) {
            playhead.style.transition = 'none';
        }
        handleMove(e.clientX);
        e.preventDefault();
        e.stopPropagation();
    };
    
    // Make playhead draggable
    if (playhead) {
        playhead.addEventListener('mousedown', (e) => {
            startDrag(e);
        });
    }
    
    // Make container draggable
    container.addEventListener('mousedown', (e) => {
        startDrag(e);
    });
    
    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            handleMove(e.clientX);
        }
    });
    
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            if (playhead) {
                playhead.style.transition = 'left 0.1s linear';
            }
        }
    });
}

function updateTimeDisplay(audioElement, timeDisplay) {
    if (!timeDisplay || !audioElement.duration) return;
    
    const current = formatTime(audioElement.currentTime);
    const total = formatTime(audioElement.duration);
    // Explicitly style the colon to prevent blue dot rendering issue
    const currentParts = current.split(':');
    const totalParts = total.split(':');
    timeDisplay.innerHTML = `<span>${currentParts[0]}</span><span style="color: #666;">:</span><span>${currentParts[1]}</span> <span style="color: #666;">/</span> <span>${totalParts[0]}</span><span style="color: #666;">:</span><span>${totalParts[1]}</span>`;
}

// Set playback speed for audio player
function setPlaybackSpeed(sourceType, weekKey, scriptNum, speed) {
    const audioElement = document.getElementById(`audio-player-${sourceType}-${weekKey}-${scriptNum}`);
    if (audioElement) {
        const speedValue = parseFloat(speed) || 1.0;
        audioElement.playbackRate = speedValue;
    }
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Best Answer Audio Player Functions (for shadowing mode)
function toggleBestAnswerPlayPause(sourceType, weekKey) {
    const audioElement = document.getElementById(`audio-player-${sourceType}-best-answer-${weekKey}`);
    if (!audioElement) return;
    
    if (audioElement.paused) {
        // Pause other audio sources
        const otherSource = sourceType === 'typecast' ? 'openai' : 'typecast';
        const otherAudio = document.getElementById(`audio-player-${otherSource}-best-answer-${weekKey}`);
        if (otherAudio && !otherAudio.paused) {
            otherAudio.pause();
            updateBestAnswerPlayPauseButton(otherSource, weekKey);
        }
        audioElement.play();
    } else {
        audioElement.pause();
    }
    updateBestAnswerPlayPauseButton(sourceType, weekKey);
}

function updateBestAnswerPlayPauseButton(sourceType, weekKey) {
    const audioElement = document.getElementById(`audio-player-${sourceType}-best-answer-${weekKey}`);
    const playPauseBtn = document.querySelector(`#controls-${sourceType}-best-answer-${weekKey} .play-pause-btn`);
    if (playPauseBtn && audioElement) {
        playPauseBtn.textContent = audioElement.paused ? '▶' : '⏸';
    }
}

function skipBestAnswerAudio(sourceType, weekKey, seconds) {
    const audioElement = document.getElementById(`audio-player-${sourceType}-best-answer-${weekKey}`);
    if (!audioElement || !audioElement.duration) return;
    
    const newTime = Math.max(0, Math.min(audioElement.duration, audioElement.currentTime + seconds));
    audioElement.currentTime = newTime;
    
    // Update progress bar
    const progressBar = document.getElementById(`progress-${sourceType}-best-answer-${weekKey}`);
    const playhead = document.getElementById(`playhead-${sourceType}-best-answer-${weekKey}`);
    if (progressBar && audioElement.duration) {
        const percent = newTime / audioElement.duration;
        progressBar.style.width = (percent * 100) + '%';
        if (playhead) {
            playhead.style.left = (percent * 100) + '%';
        }
    }
    
    // Update time display
    const timeDisplay = document.getElementById(`time-${sourceType}-best-answer-${weekKey}`);
    if (timeDisplay) {
        updateTimeDisplay(audioElement, timeDisplay);
    }
}

function seekBestAnswerAudio(sourceType, weekKey, event) {
    const audioElement = document.getElementById(`audio-player-${sourceType}-best-answer-${weekKey}`);
    const container = event.currentTarget;
    if (!audioElement || !audioElement.duration || !container) return;
    
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    audioElement.currentTime = percent * audioElement.duration;
    
    // Update progress bar
    const progressBar = document.getElementById(`progress-${sourceType}-best-answer-${weekKey}`);
    const playhead = document.getElementById(`playhead-${sourceType}-best-answer-${weekKey}`);
    if (progressBar) {
        progressBar.style.width = (percent * 100) + '%';
    }
    if (playhead) {
        playhead.style.left = (percent * 100) + '%';
    }
    
    // Update time display
    const timeDisplay = document.getElementById(`time-${sourceType}-best-answer-${weekKey}`);
    if (timeDisplay) {
        updateTimeDisplay(audioElement, timeDisplay);
    }
}

async function generateBestAnswerAudio(weekKey, buttonElement) {
    if (!weekKey) weekKey = currentWeek;
    
    const button = buttonElement;
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Generating...';
    
    try {
        const response = await fetch('/api/generate-weekly-prompt-audio', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                week_key: weekKey
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Failed to generate audio' }));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            // Reload progress and refresh UI
            await loadData();
            showSuccess('Audio generated successfully!');
        } else {
            showError(data.error || 'Failed to generate audio');
        }
    } catch (error) {
        console.error('Error generating audio:', error);
        showError('Failed to generate audio: ' + error.message);
    } finally {
        button.disabled = false;
        button.textContent = originalText;
    }
}

// Set up audio controls for best answer audio player
function setupBestAnswerAudioControls(sourceType, weekKey) {
    const audioElement = document.getElementById(`audio-player-${sourceType}-best-answer-${weekKey}`);
    const playPauseBtn = document.querySelector(`#controls-${sourceType}-best-answer-${weekKey} .play-pause-btn`);
    const progressBar = document.getElementById(`progress-${sourceType}-best-answer-${weekKey}`);
    const timeDisplay = document.getElementById(`time-${sourceType}-best-answer-${weekKey}`);
    
    if (!audioElement) return;
    
    // Set up drag functionality
    setupBestAnswerAudioDrag(sourceType, weekKey);
    
    // Update play/pause button
    function updatePlayPauseButton() {
        if (playPauseBtn) {
            playPauseBtn.textContent = audioElement.paused ? '▶' : '⏸';
        }
    }
    
    // Update progress bar
    function updateProgressBar() {
        if (progressBar && audioElement.duration) {
            const percent = (audioElement.currentTime / audioElement.duration) * 100;
            progressBar.style.width = percent + '%';
            
            // Update playhead position
            const playheadId = progressBar.id.replace('progress-', 'playhead-');
            const playhead = document.getElementById(playheadId);
            if (playhead) {
                playhead.style.left = percent + '%';
            }
        }
    }
    
    // Update time display
    function updateTimeDisplayFunc() {
        if (timeDisplay && audioElement.duration) {
            updateTimeDisplay(audioElement, timeDisplay);
        }
    }
    
    // Event listeners
    audioElement.addEventListener('timeupdate', () => {
        updateProgressBar();
        updateTimeDisplayFunc();
    });
    
    audioElement.addEventListener('loadedmetadata', () => {
        updateTimeDisplayFunc();
    });
    
    audioElement.addEventListener('play', updatePlayPauseButton);
    audioElement.addEventListener('pause', updatePlayPauseButton);
    
    // Initial update
    updatePlayPauseButton();
    updateTimeDisplayFunc();
}

// Set up drag functionality for best answer audio
function setupBestAnswerAudioDrag(sourceType, weekKey) {
    const container = document.querySelector(`#controls-${sourceType}-best-answer-${weekKey} .progress-bar-container`);
    const playhead = document.getElementById(`playhead-${sourceType}-best-answer-${weekKey}`);
    const audioElement = document.getElementById(`audio-player-${sourceType}-best-answer-${weekKey}`);
    
    if (!container || !audioElement) return;
    
    let isDragging = false;
    
    const handleMove = (clientX) => {
        if (!audioElement.duration) return;
        const rect = container.getBoundingClientRect();
        const x = clientX - rect.left;
        const percent = Math.max(0, Math.min(1, x / rect.width));
        audioElement.currentTime = percent * audioElement.duration;
        updateBestAnswerProgressBar(sourceType, weekKey, percent);
    };
    
    const startDrag = (e) => {
        isDragging = true;
        if (playhead) {
            playhead.style.transition = 'none';
        }
        handleMove(e.clientX);
        e.preventDefault();
        e.stopPropagation();
    };
    
    // Make playhead draggable
    if (playhead) {
        playhead.addEventListener('mousedown', (e) => {
            startDrag(e);
        });
    }
    
    // Make container draggable
    container.addEventListener('mousedown', (e) => {
        startDrag(e);
    });
    
    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            handleMove(e.clientX);
        }
    });
    
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            if (playhead) {
                playhead.style.transition = 'left 0.1s linear';
            }
        }
    });
}

// Update progress bar for best answer audio
function updateBestAnswerProgressBar(sourceType, weekKey, percent) {
    const progressBar = document.getElementById(`progress-${sourceType}-best-answer-${weekKey}`);
    const playhead = document.getElementById(`playhead-${sourceType}-best-answer-${weekKey}`);
    
    if (progressBar) {
        progressBar.style.width = (percent * 100) + '%';
    }
    if (playhead) {
        playhead.style.left = (percent * 100) + '%';
    }
}

// Set up audio controls event listeners for shadowing practice
function setupShadowingAudioControls(sourceType, weekKey, scriptNum) {
    const audioElement = document.getElementById(`audio-player-${sourceType}-${weekKey}-${scriptNum}`);
    const playPauseBtn = document.querySelector(`#controls-${sourceType}-${weekKey}-${scriptNum} .play-pause-btn`);
    const progressBar = document.getElementById(`progress-${sourceType}-${weekKey}-${scriptNum}`);
    const timeDisplay = document.getElementById(`time-${sourceType}-${weekKey}-${scriptNum}`);
    
    if (!audioElement) return;
    
    // Restore saved playback speed for typecast audio
    if (sourceType === 'typecast') {
        const savedSpeed = parseFloat(localStorage.getItem(`shadowing_typecast_speed_${weekKey}_${scriptNum}`)) || 1.0;
        audioElement.playbackRate = savedSpeed;
        updateShadowingTypecastSpeedButtonStyles(weekKey, scriptNum, savedSpeed);
    }
    
    // Set up drag functionality
    setupShadowingAudioDrag(sourceType, weekKey, scriptNum);
    
    // Update play/pause button
    function updatePlayPauseButton() {
        if (playPauseBtn) {
            playPauseBtn.textContent = audioElement.paused ? '▶' : '⏸';
        }
    }
    
    // Update progress bar
    function updateProgressBar() {
        if (progressBar && audioElement.duration) {
            const percent = (audioElement.currentTime / audioElement.duration) * 100;
            progressBar.style.width = percent + '%';
            
            // Update playhead position
            const playheadId = progressBar.id.replace('progress-', 'playhead-');
            const playhead = document.getElementById(playheadId);
            if (playhead) {
                playhead.style.left = percent + '%';
            }
        }
    }
    
    // Update time display
    function updateTimeDisplayFunc() {
        if (timeDisplay && audioElement.duration) {
            updateTimeDisplay(audioElement, timeDisplay);
        }
    }
    
    // Event listeners
    audioElement.addEventListener('play', updatePlayPauseButton);
    audioElement.addEventListener('pause', updatePlayPauseButton);
    audioElement.addEventListener('timeupdate', () => {
        updateProgressBar();
        updateTimeDisplayFunc();
    });
    audioElement.addEventListener('loadedmetadata', () => {
        updateTimeDisplayFunc();
    });
    
    // Initial update
    updatePlayPauseButton();
    updateProgressBar();
    updateTimeDisplayFunc();
}

// Update play/pause button for shadowing practice (called from togglePlayPause)
function updateShadowingPlayPauseButton(sourceType, weekKey, scriptNum) {
    const audioElement = document.getElementById(`audio-player-${sourceType}-${weekKey}-${scriptNum}`);
    const playPauseBtn = document.querySelector(`#controls-${sourceType}-${weekKey}-${scriptNum} .play-pause-btn`);
    if (audioElement && playPauseBtn) {
        playPauseBtn.textContent = audioElement.paused ? '▶' : '⏸';
    }
}

// Set up all shadowing practice audio controls on page load
function setupAllShadowingAudioControls() {
    if (!currentWeek) return;
    
    // Set up controls for all shadowing practice audio players
    const sourceTypes = ['typecast', 'openai'];
    const scriptNums = [1, 2];
    
    sourceTypes.forEach(sourceType => {
        scriptNums.forEach(scriptNum => {
            const audioElement = document.getElementById(`audio-player-${sourceType}-${currentWeek}-${scriptNum}`);
            if (audioElement) {
                setupShadowingAudioControls(sourceType, currentWeek, scriptNum);
            }
        });
    });
    
}

// Shadowing Practice Audio Controls
function setShadowingTypecastSpeed(weekKey, scriptNum, speed) {
    const audioElement = document.getElementById(`audio-player-typecast-${weekKey}-${scriptNum}`);
    if (audioElement) {
        const speedValue = parseFloat(speed) || 1.0;
        audioElement.playbackRate = speedValue;
        localStorage.setItem(`shadowing_typecast_speed_${weekKey}_${scriptNum}`, speedValue);
        updateShadowingTypecastSpeedButtonStyles(weekKey, scriptNum, speedValue);
    }
}

function updateShadowingTypecastSpeedButtonStyles(weekKey, scriptNum, activeSpeed) {
    const scriptContent = document.getElementById(`script-${weekKey}-${scriptNum}`);
    if (!scriptContent) return;
    
    const buttons = scriptContent.querySelectorAll('.speed-btn');
    buttons.forEach(btn => {
        const btnSpeed = parseFloat(btn.getAttribute('data-speed') || btn.textContent.replace('x', ''));
        if (Math.abs(btnSpeed - activeSpeed) < 0.01) {
            btn.style.background = '#4a90e2';
            btn.style.color = '#fff';
            btn.style.borderColor = '#4a90e2';
        } else {
            btn.style.background = '#fff';
            btn.style.color = '#333';
            btn.style.borderColor = '#ddd';
        }
    });
}

// Podcast Shadowing Audio Controls
function setPodcastShadowingSpeed(weekKey, speed) {
    const audioElement = document.getElementById(`audio-player-podcast-shadowing-${weekKey}`);
    if (audioElement) {
        const speedValue = parseFloat(speed) || 1.0;
        audioElement.playbackRate = speedValue;
        localStorage.setItem(`podcast_shadowing_speed_${weekKey}`, speedValue);
        updatePodcastShadowingSpeedButtonStyles(weekKey, speedValue);
    }
}

function updatePodcastShadowingSpeedButtonStyles(weekKey, activeSpeed) {
    const buttons = document.querySelectorAll(`#podcast-script-${weekKey}-1 .speed-btn`);
    buttons.forEach(btn => {
        const btnSpeed = parseFloat(btn.getAttribute('data-speed') || btn.textContent.replace('x', ''));
        if (Math.abs(btnSpeed - activeSpeed) < 0.01) {
            btn.style.background = '#4a90e2';
            btn.style.color = '#fff';
            btn.style.borderColor = '#4a90e2';
        } else {
            btn.style.background = '#fff';
            btn.style.color = '#333';
            btn.style.borderColor = '#ddd';
        }
    });
}

function togglePodcastShadowingPlayPause(weekKey) {
    const audioElement = document.getElementById(`audio-player-podcast-shadowing-${weekKey}`);
    if (!audioElement) return;
    
    if (audioElement.paused) {
        audioElement.play();
    } else {
        audioElement.pause();
    }
    
    updatePodcastShadowingPlayPauseButton(weekKey);
}

function updatePodcastShadowingPlayPauseButton(weekKey) {
    const audioElement = document.getElementById(`audio-player-podcast-shadowing-${weekKey}`);
    if (!audioElement) return;
    
    const controls = document.getElementById(`controls-podcast-shadowing-${weekKey}`);
    if (controls) {
        const playPauseBtn = controls.querySelector('.play-pause-btn');
        if (playPauseBtn) {
            playPauseBtn.textContent = audioElement.paused ? '▶' : '⏸';
        }
    }
}

function seekPodcastShadowingAudio(weekKey, event) {
    const audioElement = document.getElementById(`audio-player-podcast-shadowing-${weekKey}`);
    const container = event.currentTarget || event.target.closest('.progress-bar-container');
    if (!audioElement || !container || !audioElement.duration) return;
    
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    audioElement.currentTime = percent * audioElement.duration;
    
    updatePodcastShadowingProgressBar(weekKey, percent);
}

function skipPodcastShadowingAudio(weekKey, seconds) {
    const audioElement = document.getElementById(`audio-player-podcast-shadowing-${weekKey}`);
    if (!audioElement || !audioElement.duration) return;
    
    const newTime = Math.max(0, Math.min(audioElement.duration, audioElement.currentTime + seconds));
    audioElement.currentTime = newTime;
    
    const percent = newTime / audioElement.duration;
    updatePodcastShadowingProgressBar(weekKey, percent);
    
    const timeDisplay = document.getElementById(`time-podcast-shadowing-${weekKey}`);
    if (timeDisplay) {
        updateTimeDisplay(audioElement, timeDisplay);
    }
}

function updatePodcastShadowingProgressBar(weekKey, percent) {
    const progressBar = document.getElementById(`progress-podcast-shadowing-${weekKey}`);
    const playhead = document.getElementById(`playhead-podcast-shadowing-${weekKey}`);
    
    if (progressBar) {
        progressBar.style.width = (percent * 100) + '%';
    }
    if (playhead) {
        playhead.style.left = (percent * 100) + '%';
    }
}

function setupPodcastShadowingAudioDrag(weekKey) {
    const container = document.querySelector(`#controls-podcast-shadowing-${weekKey} .progress-bar-container`);
    const playhead = document.getElementById(`playhead-podcast-shadowing-${weekKey}`);
    const audioElement = document.getElementById(`audio-player-podcast-shadowing-${weekKey}`);
    
    if (!container || !audioElement) return;
    
    let isDragging = false;
    
    const handleMove = (clientX) => {
        if (!audioElement.duration) return;
        const rect = container.getBoundingClientRect();
        const x = clientX - rect.left;
        const percent = Math.max(0, Math.min(1, x / rect.width));
        audioElement.currentTime = percent * audioElement.duration;
        updatePodcastShadowingProgressBar(weekKey, percent);
    };
    
    const startDrag = (e) => {
        isDragging = true;
        if (playhead) {
            playhead.style.transition = 'none';
        }
        handleMove(e.clientX);
        e.preventDefault();
        e.stopPropagation();
    };
    
    if (playhead) {
        playhead.addEventListener('mousedown', (e) => {
            startDrag(e);
        });
    }
    
    container.addEventListener('mousedown', (e) => {
        startDrag(e);
    });
    
    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            handleMove(e.clientX);
        }
    });
    
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            if (playhead) {
                playhead.style.transition = 'left 0.1s linear';
            }
        }
    });
}

function setupPodcastShadowingAudioControls(weekKey, initialSpeed) {
    const audioElement = document.getElementById(`audio-player-podcast-shadowing-${weekKey}`);
    const playPauseBtn = document.querySelector(`#controls-podcast-shadowing-${weekKey} .play-pause-btn`);
    const progressBar = document.getElementById(`progress-podcast-shadowing-${weekKey}`);
    const timeDisplay = document.getElementById(`time-podcast-shadowing-${weekKey}`);
    
    if (!audioElement) return;
    
    setupPodcastShadowingAudioDrag(weekKey);
    
    if (initialSpeed) {
        audioElement.playbackRate = initialSpeed;
    }
    
    function updatePlayPauseButton() {
        if (playPauseBtn) {
            playPauseBtn.textContent = audioElement.paused ? '▶' : '⏸';
        }
    }
    
    function updateProgressBar() {
        if (progressBar && audioElement.duration) {
            const percent = (audioElement.currentTime / audioElement.duration) * 100;
            progressBar.style.width = percent + '%';
            
            const playheadId = progressBar.id.replace('progress-', 'playhead-');
            const playhead = document.getElementById(playheadId);
            if (playhead) {
                playhead.style.left = percent + '%';
            }
        }
    }
    
    function updateTimeDisplayFunc() {
        if (timeDisplay && audioElement.duration) {
            updateTimeDisplay(audioElement, timeDisplay);
        }
    }
    
    audioElement.addEventListener('play', updatePlayPauseButton);
    audioElement.addEventListener('pause', updatePlayPauseButton);
    audioElement.addEventListener('timeupdate', () => {
        updateProgressBar();
        updateTimeDisplayFunc();
    });
    audioElement.addEventListener('loadedmetadata', () => {
        updateTimeDisplayFunc();
    });
    
    updatePlayPauseButton();
}

// Podcast Typecast Audio Controls
function togglePodcastTypecastPlayPause(weekKey) {
    const audioElement = document.getElementById(`audio-player-typecast-podcast-${weekKey}`);
    if (!audioElement) return;
    
    if (audioElement.paused) {
        audioElement.play();
    } else {
        audioElement.pause();
    }
    
    updatePodcastTypecastPlayPauseButton(weekKey);
}

function updatePodcastTypecastPlayPauseButton(weekKey) {
    const audioElement = document.getElementById(`audio-player-typecast-podcast-${weekKey}`);
    if (!audioElement) return;
    
    const controls = document.getElementById(`controls-typecast-podcast-${weekKey}`);
    if (controls) {
        const playPauseBtn = controls.querySelector('.play-pause-btn');
        if (playPauseBtn) {
            playPauseBtn.textContent = audioElement.paused ? '▶' : '⏸';
        }
    }
}

function seekPodcastTypecastAudio(weekKey, event) {
    const audioElement = document.getElementById(`audio-player-typecast-podcast-${weekKey}`);
    const container = event.currentTarget || event.target.closest('.progress-bar-container');
    if (!audioElement || !container || !audioElement.duration) return;
    
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    audioElement.currentTime = percent * audioElement.duration;
    
    updatePodcastTypecastProgressBar(weekKey, percent);
}

function skipPodcastTypecastAudio(weekKey, seconds) {
    const audioElement = document.getElementById(`audio-player-typecast-podcast-${weekKey}`);
    if (!audioElement || !audioElement.duration) return;
    
    const newTime = Math.max(0, Math.min(audioElement.duration, audioElement.currentTime + seconds));
    audioElement.currentTime = newTime;
    
    const percent = newTime / audioElement.duration;
    updatePodcastTypecastProgressBar(weekKey, percent);
    
    const timeDisplay = document.getElementById(`time-typecast-podcast-${weekKey}`);
    if (timeDisplay) {
        updateTimeDisplay(audioElement, timeDisplay);
    }
}

function updatePodcastTypecastProgressBar(weekKey, percent) {
    const progressBar = document.getElementById(`progress-typecast-podcast-${weekKey}`);
    const playhead = document.getElementById(`playhead-typecast-podcast-${weekKey}`);
    
    if (progressBar) {
        progressBar.style.width = (percent * 100) + '%';
    }
    if (playhead) {
        playhead.style.left = (percent * 100) + '%';
    }
}

function setPodcastTypecastSpeed(weekKey, speed) {
    const audioElement = document.getElementById(`audio-player-typecast-podcast-${weekKey}`);
    if (!audioElement) return;
    
    const speedValue = parseFloat(speed);
    audioElement.playbackRate = speedValue;
    localStorage.setItem(`podcast_typecast_speed_${weekKey}`, speedValue);
    updatePodcastTypecastSpeedButtonStyles(weekKey, speedValue);
}

function updatePodcastTypecastSpeedButtonStyles(weekKey, activeSpeed) {
    // Find all speed buttons for this week's typecast player
    const container = document.getElementById(`podcast-script-${weekKey}-2`);
    if (!container) return;
    
    const speedButtons = container.querySelectorAll(`[onclick*="setPodcastTypecastSpeed('${weekKey}'"]`);
    speedButtons.forEach(btn => {
        const speed = parseFloat(btn.getAttribute('data-speed'));
        if (Math.abs(speed - activeSpeed) < 0.01) { // Use small epsilon for float comparison
            btn.style.background = '#4a90e2';
            btn.style.color = '#fff';
            btn.style.borderColor = '#4a90e2';
        } else {
            btn.style.background = '#fff';
            btn.style.color = '#333';
            btn.style.borderColor = '#ddd';
        }
    });
}

function setupPodcastTypecastAudioControls(weekKey) {
    const audioElement = document.getElementById(`audio-player-typecast-podcast-${weekKey}`);
    if (!audioElement) return;
    
    // Load saved speed or default to 1.0
    const savedSpeed = parseFloat(localStorage.getItem(`podcast_typecast_speed_${weekKey}`)) || 1.0;
    audioElement.playbackRate = savedSpeed;
    updatePodcastTypecastSpeedButtonStyles(weekKey, savedSpeed);
    
    audioElement.addEventListener('play', () => updatePodcastTypecastPlayPauseButton(weekKey));
    audioElement.addEventListener('pause', () => updatePodcastTypecastPlayPauseButton(weekKey));
    
    audioElement.addEventListener('timeupdate', () => {
        if (audioElement.duration) {
            const percent = audioElement.currentTime / audioElement.duration;
            updatePodcastTypecastProgressBar(weekKey, percent);
            
            const timeDisplay = document.getElementById(`time-typecast-podcast-${weekKey}`);
            if (timeDisplay) {
                updateTimeDisplay(audioElement, timeDisplay);
            }
        }
    });
    
    audioElement.addEventListener('loadedmetadata', () => {
        const timeDisplay = document.getElementById(`time-typecast-podcast-${weekKey}`);
        if (timeDisplay) {
            updateTimeDisplay(audioElement, timeDisplay);
        }
    });
}

function togglePodcastTypecastRegenOptions(weekKey, event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById(`audio-regen-podcast-typecast-${weekKey}`);
    if (!dropdown) return;
    
    const isVisible = dropdown.style.display !== 'none';
    dropdown.style.display = isVisible ? 'none' : 'block';
    
    if (!isVisible) {
        loadVoicesForPodcastTypecast(weekKey);
    }
}

async function loadVoicesForPodcastTypecast(weekKey) {
    const voiceSelectRegen = document.getElementById(`voice-select-regen-podcast-${weekKey}`);
    const voiceSelectGen = document.getElementById(`voice-select-podcast-${weekKey}`);
    
    if (voiceSelectRegen && voiceSelectRegen.options.length > 1) return;
    if (voiceSelectGen && voiceSelectGen.options.length > 1) return;
    
    try {
        const response = await fetch('/api/voices?t=' + Date.now()); // Add cache busting
        if (response.ok) {
            const data = await response.json();
            if (data.voices && Array.isArray(data.voices)) {
                const optionsHtml = '<option value="">Select voice...</option>' +
                    data.voices.map(voice => 
                        `<option value="${voice.voice_id || voice.id}">${voice.name || voice.voice_name || voice.id}</option>`
                    ).join('');
                
                if (voiceSelectRegen) {
                    voiceSelectRegen.innerHTML = optionsHtml;
                }
                if (voiceSelectGen) {
                    voiceSelectGen.innerHTML = optionsHtml;
                }
            }
        }
    } catch (error) {
        console.error('Error loading voices:', error);
    }
}

async function generatePodcastTypecastAudio(weekKey, buttonElement) {
    const button = buttonElement;
    const originalText = button.textContent;
    
    button.disabled = true;
    button.textContent = 'Generating...';
    
    try {
        const voiceSelect = document.getElementById(`voice-select-regen-podcast-${weekKey}`) || 
                           document.getElementById(`voice-select-podcast-${weekKey}`);
        const modelSelect = document.getElementById(`model-select-regen-podcast-${weekKey}`) || 
                           document.getElementById(`model-select-podcast-${weekKey}`);
        const speedSelect = document.getElementById(`speed-select-regen-podcast-${weekKey}`) || 
                           document.getElementById(`speed-select-podcast-${weekKey}`);
        
        const voiceId = voiceSelect ? voiceSelect.value : null;
        const model = modelSelect ? modelSelect.value : 'ssfm-v30';
        const speed = speedSelect ? parseFloat(speedSelect.value) : 1.0;
        
        if (!voiceId) {
            alert('Please select a voice');
            button.disabled = false;
            button.textContent = originalText;
            return;
        }
        
        const response = await fetch('/api/podcast-shadowing/generate-typecast-audio', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                week_key: weekKey,
                voice_id: voiceId,
                speed: speed,
                model: model
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status}` }));
            throw new Error(errorData.error || `Server error: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            location.reload();
        } else {
            throw new Error(data.error || 'Unknown error');
        }
    } catch (error) {
        console.error('Error generating audio:', error);
        const errorMessage = error.message || 'Failed to fetch';
        alert(`Error generating audio: ${errorMessage}`);
        button.disabled = false;
        button.textContent = originalText;
    }
}

async function loadPodcastShadowingTranscript(weekKey) {
    const transcriptElement = document.getElementById(`podcast-shadowing-transcript-${weekKey}`);
    if (!transcriptElement) return;
    
    try {
        const response = await fetch('/api/podcast-shadowing/transcript', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                week_key: weekKey,
                formatted: true
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Failed to load transcript' }));
            transcriptElement.innerHTML = `<div style="color: #999; font-style: italic;">${escapeHtml(errorData.error || 'Failed to load transcript')}</div>`;
            return;
        }
        
        const data = await response.json();
        if (data.success && data.transcript) {
            transcriptElement.textContent = data.transcript;
        } else {
            transcriptElement.innerHTML = '<div style="color: #999; font-style: italic;">No transcript available</div>';
        }
    } catch (error) {
        console.error('Error loading transcript:', error);
        transcriptElement.innerHTML = '<div style="color: #999; font-style: italic;">Error loading transcript</div>';
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    updateWeekList();
    await loadVoices();  // Load voices after initial data
    
    // Populate OpenAI voice dropdowns in generation sections
    setTimeout(() => {
        document.querySelectorAll('select[id*="voice-select-openai-"]').forEach(select => {
            if (select.id.includes('-1') || select.id.includes('-2')) {
                if (select.options.length <= 1) {
                    populateOpenAIVoiceDropdown(select.id);
                }
            }
        });
    }, 500);
});


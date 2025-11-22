/**
 * Base Activity Renderer Class
 * 
 * Refactoring Core: Template Method Pattern
 * 
 * [Before Refactoring]
 * - app.js's createActivityElement() function was 1,043 lines handling all activity types
 * - Large if-else blocks mixing logic for each activity type
 * - Risk of affecting other activities when modifying one
 * 
 * [After Refactoring]
 * - Separate Renderer class for each activity type
 * - Common logic implemented in base class (ActivityRenderer)
 * - Activity-specific logic implemented in subclasses
 * 
 * [Benefits]
 * 1. Single Responsibility Principle: Each Renderer handles only one activity
 * 2. Code Reuse: Common logic (checkboxes, kebab menu) provided by base class
 * 3. Easy Extension: Add new activity by creating new Renderer class
 * 4. Easy Testing: Each Renderer can be tested independently
 * 
 * [Usage Example]
 * class WeeklyExpressionsRenderer extends ActivityRenderer {
 *     render(activity, activityProgress, currentWeek) {
 *         // Rendering logic specific to Weekly Expressions
 *     }
 * }
 */
class ActivityRenderer {
    /**
     * Render activity element
     * 
     * Template Method Pattern: Method that must be implemented by subclasses
     * Each activity type implements different rendering logic
     * 
     * @param {Object} activity - Activity object
     * @param {Object} activityProgress - Progress data for this activity
     * @param {string} currentWeek - Current week key
     * @returns {HTMLElement} Activity DOM element
     */
    render(activity, activityProgress, currentWeek) {
        throw new Error('render() must be implemented by subclass');
    }

    /**
     * Render checkboxes for daily activities
     * 
     * Refactoring Core: Common Logic Extraction (DRY Principle)
     * 
     * [Before Refactoring]
     * - Checkbox HTML generated for each activity type within createActivityElement() function
     * - Same logic duplicated in multiple places (approx. 100 lines × 5 places = 500 lines duplicated)
     * 
     * [After Refactoring]
     * - Common logic extracted to base class method
     * - Reused by all daily activities (weekly_expressions, shadowing_practice, etc.)
     * - Activity-specific differences handled with conditionals
     * 
     * [Benefits]
     * - Code duplication removed: 500 lines → 130 lines
     * - Consistency ensured: All activity checkboxes have the same structure
     * - Easy maintenance: Checkbox logic changes only need to be made in one place
     * 
     * @param {Object} activity - Activity object
     * @param {Object} activityProgress - Progress data
     * @param {string} currentWeek - Current week key
     * @returns {string} HTML string for checkboxes
     */
    renderCheckboxes(activity, activityProgress, currentWeek) {
        // Check if this is a daily activity
        const dailyActivities = [
            ACTIVITY_IDS?.WEEKLY_EXPRESSIONS || 'weekly_expressions',
            ACTIVITY_IDS?.VOICE_JOURNALING || 'voice_journaling',
            ACTIVITY_IDS?.SHADOWING_PRACTICE || 'shadowing_practice',
            ACTIVITY_IDS?.WEEKLY_SPEAKING_PROMPT || 'weekly_speaking_prompt',
            ACTIVITY_IDS?.PODCAST_SHADOWING || 'podcast_shadowing'
        ];

        if (!dailyActivities.includes(activity.id)) {
            return '';
        }

        const daysCompleted = activityProgress?.completed_days || [];
        const daysOfWeek = getDaysOfWeek();
        
        // Get toggle function name based on activity type
        let toggleFunction = 'toggleActivity';
        if (activity.id === (ACTIVITY_IDS?.WEEKLY_EXPRESSIONS || 'weekly_expressions')) {
            toggleFunction = 'toggleWeeklyExpressionsDay';
        } else if (activity.id === (ACTIVITY_IDS?.PODCAST_SHADOWING || 'podcast_shadowing')) {
            toggleFunction = 'togglePodcastShadowingDay';
        } else if (activity.id === (ACTIVITY_IDS?.SHADOWING_PRACTICE || 'shadowing_practice')) {
            toggleFunction = 'toggleShadowingDay';
        } else if (activity.id === (ACTIVITY_IDS?.WEEKLY_SPEAKING_PROMPT || 'weekly_speaking_prompt')) {
            toggleFunction = 'togglePromptDay';
        } else if (activity.id === (ACTIVITY_IDS?.VOICE_JOURNALING || 'voice_journaling')) {
            toggleFunction = 'toggleVoiceJournalingDay';
        }

        // Helper function to check if a day is completed and get info (MP3 file for weekly_expressions, episode/chapter for podcast_shadowing)
        const getCompletedDayInfo = (dateStr) => {
            for (const entry of daysCompleted) {
                if (typeof entry === 'string' && entry === dateStr) {
                    return { completed: true, mp3_file: null, episode_name: null, chapter_name: null };
                } else if (typeof entry === 'object' && entry.day === dateStr) {
                    return { 
                        completed: true, 
                        mp3_file: entry.mp3_file || null,
                        episode_name: entry.episode_name || null,
                        chapter_name: entry.chapter_name || null
                    };
                }
            }
            return { completed: false, mp3_file: null, episode_name: null, chapter_name: null };
        };

        return `
            <div class="shadowing-days">
                ${daysOfWeek.map((day, index) => {
                    const dateStr = day.date;
                    const dayId = dateStr.replace(/-/g, '_');
                    const isPodcastShadowing = activity.id === (ACTIVITY_IDS?.PODCAST_SHADOWING || 'podcast_shadowing');
                    const isWeeklyExpressions = activity.id === (ACTIVITY_IDS?.WEEKLY_EXPRESSIONS || 'weekly_expressions');
                    const dayInfo = (isWeeklyExpressions || isPodcastShadowing)
                        ? getCompletedDayInfo(dateStr)
                        : { completed: daysCompleted.includes(dateStr), mp3_file: null, episode_name: null, chapter_name: null };
                    const isChecked = dayInfo.completed;
                    const mp3File = dayInfo.mp3_file;
                    const episodeName = dayInfo.episode_name;
                    const chapterName = dayInfo.chapter_name;
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
                                ${activity.id === (ACTIVITY_IDS?.VOICE_JOURNALING || 'voice_journaling') ? `<div class="daily-topic" id="${activity.id}_topic_${dayId}"></div>` : ''}
                                ${activity.id !== (ACTIVITY_IDS?.WEEKLY_EXPRESSIONS || 'weekly_expressions') ? `
                                <div class="recording-controls">
                                    <button id="${activity.id}_record_${dayId}" class="record-btn" onclick="startRecording('${activity.id}', '${dateStr}'); event.stopPropagation();" ${isChecked ? 'disabled' : ''}>🎤 Record</button>
                                    <button id="${activity.id}_stop_${dayId}" class="stop-btn" onclick="stopRecording(); event.stopPropagation();" style="display: none;">⏹ Stop</button>
                                    <span id="${activity.id}_timer_${dayId}" class="recording-timer" style="display: none;">00:00</span>
                                </div>
                                <div id="${activity.id}_visualizer_${dayId}" class="recording-visualizer" style="display: none;">
                                    <canvas id="${activity.id}_canvas_${dayId}" width="400" height="60"></canvas>
                                </div>
                                <div id="${activity.id}_recordings_${dayId}" class="recordings-list"></div>
                                ` : ''}
                                ${isWeeklyExpressions ? `
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
                                ${isPodcastShadowing && isChecked && (episodeName || chapterName) ? `
                                <div class="completed-chapter-info" style="margin-top: 10px; padding: 8px; background-color: #f0f0f0; border-radius: 4px; font-size: 0.85rem; color: #666;">
                                    <strong>Completed with:</strong> ${(episodeName && chapterName) ? `${escapeHtml(episodeName)} - ${escapeHtml(chapterName)}` : (episodeName ? escapeHtml(episodeName) : escapeHtml(chapterName || ''))}
                                </div>
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

    /**
     * Render kebab menu for activity options
     * @param {Object} activity - Activity object
     * @param {Object} activityProgress - Progress data
     * @param {string} currentWeek - Current week key
     * @returns {string} HTML string for kebab menu
     */
    renderKebabMenu(activity, activityProgress, currentWeek) {
        const hasContent = this.hasContent(activity, activityProgress);
        const showKebabMenu = activity.id === (ACTIVITY_IDS?.VOICE_JOURNALING || 'voice_journaling') ? hasContent : true;
        
        if (!showKebabMenu) {
            return '';
        }

        // Activity-specific menu content
        let menuContent = '';
        if (activity.id === (ACTIVITY_IDS?.WEEKLY_EXPRESSIONS || 'weekly_expressions')) {
            menuContent = `
                <button class="activity-option-btn" onclick="changeWeeklyExpressionsMP3('${currentWeek}', this); event.stopPropagation();">
                    ${hasContent ? 'Change MP3' : 'Generate MP3'}
                </button>
            `;
        } else if (activity.id === (ACTIVITY_IDS?.PODCAST_SHADOWING || 'podcast_shadowing')) {
            menuContent = `
                <div class="podcast-chapter-selector" style="padding: 12px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: bold;">Select Chapter</label>
                    <select id="podcast-video-select-${currentWeek}" class="voice-select-compact podcast-dropdown" style="margin-bottom: 8px; width: 100%; box-sizing: border-box;" onchange="const prevValue = this.dataset.prevValue || ''; this.dataset.prevValue = this.value; if (prevValue === this.value) { this.blur(); } else { updatePodcastChapterSelect('${currentWeek}'); } event.stopPropagation();" onfocus="this.dataset.prevValue = this.value;">
                        <option value="">Select video...</option>
                    </select>
                    <select id="podcast-chapter-select-${currentWeek}" class="voice-select-compact podcast-dropdown" style="margin-bottom: 8px; width: 100%; box-sizing: border-box;" onchange="event.stopPropagation();">
                        <option value="">Select chapter...</option>
                    </select>
                    <button class="activity-option-btn" onclick="changePodcastShadowingMP3('${currentWeek}', this); event.stopPropagation();" style="width: 100%; margin-top: 8px;">
                        ${hasContent ? 'Get' : 'Get'}
                    </button>
                </div>
            `;
        } else {
            menuContent = `
                <button class="activity-option-btn" onclick="regenerateActivity('${activity.id}', '${currentWeek}', this); event.stopPropagation();">
                    ${hasContent ? `Re-generate ${activity.title}` : `Generate ${activity.title}`}
                </button>
            `;
        }

        return `
            <button class="activity-kebab-btn" onclick="toggleActivityOptions('${activity.id}', '${currentWeek}', event); event.stopPropagation();" title="Options">⋮</button>
            <div class="activity-options-dropdown" id="activity-options-${activity.id}-${currentWeek}" style="display: none;">
                ${menuContent}
            </div>
        `;
    }

    /**
     * Check if activity has content
     * @param {Object} activity - Activity object
     * @param {Object} activityProgress - Progress data
     * @returns {boolean} True if activity has content
     */
    hasContent(activity, activityProgress) {
        const activityId = activity.id;
        if (activityId === (ACTIVITY_IDS?.VOICE_JOURNALING || 'voice_journaling')) {
            return activityProgress?.topics?.length > 0;
        } else if (activityId === (ACTIVITY_IDS?.SHADOWING_PRACTICE || 'shadowing_practice')) {
            return !!(activityProgress?.script1 || activityProgress?.script);
        } else if (activityId === (ACTIVITY_IDS?.WEEKLY_SPEAKING_PROMPT || 'weekly_speaking_prompt')) {
            return !!activityProgress?.prompt;
        } else if (activityId === (ACTIVITY_IDS?.WEEKLY_EXPRESSIONS || 'weekly_expressions')) {
            return !!activityProgress?.mp3_file;
        } else if (activityId === (ACTIVITY_IDS?.PODCAST_SHADOWING || 'podcast_shadowing')) {
            return !!activityProgress?.mp3_file;
        }
        return false;
    }

    /**
     * Build complete activity HTML
     * 
     * Refactoring Core: Composition Method
     * 
     * [Description]
     * - Assembles parts created by each Renderer to generate final HTML
     * - Maintains consistent common structure (header, action area)
     * - Only activity-specific content is inserted differently
     * 
     * [Before Refactoring]
     * - Each activity type directly generated entire HTML structure
     * - Structure changes required modifications everywhere
     * 
     * [After Refactoring]
     * - Common structure managed in this method
     * - Only activity-specific content provided by subclasses
     * - Structure changes only require modifying this method
     * 
     * @param {Object} activity - Activity object
     * @param {string} activityContent - Activity-specific content HTML
     * @param {string} checkboxHtml - Checkbox HTML
     * @param {string} kebabMenuHtml - Kebab menu HTML
     * @returns {string} Complete activity HTML
     */
    buildActivityHTML(activity, activityContent, checkboxHtml, kebabMenuHtml) {
        return `
            <div class="activity-header">
                <h3>${activity.title}</h3>
                ${kebabMenuHtml}
            </div>
            ${activityContent}
            <div class="activity-actions">
                ${checkboxHtml}
            </div>
        `;
    }
}


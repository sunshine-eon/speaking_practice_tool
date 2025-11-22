/**
 * Weekly Expressions Activity Renderer
 * 
 * Refactoring Core: Single Responsibility Principle
 * 
 * [Before Refactoring]
 * - weekly_expressions handling within app.js's createActivityElement() function (approx. 200 lines)
 * - Mixed with other activity logic, difficult to find
 * - Modifying weekly_expressions required viewing the entire large function
 * 
 * [After Refactoring]
 * - Weekly Expressions-specific rendering logic concentrated in this class
 * - Manageable with approx. 80 lines of concise code
 * - Completely separated from other activities, can be modified independently
 * 
 * [Class Structure]
 * - Extends ActivityRenderer to reuse common functionality (checkboxes, kebab menu)
 * - Implements only render() method to generate Weekly Expressions-specific content
 * 
 * [Key Features]
 * - Audio player rendering (using AudioPlayerTemplate)
 * - Speed button rendering (using AudioPlayerTemplate)
 * - MP3 file selection and display
 * 
 * [Learning Points]
 * 1. Code reuse through inheritance
 * 2. HTML generation through template classes
 * 3. Hardcoding removal through constants (SPEED_OPTIONS_WEEKLY_EXPRESSIONS)
 */
class WeeklyExpressionsRenderer extends ActivityRenderer {
    /**
     * Render weekly expressions activity content
     * @param {Object} activity - Activity object
     * @param {Object} activityProgress - Progress data
     * @param {string} currentWeek - Current week key
     * @returns {string} HTML string for activity content only
     */
    render(activity, activityProgress, currentWeek) {
        const selectedMp3 = (activityProgress && activityProgress.mp3_file) ? activityProgress.mp3_file : '';
        
        // Get current speed from localStorage or default
        const currentSpeed = parseFloat(localStorage.getItem(`weekly_expressions_speed_${currentWeek}`)) || 1.0;
        
        return `
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
                                        <button class="play-pause-btn">▶</button>
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
                            ${this.renderSpeedButtons(currentWeek, currentSpeed)}
                        </div>
                    ` : '<div class="no-mp3-selected" style="padding: 10px; background: #f0f0f0; border-radius: 4px; color: #666;">MP3 file will be automatically assigned for this week.</div>'}
                </div>
            </div>
        `;
    }

    /**
     * Render speed buttons for weekly expressions
     * @param {string} currentWeek - Current week key
     * @param {number} currentSpeed - Current playback speed
     * @returns {string} HTML string for speed buttons
     */
    renderSpeedButtons(currentWeek, currentSpeed) {
        const speeds = SPEED_OPTIONS_WEEKLY_EXPRESSIONS || [1.0, 1.2, 1.4, 1.6];
        const baseStyle = BUTTON_STYLES?.speedBtn?.base || 'padding: 6px 16px; border: 1px solid #ddd; border-radius: 4px; background: #fff; color: #333; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; min-width: 65px; width: 65px; text-align: center; box-sizing: border-box;';
        const activeStyle = BUTTON_STYLES?.speedBtn?.active || 'padding: 6px 16px; border: 1px solid #4a90e2; border-radius: 4px; background: #4a90e2; color: #fff; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; min-width: 65px; width: 65px; text-align: center; box-sizing: border-box;';

        return speeds.map(speed => {
            const isActive = Math.abs(speed - currentSpeed) < 0.01;
            const style = isActive ? activeStyle : baseStyle;
            return `<button class="speed-btn" onclick="setWeeklyExpressionsSpeed('${currentWeek}', '${speed}')" data-speed="${speed}" style="${style}">${speed}x</button>`;
        }).join('');
    }
}


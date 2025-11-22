/**
 * Audio Player HTML Template Generator
 * 
 * Refactoring Core: Code Duplication Removal and Template Pattern
 * 
 * [Before Refactoring]
 * - Audio player HTML duplicated in 10+ places
 * - weekly_expressions, shadowing_practice, podcast_shadowing etc. generated nearly identical HTML with different function names
 * - SVG icon code repeated every time
 * - Modifying one place required changes everywhere
 * 
 * [After Refactoring]
 * - All audio player HTML centrally managed in this class
 * - Handles various situations through configuration objects
 * - Modifying one place automatically reflects in all audio players
 * 
 * [Main Methods]
 * 1. renderControls(): Generate audio control HTML
 * 2. renderAudioPlayer(): Generate complete HTML including audio element and controls
 * 3. renderSpeedButtons(): Generate speed button HTML
 * 4. renderRegenDropdown(): Generate regeneration dropdown HTML
 * 
 * [Usage Example]
 * const html = AudioPlayerTemplate.renderControls({
 *     controlsId: 'controls-weekly-expressions-2025-W45',
 *     toggleFunction: "toggleWeeklyExpressionsPlayPause('2025-W45')",
 *     seekFunction: "seekWeeklyExpressionsAudio('2025-W45', event)",
 *     // ...
 * });
 * 
 * [Benefits]
 * 1. DRY Principle: Code duplication removed (10 places → 1 place)
 * 2. Consistency: All audio players have the same structure
 * 3. Maintainability: Modifying one place reflects everywhere
 * 4. Extensibility: New features only require modifying this class
 * 
 * [Learning Points]
 * - Using static methods to use without instance creation
 * - Flexible API through configuration object pattern
 * - Security considerations like HTML escaping
 */
class AudioPlayerTemplate {
    /**
     * Render audio player controls HTML
     * @param {Object} config - Configuration object
     * @param {string} config.audioId - ID for audio element
     * @param {string} config.controlsId - ID for controls container
     * @param {string} config.progressId - ID for progress bar
     * @param {string} config.playheadId - ID for playhead
     * @param {string} config.timeDisplayId - ID for time display
     * @param {string} config.audioSrc - Source URL for audio
     * @param {string} config.audioType - Type of audio (mpeg, wav)
     * @param {string} config.toggleFunction - Function name for play/pause toggle
     * @param {string} config.seekFunction - Function name for seek
     * @param {string} config.skipFunction - Function name for skip
     * @param {string} config.skipParams - Parameters for skip function (e.g., "'weekKey', -5")
     * @returns {string} HTML string
     */
    static renderControls(config) {
        const {
            audioId,
            controlsId,
            progressId,
            playheadId,
            timeDisplayId,
            audioSrc,
            audioType = 'audio/mpeg',
            toggleFunction,
            seekFunction,
            skipFunction,
            skipParams
        } = config;

        // Note: escapeHtml should be available globally from app.js
        // We don't escape here as IDs and function names are safe when used in template literals

        // Build skip function parameters
        let skipRewindParams = '';
        let skipForwardParams = '';
        if (skipParams) {
            // Extract base params (everything except the last number)
            const baseMatch = skipParams.match(/^(.+?)(?:,\s*-?\d+)?$/);
            if (baseMatch) {
                const base = baseMatch[1];
                skipRewindParams = base + ', -5';
                skipForwardParams = base + ', 5';
            } else {
                skipRewindParams = skipParams.replace(/-?\d+$/, '-5');
                skipForwardParams = skipParams.replace(/-?\d+$/, '5');
            }
        }

        // Escape function names and IDs for use in HTML attributes
        const safeToggle = toggleFunction.replace(/'/g, "\\'");
        const safeSeek = seekFunction.replace(/'/g, "\\'");
        const safeSkip = skipFunction.replace(/'/g, "\\'");

        return `
            <div class="custom-audio-controls" id="${controlsId}">
                <button class="play-pause-btn" onclick="${safeToggle}">▶</button>
                <button class="skip-btn" onclick="${safeSkip}(${skipRewindParams})" title="Rewind 5 seconds">
                    <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M11 3L5 8l6 5V3z"/>
                        <path d="M3 3h2v10H3V3z"/>
                    </svg>
                </button>
                <button class="skip-btn" onclick="${safeSkip}(${skipForwardParams})" title="Forward 5 seconds">
                    <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M5 3l6 5-6 5V3z"/>
                        <path d="M11 3h2v10h-2V3z"/>
                    </svg>
                </button>
                <div class="progress-bar-container" onclick="${safeSeek}(event)">
                    <div class="progress-bar" id="${progressId}"></div>
                    <div class="progress-playhead" id="${playheadId}"></div>
                </div>
                <span class="time-display" id="${timeDisplayId}">0:00 / 0:00</span>
            </div>
        `;
    }

    /**
     * Render complete audio player HTML (including audio element and controls)
     * @param {Object} config - Configuration object
     * @returns {string} HTML string
     */
    static renderAudioPlayer(config) {
        const {
            audioId,
            controlsId,
            progressId,
            playheadId,
            timeDisplayId,
            audioSrc,
            audioType = 'audio/mpeg',
            audioDataWeek,
            audioDataScript,
            audioDataSource,
            toggleFunction,
            seekFunction,
            skipFunction,
            skipParams
        } = config;

        const dataAttrs = [];
        if (audioDataWeek) dataAttrs.push(`data-week="${audioDataWeek}"`);
        if (audioDataScript) dataAttrs.push(`data-script="${audioDataScript}"`);
        if (audioDataSource) dataAttrs.push(`data-source="${audioDataSource}"`);

        const controlsHtml = this.renderControls({
            audioId,
            controlsId,
            progressId,
            playheadId,
            timeDisplayId,
            audioSrc,
            audioType,
            toggleFunction,
            seekFunction,
            skipFunction,
            skipParams
        });

        const srcUrl = audioSrc.startsWith('/') ? audioSrc : '/static/' + audioSrc;
        const timestamp = Date.now();

        return `
            <div class="audio-player-wrapper-custom">
                <audio id="${audioId}" ${dataAttrs.join(' ')}>
                    <source src="${srcUrl}?v=${timestamp}" type="${audioType}">
                    Your browser does not support the audio element.
                </audio>
                ${controlsHtml}
            </div>
        `;
    }

    /**
     * Render speed control buttons HTML
     * @param {Object} config - Configuration object
     * @param {Array<number>} config.speeds - Array of speed values
     * @param {number} config.currentSpeed - Currently active speed
     * @param {string} config.onClickFunction - Function name for speed change
     * @param {string} config.onClickParams - Parameters for onClick function (e.g., "'weekKey'")
     * @returns {string} HTML string
     */
    static renderSpeedButtons(config) {
        const {
            speeds,
            currentSpeed = 1.0,
            onClickFunction,
            onClickParams
        } = config;

        const baseStyle = (typeof BUTTON_STYLES !== 'undefined' && BUTTON_STYLES?.speedBtn?.base) 
            ? BUTTON_STYLES.speedBtn.base 
            : 'padding: 6px 16px; border: 1px solid #ddd; border-radius: 4px; background: #fff; color: #333; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; min-width: 65px; width: 65px; text-align: center; box-sizing: border-box;';
        const activeStyle = (typeof BUTTON_STYLES !== 'undefined' && BUTTON_STYLES?.speedBtn?.active)
            ? BUTTON_STYLES.speedBtn.active
            : 'padding: 6px 16px; border: 1px solid #4a90e2; border-radius: 4px; background: #4a90e2; color: #fff; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; min-width: 65px; width: 65px; text-align: center; box-sizing: border-box;';

        const safeFunction = onClickFunction.replace(/'/g, "\\'");

        return speeds.map(speed => {
            const isActive = Math.abs(speed - currentSpeed) < 0.01;
            const style = isActive ? activeStyle : baseStyle;
            return `
                <button class="speed-btn" onclick="${safeFunction}(${onClickParams}, '${speed}')" data-speed="${speed}" style="${style}">${speed}x</button>
            `;
        }).join('');
    }

    /**
     * Render speed buttons container HTML
     * @param {Object} config - Configuration object
     * @returns {string} HTML string
     */
    static renderSpeedButtonsContainer(config) {
        const buttonsHtml = this.renderSpeedButtons(config);
        return `
            <div style="display: flex; gap: 8px; justify-content: flex-start; flex-wrap: wrap; margin-top: 10px;">
                ${buttonsHtml}
            </div>
        `;
    }

    /**
     * Render audio regeneration dropdown HTML
     * @param {Object} config - Configuration object
     * @param {string} config.dropdownId - ID for dropdown element
     * @param {string} config.voiceInfo - Voice information to display
     * @param {string} config.audioUrl - URL for download link
     * @param {string} config.voiceSelectId - ID for voice select element
     * @param {string} config.modelSelectId - ID for model select element
     * @param {string} config.speedSelectId - ID for speed select element
     * @param {string} config.regenButtonId - ID for regenerate button
     * @param {string} config.regenFunction - Function name for regenerate
     * @param {string} config.regenParams - Parameters for regenerate function
     * @param {string} config.currentModel - Currently selected model
     * @param {number} config.currentSpeed - Currently selected speed
     * @param {boolean} config.showModelSelect - Whether to show model select
     * @returns {string} HTML string
     */
    static renderRegenDropdown(config) {
        const {
            dropdownId,
            voiceInfo,
            audioUrl,
            voiceSelectId,
            modelSelectId,
            speedSelectId,
            regenFunction,
            regenParams,
            currentModel = 'ssfm-v21',
            currentSpeed = 1.0,
            showModelSelect = true
        } = config;

        // Note: escapeHtml should be available globally from app.js
        // For voiceInfo, we'll escape it if escapeHtml is available

        const speeds = (typeof SPEED_OPTIONS !== 'undefined' && SPEED_OPTIONS) 
            ? SPEED_OPTIONS 
            : [0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0];

        const modelSelectHtml = showModelSelect ? `
            <select id="${modelSelectId}" class="model-select-compact" ${showModelSelect ? '' : 'style="display: none;"'}>
                <option value="ssfm-v21" ${currentModel === 'ssfm-v21' ? 'selected' : ''}>SSFM v21</option>
                <option value="ssfm-v30" ${currentModel === 'ssfm-v30' ? 'selected' : ''}>SSFM v30</option>
            </select>
        ` : '';

        const speedOptionsHtml = speeds.map(speed => {
            const selected = Math.abs(speed - currentSpeed) < 0.01 ? 'selected' : '';
            return `<option value="${speed}" ${selected}>${speed}x</option>`;
        }).join('');

        const safeRegenFunction = regenFunction.replace(/'/g, "\\'");
        const safeAudioUrl = audioUrl ? audioUrl.replace(/"/g, '&quot;') : '';

        return `
            <div class="audio-regen-dropdown" id="${dropdownId}" style="display: none;">
                <div class="audio-regen-controls">
                    ${voiceInfo ? `
                        <div class="audio-info-item">
                            <strong>Voice:</strong> ${voiceInfo}
                        </div>
                    ` : ''}
                    <div class="audio-option-section">
                        <a href="/static/${safeAudioUrl}" class="download-audio-link" download onclick="event.stopPropagation();" title="Download audio">
                            <span>⬇</span> Download
                        </a>
                    </div>
                    <div class="audio-option-divider"></div>
                    <label><strong>Re-generate Typecast audio</strong></label>
                    <select id="${voiceSelectId}" class="voice-select-compact">
                        <option value="">Loading voices...</option>
                    </select>
                    ${modelSelectHtml}
                    <select id="${speedSelectId}" class="speed-select-compact">
                        ${speedOptionsHtml}
                    </select>
                    <button class="regen-btn-compact" onclick="${safeRegenFunction}(${regenParams}); event.stopPropagation();">
                        Re-generate
                    </button>
                </div>
            </div>
        `;
    }
}


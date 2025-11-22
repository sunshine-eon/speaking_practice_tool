/**
 * Podcast Shadowing Activity Renderer
 */

class PodcastShadowingRenderer extends ActivityRenderer {
    /**
     * Render podcast shadowing activity content
     * @param {Object} activity - Activity object
     * @param {Object} activityProgress - Progress data
     * @param {string} currentWeek - Current week key
     * @param {Array} availableVoices - Available voices array
     * @returns {string} HTML string for activity content only
     */
    render(activity, activityProgress, currentWeek, availableVoices = []) {
        const selectedMp3 = (activityProgress && activityProgress.mp3_file) ? activityProgress.mp3_file : '';
        const episodeName = (activityProgress && activityProgress.episode_name) ? activityProgress.episode_name : '';
        const chapterName = (activityProgress && activityProgress.chapter_name) ? activityProgress.chapter_name : '';
        const transcriptPath = (activityProgress && activityProgress.transcript_path) ? activityProgress.transcript_path : '';
        const typecastAudioUrl = (activityProgress && activityProgress.typecast_audio_url) ? activityProgress.typecast_audio_url : '';
        const typecastVoice = (activityProgress && activityProgress.typecast_voice) ? activityProgress.typecast_voice : '';
        const typecastSpeed = (activityProgress && activityProgress.typecast_speed) ? activityProgress.typecast_speed : 1.0;
        const typecastModel = (activityProgress && activityProgress.typecast_model) ? activityProgress.typecast_model : 'ssfm-v30';
        const hasTypecastAudio = typecastAudioUrl && typecastAudioUrl.trim() !== '';
        
        // Use VoiceUtils for podcast voice operations
        const formatPodcastVoiceModelLabel = (voice, model) => {
            return VoiceUtils.formatVoiceModelLabel(voice, model, availableVoices);
        };
        
        // Display format: "[Episode name] - [Chapter name]" or fallback to filename
        const displayLabel = (episodeName && chapterName) 
            ? `${escapeHtml(episodeName)} - ${escapeHtml(chapterName)}`
            : (selectedMp3 ? escapeHtml(selectedMp3) : '');
        
        return `
            <div class="shadowing-audio-info">
                ${selectedMp3 && displayLabel ? `
                    <!-- Title Section -->
                    <div class="audio-player-label" style="margin-bottom: 8px; font-weight: bold;">${displayLabel}</div>
                ` : `
                    <!-- No Chapter Selected Message -->
                    <div class="no-chapter-selected" style="padding: 15px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; color: #856404; margin-bottom: 12px; font-weight: 500;">
                        No chapter selected for this week yet!
                    </div>
                `}
                <!-- Script/Transcript Section -->
                <div class="script-display" id="podcast-shadowing-transcript-${currentWeek}">
                    ${transcriptPath ? '<div style="color: #999; font-style: italic;">Loading transcript...</div>' : 'No transcript available'}
                </div>
                <!-- Audio Player Section with Dropdown -->
                <!-- Audio Source Dropdown -->
                <div style="margin-top: 1rem; margin-bottom: 1rem;">
                    <select id="podcast-audio-source-${currentWeek}" onchange="switchPodcastAudioSource('${currentWeek}', this.value)" class="podcast-audio-source-select" style="padding: 0.5rem 2rem 0.5rem 0.75rem; font-size: 0.95rem; border: 1px solid #ddd; border-radius: 4px; background-color: white; cursor: pointer; min-width: 120px; max-width: 180px; box-sizing: border-box;">
                        <option value="1">Podcast</option>
                        <option value="2">Typecast</option>
                    </select>
                </div>
                <!-- Podcast Audio Player Content -->
                ${selectedMp3 ? this.renderPodcastAudio(currentWeek, selectedMp3) : `<div class="audio-player-section" id="podcast-script-${currentWeek}-1" style="display: none;"><div class="no-mp3-selected" style="padding: 10px; background: #f0f0f0; border-radius: 4px; color: #666;">Please select a chapter and click "Get" to load audio.</div></div>`}
                <!-- Typecast Audio Player Content -->
                ${hasTypecastAudio ? this.renderTypecastAudio(currentWeek, typecastAudioUrl, typecastVoice, typecastModel, typecastSpeed, formatPodcastVoiceModelLabel, true) : this.renderTypecastGeneration(currentWeek, transcriptPath, true)}
            </div>
            <style>
                [data-activity-id="podcast_shadowing"] .activity-actions {
                    margin-top: 1rem !important;
                }
            </style>
        `;
    }

    /**
     * Render podcast audio player
     */
    renderPodcastAudio(currentWeek, selectedMp3) {
        const currentSpeed = parseFloat(localStorage.getItem(`podcast_shadowing_speed_${currentWeek}`)) || 1.0;
        const speeds = SPEED_OPTIONS_PODCAST || [0.85, 0.9, 0.95, 1.0];
        const baseStyle = BUTTON_STYLES?.speedBtn?.base || 'padding: 6px 16px; border: 1px solid #ddd; border-radius: 4px; background: #fff; color: #333; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; min-width: 65px; width: 65px; text-align: center; box-sizing: border-box;';
        const activeStyle = BUTTON_STYLES?.speedBtn?.active || 'padding: 6px 16px; border: 1px solid #4a90e2; border-radius: 4px; background: #4a90e2; color: #fff; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; min-width: 65px; width: 65px; text-align: center; box-sizing: border-box;';

        return `
            <div class="audio-player-section" id="podcast-script-${currentWeek}-1">
                <div class="audio-player-container">
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
                    ${speeds.map(speed => {
                        const isActive = Math.abs(speed - currentSpeed) < 0.01;
                        const style = isActive ? activeStyle : baseStyle;
                        return `<button class="speed-btn" onclick="setPodcastShadowingSpeed('${currentWeek}', '${speed}')" data-speed="${speed}" style="${style}">${speed}x</button>`;
                    }).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Render typecast audio player
     */
    renderTypecastAudio(currentWeek, typecastAudioUrl, typecastVoice, typecastModel, typecastSpeed, formatPodcastVoiceModelLabel, hideInitially = false) {
        const currentSpeed = parseFloat(localStorage.getItem(`podcast_typecast_speed_${currentWeek}`)) || typecastSpeed;
        const speeds = SPEED_OPTIONS_SHADOWING || [0.9, 1.0, 1.1, 1.2];
        const baseStyle = BUTTON_STYLES?.speedBtn?.base || 'padding: 6px 16px; border: 1px solid #ddd; border-radius: 4px; background: #fff; color: #333; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; min-width: 65px; width: 65px; text-align: center; box-sizing: border-box;';
        const activeStyle = BUTTON_STYLES?.speedBtn?.active || 'padding: 6px 16px; border: 1px solid #4a90e2; border-radius: 4px; background: #4a90e2; color: #fff; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; min-width: 65px; width: 65px; text-align: center; box-sizing: border-box;';
        const voiceInfo = formatPodcastVoiceModelLabel(typecastVoice, typecastModel);

        return `
            <div class="audio-player-section" id="podcast-script-${currentWeek}-2" style="${hideInitially ? 'display: none;' : ''}">
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
                        ${AudioPlayerTemplate.renderRegenDropdown({
                            dropdownId: `audio-regen-podcast-typecast-${currentWeek}`,
                            voiceInfo: voiceInfo,
                            audioUrl: typecastAudioUrl,
                            voiceSelectId: `voice-select-regen-podcast-${currentWeek}`,
                            modelSelectId: `model-select-regen-podcast-${currentWeek}`,
                            speedSelectId: `speed-select-regen-podcast-${currentWeek}`,
                            regenFunction: `generatePodcastTypecastAudio`,
                            regenParams: `'${currentWeek}', this`,
                            currentModel: typecastModel,
                            currentSpeed: typecastSpeed,
                            showModelSelect: true
                        })}
                    </div>
                </div>
                <div style="display: flex; gap: 8px; justify-content: flex-start; flex-wrap: wrap; margin-top: 10px;">
                    ${speeds.map(speed => {
                        const isActive = Math.abs(speed - currentSpeed) < 0.01;
                        const style = isActive ? activeStyle : baseStyle;
                        return `<button class="speed-btn" onclick="setPodcastTypecastSpeed('${currentWeek}', '${speed}')" data-speed="${speed}" style="${style}">${speed}x</button>`;
                    }).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Render typecast generation section
     */
    renderTypecastGeneration(currentWeek, transcriptPath, hideInitially = false) {
        return `
            <div class="audio-player-section" id="podcast-script-${currentWeek}-2" style="${hideInitially ? 'display: none;' : ''}">
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
                        ${(SPEED_OPTIONS || [0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0]).map(speed => 
                            `<option value="${speed}" ${speed === 1.0 ? 'selected' : ''}>${speed}x</option>`
                        ).join('')}
                    </select>
                    <button class="generate-audio-btn" onclick="generatePodcastTypecastAudio('${currentWeek}', this)" ${!transcriptPath ? 'disabled' : ''} style="min-width: 120px;">
                        Generate
                    </button>
                </div>
            </div>
        `;
    }
}


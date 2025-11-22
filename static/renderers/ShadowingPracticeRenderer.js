/**
 * Shadowing Practice Activity Renderer
 */

class ShadowingPracticeRenderer extends ActivityRenderer {
    /**
     * Render shadowing practice activity content
     * @param {Object} activity - Activity object
     * @param {Object} activityProgress - Progress data
     * @param {string} currentWeek - Current week key
     * @param {Array} availableVoices - Available voices array
     * @returns {string} HTML string for activity content only
     */
    render(activity, activityProgress, currentWeek, availableVoices = []) {
        const audioName = activityProgress?.video_name || '';
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
        
        // Use VoiceUtils for voice-related operations
        const formatVoiceModelLabel = (voice, model) => {
            return VoiceUtils.formatVoiceModelLabel(voice, model, availableVoices);
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
        
        return `
            <div class="shadowing-audio-info">
                <!-- Tabs for switching between scripts -->
                <div class="script-tabs">
                    <button class="script-tab ${tab1Active}" onclick="switchScript('${currentWeek}', 1); event.stopPropagation();" id="tab-${currentWeek}-1">Script 1</button>
                    ${hasScript2 ? `<button class="script-tab ${tab2Active}" onclick="switchScript('${currentWeek}', 2); event.stopPropagation();" id="tab-${currentWeek}-2">Script 2</button>` : ''}
                </div>
                
                <!-- Script 1 Content -->
                <div class="script-content ${script1Active}" id="script-${currentWeek}-1">
                    <div class="script-display">${this.formatScriptWithParagraphs(script1) || 'No script generated yet'}</div>
                    ${hasAudio1 ? this.renderScript1Audio(currentWeek, script1TypecastUrl, script1TypecastVoice, script1TypecastModel, formatVoiceModelLabel) : ''}
                    ${!hasTypecastAudio1 ? this.renderAudioGeneration(currentWeek, 1, hasScript1) : ''}
                </div>
                
                <!-- Script 2 Content -->
                ${hasScript2 ? `
                    <div class="script-content ${script2Active}" id="script-${currentWeek}-2">
                        <div class="script-display">${this.formatScriptWithParagraphs(script2)}</div>
                        ${hasAudio2 ? this.renderScript2Audio(currentWeek, script2TypecastUrl, script2TypecastVoice, script2TypecastModel, formatVoiceModelLabel) : ''}
                        ${!hasTypecastAudio2 ? this.renderAudioGeneration(currentWeek, 2, hasScript2) : ''}
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Render Script 1 audio player
     */
    renderScript1Audio(currentWeek, script1TypecastUrl, script1TypecastVoice, script1TypecastModel, formatVoiceModelLabel) {
        const currentSpeed = parseFloat(localStorage.getItem(`shadowing_typecast_speed_${currentWeek}_1`)) || 1.0;
        
        return `
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
                            ${this.renderRegenDropdown(currentWeek, 1, 'typecast', script1TypecastUrl, script1TypecastVoice, script1TypecastModel, formatVoiceModelLabel)}
                        </div>
                    </div>
                    ${this.renderSpeedButtons(currentWeek, 1, currentSpeed)}
                ` : ''}
            </div>
        `;
    }

    /**
     * Render Script 2 audio player
     */
    renderScript2Audio(currentWeek, script2TypecastUrl, script2TypecastVoice, script2TypecastModel, formatVoiceModelLabel) {
        const currentSpeed = parseFloat(localStorage.getItem(`shadowing_typecast_speed_${currentWeek}_2`)) || 1.0;
        
        return `
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
                            ${this.renderRegenDropdown(currentWeek, 2, 'typecast', script2TypecastUrl, script2TypecastVoice, script2TypecastModel, formatVoiceModelLabel)}
                        </div>
                    </div>
                    ${this.renderSpeedButtons(currentWeek, 2, currentSpeed)}
                ` : ''}
            </div>
        `;
    }

    /**
     * Render regeneration dropdown
     */
    renderRegenDropdown(currentWeek, scriptNum, source, audioUrl, voice, model, formatVoiceModelLabel) {
        const voiceInfo = formatVoiceModelLabel(voice, model);
        return AudioPlayerTemplate.renderRegenDropdown({
            dropdownId: `audio-regen-${currentWeek}-${scriptNum}`,
            voiceInfo: voiceInfo,
            audioUrl: audioUrl,
            voiceSelectId: `voice-select-regen-${currentWeek}-${scriptNum}`,
            modelSelectId: `model-select-regen-${currentWeek}-${scriptNum}`,
            speedSelectId: `speed-select-regen-${currentWeek}-${scriptNum}`,
            regenFunction: `generateAudioForScript`,
            regenParams: `'${currentWeek}', ${scriptNum}, this, 'typecast'`,
            currentModel: model || 'ssfm-v21',
            currentSpeed: 1.0,
            showModelSelect: true
        });
    }

    /**
     * Render speed buttons
     */
    renderSpeedButtons(currentWeek, scriptNum, currentSpeed) {
        const speeds = SPEED_OPTIONS_SHADOWING || [0.9, 1.0, 1.1, 1.2];
        const baseStyle = BUTTON_STYLES?.speedBtn?.base || 'padding: 6px 16px; border: 1px solid #ddd; border-radius: 4px; background: #fff; color: #333; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; min-width: 65px; width: 65px; text-align: center; box-sizing: border-box;';
        const activeStyle = BUTTON_STYLES?.speedBtn?.active || 'padding: 6px 16px; border: 1px solid #4a90e2; border-radius: 4px; background: #4a90e2; color: #fff; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; min-width: 65px; width: 65px; text-align: center; box-sizing: border-box;';

        return `
            <div style="display: flex; gap: 8px; justify-content: flex-start; flex-wrap: wrap; margin-top: 10px;">
                ${speeds.map(speed => {
                    const isActive = Math.abs(speed - currentSpeed) < 0.01;
                    const style = isActive ? activeStyle : baseStyle;
                    return `<button class="speed-btn" onclick="setShadowingTypecastSpeed('${currentWeek}', ${scriptNum}, '${speed}')" data-speed="${speed}" style="${style}">${speed}x</button>`;
                }).join('')}
            </div>
        `;
    }

    /**
     * Format script text with paragraph breaks
     * Converts double newlines (\n\n) to paragraph tags
     */
    formatScriptWithParagraphs(scriptText) {
        if (!scriptText) return '';
        
        // Split by double newlines (paragraph breaks)
        const paragraphs = scriptText.split(/\n\n+/);
        
        // Filter out empty paragraphs and wrap each in <p> tag
        const formattedParagraphs = paragraphs
            .map(p => p.trim())
            .filter(p => p.length > 0)
            .map(p => `<p>${escapeHtml(p)}</p>`);
        
        return formattedParagraphs.join('');
    }

    /**
     * Render audio generation section
     */
    renderAudioGeneration(currentWeek, scriptNum, hasScript) {
        return `
            <div class="audio-generation-section">
                <div class="audio-generation-header">
                    <strong>Generate Audio</strong>
                </div>
                <div class="audio-source-settings">
                    <label class="source-label"><strong>Typecast</strong></label>
                    <div class="audio-generation-options">
                        <select id="voice-select-typecast-${currentWeek}-${scriptNum}" class="voice-select" ${!hasScript ? 'disabled' : ''}>
                            <option value="">Loading voices...</option>
                        </select>
                        <select id="model-select-typecast-${currentWeek}-${scriptNum}" class="model-select" ${!hasScript ? 'disabled' : ''}>
                            <option value="ssfm-v21">SSFM v21</option>
                            <option value="ssfm-v30" selected>SSFM v30</option>
                        </select>
                        <select id="speed-select-typecast-${currentWeek}-${scriptNum}" class="speed-select" ${!hasScript ? 'disabled' : ''}>
                            ${(SPEED_OPTIONS || [0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0]).map(speed => 
                                `<option value="${speed}" ${speed === 1.0 ? 'selected' : ''}>${speed}x</option>`
                            ).join('')}
                        </select>
                    </div>
                </div>
                <div class="audio-generation-actions">
                    <button class="generate-audio-btn" onclick="generateAudioForScript('${currentWeek}', ${scriptNum}, this)" ${!hasScript ? 'disabled' : ''} style="min-width: 120px;">
                        Generate Typecast
                    </button>
                </div>
            </div>
        `;
    }
}


/**
 * Weekly Speaking Prompt Activity Renderer
 */

class WeeklySpeakingPromptRenderer extends ActivityRenderer {
    /**
     * Render weekly speaking prompt activity content
     * @param {Object} activity - Activity object
     * @param {Object} activityProgress - Progress data
     * @param {string} currentWeek - Current week key
     * @returns {string} HTML string for activity content only
     */
    render(activity, activityProgress, currentWeek) {
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
        
        return `
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
}


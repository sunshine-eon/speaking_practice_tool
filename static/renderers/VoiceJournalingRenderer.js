/**
 * Voice Journaling Activity Renderer
 */

class VoiceJournalingRenderer extends ActivityRenderer {
    /**
     * Render voice journaling activity content
     * @param {Object} activity - Activity object
     * @param {Object} activityProgress - Progress data
     * @param {string} currentWeek - Current week key
     * @returns {string} HTML string for activity content only
     */
    render(activity, activityProgress, currentWeek) {
        return `
            <div class="activity-target-length">
                <strong>Target length</strong> ${activity.target_length || '2-3 mins'}
            </div>
        `;
    }
}


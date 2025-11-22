/**
 * Voice Utility Functions
 * 
 * Refactoring Core: Duplicate Function Integration and Utility Class Pattern
 * 
 * [Before Refactoring]
 * - getVoiceNameFromId() function located in weekly_expressions handling section (lines 404-419)
 * - getPodcastVoiceNameFromId() function located in podcast_shadowing handling section (lines 879-894)
 * - Both functions have nearly identical logic (approx. 15 lines duplicated each)
 * - Bug fixes required modifications in both places
 * 
 * [After Refactoring]
 * - All Voice-related utilities integrated into this class
 * - Provided as static methods for use anywhere
 * - Modifying one place automatically reflects everywhere
 * 
 * [Main Methods]
 * 1. getNameFromId(): Extract name from Voice ID
 * 2. formatVoiceModelLabel(): Format and display Voice and Model
 * 
 * [Usage Example]
 * const voiceName = VoiceUtils.getNameFromId('tc_xxx', availableVoices);
 * const label = VoiceUtils.formatVoiceModelLabel('tc_xxx', 'ssfm-v21', availableVoices);
 * // Result: "Voice Name, SSFM v21"
 * 
 * [Benefits]
 * 1. Code Reuse: Same logic used across all activities
 * 2. Consistency: Voice processing logic unified
 * 3. Maintainability: Modifying one place reflects everywhere
 * 4. Easy Testing: Utility functions can be tested independently
 * 
 * [Learning Points]
 * - Utility class pattern using static methods
 * - Optional parameter usage (availableVoices = null)
 * - Fallback logic implementation
 */
class VoiceUtils {
    /**
     * Get voice name from voice ID
     * @param {string} voiceId - Voice ID (e.g., 'tc_xxx' or voice name)
     * @param {Array} availableVoices - Array of available voice objects
     * @returns {string} Voice name or ID if name not found
     */
    static getNameFromId(voiceId, availableVoices) {
        if (!voiceId) return '';
        
        // Check if it's already a name (doesn't start with 'tc_')
        if (!voiceId.startsWith('tc_')) {
            return voiceId;
        }
        
        // Try to find voice name from availableVoices
        if (availableVoices && availableVoices.length > 0) {
            const voice = availableVoices.find(v => 
                v.voice_id === voiceId || 
                v.id === voiceId ||
                (v.voice_id && v.voice_id === voiceId) ||
                (v.id && v.id === voiceId)
            );
            if (voice) {
                return voice.name || voice.voice_name || voiceId;
            }
        }
        
        // Fallback: return ID if name not found
        return voiceId;
    }

    /**
     * Format voice and model label for display
     * @param {string} voice - Voice ID or name
     * @param {string} model - Model name (e.g., 'ssfm-v21', 'ssfm-v30')
     * @param {Array} availableVoices - Array of available voice objects (optional)
     * @returns {string} Formatted label (e.g., "Voice Name, SSFM v21")
     */
    static formatVoiceModelLabel(voice, model, availableVoices = null) {
        if (!voice && !model) return '';
        
        const parts = [];
        if (voice) {
            // Convert voice ID to name if needed
            const voiceName = availableVoices 
                ? this.getNameFromId(voice, availableVoices)
                : voice;
            parts.push(voiceName);
        }
        if (model) {
            const modelDisplay = model === 'ssfm-v21' 
                ? 'SSFM v21' 
                : (model === 'ssfm-v30' ? 'SSFM v30' : model);
            parts.push(modelDisplay);
        }
        return parts.join(', ');
    }
}


/**
 * Application Constants
 * 
 * Refactoring Core: Centralized Constant Management and Magic String Removal
 * 
 * [Before Refactoring]
 * - Activity IDs used as hardcoded strings in multiple places
 * - 'weekly_expressions', 'shadowing_practice' etc. used directly as strings
 * - Typo risk: mistakes like 'weekly_expression' (missing 's') possible
 * - Value changes required modifications in multiple places
 * 
 * [After Refactoring]
 * - All constants centrally managed in this file
 * - Activity IDs constantized through ACTIVITY_IDS object
 * - Improved type safety and typo prevention
 * - Value changes only require modification in one place
 * 
 * [Main Constant Groups]
 * 1. ACTIVITY_IDS: Activity type identifiers
 * 2. SPEED_OPTIONS: Audio playback speed options
 * 3. BUTTON_STYLES: Button style strings
 * 4. SKIP_SECONDS: Audio skip time
 * 
 * [Usage Example]
 * // Before: if (activity.id === 'weekly_expressions')
 * // After:  if (activity.id === ACTIVITY_IDS.WEEKLY_EXPRESSIONS)
 * 
 * [Benefits]
 * 1. Type Safety: Typo prevention through constant usage
 * 2. Autocomplete: IDE autocomplete support
 * 3. Central Management: Value changes only require modification in one place
 * 4. Clear Intent: Meaning conveyed through constant names
 * 
 * [Learning Points]
 * - Magic string/magic number removal
 * - Constant naming convention (UPPER_SNAKE_CASE)
 * - Grouping through objects (ACTIVITY_IDS, BUTTON_STYLES)
 */
// Activity IDs
const ACTIVITY_IDS = {
    WEEKLY_EXPRESSIONS: 'weekly_expressions',
    VOICE_JOURNALING: 'voice_journaling',
    SHADOWING_PRACTICE: 'shadowing_practice',
    WEEKLY_SPEAKING_PROMPT: 'weekly_speaking_prompt',
    PODCAST_SHADOWING: 'podcast_shadowing'
};

// Speed options for audio playback
const SPEED_OPTIONS = [0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0];

// Default speed
const DEFAULT_SPEED = 1.0;

// Speed options for specific activity types
const SPEED_OPTIONS_WEEKLY_EXPRESSIONS = [1.0, 1.2, 1.4, 1.6];
const SPEED_OPTIONS_SHADOWING = [0.9, 1.0, 1.1, 1.2];
const SPEED_OPTIONS_PODCAST = [0.85, 0.9, 0.95, 1.0];

// Button styles (for speed buttons)
const BUTTON_STYLES = {
    speedBtn: {
        base: 'padding: 6px 16px; border: 1px solid #ddd; border-radius: 4px; background: #fff; color: #333; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; min-width: 65px; width: 65px; text-align: center; box-sizing: border-box;',
        active: 'padding: 6px 16px; border: 1px solid #4a90e2; border-radius: 4px; background: #4a90e2; color: #fff; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; min-width: 65px; width: 65px; text-align: center; box-sizing: border-box;'
    }
};

// Skip button seconds
const SKIP_SECONDS = {
    REWIND: -5,
    FORWARD: 5
};

// Helper function to escape HTML (used by renderers)
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Helper function to get days of week (used by renderers)
// Note: This is a simplified version that will be overridden by app.js
// but needed for initial renderer class definition
function getDaysOfWeek() {
    // Fallback implementation - will be replaced by app.js version
    const today = new Date();
    const dayOfWeek = today.getDay();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - dayOfWeek);
    
    const days = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    for (let i = 0; i < 7; i++) {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + i);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        const label = `${dayNames[i]} ${date.getDate()}`;
        days.push({ date: dateStr, label: label });
    }
    
    return days;
}


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
let availableVoices = []; // Initialize early to avoid undefined errors

// Audio player instances registry
const audioPlayers = new Map();

// Recording variables (must be defined before functions that use them)
let mediaRecorder = null;
let audioChunks = [];
let currentRecordingActivity = null;
let currentRecordingDay = null;
let recordingTimer = null;
let recordingStartTime = null;
let audioContext = null;
let analyser = null;
let animationId = null;

// Podcast videos cache
let podcastVideosCache = null;

// Show error message
function showError(message) {
    // Simple error display - could be enhanced with a toast notification
    alert(message);
}

// Show success message
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

// Load initial data
async function loadData() {
    try {
        // Load roadmap
        const roadmapResponse = await fetch('/api/roadmap');
        if (!roadmapResponse.ok) {
            throw new Error(`Roadmap API error: ${roadmapResponse.status} ${roadmapResponse.statusText}`);
        }
        roadmap = await roadmapResponse.json();
        
        // Load progress
        const progressResponse = await fetch('/api/progress');
        if (!progressResponse.ok) {
            throw new Error(`Progress API error: ${progressResponse.status} ${progressResponse.statusText}`);
        }
        const progressData = await progressResponse.json();
        progress = progressData.progress;
        currentWeek = progressData.current_week;
        weeklySummary = progressData.weekly_summary;
        
        // Render the page
        renderPage();
    } catch (error) {
        console.error('Error loading data:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            roadmap: roadmap,
            progress: progress,
            currentWeek: currentWeek
        });
        showError(`Failed to load data: ${error.message}. Please refresh the page.`);
    }
}

// Get all available weeks from progress
function getAllWeeks() {
    if (!progress || !progress.weeks) return [];
    
    // Return all weeks (including past, current, and future)
    const allWeeks = Object.keys(progress.weeks);
    
    return allWeeks.sort(); // Oldest to newest
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

// Format week key for display
function formatWeekKeyForDisplay(weekKey) {
    const [year, week] = weekKey.split('-W');
    return `Week ${parseInt(week)}, ${year}`;
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

// Format time for display (MM:SS)
function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Update time display for audio player
function updateTimeDisplay(audioElement, timeDisplay) {
    if (!timeDisplay || !audioElement.duration) return;
    
    const current = formatTime(audioElement.currentTime);
    const total = formatTime(audioElement.duration);
    // Explicitly style the colon to prevent blue dot rendering issue
    const currentParts = current.split(':');
    const totalParts = total.split(':');
    timeDisplay.innerHTML = `<span>${currentParts[0]}</span><span style="color: #666;">:</span><span>${currentParts[1]}</span> <span style="color: #666;">/</span> <span>${totalParts[0]}</span><span style="color: #666;">:</span><span>${totalParts[1]}</span>`;
}

// Update voice dropdowns with available voices
function updateVoiceDropdowns() {
    // Only update Typecast voice dropdowns (exclude OpenAI ones and podcast dropdowns)
    const voiceSelects = document.querySelectorAll('.voice-select, .voice-select-compact, select[id^="voice-select-regen-"]');
    
    voiceSelects.forEach(select => {
        // Skip OpenAI voice dropdowns
        if (select.id && select.id.includes('openai')) {
            return;
        }
        
        // Skip podcast video/chapter dropdowns
        if (select.id && (select.id.includes('podcast-video-select') || select.id.includes('podcast-chapter-select'))) {
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
            parts.push(model);
        }
        return parts.join(' / ');
    };
    
    // Update all podcast shadowing activities
    Object.keys(progress.weeks).forEach(weekKey => {
        const weekData = progress.weeks[weekKey];
        const podcastData = weekData?.podcast_shadowing;
        if (!podcastData) return;
        
        const typecastVoice = podcastData.typecast_voice || '';
        const typecastModel = podcastData.typecast_model || '';
        
        if (typecastVoice || typecastModel) {
            const voiceInfoElement = document.getElementById(`podcast-voice-info-${weekKey}`);
            if (voiceInfoElement) {
                const label = formatPodcastVoiceModelLabel(typecastVoice, typecastModel);
                voiceInfoElement.textContent = label || 'No voice selected';
            }
        }
    });
}

// Switch audio source for podcast shadowing
function switchPodcastAudioSource(weekKey, sourceNum) {
    // Switch audio source for podcast shadowing using dropdown
    const script1 = document.getElementById(`podcast-script-${weekKey}-1`);
    const script2 = document.getElementById(`podcast-script-${weekKey}-2`);
    
    if (sourceNum === '1') {
        if (script1) {
            script1.style.display = '';
        }
        if (script2) {
            script2.style.display = 'none';
        }
    } else {
        if (script1) {
            script1.style.display = 'none';
        }
        if (script2) {
            script2.style.display = '';
        }
    }
    
    // Save selection to localStorage
    localStorage.setItem(`podcast_audio_source_${weekKey}`, sourceNum);
}

/**
 * Unified AudioPlayer class to handle all audio player functionality
 * Eliminates code duplication across different audio player types
 */
class AudioPlayer {
    constructor(config) {
        // Required: IDs for audio element and controls container
        this.audioId = config.audioId;
        this.controlsId = config.controlsId;
        
        // Optional: IDs for progress bar, playhead, and time display
        this.progressId = config.progressId || null;
        this.playheadId = config.playheadId || null;
        this.timeDisplayId = config.timeDisplayId || null;
        
        // Optional: initial playback speed
        this.initialSpeed = config.initialSpeed || 1.0;
        
        // Optional: callback for when play state changes (for pausing other players)
        this.onPlayStateChange = config.onPlayStateChange || null;
        
        // Internal state
        this.isDragging = false;
        this.audioElement = null;
        this.playPauseBtn = null;
        this.progressBar = null;
        this.playhead = null;
        this.timeDisplay = null;
        this.container = null;
        
        this.init();
    }
    
    init() {
        this.audioElement = document.getElementById(this.audioId);
        if (!this.audioElement) return;
        
        // Get DOM elements
        const controls = document.getElementById(this.controlsId);
        if (controls) {
            this.playPauseBtn = controls.querySelector('.play-pause-btn');
            this.container = controls.querySelector('.progress-bar-container');
        }
        
        if (this.progressId) {
            this.progressBar = document.getElementById(this.progressId);
        }
        if (this.playheadId) {
            this.playhead = document.getElementById(this.playheadId);
        }
        if (this.timeDisplayId) {
            this.timeDisplay = document.getElementById(this.timeDisplayId);
        }
        
        // Set initial speed
        if (this.initialSpeed) {
            this.audioElement.playbackRate = this.initialSpeed;
        }
        
        // Setup drag functionality
        this.setupDrag();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Initial UI update
        this.updateUI();
    }
    
    setupDrag() {
        if (!this.container || !this.audioElement) return;
        
        const handleMove = (clientX) => {
            if (!this.audioElement.duration) return;
            const rect = this.container.getBoundingClientRect();
            const x = clientX - rect.left;
            const percent = Math.max(0, Math.min(1, x / rect.width));
            this.audioElement.currentTime = percent * this.audioElement.duration;
            this.updateProgressBar(percent);
        };
        
        const startDrag = (e) => {
            this.isDragging = true;
            if (this.playhead) {
                this.playhead.style.transition = 'none';
            }
            handleMove(e.clientX);
            e.preventDefault();
            e.stopPropagation();
        };
        
        // Make playhead draggable
        if (this.playhead) {
            this.playhead.addEventListener('mousedown', startDrag);
        }
        
        // Make container draggable
        this.container.addEventListener('mousedown', startDrag);
        
        document.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                handleMove(e.clientX);
            }
        });
        
        document.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                if (this.playhead) {
                    this.playhead.style.transition = 'left 0.1s linear';
                }
            }
        });
    }
    
    setupEventListeners() {
        if (!this.audioElement) return;
        
        // Add click event listener to play/pause button
        // Remove existing onclick handler to avoid conflicts
        if (this.playPauseBtn) {
            // Store the original onclick handler if it exists
            const originalOnclick = this.playPauseBtn.getAttribute('onclick');
            
            // Remove onclick attribute to prevent it from executing
            this.playPauseBtn.removeAttribute('onclick');
            
            // Remove any existing event listeners by cloning the button
            const newBtn = this.playPauseBtn.cloneNode(true);
            this.playPauseBtn.parentNode.replaceChild(newBtn, this.playPauseBtn);
            this.playPauseBtn = newBtn;
            
            // Add new event listener
            this.playPauseBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Prevent the original onclick from executing
                if (originalOnclick) {
                    e.stopImmediatePropagation();
                }
                this.togglePlayPause();
            }, true); // Use capture phase to execute before any other handlers
        }
        
        this.audioElement.addEventListener('play', () => {
            this.updatePlayPauseButton();
            if (this.onPlayStateChange) {
                this.onPlayStateChange(true);
            }
        });
        
        this.audioElement.addEventListener('pause', () => {
            this.updatePlayPauseButton();
            if (this.onPlayStateChange) {
                this.onPlayStateChange(false);
            }
        });
        
        this.audioElement.addEventListener('timeupdate', () => {
            if (!this.isDragging) {
                this.updateProgressBar();
                this.updateTimeDisplay();
            }
        });
        
        this.audioElement.addEventListener('loadedmetadata', () => {
            this.updateTimeDisplay();
        });
    }
    
    togglePlayPause() {
        if (!this.audioElement) return;
        
        if (this.audioElement.paused) {
            this.audioElement.play();
        } else {
            this.audioElement.pause();
        }
    }
    
    seek(event) {
        if (!this.audioElement || !this.container || !this.audioElement.duration) return;
        
        const rect = this.container.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const percent = Math.max(0, Math.min(1, x / rect.width));
        this.audioElement.currentTime = percent * this.audioElement.duration;
        this.updateProgressBar(percent);
    }
    
    skip(seconds) {
        if (!this.audioElement || !this.audioElement.duration) return;
        
        const newTime = Math.max(0, Math.min(this.audioElement.duration, this.audioElement.currentTime + seconds));
        this.audioElement.currentTime = newTime;
        
        const percent = newTime / this.audioElement.duration;
        this.updateProgressBar(percent);
        this.updateTimeDisplay();
    }
    
    setSpeed(speed) {
        if (!this.audioElement) return;
        const speedValue = parseFloat(speed) || 1.0;
        this.audioElement.playbackRate = speedValue;
    }
    
    updatePlayPauseButton() {
        if (this.playPauseBtn && this.audioElement) {
            this.playPauseBtn.textContent = this.audioElement.paused ? '▶' : '⏸';
        }
    }
    
    updateProgressBar(percent = null) {
        if (!this.audioElement || !this.audioElement.duration) return;
        
        if (percent === null) {
            percent = this.audioElement.currentTime / this.audioElement.duration;
        }
        
        if (this.progressBar) {
            this.progressBar.style.width = (percent * 100) + '%';
        }
        if (this.playhead) {
            this.playhead.style.left = (percent * 100) + '%';
        }
    }
    
    updateTimeDisplay() {
        if (this.timeDisplay && this.audioElement) {
            updateTimeDisplay(this.audioElement, this.timeDisplay);
        }
    }
    
    updateUI() {
        this.updatePlayPauseButton();
        this.updateProgressBar();
        this.updateTimeDisplay();
    }
}

/**
 * Create and register an audio player instance
 */
function createAudioPlayer(config) {
    const key = config.audioId;
    
    // If player exists, check if audio element still exists and matches
    if (audioPlayers.has(key)) {
        const existingPlayer = audioPlayers.get(key);
        const audioElement = document.getElementById(key);
        
        // If audio element doesn't exist or is different, remove old player
        if (!audioElement || existingPlayer.audioElement !== audioElement) {
            // Clean up old player
            if (existingPlayer.audioElement) {
                existingPlayer.audioElement.pause();
                existingPlayer.audioElement.src = '';
            }
            audioPlayers.delete(key);
        } else {
            // Audio element matches, return existing player
            return existingPlayer;
        }
    }
    
    // Create new player
    const player = new AudioPlayer(config);
    audioPlayers.set(key, player);
    return player;
}

/**
 * Get an audio player instance by audio element ID
 */
function getAudioPlayer(audioId) {
    return audioPlayers.get(audioId);
}

// Toggle play/pause for weekly expressions audio
// This function is kept for backward compatibility with HTML onclick attributes
// but should not be called directly - AudioPlayer handles clicks via event listeners
function toggleWeeklyExpressionsPlayPause(weekKey) {
    try {
        const player = getAudioPlayer(`audio-player-weekly-expressions-${weekKey}`);
        if (player) {
            player.togglePlayPause();
        } else {
            // If player doesn't exist yet, try to create it
            const audioElement = document.getElementById(`audio-player-weekly-expressions-${weekKey}`);
            if (audioElement) {
                setupWeeklyExpressionsAudioControls(weekKey, audioElement.playbackRate || 1.0);
                // Try again after a short delay
                setTimeout(() => {
                    const newPlayer = getAudioPlayer(`audio-player-weekly-expressions-${weekKey}`);
                    if (newPlayer) {
                        newPlayer.togglePlayPause();
                    }
                }, 50);
            }
        }
    } catch (error) {
        console.error('Error in toggleWeeklyExpressionsPlayPause:', error);
    }
}

// Seek weekly expressions audio
function seekWeeklyExpressionsAudio(weekKey, event) {
    const player = getAudioPlayer(`audio-player-weekly-expressions-${weekKey}`);
    if (player) {
        player.seek(event);
    }
}

// Skip weekly expressions audio
function skipWeeklyExpressionsAudio(weekKey, seconds) {
    const player = getAudioPlayer(`audio-player-weekly-expressions-${weekKey}`);
    if (player) {
        player.skip(seconds);
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

// Set playback speed for weekly expressions audio
function setWeeklyExpressionsSpeed(weekKey, speed) {
    const player = getAudioPlayer(`audio-player-weekly-expressions-${weekKey}`);
    if (player) {
        const speedValue = parseFloat(speed) || 1.0;
        player.setSpeed(speedValue);
        updateSpeedButtonStyles(weekKey, speedValue);
        // Save to localStorage
        localStorage.setItem(`weekly_expressions_speed_${weekKey}`, speedValue.toString());
    }
}

// Set up weekly expressions audio controls for a specific week
function setupWeeklyExpressionsAudioControls(weekKey, initialSpeed) {
    const audioId = `audio-player-weekly-expressions-${weekKey}`;
    const controlsId = `controls-weekly-expressions-${weekKey}`;
    
    // Create audio player instance
    createAudioPlayer({
        audioId: audioId,
        controlsId: controlsId,
        progressId: `progress-weekly-expressions-${weekKey}`,
        playheadId: `playhead-weekly-expressions-${weekKey}`,
        timeDisplayId: `time-weekly-expressions-${weekKey}`,
        initialSpeed: initialSpeed || 1.0
    });
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

// ============================================================================
// Functions called from HTML onclick attributes - MUST be defined before use
// ============================================================================

// Navigation functions
async function selectWeek(weekKey) {
    if (!weekKey) return;
    await loadWeek(weekKey);
}

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

async function navigateWeek(direction) {
    const weeks = getAllWeeks();
    
    // Calculate adjacent week
    const adjacentWeek = getAdjacentWeek(currentWeek, direction);
    if (!adjacentWeek) return;
    
    // Load the adjacent week (will be created if it doesn't exist)
    await loadWeek(adjacentWeek);
}

// Clean up audio players for a specific week
function cleanupAudioPlayersForWeek(weekKey) {
    // List of all possible audio player IDs for this week
    const audioPlayerIds = [
        `audio-player-weekly-expressions-${weekKey}`,
        `audio-player-podcast-shadowing-${weekKey}`,
        `audio-player-typecast-podcast-${weekKey}`,
        `audio-player-typecast-${weekKey}-1`,
        `audio-player-typecast-${weekKey}-2`,
        `audio-player-typecast-${weekKey}-3`,
        `audio-player-shadowing-${weekKey}-1`,
        `audio-player-shadowing-${weekKey}-2`,
        `audio-player-shadowing-${weekKey}-3`,
        `audio-player-openai-${weekKey}-1`,
        `audio-player-openai-${weekKey}-2`,
        `audio-player-openai-${weekKey}-3`
    ];
    
    // Clean up each audio player
    audioPlayerIds.forEach(audioId => {
        const player = audioPlayers.get(audioId);
        if (player) {
            // Pause and clean up audio element
            if (player.audioElement) {
                player.audioElement.pause();
                player.audioElement.src = '';
                player.audioElement.load(); // Reset audio element
            }
            // Remove from registry
            audioPlayers.delete(audioId);
        }
    });
}

async function loadWeek(weekKey) {
    try {
        // Remove cache-busting parameter if present
        const cleanWeekKey = weekKey.split('?')[0];
        
        // Clean up existing audio players for this week before reloading
        // This ensures old audio elements are properly disposed
        cleanupAudioPlayersForWeek(cleanWeekKey);
        
        // Reload full progress structure first to get all weeks (with cache busting)
        const progressResponse = await fetch('/api/progress?t=' + Date.now());
        if (!progressResponse.ok) {
            throw new Error(`Progress API error: ${progressResponse.status} ${progressResponse.statusText}`);
        }
        const progressData = await progressResponse.json();
        if (!progressData || !progressData.progress) {
            throw new Error('Invalid progress data received');
        }
        progress = progressData.progress;
        
        // Load the specific week (with cache busting)
        const response = await fetch(`/api/week/${cleanWeekKey}?t=` + Date.now());
        if (!response.ok) {
            throw new Error(`Week API error: ${response.status} ${response.statusText}`);
        }
        const weekData = await response.json();
        if (!weekData || !weekData.week_key) {
            throw new Error('Invalid week data received');
        }
        
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
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            weekKey: weekKey
        });
        showError(`Failed to load week: ${error.message}. Please try again.`);
    }
}

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

// Shadowing practice audio functions
function togglePlayPause(sourceType, weekKey, scriptNum) {
    const player = getAudioPlayer(`audio-player-${sourceType}-${weekKey}-${scriptNum}`);
    if (player) {
        player.togglePlayPause();
    }
}

function seekAudio(sourceType, weekKey, scriptNum, event) {
    const player = getAudioPlayer(`audio-player-${sourceType}-${weekKey}-${scriptNum}`);
    if (player) {
        player.seek(event);
    }
}

function skipShadowingAudio(sourceType, weekKey, scriptNum, seconds) {
    const player = getAudioPlayer(`audio-player-${sourceType}-${weekKey}-${scriptNum}`);
    if (player) {
        player.skip(seconds);
    }
}

function setPlaybackSpeed(sourceType, weekKey, scriptNum, speed) {
    const audioId = `audio-player-${sourceType}-${weekKey}-${scriptNum}`;
    const player = getAudioPlayer(audioId);
    if (player) {
        player.setSpeed(speed);
    } else {
        const audioElement = document.getElementById(audioId);
        if (audioElement) {
            const speedValue = parseFloat(speed) || 1.0;
            audioElement.playbackRate = speedValue;
        }
    }
}

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

function toggleAudioRegenOptions(weekKey, scriptNum, sourceType, event) {
    if (event) event.stopPropagation();
    
    // Handle both typecast and openai dropdowns
    const menuId = sourceType === 'openai' ? `audio-regen-openai-${weekKey}-${scriptNum}` : `audio-regen-${weekKey}-${scriptNum}`;
    const menu = document.getElementById(menuId);
    if (!menu) return;
    
    // Close all other menus first
    document.querySelectorAll('.audio-regen-menu, .audio-regen-openai-menu').forEach(m => {
        if (m.id !== menuId) {
            m.style.display = 'none';
        }
    });
    
    // Toggle current menu
    if (menu.style.display === 'block') {
        menu.style.display = 'none';
    } else {
        menu.style.display = 'block';
    }
}

function setShadowingTypecastSpeed(weekKey, scriptNum, speed) {
    const player = getAudioPlayer(`audio-player-typecast-${weekKey}-${scriptNum}`);
    if (player) {
        const speedValue = parseFloat(speed) || 1.0;
        player.setSpeed(speedValue);
        updateShadowingTypecastSpeedButtonStyles(weekKey, scriptNum, speedValue);
    }
}

function updateShadowingTypecastSpeedButtonStyles(weekKey, scriptNum, activeSpeed) {
    const buttons = document.querySelectorAll(`[onclick*="setShadowingTypecastSpeed('${weekKey}', ${scriptNum}"]`);
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

// Podcast shadowing audio functions
function togglePodcastShadowingPlayPause(weekKey) {
    const player = getAudioPlayer(`audio-player-podcast-shadowing-${weekKey}`);
    if (player) {
        player.togglePlayPause();
    }
}

function seekPodcastShadowingAudio(weekKey, event) {
    const player = getAudioPlayer(`audio-player-podcast-shadowing-${weekKey}`);
    if (player) {
        player.seek(event);
    }
}

function skipPodcastShadowingAudio(weekKey, seconds) {
    const player = getAudioPlayer(`audio-player-podcast-shadowing-${weekKey}`);
    if (player) {
        player.skip(seconds);
    }
}

function setPodcastShadowingSpeed(weekKey, speed) {
    const player = getAudioPlayer(`audio-player-podcast-shadowing-${weekKey}`);
    if (player) {
        const speedValue = parseFloat(speed) || 1.0;
        player.setSpeed(speedValue);
        updatePodcastShadowingSpeedButtonStyles(weekKey, speedValue);
    }
}

function updatePodcastShadowingSpeedButtonStyles(weekKey, activeSpeed) {
    const buttons = document.querySelectorAll(`[onclick*="setPodcastShadowingSpeed('${weekKey}'"]`);
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

function togglePodcastTypecastPlayPause(weekKey) {
    const player = getAudioPlayer(`audio-player-typecast-podcast-${weekKey}`);
    if (player) {
        player.togglePlayPause();
    }
}

function seekPodcastTypecastAudio(weekKey, event) {
    const player = getAudioPlayer(`audio-player-typecast-podcast-${weekKey}`);
    if (player) {
        player.seek(event);
    }
}

function skipPodcastTypecastAudio(weekKey, seconds) {
    const player = getAudioPlayer(`audio-player-typecast-podcast-${weekKey}`);
    if (player) {
        player.skip(seconds);
    }
}

function setPodcastTypecastSpeed(weekKey, speed) {
    const player = getAudioPlayer(`audio-player-typecast-podcast-${weekKey}`);
    if (player) {
        const speedValue = parseFloat(speed) || 1.0;
        player.setSpeed(speedValue);
        updatePodcastTypecastSpeedButtonStyles(weekKey, speedValue);
    }
}

function updatePodcastTypecastSpeedButtonStyles(weekKey, activeSpeed) {
    const buttons = document.querySelectorAll(`[onclick*="setPodcastTypecastSpeed('${weekKey}'"]`);
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

function togglePodcastTypecastRegenOptions(weekKey, event) {
    if (event) event.stopPropagation();
    
    const menuId = `podcast-typecast-regen-${weekKey}`;
    const menu = document.getElementById(menuId);
    if (!menu) return;
    
    // Close all other menus first
    document.querySelectorAll('.podcast-typecast-regen-menu').forEach(m => {
        if (m.id !== menuId) {
            m.style.display = 'none';
        }
    });
    
    // Toggle current menu
    if (menu.style.display === 'block') {
        menu.style.display = 'none';
    } else {
        menu.style.display = 'block';
    }
}

function downloadAudio(audioUrl, sourceType, weekKey, scriptNum) {
    if (!audioUrl) return;
    
    const link = document.createElement('a');
    link.href = audioUrl;
    link.download = `${sourceType}-${weekKey}-script${scriptNum}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function updatePodcastChapterSelect(weekKey) {
    const videoSelect = document.getElementById(`podcast-video-select-${weekKey}`);
    const chapterSelect = document.getElementById(`podcast-chapter-select-${weekKey}`);
    
    if (!videoSelect || !chapterSelect) return;
    
    const selectedVideoId = videoSelect.value;
    if (!selectedVideoId) {
        // Clear chapter select if no video selected
        chapterSelect.innerHTML = '<option value="">Select a video first</option>';
        return;
    }
    
    // Get the selected video option to find its index
    const selectedOption = videoSelect.options[videoSelect.selectedIndex];
    const videoIndex = selectedOption ? parseInt(selectedOption.dataset.index) : -1;
    
    if (videoIndex === -1) {
        chapterSelect.innerHTML = '<option value="">Invalid video selection</option>';
        return;
    }
    
    // Use cached videos if available, otherwise try to get from progress
    let videos = podcastVideosCache;
    if (!videos) {
        // Try to get from progress
        const weekData = progress.weeks[weekKey];
        if (weekData && weekData.podcast_shadowing && weekData.podcast_shadowing.videos) {
            videos = weekData.podcast_shadowing.videos;
        } else {
            chapterSelect.innerHTML = '<option value="">Loading chapters...</option>';
            // Try to reload videos
            loadPodcastVideosAndChapters(weekKey).then(() => {
                // Retry after loading
                updatePodcastChapterSelect(weekKey);
            });
            return;
        }
    }
    
    if (!videos || !videos[videoIndex]) {
        chapterSelect.innerHTML = '<option value="">Video not found</option>';
        return;
    }
    
    const selectedVideo = videos[videoIndex];
    if (!selectedVideo || !selectedVideo.chapters) {
        chapterSelect.innerHTML = '<option value="">No chapters available</option>';
        return;
    }
    
    updatePodcastChapterSelectSync(weekKey, selectedVideo.chapters, videoIndex + 1);
}

function updatePodcastChapterSelectSync(weekKey, chapters, videoNumber) {
    const chapterSelect = document.getElementById(`podcast-chapter-select-${weekKey}`);
    if (!chapterSelect) return;
    
    // Get current selection before clearing
    const currentValue = chapterSelect.value;
    
    chapterSelect.innerHTML = '<option value="">Select chapter...</option>';
    
    // Get current activity progress to find selected chapter
    const activityProgress = getActivityProgress('podcast_shadowing');
    let selectedChapterIndex = null;
    
    if (activityProgress && activityProgress.chapter_name) {
        const matchingChapter = chapters.find(ch => ch.title === activityProgress.chapter_name);
        if (matchingChapter !== undefined) {
            selectedChapterIndex = matchingChapter.chapter_index !== undefined 
                ? matchingChapter.chapter_index 
                : chapters.indexOf(matchingChapter);
        }
    }
    
    chapters.forEach((chapter, index) => {
        const option = document.createElement('option');
        // Use chapter.chapter_index instead of array index
        const chapterIndex = chapter.chapter_index !== undefined ? chapter.chapter_index : index;
        option.value = chapterIndex.toString();
        // Format: "비디오넘버-챕터넘버. 챕터제목"
        const chapterTitle = chapter.title || `Chapter ${index + 1}`;
        option.textContent = `${videoNumber}-${index + 1}. ${chapterTitle}`;
        
        // Set selected if this is the current chapter
        if (selectedChapterIndex !== null && chapterIndex === selectedChapterIndex) {
            option.selected = true;
        }
        
        chapterSelect.appendChild(option);
    });
    
    // Ensure size is reset to 1 after updating
    chapterSelect.size = 1;
}

// Recording functions
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

// Start recording timer
function startRecordingTimer(activityId, day) {
    // Stop any existing timer first to prevent multiple timers running
    if (recordingTimer) {
        clearInterval(recordingTimer);
        recordingTimer = null;
    }
    
    const dayId = day.replace(/-/g, '_');
    const timerElement = document.getElementById(`${activityId}_timer_${dayId}`);
    
    if (!timerElement) return;
    
    timerElement.style.display = 'inline-block';
    recordingStartTime = Date.now();
    
    recordingTimer = setInterval(() => {
        const elapsed = Date.now() - recordingStartTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }, 100);
}

// Stop recording timer
function stopRecordingTimer(activityId, day) {
    if (recordingTimer) {
        clearInterval(recordingTimer);
        recordingTimer = null;
    }
    
    // Hide timer element if activityId and day are provided
    if (activityId && day) {
        const dayId = day.replace(/-/g, '_');
        const timerElement = document.getElementById(`${activityId}_timer_${dayId}`);
        if (timerElement) {
            timerElement.style.display = 'none';
        }
    }
}

// Start waveform visualization
function startVisualization(activityId, day) {
    const dayId = day.replace(/-/g, '_');
    const visualizerDiv = document.getElementById(`${activityId}_visualizer_${dayId}`);
    const canvas = document.getElementById(`${activityId}_canvas_${dayId}`);
    
    if (!canvas) return;
    
    // Initialize audio context if not already done
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    // Get user media for visualization
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            analyser = audioContext.createAnalyser();
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            analyser.fftSize = 256;
            
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
        })
        .catch(error => {
            console.error('Error starting visualization:', error);
        });
}

async function startRecording(activityId, day) {
    // Always reset UI to idle state first for the target activity/day
    // This ensures clean state even if previous recording was deleted or interrupted
    updateRecordingUI(activityId, day, 'idle');
    
    // Clean up any previous recording state first
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        console.warn('Stopping previous recording');
        try {
            mediaRecorder.stop();
        } catch (e) {
            console.warn('Error stopping previous recorder:', e);
        }
    }
    
    // Stop any existing timer and visualization
    if (currentRecordingActivity && currentRecordingDay) {
        stopRecordingTimer(currentRecordingActivity, currentRecordingDay);
    } else {
        stopRecordingTimer();
    }
    // Also stop timer for the new recording target (in case it was left running)
    stopRecordingTimer(activityId, day);
    
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    
    // Reset UI to idle state for previous recording if different
    if (currentRecordingActivity && currentRecordingDay && 
        (currentRecordingActivity !== activityId || currentRecordingDay !== day)) {
        updateRecordingUI(currentRecordingActivity, currentRecordingDay, 'idle');
    }
    
    // Clean up audio context if exists
    if (audioContext) {
        try {
            await audioContext.close();
        } catch (e) {
            console.warn('Error closing audio context:', e);
        }
        audioContext = null;
        analyser = null;
    }
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        currentRecordingActivity = activityId;
        currentRecordingDay = day;
        recordingStartTime = Date.now();
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };
        
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            await saveRecording(audioBlob, activityId, day);
            
            // Stop all tracks
            stream.getTracks().forEach(track => track.stop());
            
            // Stop timer and visualization
            stopRecordingTimer(activityId, day);
            if (animationId) {
                cancelAnimationFrame(animationId);
                animationId = null;
            }
            
            // Clean up
            mediaRecorder = null;
            audioChunks = [];
            currentRecordingActivity = null;
            currentRecordingDay = null;
            
            // Reload recordings
            await loadRecordings(activityId, day);
        };
        
        mediaRecorder.start();
        startRecordingTimer(activityId, day);
        startVisualization(activityId, day);
        updateRecordingUI(activityId, day, 'recording');
    } catch (error) {
        console.error('Error starting recording:', error);
        showError('Failed to start recording: ' + error.message);
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        // Store activity and day before stopping (they might be cleared in onstop)
        const activityId = currentRecordingActivity;
        const day = currentRecordingDay;
        
        // Stop timer immediately when user clicks stop button
        stopRecordingTimer(activityId, day);
        
        // Stop visualization immediately
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
        
        // Update UI to processing state (this will hide timer and visualizer)
        if (activityId && day) {
            updateRecordingUI(activityId, day, 'processing');
        }
        
        // Stop the recorder
        try {
            mediaRecorder.stop();
        } catch (error) {
            console.error('Error stopping recorder:', error);
            // If stop fails, reset UI to idle
            if (activityId && day) {
                updateRecordingUI(activityId, day, 'idle');
            }
        }
    }
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

// Save recording to server
async function saveRecording(audioBlob, activityId, day) {
    // Ensure timer is stopped before saving (in case it wasn't stopped properly)
    stopRecordingTimer(activityId, day);
    
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
            
            // For voice_journaling, trigger transcription automatically
            if (activityId === 'voice_journaling') {
                // Transcription is handled on the backend automatically
                // Just reload recordings to show the transcription when available
            }
            
            // Reload recordings for this day
            await loadRecordings(activityId, day);
            
            // Ensure timer is stopped and UI is reset to idle state after saving
            stopRecordingTimer(activityId, day);
            updateRecordingUI(activityId, day, 'idle');
        } else {
            showError('Failed to save recording: ' + (data.error || 'Unknown error'));
            // Ensure timer is stopped and reset UI to idle state even on error
            stopRecordingTimer(activityId, day);
            updateRecordingUI(activityId, day, 'idle');
        }
    } catch (error) {
        console.error('Error saving recording:', error);
        showError('Failed to save recording: ' + error.message);
        // Ensure timer is stopped and reset UI to idle state on error
        stopRecordingTimer(activityId, day);
        updateRecordingUI(activityId, day, 'idle');
    }
}

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
        
        const data = await response.json();
        
        if (data.success) {
            // Stop any running timer and reset UI to idle state
            stopRecordingTimer(activityId, day);
            updateRecordingUI(activityId, day, 'idle');
            
            await loadRecordings(activityId, day);
            showSuccess('Recording deleted successfully');
        } else {
            showError(data.error || 'Failed to delete recording');
        }
    } catch (error) {
        console.error('Error deleting recording:', error);
        showError('Failed to delete recording: ' + error.message);
    }
}

// Weekly expressions functions
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
        
        const data = await response.json();
        
        if (data.success) {
            progress = data.progress;
            updateWeeklyExpressionsAudioPlayer(mp3File);
            showSuccess('MP3 file selected successfully');
        } else {
            showError(data.error || 'Failed to select MP3 file');
        }
    } catch (error) {
        console.error('Error selecting MP3 file:', error);
        showError('Failed to select MP3 file: ' + error.message);
    }
}

async function saveWeeklyExpressionsNotes(weekKey, notes) {
    try {
        const response = await fetch('/api/progress', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                activity_id: 'weekly_expressions',
                week_key: weekKey,
                field_name: 'notes',
                field_value: notes,
                day: null
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

// Progress toggle functions
async function toggleVoiceJournalingDay(dateStr, element) {
    const day = dateStr;
    const dayId = day.replace(/-/g, '_');
    const completeBtn = document.getElementById(`voice_journaling_complete_${dayId}`);
    
    if (!completeBtn) return;
    
    const isCompleted = completeBtn.classList.contains('completed');
    const newState = !isCompleted;
    
    try {
        const response = await fetch('/api/progress', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                activity_id: 'voice_journaling',
                day: day,
                completed: newState,
                week_key: currentWeek
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            progress = data.progress;
            weeklySummary = data.weekly_summary;
            updateProgressSummary();
            
            // Update complete button
            if (newState) {
                completeBtn.classList.add('completed');
                completeBtn.textContent = '✓ Completed';
            } else {
                completeBtn.classList.remove('completed');
                completeBtn.textContent = 'Mark as completed';
            }
            
            // Update day box visual state
            const activityContainer = document.querySelector('[data-activity-id="voice_journaling"]');
            const dayBox = activityContainer ? activityContainer.querySelector(`[data-day="${day}"]`) : null;
            if (dayBox) {
                if (newState) {
                    dayBox.classList.add('completed');
                    const dayActions = dayBox.querySelector('.day-actions');
                    if (dayActions && !dayActions.querySelector('.completed-mark')) {
                        const mark = document.createElement('span');
                        mark.className = 'completed-mark';
                        mark.textContent = '✓';
                        dayActions.insertBefore(mark, dayActions.firstChild);
                    }
                    
                    // Close the recording UI if it's open
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
                }
            }
        }
    } catch (error) {
        console.error('Error updating progress:', error);
        showError('Failed to update progress. Please try again.');
    }
}

async function toggleShadowingDay(dateStr, element) {
    const day = dateStr;
    const dayId = day.replace(/-/g, '_');
    const completeBtn = document.getElementById(`shadowing_practice_complete_${dayId}`);
    
    if (!completeBtn) return;
    
    const isCompleted = completeBtn.classList.contains('completed');
    const newState = !isCompleted;
    
    try {
        const response = await fetch('/api/progress', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                activity_id: 'shadowing_practice',
                day: day,
                completed: newState,
                week_key: currentWeek
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            progress = data.progress;
            weeklySummary = data.weekly_summary;
            updateProgressSummary();
            
            if (newState) {
                completeBtn.classList.add('completed');
                completeBtn.textContent = '✓ Completed';
            } else {
                completeBtn.classList.remove('completed');
                completeBtn.textContent = 'Mark as completed';
            }
            
            // Update day box visual state and close recording UI
            const activityContainer = document.querySelector('[data-activity-id="shadowing_practice"]');
            const dayBox = activityContainer ? activityContainer.querySelector(`[data-day="${day}"]`) : null;
            if (dayBox) {
                if (newState) {
                    dayBox.classList.add('completed');
                    const dayActions = dayBox.querySelector('.day-actions');
                    if (dayActions && !dayActions.querySelector('.completed-mark')) {
                        const mark = document.createElement('span');
                        mark.className = 'completed-mark';
                        mark.textContent = '✓';
                        dayActions.insertBefore(mark, dayActions.firstChild);
                    }
                    
                    // Close the recording UI if it's open
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
                }
            }
        }
    } catch (error) {
        console.error('Error updating progress:', error);
        showError('Failed to update progress. Please try again.');
    }
}

async function togglePromptDay(dateStr, element) {
    const day = dateStr;
    const dayId = day.replace(/-/g, '_');
    const completeBtn = document.getElementById(`weekly_speaking_prompt_complete_${dayId}`);
    
    if (!completeBtn) return;
    
    const isCompleted = completeBtn.classList.contains('completed');
    const newState = !isCompleted;
    
    try {
        const response = await fetch('/api/progress', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                activity_id: 'weekly_speaking_prompt',
                day: day,
                completed: newState,
                week_key: currentWeek
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            progress = data.progress;
            weeklySummary = data.weekly_summary;
            updateProgressSummary();
            
            if (newState) {
                completeBtn.classList.add('completed');
                completeBtn.textContent = '✓ Completed';
            } else {
                completeBtn.classList.remove('completed');
                completeBtn.textContent = 'Mark as completed';
            }
            
            // Update day box visual state and close recording UI
            const activityContainer = document.querySelector('[data-activity-id="weekly_speaking_prompt"]');
            const dayBox = activityContainer ? activityContainer.querySelector(`[data-day="${day}"]`) : null;
            if (dayBox) {
                if (newState) {
                    dayBox.classList.add('completed');
                    const dayActions = dayBox.querySelector('.day-actions');
                    if (dayActions && !dayActions.querySelector('.completed-mark')) {
                        const mark = document.createElement('span');
                        mark.className = 'completed-mark';
                        mark.textContent = '✓';
                        dayActions.insertBefore(mark, dayActions.firstChild);
                    }
                    
                    // Close the recording UI if it's open
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
                }
            }
        }
    } catch (error) {
        console.error('Error updating progress:', error);
        showError('Failed to update progress. Please try again.');
    }
}

// Toggle weekly expressions day completion
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
                    element.textContent = '✓ Completed';
                    element.classList.add('completed');
                    
                    // Close the recording UI if it's open
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
        }
    } catch (error) {
        console.error('Error updating progress:', error);
        alert(`Failed to update progress: ${error.message}`);
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
            throw new Error(errorMessage);
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
            throw new Error(data.error || 'Failed to update progress');
        }
    } catch (error) {
        console.error('Error updating progress:', error);
        showError(`Failed to save progress: ${error.message}`);
    }
}

// Audio generation functions (these will be defined later, but declared here for reference)
async function generateAudioForScript(weekKey, scriptNum, buttonElement, sourceType) {
    // This function will be defined later in the file
    // Placeholder to ensure it's available when onclick is called
}

// generatePodcastTypecastAudio (moved to top, see line 5817)

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

// Toggle script visibility (for hints/scripts)
function toggleScript(scriptId) {
    const scriptElement = document.getElementById(scriptId);
    const toggleElement = document.getElementById(`toggle-${scriptId}`);
    
    if (!scriptElement || !toggleElement) return;
    
    if (scriptElement.style.display === 'none') {
        scriptElement.style.display = 'block';
        toggleElement.textContent = '▼';
    } else {
        scriptElement.style.display = 'none';
        toggleElement.textContent = '▶';
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
    
    const videoSelect = document.getElementById(`podcast-video-select-${weekKey}`);
    const chapterSelect = document.getElementById(`podcast-chapter-select-${weekKey}`);
    
    // Get selected video and chapter
    const videoId = videoSelect ? videoSelect.value : null;
    const chapterIndex = chapterSelect ? parseInt(chapterSelect.value) : null;
    
    // Update button to show loading state
    if (button) {
        button.disabled = true;
        button.textContent = '⏳ Loading...';
    }
    
    try {
        const requestBody = {
            week_key: weekKey
        };
        
        // If video and chapter are selected, include them
        if (videoId && chapterIndex !== null && !isNaN(chapterIndex)) {
            requestBody.video_id = videoId;
            requestBody.chapter_index = chapterIndex;
        }
        
        const response = await fetch('/api/podcast-shadowing/regenerate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
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
            // Update progress immediately before loadWeek
            progress = data.progress;
            
            // Get episode and chapter names from progress data (they're in progress.weeks[weekKey].podcast_shadowing)
            const podcastProgress = data.progress?.weeks?.[weekKey]?.podcast_shadowing || {};
            const newMp3File = podcastProgress.mp3_file || data.mp3_file || data.progress_mp3;
            const newEpisodeName = podcastProgress.episode_name || data.episode_name;
            const newChapterName = podcastProgress.chapter_name || data.chapter_name;
            
            console.log('Before loadWeek:', {
                newMp3File: newMp3File,
                newEpisodeName: newEpisodeName,
                newChapterName: newChapterName,
                podcastProgress: podcastProgress
            });
            
            await loadWeek(weekKey);
            
            // After loadWeek completes, ensure progress is updated and reload transcript/audio
            // Use multiple attempts with increasing delays to ensure DOM is ready
            let updateAttempt = 0;
            const maxAttempts = 5;
            
            const attemptUpdate = () => {
                updateAttempt++;
                console.log(`Update attempt ${updateAttempt}/${maxAttempts}`);
                
                const activityProgress = getActivityProgress('podcast_shadowing');
                const transcriptElement = document.getElementById(`podcast-shadowing-transcript-${weekKey}`);
                const audioElement = document.getElementById(`audio-player-podcast-shadowing-${weekKey}`);
                
                if (!activityProgress) {
                    if (updateAttempt < maxAttempts) {
                        setTimeout(attemptUpdate, 200);
                    } else {
                        console.warn('Activity progress not found after all attempts');
                    }
                    return;
                }
                
                // Use activityProgress values for episode/chapter names if available
                const episodeName = activityProgress.episode_name || newEpisodeName;
                const chapterName = activityProgress.chapter_name || newChapterName;
                
                console.log('Elements found:', {
                    activityProgress: !!activityProgress,
                    transcriptElement: !!transcriptElement,
                    audioElement: !!audioElement,
                    mp3_file: activityProgress.mp3_file,
                    expected_mp3: newMp3File,
                    episode_name: episodeName,
                    chapter_name: chapterName
                });
                
                // Update transcript
                if (transcriptElement) {
                    console.log('Loading transcript...');
                    loadPodcastShadowingTranscript(weekKey);
                }
                
                // Update audio source - force update even if matches to ensure fresh load
                if (audioElement && activityProgress.mp3_file) {
                    const sourceElement = audioElement.querySelector('source');
                    if (sourceElement) {
                        const expectedSrc = `/api/podcast-shadowing/mp3/${encodeURIComponent(activityProgress.mp3_file)}`;
                        const currentSrc = sourceElement.src.split('?')[0]; // Remove query params for comparison
                        
                        console.log('Audio source check:', {
                            currentSrc: currentSrc,
                            expectedSrc: expectedSrc,
                            matches: currentSrc.includes(encodeURIComponent(activityProgress.mp3_file))
                        });
                        
                        // Always update to ensure fresh load with cache busting
                        console.log(`Updating audio source from ${currentSrc} to ${expectedSrc}`);
                        sourceElement.src = expectedSrc + `?t=${Date.now()}`;
                        audioElement.load();
                        
                        // Re-setup audio controls
                        const currentSpeed = parseFloat(localStorage.getItem(`podcast_shadowing_speed_${weekKey}`)) || 1.0;
                        setupPodcastShadowingAudioControls(weekKey, currentSpeed);
                    }
                }
                
                // Update title if episode/chapter names are available
                if (episodeName && chapterName) {
                    const titleElement = document.querySelector(`#activity-podcast_shadowing-${weekKey} .audio-player-label`);
                    if (titleElement) {
                        const newTitle = `${episodeName} - ${chapterName}`;
                        console.log('Title updated to:', newTitle);
                        titleElement.textContent = newTitle;
                    } else {
                        console.warn('Title element not found:', `#activity-podcast_shadowing-${weekKey} .audio-player-label`);
                    }
                } else {
                    console.warn('Episode or chapter name missing:', { episodeName, chapterName });
                }
                
                if (updateAttempt < maxAttempts && (!transcriptElement || !audioElement)) {
                    setTimeout(attemptUpdate, 200);
                } else {
                    console.log('Update completed on attempt', updateAttempt);
                }
            };
            
            // Start update attempts after a short delay
            setTimeout(attemptUpdate, 300);
            
            showSuccess('Podcast shadowing MP3 changed successfully!');
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
            await loadWeek(weekKey);
            showSuccess('Weekly expressions MP3 changed successfully!');
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

// Setup podcast typecast audio controls
function setupPodcastTypecastAudioControls(weekKey) {
    // Load saved speed or default to 1.0
    const savedSpeed = parseFloat(localStorage.getItem(`podcast_typecast_speed_${weekKey}`)) || 1.0;
    updatePodcastTypecastSpeedButtonStyles(weekKey, savedSpeed);
    
    createAudioPlayer({
        audioId: `audio-player-typecast-podcast-${weekKey}`,
        controlsId: `controls-typecast-podcast-${weekKey}`,
        progressId: `progress-typecast-podcast-${weekKey}`,
        playheadId: `playhead-typecast-podcast-${weekKey}`,
        timeDisplayId: `time-typecast-podcast-${weekKey}`,
        initialSpeed: savedSpeed
    });
}

// Load podcast videos and chapters for dropdown
async function loadPodcastVideosAndChapters(weekKey) {
    const videoSelect = document.getElementById(`podcast-video-select-${weekKey}`);
    const chapterSelect = document.getElementById(`podcast-chapter-select-${weekKey}`);
    
    if (!videoSelect || !chapterSelect) {
        return;
    }
    
    try {
        // Use cache if available, otherwise fetch
        let videos;
        if (podcastVideosCache) {
            videos = podcastVideosCache;
        } else {
            const response = await fetch('/api/podcast-shadowing/videos');
            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
            }
            
            const data = await response.json();
            if (!data.success) {
                throw new Error(data.error || 'Failed to load videos');
            }
            
            videos = data.videos || [];
            podcastVideosCache = videos;
        }
        
        // Clear existing options
        videoSelect.innerHTML = '<option value="">Select video...</option>';
        chapterSelect.innerHTML = '<option value="">Select chapter...</option>';
        
        // Populate video dropdown
        videos.forEach((video, index) => {
            const option = document.createElement('option');
            option.value = video.video_id;
            option.textContent = `${index + 1}. ${video.video_title}`;
            option.dataset.index = index;
            option.dataset.videoNumber = index + 1;
            videoSelect.appendChild(option);
        });
        
        // Note: size attribute makes dropdown always visible, so we'll use CSS instead
        
        // Get current selection from progress
        const activityProgress = getActivityProgress('podcast_shadowing');
        if (activityProgress && activityProgress.episode_name) {
            // Find matching video
            const matchingVideo = videos.find(v => v.video_title === activityProgress.episode_name);
            if (matchingVideo) {
                const videoIndex = videos.indexOf(matchingVideo);
                videoSelect.value = matchingVideo.video_id;
                // Update chapter dropdown synchronously using cached data
                updatePodcastChapterSelectSync(weekKey, matchingVideo.chapters, videoIndex + 1);
                
                // Find matching chapter if chapter_name exists
                if (activityProgress.chapter_name && matchingVideo.chapters) {
                    const matchingChapter = matchingVideo.chapters.find(
                        ch => ch.title === activityProgress.chapter_name
                    );
                    if (matchingChapter !== undefined) {
                        // Use chapter.chapter_index instead of array index
                        const chapterIndex = matchingChapter.chapter_index !== undefined 
                            ? matchingChapter.chapter_index 
                            : matchingVideo.chapters.indexOf(matchingChapter);
                        chapterSelect.value = chapterIndex.toString();
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error loading podcast videos:', error);
        videoSelect.innerHTML = '<option value="">Error loading videos</option>';
    }
}

// Toggle activity options menu (kebab menu)
function toggleActivityOptions(activityId, weekKey, event) {
    if (event) event.stopPropagation();
    
    const menu = document.getElementById(`activity-options-${activityId}-${weekKey}`);
    if (menu) {
        // Close all other activity option menus first
        document.querySelectorAll('.activity-options-dropdown').forEach(m => {
            if (m.id !== `activity-options-${activityId}-${weekKey}`) {
                m.style.display = 'none';
            }
        });
        
        // Toggle current menu
        if (menu.style.display === 'block') {
            menu.style.display = 'none';
        } else {
            menu.style.display = 'block';
            
            // Load podcast videos and chapters when opening podcast_shadowing dropdown
            if (activityId === 'podcast_shadowing') {
                loadPodcastVideosAndChapters(weekKey);
            }
        }
    }
}

// Update recording UI state
function updateRecordingUI(activityId, day, state) {
    const dayId = day.replace(/-/g, '_');
    const recordBtn = document.getElementById(`${activityId}_record_${dayId}`);
    const stopBtn = document.getElementById(`${activityId}_stop_${dayId}`);
    const timerElement = document.getElementById(`${activityId}_timer_${dayId}`);
    const visualizerDiv = document.getElementById(`${activityId}_visualizer_${dayId}`);
    
    if (!recordBtn || !stopBtn) return;
    
    switch (state) {
        case 'idle':
            recordBtn.style.display = 'inline-block';
            stopBtn.style.display = 'none';
            if (timerElement) timerElement.style.display = 'none';
            if (visualizerDiv) visualizerDiv.style.display = 'none';
            break;
        case 'recording':
            recordBtn.style.display = 'none';
            stopBtn.style.display = 'inline-block';
            stopBtn.disabled = false;
            stopBtn.textContent = '⏹ Stop';
            if (timerElement) timerElement.style.display = 'inline-block';
            if (visualizerDiv) visualizerDiv.style.display = 'block';
            break;
        case 'processing':
            recordBtn.style.display = 'none';
            stopBtn.style.display = 'inline-block';
            stopBtn.disabled = true;
            stopBtn.textContent = 'Processing...';
            // Hide timer and visualizer during processing
            if (timerElement) timerElement.style.display = 'none';
            if (visualizerDiv) visualizerDiv.style.display = 'none';
            break;
        case 'stopped':
            recordBtn.style.display = 'inline-block';
            stopBtn.style.display = 'none';
            if (stopBtn) {
                stopBtn.disabled = false;
                stopBtn.textContent = '⏹ Stop';
            }
            break;
    }
}

// loadPodcastVideosAndChapters (moved to top of file, see line 1525)

// Load available voices from Typecast.ai
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
        updatePodcastVoiceInfo();
    }
}

// formatTimestamp (moved to top of file, see line 1321)
// displayRecordings (moved to top of file, see line 1334)
// loadRecordings (moved to top of file, see line 1460)

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

// showError (moved to top of file, see line 44)

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

// Get activity progress for a specific activity
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

// Factory function to get appropriate renderer for activity type
function getRendererForActivity(activityId) {
    try {
        // Check if renderer classes are available
        if (typeof WeeklyExpressionsRenderer === 'undefined' ||
            typeof VoiceJournalingRenderer === 'undefined' ||
            typeof ShadowingPracticeRenderer === 'undefined' ||
            typeof PodcastShadowingRenderer === 'undefined' ||
            typeof WeeklySpeakingPromptRenderer === 'undefined') {
            console.error('Renderer classes not loaded. Check script loading order.');
            return null;
        }
        
    const renderers = {
        [ACTIVITY_IDS.WEEKLY_EXPRESSIONS]: new WeeklyExpressionsRenderer(),
        [ACTIVITY_IDS.VOICE_JOURNALING]: new VoiceJournalingRenderer(),
        [ACTIVITY_IDS.SHADOWING_PRACTICE]: new ShadowingPracticeRenderer(),
        [ACTIVITY_IDS.PODCAST_SHADOWING]: new PodcastShadowingRenderer(),
        [ACTIVITY_IDS.WEEKLY_SPEAKING_PROMPT]: new WeeklySpeakingPromptRenderer()
    };
    return renderers[activityId] || new ActivityRenderer();
    } catch (error) {
        console.error(`Error creating renderer for ${activityId}:`, error);
        return null;
    }
}

// Create activity element
function createActivityElement(activity) {
    const div = document.createElement('div');
    div.className = 'activity';
    div.dataset.activityId = activity.id;
    
    // Get current progress for this activity (declare outside try block so it's accessible later)
    let activityProgress = null;
    
    try {
    // Get current progress for this activity
        activityProgress = getActivityProgress(activity.id);
    
    // Get renderer for this activity type
    const renderer = getRendererForActivity(activity.id);
        
        if (!renderer) {
            console.error(`No renderer found for activity: ${activity.id}`);
            div.innerHTML = `<div class="activity-header"><h3>${activity.title}</h3></div><div class="error">Renderer not found</div>`;
            return div;
        }
        
        // Ensure availableVoices is defined
        if (typeof availableVoices === 'undefined') {
            availableVoices = [];
        }
    
    // Render activity content using renderer
    let activityContent = '';
    if (activity.id === ACTIVITY_IDS.SHADOWING_PRACTICE || activity.id === ACTIVITY_IDS.PODCAST_SHADOWING) {
        activityContent = renderer.render(activity, activityProgress, currentWeek, availableVoices);
    } else {
        activityContent = renderer.render(activity, activityProgress, currentWeek);
    }
    
    // Render checkboxes and kebab menu using renderer methods
    const checkboxHtml = renderer.renderCheckboxes(activity, activityProgress, currentWeek);
    const kebabMenuHtml = renderer.renderKebabMenu(activity, activityProgress, currentWeek);
    
    // Build final HTML using renderer's buildActivityHTML method
    div.innerHTML = renderer.buildActivityHTML(activity, activityContent, checkboxHtml, kebabMenuHtml);
    } catch (error) {
        console.error(`Error rendering activity ${activity.id}:`, error);
        div.innerHTML = `<div class="activity-header"><h3>${activity.title}</h3></div><div class="error">Error rendering activity: ${error.message}</div>`;
    }
    
    // Handle post-render initialization for specific activities
    if (activity.id === ACTIVITY_IDS.PODCAST_SHADOWING && activityProgress) {
        const transcriptPath = activityProgress?.transcript_path || '';
        const selectedMp3 = activityProgress?.mp3_file || '';
        const typecastAudioUrl = activityProgress?.typecast_audio_url || '';
        const hasTypecastAudio = typecastAudioUrl && typecastAudioUrl.trim() !== '';
        
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
                // Ensure audio source is set to the current MP3 file
                if (selectedMp3) {
                    const sourceElement = audioElement.querySelector('source');
                    if (sourceElement) {
                        const expectedSrc = `/api/podcast-shadowing/mp3/${encodeURIComponent(selectedMp3)}`;
                        if (!sourceElement.src.includes(encodeURIComponent(selectedMp3))) {
                            console.log('Updating audio source in createActivityElement:', expectedSrc);
                            sourceElement.src = expectedSrc + `?t=${Date.now()}`;
                            audioElement.load();
                        }
                    }
                }
                const currentSpeed = parseFloat(localStorage.getItem(`podcast_shadowing_speed_${currentWeek}`)) || 1.0;
                setupPodcastShadowingAudioControls(currentWeek, currentSpeed);
                updatePodcastShadowingSpeedButtonStyles(currentWeek, currentSpeed);
            }
        }, 200);
    }
    
    return div;
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

// Toggle podcast shadowing day completion (moved to top, see line 1990)

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

// savePromptNotes (moved to top of file, see line 1511)

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

// showError (moved to top of file, see line 44)
// showSuccess (moved to top of file, see line 50)

// toggleScript (moved to top of file, see line 1548)

// Switch audio source for podcast shadowing (moved to top of file, see line 277)

// switchScript (moved to top of file, see line 808)
// toggleAudioRegenOptions (moved to top of file, see line 831)

// toggleActivityOptions (moved to top of file, see line 1598)
// regenerateActivity (moved to top of file, see line 1564)

// podcastVideosCache (moved to top of file, see line 41)
// loadPodcastVideosAndChapters (moved to top of file, see line 1527)

// Update chapter dropdown synchronously (using provided chapters)
function updatePodcastChapterSelectSync(weekKey, chapters, videoNumber) {
    const chapterSelect = document.getElementById(`podcast-chapter-select-${weekKey}`);
    const videoSelect = document.getElementById(`podcast-video-select-${weekKey}`);
    
    if (!chapterSelect || !chapters) {
        return;
    }
    
    // Get video number from selected video or parameter
    let videoNum = videoNumber;
    if (!videoNum && videoSelect) {
        const selectedOption = videoSelect.options[videoSelect.selectedIndex];
        videoNum = selectedOption ? parseInt(selectedOption.dataset.videoNumber) || 1 : 1;
    }
    if (!videoNum) videoNum = 1;
    
    // Clear chapter dropdown
    chapterSelect.innerHTML = '<option value="">Select chapter...</option>';
    
    // Populate chapter dropdown with format: videoNumber-chapterNumber. chapterTitle
    chapters.forEach((chapter, index) => {
        const option = document.createElement('option');
        option.value = chapter.chapter_index;
        option.textContent = `${videoNum}-${index + 1}. ${chapter.title}`;
        chapterSelect.appendChild(option);
    });
    
    // Note: size attribute makes dropdown always visible, so we'll use CSS instead
}

// updatePodcastChapterSelect (moved to top of file, see line 1005)
// updatePodcastChapterSelectSync (moved to top of file, see line 1038)
function updatePodcastChapterSelect(weekKey) {
    const videoSelect = document.getElementById(`podcast-video-select-${weekKey}`);
    const chapterSelect = document.getElementById(`podcast-chapter-select-${weekKey}`);
    
    if (!videoSelect || !chapterSelect) {
        return;
    }
    
    const selectedVideoId = videoSelect.value;
    
    // Clear chapter dropdown
    chapterSelect.innerHTML = '<option value="">Select chapter...</option>';
    
    if (!selectedVideoId) {
        return;
    }
    
    // Use cache if available
    if (podcastVideosCache) {
        const selectedVideo = podcastVideosCache.find(v => v.video_id === selectedVideoId);
        if (selectedVideo && selectedVideo.chapters) {
            const videoIndex = podcastVideosCache.indexOf(selectedVideo);
            updatePodcastChapterSelectSync(weekKey, selectedVideo.chapters, videoIndex + 1);
            return;
        }
    }
    
    // Otherwise fetch videos
    fetch('/api/podcast-shadowing/videos')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                podcastVideosCache = data.videos || [];
                const selectedVideo = podcastVideosCache.find(v => v.video_id === selectedVideoId);
                if (selectedVideo && selectedVideo.chapters) {
                    const videoIndex = podcastVideosCache.indexOf(selectedVideo);
                    updatePodcastChapterSelectSync(weekKey, selectedVideo.chapters, videoIndex + 1);
                }
            }
        })
        .catch(error => {
            console.error('Error loading chapters:', error);
        });
}

// Change podcast shadowing MP3 file
async function changePodcastShadowingMP3(weekKey, buttonElement) {
    const button = buttonElement || document.querySelector(`#activity-options-podcast_shadowing-${weekKey} .activity-option-btn`);
    const originalText = button ? button.textContent : '';
    
    const videoSelect = document.getElementById(`podcast-video-select-${weekKey}`);
    const chapterSelect = document.getElementById(`podcast-chapter-select-${weekKey}`);
    
    // Get selected video and chapter
    const videoId = videoSelect ? videoSelect.value : null;
    const chapterIndex = chapterSelect ? parseInt(chapterSelect.value) : null;
    
    // Update button to show loading state
    if (button) {
        button.disabled = true;
        button.textContent = '⏳ Loading...';
    }
    
    try {
        const requestBody = {
            week_key: weekKey
        };
        
        // If video and chapter are selected, include them
        if (videoId && chapterIndex !== null && !isNaN(chapterIndex)) {
            requestBody.video_id = videoId;
            requestBody.chapter_index = chapterIndex;
        }
        
        const response = await fetch('/api/podcast-shadowing/regenerate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
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
            
            // Clean up existing audio players for this week before reloading
            // This ensures old audio elements are properly disposed
            const podcastShadowingId = `audio-player-podcast-shadowing-${weekKey}`;
            const podcastTypecastId = `audio-player-typecast-podcast-${weekKey}`;
            
            const shadowingPlayer = audioPlayers.get(podcastShadowingId);
            if (shadowingPlayer && shadowingPlayer.audioElement) {
                shadowingPlayer.audioElement.pause();
                shadowingPlayer.audioElement.src = '';
            }
            audioPlayers.delete(podcastShadowingId);
            
            const typecastPlayer = audioPlayers.get(podcastTypecastId);
            if (typecastPlayer && typecastPlayer.audioElement) {
                typecastPlayer.audioElement.pause();
                typecastPlayer.audioElement.src = '';
            }
            audioPlayers.delete(podcastTypecastId);
            
            // Reload the current week to show new MP3 file
            await loadWeek(weekKey);
            showSuccess('Chapter loaded successfully!');
        } else {
            throw new Error(data.error || 'Failed to change MP3');
        }
    } catch (error) {
        console.error('Error changing podcast shadowing MP3:', error);
        showError(`Failed to load chapter: ${error.message}`);
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
// downloadAudio (moved to top of file, see line 994)

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

// toggleSidebar (moved to top of file, see line 803)

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

// cleanupAudioPlayersForWeek (moved to top of file, see line 758)

// Load a specific week
// loadWeek (moved to top of file, see line 758)

// Get all available weeks from progress (moved to top of file, see line 62)

// Format week key for display (moved to top of file, see line 95)

// Get week date range for display (moved to top of file, see line 161)

// Update week list in sidebar (moved to top of file, see line 72)

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

// Helper function to get Sunday-Saturday week number (moved to top of file, see line 72)

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

// goToCurrentWeek (moved to top of file, see line 684)

// Load available voices from Typecast.ai (moved to top of file, see line 304)

// Update voice dropdowns (moved to top of file, see line 171)

// Update podcast voice info (moved to top of file, see line 223)

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

// Recording variables (moved to top of file, see lines 30-38)
// startRecordingTimer (moved to top of file, see line 1133)
// stopRecordingTimer (moved to top of file, see line 1151)
// startVisualization (moved to top of file, see line 1159)
// startRecording (moved to top of file, see line 1223)
// stopRecording (moved to top of file, see line 1278)
// deleteRecording (moved to top of file, see line 1286)
// saveRecording (defined below)
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

// startRecordingTimer (moved to top of file, see line 1133)
// startVisualization (moved to top of file, see line 1159)

// Stop recording
function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        updateRecordingUI(currentRecordingActivity, currentRecordingDay, 'stopped');
    }
}

// saveRecording (moved to top of file, see line 1294)

// autoMarkDayCompleted (moved to top of file, see line 1485)

// loadAllRecordings (moved to top of file, see line 2351)
// loadRecordings (moved to top of file, see line 1460)
// displayRecordings (moved to top of file, see line 1334)
// formatTimestamp (moved to top of file, see line 1321)

// updateRecordingUI (moved to top of file, see line 1413)

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
                            <button class="play-pause-btn">▶</button>
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

// Set playback speed (moved to top of file, see line 637)
// updateSpeedButtonStyles (moved to top of file, see line 620)

function setupWeeklyExpressionsAudioControls(weekKey, initialSpeed) {
    createAudioPlayer({
        audioId: `audio-player-weekly-expressions-${weekKey}`,
        controlsId: `controls-weekly-expressions-${weekKey}`,
        progressId: `progress-weekly-expressions-${weekKey}`,
        playheadId: `playhead-weekly-expressions-${weekKey}`,
        timeDisplayId: `time-weekly-expressions-${weekKey}`,
        initialSpeed: initialSpeed || 1.0
    });
}

// Set up all weekly expressions audio controls (moved to top of file, see line 636)
// updateSpeedButtonStyles (moved to top of file, see line 620)

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
    const player = getAudioPlayer(`audio-player-${sourceType}-${weekKey}-${scriptNum}`);
    if (player) {
        player.togglePlayPause();
    }
}

function seekAudio(sourceType, weekKey, scriptNum, event) {
    const player = getAudioPlayer(`audio-player-${sourceType}-${weekKey}-${scriptNum}`);
    if (player) {
        player.seek(event);
    }
}

function skipShadowingAudio(sourceType, weekKey, scriptNum, seconds) {
    const player = getAudioPlayer(`audio-player-${sourceType}-${weekKey}-${scriptNum}`);
    if (player) {
        player.skip(seconds);
    }
}

// formatTime and updateTimeDisplay (moved to top of file, see lines 151 and 159)

/**
 * Unified AudioPlayer class (moved to top of file, see line 27)
 * Create and register an audio player instance (moved to top of file, see line 218)
 * Get an audio player instance (moved to top of file, see line 260)
 */

// Best Answer Audio Player Functions (for shadowing mode)
function toggleBestAnswerPlayPause(sourceType, weekKey) {
    const player = getAudioPlayer(`audio-player-${sourceType}-best-answer-${weekKey}`);
    if (!player) return;
    
    // Pause other audio source when playing this one
    if (player.audioElement.paused) {
        const otherSource = sourceType === 'typecast' ? 'openai' : 'typecast';
        const otherPlayer = getAudioPlayer(`audio-player-${otherSource}-best-answer-${weekKey}`);
        if (otherPlayer && !otherPlayer.audioElement.paused) {
            otherPlayer.audioElement.pause();
        }
    }
    
    player.togglePlayPause();
}

function skipBestAnswerAudio(sourceType, weekKey, seconds) {
    const player = getAudioPlayer(`audio-player-${sourceType}-best-answer-${weekKey}`);
    if (player) {
        player.skip(seconds);
    }
}

function seekBestAnswerAudio(sourceType, weekKey, event) {
    const player = getAudioPlayer(`audio-player-${sourceType}-best-answer-${weekKey}`);
    if (player) {
        player.seek(event);
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
    createAudioPlayer({
        audioId: `audio-player-${sourceType}-best-answer-${weekKey}`,
        controlsId: `controls-${sourceType}-best-answer-${weekKey}`,
        progressId: `progress-${sourceType}-best-answer-${weekKey}`,
        playheadId: `playhead-${sourceType}-best-answer-${weekKey}`,
        timeDisplayId: `time-${sourceType}-best-answer-${weekKey}`,
        initialSpeed: 1.0
    });
}

// Set up audio controls event listeners for shadowing practice
function setupShadowingAudioControls(sourceType, weekKey, scriptNum) {
    // Restore saved playback speed for typecast audio
    let initialSpeed = 1.0;
    if (sourceType === 'typecast') {
        initialSpeed = parseFloat(localStorage.getItem(`shadowing_typecast_speed_${weekKey}_${scriptNum}`)) || 1.0;
        updateShadowingTypecastSpeedButtonStyles(weekKey, scriptNum, initialSpeed);
    }
    
    createAudioPlayer({
        audioId: `audio-player-${sourceType}-${weekKey}-${scriptNum}`,
        controlsId: `controls-${sourceType}-${weekKey}-${scriptNum}`,
        progressId: `progress-${sourceType}-${weekKey}-${scriptNum}`,
        playheadId: `playhead-${sourceType}-${weekKey}-${scriptNum}`,
        timeDisplayId: `time-${sourceType}-${weekKey}-${scriptNum}`,
        initialSpeed: initialSpeed
    });
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

// Shadowing Practice Audio Controls (moved to top of file)
// setShadowingTypecastSpeed (see line 854)
// updateShadowingTypecastSpeedButtonStyles (see line 863)

// Podcast Shadowing Audio Controls (moved to top of file)
// setPodcastShadowingSpeed (see line 901)
// updatePodcastShadowingSpeedButtonStyles (see line 910)
// togglePodcastShadowingPlayPause (see line 880)
// seekPodcastShadowingAudio (see line 887)
// skipPodcastShadowingAudio (see line 894)

function setupPodcastShadowingAudioControls(weekKey, initialSpeed) {
    createAudioPlayer({
        audioId: `audio-player-podcast-shadowing-${weekKey}`,
        controlsId: `controls-podcast-shadowing-${weekKey}`,
        progressId: `progress-podcast-shadowing-${weekKey}`,
        playheadId: `playhead-podcast-shadowing-${weekKey}`,
        timeDisplayId: `time-podcast-shadowing-${weekKey}`,
        initialSpeed: initialSpeed || 1.0
    });
}

// Podcast Typecast Audio Controls (moved to top of file)
// togglePodcastTypecastPlayPause (see line 926)
// seekPodcastTypecastAudio (see line 933)
// skipPodcastTypecastAudio (see line 940)
// setPodcastTypecastSpeed (see line 947)
// updatePodcastTypecastSpeedButtonStyles (see line 956)
// togglePodcastTypecastRegenOptions (see line 972)
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
    if (!transcriptElement) {
        console.warn('Transcript element not found:', `podcast-shadowing-transcript-${weekKey}`);
        return;
    }
    
    try {
        // Get current activity progress to ensure we're loading the right transcript
        const activityProgress = getActivityProgress('podcast_shadowing');
        console.log('Loading transcript with activity progress:', {
            week_key: weekKey,
            mp3_file: activityProgress?.mp3_file,
            episode_name: activityProgress?.episode_name,
            chapter_name: activityProgress?.chapter_name
        });
        
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
            console.log('Transcript loaded successfully, length:', data.transcript.length);
            transcriptElement.textContent = data.transcript;
        } else {
            console.warn('No transcript in response:', data);
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


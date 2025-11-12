"""
Progress and data management for the speaking practice tool.
Handles progress tracking, week calculations, and data persistence.
"""

from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
import json
import os
import pytz
from config import PROGRESS_FILE

# Pacific timezone
PST = pytz.timezone('America/Los_Angeles')


def get_phase1_roadmap() -> Dict[str, Any]:
    """
    Returns the Phase 1 roadmap structure.
    Focuses on Daily Speaking Habits (0-6 months).
    """
    return {
        "phase": 1,
        "title": "Daily Speaking Habits",
        "duration": "0-6 months",
        "objective": "Build consistency, real-time speaking flow, and natural delivery.",
        "activities": [
            {
                "id": "weekly_expressions",
                "title": "Weekly expressions",
                "type": "daily"
            },
            {
                "id": "voice_journaling",
                "title": "Voice Journaling",
                "target_length": "2-3 mins",
                "type": "daily"
            },
            {
                "id": "shadowing_practice",
                "title": "Shadowing Practice",
                "type": "daily"
            },
            {
                "id": "weekly_speaking_prompt",
                "title": "Weekly Speaking Prompt",
                "target_length": "3-5 mins",
                "type": "daily"
            }
        ]
    }


def get_default_progress() -> Dict[str, Any]:
    """
    Returns default empty progress structure.
    """
    return {
        "last_updated": None,
        "weeks": {}
    }


def get_week_key(date: datetime = None) -> str:
    """
    Generate a week key in format 'YYYY-WW' (e.g., '2024-45').
    Uses Sunday-Saturday week format (not ISO Monday-Sunday).
    All dates are in PST (Pacific Time).
    """
    if date is None:
        date = datetime.now(PST)
    
    # Convert to date object if datetime
    if hasattr(date, 'date'):
        date = date.date()
    
    # Find the first Sunday of the year
    jan1 = datetime(date.year, 1, 1).date()
    days_to_sunday = (6 - jan1.weekday()) % 7
    first_sunday = jan1 + timedelta(days=days_to_sunday)
    
    # If date is before first Sunday, it belongs to last week of previous year
    if date < first_sunday:
        # Get the last day of previous year and calculate its week
        dec31 = datetime(date.year - 1, 12, 31).date()
        return get_week_key(dec31)
    
    # Calculate weeks since first Sunday
    days_since = (date - first_sunday).days
    week_num = (days_since // 7) + 1
    
    return f"{date.year}-W{week_num:02d}"


def get_current_week_key() -> str:
    """Get the current week key in PST."""
    return get_week_key(datetime.now(PST))


def get_previous_weeks_content(progress: Dict[str, Any], week_key: str, num_weeks: int = 4) -> Dict[str, Any]:
    """
    Get content from previous weeks for context to avoid repetition.
    Returns words that appeared in consecutive recent weeks (3+ weeks in a row) to avoid,
    while allowing words from earlier weeks to reappear.
    
    Args:
        progress: The progress dictionary
        week_key: Current week key (e.g., '2024-W45')
        num_weeks: Number of previous weeks to check (default: 4)
    
    Returns:
        Dictionary with previous weeks' content:
        {
            'voice_journaling_topics': [list of previous topics to avoid repetition],
            'shadowing_scripts': [list of previous script topics/summaries],
            'weekly_prompts': [list of previous prompts],
            'weekly_prompt_words': [list of words that appeared 3+ consecutive weeks]
        }
    """
    from datetime import timedelta
    
    # Parse current week
    try:
        year_str, week_str = week_key.split('-W')
        year = int(year_str)
        week_num = int(week_str)
    except (ValueError, AttributeError):
        return {'voice_journaling_topics': [], 'shadowing_scripts': [], 'weekly_prompts': [], 'weekly_prompt_words': []}
    
    previous_content = {
        'voice_journaling_topics': [],  # Previous topics to avoid repetition
        'shadowing_scripts': [],  # Previous script summaries
        'weekly_prompts': [],  # Previous prompts
        'weekly_prompt_words': []  # Words that appeared 3+ consecutive weeks
    }
    
    # Get previous weeks by iterating backwards through weeks
    # Get all week keys and sort them to find previous weeks
    all_week_keys = sorted(progress.get('weeks', {}).keys())
    
    # Find current week index
    try:
        current_index = all_week_keys.index(week_key)
        # Get previous weeks (up to num_weeks before current, going backwards)
        prev_indices = range(max(0, current_index - num_weeks), current_index)
        
        # Track consecutive appearances of words and collect topics
        weekly_prompt_word_appearances = {}  # word -> list of week indices where it appeared
        
        # Collect all content from recent weeks
        recent_weeks_indices = list(reversed(prev_indices))  # Most recent first
        for idx in recent_weeks_indices:
            prev_week_key = all_week_keys[idx]
            week_data = progress['weeks'][prev_week_key]
            
            # Collect voice journaling topics (simple list of all previous topics)
            if 'voice_journaling' in week_data and 'topics' in week_data['voice_journaling']:
                topics = week_data['voice_journaling']['topics']
                if topics and isinstance(topics, list):
                    previous_content['voice_journaling_topics'].extend(topics)
            
            # Track weekly prompt words
            if 'weekly_speaking_prompt' in week_data and 'words' in week_data['weekly_speaking_prompt']:
                words = week_data['weekly_speaking_prompt'].get('words', [])
                if words:
                    for word_obj in words:
                        word = word_obj.get('word', word_obj) if isinstance(word_obj, dict) else word_obj
                        if word not in weekly_prompt_word_appearances:
                            weekly_prompt_word_appearances[word] = []
                        weekly_prompt_word_appearances[word].append(idx)
            
            # Get shadowing script (first 150 words as topic summary)
            if 'shadowing_practice' in week_data and 'script' in week_data['shadowing_practice']:
                script = week_data['shadowing_practice'].get('script', '')
                if script:
                    # Extract first 150 words as topic indicator
                    script_words = script.split()[:150]
                    previous_content['shadowing_scripts'].append(' '.join(script_words))
            
            # Get weekly prompts
            if 'weekly_speaking_prompt' in week_data and 'prompt' in week_data['weekly_speaking_prompt']:
                prompt = week_data['weekly_speaking_prompt'].get('prompt', '')
                if prompt:
                    previous_content['weekly_prompts'].append(prompt)
        
        # Find words that appeared in 3+ consecutive weeks for weekly prompt words
        # Check if a word appears in 3+ consecutive week positions
        consecutive_threshold = 3
        
        for word, appearance_indices in weekly_prompt_word_appearances.items():
            if len(appearance_indices) < consecutive_threshold:
                continue
            
            # Sort appearance indices (most recent first - highest index)
            sorted_indices = sorted(appearance_indices, reverse=True)
            
            # Check if the most recent 3+ appearances are consecutive weeks
            most_recent_idx = sorted_indices[0]
            consecutive_count = 1
            
            # Count how many consecutive weeks starting from the most recent
            for i in range(1, len(sorted_indices)):
                expected_idx = most_recent_idx - i
                if expected_idx in sorted_indices:
                    consecutive_count += 1
                else:
                    break
            
            if consecutive_count >= consecutive_threshold:
                previous_content['weekly_prompt_words'].append(word)
                    
    except (ValueError, IndexError):
        # If current week not found, just return empty
        pass
    
    return previous_content


def get_week_key_from_string(week_string: str) -> str:
    """
    Parse a week string in format 'YYYY-WW' and return it.
    If the format is invalid, returns None.
    """
    try:
        if '-' in week_string and 'W' in week_string:
            # Format: YYYY-WW
            parts = week_string.split('-W')
            if len(parts) == 2:
                year = int(parts[0])
                week = int(parts[1])
                if 1 <= week <= 53 and 2000 <= year <= 2100:  # Basic validation
                    return f"{year}-W{week:02d}"
    except (ValueError, IndexError):
        pass
    return None


def ensure_future_weeks_exist(progress: Dict[str, Any], weeks_ahead: int = 26) -> None:
    """
    Ensure future weeks exist up to weeks_ahead weeks from current week.
    This allows navigation to future weeks even if they haven't been accessed yet.
    Uses proper date calculations to handle ISO week numbering correctly.
    """
    from datetime import timedelta
    
    # Start from current week's Monday (ISO weeks start on Monday)
    today = datetime.now()
    current_year, current_week, current_weekday = today.isocalendar()
    
    # Get Monday of current week
    days_since_monday = current_weekday - 1
    monday_of_current_week = today - timedelta(days=days_since_monday)
    
    # Generate future weeks
    for i in range(1, weeks_ahead + 1):
        # Calculate the date i weeks ahead
        future_date = monday_of_current_week + timedelta(weeks=i)
        future_week_key = get_week_key(future_date)
        
        # Ensure this week exists
        ensure_week_exists(progress, future_week_key)


def get_mp3_file_for_week(week_key: str) -> Optional[str]:
    """
    Get the MP3 file that should be assigned to a given week.
    Uses alphabetical order and cycles through all MP3 files infinitely.
    
    Args:
        week_key: Week key in format 'YYYY-WW' (e.g., '2024-45')
    
    Returns:
        MP3 filename or None if no MP3 files found
    """
    mp3_dir = 'references/네이티브 영어표현력 사전_mp3'
    
    if not os.path.exists(mp3_dir):
        return None
    
    try:
        # Get all MP3 files and sort alphabetically
        mp3_files = [f for f in os.listdir(mp3_dir) if f.endswith('.mp3')]
        mp3_files.sort()  # Alphabetical order
        
        if not mp3_files:
            return None
        
        # Extract week number from week_key (e.g., '2024-45' -> 45)
        # Use week number to determine which MP3 to use (cycling)
        try:
            _, week_str = week_key.split('-W')
            week_num = int(week_str)
        except (ValueError, AttributeError):
            # If week_key format is invalid, default to week 1
            week_num = 1
        
        # Calculate index using modulo to cycle infinitely
        mp3_index = (week_num - 1) % len(mp3_files)
        
        return mp3_files[mp3_index]
    except Exception as e:
        print(f"Error getting MP3 file for week {week_key}: {e}")
        return None


def ensure_week_exists(progress: Dict[str, Any], week_key: str) -> None:
    """
    Ensure a week entry exists in the progress structure.
    Automatically assigns an MP3 file if one isn't already set.
    """
    if week_key not in progress["weeks"]:
        # Get the MP3 file for this week
        mp3_file = get_mp3_file_for_week(week_key) or ""
        
        progress["weeks"][week_key] = {
            "weekly_expressions": {
                "completed_days": [],
                "mp3_file": mp3_file,  # Automatically selected MP3 file for this week
                "notes": {}  # Notes per day: {"2024-11-10": "note text", ...}
            },
            "voice_journaling": {
                "completed_days": [],
                "words": []  # 3 words generated by ChatGPT
            },
            "shadowing_practice": {
                "completed_days": [],
                "video_name": "",  # Stores audio name (kept field name for compatibility)
                "script": "",  # 5-minute script generated by ChatGPT
                "audio_url": ""  # Audio file URL/path generated by Typecast.ai
            },
            "weekly_speaking_prompt": {
                "completed_days": [],
                "prompt": "",  # Generated by ChatGPT
                "words": []  # 5 words generated by ChatGPT
            }
        }
    else:
        # Migrate existing weeks to include weekly_expressions if missing
        if "weekly_expressions" not in progress["weeks"][week_key]:
            # Get the MP3 file for this week if not already set
            mp3_file = get_mp3_file_for_week(week_key) or ""
            progress["weeks"][week_key]["weekly_expressions"] = {
                "completed_days": [],
                "mp3_file": mp3_file,
                "notes": {}
            }
        # Ensure notes field exists for existing weekly_expressions
        elif "notes" not in progress["weeks"][week_key]["weekly_expressions"]:
            progress["weeks"][week_key]["weekly_expressions"]["notes"] = {}
        
        # Auto-assign MP3 file if not already set
        if not progress["weeks"][week_key]["weekly_expressions"].get("mp3_file"):
            mp3_file = get_mp3_file_for_week(week_key)
            if mp3_file:
                progress["weeks"][week_key]["weekly_expressions"]["mp3_file"] = mp3_file


def update_progress(progress: Dict[str, Any], activity_id: str, week_key: str = None, 
                   completed: bool = True, day: str = None) -> Dict[str, Any]:
    """
    Update progress for a specific activity.
    
    Args:
        progress: Current progress dictionary
        activity_id: One of 'weekly_expressions', 'voice_journaling', 'shadowing_practice', 'weekly_speaking_prompt'
        week_key: Week key (defaults to current week)
        completed: Whether the activity is completed
        day: For weekly_expressions, voice_journaling, shadowing_practice and weekly_speaking_prompt, the day to mark (format: 'YYYY-MM-DD')
    """
    if week_key is None:
        week_key = get_current_week_key()
    
    ensure_week_exists(progress, week_key)
    
    if activity_id in ["weekly_expressions", "voice_journaling", "shadowing_practice", "weekly_speaking_prompt"]:
        if day is None:
            day = datetime.now().strftime('%Y-%m-%d')
        activity_key = activity_id
        if completed and day not in progress["weeks"][week_key][activity_key]["completed_days"]:
            progress["weeks"][week_key][activity_key]["completed_days"].append(day)
        elif not completed and day in progress["weeks"][week_key][activity_key]["completed_days"]:
            progress["weeks"][week_key][activity_key]["completed_days"].remove(day)
    
    progress["last_updated"] = datetime.now().isoformat()
    return progress


def get_weekly_progress_summary(progress: Dict[str, Any], week_key: str = None) -> Dict[str, Any]:
    """
    Get a summary of progress for a specific week.
    """
    if week_key is None:
        week_key = get_current_week_key()
    
    ensure_week_exists(progress, week_key)
    
    week_data = progress["weeks"][week_key]
    weekly_expressions_days = len(week_data.get("weekly_expressions", {}).get("completed_days", []))
    voice_journaling_days = len(week_data["voice_journaling"]["completed_days"])
    shadowing_days = len(week_data["shadowing_practice"]["completed_days"])
    prompt_days = len(week_data["weekly_speaking_prompt"]["completed_days"])
    
    return {
        "week_key": week_key,
        "weekly_expressions_days": weekly_expressions_days,
        "voice_journaling_days": voice_journaling_days,
        "shadowing_practice_days": shadowing_days,
        "weekly_speaking_prompt_days": prompt_days,
        "total_activities": 4,
        "completed_activities": sum([
            1 if weekly_expressions_days > 0 else 0,
            1 if voice_journaling_days > 0 else 0,
            1 if shadowing_days > 0 else 0,
            1 if prompt_days > 0 else 0
        ])
    }


def load_progress() -> Dict[str, Any]:
    """Load progress from JSON file."""
    if os.path.exists(PROGRESS_FILE):
        try:
            with open(PROGRESS_FILE, 'r', encoding='utf-8') as f:
                progress = json.load(f)
                return progress
        except (json.JSONDecodeError, IOError):
            return get_default_progress()
    return get_default_progress()


def save_progress(progress: Dict[str, Any]) -> bool:
    """Save progress to JSON file."""
    try:
        with open(PROGRESS_FILE, 'w', encoding='utf-8') as f:
            json.dump(progress, f, indent=2, ensure_ascii=False)
        return True
    except (IOError, OSError) as e:
        print(f"Error saving progress (IOError/OSError): {e}")
        import traceback
        traceback.print_exc()
        return False
    except (TypeError, ValueError) as e:
        print(f"Error saving progress (JSON serialization error): {e}")
        import traceback
        traceback.print_exc()
        return False
    except Exception as e:
        print(f"Error saving progress (unexpected error): {e}")
        import traceback
        traceback.print_exc()
        return False


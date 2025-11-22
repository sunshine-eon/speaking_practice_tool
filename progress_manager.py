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
    Weekly Speaking Prompt is hidden until 2026-W01.
    """
    activities = [
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
            "id": "podcast_shadowing",
            "title": "Podcast Shadowing",
            "type": "daily"
        },
        {
            "id": "weekly_speaking_prompt",
            "title": "Weekly Speaking Prompt",
            "target_length": "3-5 mins",
            "type": "daily"
        }
    ]
    
    # Hide weekly_speaking_prompt until 2026-W01
    current_week_key = get_current_week_key()
    try:
        year_str, week_str = current_week_key.split('-W')
        year = int(year_str)
        week_num = int(week_str)
        
        # Show weekly_speaking_prompt only if current week is 2026-W01 or later
        if year < 2026 or (year == 2026 and week_num < 1):
            activities = [a for a in activities if a["id"] != "weekly_speaking_prompt"]
    except (ValueError, AttributeError):
        # If week_key format is invalid, hide weekly_speaking_prompt by default
        activities = [a for a in activities if a["id"] != "weekly_speaking_prompt"]
    
    return {
        "phase": 1,
        "title": "Daily Speaking Habits",
        "duration": "0-6 months",
        "objective": "Build consistency, real-time speaking flow, and natural delivery.",
        "activities": activities
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


def is_future_week(week_key: str) -> bool:
    """
    Check if a week is in the future (after current week).
    
    Args:
        week_key: Week key in format 'YYYY-WW' (e.g., '2024-45')
    
    Returns:
        True if week is in the future, False otherwise
    """
    current_week = get_current_week_key()
    
    try:
        current_year_str, current_week_str = current_week.split('-W')
        current_year = int(current_year_str)
        current_week_num = int(current_week_str)
        
        year_str, week_str = week_key.split('-W')
        year = int(year_str)
        week_num = int(week_str)
        
        if year > current_year:
            return True
        elif year == current_year:
            return week_num > current_week_num
        else:
            return False
    except (ValueError, AttributeError):
        return False


def get_previous_week_key(week_key: str) -> Optional[str]:
    """
    Get the previous week key.
    
    Args:
        week_key: Week key in format 'YYYY-WW' (e.g., '2024-45')
    
    Returns:
        Previous week key or None if invalid
    """
    try:
        year_str, week_str = week_key.split('-W')
        year = int(year_str)
        week_num = int(week_str)
        
        week_num -= 1
        if week_num < 1:
            week_num = 53
            year -= 1
        
        return f"{year}-W{week_num:02d}"
    except (ValueError, AttributeError):
        return None


def is_shadowing_mode(week_key: str) -> bool:
    """
    Check if a week should use shadowing mode for weekly_speaking_prompt.
    Shadowing mode is active for weeks up to and including 2025-W52.
    After that, reverts to the original recording approach.
    
    Args:
        week_key: Week key in format 'YYYY-WW' (e.g., '2025-W52')
    
    Returns:
        True if shadowing mode is active, False otherwise
    """
    try:
        year_str, week_str = week_key.split('-W')
        year = int(year_str)
        week_num = int(week_str)
        
        # Shadowing mode is active for weeks <= 2025-W52
        if year < 2025:
            return True
        elif year == 2025:
            return week_num <= 52
        else:
            return False
    except (ValueError, AttributeError):
        # If week_key format is invalid, default to False (original mode)
        return False


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
    # Directory containing MP3 files (Korean directory name preserved for filesystem compatibility)
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


def get_random_mp3_file(week_key: str, progress: Dict[str, Any] = None, exclude_current: str = None) -> Optional[str]:
    """
    Get a random MP3 file, preferring files that haven't been used for completed days.
    
    Args:
        week_key: Week key in format 'YYYY-WW' (e.g., '2024-45')
        progress: Progress dictionary (optional, for checking used files)
        exclude_current: Current MP3 file to exclude from selection
    
    Returns:
        MP3 filename or None if no MP3 files found
    """
    # Directory containing MP3 files (Korean directory name preserved for filesystem compatibility)
    mp3_dir = 'references/네이티브 영어표현력 사전_mp3'
    
    if not os.path.exists(mp3_dir):
        return None
    
    try:
        # Get all MP3 files and sort alphabetically
        mp3_files = [f for f in os.listdir(mp3_dir) if f.endswith('.mp3')]
        mp3_files.sort()  # Alphabetical order
        
        if not mp3_files:
            return None
        
        # Get list of MP3 files that have been used for completed days
        used_files = set()
        if progress and week_key in progress.get("weeks", {}):
            week_data = progress["weeks"][week_key]
            weekly_expr = week_data.get("weekly_expressions", {})
            completed_days = weekly_expr.get("completed_days", [])
            
            for day_entry in completed_days:
                if isinstance(day_entry, dict):
                    # New format: {"day": "2024-11-10", "mp3_file": "file.mp3"}
                    mp3_file = day_entry.get("mp3_file")
                    if mp3_file:
                        used_files.add(mp3_file)
                elif isinstance(day_entry, str):
                    # Old format: just date string (backward compatibility)
                    # Skip - we don't know which MP3 was used
                    pass
        
        # Exclude current file if specified
        if exclude_current:
            used_files.add(exclude_current)
        
        # Prefer unused files
        unused_files = [f for f in mp3_files if f not in used_files]
        
        if unused_files:
            # Randomly select from unused files
            import random
            return random.choice(unused_files)
        else:
            # All files have been used, randomly select from all files
            import random
            return random.choice(mp3_files)
    except Exception as e:
        print(f"Error getting random MP3 file for week {week_key}: {e}")
        # Fallback to default assignment
        return get_mp3_file_for_week(week_key)


def get_all_podcast_videos_and_chapters() -> Dict[str, Any]:
    """
    Get all available videos and their chapters for podcast shadowing.
    Only returns chapters that have Large model formatted transcripts.
    Videos are returned in the order specified in playlist_metadata.json.
    
    Returns:
        Dictionary with structure:
        {
            'videos': [
                {
                    'video_id': str,
                    'video_title': str,
                    'chapters': [
                        {
                            'chapter_index': int,
                            'title': str,
                            'start_time': int,
                            'end_time': int,
                            'audio_filename': str,
                            'transcript_path': str (optional)
                        },
                        ...
                    ]
                },
                ...
            ]
        }
    """
    import json
    from pathlib import Path
    
    clips_dir = Path('youtube-transcriber-for-shadowing/test_data/clips')
    transcripts_large_dir = Path('youtube-transcriber-for-shadowing/test_data/transcripts_large')
    
    result = {'videos': []}
    
    # Only load from formatted_chapters_list.json - no fallback
    formatted_list_path = transcripts_large_dir / 'formatted_chapters_list.json'
    
    if not formatted_list_path.exists():
        return result
    
    try:
        with open(formatted_list_path, 'r', encoding='utf-8') as f:
            formatted_data = json.load(f)
        
        # Verify that audio files exist and filter accordingly
        videos_with_audio = []
        for video in formatted_data.get('videos', []):
            video_chapters = []
            for chapter in video.get('chapters', []):
                # Check if audio file exists
                audio_filename = chapter.get('audio_filename')
                if audio_filename:
                    audio_path = clips_dir / audio_filename
                    if audio_path.exists():
                        # Verify transcript file exists
                        transcript_path_str = chapter.get('transcript_path', '')
                        if transcript_path_str:
                            transcript_path = Path(transcript_path_str)
                            # Handle relative paths
                            if not transcript_path.is_absolute():
                                transcript_path = Path('youtube-transcriber-for-shadowing') / transcript_path
                            
                            if transcript_path.exists():
                                chapter_info = {
                                    'chapter_index': chapter.get('chapter_index'),
                                    'title': chapter.get('title', ''),
                                    'start_time': chapter.get('start_time', 0),
                                    'end_time': chapter.get('end_time', 0),
                                    'audio_filename': audio_filename,
                                    'transcript_path': str(transcript_path)
                                }
                                video_chapters.append(chapter_info)
            
            if video_chapters:
                videos_with_audio.append({
                    'video_id': video.get('video_id', ''),
                    'video_title': video.get('video_title', 'Unknown'),
                    'chapters': video_chapters
                })
        
        return {'videos': videos_with_audio}
    except (json.JSONDecodeError, IOError, KeyError) as e:
        # If formatted list fails, return empty result
        return result


def get_podcast_clip_by_selection(video_id: str, chapter_index: int) -> Optional[Dict[str, Any]]:
    """
    Get a specific podcast clip by video_id and chapter_index.
    Only returns clips that have Large model formatted transcripts.
    
    Args:
        video_id: Video ID
        chapter_index: Chapter index
    
    Returns:
        Dictionary with clip information:
        {
            'audio_filename': str,
            'video_title': str,
            'title': str,
            'transcript_path': str (optional)
        }
        or None if not found
    """
    import json
    from pathlib import Path
    
    clips_dir = Path('youtube-transcriber-for-shadowing/test_data/clips')
    transcripts_large_dir = Path('youtube-transcriber-for-shadowing/test_data/transcripts_large')
    
    if not clips_dir.exists():
        return None
    
    # Only load from formatted_chapters_list.json - no fallback
    formatted_list_path = transcripts_large_dir / 'formatted_chapters_list.json'
    
    if not formatted_list_path.exists():
        return None
    
    try:
        with open(formatted_list_path, 'r', encoding='utf-8') as f:
            formatted_data = json.load(f)
        
        # Find the specific video and chapter
        for video in formatted_data.get('videos', []):
            if video.get('video_id') == video_id:
                for chapter in video.get('chapters', []):
                    if chapter.get('chapter_index') == chapter_index:
                        audio_filename = chapter.get('audio_filename')
                        if audio_filename:
                            audio_path = clips_dir / audio_filename
                            if audio_path.exists():
                                transcript_path_str = chapter.get('transcript_path', '')
                                if transcript_path_str:
                                    transcript_path = Path(transcript_path_str)
                                    if not transcript_path.is_absolute():
                                        transcript_path = Path('youtube-transcriber-for-shadowing') / transcript_path
                                    
                                    if transcript_path.exists():
                                        return {
                                            'audio_filename': audio_filename,
                                            'video_title': video.get('video_title', 'Unknown'),
                                            'title': chapter.get('title', ''),
                                            'transcript_path': str(transcript_path),
                                            'video_id': video_id,
                                            'chapter_index': chapter_index
                                        }
    except (json.JSONDecodeError, IOError, KeyError):
        pass
    
    return None


def get_random_podcast_clip(week_key: str, progress: Dict[str, Any] = None, exclude_current: str = None) -> Optional[Dict[str, Any]]:
    """
    Get a random complete podcast clip for podcast_shadowing, preferring unused clips.
    Only returns clips that have Large model formatted transcripts.
    
    Args:
        week_key: Week key in format 'YYYY-WW' (e.g., '2024-45')
        progress: Progress dictionary (optional, for checking used files)
        exclude_current: Current MP3 file to exclude from selection
    
    Returns:
        Dictionary with clip information:
        {
            'audio_filename': str,
            'video_title': str,
            'title': str,
            'transcript_path': str (optional)
        }
        or None if no clips available
    """
    import json
    import random
    from pathlib import Path
    
    clips_dir = Path('youtube-transcriber-for-shadowing/test_data/clips')
    transcripts_large_dir = Path('youtube-transcriber-for-shadowing/test_data/transcripts_large')
    
    if not clips_dir.exists():
        return None
    
    # Only load from formatted_chapters_list.json - no fallback
    formatted_list_path = transcripts_large_dir / 'formatted_chapters_list.json'
    all_clips = []
    
    if not formatted_list_path.exists():
        return None
    
    try:
        with open(formatted_list_path, 'r', encoding='utf-8') as f:
            formatted_data = json.load(f)
        
        # Collect all clips with audio files
        for video in formatted_data.get('videos', []):
            video_id = video.get('video_id', '')
            video_title = video.get('video_title', 'Unknown')
            
            for chapter in video.get('chapters', []):
                audio_filename = chapter.get('audio_filename')
                if audio_filename:
                    audio_path = clips_dir / audio_filename
                    if audio_path.exists():
                        transcript_path_str = chapter.get('transcript_path', '')
                        if transcript_path_str:
                            transcript_path = Path(transcript_path_str)
                            if not transcript_path.is_absolute():
                                transcript_path = Path('youtube-transcriber-for-shadowing') / transcript_path
                            
                            if transcript_path.exists():
                                clip_info = {
                                    'audio_filename': audio_filename,
                                    'video_title': video_title,
                                    'title': chapter.get('title', ''),
                                    'transcript_path': str(transcript_path),
                                    'video_id': video_id,
                                    'chapter_index': chapter.get('chapter_index')
                                }
                                all_clips.append(clip_info)
    except (json.JSONDecodeError, IOError, KeyError):
        return None
    
    if not all_clips:
        return None
    
    # Get list of MP3 files that have been used
    used_files = set()
    if progress:
        # Check all weeks for used podcast shadowing MP3 files
        for week_data in progress.get("weeks", {}).values():
            podcast_shadowing = week_data.get("podcast_shadowing", {})
            mp3_file = podcast_shadowing.get("mp3_file")
            if mp3_file:
                used_files.add(mp3_file)
    
    # Exclude current file if specified
    if exclude_current:
        used_files.add(exclude_current)
    
    # Prefer unused files
    unused_clips = [clip for clip in all_clips if clip['audio_filename'] not in used_files]
    
    if unused_clips:
        # Randomly select from unused clips
        return random.choice(unused_clips)
    else:
        # All files have been used, randomly select from all clips
        return random.choice(all_clips)


def ensure_week_exists(progress: Dict[str, Any], week_key: str) -> None:
    """
    Ensure a week entry exists in the progress structure.
    Automatically assigns MP3 file if not already set.
    """
    if week_key not in progress["weeks"]:
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
                "words": [],  # 5 words generated by ChatGPT
                "best_answer_script": "",  # Best answer script for shadowing mode
                "best_answer_hints": "",  # Explanatory hints for best answer
                "best_answer_typecast_url": "",  # Typecast audio URL
                "best_answer_openai_url": "",  # OpenAI audio URL
                "best_answer_timestamps": []  # Paragraph timestamps
            },
            "podcast_shadowing": {
                "completed_days": [],
                "mp3_file": "",  # Podcast clip MP3 filename
                "episode_name": "",  # Episode title
                "chapter_name": "",  # Chapter title
                "transcript_path": "",  # Path to transcript file
                "typecast_audio_url": "",  # Typecast audio URL
                "typecast_voice": "",  # Typecast voice ID
                "typecast_speed": 1.0,  # Typecast speed
                "typecast_model": "ssfm-v30"  # Typecast model
            }
        }
    else:
        # Migrate existing weeks to include weekly_expressions if missing
        if "weekly_expressions" not in progress["weeks"][week_key]:
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
        weekly_expr = progress["weeks"][week_key]["weekly_expressions"]
        if not weekly_expr.get("mp3_file"):
            mp3_file = get_mp3_file_for_week(week_key)
            if mp3_file:
                weekly_expr["mp3_file"] = mp3_file
        
        # Migrate weekly_speaking_prompt to include new shadowing mode fields if missing
        if "weekly_speaking_prompt" in progress["weeks"][week_key]:
            if "best_answer_script" not in progress["weeks"][week_key]["weekly_speaking_prompt"]:
                progress["weeks"][week_key]["weekly_speaking_prompt"]["best_answer_script"] = ""
            if "best_answer_hints" not in progress["weeks"][week_key]["weekly_speaking_prompt"]:
                progress["weeks"][week_key]["weekly_speaking_prompt"]["best_answer_hints"] = ""
            if "best_answer_typecast_url" not in progress["weeks"][week_key]["weekly_speaking_prompt"]:
                progress["weeks"][week_key]["weekly_speaking_prompt"]["best_answer_typecast_url"] = ""
            if "best_answer_openai_url" not in progress["weeks"][week_key]["weekly_speaking_prompt"]:
                progress["weeks"][week_key]["weekly_speaking_prompt"]["best_answer_openai_url"] = ""
            if "best_answer_timestamps" not in progress["weeks"][week_key]["weekly_speaking_prompt"]:
                progress["weeks"][week_key]["weekly_speaking_prompt"]["best_answer_timestamps"] = []
        
        # Migrate to include podcast_shadowing if missing
        if "podcast_shadowing" not in progress["weeks"][week_key]:
            progress["weeks"][week_key]["podcast_shadowing"] = {
                "completed_days": [],
                "mp3_file": "",
                "episode_name": "",
                "chapter_name": "",
                "transcript_path": "",
                "typecast_audio_url": "",
                "typecast_voice": "",
                "typecast_speed": 1.0,
                "typecast_model": "ssfm-v30"
            }
        else:
            # Ensure all podcast_shadowing fields exist
            podcast_shadowing = progress["weeks"][week_key]["podcast_shadowing"]
            if "completed_days" not in podcast_shadowing:
                podcast_shadowing["completed_days"] = []
            if "mp3_file" not in podcast_shadowing:
                podcast_shadowing["mp3_file"] = ""
            if "episode_name" not in podcast_shadowing:
                podcast_shadowing["episode_name"] = ""
            if "chapter_name" not in podcast_shadowing:
                podcast_shadowing["chapter_name"] = ""
            if "transcript_path" not in podcast_shadowing:
                podcast_shadowing["transcript_path"] = ""
            if "typecast_audio_url" not in podcast_shadowing:
                podcast_shadowing["typecast_audio_url"] = ""
            if "typecast_voice" not in podcast_shadowing:
                podcast_shadowing["typecast_voice"] = ""
            if "typecast_speed" not in podcast_shadowing:
                podcast_shadowing["typecast_speed"] = 1.0
            if "typecast_model" not in podcast_shadowing:
                podcast_shadowing["typecast_model"] = "ssfm-v30"


def update_progress(progress: Dict[str, Any], activity_id: str, week_key: str = None, 
                   completed: bool = True, day: str = None, mp3_file: str = None,
                   episode_name: str = None, chapter_name: str = None) -> Dict[str, Any]:
    """
    Update progress for a specific activity.
    
    Args:
        progress: Current progress dictionary
        activity_id: One of 'weekly_expressions', 'voice_journaling', 'shadowing_practice', 'weekly_speaking_prompt', 'podcast_shadowing'
        week_key: Week key (defaults to current week)
        completed: Whether the activity is completed
        day: For weekly_expressions, voice_journaling, shadowing_practice, weekly_speaking_prompt and podcast_shadowing, the day to mark (format: 'YYYY-MM-DD')
        mp3_file: For weekly_expressions, the MP3 file that was used when marking as completed
        episode_name: For podcast_shadowing, the episode name that was used when marking as completed
        chapter_name: For podcast_shadowing, the chapter name that was used when marking as completed
    """
    if week_key is None:
        week_key = get_current_week_key()
    
    ensure_week_exists(progress, week_key)
    
    if activity_id in ["weekly_expressions", "voice_journaling", "shadowing_practice", "weekly_speaking_prompt", "podcast_shadowing"]:
        if day is None:
            day = datetime.now().strftime('%Y-%m-%d')
        activity_key = activity_id
        
        if activity_id == "weekly_expressions":
            # For weekly_expressions, store day and MP3 file info together
            completed_days = progress["weeks"][week_key][activity_key]["completed_days"]
            
            if completed:
                # Check if day already exists (could be old format string or new format dict)
                day_exists = False
                for i, entry in enumerate(completed_days):
                    if isinstance(entry, dict):
                        if entry.get("day") == day:
                            day_exists = True
                            # Update existing entry with MP3 file if provided
                            if mp3_file:
                                entry["mp3_file"] = mp3_file
                            break
                    elif isinstance(entry, str) and entry == day:
                        # Migrate old format to new format
                        day_exists = True
                        completed_days[i] = {"day": day, "mp3_file": mp3_file or ""}
                        break
                
                if not day_exists:
                    # Add new entry
                    completed_days.append({"day": day, "mp3_file": mp3_file or ""})
            else:
                # Remove entry (handle both old and new formats)
                completed_days[:] = [e for e in completed_days 
                                     if (isinstance(e, dict) and e.get("day") != day) or 
                                        (isinstance(e, str) and e != day)]
        elif activity_id == "podcast_shadowing":
            # For podcast_shadowing, store day and episode/chapter info together (like weekly_expressions with MP3)
            completed_days = progress["weeks"][week_key][activity_key]["completed_days"]
            
            if completed:
                # Check if day already exists (could be old format string or new format dict)
                day_exists = False
                for i, entry in enumerate(completed_days):
                    if isinstance(entry, dict):
                        if entry.get("day") == day:
                            day_exists = True
                            # Update existing entry with episode/chapter info if provided
                            if episode_name:
                                entry["episode_name"] = episode_name
                            if chapter_name:
                                entry["chapter_name"] = chapter_name
                            # Keep mp3_file for backward compatibility
                            if mp3_file:
                                entry["mp3_file"] = mp3_file
                            break
                    elif isinstance(entry, str) and entry == day:
                        # Migrate old format to new format
                        day_exists = True
                        completed_days[i] = {
                            "day": day,
                            "episode_name": episode_name or "",
                            "chapter_name": chapter_name or "",
                            "mp3_file": mp3_file or ""
                        }
                        break
                
                if not day_exists:
                    # Add new entry
                    completed_days.append({
                        "day": day,
                        "episode_name": episode_name or "",
                        "chapter_name": chapter_name or "",
                        "mp3_file": mp3_file or ""
                    })
            else:
                # Remove entry (handle both old and new formats)
                completed_days[:] = [e for e in completed_days 
                                     if (isinstance(e, dict) and e.get("day") != day) or 
                                        (isinstance(e, str) and e != day)]
        else:
            # For other activities, use simple list format
            if completed and day not in progress["weeks"][week_key][activity_key]["completed_days"]:
                progress["weeks"][week_key][activity_key]["completed_days"].append(day)
            elif not completed and day in progress["weeks"][week_key][activity_key]["completed_days"]:
                progress["weeks"][week_key][activity_key]["completed_days"].remove(day)
    
    progress["last_updated"] = datetime.now().isoformat()
    return progress


def calculate_streak(progress: Dict[str, Any]) -> int:
    """
    Calculate the current streak (consecutive days with any activity completed).
    Checks from today backwards until finding a day that had no activities completed.
    
    Args:
        progress: Progress dictionary
    
    Returns:
        Number of consecutive days with at least one activity completed (including today if completed)
    """
    if not progress or "weeks" not in progress:
        return 0
    
    # Get all completed days across all activities
    completed_dates = set()
    activity_ids = ["weekly_expressions", "voice_journaling", "shadowing_practice", 
                    "weekly_speaking_prompt", "podcast_shadowing"]
    
    for week_key, week_data in progress["weeks"].items():
        for activity_id in activity_ids:
            if activity_id not in week_data:
                continue
            
            completed_days = week_data[activity_id].get("completed_days", [])
            for entry in completed_days:
                if isinstance(entry, dict):
                    day = entry.get("day")
                    if day:
                        completed_dates.add(day)
                elif isinstance(entry, str):
                    completed_dates.add(entry)
    
    if not completed_dates:
        return 0
    
    # Convert to date objects for easier comparison
    completed_date_objects = {datetime.strptime(d, '%Y-%m-%d').date() for d in completed_dates}
    
    # Start from today and count backwards
    today = datetime.now(PST).date()
    streak = 0
    current_date = today
    
    # Count consecutive days backwards
    while current_date in completed_date_objects:
        streak += 1
        current_date = current_date - timedelta(days=1)
    
    return streak


def get_weekly_progress_summary(progress: Dict[str, Any], week_key: str = None) -> Dict[str, Any]:
    """
    Get a summary of progress for a specific week.
    """
    if week_key is None:
        week_key = get_current_week_key()
    
    ensure_week_exists(progress, week_key)
    
    week_data = progress["weeks"][week_key]
    # Handle both old format (list of strings) and new format (list of dicts) for weekly_expressions
    completed_days_we = week_data.get("weekly_expressions", {}).get("completed_days", [])
    weekly_expressions_days = len(completed_days_we)
    voice_journaling_days = len(week_data["voice_journaling"]["completed_days"])
    shadowing_days = len(week_data["shadowing_practice"]["completed_days"])
    prompt_days = len(week_data["weekly_speaking_prompt"]["completed_days"])
    podcast_shadowing_days = len(week_data.get("podcast_shadowing", {}).get("completed_days", []))
    
    # Calculate overall streak (any activity completed counts)
    streak = calculate_streak(progress)
    
    return {
        "week_key": week_key,
        "weekly_expressions_days": weekly_expressions_days,
        "voice_journaling_days": voice_journaling_days,
        "shadowing_practice_days": shadowing_days,
        "weekly_speaking_prompt_days": prompt_days,
        "podcast_shadowing_days": podcast_shadowing_days,
        "total_activities": 5,
        "completed_activities": sum([
            1 if weekly_expressions_days > 0 else 0,
            1 if voice_journaling_days > 0 else 0,
            1 if shadowing_days > 0 else 0,
            1 if prompt_days > 0 else 0,
            1 if podcast_shadowing_days > 0 else 0
        ]),
        "streak": streak
    }


def load_progress() -> Dict[str, Any]:
    """Load progress from JSON file."""
    if os.path.exists(PROGRESS_FILE):
        try:
            with open(PROGRESS_FILE, 'r', encoding='utf-8') as f:
                progress = json.load(f)
                # Initialize global podcast_chapter_audio if it doesn't exist
                if 'podcast_chapter_audio' not in progress:
                    progress['podcast_chapter_audio'] = {}
                return progress
        except (json.JSONDecodeError, IOError):
            progress = get_default_progress()
            progress['podcast_chapter_audio'] = {}
            return progress
    progress = get_default_progress()
    progress['podcast_chapter_audio'] = {}
    return progress


def create_backup(progress: Dict[str, Any]) -> Optional[str]:
    """
    Create a backup of progress data before saving.
    Returns the backup file path if successful, None otherwise.
    """
    try:
        # Create backups directory if it doesn't exist
        backup_dir = 'progress_backups'
        os.makedirs(backup_dir, exist_ok=True)
        
        # Create backup filename with timestamp
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_filename = f'progress_backup_{timestamp}.json'
        backup_path = os.path.join(backup_dir, backup_filename)
        
        # Save backup
        with open(backup_path, 'w', encoding='utf-8') as f:
            json.dump(progress, f, indent=2, ensure_ascii=False)
        
        # Keep only the most recent 50 backups to avoid disk space issues
        cleanup_old_backups(backup_dir, keep_count=50)
        
        return backup_path
    except Exception as e:
        print(f"Warning: Failed to create backup: {e}")
        return None


def cleanup_old_backups(backup_dir: str, keep_count: int = 50) -> None:
    """
    Remove old backup files, keeping only the most recent keep_count files.
    """
    try:
        backup_files = []
        for filename in os.listdir(backup_dir):
            if filename.startswith('progress_backup_') and filename.endswith('.json'):
                filepath = os.path.join(backup_dir, filename)
                if os.path.isfile(filepath):
                    mtime = os.path.getmtime(filepath)
                    backup_files.append((mtime, filepath))
        
        # Sort by modification time (newest first)
        backup_files.sort(reverse=True)
        
        # Remove old backups
        if len(backup_files) > keep_count:
            for _, filepath in backup_files[keep_count:]:
                try:
                    os.remove(filepath)
                except Exception as e:
                    print(f"Warning: Failed to remove old backup {filepath}: {e}")
    except Exception as e:
        print(f"Warning: Failed to cleanup old backups: {e}")


def save_progress(progress: Dict[str, Any]) -> bool:
    """
    Save progress to JSON file with automatic backup.
    Creates a backup before saving to prevent data loss.
    """
    try:
        # Create backup before saving
        backup_path = create_backup(progress)
        if backup_path:
            print(f"Backup created: {backup_path}")
        
        # Save progress
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



def list_backups() -> List[Dict[str, Any]]:
    """
    List all available backup files with metadata.
    Returns a list of dictionaries with backup information.
    """
    backups = []
    backup_dir = 'progress_backups'
    
    if not os.path.exists(backup_dir):
        return backups
    
    try:
        for filename in os.listdir(backup_dir):
            if filename.startswith('progress_backup_') and filename.endswith('.json'):
                filepath = os.path.join(backup_dir, filename)
                if os.path.isfile(filepath):
                    mtime = os.path.getmtime(filepath)
                    size = os.path.getsize(filepath)
                    backups.append({
                        'filename': filename,
                        'filepath': filepath,
                        'modified_time': datetime.fromtimestamp(mtime),
                        'size': size
                    })
        
        # Sort by modification time (newest first)
        backups.sort(key=lambda x: x['modified_time'], reverse=True)
        return backups
    except Exception as e:
        print(f"Error listing backups: {e}")
        return backups


def restore_from_backup(backup_filepath: str) -> bool:
    """
    Restore progress from a backup file.
    
    Args:
        backup_filepath: Path to the backup file to restore from
    
    Returns:
        True if restoration was successful, False otherwise
    """
    try:
        # Load backup
        with open(backup_filepath, 'r', encoding='utf-8') as f:
            backup_data = json.load(f)
        
        # Create a backup of current progress before restoring
        current_progress = load_progress()
        create_backup(current_progress)
        
        # Restore from backup
        return save_progress(backup_data)
    except Exception as e:
        print(f"Error restoring from backup: {e}")
        import traceback
        traceback.print_exc()
        return False

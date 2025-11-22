"""Utility functions for finding videos with missing transcripts or clips."""

import json
from pathlib import Path
from typing import List, Dict, Optional
from .config import Config


def find_videos_without_transcripts(config: Config) -> List[Dict]:
    """
    Find all videos that have metadata.json but are missing transcript files.
    
    Args:
        config: Configuration object
        
    Returns:
        List of dicts with video_id, title, missing_chapters info
    """
    transcripts_dir = config.transcripts_dir
    metadata_files = list(config.metadata_dir.glob('*_metadata.json'))
    
    missing_transcripts = []
    
    for metadata_file in metadata_files:
        video_id = metadata_file.stem.replace('_metadata', '')
        
        if video_id == 'playlist':
            continue
        
        try:
            with open(metadata_file, 'r', encoding='utf-8') as f:
                metadata = json.load(f)
            
            chapters = metadata.get('chapters', [])
            if not chapters:
                continue
                
            missing_chapters = []
            
            for chapter_idx, chapter in enumerate(chapters, 1):
                chapter_title = chapter.get('title', f'Chapter {chapter_idx}')
                safe_title = ''.join(c for c in chapter_title if c.isalnum() or c in (' ', '-', '_')).strip()
                safe_title = safe_title.replace(' ', '_')[:50]
                transcript_file = transcripts_dir / f'{video_id}_chapter{chapter_idx}_{safe_title}.txt'
                
                if not transcript_file.exists():
                    missing_chapters.append(chapter_idx)
            
            if missing_chapters:
                missing_transcripts.append({
                    'video_id': video_id,
                    'title': metadata.get('title', 'Unknown'),
                    'missing_chapters': missing_chapters,
                    'total_chapters': len(chapters)
                })
        except Exception as e:
            import logging
            logging.error(f'Error processing {metadata_file}: {e}')
    
    return missing_transcripts


def find_untranscribed_videos(limit: int = 5, transcripts_dir: Optional[Path] = None, 
                              metadata_dir: Optional[Path] = None) -> List[Dict]:
    """
    Find latest videos that haven't been transcribed.
    
    Args:
        limit: Number of videos to return
        transcripts_dir: Directory to check for existing transcripts
        metadata_dir: Directory containing playlist metadata
        
    Returns:
        List of video dictionaries
    """
    if metadata_dir is None:
        metadata_dir = Path('test_data/metadata')
    
    # Load playlist metadata
    metadata_path = metadata_dir / 'playlist_metadata.json'
    if not metadata_path.exists():
        return []
    
    with open(metadata_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Get all videos sorted by upload_date
    videos = data.get('videos', [])
    videos_sorted = sorted(videos, key=lambda x: x.get('upload_date', ''), reverse=True)
    
    # Check which videos already have transcripts
    if transcripts_dir is None:
        transcripts_dir = Path('test_data/transcripts_large')
    
    transcribed_videos = set()
    if transcripts_dir.exists():
        for file in transcripts_dir.glob('*_chapter*.txt'):
            video_id = file.name.split('_chapter')[0]
            transcribed_videos.add(video_id)
    
    # Find videos without transcripts
    untranscribed = []
    for video in videos_sorted:
        video_id = video.get('video_id', '')
        if video_id and video_id not in transcribed_videos:
            upload_date = video.get('upload_date', '')
            if upload_date:
                untranscribed.append(video)
    
    return untranscribed[:limit]


def find_videos_without_clips(config: Config) -> List[Dict]:
    """
    Find videos that have metadata but are missing audio clips.
    
    Args:
        config: Configuration object
        
    Returns:
        List of video dictionaries with missing clips info
    """
    clips_dir = config.clips_dir
    audio_dir = config.audio_dir
    
    metadata_files = list(config.metadata_dir.glob('*_metadata.json'))
    videos_without_clips = []
    
    for metadata_file in metadata_files:
        video_id = metadata_file.stem.replace('_metadata', '')
        
        if video_id == 'playlist':
            continue
        
        try:
            with open(metadata_file, 'r', encoding='utf-8') as f:
                metadata = json.load(f)
            
            chapters = metadata.get('chapters', [])
            if not chapters:
                continue
            
            missing_clips = []
            for chapter in chapters:
                start_time = int(chapter.get('start_time', 0))
                end_time = int(chapter.get('end_time', 0))
                clip_filename = f'{video_id}_{start_time}_{end_time}.mp3'
                clip_path = clips_dir / clip_filename
                
                if not clip_path.exists():
                    missing_clips.append({
                        'start_time': start_time,
                        'end_time': end_time,
                        'title': chapter.get('title', '')
                    })
            
            if missing_clips:
                # Check if audio file exists
                audio_path = None
                for ext in ['.mp3', '.m4a', '.webm', '.opus']:
                    candidate = audio_dir / f'{video_id}{ext}'
                    if candidate.exists():
                        audio_path = candidate
                        break
                
                videos_without_clips.append({
                    'video_id': video_id,
                    'title': metadata.get('title', 'Unknown'),
                    'url': metadata.get('url', ''),
                    'audio_path': audio_path,
                    'missing_clips': missing_clips,
                    'total_chapters': len(chapters)
                })
        except Exception as e:
            import logging
            logging.error(f'Error processing {metadata_file}: {e}')
    
    return videos_without_clips


def find_videos_without_transcripts_simple(config: Config) -> List[str]:
    """
    Find videos that have audio files but no chapter transcripts or incomplete transcripts.
    Simplified version that returns just video IDs.
    
    Args:
        config: Configuration object
        
    Returns:
        List of video IDs that need transcription
    """
    audio_dir = config.audio_dir
    transcripts_dir = config.transcripts_dir
    
    # Get all audio files
    audio_files = list(audio_dir.glob("*.mp3"))
    video_ids = [f.stem for f in audio_files]
    
    # Find videos without chapter transcripts or with incomplete transcripts
    videos_to_transcribe = []
    
    for video_id in video_ids:
        # Check metadata to see total chapters
        metadata_path = config.metadata_dir / f"{video_id}_metadata.json"
        total_chapters = 0
        
        if metadata_path.exists():
            try:
                with open(metadata_path, 'r', encoding='utf-8') as f:
                    metadata = json.load(f)
                total_chapters = len(metadata.get('chapters', []))
            except:
                pass
        
        # Count existing transcript files
        chapter_transcripts = list(transcripts_dir.glob(f"{video_id}_chapter*.txt"))
        transcript_count = len(chapter_transcripts)
        
        # Include if no transcripts or incomplete
        if transcript_count == 0 or (total_chapters > 0 and transcript_count < total_chapters):
            videos_to_transcribe.append(video_id)
    
    return sorted(videos_to_transcribe)


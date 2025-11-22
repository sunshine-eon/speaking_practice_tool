"""Utility functions for audio file operations."""

import glob
import time
from pathlib import Path
from typing import Optional
from .config import Config
from .playlist_handler import PlaylistHandler


def find_audio_file(config: Config, video_id: str) -> Optional[Path]:
    """
    Find existing audio file for a video.
    
    Args:
        config: Configuration object
        video_id: Video ID
        
    Returns:
        Path to audio file if found, None otherwise
    """
    for ext in ['.mp3', '.m4a', '.webm', '.opus']:
        candidate = config.audio_dir / f"{video_id}{ext}"
        if candidate.exists():
            return candidate
    
    # Final check: list all files in audio dir to see if video_id is in any filename
    pattern = str(config.audio_dir / f"*{video_id}*")
    matching_files = glob.glob(pattern)
    if matching_files:
        return Path(matching_files[0])
    
    return None


def ensure_audio_file(config: Config, handler: PlaylistHandler, 
                     video_id: str, video_url: str, 
                     retry_delay: float = 1.0) -> Optional[Path]:
    """
    Ensure audio file exists for a video, downloading if necessary.
    
    Args:
        config: Configuration object
        handler: PlaylistHandler instance
        video_id: Video ID
        video_url: Video URL for downloading
        retry_delay: Delay in seconds before retrying file check after download
        
    Returns:
        Path to audio file if found/created, None otherwise
    """
    # First check if file already exists
    audio_path = find_audio_file(config, video_id)
    if audio_path:
        return audio_path
    
    # Try to download
    audio_path = handler.download_audio(video_url)
    
    # After download attempt, check again for file (might have been created)
    if not audio_path:
        time.sleep(retry_delay)  # Wait a bit for file system to sync
        audio_path = find_audio_file(config, video_id)
    
    return audio_path


def download_audio_for_videos(handler: PlaylistHandler, config: Config,
                              videos: List[Dict], retry_delay: float = 1.0) -> Dict:
    """
    Download audio files for multiple videos.
    
    Args:
        handler: PlaylistHandler instance
        config: Configuration object
        videos: List of video dictionaries with 'video_id' and 'url' keys
        retry_delay: Delay in seconds before retrying file check after download
        
    Returns:
        Dictionary with 'downloaded', 'failed', 'already_existed' lists
    """
    results = {
        'downloaded': [],
        'failed': [],
        'already_existed': []
    }
    
    for vid in videos:
        video_id = vid['video_id']
        url = vid.get('url', f"https://www.youtube.com/watch?v={video_id}")
        
        # Check if already exists
        audio_path = find_audio_file(config, video_id)
        if audio_path:
            vid['audio_path'] = audio_path
            results['already_existed'].append(video_id)
            continue
        
        # Try to download
        try:
            audio_path = ensure_audio_file(config, handler, video_id, url, retry_delay)
            
            if audio_path and audio_path.exists():
                vid['audio_path'] = audio_path
                results['downloaded'].append(video_id)
            else:
                results['failed'].append(video_id)
        except Exception as e:
            import logging
            logging.error(f"Error downloading audio for {video_id}: {e}", exc_info=True)
            results['failed'].append(video_id)
    
    return results


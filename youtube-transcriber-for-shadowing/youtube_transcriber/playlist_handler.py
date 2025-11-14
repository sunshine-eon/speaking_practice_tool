"""YouTube playlist handler for extracting video information."""

import logging
from typing import List, Dict, Optional, Any
from pathlib import Path

import yt_dlp

from .config import Config
from .utils import extract_playlist_id, extract_video_id, sanitize_filename

logger = logging.getLogger(__name__)


class PlaylistHandler:
    """Handler for YouTube playlists."""
    
    def __init__(self, config: Config):
        """
        Initialize playlist handler.
        
        Args:
            config: Configuration object
        """
        self.config = config
        self.ydl_opts = {
            'quiet': False,
            'no_warnings': False,
            'extract_flat': True,  # Don't download, just get info
            'skip_download': True,
        }
    
    def get_playlist_videos(self, playlist_url: str) -> List[Dict[str, Any]]:
        """
        Get list of videos from a YouTube playlist.
        
        Args:
            playlist_url: URL of the YouTube playlist
            
        Returns:
            List of video dictionaries with id, title, url, duration, etc.
        """
        logger.info(f"Fetching playlist videos from {playlist_url}")
        
        playlist_id = extract_playlist_id(playlist_url)
        if not playlist_id:
            logger.error(f"Could not extract playlist ID from {playlist_url}")
            return []
        
        try:
            with yt_dlp.YoutubeDL(self.ydl_opts) as ydl:
                # Extract playlist information
                info = ydl.extract_info(playlist_url, download=False)
                
                if not info:
                    logger.error("Failed to extract playlist information")
                    return []
                
                videos = []
                entries = info.get('entries', [])
                
                if not entries:
                    logger.warning("No entries found in playlist")
                    return []
                
                logger.info(f"Found {len(entries)} videos in playlist")
                
                for entry in entries:
                    if not entry:
                        continue
                    
                    video_data = {
                        'video_id': entry.get('id', ''),
                        'title': entry.get('title', 'Unknown'),
                        'url': entry.get('url') or f"https://www.youtube.com/watch?v={entry.get('id', '')}",
                        'duration': entry.get('duration', 0),
                        'thumbnail': entry.get('thumbnail', ''),
                        'playlist_index': entry.get('playlist_index', 0),
                    }
                    
                    videos.append(video_data)
                
                return videos
                
        except Exception as e:
            logger.error(f"Error fetching playlist videos: {e}", exc_info=True)
            return []
    
    def get_video_info(self, video_url: str) -> Optional[Dict[str, Any]]:
        """
        Get detailed information about a single video, including chapters.
        
        Args:
            video_url: URL of the YouTube video
            
        Returns:
            Dictionary with video information including chapters
        """
        logger.info(f"Fetching video info from {video_url}")
        
        video_id = extract_video_id(video_url)
        if not video_id:
            logger.error(f"Could not extract video ID from {video_url}")
            return None
        
        try:
            opts = self.ydl_opts.copy()
            opts['extract_flat'] = False  # Get full info
            
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(video_url, download=False)
                
                if not info:
                    return None
                
                # Extract chapters if available
                chapters = []
                if 'chapters' in info and info['chapters']:
                    for chapter in info['chapters']:
                        chapters.append({
                            'start_time': chapter.get('start_time', 0.0),
                            'end_time': chapter.get('end_time', 0.0),
                            'title': chapter.get('title', ''),
                        })
                    logger.info(f"Found {len(chapters)} chapters in video")
                
                return {
                    'video_id': info.get('id', video_id),
                    'title': info.get('title', 'Unknown'),
                    'description': info.get('description', ''),
                    'duration': info.get('duration', 0),
                    'upload_date': info.get('upload_date', ''),
                    'uploader': info.get('uploader', ''),
                    'thumbnail': info.get('thumbnail', ''),
                    'url': video_url,
                    'chapters': chapters,
                }
                
        except Exception as e:
            logger.error(f"Error fetching video info: {e}", exc_info=True)
            return None
    
    def get_video_chapters(self, video_url: str) -> List[Dict[str, Any]]:
        """
        Get chapters/sections from a YouTube video.
        
        Args:
            video_url: URL of the YouTube video
            
        Returns:
            List of chapter dictionaries with start_time, end_time, and title
        """
        video_info = self.get_video_info(video_url)
        if video_info and 'chapters' in video_info:
            return video_info['chapters']
        return []
    
    def download_audio(self, video_url: str, output_path: Optional[Path] = None) -> Optional[Path]:
        """
        Download audio from a YouTube video.
        
        Args:
            video_url: URL of the YouTube video
            output_path: Optional path to save the audio file.
                        If None, uses config.audio_dir with video_id as filename.
            
        Returns:
            Path to downloaded audio file, or None if failed
        """
        logger.info(f"Downloading audio from {video_url}")
        
        video_id = extract_video_id(video_url)
        if not video_id:
            logger.error(f"Could not extract video ID from {video_url}")
            return None
        
        if output_path is None:
            filename = f"{video_id}.{self.config.audio_format}"
            output_path = self.config.audio_dir / filename
        
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Check if already exists
        if output_path.exists():
            logger.info(f"Audio file already exists: {output_path}")
            return output_path
        
        try:
            ydl_opts = {
                'format': 'bestaudio/best',
                'outtmpl': str(output_path.with_suffix('.%(ext)s')),
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': self.config.audio_format,
                    'preferredquality': self.config.audio_quality.split('k')[0],
                }],
                'quiet': False,
                'no_warnings': False,
                'user_agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'extractor_args': {
                    'youtube': {
                        'player_client': ['android', 'web'],  # Try different clients
                    }
                },
                'nocheckcertificate': False,
                'ignoreerrors': False,
            }
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([video_url])
            
            # Find the actual output file (yt-dlp might add extension)
            if output_path.exists():
                return output_path
            
            # Try to find file with different extension
            for ext in ['.mp3', '.m4a', '.webm', '.opus']:
                candidate = output_path.with_suffix(ext)
                if candidate.exists():
                    logger.info(f"Found audio file: {candidate}")
                    return candidate
            
            logger.error(f"Downloaded file not found at {output_path}")
            return None
            
        except Exception as e:
            logger.error(f"Error downloading audio: {e}", exc_info=True)
            return None


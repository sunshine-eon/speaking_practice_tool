"""Audio clipping module for extracting specific time ranges from audio files."""

import logging
import subprocess
from pathlib import Path
from typing import Optional

from .config import Config

logger = logging.getLogger(__name__)


class AudioClipper:
    """Audio clipper for extracting time ranges."""
    
    def __init__(self, config: Config):
        """
        Initialize audio clipper.
        
        Args:
            config: Configuration object
        """
        self.config = config
    
    def clip_audio(self, audio_path: Path, start_time: float, end_time: float,
                   output_path: Optional[Path] = None) -> Optional[Path]:
        """
        Clip audio file to specific time range.
        
        Args:
            audio_path: Path to source audio file
            start_time: Start time in seconds
            end_time: End time in seconds
            output_path: Optional output path. If None, generates filename based on times.
            
        Returns:
            Path to clipped audio file, or None if failed
        """
        if not audio_path.exists():
            logger.error(f"Audio file not found: {audio_path}")
            return None
        
        if start_time < 0:
            logger.warning(f"Start time {start_time} is negative, setting to 0")
            start_time = 0
        
        if end_time <= start_time:
            logger.error(f"Invalid time range: {start_time} to {end_time}")
            return None
        
        # Generate output path if not provided
        if output_path is None:
            clip_filename = f"{audio_path.stem}_{int(start_time)}_{int(end_time)}.{self.config.audio_format}"
            output_path = self.config.clips_dir / clip_filename
        
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Check if clip already exists
        if output_path.exists():
            logger.info(f"Clip already exists: {output_path}")
            return output_path
        
        # Calculate duration
        duration = end_time - start_time
        
        logger.info(f"Clipping audio: {start_time:.1f}s to {end_time:.1f}s (duration: {duration:.1f}s)")
        
        try:
            # Use ffmpeg to clip audio
            cmd = [
                'ffmpeg',
                '-i', str(audio_path),
                '-ss', str(start_time),
                '-t', str(duration),
                '-acodec', 'copy',  # Copy codec for speed (if format matches)
                '-y',  # Overwrite output file
                str(output_path)
            ]
            
            # If codec copy fails, try re-encoding
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300  # 5 minute timeout
            )
            
            if result.returncode != 0:
                # Try with re-encoding
                logger.warning("Codec copy failed, trying re-encoding...")
                cmd = [
                    'ffmpeg',
                    '-i', str(audio_path),
                    '-ss', str(start_time),
                    '-t', str(duration),
                    '-acodec', 'libmp3lame' if self.config.audio_format == 'mp3' else 'aac',
                    '-ab', self.config.audio_quality,
                    '-y',
                    str(output_path)
                ]
                
                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=300
                )
            
            if result.returncode == 0:
                if output_path.exists():
                    file_size = output_path.stat().st_size / 1024 / 1024
                    logger.info(f"Audio clipped successfully: {output_path} ({file_size:.2f} MB)")
                    return output_path
                else:
                    logger.error("Clip file was not created")
                    return None
            else:
                logger.error(f"FFmpeg failed: {result.stderr}")
                return None
                
        except subprocess.TimeoutExpired:
            logger.error("FFmpeg timeout")
            return None
        except Exception as e:
            logger.error(f"Error clipping audio: {e}", exc_info=True)
            return None
    
    def clip_video_audio(self, video_id: str, start_time: float, end_time: float) -> Optional[Path]:
        """
        Clip audio for a video by ID.
        
        Args:
            video_id: Video ID
            start_time: Start time in seconds
            end_time: End time in seconds
            
        Returns:
            Path to clipped audio file, or None if failed
        """
        # Find audio file
        audio_path = None
        for ext in ['.mp3', '.m4a', '.webm', '.opus']:
            candidate = self.config.audio_dir / f"{video_id}{ext}"
            if candidate.exists():
                audio_path = candidate
                break
        
        if audio_path is None:
            logger.error(f"Audio file not found for video {video_id}")
            return None
        
        return self.clip_audio(audio_path, start_time, end_time)


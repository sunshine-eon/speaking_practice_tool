"""Configuration settings for YouTube transcriber."""

import os
from pathlib import Path


class Config:
    """Configuration class for YouTube transcriber."""
    
    def __init__(self, base_dir=None, whisper_model="small"):
        """
        Initialize configuration.
        
        Args:
            base_dir: Base directory for storing data. Defaults to current directory.
            whisper_model: Whisper model to use (tiny, base, small, medium, large).
                         Defaults to 'small' for balance between speed and accuracy.
        """
        if base_dir is None:
            base_dir = Path.cwd()
        else:
            base_dir = Path(base_dir)
        
        self.base_dir = base_dir
        
        # Directory structure
        self.audio_dir = base_dir / "audio"
        self.clips_dir = base_dir / "clips"
        self.transcripts_dir = base_dir / "transcripts"
        self.metadata_dir = base_dir / "metadata"
        self.db_path = base_dir / "transcripts.db"
        
        # Create directories if they don't exist
        self.audio_dir.mkdir(parents=True, exist_ok=True)
        self.clips_dir.mkdir(parents=True, exist_ok=True)
        self.transcripts_dir.mkdir(parents=True, exist_ok=True)
        self.metadata_dir.mkdir(parents=True, exist_ok=True)
        
        # Whisper settings
        self.whisper_model = whisper_model
        self.whisper_device = "cpu"  # or "cuda" if GPU available
        
        # Audio settings
        self.audio_format = "mp3"
        self.audio_quality = "192k"  # Audio bitrate
        
        # Processing settings
        self.max_workers = 2  # Number of parallel workers for processing


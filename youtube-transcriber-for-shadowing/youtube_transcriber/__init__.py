"""
YouTube Playlist Audio Transcriber & Clipper

A tool to download audio from YouTube playlists, transcribe with timestamps,
and provide audio clips for specific transcript segments.
"""

from .config import Config

__version__ = "0.1.0"
__all__ = ["Config"]

# Lazy imports for modules that may not exist yet
try:
    from .api import process_playlist, get_transcript, get_audio_clip
    __all__.extend(["process_playlist", "get_transcript", "get_audio_clip"])
except ImportError:
    pass


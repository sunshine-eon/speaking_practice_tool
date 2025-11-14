"""Audio transcription module using Faster-Whisper."""

import logging
from pathlib import Path
from typing import Dict, List, Optional, Any

from faster_whisper import WhisperModel

from .config import Config

logger = logging.getLogger(__name__)


class Transcriber:
    """Audio transcriber using Faster-Whisper."""
    
    def __init__(self, config: Config):
        """
        Initialize transcriber.
        
        Args:
            config: Configuration object
        """
        self.config = config
        self.model = None
        self._load_model()
    
    def _load_model(self):
        """Load Faster-Whisper model."""
        if self.model is None:
            logger.info(f"Loading Faster-Whisper model: {self.config.whisper_model}")
            try:
                # Determine compute type based on device
                compute_type = "int8" if self.config.whisper_device == "cpu" else "float16"
                
                self.model = WhisperModel(
                    self.config.whisper_model,
                    device=self.config.whisper_device,
                    compute_type=compute_type
                )
                logger.info(f"Faster-Whisper model loaded successfully")
            except Exception as e:
                logger.error(f"Failed to load Faster-Whisper model: {e}", exc_info=True)
                raise
    
    def transcribe(self, audio_path: Path, language: Optional[str] = None) -> Dict[str, Any]:
        """
        Transcribe audio file with timestamps.
        
        Args:
            audio_path: Path to audio file
            language: Language code (e.g., 'en', 'ko'). If None, auto-detect.
            
        Returns:
            Dictionary with transcription results including segments with timestamps
            Format: {
                'text': str,  # Full transcript text
                'language': str,  # Detected language
                'segments': [
                    {
                        'id': int,
                        'start': float,  # Start time in seconds
                        'end': float,    # End time in seconds
                        'text': str,     # Segment text
                    },
                    ...
                ]
            }
        """
        if not audio_path.exists():
            logger.error(f"Audio file not found: {audio_path}")
            return {}
        
        logger.info(f"Transcribing audio: {audio_path}")
        
        try:
            # Transcribe with Faster-Whisper
            # Note: segments is a generator, so we need to iterate through it
            segments, info = self.model.transcribe(
                str(audio_path),
                language=language,
                beam_size=5,
                vad_filter=False,  # Disable VAD for faster processing
            )
            
            # Get detected language
            detected_language = info.language if hasattr(info, 'language') else 'unknown'
            
            # Format result
            transcription = {
                'text': '',
                'language': detected_language,
                'segments': [],
            }
            
            # Process segments (this will consume the generator)
            full_text_parts = []
            segment_count = 0
            for segment in segments:
                segment_text = segment.text.strip()
                full_text_parts.append(segment_text)
                
                transcription['segments'].append({
                    'id': segment_count,
                    'start': segment.start,
                    'end': segment.end,
                    'text': segment_text,
                })
                segment_count += 1
            
            # Combine all segment texts
            transcription['text'] = ' '.join(full_text_parts).strip()
            
            logger.info(f"Transcription complete: {len(transcription['segments'])} segments, "
                       f"language: {transcription['language']}")
            
            return transcription
            
        except Exception as e:
            logger.error(f"Error transcribing audio: {e}", exc_info=True)
            return {}
    
    def transcribe_video(self, video_id: str, audio_path: Optional[Path] = None) -> Dict[str, Any]:
        """
        Transcribe audio for a video.
        
        Args:
            video_id: Video ID
            audio_path: Optional path to audio file. If None, looks in config.audio_dir
            
        Returns:
            Transcription result dictionary
        """
        if audio_path is None:
            # Try to find audio file
            for ext in ['.mp3', '.m4a', '.webm', '.opus']:
                candidate = self.config.audio_dir / f"{video_id}{ext}"
                if candidate.exists():
                    audio_path = candidate
                    break
            
            if audio_path is None:
                logger.error(f"Audio file not found for video {video_id}")
                return {}
        
        result = self.transcribe(audio_path)
        
        # Add video_id to result
        if result:
            result['video_id'] = video_id
            result['audio_path'] = str(audio_path)
        
        return result


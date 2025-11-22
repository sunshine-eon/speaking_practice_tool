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
    
    def transcribe_chapter_clips(self, video_id: str, validate: bool = True) -> Dict[str, Any]:
        """
        Transcribe all chapter audio clips for a video.
        
        Args:
            video_id: Video ID
            validate: Whether to validate transcripts for anomalies
            
        Returns:
            Dictionary with transcription results
        """
        import json
        from .transcript_validator import check_and_report_anomalies
        
        # Try to load video metadata
        metadata_path = self.config.metadata_dir / f"{video_id}_metadata.json"
        chapters = []
        video_title = 'Unknown'
        
        if metadata_path.exists() and metadata_path.stat().st_size > 0:
            try:
                with open(metadata_path, 'r', encoding='utf-8') as f:
                    video_metadata = json.load(f)
                video_title = video_metadata.get('title', 'Unknown')
                chapters = video_metadata.get('chapters', [])
            except Exception as e:
                logger.warning(f"Failed to load metadata for {video_id}: {e}")
        
        # If no metadata, get chapters from clip files
        if not chapters:
            logger.warning(f"Metadata file not found or empty for {video_id}, using clip files...")
            video_title = video_id
            clip_files = sorted(self.config.clips_dir.glob(f"{video_id}_*.mp3"))
            for clip_file in clip_files:
                # Extract time from filename: video_id_start_end.mp3
                parts = clip_file.stem.split('_')
                if len(parts) >= 3:
                    try:
                        start_time = int(parts[-2])
                        end_time = int(parts[-1])
                        chapters.append({
                            'title': f'Chapter {len(chapters) + 1}',
                            'start_time': float(start_time),
                            'end_time': float(end_time),
                            'start_time_formatted': f"{int(start_time//60):02d}:{int(start_time%60):02d}",
                            'end_time_formatted': f"{int(end_time//60):02d}:{int(end_time%60):02d}",
                        })
                    except Exception:
                        continue
        
        results = {
            'video_id': video_id,
            'video_title': video_title,
            'total_chapters': len(chapters),
            'transcribed': 0,
            'skipped': 0,
            'errors': []
        }
        
        for chapter_idx, chapter in enumerate(chapters, 1):
            chapter_title = chapter.get('title', f'Chapter {chapter_idx}')
            start_time = int(chapter.get('start_time', 0))
            end_time = int(chapter.get('end_time', 0))
            
            # Find corresponding clip file
            clip_filename = f"{video_id}_{start_time}_{end_time}.mp3"
            clip_path = self.config.clips_dir / clip_filename
            
            if not clip_path.exists():
                logger.warning(f"Clip not found: {clip_filename}")
                results['errors'].append(f"Chapter {chapter_idx}: Clip not found")
                continue
            
            # Generate transcript filename
            safe_title = "".join(c for c in chapter_title if c.isalnum() or c in (' ', '-', '_')).strip()
            safe_title = safe_title.replace(' ', '_')[:50]
            transcript_file = self.config.transcripts_dir / f"{video_id}_chapter{chapter_idx}_{safe_title}.txt"
            
            # Check if transcript already exists
            if transcript_file.exists():
                results['skipped'] += 1
                continue
            
            try:
                # Transcribe the clip
                result = self.transcribe(clip_path, language="en")
                
                if result and result.get('segments'):
                    # Build transcript content
                    transcript_content = []
                    transcript_content.append(f"Chapter {chapter_idx}: {chapter_title}\n")
                    transcript_content.append(f"Video: {video_title}\n")
                    transcript_content.append(f"Time: {chapter.get('start_time_formatted', '')} - {chapter.get('end_time_formatted', '')}\n")
                    transcript_content.append(f"Model: {self.config.whisper_model}\n")
                    transcript_content.append("="*60 + "\n\n")
                    for seg in result['segments']:
                        start_min = int(seg['start'] // 60)
                        start_sec = int(seg['start'] % 60)
                        transcript_content.append(f"[{start_min:02d}:{start_sec:02d}] {seg['text']}\n")
                    
                    # Save transcript
                    transcript_text = ''.join(transcript_content)
                    with open(transcript_file, 'w', encoding='utf-8') as f:
                        f.write(transcript_text)
                    
                    # Validate transcript if requested
                    is_valid = True
                    if validate:
                        is_valid = check_and_report_anomalies(transcript_text, transcript_file)
                    
                    results['transcribed'] += 1
                    logger.info(f"Transcribed chapter {chapter_idx}: {transcript_file.name}")
                else:
                    results['errors'].append(f"Chapter {chapter_idx}: Transcription failed")
                    logger.error(f"Transcription failed for chapter {chapter_idx}")
            
            except Exception as e:
                results['errors'].append(f"Chapter {chapter_idx}: {str(e)}")
                logger.error(f"Error transcribing chapter {chapter_idx}: {e}", exc_info=True)
        
        return results


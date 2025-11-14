"""Transcribe chapter audio clips using Whisper."""

import json
import logging
from pathlib import Path
from youtube_transcriber import Config
from youtube_transcriber.transcriber import Transcriber
from youtube_transcriber.utils import setup_logging

# Setup logging
setup_logging(logging.INFO)

def transcribe_chapter_clips(video_id: str, config: Config = None):
    """
    Transcribe all chapter audio clips for a video.
    
    Args:
        video_id: Video ID
        config: Configuration object (defaults to ./test_data with small model)
    """
    if config is None:
        config = Config(base_dir="./test_data", whisper_model="small")
    
    transcriber = Transcriber(config)
    
    # Try to load video metadata, or use clips directly
    metadata_path = config.transcripts_dir / f"{video_id}_metadata.json"
    chapters = []
    
    if metadata_path.exists() and metadata_path.stat().st_size > 0:
        try:
            with open(metadata_path, 'r', encoding='utf-8') as f:
                video_metadata = json.load(f)
            video_title = video_metadata.get('title', 'Unknown')
            chapters = video_metadata.get('chapters', [])
        except:
            pass
    
    # If no metadata, get chapters from clip files
    if not chapters:
        print("⚠ Metadata file not found or empty, using clip files...")
        video_title = video_id
        clip_files = sorted(config.clips_dir.glob(f"{video_id}_*.mp3"))
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
                except:
                    continue
    
    print("="*60)
    print(f"Transcribing chapter clips for: {video_title}")
    print(f"Video ID: {video_id}")
    print(f"Total chapters: {len(chapters)}")
    print("="*60)
    print()
    
    for chapter_idx, chapter in enumerate(chapters, 1):
        chapter_title = chapter.get('title', f'Chapter {chapter_idx}')
        start_time = int(chapter.get('start_time', 0))
        end_time = int(chapter.get('end_time', 0))
        
        # Find corresponding clip file
        clip_filename = f"{video_id}_{start_time}_{end_time}.mp3"
        clip_path = config.clips_dir / clip_filename
        
        if not clip_path.exists():
            print(f"[{chapter_idx}/{len(chapters)}] ⚠ Clip not found: {clip_filename}")
            continue
        
        # Check if transcript already exists
        safe_title = "".join(c for c in chapter_title if c.isalnum() or c in (' ', '-', '_')).strip()
        safe_title = safe_title.replace(' ', '_')[:50]
        transcript_file = config.transcripts_dir / f"{video_id}_chapter{chapter_idx}_{safe_title}.txt"
        
        if transcript_file.exists():
            print(f"[{chapter_idx}/{len(chapters)}] ⏭ Already exists: {chapter_title}")
            continue
        
        print(f"[{chapter_idx}/{len(chapters)}] {chapter_title}")
        print(f"    Clip: {clip_filename}")
        print(f"    Time: {chapter.get('start_time_formatted', '')} - {chapter.get('end_time_formatted', '')}")
        print(f"    Transcribing...")
        
        try:
            # Transcribe the clip
            result = transcriber.transcribe(clip_path, language="en")
            
            if result and result.get('segments'):
                # Save transcript
                with open(transcript_file, 'w', encoding='utf-8') as f:
                    f.write(f"Chapter {chapter_idx}: {chapter_title}\n")
                    f.write(f"Video: {video_title}\n")
                    f.write(f"Time: {chapter.get('start_time_formatted', '')} - {chapter.get('end_time_formatted', '')}\n")
                    f.write("="*60 + "\n\n")
                    for seg in result['segments']:
                        start_min = int(seg['start'] // 60)
                        start_sec = int(seg['start'] % 60)
                        f.write(f"[{start_min:02d}:{start_sec:02d}] {seg['text']}\n")
                
                print(f"    ✓ Transcript saved: {transcript_file.name}")
                print(f"    Segments: {len(result['segments'])}")
            else:
                print(f"    ✗ Transcription failed")
        
        except Exception as e:
            print(f"    ✗ Error: {e}")
            logging.error(f"Error transcribing chapter {chapter_idx}: {e}", exc_info=True)
        
        print()
    
    print("="*60)
    print("Transcription complete!")
    print("="*60)


if __name__ == "__main__":
    import sys
    
    # Default to first video (4ef0juAMqoE)
    video_id = "4ef0juAMqoE"
    
    if len(sys.argv) > 1:
        video_id = sys.argv[1]
    
    transcribe_chapter_clips(video_id)


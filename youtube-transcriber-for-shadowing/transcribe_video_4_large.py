"""Transcribe Video 4 using large Whisper model."""

import json
import logging
import sys
from pathlib import Path
from youtube_transcriber import Config
from youtube_transcriber.transcriber import Transcriber
from youtube_transcriber.utils import setup_logging
from youtube_transcriber.transcript_validator import check_and_report_anomalies

# Setup logging
setup_logging(logging.INFO)

# Video ID for Video 4
VIDEO_ID = "2XgU6T4DalY"

def transcribe_chapter_clips_large(video_id: str, config: Config):
    """
    Transcribe all chapter audio clips for a video using large model.
    
    Args:
        video_id: Video ID
        config: Configuration object with large model
    """
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
    print(f"Model: {config.whisper_model}")
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
        
        # Save to transcripts_large folder (no _large suffix needed since it's in separate folder)
        safe_title = "".join(c for c in chapter_title if c.isalnum() or c in (' ', '-', '_')).strip()
        safe_title = safe_title.replace(' ', '_')[:50]
        transcript_file = config.transcripts_dir / f"{video_id}_chapter{chapter_idx}_{safe_title}.txt"
        
        # Check if transcript already exists
        if transcript_file.exists():
            print(f"[{chapter_idx}/{len(chapters)}] ⏭ Already exists: {chapter_title}")
            continue
        
        print(f"[{chapter_idx}/{len(chapters)}] {chapter_title}")
        print(f"    Clip: {clip_filename}")
        print(f"    Time: {chapter.get('start_time_formatted', '')} - {chapter.get('end_time_formatted', '')}")
        print(f"    Model: {config.whisper_model}")
        print(f"    Transcribing...")
        
        try:
            # Transcribe the clip
            result = transcriber.transcribe(clip_path, language="en")
            
            if result and result.get('segments'):
                # Build transcript content
                transcript_content = []
                transcript_content.append(f"Chapter {chapter_idx}: {chapter_title}\n")
                transcript_content.append(f"Video: {video_title}\n")
                transcript_content.append(f"Time: {chapter.get('start_time_formatted', '')} - {chapter.get('end_time_formatted', '')}\n")
                transcript_content.append(f"Model: {config.whisper_model}\n")
                transcript_content.append("="*60 + "\n\n")
                for seg in result['segments']:
                    start_min = int(seg['start'] // 60)
                    start_sec = int(seg['start'] % 60)
                    transcript_content.append(f"[{start_min:02d}:{start_sec:02d}] {seg['text']}\n")
                
                # Save transcript
                transcript_text = ''.join(transcript_content)
                with open(transcript_file, 'w', encoding='utf-8') as f:
                    f.write(transcript_text)
                
                # Validate transcript for anomalies
                is_valid = check_and_report_anomalies(transcript_text, transcript_file)
                
                print(f"    ✓ Transcript saved: {transcript_file.name}")
                print(f"    Segments: {len(result['segments'])}")
                if not is_valid:
                    print(f"    ⚠️  WARNING: Anomalies detected in transcript - please review!")
            else:
                print(f"    ✗ Transcription failed")
        
        except Exception as e:
            print(f"    ✗ Error: {e}")
            logging.error(f"Error transcribing chapter {chapter_idx}: {e}", exc_info=True)
        
        print()
    
    print("="*60)
    print(f"Transcription complete for {video_id}!")
    print("="*60)


def main():
    """Main function to transcribe Video 4 with large model."""
    # Use large model with separate transcripts directory
    base_dir = Path("./test_data")
    transcripts_dir = base_dir / "transcripts_large"
    transcripts_dir.mkdir(parents=True, exist_ok=True)
    
    # Create custom config that uses transcripts_large directory
    config = Config(base_dir="./test_data", whisper_model="large")
    # Override transcripts_dir to use the new folder
    config.transcripts_dir = transcripts_dir
    
    print("="*60)
    print("Transcribing Video 4 with Large Whisper Model")
    print("="*60)
    print(f"Video ID: {VIDEO_ID}")
    print(f"Model: {config.whisper_model}")
    print(f"Output directory: {config.transcripts_dir}")
    print("="*60)
    print()
    
    # Ask for confirmation
    print("⚠️  Warning: Large model is slower but more accurate.")
    print("This may take a long time depending on the number of chapters.")
    print()
    
    if "--auto" not in sys.argv and "-y" not in sys.argv:
        response = input("Continue? (y/n): ").strip().lower()
        if response != 'y':
            print("Cancelled.")
            return
    
    # Process video
    print("\n" + "="*60)
    print(f"Processing Video 4: {VIDEO_ID}")
    print("="*60)
    print()
    
    try:
        transcribe_chapter_clips_large(VIDEO_ID, config)
    except Exception as e:
        print(f"\n✗ Error processing video {VIDEO_ID}: {e}")
        logging.error(f"Error processing video {VIDEO_ID}: {e}", exc_info=True)
    
    print("\n" + "="*60)
    print("Transcription complete!")
    print("="*60)


if __name__ == "__main__":
    main()



"""Batch transcribe videos that don't have transcripts yet."""

import json
import subprocess
import sys
from pathlib import Path
from youtube_transcriber import Config

def find_videos_without_transcripts(config: Config):
    """
    Find videos that have audio files but no chapter transcripts or incomplete transcripts.
    
    Returns:
        List of video IDs that need transcription (including incomplete ones)
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
        metadata_path = transcripts_dir / f"{video_id}_metadata.json"
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


def transcribe_batch(video_ids: list, batch_size: int = 5):
    """
    Transcribe videos in batches.
    
    Args:
        video_ids: List of video IDs to transcribe
        batch_size: Number of videos per batch
    """
    config = Config(base_dir="./test_data", whisper_model="small")
    
    total_videos = len(video_ids)
    total_batches = (total_videos + batch_size - 1) // batch_size
    
    print("="*60)
    print(f"Batch Transcription Process")
    print("="*60)
    print(f"Total videos to transcribe: {total_videos}")
    print(f"Batch size: {batch_size}")
    print(f"Total batches: {total_batches}")
    print("="*60)
    print()
    
    for batch_idx in range(total_batches):
        start_idx = batch_idx * batch_size
        end_idx = min(start_idx + batch_size, total_videos)
        batch = video_ids[start_idx:end_idx]
        
        print(f"\n{'='*60}")
        print(f"Processing Batch {batch_idx + 1}/{total_batches}")
        print(f"{'='*60}")
        print(f"Videos in this batch: {len(batch)}")
        for i, video_id in enumerate(batch, 1):
            print(f"  {i}. {video_id}")
        print()
        
        # Process each video in the batch
        for video_idx, video_id in enumerate(batch, 1):
            print(f"\n[{batch_idx + 1}-{video_idx}/{len(batch)}] Processing: {video_id}")
            print("-" * 60)
            
            try:
                # Run transcribe_chapter_clips.py for this video
                result = subprocess.run(
                    [sys.executable, "transcribe_chapter_clips.py", video_id],
                    cwd=Path.cwd(),
                    capture_output=False,
                    text=True
                )
                
                if result.returncode == 0:
                    print(f"✓ Successfully transcribed: {video_id}")
                else:
                    print(f"✗ Failed to transcribe: {video_id}")
                    
            except Exception as e:
                print(f"✗ Error processing {video_id}: {e}")
        
        print(f"\n{'='*60}")
        print(f"Batch {batch_idx + 1}/{total_batches} completed")
        print(f"{'='*60}")
        
        # Ask user if they want to continue (except for last batch)
        # Skip prompt in auto mode
        auto_mode = "--auto" in sys.argv or "-y" in sys.argv
        if batch_idx < total_batches - 1 and not auto_mode:
            print(f"\nContinue with next batch? (y/n): ", end="")
            try:
                response = input().strip().lower()
                if response != 'y':
                    print("\nUser requested to stop.")
                    break
            except (KeyboardInterrupt, EOFError):
                print("\n\nStopped.")
                break
    
    print("\n" + "="*60)
    print("All batches completed!")
    print("="*60)


if __name__ == "__main__":
    config = Config(base_dir="./test_data", whisper_model="small")
    
    # Find videos without transcripts or with incomplete transcripts
    print("Finding videos without transcripts or with incomplete transcripts...")
    videos_to_transcribe = find_videos_without_transcripts(config)
    
    if not videos_to_transcribe:
        print("✓ All videos already have complete transcripts!")
        sys.exit(0)
    
    # Check which are incomplete
    incomplete = []
    none = []
    for video_id in videos_to_transcribe:
        metadata_path = config.transcripts_dir / f"{video_id}_metadata.json"
        transcript_files = list(config.transcripts_dir.glob(f"{video_id}_chapter*.txt"))
        
        if len(transcript_files) > 0:
            incomplete.append(video_id)
        else:
            none.append(video_id)
    
    print(f"\nFound {len(videos_to_transcribe)} videos that need transcription:")
    if incomplete:
        print(f"  ⚠ Incomplete: {len(incomplete)} videos")
        for video_id in incomplete[:5]:
            transcript_files = list(config.transcripts_dir.glob(f"{video_id}_chapter*.txt"))
            print(f"    - {video_id} ({len(transcript_files)} chapters done)")
        if len(incomplete) > 5:
            print(f"    ... and {len(incomplete) - 5} more")
    if none:
        print(f"  ✗ No transcripts: {len(none)} videos")
        for video_id in none[:5]:
            print(f"    - {video_id}")
        if len(none) > 5:
            print(f"    ... and {len(none) - 5} more")
    
    # Check for --auto flag to skip confirmation
    auto_mode = "--auto" in sys.argv or "-y" in sys.argv
    
    if not auto_mode:
        print(f"\nProcess these videos in batches of 5? (y/n): ", end="")
        try:
            response = input().strip().lower()
            if response != 'y':
                print("Cancelled.")
                sys.exit(0)
        except (KeyboardInterrupt, EOFError):
            print("\nCancelled.")
            sys.exit(0)
    
    transcribe_batch(videos_to_transcribe, batch_size=5)


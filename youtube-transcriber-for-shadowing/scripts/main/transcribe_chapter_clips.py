"""Transcribe chapter audio clips using Whisper with various options."""

import argparse
import json
import logging
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from youtube_transcriber import Config
from youtube_transcriber.transcriber import Transcriber
from youtube_transcriber.video_finder import find_videos_with_missing_transcripts, find_untranscribed_videos
from youtube_transcriber.utils import setup_logging

# Setup logging
setup_logging(logging.INFO)


def transcribe_chapter_clips(video_id: str, config: Config = None, 
                            validate: bool = True, verbose: bool = True):
    """
    Transcribe all chapter audio clips for a video.
    
    Args:
        video_id: Video ID
        config: Configuration object (defaults to ./test_data with small model)
        validate: Whether to validate transcripts for anomalies
        verbose: Whether to print progress messages
    """
    if config is None:
        config = Config(base_dir="./test_data", whisper_model="small")
    
    transcriber = Transcriber(config)
    
    # Load video metadata
    metadata_path = config.metadata_dir / f"{video_id}_metadata.json"
    chapters = []
    video_title = 'Unknown'
    
    if metadata_path.exists() and metadata_path.stat().st_size > 0:
        try:
            with open(metadata_path, 'r', encoding='utf-8') as f:
                video_metadata = json.load(f)
            video_title = video_metadata.get('title', 'Unknown')
            chapters = video_metadata.get('chapters', [])
        except Exception as e:
            logging.warning(f"Failed to load metadata: {e}")
    
    # If no metadata, get chapters from clip files
    if not chapters:
        if verbose:
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
                except Exception:
                    continue
    
    if verbose:
        print("="*60)
        print(f"Transcribing chapter clips for: {video_title}")
        print(f"Video ID: {video_id}")
        print(f"Model: {config.whisper_model}")
        print(f"Total chapters: {len(chapters)}")
        print("="*60)
        print()
    
    results = transcriber.transcribe_chapter_clips(video_id, validate=validate)
    
    if verbose:
        for chapter_idx, chapter in enumerate(chapters, 1):
            chapter_title = chapter.get('title', f'Chapter {chapter_idx}')
            start_time = int(chapter.get('start_time', 0))
            end_time = int(chapter.get('end_time', 0))
            
            clip_filename = f"{video_id}_{start_time}_{end_time}.mp3"
            clip_path = config.clips_dir / clip_filename
            
            if not clip_path.exists():
                print(f"[{chapter_idx}/{len(chapters)}] ⚠ Clip not found: {clip_filename}")
                continue
            
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
            
            # Check if this chapter was transcribed
            if any(f"Chapter {chapter_idx}" in err for err in results['errors']):
                print(f"    ✗ Error occurred")
            else:
                print(f"    ✓ Transcript saved")
            print()
        
        print("="*60)
        print(f"Transcription complete! Transcribed: {results['transcribed']}, Skipped: {results['skipped']}")
        if results['errors']:
            print(f"Errors: {len(results['errors'])}")
        print("="*60)
    
    return results


def process_videos_batch(videos: list, config: Config, validate: bool = True, 
                        verbose: bool = True, auto_mode: bool = False):
    """
    Process multiple videos in batch.
    
    Args:
        videos: List of video dictionaries or video IDs
        config: Configuration object
        validate: Whether to validate transcripts
        verbose: Whether to print progress
        auto_mode: Skip confirmation prompts
    """
    for idx, video in enumerate(videos, 1):
        # Handle both dict and string (video_id) formats
        if isinstance(video, dict):
            video_id = video.get('video_id', '')
            video_title = video.get('title', 'Unknown')
        else:
            video_id = video
            video_title = video_id
        
        if verbose:
            print("="*60)
            print(f"[{idx}/{len(videos)}] Processing: {video_id}")
            if isinstance(video, dict):
                print(f"Title: {video_title[:80]}...")
            print("="*60)
            print()
        
        try:
            transcribe_chapter_clips(video_id, config, validate=validate, verbose=verbose)
        except Exception as e:
            logging.error(f"Error transcribing {video_id}: {e}", exc_info=True)
            if verbose:
                print(f"✗ Error processing {video_id}: {e}")
                print()
        
        if not auto_mode and idx < len(videos):
            print(f"\nContinue with next video? (y/n): ", end="")
            try:
                response = input().strip().lower()
                if response != 'y':
                    print("\nUser requested to stop.")
                    break
            except (KeyboardInterrupt, EOFError):
                print("\n\nStopped.")
                break
    
    if verbose:
        print("="*60)
        print("All transcriptions complete!")
        print("="*60)


def main():
    """Main CLI interface."""
    parser = argparse.ArgumentParser(
        description='Transcribe chapter audio clips with various options.'
    )
    parser.add_argument('video_id', nargs='?', help='Video ID to transcribe (optional)')
    parser.add_argument('--model', choices=['tiny', 'base', 'small', 'medium', 'large'], 
                       default='small', help='Whisper model size (default: small)')
    parser.add_argument('--base-dir', type=str, default='./test_data',
                       help='Base directory for data (default: ./test_data)')
    parser.add_argument('--transcripts-dir', type=str, default=None,
                       help='Transcripts directory (default: base_dir/transcripts or base_dir/transcripts_large)')
    parser.add_argument('--missing', action='store_true',
                       help='Find and transcribe videos with missing transcripts')
    parser.add_argument('--latest', type=int, metavar='N', default=None,
                       help='Transcribe latest N untranscribed videos')
    parser.add_argument('--limit', type=int, metavar='N',
                       help='Limit number of videos to process (for --missing)')
    parser.add_argument('--no-validate', action='store_true',
                       help='Skip transcript validation')
    parser.add_argument('--auto', '-y', action='store_true',
                       help='Skip confirmation prompts')
    parser.add_argument('--quiet', '-q', action='store_true',
                       help='Reduce output verbosity')
    
    args = parser.parse_args()
    
    # Determine transcripts directory
    base_dir = Path(args.base_dir)
    if args.transcripts_dir:
        transcripts_dir = Path(args.transcripts_dir)
    elif args.model == 'large':
        transcripts_dir = base_dir / "transcripts_large"
    else:
        transcripts_dir = base_dir / "transcripts"
    
    transcripts_dir.mkdir(parents=True, exist_ok=True)
    
    # Create config
    config = Config(base_dir=str(base_dir), whisper_model=args.model)
    config.transcripts_dir = transcripts_dir
    
    validate = not args.no_validate
    verbose = not args.quiet
    
    # Handle different modes
    if args.missing:
        # Find and transcribe missing transcripts
        if verbose:
            print("="*60)
            print("Finding videos with missing transcripts...")
            print("="*60)
            print()
        
        missing_videos = find_videos_with_missing_transcripts(config)
        
        if not missing_videos:
            print("✓ All videos have complete transcripts!")
            return
        
        if verbose:
            print(f"Found {len(missing_videos)} videos with missing transcripts")
            print()
        
        if args.limit:
            missing_videos = missing_videos[:args.limit]
            if verbose:
                print(f"Processing first {args.limit} videos...")
                print()
        
        if not args.auto:
            response = input("Continue? (y/n): ").strip().lower()
            if response != 'y':
                print("Cancelled.")
                return
        
        process_videos_batch(missing_videos, config, validate=validate, 
                           verbose=verbose, auto_mode=args.auto)
    
    elif args.latest:
        # Transcribe latest untranscribed videos
        if verbose:
            print("="*60)
            print("Finding latest untranscribed videos...")
            print("="*60)
        
        untranscribed = find_untranscribed_videos(
            limit=args.latest, 
            transcripts_dir=transcripts_dir,
            metadata_dir=config.metadata_dir
        )
        
        if not untranscribed:
            print("✓ All videos have been transcribed!")
            return
        
        if verbose:
            print(f"\nFound {len(untranscribed)} untranscribed videos:")
            for i, video in enumerate(untranscribed, 1):
                upload_date = video.get('upload_date', '')
                if len(upload_date) == 8:
                    formatted_date = f'{upload_date[:4]}-{upload_date[4:6]}-{upload_date[6:8]}'
                else:
                    formatted_date = upload_date
                print(f"  {i}. [{formatted_date}] {video.get('title', 'Unknown')[:60]}...")
                print(f"     Video ID: {video.get('video_id', 'N/A')}, Chapters: {len(video.get('chapters', []))}")
            
            print(f"\nModel: {config.whisper_model}")
            print(f"Output directory: {config.transcripts_dir}")
            print("="*60)
            print()
        
        if not args.auto:
            print("⚠️  Warning: This may take a long time depending on the number of chapters.")
            print()
            response = input("Continue? (y/n): ").strip().lower()
            if response != 'y':
                print("Cancelled.")
                return
        
        process_videos_batch(untranscribed, config, validate=validate, 
                           verbose=verbose, auto_mode=args.auto)
    
    elif args.video_id:
        # Transcribe specific video
        transcribe_chapter_clips(args.video_id, config, validate=validate, verbose=verbose)
    
    else:
        # Default: transcribe first video (for backward compatibility)
        video_id = "4ef0juAMqoE"
        transcribe_chapter_clips(video_id, config, validate=validate, verbose=verbose)


if __name__ == "__main__":
    main()

"""Batch transcribe videos that don't have transcripts yet."""

import argparse
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from youtube_transcriber import Config
from youtube_transcriber.video_finder import find_videos_without_transcripts_simple
from scripts.main.transcribe_chapter_clips import transcribe_chapter_clips


def transcribe_batch(video_ids: list, config: Config, batch_size: int = 5, 
                    auto_mode: bool = False, validate: bool = True, verbose: bool = True):
    """
    Transcribe videos in batches.
    
    Args:
        video_ids: List of video IDs to transcribe
        config: Configuration object
        batch_size: Number of videos per batch
        auto_mode: Skip confirmation prompts
        validate: Whether to validate transcripts
        verbose: Whether to print progress messages
    """
    total_videos = len(video_ids)
    total_batches = (total_videos + batch_size - 1) // batch_size
    
    if verbose:
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
        
        if verbose:
            print(f"\n{'='*60}")
            print(f"Processing Batch {batch_idx + 1}/{total_batches}")
            print(f"{'='*60}")
            print(f"Videos in this batch: {len(batch)}")
            for i, video_id in enumerate(batch, 1):
                print(f"  {i}. {video_id}")
            print()
        
        # Process each video in the batch
        for video_idx, video_id in enumerate(batch, 1):
            if verbose:
                print(f"\n[{batch_idx + 1}-{video_idx}/{len(batch)}] Processing: {video_id}")
                print("-" * 60)
            
            try:
                # Directly call transcribe function
                results = transcribe_chapter_clips(
                    video_id, 
                    config=config, 
                    validate=validate, 
                    verbose=verbose
                )
                
                if results and results.get('transcribed', 0) > 0:
                    if verbose:
                        print(f"✓ Successfully transcribed: {video_id}")
                elif results and results.get('skipped', 0) > 0:
                    if verbose:
                        print(f"⏭ Already transcribed: {video_id}")
                else:
                    if verbose:
                        print(f"✗ Failed to transcribe: {video_id}")
                    
            except Exception as e:
                import logging
                logging.error(f"Error transcribing {video_id}: {e}", exc_info=True)
                if verbose:
                    print(f"✗ Error processing {video_id}: {e}")
        
        if verbose:
            print(f"\n{'='*60}")
            print(f"Batch {batch_idx + 1}/{total_batches} completed")
            print(f"{'='*60}")
        
        # Ask user if they want to continue (except for last batch)
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
    
    if verbose:
        print("\n" + "="*60)
        print("All batches completed!")
        print("="*60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description='Batch transcribe videos that don\'t have transcripts yet.'
    )
    parser.add_argument('--base-dir', type=str, default='./test_data',
                       help='Base directory for data (default: ./test_data)')
    parser.add_argument('--batch-size', type=int, default=5,
                       help='Number of videos per batch (default: 5)')
    parser.add_argument('--auto', '-y', action='store_true',
                       help='Skip confirmation prompts')
    parser.add_argument('--no-validate', action='store_true',
                       help='Skip transcript validation')
    parser.add_argument('--quiet', '-q', action='store_true',
                       help='Reduce output verbosity')
    
    args = parser.parse_args()
    
    config = Config(base_dir=args.base_dir, whisper_model="small")
    
    # Find videos without transcripts or with incomplete transcripts
    print("Finding videos without transcripts or with incomplete transcripts...")
    videos_to_transcribe = find_videos_without_transcripts_simple(config)
    
    if not videos_to_transcribe:
        print("✓ All videos already have complete transcripts!")
        sys.exit(0)
    
    # Check which are incomplete
    incomplete = []
    none = []
    for video_id in videos_to_transcribe:
        metadata_path = config.metadata_dir / f"{video_id}_metadata.json"
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
    
    if not args.auto:
        print(f"\nProcess these videos in batches of {args.batch_size}? (y/n): ", end="")
        try:
            response = input().strip().lower()
            if response != 'y':
                print("Cancelled.")
                sys.exit(0)
        except (KeyboardInterrupt, EOFError):
            print("\nCancelled.")
            sys.exit(0)
    
    transcribe_batch(
        videos_to_transcribe, 
        config=config,
        batch_size=args.batch_size,
        auto_mode=args.auto,
        validate=not args.no_validate,
        verbose=not args.quiet
    )

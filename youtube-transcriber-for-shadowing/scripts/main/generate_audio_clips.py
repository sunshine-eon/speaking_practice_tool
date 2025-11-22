"""Generate audio clips for all chapters or only missing ones."""

import argparse
import json
import logging
from pathlib import Path

# Add parent directory to path for imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from youtube_transcriber import Config
from youtube_transcriber.playlist_handler import PlaylistHandler
from youtube_transcriber.audio_clipper import AudioClipper
from youtube_transcriber.audio_utils import find_audio_file, ensure_audio_file, download_audio_for_videos
from youtube_transcriber.video_finder import find_videos_without_clips
from youtube_transcriber.utils import setup_logging

# Setup logging
setup_logging(logging.INFO)


def generate_clips_for_video(clipper: AudioClipper, config: Config, video_id: str, 
                             video_title: str, audio_path: Path, chapters: list,
                             verbose: bool = True) -> dict:
    """
    Generate audio clips for a single video's chapters.
    
    Args:
        clipper: AudioClipper instance
        config: Configuration object
        video_id: Video ID
        video_title: Video title
        audio_path: Path to audio file
        chapters: List of chapter dictionaries
        verbose: Whether to print progress
        
    Returns:
        Dictionary with created, skipped, errors counts
    """
    results = {
        'created': 0,
        'skipped': 0,
        'errors': []
    }
    
    if verbose:
        print(f"  Generating clips...")
    
    for chapter_idx, chapter in enumerate(chapters, 1):
        chapter_start = int(chapter.get('start_time', 0))
        chapter_end = int(chapter.get('end_time', 0))
        chapter_title = chapter.get('title', f'Chapter {chapter_idx}')
        
        clip_file = config.clips_dir / f"{video_id}_{chapter_start}_{chapter_end}.mp3"
        
        if clip_file.exists():
            results['skipped'] += 1
            continue
        
        try:
            clip_path = clipper.clip_audio(audio_path, chapter_start, chapter_end, clip_file)
            
            if clip_path and clip_path.exists():
                size_mb = clip_path.stat().st_size / 1024 / 1024
                results['created'] += 1
                if verbose:
                    if chapter_idx <= 3 or chapter_idx == len(chapters):
                        print(f"    [{chapter_idx}/{len(chapters)}] ✓ {chapter_title[:50]} ({size_mb:.2f} MB)")
                    elif chapter_idx == 4:
                        print(f"    ...")
            else:
                results['errors'].append(f"{video_id} chapter {chapter_idx}: Clip creation failed")
        except Exception as e:
            results['errors'].append(f"{video_id} chapter {chapter_idx}: {str(e)}")
            logging.error(f"Error creating clip for {video_id} chapter {chapter_idx}: {e}", exc_info=True)
            if verbose:
                print(f"    ✗ Error: {e}")
    
    if verbose:
        print(f"  ✓ Completed: {len(chapters)} chapters\n")
    
    return results


def generate_audio_clips(config: Config = None, missing_only: bool = False, 
                         limit: int = None, download_audio: bool = True):
    """
    Generate audio clips for all chapters or only missing ones.
    
    Args:
        config: Configuration object (defaults to ./test_data)
        missing_only: If True, only generate clips for missing ones
        limit: Maximum number of videos to process (None for all, only used with missing_only)
        download_audio: Whether to download audio files if missing (default: True)
    """
    if config is None:
        config = Config(base_dir="./test_data", whisper_model="small")
    
    handler = PlaylistHandler(config)
    clipper = AudioClipper(config)
    
    if missing_only:
        # Find videos without clips
        print("="*60)
        print("Finding videos with missing audio clips...")
        print("="*60)
        print()
        
        videos_without_clips = find_videos_without_clips(config)
        
        # Separate videos with and without audio files
        videos_with_audio = [v for v in videos_without_clips if v['audio_path']]
        videos_without_audio_list = [v for v in videos_without_clips if not v['audio_path']]
        
        print(f"Found {len(videos_without_clips)} videos with missing clips:")
        print(f"  - {len(videos_with_audio)} videos with audio files (can generate clips)")
        print(f"  - {len(videos_without_audio_list)} videos without audio files (need to download first)")
        print()
        
        if videos_without_audio_list:
            print("⚠ Videos without audio files:")
            for vid in videos_without_audio_list[:10]:
                print(f"  - {vid['video_id']}: {vid['title'][:60]}...")
            if len(videos_without_audio_list) > 10:
                print(f"  ... and {len(videos_without_audio_list) - 10} more")
            print()
        
        # Try to download audio for videos without audio files
        if download_audio and videos_without_audio_list:
            print("="*60)
            print("Downloading audio files for videos without audio...")
            print("="*60)
            print()
            
            download_results = download_audio_for_videos(handler, config, videos_without_audio_list)
            
            # Update video list with downloaded audio paths
            for vid in videos_without_audio_list:
                if vid['video_id'] in download_results['downloaded'] or vid['video_id'] in download_results['already_existed']:
                    vid['audio_path'] = find_audio_file(config, vid['video_id'])
            
            # Update lists after download attempts
            videos_with_audio = [v for v in videos_without_clips if v.get('audio_path')]
            videos_without_audio_list = [v for v in videos_without_clips if not v.get('audio_path')]
            
            print(f"After download attempts:")
            print(f"  - Videos with audio: {len(videos_with_audio)}")
            print(f"  - Videos still without audio: {len(videos_without_audio_list)}")
            print()
        
        # Process videos with audio files
        videos_to_process = videos_with_audio
        if limit:
            videos_to_process = videos_to_process[:limit]
            print(f"Processing first {limit} videos...")
            print()
        
        total_clips_to_create = sum(len(v['missing_clips']) for v in videos_to_process)
        total_created = 0
        total_skipped = 0
        all_errors = []
        
        for idx, video_info in enumerate(videos_to_process, 1):
            video_id = video_info['video_id']
            title = video_info['title']
            audio_path = video_info['audio_path']
            missing_clips = video_info['missing_clips']
            total_chapters = video_info['total_chapters']
            
            print("="*60)
            print(f"[{idx}/{len(videos_to_process)}] Processing: {video_id}")
            print(f"Title: {title[:80]}...")
            print(f"Missing clips: {len(missing_clips)}/{total_chapters} chapters")
            print(f"Audio file: {audio_path.name}")
            print("="*60)
            print()
            
            # Convert missing_clips to chapters format for generate_clips_for_video
            chapters = [
                {
                    'start_time': clip['start_time'],
                    'end_time': clip['end_time'],
                    'title': clip['title']
                }
                for clip in missing_clips
            ]
            
            results = generate_clips_for_video(
                clipper, config, video_id, title, audio_path, chapters, verbose=True
            )
            
            total_created += results['created']
            total_skipped += results['skipped']
            all_errors.extend(results['errors'])
            print()
        
        # Print summary
        print("="*60)
        print("Summary")
        print("="*60)
        print(f"Videos processed: {len(videos_to_process)}")
        print(f"Total clips to create: {total_clips_to_create}")
        print(f"Clips created: {total_created}")
        print(f"Clips skipped (already exist): {total_skipped}")
        
        if all_errors:
            print(f"\nErrors occurred: {len(all_errors)}")
            for error in all_errors[:10]:
                print(f"  - {error}")
            if len(all_errors) > 10:
                print(f"  ... and {len(all_errors) - 10} more")
        
        if videos_without_audio_list:
            print(f"\n⚠ {len(videos_without_audio_list)} videos need audio files downloaded first")
        
        print("="*60)
    
    else:
        # Generate clips for all chapters (original behavior)
        # Load playlist metadata
        playlist_metadata_path = config.metadata_dir / "playlist_metadata.json"
        if not playlist_metadata_path.exists():
            print("✗ Playlist metadata not found. Please run collect_chapter_info.py first.")
            return
        
        with open(playlist_metadata_path, 'r', encoding='utf-8') as f:
            playlist_metadata = json.load(f)
        
        print("="*60)
        print("Generating audio clips for all chapters")
        print("="*60)
        print(f"Total videos: {len(playlist_metadata['videos'])}\n")
        
        total_clips = 0
        total_created = 0
        total_skipped = 0
        all_errors = []
        videos_without_audio = []
        
        for video_idx, video in enumerate(playlist_metadata['videos'], 1):
            video_id = video['video_id']
            video_title = video['title']
            video_url = video['url']
            chapters = video.get('chapters', [])
            
            if not chapters:
                print(f"[{video_idx}/{len(playlist_metadata['videos'])}] {video_title}")
                print(f"  ⏭ No chapters (skipping)\n")
                continue
            
            print(f"[{video_idx}/{len(playlist_metadata['videos'])}] {video_title}")
            print(f"  Video ID: {video_id}")
            print(f"  Chapters: {len(chapters)}")
            
            # Step 1: Download audio if needed
            audio_path = find_audio_file(config, video_id)
            
            if not audio_path:
                print("  ⚠ WARNING: Audio file not found!")
                print("  Downloading audio...")
                audio_path = ensure_audio_file(config, handler, video_id, video_url)
                
                if audio_path:
                    print(f"  ✓ Audio download completed: {audio_path.name}")
                else:
                    print("  ✗✗✗ AUDIO DOWNLOAD FAILED ✗✗✗")
                    videos_without_audio.append({
                        'video_id': video_id,
                        'title': video_title,
                        'url': video_url
                    })
                    all_errors.append(f"{video_id}: Audio download failed")
                    print()
                    continue
            else:
                print(f"  ✓ Audio file exists: {audio_path.name}")
            
            # Step 2: Generate clips for each chapter
            total_clips += len(chapters)
            results = generate_clips_for_video(
                clipper, config, video_id, video_title, audio_path, chapters, verbose=True
            )
            
            total_created += results['created']
            total_skipped += results['skipped']
            all_errors.extend(results['errors'])
        
        # Print summary
        print("\n" + "="*60)
        print("Summary")
        print("="*60)
        print(f"Total videos processed: {len(playlist_metadata['videos'])}")
        print(f"Total chapters: {total_clips}")
        print(f"Clips created: {total_created}")
        print(f"Clips skipped (already exist): {total_skipped}")
        
        if videos_without_audio:
            print(f"\n⚠⚠⚠ VIDEOS WITHOUT AUDIO: {len(videos_without_audio)} ⚠⚠⚠")
            for vid in videos_without_audio:
                print(f"  - {vid['video_id']}: {vid['title']}")
                print(f"    URL: {vid['url']}")
            print()
        
        if all_errors:
            print(f"\nErrors occurred: {len(all_errors)}")
            for error in all_errors[:10]:
                print(f"  - {error}")
            if len(all_errors) > 10:
                print(f"  ... and {len(all_errors) - 10} more")
        
        print("="*60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description='Generate audio clips for all chapters or only missing ones.'
    )
    parser.add_argument('--missing-only', action='store_true',
                       help='Only generate clips for missing ones')
    parser.add_argument('--limit', type=int, metavar='N',
                       help='Limit number of videos to process (only used with --missing-only)')
    parser.add_argument('--no-download', action='store_true',
                       help='Skip downloading audio files if missing (only used with --missing-only)')
    parser.add_argument('--base-dir', type=str, default='./test_data',
                       help='Base directory for data (default: ./test_data)')
    
    args = parser.parse_args()
    
    config = Config(base_dir=args.base_dir, whisper_model="small")
    generate_audio_clips(
        config=config,
        missing_only=args.missing_only,
        limit=args.limit,
        download_audio=not args.no_download
    )

"""Generate audio clips for all chapters or only missing ones."""

import argparse
import glob
import json
import logging
import time
from pathlib import Path
from youtube_transcriber import Config
from youtube_transcriber.playlist_handler import PlaylistHandler
from youtube_transcriber.audio_clipper import AudioClipper
from youtube_transcriber.utils import setup_logging

# Setup logging
setup_logging(logging.INFO)


def find_videos_without_clips(config: Config):
    """Find videos that have metadata but are missing audio clips."""
    clips_dir = config.clips_dir
    audio_dir = config.audio_dir
    
    metadata_files = list(config.metadata_dir.glob('*_metadata.json'))
    videos_without_clips = []
    
    for metadata_file in metadata_files:
        video_id = metadata_file.stem.replace('_metadata', '')
        
        if video_id == 'playlist':
            continue
        
        try:
            with open(metadata_file, 'r', encoding='utf-8') as f:
                metadata = json.load(f)
            
            chapters = metadata.get('chapters', [])
            if not chapters:
                continue
            
            missing_clips = []
            for chapter in chapters:
                start_time = int(chapter.get('start_time', 0))
                end_time = int(chapter.get('end_time', 0))
                clip_filename = f'{video_id}_{start_time}_{end_time}.mp3'
                clip_path = clips_dir / clip_filename
                
                if not clip_path.exists():
                    missing_clips.append({
                        'start_time': start_time,
                        'end_time': end_time,
                        'title': chapter.get('title', '')
                    })
            
            if missing_clips:
                # Check if audio file exists
                audio_path = None
                for ext in ['.mp3', '.m4a', '.webm', '.opus']:
                    candidate = audio_dir / f'{video_id}{ext}'
                    if candidate.exists():
                        audio_path = candidate
                        break
                
                videos_without_clips.append({
                    'video_id': video_id,
                    'title': metadata.get('title', 'Unknown'),
                    'url': metadata.get('url', ''),
                    'audio_path': audio_path,
                    'missing_clips': missing_clips,
                    'total_chapters': len(chapters)
                })
        except Exception as e:
            logging.error(f'Error processing {metadata_file}: {e}')
    
    return videos_without_clips


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
            
            for vid in videos_without_audio_list:
                video_id = vid['video_id']
                url = vid['url']
                
                print(f"Downloading audio for {video_id}...")
                print(f"  URL: {url}")
                
                try:
                    audio_path = handler.download_audio(url)
                    
                    if audio_path and audio_path.exists():
                        vid['audio_path'] = audio_path
                        print(f"  ✓ Downloaded: {audio_path.name}")
                    else:
                        # Check again after a short delay
                        time.sleep(1)
                        for ext in ['.mp3', '.m4a', '.webm', '.opus']:
                            candidate = config.audio_dir / f'{video_id}{ext}'
                            if candidate.exists():
                                vid['audio_path'] = candidate
                                print(f"  ✓ Found: {candidate.name}")
                                break
                        else:
                            print(f"  ✗ Download failed")
                except Exception as e:
                    logging.error(f"Error downloading audio for {video_id}: {e}", exc_info=True)
                    print(f"  ✗ Error: {e}")
                print()
            
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
        created_clips = 0
        skipped_clips = 0
        errors = []
        
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
            
            for clip_idx, clip_info in enumerate(missing_clips, 1):
                start_time = clip_info['start_time']
                end_time = clip_info['end_time']
                clip_title = clip_info['title']
                
                clip_filename = f"{video_id}_{start_time}_{end_time}.mp3"
                clip_path = config.clips_dir / clip_filename
                
                if clip_path.exists():
                    skipped_clips += 1
                    continue
                
                print(f"  [{clip_idx}/{len(missing_clips)}] {clip_title[:50]}...")
                print(f"      Time: {start_time}s - {end_time}s")
                
                try:
                    clip_result = clipper.clip_audio(audio_path, start_time, end_time, clip_path)
                    
                    if clip_result and clip_result.exists():
                        size_mb = clip_result.stat().st_size / 1024 / 1024
                        created_clips += 1
                        print(f"      ✓ Created: {clip_filename} ({size_mb:.2f} MB)")
                    else:
                        errors.append(f"{video_id} chapter {clip_idx}: Clip creation failed")
                        print(f"      ✗ Failed to create clip")
                except Exception as e:
                    errors.append(f"{video_id} chapter {clip_idx}: {str(e)}")
                    logging.error(f"Error creating clip for {video_id} chapter {clip_idx}: {e}", exc_info=True)
                    print(f"      ✗ Error: {e}")
            
            print()
        
        # Print summary
        print("="*60)
        print("Summary")
        print("="*60)
        print(f"Videos processed: {len(videos_to_process)}")
        print(f"Total clips to create: {total_clips_to_create}")
        print(f"Clips created: {created_clips}")
        print(f"Clips skipped (already exist): {skipped_clips}")
        
        if errors:
            print(f"\nErrors occurred: {len(errors)}")
            for error in errors[:10]:
                print(f"  - {error}")
            if len(errors) > 10:
                print(f"  ... and {len(errors) - 10} more")
        
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
        created_clips = 0
        skipped_clips = 0
        errors = []
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
            audio_path = None
            for ext in ['.mp3', '.m4a', '.webm', '.opus']:
                candidate = config.audio_dir / f"{video_id}{ext}"
                if candidate.exists():
                    audio_path = candidate
                    print(f"  ✓ Audio file exists: {audio_path.name}")
                    break
            
            if not audio_path:
                print("  ⚠ WARNING: Audio file not found!")
                print("  Downloading audio...")
                audio_path = handler.download_audio(video_url)
                
                # After download attempt, check again for file (might have been created)
                if not audio_path:
                    time.sleep(1)  # Wait a bit for file system to sync
                    for ext in ['.mp3', '.m4a', '.webm', '.opus']:
                        candidate = config.audio_dir / f"{video_id}{ext}"
                        if candidate.exists():
                            audio_path = candidate
                            print(f"  ✓ Audio file found after download: {audio_path.name}")
                            break
                
                if audio_path:
                    print(f"  ✓ Audio download completed: {audio_path.name}")
                else:
                    # Final check: list all files in audio dir to see if video_id is in any filename
                    pattern = str(config.audio_dir / f"*{video_id}*")
                    matching_files = glob.glob(pattern)
                    if matching_files:
                        audio_path = Path(matching_files[0])
                        print(f"  ✓ Audio file found with different name: {audio_path.name}")
                    else:
                        print("  ✗✗✗ AUDIO DOWNLOAD FAILED ✗✗✗")
                        videos_without_audio.append({
                            'video_id': video_id,
                            'title': video_title,
                            'url': video_url
                        })
                        errors.append(f"{video_id}: Audio download failed")
                        print()
                        continue
            
            # Step 2: Generate clips for each chapter
            print(f"  Generating clips...")
            for chapter_idx, chapter in enumerate(chapters, 1):
                chapter_start = chapter['start_time']
                chapter_end = chapter['end_time']
                chapter_title = chapter['title']
                
                total_clips += 1
                
                # Check if clip already exists
                clip_file = config.clips_dir / f"{video_id}_{int(chapter_start)}_{int(chapter_end)}.mp3"
                if clip_file.exists():
                    skipped_clips += 1
                    continue
                
                try:
                    # Create audio clip
                    clip_path = clipper.clip_audio(audio_path, chapter_start, chapter_end, clip_file)
                    
                    if clip_path and clip_path.exists():
                        size_mb = clip_path.stat().st_size / 1024 / 1024
                        created_clips += 1
                        if chapter_idx <= 3 or chapter_idx == len(chapters):  # Show first 3 and last
                            print(f"    [{chapter_idx}/{len(chapters)}] ✓ {chapter_title[:50]} ({size_mb:.2f} MB)")
                        elif chapter_idx == 4:
                            print(f"    ...")
                    else:
                        errors.append(f"{video_id} chapter {chapter_idx}: Clip creation failed")
                
                except Exception as e:
                    errors.append(f"{video_id} chapter {chapter_idx}: {str(e)}")
                    logging.error(f"Error creating clip for {video_id} chapter {chapter_idx}: {e}", exc_info=True)
            
            print(f"  ✓ Completed: {len(chapters)} chapters\n")
        
        # Print summary
        print("\n" + "="*60)
        print("Summary")
        print("="*60)
        print(f"Total videos processed: {len(playlist_metadata['videos'])}")
        print(f"Total chapters: {total_clips}")
        print(f"Clips created: {created_clips}")
        print(f"Clips skipped (already exist): {skipped_clips}")
        
        if videos_without_audio:
            print(f"\n⚠⚠⚠ VIDEOS WITHOUT AUDIO: {len(videos_without_audio)} ⚠⚠⚠")
            for vid in videos_without_audio:
                print(f"  - {vid['video_id']}: {vid['title']}")
                print(f"    URL: {vid['url']}")
            print()
        
        if errors:
            print(f"\nErrors occurred: {len(errors)}")
            for error in errors[:10]:  # Show first 10 errors
                print(f"  - {error}")
            if len(errors) > 10:
                print(f"  ... and {len(errors) - 10} more")
        
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

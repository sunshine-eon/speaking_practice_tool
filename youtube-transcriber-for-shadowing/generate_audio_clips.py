"""Generate audio clips for all chapters based on collected metadata."""

import json
import logging
from pathlib import Path
from youtube_transcriber import Config
from youtube_transcriber.playlist_handler import PlaylistHandler
from youtube_transcriber.audio_clipper import AudioClipper
from youtube_transcriber.utils import setup_logging

# Setup logging
setup_logging(logging.INFO)

def generate_audio_clips(config: Config = None):
    """
    Generate audio clips for all chapters based on collected metadata.
    
    Args:
        config: Configuration object (defaults to ./test_data)
    """
    if config is None:
        config = Config(base_dir="./test_data", whisper_model="small")
    
    handler = PlaylistHandler(config)
    clipper = AudioClipper(config)
    
    # Load playlist metadata
    playlist_metadata_path = config.transcripts_dir / "playlist_metadata.json"
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
                import time
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
                import glob
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
    generate_audio_clips()


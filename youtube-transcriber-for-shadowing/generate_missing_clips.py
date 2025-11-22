"""Generate audio clips for videos that are missing clips."""

import json
import logging
from pathlib import Path
from youtube_transcriber import Config
from youtube_transcriber.audio_clipper import AudioClipper
from youtube_transcriber.playlist_handler import PlaylistHandler
from youtube_transcriber.utils import setup_logging

# Setup logging
setup_logging(logging.INFO)

def find_videos_without_clips(config: Config):
    """Find videos that have metadata but are missing audio clips."""
    transcripts_dir = config.transcripts_dir
    clips_dir = config.clips_dir
    audio_dir = config.audio_dir
    
    metadata_files = list(transcripts_dir.glob('*_metadata.json'))
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


def generate_missing_clips(config: Config = None, limit: int = None, download_audio: bool = True):
    """
    Generate audio clips for videos that are missing clips.
    
    Args:
        config: Configuration object (defaults to ./test_data)
        limit: Maximum number of videos to process (None for all)
        download_audio: Whether to download audio files if missing (default: True)
    """
    if config is None:
        config = Config(base_dir="./test_data", whisper_model="small")
    
    clipper = AudioClipper(config)
    handler = PlaylistHandler(config) if download_audio else None
    
    # Find videos without clips
    print("="*60)
    print("Finding videos with missing audio clips...")
    print("="*60)
    print()
    
    videos_without_clips = find_videos_without_clips(config)
    
    # Separate videos with and without audio files
    videos_with_audio = [v for v in videos_without_clips if v['audio_path']]
    videos_without_audio = [v for v in videos_without_clips if not v['audio_path']]
    
    print(f"Found {len(videos_without_clips)} videos with missing clips:")
    print(f"  - {len(videos_with_audio)} videos with audio files (can generate clips)")
    print(f"  - {len(videos_without_audio)} videos without audio files (need to download first)")
    print()
    
    if videos_without_audio:
        print("⚠ Videos without audio files:")
        for vid in videos_without_audio[:10]:
            print(f"  - {vid['video_id']}: {vid['title'][:60]}...")
        if len(videos_without_audio) > 10:
            print(f"  ... and {len(videos_without_audio) - 10} more")
        print()
    
    # Try to download audio for videos without audio files
    if download_audio and videos_without_audio:
        print("="*60)
        print("Downloading audio files for videos without audio...")
        print("="*60)
        print()
        
        for vid in videos_without_audio:
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
                    import time
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
        videos_without_audio = [v for v in videos_without_clips if not v.get('audio_path')]
        
        print(f"After download attempts:")
        print(f"  - Videos with audio: {len(videos_with_audio)}")
        print(f"  - Videos still without audio: {len(videos_without_audio)}")
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
    
    if videos_without_audio:
        print(f"\n⚠ {len(videos_without_audio)} videos need audio files downloaded first")
    
    print("="*60)


if __name__ == "__main__":
    import sys
    
    limit = None
    if len(sys.argv) > 1:
        try:
            limit = int(sys.argv[1])
        except ValueError:
            print(f"Invalid limit: {sys.argv[1]}. Using None (process all).")
    
    generate_missing_clips(limit=limit)


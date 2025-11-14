"""Process all videos in a playlist and extract chapters with transcripts and audio."""

import logging
import json
from pathlib import Path
from youtube_transcriber import Config
from youtube_transcriber.playlist_handler import PlaylistHandler
from youtube_transcriber.transcript_searcher import TranscriptSearcher
from youtube_transcriber.audio_clipper import AudioClipper
from youtube_transcriber.transcriber import Transcriber
from youtube_transcriber.utils import setup_logging

# Setup logging
setup_logging(logging.INFO)

def process_playlist_chapters(playlist_url: str, config: Config = None, 
                              max_videos: int = None, skip_existing: bool = True):
    """
    Process all videos in a playlist and extract chapters.
    
    Args:
        playlist_url: URL of the YouTube playlist
        config: Configuration object (defaults to ./test_data)
        max_videos: Maximum number of videos to process (None for all)
        skip_existing: Skip videos/chapters that already have files
    """
    if config is None:
        config = Config(base_dir="./test_data", whisper_model="small")
    
    handler = PlaylistHandler(config)
    searcher = TranscriptSearcher(config)
    clipper = AudioClipper(config)
    transcriber = Transcriber(config)
    
    print("="*60)
    print("Processing playlist chapters")
    print("="*60)
    print(f"Playlist URL: {playlist_url}\n")
    
    # Try to load videos from existing metadata files first
    print("Step 1: Getting video list...")
    videos = []
    metadata_files = [f for f in config.transcripts_dir.glob("*_metadata.json") 
                     if f.name != "playlist_metadata.json"]
    
    if metadata_files:
        print(f"  Found {len(metadata_files)} existing metadata files")
        print("  Loading video info from metadata files...")
        for metadata_file in metadata_files:
            try:
                with open(metadata_file, 'r', encoding='utf-8') as f:
                    video_meta = json.load(f)
                    if 'video_id' in video_meta:
                        videos.append({
                            'video_id': video_meta['video_id'],
                            'title': video_meta.get('title', 'Unknown'),
                            'url': video_meta.get('url', f"https://www.youtube.com/watch?v={video_meta['video_id']}"),
                            'duration': video_meta.get('duration', 0),
                        })
            except Exception as e:
                logging.warning(f"Failed to load metadata from {metadata_file.name}: {e}")
                continue
        
        if videos:
            print(f"  ✓ Loaded {len(videos)} videos from metadata files")
    
    # If no metadata files or need to refresh, get from playlist
    if not videos:
        print("  No metadata files found, fetching from playlist...")
        videos = handler.get_playlist_videos(playlist_url)
        
        if not videos:
            print("✗ Could not find videos in playlist.")
            return
    
    if max_videos:
        videos = videos[:max_videos]
    
    print(f"✓ Processing {len(videos)} videos.\n")
    
    # Store playlist metadata
    playlist_metadata = {
        'playlist_url': playlist_url,
        'total_videos': len(videos),
        'videos': []
    }
    
    # Process each video
    results = {
        'total_videos': len(videos),
        'processed_videos': 0,
        'total_chapters': 0,
        'processed_chapters': 0,
        'errors': []
    }
    
    for video_idx, video in enumerate(videos, 1):
        video_id = video['video_id']
        video_title = video['title']
        video_url = video['url']
        
        print("\n" + "="*60)
        print(f"Video {video_idx}/{len(videos)}: {video_title}")
        print(f"Video ID: {video_id}")
        print("="*60)
        
        try:
            # Step 1: Download audio if needed
            audio_path = None
            for ext in ['.mp3', '.m4a', '.webm', '.opus']:
                candidate = config.audio_dir / f"{video_id}{ext}"
                if candidate.exists():
                    audio_path = candidate
                    print(f"✓ Audio file already exists: {audio_path.name}")
                    break
            
            if not audio_path:
                print("Downloading audio...")
                audio_path = handler.download_audio(video_url)
                if audio_path:
                    print(f"✓ Audio download completed: {audio_path.name}")
                else:
                    print("✗ Audio download failed")
                    results['errors'].append(f"{video_id}: Audio download failed")
                    continue
            
            # Step 2: Transcribe if needed
            transcript_path = config.transcripts_dir / f"{video_id}.json"
            if not transcript_path.exists():
                print("Generating transcript... (this may take a while)")
                transcript = transcriber.transcribe(audio_path)
                if transcript and transcript.get('segments'):
                    with open(transcript_path, 'w', encoding='utf-8') as f:
                        json.dump(transcript, f, indent=2, ensure_ascii=False)
                    print(f"✓ Transcript generation completed: {transcript_path.name}")
                else:
                    print("✗ Transcript generation failed")
                    results['errors'].append(f"{video_id}: Transcript generation failed")
                    continue
            else:
                print(f"✓ Transcript already exists: {transcript_path.name}")
            
            # Step 3: Get chapters (try from metadata first)
            print("Getting chapter information...")
            chapters = None
            
            # Try to load from existing metadata file
            video_metadata_path = config.transcripts_dir / f"{video_id}_metadata.json"
            if video_metadata_path.exists():
                try:
                    with open(video_metadata_path, 'r', encoding='utf-8') as f:
                        existing_metadata = json.load(f)
                        if 'chapters' in existing_metadata and existing_metadata['chapters']:
                            print("  ✓ Using chapters from existing metadata file")
                            # Convert metadata format to handler format
                            chapters = []
                            for ch in existing_metadata['chapters']:
                                chapters.append({
                                    'start_time': ch.get('start_time', 0.0),
                                    'end_time': ch.get('end_time', 0.0),
                                    'title': ch.get('title', ''),
                                })
                except Exception as e:
                    logging.warning(f"Failed to load chapters from metadata: {e}")
            
            # If not found in metadata, get from YouTube
            if not chapters:
                print("  Fetching chapters from YouTube...")
                chapters = handler.get_video_chapters(video_url)
            
            if not chapters:
                print("⚠ No chapters found in this video.")
                # Save video metadata even without chapters
                video_metadata = {
                    'video_id': video_id,
                    'title': video_title,
                    'url': video_url,
                    'duration': video.get('duration', 0),
                    'chapters': [],
                    'audio_path': str(audio_path) if audio_path else None,
                    'transcript_path': str(transcript_path) if transcript_path.exists() else None,
                }
                playlist_metadata['videos'].append(video_metadata)
                
                # Save individual video metadata
                video_metadata_path = config.transcripts_dir / f"{video_id}_metadata.json"
                with open(video_metadata_path, 'w', encoding='utf-8') as f:
                    json.dump(video_metadata, f, indent=2, ensure_ascii=False)
                
                results['processed_videos'] += 1
                continue
            
            print(f"✓ Found {len(chapters)} chapters.\n")
            results['total_chapters'] += len(chapters)
            
            # Prepare video metadata with chapters
            video_metadata = {
                'video_id': video_id,
                'title': video_title,
                'url': video_url,
                'duration': video.get('duration', 0),
                'chapters': [],
                'audio_path': str(audio_path) if audio_path else None,
                'transcript_path': str(transcript_path) if transcript_path.exists() else None,
            }
            
            # Step 4: Process each chapter
            for chapter_idx, chapter in enumerate(chapters, 1):
                chapter_start = chapter.get('start_time', 0.0)
                chapter_end = chapter.get('end_time', 0.0)
                chapter_title = chapter.get('title', f'Chapter {chapter_idx}')
                
                # Sanitize chapter title for filename
                safe_title = "".join(c for c in chapter_title if c.isalnum() or c in (' ', '-', '_')).strip()
                safe_title = safe_title.replace(' ', '_')[:50]  # Limit length
                
                print(f"  [{chapter_idx}/{len(chapters)}] {chapter_title}")
                print(f"      Time: {int(chapter_start//60):02d}:{int(chapter_start%60):02d} - "
                      f"{int(chapter_end//60):02d}:{int(chapter_end%60):02d}")
                
                # Check if already processed
                transcript_file = config.transcripts_dir / f"{video_id}_chapter{chapter_idx}_{safe_title}.txt"
                clip_file = config.clips_dir / f"{video_id}_{int(chapter_start)}_{int(chapter_end)}.mp3"
                
                # Add chapter info to metadata
                chapter_info = {
                    'chapter_index': chapter_idx,
                    'title': chapter_title,
                    'start_time': chapter_start,
                    'end_time': chapter_end,
                    'start_time_formatted': f"{int(chapter_start//60):02d}:{int(chapter_start%60):02d}",
                    'end_time_formatted': f"{int(chapter_end//60):02d}:{int(chapter_end%60):02d}",
                    'transcript_file': str(transcript_file) if transcript_file.exists() else None,
                    'clip_file': str(clip_file) if clip_file.exists() else None,
                }
                video_metadata['chapters'].append(chapter_info)
                
                if skip_existing and transcript_file.exists() and clip_file.exists():
                    print(f"     ⏭ Already processed (skipping)")
                    results['processed_chapters'] += 1
                    continue
                
                try:
                    # Extract transcript for this chapter
                    segments = searcher.get_segments_in_range(video_id, chapter_start, chapter_end)
                    
                    if segments:
                        # Save transcript
                        with open(transcript_file, 'w', encoding='utf-8') as f:
                            f.write(f"Chapter {chapter_idx}: {chapter_title}\n")
                            f.write(f"Video: {video_title}\n")
                            f.write(f"Time: {int(chapter_start//60):02d}:{int(chapter_start%60):02d} - "
                                   f"{int(chapter_end//60):02d}:{int(chapter_end%60):02d}\n")
                            f.write("="*60 + "\n\n")
                            for seg in segments:
                                f.write(f"[{int(seg['start']//60):02d}:{int(seg['start']%60):02d}] {seg['text']}\n")
                        
                        print(f"     ✓ Transcript saved: {transcript_file.name}")
                    else:
                        print(f"     ⚠ Could not find transcript segments.")
                    
                    # Create audio clip
                    clip_path = clipper.clip_video_audio(video_id, chapter_start, chapter_end)
                    
                    if clip_path:
                        size_mb = clip_path.stat().st_size / 1024 / 1024
                        print(f"     ✓ Audio clip created: {clip_path.name} ({size_mb:.2f} MB)")
                        results['processed_chapters'] += 1
                    else:
                        print(f"     ✗ Audio clip creation failed")
                        results['errors'].append(f"{video_id} chapter {chapter_idx}: Audio clip creation failed")
                
                except Exception as e:
                    print(f"     ✗ Error: {e}")
                    results['errors'].append(f"{video_id} chapter {chapter_idx}: {str(e)}")
                    logging.error(f"Error processing chapter {chapter_idx} of {video_id}: {e}", exc_info=True)
            
            # Save video metadata after processing all chapters
            video_metadata_path = config.transcripts_dir / f"{video_id}_metadata.json"
            with open(video_metadata_path, 'w', encoding='utf-8') as f:
                json.dump(video_metadata, f, indent=2, ensure_ascii=False)
            print(f"\n✓ Video metadata saved: {video_metadata_path.name}")
            
            playlist_metadata['videos'].append(video_metadata)
            results['processed_videos'] += 1
            
        except Exception as e:
            print(f"\n✗ Error occurred while processing video: {e}")
            results['errors'].append(f"{video_id}: {str(e)}")
            logging.error(f"Error processing video {video_id}: {e}", exc_info=True)
            continue
    
    # Save playlist metadata
    playlist_metadata['processed_videos'] = results['processed_videos']
    playlist_metadata['total_chapters'] = results['total_chapters']
    playlist_metadata['processed_chapters'] = results['processed_chapters']
    playlist_metadata['errors'] = results['errors']
    
    playlist_metadata_path = config.transcripts_dir / "playlist_metadata.json"
    with open(playlist_metadata_path, 'w', encoding='utf-8') as f:
        json.dump(playlist_metadata, f, indent=2, ensure_ascii=False)
    print(f"\n✓ Playlist metadata saved: {playlist_metadata_path.name}")
    
    # Print summary
    print("\n\n" + "="*60)
    print("Processing Summary")
    print("="*60)
    print(f"Total videos: {results['total_videos']}")
    print(f"Processed videos: {results['processed_videos']}")
    print(f"Total chapters: {results['total_chapters']}")
    print(f"Processed chapters: {results['processed_chapters']}")
    
    if results['errors']:
        print(f"\nErrors occurred: {len(results['errors'])}")
        for error in results['errors'][:10]:  # Show first 10 errors
            print(f"  - {error}")
        if len(results['errors']) > 10:
            print(f"  ... and {len(results['errors']) - 10} more")
    
    print("\n" + "="*60)


if __name__ == "__main__":
    import sys
    
    # Default playlist URL (can be overridden via command line)
    playlist_url = "https://www.youtube.com/playlist?list=PL2fLjt2dG0N6a1Lt9lrofYGlyuO6ZrHsN"
    
    if len(sys.argv) > 1:
        playlist_url = sys.argv[1]
    
    max_videos = None
    if len(sys.argv) > 2:
        max_videos = int(sys.argv[2])
    
    print(f"Playlist URL: {playlist_url}")
    if max_videos:
        print(f"Maximum videos to process: {max_videos}")
    print()
    
    process_playlist_chapters(playlist_url, max_videos=max_videos, skip_existing=True)


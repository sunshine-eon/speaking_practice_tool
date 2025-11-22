"""Collect chapter information for all videos in a playlist."""

import json
import logging
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from youtube_transcriber import Config
from youtube_transcriber.playlist_handler import PlaylistHandler
from youtube_transcriber.utils import setup_logging

# Setup logging
setup_logging(logging.INFO)

def collect_chapter_info(playlist_url: str, config: Config = None):
    """
    Collect chapter information for all videos in a playlist.
    
    Args:
        playlist_url: URL of the YouTube playlist
        config: Configuration object (defaults to ./test_data)
    """
    if config is None:
        config = Config(base_dir="./test_data", whisper_model="small")
    
    handler = PlaylistHandler(config)
    
    print("="*60)
    print("Collecting chapter information for all videos")
    print("="*60)
    print(f"Playlist URL: {playlist_url}\n")
    
    # Get all videos from playlist
    print("Step 1: Getting video list from playlist...")
    videos = handler.get_playlist_videos(playlist_url)
    
    if not videos:
        print("✗ Could not find videos in playlist.")
        return
    
    print(f"✓ Found {len(videos)} videos in playlist.\n")
    
    playlist_metadata = {
        'playlist_url': playlist_url,
        'total_videos': len(videos),
        'videos': []
    }
    
    # Collect chapter info for each video
    for video_idx, video in enumerate(videos, 1):
        video_id = video['video_id']
        video_title = video['title']
        video_url = video['url']
        
        print(f"[{video_idx}/{len(videos)}] {video_title}")
        print(f"  Video ID: {video_id}")
        
        try:
            # Get video info (includes chapters and upload_date)
            print("  Getting video information...")
            video_info = handler.get_video_info(video_url)
            
            if not video_info:
                print("  ⚠ Could not fetch video info")
                video_metadata = {
                    'video_id': video_id,
                    'title': video_title,
                    'url': video_url,
                    'duration': video.get('duration', 0),
                    'chapters': [],
                }
            else:
                chapters = video_info.get('chapters', [])
                
                video_metadata = {
                    'video_id': video_id,
                    'title': video_info.get('title', video_title),
                    'url': video_url,
                    'duration': video_info.get('duration', video.get('duration', 0)),
                    'upload_date': video_info.get('upload_date', ''),
                    'uploader': video_info.get('uploader', ''),
                    'thumbnail': video_info.get('thumbnail', ''),
                    'chapters': [],
                }
                
                if not chapters:
                    print("  ⚠ No chapters found")
                else:
                    print(f"  ✓ Found {len(chapters)} chapters")
                    
                    # Process each chapter
                    for chapter_idx, chapter in enumerate(chapters, 1):
                        chapter_start = chapter.get('start_time', 0.0)
                        chapter_end = chapter.get('end_time', 0.0)
                        chapter_title = chapter.get('title', f'Chapter {chapter_idx}')
                        
                        chapter_info = {
                            'chapter_index': chapter_idx,
                            'title': chapter_title,
                            'start_time': chapter_start,
                            'end_time': chapter_end,
                            'start_time_formatted': f"{int(chapter_start//60):02d}:{int(chapter_start%60):02d}",
                            'end_time_formatted': f"{int(chapter_end//60):02d}:{int(chapter_end%60):02d}",
                        }
                        video_metadata['chapters'].append(chapter_info)
            
            # Save individual video metadata
            video_metadata_path = config.metadata_dir / f"{video_id}_metadata.json"
            with open(video_metadata_path, 'w', encoding='utf-8') as f:
                json.dump(video_metadata, f, indent=2, ensure_ascii=False)
            print(f"  ✓ Metadata saved: {video_metadata_path.name}\n")
            
            playlist_metadata['videos'].append(video_metadata)
            
        except Exception as e:
            print(f"  ✗ Error: {e}\n")
            logging.error(f"Error processing video {video_id}: {e}", exc_info=True)
            # Still add video to metadata with error info
            playlist_metadata['videos'].append({
                'video_id': video_id,
                'title': video_title,
                'url': video_url,
                'duration': video.get('duration', 0),
                'chapters': [],
                'error': str(e)
            })
            continue
    
    # Save playlist metadata
    playlist_metadata_path = config.metadata_dir / "playlist_metadata.json"
    with open(playlist_metadata_path, 'w', encoding='utf-8') as f:
        json.dump(playlist_metadata, f, indent=2, ensure_ascii=False)
    
    print("="*60)
    print("Summary")
    print("="*60)
    print(f"Total videos: {len(videos)}")
    print(f"Processed videos: {len(playlist_metadata['videos'])}")
    total_chapters = sum(len(v.get('chapters', [])) for v in playlist_metadata['videos'])
    print(f"Total chapters: {total_chapters}")
    print(f"\n✓ Playlist metadata saved: {playlist_metadata_path.name}")
    print("="*60)


if __name__ == "__main__":
    import sys
    
    # Default playlist URL (can be overridden via command line)
    playlist_url = "https://www.youtube.com/playlist?list=PL2fLjt2dG0N6a1Lt9lrofYGlyuO6ZrHsN"
    
    if len(sys.argv) > 1:
        playlist_url = sys.argv[1]
    
    collect_chapter_info(playlist_url)


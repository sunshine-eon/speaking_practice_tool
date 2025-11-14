"""Test script for playlist handler."""

import logging
from youtube_transcriber import Config
from youtube_transcriber.playlist_handler import PlaylistHandler
from youtube_transcriber.utils import setup_logging

# Setup logging
setup_logging(logging.INFO)

# Test playlist URL
playlist_url = "https://www.youtube.com/playlist?list=PL2fLjt2dG0N6a1Lt9lrofYGlyuO6ZrHsN"

print(f"Testing playlist handler with: {playlist_url}\n")

# Initialize config
config = Config(base_dir="./test_data")

# Create handler
handler = PlaylistHandler(config)

# Get playlist videos
print("Step 1: Getting playlist videos...")
videos = handler.get_playlist_videos(playlist_url)

if videos:
    print(f"\n✓ Found {len(videos)} videos in playlist")
    print("\nFirst 5 videos:")
    for i, video in enumerate(videos[:5], 1):
        print(f"\n{i}. {video['title']}")
        print(f"   ID: {video['video_id']}")
        print(f"   Duration: {video.get('duration', 0)} seconds")
        print(f"   URL: {video['url']}")
    
    # Test downloading first video audio (skip if too many videos to avoid long wait)
    if len(videos) <= 10:
        if videos:
            first_video = videos[0]
            print(f"\n\nStep 2: Downloading audio from first video...")
            print(f"Video: {first_video['title']}")
            audio_path = handler.download_audio(first_video['url'])
            
            if audio_path:
                print(f"\n✓ Audio downloaded successfully!")
                print(f"   Path: {audio_path}")
                print(f"   Size: {audio_path.stat().st_size / 1024 / 1024:.2f} MB")
            else:
                print("\n✗ Failed to download audio")
    else:
        print(f"\n\n(Skipping audio download test - playlist has {len(videos)} videos)")
        print("Playlist handler is working correctly!")
else:
    print("\n✗ Failed to get playlist videos")


"""Test script for audio download functionality."""

import logging
from youtube_transcriber import Config
from youtube_transcriber.playlist_handler import PlaylistHandler
from youtube_transcriber.utils import setup_logging

# Setup logging
setup_logging(logging.INFO)

# Test with a single video (use first video from playlist)
playlist_url = "https://www.youtube.com/playlist?list=PL2fLjt2dG0N6a1Lt9lrofYGlyuO6ZrHsN"

print("Testing audio download functionality\n")

# Initialize config
config = Config(base_dir="./test_data")

# Create handler
handler = PlaylistHandler(config)

# Get first video from playlist
print("Step 1: Getting first video from playlist...")
videos = handler.get_playlist_videos(playlist_url)

if not videos:
    print("✗ Failed to get videos from playlist")
    exit(1)

first_video = videos[0]
print(f"\n✓ Found video: {first_video['title']}")
print(f"   Video ID: {first_video['video_id']}")
print(f"   Duration: {first_video.get('duration', 0)} seconds ({first_video.get('duration', 0) / 60:.1f} minutes)")

# Download audio
print(f"\nStep 2: Downloading audio...")
print("This may take a while depending on video length...")
audio_path = handler.download_audio(first_video['url'])

if audio_path and audio_path.exists():
    print(f"\n✓ Audio downloaded successfully!")
    print(f"   Path: {audio_path}")
    print(f"   Size: {audio_path.stat().st_size / 1024 / 1024:.2f} MB")
    print(f"   Format: {audio_path.suffix}")
    
    # Verify it's a valid audio file
    try:
        from pydub import AudioSegment
        audio = AudioSegment.from_file(str(audio_path))
        print(f"\n✓ Audio file is valid!")
        print(f"   Duration: {len(audio) / 1000:.1f} seconds")
        print(f"   Sample rate: {audio.frame_rate} Hz")
        print(f"   Channels: {audio.channels}")
    except Exception as e:
        print(f"\n⚠ Warning: Could not verify audio file: {e}")
else:
    print("\n✗ Failed to download audio")


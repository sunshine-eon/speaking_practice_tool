"""Test script for audio clipping functionality."""

import logging
from pathlib import Path
from youtube_transcriber import Config
from youtube_transcriber.audio_clipper import AudioClipper
from youtube_transcriber.utils import setup_logging

# Setup logging
setup_logging(logging.INFO)

print("Testing audio clipping functionality\n")

# Initialize config
config = Config(base_dir="./test_data")

# Check if audio file exists
audio_file = Path("test_data/audio/4ef0juAMqoE.mp3")
if not audio_file.exists():
    print(f"✗ Audio file not found: {audio_file}")
    print("Please run test_download.py first to download audio")
    exit(1)

print(f"✓ Found audio file: {audio_file}")
print(f"   Size: {audio_file.stat().st_size / 1024 / 1024:.2f} MB")

# Create clipper
clipper = AudioClipper(config)

# Test 1: Clip first 5 minutes (0 to 300 seconds)
print("\n" + "="*60)
print("Test 1: Clipping first 5 minutes (0:00 - 5:00)")
print("="*60)
clip1 = clipper.clip_audio(audio_file, 0, 300)

if clip1 and clip1.exists():
    print(f"\n✓ Clip created successfully!")
    print(f"   Path: {clip1}")
    print(f"   Size: {clip1.stat().st_size / 1024 / 1024:.2f} MB")
    print(f"   Duration: ~5 minutes")
else:
    print("\n✗ Failed to create clip")

# Test 2: Clip 10-15 minutes (600 to 900 seconds)
print("\n" + "="*60)
print("Test 2: Clipping 10-15 minutes (10:00 - 15:00)")
print("="*60)
clip2 = clipper.clip_audio(audio_file, 600, 900)

if clip2 and clip2.exists():
    print(f"\n✓ Clip created successfully!")
    print(f"   Path: {clip2}")
    print(f"   Size: {clip2.stat().st_size / 1024 / 1024:.2f} MB")
    print(f"   Duration: ~5 minutes")
else:
    print("\n✗ Failed to create clip")

# Test 3: Using video_id method
print("\n" + "="*60)
print("Test 3: Clipping using video_id (20-25 minutes)")
print("="*60)
clip3 = clipper.clip_video_audio("4ef0juAMqoE", 1200, 1500)

if clip3 and clip3.exists():
    print(f"\n✓ Clip created successfully!")
    print(f"   Path: {clip3}")
    print(f"   Size: {clip3.stat().st_size / 1024 / 1024:.2f} MB")
    print(f"   Duration: ~5 minutes")
else:
    print("\n✗ Failed to create clip")

print("\n" + "="*60)
print("All tests completed!")
print("="*60)


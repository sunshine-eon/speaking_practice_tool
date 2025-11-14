"""Test script for transcription functionality."""

import logging
from pathlib import Path
from youtube_transcriber import Config
from youtube_transcriber.transcriber import Transcriber
from youtube_transcriber.utils import setup_logging

# Setup logging
setup_logging(logging.INFO)

print("Testing Whisper transcription\n")

# Initialize config
config = Config(base_dir="./test_data", whisper_model="base")

# Check if audio file exists
audio_file = Path("test_data/audio/4ef0juAMqoE.mp3")
if not audio_file.exists():
    print(f"✗ Audio file not found: {audio_file}")
    print("Please run test_download.py first to download audio")
    exit(1)

print(f"✓ Found audio file: {audio_file}")
print(f"   Size: {audio_file.stat().st_size / 1024 / 1024:.2f} MB")

# Create transcriber
print("\nStep 1: Loading Whisper model...")
print("(This may take a moment on first run)")
try:
    transcriber = Transcriber(config)
    print("✓ Whisper model loaded")
except Exception as e:
    print(f"✗ Failed to load Whisper model: {e}")
    exit(1)

# Transcribe (just first 30 seconds for testing)
print("\nStep 2: Transcribing audio...")
print("(This will take a while for the full video)")
print("Transcribing first 30 seconds for testing...")

# For testing, we'll transcribe the full file but show only first segments
result = transcriber.transcribe(audio_file, language="en")

if result and result.get('segments'):
    print(f"\n✓ Transcription complete!")
    print(f"   Language: {result.get('language', 'unknown')}")
    print(f"   Total segments: {len(result['segments'])}")
    print(f"   Full text length: {len(result.get('text', ''))} characters")
    
    # Show first 5 segments
    print("\nFirst 5 segments:")
    for i, segment in enumerate(result['segments'][:5], 1):
        start_min = int(segment['start'] // 60)
        start_sec = int(segment['start'] % 60)
        end_min = int(segment['end'] // 60)
        end_sec = int(segment['end'] % 60)
        print(f"\n{i}. [{start_min:02d}:{start_sec:02d} - {end_min:02d}:{end_sec:02d}]")
        print(f"   {segment['text']}")
    
    # Save transcription
    import json
    transcript_file = config.transcripts_dir / f"{audio_file.stem}.json"
    with open(transcript_file, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    print(f"\n✓ Transcription saved to: {transcript_file}")
    
    # Also save as readable text
    text_file = config.transcripts_dir / f"{audio_file.stem}.txt"
    with open(text_file, 'w', encoding='utf-8') as f:
        f.write(f"Language: {result.get('language', 'unknown')}\n")
        f.write("=" * 80 + "\n\n")
        for segment in result['segments']:
            start_min = int(segment['start'] // 60)
            start_sec = int(segment['start'] % 60)
            end_min = int(segment['end'] // 60)
            end_sec = int(segment['end'] % 60)
            f.write(f"[{start_min:02d}:{start_sec:02d} - {end_min:02d}:{end_sec:02d}]\n")
            f.write(f"{segment['text']}\n\n")
    print(f"✓ Readable transcript saved to: {text_file}")
    
else:
    print("\n✗ Transcription failed or returned no results")


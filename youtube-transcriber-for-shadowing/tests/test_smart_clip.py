"""Test script for smart clipping based on transcript text."""

import logging
from youtube_transcriber import Config
from youtube_transcriber.transcript_searcher import TranscriptSearcher
from youtube_transcriber.audio_clipper import AudioClipper
from youtube_transcriber.utils import setup_logging

# Setup logging
setup_logging(logging.INFO)

print("Testing smart clipping based on transcript text\n")

# Initialize config
config = Config(base_dir="./test_data")

# Create searcher and clipper
searcher = TranscriptSearcher(config)
clipper = AudioClipper(config)

video_id = "4ef0juAMqoE"

# Test 1: Find text and clip from that point
print("="*60)
print("Test 1: Find 'micromanagement' and clip 5 minutes from there")
print("="*60)

# Find when "micromanagement" is mentioned
start_time = searcher.find_start_time(video_id, "micromanagement")
if start_time:
    print(f"✓ Found 'micromanagement' at {int(start_time//60)}:{int(start_time%60):02d}")
    
    # Clip 5 minutes from that point
    end_time = start_time + 300  # 5 minutes
    clip_path = clipper.clip_video_audio(video_id, start_time, end_time)
    
    if clip_path:
        print(f"✓ Clip created: {clip_path}")
        print(f"   From: {int(start_time//60)}:{int(start_time%60):02d}")
        print(f"   To: {int(end_time//60)}:{int(end_time%60):02d}")
        
        # Show transcript segments in this range
        segments = searcher.get_segments_in_range(video_id, start_time, end_time)
        print(f"\n   Transcript segments in this clip ({len(segments)} segments):")
        for seg in segments[:5]:  # Show first 5
            print(f"   [{int(seg['start']//60)}:{int(seg['start']%60):02d}] {seg['text'][:60]}...")
else:
    print("✗ Could not find 'micromanagement' in transcript")

# Test 2: Find range between two texts
print("\n" + "="*60)
print("Test 2: Clip between 'way too many founders' and 'Everyone really wants'")
print("="*60)

time_range = searcher.find_text_range(
    video_id,
    start_text="way too many founders",
    end_text="Everyone really wants to be able to row"
)

if time_range:
    start_time, end_time = time_range
    print(f"✓ Found range: {int(start_time//60)}:{int(start_time%60):02d} to {int(end_time//60)}:{int(end_time%60):02d}")
    print(f"   Duration: {int((end_time - start_time)//60)}:{int((end_time - start_time)%60):02d}")
    
    clip_path = clipper.clip_video_audio(video_id, start_time, end_time)
    
    if clip_path:
        print(f"✓ Clip created: {clip_path}")
        
        # Show transcript
        segments = searcher.get_segments_in_range(video_id, start_time, end_time)
        print(f"\n   Transcript in this clip:")
        for seg in segments:
            print(f"   [{int(seg['start']//60)}:{int(seg['start']%60):02d}] {seg['text']}")
else:
    print("✗ Could not find text range")

# Test 3: Search for multiple occurrences
print("\n" + "="*60)
print("Test 3: Find all occurrences of 'details'")
print("="*60)

matches = searcher.find_text(video_id, "details")
print(f"✓ Found {len(matches)} occurrences:")
for i, match in enumerate(matches[:5], 1):  # Show first 5
    print(f"   {i}. [{int(match['start']//60)}:{int(match['start']%60):02d}] {match['text'][:70]}...")

print("\n" + "="*60)
print("All tests completed!")
print("="*60)


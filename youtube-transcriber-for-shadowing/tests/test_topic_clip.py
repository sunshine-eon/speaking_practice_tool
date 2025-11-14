"""Test script for experimenting with topic change detection using YouTube chapters."""

import logging
from youtube_transcriber import Config
from youtube_transcriber.transcript_searcher import TranscriptSearcher
from youtube_transcriber.audio_clipper import AudioClipper
from youtube_transcriber.playlist_handler import PlaylistHandler
from youtube_transcriber.utils import setup_logging

# Setup logging
setup_logging(logging.INFO)

print("Testing topic change detection using YouTube chapters\n")

# Initialize config
config = Config(base_dir="./test_data")

# Create searcher, clipper, and handler
searcher = TranscriptSearcher(config)
clipper = AudioClipper(config)
handler = PlaylistHandler(config)

video_id = "4ef0juAMqoE"
video_url = f"https://www.youtube.com/watch?v={video_id}"

# Starting text from line 932-933
start_text = "By the way, I think that like many years ago, I remember I think reading a blog post"

print("="*60)
print("Step 1: Getting YouTube chapters")
print("="*60)

# Get chapters from YouTube
chapters = handler.get_video_chapters(video_url)

if chapters:
    print(f"\n✓ Found {len(chapters)} chapters in video:\n")
    for i, chapter in enumerate(chapters, 1):
        start = chapter.get('start_time', 0.0)
        end = chapter.get('end_time', 0.0)
        title = chapter.get('title', 'Untitled')
        print(f"{i}. [{int(start//60)}:{int(start%60):02d} - {int(end//60)}:{int(end%60):02d}] {title}")
else:
    print("\n✗ No chapters found in video (will use topic detection algorithm)")

print("\n" + "="*60)
print("Step 2: Finding starting point")
print("="*60)

matches = searcher.find_text(video_id, start_text)
if not matches:
    matches = searcher.find_text(video_id, "many years ago, I remember I think reading a blog post")
if not matches:
    matches = searcher.find_text(video_id, "reading a blog post by Ben Horowitz")

if matches:
    start_time = matches[0]['start']
    print(f"✓ Found text at {int(start_time//60)}:{int(start_time%60):02d}")
    print(f"   Text: {matches[0]['text'][:100]}...")
else:
    print("✗ Could not find the text")
    exit(1)

print("\n" + "="*60)
print("Step 3: Finding topic boundary")
print("="*60)

# Try with chapters first
print("\nTrying with YouTube chapters...")
time_range = searcher.find_text_with_topic_boundary(
    video_id,
    start_text=start_text,
    max_duration=None,
    use_chapters=True
)

if time_range:
    clip_start, clip_end = time_range
    duration = clip_end - clip_start
    
    print(f"\n✓ Found topic boundary:")
    print(f"   Start: {int(clip_start//60)}:{int(clip_start%60):02d}")
    print(f"   End: {int(clip_end//60)}:{int(clip_end%60):02d}")
    print(f"   Duration: {int(duration//60)}:{int(duration%60):02d} ({duration:.1f} seconds)")
    
    # Check which chapter this corresponds to
    if chapters:
        print(f"\n   Corresponding chapter:")
        for chapter in chapters:
            chapter_start = chapter.get('start_time', 0.0)
            chapter_end = chapter.get('end_time', 0.0)
            if chapter_start <= clip_start < chapter_end:
                print(f"   [{int(chapter_start//60)}:{int(chapter_start%60):02d} - "
                      f"{int(chapter_end//60)}:{int(chapter_end%60):02d}] {chapter.get('title', '')}")
                break
    
    # Get segments in this range
    segments_in_range = searcher.get_segments_in_range(video_id, clip_start, clip_end)
    print(f"\n   Segments: {len(segments_in_range)}")
    
    # Show transcript preview
    print(f"\n   Transcript preview:")
    for seg in segments_in_range[:5]:
        print(f"   [{int(seg['start']//60)}:{int(seg['start']%60):02d}] {seg['text'][:70]}...")
    if len(segments_in_range) > 5:
        print(f"   ... and {len(segments_in_range) - 5} more segments")
    
    # Show what comes after
    print(f"\n   What comes after (next 3 segments):")
    next_segments = searcher.get_segments_in_range(video_id, clip_end, clip_end + 30)
    for seg in next_segments[:3]:
        print(f"   [{int(seg['start']//60)}:{int(seg['start']%60):02d}] {seg['text'][:70]}...")
    
    # Create audio clip
    print(f"\n   Creating audio clip...")
    clip_path = clipper.clip_video_audio(video_id, clip_start, clip_end)
    
    if clip_path:
        print(f"   ✓ Audio clip created!")
        print(f"   Path: {clip_path}")
        print(f"   Size: {clip_path.stat().st_size / 1024 / 1024:.2f} MB")
else:
    print("\n✗ Could not find topic boundary")

print("\n" + "="*60)
print("Test completed!")
print("="*60)

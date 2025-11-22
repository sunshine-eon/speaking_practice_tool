# YouTube Transcriber for Shadowing

A Python tool for extracting YouTube video chapters, transcripts, and audio clips for language shadowing practice.

## Features

- Download audio from YouTube videos and playlists
- Extract chapter information automatically
- Generate transcripts using OpenAI Whisper (Faster-Whisper)
- Create audio clips for each chapter
- Search transcripts with timestamps
- Process multiple videos in batch
- Support for multiple Whisper model sizes (tiny, base, small, medium, large)

## Installation

```bash
pip install -r requirements.txt
```

## Project Structure

```
youtube-transcriber-for-shadowing/
├── scripts/
│   ├── main/              # Main workflow scripts
│   │   ├── process_playlist_chapters.py
│   │   ├── transcribe_chapter_clips.py
│   │   ├── collect_chapter_info.py
│   │   └── generate_audio_clips.py
│   └── utils/             # Utility scripts
│       ├── check_transcript_status.py
│       ├── format_existing_transcripts.py
│       ├── batch_transcribe.py
│       ├── compare_transcripts.py
│       └── generate_large_formatted_list.py
├── youtube_transcriber/   # Core library modules
│   ├── config.py
│   ├── transcriber.py
│   ├── playlist_handler.py
│   ├── audio_clipper.py
│   ├── transcript_searcher.py
│   ├── transcript_formatter.py
│   └── transcript_validator.py
└── test_data/            # Data directory
    ├── audio/
    ├── clips/
    ├── metadata/
    ├── transcripts/
    └── transcripts_large/
```

## Usage

### Basic Usage

```python
from youtube_transcriber import Config
from youtube_transcriber.playlist_handler import PlaylistHandler
from youtube_transcriber.transcriber import Transcriber

# Process a YouTube playlist
config = Config(base_dir="./my_videos", whisper_model="small")
handler = PlaylistHandler(config)
transcriber = Transcriber(config)

# Get videos from playlist
playlist_url = "https://www.youtube.com/playlist?list=..."
videos = handler.get_playlist_videos(playlist_url)

# Transcribe a video
video_id = videos[0]['video_id']
result = transcriber.transcribe_video(video_id)
print(result['text'])
```

### Main Workflow Scripts

#### 1. Collect Chapter Information

Collect chapter information for all videos in a playlist:

```bash
python scripts/main/collect_chapter_info.py [playlist_url]
```

#### 2. Generate Audio Clips

Generate audio clips for all chapters or only missing ones:

```bash
# Generate clips for all chapters
python scripts/main/generate_audio_clips.py

# Generate only missing clips
python scripts/main/generate_audio_clips.py --missing-only

# Limit number of videos to process
python scripts/main/generate_audio_clips.py --missing-only --limit 5
```

#### 3. Transcribe Chapter Clips

Transcribe chapter audio clips with various options:

```bash
# Transcribe a specific video (default: small model)
python scripts/main/transcribe_chapter_clips.py VIDEO_ID

# Use large model
python scripts/main/transcribe_chapter_clips.py VIDEO_ID --model large

# Find and transcribe videos with missing transcripts
python scripts/main/transcribe_chapter_clips.py --missing

# Transcribe latest N untranscribed videos
python scripts/main/transcribe_chapter_clips.py --latest 5 --model large

# Limit number of videos (for --missing)
python scripts/main/transcribe_chapter_clips.py --missing --limit 10
```

#### 4. Process Playlist with Chapters

Process entire playlist with chapters (downloads audio, extracts chapters, generates clips, transcribes):

```bash
python scripts/main/process_playlist_chapters.py [playlist_url] [max_videos]
```

### Utility Scripts

#### Check Transcript Status

Check which videos have complete transcripts:

```bash
# Basic status check
python scripts/utils/check_transcript_status.py

# Detailed progress statistics
python scripts/utils/check_transcript_status.py --progress
```

#### Format Transcripts

Format existing transcript files:

```bash
# Format unformatted transcripts
python scripts/utils/format_existing_transcripts.py [transcripts_dir]

# Reformat existing formatted transcripts
python scripts/utils/format_existing_transcripts.py --reformat [transcripts_dir]

# Dry run (see what would be formatted)
python scripts/utils/format_existing_transcripts.py --dry-run
```

#### Batch Transcribe

Batch transcribe videos that don't have transcripts yet:

```bash
python scripts/utils/batch_transcribe.py
```

#### Compare Transcripts

Compare base model transcripts with large model transcripts:

```bash
# Compare all videos
python scripts/utils/compare_transcripts.py --all

# Compare specific video
python scripts/utils/compare_transcripts.py VIDEO_ID

# Compare specific chapter
python scripts/utils/compare_transcripts.py VIDEO_ID --chapter 1

# Auto-fix missing segments
python scripts/utils/compare_transcripts.py VIDEO_ID --fix
```

#### Generate Formatted List

Generate JSON file listing all formatted transcripts:

```bash
python scripts/utils/generate_large_formatted_list.py
```

## Notes

- Uses Faster-Whisper for transcription (default: small model)
- Automatically detects chapters from YouTube videos
- Creates audio clips for each chapter
- Stores transcripts with timestamps
- Supports batch processing
- Large model transcripts are stored in separate `transcripts_large/` directory

## Model Sizes

Available Whisper model sizes (from fastest to most accurate):
- `tiny` - Fastest, least accurate
- `base` - Fast, less accurate
- `small` - Balanced (default)
- `medium` - Slower, more accurate
- `large` - Slowest, most accurate

Choose based on your needs:
- Use `small` for quick transcriptions
- Use `large` for highest accuracy (especially for non-native speakers or unclear audio)

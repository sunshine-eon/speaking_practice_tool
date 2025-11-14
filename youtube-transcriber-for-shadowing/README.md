# YouTube Transcriber for Shadowing

A Python tool for extracting YouTube video chapters, transcripts, and audio clips for language shadowing practice.

## Features

- Download audio from YouTube videos and playlists
- Extract chapter information automatically
- Generate transcripts using OpenAI Whisper
- Create audio clips for each chapter
- Search transcripts with timestamps
- Process multiple videos in batch

## Installation

```bash
pip install -r requirements.txt
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

### Process Playlist with Chapters

```python
from youtube_transcriber import Config
from process_playlist_chapters import process_playlist_chapters

config = Config(base_dir="./test_data", whisper_model="small")
playlist_url = "https://www.youtube.com/playlist?list=..."

# Process all videos in playlist
process_playlist_chapters(playlist_url, config=config, max_videos=10)
```

### Transcribe Chapter Clips

```python
from transcribe_chapter_clips import transcribe_chapter_clips

# Transcribe all chapter clips for a video
video_id = "-LywX3T5Scc"
transcribe_chapter_clips(video_id)
```

## Scripts

- `process_playlist_chapters.py` - Process entire playlist with chapters
- `transcribe_chapter_clips.py` - Transcribe chapter audio clips
- `batch_transcribe.py` - Batch transcription for multiple videos
- `collect_chapter_info.py` - Collect chapter information
- `generate_audio_clips.py` - Generate audio clips from chapters

## Notes

- Uses OpenAI Whisper for transcription (default: small model)
- Automatically detects chapters from YouTube videos
- Creates audio clips for each chapter
- Stores transcripts with timestamps
- Supports batch processing


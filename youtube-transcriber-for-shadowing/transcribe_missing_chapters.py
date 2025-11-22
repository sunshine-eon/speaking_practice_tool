"""Find and transcribe missing chapter transcripts."""

import json
import logging
from pathlib import Path
from youtube_transcriber import Config
from youtube_transcriber.transcriber import Transcriber
from youtube_transcriber.utils import setup_logging
from transcribe_chapter_clips import transcribe_chapter_clips

# Setup logging
setup_logging(logging.INFO)

def find_videos_with_missing_transcripts(config: Config):
    """
    Find all videos that have metadata.json but are missing transcript files.
    
    Returns:
        List of dicts with video_id, title, missing_chapters info
    """
    transcripts_dir = config.transcripts_dir
    metadata_files = list(transcripts_dir.glob('*_metadata.json'))
    
    missing_transcripts = []
    
    for metadata_file in metadata_files:
        video_id = metadata_file.stem.replace('_metadata', '')
        
        if video_id == 'playlist':
            continue
        
        try:
            with open(metadata_file, 'r', encoding='utf-8') as f:
                metadata = json.load(f)
            
            chapters = metadata.get('chapters', [])
            if not chapters:
                continue
                
            missing_chapters = []
            
            for chapter_idx, chapter in enumerate(chapters, 1):
                chapter_title = chapter.get('title', f'Chapter {chapter_idx}')
                safe_title = ''.join(c for c in chapter_title if c.isalnum() or c in (' ', '-', '_')).strip()
                safe_title = safe_title.replace(' ', '_')[:50]
                transcript_file = transcripts_dir / f'{video_id}_chapter{chapter_idx}_{safe_title}.txt'
                
                if not transcript_file.exists():
                    missing_chapters.append(chapter_idx)
            
            if missing_chapters:
                missing_transcripts.append({
                    'video_id': video_id,
                    'title': metadata.get('title', 'Unknown'),
                    'missing_chapters': missing_chapters,
                    'total_chapters': len(chapters)
                })
        except Exception as e:
            logging.error(f'Error processing {metadata_file}: {e}')
    
    return missing_transcripts


def transcribe_missing_chapters(config: Config = None, limit: int = None):
    """
    Find and transcribe all missing chapter transcripts.
    
    Args:
        config: Configuration object (defaults to ./test_data with small model)
        limit: Maximum number of videos to process (None for all)
    """
    if config is None:
        config = Config(base_dir="./test_data", whisper_model="small")
    
    # Find videos with missing transcripts
    print("="*60)
    print("Finding videos with missing transcripts...")
    print("="*60)
    print()
    
    missing_videos = find_videos_with_missing_transcripts(config)
    
    print(f"Found {len(missing_videos)} videos with missing transcripts")
    print()
    
    if limit:
        missing_videos = missing_videos[:limit]
        print(f"Processing first {limit} videos...")
        print()
    
    # Process each video
    for idx, video_info in enumerate(missing_videos, 1):
        video_id = video_info['video_id']
        title = video_info['title']
        missing_count = len(video_info['missing_chapters'])
        total_count = video_info['total_chapters']
        
        print("="*60)
        print(f"[{idx}/{len(missing_videos)}] Processing: {video_id}")
        print(f"Title: {title[:80]}...")
        print(f"Missing: {missing_count}/{total_count} chapters")
        print("="*60)
        print()
        
        try:
            transcribe_chapter_clips(video_id, config)
        except Exception as e:
            logging.error(f"Error transcribing {video_id}: {e}", exc_info=True)
            print(f"✗ Error processing {video_id}: {e}")
            print()
    
    print("="*60)
    print("All transcriptions complete!")
    print("="*60)


if __name__ == "__main__":
    import sys
    
    limit = None
    if len(sys.argv) > 1:
        try:
            limit = int(sys.argv[1])
        except ValueError:
            print(f"Invalid limit: {sys.argv[1]}. Using None (process all).")
    
    transcribe_missing_chapters(limit=limit)


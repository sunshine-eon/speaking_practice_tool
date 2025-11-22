"""Check transcription progress for missing chapters."""

import json
from pathlib import Path
from youtube_transcriber import Config

def check_progress(config: Config = None):
    """Check how many videos still need transcription."""
    if config is None:
        config = Config(base_dir="./test_data", whisper_model="small")
    
    transcripts_dir = config.transcripts_dir
    metadata_files = list(transcripts_dir.glob('*_metadata.json'))
    
    missing_transcripts = []
    completed_videos = []
    partial_videos = []
    
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
            completed_chapters = []
            
            for chapter_idx, chapter in enumerate(chapters, 1):
                chapter_title = chapter.get('title', f'Chapter {chapter_idx}')
                safe_title = ''.join(c for c in chapter_title if c.isalnum() or c in (' ', '-', '_')).strip()
                safe_title = safe_title.replace(' ', '_')[:50]
                transcript_file = transcripts_dir / f'{video_id}_chapter{chapter_idx}_{safe_title}.txt'
                
                if not transcript_file.exists():
                    missing_chapters.append(chapter_idx)
                else:
                    completed_chapters.append(chapter_idx)
            
            if not missing_chapters:
                completed_videos.append({
                    'video_id': video_id,
                    'title': metadata.get('title', 'Unknown'),
                    'total_chapters': len(chapters)
                })
            elif completed_chapters:
                # Partially completed
                partial_videos.append({
                    'video_id': video_id,
                    'title': metadata.get('title', 'Unknown'),
                    'completed_chapters': len(completed_chapters),
                    'missing_chapters': len(missing_chapters),
                    'total_chapters': len(chapters)
                })
                missing_transcripts.append({
                    'video_id': video_id,
                    'title': metadata.get('title', 'Unknown'),
                    'missing_chapters': missing_chapters,
                    'total_chapters': len(chapters)
                })
            else:
                missing_transcripts.append({
                    'video_id': video_id,
                    'title': metadata.get('title', 'Unknown'),
                    'missing_chapters': missing_chapters,
                    'total_chapters': len(chapters)
                })
        except Exception as e:
            print(f'Error processing {metadata_file}: {e}')
    
    total_videos = len([f for f in metadata_files if f.stem.replace('_metadata', '') != 'playlist'])
    completed_count = len(completed_videos)
    remaining_count = len(missing_transcripts)
    
    print("="*60)
    print("Transcription Progress")
    print("="*60)
    print(f"Total videos: {total_videos}")
    print(f"Completed: {completed_count} ({completed_count/total_videos*100:.1f}%)")
    print(f"Partially completed: {len(partial_videos)}")
    print(f"Remaining: {remaining_count} ({remaining_count/total_videos*100:.1f}%)")
    print()
    
    if partial_videos:
        print(f"Partially completed videos ({len(partial_videos)}):")
        for video in sorted(partial_videos, key=lambda x: x['completed_chapters'], reverse=True)[:10]:
            print(f"  - {video['video_id']}: {video['completed_chapters']}/{video['total_chapters']} chapters completed")
        if len(partial_videos) > 10:
            print(f"  ... and {len(partial_videos) - 10} more")
        print()
    
    if completed_videos:
        print(f"Completed videos ({len(completed_videos)}):")
        for video in completed_videos[:10]:
            print(f"  - {video['video_id']}: {video['total_chapters']} chapters")
        if len(completed_videos) > 10:
            print(f"  ... and {len(completed_videos) - 10} more")
        print()
    
    if missing_transcripts:
        total_missing_chapters = sum(len(v['missing_chapters']) for v in missing_transcripts)
        print(f"Total missing chapters: {total_missing_chapters}")
        print()
        print("Next 10 videos to process:")
        for idx, video in enumerate(missing_transcripts[:10], 1):
            completed = video['total_chapters'] - len(video['missing_chapters'])
            if completed > 0:
                print(f"{idx}. {video['video_id']}: {completed}/{video['total_chapters']} completed, {len(video['missing_chapters'])} missing")
            else:
                print(f"{idx}. {video['video_id']}: {len(video['missing_chapters'])}/{video['total_chapters']} chapters missing")
    
    print("="*60)


if __name__ == "__main__":
    check_progress()


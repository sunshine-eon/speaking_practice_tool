"""Check transcript completion status for all videos."""

import json
from pathlib import Path
from youtube_transcriber import Config

def check_transcript_status(config: Config):
    """
    Check which videos have complete transcripts and which are incomplete.
    
    Returns:
        dict with 'complete', 'in_progress', 'not_started' lists
    """
    transcripts_dir = config.transcripts_dir
    
    # Find all metadata files
    metadata_files = list(transcripts_dir.glob("*_metadata.json"))
    
    complete_videos = []
    in_progress_videos = []
    not_started_count = 0
    
    for metadata_file in metadata_files:
        video_id = metadata_file.stem.replace("_metadata", "")
        
        try:
            with open(metadata_file, 'r', encoding='utf-8') as f:
                metadata = json.load(f)
            
            chapters = metadata.get('chapters', [])
            total_chapters = len(chapters)
            
            if total_chapters == 0:
                continue
            
            # Count existing transcript files
            transcript_files = list(transcripts_dir.glob(f"{video_id}_chapter*.txt"))
            transcript_count = len(transcript_files)
            
            if transcript_count == 0:
                not_started_count += 1
            elif transcript_count < total_chapters:
                in_progress_videos.append({
                    'video_id': video_id,
                    'title': metadata.get('title', 'Unknown'),
                    'total_chapters': total_chapters,
                    'transcripts': transcript_count,
                    'missing': total_chapters - transcript_count
                })
            else:
                complete_videos.append({
                    'video_id': video_id,
                    'title': metadata.get('title', 'Unknown'),
                    'total_chapters': total_chapters,
                    'transcripts': transcript_count
                })
                
        except Exception as e:
            print(f"⚠ Error reading {metadata_file}: {e}")
            continue
    
    return {
        'complete': complete_videos,
        'in_progress': in_progress_videos,
        'not_started': not_started_count
    }


if __name__ == "__main__":
    config = Config(base_dir="./test_data", whisper_model="small")
    
    print("="*60)
    print("Checking Transcript Status")
    print("="*60)
    print()
    
    status = check_transcript_status(config)
    
    print(f"✓ Complete: {len(status['complete'])}")
    print(f"🔄 In Progress: {len(status['in_progress'])}")
    print(f"⏸ Not Started: {status['not_started']}")
    print()
    
    if status['in_progress']:
        print("="*60)
        print("Videos In Progress:")
        print("="*60)
        for video in sorted(status['in_progress'], key=lambda x: x['video_id']):
            print(f"\n{video['video_id']}: {video['title'][:60]}")
            print(f"  Chapters: {video['transcripts']}/{video['total_chapters']} (missing {video['missing']})")
    
    # Show most recently worked on videos
    if status['in_progress']:
        print("\n" + "="*60)
        print("Recently Worked On (check first):")
        print("="*60)
        # Sort by video_id (assuming newer videos might have been worked on more recently)
        recent = sorted(status['in_progress'], key=lambda x: x['video_id'], reverse=True)[:10]
        for video in recent:
            print(f"  {video['video_id']}: {video['transcripts']}/{video['total_chapters']} chapters done")
            print(f"    Missing: {video['missing']} chapters")


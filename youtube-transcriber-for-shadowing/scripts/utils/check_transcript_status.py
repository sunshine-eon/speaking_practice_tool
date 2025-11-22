"""Check transcript completion status for all videos."""

import argparse
import json
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from youtube_transcriber import Config


def check_transcript_status(config: Config):
    """
    Check which videos have complete transcripts and which are incomplete.
    
    Returns:
        dict with 'complete', 'in_progress', 'not_started' lists
    """
    transcripts_dir = config.transcripts_dir
    
    # Find all metadata files
    metadata_files = list(config.metadata_dir.glob("*_metadata.json"))
    
    complete_videos = []
    in_progress_videos = []
    not_started_count = 0
    
    for metadata_file in metadata_files:
        video_id = metadata_file.stem.replace("_metadata", "")
        
        if video_id == 'playlist':
            continue
        
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
        'not_started': not_started_count,
        'total_videos': len(complete_videos) + len(in_progress_videos) + not_started_count
    }


def check_progress(config: Config):
    """Check transcription progress with detailed statistics."""
    status = check_transcript_status(config)
    
    total_videos = status['total_videos']
    completed_count = len(status['complete'])
    partial_count = len(status['in_progress'])
    remaining_count = status['not_started'] + partial_count
    
    # Calculate missing chapters
    total_missing_chapters = 0
    partial_videos = []
    missing_transcripts = []
    
    for video in status['in_progress']:
        total_missing_chapters += video['missing']
        partial_videos.append({
            'video_id': video['video_id'],
            'title': video['title'],
            'completed_chapters': video['transcripts'],
            'missing_chapters': video['missing'],
            'total_chapters': video['total_chapters']
        })
        missing_transcripts.append({
            'video_id': video['video_id'],
            'title': video['title'],
            'missing_chapters': list(range(1, video['total_chapters'] + 1))[:video['missing']],
            'total_chapters': video['total_chapters']
        })
    
    # Add not started videos to missing_transcripts
    transcripts_dir = config.transcripts_dir
    metadata_files = list(config.metadata_dir.glob('*_metadata.json'))
    
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
            
            transcript_files = list(transcripts_dir.glob(f"{video_id}_chapter*.txt"))
            if len(transcript_files) == 0:
                missing_chapters = list(range(1, len(chapters) + 1))
                missing_transcripts.append({
                    'video_id': video_id,
                    'title': metadata.get('title', 'Unknown'),
                    'missing_chapters': missing_chapters,
                    'total_chapters': len(chapters)
                })
        except Exception:
            continue
    
    print("="*60)
    print("Transcription Progress")
    print("="*60)
    print(f"Total videos: {total_videos}")
    if total_videos > 0:
        print(f"Completed: {completed_count} ({completed_count/total_videos*100:.1f}%)")
        print(f"Partially completed: {partial_count}")
        print(f"Remaining: {remaining_count} ({remaining_count/total_videos*100:.1f}%)")
    print()
    
    if partial_videos:
        print(f"Partially completed videos ({len(partial_videos)}):")
        for video in sorted(partial_videos, key=lambda x: x['completed_chapters'], reverse=True)[:10]:
            print(f"  - {video['video_id']}: {video['completed_chapters']}/{video['total_chapters']} chapters completed")
        if len(partial_videos) > 10:
            print(f"  ... and {len(partial_videos) - 10} more")
        print()
    
    if status['complete']:
        print(f"Completed videos ({len(status['complete'])}):")
        for video in status['complete'][:10]:
            print(f"  - {video['video_id']}: {video['total_chapters']} chapters")
        if len(status['complete']) > 10:
            print(f"  ... and {len(status['complete']) - 10} more")
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
    parser = argparse.ArgumentParser(
        description='Check transcript completion status for all videos.'
    )
    parser.add_argument('--progress', '-p', action='store_true',
                       help='Show detailed progress statistics')
    parser.add_argument('--base-dir', type=str, default='./test_data',
                       help='Base directory for data (default: ./test_data)')
    parser.add_argument('--transcripts-dir', type=str, default=None,
                       help='Transcripts directory (default: base_dir/transcripts)')
    
    args = parser.parse_args()
    
    base_dir = Path(args.base_dir)
    if args.transcripts_dir:
        transcripts_dir = Path(args.transcripts_dir)
    else:
        transcripts_dir = base_dir / "transcripts"
    
    config = Config(base_dir=str(base_dir), whisper_model="small")
    config.transcripts_dir = transcripts_dir
    
    if args.progress:
        check_progress(config)
    else:
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

#!/usr/bin/env python3
"""
Generate a JSON file listing all videos/chapters that have been formatted using the Large model.
This script scans transcripts_large folder for _formatted.txt files and creates a structured JSON.
"""

import json
import os
from pathlib import Path
from typing import Dict, List, Any

def get_safe_title(title: str) -> str:
    """Convert chapter title to safe filename format."""
    safe = "".join(c for c in title if c.isalnum() or c in (' ', '-', '_')).strip()
    return safe.replace(' ', '_')[:50]

def generate_large_formatted_list() -> Dict[str, Any]:
    """
    Generate a JSON structure listing all formatted transcripts from transcripts_large folder.
    
    Returns:
        Dictionary with structure:
        {
            'videos': [
                {
                    'video_id': str,
                    'video_title': str,
                    'chapters': [
                        {
                            'chapter_index': int,
                            'title': str,
                            'transcript_path': str (relative path to formatted file),
                            'audio_filename': str (expected audio clip filename)
                        },
                        ...
                    ]
                },
                ...
            ]
        }
    """
    transcripts_large_dir = Path('test_data/transcripts_large')
    transcripts_dir = Path('test_data/transcripts')
    clips_dir = Path('test_data/clips')
    metadata_dir = Path('test_data/metadata')
    
    if not transcripts_large_dir.exists():
        print(f"Error: {transcripts_large_dir} does not exist")
        return {'videos': []}
    
    # Load playlist metadata to get video order and titles
    playlist_metadata_path = metadata_dir / 'playlist_metadata.json'
    video_metadata_map = {}
    playlist_video_order = []
    
    if playlist_metadata_path.exists():
        try:
            with open(playlist_metadata_path, 'r', encoding='utf-8') as f:
                playlist_data = json.load(f)
            # Extract video IDs in order
            playlist_video_order = [v.get('video_id', '') for v in playlist_data.get('videos', [])]
            # Build map of video_id -> video_title
            for video in playlist_data.get('videos', []):
                video_id = video.get('video_id', '')
                if video_id:
                    video_metadata_map[video_id] = {
                        'title': video.get('title', 'Unknown'),
                        'chapters': video.get('chapters', [])
                    }
        except (json.JSONDecodeError, IOError, KeyError) as e:
            print(f"Warning: Could not load playlist_metadata.json: {e}")
    
    # Also load individual metadata files as fallback
    metadata_files = list(metadata_dir.glob('*_metadata.json'))
    metadata_files = [f for f in metadata_files if f.name != 'playlist_metadata.json']
    
    for metadata_file in metadata_files:
        try:
            with open(metadata_file, 'r', encoding='utf-8') as f:
                video_metadata = json.load(f)
            video_id = video_metadata.get('video_id', '')
            if video_id and video_id not in video_metadata_map:
                video_metadata_map[video_id] = {
                    'title': video_metadata.get('title', 'Unknown'),
                    'chapters': video_metadata.get('chapters', [])
                }
        except (json.JSONDecodeError, IOError, KeyError):
            continue
    
    # Find all formatted transcript files in transcripts_large
    formatted_files = list(transcripts_large_dir.glob('*_formatted.txt'))
    
    # Build structure: video_id -> list of chapters
    videos_dict = {}
    
    for formatted_file in formatted_files:
        filename = formatted_file.name
        
        # Parse filename: {video_id}_chapter{chapter_index}_{safe_title}_formatted.txt
        if not filename.endswith('_formatted.txt'):
            continue
        
        base_name = filename[:-len('_formatted.txt')]
        
        # Extract video_id and chapter_index
        # Format: {video_id}_chapter{chapter_index}_{safe_title}
        if '_chapter' not in base_name:
            continue
        
        parts = base_name.split('_chapter', 1)
        if len(parts) != 2:
            continue
        
        video_id = parts[0]
        rest = parts[1]
        
        # Extract chapter_index (number before next underscore)
        chapter_index_str = ''
        chapter_index = None
        for i, char in enumerate(rest):
            if char.isdigit():
                chapter_index_str += char
            elif char == '_' and chapter_index_str:
                try:
                    chapter_index = int(chapter_index_str)
                    break
                except ValueError:
                    break
            elif not chapter_index_str:
                break
        
        if chapter_index is None:
            print(f"Warning: Could not parse chapter_index from {filename}")
            continue
        
        # Get video metadata
        video_info = video_metadata_map.get(video_id, {})
        video_title = video_info.get('title', 'Unknown')
        chapters = video_info.get('chapters', [])
        
        # Find chapter info from metadata
        chapter_info = None
        for ch in chapters:
            if ch.get('chapter_index') == chapter_index:
                chapter_info = ch
                break
        
        if not chapter_info:
            # Try to extract title from filename
            title_part = rest[len(chapter_index_str):].lstrip('_')
            # Remove trailing underscores and replace with spaces
            chapter_title = title_part.replace('_', ' ').strip()
        else:
            chapter_title = chapter_info.get('title', '')
            start_time = int(chapter_info.get('start_time', 0))
            end_time = int(chapter_info.get('end_time', 0))
        
        # Get audio filename if we have chapter info
        audio_filename = None
        if chapter_info:
            start_time = int(chapter_info.get('start_time', 0))
            end_time = int(chapter_info.get('end_time', 0))
            audio_filename = f"{video_id}_{start_time}_{end_time}.mp3"
            # Check if audio file exists
            if clips_dir.exists() and audio_filename:
                audio_path = clips_dir / audio_filename
                if not audio_path.exists():
                    audio_filename = None  # Don't include if audio doesn't exist
        
        # Initialize video entry if not exists
        if video_id not in videos_dict:
            videos_dict[video_id] = {
                'video_id': video_id,
                'video_title': video_title,
                'chapters': []
            }
        
        # Add chapter entry
        # Use relative path from workspace root (youtube-transcriber-for-shadowing)
        try:
            workspace_root = Path(__file__).parent
            transcript_path = formatted_file.relative_to(workspace_root)
        except ValueError:
            # If relative path fails, use absolute path
            transcript_path = formatted_file
        
        chapter_entry = {
            'chapter_index': chapter_index,
            'title': chapter_title,
            'transcript_path': str(transcript_path),
        }
        
        if chapter_info:
            chapter_entry['start_time'] = start_time
            chapter_entry['end_time'] = end_time
        
        if audio_filename:
            chapter_entry['audio_filename'] = audio_filename
        
        videos_dict[video_id]['chapters'].append(chapter_entry)
    
    # Sort chapters by chapter_index for each video
    for video_id in videos_dict:
        videos_dict[video_id]['chapters'].sort(key=lambda x: x.get('chapter_index', 0))
    
    # Build result in playlist order if available
    result = {'videos': []}
    
    if playlist_video_order:
        # Add videos in playlist order
        for video_id in playlist_video_order:
            if video_id in videos_dict:
                result['videos'].append(videos_dict[video_id])
        # Add any videos not in playlist
        for video_id, video_data in videos_dict.items():
            if video_id not in playlist_video_order:
                result['videos'].append(video_data)
    else:
        # Fall back to alphabetical order
        for video_id in sorted(videos_dict.keys()):
            result['videos'].append(videos_dict[video_id])
    
    return result

def main():
    """Main function to generate and save the JSON file."""
    print("Generating large formatted transcript list...")
    
    result = generate_large_formatted_list()
    
    # Save to JSON file
    output_path = Path('test_data/transcripts_large/formatted_chapters_list.json')
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    
    total_videos = len(result['videos'])
    total_chapters = sum(len(v['chapters']) for v in result['videos'])
    
    print(f"✓ Generated {output_path}")
    print(f"  - {total_videos} videos")
    print(f"  - {total_chapters} chapters with formatted transcripts")

if __name__ == '__main__':
    main()


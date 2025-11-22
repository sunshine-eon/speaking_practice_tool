"""Compare base model transcripts with large model transcripts to detect missing segments."""

import re
import argparse
import logging
from pathlib import Path
from typing import List, Tuple, Dict, Optional
from dataclasses import dataclass

# Import transcriber and clipper modules
try:
    from youtube_transcriber import Config
    from youtube_transcriber.transcriber import Transcriber
    from youtube_transcriber.audio_clipper import AudioClipper
except ImportError:
    # If running from parent directory
    import sys
    sys.path.insert(0, str(Path(__file__).parent))
    from youtube_transcriber import Config
    from youtube_transcriber.transcriber import Transcriber
    from youtube_transcriber.audio_clipper import AudioClipper

logger = logging.getLogger(__name__)


@dataclass
class Segment:
    """Represents a transcript segment with timestamp."""
    start_seconds: float
    end_seconds: float
    text: str
    timestamp_str: str  # Original [MM:SS] format


@dataclass
class MissingSegment:
    """Represents a missing segment in large model compared to base model."""
    start_seconds: float
    end_seconds: float
    duration: float
    base_text: str
    context_before: Optional[str] = None
    context_after: Optional[str] = None


def parse_transcript_file(filepath: Path) -> List[Segment]:
    """
    Parse transcript file and extract segments with timestamps.
    
    Args:
        filepath: Path to transcript file
        
    Returns:
        List of segments with start/end times and text
    """
    segments = []
    
    if not filepath.exists():
        return segments
    
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # Skip header lines (Chapter, Video, Time, separator, empty lines)
    in_header = True
    transcript_lines = []
    
    for line in lines:
        line = line.rstrip('\n')
        
        if in_header:
            # Check if this is a header line
            if (line.startswith('Chapter') or 
                line.startswith('Video') or 
                line.startswith('Time') or 
                line.startswith('Model') or
                line.strip().startswith('=') or 
                line.strip() == ''):
                continue
            # First non-header line found
            in_header = False
        
        if not in_header:
            transcript_lines.append(line)
    
    # Parse segments from transcript lines
    timestamp_pattern = re.compile(r'\[(\d{2}):(\d{2})\]')
    
    for i, line in enumerate(transcript_lines):
        # Find timestamp at the start of the line
        match = timestamp_pattern.match(line)
        if match:
            minutes = int(match.group(1))
            seconds = int(match.group(2))
            start_seconds = minutes * 60 + seconds
            
            # Extract text (everything after the timestamp)
            text = line[match.end():].strip()
            
            # Estimate end time from next segment's start time
            # But cap it at a reasonable duration (max 8 seconds per segment)
            # If there's a large gap (>15 seconds), don't span it
            end_seconds = start_seconds + 5  # Default estimate
            if i + 1 < len(transcript_lines):
                next_match = timestamp_pattern.match(transcript_lines[i + 1])
                if next_match:
                    next_minutes = int(next_match.group(1))
                    next_seconds = int(next_match.group(2))
                    next_start = next_minutes * 60 + next_seconds
                    gap = next_start - start_seconds
                    # If gap is reasonable (<15s), use next segment's start
                    # Otherwise, estimate based on text length (max 8 seconds)
                    if gap < 15:
                        end_seconds = min(next_start, start_seconds + 8)
                    else:
                        # Large gap - estimate from text length only
                        word_count = len(text.split())
                        estimated_duration = word_count / 2.5
                        end_seconds = min(start_seconds + estimated_duration, start_seconds + 8)
            else:
                # Last segment - estimate based on text length
                # Rough estimate: ~150 words per minute = 2.5 words per second
                word_count = len(text.split())
                estimated_duration = word_count / 2.5
                end_seconds = min(start_seconds + estimated_duration, start_seconds + 10)
            
            segments.append(Segment(
                start_seconds=start_seconds,
                end_seconds=end_seconds,
                text=text,
                timestamp_str=f"[{match.group(1)}:{match.group(2)}]"
            ))
    
    return segments


def segments_overlap(seg1_start: float, seg1_end: float, 
                     seg2_start: float, seg2_end: float,
                     tolerance: float = 2.0) -> bool:
    """
    Check if two time segments overlap (with tolerance for timestamp differences).
    
    Args:
        seg1_start, seg1_end: First segment time range
        seg2_start, seg2_end: Second segment time range
        tolerance: Time tolerance in seconds for considering segments overlapping
        
    Returns:
        True if segments overlap
    """
    # Check if segments overlap (with tolerance)
    return not (seg1_end + tolerance < seg2_start or seg2_end + tolerance < seg1_start)


def find_missing_segments(base_segments: List[Segment], 
                          large_segments: List[Segment],
                          min_gap_seconds: float = 5.0) -> List[MissingSegment]:
    """
    Compare segments and find gaps where base has content but large doesn't.
    Uses text content matching rather than relying solely on timestamps.
    
    Args:
        base_segments: Segments from base model transcript
        large_segments: Segments from large model transcript
        min_gap_seconds: Minimum gap duration to report (default 5 seconds)
        
    Returns:
        List of missing segments with context
    """
    if not base_segments:
        return []
    
    # Build a combined text from all large segments for efficient searching
    # Also keep track of which segments contain which text
    large_text_combined = " ".join([seg.text.lower() for seg in large_segments])
    
    # Find gaps in base segments that aren't covered by large
    missing_segments = []
    
    for i, base_seg in enumerate(base_segments):
        base_text_lower = base_seg.text.lower().strip()
        
        # Skip very short segments (likely just punctuation or filler)
        if len(base_text_lower) < 10:
            continue
        
        # Check if base text is found in any large segment
        base_covered = False
        
        # Method 1: Check if base text is a substring of any large segment
        for large_seg in large_segments:
            large_text_lower = large_seg.text.lower()
            
            # Check if base text is contained in large text (allowing for minor differences)
            if base_text_lower in large_text_lower:
                base_covered = True
                break
            
            # Check reverse: if large text contains significant portion of base text
            # Extract meaningful words from base text (remove very short words)
            base_words = [w for w in base_text_lower.split() if len(w) > 3]
            if len(base_words) > 0:
                # Check if at least 70% of meaningful words from base are in large segment
                words_found = sum(1 for word in base_words if word in large_text_lower)
                if words_found / len(base_words) >= 0.7:
                    base_covered = True
                    break
        
        # Method 2: If not found as substring, check word-level similarity
        if not base_covered:
            base_words_set = set([w for w in base_text_lower.split() if len(w) > 2])
            if len(base_words_set) > 0:
                for large_seg in large_segments:
                    large_words_set = set([w for w in large_seg.text.lower().split() if len(w) > 2])
                    # Check if significant portion of base words are in large segment
                    common_words = base_words_set & large_words_set
                    if len(common_words) / len(base_words_set) >= 0.8:  # 80% word overlap
                        base_covered = True
                        break
        
        # Method 3: Check if base text appears in combined large text (for cases where
        # it's split across multiple segments)
        if not base_covered:
            # Extract key phrases (3-5 word sequences) from base text
            base_words_list = base_text_lower.split()
            if len(base_words_list) >= 3:
                # Check if any 3-word phrase from base appears in combined large text
                for j in range(len(base_words_list) - 2):
                    phrase = " ".join(base_words_list[j:j+3])
                    if phrase in large_text_combined:
                        base_covered = True
                        break
        
        if not base_covered:
            # This segment is truly missing in large model
            # Get context
            context_before = None
            context_after = None
            
            if i > 0:
                context_before = base_segments[i - 1].text[:100]
            if i < len(base_segments) - 1:
                context_after = base_segments[i + 1].text[:100]
            
            gap_duration = base_seg.end_seconds - base_seg.start_seconds
            
            missing_segments.append(MissingSegment(
                start_seconds=base_seg.start_seconds,
                end_seconds=base_seg.end_seconds,
                duration=gap_duration,
                base_text=base_seg.text,
                context_before=context_before,
                context_after=context_after
            ))
    
    # Merge adjacent missing segments first
    if len(missing_segments) > 1:
        merged = []
        current = missing_segments[0]
        
        for next_seg in missing_segments[1:]:
            # If segments are adjacent or overlapping, merge them
            if next_seg.start_seconds <= current.end_seconds + 2:
                current.end_seconds = max(current.end_seconds, next_seg.end_seconds)
                current.duration = current.end_seconds - current.start_seconds
                current.base_text += " " + next_seg.base_text
                current.context_after = next_seg.context_after
            else:
                merged.append(current)
                current = next_seg
        
        merged.append(current)
        missing_segments = merged
    
    # Filter by minimum gap duration after merging
    filtered_segments = [
        seg for seg in missing_segments 
        if seg.duration >= min_gap_seconds
    ]
    
    return filtered_segments


def get_file_time_range(filepath: Path) -> Tuple[float, float]:
    """
    Extract time range from transcript file header.
    
    Args:
        filepath: Path to transcript file
        
    Returns:
        Tuple of (start_time, end_time) in seconds, or (0, 0) if not found
    """
    if not filepath.exists():
        return (0, 0)
    
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()[:10]
    
    time_pattern = re.compile(r'Time:\s*(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})')
    for line in lines:
        match = time_pattern.search(line)
        if match:
            start_min = int(match.group(1))
            start_sec = int(match.group(2))
            end_min = int(match.group(3))
            end_sec = int(match.group(4))
            start_time = start_min * 60 + start_sec
            end_time = end_min * 60 + end_sec
            return (start_time, end_time)
    
    return (0, 0)


def find_matching_files(video_id: str, chapter_num: int, 
                       base_dir: Path, large_dir: Path) -> Tuple[Optional[Path], Optional[Path]]:
    """
    Find matching transcript files for a chapter in both directories.
    Matches by chapter number first, but if time ranges don't match, tries to match by time range.
    
    Args:
        video_id: Video ID
        chapter_num: Chapter number
        base_dir: Base model transcripts directory
        large_dir: Large model transcripts directory
        
    Returns:
        Tuple of (base_file_path, large_file_path) or (None, None) if not found
    """
    # Pattern for base model: {video_id}_chapter{num}_{title}.txt
    base_pattern = f"{video_id}_chapter{chapter_num}_*.txt"
    base_files = list(base_dir.glob(base_pattern))
    # Filter out _formatted.txt files
    base_files = [f for f in base_files if not f.name.endswith('_formatted.txt')]
    
    if not base_files:
        return None, None
    
    base_file = base_files[0]
    base_start, base_end = get_file_time_range(base_file)
    
    # Try to find matching large file by chapter number first
    large_pattern = f"{video_id}_chapter{chapter_num}_*.txt"
    large_files = list(large_dir.glob(large_pattern))
    large_files = [f for f in large_files if not f.name.endswith('_formatted.txt')]
    
    if large_files:
        large_file = large_files[0]
        large_start, large_end = get_file_time_range(large_file)
        
        # Check if time ranges match (within 5 seconds tolerance)
        if abs(base_start - large_start) < 5 and abs(base_end - large_end) < 5:
            return base_file, large_file
        else:
            # Time ranges don't match - search by time range instead
            print(f"  ⚠ Warning: Chapter {chapter_num} time mismatch!")
            print(f"     Base: {base_start//60:.0f}:{base_start%60:02.0f} - {base_end//60:.0f}:{base_end%60:02.0f}")
            print(f"     Large: {large_start//60:.0f}:{large_start%60:02.0f} - {large_end//60:.0f}:{large_end%60:02.0f}")
            print(f"     Searching by time range instead...")
    
    # Search all large files for matching time range
    all_large_files = list(large_dir.glob(f"{video_id}_chapter*.txt"))
    all_large_files = [f for f in all_large_files if not f.name.endswith('_formatted.txt')]
    
    for large_file in all_large_files:
        large_start, large_end = get_file_time_range(large_file)
        if abs(base_start - large_start) < 5 and abs(base_end - large_end) < 5:
            return base_file, large_file
    
    # If no match found, return the chapter number match anyway (might be wrong but better than nothing)
    if large_files:
        return base_file, large_files[0]
    
    return base_file, None


def compare_chapter_transcripts(video_id: str, chapter_num: int,
                                base_dir: Path, large_dir: Path,
                                min_gap_seconds: float = 5.0) -> Dict:
    """
    Compare a single chapter between base and large models.
    
    Args:
        video_id: Video ID
        chapter_num: Chapter number
        base_dir: Base model transcripts directory
        large_dir: Large model transcripts directory
        min_gap_seconds: Minimum gap duration to report
        
    Returns:
        Dictionary with comparison results
    """
    base_file, large_file = find_matching_files(video_id, chapter_num, base_dir, large_dir)
    
    if not base_file:
        return {
            'video_id': video_id,
            'chapter_num': chapter_num,
            'error': f'Base model transcript not found for chapter {chapter_num}',
            'missing_segments': []
        }
    
    if not large_file:
        return {
            'video_id': video_id,
            'chapter_num': chapter_num,
            'error': f'Large model transcript not found for chapter {chapter_num}',
            'missing_segments': []
        }
    
    # Parse both files
    base_segments = parse_transcript_file(base_file)
    large_segments = parse_transcript_file(large_file)
    
    if not base_segments:
        return {
            'video_id': video_id,
            'chapter_num': chapter_num,
            'error': f'Failed to parse base model transcript: {base_file.name}',
            'missing_segments': []
        }
    
    if not large_segments:
        return {
            'video_id': video_id,
            'chapter_num': chapter_num,
            'error': f'Failed to parse large model transcript: {large_file.name}',
            'missing_segments': []
        }
    
    # Find missing segments
    missing_segments = find_missing_segments(base_segments, large_segments, min_gap_seconds)
    
    return {
        'video_id': video_id,
        'chapter_num': chapter_num,
        'base_file': str(base_file.name),
        'large_file': str(large_file.name),
        'base_segments_count': len(base_segments),
        'large_segments_count': len(large_segments),
        'missing_segments': missing_segments,
        'total_missing_duration': sum(seg.duration for seg in missing_segments),
        'error': None
    }


def format_time(seconds: float) -> str:
    """Format seconds as MM:SS."""
    minutes = int(seconds // 60)
    secs = int(seconds % 60)
    return f"{minutes:02d}:{secs:02d}"


def print_comparison_summary(results: List[Dict]):
    """Print summary of comparison results to console."""
    print("=" * 80)
    print("TRANSCRIPT COMPARISON SUMMARY")
    print("=" * 80)
    print()
    
    total_missing_duration = 0
    chapters_with_gaps = 0
    
    for result in results:
        if result.get('error'):
            print(f"⚠️  {result['video_id']} Chapter {result['chapter_num']}: {result['error']}")
            continue
        
        missing_segments = result.get('missing_segments', [])
        if missing_segments:
            chapters_with_gaps += 1
            total_missing_duration += result.get('total_missing_duration', 0)
            
            print(f"❌ {result['video_id']} Chapter {result['chapter_num']}: "
                  f"{len(missing_segments)} gap(s) found")
            
            for seg in missing_segments:
                print(f"   Gap: {format_time(seg.start_seconds)} - {format_time(seg.end_seconds)} "
                      f"({seg.duration:.1f}s)")
                print(f"   Missing text: {seg.base_text[:150]}...")
                if seg.context_before:
                    print(f"   Before: ...{seg.context_before[-50:]}")
                if seg.context_after:
                    print(f"   After: {seg.context_after[:50]}...")
                print()
        else:
            print(f"✓ {result['video_id']} Chapter {result['chapter_num']}: No gaps found")
    
    print()
    print("=" * 80)
    print(f"Total chapters with gaps: {chapters_with_gaps}")
    print(f"Total missing duration: {format_time(total_missing_duration)} ({total_missing_duration:.1f}s)")
    print("=" * 80)


def write_detailed_report(results: List[Dict], output_file: Path):
    """Write detailed comparison report to file."""
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("=" * 80 + "\n")
        f.write("DETAILED TRANSCRIPT COMPARISON REPORT\n")
        f.write("=" * 80 + "\n\n")
        
        for result in results:
            f.write(f"Video ID: {result['video_id']}\n")
            f.write(f"Chapter: {result['chapter_num']}\n")
            
            if result.get('error'):
                f.write(f"Error: {result['error']}\n\n")
                continue
            
            f.write(f"Base file: {result.get('base_file', 'N/A')}\n")
            f.write(f"Large file: {result.get('large_file', 'N/A')}\n")
            f.write(f"Base segments: {result.get('base_segments_count', 0)}\n")
            f.write(f"Large segments: {result.get('large_segments_count', 0)}\n")
            f.write("\n")
            
            missing_segments = result.get('missing_segments', [])
            if missing_segments:
                f.write(f"MISSING SEGMENTS ({len(missing_segments)}):\n")
                f.write("-" * 80 + "\n")
                
                for seg in missing_segments:
                    f.write(f"\nTime: {format_time(seg.start_seconds)} - {format_time(seg.end_seconds)} "
                           f"({seg.duration:.1f}s)\n")
                    f.write(f"Missing text: {seg.base_text}\n")
                    
                    if seg.context_before:
                        f.write(f"\nContext before:\n{seg.context_before}\n")
                    if seg.context_after:
                        f.write(f"\nContext after:\n{seg.context_after}\n")
                    
                    f.write("\n" + "-" * 80 + "\n")
            else:
                f.write("No missing segments found.\n")
            
            f.write("\n" + "=" * 80 + "\n\n")


def find_all_video_ids(base_dir: Path, large_dir: Path) -> List[str]:
    """Find all video IDs that have transcripts in both directories."""
    base_videos = set()
    large_videos = set()
    
    # Extract video IDs from base directory
    for file in base_dir.glob("*_chapter*.txt"):
        if not file.name.endswith('_formatted.txt'):
            parts = file.name.split('_chapter')
            if len(parts) > 0:
                base_videos.add(parts[0])
    
    # Extract video IDs from large directory
    for file in large_dir.glob("*_chapter*.txt"):
        if not file.name.endswith('_formatted.txt'):
            parts = file.name.split('_chapter')
            if len(parts) > 0:
                large_videos.add(parts[0])
    
    # Return intersection (videos that exist in both)
    return sorted(base_videos & large_videos)


def get_chapter_time_range(video_id: str, chapter_num: int, large_file: Path) -> Tuple[float, float]:
    """
    Get the time range for a chapter from the transcript file header.
    
    Args:
        video_id: Video ID
        chapter_num: Chapter number
        large_file: Path to large model transcript file
        
    Returns:
        Tuple of (start_time, end_time) in seconds, or (0, 0) if not found
    """
    if not large_file.exists():
        return (0, 0)
    
    with open(large_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # Look for "Time: MM:SS - MM:SS" line
    time_pattern = re.compile(r'Time:\s*(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})')
    for line in lines[:10]:  # Check first 10 lines
        match = time_pattern.search(line)
        if match:
            start_min = int(match.group(1))
            start_sec = int(match.group(2))
            end_min = int(match.group(3))
            end_sec = int(match.group(4))
            start_time = start_min * 60 + start_sec
            end_time = end_min * 60 + end_sec
            return (start_time, end_time)
    
    return (0, 0)


def retranscribe_missing_segments(video_id: str, chapter_num: int,
                                  missing_segments: List[MissingSegment],
                                  large_file: Path, base_dir: Path, large_dir: Path,
                                  config: Config) -> bool:
    """
    Retranscribe missing segments using large model and insert them into the transcript file.
    
    Args:
        video_id: Video ID
        chapter_num: Chapter number
        missing_segments: List of missing segments to retranscribe
        large_file: Path to large model transcript file
        base_dir: Base model transcripts directory
        large_dir: Large model transcripts directory
        config: Config object with paths and settings
        
    Returns:
        True if successful, False otherwise
    """
    if not missing_segments:
        return True
    
    # Get chapter time range to calculate absolute time
    chapter_start, chapter_end = get_chapter_time_range(video_id, chapter_num, large_file)
    
    # Find audio file
    audio_path = None
    for ext in ['.mp3', '.m4a', '.webm', '.opus']:
        candidate = config.audio_dir / f"{video_id}{ext}"
        if candidate.exists():
            audio_path = candidate
            break
    
    if not audio_path:
        logger.error(f"Audio file not found for video {video_id}")
        return False
    
    # Initialize transcriber and clipper
    transcriber = Transcriber(config)
    clipper = AudioClipper(config)
    
    # Parse existing large model transcript
    existing_segments = parse_transcript_file(large_file)
    
    # Retranscribe each missing segment
    new_segments = []
    for missing in missing_segments:
        # Check if this missing segment is already covered by existing segments
        already_covered = False
        for existing_seg in existing_segments:
            # Check if existing segment overlaps with missing segment
            if segments_overlap(
                missing.start_seconds, missing.end_seconds,
                existing_seg.start_seconds, existing_seg.end_seconds,
                tolerance=2.0
            ):
                # Check text similarity to avoid duplicates
                missing_words = set(missing.base_text.lower().split()[:10])
                existing_words = set(existing_seg.text.lower().split()[:10])
                if len(missing_words) > 0:
                    word_overlap = len(missing_words & existing_words) / len(missing_words)
                    if word_overlap > 0.5:  # More than 50% overlap = likely duplicate
                        print(f"  ⚠ Skipping segment {format_time(missing.start_seconds)}-{format_time(missing.end_seconds)}: already covered")
                        already_covered = True
                        break
        
        if already_covered:
            continue
        
        # Calculate absolute time (chapter start + relative time)
        abs_start = chapter_start + missing.start_seconds
        abs_end = chapter_start + missing.end_seconds
        
        # Clip audio for this segment
        print(f"  Clipping audio: {format_time(abs_start)} - {format_time(abs_end)}")
        clip_path = clipper.clip_audio(audio_path, abs_start, abs_end)
        
        if not clip_path or not clip_path.exists():
            logger.error(f"Failed to clip audio for segment {format_time(abs_start)}-{format_time(abs_end)}")
            continue
        
        # Transcribe the clip
        print(f"  Transcribing missing segment...")
        result = transcriber.transcribe(clip_path, language="en")
        
        if not result or not result.get('segments'):
            logger.error(f"Failed to transcribe segment {format_time(abs_start)}-{format_time(abs_end)}")
            continue
        
        # Convert transcription segments to our Segment format
        # Adjust timestamps to be relative to chapter start
        # Also check for duplicates before adding
        for seg in result['segments']:
            rel_start = seg['start']  # Already relative to clip start
            rel_end = seg['end']
            # Add the missing segment's start offset
            final_start = missing.start_seconds + rel_start
            final_end = missing.start_seconds + rel_end
            
            # Check if this new segment overlaps with existing segments
            is_duplicate = False
            for existing_seg in existing_segments:
                if segments_overlap(
                    final_start, final_end,
                    existing_seg.start_seconds, existing_seg.end_seconds,
                    tolerance=2.0
                ):
                    # Check text similarity
                    new_words = set(seg['text'].lower().split()[:10])
                    existing_words = set(existing_seg.text.lower().split()[:10])
                    if len(new_words) > 0:
                        word_overlap = len(new_words & existing_words) / len(new_words)
                        if word_overlap > 0.5:
                            is_duplicate = True
                            break
            
            if not is_duplicate:
                start_min = int(final_start // 60)
                start_sec = int(final_start % 60)
                timestamp_str = f"[{start_min:02d}:{start_sec:02d}]"
                
                new_segments.append(Segment(
                    start_seconds=final_start,
                    end_seconds=final_end,
                    text=seg['text'],
                    timestamp_str=timestamp_str
                ))
        
        # Clean up clip file
        try:
            clip_path.unlink()
        except Exception as e:
            logger.warning(f"Failed to delete clip file: {e}")
    
    if not new_segments:
        logger.warning("No new segments were transcribed (all were duplicates or failed)")
        return False
    
    # Merge new segments with existing segments and sort by timestamp
    all_segments = existing_segments + new_segments
    all_segments.sort(key=lambda s: s.start_seconds)
    
    # Read original file to preserve header
    with open(large_file, 'r', encoding='utf-8') as f:
        original_lines = f.readlines()
    
    # Extract header
    header_lines = []
    in_header = True
    for line in original_lines:
        if in_header:
            header_lines.append(line.rstrip('\n'))
            if line.strip().startswith('='):
                in_header = False
        else:
            break
    
    # Build updated transcript content
    updated_content = []
    # Write header
    for line in header_lines:
        updated_content.append(line + '\n')
    updated_content.append('\n')
    
    # Write all segments sorted by timestamp
    for seg in all_segments:
        updated_content.append(f"{seg.timestamp_str} {seg.text}\n")
    
    # Write updated transcript file
    transcript_text = ''.join(updated_content)
    with open(large_file, 'w', encoding='utf-8') as f:
        f.write(transcript_text)
    
    # Validate updated transcript for anomalies
    from youtube_transcriber.transcript_validator import check_and_report_anomalies
    is_valid = check_and_report_anomalies(transcript_text, large_file)
    
    print(f"  ✓ Updated transcript file with {len(new_segments)} new segments")
    if not is_valid:
        print(f"  ⚠️  WARNING: Anomalies detected in updated transcript - please review!")
    return True


def find_chapter_numbers(video_id: str, base_dir: Path, large_dir: Path) -> List[int]:
    """Find all chapter numbers for a video in both directories."""
    base_chapters = set()
    large_chapters = set()
    
    # Extract chapter numbers from base directory
    pattern = re.compile(rf"{re.escape(video_id)}_chapter(\d+)_")
    for file in base_dir.glob(f"{video_id}_chapter*.txt"):
        if not file.name.endswith('_formatted.txt'):
            match = pattern.match(file.name)
            if match:
                base_chapters.add(int(match.group(1)))
    
    # Extract chapter numbers from large directory
    for file in large_dir.glob(f"{video_id}_chapter*.txt"):
        if not file.name.endswith('_formatted.txt'):
            match = pattern.match(file.name)
            if match:
                large_chapters.add(int(match.group(1)))
    
    # Return intersection (chapters that exist in both)
    return sorted(base_chapters & large_chapters)


def main():
    """Main CLI interface."""
    parser = argparse.ArgumentParser(
        description='Compare base model transcripts with large model transcripts to detect missing segments.'
    )
    parser.add_argument('video_id', nargs='?', help='Video ID to compare (optional if --all is used)')
    parser.add_argument('--chapter', type=int, help='Specific chapter number to compare')
    parser.add_argument('--all', action='store_true', help='Compare all videos')
    parser.add_argument('--output', type=str, help='Output file for detailed report')
    parser.add_argument('--min-gap', type=float, default=5.0, 
                       help='Minimum gap duration in seconds to report (default: 5.0)')
    parser.add_argument('--base-dir', type=str, 
                       default='test_data/transcripts',
                       help='Base model transcripts directory (default: test_data/transcripts)')
    parser.add_argument('--large-dir', type=str,
                       default='test_data/transcripts_large',
                       help='Large model transcripts directory (default: test_data/transcripts_large)')
    parser.add_argument('--fix', action='store_true',
                       help='Automatically retranscribe missing segments using large model')
    parser.add_argument('--audio-dir', type=str,
                       default='test_data/audio',
                       help='Audio files directory (default: test_data/audio)')
    
    args = parser.parse_args()
    
    # Convert directories to Path objects
    base_dir = Path(args.base_dir)
    large_dir = Path(args.large_dir)
    
    if not base_dir.exists():
        print(f"Error: Base directory not found: {base_dir}")
        return
    
    if not large_dir.exists():
        print(f"Error: Large directory not found: {large_dir}")
        return
    
    results = []
    
    if args.all:
        # Compare all videos
        video_ids = find_all_video_ids(base_dir, large_dir)
        if not video_ids:
            print("No matching videos found in both directories.")
            return
        
        print(f"Found {len(video_ids)} video(s) to compare.")
        print()
        
        for video_id in video_ids:
            chapter_nums = find_chapter_numbers(video_id, base_dir, large_dir)
            for chapter_num in chapter_nums:
                result = compare_chapter_transcripts(
                    video_id, chapter_num, base_dir, large_dir, args.min_gap
                )
                results.append(result)
    
    elif args.video_id:
        # Compare specific video
        if args.chapter:
            # Single chapter
            result = compare_chapter_transcripts(
                args.video_id, args.chapter, base_dir, large_dir, args.min_gap
            )
            results.append(result)
        else:
            # All chapters for this video
            chapter_nums = find_chapter_numbers(args.video_id, base_dir, large_dir)
            if not chapter_nums:
                print(f"No matching chapters found for video {args.video_id}")
                return
            
            print(f"Comparing {len(chapter_nums)} chapter(s) for video {args.video_id}")
            print()
            
            for chapter_num in chapter_nums:
                result = compare_chapter_transcripts(
                    args.video_id, chapter_num, base_dir, large_dir, args.min_gap
                )
                results.append(result)
    else:
        parser.print_help()
        return
    
    # Print summary
    print_comparison_summary(results)
    
    # Write detailed report if requested
    if args.output:
        output_file = Path(args.output)
        write_detailed_report(results, output_file)
        print(f"\nDetailed report saved to: {output_file}")
    
    # Fix missing segments if requested
    if args.fix:
        print("\n" + "=" * 80)
        print("RETRANSCRIBING MISSING SEGMENTS")
        print("=" * 80)
        print()
        
        # Setup config for retranscription
        base_config_dir = base_dir.parent
        config = Config(base_dir=str(base_config_dir), whisper_model="large")
        config.transcripts_dir = large_dir
        config.audio_dir = Path(args.audio_dir) if args.audio_dir else base_config_dir / "audio"
        
        fixed_count = 0
        for result in results:
            if result.get('error') or not result.get('missing_segments'):
                continue
            
            video_id = result['video_id']
            chapter_num = result['chapter_num']
            missing_segments = result['missing_segments']
            large_file = large_dir / result['large_file']
            
            print(f"Fixing {video_id} Chapter {chapter_num}: {len(missing_segments)} gap(s)")
            
            if retranscribe_missing_segments(
                video_id, chapter_num, missing_segments,
                large_file, base_dir, large_dir, config
            ):
                fixed_count += 1
                print(f"  ✓ Fixed\n")
            else:
                print(f"  ✗ Failed to fix\n")
        
        print("=" * 80)
        print(f"Fixed {fixed_count} chapter(s)")
        print("=" * 80)


if __name__ == '__main__':
    main()


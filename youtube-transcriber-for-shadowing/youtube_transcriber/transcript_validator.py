"""Validate transcript files for anomalies and corruption."""

import re
from pathlib import Path
from typing import List, Tuple, Optional


def validate_transcript_content(text: str) -> List[Tuple[int, str, str]]:
    """
    Validate transcript text for anomalies.
    
    Args:
        text: Transcript text content
        
    Returns:
        List of tuples: (line_number, anomaly_type, line_preview)
        Empty list if no anomalies found
    """
    lines = text.split('\n')
    anomalies = []
    
    for i, line in enumerate(lines, 1):
        # Skip header lines
        if line.startswith('Chapter') or line.startswith('Video') or line.startswith('Time') or line.startswith('Model'):
            continue
        if line.strip().startswith('='):
            continue
        
        stripped = line.strip()
        if not stripped:
            continue
        
        # Check for patterns of consecutive zeros (suspicious)
        # Pattern: multiple "00" or "0" separated by spaces, or long sequences
        if re.search(r'\d+\s+00\s+00\s+00|0{4,}|0\s+0\s+0\s+0\s+0\s+0', stripped):
            # But exclude normal numbers like "1,000" or "30,000"
            if not re.search(r'\d{1,3}[,\s]\d{3}', stripped):  # Normal number formatting
                anomalies.append((i, 'consecutive_zeros', stripped[:100]))
        
        # Check for broken characters (non-ASCII mixed with Korean or weird chars)
        # Look for Korean characters mixed with non-printable or weird characters
        if re.search(r'[가-힣].*[^\x00-\x7F가-힣\s.,!?;:\"\'()\[\]{}]', stripped):
            # Check if it's not just normal punctuation
            if re.search(r'[가-힣].*[^\x00-\x7F가-힣\s.,!?;:\"\'()\[\]{}]', stripped):
                anomalies.append((i, 'broken_chars', stripped[:100]))
        
        # Check for suspicious number patterns (like "194 00 00 00")
        if re.search(r'\d{2,}\s+00\s+00\s+00\s+00|\d+\s+0{3,}\s+\d+', stripped):
            anomalies.append((i, 'suspicious_numbers', stripped[:100]))
        
        # Check for very long sequences of zeros and spaces
        if re.search(r'0\s+0\s+0\s+0\s+0\s+0\s+0\s+0', stripped):
            anomalies.append((i, 'long_zero_sequence', stripped[:100]))
    
    return anomalies


def validate_transcript_file(file_path: Path) -> List[Tuple[int, str, str]]:
    """
    Validate a transcript file for anomalies.
    
    Args:
        file_path: Path to transcript file
        
    Returns:
        List of tuples: (line_number, anomaly_type, line_preview)
        Empty list if no anomalies found
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        return validate_transcript_content(content)
    except Exception as e:
        return [(0, 'read_error', str(e))]


def check_and_report_anomalies(text: str, file_path: Optional[Path] = None) -> bool:
    """
    Check transcript for anomalies and report them.
    
    Args:
        text: Transcript text content
        file_path: Optional file path for reporting
        
    Returns:
        True if no anomalies found, False if anomalies detected
    """
    anomalies = validate_transcript_content(text)
    
    if anomalies:
        file_info = f" in {file_path.name}" if file_path else ""
        print(f"  ⚠️  WARNING: Found {len(anomalies)} anomaly(ies){file_info}:")
        for line_num, anomaly_type, line_preview in anomalies:
            print(f"     Line {line_num} ({anomaly_type}): {line_preview}...")
        return False
    
    return True


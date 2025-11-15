"""Format transcripts from timestamp-segment format to natural script format."""

import re
import sys
import os
from pathlib import Path

# Add parent directory to path to import chatgpt_generator
# This file is in youtube-transcriber-for-shadowing/youtube_transcriber/
# We need to go up to the root directory to import chatgpt_generator
current_file = Path(__file__).resolve()
root_dir = current_file.parent.parent.parent
sys.path.insert(0, str(root_dir))

try:
    from chatgpt_generator import get_openai_client
except ImportError:
    # Try alternative path
    try:
        root_dir_alt = Path(__file__).parent.parent.parent.parent
        sys.path.insert(0, str(root_dir_alt))
        from chatgpt_generator import get_openai_client
    except ImportError:
        # Last resort: try to find it relative to current working directory
        import os
        cwd = os.getcwd()
        if 'youtube-transcriber-for-shadowing' in cwd:
            # We're in the subdirectory
            root_dir_final = Path(cwd).parent
        else:
            root_dir_final = Path(cwd)
        sys.path.insert(0, str(root_dir_final))
        from chatgpt_generator import get_openai_client


def format_transcript_to_script(raw_transcript: str) -> str:
    """
    Convert transcript from timestamp-segment format to natural script format.
    
    Args:
        raw_transcript: Raw transcript text with headers and timestamp-segment format
        
    Returns:
        Formatted script with headers preserved and transcript converted to natural paragraphs
    """
    lines = raw_transcript.split('\n')
    
    # Separate header from transcript content
    header_lines = []
    transcript_lines = []
    in_header = True
    
    for line in lines:
        # Check if this is a header line (Chapter, Video, Time, or separator)
        if in_header and (line.startswith('Chapter') or line.startswith('Video') or 
                         line.startswith('Time') or line.strip().startswith('=') or 
                         line.strip() == ''):
            header_lines.append(line)
            if line.strip().startswith('='):
                # After separator, next non-empty line should be transcript
                in_header = False
        elif in_header:
            # Still in header, continue collecting
            header_lines.append(line)
        else:
            # This is transcript content
            if line.strip():  # Skip empty lines in transcript section
                transcript_lines.append(line)
    
    # If no separator found, try to detect where header ends
    if not transcript_lines:
        # Look for first line with timestamp pattern
        for i, line in enumerate(lines):
            if re.match(r'\[\d{2}:\d{2}\]', line):
                header_lines = lines[:i]
                transcript_lines = lines[i:]
                break
    
    # Extract transcript text (remove timestamps)
    transcript_text_parts = []
    for line in transcript_lines:
        # Remove timestamp pattern [MM:SS] and leading whitespace
        cleaned = re.sub(r'\[\d{2}:\d{2}\]\s*', '', line).strip()
        if cleaned:
            transcript_text_parts.append(cleaned)
    
    # Join all transcript segments with spaces
    full_transcript_text = ' '.join(transcript_text_parts)
    
    if not full_transcript_text.strip():
        # No transcript content found, return original
        return raw_transcript
    
    # Use ChatGPT to format into natural paragraphs
    try:
        client = get_openai_client()
        
        prompt = """Convert the following transcript into a natural script format. Divide it into paragraphs based on meaning and context. Each paragraph should represent a complete thought or topic. Return only the formatted text with paragraphs separated by blank lines. Do not add any explanations or comments, just return the formatted text.

Transcript:
""" + full_transcript_text
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.3
        )
        
        formatted_text = response.choices[0].message.content.strip()
        
        # Combine header + formatted transcript
        header_text = '\n'.join(header_lines)
        # Ensure there's a blank line after header separator if needed
        if header_text and not header_text.endswith('\n'):
            header_text += '\n'
        if header_text and not header_text.rstrip().endswith('='):
            # Add separator if not present
            if '=' not in header_text:
                header_text += '=' * 60 + '\n'
        
        return header_text + '\n' + formatted_text
        
    except Exception as e:
        # If ChatGPT fails, return simple formatted version (just remove timestamps and join)
        print(f"Warning: ChatGPT formatting failed: {e}. Using simple format.")
        header_text = '\n'.join(header_lines)
        if header_text and not header_text.endswith('\n'):
            header_text += '\n'
        
        # Simple formatting: join segments with spaces, add line breaks after periods
        simple_formatted = full_transcript_text
        # Add line breaks after sentence endings (basic heuristic)
        simple_formatted = re.sub(r'([.!?])\s+', r'\1\n\n', simple_formatted)
        
        return header_text + '\n' + simple_formatted


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
    
    # Extract transcript segments with timestamps
    timestamp_segments = []
    for line in transcript_lines:
        # Extract timestamp and text
        timestamp_match = re.match(r'\[(\d{2}):(\d{2})\]\s*(.*)', line)
        if timestamp_match:
            minutes = int(timestamp_match.group(1))
            seconds = int(timestamp_match.group(2))
            text = timestamp_match.group(3).strip()
            if text:
                timestamp_segments.append({
                    'timestamp': minutes * 60 + seconds,
                    'timestamp_str': f"{minutes:02d}:{seconds:02d}",
                    'text': text
                })
    
    if not timestamp_segments:
        # No transcript content found, return original
        return raw_transcript
    
    # Join all transcript segments with spaces for ChatGPT
    full_transcript_text = ' '.join(seg['text'] for seg in timestamp_segments)
    
    # Use ChatGPT to format into natural paragraphs with logic fixes
    try:
        client = get_openai_client()
        
        system_message = """You are an editor for spoken-dialogue transcripts.

Your goal is to fix only clear logical problems in the transcript while preserving the natural messiness of real speech.

Follow these rules very strictly:

1. Task scope
- Input: A raw transcript of spoken dialogue, written as continuous text without speaker labels. Multiple speakers may appear in any order, and a single paragraph may contain turns from several different speakers.
- Output: The same transcript with only minimal edits needed to make the logic coherent and understandable, divided into paragraphs based on meaning and context.
- Do not add explanations or comments. Return only the edited transcript text with paragraphs separated by blank lines.

2. What you SHOULD fix
Make the smallest possible edits to fix:
- Sentences that contradict the surrounding context in an obvious way.
- Words or short phrases that are clearly mis-transcribed and break the logic.
- Broken references that make it impossible to understand who or what is being talked about.
- Connective issues that cause abrupt and nonsensical jumps in thought, when this can be fixed by:
  - Tweaking a word or two, or
  - Slightly reshaping a sentence while keeping the original meaning.
- Very small grammar edits only when the current form is confusing or logically ambiguous, and a tiny change makes the meaning clear.
- Only change or remove text when it is clearly a transcription mistake or when the sentence no longer makes sense as-is.

Always ask yourself:
"Can a reasonable listener understand the intended meaning without this change?"
- If yes, do not change it.
- If no, fix it with the smallest possible modification.

3. What you MUST NOT fix
Do not "clean up" natural speech. Specifically, do not fix:
- Fillers and disfluencies: "uh", "um", "you know", "like", "I mean", "sort of", "kind of", etc.
- Repetitions: "more subdivided, more subdivided, subdivided" should be kept as-is unless it is logically broken.
- Incomplete sentences that still make sense in context.
- Informal or slightly incorrect grammar that does not break the logic.
- Style, tone, or word choice just because you think a different phrase sounds better.
- The order of sentences or paragraphs, except when a tiny reorder is absolutely necessary to fix a clear logical error. Avoid reordering if at all possible.
- Natural conversational phrases (e.g., "and then they are basically like...") that are common in spoken dialogue. Keep them unless they are obviously wrong or nonsensical.
- The original wording of sentences, even if redundant or slightly ungrammatical. Do not replace phrases with paraphrases unless the existing words are clearly incorrect or meaningless.
- Leading conjunctions (e.g., "And", "But", "So") at the start of sentences. Keep them unless they make the sentence impossible to understand.
- Filler words (e.g., "like", "kind of", "you know") and self-rephrasing (e.g., saying something, then restating it differently). Keep these unless the words are clearly misheard or nonsensical.
- Leave connective fragments such as "And then they are basically like…" or "So…" intact even when they seem redundant; do not remove or merge them.
- Word order should remain exactly as spoken. If a sentence needs a minimal fix (e.g., changing singular/plural agreement or adding a punctuation mark) do so without reshuffling the sentence structure.
- Only change word order when the existing order makes the sentence impossible to understand. Stylistic improvements are not allowed.
- CRITICAL: Never restructure sentences to make them "more natural" or "better English". The original word order must be preserved exactly as spoken. Examples of what NOT to do:
  - Original: "and marketing is a lot of companies are like the waiters" → WRONG: "In a lot of companies, marketing is like the waiters" or "And marketing in a lot of companies is like the waiters". CORRECT: Keep "and marketing is a lot of companies are like the waiters" exactly as-is.
  - Original: "So instead of five teams" → WRONG: "Instead of five teams". CORRECT: Keep "So instead of five teams".
  - Original: "heuristic is how close there's engineering and marketing and marketing is a lot of companies are like the waiters" → WRONG: Breaking it into separate sentences or reordering. CORRECT: Keep the exact word order and structure.
  - The original word order, even if grammatically awkward or confusing, must be preserved unless it makes the sentence completely incomprehensible (i.e., impossible to parse, not just awkward).

4. Minimal change principle
- Do not paraphrase entire sentences.
- Do not introduce new ideas, information, or speculations that are not clearly implied in the original.
- Prefer micro-edits:
  - Change a single word.
  - Add or remove a single short phrase.
  - Adjust one clause inside a sentence.
- Avoid:
  - Adding new sentences.
  - Deleting entire sentences, unless they are completely nonsensical and cannot be repaired with a small change.
- Keep the length and rhythm of the transcript as similar as possible to the original.

5. Handling ambiguity
- If multiple interpretations are possible, choose the one that:
  - Fits best with the surrounding context, and
  - Requires the fewest changes to the transcript.
- If you are not reasonably sure what the speaker meant, do not invent a meaning. Leave the original text as-is unless it is completely incoherent.

6. Formatting
- Divide the text into paragraphs based on meaning and context. Create paragraph breaks at natural pauses, topic shifts, or when the focus changes, even if the thought is not completely finished.
- Do not add speaker names or timestamps.
- Do not highlight or mark your changes unless explicitly requested.
- Do not include any explanation in your answer. Output only the edited transcript with paragraphs separated by blank lines.

7. If the transcript is already coherent
- If the transcript is logically fine, you may make no changes at all.
- It is better to leave slightly messy but natural speech than to over-edit."""
        
        prompt = """Fix any logical problems in the following transcript and divide it into paragraphs based on meaning and context, creating breaks at natural pauses or topic shifts. Make only minimal edits needed to fix clear logical issues. Preserve all natural speech patterns including fillers, repetitions, incomplete sentences, natural conversational phrases, leading conjunctions, self-rephrased lines, and connective fragments like "And then they are basically like…". 

CRITICAL: Keep the original wording and word order exactly as spoken, even if it is redundant or slightly ungrammatical. Do NOT restructure sentences to make them "more natural" or "better English". 

Examples of what NOT to do:
- Original: "and marketing is a lot of companies are like the waiters" → WRONG: "In a lot of companies, marketing is like the waiters" or "And marketing in a lot of companies is like the waiters". CORRECT: Keep "and marketing is a lot of companies are like the waiters" exactly as-is.
- Original: "heuristic is how close there's engineering and marketing and marketing is a lot of companies are like the waiters" → WRONG: Breaking it into separate sentences or reordering. CORRECT: Keep the exact word order and structure.

Only change or remove text when it is clearly a mistranscription or when the sentence is nonsensical without the fix. Do not reorder words unless the original order makes the sentence impossible to understand (i.e., completely unparseable, not just awkward).

Transcript:
""" + full_transcript_text
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": system_message
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.2
        )
        
        formatted_text = response.choices[0].message.content.strip()
        
        # Map formatted paragraphs back to timestamps
        formatted_paragraphs = [p.strip() for p in formatted_text.split('\n\n') if p.strip()]
        
        # For each paragraph, find the best matching timestamp from original segments
        # Strategy: Find the first original segment whose text appears in the paragraph
        result_paragraphs = []
        segment_idx = 0
        
        for para in formatted_paragraphs:
            best_timestamp = None
            para_lower = para.lower()
            
            # Try to find matching segment by checking if paragraph contains segment text
            # Start from where we left off (segment_idx) to maintain order
            for i in range(segment_idx, len(timestamp_segments)):
                seg_text = timestamp_segments[i]['text'].lower().strip()
                
                # Check if segment text appears in paragraph
                # Use first 30-40 chars for matching to handle cases where paragraph starts mid-segment
                if len(seg_text) > 0:
                    # Check if segment text (or significant portion) appears in paragraph
                    seg_start = seg_text[:40]
                    para_start = para_lower[:60]
                    
                    # Match if: segment text appears in paragraph, or paragraph start appears in segment
                    if seg_start in para_lower or para_start[:30] in seg_text:
                        best_timestamp = timestamp_segments[i]['timestamp_str']
                        segment_idx = i + 1
                        break
            
            # If no match found by content, use the next available timestamp (sequential fallback)
            if not best_timestamp and segment_idx < len(timestamp_segments):
                best_timestamp = timestamp_segments[segment_idx]['timestamp_str']
                segment_idx += 1
            
            # If still no timestamp, use the last one
            if not best_timestamp and timestamp_segments:
                best_timestamp = timestamp_segments[-1]['timestamp_str']
            
            # Add timestamp comment before paragraph
            if best_timestamp:
                result_paragraphs.append(f"<!--TIMESTAMP:{best_timestamp}-->")
            result_paragraphs.append(para)
        
        formatted_with_timestamps = '\n\n'.join(result_paragraphs)
        
        # Combine header + formatted transcript with timestamps
        header_text = '\n'.join(header_lines)
        # Ensure there's a blank line after header separator if needed
        if header_text and not header_text.endswith('\n'):
            header_text += '\n'
        if header_text and not header_text.rstrip().endswith('='):
            # Add separator if not present
            if '=' not in header_text:
                header_text += '=' * 60 + '\n'
        
        return header_text + '\n' + formatted_with_timestamps
        
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


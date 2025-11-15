"""Format existing transcript files that don't have formatted versions yet."""

import sys
from pathlib import Path

# Add current directory to path
sys.path.insert(0, str(Path(__file__).parent))

from youtube_transcriber.transcript_formatter import format_transcript_to_script

def format_existing_transcripts(transcripts_dir: Path):
    """Format all transcript files that don't have formatted versions."""
    transcripts_dir = Path(transcripts_dir)
    
    # Find all transcript files (excluding already formatted ones)
    transcript_files = sorted(transcripts_dir.glob("*.txt"))
    transcript_files = [f for f in transcript_files if not f.name.endswith("_formatted.txt")]
    
    print(f"Found {len(transcript_files)} transcript files to format")
    print("="*60)
    
    success_count = 0
    error_count = 0
    
    for transcript_file in transcript_files:
        formatted_file = transcript_file.parent / f"{transcript_file.stem}_formatted.txt"
        
        # Skip if formatted version already exists
        if formatted_file.exists():
            print(f"⏭️  Skipping {transcript_file.name} (formatted version already exists)")
            continue
        
        print(f"\n📝 Processing: {transcript_file.name}")
        
        try:
            # Read original transcript
            with open(transcript_file, 'r', encoding='utf-8') as f:
                raw_transcript = f.read()
            
            # Format it
            formatted_transcript = format_transcript_to_script(raw_transcript)
            
            # Save formatted version
            with open(formatted_file, 'w', encoding='utf-8') as f:
                f.write(formatted_transcript)
            
            print(f"   ✅ Formatted transcript saved: {formatted_file.name}")
            success_count += 1
            
        except Exception as e:
            print(f"   ❌ Error formatting {transcript_file.name}: {e}")
            import traceback
            traceback.print_exc()
            error_count += 1
    
    print("\n" + "="*60)
    print(f"Summary: {success_count} succeeded, {error_count} failed")
    print("="*60)

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        transcripts_dir = Path(sys.argv[1])
    else:
        # Default to test_data/transcripts
        transcripts_dir = Path(__file__).parent / "test_data" / "transcripts"
    
    if not transcripts_dir.exists():
        print(f"Error: Directory not found: {transcripts_dir}")
        sys.exit(1)
    
    format_existing_transcripts(transcripts_dir)


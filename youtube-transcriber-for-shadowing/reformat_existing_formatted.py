"""Re-format existing formatted transcripts with the new logic-fix prompt."""

import sys
from pathlib import Path

# Add current directory to path
sys.path.insert(0, str(Path(__file__).parent))

from youtube_transcriber.transcript_formatter import format_transcript_to_script

def reformat_existing_formatted(transcripts_dir: Path, dry_run: bool = False):
    """
    Re-format all existing formatted transcript files with the new logic-fix prompt.
    
    Args:
        transcripts_dir: Directory containing transcript files
        dry_run: If True, only show what would be reformatted without actually doing it
    """
    transcripts_dir = Path(transcripts_dir)
    
    # Find all formatted transcript files
    formatted_files = sorted(transcripts_dir.glob("*_formatted.txt"))
    
    print(f"Found {len(formatted_files)} formatted transcript files")
    print("="*60)
    
    if dry_run:
        print("DRY RUN MODE - No files will be modified")
        print("="*60)
    
    success_count = 0
    error_count = 0
    skipped_count = 0
    
    for formatted_file in formatted_files:
        # Find corresponding raw transcript file
        # Remove "_formatted" from the name
        raw_name = formatted_file.stem.replace("_formatted", "") + ".txt"
        raw_file = formatted_file.parent / raw_name
        
        if not raw_file.exists():
            print(f"⚠️  Skipping {formatted_file.name} (raw transcript not found: {raw_name})")
            skipped_count += 1
            continue
        
        print(f"\n📝 Processing: {formatted_file.name}")
        
        if dry_run:
            print(f"   Would re-format using raw transcript: {raw_file.name}")
            continue
        
        try:
            # Read original raw transcript (not the formatted one)
            with open(raw_file, 'r', encoding='utf-8') as f:
                raw_transcript = f.read()
            
            # Re-format it with new prompt
            formatted_transcript = format_transcript_to_script(raw_transcript)
            
            # Save formatted version (overwrite existing)
            with open(formatted_file, 'w', encoding='utf-8') as f:
                f.write(formatted_transcript)
            
            print(f"   ✅ Re-formatted transcript saved: {formatted_file.name}")
            success_count += 1
            
        except Exception as e:
            print(f"   ❌ Error re-formatting {formatted_file.name}: {e}")
            import traceback
            traceback.print_exc()
            error_count += 1
    
    print("\n" + "="*60)
    if dry_run:
        print(f"DRY RUN Summary: {len(formatted_files)} files would be processed")
        print(f"   - {skipped_count} would be skipped (no raw transcript)")
    else:
        print(f"Summary: {success_count} succeeded, {error_count} failed, {skipped_count} skipped")
    print("="*60)

if __name__ == "__main__":
    import sys
    
    dry_run = "--dry-run" in sys.argv or "-n" in sys.argv
    
    if len(sys.argv) > 1 and sys.argv[1] not in ["--dry-run", "-n"]:
        transcripts_dir = Path(sys.argv[1])
    else:
        # Default to test_data/transcripts_large (large model transcripts)
        transcripts_dir = Path(__file__).parent / "test_data" / "transcripts_large"
    
    if not transcripts_dir.exists():
        print(f"Error: Directory not found: {transcripts_dir}")
        sys.exit(1)
    
    reformat_existing_formatted(transcripts_dir, dry_run=dry_run)


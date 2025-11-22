"""Re-format a few sample formatted transcripts with the new logic-fix prompt."""

import sys
from pathlib import Path

# Add current directory to path
sys.path.insert(0, str(Path(__file__).parent))

from youtube_transcriber.transcript_formatter import format_transcript_to_script

def reformat_samples(transcripts_dir: Path, sample_files: list):
    """Re-format specific sample files."""
    transcripts_dir = Path(transcripts_dir)
    
    print(f"Re-formatting {len(sample_files)} sample files...")
    print("="*60)
    
    success_count = 0
    error_count = 0
    
    for formatted_filename in sample_files:
        formatted_file = transcripts_dir / formatted_filename
        
        if not formatted_file.exists():
            print(f"⚠️  File not found: {formatted_filename}")
            error_count += 1
            continue
        
        # Find corresponding raw transcript file
        raw_name = formatted_file.stem.replace("_formatted", "") + ".txt"
        raw_file = formatted_file.parent / raw_name
        
        if not raw_file.exists():
            print(f"⚠️  Raw transcript not found for: {formatted_filename}")
            error_count += 1
            continue
        
        print(f"\n📝 Processing: {formatted_file.name}")
        
        try:
            # Read original raw transcript
            with open(raw_file, 'r', encoding='utf-8') as f:
                raw_transcript = f.read()
            
            # Re-format it with new prompt
            print(f"   Re-formatting with new logic-fix prompt...")
            formatted_transcript = format_transcript_to_script(raw_transcript)
            
            # Save formatted version (overwrite existing)
            with open(formatted_file, 'w', encoding='utf-8') as f:
                f.write(formatted_transcript)
            
            print(f"   ✅ Re-formatted: {formatted_file.name}")
            success_count += 1
            
        except Exception as e:
            print(f"   ❌ Error: {e}")
            import traceback
            traceback.print_exc()
            error_count += 1
    
    print("\n" + "="*60)
    print(f"Summary: {success_count} succeeded, {error_count} failed")
    print("="*60)

if __name__ == "__main__":
    transcripts_dir = Path(__file__).parent / "test_data" / "transcripts_large"
    
    # Select a few sample files to test from large model transcripts
    sample_files = [
        "2XgU6T4DalY_chapter1_Elizabeths_background_formatted.txt",
        "4ef0juAMqoE_chapter1_Brians_background_formatted.txt",
        "9N4ZgNaWvI0_chapter1_Martys_background_formatted.txt",
    ]
    
    reformat_samples(transcripts_dir, sample_files)


"""Format existing transcript files with optional reformatting."""

import argparse
import json
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from youtube_transcriber.transcript_formatter import format_transcript_to_script


def format_existing_transcripts(transcripts_dir: Path, reformat: bool = False, dry_run: bool = False):
    """
    Format all transcript files that don't have formatted versions, or reformat existing ones.
    
    Args:
        transcripts_dir: Directory containing transcript files
        reformat: If True, reformat existing formatted files; if False, only format unformatted ones
        dry_run: If True, only show what would be formatted without actually doing it
    """
    transcripts_dir = Path(transcripts_dir)
    
    if reformat:
        # Find all formatted transcript files
        transcript_files = sorted(transcripts_dir.glob("*_formatted.txt"))
        print(f"Found {len(transcript_files)} formatted transcript files to reformat")
    else:
        # Find all transcript files (excluding already formatted ones)
        transcript_files = sorted(transcripts_dir.glob("*.txt"))
        transcript_files = [f for f in transcript_files if not f.name.endswith("_formatted.txt")]
        print(f"Found {len(transcript_files)} transcript files to format")
    
    print("="*60)
    
    if dry_run:
        print("DRY RUN MODE - No files will be modified")
        print("="*60)
    
    success_count = 0
    error_count = 0
    skipped_count = 0
    
    for transcript_file in transcript_files:
        if reformat:
            # Find corresponding raw transcript file
            raw_name = transcript_file.stem.replace("_formatted", "") + ".txt"
            raw_file = transcript_file.parent / raw_name
            
            if not raw_file.exists():
                print(f"⚠️  Skipping {transcript_file.name} (raw transcript not found: {raw_name})")
                skipped_count += 1
                continue
            
            source_file = raw_file
            target_file = transcript_file
        else:
            # Format unformatted files
            formatted_file = transcript_file.parent / f"{transcript_file.stem}_formatted.txt"
            
            # Skip if formatted version already exists
            if formatted_file.exists():
                print(f"⏭️  Skipping {transcript_file.name} (formatted version already exists)")
                skipped_count += 1
                continue
            
            source_file = transcript_file
            target_file = formatted_file
        
        print(f"\n📝 Processing: {source_file.name}")
        
        if dry_run:
            if reformat:
                print(f"   Would re-format: {target_file.name}")
            else:
                print(f"   Would format: {target_file.name}")
            continue
        
        try:
            # Read original transcript
            with open(source_file, 'r', encoding='utf-8') as f:
                raw_transcript = f.read()
            
            # Format it
            formatted_transcript = format_transcript_to_script(raw_transcript)
            
            # Save formatted version
            with open(target_file, 'w', encoding='utf-8') as f:
                f.write(formatted_transcript)
            
            if reformat:
                print(f"   ✅ Re-formatted transcript saved: {target_file.name}")
            else:
                print(f"   ✅ Formatted transcript saved: {target_file.name}")
            success_count += 1
            
        except Exception as e:
            print(f"   ❌ Error formatting {source_file.name}: {e}")
            import traceback
            traceback.print_exc()
            error_count += 1
    
    print("\n" + "="*60)
    if dry_run:
        if reformat:
            print(f"DRY RUN Summary: {len(transcript_files)} files would be reformatted")
        else:
            print(f"DRY RUN Summary: {len(transcript_files)} files would be formatted")
        print(f"   - {skipped_count} would be skipped")
    else:
        print(f"Summary: {success_count} succeeded, {error_count} failed, {skipped_count} skipped")
    print("="*60)
    
    # Update formatted_chapters_list.json after formatting (only if not dry run and not reformat)
    if success_count > 0 and not dry_run and not reformat:
        print("\n" + "="*60)
        print("Updating formatted_chapters_list.json...")
        print("="*60)
        try:
            # Import from same directory
            import importlib.util
            spec = importlib.util.spec_from_file_location(
                "generate_large_formatted_list",
                Path(__file__).parent / "generate_large_formatted_list.py"
            )
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            generate_large_formatted_list = module.generate_large_formatted_list
            
            result = generate_large_formatted_list()
            
            # Save to JSON file
            output_path = transcripts_dir / 'formatted_chapters_list.json'
            output_path.parent.mkdir(parents=True, exist_ok=True)
            
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(result, f, indent=2, ensure_ascii=False)
            
            total_videos = len(result['videos'])
            total_chapters = sum(len(v['chapters']) for v in result['videos'])
            
            print(f"✅ Updated {output_path}")
            print(f"   - {total_videos} videos")
            print(f"   - {total_chapters} chapters with formatted transcripts")
        except Exception as e:
            print(f"⚠️  Warning: Failed to update formatted_chapters_list.json: {e}")
            import traceback
            traceback.print_exc()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description='Format existing transcript files that don\'t have formatted versions, or reformat existing ones.'
    )
    parser.add_argument('transcripts_dir', nargs='?', type=str, default=None,
                       help='Directory containing transcript files (default: test_data/transcripts or test_data/transcripts_large)')
    parser.add_argument('--reformat', action='store_true',
                       help='Reformat existing formatted files instead of formatting new ones')
    parser.add_argument('--dry-run', '-n', action='store_true',
                       help='Show what would be formatted without actually doing it')
    
    args = parser.parse_args()
    
    if args.transcripts_dir:
        transcripts_dir = Path(args.transcripts_dir)
    else:
        # Default based on reformat mode
        if args.reformat:
            # Default to test_data/transcripts_large for reformatting
            transcripts_dir = Path(__file__).parent / "test_data" / "transcripts_large"
        else:
            # Default to test_data/transcripts for formatting
            transcripts_dir = Path(__file__).parent / "test_data" / "transcripts"
    
    if not transcripts_dir.exists():
        print(f"Error: Directory not found: {transcripts_dir}")
        sys.exit(1)
    
    format_existing_transcripts(transcripts_dir, reformat=args.reformat, dry_run=args.dry_run)

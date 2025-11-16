"""
Flask application for Speaking Practice Roadmap Tool
"""

from flask import Flask, render_template, jsonify, request, send_from_directory
from datetime import datetime
import os
import pytz
from progress_manager import (
    get_phase1_roadmap,
    get_current_week_key,
    load_progress,
    save_progress,
    ensure_week_exists,
    update_progress,
    get_weekly_progress_summary,
    get_previous_weeks_content,
)
from chatgpt_generator import (
    generate_voice_journaling_topics,
    generate_shadowing_scripts,
    generate_weekly_prompt,
    generate_weekly_prompt_words,
    generate_shadowing_audio_openai_for_week,
    get_openai_client,
)
from typecast_generator import (
    generate_shadowing_audio_for_week,
    get_available_voices,
)

# Configure Flask with explicit static folder for Vercel
# Try multiple possible paths for Vercel serverless environment
base_dir = os.path.dirname(os.path.abspath(__file__))
possible_static_paths = [
    os.path.join(base_dir, 'static'),
    os.path.join(os.getcwd(), 'static'),
    'static',
    os.path.join('/var/task', 'static'),  # Vercel Lambda path
]

static_folder_path = None
for path in possible_static_paths:
    if os.path.exists(path):
        static_folder_path = path
        break

# Fallback to relative path if none found (for Vercel)
if static_folder_path is None:
    static_folder_path = 'static'

app = Flask(__name__, static_folder=static_folder_path, static_url_path='/static')

# Add explicit route for static files to ensure they're served
@app.route('/static/<path:filename>')
def serve_static_files(filename):
    """Explicitly serve static files for Vercel compatibility."""
    try:
        return app.send_static_file(filename)
    except Exception as e:
        # Debug: return error with path information
        import sys
        debug_info = {
            'error': str(e),
            'filename': filename,
            'static_folder': app.static_folder,
            'cwd': os.getcwd(),
            '__file__': __file__,
            'base_dir': base_dir,
            'static_exists': os.path.exists(static_folder_path) if static_folder_path else False,
            'searched_paths': possible_static_paths
        }
        # Try to list files in static folder if it exists
        if static_folder_path and os.path.exists(static_folder_path):
            try:
                debug_info['static_files'] = os.listdir(static_folder_path)[:10]
            except:
                pass
        return jsonify(debug_info), 404


@app.route('/')
def index():
    """Render the main dashboard."""
    import time
    # Use timestamp down to milliseconds for better cache busting
    return render_template('index.html', timestamp=int(time.time() * 1000))


@app.route('/api/roadmap')
def api_roadmap():
    """Return the Phase 1 roadmap structure."""
    return jsonify(get_phase1_roadmap())


@app.route('/api/progress', methods=['GET'])
def api_get_progress():
    """Get current progress."""
    from progress_manager import ensure_future_weeks_exist
    
    progress = load_progress()
    current_week = get_current_week_key()
    
    # Ensure current week exists
    ensure_week_exists(progress, current_week)
    
    # Ensure future weeks exist (for navigation)
    ensure_future_weeks_exist(progress, weeks_ahead=26)  # 6 months ahead
    
    # Save progress with future weeks
    save_progress(progress)
    
    # Get weekly summary
    summary = get_weekly_progress_summary(progress, current_week)
    
    return jsonify({
        'progress': progress,
        'current_week': current_week,
        'weekly_summary': summary
    })


@app.route('/api/progress', methods=['POST'])
def api_update_progress():
    """Update progress for a specific activity."""
    data = request.get_json()
    
    activity_id = data.get('activity_id')
    week_key = data.get('week_key')
    completed = data.get('completed', True)
    day = data.get('day')  # For shadowing practice
    mp3_file = data.get('mp3_file')  # For weekly_expressions and podcast_shadowing
    
    if not activity_id:
        return jsonify({'error': 'activity_id is required'}), 400
    
    if activity_id not in ['weekly_expressions', 'voice_journaling', 'shadowing_practice', 'weekly_speaking_prompt', 'podcast_shadowing']:
        return jsonify({'error': 'Invalid activity_id'}), 400
    
    # All activities are now daily - require day parameter
    if day is None:
        day = datetime.now().strftime('%Y-%m-%d')
    
    progress = load_progress()
    
    if week_key is None:
        week_key = get_current_week_key()
    
    # Update progress
    update_progress(progress, activity_id, week_key, completed, day, mp3_file=mp3_file)
    
    # Save to file
    try:
        if save_progress(progress):
            summary = get_weekly_progress_summary(progress, week_key)
            return jsonify({
                'success': True,
                'progress': progress,
                'weekly_summary': summary
            })
        else:
            print(f"[ERROR] save_progress returned False for week {week_key}, activity {activity_id}")
            return jsonify({'error': 'Failed to save progress to file'}), 500
    except Exception as e:
        print(f"[ERROR] Exception while saving progress: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Failed to save progress: {str(e)}'}), 500


@app.route('/api/week/<week_key>')
def api_get_week(week_key):
    """Get progress for a specific week."""
    from progress_manager import ensure_future_weeks_exist
    
    # Always reload from file to get fresh data
    progress = load_progress()
    
    # Ensure this specific week exists
    ensure_week_exists(progress, week_key)
    
    # Ensure future weeks exist (for navigation)
    ensure_future_weeks_exist(progress, weeks_ahead=26)  # 6 months ahead
    
    # Save progress with future weeks
    save_progress(progress)
    
    # Reload again to ensure we return fresh data
    progress = load_progress()
    
    summary = get_weekly_progress_summary(progress, week_key)
    return jsonify({
        'week_key': week_key,
        'progress': progress['weeks'].get(week_key, {}),
        'summary': summary
    })


@app.route('/api/activity-info', methods=['POST'])
def api_update_activity_info():
    """Update activity-specific info (video name/summary, prompt, words, script)."""
    data = request.get_json()
    
    activity_id = data.get('activity_id')
    week_key = data.get('week_key')
    field_name = data.get('field_name')
    field_value = data.get('field_value')
    
    if not activity_id or not field_name or field_value is None:
        return jsonify({'error': 'Missing required fields'}), 400
    
    progress = load_progress()
    
    if week_key is None:
        week_key = get_current_week_key()
    
    ensure_week_exists(progress, week_key)
    
    # Update the field based on activity
    if activity_id == 'voice_journaling':
        if field_name == 'topics':
            progress['weeks'][week_key]['voice_journaling']['topics'] = field_value
    elif activity_id == 'shadowing_practice':
        if field_name in ['video_name', 'script', 'audio_url']:  # video_name stores audio name
            if field_name not in progress['weeks'][week_key]['shadowing_practice']:
                progress['weeks'][week_key]['shadowing_practice'][field_name] = ''
            progress['weeks'][week_key]['shadowing_practice'][field_name] = field_value
    elif activity_id == 'weekly_speaking_prompt':
        if field_name == 'prompt':
            if 'prompt' not in progress['weeks'][week_key]['weekly_speaking_prompt']:
                progress['weeks'][week_key]['weekly_speaking_prompt']['prompt'] = ''
            progress['weeks'][week_key]['weekly_speaking_prompt']['prompt'] = field_value
        elif field_name == 'words':
            if 'words' not in progress['weeks'][week_key]['weekly_speaking_prompt']:
                progress['weeks'][week_key]['weekly_speaking_prompt']['words'] = []
            progress['weeks'][week_key]['weekly_speaking_prompt']['words'] = field_value
        elif field_name == 'best_answer_script':
            if 'best_answer_script' not in progress['weeks'][week_key]['weekly_speaking_prompt']:
                progress['weeks'][week_key]['weekly_speaking_prompt']['best_answer_script'] = ''
            progress['weeks'][week_key]['weekly_speaking_prompt']['best_answer_script'] = field_value
        elif field_name == 'best_answer_hints':
            if 'best_answer_hints' not in progress['weeks'][week_key]['weekly_speaking_prompt']:
                progress['weeks'][week_key]['weekly_speaking_prompt']['best_answer_hints'] = ''
            progress['weeks'][week_key]['weekly_speaking_prompt']['best_answer_hints'] = field_value
    elif activity_id == 'weekly_expressions':
        if field_name == 'notes':
            day = data.get('day')
            if not day:
                return jsonify({'error': 'day is required for weekly_expressions notes'}), 400
            if 'notes' not in progress['weeks'][week_key]['weekly_expressions']:
                progress['weeks'][week_key]['weekly_expressions']['notes'] = {}
            progress['weeks'][week_key]['weekly_expressions']['notes'][day] = field_value
    
    progress['last_updated'] = datetime.now().isoformat()
    
    # Save to file
    if save_progress(progress):
        return jsonify({
            'success': True,
            'progress': progress
        })
    else:
        return jsonify({'error': 'Failed to save progress'}), 500


@app.route('/api/generate/<activity_id>', methods=['POST'])
def api_generate_content(activity_id):
    """Generate content using ChatGPT for a specific activity."""
    data = request.get_json()
    week_key = data.get('week_key') if data else None
    
    if week_key is None:
        week_key = get_current_week_key()
    
    progress = load_progress()
    ensure_week_exists(progress, week_key)
    
    # Get previous weeks' content to avoid repetition
    previous_content = get_previous_weeks_content(progress, week_key)
    
    # Check if this is a regeneration (content already exists for this week)
    current_week_data = progress['weeks'][week_key]
    has_existing_content = False
    
    if activity_id == 'voice_journaling':
        has_existing_content = bool(current_week_data.get('voice_journaling', {}).get('topics'))
        # For regeneration, include current week's topics to avoid repetition
        if has_existing_content:
            current_topics = current_week_data.get('voice_journaling', {}).get('topics', [])
            if current_topics:
                previous_content['voice_journaling_topics'].extend(current_topics)
    elif activity_id == 'shadowing_practice':
        has_existing_content = bool(current_week_data.get('shadowing_practice', {}).get('script1') or 
                                   current_week_data.get('shadowing_practice', {}).get('script'))
        
        # Check if this is a future week and first-time generation
        from progress_manager import is_future_week, get_previous_week_key
        is_future = is_future_week(week_key)
        
        # If future week and no existing content, copy from previous week
        if is_future and not has_existing_content:
            prev_week_key = get_previous_week_key(week_key)
            if prev_week_key and prev_week_key in progress.get('weeks', {}):
                prev_week_data = progress['weeks'][prev_week_key].get('shadowing_practice', {})
                
                # Copy scripts and audio URLs from previous week
                if prev_week_data.get('script1') or prev_week_data.get('script'):
                    current_week_data['shadowing_practice']['script1'] = prev_week_data.get('script1') or prev_week_data.get('script', '')
                    current_week_data['shadowing_practice']['script2'] = prev_week_data.get('script2', '')
                    current_week_data['shadowing_practice']['script'] = prev_week_data.get('script1') or prev_week_data.get('script', '')
                    
                    # Copy audio URLs and settings
                    for script_num in [1, 2]:
                        for field in ['typecast_url', 'openai_url', 'typecast_voice', 'typecast_model', 'typecast_speed', 
                                     'openai_voice', 'openai_speed', 'typecast_timestamps', 'openai_timestamps']:
                            field_name = f'script{script_num}_{field}'
                            if field_name in prev_week_data:
                                current_week_data['shadowing_practice'][field_name] = prev_week_data[field_name]
                    
                    # Copy legacy fields
                    for field in ['audio_url', 'audio_typecast_url', 'audio_openai_url']:
                        if field in prev_week_data:
                            current_week_data['shadowing_practice'][field] = prev_week_data[field]
                    
                    # Mark as existing content to skip generation
                    has_existing_content = True
                    result = {
                        'script1': current_week_data['shadowing_practice'].get('script1', ''),
                        'script2': current_week_data['shadowing_practice'].get('script2', ''),
                        'copied_from_previous_week': True
                    }
                    
                    progress['last_updated'] = datetime.now().isoformat()
                    if save_progress(progress):
                        return jsonify({
                            'success': True,
                            'progress': progress,
                            'generated': result
                        })
                    else:
                        return jsonify({'error': 'Failed to save copied content'}), 500
        
        # For regeneration, include current script to avoid repetition
        if has_existing_content:
            current_script = current_week_data.get('shadowing_practice', {}).get('script1') or \
                           current_week_data.get('shadowing_practice', {}).get('script', '')
            if current_script:
                script_words = current_script.split()[:50]  # First 50 words as summary
                previous_content['shadowing_scripts'].insert(0, ' '.join(script_words))
    elif activity_id == 'weekly_speaking_prompt':
        has_existing_content = bool(current_week_data.get('weekly_speaking_prompt', {}).get('prompt'))
        # For regeneration, include current prompt to avoid repetition
        if has_existing_content:
            current_prompt = current_week_data.get('weekly_speaking_prompt', {}).get('prompt', '')
            if current_prompt:
                previous_content['weekly_prompts'].insert(0, current_prompt)
    
    try:
        if activity_id == 'voice_journaling':
            topics = generate_voice_journaling_topics(
                previous_content.get('voice_journaling_topics'),
                regenerate=has_existing_content
            )
            progress['weeks'][week_key]['voice_journaling']['topics'] = topics
            result = {'topics': topics}
            
        elif activity_id == 'shadowing_practice':
            scripts = generate_shadowing_scripts(
                previous_content.get('shadowing_scripts'),
                regenerate=has_existing_content
            )
            progress['weeks'][week_key]['shadowing_practice']['script1'] = scripts['script1']
            progress['weeks'][week_key]['shadowing_practice']['script2'] = scripts['script2']
            # Keep 'script' for backwards compatibility (defaults to script1)
            progress['weeks'][week_key]['shadowing_practice']['script'] = scripts['script1']
            
            # Reset audio URLs when scripts are regenerated
            # Clear all audio-related fields for both scripts
            for script_num in [1, 2]:
                for field in ['typecast_url', 'openai_url', 'typecast_voice', 'typecast_model', 'typecast_speed',
                             'openai_voice', 'openai_speed', 'typecast_timestamps', 'openai_timestamps']:
                    field_name = f'script{script_num}_{field}'
                    if field_name in progress['weeks'][week_key]['shadowing_practice']:
                        if field in ['typecast_speed', 'openai_speed']:
                            progress['weeks'][week_key]['shadowing_practice'][field_name] = 1.0
                        elif field == 'typecast_model':
                            progress['weeks'][week_key]['shadowing_practice'][field_name] = 'ssfm-v30'
                        else:
                            progress['weeks'][week_key]['shadowing_practice'][field_name] = ''
            
            # Clear legacy audio fields
            for field in ['audio_url', 'audio_typecast_url', 'audio_openai_url']:
                if field in progress['weeks'][week_key]['shadowing_practice']:
                    progress['weeks'][week_key]['shadowing_practice'][field] = ''
            
            result = {'script1': scripts['script1'], 'script2': scripts['script2']}
            
        elif activity_id == 'weekly_speaking_prompt':
            # Generate prompt only (original mode)
            prompt = generate_weekly_prompt(
                previous_content.get('weekly_prompts'),
                regenerate=has_existing_content,
                week_key=week_key
            )
            progress['weeks'][week_key]['weekly_speaking_prompt']['prompt'] = prompt
            result = {'prompt': prompt}
            
        else:
            return jsonify({'error': 'Invalid activity_id'}), 400
        
        progress['last_updated'] = datetime.now().isoformat()
        
        # Save to file
        if save_progress(progress):
            return jsonify({
                'success': True,
                'progress': progress,
                'generated': result
            })
        else:
            return jsonify({'error': 'Failed to save generated content'}), 500
            
    except Exception as e:
        return jsonify({'error': f'Failed to generate content: {str(e)}'}), 500


@app.route('/api/voices', methods=['GET'])
def api_get_voices():
    """Get available voices from Typecast.ai."""
    try:
        voices = get_available_voices(language='eng')  # Get English voices only
        if voices:
            return jsonify({
                'success': True,
                'voices': voices
            })
        else:
            return jsonify({'error': 'Failed to fetch voices'}), 500
    except Exception as e:
        return jsonify({'error': f'Failed to fetch voices: {str(e)}'}), 500


@app.route('/api/generate-audio-single', methods=['POST'])
def api_generate_audio_single():
    """Generate audio for a single script using both Typecast and OpenAI TTS."""
    data = request.get_json()
    week_key = data.get('week_key') if data else None
    script_num = data.get('script_num', 1) if data else 1  # 1 or 2
    voice_id = data.get('voice_id') if data else None  # Typecast voice ID
    typecast_model = data.get('typecast_model') if data else None  # Typecast model (ssfm-v21 or ssfm-v30)
    openai_voice = data.get('openai_voice') if data else None  # OpenAI voice (alloy, echo, fable, onyx, nova, shimmer)
    speed = data.get('speed', 1.0) if data else 1.0  # Default speed (used if typecast_speed/openai_speed not provided)
    typecast_speed = data.get('typecast_speed') if data else None  # Typecast-specific speed
    openai_speed = data.get('openai_speed') if data else None  # OpenAI-specific speed
    source_type = data.get('source_type') if data else None  # 'typecast', 'openai', or None (both)
    
    if week_key is None:
        week_key = get_current_week_key()
    
    progress = load_progress()
    ensure_week_exists(progress, week_key)
    
    script = progress['weeks'][week_key]['shadowing_practice'].get(f'script{script_num}', '')
    
    # Fallback to legacy 'script' field if script1 doesn't exist
    if not script and script_num == 1:
        script = progress['weeks'][week_key]['shadowing_practice'].get('script', '')
    
    if not script:
        return jsonify({'error': f'No script{script_num} available. Generate scripts first.'}), 400
    
    try:
        typecast_result = None
        openai_result = None
        typecast_error = None
        openai_error = None
        
        # Determine speeds and model to use
        typecast_speed_to_use = typecast_speed if typecast_speed is not None else speed
        openai_speed_to_use = openai_speed if openai_speed is not None else speed
        typecast_model_to_use = typecast_model if typecast_model is not None else "ssfm-v30"
        
        # Generate Typecast audio (only if source_type is None or 'typecast')
        if source_type is None or source_type == 'typecast':
            try:
                typecast_result = generate_shadowing_audio_for_week(script, f"{week_key}_script{script_num}", voice_id=voice_id, speed=typecast_speed_to_use, model=typecast_model_to_use, return_timestamps=True)
            except Exception as e:
                typecast_error = str(e)
                import traceback
                traceback.print_exc()
        
        # Generate OpenAI audio (only if source_type is None or 'openai')
        if source_type is None or source_type == 'openai':
            try:
                openai_result = generate_shadowing_audio_openai_for_week(script, f"{week_key}_script{script_num}", voice=openai_voice, speed=openai_speed_to_use, return_timestamps=True)
            except Exception as e:
                openai_error = str(e)
                import traceback
                traceback.print_exc()
        
        # Check if at least one succeeded (or the requested one succeeded)
        if source_type == 'typecast':
            if not typecast_result:
                error_msg = "Failed to generate Typecast audio."
                if typecast_error:
                    error_msg = f"Failed to generate Typecast audio: {typecast_error}"
                return jsonify({'error': error_msg}), 500
        elif source_type == 'openai':
            if not openai_result:
                error_msg = "Failed to generate OpenAI audio. "
                if openai_error:
                    error_msg += f"Error: {openai_error}. "
                return jsonify({'error': error_msg}), 500
        else:
            # Both should be generated, at least one must succeed
            if not typecast_result and not openai_result:
                error_msg = "Failed to generate both audio versions. "
                if typecast_error:
                    error_msg += f"Typecast error: {typecast_error}. "
                if openai_error:
                    error_msg += f"OpenAI error: {openai_error}. "
                return jsonify({'error': error_msg}), 500
        
        # Get voice name from available voices
        from typecast_generator import get_available_voices
        voice_name = None
        if voice_id:
            voices = get_available_voices(language='eng')
            for v in voices:
                if v.get('voice_id') == voice_id:
                    voice_name = v.get('name')
                    break
        
        # Store audio for this specific script (store what was successfully generated)
        typecast_url = None
        typecast_timestamps = None
        openai_url = None
        openai_timestamps = None
        
        if typecast_result:
            typecast_url, typecast_timestamps = typecast_result
            progress['weeks'][week_key]['shadowing_practice'][f'script{script_num}_typecast_url'] = typecast_url
            progress['weeks'][week_key]['shadowing_practice'][f'script{script_num}_typecast_timestamps'] = typecast_timestamps
            # Store Typecast settings
            if voice_name:
                progress['weeks'][week_key]['shadowing_practice'][f'script{script_num}_typecast_voice'] = voice_name
            if typecast_model_to_use:
                progress['weeks'][week_key]['shadowing_practice'][f'script{script_num}_typecast_model'] = typecast_model_to_use
            if typecast_speed_to_use:
                progress['weeks'][week_key]['shadowing_practice'][f'script{script_num}_typecast_speed'] = typecast_speed_to_use
        
        if openai_result:
            openai_url, openai_timestamps = openai_result
            progress['weeks'][week_key]['shadowing_practice'][f'script{script_num}_openai_url'] = openai_url
            progress['weeks'][week_key]['shadowing_practice'][f'script{script_num}_openai_timestamps'] = openai_timestamps
            # Store OpenAI settings
            if openai_voice:
                progress['weeks'][week_key]['shadowing_practice'][f'script{script_num}_openai_voice'] = openai_voice
            if openai_speed_to_use:
                progress['weeks'][week_key]['shadowing_practice'][f'script{script_num}_openai_speed'] = openai_speed_to_use
        
        # Update legacy fields if this is script1 (prefer Typecast, fallback to OpenAI)
        if script_num == 1:
            legacy_url = typecast_url or openai_url
            if legacy_url:
                progress['weeks'][week_key]['shadowing_practice']['audio_url'] = legacy_url
            if typecast_url:
                progress['weeks'][week_key]['shadowing_practice']['audio_typecast_url'] = typecast_url
            if openai_url:
                progress['weeks'][week_key]['shadowing_practice']['audio_openai_url'] = openai_url
        
        if voice_name:
            progress['weeks'][week_key]['shadowing_practice']['voice_name'] = voice_name
        if speed:
            progress['weeks'][week_key]['shadowing_practice']['audio_speed'] = speed
        progress['last_updated'] = datetime.now().isoformat()
        
        # Save to file
        if save_progress(progress):
            result = {
                'success': True,
                'progress': progress,
                'typecast_url': typecast_url,
                'openai_url': openai_url,
                'typecast_timestamps': typecast_timestamps,
                'openai_timestamps': openai_timestamps,
                'warnings': []
            }
            
            # Add warnings if one failed (only when generating both)
            if source_type is None:
                if not typecast_result:
                    result['warnings'].append('Typecast audio generation failed')
                if not openai_result:
                    result['warnings'].append('OpenAI audio generation failed')
            
            try:
                return jsonify(result)
            except (BrokenPipeError, OSError) as e:
                # Connection was closed by client, but we still saved the progress
                print(f"Connection closed by client during response: {e}")
                # Return a simple response that won't cause issues
                return jsonify({'success': True, 'note': 'Audio generated but connection closed'}), 200
        else:
            return jsonify({'error': 'Failed to save audio URLs'}), 500
            
    except BrokenPipeError as e:
        # Client disconnected during processing
        print(f"Broken pipe error - client disconnected: {e}")
        return jsonify({'error': 'Connection interrupted. Audio generation may have completed. Please refresh the page.'}), 500
    except OSError as e:
        # Other connection-related errors
        if e.errno == 32:  # Broken pipe
            print(f"Broken pipe error (errno 32): {e}")
            return jsonify({'error': 'Connection interrupted. Audio generation may have completed. Please refresh the page.'}), 500
        else:
            print(f"OS error: {e}")
            return jsonify({'error': f'Failed to generate audio: {str(e)}'}), 500
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Failed to generate audio: {str(e)}'}), 500


@app.route('/api/generate-weekly-prompt-audio', methods=['POST'])
def api_generate_weekly_prompt_audio():
    """Generate audio for weekly prompt best answer script using both Typecast and OpenAI TTS."""
    data = request.get_json()
    week_key = data.get('week_key') if data else None
    voice_id = data.get('voice_id') if data else None  # Typecast voice ID
    typecast_model = data.get('typecast_model') if data else None  # Typecast model (ssfm-v21 or ssfm-v30)
    openai_voice = data.get('openai_voice') if data else None  # OpenAI voice (alloy, echo, fable, onyx, nova, shimmer)
    speed = data.get('speed', 1.0) if data else 1.0  # Default speed
    typecast_speed = data.get('typecast_speed') if data else None  # Typecast-specific speed
    openai_speed = data.get('openai_speed') if data else None  # OpenAI-specific speed
    source_type = data.get('source_type') if data else None  # 'typecast', 'openai', or None (both)
    
    if week_key is None:
        week_key = get_current_week_key()
    
    progress = load_progress()
    ensure_week_exists(progress, week_key)
    
    # Check if shadowing mode is active
    from progress_manager import is_shadowing_mode
    if not is_shadowing_mode(week_key):
        return jsonify({'error': 'Audio generation is only available in shadowing mode (weeks <= 2025-W52)'}), 400
    
    script = progress['weeks'][week_key]['weekly_speaking_prompt'].get('best_answer_script', '')
    
    if not script:
        return jsonify({'error': 'No best answer script available. Generate the best answer script first.'}), 400
    
    try:
        typecast_result = None
        openai_result = None
        typecast_error = None
        openai_error = None
        
        # Determine speeds and model to use
        typecast_speed_to_use = typecast_speed if typecast_speed is not None else speed
        openai_speed_to_use = openai_speed if openai_speed is not None else speed
        typecast_model_to_use = typecast_model if typecast_model is not None else "ssfm-v30"
        
        # Generate Typecast audio (only if source_type is None or 'typecast')
        if source_type is None or source_type == 'typecast':
            try:
                typecast_result = generate_shadowing_audio_for_week(script, f"{week_key}_best_answer", voice_id=voice_id, speed=typecast_speed_to_use, model=typecast_model_to_use, return_timestamps=True)
            except Exception as e:
                typecast_error = str(e)
                import traceback
                traceback.print_exc()
        
        # Generate OpenAI audio (only if source_type is None or 'openai')
        if source_type is None or source_type == 'openai':
            try:
                openai_result = generate_shadowing_audio_openai_for_week(script, f"{week_key}_best_answer", voice=openai_voice, speed=openai_speed_to_use, return_timestamps=True)
            except Exception as e:
                openai_error = str(e)
                import traceback
                traceback.print_exc()
        
        # Check if at least one succeeded
        if source_type == 'typecast':
            if not typecast_result:
                error_msg = "Failed to generate Typecast audio."
                if typecast_error:
                    error_msg = f"Failed to generate Typecast audio: {typecast_error}"
                return jsonify({'error': error_msg}), 500
        elif source_type == 'openai':
            if not openai_result:
                error_msg = "Failed to generate OpenAI audio. "
                if openai_error:
                    error_msg += f"Error: {openai_error}. "
                return jsonify({'error': error_msg}), 500
        else:
            # Both should be generated, at least one must succeed
            if not typecast_result and not openai_result:
                error_msg = "Failed to generate both audio versions. "
                if typecast_error:
                    error_msg += f"Typecast error: {typecast_error}. "
                if openai_error:
                    error_msg += f"OpenAI error: {openai_error}. "
                return jsonify({'error': error_msg}), 500
        
        # Get voice name from available voices
        from typecast_generator import get_available_voices
        voice_name = None
        if voice_id:
            voices = get_available_voices(language='eng')
            for v in voices:
                if v.get('voice_id') == voice_id:
                    voice_name = v.get('name')
                    break
        
        # Store audio for best answer
        typecast_url = None
        typecast_timestamps = None
        openai_url = None
        openai_timestamps = None
        
        if typecast_result:
            typecast_url, typecast_timestamps = typecast_result
            progress['weeks'][week_key]['weekly_speaking_prompt']['best_answer_typecast_url'] = typecast_url
            progress['weeks'][week_key]['weekly_speaking_prompt']['best_answer_timestamps'] = typecast_timestamps
        
        if openai_result:
            openai_url, openai_timestamps = openai_result
            progress['weeks'][week_key]['weekly_speaking_prompt']['best_answer_openai_url'] = openai_url
            # Update timestamps if OpenAI is available (prefer OpenAI timestamps if both exist)
            if openai_timestamps:
                progress['weeks'][week_key]['weekly_speaking_prompt']['best_answer_timestamps'] = openai_timestamps
        
        progress['last_updated'] = datetime.now().isoformat()
        
        # Save to file
        if save_progress(progress):
            result = {
                'success': True,
                'progress': progress,
                'typecast_url': typecast_url,
                'openai_url': openai_url,
                'typecast_timestamps': typecast_timestamps,
                'openai_timestamps': openai_timestamps,
                'warnings': []
            }
            
            # Add warnings if one failed (only when generating both)
            if source_type is None:
                if not typecast_result:
                    result['warnings'].append('Typecast audio generation failed')
                if not openai_result:
                    result['warnings'].append('OpenAI audio generation failed')
            
            return jsonify(result)
        else:
            return jsonify({'error': 'Failed to save audio URLs'}), 500
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Failed to generate audio: {str(e)}'}), 500


@app.route('/api/generate-audio', methods=['POST'])
def api_generate_audio():
    """
    Generate audio from both scripts using both Typecast and OpenAI TTS.
    NOTE: This endpoint is legacy and may not be actively used.
    For new code, use /api/generate-audio-single instead.
    """
    data = request.get_json()
    week_key = data.get('week_key') if data else None
    voice_id = data.get('voice_id') if data else None
    speed = data.get('speed', 1.0) if data else 1.0
    
    if week_key is None:
        week_key = get_current_week_key()
    
    progress = load_progress()
    ensure_week_exists(progress, week_key)
    
    script1 = progress['weeks'][week_key]['shadowing_practice'].get('script1', '')
    script2 = progress['weeks'][week_key]['shadowing_practice'].get('script2', '')
    
    # Fallback to legacy 'script' field if script1 doesn't exist
    if not script1:
        script1 = progress['weeks'][week_key]['shadowing_practice'].get('script', '')
    
    if not script1:
        return jsonify({'error': 'No scripts available. Generate scripts first.'}), 400
    
    try:
        # Generate audio for Script 1
        typecast_result1 = generate_shadowing_audio_for_week(script1, f"{week_key}_script1", voice_id=voice_id, speed=speed, return_timestamps=True)
        openai_result1 = generate_shadowing_audio_openai_for_week(script1, f"{week_key}_script1", speed=speed, return_timestamps=True)
        
        # Generate audio for Script 2 (if it exists)
        typecast_result2 = None
        openai_result2 = None
        if script2:
            typecast_result2 = generate_shadowing_audio_for_week(script2, f"{week_key}_script2", voice_id=voice_id, speed=speed, return_timestamps=True)
            openai_result2 = generate_shadowing_audio_openai_for_week(script2, f"{week_key}_script2", speed=speed, return_timestamps=True)
        
        if typecast_result1 and openai_result1:
            typecast_url1, typecast_timestamps1 = typecast_result1
            openai_url1, openai_timestamps1 = openai_result1
            
            # Get voice name from available voices
            from typecast_generator import get_available_voices
            voice_name = None
            if voice_id:
                voices = get_available_voices(language='eng')
                for v in voices:
                    if v.get('voice_id') == voice_id:
                        voice_name = v.get('name')
                        break
            
            # Store Script 1 audio
            progress['weeks'][week_key]['shadowing_practice']['script1_typecast_url'] = typecast_url1
            progress['weeks'][week_key]['shadowing_practice']['script1_openai_url'] = openai_url1
            progress['weeks'][week_key]['shadowing_practice']['script1_typecast_timestamps'] = typecast_timestamps1
            progress['weeks'][week_key]['shadowing_practice']['script1_openai_timestamps'] = openai_timestamps1
            
            # Store Script 2 audio (if generated)
            if typecast_result2 and openai_result2:
                typecast_url2, typecast_timestamps2 = typecast_result2
                openai_url2, openai_timestamps2 = openai_result2
                progress['weeks'][week_key]['shadowing_practice']['script2_typecast_url'] = typecast_url2
                progress['weeks'][week_key]['shadowing_practice']['script2_openai_url'] = openai_url2
                progress['weeks'][week_key]['shadowing_practice']['script2_typecast_timestamps'] = typecast_timestamps2
                progress['weeks'][week_key]['shadowing_practice']['script2_openai_timestamps'] = openai_timestamps2
            
            # Keep legacy fields for backwards compatibility (pointing to script1)
            progress['weeks'][week_key]['shadowing_practice']['audio_url'] = typecast_url1
            progress['weeks'][week_key]['shadowing_practice']['audio_typecast_url'] = typecast_url1
            progress['weeks'][week_key]['shadowing_practice']['audio_openai_url'] = openai_url1
            
            if voice_name:
                progress['weeks'][week_key]['shadowing_practice']['voice_name'] = voice_name
            if speed:
                progress['weeks'][week_key]['shadowing_practice']['audio_speed'] = speed
            progress['last_updated'] = datetime.now().isoformat()
            
            # Save to file
            if save_progress(progress):
                result = {
                    'success': True,
                    'progress': progress,
                    'script1_typecast_url': typecast_url1,
                    'script1_openai_url': openai_url1,
                    'script1_typecast_timestamps': typecast_timestamps1,
                    'script1_openai_timestamps': openai_timestamps1
                }
                if typecast_result2 and openai_result2:
                    result['script2_typecast_url'] = typecast_url2
                    result['script2_openai_url'] = openai_url2
                    result['script2_typecast_timestamps'] = typecast_timestamps2
                    result['script2_openai_timestamps'] = openai_timestamps2
                return jsonify(result)
            else:
                return jsonify({'error': 'Failed to save audio URLs'}), 500
        else:
            return jsonify({'error': 'Failed to generate audio for Script 1'}), 500
            
    except Exception as e:
        return jsonify({'error': f'Failed to generate audio: {str(e)}'}), 500


@app.route('/api/generate-all', methods=['POST'])
def api_generate_all():
    """Generate all weekly content (words, script, prompt, audio) using ChatGPT and Typecast.ai."""
    data = request.get_json()
    week_key = data.get('week_key') if data else None
    
    if week_key is None:
        week_key = get_current_week_key()
    
    progress = load_progress()
    ensure_week_exists(progress, week_key)
    
    # Get previous weeks' content to avoid repetition
    previous_content = get_previous_weeks_content(progress, week_key)
    
    # If regenerating (week already has content), include current week's content to ensure it generates different content
    current_week_data = progress['weeks'][week_key]
    has_existing_content = (
        current_week_data.get('voice_journaling', {}).get('topics') or
        current_week_data.get('shadowing_practice', {}).get('script') or
        current_week_data.get('weekly_speaking_prompt', {}).get('prompt')
    )
    
    # Check if this is a future week and first-time generation for shadowing_practice
    from progress_manager import is_future_week, get_previous_week_key
    is_future = is_future_week(week_key)
    shadowing_copied = False
    
    # If future week and no existing shadowing content, copy from previous week
    if is_future and not current_week_data.get('shadowing_practice', {}).get('script1') and not current_week_data.get('shadowing_practice', {}).get('script'):
        prev_week_key = get_previous_week_key(week_key)
        if prev_week_key and prev_week_key in progress.get('weeks', {}):
            prev_week_data = progress['weeks'][prev_week_key].get('shadowing_practice', {})
            
            # Copy scripts and audio URLs from previous week
            if prev_week_data.get('script1') or prev_week_data.get('script'):
                current_week_data['shadowing_practice']['script1'] = prev_week_data.get('script1') or prev_week_data.get('script', '')
                current_week_data['shadowing_practice']['script2'] = prev_week_data.get('script2', '')
                current_week_data['shadowing_practice']['script'] = prev_week_data.get('script1') or prev_week_data.get('script', '')
                
                # Copy audio URLs and settings
                for script_num in [1, 2]:
                    for field in ['typecast_url', 'openai_url', 'typecast_voice', 'typecast_model', 'typecast_speed', 
                                 'openai_voice', 'openai_speed', 'typecast_timestamps', 'openai_timestamps']:
                        field_name = f'script{script_num}_{field}'
                        if field_name in prev_week_data:
                            current_week_data['shadowing_practice'][field_name] = prev_week_data[field_name]
                
                # Copy legacy fields
                for field in ['audio_url', 'audio_typecast_url', 'audio_openai_url']:
                    if field in prev_week_data:
                        current_week_data['shadowing_practice'][field] = prev_week_data[field]
                
                shadowing_copied = True
    
    if has_existing_content:
        # Include current week's content to avoid regenerating the same content
        current_topics = current_week_data.get('voice_journaling', {}).get('topics', [])
        if current_topics:
            # Add current week's topics to the avoid list
            previous_content['voice_journaling_topics'].extend(current_topics)
        
        current_weekly_words = current_week_data.get('weekly_speaking_prompt', {}).get('words', [])
        if current_weekly_words:
            current_weekly_word_list = [w.get('word', w) if isinstance(w, dict) else w for w in current_weekly_words]
            previous_content['weekly_prompt_words'].extend(current_weekly_word_list)
        
        # Add current script and prompt to previous lists for reference
        # For regeneration, include the full script start (not just summary) to avoid regenerating the same content
        current_script = current_week_data.get('shadowing_practice', {}).get('script', '')
        if current_script:
            # Include more of the current script to ensure different content
            script_words = current_script.split()[:300]  # First 300 words to identify the script
            previous_content['shadowing_scripts'].insert(0, ' '.join(script_words))  # Add at beginning
        
        current_prompt = current_week_data.get('weekly_speaking_prompt', {}).get('prompt', '')
        if current_prompt:
            previous_content['weekly_prompts'].insert(0, current_prompt)  # Add at beginning
    
    try:
        # Generate all content with previous context
        # Pass a flag to indicate regeneration for more variation
        voice_journaling_topics = generate_voice_journaling_topics(
            previous_content.get('voice_journaling_topics'),
            regenerate=has_existing_content
        )  # 7 daily topics
        
        # Only generate scripts if not copied from previous week
        if not shadowing_copied:
            scripts = generate_shadowing_scripts(
                previous_content.get('shadowing_scripts'),
                regenerate=has_existing_content
            )
            progress['weeks'][week_key]['shadowing_practice']['script1'] = scripts['script1']
            progress['weeks'][week_key]['shadowing_practice']['script2'] = scripts['script2']
            # Keep 'script' for backwards compatibility (defaults to script1)
            progress['weeks'][week_key]['shadowing_practice']['script'] = scripts['script1']
            
            # Reset audio URLs when scripts are regenerated
            # Clear all audio-related fields for both scripts
            for script_num in [1, 2]:
                for field in ['typecast_url', 'openai_url', 'typecast_voice', 'typecast_model', 'typecast_speed',
                             'openai_voice', 'openai_speed', 'typecast_timestamps', 'openai_timestamps']:
                    field_name = f'script{script_num}_{field}'
                    if field_name in progress['weeks'][week_key]['shadowing_practice']:
                        if field in ['typecast_speed', 'openai_speed']:
                            progress['weeks'][week_key]['shadowing_practice'][field_name] = 1.0
                        elif field == 'typecast_model':
                            progress['weeks'][week_key]['shadowing_practice'][field_name] = 'ssfm-v30'
                        else:
                            progress['weeks'][week_key]['shadowing_practice'][field_name] = ''
            
            # Clear legacy audio fields
            for field in ['audio_url', 'audio_typecast_url', 'audio_openai_url']:
                if field in progress['weeks'][week_key]['shadowing_practice']:
                    progress['weeks'][week_key]['shadowing_practice'][field] = ''
        
        # Generate prompt only (original mode)
        prompt = generate_weekly_prompt(
            previous_content.get('weekly_prompts'),
            regenerate=has_existing_content,
            week_key=week_key
        )
        
        weekly_prompt_words = generate_weekly_prompt_words(
            previous_content.get('weekly_prompt_words'),
            regenerate=has_existing_content
        )  # 5 words
        
        # NOTE: Audio generation is handled separately via the "Generate audio" button
        # We don't automatically generate audio here to give users control and avoid wasting API credits
        
        # Update progress
        progress['weeks'][week_key]['voice_journaling']['topics'] = voice_journaling_topics
        # Note: shadowing_practice scripts are already updated above (either copied or generated)
        # Note: audio_url is NOT updated here - use separate "Generate audio" button
        progress['weeks'][week_key]['weekly_speaking_prompt']['prompt'] = prompt
        progress['weeks'][week_key]['weekly_speaking_prompt']['words'] = weekly_prompt_words
        
        # Check if shadowing mode is active (weeks <= 2025-W52)
        from progress_manager import is_shadowing_mode
        if is_shadowing_mode(week_key):
            # Generate best answer script and hints for shadowing mode
            from chatgpt_generator import generate_weekly_prompt_best_answer
            best_answer_data = generate_weekly_prompt_best_answer(
                previous_content.get('weekly_prompts'),
                regenerate=has_existing_content,
                week_key=week_key
            )
            progress['weeks'][week_key]['weekly_speaking_prompt']['best_answer_script'] = best_answer_data['best_answer_script']
            progress['weeks'][week_key]['weekly_speaking_prompt']['best_answer_hints'] = best_answer_data['best_answer_hints']
        
        progress['last_updated'] = datetime.now().isoformat()
        
        # Save to file - force save before returning
        if save_progress(progress):
            # Reload progress to ensure fresh data
            progress = load_progress()
            
            return jsonify({
                'success': True,
                'progress': progress,
                'regenerated': has_existing_content,  # Indicate if this was a regeneration
                'generated': {
                    'voice_journaling_topics': voice_journaling_topics,
                    'script1': scripts['script1'],
                    'script2': scripts['script2'],
                    'audio_url': None,  # Audio is generated separately via "Generate audio" button
                    'prompt': prompt,
                    'weekly_prompt_words': weekly_prompt_words,
                }
            })
        else:
            return jsonify({'error': 'Failed to save generated content'}), 500
            
    except Exception as e:
        print(f"[ERROR] Failed to generate content: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Failed to generate content: {str(e)}'}), 500


@app.route('/api/save-notes', methods=['POST'])
def api_save_notes():
    """Save notes for weekly speaking prompt."""
    data = request.get_json()
    week_key = data.get('week_key')
    notes = data.get('notes', '')
    
    if not week_key:
        week_key = get_current_week_key()
    
    progress = load_progress()
    ensure_week_exists(progress, week_key)
    
    # Save notes
    progress['weeks'][week_key]['weekly_speaking_prompt']['notes'] = notes
    progress['last_updated'] = datetime.now(pytz.timezone('America/Los_Angeles')).isoformat()
    
    if save_progress(progress):
        return jsonify({'success': True})
    else:
        return jsonify({'error': 'Failed to save notes'}), 500


def transcribe_audio(filepath):
    """
    Transcribe audio file using OpenAI Whisper API.
    
    Args:
        filepath: Path to the audio file
        
    Returns:
        Transcription text as string, or None if transcription fails
    """
    try:
        client = get_openai_client()
        
        # Open the audio file in binary mode
        with open(filepath, 'rb') as audio_file:
            # Use Whisper API for transcription
            # The file parameter expects a file-like object opened in binary mode
            transcript = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                language="en"  # Specify English for better accuracy
            )
            
            return transcript.text
    except Exception as e:
        print(f"Error transcribing audio: {e}")
        import traceback
        traceback.print_exc()
        return None


@app.route('/api/save-recording', methods=['POST'])
def api_save_recording():
    """Save audio recording for an activity."""
    PST = pytz.timezone('America/Los_Angeles')
    
    if 'audio' not in request.files:
        return jsonify({'error': 'No audio file provided'}), 400
    
    audio_file = request.files['audio']
    activity_id = request.form.get('activity_id')
    week_key = request.form.get('week_key')
    day = request.form.get('day')
    
    if not activity_id or activity_id not in ['weekly_expressions', 'voice_journaling', 'shadowing_practice', 'weekly_speaking_prompt', 'podcast_shadowing']:
        return jsonify({'error': 'Invalid or missing activity_id'}), 400
    
    if not week_key:
        week_key = get_current_week_key()
    
    if not day:
        day = datetime.now(PST).strftime('%Y-%m-%d')
    
    # Create recordings directory structure
    recordings_dir = os.path.join('recordings', week_key, activity_id)
    os.makedirs(recordings_dir, exist_ok=True)
    
    # Generate filename with timestamp
    timestamp = datetime.now(PST).strftime('%Y%m%d_%H%M%S')
    # Extract day name and number from day string (e.g., "2024-11-02" -> "sat_1")
    day_name = datetime.strptime(day, '%Y-%m-%d').strftime('%a').lower()
    
    # Get the day number (1-7) from progress data
    progress = load_progress()
    ensure_week_exists(progress, week_key)
    
    # Find which day number this is (sun=1, mon=2, ..., sat=7)
    week_data = progress['weeks'][week_key]
    day_num = 1
    for activity in ['voice_journaling', 'shadowing_practice', 'weekly_speaking_prompt', 'podcast_shadowing']:
        if activity in week_data and 'days' in week_data[activity]:
            for d in week_data[activity]['days']:
                if d.get('date') == day:
                    day_num = d.get('day_num', 1)
                    break
    
    filename = f"{day_name}_{day_num}_{timestamp}.webm"
    filepath = os.path.join(recordings_dir, filename)
    
    # Save the audio file
    audio_file.save(filepath)
    
    # Transcribe audio if this is a voice journaling recording
    transcription = None
    if activity_id == 'voice_journaling':
        try:
            transcription = transcribe_audio(filepath)
            if transcription:
                print(f"Transcription successful for {filename}")
            else:
                print(f"Transcription failed for {filename}")
        except Exception as e:
            print(f"Error during transcription: {e}")
            # Don't fail the whole request if transcription fails
            transcription = None
    
    # Update progress.json with recording metadata
    if activity_id not in progress['weeks'][week_key]:
        progress['weeks'][week_key][activity_id] = {}
    
    if 'recordings' not in progress['weeks'][week_key][activity_id]:
        progress['weeks'][week_key][activity_id]['recordings'] = {}
    
    if day not in progress['weeks'][week_key][activity_id]['recordings']:
        progress['weeks'][week_key][activity_id]['recordings'][day] = []
    
    # Add recording metadata
    recording_metadata = {
        'filename': filename,
        'url': f'/recordings/{week_key}/{activity_id}/{filename}',
        'timestamp': timestamp,
        'date': day
    }
    
    # Add transcription if available
    if transcription:
        recording_metadata['transcription'] = transcription
    
    progress['weeks'][week_key][activity_id]['recordings'][day].append(recording_metadata)
    progress['last_updated'] = datetime.now(PST).isoformat()
    
    if save_progress(progress):
        return jsonify({
            'success': True,
            'recording': recording_metadata,
            'day': day
        })
    else:
        return jsonify({'error': 'Failed to save recording metadata'}), 500


@app.route('/recordings/<path:filepath>')
def serve_recording(filepath):
    """Serve recorded audio files."""
    recordings_dir = os.path.join(os.getcwd(), 'recordings')
    return send_from_directory(recordings_dir, filepath)


@app.route('/api/get-recordings', methods=['POST'])
def api_get_recordings():
    """Get recordings for a specific activity and day."""
    data = request.get_json()
    activity_id = data.get('activity_id')
    week_key = data.get('week_key')
    day = data.get('day')
    
    if not activity_id:
        return jsonify({'error': 'activity_id is required'}), 400
    
    if not week_key:
        week_key = get_current_week_key()
    
    if not day:
        PST = pytz.timezone('America/Los_Angeles')
        day = datetime.now(PST).strftime('%Y-%m-%d')
    
    progress = load_progress()
    ensure_week_exists(progress, week_key)
    
    recordings = []
    if (week_key in progress['weeks'] and 
        activity_id in progress['weeks'][week_key] and
        'recordings' in progress['weeks'][week_key][activity_id] and
        day in progress['weeks'][week_key][activity_id]['recordings']):
        recordings = progress['weeks'][week_key][activity_id]['recordings'][day]
    
    return jsonify({
        'success': True,
        'recordings': recordings
    })


@app.route('/api/delete-recording', methods=['POST'])
def api_delete_recording():
    """Delete a recording."""
    data = request.get_json()
    activity_id = data.get('activity_id')
    week_key = data.get('week_key')
    day = data.get('day')
    filename = data.get('filename')
    
    if not all([activity_id, week_key, day, filename]):
        return jsonify({'error': 'Missing required parameters'}), 400
    
    # Delete the file
    recordings_dir = os.path.join('recordings', week_key, activity_id)
    filepath = os.path.join(recordings_dir, filename)
    
    try:
        if os.path.exists(filepath):
            os.remove(filepath)
        
        # Update progress.json
        progress = load_progress()
        if (week_key in progress['weeks'] and
            activity_id in progress['weeks'][week_key] and
            'recordings' in progress['weeks'][week_key][activity_id] and
            day in progress['weeks'][week_key][activity_id]['recordings']):
            
            # Remove the recording from the list
            recordings = progress['weeks'][week_key][activity_id]['recordings'][day]
            progress['weeks'][week_key][activity_id]['recordings'][day] = [
                r for r in recordings if r['filename'] != filename
            ]
            
            # Remove the day key if no recordings left
            if not progress['weeks'][week_key][activity_id]['recordings'][day]:
                del progress['weeks'][week_key][activity_id]['recordings'][day]
            
            PST = pytz.timezone('America/Los_Angeles')
            progress['last_updated'] = datetime.now(PST).isoformat()
            
            if save_progress(progress):
                return jsonify({'success': True})
            else:
                return jsonify({'error': 'Failed to save progress'}), 500
        else:
            return jsonify({'success': True})  # Already deleted
            
    except Exception as e:
        print(f"Error deleting recording: {e}")
        return jsonify({'error': f'Failed to delete recording: {str(e)}'}), 500


@app.route('/api/weekly-expressions/mp3-list', methods=['GET'])
def api_get_mp3_list():
    """Get list of available MP3 files."""
    mp3_dir = 'references/네이티브 영어표현력 사전_mp3'
    
    if not os.path.exists(mp3_dir):
        return jsonify({'error': 'MP3 directory not found'}), 404
    
    try:
        mp3_files = [f for f in os.listdir(mp3_dir) if f.endswith('.mp3')]
        mp3_files.sort()  # Sort alphabetically
        return jsonify({
            'success': True,
            'mp3_files': mp3_files
        })
    except Exception as e:
        return jsonify({'error': f'Failed to list MP3 files: {str(e)}'}), 500


@app.route('/api/weekly-expressions/mp3/<path:filename>', methods=['GET'])
def api_serve_mp3(filename):
    """Serve MP3 files."""
    mp3_dir = 'references/네이티브 영어표현력 사전_mp3'
    
    # Security: ensure filename doesn't contain path traversal
    if '..' in filename or '/' in filename or '\\' in filename:
        return jsonify({'error': 'Invalid filename'}), 400
    
    if not os.path.exists(mp3_dir):
        return jsonify({'error': 'MP3 directory not found'}), 404
    
    filepath = os.path.join(mp3_dir, filename)
    
    if not os.path.exists(filepath) or not filename.endswith('.mp3'):
        return jsonify({'error': 'File not found'}), 404
    
    return send_from_directory(mp3_dir, filename, mimetype='audio/mpeg')


@app.route('/api/weekly-expressions/select-mp3', methods=['POST'])
def api_select_mp3():
    """Select an MP3 file for a specific week."""
    data = request.get_json()
    week_key = data.get('week_key') if data else None
    mp3_file = data.get('mp3_file') if data else None
    
    if week_key is None:
        week_key = get_current_week_key()
    
    if not mp3_file:
        return jsonify({'error': 'mp3_file is required'}), 400
    
    # Security: ensure filename doesn't contain path traversal
    if '..' in mp3_file or '/' in mp3_file or '\\' in mp3_file:
        return jsonify({'error': 'Invalid filename'}), 400
    
    progress = load_progress()
    ensure_week_exists(progress, week_key)
    
    # Verify file exists
    mp3_dir = 'references/네이티브 영어표현력 사전_mp3'
    filepath = os.path.join(mp3_dir, mp3_file)
    if not os.path.exists(filepath):
        return jsonify({'error': 'MP3 file not found'}), 404
    
    # Store selected MP3 file
    if 'weekly_expressions' not in progress['weeks'][week_key]:
        progress['weeks'][week_key]['weekly_expressions'] = {
            'completed_days': [],
            'mp3_file': ''
        }
    
    progress['weeks'][week_key]['weekly_expressions']['mp3_file'] = mp3_file
    progress['last_updated'] = datetime.now().isoformat()
    
    if save_progress(progress):
        return jsonify({
            'success': True,
            'mp3_file': mp3_file,
            'progress': progress
        })
    else:
        return jsonify({'error': 'Failed to save MP3 selection'}), 500


@app.route('/api/weekly-expressions/regenerate', methods=['POST'])
def api_regenerate_weekly_expressions_mp3():
    """Get a random MP3 file for weekly expressions, preferring unused files."""
    from progress_manager import get_random_mp3_file
    
    data = request.get_json()
    week_key = data.get('week_key') if data else None
    
    if week_key is None:
        week_key = get_current_week_key()
    
    progress = load_progress()
    ensure_week_exists(progress, week_key)
    
    # Get current MP3 file to exclude it from selection
    current_mp3 = progress['weeks'][week_key].get('weekly_expressions', {}).get('mp3_file', '')
    
    # Get random MP3 file (preferring unused files)
    new_mp3_file = get_random_mp3_file(week_key, progress, exclude_current=current_mp3)
    
    if not new_mp3_file:
        return jsonify({'error': 'No MP3 files available'}), 404
    
    # Update the MP3 file for this week
    progress['weeks'][week_key]['weekly_expressions']['mp3_file'] = new_mp3_file
    progress['last_updated'] = datetime.now().isoformat()
    
    if save_progress(progress):
        return jsonify({
            'success': True,
            'mp3_file': new_mp3_file,
            'progress': progress
        })
    else:
        return jsonify({'error': 'Failed to save MP3 selection'}), 500


@app.route('/api/podcast-shadowing/mp3/<path:filename>', methods=['GET'])
def api_serve_podcast_shadowing_mp3(filename):
    """Serve MP3 files for podcast_shadowing (podcast clips)."""
    clips_dir = 'youtube-transcriber-for-shadowing/test_data/clips'
    
    # Security: ensure filename doesn't contain path traversal
    if '..' in filename or '/' in filename or '\\' in filename:
        return jsonify({'error': 'Invalid filename'}), 400
    
    if not os.path.exists(clips_dir):
        return jsonify({'error': 'Clips directory not found'}), 404
    
    filepath = os.path.join(clips_dir, filename)
    
    if not os.path.exists(filepath) or not filename.endswith('.mp3'):
        return jsonify({'error': 'File not found'}), 404
    
    return send_from_directory(clips_dir, filename, mimetype='audio/mpeg')


def remove_transcript_header(transcript_text: str) -> str:
    """Remove metadata header (Chapter, Video, Time, separator) and HTML comments from transcript."""
    import re
    lines = transcript_text.split('\n')
    content_lines = []
    skip_header = True
    
    for line in lines:
        if skip_header:
            # Skip header lines (Chapter, Video, Time, Model, separator, empty lines after separator)
            if line.startswith('Chapter') or line.startswith('Video') or line.startswith('Time') or line.startswith('Model'):
                continue
            if line.strip().startswith('=') or line.strip() == '':
                continue
            # First non-header line found, start collecting content
            skip_header = False
        
        if not skip_header:
            # Skip HTML comments (e.g., <!--TIMESTAMP:00:00-->)
            stripped = line.strip()
            if stripped.startswith('<!--') and stripped.endswith('-->'):
                continue
            # Skip lines that are just bracketed text like ["Bloodline"] or [timestamp] ["text"]
            # Also skip lines that are just quoted text like "Bloodline" (transcription artifacts)
            # Skip lines that are only brackets: ["text"] or [timestamp] ["text"]
            if re.match(r'^\[.*?\]\s*$', stripped) or re.match(r'^\[\d{2}:\d{2}\]\s*\[.*?\]\s*$', stripped):
                continue
            # Skip lines that are only quoted text: "text" (likely transcription artifacts)
            if re.match(r'^"[^"]*"\s*$', stripped):
                continue
            content_lines.append(line)
    
    # Join and clean up
    result = '\n'.join(content_lines).strip()
    return result


@app.route('/api/podcast-shadowing/generate-typecast-audio', methods=['POST'])
def api_generate_podcast_typecast_audio():
    """Generate Typecast audio from podcast transcript."""
    data = request.get_json()
    week_key = data.get('week_key') if data else None
    voice_id = data.get('voice_id') if data else None
    speed = float(data.get('speed', 1.0)) if data else 1.0
    model = data.get('model', 'ssfm-v30') if data else 'ssfm-v30'
    
    if week_key is None:
        week_key = get_current_week_key()
    
    progress = load_progress()
    ensure_week_exists(progress, week_key)
    
    # Get transcript path
    transcript_path = progress['weeks'][week_key].get('podcast_shadowing', {}).get('transcript_path', '')
    
    if not transcript_path:
        return jsonify({'error': 'No transcript available for this clip'}), 400
    
    # Read transcript file
    try:
        full_path = os.path.join(os.getcwd(), transcript_path)
        if not os.path.exists(full_path):
            return jsonify({'error': 'Transcript file not found'}), 404
        
        with open(full_path, 'r', encoding='utf-8') as f:
            raw_transcript = f.read()
        
        # Get formatted transcript (remove header, get script text)
        # Only use existing formatted file if it exists, never auto-format with ChatGPT
        try:
            formatted_path = full_path.replace('.txt', '_formatted.txt')
            if os.path.exists(formatted_path):
                # Use existing formatted file
                with open(formatted_path, 'r', encoding='utf-8') as f:
                    formatted_transcript = f.read()
                script_text = remove_transcript_header(formatted_transcript)
            else:
                # If formatted file doesn't exist, use raw transcript (no auto-formatting)
                script_text = remove_transcript_header(raw_transcript)
        except Exception as e:
            print(f"Warning: Failed to read transcript: {e}")
            script_text = remove_transcript_header(raw_transcript)
        
        if not script_text or not script_text.strip():
            return jsonify({'error': 'No transcript content found'}), 400
        
        # Generate Typecast audio
        try:
            typecast_result = generate_shadowing_audio_for_week(
                script_text, 
                f"{week_key}_podcast", 
                voice_id=voice_id, 
                speed=speed, 
                model=model, 
                return_timestamps=True
            )
            
            if typecast_result:
                audio_url, timestamps = typecast_result
                
                # Update progress
                progress['weeks'][week_key]['podcast_shadowing']['typecast_audio_url'] = audio_url
                progress['weeks'][week_key]['podcast_shadowing']['typecast_voice'] = voice_id or ""
                progress['weeks'][week_key]['podcast_shadowing']['typecast_speed'] = speed
                progress['weeks'][week_key]['podcast_shadowing']['typecast_model'] = model
                progress['last_updated'] = datetime.now().isoformat()
                
                if save_progress(progress):
                    return jsonify({
                        'success': True,
                        'audio_url': audio_url,
                        'timestamps': timestamps,
                        'voice': voice_id or "",
                        'speed': speed,
                        'model': model
                    })
                else:
                    return jsonify({'error': 'Failed to save progress'}), 500
            else:
                return jsonify({'error': 'Failed to generate audio'}), 500
                
        except Exception as e:
            import traceback
            traceback.print_exc()
            return jsonify({'error': f'Failed to generate audio: {str(e)}'}), 500
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Failed to read transcript: {str(e)}'}), 500


@app.route('/api/podcast-shadowing/transcript', methods=['POST'])
def api_get_podcast_shadowing_transcript():
    """Get transcript for podcast_shadowing."""
    data = request.get_json()
    week_key = data.get('week_key') if data else None
    formatted = data.get('formatted', True) if data else True  # Default to formatted
    
    if week_key is None:
        week_key = get_current_week_key()
    
    progress = load_progress()
    ensure_week_exists(progress, week_key)
    
    transcript_path = progress['weeks'][week_key].get('podcast_shadowing', {}).get('transcript_path', '')
    
    if not transcript_path:
        return jsonify({'error': 'No transcript available for this clip'}), 404
    
    # Read transcript file
    try:
        full_path = os.path.join(os.getcwd(), transcript_path)
        if not os.path.exists(full_path):
            return jsonify({'error': 'Transcript file not found'}), 404
        
        # If formatted is requested, try to find formatted version
        if formatted:
            formatted_path = full_path.replace('.txt', '_formatted.txt')
            if os.path.exists(formatted_path):
                with open(formatted_path, 'r', encoding='utf-8') as f:
                    transcript_text = f.read()
                # Remove metadata header (Chapter, Video, Time, separator)
                transcript_text = remove_transcript_header(transcript_text)
                return jsonify({
                    'success': True,
                    'transcript': transcript_text
                })
            else:
                # Formatted version doesn't exist, return raw transcript (no auto-formatting)
                with open(full_path, 'r', encoding='utf-8') as f:
                    raw_transcript = f.read()
                # Remove metadata header but don't auto-format
                transcript_text = remove_transcript_header(raw_transcript)
                
                return jsonify({
                    'success': True,
                    'transcript': transcript_text
                })
        else:
            # Return raw transcript
            with open(full_path, 'r', encoding='utf-8') as f:
                transcript_text = f.read()
            
            return jsonify({
                'success': True,
                'transcript': transcript_text
            })
    except Exception as e:
        return jsonify({'error': f'Failed to read transcript: {str(e)}'}), 500


@app.route('/api/podcast-shadowing/videos', methods=['GET'])
def api_get_podcast_videos():
    """Get all available videos and chapters for podcast shadowing."""
    from progress_manager import get_all_podcast_videos_and_chapters
    
    try:
        videos_data = get_all_podcast_videos_and_chapters()
        return jsonify({
            'success': True,
            'videos': videos_data.get('videos', [])
        })
    except Exception as e:
        return jsonify({'error': f'Failed to get videos: {str(e)}'}), 500


@app.route('/api/podcast-shadowing/regenerate', methods=['POST'])
def api_regenerate_podcast_shadowing_mp3():
    """Get a podcast clip for podcast_shadowing, either by selection or random."""
    from progress_manager import get_random_podcast_clip, get_podcast_clip_by_selection
    
    data = request.get_json()
    week_key = data.get('week_key') if data else None
    video_id = data.get('video_id') if data else None
    chapter_index = data.get('chapter_index') if data else None
    
    if week_key is None:
        week_key = get_current_week_key()
    
    progress = load_progress()
    ensure_week_exists(progress, week_key)
    
    # Get current MP3 file to exclude it from selection
    current_mp3 = progress['weeks'][week_key].get('podcast_shadowing', {}).get('mp3_file', '')
    
    # If video_id and chapter_index are provided, get specific clip
    if video_id is not None and chapter_index is not None:
        podcast_clip = get_podcast_clip_by_selection(video_id, chapter_index)
    else:
        # Otherwise, get random complete podcast clip (preferring unused clips)
        podcast_clip = get_random_podcast_clip(week_key, progress, exclude_current=current_mp3)
    
    if not podcast_clip:
        return jsonify({'error': 'No complete podcast clips available'}), 404
    
    # Update the MP3 file for this week (store just the filename)
    new_mp3_file = podcast_clip['audio_filename']
    old_transcript_path = progress['weeks'][week_key]['podcast_shadowing'].get('transcript_path', '')
    
    progress['weeks'][week_key]['podcast_shadowing']['mp3_file'] = new_mp3_file
    # Store episode name and chapter name for display
    progress['weeks'][week_key]['podcast_shadowing']['episode_name'] = podcast_clip.get('video_title', '')
    progress['weeks'][week_key]['podcast_shadowing']['chapter_name'] = podcast_clip.get('title', '')
    # Store transcript path (relative to workspace root)
    new_transcript_path = ''
    if podcast_clip.get('transcript_path'):
        from pathlib import Path
        workspace_root = Path(__file__).parent
        transcript_path = Path(podcast_clip['transcript_path'])
        try:
            # Make path relative to workspace root
            relative_path = transcript_path.relative_to(workspace_root)
            new_transcript_path = str(relative_path)
            progress['weeks'][week_key]['podcast_shadowing']['transcript_path'] = new_transcript_path
        except ValueError:
            # If path is not under workspace root, store as is
            new_transcript_path = podcast_clip['transcript_path']
            progress['weeks'][week_key]['podcast_shadowing']['transcript_path'] = new_transcript_path
    
    # Clear Typecast audio if MP3 file changed or transcript path changed
    if (current_mp3 != new_mp3_file) or (old_transcript_path != new_transcript_path):
        progress['weeks'][week_key]['podcast_shadowing']['typecast_audio_url'] = ''
        progress['weeks'][week_key]['podcast_shadowing']['typecast_voice'] = ''
        progress['weeks'][week_key]['podcast_shadowing']['typecast_speed'] = 1.0
        progress['weeks'][week_key]['podcast_shadowing']['typecast_model'] = 'ssfm-v30'
    
    progress['last_updated'] = datetime.now().isoformat()
    
    if save_progress(progress):
        return jsonify({
            'success': True,
            'mp3_file': new_mp3_file,
            'progress': progress
        })
    else:
        return jsonify({'error': 'Failed to save MP3 selection'}), 500


if __name__ == '__main__':
    from config import DEBUG, HOST, PORT
    app.run(debug=DEBUG, host=HOST, port=PORT)


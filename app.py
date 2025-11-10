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
    generate_shadowing_script,
    generate_weekly_prompt,
    generate_weekly_prompt_words,
)
from typecast_generator import (
    generate_shadowing_audio_for_week,
    get_available_voices,
)

app = Flask(__name__)


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
    
    if not activity_id:
        return jsonify({'error': 'activity_id is required'}), 400
    
    if activity_id not in ['voice_journaling', 'shadowing_practice', 'weekly_speaking_prompt']:
        return jsonify({'error': 'Invalid activity_id'}), 400
    
    # All activities are now daily - require day parameter
    if day is None:
        day = datetime.now().strftime('%Y-%m-%d')
    
    progress = load_progress()
    
    if week_key is None:
        week_key = get_current_week_key()
    
    # Update progress
    update_progress(progress, activity_id, week_key, completed, day)
    
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
    
    try:
        if activity_id == 'voice_journaling':
            topics = generate_voice_journaling_topics(previous_content.get('voice_journaling_topics'))
            progress['weeks'][week_key]['voice_journaling']['topics'] = topics
            result = {'topics': topics}
            
        elif activity_id == 'shadowing_practice':
            script = generate_shadowing_script(previous_content.get('shadowing_scripts'))
            progress['weeks'][week_key]['shadowing_practice']['script'] = script
            result = {'script': script}
            
        elif activity_id == 'weekly_speaking_prompt':
            prompt = generate_weekly_prompt(previous_content.get('weekly_prompts'))
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


@app.route('/api/generate-audio', methods=['POST'])
def api_generate_audio():
    """Generate audio from script using Typecast.ai."""
    data = request.get_json()
    week_key = data.get('week_key') if data else None
    voice_id = data.get('voice_id') if data else None
    speed = data.get('speed', 1.0) if data else 1.0
    
    if week_key is None:
        week_key = get_current_week_key()
    
    progress = load_progress()
    ensure_week_exists(progress, week_key)
    
    script = progress['weeks'][week_key]['shadowing_practice'].get('script', '')
    if not script:
        return jsonify({'error': 'No script available. Generate script first.'}), 400
    
    try:
        # Generate audio from script with selected voice and speed
        audio_url = generate_shadowing_audio_for_week(script, week_key, voice_id=voice_id, speed=speed)
        
        if audio_url:
            # Get voice name from available voices
            from typecast_generator import get_available_voices
            voice_name = None
            if voice_id:
                voices = get_available_voices(language='eng')
                for v in voices:
                    if v.get('voice_id') == voice_id:
                        voice_name = v.get('name')
                        break
            
            # Update progress with audio URL, voice name, and speed
            progress['weeks'][week_key]['shadowing_practice']['audio_url'] = audio_url
            if voice_name:
                progress['weeks'][week_key]['shadowing_practice']['voice_name'] = voice_name
            if speed:
                progress['weeks'][week_key]['shadowing_practice']['audio_speed'] = speed
            progress['last_updated'] = datetime.now().isoformat()
            
            # Save to file
            if save_progress(progress):
                return jsonify({
                    'success': True,
                    'progress': progress,
                    'audio_url': audio_url
                })
            else:
                return jsonify({'error': 'Failed to save audio URL'}), 500
        else:
            return jsonify({'error': 'Failed to generate audio'}), 500
            
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
        script = generate_shadowing_script(
            previous_content.get('shadowing_scripts'),
            regenerate=has_existing_content
        )
        prompt = generate_weekly_prompt(
            previous_content.get('weekly_prompts'),
            regenerate=has_existing_content
        )
        weekly_prompt_words = generate_weekly_prompt_words(
            previous_content.get('weekly_prompt_words'),
            regenerate=has_existing_content
        )  # 5 words
        
        # NOTE: Audio generation is handled separately via the "Generate audio" button
        # We don't automatically generate audio here to give users control and avoid wasting API credits
        
        # Update progress
        progress['weeks'][week_key]['voice_journaling']['topics'] = voice_journaling_topics
        progress['weeks'][week_key]['shadowing_practice']['script'] = script
        # Note: audio_url is NOT updated here - use separate "Generate audio" button
        progress['weeks'][week_key]['weekly_speaking_prompt']['prompt'] = prompt
        progress['weeks'][week_key]['weekly_speaking_prompt']['words'] = weekly_prompt_words
        
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
                    'script': script,
                    'audio_url': None,  # Audio is generated separately via "Generate audio" button
                    'prompt': prompt,
                    'weekly_prompt_words': weekly_prompt_words
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
    
    if not activity_id or activity_id not in ['voice_journaling', 'shadowing_practice', 'weekly_speaking_prompt']:
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
    for activity in ['voice_journaling', 'shadowing_practice', 'weekly_speaking_prompt']:
        if activity in week_data and 'days' in week_data[activity]:
            for d in week_data[activity]['days']:
                if d.get('date') == day:
                    day_num = d.get('day_num', 1)
                    break
    
    filename = f"{day_name}_{day_num}_{timestamp}.webm"
    filepath = os.path.join(recordings_dir, filename)
    
    # Save the audio file
    audio_file.save(filepath)
    
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


if __name__ == '__main__':
    from config import DEBUG, HOST, PORT
    app.run(debug=DEBUG, host=HOST, port=PORT)


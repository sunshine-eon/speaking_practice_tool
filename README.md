# Speaking Practice Tool

AI-powered speaking practice tool with ChatGPT content generation and Typecast.ai TTS

## Features

- **AI-Generated Weekly Content**: ChatGPT generates custom speaking prompts, shadowing scripts, and vocabulary words
- **Text-to-Speech Audio**: Typecast.ai converts shadowing scripts into natural-sounding audio with customizable voice and speed
- **Three Practice Activities**:
  - **Voice Journaling**: Practice with curated vocabulary words (5 per week)
  - **Shadowing Practice**: AI-generated scripts with audio playback
  - **Weekly Speaking Prompt**: Themed discussion topics for structured practice
- **Weekly Progress Tracking**: Track your daily practice across all activities
- **Voice & Speed Customization**: Choose from multiple English voices and adjust playback speed (0.8x - 2.0x)
- **Notes & Brainstorming**: Built-in text area for planning your responses
- **Clean, Responsive UI**: Modern interface with weekly navigation

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Run the Flask application:
```bash
python app.py
```

3. Open your browser and navigate to:
```
http://localhost:5001
```

## Project Structure

```
speaking_practice_tool/
├── app.py                  # Flask application and API endpoints
├── progress_manager.py     # Weekly progress tracking and persistence
├── config.py               # Configuration (API keys, paths)
├── chatgpt_generator.py    # ChatGPT integration for content generation
├── typecast_generator.py   # Typecast.ai integration for audio generation
├── prompts.py.example      # Template for ChatGPT prompts (copy to prompts.py)
├── prompts.py              # ChatGPT prompts (gitignored, private)
├── requirements.txt        # Python dependencies
├── progress.json           # Weekly progress data (auto-generated)
├── .env                    # API keys (gitignored, create your own)
├── templates/
│   └── index.html          # Main dashboard page
└── static/
    ├── style.css           # Styling
    └── app.js              # Frontend interactivity and AJAX calls
```

## Configuration

### API Keys

Create a `.env` file in the project root:
```
OPENAI_API_KEY=your_openai_api_key
TYPECAST_API_KEY=your_typecast_api_key
```

### Custom Prompts (Optional)

To customize ChatGPT prompts:
1. Copy `prompts.py.example` to `prompts.py`
2. Edit `prompts.py` with your custom prompts
3. `prompts.py` is gitignored and won't be committed to the repository

## Usage

1. **Navigate Weeks**: Use the sidebar to switch between weeks (Sunday-Saturday format, PST timezone)
2. **Generate Content**: Click "Generate content" to create AI-powered prompts, words, and scripts
3. **Generate Audio**: Select a voice and speed, then click "Generate audio" to create TTS audio
4. **Track Progress**: Check off daily practice activities as you complete them
5. **Take Notes**: Use the notes area under the weekly prompt to brainstorm or plan responses
6. **Customize Audio**: Voice list is cached for 24 hours; speed ranges from 0.8x to 2.0x

## API Endpoints

- `GET /` - Main dashboard
- `GET /api/progress` - Get current progress for all weeks
- `POST /api/progress` - Update daily progress checkboxes
- `GET /api/week/<week_key>` - Get progress for specific week
- `POST /api/generate-all` - Generate all content (prompt, words, script) using ChatGPT
- `POST /api/generate-audio` - Generate audio from script using Typecast.ai
- `GET /api/voices` - Get available English voices from Typecast.ai
- `POST /api/save-notes` - Save notes for weekly speaking prompt

## License

MIT


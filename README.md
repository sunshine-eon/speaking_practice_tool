# Speaking Practice Roadmap Tool

A web-based tool to track your progress on the speaking practice roadmap, focusing on Phase 1: Daily Speaking Habits (0-6 months).

## Features

- Track weekly progress for three main activities:
  - **Voice Journaling**: Record 1 voice note/week
  - **Shadowing Practice**: Daily practice with progress tracking
  - **Weekly Speaking Prompt**: Record 1 per week
- Visual progress indicators
- Weekly progress summary
- Clean, responsive web interface

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
http://localhost:5000
```

## Project Structure

```
speaking_practice_tool/
├── app.py                 # Flask application
├── roadmap_data.py        # Roadmap structure and data models
├── config.py              # Configuration (API keys, paths)
├── chatgpt_generator.py  # ChatGPT integration for content generation
├── typecast_generator.py # Typecast.ai integration for audio generation
├── prompts.py.example    # Template for ChatGPT prompts (copy to prompts.py)
├── prompts.py            # ChatGPT prompts (gitignored, private)
├── requirements.txt       # Python dependencies
├── progress.json          # Progress data (auto-generated)
├── templates/
│   └── index.html         # Main dashboard page
└── static/
    ├── style.css          # Styling
    └── app.js             # Frontend interactivity
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

## API Endpoints

- `GET /` - Main dashboard
- `GET /api/roadmap` - Get roadmap structure
- `GET /api/progress` - Get current progress
- `POST /api/progress` - Update progress
- `GET /api/week/<week_key>` - Get progress for specific week

## Phase B (Future)

ChatGPT API integration for generating weekly speaking prompts will be added after Phase A testing.

## License

MIT


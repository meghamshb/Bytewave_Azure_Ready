# 3Blue1Brown Voice Clone Setup

ByteWave uses Coqui XTTS v2 to clone the 3Blue1Brown (Grant Sanderson) voice
for narrated physics animations. XTTS v2 requires only a short reference audio
clip to clone any voice — no training needed.

## Steps

### 1. Get a reference audio clip

Download 10–30 seconds of clean audio from any 3Blue1Brown YouTube video.
Requirements:
- No background music
- No sound effects
- Clear speech only
- Any video works — "Essence of Calculus" or "But what is a neural network?" are ideal

Recommended tool: `yt-dlp`
```bash
pip install yt-dlp ffmpeg-python
# Download audio from a 3b1b video, trim to a clean 20-second segment
yt-dlp -x --audio-format wav -o "raw.%(ext)s" "https://www.youtube.com/watch?v=WUvTyaaNkzM"
# Trim to 20 seconds of clear speech (no music/intro)
ffmpeg -i raw.wav -ss 30 -t 20 -ar 22050 -ac 1 3b1b_voice.wav
```

### 2. Place the file here

Save the audio file as:
```
backend/assets/3b1b_voice.wav
```

### 3. Install voiceover dependencies

```bash
pip install "manim-voiceover[coqui]>=0.3.4"
```

### 4. First-run model download

On the first animation render, Coqui will automatically download the XTTS v2
model (~1.8 GB). This happens once and is cached locally.

## Notes

- If `3b1b_voice.wav` is absent, ByteWave falls back to silent animations (no change to existing behaviour).
- The XTTS v2 model runs entirely locally — no API key required, no internet needed after the initial download.
- Render time increases by ~15–40 seconds per animation due to local TTS inference.
- For best results, the reference clip should have consistent volume, no room echo, and no overlapping audio.

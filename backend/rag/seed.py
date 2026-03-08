"""
CLI script to seed the RAG knowledge base.

Usage:
  # Seed built-in physics examples only:
  python -m backend.rag.seed

  # Also process a folder of reference MP4 videos:
  python -m backend.rag.seed --videos /path/to/your/videos

The --videos option will:
  1. List each .mp4 file found in the folder.
  2. Prompt you (or auto-generate) a short description for each video.
  3. Use the Claude LLM to generate matching Manim code from the description.
  4. Add everything to the physics_examples ChromaDB collection.
"""

import argparse
import logging
import os
import sys
from pathlib import Path

# Ensure project root is on path when running as __main__
ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


def seed_builtin_examples():
    from backend.rag.knowledge_base import add_example, examples_count
    from backend.rag.seed_data import PHYSICS_EXAMPLES

    logger.info("Seeding %d built-in physics examples...", len(PHYSICS_EXAMPLES))
    before = examples_count()
    for ex in PHYSICS_EXAMPLES:
        add_example(
            topic=ex["topic"],
            description=ex["description"],
            manim_code=ex["manim_code"],
            visual_rules=ex.get("visual_rules", ""),
        )
    after = examples_count()
    logger.info("Done. Knowledge base now has %d examples (was %d).", after, before)


def _generate_manim_for_description(topic: str, description: str) -> str:
    """Use the LLM to generate a Manim construct() body for a given description."""
    from dotenv import load_dotenv
    import anthropic

    load_dotenv(override=True)
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        logger.warning("ANTHROPIC_API_KEY not set; skipping code generation.")
        return "        self.wait(2)"

    client = anthropic.Anthropic(api_key=api_key, timeout=60.0)
    prompt = f"""Topic: {topic}
Description: {description}

Generate the body of a Manim construct(self) method that animates this physics concept.
Rules:
- Output ONLY the indented body lines (4 spaces per indent level inside construct).
- Use ONLY: Text, Arrow, DoubleArrow, Line, DashedLine, Circle, Dot, Rectangle, Square,
  Axes, Arc, VGroup, ValueTracker, always_redraw, self.play, self.add, self.wait, np, Write,
  Create, FadeIn, FadeOut, MoveAlongPath, DashedVMobject, CubicBezier.
- Do NOT use MathTex or Tex (no LaTeX installed). Use Text() for all labels.
- Include a title Text at top, force arrows labeled in color, and equations as Text.
- No imports, no class definition, no docstrings.
Output only code, no backticks."""

    try:
        resp = client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=2048,
            system="Output only the construct() method body. Code only.",
            messages=[{"role": "user", "content": prompt}],
        )
        return (resp.content[0].text or "        self.wait(2)").strip()
    except Exception as e:
        logger.error("LLM code gen failed: %s", e)
        return "        self.wait(2)"


def seed_videos(video_folder: str):
    from backend.rag.knowledge_base import add_example

    folder = Path(video_folder)
    if not folder.exists():
        logger.error("Video folder not found: %s", folder)
        return

    videos = sorted(folder.glob("*.mp4"))
    if not videos:
        logger.warning("No .mp4 files found in %s", folder)
        return

    logger.info("Found %d .mp4 files in %s", len(videos), folder)

    for i, video_path in enumerate(videos):
        print(f"\n[{i+1}/{len(videos)}] Video: {video_path.name}")
        topic_guess = video_path.stem.replace("_", " ").replace("-", " ")

        print(f"  Suggested topic name: '{topic_guess}'")
        topic_input = input("  Topic name (Enter to keep): ").strip()
        topic = topic_input if topic_input else topic_guess

        print("  Enter a 2-3 sentence description of what this video animates.")
        print("  (Include: what physics concept, what forces/equations are shown, what the viewer learns)")
        print("  Press Enter twice when done:")
        lines = []
        while True:
            line = input("  > ")
            if line == "" and lines and lines[-1] == "":
                break
            lines.append(line)
        description = "\n".join(lines).strip()
        if not description:
            description = f"Animation of {topic}."

        print("  Generating Manim code from description (this takes ~10s)...")
        manim_code = _generate_manim_for_description(topic, description)

        video_url_input = input(f"  Public URL for this video (or leave blank if none): ").strip()
        metadata = {"source_video": video_path.name}
        if video_url_input:
            metadata["reference_video_url"] = video_url_input

        add_example(
            topic=topic,
            description=description,
            manim_code=manim_code,
            metadata=metadata,
        )
        logger.info("Added '%s' to knowledge base.", topic)

    print("\nAll videos indexed successfully.")


def main():
    parser = argparse.ArgumentParser(description="Seed the PhysiMate RAG knowledge base.")
    parser.add_argument("--videos", metavar="FOLDER", help="Path to a folder of reference .mp4 videos to index.")
    parser.add_argument("--clear", action="store_true", help="Clear the knowledge base before seeding.")
    args = parser.parse_args()

    if args.clear:
        from backend.rag.knowledge_base import _get_client
        c = _get_client()
        try:
            c.delete_collection("physics_examples")
            logger.info("Cleared physics_examples collection.")
        except Exception:
            pass

    seed_builtin_examples()

    if args.videos:
        seed_videos(args.videos)

    from backend.rag.knowledge_base import examples_count
    print(f"\nFinal knowledge base: {examples_count()} examples.")


if __name__ == "__main__":
    main()

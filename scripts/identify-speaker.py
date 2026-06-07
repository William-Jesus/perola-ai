#!/usr/bin/env python3
"""
Speaker identification using SpeechBrain ECAPA-TDNN.

Usage:
  python identify-speaker.py --audio /path/to/audio.wav --profiles /path/to/profiles.json
  python identify-speaker.py --audio /path/to/audio.wav --enroll "Speaker Name"

Returns JSON with speaker info and confidence score.
"""
import argparse
import json
import sys
import os
import numpy as np

try:
    import torch
    import torchaudio
    from speechbrain.pretrained import EncoderClassifier
except ImportError as e:
    print(json.dumps({"error": f"Missing dependency: {e}. Install with: pip install speechbrain torch torchaudio"}))
    sys.exit(1)


def extract_embedding(audio_path: str, classifier):
    """Extract speaker embedding from audio file."""
    signal, fs = torchaudio.load(audio_path)
    # Resample to 16kHz if needed
    if fs != 16000:
        resampler = torchaudio.transforms.Resample(orig_freq=fs, new_freq=16000)
        signal = resampler(signal)
    # Use single channel if stereo
    if signal.shape[0] > 1:
        signal = signal.mean(dim=0, keepdim=True)
    embedding = classifier.encode_batch(signal)
    return embedding.squeeze().numpy()


def cosine_similarity(a, b):
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", required=True, help="Path to audio WAV file")
    parser.add_argument("--profiles", help="Path to profiles JSON file")
    parser.add_argument("--enroll", help="Enroll mode: speaker name")
    parser.add_argument("--output-embedding", help="Output file to save embedding JSON")
    args = parser.parse_args()

    if not os.path.exists(args.audio):
        print(json.dumps({"error": f"Audio file not found: {args.audio}"}))
        sys.exit(1)

    # Load classifier (downloads model on first run)
    try:
        classifier = EncoderClassifier.from_hparams(
            source="speechbrain/ecapa-tdnn",
            savedir=os.path.expanduser("~/.cache/speechbrain/ecapa-tdnn"),
            run_opts={"device": "cpu"},
        )
    except Exception as e:
        print(json.dumps({"error": f"Failed to load model: {str(e)}"}))
        sys.exit(1)

    embedding = extract_embedding(args.audio, classifier)

    if args.enroll:
        result = {
            "name": args.enroll,
            "embedding": embedding.tolist(),
        }
        if args.output_embedding:
            with open(args.output_embedding, "w") as f:
                json.dump(result, f)
        print(json.dumps(result))
        return

    if not args.profiles or not os.path.exists(args.profiles):
        print(json.dumps({"identified": False, "reason": "no_profiles_file"}))
        return

    with open(args.profiles, "r") as f:
        profiles_data = json.load(f)

    profiles = profiles_data.get("profiles", [])
    if not profiles:
        print(json.dumps({"identified": False, "reason": "no_profiles"}))
        return

    best_match = None
    best_score = -1

    for profile in profiles:
        ref_embedding = np.array(profile.get("embedding", []))
        if len(ref_embedding) == 0:
            continue
        score = cosine_similarity(embedding, ref_embedding)
        if score > best_score:
            best_score = score
            best_match = profile

    # Threshold: 0.25 is a reasonable baseline for ECAPA-TDNN on short utterances
    THRESHOLD = 0.25
    identified = best_match is not None and best_score >= THRESHOLD

    result = {
        "identified": identified,
        "speaker": {
            "id": best_match["id"] if identified else None,
            "name": best_match["name"] if identified else None,
            "relationship": best_match.get("relationship") if identified else None,
            "toneHint": best_match.get("toneHint") if identified else None,
            "instructions": best_match.get("instructions") if identified else None,
        } if best_match else None,
        "confidence": best_score if best_match else 0,
        "threshold": THRESHOLD,
    }
    print(json.dumps(result))


if __name__ == "__main__":
    main()

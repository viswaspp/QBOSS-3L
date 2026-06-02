import os
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app, origins=["http://localhost:5173", "http://127.0.0.1:5173",
                   "http://localhost:3000", "http://127.0.0.1:3000"])

BASE_DIR   = os.path.dirname(__file__)
MODELS_DIR = os.path.join(BASE_DIR, "models")
AUDIO_DIR  = os.path.join(BASE_DIR, "audio")

os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(os.path.join(AUDIO_DIR, "enroll"), exist_ok=True)
os.makedirs(os.path.join(AUDIO_DIR, "live"), exist_ok=True)


def _uid(data: dict):
    try:
        uid = int(data.get("user_id"))
    except (TypeError, ValueError):
        return None, jsonify({"success": False, "error": "valid user_id is required"}), 400
    if uid <= 0:
        return None, jsonify({"success": False, "error": "valid user_id is required"}), 400
    return uid, None, None


@app.route("/api/status", methods=["GET"])
def status():
    return jsonify({"status": "online", "service": "QBOSS-3L Biometric Auth API", "version": "2.0.0"})


@app.route("/api/diagnostics", methods=["GET"])
def diagnostics():
    """Reports which backend modules loaded successfully."""
    checks = {}
    for name in ["cv2", "mediapipe", "sklearn", "librosa", "soundfile", "cryptography"]:
        try:
            __import__(name)
            checks[name] = True
        except Exception as e:
            checks[name] = str(e)
    try:
        from face.face_enroll import FEATURE_VERSION, _cv_available, _cv_error, _get_face_cascade
        cascade, cascade_error = _get_face_cascade()
        checks["face_engine"] = {
            "version": FEATURE_VERSION,
            "usable": bool(_cv_available and cascade is not None),
            "error": None if _cv_available and cascade is not None else (_cv_error or cascade_error),
        }
    except Exception as e:
        checks["face_engine"] = {"usable": False, "error": str(e)}
    return jsonify({"success": True, "modules": checks})


@app.route("/api/models/status", methods=["GET"])
def models_status():
    user_id = request.args.get("user_id", type=int)
    from db.biometric_store import get_user_enrollment_status
    if user_id:
        s = get_user_enrollment_status(user_id)
    else:
        s = {"face": False, "hand": False, "gesture": False, "voice": False}
    return jsonify({
        "face_enrolled":    s["face"],
        "hand_enrolled":    s["hand"],
        "gesture_enrolled": s["gesture"],
        "voice_enrolled":   s["voice"],
    })


@app.route("/api/users", methods=["GET"])
def users_list():
    from db.biometric_store import get_all_users_with_status
    return jsonify({"success": True, "users": get_all_users_with_status()})


@app.route("/api/users", methods=["POST"])
def users_create():
    from db.biometric_store import create_user
    data = request.get_json() or {}
    username     = data.get("username", "").strip()
    display_name = data.get("display_name", "").strip()
    if not username:
        return jsonify({"success": False, "error": "username is required"}), 400
    result = create_user(username, display_name)
    return jsonify(result), (200 if result["success"] else 409)


@app.route("/api/users/<int:user_id>", methods=["GET"])
def users_get(user_id):
    from db.biometric_store import get_user, get_user_enrollment_status
    user = get_user(user_id)
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404
    user["enrolled"] = get_user_enrollment_status(user_id)
    return jsonify({"success": True, "user": user})


@app.route("/api/users/<int:user_id>", methods=["DELETE"])
def users_delete(user_id):
    from db.biometric_store import delete_user
    deleted = delete_user(user_id)
    return jsonify({"success": deleted, "message": "User deleted." if deleted else "Not found."})


@app.route("/api/auth/hand/enroll", methods=["POST"])
def hand_enroll():
    from biometrics.hand_enroll import enroll_hand_model
    data = request.get_json() or {}
    user_id = data.get("user_id")
    if not user_id:
        return jsonify({"success": False, "error": "user_id required"}), 400
    result = enroll_hand_model(int(user_id), data.get("positive_samples", []), data.get("negative_samples", []))
    return jsonify(result)


@app.route("/api/auth/hand/verify", methods=["POST"])
def hand_verify():
    from biometrics.hand_verify import verify_hand_features
    data = request.get_json() or {}
    user_id = data.get("user_id")
    if not user_id:
        return jsonify({"success": False, "error": "user_id required"}), 400
    result = verify_hand_features(int(user_id), data.get("landmarks_list", []))
    return jsonify(result)


@app.route("/api/auth/hand/frame", methods=["POST"])
def hand_frame():
    from biometrics.hand_verify import process_hand_frame
    data = request.get_json() or {}
    result = process_hand_frame(data.get("image", ""))
    return jsonify(result)


@app.route("/api/gesture/enroll", methods=["POST"])
def gesture_enroll():
    from gestures.gesture_enroll import enroll_gesture_sequence
    data = request.get_json() or {}
    user_id = data.get("user_id")
    if not user_id:
        return jsonify({"success": False, "error": "user_id required"}), 400
    result = enroll_gesture_sequence(int(user_id), data.get("sequence", []))
    return jsonify(result)


@app.route("/api/gesture/verify", methods=["POST"])
def gesture_verify_route():
    from gestures.gesture_verify import verify_gesture_sequence
    data = request.get_json() or {}
    user_id = data.get("user_id")
    if not user_id:
        return jsonify({"success": False, "error": "user_id required"}), 400
    result = verify_gesture_sequence(int(user_id), data.get("sequence", []))
    return jsonify(result)


@app.route("/api/gesture/detect", methods=["POST"])
def gesture_detect():
    from gestures.gesture_detector import detect_gesture_from_frame
    data = request.get_json() or {}
    result = detect_gesture_from_frame(data.get("image", ""))
    return jsonify(result)


@app.route("/api/gesture/count", methods=["GET"])
def gesture_count():
    from gestures.gesture_verify import get_gesture_count
    user_id = request.args.get("user_id", type=int)
    if not user_id:
        return jsonify({"count": 0})
    return jsonify({"count": get_gesture_count(user_id)})


@app.route("/api/auth/voice/enroll", methods=["POST"])
def voice_enroll():
    from voice.qnv import create_voice_profile, encode_profile
    from db.biometric_store import save_biometric

    user_id = request.form.get("user_id")
    if not user_id:
        return jsonify({"success": False, "error": "user_id required"}), 400
    user_id = int(user_id)

    if "audio" not in request.files:
        return jsonify({"success": False, "error": "No audio file provided"}), 400

    audio_files = request.files.getlist("audio")
    enroll_dir = os.path.join(AUDIO_DIR, "enroll", str(user_id))
    os.makedirs(enroll_dir, exist_ok=True)

    try:
        saved_paths = []
        for i, f in enumerate(audio_files, 1):
            path = os.path.join(enroll_dir, f"enroll_{i}.wav")
            f.save(path)
            saved_paths.append(path)
        profile = create_voice_profile(user_id, saved_paths)
        save_biometric(user_id, "voice", encode_profile(profile),
                       meta={
                           "engine": profile["version"],
                           "feature_version": profile["feature_version"],
                           "sample_count": profile["sample_count"],
                           "feature_dim": profile["feature_dim"],
                           "qnv_dim": profile["qnv_dim"],
                           "quality_rating": profile["quality"]["rating"],
                       })
        return jsonify({
            "success": True,
            "message": "Quantum Noise Voice enrolled.",
            "sample_count": profile["sample_count"],
            "engine": profile["version"],
            "quality": profile["quality"],
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})


@app.route("/api/auth/voice/verify", methods=["POST"])
def voice_verify_route():
    from voice.verify import verify_voice
    from voice.challenge import consume_challenge

    user_id = request.form.get("user_id")
    if not user_id:
        return jsonify({"success": False, "error": "user_id required"}), 400
    user_id = int(user_id)

    if "audio" not in request.files:
        return jsonify({"success": False, "error": "No audio file provided"}), 400

    live_dir = os.path.join(AUDIO_DIR, "live", str(user_id))
    os.makedirs(live_dir, exist_ok=True)
    audio_file = request.files["audio"]
    live_path = os.path.join(live_dir, "live.wav")
    audio_file.save(live_path)

    try:
        challenge_ok, challenge_detail = consume_challenge(request.form.get("challenge_id", ""))
        if not challenge_ok:
            return jsonify({"success": False, "verified": False, "error": challenge_detail, "confidence": 0.0, "distance": -1})

        result = verify_voice(user_id, audio_path=live_path)
        result["challenge_expected"] = challenge_detail
        return jsonify(result)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})


@app.route("/api/auth/voice/challenge", methods=["GET"])
def voice_challenge():
    from voice.challenge import get_challenge
    return jsonify(get_challenge())


@app.route("/api/auth/face/process", methods=["POST"])
def face_process():
    from face.face_verify import process_face_frame
    data = request.get_json() or {}
    return jsonify(process_face_frame(data.get("image", "")))


@app.route("/api/auth/face/enroll", methods=["POST"])
def face_enroll_route():
    from face.face_enroll import enroll_face
    data = request.get_json() or {}
    user_id, error_response, status_code = _uid(data)
    if error_response is not None:
        return error_response, status_code
    return jsonify(enroll_face(user_id, data.get("embeddings", [])))


@app.route("/api/auth/face/verify", methods=["POST"])
def face_verify_route():
    from face.face_verify import verify_face_embedding
    data = request.get_json() or {}
    user_id, error_response, status_code = _uid(data)
    if error_response is not None:
        return error_response, status_code
    return jsonify(verify_face_embedding(user_id, data.get("embedding", [])))


@app.route("/api/auth/face/meta", methods=["GET"])
def face_meta():
    from face.face_enroll import get_face_meta
    user_id = request.args.get("user_id", type=int)
    if not user_id:
        return jsonify({"success": False, "error": "user_id required"}), 400
    return jsonify(get_face_meta(user_id))


@app.route("/api/db/status", methods=["GET"])
def db_status():
    user_id = request.args.get("user_id", type=int)
    from db.biometric_store import get_user_enrollment_status, get_meta
    if not user_id:
        return jsonify({"success": False, "error": "user_id required"}), 400
    enrolled = get_user_enrollment_status(user_id)
    return jsonify({
        "enrolled": enrolled,
        "meta": {m: get_meta(user_id, m) for m in ("face", "hand", "gesture", "voice")},
    })


@app.route("/api/db/audit", methods=["GET"])
def db_audit():
    from db.biometric_store import get_audit_log
    limit   = request.args.get("limit", 100, type=int)
    user_id = request.args.get("user_id", type=int)
    return jsonify({"log": get_audit_log(limit=limit, user_id=user_id)})


@app.route("/api/db/delete/<modality>", methods=["DELETE"])
def db_delete(modality):
    from db.biometric_store import delete_biometric
    user_id = request.args.get("user_id", type=int)
    if not user_id:
        return jsonify({"success": False, "error": "user_id required"}), 400
    if modality not in ("face", "hand", "gesture", "voice"):
        return jsonify({"success": False, "error": "Unknown modality"}), 400
    deleted = delete_biometric(user_id, modality)
    return jsonify({"success": True, "deleted": deleted,
                    "message": f"{modality.capitalize()} enrollment removed." if deleted else "Nothing to delete."})


if __name__ == "__main__":
    print("\n" + "=" * 50)
    print("  QBOSS-3L Biometric Auth API  v2.0 (multi-user)")
    print("  Running on http://localhost:5001")
    print("=" * 50 + "\n")
    app.run(debug=True, port=5001, use_reloader=False)

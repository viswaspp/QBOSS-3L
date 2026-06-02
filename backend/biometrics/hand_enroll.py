import pickle
import numpy as np
from sklearn import svm
from .hand_features import extract_hand_features
from db.biometric_store import save_biometric

MODALITY = "hand"
MIN_SAMPLES = 20


def enroll_hand_model(user_id: int, positive_samples, negative_samples):
    if len(positive_samples) < MIN_SAMPLES:
        return {"success": False, "error": f"Need at least {MIN_SAMPLES} positive samples."}
    if len(negative_samples) < MIN_SAMPLES:
        return {"success": False, "error": f"Need at least {MIN_SAMPLES} negative samples."}
    try:
        features, labels = [], []
        for s in positive_samples:
            features.append(extract_hand_features(s)); labels.append(1)
        for s in negative_samples:
            features.append(extract_hand_features(s)); labels.append(0)

        model = svm.SVC(kernel="rbf", probability=True)
        model.fit(np.array(features), np.array(labels))

        save_biometric(user_id, MODALITY, pickle.dumps(model), meta={
            "positive_count": len(positive_samples),
            "negative_count": len(negative_samples),
            "kernel": "rbf",
        })
        return {"success": True, "message": "Hand biometric enrolled.", "positive_count": len(positive_samples)}
    except Exception as e:
        return {"success": False, "error": str(e)}

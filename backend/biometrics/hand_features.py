import numpy as np


def distance(a, b):
    return np.linalg.norm(np.array(a) - np.array(b))


def extract_hand_features(hand_landmarks):
    """
    Extract hand geometry features from MediaPipe hand landmarks.
    hand_landmarks: list of (x, y) tuples for 21 landmarks
    """
    landmarks = hand_landmarks

    wrist = landmarks[0]
    middle_tip = landmarks[12]

    hand_size = distance(wrist, middle_tip)

    index_base = landmarks[5]
    pinky_base = landmarks[17]

    palm_width = distance(index_base, pinky_base)

    thumb_len = distance(landmarks[4], landmarks[2])
    index_len = distance(landmarks[8], landmarks[5])
    middle_len = distance(landmarks[12], landmarks[9])
    ring_len = distance(landmarks[16], landmarks[13])
    pinky_len = distance(landmarks[20], landmarks[17])

    ratios = [
        index_len / middle_len if middle_len > 0 else 0,
        ring_len / middle_len if middle_len > 0 else 0,
        pinky_len / index_len if index_len > 0 else 0,
    ]

    landmark_vec = np.array(landmarks).flatten()

    feature_vector = np.concatenate(
        [
            [hand_size, palm_width, thumb_len, index_len, middle_len, ring_len, pinky_len],
            ratios,
            landmark_vec,
        ]
    )

    return feature_vector

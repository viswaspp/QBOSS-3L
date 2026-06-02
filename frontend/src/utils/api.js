const API_BASE = "/api";
const FACE_EMBEDDING_DIM = 128;

const post = (url, body) =>
  fetch(`${API_BASE}${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(r => r.json())
    .catch(() => ({ success: false, error: "Backend not reachable. Is the server running on port 5001?" }));

const get = (url) =>
  fetch(`${API_BASE}${url}`)
    .then(r => r.json())
    .catch(() => ({ success: false, error: "Backend not reachable. Is the server running on port 5001?" }));

export const getStatus      = () => get("/status");
export const getModels      = (userId) => get(`/models/status?user_id=${userId}`);

export const listUsers      = () => get("/users");
export const createUser     = (username, display_name) => post("/users", { username, display_name });
export const getUser        = (id) => get(`/users/${id}`);
export const deleteUser     = (id) => fetch(`${API_BASE}/users/${id}`, { method: "DELETE" }).then(r => r.json());

export const processHandFrame  = (image) => post("/auth/hand/frame", { image });
export const enrollHand        = (user_id, positive_samples, negative_samples) => post("/auth/hand/enroll", { user_id, positive_samples, negative_samples });
export const verifyHand        = (user_id, landmarks_list) => post("/auth/hand/verify", { user_id, landmarks_list });

export const detectGesture     = (image) => post("/gesture/detect", { image });
export const enrollGesture     = (user_id, sequence) => post("/gesture/enroll", { user_id, sequence });
export const verifyGesture     = (user_id, sequence) => post("/gesture/verify", { user_id, sequence });
export const getGestureCount   = (user_id) => get(`/gesture/count?user_id=${user_id}`);

export const getVoiceChallenge = () => get("/auth/voice/challenge");
export const enrollVoice = (user_id, blobs) => {
  const fd = new FormData();
  fd.append("user_id", user_id);
  // blobs is an array — backend uses request.files.getlist("audio")
  const blobArray = Array.isArray(blobs) ? blobs : [blobs];
  blobArray.forEach((b, i) => fd.append("audio", b, `voice_${i + 1}.wav`));
  return fetch(`${API_BASE}/auth/voice/enroll`, { method: "POST", body: fd }).then(r => r.json());
};
export const verifyVoice = (user_id, blob, challenge = null) => {
  const fd = new FormData();
  fd.append("user_id", user_id);
  fd.append("audio", blob, "live.wav");
  if (challenge?.challenge_id) fd.append("challenge_id", challenge.challenge_id);
  return fetch(`${API_BASE}/auth/voice/verify`, { method: "POST", body: fd }).then(r => r.json());
};

const isFaceEmbedding = (embedding) =>
  Array.isArray(embedding) &&
  embedding.length === FACE_EMBEDDING_DIM &&
  embedding.every((value) => Number.isFinite(Number(value)));

export const processFaceFrame  = (image) => post("/auth/face/process", { image });
export const enrollFace = (user_id, embeddings) => {
  if (!user_id) return Promise.resolve({ success: false, error: "Select a user profile before face enrollment." });
  if (!Array.isArray(embeddings) || embeddings.some((embedding) => !isFaceEmbedding(embedding))) {
    return Promise.resolve({ success: false, error: "Face enrollment samples are invalid. Please try capturing again." });
  }
  return post("/auth/face/enroll", { user_id, embeddings });
};
export const verifyFace = (user_id, embedding) => {
  if (!user_id) return Promise.resolve({ success: false, verified: false, error: "Select a user profile before face verification." });
  if (!isFaceEmbedding(embedding)) {
    return Promise.resolve({ success: false, verified: false, error: "Face verification sample is invalid. Please scan again." });
  }
  return post("/auth/face/verify", { user_id, embedding });
};
export const getFaceMeta       = (user_id) => get(`/auth/face/meta?user_id=${user_id}`);

export const getDbStatus   = (user_id) => get(`/db/status?user_id=${user_id}`);
export const getDbAudit    = (limit = 100, user_id = null) => get(`/db/audit?limit=${limit}${user_id ? `&user_id=${user_id}` : ""}`);
export const deleteModality = (user_id, modality) =>
  fetch(`${API_BASE}/db/delete/${modality}?user_id=${user_id}`, { method: "DELETE" }).then(r => r.json());

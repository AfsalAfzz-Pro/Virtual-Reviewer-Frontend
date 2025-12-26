const BASE_URL = "https://virtual-reviewer-backend.onrender.com/api/v1";

export type AvatarSessionResponse = {
  session_token: string;
  session_id: string;
  livekit_url: string;
  livekit_token: string;
  room_name: string;
  ws_url?: string;
  max_session_duration?: number;
};

export type CreateAvatarSessionRequest = {
  avatar_id?: string;
  voice_id?: string;
  mode?: "FULL" | "BASIC";
  auto_greeting?: boolean;
};

export type CreateInterviewSessionRequest = {
  week_number: number;
};

export type InterviewSessionResponse = {
  session_id: string;
  week: {
    week: number;
    title: string;
    description: string;
    concepts: (
      | string
      | {
          id?: number;
          name?: string;
          title?: string;
          description?: string;
          order?: number;
        }
    )[];
  };
  total_questions: number;
};

export type QuestionResponse = {
  question_text: string;
  question_index: number;
};

export type TTSResponse = {
  audio_url: string;
  audio_base64?: string;
};

export type SubmitAnswerResponse = {
  transcript: string;
  score: number;
  feedback: {
    score: number;
    missed_points: string[];
    red_flags: string[];
    summary: string;
  };
  current_question: string;
  next_question: string | null;
  question_index: number;
  is_complete: boolean;
};

export type SessionResultsResponse = {
  performance_score: number;
  mentor_feedback: string;
  time_elapsed_sec: number;
  time_elapsed_formatted: string;
  skill_breakdown?: {
    [key: string]: number;
  };
  questions_answered: number;
  average_score: number;
};

export async function createInterviewSession(
  request: CreateInterviewSessionRequest
): Promise<InterviewSessionResponse> {
  const res = await fetch(`${BASE_URL}/interview/session/create/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(
      error.detail || `Failed to create interview session: ${res.statusText}`
    );
  }

  const data = await res.json();

  if (data.detail) {
    throw new Error(data.detail);
  }

  if (!data.session_id) {
    throw new Error("Missing session_id in response");
  }

  return data;
}

export async function submitAnswer(
  sessionId: string,
  audioBlob: Blob
): Promise<SubmitAnswerResponse> {
  const formData = new FormData();
  formData.append("audio", audioBlob);

  const res = await fetch(`${BASE_URL}/interview/session/${sessionId}/audio/`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(
      error.detail || `Failed to submit answer: ${res.statusText}`
    );
  }

  return res.json();
}

export async function getSessionLogs(sessionId: string) {
  const res = await fetch(`${BASE_URL}/interview/session/${sessionId}/logs/`, {
    method: "GET",
  });
  return res.json();
}

export async function createAvatarSession(
  options?: CreateAvatarSessionRequest
): Promise<AvatarSessionResponse> {
  const res = await fetch(`${BASE_URL}/interview/avatar/session/create/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options || {}),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    const errorMessage =
      error.detail || `Failed to create avatar session: ${res.statusText}`;

    if (errorMessage.toLowerCase().includes("concurrency limit")) {
      const concurrencyError = new Error(errorMessage);
      (concurrencyError as any).isConcurrencyLimit = true;
      throw concurrencyError;
    }

    throw new Error(errorMessage);
  }

  const data = await res.json();

  if (data.detail) {
    const errorMessage = data.detail;
    if (errorMessage.toLowerCase().includes("concurrency limit")) {
      const concurrencyError = new Error(errorMessage);
      (concurrencyError as any).isConcurrencyLimit = true;
      throw concurrencyError;
    }
    throw new Error(errorMessage);
  }

  if (!data.livekit_url || !data.livekit_token) {
    throw new Error("Missing LiveKit connection details in response");
  }

  return data;
}

export async function avatarSpeak(sessionToken: string, text: string) {
  const res = await fetch(
    `${BASE_URL}/interview/avatar/${sessionToken}/speak/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }
  );
  return res.json();
}

export type AvatarSpeakEvent = {
  event_type: "avatar.speak_text";
  data: {
    text: string;
  };
};

export type StopAvatarSessionRequest = {
  session_token?: string;
  session_id?: string;
};

export async function stopAvatarSession(request: StopAvatarSessionRequest) {
  const res = await fetch(`${BASE_URL}/interview/avatar/session/stop/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    throw new Error(`Failed to stop avatar session: ${res.statusText}`);
  }
  return res.json();
}

export async function getQuestion(
  sessionId: string,
  questionIndex: number
): Promise<QuestionResponse> {
  const res = await fetch(
    `${BASE_URL}/interview/session/${sessionId}/question/${questionIndex}/`,
    {
      method: "GET",
    }
  );

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(
      error.detail || `Failed to get question: ${res.statusText}`
    );
  }

  return res.json();
}

export async function speakTTS(text: string): Promise<TTSResponse> {
  const res = await fetch(`${BASE_URL}/interview/tts/speak/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(
      error.detail || `Failed to generate TTS: ${res.statusText}`
    );
  }

  return res.json();
}

export async function completeSession(
  sessionId: string
): Promise<{ success: boolean }> {
  const res = await fetch(
    `${BASE_URL}/interview/session/${sessionId}/complete/`,
    {
      method: "POST",
    }
  );

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(
      error.detail || `Failed to complete session: ${res.statusText}`
    );
  }

  return res.json();
}

export async function getSessionResults(
  sessionId: string
): Promise<SessionResultsResponse> {
  const res = await fetch(
    `${BASE_URL}/interview/session/${sessionId}/results/`,
    {
      method: "GET",
    }
  );

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(
      error.detail || `Failed to get session results: ${res.statusText}`
    );
  }

  return res.json();
}

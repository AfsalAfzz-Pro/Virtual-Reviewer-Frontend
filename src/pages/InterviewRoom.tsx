import { useState, useEffect, useRef } from "react";
import {
  Box,
  Typography,
  Button,
  Card,
  Stack,
  Chip,
  IconButton,
  LinearProgress,
  CircularProgress,
} from "@mui/material";
import {
  Mic,
  MicOff,
  Settings,
  MenuBook,
  Layers,
  CheckCircle,
  ArrowForward,
  EmojiEvents,
  AutoAwesome,
  Memory,
} from "@mui/icons-material";
import {
  createInterviewSession,
  getQuestion,
  speakTTS,
  submitAnswer,
  completeSession,
  getSessionResults,
  type InterviewSessionResponse,
  type QuestionResponse,
  type TTSResponse,
  type SubmitAnswerResponse,
  type SessionResultsResponse,
} from "../api/interviewApi";

const INTERVIEWER_IMAGE =
  "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=1000&auto=format&fit=crop";

const WEEK_NUMBER = 4;

const AudioWaveform = ({ isActive }: { isActive: boolean }) => {
  const [heights, setHeights] = useState<number[]>([]);

  useEffect(() => {
    if (isActive) {
      const interval = setInterval(() => {
        setHeights(Array.from({ length: 12 }, () => Math.random() * 100));
      }, 200);
      return () => clearInterval(interval);
    } else {
      setHeights(Array(12).fill(4));
    }
  }, [isActive]);

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 0.5,
        height: 48,
        opacity: isActive ? 1 : 0.3,
        transition: "opacity 0.5s",
      }}
    >
      {Array.from({ length: 12 }).map((_, i) => (
        <Box
          key={i}
          sx={{
            width: 6,
            height: isActive ? `${heights[i] || 20}%` : "4px",
            minHeight: "4px",
            bgcolor: "#10b981",
            borderRadius: "9999px",
            animation: isActive ? "pulse 0.5s ease-in-out infinite" : "none",
            animationDelay: `${i * 0.05}s`,
            transition: "height 0.2s ease",
          }}
        />
      ))}
    </Box>
  );
};

const SkillBar = ({
  label,
  percentage,
}: {
  label: string;
  percentage: number;
}) => (
  <Box sx={{ mb: 2 }}>
    <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
      <Typography variant="caption" sx={{ color: "#71717a", fontWeight: 500 }}>
        {label}
      </Typography>
      <Typography
        variant="caption"
        sx={{ color: "#10b981", fontFamily: "monospace" }}
      >
        {percentage}%
      </Typography>
    </Box>
    <Box
      sx={{
        height: 6,
        width: "100%",
        bgcolor: "#27272a",
        borderRadius: "9999px",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          height: "100%",
          width: `${percentage}%`,
          background: "linear-gradient(to right, #10b981, #2dd4bf)",
          borderRadius: "9999px",
        }}
      />
    </Box>
  </Box>
);

export default function InterviewRoom() {
  const [hasStarted, setHasStarted] = useState(false);
  const [hasFinished, setHasFinished] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timer, setTimer] = useState(0);
  const [interviewState, setInterviewState] = useState<
    "idle" | "asking" | "listening" | "processing" | "completing"
  >("idle");

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [weekData, setWeekData] = useState<
    InterviewSessionResponse["week"] | null
  >(null);
  const [currentQuestion, setCurrentQuestion] = useState<string>("");
  const [sessionResults, setSessionResults] =
    useState<SessionResultsResponse | null>(null);
  const [apiConnectionError, setApiConnectionError] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (hasStarted && !hasFinished) {
      interval = setInterval(() => setTimer((t) => t + 1), 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [hasStarted, hasFinished]);

  const playTTSAudio = async (text: string): Promise<void> => {
    try {
      const ttsResponse: TTSResponse = await speakTTS(text);
      if (ttsResponse.audio_url) {
        if (audioRef.current) {
          audioRef.current.src = ttsResponse.audio_url;
          await audioRef.current.play();
        } else {
          const audio = new Audio(ttsResponse.audio_url);
          audioRef.current = audio;
          await audio.play();
        }
      } else if (ttsResponse.audio_base64) {
        const audio = new Audio(
          `data:audio/mpeg;base64,${ttsResponse.audio_base64}`
        );
        audioRef.current = audio;
        await audio.play();
      }
    } catch (error) {
      console.error("Failed to play TTS audio:", error);
    }
  };

  const initializeSession = async (): Promise<boolean> => {
    setIsInitializing(true);
    setApiConnectionError(false);

    try {
      const response: InterviewSessionResponse = await createInterviewSession({
        week_number: WEEK_NUMBER,
      });
      setSessionId(response.session_id);
      setWeekData(response.week);

      const questionResponse: QuestionResponse = await getQuestion(
        response.session_id,
        0
      );
      setCurrentQuestion(questionResponse.question_text);
      setCurrentQuestionIndex(0);

      await playTTSAudio(questionResponse.question_text);
      setInterviewState("idle");
      setApiConnectionError(false);
      return true;
    } catch (error) {
      console.error("Failed to initialize session:", error);
      setApiConnectionError(true);
      return false;
    } finally {
      setIsInitializing(false);
    }
  };

  const toggleMic = async () => {
    if (interviewState === "asking" || interviewState === "completing") return;

    if (!isListening) {
      setIsListening(true);
      setInterviewState("listening");

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        audioChunksRef.current = [];

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        recorder.onstop = async () => {
          stream.getTracks().forEach((track) => track.stop());
          if (audioChunksRef.current.length > 0) {
            const audioBlob = new Blob(audioChunksRef.current, {
              type: "audio/webm",
            });
            await handleUserResponse(audioBlob);
          }
        };

        recorder.start();
      } catch (error) {
        console.error("Failed to start recording:", error);
        setIsListening(false);
        setInterviewState("idle");
      }
    } else {
      setIsListening(false);
      setInterviewState("processing");

      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
      }
    }
  };

  const handleUserResponse = async (audioBlob: Blob) => {
    if (!sessionId) return;

    try {
      const data: SubmitAnswerResponse = await submitAnswer(
        sessionId,
        audioBlob
      );

      if (data.is_complete) {
        setInterviewState("completing");
        setTimeout(async () => {
          await completeSession(sessionId);
          const results: SessionResultsResponse = await getSessionResults(
            sessionId
          );
          setSessionResults(results);
          setHasFinished(true);
        }, 2500);
      } else if (data.next_question) {
        setCurrentQuestion(data.next_question);
        setCurrentQuestionIndex(data.question_index);
        setInterviewState("asking");

        await playTTSAudio(data.next_question);

        setTimeout(() => {
          setInterviewState("idle");
        }, 1000);
      }
    } catch (error) {
      console.error("Failed to submit answer:", error);
      setInterviewState("idle");
    }
  };

  const resetInterview = () => {
    setHasStarted(false);
    setHasFinished(false);
    setCurrentQuestionIndex(0);
    setTimer(0);
    setInterviewState("idle");
    setSessionId(null);
    setWeekData(null);
    setCurrentQuestion("");
    setSessionResults(null);
    setApiConnectionError(false);
    setIsInitializing(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  };

  if (!hasStarted) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          bgcolor: "#09090b",
          color: "white",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <Box
          sx={{
            position: "fixed",
            inset: 0,
            zIndex: 0,
            pointerEvents: "none",
            backgroundImage: `
              linear-gradient(to right, rgba(128,128,128,0.07) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(128,128,128,0.07) 1px, transparent 1px)
            `,
            backgroundSize: "24px 24px",
            "&::before": {
              content: '""',
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "500px",
              background:
                "linear-gradient(to bottom, rgba(79, 70, 229, 0.2), transparent)",
              filter: "blur(100px)",
            },
          }}
        />

        {apiConnectionError && (
          <Box
            sx={{
              position: "fixed",
              inset: 0,
              zIndex: 100,
              bgcolor: "rgba(0, 0, 0, 0.85)",
              backdropFilter: "blur(8px)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              p: 3,
            }}
          >
            <Card
              sx={{
                maxWidth: "32rem",
                width: "100%",
                bgcolor: "rgba(24, 24, 27, 0.95)",
                backdropFilter: "blur(24px)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: 4,
                p: 4,
                textAlign: "center",
              }}
            >
              <Box
                sx={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  bgcolor: "rgba(239, 68, 68, 0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  mx: "auto",
                  mb: 3,
                }}
              >
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    border: "3px solid #ef4444",
                    borderTopColor: "transparent",
                    animation: "spin 1s linear infinite",
                  }}
                />
              </Box>
              <Typography
                variant="h5"
                sx={{
                  fontWeight: 700,
                  color: "white",
                  mb: 2,
                }}
              >
                API Not Reachable
              </Typography>
              <Typography
                sx={{
                  color: "#a1a1aa",
                  fontSize: "0.875rem",
                  mb: 4,
                  lineHeight: 1.75,
                }}
              >
                Unable to connect to the server at{" "}
                <Box
                  component="span"
                  sx={{
                    fontFamily: "monospace",
                    color: "#ef4444",
                    bgcolor: "rgba(239, 68, 68, 0.1)",
                    px: 1,
                    py: 0.5,
                    borderRadius: 1,
                  }}
                >
                  http://127.0.0.1:8000
                </Box>
                . Please check if the backend server is running and try again.
              </Typography>
              <Stack direction="row" spacing={2} justifyContent="center">
                <Button
                  onClick={() => {
                    setApiConnectionError(false);
                    initializeSession();
                  }}
                  variant="contained"
                  sx={{
                    bgcolor: "#10b981",
                    color: "black",
                    fontWeight: 600,
                    px: 3,
                    py: 1.5,
                    borderRadius: 2,
                    textTransform: "none",
                    "&:hover": {
                      bgcolor: "#059669",
                    },
                  }}
                >
                  Try Again
                </Button>
                <Button
                  onClick={() => setApiConnectionError(false)}
                  variant="outlined"
                  sx={{
                    borderColor: "rgba(255, 255, 255, 0.2)",
                    color: "white",
                    fontWeight: 600,
                    px: 3,
                    py: 1.5,
                    borderRadius: 2,
                    textTransform: "none",
                    "&:hover": {
                      borderColor: "rgba(255, 255, 255, 0.4)",
                      bgcolor: "rgba(255, 255, 255, 0.05)",
                    },
                  }}
                >
                  Cancel
                </Button>
              </Stack>
            </Card>
          </Box>
        )}

        <Box
          sx={{
            position: "relative",
            zIndex: 10,
            height: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            p: 3,
            opacity: apiConnectionError ? 0.3 : 1,
            transition: "opacity 0.3s",
            pointerEvents: apiConnectionError ? "none" : "auto",
          }}
        >
          <Box sx={{ maxWidth: "42rem", width: "100%" }}>
            <Box sx={{ textAlign: "center", mb: 6 }}>
              <Chip
                label={`Technical Mentor • Week ${WEEK_NUMBER}`}
                sx={{
                  bgcolor: "rgba(99, 102, 241, 0.1)",
                  border: "1px solid rgba(99, 102, 241, 0.2)",
                  color: "#818cf8",
                  fontSize: "0.75rem",
                  fontFamily: "monospace",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  mb: 3,
                  height: 28,
                }}
              />
              <Typography
                variant="h1"
                sx={{
                  fontSize: { xs: "3rem", md: "3.75rem" },
                  fontWeight: 700,
                  letterSpacing: "-0.025em",
                  color: "white",
                  mb: 3,
                }}
              >
                Python Programming
              </Typography>
              <Typography
                variant="body1"
                sx={{
                  color: "#a1a1aa",
                  fontSize: { xs: "1.125rem", md: "1.25rem" },
                  maxWidth: "36rem",
                  mx: "auto",
                  lineHeight: 1.75,
                }}
              >
                Focus on python fundamentals and magic methods.
              </Typography>
            </Box>
            {/* 
            <Card
              sx={{
                bgcolor: "rgba(24, 24, 27, 0.5)",
                backdropFilter: "blur(24px)",
                border: "1px solid rgba(255, 255, 255, 0.05)",
                borderRadius: 4,
                p: 4,
                mb: 6,
              }}
            >
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                sx={{ mb: 3 }}
              >
                <Layers sx={{ fontSize: 16 }} />
                <Typography
                  variant="caption"
                  sx={{
                    color: "#71717a",
                    fontFamily: "monospace",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                  }}
                >
                  Session Targets
                </Typography>
              </Stack>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={2}
                flexWrap="wrap"
                useFlexGap
              >
                {[
                  "Custom Hooks",
                  "Context API",
                  "Performance Optimization",
                  "Component Composition",
                ].map((concept, i) => (
                  <Box
                    key={i}
                    sx={{
                      flex: { xs: "1 1 100%", sm: "1 1 calc(50% - 8px)" },
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      p: 1.5,
                      borderRadius: 2,
                      bgcolor: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid rgba(255, 255, 255, 0.05)",
                    }}
                  >
                    <CheckCircle
                      sx={{ fontSize: 18, color: "rgba(16, 185, 129, 0.5)" }}
                    />
                    <Typography sx={{ color: "#e4e4e7", fontWeight: 500 }}>
                      {concept}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Card> */}

            <Box sx={{ display: "flex", justifyContent: "center" }}>
              <Button
                onClick={async () => {
                  const success = await initializeSession();
                  if (success) {
                    setHasStarted(true);
                  }
                }}
                disabled={isInitializing}
                variant="contained"
                endIcon={isInitializing ? undefined : <ArrowForward />}
                sx={{
                  px: 4,
                  py: 2,
                  bgcolor: "#10b981",
                  color: "black",
                  fontWeight: 700,
                  fontSize: "1.125rem",
                  borderRadius: "9999px",
                  textTransform: "none",
                  boxShadow: "0 0 40px rgba(16, 185, 129, 0.3)",
                  "&:hover": {
                    bgcolor: "#059669",
                    transform: "scale(1.05)",
                    boxShadow: "0 0 60px rgba(16, 185, 129, 0.5)",
                  },
                  "&:disabled": {
                    bgcolor: "#10b981",
                    opacity: 0.6,
                  },
                  transition: "all 0.3s",
                }}
              >
                {isInitializing ? "Connecting..." : "Initialize Session"}
              </Button>
            </Box>

            <Typography
              variant="caption"
              sx={{
                display: "block",
                textAlign: "center",
                color: "#52525b",
                fontSize: "0.75rem",
                mt: 4,
                fontFamily: "monospace",
              }}
            >
              Microphone access required • AI Assessment Engine v2.4
            </Typography>
          </Box>
        </Box>
      </Box>
    );
  }

  if (hasFinished && sessionResults) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          bgcolor: "#09090b",
          color: "white",
          overflowY: "auto",
          overflowX: "hidden",
          position: "relative",
        }}
      >
        <Box
          sx={{
            position: "fixed",
            inset: 0,
            zIndex: 0,
            pointerEvents: "none",
            backgroundImage: `
              linear-gradient(to right, rgba(128,128,128,0.07) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(128,128,128,0.07) 1px, transparent 1px)
            `,
            backgroundSize: "24px 24px",
          }}
        />

        <Box
          sx={{
            position: "relative",
            zIndex: 10,
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-start",
            p: 3,
            py: 4,
          }}
        >
          <Card
            sx={{
              maxWidth: "56rem",
              width: "100%",
              bgcolor: "rgba(24, 24, 27, 0.6)",
              backdropFilter: "blur(24px)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: 6,
              overflow: "visible",
              display: "flex",
              flexDirection: { xs: "column", md: "row" },
              my: 2,
            }}
          >
            <Box
              sx={{
                width: { xs: "100%", md: "33.333%" },
                bgcolor: "rgba(255, 255, 255, 0.05)",
                p: 4,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                borderBottom: {
                  xs: "1px solid rgba(255, 255, 255, 0.05)",
                  md: "none",
                },
                borderRight: {
                  xs: "none",
                  md: "1px solid rgba(255, 255, 255, 0.05)",
                },
                position: "relative",
                overflow: "hidden",
                "&::before": {
                  content: '""',
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(to bottom right, rgba(99, 102, 241, 0.1), transparent)",
                },
              }}
            >
              <Box
                sx={{ position: "relative", zIndex: 10, textAlign: "center" }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    color: "#a1a1aa",
                    fontWeight: 500,
                    mb: 3,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                  }}
                >
                  Your Performance
                </Typography>

                <Box
                  sx={{
                    position: "relative",
                    width: 160,
                    height: 160,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    mb: 3,
                    mx: "auto",
                  }}
                >
                  <CircularProgress
                    variant="determinate"
                    value={sessionResults.performance_score}
                    size={160}
                    thickness={12}
                    sx={{
                      position: "absolute",
                      color: "#27272a",
                      "& .MuiCircularProgress-circle": {
                        strokeLinecap: "round",
                      },
                    }}
                  />
                  <CircularProgress
                    variant="determinate"
                    value={sessionResults.performance_score}
                    size={160}
                    thickness={12}
                    sx={{
                      position: "absolute",
                      color: "#10b981",
                      transform: "rotate(-90deg)",
                      "& .MuiCircularProgress-circle": {
                        strokeLinecap: "round",
                      },
                    }}
                  />
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                    }}
                  >
                    <Typography
                      sx={{
                        color: "#10b981",
                        fontSize: "0.875rem",
                        fontWeight: 500,
                        mt: 0.5,
                      }}
                    >
                      Strong
                    </Typography>
                  </Box>
                </Box>

                <Stack
                  direction="row"
                  spacing={2}
                  justifyContent="center"
                  alignItems="center"
                >
                  <Box sx={{ textAlign: "center" }}>
                    <Typography
                      variant="caption"
                      sx={{
                        color: "#71717a",
                        textTransform: "uppercase",
                        mb: 0.5,
                        display: "block",
                      }}
                    >
                      Time
                    </Typography>
                    <Typography
                      sx={{ fontFamily: "monospace", color: "white" }}
                    >
                      {sessionResults.time_elapsed_formatted}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      width: "1px",
                      height: 24,
                      bgcolor: "rgba(255, 255, 255, 0.1)",
                    }}
                  />
                  <Box sx={{ textAlign: "center" }}>
                    <Typography
                      variant="caption"
                      sx={{
                        color: "#71717a",
                        textTransform: "uppercase",
                        mb: 0.5,
                        display: "block",
                      }}
                    >
                      Complete
                    </Typography>
                    <Typography
                      sx={{ fontFamily: "monospace", color: "#10b981" }}
                    >
                      100%
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            </Box>

            <Box
              sx={{
                width: { xs: "100%", md: "66.666%" },
                p: 4,
                overflowY: "auto",
                maxHeight: { xs: "none", md: "calc(100vh - 32px)" },
              }}
            >
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ mb: 3 }}
              >
                <Box>
                  <Typography
                    variant="h4"
                    sx={{ fontWeight: 700, color: "white", mb: 0.5 }}
                  >
                    Session Analysis
                  </Typography>
                  <Typography sx={{ color: "#a1a1aa", fontSize: "0.875rem" }}>
                    Week {WEEK_NUMBER} • Advanced React Patterns
                  </Typography>
                </Box>
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    bgcolor: "rgba(16, 185, 129, 0.2)",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <EmojiEvents sx={{ color: "#10b981", fontSize: 20 }} />
                </Box>
              </Stack>

              <Stack spacing={3} sx={{ pb: 2 }}>
                <Card
                  sx={{
                    bgcolor: "rgba(39, 39, 42, 0.5)",
                    borderRadius: 3,
                    p: 2,
                    border: "1px solid rgba(255, 255, 255, 0.05)",
                  }}
                >
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    sx={{ mb: 1 }}
                  >
                    <AutoAwesome sx={{ fontSize: 14, color: "#818cf8" }} />
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 700,
                        color: "#c7d2fe",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      Mentor Note
                    </Typography>
                  </Stack>
                  <Typography
                    sx={{
                      color: "#d4d4d8",
                      fontSize: "0.875rem",
                      lineHeight: 1.75,
                    }}
                  >
                    {sessionResults.mentor_feedback}
                  </Typography>
                </Card>

                {sessionResults.skill_breakdown && (
                  <Box>
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 500,
                        color: "#71717a",
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        mb: 2,
                        display: "block",
                      }}
                    >
                      Skill Assessment
                    </Typography>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={2}
                      flexWrap="wrap"
                      useFlexGap
                    >
                      {Object.entries(sessionResults.skill_breakdown).map(
                        ([skill, score]) => (
                          <Box
                            key={skill}
                            sx={{
                              flex: {
                                xs: "1 1 100%",
                                sm: "1 1 calc(50% - 8px)",
                              },
                            }}
                          >
                            <SkillBar label={skill} percentage={score} />
                          </Box>
                        )
                      )}
                    </Stack>
                  </Box>
                )}

                <Box
                  sx={{ pt: 2, display: "flex", justifyContent: "flex-end" }}
                >
                  <Button
                    onClick={resetInterview}
                    variant="contained"
                    endIcon={<ArrowForward />}
                    sx={{
                      bgcolor: "white",
                      color: "black",
                      fontWeight: 600,
                      textTransform: "none",
                      borderRadius: 2,
                      px: 2.5,
                      py: 1.25,
                      "&:hover": {
                        bgcolor: "#e4e4e7",
                      },
                    }}
                  >
                    Return to Dashboard
                  </Button>
                </Box>
              </Stack>
            </Box>
          </Card>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "#09090b",
        color: "white",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <Box
        sx={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          backgroundImage: `
            linear-gradient(to right, rgba(128,128,128,0.07) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(128,128,128,0.07) 1px, transparent 1px)
          `,
          backgroundSize: "24px 24px",
          "&::before": {
            content: '""',
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "500px",
            background:
              "linear-gradient(to bottom, rgba(79, 70, 229, 0.2), transparent)",
            filter: "blur(100px)",
          },
        }}
      />

      {interviewState === "completing" && (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            zIndex: 50,
            bgcolor: "rgba(0, 0, 0, 0.8)",
            backdropFilter: "blur(12px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Box sx={{ width: 256, mb: 2 }}>
            <LinearProgress
              sx={{
                height: 8,
                borderRadius: "9999px",
                bgcolor: "#27272a",
                "& .MuiLinearProgress-bar": {
                  bgcolor: "#10b981",
                  borderRadius: "9999px",
                },
              }}
            />
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Memory sx={{ fontSize: 16, color: "#10b981" }} />
            <Typography
              sx={{
                color: "#10b981",
                fontFamily: "monospace",
                fontSize: "0.875rem",
                animation: "pulse 2s ease-in-out infinite",
              }}
            >
              UPLOADING SESSION DATA...
            </Typography>
          </Stack>
        </Box>
      )}

      <Box
        sx={{
          position: "relative",
          zIndex: 10,
          height: "100vh",
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
        }}
      >
        <Box
          sx={{
            flex: 2,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            p: 3,
            position: "relative",
          }}
        >
          <Box
            sx={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              p: 3,
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              maxWidth: "80rem",
              mx: "auto",
              width: "100%",
            }}
          >
            <Stack direction="row" spacing={2} alignItems="center">
              <Chip
                icon={
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      bgcolor: "#ef4444",
                      animation:
                        interviewState !== "completing"
                          ? "pulse 2s ease-in-out infinite"
                          : "none",
                    }}
                  />
                }
                label={formatTime(timer)}
                sx={{
                  bgcolor: "rgba(24, 24, 27, 0.8)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  backdropFilter: "blur(4px)",
                  color: "#a1a1aa",
                  fontFamily: "monospace",
                  fontSize: "0.75rem",
                  height: 32,
                }}
              />
              <IconButton
                sx={{
                  color: "#a1a1aa",
                  "&:hover": {
                    bgcolor: "rgba(255, 255, 255, 0.1)",
                    color: "white",
                  },
                }}
              >
                <Settings />
              </IconButton>
            </Stack>
          </Box>

          <Box
            sx={{
              position: "relative",
              width: "100%",
              maxWidth: "48rem",
              aspectRatio: { xs: "4/3", md: "16/9" },
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                background:
                  interviewState === "asking"
                    ? "linear-gradient(to top, rgba(99, 102, 241, 0.1), transparent)"
                    : "transparent",
                opacity: interviewState === "asking" ? 1 : 0,
                transition: "opacity 1s",
              }}
            />

            <Box
              sx={{
                position: "relative",
                zIndex: 10,
                "&:hover .avatar-image": {
                  transform: "scale(1.1)",
                },
              }}
            >
              <Box
                sx={{
                  position: "absolute",
                  inset: -4,
                  borderRadius: "2rem",
                  background:
                    interviewState === "listening"
                      ? "linear-gradient(to bottom, rgba(16, 185, 129, 0.3), transparent)"
                      : "transparent",
                  filter: "blur(4px)",
                  opacity: interviewState === "listening" ? 0.5 : 0,
                  transform:
                    interviewState === "listening" ? "scale(1.05)" : "scale(1)",
                  transition: "all 0.7s",
                }}
              />

              <Card
                sx={{
                  position: "relative",
                  width: { xs: 300, md: 340 },
                  height: { xs: 380, md: 420 },
                  borderRadius: "2rem",
                  overflow: "hidden",
                  boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.8)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  bgcolor: "#18181b",
                  transition: "transform 0.7s ease-out",
                  "&:hover": {
                    transform: "scale(1.02)",
                  },
                }}
              >
                <Box
                  component="img"
                  src={INTERVIEWER_IMAGE}
                  alt="Interviewer"
                  className="avatar-image"
                  sx={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    transition: "transform 20s ease-linear",
                  }}
                />

                <Box
                  sx={{
                    position: "absolute",
                    inset: 0,
                    background:
                      "linear-gradient(to top, rgba(0, 0, 0, 0.9), rgba(0, 0, 0, 0.2), transparent)",
                  }}
                />

                <Box
                  sx={{
                    position: "absolute",
                    bottom: 24,
                    left: 24,
                    right: 24,
                  }}
                >
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    sx={{ mb: 1 }}
                  >
                    <Box
                      sx={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        bgcolor:
                          interviewState === "completing"
                            ? "#71717a"
                            : "#10b981",
                        boxShadow: "0 0 8px rgba(52, 211, 153, 0.8)",
                      }}
                    />
                    <Typography
                      sx={{
                        fontSize: "10px",
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        fontFamily: "monospace",
                        color:
                          interviewState === "completing"
                            ? "#71717a"
                            : "#10b981",
                      }}
                    >
                      {interviewState === "completing"
                        ? "Offline"
                        : "Mentor Live"}
                    </Typography>
                  </Stack>
                  <Typography
                    variant="h5"
                    sx={{ fontWeight: 700, color: "white", mb: 0.5 }}
                  >
                    Sarah Chen
                  </Typography>
                  <Typography
                    sx={{
                      color: "#a1a1aa",
                      fontSize: "0.75rem",
                      fontFamily: "monospace",
                    }}
                  >
                    Senior Technical Lead
                  </Typography>
                </Box>
              </Card>

              {interviewState === "processing" && (
                <Card
                  sx={{
                    position: "absolute",
                    right: -64,
                    top: 40,
                    bgcolor: "rgba(39, 39, 42, 0.9)",
                    backdropFilter: "blur(12px)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    p: 1.5,
                    borderRadius: 3,
                    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
                    animation: "bounce 1s ease-in-out infinite",
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        bgcolor: "#6366f1",
                        animation: "ping 1s ease-in-out infinite",
                      }}
                    />
                    <Typography
                      sx={{
                        fontSize: "0.75rem",
                        color: "#d4d4d8",
                        fontFamily: "monospace",
                      }}
                    >
                      Processing Input...
                    </Typography>
                  </Stack>
                </Card>
              )}
            </Box>

            <Box
              sx={{
                position: "absolute",
                bottom: { xs: -96, md: -128 },
                left: 0,
                right: 0,
                textAlign: "center",
                px: 4,
                opacity:
                  interviewState === "idle" || interviewState === "asking"
                    ? 1
                    : 0.4,
                transform:
                  interviewState === "idle" || interviewState === "asking"
                    ? "translateY(0)"
                    : "translateY(16px)",
                filter:
                  interviewState === "idle" || interviewState === "asking"
                    ? "none"
                    : "blur(4px)",
                transition: "all 0.7s",
              }}
            >
              {interviewState !== "completing" && (
                <Typography
                  variant="h4"
                  sx={{
                    fontSize: { xs: "1.25rem", md: "1.875rem" },
                    fontWeight: 500,
                    color: "#f4f4f5",
                    lineHeight: 1.25,
                    maxWidth: "64rem",
                    mx: "auto",
                    textShadow: "0 4px 6px rgba(0, 0, 0, 0.5)",
                  }}
                >
                  {currentQuestion}
                </Typography>
              )}
            </Box>
          </Box>
        </Box>

        <Box
          sx={{
            width: { xs: "100%", md: 380 },
            display: "flex",
            flexDirection: "column",
            bgcolor: "rgba(24, 24, 27, 0.5)",
            backdropFilter: "blur(24px)",
            borderLeft: {
              xs: "none",
              md: "1px solid rgba(255, 255, 255, 0.05)",
            },
            borderTop: {
              xs: "1px solid rgba(255, 255, 255, 0.05)",
              md: "none",
            },
            position: "relative",
            zIndex: 20,
          }}
        >
          <Box sx={{ p: 3, bgcolor: "rgba(24, 24, 27, 0.5)" }}>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{ mb: 2 }}
            >
              <Stack direction="row" spacing={1} alignItems="center">
                <MenuBook sx={{ fontSize: 14 }} />
                <Typography
                  variant="caption"
                  sx={{
                    color: "#71717a",
                    fontFamily: "monospace",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                  }}
                >
                  Curriculum Context
                </Typography>
              </Stack>
              <Chip
                label="Active"
                sx={{
                  bgcolor: "rgba(5, 150, 105, 0.3)",
                  border: "1px solid rgba(16, 185, 129, 0.2)",
                  color: "#10b981",
                  fontSize: "10px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  height: 20,
                }}
              />
            </Stack>

            {weekData && (
              <>
                <Card
                  sx={{
                    background:
                      "linear-gradient(to bottom right, rgba(39, 39, 42, 0.5), rgba(24, 24, 27, 0.5))",
                    border: "1px solid rgba(255, 255, 255, 0.05)",
                    borderRadius: 3,
                    p: 2,
                    mb: 2,
                  }}
                >
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="flex-start"
                    sx={{ mb: 1 }}
                  >
                    <Box>
                      <Typography
                        sx={{
                          fontSize: "0.75rem",
                          color: "#818cf8",
                          fontFamily: "monospace",
                          display: "block",
                          mb: 0.5,
                        }}
                      >
                        Week {weekData.week}
                      </Typography>
                      <Typography
                        variant="h6"
                        sx={{ fontWeight: 700, color: "white" }}
                      >
                        {weekData.title}
                      </Typography>
                    </Box>
                    <Layers sx={{ color: "#52525b", fontSize: 18 }} />
                  </Stack>

                  <Stack spacing={1} sx={{ mt: 2 }}>
                    {weekData.concepts.map((concept, i) => {
                      const conceptName =
                        typeof concept === "string"
                          ? concept
                          : concept.name ||
                            concept.title ||
                            JSON.stringify(concept);
                      return (
                        <Stack
                          key={i}
                          direction="row"
                          spacing={1.5}
                          alignItems="center"
                        >
                          <Box
                            sx={{
                              width: 16,
                              height: 16,
                              borderRadius: "50%",
                              border:
                                i < currentQuestionIndex
                                  ? "none"
                                  : "1px solid #3f3f46",
                              bgcolor:
                                i < currentQuestionIndex
                                  ? "rgba(16, 185, 129, 0.2)"
                                  : "transparent",
                              borderColor:
                                i < currentQuestionIndex
                                  ? "rgba(16, 185, 129, 0.5)"
                                  : "#3f3f46",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {i < currentQuestionIndex && (
                              <CheckCircle
                                sx={{ fontSize: 10, color: "#10b981" }}
                              />
                            )}
                          </Box>
                          <Typography
                            sx={{
                              fontSize: "0.875rem",
                              color:
                                i < currentQuestionIndex
                                  ? "#a1a1aa"
                                  : "#d4d4d8",
                              textDecoration:
                                i < currentQuestionIndex
                                  ? "line-through"
                                  : "none",
                              textDecorationColor: "#52525b",
                            }}
                          >
                            {conceptName}
                          </Typography>
                        </Stack>
                      );
                    })}
                  </Stack>
                </Card>
              </>
            )}
          </Box>

          <Box sx={{ flex: 1 }} />

          <Box
            sx={{
              p: 3,
              background:
                "linear-gradient(to top, #000000, rgba(24, 24, 27, 0.9), transparent)",
              borderTop: "1px solid rgba(255, 255, 255, 0.05)",
            }}
          >
            <Stack spacing={4} alignItems="center">
              <Box
                sx={{
                  width: "100%",
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <AudioWaveform isActive={isListening} />
              </Box>

              <Box sx={{ position: "relative" }}>
                <Box
                  sx={{
                    position: "absolute",
                    inset: 0,
                    bgcolor: "#6366f1",
                    borderRadius: "50%",
                    filter: "blur(32px)",
                    opacity: isListening ? 0.5 : 0.2,
                    transition: "all 0.5s",
                    animation: isListening
                      ? "pulse 2s ease-in-out infinite"
                      : "none",
                  }}
                />
                <IconButton
                  onClick={toggleMic}
                  disabled={interviewState === "completing"}
                  sx={{
                    width: 96,
                    height: 96,
                    borderRadius: "50%",
                    border: "2px solid",
                    bgcolor: isListening ? "#f43f5e" : "#18181b",
                    borderColor: isListening
                      ? "#fb7185"
                      : "rgba(255, 255, 255, 0.1)",
                    color: "white",
                    boxShadow: isListening
                      ? "0 0 30px rgba(244, 63, 94, 0.4)"
                      : "none",
                    "&:hover": {
                      borderColor: isListening ? "#fb7185" : "#6366f1",
                      boxShadow: isListening
                        ? "0 0 30px rgba(244, 63, 94, 0.4)"
                        : "0 0 30px rgba(99, 102, 241, 0.3)",
                    },
                    "&:active": {
                      transform: "scale(0.95)",
                    },
                    "&:disabled": {
                      opacity: 0.5,
                      cursor: "not-allowed",
                    },
                    transition: "all 0.3s",
                  }}
                >
                  {isListening ? (
                    <MicOff sx={{ fontSize: 32 }} />
                  ) : (
                    <Mic sx={{ fontSize: 32 }} />
                  )}
                </IconButton>
              </Box>

              <Box sx={{ textAlign: "center", pb: 2 }}>
                <Typography
                  sx={{
                    color: "#d4d4d8",
                    fontSize: "0.875rem",
                    fontWeight: 500,
                    letterSpacing: "0.05em",
                  }}
                >
                  {isListening ? "Recording Answer..." : "Tap to Speak"}
                </Typography>
                <Typography
                  sx={{
                    color: "#52525b",
                    fontSize: "0.75rem",
                    mt: 0.5,
                  }}
                >
                  {interviewState === "completing"
                    ? "Finalizing session..."
                    : isListening
                    ? "Speak clearly into your microphone"
                    : "Ready for your input"}
                </Typography>
              </Box>
            </Stack>
          </Box>
        </Box>
      </Box>

      <audio ref={audioRef} style={{ display: "none" }} />

      <style>
        {`
          @keyframes pulse {
            0%, 100% {
              opacity: 1;
            }
            50% {
              opacity: 0.5;
            }
          }
          @keyframes ping {
            0% {
              transform: scale(1);
              opacity: 1;
            }
            75%, 100% {
              transform: scale(1.5);
              opacity: 0;
            }
          }
          @keyframes bounce {
            0%, 100% {
              transform: translateY(0);
            }
            50% {
              transform: translateY(-10px);
            }
          }
          @keyframes spin {
            0% {
              transform: rotate(0deg);
            }
            100% {
              transform: rotate(360deg);
            }
          }
        `}
      </style>
    </Box>
  );
}

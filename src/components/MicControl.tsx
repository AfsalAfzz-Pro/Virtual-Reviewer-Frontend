import { Button } from "@mui/material";
import MicIcon from "@mui/icons-material/Mic";
import StopIcon from "@mui/icons-material/Stop";
import { useRef, useState } from "react";

interface MicControlProps {
  onSubmit: (audio: Blob) => void;
  disabled?: boolean;
}

export default function MicControl({ onSubmit, disabled = false }: MicControlProps) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const [recording, setRecording] = useState<boolean>(false);

  const startRecording = async (): Promise<void> => {
    const stream: MediaStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });

    const recorder = new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (event: BlobEvent) => {
      chunksRef.current.push(event.data);
    };

    recorder.start();
    setRecording(true);
  };

  const stopRecording = (): void => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    recorder.stop();
    setRecording(false);

    recorder.onstop = () => {
      const audioBlob = new Blob(chunksRef.current, {
        type: "audio/webm",
      });
      chunksRef.current = [];
      onSubmit(audioBlob);
    };
  };

  return (
    <Button
      onClick={recording ? stopRecording : startRecording}
      disabled={disabled}
      sx={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "1rem",
        fontWeight: 800,
        border: "4px solid #000000",
        borderRadius: 0,
        padding: "1rem 2rem",
        backgroundColor: recording ? "#FF0000" : "#000000",
        color: "#FFFFFF",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        boxShadow: "4px 4px 0px 0px #000000",
        width: "100%",
        "&:hover": {
          backgroundColor: recording ? "#CC0000" : "#333333",
          transform: "translate(2px, 2px)",
          boxShadow: "2px 2px 0px 0px #000000",
        },
        "&:active": {
          transform: "translate(4px, 4px)",
          boxShadow: "0px 0px 0px 0px #000000",
        },
      }}
      startIcon={
        recording ? (
          <StopIcon sx={{ fontSize: "1.5rem" }} />
        ) : (
          <MicIcon sx={{ fontSize: "1.5rem" }} />
        )
      }
    >
      {recording ? "STOP ANSWERING" : "ANSWER"}
    </Button>
  );
}

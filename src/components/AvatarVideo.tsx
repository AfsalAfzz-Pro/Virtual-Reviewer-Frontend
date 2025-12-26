import { Box, Button } from "@mui/material";
import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";
import { Room, RoomEvent, RemoteTrackPublication, RemoteTrack } from "livekit-client";
import { createAvatarSession, type AvatarSessionResponse, type AvatarSpeakEvent } from "../api/interviewApi";

export interface AvatarVideoHandle {
  speak: (text: string) => Promise<void>;
  disconnect: () => Promise<void>;
  isConnected: boolean;
}

interface AvatarVideoProps {
  onSessionCreated?: (sessionData: AvatarSessionResponse) => void;
  onConnected?: () => void;
}

const AvatarVideo = forwardRef<AvatarVideoHandle, AvatarVideoProps>(({ onSessionCreated, onConnected }, ref) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioElementsRef = useRef<HTMLAudioElement[]>([]);
  const roomRef = useRef<Room | null>(null);
  const isCreatingRef = useRef(false);
  const hasSessionRef = useRef(false);
  const onSessionCreatedRef = useRef(onSessionCreated);
  const onConnectedRef = useRef(onConnected);
  const [isConnected, setIsConnected] = useState(false);
  const [showAudioEnableButton, setShowAudioEnableButton] = useState(false);

  onSessionCreatedRef.current = onSessionCreated;
  onConnectedRef.current = onConnected;

  const speak = async (text: string): Promise<void> => {
    if (!roomRef.current) {
      console.warn("Room not initialized. Cannot send speak event.");
      return;
    }

    if (roomRef.current.state !== "connected") {
      console.warn(`Room not connected. Current state: ${roomRef.current.state}. Cannot send speak event.`);
      return;
    }

    try {
      const eventData: AvatarSpeakEvent = {
        event_type: "avatar.speak_text",
        data: {
          text,
        },
      };

      const payloadString = JSON.stringify(eventData);
      const payloadBytes = new TextEncoder().encode(payloadString);

      console.log("🎤 Sending avatar speak event:", {
        event_type: eventData.event_type,
        text: eventData.data.text,
        textLength: eventData.data.text.length,
        timestamp: new Date().toISOString(),
      });
      console.log("📤 Raw payload string:", payloadString);
      console.log("📤 Payload as Uint8Array:", payloadBytes);
      console.log("📤 Payload length:", payloadBytes.length);

      await roomRef.current.localParticipant.publishData(
        payloadBytes,
        { topic: "agent-control" }
      );

      console.log("✅ Avatar speak event sent successfully:", {
        text: eventData.data.text,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("❌ Failed to send speak event:", error);
      throw error;
    }
  };

  const enableAudio = async (): Promise<void> => {
    const audioContext = (window as any).audioContext as AudioContext | undefined;
    if (audioContext && audioContext.state === "suspended") {
      try {
        await audioContext.resume();
        console.log("✅ AudioContext resumed");
      } catch (error) {
        console.error("❌ Failed to resume AudioContext:", error);
      }
    }

    audioElementsRef.current.forEach(async (audio) => {
      try {
        await audio.play();
        console.log("✅ Audio element played successfully");
      } catch (error) {
        console.error("❌ Failed to play audio element:", error);
      }
    });

    setShowAudioEnableButton(false);
  };

  const disconnect = async (): Promise<void> => {
    if (roomRef.current && roomRef.current.state === "connected") {
      try {
        await roomRef.current.disconnect();
        console.log("Disconnected from LiveKit room");
      } catch (error) {
        console.error("Failed to disconnect from LiveKit:", error);
        throw error;
      }
    }
    roomRef.current = null;
    setIsConnected(false);
    hasSessionRef.current = false;
    isCreatingRef.current = false;
    audioElementsRef.current = [];
  };

  useImperativeHandle(ref, () => ({
    speak,
    disconnect,
    isConnected,
  }));

  useEffect(() => {
    if (isCreatingRef.current || hasSessionRef.current) {
      return;
    }

    const existingToken = sessionStorage.getItem("avatarSessionToken");
    if (existingToken) {
      hasSessionRef.current = true;
      return;
    }

    let room: Room | null = null;
    let isMounted = true;

    async function connectAvatar(): Promise<void> {
      if (isCreatingRef.current || !isMounted) {
        return;
      }

      isCreatingRef.current = true;
      try {
        const data = await createAvatarSession();
        
        if (!isMounted) {
          return;
        }

        if (!data.livekit_url || !data.livekit_token) {
          console.error("Missing LiveKit connection details:", data);
          isCreatingRef.current = false;
          return;
        }

        onSessionCreatedRef.current?.(data);
        hasSessionRef.current = true;

        room = new Room();
        roomRef.current = room;

        room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: RemoteTrackPublication) => {
          console.log("📹 Track subscribed:", {
            kind: track.kind,
            trackId: track.sid,
            publicationId: publication.trackSid,
            timestamp: new Date().toISOString(),
          });
          if (track.kind === "video" && videoRef.current) {
            track.attach(videoRef.current);
          } else if (track.kind === "audio") {
            if (audioRef.current) {
              const audioElement = track.attach(audioRef.current) as HTMLAudioElement;
              audioElement.volume = 1.0;
              audioElementsRef.current.push(audioElement);
              
              const playPromise = audioElement.play();
              if (playPromise !== undefined) {
                playPromise
                  .then(() => {
                    console.log("✅ Audio playback started successfully");
                    setShowAudioEnableButton(false);
                  })
                  .catch((error) => {
                    if (error.name === "NotAllowedError") {
                      console.warn("⚠️ Audio autoplay blocked. User interaction required.");
                      setShowAudioEnableButton(true);
                    } else {
                      console.error("❌ Audio playback error:", error);
                    }
                  });
              }
            }
          }
        });

        room.on(RoomEvent.DataReceived, (payload, participant, kind, topic) => {
          console.log("📨 Data received from room:", {
            payload: payload instanceof Uint8Array 
              ? new TextDecoder().decode(payload) 
              : payload,
            participant: participant?.identity,
            kind,
            topic,
            timestamp: new Date().toISOString(),
          });
        });

        room.on(RoomEvent.Connected, () => {
          console.log("✅ Connected to LiveKit room");
          console.log("📊 Room state:", {
            name: room?.name,
            localParticipant: room?.localParticipant?.identity,
            remoteParticipants: room?.remoteParticipants.size,
            timestamp: new Date().toISOString(),
          });
          setIsConnected(true);
          setTimeout(() => {
            console.log("⏳ Waiting 500ms before triggering onConnected callback");
            onConnectedRef.current?.();
          }, 500);
        });

        room.on(RoomEvent.Disconnected, () => {
          console.log("❌ Disconnected from LiveKit room");
          setIsConnected(false);
        });

        await room.connect(data.livekit_url, data.livekit_token);
        isCreatingRef.current = false;
      } catch (error) {
        isCreatingRef.current = false;
        if (!isMounted) {
          return;
        }
        if (error instanceof Error && (error as any).isConcurrencyLimit) {
          console.error("Concurrency limit reached:", error.message);
          alert("Too many active sessions. Please wait a moment and try again.");
        } else {
          console.error("Failed to connect avatar:", error);
          if (error instanceof Error) {
            console.error("Error details:", error.message);
          }
        }
      }
    }

    connectAvatar();

    return () => {
      isMounted = false;
      if (room) {
        room.disconnect();
        roomRef.current = null;
      }
    };
  }, []);

  return (
    <Box>
      <Box
        component="h3"
        sx={{
          fontFamily: "'Black Ops One', sans-serif",
          fontSize: "1.25rem",
          fontWeight: 400,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          margin: "0 0 1rem 0",
          borderBottom: "4px solid #000000",
          paddingBottom: "0.5rem",
        }}
      >
        VIRTUAL REVIEWER
      </Box>

      <Box
        sx={{
          border: "4px solid #000000",
          backgroundColor: "#000000",
          padding: "4px",
          boxShadow: "4px 4px 0px 0px #000000",
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={false}
          style={{
            width: "100%",
            display: "block",
            backgroundColor: "#000",
          }}
        />
        <audio
          ref={audioRef}
          autoPlay
          style={{ display: "none" }}
          onPlay={(e) => {
            const audioElement = e.currentTarget;
            audioElement.play().catch((error) => {
              if (error.name === "NotAllowedError") {
                console.warn("⚠️ Audio autoplay blocked. User interaction required.");
                setShowAudioEnableButton(true);
              } else {
                console.error("❌ Audio playback error:", error);
              }
            });
          }}
        />
      </Box>
      
      {showAudioEnableButton && (
        <Box
          sx={{
            marginTop: "1rem",
            padding: "1rem",
            border: "3px solid #000000",
            backgroundColor: "#FFFF00",
            textAlign: "center",
          }}
        >
          <Box
            component="p"
            sx={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "0.875rem",
              fontWeight: 700,
              marginBottom: "0.5rem",
              textTransform: "uppercase",
            }}
          >
            Audio Playback Requires Permission
          </Box>
          <Button
            onClick={enableAudio}
            sx={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "0.875rem",
              fontWeight: 800,
              border: "3px solid #000000",
              backgroundColor: "#000000",
              color: "#FFFFFF",
              textTransform: "uppercase",
              padding: "0.5rem 1rem",
              "&:hover": {
                backgroundColor: "#333333",
              },
            }}
          >
            Enable Audio
          </Button>
        </Box>
      )}
    </Box>
  );
});

AvatarVideo.displayName = "AvatarVideo";

export default AvatarVideo;

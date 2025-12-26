import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#10b981",
    },
    secondary: {
      main: "#6366f1",
    },
    background: {
      default: "#09090b",
      paper: "#18181b",
    },
    text: {
      primary: "#ffffff",
      secondary: "#a1a1aa",
    },
  },
  shape: {
    borderRadius: 0,
  },
  typography: {
    fontFamily: "'JetBrains Mono', 'Courier New', monospace",
    h1: {
      fontFamily: "'Black Ops One', 'Impact', sans-serif",
      fontWeight: 400,
      textTransform: "uppercase",
      letterSpacing: "0.1em",
    },
    h2: {
      fontFamily: "'Black Ops One', 'Impact', sans-serif",
      fontWeight: 400,
      textTransform: "uppercase",
      letterSpacing: "0.1em",
    },
    h3: {
      fontFamily: "'Black Ops One', 'Impact', sans-serif",
      fontWeight: 400,
      textTransform: "uppercase",
      letterSpacing: "0.1em",
    },
    h4: {
      fontFamily: "'Black Ops One', 'Impact', sans-serif",
      fontWeight: 400,
      textTransform: "uppercase",
      letterSpacing: "0.1em",
    },
    h5: {
      fontFamily: "'Black Ops One', 'Impact', sans-serif",
      fontWeight: 400,
      textTransform: "uppercase",
      letterSpacing: "0.1em",
    },
    h6: {
      fontFamily: "'Black Ops One', 'Impact', sans-serif",
      fontWeight: 400,
      textTransform: "uppercase",
      letterSpacing: "0.1em",
    },
    body1: {
      fontFamily: "'JetBrains Mono', monospace",
      fontWeight: 700,
    },
    body2: {
      fontFamily: "'JetBrains Mono', monospace",
      fontWeight: 700,
    },
    button: {
      fontFamily: "'JetBrains Mono', monospace",
      fontWeight: 800,
      textTransform: "uppercase",
      letterSpacing: "0.1em",
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          border: "4px solid #000000",
          boxShadow: "4px 4px 0px 0px #000000",
          "&:hover": {
            boxShadow: "2px 2px 0px 0px #000000",
            transform: "translate(2px, 2px)",
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          border: "6px solid #000000",
          boxShadow: "8px 8px 0px 0px #000000",
        },
      },
    },
  },
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>
);

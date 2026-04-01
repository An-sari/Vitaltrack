import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { OAuth2Client } from "google-auth-library";
import cookieParser from "cookie-parser";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const oauth2Client = new OAuth2Client(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  "" // Redirect URI will be set per request
);

app.use(express.json());
app.use(cookieParser());

// Helper to get redirect URI
const getRedirectUri = (req: express.Request) => {
  const origin = req.headers.origin || `https://${req.headers.host}`;
  return `${origin}/auth/google/callback`;
};

// API Routes
app.get("/api/auth/google/url", (req, res) => {
  const redirectUri = getRedirectUri(req);
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/fitness.body.read",
      "https://www.googleapis.com/auth/fitness.activity.read",
      "profile",
      "email"
    ],
    redirect_uri: redirectUri,
    prompt: "consent"
  });
  res.json({ url });
});

app.get("/api/auth/google/callback", async (req, res) => {
  const { code } = req.query;
  const redirectUri = getRedirectUri(req);

  try {
    const { tokens } = await oauth2Client.getToken({
      code: code as string,
      redirect_uri: redirectUri
    });

    // Store tokens in a secure, SameSite=None cookie for iframe compatibility
    res.cookie("fit_tokens", JSON.stringify(tokens), {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'GOOGLE_FIT_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. This window should close automatically.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("OAuth Error:", error);
    res.status(500).send("Authentication failed");
  }
});

app.get("/api/fit/status", (req, res) => {
  const tokens = req.cookies.fit_tokens;
  res.json({ connected: !!tokens });
});

app.post("/api/fit/sync", async (req, res) => {
  const tokensStr = req.cookies.fit_tokens;
  if (!tokensStr) {
    return res.status(401).json({ error: "Not connected to Google Fit" });
  }

  const tokens = JSON.parse(tokensStr);
  oauth2Client.setCredentials(tokens);

  try {
    // Refresh token if needed
    const { token } = await oauth2Client.getAccessToken();
    
    // Fetch weight data (last 30 days)
    const endTime = Date.now();
    const startTime = endTime - 30 * 24 * 60 * 60 * 1000;

    const weightResponse = await axios.post(
      "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate",
      {
        aggregateBy: [{ dataSourceId: "derived:com.google.weight:com.google.android.gms:merge_weight" }],
        bucketByTime: { durationMillis: 86400000 }, // Daily buckets
        startTimeMillis: startTime,
        endTimeMillis: endTime
      },
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    // Fetch activity data (last 7 days)
    const activityResponse = await axios.post(
      "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate",
      {
        aggregateBy: [{ dataSourceId: "derived:com.google.activity.segment:com.google.android.gms:merge_activity_segment" }],
        bucketByTime: { durationMillis: 86400000 },
        startTimeMillis: endTime - 7 * 24 * 60 * 60 * 1000,
        endTimeMillis: endTime
      },
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    res.json({
      weightData: weightResponse.data,
      activityData: activityResponse.data
    });
  } catch (error: any) {
    console.error("Fit Sync Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to sync data from Google Fit" });
  }
});

app.post("/api/fit/disconnect", (req, res) => {
  res.clearCookie("fit_tokens", {
    httpOnly: true,
    secure: true,
    sameSite: "none"
  });
  res.json({ success: true });
});

// Vite middleware for development
if (process.env.NODE_ENV !== "production") {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

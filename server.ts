import express from "express";
import path from "path";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = 3000;

// Raise limits to support image uploads
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));

// Initialize Google GenAI
const geminiApiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({
  apiKey: geminiApiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Mail transporter helper (Optional SMTP config fallback)
const getMailTransporter = () => {
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '465', 10);

  if (smtpUser && smtpPass) {
    return nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });
  }
  return null;
};

// API Endpoint to send patient registration link or symptom report emails
app.post("/api/send-email", async (req, res) => {
  const { to, subject, htmlContent, accessToken } = req.body;

  if (!to || !subject || !htmlContent) {
    return res.status(400).json({ error: "Missing destination 'to', 'subject', or 'htmlContent'" });
  }

  const oAuthToken = req.headers.authorization?.split(" ")[1] || accessToken;

  console.log(`[Email System] Intent to send email to ${to} with subject: "${subject}". Auth token present: ${!!oAuthToken}`);

  try {
    if (oAuthToken) {
      console.log(`[Email System] Sending actual email via authorized Gmail API...`);
      // Construct the MIME message string safely
      const mimeMessage = [
        `To: ${to}`,
        `Subject: ${subject}`,
        'Content-Type: text/html; charset="utf-8"',
        'MIME-Version: 1.0',
        '',
        htmlContent
      ].join('\r\n');

      const encodedMessage = Buffer.from(mimeMessage)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const gmailResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${oAuthToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          raw: encodedMessage
        })
      });

      if (gmailResponse.ok) {
        console.log(`[Email System] Email successfully dispatched via Gmail API to ${to}`);
        return res.json({ success: true, method: "gmail" });
      } else {
        const errText = await gmailResponse.text();
        console.error(`[Email System] Gmail API returned error:`, errText);
        throw new Error(`Gmail API returned code ${gmailResponse.status}: ${errText}`);
      }
    }

    const transporter = getMailTransporter();
    if (transporter) {
      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to,
        subject,
        html: htmlContent
      });
      console.log(`[Email System] Real email successfully sent via SMTP to ${to}`);
      return res.json({ success: true, method: "smtp" });
    } else {
      console.log(`[Email System] SMTP credentials not set. Simulated success and printed payload to stdout:`);
      console.log(`--- SIMULATED EMAIL CONTENT ---`);
      console.log(`To: ${to}`);
      console.log(`Subject: ${subject}`);
      console.log(`Content:\n${htmlContent.replace(/<[^>]*>/g, ' ')}`);
      console.log(`--------------------------------`);
      return res.json({
        success: true,
        method: "simulation",
        message: "No SMTP credentials set; simulated successfully. Detailed notification also generated inside the Doctor's Dashboard application!"
      });
    }
  } catch (error) {
    console.error("[Email System] Failed to send email:", error);
    return res.json({
      success: false,
      method: "failure",
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Chatbot endpoint: general medical chatbot
app.post("/api/gemini/chat", async (req, res) => {
  const { messages, systemInstruction } = req.body;

  if (!geminiApiKey) {
    return res.status(500).json({ error: "Gemini API key is not configured in the workspace secrets." });
  }

  try {
    // Transform text chat history format for Gemini SDK
    // Simple message structure
    const lastMessage = messages[messages.length - 1];
    
    // We can compile history into a structured prompt for the model
    let formattedPrompt = `You are a professional, compassionate medical chatbot designed to assist home treatment patients under their doctor's supervision. Always provide helpful insights while including a clear disclaimer that you are an AI assistant and they should consult their doctor for any critical symptoms.\n\n`;
    
    if (systemInstruction) {
      formattedPrompt += `System Instructions: ${systemInstruction}\n\n`;
    }

    formattedPrompt += "Conversation history:\n";
    for (const msg of messages.slice(0, -1)) {
      formattedPrompt += `${msg.sender === 'user' ? 'Patient' : 'AI Bot'}: ${msg.text}\n`;
    }
    formattedPrompt += `Patient (current message): ${lastMessage.text}\nAI Bot:`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: formattedPrompt,
    });

    return res.json({ text: response.text });
  } catch (error) {
    console.error("Gemini Chat Error:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// Multimodal image chatbot endpoint: Analyze symptom or tablet photo
app.post("/api/gemini/analyze-image", async (req, res) => {
  const { base64Image, type, prompt } = req.body;

  if (!geminiApiKey) {
    return res.status(500).json({ error: "Gemini API key is not configured." });
  }

  if (!base64Image) {
    return res.status(400).json({ error: "Base64 image is required." });
  }

  try {
    // Parse the data URI to extract actual base64 bytes
    const matches = base64Image.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-+.]+);base64,(.*)$/);
    let mimeType = "image/png";
    let data = base64Image;

    if (matches && matches.length === 3) {
      mimeType = matches[1];
      data = matches[2];
    }

    const imagePart = {
      inlineData: {
        mimeType,
        data,
      },
    };

    let analysisPrompt = "";
    if (type === "symptom") {
      analysisPrompt = prompt || 
        "The patient uploaded this photo of their symptom or treatment side effect. " +
        "Analyze the symptom shown in the photo, explain in plain English what might be causing it, list immediate self-care advice, " +
        "specifically warn if they need to contact their doctor immediately, and explicitly end the response by proposing: " +
        "'Would you like me to send a notification and email directly to Dr. [Doctor] regarding this symptom?' " +
        "Include medical guidance but stress that this is an AI screening tool, not a doctor. Be highly empathetic.";
    } else {
      analysisPrompt = prompt || 
        "The patient uploaded a photograph of a tablet or medical pill. " +
        "Please identify the tablet if standard markings or appearance are visible. " +
        "Provide details on: 1. Core medical purpose and uses. 2. Standard dosage guide. 3. Safety precautions or minor side effects. " +
        "Ask the user if they'd like help remembering to take this, or if they have symptoms.";
    }

    const textPart = {
      text: analysisPrompt,
    };

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: { parts: [imagePart, textPart] },
    });

    return res.json({ text: response.text });
  } catch (error) {
    console.error("Gemini Image Analysis Error:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// Serve frontend assets
async function startServer() {
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
    console.log(`Server successfully booted at http://localhost:${PORT}`);
  });
}

startServer();

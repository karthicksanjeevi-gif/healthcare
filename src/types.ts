export interface Tablet {
  name: string;
  dosage: string;
  timing: string; // e.g., "08:00 AM, 02:00 PM, 08:00 PM"
  notes?: string;
}

export interface AdherenceLog {
  tabletName: string;
  takenAt: string; // ISO date string
  timingSlot: string; // e.g., "08:00 AM"
  date: string; // YYYY-MM-DD
}

export interface Patient {
  id: string;
  name: string;
  email: string;
  doctorId: string;
  doctorName: string;
  doctorEmail: string;
  treatment: string;
  registeredAt: string;
  status: 'active' | 'completed';
  tablets: Tablet[];
  adherenceLogs: AdherenceLog[];
}

export interface SymptomReport {
  id: string;
  patientId: string;
  patientName: string;
  patientEmail: string;
  doctorId: string;
  doctorEmail: string;
  subject: string;
  symptoms: string;
  imageUrl?: string; // base64 or relative url
  sentAt: string;
  isRead: boolean;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: string;
  image?: string; // base64 representation of symptom/tablet
  suggestionToSend?: boolean; // if Gemini suggests sending email to doctor
}

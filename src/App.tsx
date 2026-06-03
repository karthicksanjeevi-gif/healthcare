import React, { useState, useEffect } from "react";
import { auth, googleProvider, signInWithPopup } from "./firebase";
import { onAuthStateChanged, signOut, signInWithEmailAndPassword, GoogleAuthProvider } from "firebase/auth";
import { Activity, ShieldAlert, KeyRound, User, Users, ClipboardCheck, Sparkles, LogIn } from "lucide-react";
import DoctorDashboard from "./components/DoctorDashboard";
import PatientDashboard from "./components/PatientDashboard";

export default function App() {
  const [patientIdUrl, setPatientIdUrl] = useState<string | null>(null);
  const [doctorUser, setDoctorUser] = useState<{
    uid: string;
    displayName: string | null;
    email: string | null;
  } | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  
  const [authChecking, setAuthChecking] = useState(true);
  const [simulatedPatientInput, setSimulatedPatientInput] = useState("");

  // Extract URL parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("patientId");
    if (id) {
      setPatientIdUrl(id);
    }
  }, []);

  // Monitor Firebase Auth state for physician gateway
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setDoctorUser({
          uid: user.uid,
          displayName: user.displayName || "Dr. Medical Supervisor",
          email: user.email
        });
      } else {
        setDoctorUser(null);
      }
      setAuthChecking(false);
    });

    return unsubscribe;
  }, []);

  const handleDoctorLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (credential?.accessToken) {
          setGoogleAccessToken(credential.accessToken);
        }
        setDoctorUser({
          uid: result.user.uid,
          displayName: result.user.displayName || "Dr. Supervisor",
          email: result.user.email
        });
      }
    } catch (error) {
      console.error("Google Authentication sign-in failed:", error);
      alert("Sign-In failed. As a fallback for dev environments, click the Simulated Doctor Login button below to explore the dashboard!");
    }
  };

  // Mock-login option for fast review in restricted sandboxed iframes
  const handleSimulatedDoctorLogin = () => {
    setDoctorUser({
      uid: "simulated-doctor-123",
      displayName: "Dr. Elizabeth Vance",
      email: "karthicksanjeevi0908@gmail.com"
    });
    setGoogleAccessToken(null);
    setAuthChecking(false);
  };

  const handleLogOut = async () => {
    try {
      await signOut(auth);
      setDoctorUser(null);
      setGoogleAccessToken(null);
    } catch (e) {
      setDoctorUser(null);
      setGoogleAccessToken(null);
    }
  };

  const triggerPatientSimulatedDashboard = () => {
    if (!simulatedPatientInput.trim()) {
      alert("Please enter a valid Patient ID.");
      return;
    }
    // Update both query params in browser and state dynamically
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set("patientId", simulatedPatientInput);
    window.history.pushState({}, "", newUrl);
    setPatientIdUrl(simulatedPatientInput);
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-center items-center py-20 font-sans">
        <Activity className="h-10 w-10 text-teal-400 animate-pulse mb-3" />
        <p className="text-sm text-slate-450 font-mono tracking-wider">SECURE ENTRY POINT VERIFYING...</p>
      </div>
    );
  }

  // 1. Patient Portal Route activated via ?patientId=
  if (patientIdUrl) {
    return <PatientDashboard patientId={patientIdUrl} />;
  }

  // 2. Doctor Portal Route active
  if (doctorUser) {
    return <DoctorDashboard doctorUser={doctorUser} onLogOut={handleLogOut} googleAccessToken={googleAccessToken} />;
  }

  // 3. Central Gateway Welcome Screen
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col font-sans" id="gateway-welcome-screen">
      
      {/* Visual Background Glow Decor */}
      <div className="absolute top-10 left-1/2 -translate-x-1/2 w-96 h-96 bg-teal-500/10 rounded-full blur-[100px] pointer-events-none"></div>

      <header className="max-w-6xl w-full mx-auto px-6 pt-12 md:pt-16 pb-6 text-center select-none">
        <div className="bg-teal-500/10 border border-teal-500/20 text-teal-400 px-4 py-1.5 rounded-full text-xs font-semibold tracking-wider font-mono uppercase inline-flex items-center space-x-2 mb-4">
          <Sparkles className="h-4 w-4" />
          <span>Multimodal Gemini AI Home-Care Management</span>
        </div>
        
        <h1 className="text-3xl md:text-5xl font-black tracking-tight text-white leading-tight">
          Doctor-Patient <span className="text-teal-400">Home Treatment</span> Manager
        </h1>
        <p className="text-slate-400 text-sm max-w-2xl mx-auto mt-4 leading-relaxed">
          Enabling clinical supervisors to register home care patients, set custom tablet regimens, and automatically dispatch Gmail secure access links. Features a live compliance checkbox monitor and a patient symptom multi-modal AI scanner.
        </p>
      </header>

      {/* Grid containing Doctor Lane vs. Patient Lane */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-6 grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch relative z-10">
        
        {/* Lane 1: Physician Supervisor Gate */}
        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-8 flex flex-col justify-between shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/5 rounded-full blur-xl transition group-hover:bg-teal-500/10 pointer-events-none"></div>
          
          <div>
            <div className="p-3.5 bg-teal-500/10 text-teal-400 border border-teal-500/25 rounded-2xl w-fit mb-6">
              <Users className="h-6 w-6" />
            </div>

            <h3 className="text-lg font-bold text-white tracking-wide">Physician Supervising Portal</h3>
            <p className="text-slate-400 text-xs mt-2 leading-relaxed">
              Register medical plan durations, schedule table doses, track logs, review side-effect, and read uploaded patients symptom photo emails.
            </p>

            <ul className="mt-6 space-y-2.5 text-xs text-slate-350 text-slate-300">
              <li className="flex items-center space-x-2">
                <ClipboardCheck className="h-4 w-4 text-teal-400 shrink-0" />
                <span>Assign tablet timing protocols (08:00 AM, etc.)</span>
              </li>
              <li className="flex items-center space-x-2">
                <ClipboardCheck className="h-4 w-4 text-teal-400 shrink-0" />
                <span>Automatic access link dispatching directly via GMail</span>
              </li>
              <li className="flex items-center space-x-2">
                <ClipboardCheck className="h-4 w-4 text-teal-400 shrink-0" />
                <span>Review symptom notifications containing webcam photos</span>
              </li>
            </ul>
          </div>

          <div className="mt-8 space-y-3">
            <button
              onClick={handleDoctorLogin}
              className="w-full bg-teal-600 hover:bg-teal-500 text-slate-950 font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center space-x-2 transition cursor-pointer shadow-lg shadow-teal-500/10 uppercase tracking-wider font-mono text-slate-900"
              id="google-doctor-login"
            >
              <LogIn className="h-4 w-4" />
              <span>Login via Physician Google Account</span>
            </button>

            <div className="text-center">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Or test in sandbox preview:</span>
              <button
                onClick={handleSimulatedDoctorLogin}
                className="w-full mt-1.5 border border-slate-800 hover:border-slate-700 bg-slate-950/40 text-slate-350 hover:text-white py-2.5 px-4 rounded-xl text-xs transition"
                id="simulated-doctor-login"
              >
                Simulate Doctor Workspace Dashboard
              </button>
            </div>
          </div>
        </section>

        {/* Lane 2: Patient Portal Gate */}
        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-8 flex flex-col justify-between shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50/5 rounded-full blur-xl pointer-events-none"></div>

          <div>
            <div className="p-3.5 bg-slate-800 text-slate-300 border border-slate-750 border-slate-700 rounded-2xl w-fit mb-6">
              <User className="h-6 w-6" />
            </div>

            <h3 className="text-lg font-bold text-white tracking-wide">Patient Treatment Workspace</h3>
            <p className="text-slate-400 text-xs mt-2 leading-relaxed">
              Access your personal care space to check daily timing notifications, track doses, and scan symptoms/tablets.
            </p>

            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 mt-6">
              <p className="text-[10px] font-bold text-teal-400 uppercase font-mono mb-1 tracking-wider">How to connect:</p>
              <p className="text-xs text-slate-400 leading-relaxed">
                When registered by your supervising clinician, a unique secure path will arrive in your Gmail. Open that link to trigger your dashboard.
              </p>
            </div>
          </div>

          <div className="mt-8 pt-4 border-t border-slate-800">
            <p className="text-[10px] text-slate-500 font-bold uppercase font-mono tracking-widest text-center mb-2">Simulate Patient portal access:</p>
            <div className="flex space-x-2">
              <input
                type="text"
                value={simulatedPatientInput}
                onChange={(e) => setSimulatedPatientInput(e.target.value)}
                placeholder="Paste the registered Patient ID... "
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs flex-1 text-teal-400 outline-none focus:border-teal-500 font-mono"
              />
              <button
                onClick={triggerPatientSimulatedDashboard}
                className="bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition"
                id="patient-simulator-btn"
              >
                Go
              </button>
            </div>
            <p className="text-[9px] text-slate-500 text-center mt-2 font-mono">Tip: Generate a patient first in the Doctor dashboard, copy their ID, and paste it here.</p>
          </div>
        </section>
      </main>

      <footer className="py-6 text-center text-slate-600 text-xs border-t border-slate-900 shrink-0">
        <p>© 2026 Doctor Patient Home Care Hub. Real-time clinical notifications and multimodal decision support.</p>
      </footer>
    </div>
  );
}

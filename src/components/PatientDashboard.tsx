import React, { useState, useEffect } from "react";
import { db } from "../firebase";
import { doc, updateDoc, onSnapshot } from "firebase/firestore";
import { 
  Activity, 
  Clock, 
  FileText, 
  CheckSquare, 
  Square, 
  Award, 
  Calendar, 
  ChevronRight, 
  Bell, 
  Check, Pill
} from "lucide-react";
import { Patient, Tablet, AdherenceLog } from "../types";
import MedicalChatbot from "./MedicalChatbot";

export interface PatientDashboardProps {
  patientId: string;
}

export default function PatientDashboard({ patientId }: PatientDashboardProps) {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTimeStr, setCurrentTimeStr] = useState("");
  const [activeReminders, setActiveReminders] = useState<string[]>([]);
  const [simulatedTime, setSimulatedTime] = useState("");

  // Subscribe to patient record in Firestore
  useEffect(() => {
    if (!patientId) return;

    const docRef = doc(db, "patients", patientId);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setPatient({ id: docSnap.id, ...docSnap.data() } as Patient);
      } else {
        console.error("Patient document not found!");
      }
      setLoading(false);
    }, (error) => {
      console.error("Error subscribing to patient updates:", error);
      setLoading(false);
    });

    return unsubscribe;
  }, [patientId]);

  // Clock updating & notification trigger checks
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const optionsStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
      setCurrentTimeStr(optionsStr);
      
      // Perform automated reminder triggers when time matches tablet prescriptions
      if (patient) {
        checkAndTriggerReminders(optionsStr, now.toISOString().split('T')[0]);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [patient]);

  const checkAndTriggerReminders = (timeString: string, todayStr: string) => {
    if (!patient) return;

    const triggeredList: string[] = [];

    patient.tablets.forEach(tablet => {
      const times = tablet.timing.split(",").map(s => s.trim().toUpperCase());
      const currentFormatted = timeString.toUpperCase();

      // Check if time matches (e.g. "08:00 AM") and hasn't been logged today yet
      if (times.includes(currentFormatted)) {
        const alreadyLogged = patient.adherenceLogs?.some(log => 
          log.tabletName === tablet.name && 
          log.timingSlot.toUpperCase() === currentFormatted &&
          log.date === todayStr
        );

        if (!alreadyLogged) {
          triggeredList.push(`${tablet.name} (${tablet.dosage}) due at ${timeString}`);
        }
      }
    });

    if (triggeredList.length > 0) {
      setActiveReminders(triggeredList);
    }
  };

  // Trigger simulated reminder for immediate UX feedback
  const triggerSimulationCheck = () => {
    if (!patient || !simulatedTime) return;
    checkAndTriggerReminders(simulatedTime, new Date().toISOString().split('T')[0]);
    // Also display alert directly
    alert(`Reminder simulation active for: ${simulatedTime}`);
  };

  // Log medication adherence to Firestore
  const handleMarkAsTaken = async (tabletName: string, timingSlot: string) => {
    if (!patient) return;

    const todayStr = new Date().toISOString().split('T')[0];

    // Build the new log object
    const newLog: AdherenceLog = {
      tabletName,
      timingSlot,
      takenAt: new Date().toISOString(),
      date: todayStr
    };

    // Construct updated adherence logs array
    const previousLogs = patient.adherenceLogs || [];
    
    // Check if copy already checked
    const alreadyLogged = previousLogs.some(log => 
      log.tabletName === tabletName && 
      log.timingSlot === timingSlot && 
      log.date === todayStr
    );

    let updatedLogs: AdherenceLog[] = [];
    if (alreadyLogged) {
      // Invert check - remove
      updatedLogs = previousLogs.filter(log => 
        !(log.tabletName === tabletName && log.timingSlot === timingSlot && log.date === todayStr)
      );
    } else {
      updatedLogs = [...previousLogs, newLog];
    }

    try {
      const docRef = doc(db, "patients", patient.id);
      await updateDoc(docRef, { adherenceLogs: updatedLogs });
    } catch (error) {
      alert("Error saving medical log to database: " + String(error));
    }
  };

  // Calculate stats
  const getProgressToday = () => {
    if (!patient) return { total: 0, taken: 0, percentage: 0 };
    
    const todayStr = new Date().toISOString().split('T')[0];
    
    // Total scheduled doses across all tablets
    let totalDosesCount = 0;
    patient.tablets.forEach(t => {
      const timings = t.timing.split(",");
      totalDosesCount += timings.length;
    });

    const takenToday = (patient.adherenceLogs || []).filter(log => log.date === todayStr).length;
    const pct = totalDosesCount > 0 ? Math.floor((takenToday / totalDosesCount) * 100) : 0;

    return {
      total: totalDosesCount,
      taken: takenToday,
      percentage: pct
    };
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const progressStats = getProgressToday();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-teal-500"></div>
        <p className="text-slate-500 mt-4 text-sm font-semibold">Loading your medical care space...</p>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center py-20 px-6 text-center">
        <Pill className="h-16 w-16 text-slate-300 mb-4" />
        <h2 className="text-xl font-bold text-slate-800">Invalid Care Space Link</h2>
        <p className="text-slate-500 text-sm mt-1 max-w-sm">The patient link provided does not exist or has been disabled by your supervising doctor. Please contact your physician for support.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col" id="patient-dashboard-container">
      {/* Alert remind header */}
      {activeReminders.length > 0 && (
        <div className="bg-amber-500 text-slate-950 p-3.5 flex justify-between items-center px-6 md:px-12 font-bold text-xs md:text-sm animate-pulse shadow-md relative z-10">
          <div className="flex items-center space-x-2">
            <Bell className="h-5 w-5 animate-bounce inline-block" />
            <span>Reminder: Time to take your prescribed medicine!</span>
            <div className="hidden md:inline-block ml-3 text-slate-900 border-l border-slate-900/20 pl-3">
              {activeReminders.join(", ")}
            </div>
          </div>
          <button 
            onClick={() => setActiveReminders([])}
            className="bg-slate-950/20 hover:bg-slate-950/30 px-3.5 py-1 rounded text-xs text-slate-950 hover:text-white transition"
          >
            Acknowledge Reminder
          </button>
        </div>
      )}

      {/* Patient Header Section */}
      <header className="bg-slate-900 text-white py-6 px-6 md:px-12 flex flex-col md:flex-row justify-between items-start md:items-center border-b border-teal-950 shadow">
        <div className="flex items-center space-x-3 mb-4 md:mb-0">
          <div className="bg-teal-500 h-10 w-10 rounded-xl flex items-center justify-center text-slate-900 shadow">
            <Activity className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">My CareSpace Workspace</h1>
            <p className="text-teal-400 text-xs font-semibold">Supervised by Dr. {patient.doctorName}</p>
          </div>
        </div>

        <div className="flex items-center space-x-4 bg-slate-800/80 px-4 py-2 rounded-xl border border-slate-700">
          <Clock className="h-4 w-4 text-teal-400" />
          <div>
            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tight">Patient Local Time</p>
            <p className="font-mono text-sm font-semibold">{currentTimeStr || "Checking..."}</p>
          </div>
        </div>
      </header>

      {/* Content Space layout */}
      <div className="flex-1 max-w-6xl w-full mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-6 relative pb-24">
        
        {/* Adherence and Daily schedule Card */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Welcome Info Card */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
              <span>Welcome Back,</span>
              <span className="text-teal-600">{patient.name}</span>
            </h2>
            <p className="text-slate-500 text-xs mt-1">Check off tablets daily to let Dr. {patient.doctorName} know you are following the protocol in real time.</p>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100 pt-5">
              <div className="bg-slate-50 p-4 rounded-xl">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-slate-500 font-semibold uppercase">Daily Adherence Rate</span>
                  <span className="text-xs font-bold text-teal-700">{progressStats.percentage}%</span>
                </div>
                <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mb-2">
                  <div className="bg-teal-500 h-2 rounded-full transition-all" style={{ width: `${progressStats.percentage}%` }}></div>
                </div>
                <p className="text-[10px] text-slate-400">
                  Taken {progressStats.taken} of {progressStats.total} doses scheduled today.
                </p>
              </div>

              {/* Timing Simulator */}
              <div className="bg-slate-50 p-4 rounded-xl border border-dashed border-slate-200">
                <span className="text-xs text-slate-500 font-semibold uppercase block mb-1">Simulate Treatment Timeline Reminder</span>
                <p className="text-[10px] text-slate-400 mb-2">Simulate matching the clock to see notification triggers instantly.</p>
                <div className="flex space-x-2">
                  <select 
                    value={simulatedTime}
                    onChange={(e) => setSimulatedTime(e.target.value)}
                    className="bg-white border rounded text-xs p-1 flex-1 outline-none font-mono"
                  >
                    <option value="">Select Time to Simulate...</option>
                    <option value="08:00 AM">08:00 AM</option>
                    <option value="01:00 PM">01:00 PM</option>
                    <option value="02:00 PM">02:00 PM</option>
                    <option value="08:00 PM">08:00 PM</option>
                  </select>
                  <button
                    onClick={triggerSimulationCheck}
                    className="bg-slate-800 text-white hover:bg-slate-900 border text-[10px] transition font-bold px-3 py-1 rounded"
                  >
                    Simulate Notify Trigger
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Today's Tablet Timeline checklist */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2 mb-4 uppercase tracking-wide">
              <Calendar className="h-4 w-4 text-teal-600" />
              <span>Today's prescribed medicine schedule checklist</span>
            </h3>

            <div className="space-y-3">
              {patient.tablets.flatMap(tablet => {
                const timings = tablet.timing.split(",").map(t => t.trim());
                return timings.map((time, idx) => {
                  const checkKey = `${tablet.name}-${time}`;
                  const isTaken = (patient.adherenceLogs || []).some(log => 
                    log.tabletName === tablet.name && 
                    log.timingSlot === time && 
                    log.date === todayStr
                  );

                  return (
                    <div 
                      key={checkKey} 
                      onClick={() => handleMarkAsTaken(tablet.name, time)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer flex justify-between items-center ${
                        isTaken 
                          ? "bg-teal-50/50 border-teal-200 shadow-sm" 
                          : "bg-white border-slate-150 hover:bg-slate-50 border-slate-200"
                      }`}
                    >
                      <div className="flex items-center space-x-4">
                        <div className="shrink-0 text-slate-400">
                          {isTaken ? (
                            <div className="bg-teal-500 rounded-lg p-1.5 text-white">
                              <Check className="h-5 w-5" />
                            </div>
                          ) : (
                            <div className="border-2 border-slate-300 rounded-lg h-8 w-8 flex items-center justify-center hover:border-teal-500 transition">
                              <span className="text-[10px] text-slate-400 font-mono">Dose</span>
                            </div>
                          )}
                        </div>
                        <div>
                          <p className={`font-bold text-sm ${isTaken ? "line-through text-slate-500" : "text-slate-800"}`}>
                            {tablet.name}
                          </p>
                          <p className="text-xs text-slate-500 flex items-center mt-0.5">
                            <Clock className="h-3 w-3 mr-1" />
                            <span className="font-semibold">{time}</span>
                            <span className="mx-2">•</span>
                            <span>{tablet.dosage}</span>
                          </p>
                          {tablet.notes && (
                            <p className="text-[11px] text-slate-400 italic mt-0.5">
                              Advice: {tablet.notes}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        <span className={`text-[10px] font-bold px-3 py-1.5 rounded-full uppercase ${
                          isTaken ? "bg-teal-100 text-teal-800" : "bg-slate-100 text-slate-550 text-slate-600"
                        }`}>
                          {isTaken ? "Taken" : "Mark Taken"}
                        </span>
                      </div>
                    </div>
                  );
                });
              })}
            </div>
          </div>
        </div>

        {/* Home Treatment Rules Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-teal-900 text-white rounded-3xl p-6 shadow-lg border border-teal-800">
            <h3 className="font-bold flex items-center space-x-2 text-md mb-3">
              <FileText className="h-5 w-5 text-teal-300" />
              <span>Guidelines from Dr. {patient.doctorName}</span>
            </h3>
            
            <p className="text-slate-300 text-xs uppercase font-mono tracking-wider">Assigned Therapy Plan</p>
            <div className="mt-2 text-sm leading-relaxed text-slate-100 whitespace-pre-line border-t border-teal-800 pt-3">
              {patient.treatment}
            </div>

            <div className="mt-5 pt-4 border-t border-teal-800 text-xs text-teal-200">
              <p className="font-semibold text-white mb-1">Supervisor doctor contacts:</p>
              <p>Email: {patient.doctorEmail || "Registered Supervisor"}</p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
            <h4 className="font-bold text-slate-800 text-xs uppercase font-mono tracking-wide mb-3">Therapy adherence history</h4>
            {(!patient.adherenceLogs || patient.adherenceLogs.length === 0) ? (
              <p className="text-xs text-slate-400">History will populate as you take your tablet doses.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {patient.adherenceLogs.map((log, index) => (
                  <div key={index} className="flex justify-between items-center text-[11px] bg-slate-50 p-2 rounded">
                    <div>
                      <span className="font-semibold text-slate-800">{log.tabletName}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {log.date} @ {log.timingSlot}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Embedded Multimodal Gemini AI Medical Assistant Chatbot */}
      <MedicalChatbot patient={patient} />
    </div>
  );
}

import React, { useState, useEffect } from "react";
import { 
  db, 
  auth 
} from "../firebase";
import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  doc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot
} from "firebase/firestore";
import { 
  Plus, 
  Trash2, 
  Mail, 
  Users, 
  FileText, 
  Bell, 
  CheckCircle, 
  X, 
  UserPlus, 
  Clock, 
  Activity, 
  ArrowRight,
  Clipboard,
  Check
} from "lucide-react";
import { Patient, Tablet, SymptomReport } from "../types";

export interface DoctorDashboardProps {
  doctorUser: {
    uid: string;
    displayName: string | null;
    email: string | null;
  };
  onLogOut: () => void;
  googleAccessToken?: string | null;
}

export default function DoctorDashboard({ doctorUser, onLogOut, googleAccessToken }: DoctorDashboardProps) {
  const [activeTab, setActiveTab] = useState<"patients" | "register" | "inbox">("patients");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [reports, setReports] = useState<SymptomReport[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State for Patient Registration
  const [patientName, setPatientName] = useState("");
  const [patientEmail, setPatientEmail] = useState("");
  const [treatmentPlan, setTreatmentPlan] = useState("");
  
  // Dynamic Tablet adding
  const [tablets, setTablets] = useState<Tablet[]>([
    { name: "", dosage: "", timing: "08:00 AM, 08:00 PM", notes: "" }
  ]);

  // Modal State for registration success link
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [generatedLink, setGeneratedLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Firestore Subscriptions for Live Doctor App Tracking
  useEffect(() => {
    if (!doctorUser?.uid) return;

    // Listen to Patients
    const patientsQuery = query(
      collection(db, "patients"),
      where("doctorId", "==", doctorUser.uid)
    );
    const unsubscribePatients = onSnapshot(patientsQuery, (snapshot) => {
      const list: Patient[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Patient);
      });
      setPatients(list);
      setLoading(false);
    }, (error) => {
      console.error("Error subscribing to patients: ", error);
    });

    // Listen to Symptom Reports
    const reportsQuery = query(
      collection(db, "symptomReports"),
      where("doctorId", "==", doctorUser.uid)
    );
    const unsubscribeReports = onSnapshot(reportsQuery, (snapshot) => {
      const list: SymptomReport[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as SymptomReport);
      });
      // Sort reports by date descending
      list.sort((a,b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
      setReports(list);
    }, (error) => {
      console.error("Error subscribing to reports: ", error);
    });

    return () => {
      unsubscribePatients();
      unsubscribeReports();
    };
  }, [doctorUser?.uid]);

  // Form handlers
  const handleAddTabletRow = () => {
    setTablets([...tablets, { name: "", dosage: "", timing: "08:00 AM", notes: "" }]);
  };

  const handleRemoveTabletRow = (index: number) => {
    if (tablets.length === 1) return;
    setTablets(tablets.filter((_, i) => i !== index));
  };

  const handleTabletChange = (index: number, field: keyof Tablet, value: string) => {
    const updated = tablets.map((tab, i) => {
      if (i === index) {
        return { ...tab, [field]: value };
      }
      return tab;
    });
    setTablets(updated);
  };

  const handleRegisterPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientName || !patientEmail || !treatmentPlan) {
      alert("Please fill out all required fields.");
      return;
    }

    // Filter list of empty tablets
    const validTablets = tablets.filter(t => t.name.trim() !== "");
    if (validTablets.length === 0) {
      alert("Please enter at least one scheduled tablet for patient.");
      return;
    }

    setSubmitting(true);
    try {
      // 1. Generate patient ID document ref first to compute the secure link
      const patientCollectionRef = collection(db, "patients");
      
      const newPatientData = {
        name: patientName,
        email: patientEmail,
        doctorId: doctorUser.uid,
        doctorName: doctorUser.displayName || "Dr. Supervisor",
        doctorEmail: doctorUser.email || "",
        treatment: treatmentPlan,
        registeredAt: new Date().toISOString(),
        status: "active",
        tablets: validTablets,
        adherenceLogs: []
      };

      const docRef = await addDoc(patientCollectionRef, newPatientData);
      
      // Update with generated ID self-referenced
      await updateDoc(doc(db, "patients", docRef.id), { id: docRef.id });

      // Generate the patient's link automatically
      const autoLink = `${window.location.origin}/?patientId=${docRef.id}`;
      setGeneratedLink(autoLink);

      // 2. Automatically dispatch registration email to patient via Backend Express API
      const mailHtml = `
        <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #0f766e; margin-bottom: 5px;">Home Care Treatment Space</h2>
          <p style="font-size: 14px; color: #666; margin-top: 0;">Registered by ${doctorUser.displayName || 'your doctor'}</p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 15px 0;">
          <p>Hello <strong>${patientName}</strong>,</p>
          <p>You have been enrolled in our home treatment protocol. Dr. ${doctorUser.displayName || 'Supervisor'} has set up your scheduled tablets and treatment details directly on our medical platform.</p>
          
          <div style="background-color: #f0fdfa; border-left: 4px solid #0f766e; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <p style="margin-top: 0; font-weight: bold; color: #0f766e;">Your Patient Dashboard Link:</p>
            <p style="word-break: break-all; margin-bottom: 0;">
              <a href="${autoLink}" style="color: #0d9488; font-weight: bold; text-decoration: underline;">Click Here to Access Your Care Space</a>
            </p>
          </div>
          
          <p style="font-size: 13px; color: #888;">Through this link, you can check your schedule daily, mark medicines as taken, and interact with the Gemini Medical AI Chatbot if you notice any symptoms, tablet queries, or side-effects.</p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 15px 0;">
          <p style="font-size: 12px; color: #aaa; text-align: center;">This is an automated delivery from Doctor Patient Home Treatment Manager.</p>
        </div>
      `;

      await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: patientEmail,
          subject: "Your Home Treatment Care Space Access Link",
          htmlContent: mailHtml,
          accessToken: googleAccessToken
        })
      });

      // Clear Form Fields
      setPatientName("");
      setPatientEmail("");
      setTreatmentPlan("");
      setTablets([{ name: "", dosage: "", timing: "08:00 AM, 08:00 PM", notes: "" }]);

      setSubmitting(false);
      setShowLinkModal(true);
    } catch (e) {
      console.error("Failed to register patient: ", e);
      alert("Error registering patient: " + (e instanceof Error ? e.message : String(e)));
      setSubmitting(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDeletePatient = async (id: string) => {
    if (confirm("Are you sure you want to remove this patient from home care?")) {
      try {
        await deleteDoc(doc(db, "patients", id));
      } catch (e) {
        alert("Failed to delete client: " + String(e));
      }
    }
  };

  const handleMarkReportRead = async (id: string, isRead: boolean) => {
    try {
      await updateDoc(doc(db, "symptomReports", id), { isRead: !isRead });
    } catch (e) {
      console.error("Error setting report state:", e);
    }
  };

  // Expanded View State
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const selectedPatient = patients.find(p => p.id === selectedPatientId);

  // Group Adherence status
  const getAdherenceRate = (patient: Patient) => {
    if (!patient.adherenceLogs || patient.adherenceLogs.length === 0) return 0;
    // Simple mock calculation: check logs in the current month or total count
    return Math.min(100, Math.floor((patient.adherenceLogs.length / (patient.tablets.length * 3)) * 100)); 
  };

  const unreadReportCount = reports.filter(r => !r.isRead).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans" id="doctor-dashboard-container">
      {/* Upper Navigation Rail */}
      <header className="bg-slate-900 text-white min-h-[70px] flex justify-between items-center px-6 md:px-12 shadow-md shrink-0">
        <div className="flex items-center space-x-3">
          <div className="bg-teal-500 text-slate-900 rounded-lg p-2 flex items-center justify-center">
            <Activity className="h-6 w-6 text-slate-900" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">HomeCare Supervisor</h1>
            <p className="text-teal-400 text-xs font-mono ml-0.5">DOCTOR INBOX & MONITORING PORTAL</p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold">{doctorUser.displayName || 'Supervisor'}</p>
            <p className="text-xs text-slate-400">{doctorUser.email}</p>
          </div>
          <button 
            onClick={onLogOut}
            className="text-white hover:text-teal-200 border border-slate-600 hover:border-teal-410 px-4 py-1.5 rounded-lg text-sm transition-all"
            id="doctor-logout-btn"
          >
            Log Out
          </button>
        </div>
      </header>

      {/* Main Grid View */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto p-4 md:p-8 flex-col md:flex-row gap-6">
        {/* Left Hand Navigation Card */}
        <aside className="w-full md:w-64 bg-white rounded-2xl border border-slate-200 p-4 shrink-0 shadow-sm flex flex-col justify-between self-start">
          <div className="space-y-1">
            <p className="text-slate-400 font-mono text-[10px] tracking-wider uppercase px-2 mb-2">Navigation</p>
            <button
              onClick={() => { setActiveTab("patients"); setSelectedPatientId(null); }}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                activeTab === "patients" ? "bg-teal-50 text-teal-800" : "text-slate-600 hover:bg-slate-50"
              }`}
              id="tab-patients-btn"
            >
              <Users className="h-4 w-4" />
              <span>Patients</span>
              {patients.length > 0 && (
                <span className="ml-auto bg-slate-200 text-slate-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {patients.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("register")}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                activeTab === "register" ? "bg-teal-50 text-teal-800" : "text-slate-600 hover:bg-slate-50"
              }`}
              id="tab-register-btn"
            >
              <UserPlus className="h-4 w-4" />
              <span>Register Patient</span>
            </button>

            <button
              onClick={() => setActiveTab("inbox")}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                activeTab === "inbox" ? "bg-teal-50 text-teal-800" : "text-slate-600 hover:bg-slate-50"
               }`}
              id="tab-inbox-btn"
            >
              <Bell className="h-4 w-4" />
              <span>Symptom Mail Alerts</span>
              {unreadReportCount > 0 && (
                <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse">
                  {unreadReportCount}
                </span>
              )}
            </button>
          </div>

          <div className="mt-8 border-t border-slate-100 pt-4 px-2">
            <p className="text-[11px] text-slate-400">Current Time Dashboard</p>
            <p className="text-xs font-mono font-bold text-slate-600 mt-1">
              {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
            </p>
          </div>
        </aside>

        {/* Action Window Panel */}
        <main className="flex-1 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm overflow-hidden flex flex-col">
          {loading ? (
            <div className="flex-1 flex flex-col justify-center items-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-teal-500"></div>
              <p className="text-slate-500 mt-3 text-sm">Synchronizing Clinical Care data...</p>
            </div>
          ) : (
            <>
              {/* Tab: Patients Directory */}
              {activeTab === "patients" && (
                <div className="flex-1 flex flex-col">
                  {selectedPatientId === null ? (
                    <>
                      <div className="flex justify-between items-center mb-6">
                        <div>
                          <h2 className="text-xl font-bold tracking-tight text-slate-900">Registered Home Patients</h2>
                          <p className="text-slate-500 text-xs">View adherence schedules, tablets, and medical checkmarks</p>
                        </div>
                      </div>

                      {patients.length === 0 ? (
                        <div className="text-center py-16 border-2 border-dashed border-slate-100 rounded-2xl flex flex-col items-center">
                          <Users className="h-12 w-12 text-slate-300 mb-3" />
                          <p className="text-sm font-semibold text-slate-600">No Patients Registered Yet</p>
                          <p className="text-xs text-slate-400 mt-1 max-w-sm mb-4">You can register patients on home care, set up tablet schedules, and they will automatically receive custom links to connect.</p>
                          <button
                            onClick={() => setActiveTab("register")}
                            className="bg-teal-650 hover:bg-teal-700 bg-teal-600 text-white rounded-lg px-4 py-2 text-sm font-semibold transition"
                            id="zero-state-register-btn"
                          >
                            Register First Patient
                          </button>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse" id="patients-table">
                            <thead>
                              <tr className="border-b border-slate-100 text-slate-400 text-xs tracking-wider uppercase font-mono">
                                <th className="pb-3 pt-1 pl-4">Patient Name</th>
                                <th className="pb-3 pt-1">Gmail Address</th>
                                <th className="pb-3 pt-1">Medicine Prescribed</th>
                                <th className="pb-3 pt-1">Took Adherence</th>
                                <th className="pb-3 pt-1 text-right pr-4">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {patients.map((patient) => {
                                const rate = getAdherenceRate(patient);
                                return (
                                  <tr key={patient.id} className="border-b border-slate-100 hover:bg-slate-50/55 transition cursor-pointer">
                                    <td onClick={() => setSelectedPatientId(patient.id)} className="py-4 font-semibold text-slate-900 pl-4">
                                      {patient.name}
                                    </td>
                                    <td onClick={() => setSelectedPatientId(patient.id)} className="py-4 text-xs text-slate-500">
                                      {patient.email}
                                    </td>
                                    <td onClick={() => setSelectedPatientId(patient.id)} className="py-4 text-xs">
                                      <span className="bg-teal-50 text-teal-800 px-2.5 py-1 rounded-full font-medium">
                                        {patient.tablets.length} Scheduled
                                      </span>
                                    </td>
                                    <td onClick={() => setSelectedPatientId(patient.id)} className="py-4">
                                      <div className="flex items-center space-x-2">
                                        <div className="w-24 bg-slate-100 rounded-full h-2 overflow-hidden">
                                          <div 
                                            className="bg-teal-500 h-2 rounded-full" 
                                            style={{ width: `${rate}%` }}
                                          ></div>
                                        </div>
                                        <span className="text-xs font-bold text-slate-600">{rate}%</span>
                                      </div>
                                    </td>
                                    <td className="py-4 text-right pr-4">
                                      <div className="flex items-center justify-end space-x-2">
                                        <button 
                                          title="View Details"
                                          onClick={() => setSelectedPatientId(patient.id)}
                                          className="text-teal-600 hover:bg-teal-50 p-1.5 rounded-lg transition"
                                        >
                                          <ArrowRight className="h-4 w-4" />
                                        </button>
                                        <button 
                                          title="Remove Patient"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeletePatient(patient.id);
                                          }}
                                          className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  ) : (
                    /* Patient Individual Details View */
                    <div className="flex-1 flex flex-col">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
                        <button
                          onClick={() => setSelectedPatientId(null)}
                          className="text-slate-500 hover:text-slate-800 text-sm font-semibold flex items-center space-x-1"
                        >
                          <span>← Back to Directory</span>
                        </button>
                        <span className="bg-teal-50 text-teal-800 text-xs font-semibold px-3 py-1 rounded-full">
                          Enrolled Patient Details
                        </span>
                      </div>

                      {selectedPatient && (
                        <div className="space-y-6">
                          {/* Top Profile Summary */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-50 p-5 rounded-2xl">
                            <div>
                              <p className="text-slate-400 text-[10px] font-mono uppercase">Full Name</p>
                              <p className="font-bold text-slate-800 text-lg mt-0.5">{selectedPatient.name}</p>
                              <p className="text-xs text-slate-500">{selectedPatient.email}</p>
                            </div>
                            <div>
                              <p className="text-slate-400 text-[10px] font-mono uppercase">Registered Date</p>
                              <p className="font-bold text-slate-800 text-sm mt-1">
                                {new Date(selectedPatient.registeredAt).toLocaleDateString()}
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-400 text-[10px] font-mono uppercase">Treating Status</p>
                              <p className="text-xs mt-1">
                                <span className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full font-bold">
                                  {selectedPatient.status.toUpperCase()}
                                </span>
                              </p>
                            </div>
                          </div>

                          {/* Plan Details */}
                          <div>
                            <h3 className="font-bold text-slate-800 flex items-center space-x-2 text-md">
                              <FileText className="h-4 w-4 text-teal-600" />
                              <span>Prescribed Home Treatment Protocol</span>
                            </h3>
                            <div className="mt-2 text-slate-600 text-sm bg-white border border-slate-200 p-4 rounded-xl leading-relaxed whitespace-pre-line">
                              {selectedPatient.treatment}
                            </div>
                          </div>

                          {/* Tablet Details */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                              <h3 className="font-bold text-slate-800 flex items-center space-x-2 text-sm mb-3">
                                <Clock className="h-4 w-4 text-teal-600" />
                                <span>tablet prescriptions & times</span>
                              </h3>
                              <div className="space-y-2">
                                {selectedPatient.tablets.map((tablet, i) => (
                                  <div key={i} className="border border-slate-100 bg-slate-50/50 p-3 rounded-xl flex justify-between items-start">
                                    <div>
                                      <p className="font-bold text-slate-800 text-xs">{tablet.name}</p>
                                      <p className="text-[11px] text-slate-500 mt-0.5 font-mono">Dosage: {tablet.dosage}</p>
                                      {tablet.notes && <p className="text-[11px] text-slate-400 italic mt-0.3">Note: {tablet.notes}</p>}
                                    </div>
                                    <span className="bg-teal-50 text-teal-800 font-bold font-mono text-[9px] px-2 py-0.5 rounded-md">
                                      {tablet.timing}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Adherence Logs */}
                            <div>
                              <h3 className="font-bold text-slate-800 flex items-center space-x-2 text-sm mb-3">
                                <CheckCircle className="h-4 w-4 text-teal-600" />
                                <span>Recent Taking Adherence Logs</span>
                              </h3>
                              <div className="bg-white border border-slate-200 rounded-xl max-h-[220px] overflow-y-auto p-3 space-y-2">
                                {!selectedPatient.adherenceLogs || selectedPatient.adherenceLogs.length === 0 ? (
                                  <p className="text-xs text-slate-400 text-center py-8">Patient has not checked off any table taking schedules yet.</p>
                                ) : (
                                  selectedPatient.adherenceLogs.map((log, i) => (
                                    <div key={i} className="bg-teal-50/50 p-2.5 rounded-lg flex justify-between items-center text-xs">
                                      <div>
                                        <p className="font-bold text-teal-900">{log.tabletName}</p>
                                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">Taken on: {log.date} @ {log.timingSlot}</p>
                                      </div>
                                      <span className="text-[10px] bg-teal-100 text-teal-800 px-2 py-0.5 rounded font-bold flex items-center font-mono space-x-0.5">
                                        <Check className="h-3 w-3" />
                                        <span>OK</span>
                                      </span>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Patient Registration */}
              {activeTab === "register" && (
                <div className="flex-1 flex flex-col">
                  <div className="mb-6">
                    <h2 className="text-xl font-bold text-slate-900">Configure Home Patient Care</h2>
                    <p className="text-slate-500 text-xs">Register patient gmail, specify treatments, set tablets timelines & generate access links</p>
                  </div>

                  <form onSubmit={handleRegisterPatient} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Patient Full Name *</label>
                        <input
                          type="text"
                          required
                          value={patientName}
                          onChange={(e) => setPatientName(e.target.value)}
                          placeholder="e.g. Johnathan Miller"
                          className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:ring-2 focus:ring-teal-200 outline-none rounded-lg px-3.5 py-2 text-sm transition"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Patient GMail Address *</label>
                        <input
                          type="email"
                          required
                          value={patientEmail}
                          onChange={(e) => setPatientEmail(e.target.value)}
                          placeholder="e.g. jmiller@gmail.com"
                          className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:ring-2 focus:ring-teal-200 outline-none rounded-lg px-3.5 py-2 text-sm transition"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Treatment Description & Instructions *</label>
                      <textarea
                        required
                        value={treatmentPlan}
                        onChange={(e) => setTreatmentPlan(e.target.value)}
                        placeholder="State the primary medical condition and home therapy instructions (e.g. drink plenty of water, physical rest, report symptoms immediately)."
                        className="w-full h-24 bg-slate-50 focus:bg-white border border-slate-200 focus:ring-2 focus:ring-teal-200 outline-none rounded-lg p-3 text-sm transition resize-none"
                      ></textarea>
                    </div>

                    {/* Prescribed Tablets */}
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="block text-xs font-bold text-slate-600 uppercase">Prescribe Scheduled Tablets & Timings</label>
                        <button
                          type="button"
                          onClick={handleAddTabletRow}
                          className="text-xs text-teal-600 font-bold flex items-center space-x-1"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Add Tablet row</span>
                        </button>
                      </div>

                      <div className="space-y-3">
                        {tablets.map((tablet, index) => (
                          <div key={index} className="flex flex-col md:flex-row gap-3 bg-slate-50 p-4 rounded-xl relative border border-slate-100">
                            <div className="flex-1">
                              <label className="block text-[10px] text-slate-400 font-semibold mb-0.5">Tablet Name</label>
                              <input
                                type="text"
                                value={tablet.name}
                                onChange={(e) => handleTabletChange(index, "name", e.target.value)}
                                placeholder="e.g. Paracetamol"
                                className="w-full bg-white border border-slate-200 outline-none rounded p-1.5 text-xs focus:ring-1 focus:ring-teal-500"
                              />
                            </div>
                            <div className="w-full md:w-32">
                              <label className="block text-[10px] text-slate-400 font-semibold mb-0.5">Dosage / Pill Count</label>
                              <input
                                type="text"
                                value={tablet.dosage}
                                onChange={(e) => handleTabletChange(index, "dosage", e.target.value)}
                                placeholder="e.g. 500mg, 1 tablet"
                                className="w-full bg-white border border-slate-200 outline-none rounded p-1.5 text-xs focus:ring-1 focus:ring-teal-500"
                              />
                            </div>
                            <div className="w-full md:w-56">
                              <label className="block text-[10px] text-slate-400 font-semibold mb-0.5">Timing (comma separated)</label>
                              <input
                                type="text"
                                value={tablet.timing}
                                onChange={(e) => handleTabletChange(index, "timing", e.target.value)}
                                placeholder="e.g. 08:00 AM, 08:00 PM"
                                className="w-full bg-white border border-slate-200 outline-none rounded p-1.5 text-xs focus:ring-1 focus:ring-teal-500"
                              />
                            </div>
                            <div className="flex-1">
                              <label className="block text-[10px] text-slate-400 font-semibold mb-0.5">Notes (Optional)</label>
                              <input
                                type="text"
                                value={tablet.notes || ""}
                                onChange={(e) => handleTabletChange(index, "notes", e.target.value)}
                                placeholder="e.g. Take after breakfast"
                                className="w-full bg-white border border-slate-200 outline-none rounded p-1.5 text-xs focus:ring-1 focus:ring-teal-500"
                              />
                            </div>
                            {tablets.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveTabletRow(index)}
                                className="absolute -top-1.5 -right-1.5 sm:relative sm:top-auto sm:right-auto bg-white border border-slate-200 sm:border-none self-end text-red-500 hover:bg-red-50 p-1.5 rounded-full tooltip"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white rounded-lg py-3 text-sm font-bold shadow transition flex justify-center items-center space-x-2"
                      id="submit-patient-registration"
                    >
                      {submitting ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                          <span>Sending Patient Invitation...</span>
                        </>
                      ) : (
                        <>
                          <Mail className="h-4 w-4" />
                          <span>Register & Dispatch Gmail Care Link</span>
                        </>
                      )}
                    </button>
                  </form>
                </div>
              )}

              {/* Tab: Doctor Inbox */}
              {activeTab === "inbox" && (
                <div className="flex-1 flex flex-col">
                  <div className="mb-6 flex justify-between items-center">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">Symptom Mail Alerts Received</h2>
                      <p className="text-slate-500 text-xs">Direct urgent alerts and uploaded photos sent by patients</p>
                    </div>
                    {unreadReportCount > 0 && (
                      <span className="bg-red-100 text-red-800 text-{11} font-bold px-3 py-1 rounded-full animate-pulse">
                        {unreadReportCount} Alert Needs Review
                      </span>
                    )}
                  </div>

                  {reports.length === 0 ? (
                    <div className="text-center py-16 border border-slate-100 rounded-2xl">
                      <Mail className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500 text-sm">No medical symptom reports submitted yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                      {reports.map((report) => (
                        <div 
                          key={report.id} 
                          className={`p-5 rounded-2xl border transition-all ${
                            report.isRead 
                              ? "bg-slate-50 border-slate-200" 
                              : "bg-amber-50/70 border-amber-200 shadow-sm"
                          }`}
                        >
                          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="font-bold text-slate-800 text-sm">{report.patientName}</span>
                                <span className="text-[10px] text-slate-400 font-mono">({report.patientEmail})</span>
                              </div>
                              <h4 className="text-xs font-semibold text-amber-900 mt-1">{report.subject}</h4>
                            </div>
                            <div className="flex items-center space-x-3 self-end md:self-auto">
                              <span className="text-[10px] text-slate-400 font-mono">
                                {new Date(report.sentAt).toLocaleString()}
                              </span>
                              <button
                                onClick={() => handleMarkReportRead(report.id, report.isRead)}
                                className={`text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all ${
                                  report.isRead 
                                    ? "bg-slate-250 text-slate-600 bg-slate-200 hover:bg-slate-300" 
                                    : "bg-teal-600 text-white hover:bg-teal-700"
                                }`}
                              >
                                {report.isRead ? "Mark as Unread" : "Mark Reviewed"}
                              </button>
                            </div>
                          </div>

                          <div className="mt-3 bg-white border border-slate-100 p-3.5 rounded-xl text-xs text-slate-700 leading-relaxed max-w-none whitespace-pre-line">
                            {report.symptoms}
                          </div>

                          {/* Symptom Photo Copy provided */}
                          {report.imageUrl && (
                            <div className="mt-3">
                              <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Uploaded Symptom Photo Copy</p>
                              <div className="max-w-xs border border-slate-200 rounded-lg overflow-hidden">
                                <img 
                                  src={report.imageUrl} 
                                  alt="Patient reported symptom" 
                                  className="w-full h-auto object-cover max-h-48"
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Copy Link Dialog Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex justify-center items-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setShowLinkModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="text-center">
              <div className="h-12 w-12 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center mx-auto mb-3">
                <Check className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Patient Enrolled Successfully!</h3>
              <p className="text-slate-500 text-xs mt-1">
                The setup is saved to Firebase. An invitation email with the secure dashboard link is dispatched to Gmail.
              </p>
            </div>

            <div className="mt-5 bg-teal-50 border border-teal-100 rounded-xl p-4">
              <p className="text-[10px] font-bold text-teal-800 uppercase mb-1">Direct Secure Patient Link</p>
              <div className="flex space-x-2 items-center bg-white border border-teal-200 p-2 rounded-lg">
                <input
                  type="text"
                  readOnly
                  value={generatedLink}
                  className="flex-1 bg-transparent border-none text-[11px] font-mono text-slate-700 focus:outline-none"
                />
                <button
                  onClick={handleCopyLink}
                  className="bg-teal-650 hover:bg-teal-600 text-[10px] text-teal-600 font-bold flex items-center space-x-1"
                >
                  <Clipboard className="h-3.5 w-3.5 text-teal-600" />
                  <span>{copied ? "Copied!" : "Copy"}</span>
                </button>
              </div>
            </div>

            <button
              onClick={() => setShowLinkModal(false)}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg py-2.5 text-xs transition mt-4"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

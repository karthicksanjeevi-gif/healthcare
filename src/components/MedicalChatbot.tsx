import React, { useState, useRef, useEffect } from "react";
import { db } from "../firebase";
import { collection, addDoc } from "firebase/firestore";
import { 
  MessageSquare, 
  X, 
  Send, 
  Camera, 
  Upload, 
  AlertTriangle, 
  Check, 
  Mail, 
  Sparkles,
  RefreshCw,
  Image as ImageIcon,
  ChevronDown
} from "lucide-react";
import { Patient, ChatMessage } from "../types";

export interface MedicalChatbotProps {
  patient: Patient;
}

export default function MedicalChatbot({ patient }: MedicalChatbotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);

  // Multimodal upload state
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [scanType, setScanType] = useState<"symptom" | "tablet">("symptom");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Email Reporting triggers
  const [reportingStatus, setReportingStatus] = useState<{ [msgId: string]: 'idle' | 'sending' | 'success' | 'error' }>({});
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Set up initial greeting
  useEffect(() => {
    setMessages([
      {
        id: "greet-1",
        sender: "bot",
        text: `Hello ${patient.name}! I am your Gemini Clinical Companion.
I am synced with details on your registered home treatment protocol supervised by Dr. ${patient.doctorName}. 

How can I help you today?
• You can ask me questions about your prescribed tablets.
• Clip a photo copy of a tablet to verify its type and parameters.
• Upload a photo of any symptoms/side-effects. I can analyze them and automatically draft a report to Dr. ${patient.doctorName}.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  }, [patient]);

  // Scroll to bottom upon news
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() && !selectedImage) return;

    const userMsgId = "user-" + Date.now();
    const newUserMsg: ChatMessage = {
      id: userMsgId,
      sender: "user",
      text: inputText,
      image: selectedImage || undefined,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, newUserMsg]);
    setInputText("");
    const imagePayload = selectedImage;
    setSelectedImage(null); // Clear image view
    setLoading(true);

    try {
      if (imagePayload) {
        // If image uploaded, analyze using Multimodal proxy endpoint
        const explanationString = scanType === "symptom"
          ? `The patient uploaded this symptom photo copy. Analyze the symptom shown and ask explicitly if they would like to email this directly to Dr. ${patient.doctorName}. Describe the findings clearly.`
          : "The patient uploaded this medicine tablet pill. Please identify the tablet, state its uses, dosage safety rules, and advise appropriately.";

        const res = await fetch("/api/gemini/analyze-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            base64Image: imagePayload,
            type: scanType,
            prompt: explanationString + ` Provide a compassionate medical-clinical review, explicitly stating a disclaimer that you are an AI assistant and they should contact Dr. ${patient.doctorName} for strict assessment.`
          })
        });

        const data = await res.json();
        
        if (res.ok) {
          const botMsgId = "bot-" + Date.now();
          setMessages(prev => [...prev, {
            id: botMsgId,
            sender: "bot",
            text: data.text,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            suggestionToSend: scanType === "symptom" // Offer email reporting only for symptoms of interest
          }]);
          
          // Store base64 reference mapping on bot message to facilitate email trigger
          if (scanType === "symptom") {
            (window as any)[`symptom_img_${botMsgId}`] = imagePayload;
          }
        } else {
          throw new Error(data.error || "Image analysis failed.");
        }
      } else {
        // Standard text chat
        const systemPrompt = `You are a helpful clinical assistant managing ${patient.name} on home care treatment. 
The patient's assigned medical plan is: "${patient.treatment}".
The patient's prescribed tablets are: ${JSON.stringify(patient.tablets)}. 
Always review these parameters if they ask for advice. Be highly encouraging and medically professional. Include AI disclaimers regularly.`;

        const res = await fetch("/api/gemini/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [...messages, newUserMsg].map(m => ({ sender: m.sender, text: m.text })),
            systemInstruction: systemPrompt
          })
        });

        const data = await res.json();

        if (res.ok) {
          setMessages(prev => [...prev, {
            id: "bot-" + Date.now(),
            sender: "bot",
            text: data.text,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }]);
        } else {
          throw new Error(data.error || "Chat failed.");
        }
      }
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, {
        id: "err-" + Date.now(),
        sender: "bot",
        text: "My apologies. I encountered an error connecting to the clinical API: " + (error instanceof Error ? error.message : String(error)),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setSelectedImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Automated Email Report to supervising Doctor & Applications database
  const sendSymptomReportToDoctor = async (botMsgId: string, symptomDescription: string) => {
    setReportingStatus(prev => ({ ...prev, [botMsgId]: 'sending' }));

    // Retrieve corresponding base64 symptom image
    const base64Img = (window as any)[`symptom_img_${botMsgId}`] || null;

    try {
      // 1. Store the symptom report directly into the Doctor's application database (SymptomReports)
      const reportCollectionRef = collection(db, "symptomReports");
      
      const reportPayload = {
        patientId: patient.id,
        patientName: patient.name,
        patientEmail: patient.email,
        doctorId: patient.doctorId,
        doctorEmail: patient.doctorEmail || "",
        subject: `URGENT Symptom Side-effect Report from ${patient.name}`,
        symptoms: symptomDescription,
        imageUrl: base64Img || "",
        sentAt: new Date().toISOString(),
        isRead: false
      };

      await addDoc(reportCollectionRef, reportPayload);

      // 2. Dispatch real email layout directly to the Doctor's external GMail inbox
      const emailHtml = `
        <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; border: 1px solid #fecaca; border-radius: 8px; background-color: #fffafb;">
          <h2 style="color: #b91c1c; margin-bottom: 5px;">URGENT Symptom Report Alert</h2>
          <p style="font-size: 14px; text-transform: uppercase; font-weight: bold; color: #dc2626; margin-top: 0; font-family: monospace;">Patient Side-effect Notice</p>
          <hr style="border: 0; border-top: 1px solid #fecaca; margin: 15px 0;">
          
          <p>Hello Dr. <strong>${patient.doctorName}</strong>,</p>
          <p>This is a consolidated medical symptom alert from your home care patient, <strong>${patient.name}</strong> (${patient.email}).</p>
          
          <h4 style="color: #451a03; margin-bottom: 5px;">Patient Symptoms Description / AI Transcription:</h4>
          <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 4px; font-style: italic; line-height: 1.6;">
            ${symptomDescription.replace(/\n/g, '<br>')}
          </div>
          
          ${base64Img ? `
            <h4 style="color: #451a03; margin-top: 20px; margin-bottom: 5px;">Attached Symptom Photo Copy:</h4>
            <div style="margin-top: 10px;">
              <img src="${base64Img}" alt="Reported symptom photo" style="max-width: 100%; max-height: 400px; border-radius: 6px; border: 1px solid #e2e8f0;" />
            </div>
          ` : ""}
          
          <hr style="border: 0; border-top: 1px solid #fecaca; margin: 15px 0;">
          <p style="font-size: 13px;">This report has been saved directly to your clinic supervisor application portal in the "Symptom Mail Alerts" panel. Please review and respond to the patient as soon as appropriate.</p>
          <p style="text-align: center; font-size: 11px; color: #aaa;">Delivered securely via Gemini Care Manager.</p>
        </div>
      `;

      await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: patient.doctorEmail || "silicon-kit-v7xwm@mail.com",
          subject: `Urgent Care Alert: ${patient.name} reported symptom side-effects`,
          htmlContent: emailHtml
        })
      });

      setReportingStatus(prev => ({ ...prev, [botMsgId]: 'success' }));
    } catch (e) {
      console.error(e);
      setReportingStatus(prev => ({ ...prev, [botMsgId]: 'error' }));
    }
  };

  return (
    <>
      {/* Small floating chat bubble overlay button (Bottom Right) */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 bg-teal-600 hover:bg-teal-700 text-white rounded-full p-4 shadow-2xl flex items-center justify-center cursor-pointer transition-transform hover:scale-105 hover:rotate-2 z-40 animate-bounce"
          id="chatbot-launcher-btn"
        >
          <MessageSquare className="h-6 w-6" />
          <span className="absolute -top-1 -right-1 bg-red-500 h-3 w-3 rounded-full animate-ping"></span>
        </button>
      )}

      {/* Expanded chat drawer */}
      {isOpen && (
        <div 
          className="fixed bottom-6 right-6 w-full max-w-[420px] h-[550px] bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col z-50 animate-in fade-in slide-in-from-bottom"
          id="medical-chatbot-window"
        >
          {/* Header */}
          <div className="bg-slate-950 text-white p-4 flex justify-between items-center border-b border-teal-900 shrink-0">
            <div className="flex items-center space-x-2">
              <Sparkles className="h-4.5 w-4.5 text-teal-400" />
              <div>
                <h4 className="text-sm font-bold tracking-tight">Gemini Care Companion</h4>
                <p className="text-[9px] text-teal-400 font-mono tracking-wider">AI MULTIMODAL ASSISTANT</p>
              </div>
            </div>
            
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white p-1 rounded-lg transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Messages Lists */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
            {messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}
              >
                {/* Media thumbnail */}
                {msg.image && (
                  <div className="max-w-[180px] rounded-xl overflow-hidden border border-slate-200 shadow-sm mb-1.5 bg-white p-1">
                    <img 
                      src={msg.image} 
                      alt="Uploaded visual scan" 
                      className="w-full h-auto object-cover max-h-32 rounded-lg"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}
                
                <div 
                  className={`p-3.5 rounded-2xl text-xs leading-relaxed max-w-[85%] whitespace-pre-line ${
                    msg.sender === "user"
                      ? "bg-slate-900 text-white rounded-br-none"
                      : "bg-white border border-slate-200 text-slate-800 shadow-sm rounded-bl-none"
                  }`}
                >
                  {msg.text}
                </div>

                <span className="text-[9px] text-slate-400 font-mono mt-1 px-1">
                  {msg.timestamp}
                </span>

                {/* Show Report UI if bot suggested emailing */}
                {msg.sender === "bot" && msg.suggestionToSend && (
                  <div className="mt-3 bg-red-50 border border-red-200 rounded-xl p-3 max-w-[90%] text-xs shadow-sm">
                    <div className="flex items-start space-x-2">
                      <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-slate-800">Alert supervising doctor?</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">Send this symptom analysis and photograph directly to Dr. {patient.doctorName} via clinical email and portal alert.</p>
                      </div>
                    </div>

                    <div className="mt-3 flex space-x-2">
                      {reportingStatus[msg.id] === 'success' ? (
                        <div className="flex items-center text-emerald-600 font-bold space-x-1.5 py-1.5 px-3 bg-emerald-50 rounded-lg text-[10px]">
                          <Check className="h-3.5 w-3.5" />
                          <span>Report successfully sent to Dr. {patient.doctorName} & GMail!</span>
                        </div>
                      ) : (
                        <button
                          disabled={reportingStatus[msg.id] === 'sending'}
                          onClick={() => sendSymptomReportToDoctor(msg.id, msg.text)}
                          className="bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white font-bold text-[10px] py-1.5 px-3 rounded-lg flex items-center space-x-1 shadow transition"
                        >
                          {reportingStatus[msg.id] === 'sending' ? (
                            <>
                              <RefreshCw className="h-3 w-3 animate-spin" />
                              <span>Dispatching Gmail...</span>
                            </>
                          ) : (
                            <>
                              <Mail className="h-3.5 w-3.5" />
                              <span>Send e-Mail Report to Doctor</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex items-center space-x-2 text-xs text-slate-500 bg-white p-3 border rounded-xl w-fit">
                <SpinnerIcon className="h-3 w-3 animate-spin" />
                <span>Gemini is scanning & diagnosing...</span>
              </div>
            )}
            
            <div ref={chatEndRef} />
          </div>

          {/* Multimodal Preview Drawer */}
          {selectedImage && (
            <div className="bg-slate-100 border-t p-3 flex justify-between items-center shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="h-10 w-10 border border-slate-300 rounded overflow-hidden shadow-sm bg-white p-0.5">
                  <img src={selectedImage} className="w-full h-full object-cover rounded" alt="Preview selection" referrerPolicy="no-referrer" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-700">Multimodal Photo Loaded</p>
                  <div className="flex items-center mt-0.5 border rounded bg-white text-[10px] px-1 font-mono">
                    <span className="text-slate-450 text-slate-500">Scan type:</span>
                    <select
                      value={scanType}
                      onChange={(e) => setScanType(e.target.value as "symptom" | "tablet")}
                      className="outline-none ml-1 font-bold text-teal-650 bg-transparent text-teal-700"
                    >
                      <option value="symptom">Symptom/Side-effect</option>
                      <option value="tablet">tablet pill Verification</option>
                    </select>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSelectedImage(null)}
                className="text-red-500 hover:bg-red-50 p-1.5 rounded-full"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Footer controls form */}
          <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-slate-100 flex items-center space-x-2 shrink-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-slate-400 hover:text-slate-700 hover:bg-slate-50 p-2 rounded-xl transition tooltip"
              title="Upload/Capture symptom or tablet"
            >
              <Camera className="h-5 w-5" />
            </button>
            <input 
              type="file"
              ref={fileInputRef}
              onChange={handleImageSelect}
              accept="image/*"
              className="hidden"
            />

            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={selectedImage ? "Choose scan type above and hit send!" : "Ask anything about scheduled treatment/tablets..."}
              className="flex-1 border border-slate-200 bg-slate-50 focus:bg-white outline-none rounded-xl px-3 py-2 text-xs transition"
            />

            <button
              type="submit"
              disabled={(!inputText.trim() && !selectedImage) || loading}
              className="bg-slate-950 hover:bg-slate-800 disabled:bg-slate-200 text-white disabled:text-slate-400 rounded-xl p-2 transition shrink-0"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}

function SpinnerIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
